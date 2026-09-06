import { describe, expect, it } from 'vitest';
import { MAX_EFFECTS_PER_HANDLER_RESULT } from '../behaviour/handler.js';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import { parseDataGraphEffect, parseObjectDefinition } from './object-definition.js';
import type { ItemContentDefinition, SupportedContentDefinition } from './definitions.js';

function oilLamp() {
  return {
    id: 'object:oil_lamp', kind: 'object', schemaVersion: 1, displayName: 'Oil Lamp',
    components: {
      identity: { tags: ['emits.light', 'decoration'] },
      sprite: {
        asset: 'prop_cf_oil_lamp', animationByState: { lit: 'burn', default: 'off' }, scale: 1,
      },
      collision: { footprint: [[15]], blocksMovement: true, occludesLight: false },
      placement: { item: 'item:oil_lamp', layer: 'object', spaces: ['homestead', 'interior'], facing: false },
      states: { lit: { type: 'bool', default: false } },
      light: {
        when: { state: 'lit', equals: true }, color: [255, 196, 120],
        radiusTiles: 4, profile: 'steady', offsetY: -6,
      },
      interactions: [{
        id: 'toggle', verb: 'use', prompt: { lit: 'PUT OUT', default: 'LIGHT' }, priority: 10,
        conditions: [{ reach: 'object' }],
        effects: [{ toggleState: 'lit' }, { sfx: 'lantern_click' }, { statistic: 'lights_toggled' }],
      }],
      frame: { ref: 'frame:oil_lamp' },
    },
  } as const;
}

function oilLampItem(): ItemContentDefinition {
  return {
    id: 'item:oil_lamp', kind: 'item', schemaVersion: 1, displayName: 'Oil Lamp',
    icon: { asset: 'prop_cf_oil_lamp' }, quality: 'common', maxStack: 1,
    tags: ['item.placeable', 'emits.light'], economy: { buy: 700, sell: 280 },
    onUse: [],
  };
}

function registryWith(...definitions: readonly SupportedContentDefinition[]) {
  const oilLampFrame = {
    id: 'frame:oil_lamp', kind: 'frame', schemaVersion: 1, title: 'OIL LAMP',
    style: 'wood_parchment', presentation: { surface: 'entity', entityContainer: 'placeable' }, resizable: false, panes: [{
      id: 'backpack', kind: 'slots', columns: 1, rows: 1, bind: { self: 'backpack' },
    }],
  } as const;
  return buildContentRegistry([...bootstrapContentDefinitions(), oilLampFrame, ...definitions].map((definition) => ({
    id: definition.id, kind: definition.kind, json: definition,
  })));
}

describe('object content definition', () => {
  it('parses the versioned oil-lamp components and graph without losing data', () => {
    const parsed = parseObjectDefinition(JSON.stringify(oilLamp()));
    expect(parsed).toEqual(oilLamp());
    expect(parsed.components.collision?.footprint).toEqual([[15]]);
    expect(parsed.components.interactions?.[0]).toMatchObject({
      id: 'toggle', verb: 'use', conditions: [{ reach: 'object' }],
    });
  });

  it('registers object definitions in the shared deterministic registry', () => {
    const parsed = parseObjectDefinition(oilLamp());
    const first = registryWith(oilLampItem(), parsed);
    const second = registryWith(parsed, oilLampItem());
    expect(first.report.valid).toBe(true);
    expect(first.registry.objects.get(parsed.id)).toEqual(parsed);
    expect(second.registry.contentHash).toBe(first.registry.contentHash);
  });

  it('rejects incoherent states, processors, placement, and ambiguous graphs', () => {
    const invalid = parseObjectDefinition({
      ...oilLamp(),
      components: {
        ...oilLamp().components,
        placement: { ...oilLamp().components.placement, item: 'item:lantern' },
        light: { ...oilLamp().components.light, when: { state: 'missing', equals: true } },
        container: { slotCount: 1, access: 'public', sortAllowed: true },
        processor: {
          processTag: 'station.missing', slotRoles: { input: [1] },
          ticksPerUnit: 10, catchUpCap: 20, autoStart: true,
        },
        interactions: [
          oilLamp().components.interactions[0],
          { ...oilLamp().components.interactions[0], id: 'other' },
        ],
      },
    });
    const report = registryWith(invalid).report;
    expect(report.valid).toBe(false);
    expect(report.errors.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'invalid_component_set', 'ambiguous_interaction', 'unresolved_reference',
    ]));
    expect(report.errors.map(({ message }) => message)).toEqual(expect.arrayContaining([
      expect.stringContaining('item.placeable'),
      expect.stringContaining('compatible declared state'),
      expect.stringContaining('outside the container'),
    ]));
  });

  it('enforces the shared effect and instruction bounds before compilation', () => {
    const oversized = parseObjectDefinition({
      ...oilLamp(),
      components: {
        ...oilLamp().components,
        interactions: [{
          ...oilLamp().components.interactions[0],
          effects: Array.from({ length: MAX_EFFECTS_PER_HANDLER_RESULT + 1 }, (_, index) => ({ sfx: `sfx_${index}` })),
        }],
      },
    });
    const report = registryWith(oilLampItem(), oversized).report;
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_component_set', path: expect.stringContaining('effects') }),
    ]));
  });

  it('fails closed on malformed component and opcode payloads', () => {
    expect(() => parseObjectDefinition({
      ...oilLamp(), components: { ...oilLamp().components, collision: { footprint: [[16]], blocksMovement: true } },
    })).toThrow(/footprint/);
    expect(() => parseObjectDefinition({
      ...oilLamp(), components: { ...oilLamp().components, interactions: [{
        ...oilLamp().components.interactions[0], conditions: [{ mystery: true }],
      }] },
    })).toThrow(/supported opcode/);
    expect(() => parseObjectDefinition({ ...oilLamp(), schemaVersion: 2 })).toThrow(/schema version/);
  });

  it('requires a declared compatible state for conditional collision', () => {
    for (const when of [{ state: 'missing', equals: false }, { state: 'lit', equals: 'false' }]) {
      const object = parseObjectDefinition({ ...oilLamp(), components: {
        ...oilLamp().components, collision: { ...oilLamp().components.collision, when },
      } });
      expect(registryWith(oilLampItem(), object).report.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining('components.collision.when') }),
      ]));
    }
    const object = parseObjectDefinition({ ...oilLamp(), components: {
      ...oilLamp().components, collision: { ...oilLamp().components.collision, when: { state: 'lit', equals: false } },
    } });
    expect(registryWith(oilLampItem(), object).report.valid).toBe(true);
  });

  it('parses the generic melee authority request and rejects malformed weapons', () => {
    expect(parseDataGraphEffect({ meleeAttack: { weapon: 'sword' } }))
      .toEqual({ meleeAttack: { weapon: 'sword' } });
    expect(() => parseDataGraphEffect({ meleeAttack: { weapon: 'Iron Sword' } }))
      .toThrow(/invalid stable name/);
  });

  it('parses bounded phased bow actions and rejects unbounded aim input', () => {
    expect(parseDataGraphEffect({ bowAction: { phase: 'begin' } }))
      .toEqual({ bowAction: { phase: 'begin' } });
    expect(parseDataGraphEffect({ bowAction: { phase: 'cancel', chargeMs: 750 } }))
      .toEqual({ bowAction: { phase: 'cancel', chargeMs: 750 } });
    expect(parseDataGraphEffect({ bowAction: {
      phase: 'fire', aimX: 20, aimY: -10, chargeMs: 1_500,
    } })).toEqual({ bowAction: { phase: 'fire', aimX: 20, aimY: -10, chargeMs: 1_500 } });
    expect(() => parseDataGraphEffect({ bowAction: {
      phase: 'fire', aimX: 32_768, aimY: 0, chargeMs: 1,
    } })).toThrow(/aimX/);
  });
});
