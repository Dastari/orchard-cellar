import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';
import {
  runtimeNpcDefinition,
  runtimeNpcMount,
  runtimeStarterHorseDefinition,
} from './npc-runtime.js';
import type { NpcContentDefinition } from './npc-definition.js';
import { resolveCreatureStats } from '../creatures.js';
import { HORSE_DISMOUNT_DISTANCE_FIXED, HORSE_MOUNT_REACH_FIXED, HORSE_WANDER_RADIUS_FIXED, HORSE_WANDER_SPEED_FIXED, findHorseDismountPosition } from '../npc.js';
import { TILE_SIZE_FIXED } from '../state.js';
import { BOAT_MAX_HEALTH } from '../boats.js';

const registry = bootstrapContentRegistry();

describe('authored NPC runtime identity and mount capability', () => {
  it('preserves legacy mount health and skill requirements in authored metadata', () => {
    expect(registry.npcs.get('npc:boat')?.health).toBe(BOAT_MAX_HEALTH);
    expect(runtimeNpcMount(registry, { kind: 'boat' })).toEqual({ adapter: 'boat', reachFixed: HORSE_MOUNT_REACH_FIXED });
    expect(registry.npcs.get('npc:horse')?.health).toBe(resolveCreatureStats('horse').maxHealthCenti / 100);
    expect(runtimeNpcMount(registry, { kind: 'horse' })).toMatchObject({
      adapter: 'horse', requiredSkill: 'stable_hand', jumpSkill: 'steeplechase',
      reachFixed: HORSE_MOUNT_REACH_FIXED, dismountDistanceFixed: HORSE_DISMOUNT_DISTANCE_FIXED,
      wander: { radiusFixed: HORSE_WANDER_RADIUS_FIXED, speedFixed: HORSE_WANDER_SPEED_FIXED },
    });
    expect(runtimeStarterHorseDefinition(registry)).toMatchObject({
      runtimeId: '1', displayName: 'Nados Mum', home: { tileX: 372, tileY: 370 },
    });
  });
  it('dismounts beside the horse in a narrow entrance clearing', () => {
    const mount = runtimeNpcMount(registry, { kind: 'horse' });
    if (mount?.adapter !== 'horse') throw new Error('missing horse tuning');
    const horse = { x: 10.5 * TILE_SIZE_FIXED, y: 10.5 * TILE_SIZE_FIXED };
    const collision = { width: 32, height: 32, blocked: Array.from({ length: 32 * 32 }, (_, i) => {
      const x = i % 32, y = Math.floor(i / 32);
      return x < 9 || x > 12 || y < 9 || y > 12;
    }) };
    const landing = findHorseDismountPosition(horse, 'right', collision, mount);
    expect(landing).toEqual({ x: horse.x + 1.125 * TILE_SIZE_FIXED, y: horse.y });
  });
  it('resolves existing boat and horse rows without modifying durable identity or custody', () => {
    for (const kind of ['boat', 'horse']) {
      const row = Object.freeze({ id: 90_001n, kind, x: 812, y: 923, spaceId: 17,
        rider: 'existing-player', health: 2, homeX: 144, homeY: 288 });
      expect(runtimeNpcDefinition(registry, row)).toMatchObject({ id: `npc:${kind}` });
      expect(runtimeNpcMount(registry, row)?.adapter).toBe(kind);
      expect(row).toEqual({ id: 90_001n, kind, x: 812, y: 923, spaceId: 17,
        rider: 'existing-player', health: 2, homeX: 144, homeY: 288 });
    }
  });

  it('follows arbitrary authored ids/runtime kinds and explicit ids fail closed', () => {
    const renamed: NpcContentDefinition = { ...registry.npcs.get('npc:boat')!,
      id: 'npc:harbour_ferry', runtimeKind: 'ferry', displayName: 'Harbour Ferry',
      mount: { adapter: 'boat', reachFixed: 313 } };
    const custom = { npcs: new Map([[renamed.id, renamed]]) };
    expect(runtimeNpcMount({ npcs: new Map([[renamed.id, { ...renamed, runtimeKind: 'boat' }]]) },
      { id: 90_001n, kind: 'boat' })).toEqual({ adapter: 'boat', reachFixed: 313 });
    expect(runtimeNpcMount(custom, { id: 88n, kind: 'ferry' })).toEqual({ adapter: 'boat', reachFixed: 313 });
    expect(runtimeNpcMount(custom, { id: 88n, kind: 'boat', definitionId: renamed.id }))
      .toEqual({ adapter: 'boat', reachFixed: 313 });
    expect(runtimeNpcMount(custom, { id: 88n, kind: 'boat' })).toBeNull();
    expect(runtimeNpcMount(custom, { id: 88n, kind: 'ferry', definitionId: 'npc:missing' })).toBeNull();
    expect(runtimeNpcMount({ npcs: new Map([[renamed.id, { ...renamed, retired: true }]]) },
      { id: 88n, kind: 'ferry', definitionId: renamed.id })).toBeNull();
    expect(runtimeNpcMount(registry, { id: 2n, kind: 'boat' })).toBeNull();
  });

  it('keeps a renamed active starter fixed while generated wild horses resolve by runtime kind', () => {
    const horse = registry.npcs.get('npc:horse')!;
    const renamed: NpcContentDefinition = {
      ...horse,
      id: 'npc:island_starter',
      runtimeKind: 'island_equine',
      wildlifeProfile: { ...horse.wildlifeProfile!, species: 'renamed_equine' },
    };
    const custom = { npcs: new Map([[renamed.id, renamed]]) };
    expect(runtimeStarterHorseDefinition(custom)).toBe(renamed);
    expect(runtimeStarterHorseDefinition(custom)?.runtimeId).toBe('1');
    expect(runtimeNpcDefinition(custom, { id: 9_000_001n, kind: 'island_equine' })).toBe(renamed);
    expect(runtimeNpcMount(custom, { id: 9_000_001n, kind: 'island_equine' })?.adapter).toBe('horse');
    expect(runtimeStarterHorseDefinition({ npcs: new Map([[renamed.id, { ...renamed, retired: true }]]) }))
      .toBeNull();
    expect(runtimeStarterHorseDefinition({ npcs: new Map([
      [renamed.id, renamed],
      ['npc:other_starter', { ...renamed, id: 'npc:other_starter' }],
    ]) })).toBeNull();
  });
});
