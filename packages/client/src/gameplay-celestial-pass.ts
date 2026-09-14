import { WorldLightingRenderer, celestialCastersFromOcclusion } from '@orchard/engine/world-lighting-renderer';
import type { DirectionalCaster } from '@orchard/engine/directional-shadows';
import type { CelestialLighting } from '@orchard/engine/celestial-lighting';
import type { LightOcclusionMap } from '@orchard/engine/light-occlusion';
import type { TileLightmap } from '@orchard/engine/lighting';
import type { TerrainArray } from '@orchard/engine/terrain';

/** Mechanical extraction of the existing celestial scene orchestration.
 * Its cache keys, caster construction and allocation behavior are unchanged. */
export class GameplayCelestialPass {
  renderer: WorldLightingRenderer | null = null;
  private staticSource: LightOcclusionMap | undefined;
  private staticBounds = '';
  private staticCasters: readonly DirectionalCaster[] = [];
  resetRenderer(): void { this.renderer?.reset(); this.renderer = null; }
  clearStatic(): void { this.staticSource = undefined; this.staticCasters = []; this.staticBounds = ''; }
  prepare(terrain: TerrainArray, lightOcclusion: LightOcclusionMap | undefined,
    movingCelestialCasters: readonly DirectionalCaster[], frameSky: CelestialLighting, lightmap: TileLightmap,
    cameraX: number, cameraY: number, viewportWidth: number, viewportHeight: number,
    terrainProjectionMargin: number, collisionKey: string, debugEntitiesHidden: boolean): void {
    if (this.renderer?.terrain !== terrain) {
      this.renderer?.reset(); this.renderer = new WorldLightingRenderer(terrain);
      this.staticSource = undefined; this.staticBounds = '';
    }
    const boundsKey = `${Math.floor(cameraX / 128)}:${Math.floor(cameraY / 128)}:${Math.ceil(viewportWidth / 128)}:${Math.ceil(viewportHeight / 128)}`;
    if (this.staticSource !== lightOcclusion || this.staticBounds !== boundsKey) {
      this.staticCasters = celestialCastersFromOcclusion(lightOcclusion, this.renderer.mapper,
        cameraX - 128, cameraY - 128 - terrainProjectionMargin,
        cameraX + viewportWidth + 128, cameraY + viewportHeight + 128 + terrainProjectionMargin);
      this.staticSource = lightOcclusion; this.staticBounds = boundsKey;
    }
    const staticOwners = new Set(this.staticCasters.map((caster) => caster.owner));
    const casters = debugEntitiesHidden ? [] : [...this.staticCasters, ...movingCelestialCasters.filter((caster) => !staticOwners.has(caster.owner))];
    const casterSignature = `${collisionKey}:${boundsKey}:${debugEntitiesHidden}:${movingCelestialCasters.map((c) => `${c.owner}:${c.baseHeightSubunits}:${c.heightSubunits}`).join(';')}`;
    this.renderer.begin(frameSky, casters, casterSignature, lightmap, cameraX, cameraY, viewportWidth, viewportHeight);
  }
}
