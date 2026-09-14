import { WorldLightingRenderer, celestialCastersFromOcclusion } from '@orchard/engine/world-lighting-renderer';
import type { DirectionalCaster } from '@orchard/engine/directional-shadows';
import type { CelestialLighting } from '@orchard/engine/celestial-lighting';
import type { LightOcclusionMap } from '@orchard/engine/light-occlusion';
import type { TileLightmap } from '@orchard/engine/lighting';
import type { TerrainArray } from '@orchard/engine/terrain';

const EMPTY_CASTERS: readonly DirectionalCaster[] = [];
/** Keep occlusion-derived casters and owner membership until the terrain or
 * 128-pixel window changes. Only moving contacts are refreshed each frame. */
export class GameplayCelestialPass {
  renderer: WorldLightingRenderer | null = null;
  private staticSource: LightOcclusionMap | undefined;
  private boundsX = Number.NaN;
  private boundsY = Number.NaN;
  private boundsWidth = 0;
  private boundsHeight = 0;
  private staticRevision = 0;
  private staticCasters: readonly DirectionalCaster[] = EMPTY_CASTERS;
  private readonly staticOwners = new Set<string | number>();
  private readonly moving: DirectionalCaster[] = [];
  resetRenderer(): void { this.renderer?.reset(); this.renderer = null; }
  clearStatic(): void {
    this.staticSource = undefined; this.staticCasters = EMPTY_CASTERS;
    this.boundsX = this.boundsY = Number.NaN; this.staticOwners.clear(); this.moving.length = 0;
    this.staticRevision++;
  }
  prepare(terrain: TerrainArray, lightOcclusion: LightOcclusionMap | undefined,
    movingCelestialCasters: readonly DirectionalCaster[], frameSky: CelestialLighting, lightmap: TileLightmap,
    cameraX: number, cameraY: number, viewportWidth: number, viewportHeight: number,
    terrainProjectionMargin: number, _collisionKey: string, debugEntitiesHidden: boolean): void {
    if (this.renderer?.terrain !== terrain) {
      this.resetRenderer(); this.renderer = new WorldLightingRenderer(terrain); this.clearStatic();
    }
    const x = Math.floor(cameraX / 128), y = Math.floor(cameraY / 128);
    const width = Math.ceil(viewportWidth / 128), height = Math.ceil(viewportHeight / 128);
    if (this.staticSource !== lightOcclusion || this.boundsX !== x || this.boundsY !== y
      || this.boundsWidth !== width || this.boundsHeight !== height) {
      this.staticCasters = celestialCastersFromOcclusion(lightOcclusion, this.renderer.mapper,
        cameraX - 128, cameraY - 128 - terrainProjectionMargin,
        cameraX + viewportWidth + 128, cameraY + viewportHeight + 128 + terrainProjectionMargin);
      this.staticSource = lightOcclusion; this.boundsX = x; this.boundsY = y;
      this.boundsWidth = width; this.boundsHeight = height; this.staticRevision++;
      this.staticOwners.clear();
      for (const caster of this.staticCasters) this.staticOwners.add(caster.owner);
    }
    this.moving.length = 0;
    if (!debugEntitiesHidden) for (const caster of movingCelestialCasters) {
      if (!this.staticOwners.has(caster.owner)) this.moving.push(caster);
    }
    this.renderer.begin(frameSky, debugEntitiesHidden ? EMPTY_CASTERS : this.staticCasters,
      this.moving, lightmap, cameraX, cameraY, viewportWidth, viewportHeight,
      debugEntitiesHidden ? 0 : this.staticRevision);
  }
}
