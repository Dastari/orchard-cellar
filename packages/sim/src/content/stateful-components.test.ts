import { describe, expect, it } from 'vitest';
import { ContentParseError } from './parse-contract.js';
import {
  applyStatefulTransitionEvent,
  createStatefulLifecycle,
  matchingStateOverrides,
  parseGrowthComponent,
  parseLifecycleHookRef,
  parseStateOverrides,
  parseStateTransitions,
  settleStatefulTransitions,
  statefulComponentIssues,
  statefulOnlyKeys,
  type StatefulComponentSet,
} from './stateful-components.js';

/** A non-object embedding (e.g. a future mob definition) with its own patch
 * shape, proving the contract is not hard-wired to ObjectContentDefinition. */
interface MobPatch { readonly speedPerMille?: number }

function mobSet(): StatefulComponentSet<MobPatch> {
  return {
    states: { mood: { type: 'enum', default: 'calm', values: ['calm', 'angry', 'tired'] } },
    overrides: parseStateOverrides([{ when: { mood: 'angry' }, speedPerMille: 1500 }], 'overrides', (source, path) => {
      statefulOnlyKeys(source, path, ['speedPerMille']);
      return typeof source.speedPerMille === 'number' ? { speedPerMille: source.speedPerMille } : {};
    }),
    transitions: parseStateTransitions([
      { id: 'provoked', on: 'use', from: { mood: 'calm' }, to: { mood: 'angry' }, run: { callback: 'mob.boar.on_provoked' } },
      { id: 'tires', from: { mood: 'angry' }, to: { mood: 'tired' }, after: { ticks: 100 } },
      { id: 'rests', from: { mood: 'tired' }, to: { mood: 'calm' }, after: { gameHours: 1 } },
      { id: 'growl', on: 'stateEnter', from: { mood: 'angry' }, run: { graph: 'growl' } },
    ], 'transitions'),
  };
}

describe('stateful component contract', () => {
  it('embeds in any definition kind with its own override patch', () => {
    const set = mobSet();
    expect(statefulComponentIssues(set, { graphIds: new Set(['growl']), pathPrefix: 'mob' })).toEqual([]);
    expect(matchingStateOverrides(set, { mood: 'angry' })).toEqual([
      { index: 0, override: { when: { mood: 'angry' }, speedPerMille: 1500 } },
    ]);
    const provoked = applyStatefulTransitionEvent(set, createStatefulLifecycle(set, 0n), 'use', { nowTick: 10n });
    expect(provoked.fired.map(({ transitionId, run }) => [transitionId, run])).toEqual([
      ['provoked', { callback: 'mob.boar.on_provoked' }],
      ['growl', { graph: 'growl' }],
    ]);
    expect(settleStatefulTransitions(set, provoked.state, { nowTick: 110n }).state.values.mood).toBe('tired');
    expect(settleStatefulTransitions(set, provoked.state, { nowTick: 110n + 750n }).state.values.mood).toBe('calm');
  });

  it('reports unknown graph hooks but leaves callback refs to the lifecycle bundle', () => {
    const issues = statefulComponentIssues(mobSet(), { graphIds: new Set(), pathPrefix: 'mob' });
    expect(issues).toEqual([{ message: 'transition runs unknown graph growl', path: 'mob.transitions[3].run.graph' }]);
  });

  it('parses hook references strictly', () => {
    expect(parseLifecycleHookRef({ graph: 'pick' }, '$')).toEqual({ graph: 'pick' });
    expect(parseLifecycleHookRef({ callback: 'object.apple_tree:on_fell' }, '$')).toEqual({ callback: 'object.apple_tree:on_fell' });
    for (const bad of [{ graph: 'pick', callback: 'x' }, { quest: 'q' }, { callback: 'Bad Id' }, 'pick']) {
      expect(() => parseLifecycleHookRef(bad, '$')).toThrow(ContentParseError);
    }
  });

  it('parses growth strictly', () => {
    expect(parseGrowthComponent({ maxProgress: 4, sweepTicks: 10, stageThresholds: [0, 2] }, '$')).toEqual({
      maxProgress: 4, sweepTicks: 10, stageThresholds: [0, 2],
    });
    expect(() => parseGrowthComponent({ maxProgress: 4, sweepTicks: 0, stageThresholds: [] }, '$')).toThrow(ContentParseError);
    expect(() => parseGrowthComponent({
      maxProgress: 4, sweepTicks: 1, stageThresholds: [], modifiers: { unsuitableBiomeBps: 5 },
    }, '$')).toThrow(ContentParseError);
  });
});
