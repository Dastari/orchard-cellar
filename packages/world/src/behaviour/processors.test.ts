import {
  BARREL_CURE_TICKS,
  FERMENTATION_CYCLE_TICKS,
  FURNACE_SMELT_TICKS,
  PRESS_CYCLE_TICKS,
  bootstrapContentRegistry,
  bootstrapContentRows,
  buildContentRegistry,
  maxStackFor,
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
    maxStackForItem: (_ctx, itemKind) => maxStackFor(itemKind),
    grantSkillExperience: (_ctx, who, _track, amount) => experience.push({ identity: who, amount }),
    recordPlayerStatistic: (_ctx, _who, kind, delta, _tick, context) => statistics.push({
      kind,
      delta,
      ...(context === undefined ? {} : { context }),
    }),
    homesteadUpgradeRank: () => 0,
    processCompleted: (_ctx, completedPlaceable, unitsSettled) => completions.push({
      placeableId: completedPlaceable.id,
      unitsSettled,
    }),
  };
  const result = settleProcessorPlaceableBehaviour(ctx, row, dependencies);
  return { result, slotWrites, experience, statistics, completions };
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

  it('settles a renamed station tag and noncanonical slot topology from active definitions', () => {
    const customObject = {
      id: 'object:ember_kiln', kind: 'object', schemaVersion: 1, displayName: 'Ember Kiln',
      components: {
        identity: { tags: ['station.ember'] },
        container: { slotCount: 5, access: 'private', sortAllowed: false },
        processor: {
          processTag: 'station.ember', slotRoles: { input: [3], fuel: [1], output: [4] },
          ticksPerUnit: 7, catchUpCap: 9, autoStart: true,
        },
      },
    } as const;
    const customProcess = {
      id: 'process:ember_iron', kind: 'process', schemaVersion: 1,
      stationTag: 'station.ember', input: { item: 'item:iron_ore', count: 1 },
      outputs: [{ item: 'item:iron_bar', count: 1 }], ticksPerUnit: 7,
      fuelPolicy: { acceptedItems: ['item:wood'], unitsPerItem: 1 }, adapter: 'smelting',
    } as const;
    const customRegistry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: customObject.id, kind: customObject.kind, slug: 'ember_kiln', json: customObject },
      { id: customProcess.id, kind: customProcess.kind, slug: 'ember_iron', json: customProcess },
    ]).registry;
    const settled = run(placeable('anything', {
      definitionId: customObject.id, smeltStartTick: 10n,
    }), [null, { itemKind: 'wood', quantity: 2 }, null, { itemKind: 'iron_ore', quantity: 2 }, null],
    24n, customRegistry);
    expect(settled.slotWrites.map(({ slot, itemKind, quantity }) => ({ slot, itemKind, quantity })))
      .toEqual([
        { slot: 1, itemKind: 'empty', quantity: 0 },
        { slot: 3, itemKind: 'empty', quantity: 0 },
        { slot: 4, itemKind: 'iron_bar', quantity: 2 },
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
