import {
  compileObjectDataGraph,
  compileItemDataGraph,
  createHandlerRegistry,
  resolveObjectLight,
  type BehaviourHandlerRegistry,
  type ContentRegistry,
  type Effect,
  type ObjectContentDefinition,
  type ObjectStateDefinition,
  type StateValue,
} from '@orchard/sim';
import type { CachedContentRegistry } from './cache.js';

export interface PlaceableObjectStateRow {
  readonly kind: string;
  readonly open: boolean;
  readonly lit: boolean;
  /** Empty/default values identify rows created before the object schema. */
  readonly definitionId?: string;
  readonly stateJson?: string;
}

export interface ResolvedPlaceableObject {
  readonly definitionId: string;
  readonly definition: ObjectContentDefinition | null;
  readonly state: Readonly<Record<string, StateValue>>;
  readonly tags: readonly string[];
  readonly legacyFallback: boolean;
  readonly stateJsonValid: boolean;
}

export interface PlaceableObjectStatePlan {
  readonly definitionId: string;
  readonly stateJson: string;
  readonly open: boolean;
  readonly lit: boolean;
}

const OBJECT_ID_PATTERN = /^object:[a-z0-9]+(?:_[a-z0-9]+)*$/u;

/** Resolve the object explicitly requested by approved lifecycle code and bind
 * it to the selected item through the authored placement component. Object and
 * item ids deliberately do not have to share a suffix: the placement edge is
 * the content contract. */
export function placementObjectForSelectedItem(
  registry: ContentRegistry,
  definitionId: string,
  selectedItemKind: string,
): ObjectContentDefinition | null {
  if (!OBJECT_ID_PATTERN.test(definitionId)) return null;
  const definition = registry.objects.get(definitionId);
  if (definition === undefined || definition.retired === true
    || definition.components.placement?.item !== `item:${selectedItemKind}`) return null;
  return definition;
}

function legacyDefinitionId(kind: string): string {
  return `object:${kind}`;
}

function declaredStateDefaults(
  definition: ObjectContentDefinition | null,
): Record<string, StateValue> {
  return Object.fromEntries(Object.entries(definition?.components.states ?? {})
    .map(([name, state]) => [name, state.default]));
}

function parseStateJson(
  stateJson: string | undefined,
  definitions: Readonly<Record<string, ObjectStateDefinition>>,
): { readonly valid: boolean; readonly state: Readonly<Record<string, StateValue>> } {
  if (stateJson === undefined || stateJson.length === 0) return { valid: true, state: {} };
  try {
    const decoded = JSON.parse(stateJson) as unknown;
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return { valid: false, state: {} };
    const state: Record<string, StateValue> = {};
    for (const [name, value] of Object.entries(decoded)) {
      const declared = definitions[name];
      if (declared === undefined || !stateValueMatches(declared, value)) return { valid: false, state: {} };
      state[name] = value as StateValue;
    }
    return { valid: true, state };
  } catch {
    return { valid: false, state: {} };
  }
}

function stateValueMatches(definition: ObjectStateDefinition, value: unknown): boolean {
  if (definition.type === 'bool') return typeof value === 'boolean';
  if (definition.type === 'enum') return typeof value === 'string' && definition.values.includes(value);
  return typeof value === 'number' && Number.isSafeInteger(value)
    && (definition.min === undefined || value >= definition.min)
    && (definition.max === undefined || value <= definition.max);
}

function canonicalStateJson(state: Readonly<Record<string, StateValue>>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(state).sort(([left], [right]) => left.localeCompare(right))));
}

export function resolvePlaceableObject(
  registry: ContentRegistry,
  row: PlaceableObjectStateRow,
  legacyTags: readonly string[] = [],
): ResolvedPlaceableObject {
  const storedId = row.definitionId?.trim() ?? '';
  const candidateId = OBJECT_ID_PATTERN.test(storedId) ? storedId : legacyDefinitionId(row.kind);
  const candidate = registry.objects.get(candidateId);
  const definition = candidate?.retired === true ? null : candidate ?? null;
  const declarations = definition?.components.states ?? {};
  const parsed = parseStateJson(row.stateJson, declarations);
  const authored = { ...declaredStateDefaults(definition), ...(parsed.valid ? parsed.state : {}) };
  // Empty definitionId is the durable marker for a row that predates this
  // schema. If a matching authored definition is published later, retain the
  // old compatibility-column values rather than replacing them with authored
  // defaults during lazy materialization.
  if (storedId.length === 0) {
    if (declarations.open?.type === 'bool') authored.open = row.open;
    if (declarations.lit?.type === 'bool') authored.lit = row.lit;
  }
  const state = Object.freeze({
    open: row.open,
    lit: row.lit,
    ...authored,
  });
  return Object.freeze({
    definitionId: definition?.id ?? legacyDefinitionId(row.kind),
    definition,
    state,
    tags: Object.freeze([...new Set([
      ...legacyTags,
      ...(definition?.components.identity?.tags ?? []),
    ])].sort((left, right) => left.localeCompare(right))),
    legacyFallback: definition === null,
    stateJsonValid: parsed.valid,
  });
}

function stateMutation(
  resolved: ResolvedPlaceableObject,
  effect: Extract<Effect, { readonly setState: unknown }>
    | Extract<Effect, { readonly toggleState: unknown }>
    | Extract<Effect, { readonly incrementState: unknown }>,
): Record<string, StateValue> {
  const declarations = resolved.definition?.components.states ?? {};
  const state = { ...declaredStateDefaults(resolved.definition) };
  for (const name of Object.keys(declarations)) {
    const current = resolved.state[name];
    if (current !== undefined) state[name] = current;
  }
  const assign = (name: string, value: StateValue): void => {
    const declaration = declarations[name];
    if (declaration === undefined || !stateValueMatches(declaration, value)) {
      throw new Error(`behaviour_state_invalid:${name}`);
    }
    state[name] = value;
  };
  if ('setState' in effect) {
    for (const [name, value] of Object.entries(effect.setState)) assign(name, value);
  } else if ('toggleState' in effect) {
    const current = state[effect.toggleState];
    if (typeof current !== 'boolean') throw new Error(`behaviour_state_invalid:${effect.toggleState}`);
    assign(effect.toggleState, !current);
  } else {
    const current = state[effect.incrementState.state];
    if (typeof current !== 'number') throw new Error(`behaviour_state_invalid:${effect.incrementState.state}`);
    assign(effect.incrementState.state, current + effect.incrementState.amount);
  }
  return state;
}

function planFromState(
  resolved: ResolvedPlaceableObject,
  row: PlaceableObjectStateRow,
  state: Readonly<Record<string, StateValue>>,
): PlaceableObjectStatePlan {
  return Object.freeze({
    definitionId: resolved.definition?.id ?? row.definitionId ?? '',
    stateJson: canonicalStateJson(state),
    open: typeof state.open === 'boolean' ? state.open : row.open,
    lit: typeof state.lit === 'boolean' ? state.lit : row.lit,
  });
}

export function planPlaceableStateEffect(
  registry: ContentRegistry,
  row: PlaceableObjectStateRow,
  effect: Extract<Effect, { readonly setState: unknown }>
    | Extract<Effect, { readonly toggleState: unknown }>
    | Extract<Effect, { readonly incrementState: unknown }>,
  legacyTags: readonly string[] = [],
): PlaceableObjectStatePlan {
  const resolved = resolvePlaceableObject(registry, row, legacyTags);
  if (resolved.definition === null || !resolved.stateJsonValid) {
    // Pre-migration rows continue through the legacy open/lit columns. No
    // arbitrary JSON state is invented until an authored definition exists.
    const name = 'toggleState' in effect ? effect.toggleState
      : 'incrementState' in effect ? effect.incrementState.state
        : Object.keys(effect.setState)[0];
    if (name !== 'open' && name !== 'lit') throw new Error(`behaviour_state_invalid:${name ?? ''}`);
    if ('incrementState' in effect) throw new Error(`behaviour_state_invalid:${name}`);
    const nextOpen = 'toggleState' in effect && name === 'open' ? !row.open
      : 'setState' in effect && typeof effect.setState.open === 'boolean' ? effect.setState.open : row.open;
    const nextLit = 'toggleState' in effect && name === 'lit' ? !row.lit
      : 'setState' in effect && typeof effect.setState.lit === 'boolean' ? effect.setState.lit : row.lit;
    if ('setState' in effect && Object.entries(effect.setState).some(
      ([key, value]) => (key !== 'open' && key !== 'lit') || typeof value !== 'boolean',
    )) throw new Error(`behaviour_state_invalid:${name ?? ''}`);
    return Object.freeze({
      definitionId: row.definitionId ?? '', stateJson: row.stateJson ?? '{}', open: nextOpen, lit: nextLit,
    });
  }
  return planFromState(resolved, row, stateMutation(resolved, effect));
}

export function planPlaceableLightEffect(
  registry: ContentRegistry,
  row: PlaceableObjectStateRow,
  enabled: boolean,
  legacyTags: readonly string[] = [],
): PlaceableObjectStatePlan {
  const resolved = resolvePlaceableObject(registry, row, legacyTags);
  const when = resolved.definition?.components.light?.when;
  if (resolved.definition !== null && resolved.stateJsonValid && when !== undefined) {
    const declaration = resolved.definition.components.states?.[when.state];
    if (declaration === undefined) throw new Error(`behaviour_state_invalid:${when.state}`);
    let nextValue: StateValue;
    if (enabled) nextValue = when.equals;
    else if (declaration.type === 'bool' && typeof when.equals === 'boolean') nextValue = !when.equals;
    else if (declaration.type === 'enum') {
      const alternative = declaration.values.find((value) => value !== when.equals);
      if (alternative === undefined) throw new Error(`behaviour_light_state_not_switchable:${when.state}`);
      nextValue = alternative;
    } else if (declaration.type === 'counter' && typeof when.equals === 'number') {
      const candidates = [declaration.default, declaration.min, declaration.max, when.equals + 1, when.equals - 1];
      const alternative = candidates.find((value): value is number => value !== undefined
        && value !== when.equals && stateValueMatches(declaration, value));
      if (alternative === undefined) throw new Error(`behaviour_light_state_not_switchable:${when.state}`);
      nextValue = alternative;
    } else {
      throw new Error(`behaviour_light_state_not_switchable:${when.state}`);
    }
    const planned = planFromState(resolved, row, {
      ...declaredStateDefaults(resolved.definition),
      ...Object.fromEntries(Object.keys(resolved.definition?.components.states ?? {}).map((name) => [name, resolved.state[name]!])),
      [when.state]: nextValue,
    });
    return Object.freeze({ ...planned, lit: enabled });
  }
  return Object.freeze({
    definitionId: resolved.definition?.id ?? row.definitionId ?? '',
    stateJson: row.stateJson ?? '{}', open: row.open, lit: enabled,
  });
}

export function authoredPlaceableLight(
  registry: ContentRegistry,
  row: PlaceableObjectStateRow,
): ReturnType<typeof resolveObjectLight> | null {
  const resolved = resolvePlaceableObject(registry, row);
  const light = resolved.definition?.components.light;
  return light === undefined || !resolved.stateJsonValid ? null : resolveObjectLight(light, resolved.state);
}

/** Applies the reviewed collision effect through its authored state condition. */
export function planPlaceableCollisionEffect(
  registry: ContentRegistry,
  row: PlaceableObjectStateRow,
  enabled: boolean,
): PlaceableObjectStatePlan {
  const resolved = resolvePlaceableObject(registry, row);
  const collision = resolved.definition?.components.collision;
  const storedId = row.definitionId?.trim() ?? '';
  if (resolved.definition === null || !resolved.stateJsonValid
    || (storedId !== '' && resolved.definition.id !== storedId)) throw new Error('behaviour_collision_state_invalid');
  if (collision?.when === undefined) {
    if ((collision?.blocksMovement ?? false) !== enabled) throw new Error('behaviour_collision_state_not_switchable');
    return Object.freeze({
      definitionId: row.definitionId ?? '', stateJson: row.stateJson ?? '{}', open: row.open, lit: row.lit,
    });
  }
  if (!collision.blocksMovement && enabled) throw new Error('behaviour_collision_state_not_switchable');
  const when = collision.when;
  const declaration = resolved.definition.components.states?.[when.state];
  if (declaration === undefined) throw new Error('behaviour_collision_state_invalid');
  let value = when.equals;
  if (!enabled) {
    const current = resolved.state[when.state];
    const candidates: readonly StateValue[] = declaration.type === 'bool' ? [!when.equals]
      : declaration.type === 'enum' ? declaration.values
        : [declaration.default, declaration.min ?? 0, declaration.max ?? 0,
          typeof when.equals === 'number' ? when.equals + 1 : 0,
          typeof when.equals === 'number' ? when.equals - 1 : 0];
    const alternative = current !== undefined && current !== when.equals && stateValueMatches(declaration, current)
      ? current : candidates.find(candidate => candidate !== when.equals && stateValueMatches(declaration, candidate));
    if (alternative === undefined) throw new Error('behaviour_collision_state_not_switchable');
    value = alternative;
  }
  return planPlaceableStateEffect(registry, row, { setState: { [when.state]: value } });
}

interface ObjectGraphRegistryCache {
  readonly contentKey: string;
  readonly base: BehaviourHandlerRegistry;
  readonly registry: BehaviourHandlerRegistry;
}

let objectGraphCache: ObjectGraphRegistryCache | null = null;

/** Compiles once per durable content revision/hash. At equal priority the
 * canonical `object:*` registration id sorts before the `placeable.*`
 * migration bridge, so an applicable authored graph wins; a graph whose
 * conditions continue still falls through to the legacy handler. */
export function objectGraphRegistryForContent(
  base: BehaviourHandlerRegistry,
  content: CachedContentRegistry,
  engineVersion: number,
): BehaviourHandlerRegistry {
  const contentKey = `${content.key}:${engineVersion}`;
  if (objectGraphCache?.contentKey === contentKey && objectGraphCache.base === base) {
    return objectGraphCache.registry;
  }
  const codeOwnedItemEvents = new Set(base.registrations.flatMap((registration) => (
    registration.source === 'selectedItem'
      && registration.match.kind === 'definition'
      ? [`${registration.match.definitionId}\0${registration.eventType}`]
      : []
  )));
  const authored = [
    ...[...content.registry.objects.values()]
      .filter((definition) => definition.retired !== true)
      .flatMap((definition) => compileObjectDataGraph(definition, engineVersion)),
    ...[...content.registry.items.values()]
      .filter((definition) => definition.retired !== true)
      .flatMap((definition) => compileItemDataGraph(definition, engineVersion)
        .filter((registration) => !codeOwnedItemEvents.has(
          `${definition.id}\0${registration.eventType}`,
        ))),
  ];
  const registry = createHandlerRegistry([...base.registrations, ...authored]);
  objectGraphCache = Object.freeze({ contentKey, base, registry });
  return registry;
}

export function invalidateObjectGraphRegistryCache(): void {
  objectGraphCache = null;
}
