import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from '../content/bootstrap-registry.js';
import type { ItemContentDefinition } from '../content/definitions.js';
import { parseObjectDefinition, type ObjectContentDefinition } from '../content/object-definition.js';
import { type LifecycleEvent } from './events.js';
import { MAX_EFFECTS_PER_HANDLER_RESULT } from './handler.js';
import { raiseEvent } from './raise.js';
import { createHandlerRegistry } from './registry.js';
import { createReadOnlySnapshot, type ReadOnlySnapshotInput } from './snapshot.js';
import {
  compileDataGraphInteraction,
  compileItemDataGraph,
  compileObjectDataGraph,
  registerObjectDataGraphs,
  resolveObjectLight,
  validateDataGraphInteraction,
} from './data-graph.js';

const tile = { spaceId: 'space:test', x: 11, y: 10, tags: ['grass'] } as const;

function snapshot(overrides: Partial<ReadOnlySnapshotInput> = {}) {
  return createReadOnlySnapshot({
    tick: 1000n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'data-graph', definitions: {} },
    space: { id: tile.spaceId, kind: 'homestead', tags: ['outdoors'] },
    calendar: { minuteOfDay: 720, season: 'spring' },
    actor: {
      entityType: 'player', id: 'player', tags: [], tile: { ...tile, x: 10 }, bronze: 100n,
      vitals: { hunger: 5000, vigour: 7500 }, inventory: [], worldRoles: ['player'],
      homesteadRoles: { home: 'owner' }, questStates: {}, statistics: {}, skillRanks: {},
    },
    nearbyObjects: [],
    ...overrides,
  });
}

function target(definitionId: string, state: Readonly<Record<string, boolean>>) {
  return { entityType: 'object' as const, id: 'object:7', definitionId, tags: [], tile, state };
}

function object(
  id: `object:${string}`,
  interactions: ObjectContentDefinition['components']['interactions'],
): ObjectContentDefinition {
  return parseObjectDefinition({
    id, kind: 'object', schemaVersion: 1, displayName: id,
    components: {
      states: { lit: { type: 'bool', default: false }, open: { type: 'bool', default: false } },
      interactions,
    },
  });
}

function effects(definition: ObjectContentDefinition, event: LifecycleEvent, view: ReturnType<typeof snapshot>) {
  const registry = registerObjectDataGraphs(createHandlerRegistry(), [definition], 1);
  const result = raiseEvent(registry, event, view);
  if ('blocked' in result) throw new Error(result.blocked);
  return result.effects;
}

function itemEffects(
  definition: ItemContentDefinition,
  hunger: number,
) {
  const kind = definition.id.slice('item:'.length);
  const registry = createHandlerRegistry(compileItemDataGraph(definition, 1));
  return raiseEvent(registry, {
    type: 'secondary', actor: { entityType: 'player', id: 'player' },
    selectedItem: { kind, containerId: 'hotbar', slot: 0 },
  }, snapshot({
    selectedItem: {
      kind, definitionId: definition.id, tags: definition.tags, count: 1,
      containerId: 'hotbar', slot: 0,
    },
    actor: { ...snapshot().actor!, vitals: { hunger, vigour: 7500 } },
  }));
}

describe('data graph behaviour compiler', () => {
  it('compiles empty-container pickup from the authored carry item without stable-id coupling', () => {
    const crate = parseObjectDefinition({
      id: 'object:moon_crate', kind: 'object', schemaVersion: 1, displayName: 'Moon Crate',
      components: {
        container: { slotCount: 4, access: 'private', sortAllowed: true },
        carry: { mode: 'preserve_entity_or_item_when_empty', item: 'item:lunar_crate' },
      },
    });
    const registry = createHandlerRegistry(compileObjectDataGraph(crate, 1));
    const event = {
      type: 'pickup', actor: { entityType: 'player', id: 'player' },
      tile,
      subject: { entityType: 'object', id: 'object:7', definitionId: crate.id },
    } as const;
    expect(raiseEvent(registry, event, snapshot({
      target: target(crate.id, { hasContents: false }),
    }))).toEqual({ effects: [{ pickupAsItem: 'item:lunar_crate' }] });
    expect(raiseEvent(registry, event, snapshot({
      target: target(crate.id, { hasContents: true }),
    }))).toEqual({ effects: [] });
  });

  it('compiles authored food and tea use with bounded capabilities, statistics, and full-hunger parity', () => {
    const content = bootstrapContentRegistry();
    const cookedBeef = content.items.get('item:cooked_beef')!;
    const apple = content.items.get('item:apple')!;
    const tea = content.items.get('item:orchard_tea')!;

    expect(itemEffects(cookedBeef, 5000)).toEqual({ effects: [
      { consumeSelected: 1 },
      { restoreHunger: 4000 },
      { statistic: { kind: 'food_eaten', subject: 'cooked_beef' } },
    ] });
    expect(itemEffects(cookedBeef, 10_000)).toEqual({ effects: [
      { fail: 'hunger_full' },
    ] });
    expect(itemEffects(apple, 10_000)).toEqual({ effects: [
      { consumeSelected: 1 },
      { restoreHunger: 700 },
      { statistic: { kind: 'food_eaten', subject: 'apple' } },
      { applyEffect: { effectId: 'fruitful_energy' } },
    ] });
    expect(itemEffects(tea, 10_000)).toEqual({ effects: [
      { applyEffect: { effectId: 'orchard_tea' } },
      { consumeSelected: 1 },
      { statistic: 'orchard_tea_consumed' },
    ] });
  });

  it('matches the oil-lamp golden effect list and continues when reach fails', () => {
    const lamp = object('object:oil_lamp', [{
      id: 'toggle', verb: 'use', conditions: [{ reach: 'object' }],
      effects: [{ toggleState: 'lit' }, { sfx: 'lantern_click' }, { statistic: 'lights_toggled' }],
    }]);
    const event = {
      type: 'use', actor: { entityType: 'player', id: 'player' },
      target: { entityType: 'object', id: 'object:7', definitionId: lamp.id },
    } as const;
    expect(effects(lamp, event, snapshot({ target: target(lamp.id, { lit: false }) }))).toEqual([
      { toggleState: 'lit' }, { sfx: 'lantern_click' }, { statistic: 'lights_toggled' },
    ]);
    expect(effects(lamp, event, snapshot({
      actor: { ...snapshot().actor!, tile: { ...tile, x: 30 } },
      target: target(lamp.id, { lit: false }),
    }))).toEqual([]);
  });

  it('matches §11 row 5 gate effects in both states with deterministic priority', () => {
    const gate = object('object:fence_gate', [
      { id: 'open', verb: 'use', priority: 10, conditions: [{ state: 'open', equals: false }], effects: [
        { toggleState: 'open' }, { setCollision: false },
      ] },
      { id: 'close', verb: 'use', priority: 9, conditions: [{ state: 'open', equals: true }], effects: [
        { toggleState: 'open' }, { setCollision: true },
      ] },
    ]);
    const event = {
      type: 'use', actor: { entityType: 'player', id: 'player' },
      target: { entityType: 'object', id: 'object:7', definitionId: gate.id },
    } as const;
    expect(effects(gate, event, snapshot({ target: target(gate.id, { open: false }) }))).toEqual([
      { toggleState: 'open' }, { setCollision: false },
    ]);
    expect(effects(gate, event, snapshot({ target: target(gate.id, { open: true }) }))).toEqual([
      { toggleState: 'open' }, { setCollision: true },
    ]);
  });

  it('matches §11 rows 8 and 10 light-toggle graphs and row 15 emitter resolution', () => {
    const lightObject = object('object:campfire', [
      { id: 'light', verb: 'secondary', priority: 10, conditions: [{ state: 'lit', equals: false }], effects: [
        { toggleState: 'lit' }, { setLight: { enabled: true } },
      ] },
      { id: 'put_out', verb: 'secondary', priority: 9, conditions: [{ state: 'lit', equals: true }], effects: [
        { toggleState: 'lit' }, { setLight: { enabled: false } },
      ] },
    ]);
    const event = {
      type: 'secondary', actor: { entityType: 'player', id: 'player' }, selectedItem: { kind: 'hands' },
      target: { entityType: 'object', id: 'object:7', definitionId: lightObject.id },
    } as const;
    expect(effects(lightObject, event, snapshot({ target: target(lightObject.id, { lit: false }) }))).toEqual([
      { toggleState: 'lit' }, { setLight: { enabled: true } },
    ]);
    const component = {
      when: { state: 'lit', equals: true }, color: [255, 196, 120], radiusTiles: 4, profile: 'steady', offsetY: -6,
    } as const;
    expect(resolveObjectLight(component, { lit: true })).toEqual({
      enabled: true, color: [255, 196, 120], radiusTiles: 4, profile: 'steady', offsetY: -6,
    });
    expect(resolveObjectLight(component, { lit: false }).enabled).toBe(false);
  });

  it('evaluates selected-item conditions before emitting ordered effects', () => {
    const anvil = object('object:anvil', [{
      id: 'repair_charge', verb: 'use_with', with: { tag: 'item.tool', durabilityAtMost: 9 },
      conditions: [{ reach: 'object' }], effects: [{ chargeBronze: 5 }, { sfx: 'anvil_repair' }],
    }]);
    const event = {
      type: 'useWith', actor: { entityType: 'player', id: 'player' }, selectedItem: { kind: 'axe' },
      target: { entityType: 'object', id: 'object:7', definitionId: anvil.id },
    } as const;
    expect(effects(anvil, event, snapshot({
      selectedItem: { kind: 'axe', tags: ['item.tool'], count: 1, durability: 4, maxDurability: 10 },
      target: target(anvil.id, { lit: false }),
    }))).toEqual([{ chargeBronze: 5 }, { sfx: 'anvil_repair' }]);
  });

  it('rejects unsupported engines, cooldowns, and oversized instruction sets', () => {
    const interaction = {
      id: 'bounded', verb: 'use', conditions: [], effects: [{ sfx: 'click' }],
    } as const;
    expect(() => compileDataGraphInteraction('object:test', interaction, 0)).toThrow('unsupported_effect');
    expect(validateDataGraphInteraction({ ...interaction, cooldownTicks: 2 }, 1)).toEqual([
      expect.objectContaining({ code: 'cooldown_state_unavailable' }),
    ]);
    expect(validateDataGraphInteraction({
      ...interaction,
      effects: Array.from({ length: MAX_EFFECTS_PER_HANDLER_RESULT + 1 }, () => ({ sfx: 'click' })),
    }, 1).map(({ code }) => code)).toContain('effect_cap_exceeded');
  });
});
