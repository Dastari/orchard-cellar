import { describe, expect, it } from 'vitest';
import {
  assertContainerCellMigrationComplete,
  parseContainerCellMigrationStatus,
} from './container-cell-migration-runner.js';

const complete = {
  schemaVersion: 1, layoutVersion: 1,
  players: { current: 3, legacy: 0, planned: 0, planTruncated: false, legacyRows: 0, legacyCells: 0, legacyQuantity: 0, cells: 40 },
  placeables: {
    legacy: 2, copied: 2, uncopied: 0, legacyRows: 32, legacyCells: 5, legacyQuantity: 44,
    legacyFingerprint: 'placeable-cells:5:44:0a1b2c3d', receiptFingerprint: '99aa00bb', receipts: 2, cells: 5, backfillComplete: true,
  },
  issues: [], placeableCopyComplete: true,
};

describe('container-cell migration lane gate (Uncapped Storage step 4)', () => {
  it('accepts a complete copy, optionally pinned to the rehearsal legacy fingerprint', () => {
    const status = parseContainerCellMigrationStatus(JSON.stringify(complete));
    expect(() => assertContainerCellMigrationComplete(status)).not.toThrow();
    expect(() => assertContainerCellMigrationComplete(status, 'placeable-cells:5:44:0a1b2c3d')).not.toThrow();
    expect(() => assertContainerCellMigrationComplete(status, 'placeable-cells:5:44:ffffffff'))
      .toThrow('container_cell_migration_legacy_fingerprint_mismatch');
  });

  it('refuses an unfinished backfill, an uncopied placeable, a refused plan or truncated plan checks', () => {
    const variants = [
      { ...complete, placeables: { ...complete.placeables, backfillComplete: false } },
      { ...complete, placeables: { ...complete.placeables, copied: 1, uncopied: 1 }, placeableCopyComplete: false },
      { ...complete, issues: [{ kind: 'player_plan_refused', id: 'abc', code: 'inventory_layout_rows_invalid' }] },
      { ...complete, issues: [{ kind: 'placeable_receipt_mismatch', id: '9', code: 'container_migration_parity_failed' }] },
      { ...complete, players: { ...complete.players, legacy: 5, planned: 1, planTruncated: true } },
    ];
    for (const variant of variants) {
      expect(() => assertContainerCellMigrationComplete(parseContainerCellMigrationStatus(JSON.stringify(variant)))).toThrow();
    }
  });

  it('fails closed on a malformed report', () => {
    expect(() => parseContainerCellMigrationStatus('{"schemaVersion":2}')).toThrow('container_cell_migration_status_invalid:schemaVersion');
    expect(() => parseContainerCellMigrationStatus(JSON.stringify({ ...complete, players: { ...complete.players, cells: -1 } })))
      .toThrow('container_cell_migration_status_invalid:cells');
    expect(() => parseContainerCellMigrationStatus(JSON.stringify({ ...complete, issues: [{ kind: 'x' }] })))
      .toThrow('container_cell_migration_status_invalid:id');
  });
});
