import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';
import { runtimeNpcDefinition, runtimeNpcMount } from './npc-runtime.js';
import type { NpcContentDefinition } from './npc-definition.js';
import { resolveCreatureStats } from '../creatures.js';
import { BOAT_MAX_HEALTH } from '../boats.js';

const registry = bootstrapContentRegistry();

describe('authored NPC runtime identity and mount capability', () => {
  it('preserves legacy mount health and skill requirements in authored metadata', () => {
    expect(registry.npcs.get('npc:boat')?.health).toBe(BOAT_MAX_HEALTH);
    expect(registry.npcs.get('npc:horse')?.health).toBe(resolveCreatureStats('horse').maxHealthCenti / 100);
    expect(runtimeNpcMount(registry, { kind: 'horse' })).toEqual({
      adapter: 'horse', requiredSkill: 'stable_hand', jumpSkill: 'steeplechase',
    });
  });
  it('resolves existing boat and horse rows without modifying durable identity or custody', () => {
    for (const kind of ['boat', 'horse']) {
      const row = Object.freeze({ id: 90_001n, kind, x: 812, y: 923, spaceId: 17,
        rider: 'existing-player', health: 2, homeX: 144, homeY: 288 });
      expect(runtimeNpcDefinition(registry, row)).toMatchObject({ id: `npc:${kind}`, spawnPolicy: 'dynamic' });
      expect(runtimeNpcMount(registry, row)?.adapter).toBe(kind);
      expect(row).toEqual({ id: 90_001n, kind, x: 812, y: 923, spaceId: 17,
        rider: 'existing-player', health: 2, homeX: 144, homeY: 288 });
    }
  });

  it('follows arbitrary authored ids/runtime kinds and explicit ids fail closed', () => {
    const renamed: NpcContentDefinition = { ...registry.npcs.get('npc:boat')!,
      id: 'npc:harbour_ferry', runtimeKind: 'ferry', displayName: 'Harbour Ferry' };
    const custom = { npcs: new Map([[renamed.id, renamed]]) };
    expect(runtimeNpcMount({ npcs: new Map([[renamed.id, { ...renamed, runtimeKind: 'boat' }]]) },
      { id: 90_001n, kind: 'boat' })).toEqual({ adapter: 'boat' });
    expect(runtimeNpcMount(custom, { id: 88n, kind: 'ferry' })).toEqual({ adapter: 'boat' });
    expect(runtimeNpcMount(custom, { id: 88n, kind: 'boat', definitionId: renamed.id })).toEqual({ adapter: 'boat' });
    expect(runtimeNpcMount(custom, { id: 88n, kind: 'boat' })).toBeNull();
    expect(runtimeNpcMount(custom, { id: 88n, kind: 'ferry', definitionId: 'npc:missing' })).toBeNull();
    expect(runtimeNpcMount({ npcs: new Map([[renamed.id, { ...renamed, retired: true }]]) },
      { id: 88n, kind: 'ferry', definitionId: renamed.id })).toBeNull();
    expect(runtimeNpcMount(registry, { id: 2n, kind: 'boat' })).toBeNull();
  });
});
