import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertChestMigrationDropReady,
  assertChestMigrationPlaceableReadsReady,
  parseChestMigrationStatus,
  runChestMigration,
} from './chest-migration-runner.js';

const valid = {
  schemaVersion: 1, phase: 'drop_ready', cursor: null, backfillComplete: true,
  verificationFingerprint: 'verify:abc', verificationChestCount: '2', verificationSlotCount: '36',
  verificationDamageCount: '1', drainFingerprint: 'drain:def', clientsUsePlaceables: true,
  studioUsesPlaceables: true, legacyChestCount: '0', legacySlotCount: '0', legacyDamageCount: '0',
  mappingCount: '0', activeLegacySessionCount: '0', activeGenericSessionCount: '0',
};

describe('guarded chest migration runner', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it('strictly parses an exact status receipt and accepts literal drop readiness', () => {
    const status = parseChestMigrationStatus(JSON.stringify(valid));
    expect(() => assertChestMigrationDropReady(status)).not.toThrow();
  });

  it('accepts a verified placeable-read stage only while legacy rows and mappings still match', () => {
    const staged = parseChestMigrationStatus(JSON.stringify({
      ...valid, phase: 'placeable_reads', drainFingerprint: '', legacyChestCount: '2',
      legacySlotCount: '36', legacyDamageCount: '1', mappingCount: '2',
    }));
    expect(() => assertChestMigrationPlaceableReadsReady(staged)).not.toThrow();
    expect(() => assertChestMigrationPlaceableReadsReady({ ...staged, mappingCount: '1' }))
      .toThrow('chest_migration_placeable_reads_not_ready');
    expect(() => assertChestMigrationPlaceableReadsReady({ ...staged, drainFingerprint: 'already-drained' }))
      .toThrow('chest_migration_placeable_reads_not_ready');
  });

  it.each([
    ['phase', { phase: 'draining' }],
    ['legacy chest', { legacyChestCount: '1' }],
    ['legacy slot', { legacySlotCount: '1' }],
    ['mapping', { mappingCount: '1' }],
    ['active session', { activeLegacySessionCount: '1' }],
    ['generic active session', { activeGenericSessionCount: '1' }],
    ['consumer', { clientsUsePlaceables: false }],
    ['receipt', { drainFingerprint: '' }],
  ])('fails closed when %s is not ready', (_label, patch) => {
    const status = parseChestMigrationStatus(JSON.stringify({ ...valid, ...patch }));
    expect(() => assertChestMigrationDropReady(status)).toThrow('chest_migration_drop_not_ready');
  });

  it('rejects malformed, unknown-phase, and non-decimal status fields', () => {
    expect(() => parseChestMigrationStatus('[]')).toThrow('chest_migration_status_invalid');
    expect(() => parseChestMigrationStatus(JSON.stringify({ ...valid, phase: 'finished' })))
      .toThrow('chest_migration_status_invalid:phase');
    expect(() => parseChestMigrationStatus(JSON.stringify({ ...valid, mappingCount: '-1' })))
      .toThrow('chest_migration_status_invalid:mappingCount');
  });

  it('executes the exact resumable phase, verification, acknowledgement, and drain order', async () => {
    vi.stubEnv('CHEST_MIGRATION_CLIENTS_READY', '1');
    vi.stubEnv('CHEST_MIGRATION_STUDIO_READY', '1');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const statusRows = [
      { ...valid, phase: 'legacy_reads', backfillComplete: false, verificationFingerprint: '',
        drainFingerprint: '', clientsUsePlaceables: false, studioUsesPlaceables: false,
        legacyChestCount: '1', legacySlotCount: '18', mappingCount: '0' },
      { ...valid, phase: 'backfill', backfillComplete: false, verificationFingerprint: '', drainFingerprint: '',
        clientsUsePlaceables: false, studioUsesPlaceables: false,
        legacyChestCount: '1', legacySlotCount: '18', mappingCount: '0' },
      { ...valid, phase: 'backfill', verificationFingerprint: '', drainFingerprint: '',
        clientsUsePlaceables: false, studioUsesPlaceables: false,
        legacyChestCount: '1', legacySlotCount: '18', mappingCount: '1' },
      { ...valid, phase: 'backfill', drainFingerprint: '', clientsUsePlaceables: false,
        studioUsesPlaceables: false, legacyChestCount: '1', legacySlotCount: '18', mappingCount: '1' },
      { ...valid, phase: 'dual_write', drainFingerprint: '', clientsUsePlaceables: false,
        studioUsesPlaceables: false, legacyChestCount: '1', legacySlotCount: '18', mappingCount: '1' },
      { ...valid, phase: 'dual_write', drainFingerprint: '', clientsUsePlaceables: false,
        studioUsesPlaceables: false, legacyChestCount: '1', legacySlotCount: '18', mappingCount: '1' },
      { ...valid, phase: 'placeable_reads', drainFingerprint: '', legacyChestCount: '1',
        legacySlotCount: '18', mappingCount: '1' },
      { ...valid, phase: 'placeable_reads', drainFingerprint: '', legacyChestCount: '1',
        legacySlotCount: '18', mappingCount: '1' },
      { ...valid, phase: 'draining', drainFingerprint: '', legacyChestCount: '1',
        legacySlotCount: '18', mappingCount: '1' },
      { ...valid, phase: 'draining' },
      valid,
    ];
    const calls: string[] = [];
    const connection = {
      procedures: { adminChestMigrationStatus: async () => JSON.stringify(statusRows.shift()) },
      reducers: {
        adminBackfillLegacyChests: async () => { calls.push('backfill'); },
        adminVerifyLegacyChests: async ({ expectedPhase }: { expectedPhase: string }) => {
          calls.push(`verify:${expectedPhase}`);
        },
        adminSetChestMigrationPhase: async ({ nextPhase }: { nextPhase: string }) => {
          calls.push(`phase:${nextPhase}`);
        },
        adminDrainLegacyChests: async () => { calls.push('drain'); },
      },
    };
    await expect(runChestMigration(connection as never)).resolves.toMatchObject({ phase: 'drop_ready' });
    expect(calls).toEqual([
      'phase:backfill', 'backfill', 'verify:backfill', 'phase:dual_write',
      'verify:dual_write', 'phase:placeable_reads', 'verify:placeable_reads',
      'phase:draining', 'drain', 'phase:drop_ready',
    ]);
    expect(statusRows).toHaveLength(0);
  });

  it('stops after a fresh placeable-read verification without entering drain', async () => {
    vi.stubEnv('CHEST_MIGRATION_CLIENTS_READY', '1');
    vi.stubEnv('CHEST_MIGRATION_STUDIO_READY', '1');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const staged = {
      ...valid, phase: 'placeable_reads', drainFingerprint: '', legacyChestCount: '2',
      legacySlotCount: '36', legacyDamageCount: '1', mappingCount: '2',
    };
    const statusRows = [staged, staged];
    const calls: string[] = [];
    const connection = {
      procedures: { adminChestMigrationStatus: async () => JSON.stringify(statusRows.shift()) },
      reducers: {
        adminBackfillLegacyChests: async () => { calls.push('backfill'); },
        adminVerifyLegacyChests: async ({ expectedPhase }: { expectedPhase: string }) => {
          calls.push(`verify:${expectedPhase}`);
        },
        adminSetChestMigrationPhase: async ({ nextPhase }: { nextPhase: string }) => {
          calls.push(`phase:${nextPhase}`);
        },
        adminDrainLegacyChests: async () => { calls.push('drain'); },
      },
    };
    await expect(runChestMigration(connection as never, 'placeable_reads'))
      .resolves.toMatchObject({ phase: 'placeable_reads', legacyChestCount: '2' });
    expect(calls).toEqual(['verify:placeable_reads']);
    expect(statusRows).toHaveLength(0);
  });

  it('refuses a placeable-read stage request after drain has begun', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const connection = {
      procedures: { adminChestMigrationStatus: async () => JSON.stringify({ ...valid, phase: 'draining' }) },
      reducers: {},
    };
    await expect(runChestMigration(connection as never, 'placeable_reads'))
      .rejects.toThrow('chest_migration_requested_stage_already_passed');
  });

  it('requires an already accepted placeable-read start when finalizing restored deployed bytes', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const connection = {
      procedures: { adminChestMigrationStatus: async () => JSON.stringify({ ...valid, phase: 'dual_write' }) },
      reducers: {},
    };
    await expect(runChestMigration(connection as never, 'placeable_reads', true))
      .rejects.toThrow('chest_migration_placeable_reads_start_required');
  });
});
