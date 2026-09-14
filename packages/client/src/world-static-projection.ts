import { type CollisionMap } from '@orchard/sim';
import { prepareClientTerrainCollision, type PreparedClientTerrainCollision } from '@orchard/engine/collision';
import { prepareLightTerrainOcclusion, type PreparedLightTerrainOcclusion } from '@orchard/engine/light-occlusion';
import type { TerrainArray } from '@orchard/engine/terrain';
import type { LoadedAsset } from '@orchard/ui';

interface StaticProjection {
  readonly ground: PreparedClientTerrainCollision;
  readonly water: PreparedClientTerrainCollision;
  readonly light: PreparedLightTerrainOcclusion | undefined;
}

/** Game-instance cache, never shared with mutable Studio terrain. Live terrain
 * snapshots are immutable; revision also permits explicit invalidation. Retain
 * only the active space so old maps and authored assets can be collected. */
export class WorldStaticProjectionCache {
  private terrain: TerrainArray | null = null;
  private revision = '';
  private dockKey = '';
  private asset: LoadedAsset | undefined;
  private projection: StaticProjection | null = null;
  private groundBlocked: CollisionMap['blocked'] | null = null;
  private waterBlocked: CollisionMap['blocked'] | null = null;
  private projectileBlocked: CollisionMap['blocked'] | null = null;

  prepare(
    terrain: TerrainArray,
    revision: string,
    dockTiles?: readonly { readonly tileX: number; readonly tileY: number }[],
    asset?: LoadedAsset,
    dynamicLighting = true,
  ): StaticProjection {
    // Undefined means generated docks; an empty authored list means no docks.
    const dockKey = dockTiles === undefined ? 'generated'
      : JSON.stringify(dockTiles.map(({ tileX, tileY }) => [tileX, tileY]));
    if (this.projection !== null && this.terrain === terrain
      && this.revision === revision && this.dockKey === dockKey && this.asset === asset) {
      if (dynamicLighting !== (this.projection.light !== undefined)) {
        this.projection = { ...this.projection, light: dynamicLighting ? prepareLightTerrainOcclusion(terrain, asset) : undefined };
      }
      return this.projection;
    }
    const projection = {
      ground: prepareClientTerrainCollision(terrain, 'ground', dockTiles),
      water: prepareClientTerrainCollision(terrain, 'water', dockTiles),
      light: dynamicLighting ? prepareLightTerrainOcclusion(terrain, asset) : undefined,
    };
    this.terrain = terrain;
    this.revision = revision;
    this.dockKey = dockKey;
    this.asset = asset;
    this.projection = projection;
    return projection;
  }

  releaseLighting(): void {
    if (this.projection !== null) this.projection = { ...this.projection, light: undefined };
  }

  projectile(ground: CollisionMap, water: CollisionMap): CollisionMap {
    if (ground.width !== water.width || ground.height !== water.height) throw new Error('collision_map_size_mismatch');
    if (this.projectileBlocked === null || this.groundBlocked !== ground.blocked || this.waterBlocked !== water.blocked) {
      this.projectileBlocked = ground.blocked.map((blocked, index) => blocked && (water.blocked[index] ?? true));
      this.groundBlocked = ground.blocked;
      this.waterBlocked = water.blocked;
    }
    // Obstacles, elevations and all other live map channels always come from
    // this refresh. Only the immutable combined terrain plane is retained.
    return { ...ground, blocked: this.projectileBlocked };
  }
}
