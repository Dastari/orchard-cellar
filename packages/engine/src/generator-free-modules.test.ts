import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import * as survivalBiomes from '@orchard/sim/survival-biomes';
import * as survivalDimensions from '@orchard/sim/survival-dimensions';
import * as survivalLandmarkDecorations from '@orchard/sim/survival-landmark-decorations';
import * as survivalResourceCatalog from '@orchard/sim/survival-resource-catalog';
import * as terrainPlaneCollision from '@orchard/sim/terrain-plane-collision';
import * as liveIslandMapId from '@orchard/sim/live-island-map-id';
import * as wildlifeSpecies from '@orchard/sim/wildlife-species';
import { PACKAGES_ROOT, legacyModulesReachedFrom, packageExports } from './generator-reach.fixture.js';

/** Static-world S6a: the `@orchard/sim/<subpath>` exports are the
 * generator-free sim API (chunk-era clients import these); the island
 * generator, map compiler and whole-map document are reachable only through
 * the barrel or their own modules. */
describe('generator-free sim leaves', () => {
  it('every @orchard/sim subpath export is generator-free', () => {
    const subpaths = Object.entries(packageExports('sim')).filter(([subpath]) => subpath !== '.');
    expect(subpaths.length).toBeGreaterThan(30);
    const reach = Object.fromEntries(subpaths.map(([subpath, target]) => [
      subpath, legacyModulesReachedFrom(resolve(PACKAGES_ROOT, 'sim', target)),
    ]));
    expect(Object.entries(reach).filter(([, legacy]) => legacy.length > 0)).toEqual([]);
  });

  it.each([
    'survival-biomes', 'survival-dimensions', 'survival-landmark-decorations', 'survival-resource-catalog',
    'terrain-plane-collision', 'live-island-map-id', 'wildlife-species', 'spaces', 'content/runtime',
    'cellar-excavation', 'hearth-lobby', 'hearth-architecture-state', 'timing', 'creatures',
  ])('%s reaches no generator, compiler or map document module', (leaf) => {
    expect(legacyModulesReachedFrom(resolve(PACKAGES_ROOT, 'sim/src', `${leaf}.ts`))).toEqual([]);
  });

  it('keeps the barrel (and so the old modules it re-exports) exposing the very same leaf bindings', () => {
    // The barrel reaches these names only through survival-world, map-compiler,
    // map-document-v3 and wildlife, so identity here means those modules
    // re-export the leaf binding rather than defining a second copy.
    const barrel = sim as Record<string, unknown>;
    const internal = ['activeResources', 'resourceDefinition', 'compiledElevationRange', 'rampRoleAt'];
    for (const leaf of [survivalBiomes, survivalDimensions, survivalLandmarkDecorations, survivalResourceCatalog,
      terrainPlaneCollision, liveIslandMapId, wildlifeSpecies] as Record<string, unknown>[]) {
      for (const [name, value] of Object.entries(leaf)) {
        if (internal.includes(name)) expect(name in barrel, name).toBe(false);
        else expect(barrel[name], name).toBe(value);
      }
    }
  });

  it('shares one catalogue cache between the leaf and the legacy re-export', () => {
    const registry = sim.bootstrapContentRegistry();
    const viaLegacy = sim.survivalResourceCatalog(registry);
    expect(survivalResourceCatalog.survivalResourceCatalog(registry)).toBe(viaLegacy);
    expect(survivalResourceCatalog.SURVIVAL_ORE_KINDS).toEqual(viaLegacy.oreKinds);
  });
});

describe('generator-free client presentation path', () => {
  it.each([
    'ui/src/index.ts', 'ui/src/game-entry.ts', 'ui/src/kit/components/timing-canvas.ts',
    'engine/src/map-object-presentation.ts', 'engine/src/connected-objects.ts', 'engine/src/overworld-art.ts',
    'engine/src/light-occlusion.ts', 'engine/src/light-sources.ts', 'engine/src/lighting.ts',
    'engine/src/map-shadow-contacts.ts', 'engine/src/world-asset-presentation.ts', 'engine/src/tilemap.ts',
    'engine/src/space-terrain.ts', 'engine/src/terrain-sampling.ts', 'engine/src/terrain-array.ts',
  ])('%s reaches no generator, compiler, map document, terrain.ts or sim barrel module', (file) => {
    expect(legacyModulesReachedFrom(resolve(PACKAGES_ROOT, file))).toEqual([]);
  });
});
