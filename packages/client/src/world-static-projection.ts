import { type CollisionMap } from '@orchard/sim';
import { prepareClientTerrainCollision, type PreparedClientTerrainCollision } from '@orchard/engine/collision';
import { prepareLightTerrainOcclusion, type PreparedLightTerrainOcclusion } from '@orchard/engine/light-occlusion';
import type { TerrainArray } from '@orchard/engine/terrain';
import { chunkWindowReuseSource, chunkWindowTileReuse, type ChunkTerrainWindow, type ChunkWindowReuseSource } from '@orchard/engine/chunk-terrain-window';
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
  /** Window light preparations, held only while their window's terrain is alive. */
  private lightOnly = new WeakMap<TerrainArray, PreparedLightTerrainOcclusion>();
  /** The last prepared chunk window, for reuse by the next one (static world S4f): a
   * small descriptor and its preparation, never the window's terrain or collision. */
  private lastWindowLight: { readonly source: ChunkWindowReuseSource; readonly prepared: PreparedLightTerrainOcclusion } | undefined;

  /** Light occlusion only, for terrain whose collision comes from elsewhere (a chunk
   * window, static world S4d): terrain objects are immutable, so the object and
   * asset are the whole key. */
  prepareLight(terrain: TerrainArray, asset?: LoadedAsset, dynamicLighting = true): PreparedLightTerrainOcclusion | undefined {
    if (!dynamicLighting) return undefined;
    this.#lightAsset(asset);
    let prepared = this.lightOnly.get(terrain);
    if (prepared === undefined) { prepared = prepareLightTerrainOcclusion(terrain, asset); this.lightOnly.set(terrain, prepared); }
    return prepared;
  }

  /** A chunk window's light preparation, reusing the tiles it shares unchanged
   * with the last window prepared here (static world S4f: the served window while
   * the next one is prepared ahead, or the window it replaces); identical to a full
   * preparation. */
  prepareWindowLight(window: ChunkTerrainWindow, asset?: LoadedAsset, dynamicLighting = true): PreparedLightTerrainOcclusion | undefined {
    if (!dynamicLighting) return undefined;
    this.#lightAsset(asset);
    let prepared = this.lightOnly.get(window.terrain);
    if (prepared === undefined) {
      const last = this.lastWindowLight;
      const reuse = last === undefined ? undefined : chunkWindowTileReuse(last.source, window);
      prepared = prepareLightTerrainOcclusion(window.terrain, asset,
        reuse === undefined ? undefined : { prepared: last!.prepared, reusableRuns: reuse.reusableRuns });
      this.lightOnly.set(window.terrain, prepared);
      this.lastWindowLight = { source: chunkWindowReuseSource(window), prepared };
    }
    return prepared;
  }

  #lightAsset(asset: LoadedAsset | undefined): void {
    if (this.lightAsset === asset) return;
    this.lightOnly = new WeakMap(); this.lastWindowLight = undefined; this.lightAsset = asset;
  }

  releaseLighting(): void {
    this.lightOnly = new WeakMap(); this.lastWindowLight = undefined;
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
