import { CHEST_INTERACTION_REACH_FIXED, facedTileTarget,
  runtimePlaceableSlotCapacity, tileTargetWithinFixedReach,
  type ContentRegistry, type PlaceableContentReference, type Direction } from '@orchard/sim';

export const PLACEABLE_ACCEPTANCE_KINDS = [
  'chest', 'fruit_press', 'fermentation_cask',
] as const;

export type PlaceableAcceptanceKind = typeof PLACEABLE_ACCEPTANCE_KINDS[number];
export type PlaceableAcceptanceMode = 'inspect' | 'interact';

export interface AcceptancePosition {
  readonly x: number;
  readonly y: number;
  readonly facing: string;
  readonly spaceId: number;
}

export interface AcceptancePlaceable {
  readonly id: bigint;
  readonly kind: string;
  readonly definitionId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly spaceId: number;
  readonly placedBy: string;
  readonly carriedBy: string | null;
  readonly open: boolean;
  readonly processStartTick: bigint | null;
  readonly processStartedBy: string | null;
  readonly processInputKind: string | null;
}

export interface AcceptanceSlot {
  readonly placeableId: bigint;
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
}

export interface AcceptancePlanInput {
  readonly registry: Pick<ContentRegistry, 'objects'>;
  readonly mode: PlaceableAcceptanceMode;
  readonly host: string;
  readonly database: string;
  readonly identity: string;
  readonly expectedIdentity?: string;
  readonly kind: PlaceableAcceptanceKind;
  readonly target: AcceptancePlaceable;
  readonly position: AcceptancePosition;
  readonly slots: readonly AcceptanceSlot[];
  readonly activePlaceableId: bigint | null;
  readonly confirmation?: string;
  readonly allowProduction: boolean;
}

export interface AcceptanceInspection {
  readonly runtimeDefinitionId: string;
  readonly reachPolicy: 'radial_two_tiles' | 'exact_faced_tile';
  readonly owned: boolean;
  readonly durableSlotFingerprint: 'available' | 'owner_scoped_unavailable';
}

const DEFINITIONS: Readonly<Record<PlaceableAcceptanceKind, string>> = Object.freeze({
  chest: 'object:chest',
  fruit_press: 'object:fruit_press',
  fermentation_cask: 'object:fermentation_cask',
});

export function isPlaceableAcceptanceKind(value: string): value is PlaceableAcceptanceKind {
  return (PLACEABLE_ACCEPTANCE_KINDS as readonly string[]).includes(value);
}

export function isDirection(value: string): value is Direction {
  return ['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight'].includes(value);
}

export function placeableAcceptanceCapacity(
  registry: Pick<ContentRegistry, 'objects'>,
  target: string | PlaceableContentReference,
): number {
  return runtimePlaceableSlotCapacity(registry, target);
}

/** Mirrors resolvePlaceableObject: rows created before authored object ids use
 * their runtime kind as the compatibility definition. */
export function placeableAcceptanceRuntimeDefinitionId(target: Pick<AcceptancePlaceable,
  'definitionId' | 'kind'>): string {
  const stored = target.definitionId.trim();
  return stored.length === 0 ? `object:${target.kind}` : stored;
}

export function normalizedAcceptanceHost(host: string): string {
  const url = new URL(host);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('acceptance_host_invalid');
  return url.origin;
}

export function isProductionAcceptanceTarget(host: string, database: string): boolean {
  // The production database is sometimes reached through a loopback tunnel.
  // Treat its canonical name as production regardless of transport hostname so
  // a tunnel cannot accidentally bypass the second opt-in.
  return database === 'orchard-cellar-world'
    || new URL(normalizedAcceptanceHost(host)).hostname === 'orchard.dastari.net';
}

export function placeableAcceptanceConfirmation(input: Pick<AcceptancePlanInput,
  'host' | 'database' | 'identity' | 'kind' | 'target'>): string {
  return [
    'accept-placeable-interaction',
    normalizedAcceptanceHost(input.host),
    input.database,
    input.identity,
    input.kind,
    input.target.id.toString(),
    `${input.target.spaceId}:${input.target.tileX}:${input.target.tileY}`,
  ].join('|');
}

function slotFingerprint(slots: readonly AcceptanceSlot[]): string {
  return JSON.stringify([...slots]
    .sort((left, right) => left.slot - right.slot)
    .map(({ placeableId, slot, itemKind, quantity, durability, lit }) => ({
      placeableId: placeableId.toString(), slot, itemKind, quantity, durability, lit,
    })));
}

export function acceptanceSlotsEqual(
  before: readonly AcceptanceSlot[],
  after: readonly AcceptanceSlot[],
): boolean {
  return slotFingerprint(before) === slotFingerprint(after);
}

export function planPlaceableAcceptance(input: AcceptancePlanInput): {
  readonly production: boolean;
  readonly confirmation: string;
  readonly inspection: AcceptanceInspection;
  readonly issues: readonly string[];
} {
  const production = isProductionAcceptanceTarget(input.host, input.database);
  const confirmation = placeableAcceptanceConfirmation(input);
  const owned = input.target.placedBy === input.identity;
  const inspection = Object.freeze({
    runtimeDefinitionId: placeableAcceptanceRuntimeDefinitionId(input.target),
    reachPolicy: input.kind === 'chest' ? 'radial_two_tiles' as const : 'exact_faced_tile' as const,
    owned,
    durableSlotFingerprint: owned ? 'available' as const : 'owner_scoped_unavailable' as const,
  });
  const issues: string[] = [];
  if (input.expectedIdentity !== undefined && input.expectedIdentity !== input.identity) {
    issues.push('acceptance_identity_mismatch');
  }
  if (input.target.kind !== input.kind || inspection.runtimeDefinitionId !== DEFINITIONS[input.kind]) {
    issues.push('acceptance_target_kind_mismatch');
  }
  // Authority allows shared containers, but own_placed_placeable_slots is the
  // only durable pre-open fingerprint exposed to this safety harness. Refuse
  // mutation when it cannot prove the before state; inspection remains useful.
  if (!owned) issues.push('acceptance_target_not_owned');
  if (input.target.carriedBy !== null) issues.push('acceptance_target_carried');
  if (input.activePlaceableId !== null) issues.push('acceptance_session_already_active');
  if (input.target.spaceId !== input.position.spaceId) issues.push('acceptance_target_wrong_space');
  const facing = input.position.facing;
  if (input.kind === 'chest') {
    if (input.target.spaceId === input.position.spaceId && !tileTargetWithinFixedReach(
      input.position.x,
      input.position.y,
      input.target,
      CHEST_INTERACTION_REACH_FIXED,
    )) issues.push('acceptance_target_out_of_reach');
  } else {
    if (!isDirection(facing)) issues.push('acceptance_facing_invalid');
    else if (input.target.spaceId === input.position.spaceId) {
      const faced = facedTileTarget(input.position.x, input.position.y, facing);
      if (input.target.tileX !== faced.tileX || input.target.tileY !== faced.tileY) {
        issues.push('acceptance_target_not_faced');
      }
    }
  }
  const capacity = placeableAcceptanceCapacity(input.registry, input.target);
  if (capacity === 0) issues.push('acceptance_container_definition_unavailable');
  if (owned && (input.slots.length !== capacity
    || new Set(input.slots.map(({ slot }) => slot)).size !== capacity
    || input.slots.some(({ placeableId, slot }) => placeableId !== input.target.id
      || !Number.isSafeInteger(slot) || slot < 0 || slot >= capacity))) {
    issues.push('acceptance_slot_projection_incomplete');
  }
  if (input.kind !== 'chest') {
    if (input.target.processStartTick !== null || input.target.processStartedBy !== null
      || input.target.processInputKind !== null) issues.push('acceptance_processor_active');
    if (input.slots.some(({ itemKind, quantity }) => itemKind !== 'empty' || quantity !== 0)) {
      issues.push('acceptance_processor_not_empty');
    }
  }
  if (input.target.open) issues.push('acceptance_target_already_open');
  if (input.mode === 'interact') {
    if (input.expectedIdentity === undefined) issues.push('acceptance_expected_identity_required');
    if (input.confirmation !== confirmation) issues.push('acceptance_confirmation_required');
    if (production && !input.allowProduction) issues.push('acceptance_production_opt_in_required');
  }
  return Object.freeze({ production, confirmation, inspection, issues: Object.freeze(issues) });
}
