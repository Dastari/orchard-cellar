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
    expect(pack('characters', 'avatar_cf_farmer')).toBe('player-avatar-legacy');
    expect(pack('characters', 'npc_cf_farmer_bob')).toBe('npc-farmer');
    expect(pack('characters', 'enemy_cf_skeleton')).toBe('enemy-skeleton');
    expect(pack('characters', 'rider_cf_hair_1_brown')).toBe(pack('characters', 'action_cf_hair_1_brown'));
    expect(pack('characters', 'rider_cf_hair_1_brown')).toMatch(/^[a-z0-9-]+$/);
  });
  it('splits the former player-core pack by what a client draws (static world S6)', () => {
    const pack = (name: string) => semanticAtlasPack({ category: 'characters', name });
    for (const name of ['player_cf_base', 'rider_cf_base', 'action_cf_base', 'player_cf_hands', 'rider_cf_hands', 'action_cf_hands']) {
      expect(pack(name), name).toBe('player-body');
    }
    // The default outfit's standing and mounted frames join its cosmetic's pack.
    expect(pack('player_cf_hair')).toBe(pack('action_cf_hair_1_brown'));
    expect(pack('rider_cf_farmer_shirt')).toBe(pack('action_cf_shirt_farmer_green'));
    expect(pack('player_cf_farmer_pants')).toBe(pack('action_cf_pants_farmer_white_brown'));
    expect(pack('rider_cf_shoes')).toBe(pack('action_cf_shoes_brown'));
    expect(pack('tool_cf_torch_idle')).toBe('player-held-light');
    expect(pack('hands_cf_lantern_running')).toBe('player-held-light');
    expect(pack('tool_cf_iron_axe_action')).toBe('player-action-axe');
    expect(pack('tool_cf_wooden_fishing_rod_action')).toBe('player-action-fishing-rod');
    expect(pack('tool_cf_watering_can_action')).toBe('player-action-watering-can');
    expect(pack('tool_copper_pickaxe')).toBe(pack('tool_wood_pickaxe'));
    expect(pack('tool_copper_pickaxe')).toBe('player-tools-pickaxe');
    expect(pack('actor_cf_goblin_archer')).toBe('actor-goblin');
    expect(pack('actor_cf_knight_templar')).toBe('actor-knight');
    expect(pack('horse_cf_bramble_mounted')).toBe('mount-horse');
    expect(pack('wearable_cf_plate_helmet')).toBe('player-wearable-plate');
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
