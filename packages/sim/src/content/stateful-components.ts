/**
 * Reusable stateful component contract (doc 61 §3.2–3.4, owner decisions
 * D3/D4). Any definition kind — objects today; resources, crops, NPCs/mobs,
 * items or zones later — can embed a `StatefulComponentSet`:
 *
 * - `states`      declared bool / enum / counter values with defaults;
 * - `overrides`   ordered `{ when, ...patch }` entries whose patch shape is
 *                 owned by the embedding kind (objects patch sprite,
 *                 collision, light, lighting, interactions and target);
 * - `transitions` a state machine: timed (`after`) or event (`on`) entries,
 *                 each optionally running a lifecycle hook reference;
 * - `growth`      a data-authored growth profile feeding `growth.ts`.
 *
 * Everything here is pure: shape parsers, cross-reference validation, and
 * lazy, closed-form, timestamp-based settlement (never a per-tick sweep).
 */
import type { StateValue } from '../behaviour/effects.js';
import {
  GROWTH_RATE_BASIS_POINTS,
  growthRateBasisPoints,
  preferredBiomeGrowthModifier,
  type GrowthProfile,
  type GrowthRateModifiers,
} from '../growth.js';
import { AUTHORITY_TICKS_PER_DAY, SEASONS, type Season } from '../time.js';
import { ContentParseError } from './parse-contract.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StateDeclaration =
  | { readonly type: 'bool'; readonly default: boolean }
  | { readonly type: 'enum'; readonly default: string; readonly values: readonly string[] }
  | { readonly type: 'counter'; readonly default: number; readonly min?: number; readonly max?: number };

/** Every listed state must equal the given value. */
export type StateMatch = Readonly<Record<string, StateValue>>;
export type StateValues = Readonly<Record<string, StateValue>>;

/**
 * What a transition or hook runs. Data graphs are the default (doc 55); a
 * reviewed TypeScript lifecycle callback covers logic graphs cannot express
 * (D4). New variants (e.g. quest scripts) extend this union.
 */
export type LifecycleHookRef =
  /** Data graph: an interaction id declared on the owning definition. */
  | { readonly graph: string }
  /** Reviewed lifecycle-authoring callback id (warm-build pipeline). */
  | { readonly callback: string };

export const STATE_TRANSITION_EVENTS = [
  'use', 'secondary', 'useWith', 'place', 'walkOnto', 'break', 'timer',
  'spawn', 'despawn', 'stateEnter', 'stateExit',
] as const;
export type StateTransitionEvent = typeof STATE_TRANSITION_EVENTS[number];
export type ExternalStateTransitionEvent = Exclude<StateTransitionEvent, 'stateEnter' | 'stateExit'>;

export type StateTransitionAfter =
  /** Fires when accumulated growth progress reaches this value. */
  | { readonly growthProgress: number }
  /** Fires this many authority ticks after the `from` states were entered. */
  | { readonly ticks: number }
  /** Same as ticks, in in-game hours. */
  | { readonly gameHours: number };

interface StateTransitionCommon {
  readonly id: string;
  readonly from: StateMatch;
  /** Omitted only by stateEnter/stateExit hooks that just run something. */
  readonly to?: StateValues;
  readonly run?: LifecycleHookRef;
  /** Restarts growth progress at zero when this fires. */
  readonly resetGrowth?: boolean;
}

export type StateTransitionDefinition =
  | (StateTransitionCommon & { readonly after: StateTransitionAfter; readonly on?: never })
  | (StateTransitionCommon & { readonly on: StateTransitionEvent; readonly after?: never });

export interface GrowthModifiersDefinition {
  readonly rainBps?: number;
  readonly wateredBps?: number;
  readonly fertilisedBps?: number;
  readonly seasonBps?: Readonly<Partial<Record<Season, number>>>;
  readonly preferredBiomes?: readonly string[];
  readonly unsuitableBiomeBps?: number;
}

/** Data-authored growth profile. Feeds `growth.ts` directly. */
export interface GrowthComponent {
  readonly maxProgress: number;
  /** Authority ticks per progress unit at 100% rate. */
  readonly sweepTicks: number;
  /** Ascending progress values; index is the visible growth stage. */
  readonly stageThresholds: readonly number[];
  /** Growth pauses while the owner matches any of these. */
  readonly pausedWhen?: readonly StateMatch[];
  readonly modifiers?: GrowthModifiersDefinition;
}

export type StateOverride<TPatch extends object> = { readonly when: StateMatch } & TPatch;

/** The embeddable contract. `TPatch` is owned by the embedding kind. */
export interface StatefulComponentSet<TPatch extends object = object> {
  readonly states?: Readonly<Record<string, StateDeclaration>>;
  readonly overrides?: readonly StateOverride<TPatch>[];
  readonly transitions?: readonly StateTransitionDefinition[];
  readonly growth?: GrowthComponent;
}

// ---------------------------------------------------------------------------
// Shape parsing (cross-references are checked by statefulComponentIssues)
// ---------------------------------------------------------------------------

const STABLE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
/** Matches lifecycle-authoring's callback id grammar. */
const CALLBACK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_.:-]{0,126}[a-z0-9])?$/u;
export const MAX_STATE_OVERRIDES = 64;
export const MAX_STATE_TRANSITIONS = 64;

export function statefulFail(path: string, message: string): never {
  throw new ContentParseError('invalid_type', path, message);
}

export function statefulRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) statefulFail(path, 'expected an object');
  return value as Record<string, unknown>;
}

export function statefulOnlyKeys(source: Record<string, unknown>, path: string, allowed: readonly string[]): void {
  const unknown = Object.keys(source).find((key) => !allowed.includes(key));
  if (unknown !== undefined) statefulFail(`${path}.${unknown}`, `unsupported field ${unknown}`);
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) statefulFail(path, 'expected an array');
  return value;
}

function stableName(value: unknown, path: string): string {
  if (typeof value !== 'string' || !STABLE_NAME_PATTERN.test(value)) statefulFail(path, 'expected a stable name');
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') statefulFail(path, 'expected a boolean');
  return value;
}

function integer(value: unknown, path: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    statefulFail(path, `expected a safe integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function stateValue(value: unknown, path: string): StateValue {
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  return statefulFail(path, 'expected a boolean, string, or safe integer state value');
}

export function parseStateMatch(value: unknown, path: string): StateMatch {
  const source = statefulRecord(value, path);
  const entries = Object.entries(source);
  if (entries.length === 0) statefulFail(path, 'expected at least one state');
  return Object.freeze(Object.fromEntries(entries.map(([name, entry]) => [
    stableName(name, `${path}.${name}`), stateValue(entry, `${path}.${name}`),
  ])));
}

export function parseLifecycleHookRef(value: unknown, path: string): LifecycleHookRef {
  const source = statefulRecord(value, path);
  const keys = Object.keys(source);
  if (keys.length !== 1) statefulFail(path, 'expected exactly one of graph or callback');
  if (source.graph !== undefined) return { graph: stableName(source.graph, `${path}.graph`) };
  if (source.callback !== undefined) {
    const id = source.callback;
    if (typeof id !== 'string' || !CALLBACK_ID_PATTERN.test(id)) statefulFail(`${path}.callback`, 'expected a lifecycle callback id');
    return { callback: id };
  }
  return statefulFail(`${path}.${keys[0]}`, `unsupported hook kind ${keys[0]}`);
}

/**
 * Parses ordered overrides. `parsePatch` owns every field except `when` and
 * must reject unknown keys; an override that changes nothing is rejected.
 */
export function parseStateOverrides<TPatch extends object>(
  value: unknown,
  path: string,
  parsePatch: (source: Record<string, unknown>, path: string) => TPatch,
): readonly StateOverride<TPatch>[] {
  const entries = array(value, path);
  if (entries.length === 0 || entries.length > MAX_STATE_OVERRIDES) {
    statefulFail(path, `expected 1 to ${MAX_STATE_OVERRIDES} overrides`);
  }
  return entries.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const source = statefulRecord(entry, entryPath);
    const { when, ...rest } = source;
    const patch = parsePatch(rest, entryPath);
    const empty = (field: unknown) => typeof field === 'object' && field !== null && Object.keys(field).length === 0;
    const fields = Object.values(patch as Record<string, unknown>);
    if (fields.length === 0 || fields.some(empty)) statefulFail(entryPath, 'override must change at least one field');
    return { when: parseStateMatch(when, `${entryPath}.when`), ...patch };
  });
}

function parseAfter(value: unknown, path: string): StateTransitionAfter {
  const source = statefulRecord(value, path);
  const keys = Object.keys(source);
  if (keys.length !== 1) statefulFail(path, 'expected exactly one of growthProgress, ticks, or gameHours');
  if (source.growthProgress !== undefined) return { growthProgress: integer(source.growthProgress, `${path}.growthProgress`, 1) };
  if (source.ticks !== undefined) return { ticks: integer(source.ticks, `${path}.ticks`, 1, 0xffff_ffff) };
  if (source.gameHours !== undefined) return { gameHours: integer(source.gameHours, `${path}.gameHours`, 1, 24 * 400) };
  return statefulFail(`${path}.${keys[0]}`, `unsupported timer ${keys[0]}`);
}

function parseTransition(value: unknown, path: string): StateTransitionDefinition {
  const source = statefulRecord(value, path);
  statefulOnlyKeys(source, path, ['id', 'from', 'to', 'after', 'on', 'run', 'resetGrowth']);
  if ((source.after === undefined) === (source.on === undefined)) statefulFail(path, 'transition needs exactly one of after or on');
  const common = {
    id: stableName(source.id, `${path}.id`),
    from: parseStateMatch(source.from, `${path}.from`),
    ...(source.to === undefined ? {} : { to: parseStateMatch(source.to, `${path}.to`) }),
    ...(source.run === undefined ? {} : { run: parseLifecycleHookRef(source.run, `${path}.run`) }),
    ...(source.resetGrowth === undefined ? {} : { resetGrowth: booleanValue(source.resetGrowth, `${path}.resetGrowth`) }),
  };
  if (source.after !== undefined) return { ...common, after: parseAfter(source.after, `${path}.after`) };
  const on = source.on;
  if (typeof on !== 'string' || !(STATE_TRANSITION_EVENTS as readonly string[]).includes(on)) {
    statefulFail(`${path}.on`, `unknown transition event ${String(on)}`);
  }
  return { ...common, on: on as StateTransitionEvent };
}

export function parseStateTransitions(value: unknown, path: string): readonly StateTransitionDefinition[] {
  const entries = array(value, path);
  if (entries.length === 0 || entries.length > MAX_STATE_TRANSITIONS) {
    statefulFail(path, `expected 1 to ${MAX_STATE_TRANSITIONS} transitions`);
  }
  return entries.map((entry, index) => parseTransition(entry, `${path}[${index}]`));
}

export function parseGrowthComponent(value: unknown, path: string): GrowthComponent {
  const source = statefulRecord(value, path);
  statefulOnlyKeys(source, path, ['maxProgress', 'sweepTicks', 'stageThresholds', 'pausedWhen', 'modifiers']);
  const modifiers = source.modifiers === undefined ? undefined : statefulRecord(source.modifiers, `${path}.modifiers`);
  if (modifiers !== undefined) {
    statefulOnlyKeys(modifiers, `${path}.modifiers`, [
      'rainBps', 'wateredBps', 'fertilisedBps', 'seasonBps', 'preferredBiomes', 'unsuitableBiomeBps',
    ]);
  }
  const bps = (entry: unknown, entryPath: string) => integer(
    entry, entryPath, -GROWTH_RATE_BASIS_POINTS, 10 * GROWTH_RATE_BASIS_POINTS,
  );
  const seasonBps = modifiers?.seasonBps === undefined ? undefined : statefulRecord(modifiers.seasonBps, `${path}.modifiers.seasonBps`);
  if (seasonBps !== undefined) statefulOnlyKeys(seasonBps, `${path}.modifiers.seasonBps`, SEASONS);
  return {
    maxProgress: integer(source.maxProgress, `${path}.maxProgress`, 1, 1_000_000),
    sweepTicks: integer(source.sweepTicks, `${path}.sweepTicks`, 1, 0xffff_ffff),
    stageThresholds: array(source.stageThresholds, `${path}.stageThresholds`)
      .map((entry, index) => integer(entry, `${path}.stageThresholds[${index}]`, 0, 1_000_000)),
    ...(source.pausedWhen === undefined ? {} : { pausedWhen: array(source.pausedWhen, `${path}.pausedWhen`)
      .map((entry, index) => parseStateMatch(entry, `${path}.pausedWhen[${index}]`)) }),
    ...(modifiers === undefined ? {} : { modifiers: {
      ...(modifiers.rainBps === undefined ? {} : { rainBps: bps(modifiers.rainBps, `${path}.modifiers.rainBps`) }),
      ...(modifiers.wateredBps === undefined ? {} : { wateredBps: bps(modifiers.wateredBps, `${path}.modifiers.wateredBps`) }),
      ...(modifiers.fertilisedBps === undefined ? {} : {
        fertilisedBps: bps(modifiers.fertilisedBps, `${path}.modifiers.fertilisedBps`),
      }),
      ...(seasonBps === undefined ? {} : { seasonBps: Object.fromEntries(Object.entries(seasonBps).map(([season, entry]) => [
        season, bps(entry, `${path}.modifiers.seasonBps.${season}`),
      ])) }),
      ...(modifiers.preferredBiomes === undefined ? {} : {
        preferredBiomes: array(modifiers.preferredBiomes, `${path}.modifiers.preferredBiomes`)
          .map((entry, index) => stableName(entry, `${path}.modifiers.preferredBiomes[${index}]`)),
      }),
      ...(modifiers.unsuitableBiomeBps === undefined ? {} : {
        unsuitableBiomeBps: integer(
          modifiers.unsuitableBiomeBps, `${path}.modifiers.unsuitableBiomeBps`, -GROWTH_RATE_BASIS_POINTS, 0,
        ),
      }),
    } }),
  };
}

// ---------------------------------------------------------------------------
// Semantic validation
// ---------------------------------------------------------------------------

export interface StatefulIssue {
  readonly message: string;
  readonly path: string;
}

export interface StatefulValidationContext {
  /** Data graph ids (interaction ids) available to `{ graph }` hooks. */
  readonly graphIds: ReadonlySet<string>;
  /** Path prefix for reported issues, e.g. `components`. */
  readonly pathPrefix: string;
}

export function stateDeclarationAccepts(definition: StateDeclaration, value: StateValue): boolean {
  if (definition.type === 'bool') return typeof value === 'boolean';
  if (definition.type === 'enum') return typeof value === 'string' && definition.values.includes(value);
  return typeof value === 'number' && Number.isSafeInteger(value)
    && (definition.min === undefined || value >= definition.min)
    && (definition.max === undefined || value <= definition.max);
}

/** Cross-reference checks shared by every kind embedding the contract. */
export function statefulComponentIssues(
  set: StatefulComponentSet,
  context: StatefulValidationContext,
): StatefulIssue[] {
  const issues: StatefulIssue[] = [];
  const states = set.states ?? {};
  const prefix = context.pathPrefix;
  const checkStates = (values: StateValues, path: string) => {
    for (const [name, value] of Object.entries(values)) {
      const state = states[name];
      if (state === undefined) issues.push({ message: `unknown state ${name}`, path: `${path}.${name}` });
      else if (!stateDeclarationAccepts(state, value)) {
        issues.push({ message: `state ${name} does not accept ${String(value)}`, path: `${path}.${name}` });
      }
    }
  };

  set.overrides?.forEach((override, index) => checkStates(override.when, `${prefix}.overrides[${index}].when`));

  const transitionIds = new Set<string>();
  set.transitions?.forEach((transition, index) => {
    const path = `${prefix}.transitions[${index}]`;
    if (transitionIds.has(transition.id)) issues.push({ message: `duplicate transition ${transition.id}`, path: `${path}.id` });
    transitionIds.add(transition.id);
    checkStates(transition.from, `${path}.from`);
    if (transition.to !== undefined) checkStates(transition.to, `${path}.to`);
    if (transition.run !== undefined && 'graph' in transition.run && !context.graphIds.has(transition.run.graph)) {
      issues.push({ message: `transition runs unknown graph ${transition.run.graph}`, path: `${path}.run.graph` });
    }
    if (transition.on === 'stateExit' && transition.to !== undefined) {
      issues.push({ message: 'stateExit hooks cannot change state', path: `${path}.to` });
    }
    if (transition.to === undefined && transition.on !== 'stateEnter' && transition.on !== 'stateExit') {
      issues.push({ message: 'only stateEnter/stateExit hooks may omit to', path });
    }
    if (transition.to === undefined && transition.run === undefined) {
      issues.push({ message: 'hook without to must run something', path });
    }
    if (transition.to !== undefined
      && Object.entries(transition.to).every(([name, value]) => transition.from[name] === value)) {
      issues.push({ message: 'transition does not change state', path: `${path}.to` });
    }
    if (transition.resetGrowth === true && set.growth === undefined) {
      issues.push({ message: 'resetGrowth requires a growth component', path: `${path}.resetGrowth` });
    }
    if (transition.after !== undefined && 'growthProgress' in transition.after) {
      if (set.growth === undefined) {
        issues.push({ message: 'growth-timed transition requires a growth component', path: `${path}.after` });
      } else if (transition.after.growthProgress > set.growth.maxProgress) {
        issues.push({ message: 'growth-timed transition exceeds maxProgress', path: `${path}.after.growthProgress` });
      }
    }
  });

  const growth = set.growth;
  if (growth !== undefined) {
    const thresholds = growth.stageThresholds;
    if (thresholds.some((value, index) => value > growth.maxProgress || (index > 0 && value <= thresholds[index - 1]!))) {
      issues.push({ message: 'stage thresholds must ascend strictly within maxProgress', path: `${prefix}.growth.stageThresholds` });
    }
    growth.pausedWhen?.forEach((match, index) => checkStates(match, `${prefix}.growth.pausedWhen[${index}]`));
  }
  return issues;
}

// ---------------------------------------------------------------------------
// State values and override matching
// ---------------------------------------------------------------------------

/** Declared defaults, overlaid by any provided values. */
export function statefulValues(set: StatefulComponentSet, values: StateValues = {}): StateValues {
  const defaults = Object.fromEntries(Object.entries(set.states ?? {})
    .map(([name, state]) => [name, state.default] as const));
  return Object.freeze({ ...defaults, ...values });
}

export function stateMatches(match: StateMatch, values: StateValues): boolean {
  return Object.entries(match).every(([name, value]) => values[name] === value);
}

/** Overrides whose `when` matches, in declaration order, with their index. */
export function matchingStateOverrides<TPatch extends object>(
  set: StatefulComponentSet<TPatch>,
  values: StateValues,
): readonly { readonly index: number; readonly override: StateOverride<TPatch> }[] {
  return (set.overrides ?? []).flatMap((override, index) => (
    stateMatches(override.when, values) ? [{ index, override }] : []
  ));
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

export function growthComponentProfile(growth: GrowthComponent): GrowthProfile {
  return { maxProgress: growth.maxProgress, stageThresholds: growth.stageThresholds };
}

export interface GrowthEnvironment {
  readonly raining?: boolean;
  readonly watered?: boolean;
  readonly fertilised?: boolean;
  readonly season?: Season;
  readonly biome?: string;
  /** Extra caller-supplied adjustment (e.g. poison), in basis points. */
  readonly poisonBps?: number;
}

/** Maps the authored modifier table onto `growth.ts` rate modifiers. */
export function growthComponentModifiers(
  growth: GrowthComponent,
  environment: GrowthEnvironment = {},
): GrowthRateModifiers {
  const modifiers = growth.modifiers ?? {};
  const water = (environment.raining === true ? modifiers.rainBps ?? 0 : 0)
    + (environment.watered === true ? modifiers.wateredBps ?? 0 : 0);
  const season = environment.season === undefined ? 0 : modifiers.seasonBps?.[environment.season] ?? 0;
  const biome = environment.biome === undefined || modifiers.preferredBiomes === undefined ? 0
    : preferredBiomeGrowthModifier(environment.biome, modifiers.preferredBiomes, modifiers.unsuitableBiomeBps);
  return {
    waterBps: water,
    fertilizerBps: environment.fertilised === true ? modifiers.fertilisedBps ?? 0 : 0,
    poisonBps: environment.poisonBps ?? 0,
    biomeBps: season + biome,
  };
}

// ---------------------------------------------------------------------------
// Transition settlement
// ---------------------------------------------------------------------------

/** Persistable lifecycle snapshot for one stateful instance. Growth progress
 * is anchored: `growthProgress` is exact at `growthAnchorTick` and derived in
 * closed form afterwards, so settling in several calls equals one call. */
export interface StatefulLifecycle {
  readonly values: StateValues;
  /** Authority tick at which each state last changed value. */
  readonly enteredAt: Readonly<Record<string, bigint>>;
  readonly growthProgress: number;
  readonly growthAnchorTick: bigint;
}

export interface StateTransitionFiring {
  readonly transitionId: string;
  readonly atTick: bigint;
  readonly event: StateTransitionEvent | 'timed';
  readonly from: StateValues;
  readonly to: StateValues;
  readonly run?: LifecycleHookRef;
}

export interface StatefulSettlementInputs {
  readonly nowTick: bigint;
  /** Held constant for the settled window; settle before it changes. */
  readonly environment?: GrowthEnvironment;
  /** Safety bound for chained transitions in one call. */
  readonly maxFirings?: number;
}

export interface StatefulSettlementResult {
  readonly state: StatefulLifecycle;
  readonly fired: readonly StateTransitionFiring[];
  /** Growth progress at `nowTick` (derived; not re-anchored). */
  readonly growthProgress: number;
  /** Zero-based visible growth stage at `nowTick`, or null. */
  readonly growthStage: number | null;
  /** True when `maxFirings` stopped settlement early. */
  readonly truncated: boolean;
}

const DEFAULT_MAX_FIRINGS = 64;
const TICKS_PER_GAME_HOUR = BigInt(AUTHORITY_TICKS_PER_DAY / 24);

export function createStatefulLifecycle(
  set: StatefulComponentSet,
  atTick: bigint,
  values: StateValues = {},
  growthProgress = 0,
): StatefulLifecycle {
  const resolved = statefulValues(set, values);
  return Object.freeze({
    values: resolved,
    enteredAt: Object.freeze(Object.fromEntries(Object.keys(resolved).map((name) => [name, atTick]))),
    growthProgress: Math.max(0, Math.trunc(growthProgress)),
    growthAnchorTick: atTick,
  });
}

function growthActive(growth: GrowthComponent, values: StateValues): boolean {
  return !(growth.pausedWhen ?? []).some((match) => stateMatches(match, values));
}

function progressAt(growth: GrowthComponent, state: StatefulLifecycle, tick: bigint, rateBps: number): number {
  const start = Math.min(growth.maxProgress, state.growthProgress);
  if (!growthActive(growth, state.values) || tick <= state.growthAnchorTick || rateBps <= 0) return start;
  const sweeps = (tick - state.growthAnchorTick) / BigInt(growth.sweepTicks);
  const gained = sweeps * BigInt(rateBps) / BigInt(GROWTH_RATE_BASIS_POINTS);
  const total = BigInt(start) + gained;
  return total >= BigInt(growth.maxProgress) ? growth.maxProgress : Number(total);
}

/** Earliest tick at which anchored progress reaches `target`, or null. */
function tickForProgress(growth: GrowthComponent, state: StatefulLifecycle, target: number, rateBps: number): bigint | null {
  const need = target - Math.min(growth.maxProgress, state.growthProgress);
  if (need <= 0) return state.growthAnchorTick;
  if (!growthActive(growth, state.values) || rateBps <= 0) return null;
  const rate = BigInt(rateBps);
  const sweeps = (BigInt(need) * BigInt(GROWTH_RATE_BASIS_POINTS) + rate - 1n) / rate;
  return state.growthAnchorTick + sweeps * BigInt(growth.sweepTicks);
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

function timedFireTick(
  set: StatefulComponentSet,
  transition: StateTransitionDefinition,
  state: StatefulLifecycle,
  rateBps: number,
): bigint | null {
  const after = transition.after;
  if (after === undefined) return null;
  const entered = Object.keys(transition.from)
    .reduce((latest, name) => maxBigInt(latest, state.enteredAt[name] ?? 0n), 0n);
  if ('growthProgress' in after) {
    if (set.growth === undefined) return null;
    const reached = tickForProgress(set.growth, state, after.growthProgress, rateBps);
    return reached === null ? null : maxBigInt(reached, entered);
  }
  const duration = 'ticks' in after ? BigInt(after.ticks) : BigInt(after.gameHours) * TICKS_PER_GAME_HOUR;
  return entered + duration;
}

interface SettleContext {
  readonly set: StatefulComponentSet;
  readonly rateBps: number;
  readonly fired: StateTransitionFiring[];
  readonly limit: number;
}

function record(context: SettleContext, firing: StateTransitionFiring): boolean {
  if (context.fired.length >= context.limit) return false;
  context.fired.push(firing);
  return true;
}

function firing(
  transition: StateTransitionDefinition,
  event: StateTransitionFiring['event'],
  tick: bigint,
  from: StateValues,
  to: StateValues,
): StateTransitionFiring {
  return {
    transitionId: transition.id, atTick: tick, event, from, to,
    ...(transition.run === undefined ? {} : { run: transition.run }),
  };
}

/** Moves to `to` at `tick`, re-anchoring growth only when it must, then runs
 * stateExit/stateEnter hooks (and chained stateEnter transitions). Returns
 * null when the firing bound is reached. */
function enterState(
  context: SettleContext,
  state: StatefulLifecycle,
  transition: StateTransitionDefinition,
  event: StateTransitionFiring['event'],
  tick: bigint,
): StatefulLifecycle | null {
  const { set } = context;
  const from = state.values;
  const to = statefulValues(set, { ...from, ...transition.to });
  if (!record(context, firing(transition, event, tick, from, to))) return null;
  const changed = Object.keys(to).filter((name) => to[name] !== from[name]);
  if (changed.length === 0) return state;

  let growthProgress = state.growthProgress;
  let growthAnchorTick = state.growthAnchorTick;
  if (set.growth !== undefined) {
    if (transition.resetGrowth === true) {
      growthProgress = 0;
      growthAnchorTick = tick;
    } else if (growthActive(set.growth, from) !== growthActive(set.growth, to)) {
      growthProgress = progressAt(set.growth, state, tick, context.rateBps);
      growthAnchorTick = tick;
    }
  }
  let next: StatefulLifecycle = Object.freeze({
    values: to,
    enteredAt: Object.freeze({ ...state.enteredAt, ...Object.fromEntries(changed.map((name) => [name, tick])) }),
    growthProgress,
    growthAnchorTick,
  });

  for (const hook of set.transitions ?? []) {
    if (hook.on !== 'stateExit' || !stateMatches(hook.from, from) || stateMatches(hook.from, to)) continue;
    if (!record(context, firing(hook, 'stateExit', tick, from, to))) return null;
  }
  for (const hook of set.transitions ?? []) {
    if (hook.on !== 'stateEnter' || stateMatches(hook.from, from) || !stateMatches(hook.from, to)) continue;
    if (hook.to === undefined || stateMatches(hook.to, next.values)) {
      if (!record(context, firing(hook, 'stateEnter', tick, next.values, next.values))) return null;
      continue;
    }
    const chained = enterState(context, next, hook, 'stateEnter', tick);
    if (chained === null) return null;
    next = chained;
    break;
  }
  return next;
}

function finish(
  set: StatefulComponentSet,
  state: StatefulLifecycle,
  fired: readonly StateTransitionFiring[],
  nowTick: bigint,
  rateBps: number,
  truncated: boolean,
): StatefulSettlementResult {
  const growth = set.growth;
  const progress = growth === undefined ? state.growthProgress : progressAt(growth, state, nowTick, rateBps);
  let stage: number | null = null;
  growth?.stageThresholds.forEach((threshold, index) => { if (progress >= threshold) stage = index; });
  return Object.freeze({ state, fired: Object.freeze([...fired]), growthProgress: progress, growthStage: stage, truncated });
}

function rateFor(set: StatefulComponentSet, environment: GrowthEnvironment | undefined): number {
  return set.growth === undefined ? 0 : growthRateBasisPoints(growthComponentModifiers(set.growth, environment));
}

/**
 * Lazily applies every timed transition that became due up to `nowTick`.
 * Due times are solved in closed form; ties resolve in declaration order.
 * Deterministic and split-invariant: settling to t1 then t2 yields the same
 * state as settling to t2 once, for a constant environment.
 */
export function settleStatefulTransitions(
  set: StatefulComponentSet,
  lifecycle: StatefulLifecycle,
  inputs: StatefulSettlementInputs,
): StatefulSettlementResult {
  const rateBps = rateFor(set, inputs.environment);
  const context: SettleContext = { set, rateBps, fired: [], limit: inputs.maxFirings ?? DEFAULT_MAX_FIRINGS };
  let state = lifecycle;
  for (;;) {
    let due: { transition: StateTransitionDefinition; tick: bigint } | null = null;
    for (const transition of set.transitions ?? []) {
      if (transition.after === undefined || !stateMatches(transition.from, state.values)) continue;
      if (transition.to === undefined || stateMatches(transition.to, state.values)) continue;
      const tick = timedFireTick(set, transition, state, rateBps);
      if (tick === null || tick > inputs.nowTick) continue;
      if (due === null || tick < due.tick) due = { transition, tick };
    }
    if (due === null) return finish(set, state, context.fired, inputs.nowTick, rateBps, false);
    const next = enterState(context, state, due.transition, 'timed', due.tick);
    if (next === null) return finish(set, state, context.fired, inputs.nowTick, rateBps, true);
    state = next;
  }
}

/**
 * Settles to `nowTick`, then fires the first event transition (declaration
 * order) for `event` whose `from` matches, then settles any follow-on timers.
 */
export function applyStatefulTransitionEvent(
  set: StatefulComponentSet,
  lifecycle: StatefulLifecycle,
  event: ExternalStateTransitionEvent,
  inputs: StatefulSettlementInputs,
): StatefulSettlementResult {
  const settled = settleStatefulTransitions(set, lifecycle, inputs);
  if (settled.truncated) return settled;
  const transition = (set.transitions ?? [])
    .find((candidate) => candidate.on === event && stateMatches(candidate.from, settled.state.values));
  if (transition === undefined) return settled;
  const rateBps = rateFor(set, inputs.environment);
  const limit = inputs.maxFirings ?? DEFAULT_MAX_FIRINGS;
  const context: SettleContext = { set, rateBps, fired: [...settled.fired], limit };
  const next = enterState(context, settled.state, transition, event, inputs.nowTick);
  if (next === null) return finish(set, settled.state, context.fired, inputs.nowTick, rateBps, true);
  const after = settleStatefulTransitions(set, next, { ...inputs, maxFirings: Math.max(0, limit - context.fired.length) });
  return finish(set, after.state, [...context.fired, ...after.fired], inputs.nowTick, rateBps, after.truncated);
}

/** Read-only timing query using the exact same anchor/rate arithmetic as
 * settlement. Callers must supply an authorized lifecycle snapshot and the
 * environment for its settled epoch; this does not expose private authority. */
export function statefulTimingMilestones(
  set: StatefulComponentSet, lifecycle: StatefulLifecycle, inputs: StatefulSettlementInputs,
) {
  const settled = settleStatefulTransitions(set, lifecycle, inputs);
  const growth = set.growth;
  const rate = growth === undefined ? 0 : growthRateBasisPoints(growthComponentModifiers(growth, inputs.environment));
  const paused = growth !== undefined && (!growthActive(growth, settled.state.values) || rate <= 0);
  const growthFinish = growth === undefined ? null
    : tickForProgress(growth, settled.state, growth.maxProgress, rate);
  const deadlines = (set.transitions ?? []).filter(transition => stateMatches(transition.from, settled.state.values))
    .map(transition => timedFireTick(set, transition, settled.state, rate))
    .filter((tick): tick is bigint => tick !== null && tick > inputs.nowTick);
  if (growth !== undefined) {
    const nextStage = growth.stageThresholds.find(threshold => threshold > settled.growthProgress);
    const stageTick = nextStage === undefined ? null : tickForProgress(growth, settled.state, nextStage, rate);
    if (stageTick !== null && stageTick > inputs.nowTick) deadlines.push(stageTick);
  }
  return { settled, paused, growthFinish,
    nextTransitionTick: deadlines.reduce<bigint | null>((next, tick) => next === null || tick < next ? tick : next, null) };
}
