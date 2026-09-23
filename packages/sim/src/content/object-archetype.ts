/**
 * Object archetype (doc 61 §3): the object-specific layer over the reusable
 * stateful component contract in `stateful-components.ts`. Objects add a
 * `lighting` component, a pixel `target`, and an override patch shape
 * (sprite/animation, collision footprint, light emission, lighting,
 * interaction availability, target rect).
 *
 * - `resolveObjectDefinitionAppearance(definition, state)` – base components
 *   plus the ordered overrides whose `when` matches. (Named to avoid the
 *   existing map-prefab `resolveObjectAppearance` in object-presentation.ts.)
 * - `settleObjectTransitions(definition, lifecycle, inputs)` – lazy,
 *   closed-form, timestamp-based settlement of the declared state machine.
 */
import type { ObjectContentDefinition, ObjectLightComponent } from './object-definition.js';
import {
  applyStatefulTransitionEvent,
  createStatefulLifecycle,
  growthComponentModifiers,
  growthComponentProfile,
  matchingStateOverrides,
  parseStateOverrides,
  settleStatefulTransitions,
  statefulComponentIssues,
  statefulFail,
  statefulOnlyKeys,
  statefulRecord,
  statefulValues,
  type ExternalStateTransitionEvent,
  type GrowthEnvironment,
  type StatefulIssue,
  type StatefulLifecycle,
  type StatefulSettlementInputs,
  type StatefulSettlementResult,
  type StateOverride,
  type StateValues,
} from './stateful-components.js';
import type { GrowthProfile, GrowthRateModifiers } from '../growth.js';

export type ObjectShadowMode = 'none' | 'silhouette' | 'column';
export const OBJECT_SHADOW_MODES = ['none', 'silhouette', 'column'] as const satisfies readonly ObjectShadowMode[];

/** How an object participates in the lighting pass. Replaces the engine's
 * `tree_` asset-prefix shadow choice and the map light visual table. */
export interface ObjectLightingComponent {
  /** Whether day/night and weather tint the object's art. */
  readonly receivesGlobal: boolean;
  readonly castsShadow: ObjectShadowMode;
  /** Falls back to `collision.occludesLight` when omitted. */
  readonly occludesLight?: boolean;
}

/** Pixel rectangle relative to the anchor tile's bottom-centre, as used by
 * resource target/collision footprints. */
export interface ObjectPixelRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface ObjectTargetComponent {
  readonly rect: ObjectPixelRect;
}

export type ObjectOverrideLight = Omit<ObjectLightComponent, 'when'>;

/** Fields an object override may replace. */
export interface ObjectOverridePatch {
  readonly sprite?: { readonly asset?: string; readonly animation?: string; readonly scale?: number };
  readonly collision?: { readonly footprint?: readonly (readonly number[])[]; readonly blocksMovement?: boolean };
  /** `false` switches emission off in this state. */
  readonly light?: ObjectOverrideLight | false;
  readonly lighting?: Partial<ObjectLightingComponent>;
  /** Interaction id → availability in this state. */
  readonly interactions?: Readonly<Record<string, boolean>>;
  readonly target?: ObjectPixelRect;
}

export type ObjectStateOverride = StateOverride<ObjectOverridePatch>;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const STABLE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

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

function footprintMask(value: unknown, path: string): readonly (readonly number[])[] {
  if (!Array.isArray(value)) statefulFail(path, 'expected an array');
  const rows = value.map((row: unknown, y) => {
    if (!Array.isArray(row)) statefulFail(`${path}[${y}]`, 'expected an array');
    return row.map((mask: unknown, x) => integer(mask, `${path}[${y}][${x}]`, 0, 15));
  });
  if (rows.length === 0 || rows[0]?.length === 0 || rows.some((row) => row.length !== rows[0]?.length)) {
    statefulFail(path, 'footprint must be a non-empty rectangular mask');
  }
  return rows;
}

function shadowMode(value: unknown, path: string): ObjectShadowMode {
  if (typeof value !== 'string' || !(OBJECT_SHADOW_MODES as readonly string[]).includes(value)) {
    statefulFail(path, 'expected none, silhouette, or column');
  }
  return value as ObjectShadowMode;
}

export function parsePixelRect(value: unknown, path: string): ObjectPixelRect {
  const source = statefulRecord(value, path);
  statefulOnlyKeys(source, path, ['left', 'right', 'top', 'bottom']);
  const rect = {
    left: integer(source.left, `${path}.left`, -512, 512),
    right: integer(source.right, `${path}.right`, -512, 512),
    top: integer(source.top, `${path}.top`, -512, 512),
    bottom: integer(source.bottom, `${path}.bottom`, -512, 512),
  };
  if (rect.left > rect.right || rect.top > rect.bottom) statefulFail(path, 'rect must have left <= right and top <= bottom');
  return rect;
}

export function parseObjectLightingComponent(value: unknown, path: string): ObjectLightingComponent {
  const source = statefulRecord(value, path);
  statefulOnlyKeys(source, path, ['receivesGlobal', 'castsShadow', 'occludesLight']);
  return {
    receivesGlobal: booleanValue(source.receivesGlobal, `${path}.receivesGlobal`),
    castsShadow: shadowMode(source.castsShadow, `${path}.castsShadow`),
    ...(source.occludesLight === undefined ? {} : {
      occludesLight: booleanValue(source.occludesLight, `${path}.occludesLight`),
    }),
  };
}

export function parseObjectTargetComponent(value: unknown, path: string): ObjectTargetComponent {
  const source = statefulRecord(value, path);
  statefulOnlyKeys(source, path, ['rect']);
  return { rect: parsePixelRect(source.rect, `${path}.rect`) };
}

function parseOverrideLight(value: unknown, path: string): ObjectOverrideLight | false {
  if (value === false) return false;
  const source = statefulRecord(value, path);
  statefulOnlyKeys(source, path, ['color', 'radiusTiles', 'profile', 'offsetY', 'intensityPerMille']);
  const color = source.color;
  if (!Array.isArray(color) || color.length !== 3) statefulFail(`${path}.color`, 'expected three channels');
  const profile = source.profile;
  if (profile !== 'steady' && profile !== 'flicker') statefulFail(`${path}.profile`, 'unknown light profile');
  return {
    color: color.map((channel: unknown, index) => (
      integer(channel, `${path}.color[${index}]`, 0, 255)
    )) as unknown as readonly [number, number, number],
    radiusTiles: integer(source.radiusTiles, `${path}.radiusTiles`, 1),
    profile,
    ...(source.intensityPerMille === undefined ? {} : {
      intensityPerMille: integer(source.intensityPerMille, `${path}.intensityPerMille`, 0, 4000),
    }),
    ...(source.offsetY === undefined ? {} : { offsetY: integer(source.offsetY, `${path}.offsetY`, Number.MIN_SAFE_INTEGER) }),
  };
}

function parseObjectOverridePatch(source: Record<string, unknown>, path: string): ObjectOverridePatch {
  statefulOnlyKeys(source, path, ['sprite', 'collision', 'light', 'lighting', 'interactions', 'target']);
  const sprite = source.sprite === undefined ? undefined : statefulRecord(source.sprite, `${path}.sprite`);
  if (sprite !== undefined) statefulOnlyKeys(sprite, `${path}.sprite`, ['asset', 'animation', 'scale']);
  const collision = source.collision === undefined ? undefined : statefulRecord(source.collision, `${path}.collision`);
  if (collision !== undefined) statefulOnlyKeys(collision, `${path}.collision`, ['footprint', 'blocksMovement']);
  const lighting = source.lighting === undefined ? undefined : statefulRecord(source.lighting, `${path}.lighting`);
  if (lighting !== undefined) statefulOnlyKeys(lighting, `${path}.lighting`, ['receivesGlobal', 'castsShadow', 'occludesLight']);
  const interactions = source.interactions === undefined ? undefined : statefulRecord(source.interactions, `${path}.interactions`);
  return {
    ...(sprite === undefined ? {} : { sprite: {
      ...(sprite.asset === undefined ? {} : { asset: stableName(sprite.asset, `${path}.sprite.asset`) }),
      ...(sprite.animation === undefined ? {} : { animation: stableName(sprite.animation, `${path}.sprite.animation`) }),
      ...(sprite.scale === undefined ? {} : { scale: (() => {
        const scale = sprite.scale;
        if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 0.01) {
          statefulFail(`${path}.sprite.scale`, 'expected a finite number >= 0.01');
        }
        return scale;
      })() }),
    } }),
    ...(collision === undefined ? {} : { collision: {
      ...(collision.footprint === undefined ? {} : { footprint: footprintMask(collision.footprint, `${path}.collision.footprint`) }),
      ...(collision.blocksMovement === undefined ? {} : {
        blocksMovement: booleanValue(collision.blocksMovement, `${path}.collision.blocksMovement`),
      }),
    } }),
    ...(source.light === undefined ? {} : { light: parseOverrideLight(source.light, `${path}.light`) }),
    ...(lighting === undefined ? {} : { lighting: {
      ...(lighting.receivesGlobal === undefined ? {} : {
        receivesGlobal: booleanValue(lighting.receivesGlobal, `${path}.lighting.receivesGlobal`),
      }),
      ...(lighting.castsShadow === undefined ? {} : { castsShadow: shadowMode(lighting.castsShadow, `${path}.lighting.castsShadow`) }),
      ...(lighting.occludesLight === undefined ? {} : {
        occludesLight: booleanValue(lighting.occludesLight, `${path}.lighting.occludesLight`),
      }),
    } }),
    ...(interactions === undefined ? {} : { interactions: Object.fromEntries(Object.entries(interactions).map(([id, enabled]) => [
      stableName(id, `${path}.interactions.${id}`), booleanValue(enabled, `${path}.interactions.${id}`),
    ])) }),
    ...(source.target === undefined ? {} : { target: parsePixelRect(source.target, `${path}.target`) }),
  };
}

export function parseObjectOverrides(value: unknown, path: string): readonly ObjectStateOverride[] {
  return parseStateOverrides(value, path, parseObjectOverridePatch);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ObjectArchetypeIssue = StatefulIssue;

/** Shared stateful checks plus object-specific override references. */
export function objectArchetypeIssues(definition: ObjectContentDefinition): readonly ObjectArchetypeIssue[] {
  const components = definition.components;
  const interactionIds = new Set((components.interactions ?? []).map(({ id }) => id));
  const issues = statefulComponentIssues(components, { graphIds: interactionIds, pathPrefix: 'components' });
  const placement = components.placement?.footprint;
  components.overrides?.forEach((override, index) => {
    const path = `components.overrides[${index}]`;
    for (const id of Object.keys(override.interactions ?? {})) {
      if (!interactionIds.has(id)) issues.push({ message: `unknown interaction ${id}`, path: `${path}.interactions.${id}` });
    }
    if (override.sprite !== undefined && components.sprite === undefined && override.sprite.asset === undefined) {
      issues.push({ message: 'sprite override needs a base sprite or an asset', path: `${path}.sprite` });
    }
    if (override.collision !== undefined && components.collision === undefined
      && (override.collision.footprint === undefined || override.collision.blocksMovement === undefined)) {
      issues.push({
        message: 'collision override without a base collision needs footprint and blocksMovement',
        path: `${path}.collision`,
      });
    }
    const mask = override.collision?.footprint;
    if (mask !== undefined && placement !== undefined
      && (mask.length > placement.length || mask.some((row) => row.length > (placement[0]?.length ?? 0)))) {
      issues.push({ message: 'state footprint must fit inside the placement footprint', path: `${path}.collision.footprint` });
    }
  });
  return issues;
}

// ---------------------------------------------------------------------------
// Appearance resolution
// ---------------------------------------------------------------------------

export interface ResolvedObjectAppearance {
  readonly sprite: { readonly asset: string; readonly animation: string; readonly scale: number } | null;
  readonly collision: { readonly footprint: readonly (readonly number[])[]; readonly blocksMovement: boolean } | null;
  readonly light: ObjectOverrideLight | null;
  readonly lighting: { readonly receivesGlobal: boolean; readonly castsShadow: ObjectShadowMode; readonly occludesLight: boolean };
  /** Interaction ids available in this state, in declaration order. */
  readonly interactions: readonly string[];
  readonly target: ObjectPixelRect | null;
  /** Indices of the overrides applied, in application order. */
  readonly appliedOverrides: readonly number[];
}

export function objectStateValues(definition: ObjectContentDefinition, values: StateValues = {}): StateValues {
  return statefulValues(definition.components, values);
}

/** Mirrors the client's existing `animationByState` precedence. */
function baseAnimation(definition: ObjectContentDefinition, values: StateValues): string {
  const animations = definition.components.sprite?.animationByState;
  if (animations === undefined) return 'base';
  for (const [name, value] of Object.entries(values).sort(([left], [right]) => left.localeCompare(right))) {
    if (value === true && animations[name] !== undefined) return animations[name]!;
    if (typeof value === 'string') {
      if (animations[`${name}.${value}`] !== undefined) return animations[`${name}.${value}`]!;
      if (animations[value] !== undefined) return animations[value]!;
    }
  }
  return animations.default ?? 'base';
}

function conditionHolds(when: ObjectLightComponent['when'], values: StateValues): boolean {
  return when === undefined || values[when.state] === when.equals;
}

/** Base components, then every override whose `when` matches, in declaration
 * order (later overrides win field by field). */
export function resolveObjectDefinitionAppearance(
  definition: ObjectContentDefinition,
  state: StateValues = {},
): ResolvedObjectAppearance {
  const values = objectStateValues(definition, state);
  const components = definition.components;
  const { sprite, collision } = components;
  let resolvedSprite = sprite === undefined ? null
    : { asset: sprite.asset, animation: baseAnimation(definition, values), scale: sprite.scale ?? 1 };
  let resolvedCollision = collision === undefined ? null : {
    footprint: collision.footprint,
    blocksMovement: collision.blocksMovement && conditionHolds(collision.when, values),
  };
  let light: ObjectOverrideLight | null = null;
  if (components.light !== undefined && conditionHolds(components.light.when, values)) {
    const { when, ...emitter } = components.light;
    void when;
    light = emitter;
  }
  let lighting = {
    receivesGlobal: components.lighting?.receivesGlobal ?? true,
    castsShadow: components.lighting?.castsShadow ?? 'silhouette' as ObjectShadowMode,
    occludesLight: components.lighting?.occludesLight ?? collision?.occludesLight ?? false,
  };
  const available = new Map((components.interactions ?? []).map(({ id }) => [id, true]));
  let target = components.target?.rect ?? null;
  const matches = matchingStateOverrides(components, values);

  for (const { override } of matches) {
    if (override.sprite !== undefined) {
      const current = resolvedSprite ?? { asset: override.sprite.asset!, animation: 'base', scale: 1 };
      resolvedSprite = {
        asset: override.sprite.asset ?? current.asset,
        animation: override.sprite.animation ?? current.animation,
        scale: override.sprite.scale ?? current.scale,
      };
    }
    if (override.collision !== undefined) {
      resolvedCollision = {
        footprint: override.collision.footprint ?? resolvedCollision?.footprint ?? [[15]],
        blocksMovement: override.collision.blocksMovement ?? resolvedCollision?.blocksMovement ?? true,
      };
    }
    if (override.light !== undefined) light = override.light === false ? null : override.light;
    if (override.lighting !== undefined) lighting = { ...lighting, ...override.lighting };
    for (const [id, enabled] of Object.entries(override.interactions ?? {})) {
      if (available.has(id)) available.set(id, enabled);
    }
    if (override.target !== undefined) target = override.target;
  }

  return Object.freeze({
    sprite: resolvedSprite,
    collision: resolvedCollision,
    light,
    lighting,
    interactions: [...available].filter(([, enabled]) => enabled).map(([id]) => id),
    target,
    appliedOverrides: matches.map(({ index }) => index),
  });
}

// ---------------------------------------------------------------------------
// Growth and transitions (object wrappers over the shared contract)
// ---------------------------------------------------------------------------

export type ObjectLifecycleState = StatefulLifecycle;

export function objectGrowthProfile(definition: ObjectContentDefinition): GrowthProfile | null {
  return definition.components.growth === undefined ? null : growthComponentProfile(definition.components.growth);
}

export function objectGrowthModifiers(
  definition: ObjectContentDefinition,
  environment: GrowthEnvironment = {},
): GrowthRateModifiers | null {
  return definition.components.growth === undefined ? null : growthComponentModifiers(definition.components.growth, environment);
}

export function createObjectLifecycleState(
  definition: ObjectContentDefinition,
  atTick: bigint,
  values: StateValues = {},
  growthProgress = 0,
): ObjectLifecycleState {
  return createStatefulLifecycle(definition.components, atTick, values, growthProgress);
}

export function settleObjectTransitions(
  definition: ObjectContentDefinition,
  lifecycle: ObjectLifecycleState,
  inputs: StatefulSettlementInputs,
): StatefulSettlementResult {
  return settleStatefulTransitions(definition.components, lifecycle, inputs);
}

export function applyObjectTransitionEvent(
  definition: ObjectContentDefinition,
  lifecycle: ObjectLifecycleState,
  event: ExternalStateTransitionEvent,
  inputs: StatefulSettlementInputs,
): StatefulSettlementResult {
  const settled = settleStatefulTransitions(definition.components, lifecycle, inputs);
  if (settled.truncated) return settled;
  const available = resolveObjectDefinitionAppearance(definition, settled.state.values).interactions;
  const components = { ...definition.components, transitions: (definition.components.transitions ?? []).filter(transition =>
    transition.on !== event || transition.run === undefined || !('graph' in transition.run) || available.includes(transition.run.graph)) };
  const result = applyStatefulTransitionEvent(components, settled.state, event, {
    ...inputs, maxFirings: Math.max(0, (inputs.maxFirings ?? 64) - settled.fired.length),
  });
  return { ...result, fired: [...settled.fired, ...result.fired] };
}
