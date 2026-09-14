import { describe, expect, it } from 'vitest';
import { EFFECT_OPCODES, MAX_EFFECTS_PER_HANDLER_RESULT, type Effect } from '@orchard/sim';

import {
  APPLIED_EFFECT_KINDS,
  MAX_SPAWN_EFFECTS_PER_EVENT,
  applyBehaviourEffects,
  createBehaviourEffectWriter,
  rejectingBehaviourEffectAdapters,
  type BehaviourEffectWriter,
} from './applier.js';

const ALL_EFFECTS = [
  { setState: { open: true } },
  { toggleState: 'lit' },
  { incrementState: { state: 'uses', amount: 1 } },
  { giveItem: { kind: 'apple', count: 1 } },
  { consumeSelected: 1 },
  { consumeItem: { kind: 'wood', count: 1 } },
  { damageSelected: 1 },
  { restoreHunger: 700 },
  { repairSelected: true },
  { spawnWorldItem: { kind: 'stone', count: 1 } },
  { pickupAsItem: 'lantern' },
  { openFrame: 'frame:chest' },
  { closeFrame: true },
  { startProcess: 'process:smelt_iron' },
  { settleProcess: true },
  { claimProcessJob: { action: 'collect' } },
  { sealContainer: true },
  { spawnObject: { definitionId: 'object:chest' } },
  { despawnObject: {} },
  { spawnNpc: { definitionId: 'npc:marlow' } },
  { teleport: { spaceId: '0' } },
  { usePortal: '1' },
  { grantBronze: 5 },
  { chargeBronze: 5 },
  { grantExperience: { skillId: 'farming', amount: 2 } },
  { applyEffect: { effectId: 'fruitful_energy' } },
  { learnRecipes: ['recipe:wooden_pickaxe'] },
  { statistic: { kind: 'food_eaten', delta: 1 } },
  { questAction: { questId: 'quest:test', action: 'progress' } },
  { say: 'Hello' },
  { bark: 'Oi!' },
  { sfx: 'click' },
  { animation: 'use' },
  { setCollision: true },
  { setLight: { enabled: true } },
  { scheduleTimer: { timerId: 'finish', afterTicks: 20 } },
  { carry: {} },
  { placeCarried: {} },
  { plantSeed: { spaceId: '0', x: 3, y: 4 } },
  { farmTool: { action: 'use', at: { spaceId: '0', x: 3, y: 4 } } },
  { worldTool: { action: 'target' } },
  { meleeAttack: { weapon: 'sword' } },
  { fishing: { action: 'reel' } },
  { bowAction: { phase: 'fire', aimX: 12, aimY: -4, chargeMs: 500 } },
  { mount: {} },
  { dismount: true },
  { foundHomestead: {} },
  { rollLoot: { lootId: 'loot:test' } },
] as const satisfies readonly Effect[];

function recordingWriter(
  writes: string[],
  validate: BehaviourEffectWriter['validate'] = () => undefined,
): BehaviourEffectWriter {
  return {
    validate,
    apply: (kind) => { writes.push(kind); },
  };
}

describe('world behaviour effect applier', () => {
  it('has a deterministic write arm for every effect opcode', () => {
    const writes: string[] = [];
    applyBehaviourEffects(ALL_EFFECTS, recordingWriter(writes));
    const expected = EFFECT_OPCODES.map(({ kind }) => kind).filter((kind) => kind !== 'fail');
    expect(writes).toEqual(expected);
    expect(APPLIED_EFFECT_KINDS).toEqual(EFFECT_OPCODES.map(({ kind }) => kind));
  });

  it('exposes a typed fail-closed adapter seam for downstream world lanes', () => {
    const writes: string[] = [];
    const writer = createBehaviourEffectWriter({
      ...rejectingBehaviourEffectAdapters((kind) => { throw new Error(`unavailable:${kind}`); }),
      sfx: (id) => { writes.push(`sfx:${id}`); },
    });
    applyBehaviourEffects([{ sfx: 'click' }], writer);
    expect(writes).toEqual(['sfx:click']);
    expect(() => applyBehaviourEffects([{ giveItem: { kind: 'apple', count: 1 } }], writer))
      .toThrow('unavailable:giveItem');
    expect(() => applyBehaviourEffects([{ restoreHunger: 700 }], writer))
      .toThrow('unavailable:restoreHunger');
    expect(() => applyBehaviourEffects([{ repairSelected: true }], writer))
      .toThrow('unavailable:repairSelected');
  });

  it('preflights the whole batch before the first row write', () => {
    const writes: string[] = [];
    expect(() => applyBehaviourEffects([
      { giveItem: { kind: 'apple', count: 1 } },
      { chargeBronze: 3 },
    ], recordingWriter(writes, (_kind, _effect, index) => {
      if (index === 1) throw new Error('insufficient_funds');
    }))).toThrow('insufficient_funds');
    expect(writes).toEqual([]);
  });

  it('runs cross-effect validation before the first row write', () => {
    const writes: string[] = [];
    const writer: BehaviourEffectWriter = {
      validate: () => undefined,
      completeValidation: () => { throw new Error('cross_effect_invalid'); },
      apply: (kind) => { writes.push(kind); },
    };
    expect(() => applyBehaviourEffects([{ toggleState: 'open' }], writer))
      .toThrow('cross_effect_invalid');
    expect(writes).toEqual([]);
  });

  it('rejects capped batches, spawn floods, timer abuse, and fail effects atomically', () => {
    const writes: string[] = [];
    expect(() => applyBehaviourEffects(
      Array.from({ length: MAX_EFFECTS_PER_HANDLER_RESULT + 1 }, () => ({ sfx: 'x' })),
      recordingWriter(writes),
    )).toThrow('behaviour_effect_cap_exceeded');
    expect(() => applyBehaviourEffects(
      Array.from({ length: MAX_SPAWN_EFFECTS_PER_EVENT + 1 }, () => (
        { spawnObject: { definitionId: 'object:test' } }
      )),
      recordingWriter(writes),
    )).toThrow('behaviour_spawn_cap_exceeded');
    expect(() => applyBehaviourEffects(
      [{ scheduleTimer: { timerId: 'x', afterTicks: 0 } }],
      recordingWriter(writes),
    )).toThrow('behaviour_timer_horizon_invalid');
    expect(() => applyBehaviourEffects(
      [{ giveItem: { kind: 'apple', count: 1 } }, { fail: 'blocked' }],
      recordingWriter(writes),
    )).toThrow('blocked');
    expect(writes).toEqual([]);
  });
});
