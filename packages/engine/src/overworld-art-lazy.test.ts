import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD_ART_ASSET_NAMES } from './overworld-art.js';

/** Static world S6: world art (terrain, trees, props, buildings, resources) loads by need from the
 * packs the chunks name, never at startup. These pin the art factory to that. */
describe('overworld art startup (static world S6)', () => {
  const source = readFileSync(new URL('./overworld-art.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export async function loadOverworldArt(');
  const factory = source.slice(start, source.indexOf('\n}\n', start));

  it('loads no world asset eagerly', () => {
    const eager = [...factory.matchAll(/loadGeneratedAsset\(\s*([^,)]+)/g)].map(match => match[1]!.trim());
    expect(eager.length).toBeGreaterThan(20);
    for (const name of eager) {
      expect(name, name).not.toMatch(/^["'](?:tile|tree|prop|resource|building|nature)_/);
      expect(name, name).not.toMatch(/^LEGACY_LANDMARK_ASSET_NAMES/);
    }
    for (const bank of ['loadNatureDecorationArt(', 'loadFruitTreeArt(', 'loadOreArt("resource_cf_ore_"', 'additionalTerrainAssetIds()']) {
      expect(factory, bank).not.toContain(bank);
    }
    expect(factory).toContain('return withLazyWorldArt(art);');
  });

  it('names world assets only', () => {
    for (const [field, name] of Object.entries(WORLD_ART_ASSET_NAMES)) {
      expect(name, field).toMatch(/^(?:tile_cf_|tree_cf_|prop_cf_|resource_cf_|building_cf_)/);
    }
    expect(Object.keys(WORLD_ART_ASSET_NAMES)).toEqual(expect.arrayContaining(['grass', 'cliff', 'water', 'treeOak', 'chest', 'caveWall']));
  });
});
