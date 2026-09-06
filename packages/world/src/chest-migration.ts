export const CHEST_MIGRATION_BATCH_MAX = 100;
export const CHEST_MIGRATION_ID_BASE = 1n << 63n;
export const U64_MAX = (1n << 64n) - 1n;

export interface LegacyChestRow {
  readonly id: bigint;
  readonly owner: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly carriedBy: string | null;
  readonly spaceId: number;
  readonly open: boolean;
}

export interface LegacyChestSlotRow {
  readonly id: string;
  readonly chestId: bigint;
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
}

export interface LegacyChestDamageRow { readonly chestId: bigint; readonly hits: number }

export interface MigratedPlaceableRow {
  readonly id: bigint;
  readonly kind: 'chest';
  readonly tileX: number;
  readonly tileY: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly spaceId: number;
  readonly placedBy: string;
  readonly facing: 'down';
  readonly open: boolean;
  readonly lit: true;
  readonly carriedBy: string | null;
  readonly definitionId: 'object:chest';
  readonly stateJson: string;
}

export interface MigratedPlaceableSlotRow {
  readonly id: string;
  readonly placeableId: bigint;
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
}

export interface MigratedPlaceableDamageRow { readonly placeableId: bigint; readonly hits: number }
export interface ChestMigrationMapping { readonly chestId: bigint; readonly placeableId: bigint }

export interface ChestMigrationState {
  readonly legacyChests: readonly LegacyChestRow[];
  readonly legacySlots: readonly LegacyChestSlotRow[];
  readonly legacyDamage: readonly LegacyChestDamageRow[];
  readonly placeables: readonly MigratedPlaceableRow[];
  readonly placeableSlots: readonly MigratedPlaceableSlotRow[];
  readonly placeableDamage: readonly MigratedPlaceableDamageRow[];
  readonly mappings: readonly ChestMigrationMapping[];
  /** Includes every generic placeable id, not only mapped chest mirrors. */
  readonly occupiedPlaceableIds: readonly bigint[];
}

export interface ChestBackfillRequest { readonly afterChestId: bigint | null; readonly limit: number }
export interface ChestBackfillPlan {
  readonly mappings: readonly ChestMigrationMapping[];
  readonly placeables: readonly MigratedPlaceableRow[];
  readonly slots: readonly MigratedPlaceableSlotRow[];
  readonly damage: readonly MigratedPlaceableDamageRow[];
  readonly nextCursor: bigint | null;
  readonly rowsScanned: number;
  readonly sourceFingerprint: string;
}

export interface ChestMigrationIssue {
  readonly code: 'mapping_duplicate' | 'mapping_orphan' | 'placeable_missing' | 'placeable_mismatch'
    | 'slot_mismatch' | 'damage_mismatch' | 'unexpected_mirror_slot' | 'unexpected_mirror_damage';
  readonly chestId: bigint;
  readonly detail: string;
}

export interface ChestMigrationVerification {
  readonly legacyChestCount: number;
  readonly legacySlotCount: number;
  readonly legacyDamageCount: number;
  readonly verifiedChestCount: number;
  readonly issues: readonly ChestMigrationIssue[];
  readonly fingerprint: string;
}

export interface ChestRetirementGate {
  readonly dualWriteEnabled: boolean;
  readonly readsUsePlaceables: boolean;
  readonly clientsUsePlaceables: boolean;
  readonly studioUsesPlaceables: boolean;
  readonly activeLegacyChestIds: readonly bigint[];
  readonly verificationFingerprint: string;
  readonly expectedVerificationFingerprint: string;
  readonly drainFingerprint: string;
  readonly expectedDrainFingerprint: string;
}

export type ChestMigrationPhase = 'legacy_reads' | 'backfill' | 'dual_write'
  | 'placeable_reads' | 'draining' | 'drop_ready';

export interface ChestMigrationTransitionRequest {
  readonly expectedPhase: ChestMigrationPhase;
  readonly nextPhase: ChestMigrationPhase;
  readonly verificationFingerprint: string;
  readonly expectedVerificationFingerprint: string;
  readonly clientsUsePlaceables: boolean;
  readonly studioUsesPlaceables: boolean;
  readonly activeLegacyChestIds: readonly bigint[];
  readonly drainFingerprint: string;
  readonly expectedDrainFingerprint: string;
}

export interface ChestDrainRequest {
  readonly afterChestId: bigint | null;
  readonly limit: number;
  readonly activeLegacyChestIds: readonly bigint[];
}

export interface ChestDrainPlan {
  readonly chestIds: readonly bigint[];
  readonly slotIds: readonly string[];
  readonly damageChestIds: readonly bigint[];
  readonly nextCursor: bigint | null;
  readonly rowsScanned: number;
  readonly fingerprint: string;
}

function fail(message: string): never { throw new Error(message); }

function validU64(value: bigint): boolean { return value >= 0n && value <= U64_MAX; }

function stableJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(`${value}n`);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
}

function fingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of stableJson(value)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function stateJson(chest: LegacyChestRow): string {
  return stableJson({ open: chest.open });
}

export function migratedPlaceable(chest: LegacyChestRow, placeableId: bigint): MigratedPlaceableRow {
  if (!validU64(chest.id) || !validU64(placeableId)) fail('chest_migration_id_invalid');
  return Object.freeze({
    id: placeableId, kind: 'chest', tileX: chest.tileX, tileY: chest.tileY,
    chunkX: chest.chunkX, chunkY: chest.chunkY, spaceId: chest.spaceId,
    placedBy: chest.owner, facing: 'down', open: chest.open, lit: true,
    carriedBy: chest.carriedBy, definitionId: 'object:chest', stateJson: stateJson(chest),
  });
}

export function migratedSlot(slot: LegacyChestSlotRow, placeableId: bigint): MigratedPlaceableSlotRow {
  return Object.freeze({ id: `${placeableId}:${slot.slot}`, placeableId, slot: slot.slot,
    itemKind: slot.itemKind, quantity: slot.quantity, durability: slot.durability, lit: slot.lit });
}

function allocatePlaceableId(chestId: bigint, occupied: Set<bigint>): bigint {
  const preferred = CHEST_MIGRATION_ID_BASE + chestId;
  if (preferred <= U64_MAX && !occupied.has(preferred)) return preferred;
  // Descending allocation is deterministic for a sorted source batch and cannot
  // collide with an existing or already planned generic placeable id.
  for (let candidate = U64_MAX; candidate >= CHEST_MIGRATION_ID_BASE; candidate -= 1n) {
    if (!occupied.has(candidate)) return candidate;
  }
  return fail('chest_migration_id_space_exhausted');
}

function mappingByChest(state: ChestMigrationState): Map<bigint, bigint> {
  const result = new Map<bigint, bigint>(); const placeableIds = new Set<bigint>();
  for (const mapping of state.mappings) {
    if (result.has(mapping.chestId) || placeableIds.has(mapping.placeableId)) fail('chest_migration_mapping_duplicate');
    result.set(mapping.chestId, mapping.placeableId); placeableIds.add(mapping.placeableId);
  }
  return result;
}

/** Pure bounded plan. Applying its upserts and mappings twice is a no-op. */
export function planChestBackfill(state: ChestMigrationState, request: ChestBackfillRequest): ChestBackfillPlan {
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > CHEST_MIGRATION_BATCH_MAX) {
    fail('chest_migration_limit_invalid');
  }
  const existingMappings = mappingByChest(state);
  const occupied = new Set(state.occupiedPlaceableIds);
  for (const { id } of state.placeables) occupied.add(id);
  for (const id of existingMappings.values()) occupied.add(id);
  const source = [...state.legacyChests].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .filter(({ id }) => request.afterChestId === null || id > request.afterChestId);
  const batch = source.slice(0, request.limit);
  const mappings: ChestMigrationMapping[] = [];
  const placeables: MigratedPlaceableRow[] = [];
  const slots: MigratedPlaceableSlotRow[] = [];
  const damage: MigratedPlaceableDamageRow[] = [];
  for (const chest of batch) {
    const placeableId = existingMappings.get(chest.id) ?? allocatePlaceableId(chest.id, occupied);
    if (existingMappings.has(chest.id) && !state.placeables.some(({ id }) => id === placeableId)) {
      fail('chest_migration_mapping_target_missing');
    }
    if (!existingMappings.has(chest.id)) mappings.push(Object.freeze({ chestId: chest.id, placeableId }));
    occupied.add(placeableId);
    placeables.push(migratedPlaceable(chest, placeableId));
    slots.push(...state.legacySlots.filter(({ chestId }) => chestId === chest.id)
      .sort((left, right) => left.slot - right.slot).map((slot) => migratedSlot(slot, placeableId)));
    const sourceDamage = state.legacyDamage.find(({ chestId }) => chestId === chest.id);
    if (sourceDamage !== undefined) damage.push(Object.freeze({ placeableId, hits: sourceDamage.hits }));
  }
  const last = batch.length === 0 ? null : batch[batch.length - 1]!.id;
  return Object.freeze({
    mappings: Object.freeze(mappings), placeables: Object.freeze(placeables), slots: Object.freeze(slots),
    damage: Object.freeze(damage), nextCursor: source.length > batch.length ? last : null,
    rowsScanned: batch.length,
    sourceFingerprint: `chest:${fingerprint(batch.map((chest) => ({ chest,
      slots: state.legacySlots.filter(({ chestId }) => chestId === chest.id),
      damage: state.legacyDamage.find(({ chestId }) => chestId === chest.id) ?? null })))}`,
  });
}

function same(left: unknown, right: unknown): boolean { return stableJson(left) === stableJson(right); }

/** Exact source/mirror comparison used before read switching and before each
 * destructive legacy drain batch. */
export function verifyChestMigration(state: ChestMigrationState): ChestMigrationVerification {
  const issues: ChestMigrationIssue[] = [];
  let mappings: Map<bigint, bigint>;
  try { mappings = mappingByChest(state); }
  catch { mappings = new Map(); issues.push({ code: 'mapping_duplicate', chestId: 0n, detail: 'Mapping ids are not one-to-one.' }); }
  const legacyIds = new Set(state.legacyChests.map(({ id }) => id));
  for (const mapping of state.mappings) if (!legacyIds.has(mapping.chestId)) {
    issues.push({ code: 'mapping_orphan', chestId: mapping.chestId, detail: 'Mapping has no legacy source row.' });
  }
  let verifiedChestCount = 0;
  for (const chest of state.legacyChests) {
    const placeableId = mappings.get(chest.id);
    const mirror = placeableId === undefined ? undefined : state.placeables.find(({ id }) => id === placeableId);
    if (placeableId === undefined || mirror === undefined) {
      issues.push({ code: 'placeable_missing', chestId: chest.id, detail: 'No mapped generic placeable exists.' }); continue;
    }
    if (!same(mirror, migratedPlaceable(chest, placeableId))) {
      issues.push({ code: 'placeable_mismatch', chestId: chest.id, detail: 'Owner/spatial/carry/open/authored fields differ.' });
    }
    const expectedSlots = state.legacySlots.filter(({ chestId }) => chestId === chest.id)
      .sort((left, right) => left.slot - right.slot).map((slot) => migratedSlot(slot, placeableId));
    const actualSlots = state.placeableSlots.filter(({ placeableId: candidate }) => candidate === placeableId)
      .sort((left, right) => left.slot - right.slot);
    if (!same(actualSlots, expectedSlots)) issues.push({ code: actualSlots.length > expectedSlots.length
      ? 'unexpected_mirror_slot' : 'slot_mismatch', chestId: chest.id, detail: 'Slot item/quantity/durability/lit custody differs.' });
    const expectedDamage = state.legacyDamage.find(({ chestId }) => chestId === chest.id);
    const actualDamage = state.placeableDamage.find(({ placeableId: candidate }) => candidate === placeableId);
    if (expectedDamage === undefined ? actualDamage !== undefined : actualDamage?.hits !== expectedDamage.hits) {
      issues.push({ code: expectedDamage === undefined ? 'unexpected_mirror_damage' : 'damage_mismatch',
        chestId: chest.id, detail: 'Break-progress damage differs.' });
    }
    if (!issues.some(({ chestId }) => chestId === chest.id)) verifiedChestCount += 1;
  }
  const summary = { legacyChestCount: state.legacyChests.length, legacySlotCount: state.legacySlots.length,
    legacyDamageCount: state.legacyDamage.length, verifiedChestCount, issues: Object.freeze(issues) };
  return Object.freeze({ ...summary, fingerprint: `chest-verification:${fingerprint(summary)}` });
}

export function chestReadSwitchReady(state: ChestMigrationState): boolean {
  const verification = verifyChestMigration(state);
  return verification.issues.length === 0 && verification.verifiedChestCount === verification.legacyChestCount;
}

/** Plans one exact, bounded legacy deletion batch. The authority applies these
 * identifiers transactionally only after the corresponding generic rows compare
 * equal. No active legacy session may exist anywhere while draining. */
export function planChestDrain(state: ChestMigrationState, request: ChestDrainRequest): ChestDrainPlan {
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > CHEST_MIGRATION_BATCH_MAX) {
    fail('chest_migration_limit_invalid');
  }
  if (request.activeLegacyChestIds.length !== 0) fail('chest_migration_active_custody');
  const source = [...state.legacyChests].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .filter(({ id }) => request.afterChestId === null || id > request.afterChestId);
  const batch = source.slice(0, request.limit);
  const chestIds = new Set(batch.map(({ id }) => id));
  const mappings = state.mappings.filter(({ chestId }) => chestIds.has(chestId));
  const placeableIds = new Set(mappings.map(({ placeableId }) => placeableId));
  const scoped: ChestMigrationState = {
    legacyChests: batch,
    legacySlots: state.legacySlots.filter(({ chestId }) => chestIds.has(chestId)),
    legacyDamage: state.legacyDamage.filter(({ chestId }) => chestIds.has(chestId)),
    placeables: state.placeables.filter(({ id }) => placeableIds.has(id)),
    placeableSlots: state.placeableSlots.filter(({ placeableId }) => placeableIds.has(placeableId)),
    placeableDamage: state.placeableDamage.filter(({ placeableId }) => placeableIds.has(placeableId)),
    mappings, occupiedPlaceableIds: [...placeableIds],
  };
  const verification = verifyChestMigration(scoped);
  if (verification.issues.length !== 0 || verification.verifiedChestCount !== batch.length) {
    fail('chest_migration_drain_parity');
  }
  const last = batch.length === 0 ? null : batch[batch.length - 1]!.id;
  const receipt = { chestIds: batch.map(({ id }) => id),
    slotIds: scoped.legacySlots.map(({ id }) => id).sort(),
    damageChestIds: scoped.legacyDamage.map(({ chestId }) => chestId)
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0), verification: verification.fingerprint };
  return Object.freeze({ chestIds: Object.freeze(receipt.chestIds), slotIds: Object.freeze(receipt.slotIds),
    damageChestIds: Object.freeze(receipt.damageChestIds), nextCursor: source.length > batch.length ? last : null,
    rowsScanned: batch.length, fingerprint: `chest-drain:${fingerprint(receipt)}` });
}

const NEXT_CHEST_MIGRATION_PHASE: Readonly<Record<ChestMigrationPhase, ChestMigrationPhase | null>> = Object.freeze({
  legacy_reads: 'backfill', backfill: 'dual_write', dual_write: 'placeable_reads',
  placeable_reads: 'draining', draining: 'drop_ready', drop_ready: null,
});

/** Guards the persisted owner-controlled state machine. Every transition is
 * one-way and adjacent; parity is re-proved immediately before dual-write/read
 * switching and again before draining. */
export function planChestMigrationTransition(
  state: ChestMigrationState,
  currentPhase: ChestMigrationPhase,
  request: ChestMigrationTransitionRequest,
): ChestMigrationPhase {
  if (request.expectedPhase !== currentPhase) fail('chest_migration_phase_stale');
  if (NEXT_CHEST_MIGRATION_PHASE[currentPhase] !== request.nextPhase) fail('chest_migration_phase_invalid');
  if (request.nextPhase === 'backfill') return request.nextPhase;

  const verification = verifyChestMigration(state);
  const parityRequired = request.nextPhase === 'dual_write' || request.nextPhase === 'placeable_reads'
    || request.nextPhase === 'draining';
  if (parityRequired && (verification.issues.length !== 0
    || verification.verifiedChestCount !== verification.legacyChestCount
    || request.verificationFingerprint !== verification.fingerprint)) {
    fail('chest_migration_verification_stale');
  }
  if (request.nextPhase === 'draining' && (!request.clientsUsePlaceables || !request.studioUsesPlaceables
    || request.activeLegacyChestIds.length !== 0)) fail('chest_migration_consumer_not_ready');
  if (request.nextPhase === 'drop_ready') {
    const ready = chestLegacyTablesDropReady(state, {
      dualWriteEnabled: true, readsUsePlaceables: true,
      clientsUsePlaceables: request.clientsUsePlaceables, studioUsesPlaceables: request.studioUsesPlaceables,
      activeLegacyChestIds: request.activeLegacyChestIds,
      verificationFingerprint: request.verificationFingerprint,
      expectedVerificationFingerprint: request.expectedVerificationFingerprint,
      drainFingerprint: request.drainFingerprint,
      expectedDrainFingerprint: request.expectedDrainFingerprint,
    });
    if (!ready) fail('chest_migration_drop_not_ready');
  }
  return request.nextPhase;
}

/** Tables are drop-ready only after an independently recorded exact verification,
 * all readers have switched, and a bounded drain has reached literal zero rows. */
export function chestLegacyTablesDropReady(state: ChestMigrationState, gate: ChestRetirementGate): boolean {
  return gate.dualWriteEnabled && gate.readsUsePlaceables && gate.clientsUsePlaceables && gate.studioUsesPlaceables
    && gate.activeLegacyChestIds.length === 0
    && state.legacyChests.length === 0 && state.legacySlots.length === 0 && state.legacyDamage.length === 0
    && gate.verificationFingerprint.startsWith('chest-verification:')
    && gate.verificationFingerprint === gate.expectedVerificationFingerprint
    && gate.drainFingerprint.startsWith('chest-drain:')
    && gate.drainFingerprint === gate.expectedDrainFingerprint;
}
