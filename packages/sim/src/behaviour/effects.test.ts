import { describe, expect, it } from 'vitest';
import {
  CONDITION_OPCODES,
  CURRENT_BEHAVIOUR_ENGINE_VERSION,
  EFFECT_OPCODES,
  conditionKind,
  conditionSupportedByEngine,
  effectKind,
  effectSupportedByEngine,
  type Condition,
  type Effect,
} from './effects.js';

describe('behaviour condition and effect contracts', () => {
  it('tags every v1 condition opcode with its engine version', () => {
    const conditions = [
      { reach: 'object' },
      { state: 'lit', equals: false },
      { selectedItem: { tag: 'tool.axe', durabilityAtLeast: 1 } },
      { hasItem: { kind: 'wood', count: 2 } },
      { role: { scope: 'homestead', name: 'builder' } },
      { space: { kind: 'interior' } },
      { questState: { questId: 'quest:first', state: 'active' } },
      { statisticAtLeast: { kind: 'items_crafted', value: 3 } },
      { skillRank: { skillId: 'farming', atLeast: 2 } },
      { timeOfDay: { fromMinute: 360, toMinute: 1080 } },
      { season: ['spring', 'summer'] },
      { mounted: false },
      { vitals: { hunger: { atMost: 5000 } } },
      { random: { numerator: 1, denominator: 4, salt: 'bee' } },
      { slotEmpty: { slot: 2 } },
      { slotHas: { slot: 0, item: { tag: 'fuel' } } },
      { containerHasSpace: { item: { kind: 'apple' } } },
      { nearbyObject: { tag: 'station.workbench', withinTiles: 3 } },
      { notCarrying: true },
    ] as const satisfies readonly Condition[];

    expect(conditions.map(conditionKind)).toEqual(CONDITION_OPCODES.map(({ kind }) => kind));
    expect(CONDITION_OPCODES.every(({ engineVersion }) => engineVersion === 1)).toBe(true);
    expect(conditions.every((condition) => (
      conditionSupportedByEngine(condition, CURRENT_BEHAVIOUR_ENGINE_VERSION)
    ))).toBe(true);
  });

  it('tags every v1 effect opcode with its engine version', () => {
    const effects = [
      { setState: { lit: true } },
      { toggleState: 'open' },
      { incrementState: { state: 'charges', amount: 1 } },
      { giveItem: { kind: 'apple', count: 2 } },
      { consumeSelected: 1 },
      { consumeItem: { tag: 'fuel.wood', count: 1 } },
      { damageSelected: 1 },
      { spawnWorldItem: { kind: 'wood', count: 2, at: { x: 4, y: 5 } } },
      { pickupAsItem: 'item:chest' },
      { openFrame: 'frame:chest' },
      { closeFrame: true },
      { startProcess: 'process:smelt_iron' },
      { settleProcess: true },
      { claimProcessJob: { action: 'collect' } },
      { sealContainer: true },
      { spawnObject: { definitionId: 'object:campfire', at: { x: 1, y: 2 } } },
      { despawnObject: {} },
      { spawnNpc: { definitionId: 'npc:boat', at: { x: 1, y: 2 } } },
      { teleport: { spaceId: 'space:cellar', x: 2, y: 3 } },
      { usePortal: 'portal:cellar' },
      { grantBronze: 5 },
      { chargeBronze: 5 },
      { grantExperience: { skillId: 'farming', amount: 10 } },
      { applyEffect: { effectId: 'fruitful_energy', stacks: 1 } },
      { learnRecipes: ['recipe:wooden_pickaxe'] },
      { statistic: 'lights_toggled' },
      { questAction: { questId: 'quest:first', action: 'progress', amount: 1 } },
      { say: 'Welcome.' },
      { bark: 'Fine weather.' },
      { sfx: 'lantern_click' },
      { animation: 'swing' },
      { setCollision: false },
      { setLight: { enabled: true, color: [255, 196, 120], radiusTiles: 4 } },
      { scheduleTimer: { timerId: 'soil-decay', afterTicks: 600 } },
      { carry: {} },
      { placeCarried: { at: { x: 3, y: 4 } } },
      { plantSeed: { spaceId: '0', x: 3, y: 4 } },
      { farmTool: { action: 'restore', at: { spaceId: '0', x: 3, y: 4 } } },
      { worldTool: { action: 'digCellar', at: { spaceId: '2', x: 3, y: 4 } } },
      { meleeAttack: { weapon: 'sword' } },
      { fishing: { action: 'cast', poolId: '42', at: { spaceId: '0', x: 3, y: 4 } } },
      { bowAction: { phase: 'fire', aimX: 12, aimY: -4, chargeMs: 500 } },
      { mount: {} },
      { dismount: true },
      { foundHomestead: { name: 'Bramble Farm' } },
      { rollLoot: { lootId: 'loot:oak', rolls: 1 } },
      { fail: 'item_out_of_reach' },
    ] as const satisfies readonly Effect[];

    expect(effects.map(effectKind)).toEqual(EFFECT_OPCODES.map(({ kind }) => kind));
    expect(EFFECT_OPCODES.every(({ engineVersion }) => engineVersion === 1)).toBe(true);
    expect(effects.every((effect) => (
      effectSupportedByEngine(effect, CURRENT_BEHAVIOUR_ENGINE_VERSION)
    ))).toBe(true);
  });

  it('rejects unknown, empty, and ambiguous opcode objects', () => {
    expect(conditionKind({ unknown: true })).toBeNull();
    expect(conditionKind({})).toBeNull();
    expect(conditionKind({ reach: 'object', mounted: false })).toBeNull();
    expect(effectKind({ unknown: true })).toBeNull();
    expect(effectKind({})).toBeNull();
    expect(effectKind({ sfx: 'one', animation: 'two' })).toBeNull();
    expect(effectSupportedByEngine({ sfx: 'click' }, 0)).toBe(false);
  });
});
