/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate untyped JSON fixture copies to probe the parser. */
import { describe, expect, it } from 'vitest';
import appleTreeJson from './fixtures/object-archetype-apple-tree.json' with { type: 'json' };
import { AUTHORITY_TICKS_PER_DAY } from '../time.js';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';
import {
  contentDefinitionTransportValue,
  parseContentDefinition,
  serializeContentDefinitionForTransport,
  type SupportedContentDefinition,
} from './definitions.js';
import {
  applyObjectTransitionEvent,
  createObjectLifecycleState,
  objectArchetypeIssues,
  objectGrowthModifiers,
  objectGrowthProfile,
  resolveObjectDefinitionAppearance,
  settleObjectTransitions,
  type ObjectLifecycleState,
} from './object-archetype.js';
import { parseObjectDefinition, type ObjectContentDefinition } from './object-definition.js';
import { buildContentRegistry } from './registry.js';
import { ContentParseError } from './parse-contract.js';
import { growthStageIndexForProgress } from '../growth.js';

const HOUR = BigInt(AUTHORITY_TICKS_PER_DAY / 24);

function appleTree(): ObjectContentDefinition {
  return parseObjectDefinition(appleTreeJson);
}

function mutated(change: (json: any) => void): unknown {
  const json = structuredClone(appleTreeJson) as any;
  change(json);
  return json;
}

function registryWith(...definitions: readonly SupportedContentDefinition[]) {
  return buildContentRegistry([...bootstrapContentDefinitions(), ...definitions]
    .map((definition) => ({ id: definition.id, kind: definition.kind, json: definition })));
}

function issueMessages(definition: ObjectContentDefinition): readonly string[] {
  return objectArchetypeIssues(definition).map(({ message }) => message);
}

describe('object archetype schema', () => {
  it('parses the data-only apple tree proof and passes registry validation', () => {
    const tree = appleTree();
    expect(tree.components.overrides).toHaveLength(4);
    expect(tree.components.transitions?.map(({ id }) => id)).toEqual([
      'sapling_grows', 'young_matures', 'blossoms', 'picked', 'felled', 'stump_drops_fruit', 'stump_resprouts',
    ]);
    expect(tree.components.growth).toMatchObject({ maxProgress: 24, sweepTicks: 750, stageThresholds: [0, 6, 15] });
    expect(objectArchetypeIssues(tree)).toEqual([]);
    const built = registryWith(tree);
    expect(built.report.errors).toEqual([]);
    expect(built.report.valid).toBe(true);
    expect(built.registry.objects.get('object:apple_tree')).toBeDefined();
  });

  it('round-trips through the transport serializer and generic content parser', () => {
    const tree = appleTree();
    const wire = serializeContentDefinitionForTransport(tree);
    const reparsed = parseContentDefinition('object', JSON.parse(wire));
    expect(reparsed).toEqual(tree);
    expect(JSON.stringify(contentDefinitionTransportValue(reparsed))).toBe(wire);
    expect(parseObjectDefinition(wire)).toEqual(tree);
  });

  it('keeps existing definitions byte-identical (additive schema)', () => {
    for (const definition of bootstrapContentDefinitions().filter((entry) => entry.kind === 'object')) {
      const object = definition as ObjectContentDefinition;
      expect(object.components.overrides).toBeUndefined();
      expect(parseObjectDefinition(JSON.parse(serializeContentDefinitionForTransport(object)))).toEqual(object);
    }
  });

  it.each([
    ['unknown override field', (json: any) => { json.components.overrides[0].tint = 'red'; }, 'overrides[0].tint'],
    ['empty override', (json: any) => { json.components.overrides[0] = { when: { growth: 'young' } }; }, 'overrides[0]'],
    ['empty when', (json: any) => { json.components.overrides[0].when = {}; }, 'overrides[0].when'],
    ['bad shadow mode', (json: any) => { json.components.lighting.castsShadow = 'soft'; }, 'lighting.castsShadow'],
    ['missing receivesGlobal', (json: any) => { delete json.components.lighting.receivesGlobal; }, 'lighting.receivesGlobal'],
    ['inverted target', (json: any) => { json.components.target.rect.left = 9; }, 'target.rect'],
    ['after and on', (json: any) => { json.components.transitions[0].on = 'use'; }, 'transitions[0]'],
    ['two timers', (json: any) => { json.components.transitions[0].after.ticks = 5; }, 'transitions[0].after'],
    ['unknown event', (json: any) => { json.components.transitions[3].on = 'tick'; }, 'transitions[3].on'],
    ['zero duration', (json: any) => { json.components.transitions[2].after = { ticks: 0 }; }, 'transitions[2].after.ticks'],
    ['unknown growth field', (json: any) => { json.components.growth.speed = 2; }, 'growth.speed'],
    ['unknown season', (json: any) => { json.components.growth.modifiers.seasonBps.monsoon = 1; }, 'seasonBps.monsoon'],
    ['empty transitions', (json: any) => { json.components.transitions = []; }, 'transitions'],
  ])('rejects %s at parse time', (_label, change, path) => {
    let error: unknown;
    try { parseObjectDefinition(mutated(change)); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ContentParseError);
    expect((error as ContentParseError).path).toContain(path);
  });

  it('reports cross-reference errors through the registry validator', () => {
    const broken = parseObjectDefinition(mutated((json) => {
      json.components.overrides[1].when = { growth: 'ancient' };
      json.components.overrides[2].interactions = { shake: false };
      json.components.transitions[0].to = { size: 'big' };
      json.components.transitions[1].run = { graph: 'missing' };
      json.components.transitions[1].after = { growthProgress: 99 };
      json.components.transitions[4].id = 'picked';
      json.components.transitions.push({ id: 'noop', from: { growth: 'young' }, to: { growth: 'young' }, after: { ticks: 5 } });
      json.components.transitions.push({ id: 'exit_redirect', on: 'stateExit', from: { growth: 'stump' }, to: { growth: 'young' } });
      json.components.transitions.push({ id: 'hook_on_use', on: 'use', from: { growth: 'stump' } });
      json.components.growth.stageThresholds = [0, 15, 6];
      json.components.growth.pausedWhen = [{ fruiting: 'maybe' }];
    }));
    expect(issueMessages(broken)).toEqual(expect.arrayContaining([
      'state growth does not accept ancient',
      'unknown interaction shake',
      'unknown state size',
      'transition runs unknown graph missing',
      'growth-timed transition exceeds maxProgress',
      'duplicate transition picked',
      'transition does not change state',
      'stateExit hooks cannot change state',
      'only stateEnter/stateExit hooks may omit to',
      'stage thresholds must ascend strictly within maxProgress',
      'state fruiting does not accept maybe',
    ]));
    const built = registryWith(broken);
    expect(built.report.valid).toBe(false);
    expect(built.report.errors.every(({ code }) => code === 'invalid_component_set')).toBe(true);

    const withoutGrowth = parseObjectDefinition(mutated((json) => { delete json.components.growth; }));
    expect(issueMessages(withoutGrowth)).toEqual(expect.arrayContaining([
      'growth-timed transition requires a growth component',
      'resetGrowth requires a growth component',
    ]));
  });
});

describe('resolveObjectDefinitionAppearance', () => {
  it('applies base components then matching overrides in declaration order', () => {
    const tree = appleTree();
    const sapling = resolveObjectDefinitionAppearance(tree);
    expect(sapling).toMatchObject({
      sprite: { asset: 'tree_apple_sapling', animation: 'base', scale: 1 },
      collision: { footprint: [[15]], blocksMovement: false },
      lighting: { receivesGlobal: true, castsShadow: 'silhouette', occludesLight: false },
      interactions: [],
      target: { left: -2, right: 2, top: -6, bottom: -1 },
      appliedOverrides: [0],
    });

    const mature = resolveObjectDefinitionAppearance(tree, { growth: 'mature' });
    expect(mature.sprite?.asset).toBe('tree_apple_mature');
    expect(mature.collision?.blocksMovement).toBe(true);
    expect(mature.lighting.castsShadow).toBe('column');
    expect(mature.interactions).toEqual(['pick', 'fell']);
    expect(mature.target).toEqual({ left: -4, right: 3, top: -10, bottom: -5 });
    expect(mature.appliedOverrides).toEqual([]);

    const fruiting = resolveObjectDefinitionAppearance(tree, { growth: 'mature', fruiting: true });
    expect(fruiting.sprite?.asset).toBe('tree_apple_fruiting');
    expect(fruiting.appliedOverrides).toEqual([2]);

    const stump = resolveObjectDefinitionAppearance(tree, { growth: 'stump', fruiting: true });
    expect(stump.sprite?.asset).toBe('tree_cf_fruit_stump');
    expect(stump.lighting.castsShadow).toBe('none');
    expect(stump.interactions).toEqual([]);
  });

  it('lets later overrides win field by field and switches light emission', () => {
    const lamp = parseObjectDefinition({
      id: 'object:test_lamp', kind: 'object', schemaVersion: 1, displayName: 'Lamp',
      components: {
        sprite: { asset: 'prop_test_lamp', animationByState: { lit: 'burn', default: 'off' } },
        states: { lit: { type: 'bool', default: false }, fuel: { type: 'enum', default: 'oil', values: ['oil', 'gas'] } },
        light: { when: { state: 'lit', equals: true }, color: [255, 200, 120], radiusTiles: 4, profile: 'flicker' },
        overrides: [
          { when: { fuel: 'gas' }, light: { color: [180, 220, 255], radiusTiles: 6, profile: 'steady' }, sprite: { scale: 2 } },
          { when: { lit: false }, light: false, lighting: { receivesGlobal: false } },
          { when: { fuel: 'gas' }, sprite: { animation: 'gas_off' } },
        ],
      },
    });
    expect(objectArchetypeIssues(lamp)).toEqual([]);
    const off = resolveObjectDefinitionAppearance(lamp);
    expect(off.light).toBeNull();
    expect(off.lighting.receivesGlobal).toBe(false);
    expect(off.sprite).toEqual({ asset: 'prop_test_lamp', animation: 'off', scale: 1 });
    const lit = resolveObjectDefinitionAppearance(lamp, { lit: true });
    expect(lit.light).toMatchObject({ radiusTiles: 4, profile: 'flicker' });
    expect(lit.sprite?.animation).toBe('burn');
    const gas = resolveObjectDefinitionAppearance(lamp, { lit: true, fuel: 'gas' });
    expect(gas.light).toMatchObject({ color: [180, 220, 255], radiusTiles: 6 });
    expect(gas.sprite).toEqual({ asset: 'prop_test_lamp', animation: 'gas_off', scale: 2 });
    expect(gas.appliedOverrides).toEqual([0, 2]);
  });
});

describe('object growth component', () => {
  it('feeds growth.ts profiles and modifiers', () => {
    const tree = appleTree();
    const profile = objectGrowthProfile(tree)!;
    expect(growthStageIndexForProgress(profile, 5)).toBe(0);
    expect(growthStageIndexForProgress(profile, 6)).toBe(1);
    expect(growthStageIndexForProgress(profile, 24)).toBe(2);
    expect(objectGrowthModifiers(tree, { raining: true, watered: true, season: 'winter' })).toEqual({
      waterBps: 3500, fertilizerBps: 0, poisonBps: 0, biomeBps: -10000,
    });
  });
});

describe('settleObjectTransitions', () => {
  const tree = appleTree();
  const start = (values = {}, progress = 0) => createObjectLifecycleState(tree, 1_000n, values, progress);

  it('advances growth stages lazily from timestamps in closed form', () => {
    const initial = start();
    expect(settleObjectTransitions(tree, initial, { nowTick: 1_000n + 5n * HOUR }).state.values.growth).toBe('sapling');
    const young = settleObjectTransitions(tree, initial, { nowTick: 1_000n + 6n * HOUR });
    expect(young.state.values.growth).toBe('young');
    expect(young.fired).toEqual([expect.objectContaining({ transitionId: 'sapling_grows', atTick: 1_000n + 6n * HOUR, event: 'timed' })]);
    expect(young.growthProgress).toBe(6);
    expect(young.growthStage).toBe(1);

    const mature = settleObjectTransitions(tree, initial, { nowTick: 1_000n + 15n * HOUR });
    expect(mature.state.values.growth).toBe('mature');
    expect(mature.fired.map(({ transitionId }) => transitionId)).toEqual(['sapling_grows', 'young_matures']);
    // Duration timers measure from when `growth` became mature.
    expect(mature.state.enteredAt.growth).toBe(1_000n + 15n * HOUR);
    const fruiting = settleObjectTransitions(tree, initial, { nowTick: 1_000n + 63n * HOUR });
    expect(fruiting.state.values).toEqual({ growth: 'mature', fruiting: true });
    expect(fruiting.fired.at(-1)).toMatchObject({ transitionId: 'blossoms', atTick: 1_000n + 63n * HOUR });
  });

  it('applies environment rate modifiers and pauses in winter', () => {
    const initial = start();
    const watered = settleObjectTransitions(tree, initial, {
      nowTick: 1_000n + 5n * HOUR, environment: { watered: true, raining: true },
    });
    // 135% rate: ceil(6 / 1.35) = 5 sweeps.
    expect(watered.state.values.growth).toBe('young');
    expect(watered.fired[0]?.atTick).toBe(1_000n + 5n * HOUR);
    const winter = settleObjectTransitions(tree, initial, { nowTick: 1_000n + 400n * HOUR, environment: { season: 'winter' } });
    expect(winter.fired).toEqual([]);
    expect(winter.growthProgress).toBe(0);
  });

  it('is deterministic and split-invariant for a constant environment', () => {
    const initial = start();
    const target = 1_000n + 200n * HOUR + 17n;
    const once = settleObjectTransitions(tree, initial, { nowTick: target });
    let stepped: ObjectLifecycleState = initial;
    const steppedFired: string[] = [];
    for (let tick = 1_000n; tick <= target; tick += 311n * 7n) {
      const result = settleObjectTransitions(tree, stepped, { nowTick: tick });
      stepped = result.state;
      steppedFired.push(...result.fired.map(({ transitionId }) => transitionId));
    }
    const last = settleObjectTransitions(tree, stepped, { nowTick: target });
    steppedFired.push(...last.fired.map(({ transitionId }) => transitionId));
    expect(last.state).toEqual(once.state);
    expect(last.growthProgress).toBe(once.growthProgress);
    expect(steppedFired).toEqual(once.fired.map(({ transitionId }) => transitionId));
    expect(settleObjectTransitions(tree, initial, { nowTick: target })).toEqual(once);
  });

  it('fires event transitions with stateEnter/stateExit hooks, then resprouts', () => {
    const matureAt = 1_000n + 63n * HOUR;
    const fruiting = settleObjectTransitions(tree, start(), { nowTick: matureAt }).state;
    expect(fruiting.values.fruiting).toBe(true);

    const picked = applyObjectTransitionEvent(tree, fruiting, 'use', { nowTick: matureAt + 1n });
    expect(picked.state.values).toEqual({ growth: 'mature', fruiting: false });
    expect(picked.fired).toEqual([expect.objectContaining({ transitionId: 'picked', event: 'use', run: { graph: 'pick' } })]);

    const felled = applyObjectTransitionEvent(tree, fruiting, 'break', { nowTick: matureAt + 2n });
    expect(felled.fired.map(({ transitionId, event }) => [transitionId, event])).toEqual([
      ['felled', 'break'], ['stump_drops_fruit', 'stateEnter'],
    ]);
    expect(felled.fired[0]?.run).toEqual({ graph: 'fell' });
    expect(felled.state.values).toEqual({ growth: 'stump', fruiting: false });
    const frozen = felled.state.growthProgress;
    expect(felled.state.growthAnchorTick).toBe(matureAt + 2n);

    const stillStump = settleObjectTransitions(tree, felled.state, { nowTick: matureAt + 2n + 23n * HOUR });
    expect(stillStump.state.values.growth).toBe('stump');
    expect(stillStump.growthProgress).toBe(frozen);

    const resprouted = settleObjectTransitions(tree, felled.state, { nowTick: matureAt + 2n + 24n * HOUR });
    expect(resprouted.state.values.growth).toBe('sapling');
    expect(resprouted.state.growthProgress).toBe(0);
    expect(resprouted.state.growthAnchorTick).toBe(matureAt + 2n + 24n * HOUR);

    const ignored = applyObjectTransitionEvent(tree, felled.state, 'use', { nowTick: matureAt + 3n });
    expect(ignored.fired).toEqual([]);
    expect(ignored.state).toEqual(felled.state);
  });

  it('bounds runaway cycles instead of looping forever', () => {
    const cycle = parseObjectDefinition({
      id: 'object:test_cycle', kind: 'object', schemaVersion: 1, displayName: 'Cycle',
      components: {
        states: { phase: { type: 'enum', default: 'a', values: ['a', 'b'] } },
        transitions: [
          { id: 'a_to_b', on: 'stateEnter', from: { phase: 'a' }, to: { phase: 'b' } },
          { id: 'b_to_a', on: 'stateEnter', from: { phase: 'b' }, to: { phase: 'a' } },
          { id: 'kick', from: { phase: 'a' }, to: { phase: 'b' }, after: { ticks: 1 } },
        ],
      },
    });
    const result = settleObjectTransitions(cycle, createObjectLifecycleState(cycle, 0n), { nowTick: 10n, maxFirings: 16 });
    expect(result.truncated).toBe(true);
    expect(result.fired).toHaveLength(16);
  });
});
