import { describe, expect, it } from 'vitest';
import { contentAddressedFilename, semanticAtlasPack } from './semantic-packs.js';
import { packAtlasPages } from './atlas-pages.js';

describe('semantic atlas packs', () => {
  it('isolates biomes, actors, tree species, and player cosmetics', () => {
    const pack = (category: string, name: string) => semanticAtlasPack({ category, name });
    expect(pack('tiles', 'tile_cf_grass')).toBe('terrain-core');
    expect(pack('tiles', 'tile_cf_desert_shore')).toBe('terrain-desert');
    expect(pack('trees', 'tree_cf_oak_mature')).toBe(pack('trees', 'tree_cf_oak_young'));
    expect(pack('trees', 'tree_cf_oak_mature')).not.toBe(pack('trees', 'tree_cf_spruce_mature'));
    expect(pack('characters', 'avatar_cf_farmer')).toBe('player-core');
    expect(pack('characters', 'npc_cf_farmer_bob')).toBe('npc-farmer');
    expect(pack('characters', 'enemy_cf_skeleton')).toBe('enemy-skeleton');
    expect(pack('characters', 'rider_cf_hair_1_brown')).toBe(pack('characters', 'action_cf_hair_1_brown'));
    expect(pack('characters', 'rider_cf_hair_1_brown')).toMatch(/^[a-z0-9-]+$/);
  });
  it('does not repack existing families when another biome is introduced', () => {
    const grass = { category: 'tiles', name: 'tile_cf_grass', width: 16, height: 16, frameCount: 47 };
    const desert = { ...grass, name: 'tile_cf_desert' };
    const build = (assets: typeof grass[]) => packAtlasPages('tiles:terrain-core', assets.filter(a => semanticAtlasPack(a) === 'terrain-core'));
    expect(build([desert, grass])).toEqual(build([grass]));
  });
  it('addresses actual bytes, so duplicate seasons and omit pages share filenames', () => {
    expect(contentAddressedFilename('atlas', new Uint8Array([1, 2]))).toBe(contentAddressedFilename('atlas', new Uint8Array([1, 2])));
    expect(contentAddressedFilename('atlas', new Uint8Array([1, 2]))).not.toBe(contentAddressedFilename('atlas', new Uint8Array([1, 3])));
    expect(contentAddressedFilename('pack', '{}')).toMatch(/^pack-[a-f0-9]{64}\.json$/);
  });
});
