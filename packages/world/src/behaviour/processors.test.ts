import {
  BARREL_CURE_TICKS,
  FERMENTATION_CYCLE_TICKS,
  FURNACE_SMELT_TICKS,
  PRESS_CYCLE_TICKS,
  bootstrapContentRegistry,
  bootstrapContentRows,
  buildContentRegistry,
  runtimeMaxStack,
  type ItemStack,
  type ContentRegistry,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';

import type { WorldPlaceableRow, WorldReducerContext } from '../index.js';
import {
  processorAdapterForPlaceableBehaviour,
  settleProcessorPlaceableBehaviour,
  type ProcessorBehaviourDependencies,
} from './processors.js';

const registry = bootstrapContentRegistry();
const identity = { toHexString: () => '01' } as unknown as WorldPlaceableRow['placedBy'];

function placeable(kind: string, fields: Partial<WorldPlaceableRow> = {}): WorldPlaceableRow {
  return {
    id: 7n,
    kind,
    tileX: 1,
    tileY: 2,
    chunkX: 0,
    chunkY: 0,
    spaceId: 0,
    placedBy: identity,
    facing: 'down',
    open: false,
    smeltStartTick: undefined,
    lit: true,
    carriedBy: undefined,
    barrelSealedTick: undefined,
    barrelSealedBy: undefined,
    cookStartTick: undefined,
    cookStartedBy: undefined,
    cookInputKind: undefined,
    processStartTick: undefined,
    processStartedBy: undefined,
    processInputKind: undefined,
    definitionId: '',
    stateJson: '{}',
    ...fields,
  };
}

function run(
  row: WorldPlaceableRow,
  slots: readonly (ItemStack | null)[],
  authorityTick: bigint,
  contentRegistry: ContentRegistry = registry,
  bonuses = { estateRank: 0, barrelingRank: 0 },
) {
  let current = row;
  const slotRows = slots.map((stack, slot) => ({
    id: `${row.id}:${slot}`,
    placeableId: row.id,
    slot,
    itemKind: stack?.itemKind ?? 'empty',
    quantity: stack?.quantity ?? 0,
    durability: stack?.durability ?? 0,
    lit: stack?.lit ?? true,
  }));
  const slotWrites: typeof slotRows = [];
  const experience: Array<{ identity: unknown; amount: bigint }> = [];
  const statistics: Array<{ kind: string; delta: bigint; context?: string }> = [];
  const completions: Array<{ placeableId: bigint; unitsSettled: number }> = [];
  const ctx = {
    db: {
      world_clock: { id: { find: () => ({ authorityTick }) } },
      world_placeable_slot: { id: { update: (next: typeof slotRows[number]) => slotWrites.push(next) } },
      world_placeable: { id: {
        update: (next: WorldPlaceableRow) => { current = next; },
        find: () => current,
      } },
    },
  } as unknown as WorldReducerContext;
  const dependencies: ProcessorBehaviourDependencies = {
    contentRegistry: () => contentRegistry,
    loadOpenPlaceableRows: () => [...slotRows],
    storedStack: (_ctx, itemKind, quantity, durability, lit) => itemKind === 'empty' || quantity <= 0
      ? null
      : { itemKind, quantity, durability, lit },
    sameStoredStack: (left, right) => left?.itemKind === right?.itemKind
      && left?.quantity === right?.quantity
      && left?.durability === right?.durability
      && left?.lit === right?.lit,
    storedDurability: (_ctx, _itemKind, durability) => durability ?? 0,
    storedLit: (_itemKind, lit) => lit ?? true,
    maxStackForItem: (_ctx, itemKind) => runtimeMaxStack(contentRegistry, itemKind),
    grantSkillExperience: (_ctx, who, _track, amount) => experience.push({ identity: who, amount }),
    recordPlayerStatistic: (_ctx, _who, kind, delta, _tick, context) => statistics.push({
      kind,
      delta,
      ...(context === undefined ? {} : { context }),
    }),
    homesteadUpgradeRank: () => bonuses.estateRank,
    barrelingRank: () => bonuses.barrelingRank,
    processCompleted: (_ctx, completedPlaceable, unitsSettled) => completions.push({
      placeableId: completedPlaceable.id,
      unitsSettled,
    }),
  };
  let result = row;
  let error: unknown;
  try {
    result = settleProcessorPlaceableBehaviour(ctx, row, dependencies);
  } catch (caught) {
    error = caught;
  }
  return { result, slotWrites, experience, statistics, completions, error };
}

describe('data-backed processor authority adapter', () => {
  it('maps all five placeable capabilities onto one process adapter', () => {
    expect([
      'furnace', 'cooking_fire', 'fruit_press', 'fermentation_cask', 'barrel', 'chest',
    ].map((kind) => processorAdapterForPlaceableBehaviour(registry, placeable(kind)))).toEqual([
      'smelting', 'campfire_cooking', 'press', 'fermentation', 'barrel', null,
    ]);
  });

  it('resolves a renamed authored processor from components rather than its row kind', () => {
    const customObject = {
      id: 'object:kiln_alpha', kind: 'object', schemaVersion: 1, displayName: 'Kiln Alpha',
      components: {
        identity: { tags: ['station.furnace'] },
        container: { slotCount: 3, access: 'private', sortAllowed: false },
        processor: {
          processTag: 'station.furnace', slotRoles: { input: [0], fuel: [1], output: [2] },
          ticksPerUnit: 6_000, catchUpCap: 64, autoStart: true,
        },
      },
    } as const;
    const customRegistry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: customObject.id, kind: customObject.kind, slug: 'kiln_alpha', json: customObject },
    ]).registry;
    expect(processorAdapterForPlaceableBehaviour(customRegistry, {
      kind: 'renamed_kiln', definitionId: customObject.id,
    })).toBe('smelting');
  });

  it('rejects retired processor objects and retired or ambiguous process policy', () => {
    const object = registry.objects.get('object:fruit_press')!;
    const retiredObjectRegistry = {
      ...registry,
      objects: new Map(registry.objects).set(object.id, { ...object, retired: true }),
    };
    expect(processorAdapterForPlaceableBehaviour(retiredObjectRegistry, placeable('fruit_press', {
      definitionId: object.id,
    }))).toBeNull();

    const retiredProcesses = new Map([...registry.processes].map(([id, definition]) => [
      id,
      definition.stationTag === object.components.processor!.processTag
        ? { ...definition, retired: true as const }
        : definition,
    ]));
    expect(processorAdapterForPlaceableBehaviour({
      ...registry, processes: retiredProcesses,
    }, placeable('fruit_press', { definitionId: object.id }))).toBeNull();

    const pressProcess = [...registry.processes.values()]
      .find((definition) => definition.stationTag === object.components.processor!.processTag)!;
    const conflicting = {
      ...pressProcess,
      id: 'process:conflicting_press_adapter' as const,
      adapter: 'fermentation' as const,
    };
    expect(processorAdapterForPlaceableBehaviour({
      ...registry,
      processes: new Map([...registry.processes, [conflicting.id, conflicting]]),
    }, placeable('fruit_press', { definitionId: object.id }))).toBeNull();
  });

  it('settles a renamed station tag and noncanonical slot topology from active definitions', () => {
    const ore = registry.items.get('item:iron_ore')!;
    const bar = registry.items.get('item:iron_bar')!;
    const moonOre = { ...ore, id: 'item:moon_ore' as const, displayName: 'Moon Ore' };
    const moonBar = { ...bar, id: 'item:moon_bar' as const, displayName: 'Moon Bar' };
    const customObject = {
      id: 'object:ember_kiln', kind: 'object', schemaVersion: 1, displayName: 'Ember Kiln',
      components: {
        identity: { tags: ['station.ember'] },
        container: { slotCount: 5, access: 'private', sortAllowed: false },
        processor: {
          processTag: 'station.ember', slotRoles: { input: [3], fuel: [1], output: [4] },
          ticksPerUnit: 7, catchUpCap: 9, autoStart: true,
          completionRewards: {
            experience: { skill: 'farming', amount: 11 },
            statistics: [{
              statistic: 'statistic:items_obtained', quantity: 'output', subject: 'output',
            }],
          },
        },
      },
    } as const;
    const customProcess = {
      id: 'process:ember_iron', kind: 'process', schemaVersion: 1,
      stationTag: 'station.ember', input: { item: moonOre.id, count: 1 },
      outputs: [{ item: moonBar.id, count: 1 }], ticksPerUnit: 7,
      fuelPolicy: { acceptedItems: ['item:wood'], unitsPerItem: 1 }, adapter: 'smelting',
    } as const;
    const customRegistry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: moonOre.id, kind: moonOre.kind, slug: 'moon_ore', json: moonOre },
      { id: moonBar.id, kind: moonBar.kind, slug: 'moon_bar', json: moonBar },
      { id: customObject.id, kind: customObject.kind, slug: 'ember_kiln', json: customObject },
      { id: customProcess.id, kind: customProcess.kind, slug: 'ember_iron', json: customProcess },
    ]).registry;
    const settled = run(placeable('anything', {
      definitionId: customObject.id, smeltStartTick: 10n,
    }), [null, { itemKind: 'wood', quantity: 2 }, null, { itemKind: 'moon_ore', quantity: 2 }, null],
    24n, customRegistry);
    expect(settled.slotWrites.map(({ slot, itemKind, quantity }) => ({ slot, itemKind, quantity })))
      .toEqual([
        { slot: 1, itemKind: 'empty', quantity: 0 },
        { slot: 3, itemKind: 'empty', quantity: 0 },
        { slot: 4, itemKind: 'moon_bar', quantity: 2 },
      ]);
    expect(settled.experience).toEqual([{ identity, amount: 22n }]);
    expect(settled.statistics).toEqual([
      { kind: 'items_obtained', delta: 2n, context: 'moon_bar' },
    ]);
    expect(settled.completions).toEqual([{ placeableId: 7n, unitsSettled: 2 }]);
  });

  it('writes exact furnace rows and retains the elapsed remainder boundary', () => {
    const settled = run(placeable('furnace', { smeltStartTick: 10n }), [
      { itemKind: 'iron_ore', quantity: 3 },
      { itemKind: 'wood', quantity: 3 },
      null,
    ], 10n + FURNACE_SMELT_TICKS * 2n);
    expect(settled.slotWrites.map(({ slot, itemKind, quantity }) => ({ slot, itemKind, quantity })))
      .toEqual([
        { slot: 0, itemKind: 'iron_ore', quantity: 1 },
        { slot: 1, itemKind: 'wood', quantity: 1 },
        { slot: 2, itemKind: 'iron_bar', quantity: 2 },
      ]);
    expect(settled.result.smeltStartTick).toBe(10n + FURNACE_SMELT_TICKS * 2n);
    expect(settled.experience).toEqual([]);
    expect(settled.statistics).toEqual([]);
    expect(settled.completions).toEqual([{ placeableId: 7n, unitsSettled: 2 }]);
  });

  it('writes exact cooking rows, attribution, experience, and statistic context', () => {
    const settled = run(placeable('cooking_fire', {
      cookStartTick: 20n,
      cookStartedBy: identity,
      cookInputKind: 'raw_beef',
    }), [{ itemKind: 'raw_beef', quantity: 2 }, null], 20n + 1_000n * 2n);
    expect(settled.slotWrites.map(({ slot, itemKind, quantity }) => ({ slot, itemKind, quantity })))
      .toEqual([
        { slot: 0, itemKind: 'empty', quantity: 0 },
        { slot: 1, itemKind: 'cooked_beef', quantity: 2 },
      ]);
    expect(settled.result).toMatchObject({
      cookStartTick: undefined,
      cookStartedBy: undefined,
      cookInputKind: undefined,
    });
    expect(settled.experience).toEqual([{ identity, amount: 14n }]);
    expect(settled.statistics).toEqual([
      { kind: 'food_cooked', delta: 2n, context: 'cooked_beef' },
    ]);
    expect(settled.completions).toEqual([{ placeableId: 7n, unitsSettled: 2 }]);
  });

  it('writes exact press and fermentation rows and side effects', () => {
    const press = run(placeable('fruit_press', {
      processStartTick: 30n,
      processStartedBy: identity,
      processInputKind: 'apple',
    }), [{ itemKind: 'apple', quantity: 2 }, null, null], 30n + PRESS_CYCLE_TICKS * 2n);
    expect(press.slotWrites.map(({ slot, itemKind, quantity }) => ({ slot, itemKind, quantity })))
      .toEqual([
        { slot: 0, itemKind: 'empty', quantity: 0 },
        { slot: 1, itemKind: 'must', quantity: 2 },
        { slot: 2, itemKind: 'pomace', quantity: 2 },
      ]);
    expect(press.experience).toEqual([{ identity, amount: 8n }]);
    expect(press.statistics).toEqual([
      { kind: 'fruit_pressed', delta: 2n, context: 'apple' },
      { kind: 'press_cycles_completed', delta: 2n },
      { kind: 'items_obtained', delta: 2n, context: 'must' },
      { kind: 'items_obtained', delta: 2n, context: 'pomace' },
    ]);
    expect(press.completions).toEqual([{ placeableId: 7n, unitsSettled: 2 }]);

    const fermentation = run(placeable('fermentation_cask', {
      processStartTick: 40n,
      processStartedBy: identity,
      processInputKind: 'must',
    }), [{ itemKind: 'must', quantity: 6 }, null], 40n + FERMENTATION_CYCLE_TICKS * 2n);
    expect(fermentation.slotWrites.map(({ slot, itemKind, quantity }) => ({ slot, itemKind, quantity })))
      .toEqual([
        { slot: 0, itemKind: 'empty', quantity: 0 },
        { slot: 1, itemKind: 'bottles', quantity: 2 },
      ]);
    expect(fermentation.experience).toEqual([{ identity, amount: 50n }]);
    expect(fermentation.statistics).toEqual([
      { kind: 'bottles_produced', delta: 2n },
      { kind: 'items_obtained', delta: 2n, context: 'bottles' },
    ]);
    expect(fermentation.completions).toEqual([{ placeableId: 7n, unitsSettled: 2 }]);
  });

  it('preflights invalid live rewards before any settlement write', () => {
    const invalidRegistry = {
      ...registry,
      statistics: new Map([...registry.statistics]
        .filter(([id]) => id !== 'statistic:fruit_pressed')),
    };
    const settled = run(placeable('fruit_press', {
      processStartTick: 30n,
      processStartedBy: identity,
      processInputKind: 'apple',
    }), [{ itemKind: 'apple', quantity: 2 }, null, null],
    30n + PRESS_CYCLE_TICKS * 2n, invalidRegistry);
    expect(settled.error).toEqual(new Error('invalid_processor_completion_rewards:process:press_apple'));
    expect(settled.slotWrites).toEqual([]);
    expect(settled.experience).toEqual([]);
    expect(settled.statistics).toEqual([]);
    expect(settled.completions).toEqual([]);
  });

  it('writes a cured barrel atomically and leaves invalid sealed batches untouched', () => {
    const barrelSlots = [
      { itemKind: 'tomato', quantity: 8 },
      ...Array.from({ length: 7 }, () => null),
    ];
    const row = placeable('barrel', { barrelSealedTick: 50n, barrelSealedBy: identity });
    const settled = run(row, barrelSlots, 50n + BARREL_CURE_TICKS);
    expect(settled.slotWrites.map(({ slot, itemKind, quantity }) => ({ slot, itemKind, quantity })))
      .toEqual([{ slot: 0, itemKind: 'preserved_tomato', quantity: 8 }]);
    expect(settled.result).toMatchObject({
      barrelSealedTick: undefined,
      barrelSealedBy: undefined,
    });
    expect(settled.experience).toEqual([{ identity, amount: 23n }]);
    expect(settled.statistics).toEqual([
      { kind: 'barrels_cured', delta: 1n, context: 'tomato' },
    ]);
    expect(settled.completions).toEqual([{ placeableId: 7n, unitsSettled: 8 }]);

    const invalid = run(row, [{ itemKind: 'apple', quantity: 8 }, ...barrelSlots.slice(1)],
      50n + BARREL_CURE_TICKS);
    expect(invalid.result).toBe(row);
    expect(invalid.slotWrites).toEqual([]);
    expect(invalid.experience).toEqual([]);
    expect(invalid.statistics).toEqual([]);
    expect(invalid.completions).toEqual([]);
  });
});

it('applies estate and Barreling timing before settling a cellar cask', () => {
  const cask = placeable('fermentation_cask', { spaceId: 30005, processStartTick: 0n });
  const slots = [{ itemKind: 'must', quantity: 3 }, null];
  const bonuses = { estateRank: 3, barrelingRank: 1 };
  expect(run(cask, slots, 89_999n, registry, bonuses).slotWrites).toEqual([]);
  const complete = run(cask, slots, 90_000n, registry, bonuses);
  expect(complete.error).toBeUndefined();
  expect(complete.slotWrites).toContainEqual(expect.objectContaining({ slot: 1, itemKind: 'bottles', quantity: 1 }));
  expect(complete.experience).toEqual([{ identity, amount: 25n }]);
});

it('preserves barrel inputs in nonzero slots with the authored input duration', () => {
  const barrel = placeable('barrel', { barrelSealedTick: 0n });
  const processes = new Map(registry.processes);
  const definition = processes.get('process:preserve_grape')!;
  processes.set(definition.id, { ...definition, ticksPerUnit: 120 });
  const live = { ...registry, processes };
  const slots = [null, { itemKind: 'grape', quantity: 4 }, ...Array(6).fill(null)];
  const result = run(barrel, slots, 120n, live);
  expect(result.error).toBeUndefined();
  expect(result.slotWrites).toContainEqual(expect.objectContaining({ slot: 0, itemKind: 'preserved_grape', quantity: 4 }));
});

it('keeps an incomplete two-Must input intact until a third unit arrives', () => {
  const cask = placeable('fermentation_cask');
  const waiting = run(cask, [{ itemKind: 'must', quantity: 2 }, null], 100n);
  expect(waiting.slotWrites).toEqual([]);
  expect(waiting.result.processStartTick).toBeUndefined();
  expect(waiting.experience).toEqual([]);
  const started = run(cask, [{ itemKind: 'must', quantity: 3 }, null], 100n);
  expect(started.result.processStartTick).toBe(100n);
  expect(started.slotWrites).toEqual([]);
});
