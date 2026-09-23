import { RULE_MEDIA, type RuleMedium } from './rule-catalogue.js';
import type { CollisionMap } from './state.js';

/** Stable authored identifiers. Capabilities are never inferred from artwork. */
export type TraversalAbility = string;
export interface MediumHazard {
  readonly id: string;
  readonly damageCenti: number;
  readonly intervalTicks: number;
  /** Only these explicitly authored grants suppress this hazard. */
  readonly immunityAbilities: readonly TraversalAbility[];
}
export interface MediumTraversalRule {
  /** OR of AND clauses. [] denies; [[]] explicitly permits every actor. */
  readonly requiresAny: readonly (readonly TraversalAbility[])[];
  readonly hazards: readonly MediumHazard[];
}
export type TraversalPolicy = Readonly<Record<RuleMedium, MediumTraversalRule>>;

/** Media admission does not bypass solids or confer hazard immunity. */
export function canTraverse(
  medium: RuleMedium,
  abilities: ReadonlySet<TraversalAbility>,
  policy: TraversalPolicy,
): boolean {
  return policy[medium]?.requiresAny.some(clause => clause.every(ability => abilities.has(ability))) ?? false;
}

export interface TraversalAbilitySource {
  readonly traversalAbilities: readonly TraversalAbility[];
}
export interface TraversalMountSource extends TraversalAbilitySource {
  /** Explicit substitution, e.g. a boat suppresses walk without deleting immunity. */
  readonly replacesAbilities: readonly TraversalAbility[];
}
export interface ActiveTraversalEffect extends TraversalAbilitySource {
  readonly expiresAtTick: number;
}
/** A mounted definition explicitly replaces locomotion grants, retaining innate
 * capabilities it does not replace. Timed effects add only authored grants. */
export function resolveTraversalAbilities(
  actor: TraversalAbilitySource,
  mount: TraversalMountSource | null,
  effects: readonly ActiveTraversalEffect[],
  tick: number,
): ReadonlySet<TraversalAbility> {
  const result = new Set(actor.traversalAbilities);
  if (mount !== null) {
    for (const ability of mount.replacesAbilities) result.delete(ability);
    for (const ability of mount.traversalAbilities) result.add(ability);
  }
  for (const effect of effects) {
    if (effect.expiresAtTick > tick) for (const ability of effect.traversalAbilities) result.add(ability);
  }
  return result;
}

/** Stateless cadence measured in simulation ticks, independent of frame rate.
 * Call for occupied media once per authority tick; never backfill off-screen DOT. */
export function mediumHazardsAtTick(
  medium: RuleMedium,
  abilities: ReadonlySet<TraversalAbility>,
  policy: TraversalPolicy,
  tick: number,
): readonly MediumHazard[] {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('invalid_traversal_tick');
  return policy[medium].hazards.filter(hazard => {
    if (!Number.isSafeInteger(hazard.intervalTicks) || hazard.intervalTicks <= 0
      || !Number.isSafeInteger(hazard.damageCenti) || hazard.damageCenti <= 0) {
      throw new RangeError('invalid_medium_hazard');
    }
    return tick % hazard.intervalTicks === 0
      && !hazard.immunityAbilities.some(ability => abilities.has(ability));
  });
}

export interface MediumCollisionChannels {
  readonly width: number;
  readonly height: number;
  /** RULE_MEDIA ordinals; malformed/missing cells fail closed. */
  readonly medium: ArrayLike<number>;
  readonly solidBlocked: ArrayLike<number>;
}
export interface TraversalShadowDifference {
  readonly index: number;
  readonly legacyBlocked: boolean;
  readonly mediumBlocked: boolean;
}

/** Replace only admission, preserving all height and obstacle metadata.
 * The caller supplies the geometry projection appropriate to this actor. */
export function mediumTraversalCollision(
  geometry: CollisionMap,
  channels: MediumCollisionChannels,
  abilities: ReadonlySet<TraversalAbility>,
  policy: TraversalPolicy,
): CollisionMap {
  if (geometry.width !== channels.width || geometry.height !== channels.height) {
    throw new RangeError('traversal_collision_size_mismatch');
  }
  const blocked = Array.from({ length: channels.width * channels.height }, (_, index) => {
    const medium = RULE_MEDIA[channels.medium[index] ?? -1];
    return medium === undefined || channels.solidBlocked[index] !== 0 || !canTraverse(medium, abilities, policy);
  });
  return { ...geometry, blocked };
}

/** Shadow callers always keep the legacy map; differences are evidence only. */
export function compareTraversalCollision(
  legacy: CollisionMap,
  candidate: CollisionMap,
): readonly TraversalShadowDifference[] {
  if (legacy.width !== candidate.width || legacy.height !== candidate.height) {
    throw new RangeError('traversal_collision_size_mismatch');
  }
  const differences: TraversalShadowDifference[] = [];
  for (let index = 0; index < legacy.width * legacy.height; index++) {
    const legacyBlocked = legacy.blocked[index] ?? true;
    const mediumBlocked = candidate.blocked[index] ?? true;
    if (legacyBlocked !== mediumBlocked) differences.push({ index, legacyBlocked, mediumBlocked });
  }
  return differences;
}
