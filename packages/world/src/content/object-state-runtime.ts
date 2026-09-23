import {
  applyObjectTransitionEvent, settleObjectTransitions, anchorStatefulGrowth, restoreObjectLifecycle, encodeObjectLifecycle,
  compileDataGraphInteraction, executeAuthoredHook, transitionCallbackEvent, objectStateEvents,
  type ObjectContentDefinition, type ExternalStateTransitionEvent, type ReadOnlySnapshot,
  type AuthoredLifecycleDefinition, type AuthoredHookAuthority, type Effect, type LifecycleEvent,
  type GrowthEnvironment, type StateValues, type ObjectEnvironmentInterval, type StateTransitionFiring,
} from '@orchard/sim';

/** Pure transaction plan: the caller writes both state and anchors only after
 * every transition action has passed approval, budget and graph validation. */
export function planObjectStateSettlement(input: {
  readonly definition: ObjectContentDefinition;
  readonly stored: string | null;
  readonly view: ReadOnlySnapshot;
  readonly now: bigint;
  readonly event?: ExternalStateTransitionEvent;
  readonly mutation?: StateValues;
  readonly lifecycleEvent?: LifecycleEvent;
  readonly environment?: GrowthEnvironment;
  readonly intervals?: readonly ObjectEnvironmentInterval[];
  readonly callbacks: readonly AuthoredLifecycleDefinition[];
  readonly authority: AuthoredHookAuthority;
  readonly engineVersion: number;
}) {
  const { definition, view, now, authority } = input;
  if (view.target === undefined || !('state' in view.target)) throw new Error('object_state_target_missing');
  let initial = restoreObjectLifecycle(definition, input.stored, view.target.state, now);
  const options = { nowTick: now, maxFirings: 32, ...(input.environment === undefined ? {} : { environment: input.environment }) };
  const historyFirings: StateTransitionFiring[] = [];
  for (const interval of input.intervals ?? []) {
    const settled = settleObjectTransitions(definition, initial, { nowTick: interval.throughTick, environment: interval.environment, maxFirings: 32 - historyFirings.length });
    if (settled.truncated) throw new Error('object_state_transition_limit');
    historyFirings.push(...settled.fired);
    initial = anchorStatefulGrowth(definition.components, settled.state, interval.throughTick, interval.environment);
  }
  const finalInterval = input.intervals?.[input.intervals.length - 1];
  const throughTick = finalInterval?.throughTick ?? now;
  const caughtUp = throughTick >= now;
  if (!caughtUp && (input.event !== undefined || input.mutation !== undefined)) throw new Error('object_state_catching_up');
  const finalOptions = { ...options, nowTick: throughTick, maxFirings: 32 - historyFirings.length,
    ...((finalInterval?.environment ?? input.environment) === undefined ? {} : { environment: (finalInterval?.environment ?? input.environment)! }) };
  const machine = input.mutation === undefined ? definition : { ...definition, components: { ...definition.components,
    transitions: [{ id: 'authority.explicit-state', from: {}, to: input.mutation, on: 'use' as const }, ...(definition.components.transitions ?? [])],
  } };
  const result = input.mutation !== undefined ? applyObjectTransitionEvent(machine, initial, 'use', finalOptions)
    : input.event === undefined ? settleObjectTransitions(definition, initial, finalOptions)
      : applyObjectTransitionEvent(definition, initial, input.event, finalOptions);
  if (result.truncated) throw new Error('object_state_transition_limit');
  const effects: Effect[] = [];
  const object = { entityType: 'object' as const, id: view.target.id, definitionId: definition.id };
  for (const firing of [...historyFirings, ...result.fired]) {
    if (!authority.consume()) throw new Error('authored_hook_invocation_limit');
    for (const event of firing.event === 'stateExit' ? [] : objectStateEvents(object, firing.from, firing.to)) {
      for (const callback of input.callbacks) {
        if (callback.definitionId !== definition.id || callback.kind !== 'object'
          || callback.hook !== (event.type === 'stateEnter' ? 'onStateEnter' : 'onStateExit')) continue;
        if (!authority.consume()) throw new Error('authored_hook_invocation_limit');
        if (!authority.approved()) throw new Error('authored_hook_approval_required');
        const result = executeAuthoredHook(callback, event, { ...view, target: { ...view.target, state: firing.to } });
        if ('blocked' in result) throw new Error(result.blocked);
        effects.push(...result.effects);
        authority.audit(callback.id, event.type, result.effects.length);
      }
    }
    if (effects.length > 64) throw new Error('behaviour_effect_cap_exceeded');
    if (firing.run === undefined) continue;
    const snapshot = { ...view, target: { ...view.target, state: firing.to } };
    const callbackEvent = transitionCallbackEvent(object, firing);
    let handled;
    if (callbackEvent !== null) {
      const callback = input.callbacks.find(c => c.id === callbackEvent.callbackId && c.definitionId === definition.id && c.hook === 'onTransition');
      if (callback === undefined) throw new Error('authored_transition_callback_missing');
      if (!authority.approved()) throw new Error('authored_hook_approval_required');
      handled = executeAuthoredHook(callback, callbackEvent, snapshot);
      if (!('blocked' in handled)) authority.audit(callback.id, 'transition', handled.effects.length);
    } else if ('graph' in firing.run) {
      const graphId = firing.run.graph;
      const interaction = definition.components.interactions?.find(i => i.id === graphId);
      if (interaction === undefined) throw new Error('authored_transition_graph_missing');
      const handler = compileDataGraphInteraction(definition.id, interaction, input.engineVersion).handler as
        (event: LifecycleEvent, snapshot: ReadOnlySnapshot) => ReturnType<typeof executeAuthoredHook>;
      handled = handler(input.lifecycleEvent ?? { type: 'timer', object, timerId: firing.transitionId }, { ...snapshot, target: { ...snapshot.target, state: firing.from } });
    }
    if (handled !== undefined) {
      if ('blocked' in handled) throw new Error(handled.blocked);
      effects.push(...handled.effects);
    }
    if (effects.length > 64) throw new Error('behaviour_effect_cap_exceeded');
  }
  return { ...result, throughTick, caughtUp, fired: [...historyFirings, ...result.fired], effects, stored: encodeObjectLifecycle(result.state) };
}
