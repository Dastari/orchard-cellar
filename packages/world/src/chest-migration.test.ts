import { describe, expect, it } from 'vitest';
import {
  CHEST_MIGRATION_ID_BASE,
  chestLegacyTablesDropReady,
  chestReadSwitchReady,
  planChestBackfill,
  planChestDrain,
  planChestMigrationTransition,
  verifyChestMigration,
  type ChestMigrationState,
} from './chest-migration.js';

function source(): ChestMigrationState {
  return {
    legacyChests: [
      { id: 1n, owner: 'owner-a', tileX: -2, tileY: 8, chunkX: -1, chunkY: 0, carriedBy: null, spaceId: 0, open: false },
      { id: 2n, owner: 'owner-b', tileX: 9, tileY: 10, chunkX: 0, chunkY: 0, carriedBy: 'carrier-b', spaceId: 7, open: true },
    ],
    legacySlots: [
      { id: '1:0', chestId: 1n, slot: 0, itemKind: 'axe', quantity: 1, durability: 17, lit: false },
      { id: '1:1', chestId: 1n, slot: 1, itemKind: '', quantity: 0, durability: 0, lit: true },
      { id: '2:0', chestId: 2n, slot: 0, itemKind: 'torch', quantity: 3, durability: 4, lit: true },
    ],
    legacyDamage: [{ chestId: 1n, hits: 3 }],
    placeables: [], placeableSlots: [], placeableDamage: [], mappings: [], occupiedPlaceableIds: [],
  };
}

function applied(state: ChestMigrationState, limit = 100): ChestMigrationState {
  const plan = planChestBackfill(state, { afterChestId: null, limit });
  return { ...state, mappings: [...state.mappings, ...plan.mappings], placeables: plan.placeables,
    placeableSlots: plan.slots, placeableDamage: plan.damage,
    occupiedPlaceableIds: [...state.occupiedPlaceableIds, ...plan.placeables.map(({ id }) => id)] };
}

describe('staged legacy chest migration', () => {
  it('preserves identity mapping, owner, signed position, carry/open state, slots, durability, lit and damage', () => {
    const migrated = applied(source());
    expect(migrated.mappings).toEqual([
      { chestId: 1n, placeableId: CHEST_MIGRATION_ID_BASE + 1n },
      { chestId: 2n, placeableId: CHEST_MIGRATION_ID_BASE + 2n },
    ]);
    expect(migrated.placeables[1]).toMatchObject({ placedBy: 'owner-b', tileX: 9, tileY: 10,
      carriedBy: 'carrier-b', open: true, definitionId: 'object:chest' });
    expect(migrated.placeableSlots[0]).toMatchObject({ itemKind: 'axe', quantity: 1, durability: 17, lit: false });
    expect(migrated.placeableDamage).toEqual([{ placeableId: CHEST_MIGRATION_ID_BASE + 1n, hits: 3 }]);
    expect(chestReadSwitchReady(migrated)).toBe(true);
  });

  it('allocates around collisions, persists the mapping and is idempotent', () => {
    const input = source();
    const first = planChestBackfill({ ...input,
      occupiedPlaceableIds: [CHEST_MIGRATION_ID_BASE + 1n] }, { afterChestId: null, limit: 1 });
    expect(first.mappings[0]?.placeableId).toBe((1n << 64n) - 1n);
    const withMapping = { ...input, placeables: first.placeables, placeableSlots: first.slots,
      placeableDamage: first.damage, mappings: first.mappings };
    const repeated = planChestBackfill(withMapping, { afterChestId: null, limit: 1 });
    expect(repeated.mappings).toEqual([]);
    expect(repeated.placeables).toEqual(first.placeables);
    expect(() => planChestBackfill({ ...input, mappings: first.mappings,
      occupiedPlaceableIds: [first.mappings[0]!.placeableId] }, { afterChestId: null, limit: 1 }))
      .toThrow('chest_migration_mapping_target_missing');
  });

  it('uses an exact bounded cursor and detects any custody drift', () => {
    const input = source(); const first = planChestBackfill(input, { afterChestId: null, limit: 1 });
    expect(first).toMatchObject({ rowsScanned: 1, nextCursor: 1n });
    expect(planChestBackfill(input, { afterChestId: first.nextCursor, limit: 1 })).toMatchObject({ rowsScanned: 1, nextCursor: null });
    expect(() => planChestBackfill(input, { afterChestId: null, limit: 101 })).toThrow('chest_migration_limit_invalid');
    const migrated = applied(input);
    const damaged = { ...migrated, placeableSlots: migrated.placeableSlots.map((slot, index) => index === 0
      ? { ...slot, durability: slot.durability + 1 } : slot) };
    expect(verifyChestMigration(damaged).issues).toContainEqual(expect.objectContaining({ code: 'slot_mismatch', chestId: 1n }));
    expect(chestReadSwitchReady(damaged)).toBe(false);
  });

  it('plans bounded destructive batches only after exact mirror parity and with no active custody', () => {
    const migrated = applied(source());
    const first = planChestDrain(migrated, { afterChestId: null, limit: 1, activeLegacyChestIds: [] });
    expect(first).toMatchObject({ chestIds: [1n], slotIds: ['1:0', '1:1'], damageChestIds: [1n],
      rowsScanned: 1, nextCursor: 1n });
    expect(first.fingerprint).toMatch(/^chest-drain:/u);
    expect(planChestDrain(migrated, { afterChestId: first.nextCursor, limit: 1,
      activeLegacyChestIds: [] })).toMatchObject({ chestIds: [2n], rowsScanned: 1, nextCursor: null });
    expect(() => planChestDrain(migrated, { afterChestId: null, limit: 1,
      activeLegacyChestIds: [2n] })).toThrow('chest_migration_active_custody');
    const drifted = { ...migrated, placeableDamage: [{ placeableId: CHEST_MIGRATION_ID_BASE + 1n, hits: 4 }] };
    expect(() => planChestDrain(drifted, { afterChestId: null, limit: 1,
      activeLegacyChestIds: [] })).toThrow('chest_migration_drain_parity');
  });

  it('refuses table retirement until all consumers switch and every legacy row is literally gone', () => {
    const migrated = applied(source()); const verification = verifyChestMigration(migrated);
    const gate = { dualWriteEnabled: true, readsUsePlaceables: true, clientsUsePlaceables: true,
      studioUsesPlaceables: true, activeLegacyChestIds: [], verificationFingerprint: verification.fingerprint,
      expectedVerificationFingerprint: verification.fingerprint,
      drainFingerprint: 'chest-drain:final', expectedDrainFingerprint: 'chest-drain:final' } as const;
    expect(chestLegacyTablesDropReady(migrated, gate)).toBe(false);
    expect(chestLegacyTablesDropReady({ ...migrated, legacyChests: [], legacySlots: [], legacyDamage: [] }, gate)).toBe(true);
    expect(chestLegacyTablesDropReady({ ...migrated, legacyChests: [], legacySlots: [], legacyDamage: [] },
      { ...gate, clientsUsePlaceables: false })).toBe(false);
    expect(chestLegacyTablesDropReady({ ...migrated, legacyChests: [], legacySlots: [], legacyDamage: [] },
      { ...gate, activeLegacyChestIds: [2n] })).toBe(false);
    expect(chestLegacyTablesDropReady({ ...migrated, legacyChests: [], legacySlots: [], legacyDamage: [] },
      { ...gate, expectedVerificationFingerprint: 'chest-verification:stale' })).toBe(false);
    expect(chestLegacyTablesDropReady({ ...migrated, legacyChests: [], legacySlots: [], legacyDamage: [] },
      { ...gate, expectedDrainFingerprint: 'chest-drain:stale' })).toBe(false);
  });

  it('enforces adjacent one-way phases, exact parity receipts, consumer switching and zero-row retirement', () => {
    const migrated = applied(source()); const verification = verifyChestMigration(migrated);
    const request = { expectedPhase: 'backfill', nextPhase: 'dual_write',
      verificationFingerprint: verification.fingerprint, expectedVerificationFingerprint: verification.fingerprint,
      clientsUsePlaceables: false,
      studioUsesPlaceables: false, activeLegacyChestIds: [], drainFingerprint: '',
      expectedDrainFingerprint: '' } as const;
    expect(planChestMigrationTransition(migrated, 'backfill', request)).toBe('dual_write');
    expect(() => planChestMigrationTransition(migrated, 'legacy_reads', request)).toThrow('chest_migration_phase_stale');
    expect(() => planChestMigrationTransition(migrated, 'backfill', { ...request,
      nextPhase: 'placeable_reads' })).toThrow('chest_migration_phase_invalid');
    expect(() => planChestMigrationTransition(migrated, 'backfill', { ...request,
      verificationFingerprint: 'chest-verification:stale' })).toThrow('chest_migration_verification_stale');

    const readRequest = { ...request, expectedPhase: 'dual_write', nextPhase: 'placeable_reads' } as const;
    expect(planChestMigrationTransition(migrated, 'dual_write', readRequest)).toBe('placeable_reads');
    const drainRequest = { ...request, expectedPhase: 'placeable_reads', nextPhase: 'draining',
      clientsUsePlaceables: true, studioUsesPlaceables: true } as const;
    expect(planChestMigrationTransition(migrated, 'placeable_reads', drainRequest)).toBe('draining');
    expect(() => planChestMigrationTransition(migrated, 'placeable_reads', { ...drainRequest,
      activeLegacyChestIds: [1n] })).toThrow('chest_migration_consumer_not_ready');

    const empty = { ...migrated, legacyChests: [], legacySlots: [], legacyDamage: [] };
    expect(planChestMigrationTransition(empty, 'draining', { ...drainRequest,
      expectedPhase: 'draining', nextPhase: 'drop_ready', drainFingerprint: 'chest-drain:final',
      expectedDrainFingerprint: 'chest-drain:final' })).toBe('drop_ready');
    expect(() => planChestMigrationTransition(empty, 'draining', { ...drainRequest,
      expectedPhase: 'draining', nextPhase: 'drop_ready', drainFingerprint: 'chest-drain:final',
      expectedDrainFingerprint: 'chest-drain:other' })).toThrow('chest_migration_drop_not_ready');
  });
});
