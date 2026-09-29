import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD_ART_ASSET_NAMES } from './overworld-art.js';

/** Static world S6: world art loads by need from the packs the chunks name, and other art the first
 * time it is needed; only the UI and the player's body load at startup. These pin the factory to that. */
describe('overworld art startup (static world S6)', () => {
  const source = readFileSync(new URL('./overworld-art.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export async function loadOverworldArt(');
  const factory = source.slice(start, source.indexOf('\n}\n', start));

  it('loads only the UI, the player body and the missing-item icon at startup', () => {
    const eager = [...factory.matchAll(/loadGeneratedAsset\(\s*([^,)]+)/g)].map(match => match[1]!.trim());
    expect(eager).toEqual(['"system_missing_asset"']);
    expect([...factory.matchAll(/loadCharacterPart\(([^)]+)\)/g)].map(match => match[1])).toEqual(
      ['...PLAYER_RIG_CORE_ASSETS.base', '...PLAYER_RIG_CORE_ASSETS.hands']);
    for (const bank of ['loadNatureDecorationArt(', 'loadFruitTreeArt(', 'loadOreArt(', 'additionalTerrainAssetIds()', 'loadWildlifeArt(',
      'loadRogueEnemyArt(', 'loadItemIconArt(', 'loadCropArt(', 'loadHearthResourceArt(', 'loadPlayerRig(', 'loadCharacterPartMap(']) {
      expect(factory, bank).not.toContain(bank);
    }
    expect(factory).toContain('return withLazyWorldArt(withLazyGameplayArt(art, registry));');
  });

  it('names world assets only', () => {
    for (const [field, name] of Object.entries(WORLD_ART_ASSET_NAMES)) {
      expect(name, field).toMatch(/^(?:tile_cf_|tree_cf_|prop_cf_|resource_cf_|building_cf_)/);
    }
    expect(Object.keys(WORLD_ART_ASSET_NAMES)).toEqual(expect.arrayContaining(['grass', 'cliff', 'water', 'treeOak', 'chest', 'caveWall']));
  });
});
