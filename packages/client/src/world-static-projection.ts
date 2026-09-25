import { type CollisionMap } from '@orchard/sim';
import { prepareClientTerrainCollision, type PreparedClientTerrainCollision } from '@orchard/engine/collision';
import { prepareLightTerrainOcclusion, type LightTerrainReuse, type PreparedLightTerrainOcclusion } from '@orchard/engine/light-occlusion';
import type { TerrainArray } from '@orchard/engine/terrain';
import { chunkWindowTileReuse, type ChunkTerrainWindow } from '@orchard/engine/chunk-terrain-window';
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
  /** Combined projectile planes by their ground and water inputs (identity). */
  private readonly projectileBlocked = new WeakMap<CollisionMap['blocked'], {
    readonly water: CollisionMap['blocked']; readonly blocked: CollisionMap['blocked'];
  }>();

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

  private lightAsset: LoadedAsset | undefined;
  /** At most two window preparations: the serving window's and the next one's. */
  private readonly lightOnly = new Map<TerrainArray, PreparedLightTerrainOcclusion>();

  /** Light occlusion only, for a chunk window whose collision comes from chunk
   * authority channels (static world S4d): windows are immutable, so the
   * window object and asset are the whole key. `reuse` names the previous window
   * and the tiles whose preparation carries over unchanged (static world S4f,
   * chunkWindowTileReuse); the result is identical to a full preparation. */
  prepareLight(terrain: TerrainArray, asset?: LoadedAsset, dynamicLighting = true,
    reuse?: { readonly terrain: TerrainArray; readonly reusableRuns: LightTerrainReuse['reusableRuns'] }): PreparedLightTerrainOcclusion | undefined {
    if (!dynamicLighting) return undefined;
    if (this.lightAsset !== asset) { this.lightOnly.clear(); this.lightAsset = asset; }
    let prepared = this.lightOnly.get(terrain);
    if (prepared === undefined) {
      const previous = reuse === undefined ? undefined : this.lightOnly.get(reuse.terrain);
      prepared = prepareLightTerrainOcclusion(terrain, asset,
        previous === undefined ? undefined : { prepared: previous, reusableRuns: reuse!.reusableRuns });
      if (this.lightOnly.size >= 2) this.lightOnly.delete(this.lightOnly.keys().next().value!);
    } else this.lightOnly.delete(terrain);
    this.lightOnly.set(terrain, prepared);
    return prepared;
  }

  /** A chunk window's light preparation, reusing the tiles it shares unchanged
   * with `previous` (static world S4f); identical to a full preparation. */
  prepareWindowLight(window: ChunkTerrainWindow, previous: ChunkTerrainWindow | undefined, asset?: LoadedAsset,
    dynamicLighting = true): PreparedLightTerrainOcclusion | undefined {
    const reuse = previous === undefined ? undefined : chunkWindowTileReuse(previous, window);
    return this.prepareLight(window.terrain, asset, dynamicLighting,
      reuse === undefined ? undefined : { terrain: previous!.terrain, reusableRuns: reuse.reusableRuns });
  }

  releaseLighting(): void {
    this.lightOnly.clear();
    if (this.projection !== null) this.projection = { ...this.projection, light: undefined };
  }

  projectile(ground: CollisionMap, water: CollisionMap): CollisionMap {
    if (ground.width !== water.width || ground.height !== water.height) throw new Error('collision_map_size_mismatch');
    let combined = this.projectileBlocked.get(ground.blocked);
    if (combined === undefined || combined.water !== water.blocked) {
      combined = { water: water.blocked, blocked: ground.blocked.map((blocked, index) => blocked && (water.blocked[index] ?? true)) };
      this.projectileBlocked.set(ground.blocked, combined);
    }
    // Obstacles, elevations and all other live map channels always come from
    // this refresh. Only the immutable combined terrain plane is retained.
    return { ...ground, blocked: combined.blocked };
  }
}
