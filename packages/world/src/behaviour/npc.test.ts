import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { bootstrapContentDefinitions, type NpcContentDefinition } from '@orchard/sim';
import {
  authoredNpcProfilePlan,
  authoredNpcRowPlan,
  authoredNpcSpawnLifecyclePlan,
  authoredNpcTickLifecyclePlan,
  authoredNpcWildlifeProfilePlan,
} from './npc.js';

const definitions = bootstrapContentDefinitions()
  .filter((definition): definition is NpcContentDefinition => definition.kind === 'npc' && definition.spawnPolicy !== 'dynamic')
  .sort((left, right) => Number(left.runtimeId) - Number(right.runtimeId));

describe('authored NPC authority plans', () => {
  it('preserves the exact starter and lobby NPC row and profile projections', () => {
    expect(definitions.filter(definition=>!definition.id.startsWith('npc:willow_')).map((definition) => {
      const row = authoredNpcRowPlan(definition, 0n);
      return { id: row.id, kind: row.kind, name: row.displayName, x: row.x, y: row.y,
        activity: row.wanderDirection, profile: authoredNpcProfilePlan(definition) };
    })).toEqual([
      { id: 1n, kind: 'horse', name: 'Nados Mum', x: 95360, y: 94848, activity: 'idle',
        profile: null },
      { id: 2n, kind: 'merchant', name: 'Marlow', x: 86656, y: 92032, activity: 'idle',
        profile: { npcId: 2n, dialogueId: 'tool_merchant', shopId: 'general_tools' } },
      { id: 3n, kind: 'farmer_bob', name: 'Farmer Bob', x: 97920, y: 96896, activity: 'idle',
        profile: { npcId: 3n, dialogueId: 'farmer_bob', shopId: 'farmer_supplies' } },
      { id: 7n, kind: 'fisherman_fin', name: 'Fisherman Fin', x: 104832, y: 81280, activity: 'fish_rest',
        profile: { npcId: 7n, dialogueId: 'fisherman_fin', shopId: '' } },
      { id: 4294966920n, kind: 'delve_quartermaster', name: 'Orrin', x: 1408, y: 2944, activity: 'idle',
        profile: { npcId: 4294966920n, dialogueId: 'delve_quartermaster', shopId: 'delve_supplies' } },
    ]);
  });

  it('updates metadata without moving or healing an existing persistent NPC', () => {
    const definition = definitions.find(({ id }) => id === 'npc:marlow')!;
    const existing = { ...authoredNpcRowPlan(definition, 0n), x: 77, y: 88, health: 42,
      wanderDirection: 'custom', nextDecisionTick: 999n };
    expect(authoredNpcRowPlan({ ...definition, displayName: 'Marlow Updated' }, 100n, existing)).toMatchObject({
      displayName: 'Marlow Updated', x: 77, y: 88, health: 42, wanderDirection: 'custom', nextDecisionTick: 999n,
    });
  });

  it('preserves the durable starter horse row and custody across content reconciliation', () => {
    const horse = definitions.find(({ runtimeId }) => runtimeId === '1')!;
    const existing = {
      ...authoredNpcRowPlan(horse, 0n),
      x: 71_111,
      y: 82_222,
      homeX: 70_000,
      homeY: 80_000,
      health: 37,
      rider: 'durable-player-custody',
      wanderDirection: 'custom',
      nextDecisionTick: 9_999n,
    };
    const retained = authoredNpcRowPlan({ ...horse, displayName: 'Renamed Starter' }, 500n, existing);
    expect(retained).toMatchObject({
      id: 1n,
      displayName: 'Renamed Starter',
      x: 71_111,
      y: 82_222,
      homeX: 70_000,
      homeY: 80_000,
      health: 37,
      rider: 'durable-player-custody',
      wanderDirection: 'custom',
      nextDecisionTick: 9_999n,
    });
    expect(authoredNpcWildlifeProfilePlan({ ...horse, id: 'npc:renamed_starter' }, retained)).toEqual({
      npcId: 1n,
      species: 'horse',
      variant: 0,
      packId: 0n,
      habitat: 'pasture',
      chunkX: retained.chunkX,
      chunkY: retained.chunkY,
      spaceId: retained.spaceId,
    });
  });

  it('projects a renamed merchant only from its explicit authored shop', () => {
    const source = definitions.find(({ id }) => id === 'npc:marlow')!;
    const renamed: NpcContentDefinition = {
      ...source,
      id: 'npc:night_merchant',
      runtimeId: '99006',
      runtimeKind: 'night_vendor',
      dialogue: 'dialogue:night_market',
      shop: 'shop:night_market',
    };
    expect(authoredNpcProfilePlan(renamed)).toEqual({
      npcId: 99006n,
      dialogueId: 'night_market',
      shopId: 'night_market',
    });
    const { shop, ...shopless } = renamed;
    expect(shop).toBe('shop:night_market');
    expect(authoredNpcProfilePlan(shopless)).toEqual({
      npcId: 99006n,
      dialogueId: 'night_market',
      shopId: '',
    });
  });

  it('validates the lifecycle-owned coarse fishing transition', () => {
    const fin = definitions.find(({ ai }) => ai.kind === 'fishing_cycle')!;
    expect(authoredNpcTickLifecyclePlan(fin, [
      { setState: { activity: 'fish_cast', nextDecisionTick: 120 } },
      { animation: 'fish_cast' },
    ])).toEqual({ activity: 'fish_cast', nextDecisionTick: 120n });
    expect(authoredNpcTickLifecyclePlan(definitions.find(({ id }) => id === 'npc:marlow')!, [])).toBeNull();
  });

  it('projects an arbitrary authored fishing NPC without a definition-id branch', () => {
    const source = definitions.find(({ ai }) => ai.kind === 'fishing_cycle')!;
    if (source.ai.kind !== 'fishing_cycle') throw new Error('authored fishing fixture missing');
    const definition: NpcContentDefinition = {
      ...source,
      id: 'npc:harbour_keeper',
      runtimeId: '99',
      runtimeKind: 'harbour_master',
      initialDecisionDelayTicks: 61,
      displayName: 'Harbour Keeper',
      home: { spaceId: 12, tileX: -7, tileY: 21 },
      facing: 'left',
      ai: { ...source.ai, castTicks: 37 },
    };
    const spawn = authoredNpcSpawnLifecyclePlan(definition, [{
      spawnNpc: {
        definitionId: definition.id,
        at: { spaceId: '12', x: -7, y: 21 },
      },
    }], 500n);
    expect(spawn.row).toMatchObject({
      id: 99n,
      kind: 'harbour_master',
      displayName: 'Harbour Keeper',
      x: -1_664,
      y: 5_504,
      facing: 'left',
      spaceId: 12,
      nextDecisionTick: 720n,
    });
    expect(authoredNpcRowPlan({ ...definition, ai: { kind: 'stationary' } }, 500n))
      .toMatchObject({ kind: 'harbour_master', nextDecisionTick: 561n });
    expect(spawn.profile).toEqual({ npcId: 99n, dialogueId: 'fisherman_fin', shopId: '' });
    expect(authoredNpcTickLifecyclePlan(definition, [
      { setState: { activity: 'fish_wait', nextDecisionTick: 540 } },
      { animation: 'fish_wait' },
      { say: 'The tide is turning.' },
    ])).toEqual({
      activity: 'fish_wait',
      nextDecisionTick: 540n,
      speech: 'The tide is turning.',
    });
    expect(() => authoredNpcTickLifecyclePlan(definition, [
      { setState: { activity: 'fish_wait', nextDecisionTick: 540, x: 999 } },
      { animation: 'fish_wait' },
    ])).toThrow('npc tick lifecycle mismatch: npc:harbour_keeper');

    const existing = {
      ...spawn.row,
      x: 77,
      y: 88,
      health: 42,
      wanderDirection: 'fish_reel',
      nextDecisionTick: 900n,
    };
    expect(authoredNpcSpawnLifecyclePlan(definition, [{
      spawnNpc: {
        definitionId: definition.id,
        at: { spaceId: '12', x: -7, y: 21 },
      },
    }], 700n, existing).row).toMatchObject({
      x: 77,
      y: 88,
      health: 42,
      wanderDirection: 'fish_reel',
      nextDecisionTick: 900n,
    });
  });

  it('wires lifecycle transitions through the bus and retires fixed constructors', () => {
    const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    expect(source).toContain("type: 'statistic'");
    expect(source).toContain("type: 'questState'");
    expect(source).toContain("type: 'spawn'");
    expect(source).toContain("type: 'tick'");
    expect(source).toContain('raiseEvent(currentWorldBehaviourHandlers(ctx), event');
    expect(source).toContain('authoredNpcSpawnLifecyclePlan(');
    expect(source).toContain('raiseAuthoredNpcTickEvent(');
    expect(source).not.toContain('authoredNpcTickPlan(');
    expect(source).toContain('questAction: (action) =>');
    expect(source).toContain("objective?.kind !== 'action' || quest?.state !== 'active'");
    expect(source).toContain("'quest_actions',");
    expect(source).toContain('objective.actionKind,');
    expect(source).not.toContain('npc.statistic.fast-strawberry');
    expect(source).not.toContain('npc.quest-state.lifecycle');
    expect(source).not.toContain('function toolMerchantRow(');
    expect(source).not.toContain('function farmerBobRow(');
    expect(source).not.toContain('function fishermanFinRow(');
  });
});
