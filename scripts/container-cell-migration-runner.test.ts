import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdbLogger } from 'spacetimedb';
import { describe, expect, it, vi } from 'vitest';
import {
  assertContainerCellMigrationComplete,
  LEGACY_PLACEABLE_FINGERPRINT,
  LEGACY_PLAYER_FINGERPRINT,
  runContainerCellMigration,
  parseContainerCellMigrationStatus,
  readContainerCellMigrationEvidence,
  routeConsoleToStderr,
} from './container-cell-migration-runner.js';

const complete = {
  schemaVersion: 1, layoutVersion: 1,
  players: { current: 3, legacy: 0, planned: 0, planTruncated: false, legacyRows: 0, legacyCells: 0, legacyQuantity: 0, cells: 40,
    legacyFingerprint: 'player-custody-world:3:40:612:1a2b3c4d', cellFingerprint: 'player-custody-world:3:40:612:1a2b3c4d',
    orphans: { owners: 0, inventoryOwners: 0, stashOwners: 0, withoutMigrationRow: 0, quantity: 0, ids: [] } },
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
    expect(() => assertContainerCellMigrationComplete(status, { placeables: 'placeable-cells:5:44:0a1b2c3d',
      players: 'player-custody-world:3:40:612:1a2b3c4d' })).not.toThrow();
    expect(() => assertContainerCellMigrationComplete(status, { placeables: 'placeable-cells:5:44:ffffffff' }))
      .toThrow('container_cell_migration_legacy_fingerprint_mismatch');
    expect(() => assertContainerCellMigrationComplete(status, { players: 'player-custody-world:3:40:612:ffffffff' }))
      .toThrow('container_cell_migration_player_fingerprint_mismatch');
  });

  it('refuses when player cells do not hold the legacy custody, or the player fingerprint is missing', () => {
    const withPlayers = (players: object) => parseContainerCellMigrationStatus(JSON.stringify({ ...complete, players: { ...complete.players, ...players } }));
    expect(() => assertContainerCellMigrationComplete(withPlayers({ cellFingerprint: 'player-custody-world:3:40:611:99999999' })))
      .toThrow('container_cell_migration_player_custody_mismatch');
    expect(() => assertContainerCellMigrationComplete(withPlayers({ legacyFingerprint: '', cellFingerprint: '' })))
      .toThrow('container_cell_migration_player_fingerprint_invalid');
    // Orphan legacy rows are reported, not refused: connect moves them.
    const orphaned = withPlayers({ orphans: { owners: 1, inventoryOwners: 1, stashOwners: 0, withoutMigrationRow: 0, quantity: 7, ids: ['e5'] } });
    expect(orphaned.players.orphans.ids).toEqual(['e5']);
    expect(() => assertContainerCellMigrationComplete(orphaned)).not.toThrow();
  });

  it('refuses production before its first batch when its legacy player rows differ from the rehearsal', async () => {
    const started = { ...complete, players: { ...complete.players, current: 0, legacy: 3 },
      placeables: { ...complete.placeables, backfillComplete: false, copied: 0, uncopied: 2 }, placeableCopyComplete: false };
    const batches: string[] = [];
    const connection = {
      procedures: { adminContainerCellMigrationStatus: async () => JSON.stringify(started) },
      reducers: {
        adminBackfillPlaceableContainerCells: async () => { batches.push('placeables'); },
        adminBackfillPlayerContainerCells: async () => { batches.push('players'); },
      },
    };
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await expect(runContainerCellMigration(connection as never, { players: 'player-custody-world:3:40:612:ffffffff' }))
        .rejects.toThrow('container_cell_migration_player_fingerprint_mismatch');
      await expect(runContainerCellMigration(connection as never, { placeables: 'placeable-cells:5:44:ffffffff' }))
        .rejects.toThrow('container_cell_migration_legacy_fingerprint_mismatch');
    } finally { stdout.mockRestore(); }
    expect(batches).toEqual([]);
  });

  it('refuses an unfinished backfill, an uncopied placeable, a refused plan or truncated plan checks', () => {
    const variants = [
      { ...complete, placeables: { ...complete.placeables, backfillComplete: false } },
      { ...complete, placeables: { ...complete.placeables, copied: 1, uncopied: 1 }, placeableCopyComplete: false },
      { ...complete, issues: [{ kind: 'player_plan_refused', id: 'abc', code: 'inventory_layout_rows_invalid' }] },
      { ...complete, issues: [{ kind: 'placeable_receipt_mismatch', id: '9', code: 'container_migration_parity_failed' }] },
      { ...complete, players: { ...complete.players, legacy: 5, planned: 1, planTruncated: true } },
      { ...complete, issues: [{ kind: 'player_custody_invalid', id: 'e5', code: 'inventory_layout_rows_invalid' }] },
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
    const { legacyFingerprint: _dropped, ...withoutPlayerFingerprint } = complete.players;
    expect(() => parseContainerCellMigrationStatus(JSON.stringify({ ...complete, players: withoutPlayerFingerprint })))
      .toThrow('container_cell_migration_status_invalid:legacyFingerprint');
    expect(() => parseContainerCellMigrationStatus(JSON.stringify({ ...complete, players: { ...complete.players, orphans: { ...complete.players.orphans, ids: [1] } } })))
      .toThrow('container_cell_migration_status_invalid:ids');
  });

  it('keeps stdout to JSON lines: SDK connection logs go to stderr', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const restore = routeConsoleToStderr();
    let stdoutCalls: number;
    let logged: string;
    try {
      stdbLogger('info', 'Connecting to SpacetimeDB WS...');
      stdbLogger('error', 'socket closed');
      console.warn('warning');
    } finally {
      restore();
      stdoutCalls = stdout.mock.calls.length;
      logged = stderr.mock.calls.map(([text]) => String(text)).join('');
      stdout.mockRestore();
      stderr.mockRestore();
    }
    expect(stdoutCalls).toBe(0);
    expect(logged).toContain('INFO');
    expect(logged).toContain('Connecting to SpacetimeDB WS...');
    expect(logged).toContain('socket closed');
    expect(logged).toContain('warning');
    expect(logged).not.toContain('%c');
  });

  it('recognises only the legacy placeable and player fingerprint shapes the lane compares', () => {
    expect(LEGACY_PLACEABLE_FINGERPRINT.test('placeable-cells:149:7139:4b681419')).toBe(true);
    for (const value of ['', 'placeable-cells:149:7139:4B681419', 'player-cells:1:1:00000000', 'placeable-cells:1:1:0000000'])
      expect(LEGACY_PLACEABLE_FINGERPRINT.test(value), value).toBe(false);
    expect(LEGACY_PLAYER_FINGERPRINT.test('player-custody-world:0:0:0:811c9dc5')).toBe(true);
    for (const value of ['', 'player-custody:3:9:1a2b3c4d', 'player-custody-world:3:9:1a2b3c4d', 'placeable-cells:5:44:0a1b2c3d'])
      expect(LEGACY_PLAYER_FINGERPRINT.test(value), value).toBe(false);
  });

  it('reads the lane evidence log: the final complete report and ok line name one legacy fingerprint', () => {
    const status = (value: object) => JSON.stringify({ event: 'container_cell_migration_status', database: 'orchard-cellar-world', ...value });
    const started = { ...complete, placeables: { ...complete.placeables, copied: 0, uncopied: 2, receipts: 0, backfillComplete: false }, placeableCopyComplete: false };
    const ok = { ok: true, target: 'rehearsal', database: 'orchard-cellar-world', legacyFingerprint: 'placeable-cells:5:44:0a1b2c3d',
      receiptFingerprint: '99aa00bb', playerLegacyFingerprint: 'player-custody-world:3:40:612:1a2b3c4d',
      playerCellFingerprint: 'player-custody-world:3:40:612:1a2b3c4d', placeablesCopied: 2, playersCurrent: 3, playersLegacy: 0 };
    const log = `${status(started)}\n${status(complete)}\n${JSON.stringify(ok)}\n`;
    expect(readContainerCellMigrationEvidence(log)).toMatchObject({
      legacyFingerprint: 'placeable-cells:5:44:0a1b2c3d', receiptFingerprint: '99aa00bb',
      playerLegacyFingerprint: 'player-custody-world:3:40:612:1a2b3c4d',
    });
    const mismatched = { ...complete, players: { ...complete.players, cellFingerprint: 'player-custody-world:3:40:611:99999999' } };
    const refused: readonly [string, string][] = [
      ['', 'container_cell_migration_log_invalid:incomplete'],
      // SDK noise on stdout (the rehearsal finding) is refused rather than skipped.
      [`ℹ️ INFO Connecting to SpacetimeDB WS...\n${log}`, 'container_cell_migration_log_invalid:not_json_lines'],
      [`${status(started)}\n${status(complete)}\n`, 'container_cell_migration_log_invalid:incomplete'],
      [`${status(started)}\n${JSON.stringify(ok)}\n`, 'container_cell_migration_placeables_incomplete'],
      [`${status(complete)}\n${JSON.stringify({ ...ok, legacyFingerprint: 'placeable-cells:5:44:ffffffff' })}\n`,
        'container_cell_migration_log_invalid:fingerprint'],
      [`${status(complete)}\n${JSON.stringify({ ...ok, receiptFingerprint: '00000000' })}\n`, 'container_cell_migration_log_invalid:fingerprint'],
      [`${status(complete)}\n${JSON.stringify({ ...ok, playerLegacyFingerprint: 'player-custody-world:3:40:612:ffffffff' })}\n`,
        'container_cell_migration_log_invalid:fingerprint'],
      [`${status(complete)}\n${JSON.stringify({ ...ok, playerCellFingerprint: undefined })}\n`, 'container_cell_migration_status_invalid:playerCellFingerprint'],
      // A player custody mismatch in the final report fails the evidence, whatever the ok line says.
      [`${status(mismatched)}\n${JSON.stringify({ ...ok, playerCellFingerprint: mismatched.players.cellFingerprint })}\n`,
        'container_cell_migration_player_custody_mismatch'],
      [`${status({ ...complete, placeables: { ...complete.placeables, legacyFingerprint: 'x' } })}\n${JSON.stringify({ ...ok, legacyFingerprint: 'x' })}\n`,
        'container_cell_migration_log_invalid:fingerprint'],
    ];
    for (const [text, code] of refused) expect(() => readContainerCellMigrationEvidence(text), code).toThrow(code);
  });

  it('prints only the fingerprint from the final-fingerprint commands the lane shells out to', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-container-cell-log-'));
    try {
      const ok = { ok: true, legacyFingerprint: 'placeable-cells:5:44:0a1b2c3d', receiptFingerprint: '99aa00bb',
        playerLegacyFingerprint: 'player-custody-world:3:40:612:1a2b3c4d', playerCellFingerprint: 'player-custody-world:3:40:612:1a2b3c4d' };
      const log = `${JSON.stringify({ event: 'container_cell_migration_status', database: 'd', ...complete })}\n${JSON.stringify(ok)}\n`;
      const good = join(directory, 'good.jsonl'); writeFileSync(good, log);
      const noisy = join(directory, 'noisy.jsonl'); writeFileSync(noisy, `ℹ️ INFO Connecting to SpacetimeDB WS...\n${log}`);
      const run = (path: string, command = 'final-fingerprint') => spawnSync(process.execPath, ['--import', 'tsx',
        'scripts/container-cell-migration-runner.ts', command, path], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' });
      const accepted = run(good);
      expect(accepted.status, accepted.stderr).toBe(0);
      expect(accepted.stdout).toBe('placeable-cells:5:44:0a1b2c3d\n');
      const players = run(good, 'final-player-fingerprint');
      expect(players.status, players.stderr).toBe(0);
      expect(players.stdout).toBe('player-custody-world:3:40:612:1a2b3c4d\n');
      const refused = run(noisy);
      expect(refused.status).not.toBe(0);
      expect(refused.stdout).toBe('');
      expect(refused.stderr).toContain('container_cell_migration_log_invalid:not_json_lines');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
