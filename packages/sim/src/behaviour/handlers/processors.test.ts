import { describe, expect, it } from 'vitest';

import { BARREL_CURE_TICKS, BARREL_MAX_BATCH } from '../../barreling.js';
import {
  FERMENTATION_CYCLE_TICKS,
  PRESS_CYCLE_TICKS,
} from '../../cellar-production.js';
import { bootstrapContentDefinitions } from '../../content/bootstrap-registry.js';
import type { ObjectContentDefinition } from '../../content/object-definition.js';
import type { LifecycleEvent } from '../events.js';
import { raiseEvent } from '../raise.js';
import { createHandlerRegistry } from '../registry.js';
import { createReadOnlySnapshot } from '../snapshot.js';
import {
  processorHandlerRegistrations,
  processTopologyForObject,
  registerProcessorHandlers,
  settleProcess,
  type ProcessAdapter,
} from './processors.js';

const processes = bootstrapContentDefinitions().filter((definition) => definition.kind === 'process');
const objects = bootstrapContentDefinitions().filter(
  (definition): definition is ObjectContentDefinition => definition.kind === 'object',
);
const tile = { spaceId: '0', x: 11, y: 10, tags: [] } as const;

function processDefinition(adapter: ProcessAdapter, inputKind: string) {
  const definition = processes.find((candidate) => candidate.adapter === adapter
    && candidate.input.item === `item:${inputKind}`);
  if (definition === undefined) throw new Error(`missing ${adapter}:${inputKind}`);
  return definition;
}

function topology(adapter: ProcessAdapter) {
  const process = processes.find((definition) => definition.adapter === adapter)!;
  const object = objects.find((definition) => (
    definition.components.processor?.processTag === process.stationTag
  ));
  const result = object === undefined ? null : processTopologyForObject(object);
  if (result === null) throw new Error(`missing topology for ${adapter}`);
  return result;
}

function settle(
  adapter: ProcessAdapter,
  state: Parameters<typeof settleProcess>[2],
  authorityTick: bigint,
  options: Omit<Parameters<typeof settleProcess>[4], 'topology'> = {},
) {
  return settleProcess(processes, adapter, state, authorityTick, {
    topology: topology(adapter), ...options,
  });
}

function processorEffects(
  tag: string,
  eventType: 'use' | 'slotChanged' | 'processComplete' | 'timer',
) {
  const target = {
    entityType: 'object' as const,
    id: '7',
    definitionId: 'object:processor',
    tags: [tag],
    tile,
    state: {},
  };
  const actor = { entityType: 'player' as const, id: 'player' };
  let event: LifecycleEvent;
  if (eventType === 'use') event = { type: 'use', actor, target };
  else if (eventType === 'slotChanged') event = {
    type: 'slotChanged', container: { id: '7', entityId: '7' }, slot: 0,
    before: null, after: null, actor,
  };
  else if (eventType === 'processComplete') {
    event = { type: 'processComplete', object: target, unitsSettled: 1 };
  } else event = { type: 'timer', object: target, timerId: 'processor' };
  const view = createReadOnlySnapshot({
    tick: 1000n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'b3', definitions: {} },
    space: { id: '0', kind: 'homestead', tags: [] },
    calendar: { minuteOfDay: 720, season: 'spring' },
    actor: {
      ...actor,
      tags: [],
      tile,
      bronze: 0n,
      vitals: { hunger: 5000, vigour: 5000 },
      inventory: [],
      worldRoles: ['player'],
      homesteadRoles: {},
      questStates: {},
      statistics: {},
      skillRanks: {},
    },
    target,
    nearbyObjects: [],
  });
  const result = raiseEvent(registerProcessorHandlers(objects), event, view);
  if ('blocked' in result) throw new Error(result.blocked);
  return result.effects;
}

describe('compiled processor behaviour handlers', () => {
  it('registers deterministically and idempotently', () => {
    const once = registerProcessorHandlers(objects, createHandlerRegistry());
    const twice = registerProcessorHandlers(objects, once);
    expect(twice.registrations.map(({ id }) => id)).toEqual(
      once.registrations.map(({ id }) => id),
    );
    expect(new Set(twice.registrations.map(({ id }) => id)).size)
      .toBe(processorHandlerRegistrations(objects).length);
  });

  it('registers lifecycle events for an arbitrary authored process tag', () => {
    const custom = {
      ...objects[0]!,
      id: 'object:renamed_processor',
      components: {
        ...objects[0]!.components,
        processor: {
          processTag: 'station.ember', slotRoles: { input: [3], output: [4] },
          ticksPerUnit: 7, catchUpCap: 9, autoStart: true,
        },
        container: { slotCount: 5, access: 'private', sortAllowed: false },
      },
    } as ObjectContentDefinition;
    expect(processorHandlerRegistrations([custom]).map(({ id }) => id)).toEqual([
      'processor.use.station.ember',
      'processor.slotChanged.station.ember',
      'processor.timer.station.ember',
    ]);
  });

  it('matches the §11 row 7 golden effect for all five processor definitions', () => {
    for (const tag of [
      'station.furnace',
      'station.campfire',
      'station.press',
      'station.cellar',
      'container.barrel',
    ]) {
      expect(processorEffects(tag, 'use')).toEqual([{ settleProcess: true }]);
      expect(processorEffects(tag, 'slotChanged')).toEqual([{ settleProcess: true }]);
      expect(processorEffects(tag, 'processComplete')).toEqual([]);
      expect(processorEffects(tag, 'timer')).toEqual([{ settleProcess: true }]);
    }
  });

  it('projects all five data-backed processor adapters with exact legacy recipe fields', () => {
    expect(new Set(processes.map(({ adapter }) => adapter))).toEqual(new Set([
      'smelting', 'campfire_cooking', 'press', 'fermentation', 'barrel',
    ]));
    expect(processDefinition('smelting', 'iron_ore')).toMatchObject({
      stationTag: 'station.furnace',
      outputs: [{ item: 'item:iron_bar', count: 1 }],
      fuelPolicy: { acceptedItems: ['item:coal', 'item:wood', 'item:plank'], unitsPerItem: 1 },
    });
    expect(processDefinition('campfire_cooking', 'raw_beef')).toMatchObject({
      stationTag: 'station.campfire',
      outputs: [{ item: 'item:cooked_beef', count: 1 }],
      experience: { skill: 'farming', amount: 7 },
    });
    expect(processDefinition('press', 'apple')).toMatchObject({
      stationTag: 'station.press',
      ticksPerUnit: Number(PRESS_CYCLE_TICKS),
      outputs: [{ item: 'item:must', count: 1 }, { item: 'item:pomace', count: 1 }],
    });
    expect(processDefinition('fermentation', 'must')).toMatchObject({
      stationTag: 'station.cellar',
      input: { item: 'item:must', count: 3 },
      ticksPerUnit: Number(FERMENTATION_CYCLE_TICKS),
      outputs: [{ item: 'item:bottles', count: 1 }],
    });
    expect(processDefinition('barrel', 'tomato')).toMatchObject({
      stationTag: 'container.barrel',
      ticksPerUnit: Number(BARREL_CURE_TICKS),
      outputs: [{ item: 'item:preserved_tomato', count: 1 }],
    });
  });
});

describe('generic process settlement parity', () => {
  it('matches furnace start, elapsed catch-up, fuel use, and output cap', () => {
    const initial = { slots: [
      { itemKind: 'iron_ore', quantity: 3 },
      { itemKind: 'wood', quantity: 3 },
      null,
    ], smeltStartTick: undefined };
    const genericStart = settle('smelting', {
      slots: initial.slots, startTick: initial.smeltStartTick,
    }, 100n);
    expect(genericStart).toEqual({
      slots: initial.slots,
      startTick: 100n,
      completed: 0,
      completedInputKind: null,
    });
    const tick = 100n + BigInt(processDefinition('smelting', 'iron_ore').ticksPerUnit) * 2n;
    const generic = settle('smelting', {
      slots: genericStart.slots, startTick: genericStart.startTick,
    }, tick);
    expect(generic).toEqual({
      slots: [
        { itemKind: 'iron_ore', quantity: 1 },
        { itemKind: 'wood', quantity: 1 },
        { itemKind: 'iron_bar', quantity: 2 },
      ],
      startTick: tick,
      completed: 2,
      completedInputKind: 'iron_ore',
    });
  });

  it('matches lit-gated cooking and keeps the completed input for XP attribution', () => {
    const definition = processDefinition('campfire_cooking', 'raw_beef');
    const initial = { slots: [{ itemKind: 'raw_beef', quantity: 2 }, null], cookStartTick: 5n, lit: true };
    const tick = 5n + BigInt(definition.ticksPerUnit) * 2n;
    const generic = settle('campfire_cooking', {
      slots: initial.slots, startTick: initial.cookStartTick, lit: initial.lit,
    }, tick);
    expect(generic).toEqual({
      slots: [null, { itemKind: 'cooked_beef', quantity: 2 }],
      startTick: undefined,
      completed: 2,
      completedInputKind: 'raw_beef',
    });
    expect(settle('campfire_cooking', {
      slots: initial.slots, startTick: initial.cookStartTick, lit: false,
    }, tick).startTick).toBeUndefined();
  });

  it('matches press and fermentation batches, including an upgraded fermentation duration', () => {
    const pressState = { slots: [{ itemKind: 'apple', quantity: 2 }, null, null], processStartTick: 10n };
    const pressTick = 10n + PRESS_CYCLE_TICKS * 2n;
    expect(settle('press', {
      slots: pressState.slots, startTick: pressState.processStartTick,
    }, pressTick)).toEqual({
      slots: [null, { itemKind: 'must', quantity: 2 }, { itemKind: 'pomace', quantity: 2 }],
      startTick: undefined,
      completed: 2,
      completedInputKind: 'apple',
    });

    const upgradedTicks = FERMENTATION_CYCLE_TICKS / 2n;
    const fermentationState = { slots: [{ itemKind: 'must', quantity: 6 }, null], processStartTick: 20n };
    const fermentationTick = 20n + upgradedTicks * 2n;
    expect(settle('fermentation', {
      slots: fermentationState.slots, startTick: fermentationState.processStartTick,
    }, fermentationTick, { ticksPerUnit: upgradedTicks })).toEqual({
      slots: [null, { itemKind: 'bottles', quantity: 2 }],
      startTick: undefined,
      completed: 2,
      completedInputKind: 'must',
    });
  });

  it('matches sealed barrel output, batch cap, and preserves immature state', () => {
    const slots = [{ itemKind: 'tomato', quantity: 8 }, ...Array.from({ length: 7 }, () => null)];
    const before = settle('barrel', { slots, startTick: 5n }, 5n + BARREL_CURE_TICKS - 1n);
    expect(before).toMatchObject({ slots, startTick: 5n, completed: 0 });
    const generic = settle(
      'barrel',
      { slots, startTick: 5n },
      5n + BARREL_CURE_TICKS,
      { ticksPerUnit: BARREL_CURE_TICKS, maximumBatch: BARREL_MAX_BATCH },
    );
    expect(generic).toEqual({
      slots: [
        { itemKind: 'preserved_tomato', quantity: 8 },
        ...Array.from({ length: 7 }, () => null),
      ],
      startTick: undefined,
      completed: 8,
      completedInputKind: 'tomato',
    });
  });

  it('honours authored output capacity and catch-up caps without partial writes', () => {
    const definition = processDefinition('press', 'apple');
    const state = {
      slots: [{ itemKind: 'apple', quantity: 10 }, null, null],
      startTick: 1n,
    };
    expect(settleProcess([definition], 'press', state, 1n + PRESS_CYCLE_TICKS * 10n, {
      topology: topology('press'),
      catchUpCap: 2,
      maxStackForItem: () => 99,
    })).toMatchObject({
      slots: [
        { itemKind: 'apple', quantity: 8 },
        { itemKind: 'must', quantity: 2 },
        { itemKind: 'pomace', quantity: 2 },
      ],
      startTick: 1n + PRESS_CYCLE_TICKS * 2n,
      completed: 2,
    });
    expect(settleProcess([definition], 'press', state, 1n + PRESS_CYCLE_TICKS, {
      topology: topology('press'),
      maxStackForItem: () => null,
    })).toMatchObject({ startTick: undefined, completed: 0, slots: state.slots });
  });
});
