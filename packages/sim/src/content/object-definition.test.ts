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
  const lightsToggledStatistic = {
    id: 'statistic:lights_toggled', kind: 'statistic', schemaVersion: 1,
    name: 'Lights Toggled', description: 'Authored lamp toggles.', category: 'world',
    unit: 'count', aggregation: 'counter', subject: 'none', milestones: ['1'],
  } as const;
  return buildContentRegistry([
    ...bootstrapContentDefinitions(), oilLampFrame, lightsToggledStatistic, ...definitions,
  ].map((definition) => ({
    id: definition.id, kind: definition.kind, json: definition,
  })));
}

describe('object content definition', () => {
  it('supports bounded read-only interaction presentation without inventing an effect', () => {
    const memorial = parseObjectDefinition({
      id: 'object:test_memorial', kind: 'object', schemaVersion: 1, displayName: 'Test Memorial',
      components: { sprite: { asset: 'prop_test_memorial' }, interactions: [{
        id: 'read', verb: 'use', prompt: 'READ', feedback: 'REMEMBERED', reachTiles: 2.5,
        conditions: [], effects: [],
      }] },
    });
    expect(memorial.components.interactions?.[0]).toMatchObject({
      feedback: 'REMEMBERED', reachTiles: 2.5,
    });
    expect(registryWith(memorial).report.valid).toBe(true);
    expect(registryWith({
      ...memorial,
      components: { ...memorial.components, interactions: [{
        id: 'read', verb: 'use' as const, conditions: [], effects: [],
      }] },
    }).report.valid).toBe(false);
    expect(() => parseObjectDefinition({ ...memorial, components: {
      ...memorial.components, interactions: [{
        id: 'read', verb: 'use', feedback: 'TOO FAR', reachTiles: 8.1,
        conditions: [], effects: [],
      }],
    } })).toThrow(/reach exceeds/u);
  });

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

  it('parses bounded hunger restoration and selected-item repair effects', () => {
    expect(parseDataGraphEffect({ restoreHunger: 700 })).toEqual({ restoreHunger: 700 });
    expect(parseDataGraphEffect({ repairSelected: true })).toEqual({ repairSelected: true });
    expect(parseDataGraphEffect({ statistic: {
      kind: 'moonlit_uses', subject: 'apple', delta: 2,
    } })).toEqual({ statistic: { kind: 'moonlit_uses', subject: 'apple', delta: 2 } });
    expect(() => parseDataGraphEffect({ restoreHunger: 0 })).toThrow('restoreHunger');
    expect(() => parseDataGraphEffect({ repairSelected: false })).toThrow('expected true');
    expect(() => parseDataGraphEffect({ statistic: { kind: 'moonlit_uses', delta: -1 } }))
      .toThrow('statistic.delta');
  });

  it('parses and bounds processor completion reward projections', () => {
    const definitions = bootstrapContentDefinitions();
    const press = definitions.find((definition): definition is Extract<SupportedContentDefinition, {
      readonly kind: 'object';
    }> => definition.kind === 'object' && definition.id === 'object:fruit_press')!;
    expect(press.components.processor?.completionRewards).toMatchObject({
      statistics: [
        { statistic: 'statistic:fruit_pressed', quantity: 'input', subject: 'input' },
        { statistic: 'statistic:press_cycles_completed', quantity: 'units' },
        { statistic: 'statistic:items_obtained', quantity: 'output', subject: 'output' },
      ],
    });
    const processor = press.components.processor!;
    expect(() => parseObjectDefinition({
      ...press,
      components: {
        ...press.components,
        processor: {
          ...processor,
          completionRewards: {
            statistics: [{ statistic: 'statistic:fruit_pressed', quantity: 'arbitrary_code' }],
          },
        },
      },
    })).toThrow('quantity');
    expect(() => parseObjectDefinition({
      ...press,
      components: {
        ...press.components,
        processor: {
          ...processor,
          completionRewards: {
            experience: { skill: 'farming', amount: 0 }, statistics: [],
          },
        },
      },
    })).toThrow('experience.amount');
  });

  it('rejects unresolved, retired, reserved, and ambiguous processor rewards', () => {
    const definitions = bootstrapContentDefinitions();
    const press = definitions.find((definition): definition is Extract<SupportedContentDefinition, {
      readonly kind: 'object';
    }> => definition.kind === 'object' && definition.id === 'object:fruit_press')!;
    const fruitPressed = definitions.find((definition): definition is Extract<SupportedContentDefinition, {
      readonly kind: 'statistic';
    }> => definition.kind === 'statistic' && definition.id === 'statistic:fruit_pressed')!;
    const replacement = definitions.find((definition): definition is Extract<SupportedContentDefinition, {
      readonly kind: 'statistic';
    }> => definition.kind === 'statistic' && definition.id === 'statistic:items_obtained')!;
    const buildWith = (
      object: typeof press,
      statistic: typeof fruitPressed | null = fruitPressed,
    ) => buildContentRegistry([
      ...definitions.filter(({ id }) => id !== press.id && id !== fruitPressed.id),
      object,
      ...(statistic === null ? [] : [statistic]),
    ].map((definition) => ({ id: definition.id, kind: definition.kind, json: definition })));
    const withReward = (statistic: `statistic:${string}`, quantity: 'units' | 'output', subject?: 'output') => ({
      ...press,
      components: {
        ...press.components,
        processor: {
          ...press.components.processor!,
          completionRewards: {
            experience: { skill: 'missing_track', amount: 1 },
            statistics: [{ statistic, quantity, ...(subject === undefined ? {} : { subject }) }],
          },
        },
      },
    });

    expect(buildWith(withReward('statistic:missing', 'units'), null).report.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unresolved_reference' })]),
    );
    expect(buildWith(
      withReward(fruitPressed.id, 'units'),
      { ...fruitPressed, retired: true, replacement: replacement.id },
    ).report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'retired_reference' }),
    ]));
    expect(buildWith(withReward('statistic:damage_taken', 'units')).report.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: 'invalid_component_set',
        message: expect.stringContaining('writable counter'),
      })]),
    );
    expect(buildWith(withReward('statistic:items_obtained', 'units', 'output')).report.errors)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        code: 'invalid_component_set',
        message: expect.stringContaining('ambiguous'),
      })]));
    expect(buildWith(withReward(fruitPressed.id, 'units')).report.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({
        code: 'unresolved_reference', path: expect.stringContaining('experience.skill'),
      })]),
    );
  });

  it('resolves arbitrary active effects and coherent authored statistics', () => {
    const definitions = bootstrapContentDefinitions();
    const effect = definitions.find((definition): definition is Extract<SupportedContentDefinition, {
      readonly kind: 'effect';
    }> => definition.kind === 'effect')!;
    const statistic = definitions.find((definition): definition is Extract<SupportedContentDefinition, {
      readonly kind: 'statistic';
    }> => definition.kind === 'statistic'
      && definition.subject === 'none' && definition.reserved !== true)!;
    const moonlitEffect = { ...effect, id: 'effect:moonlit_focus' as const, name: 'Moonlit Focus' };
    const moonlitStatistic = {
      ...statistic, id: 'statistic:moonlit_uses' as const, name: 'Moonlit Uses',
    };
    const itemUsesStatistic = {
      ...statistic, id: 'statistic:moonlit_item_uses' as const, name: 'Moonlit Item Uses',
      subject: 'item_kind' as const,
    };
    const item = {
      ...oilLampItem(),
      onUse: [{
        id: 'invoke', verb: 'secondary' as const, conditions: [],
        effects: [
          { applyEffect: { effectId: 'moonlit_focus' } },
          { statistic: { kind: 'moonlit_item_uses', subject: 'oil_lamp', delta: 2 } },
        ],
      }],
    };
    const object = parseObjectDefinition({
      ...oilLamp(),
      components: {
        ...oilLamp().components,
        interactions: [{
          ...oilLamp().components.interactions[0],
          effects: [
            { applyEffect: { effectId: 'moonlit_focus' } },
            { statistic: 'moonlit_uses' },
          ],
        }],
      },
    });
    const report = registryWith(
      item, moonlitEffect, moonlitStatistic, itemUsesStatistic, object,
    ).report;
    expect(report.errors).toEqual([]);
  });

  it('rejects authored stacks above the target effect maximum', () => {
    const definitions = bootstrapContentDefinitions();
    const effect = definitions.find((definition): definition is Extract<SupportedContentDefinition, {
      readonly kind: 'effect';
    }> => definition.kind === 'effect')!;
    const moonlitEffect = {
      ...effect, id: 'effect:moonlit_focus' as const, name: 'Moonlit Focus', maxStacks: 2,
    };
    const item = {
      ...oilLampItem(),
      onUse: [{
        id: 'invoke', verb: 'secondary' as const, conditions: [],
        effects: [{ applyEffect: { effectId: 'moonlit_focus', stacks: 3 } }],
      }],
    };
    expect(registryWith(item, moonlitEffect).report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid_component_set', path: 'onUse[0].effects[0].applyEffect.stacks',
        message: expect.stringContaining('maximum of 2'),
      }),
    ]));
  });

  it('rejects missing or retired effects and invalid authored statistic writes', () => {
    const definitions = bootstrapContentDefinitions();
    const effect = definitions.find((definition): definition is Extract<SupportedContentDefinition, {
      readonly kind: 'effect';
    }> => definition.kind === 'effect')!;
    const statistic = definitions.find((definition): definition is Extract<SupportedContentDefinition, {
      readonly kind: 'statistic';
    }> => definition.kind === 'statistic'
      && definition.subject === 'none' && definition.reserved !== true)!;
    const retiredEffect = {
      ...effect, id: 'effect:retired_focus' as const, retired: true,
      replacement: effect.id,
    };
    const retiredStatistic = {
      ...statistic, id: 'statistic:retired_uses' as const, retired: true,
      replacement: statistic.id,
    };
    const reservedStatistic = {
      ...statistic, id: 'statistic:reserved_uses' as const, reserved: true,
    };
    const itemStatistic = {
      ...statistic, id: 'statistic:item_uses' as const, subject: 'item_kind' as const,
    };
    const object = parseObjectDefinition({
      ...oilLamp(),
      components: {
        ...oilLamp().components,
        interactions: [{
          ...oilLamp().components.interactions[0],
          effects: [
            { applyEffect: { effectId: 'missing_focus' } },
            { applyEffect: { effectId: 'retired_focus' } },
            { statistic: 'missing_uses' },
            { statistic: 'retired_uses' },
            { statistic: 'reserved_uses' },
            { statistic: 'item_uses' },
          ],
        }],
      },
    });
    const errors = registryWith(
      oilLampItem(), retiredEffect, retiredStatistic, reservedStatistic, itemStatistic, object,
    ).report.errors;
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unresolved_reference', message: expect.stringContaining('effect:missing_focus') }),
      expect.objectContaining({ code: 'retired_reference', message: expect.stringContaining('effect:retired_focus') }),
      expect.objectContaining({ code: 'unresolved_reference', message: expect.stringContaining('statistic:missing_uses') }),
      expect.objectContaining({ code: 'retired_reference', message: expect.stringContaining('statistic:retired_uses') }),
      expect.objectContaining({ code: 'invalid_component_set', message: expect.stringContaining('reserved statistic') }),
      expect.objectContaining({ code: 'invalid_component_set', message: expect.stringContaining('subject does not match item_kind') }),
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

  it('parses bounded hit, health, and carry capabilities', () => {
    const chest = parseObjectDefinition({
      ...oilLamp(),
      components: {
        ...oilLamp().components,
        container: { slotCount: 2, access: 'private', sortAllowed: true },
        damageable: {
          model: 'hits', maximumHits: 3, toolSpecialization: 'woodcutting',
          salvageRecipe: 'recipe:chest',
        },
        carry: { mode: 'preserve_entity_or_item_when_empty', item: 'item:chest' },
      },
    });
    expect(chest.components.damageable).toEqual({
      model: 'hits', maximumHits: 3, toolSpecialization: 'woodcutting',
      salvageRecipe: 'recipe:chest',
    });
    expect(chest.components.carry).toEqual({
      mode: 'preserve_entity_or_item_when_empty', item: 'item:chest',
    });

    const target = parseObjectDefinition({
      ...oilLamp(),
      components: {
        ...oilLamp().components,
        damageable: {
          model: 'health', maximumHealthCenti: 10_000, minimumHealthCenti: 1,
          regeneration: { amountCenti: 100, everyTicks: 20 },
        },
        carry: { mode: 'preserve_entity' },
      },
    });
    expect(target.components.damageable).toMatchObject({
      model: 'health', maximumHealthCenti: 10_000, minimumHealthCenti: 1,
      regeneration: { amountCenti: 100, everyTicks: 20 },
    });
  });

  it('rejects malformed object capability unions and unresolved references', () => {
    for (const damageable of [
      { model: 'hits', maximumHits: 0, toolSpecialization: 'woodcutting' },
      { model: 'hits', maximumHits: 3, toolSpecialization: 'combat' },
      { model: 'health', maximumHealthCenti: 100, minimumHealthCenti: 101 },
      { model: 'health', maximumHealthCenti: 100, minimumHealthCenti: 1,
        regeneration: { amountCenti: 0, everyTicks: 20 } },
    ]) {
      expect(() => parseObjectDefinition({
        ...oilLamp(), components: { ...oilLamp().components, damageable },
      })).toThrow();
    }
    expect(() => parseObjectDefinition({
      ...oilLamp(), components: { ...oilLamp().components,
        carry: { mode: 'preserve_entity', item: 'item:chest' } },
    })).toThrow(/unsupported carry field/);

    const unresolved = parseObjectDefinition({
      ...oilLamp(), components: { ...oilLamp().components,
        damageable: {
          model: 'hits', maximumHits: 3, toolSpecialization: 'woodcutting',
          salvageRecipe: 'recipe:missing', onBreakLoot: 'loot:missing',
        } },
    });
    expect(registryWith(oilLampItem(), unresolved).report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unresolved_reference', path: 'components.damageable.salvageRecipe' }),
      expect.objectContaining({ code: 'unresolved_reference', path: 'components.damageable.onBreakLoot' }),
    ]));
  });

  it('requires an item-when-empty carry capability to own container storage', () => {
    const invalid = parseObjectDefinition({
      ...oilLamp(), components: { ...oilLamp().components,
        carry: { mode: 'preserve_entity_or_item_when_empty', item: 'item:chest' } },
    });
    expect(registryWith(oilLampItem(), invalid).report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid_component_set', path: 'components.carry',
        message: expect.stringContaining('container'),
      }),
    ]));
  });
});

it('accepts bounded authored light intensity and preserves the legacy default',()=>{
 const base=oilLamp();
 expect(parseObjectDefinition(base).components.light?.intensityPerMille).toBeUndefined();
 const withIntensity=(intensityPerMille:number)=>({...base,components:{...base.components,light:{...base.components.light,intensityPerMille}}});
 expect(parseObjectDefinition(withIntensity(3500)).components.light?.intensityPerMille).toBe(3500);
 for(const invalid of [-1,4001,1.5])expect(()=>parseObjectDefinition(withIntensity(invalid))).toThrow();
});
