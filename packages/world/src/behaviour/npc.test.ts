import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { bootstrapContentDefinitions, type NpcContentDefinition } from '@orchard/sim';
import {
  authoredNpcProfilePlan,
  authoredNpcRowPlan,
  authoredNpcSpawnLifecyclePlan,
  authoredNpcTickLifecyclePlan,
} from './npc.js';

const definitions = bootstrapContentDefinitions()
  .filter((definition): definition is NpcContentDefinition => definition.kind === 'npc' && definition.spawnPolicy !== 'dynamic')
  .sort((left, right) => Number(left.runtimeId) - Number(right.runtimeId));

describe('authored NPC authority plans', () => {
  it('matches the exact Marlow/Bob/Fin row and profile projections', () => {
    expect(definitions.map((definition) => {
      const row = authoredNpcRowPlan(definition, 0n);
      return { id: row.id, kind: row.kind, name: row.displayName, x: row.x, y: row.y,
        activity: row.wanderDirection, profile: authoredNpcProfilePlan(definition) };
    })).toEqual([
      { id: 2n, kind: 'merchant', name: 'Marlow', x: 86656, y: 92032, activity: 'idle',
        profile: { npcId: 2n, dialogueId: 'tool_merchant', shopId: 'general_tools' } },
      { id: 3n, kind: 'farmer_bob', name: 'Farmer Bob', x: 97920, y: 96896, activity: 'idle',
        profile: { npcId: 3n, dialogueId: 'farmer_bob', shopId: 'farmer_supplies' } },
      { id: 7n, kind: 'fisherman_fin', name: 'Fisherman Fin', x: 104832, y: 81280, activity: 'fish_rest',
        profile: { npcId: 7n, dialogueId: 'fisherman_fin', shopId: 'general_tools' } },
    ]);
  });

  it('updates metadata without moving or healing an existing persistent NPC', () => {
    const definition = definitions[0]!;
    const existing = { ...authoredNpcRowPlan(definition, 0n), x: 77, y: 88, health: 42,
      wanderDirection: 'custom', nextDecisionTick: 999n };
    expect(authoredNpcRowPlan({ ...definition, displayName: 'Marlow Updated' }, 100n, existing)).toMatchObject({
      displayName: 'Marlow Updated', x: 77, y: 88, health: 42, wanderDirection: 'custom', nextDecisionTick: 999n,
    });
  });

  it('validates the lifecycle-owned coarse fishing transition', () => {
    const fin = definitions[2]!;
    expect(authoredNpcTickLifecyclePlan(fin, [
      { setState: { activity: 'fish_cast', nextDecisionTick: 120 } },
      { animation: 'fish_cast' },
    ])).toEqual({ activity: 'fish_cast', nextDecisionTick: 120n });
    expect(authoredNpcTickLifecyclePlan(definitions[0]!, [])).toBeNull();
  });

  it('projects an arbitrary authored fishing NPC without a definition-id branch', () => {
    const definition: NpcContentDefinition = {
      ...definitions[2]!,
      id: 'npc:harbour_keeper',
      runtimeId: '99',
      runtimeKind: 'harbour_master',
      initialDecisionDelayTicks: 61,
      displayName: 'Harbour Keeper',
      home: { spaceId: 12, tileX: -7, tileY: 21 },
      facing: 'left',
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
    expect(spawn.profile).toMatchObject({ npcId: 99n, dialogueId: 'fisherman_fin' });
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
