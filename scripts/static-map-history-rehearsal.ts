/** Fixed S7c acceptance runner, called before the isolated restore authority is cleaned up.
 * It never accepts a production host or port and never changes the release's expected snapshots.
 */
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DbConnection, tables } from '@orchard/world-bindings';
import { normalizeMapDocumentV3, type MapDocumentV3 } from '@orchard/sim';
import { normalizedMapDocumentSha256 } from '@orchard/sim/world-chunk-document';
import { loadChunkMapHead } from '../packages/studio/src/world-chunks/map-head.js';
import { allHistoryRows, historyTokenProvider, runHistory } from './world-chunks-history.js';
import { connectWorld, httpOrigin, materializeInProcess, sha256Hex, type HistoryWorldPort, type LiveState,
  type MaterializePort, type OriginPort } from './world-chunks-publish.js';

export function assertHistoryRehearsalTarget(host: string, database: string): void {
  const url = new URL(host);
  const port = Number(url.port);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash || !Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(database)) throw new Error('static_history_rehearsal_target_refused');
}

export interface RehearsalAdmin {
  restore(revisionId: bigint): Promise<{ readonly auditId: string; readonly inverseRevisionId: string }>;
  privateTableRefused(documentJson: string): Promise<void>;
  close(): void;
}
const bodyHash = (text: string): string => normalizedMapDocumentSha256({ ...JSON.parse(text), revision: 0 });

export async function runStaticMapHistoryRehearsal(deps: {
  readonly world: HistoryWorldPort; readonly database: string; readonly origin: OriginPort; readonly materialize: MaterializePort;
  readonly openAdmin: () => Promise<RehearsalAdmin>; readonly verifyRejoin: () => Promise<void>;
  readonly progress?: (entry: object) => void;
}): Promise<object> {
  const rows = await allHistoryRows(deps.world);
  if (rows.length === 0) throw new Error('static_history_rehearsal_empty');
  const inventory: object[] = [];
  for (const row of rows) {
    deps.progress?.({stage:'inventory',historyId:row.id,revision:row.revision});
    const historical = await deps.world.readHistory(BigInt(row.id));
    const raw = JSON.parse(historical.documentJson) as MapDocumentV3;
    inventory.push({ id: row.id, revision: row.revision, schemaVersion: raw.schemaVersion,
      generatorVersion: raw.provenance.generatorVersion ?? null,
      exactDocumentSha256: normalizedMapDocumentSha256(raw),
      currentNormalizationUnchanged: normalizedMapDocumentSha256(raw) === normalizedMapDocumentSha256(normalizeMapDocumentV3(raw)) });
  }
  deps.progress?.({stage:'inventory-complete',inventory});
  const planned = {...deps,log:(message:string)=>deps.progress?.({stage:'backfill',message})};
  const plan = await runHistory('plan', planned);
  await runHistory('backfill', { ...planned, confirmation: plan.confirmation! });
  const history = await runHistory('check', deps);
  const before = await deps.world.settle(() => true, 10_000);
  if (before.mapRow === null || before.shadow === null) throw new Error('static_history_rehearsal_head_missing');
  const original = rows.find(row => row.revision === before.mapRow!.revision && row.contentHash === before.mapRow!.contentHash);
  if (original === undefined) throw new Error('static_history_rehearsal_current_archive_missing');
  const selected = rows[0]!;
  const selectedDocument = await deps.world.readHistory(BigInt(selected.id));
  const cachedBlobs = new Map<string, Uint8Array>();
  const checkPublication = async (state: LiveState, expectedBody: string): Promise<void> => {
    if (state.mapRow === null || state.shadow === null) throw new Error('static_history_rehearsal_head_missing');
    const manifest = JSON.parse(state.shadow.manifestJson) as { chunks: { cx: number; cy: number; contentHash: string; byteLength: number }[] };
    if (state.heads.length !== manifest.chunks.length || manifest.chunks.some(head => !state.heads.some(actual =>
      actual.cx === head.cx && actual.cy === head.cy && actual.contentHash === head.contentHash
      && actual.byteLength === head.byteLength && actual.revision === state.shadow!.revision))) throw new Error('static_history_rehearsal_heads_mismatch');
    const rebuilt = await loadChunkMapHead(state.mapRow.mapId, state.shadow.manifestJson, async head => {
      let bytes = cachedBlobs.get(head.contentHash);
      if (bytes === undefined) { bytes = await deps.world.readBlob(head.spaceId, head); cachedBlobs.set(head.contentHash, bytes); }
      return bytes;
    });
    if (rebuilt.revision !== state.mapRow.revision || rebuilt.contentHash !== state.mapRow.contentHash
      || rebuilt.documentJson !== state.mapRow.documentJson || bodyHash(rebuilt.documentJson) !== bodyHash(expectedBody)) {
      throw new Error('static_history_rehearsal_document_mismatch');
    }
  };
  const admin = await deps.openAdmin(); // Open after CPU materialization, which closes long-lived SDK sockets.
  try {
    await admin.privateTableRefused(before.mapRow.documentJson);
    const restored = await admin.restore(BigInt(selected.id));
    if (restored.inverseRevisionId !== original.id) throw new Error('static_history_rehearsal_inverse_mismatch');
    const afterRestore = await deps.world.settle(state => state.mapRow?.revision === before.mapRow!.revision + 1, 30_000);
    if (afterRestore.mapRow?.revision !== before.mapRow.revision + 1 || afterRestore.shadow?.revision !== before.shadow.revision + 1) {
      throw new Error('static_history_rehearsal_restore_not_atomic');
    }
    await checkPublication(afterRestore, selectedDocument.documentJson);
    // Replay the exact audited inverse through the same guarded preview/commit interface.
    const undone = await admin.restore(BigInt(restored.inverseRevisionId));
    const afterUndo = await deps.world.settle(state => state.mapRow?.revision === before.mapRow!.revision + 2, 30_000);
    if (afterUndo.mapRow?.revision !== before.mapRow.revision + 2 || afterUndo.shadow?.revision !== before.shadow.revision + 2) {
      throw new Error('static_history_rehearsal_undo_not_atomic');
    }
    await checkPublication(afterUndo, before.mapRow.documentJson);
    await runHistory('check', deps); // Also verifies both newly created revision archives.
    await deps.world.suspend(); await deps.world.resume();
    await checkPublication(deps.world.read(), before.mapRow.documentJson);
    await deps.verifyRejoin();
    return { ok: true, inventory, retainedRowsVerified: history.rows, restoredHistoryId: selected.id,
      restoreAuditId: restored.auditId, inverseHistoryId: restored.inverseRevisionId, inverseAuditId: undone.auditId,
      privacy: 'authorized-admin public subscription refused; ordinary-player live credential not exercised',
      mapRevisionBefore: before.mapRow.revision, mapRevisionAfter: afterUndo.mapRow.revision,
      originalExpectedSnapshotsUntouched: true, reconnectVerified: true };
  } finally { admin.close(); }
}

function bound<T>(promise: Promise<T>, code: string, timeout = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), timeout);
    promise.then(value => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}
async function connectAdmin(host: string, database: string, token: () => Promise<string>): Promise<RehearsalAdmin> {
  const credential = await token();
  const connection = await bound(new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder().withUri(host).withDatabaseName(database).withToken(credential)
      .onConnect(ready => resolve(ready)).onConnectError(() => reject(new Error('static_history_rehearsal_admin_connect_failed'))).build();
  }), 'static_history_rehearsal_admin_connect_timeout');
  try {
    await bound(new Promise<void>((resolve, reject) => connection.subscriptionBuilder().onApplied(() => resolve())
      .onError(() => reject(new Error('static_history_rehearsal_admin_subscription_failed')))
      .subscribe([tables.ownAdminMutationPreviews, tables.liveMapHead])), 'static_history_rehearsal_admin_subscription_timeout');
  } catch (error) { connection.disconnect(); throw error; }
  return {
    close: () => connection.disconnect(),
    async privateTableRefused(documentJson) {
      const refused = await bound(new Promise<boolean>((resolve, reject) => {
        connection.subscriptionBuilder().onApplied(() => resolve(false)).onError(context => {
          if (/private|permission|not.public|not.found|does.not.exist|no.such.table|unknown.table|unauthorized/iu.test(String(context.event))) resolve(true);
          else reject(new Error('static_history_rehearsal_private_read_unclassified'));
        }).subscribe('SELECT * FROM live_map_document');
      }), 'static_history_rehearsal_private_read_timeout');
      if (!refused) throw new Error('static_history_rehearsal_private_read_allowed');
      const head = [...connection.db.liveMapHead.iter()].find(row => row.mapId === 'live-island');
      if (head?.documentHash !== sha256Hex(new TextEncoder().encode(documentJson))) throw new Error('static_history_rehearsal_digest_mismatch');
      await bound(connection.procedures.listLiveMapChunkHistory({ afterId: 0n, limit: 1 }), 'static_history_rehearsal_authorized_probe_timeout');
    },
    async restore(revisionId) {
      const clientMutationId = `s7c-rehearsal-${randomUUID()}`;
      const common = { revisionId, reason: 'Verify isolated S7c history restore and audited inverse.', clientMutationId };
      await bound(connection.reducers.adminRestoreMap({ ...common, dryRun: true, expectedWorldVersion: '', previewFingerprint: undefined }), 'static_history_rehearsal_preview_timeout');
      const deadline = Date.now() + 10_000;
      let preview;
      do {
        preview = [...connection.db.ownAdminMutationPreviews.iter()].find(row => row.clientMutationId === clientMutationId);
        if (preview === undefined) await new Promise<void>(resolve => setTimeout(resolve, 25));
      } while (preview === undefined && Date.now() < deadline);
      if (preview === undefined) throw new Error('static_history_rehearsal_preview_missing');
      await bound(connection.reducers.adminRestoreMap({ ...common, dryRun: false, expectedWorldVersion: preview.baseVersion,
        previewFingerprint: preview.fingerprint }), 'static_history_rehearsal_restore_timeout', 120_000);
      let cursor: string | undefined;
      const seen = new Set<string>();
      for (;;) {
        const page = JSON.parse(await bound(connection.procedures.adminAuditPage({ filter: JSON.stringify({ targetKey: 'world' }), cursor }),
          'static_history_rehearsal_audit_timeout')) as { rows: { id: string; payload: { clientMutationId: string;
            inverse: { operation: string; args: { revisionId?: string } } | null } }[]; nextCursor: string | null };
        if (!Array.isArray(page.rows)) throw new Error('static_history_rehearsal_audit_failed');
        const audit = page.rows.find(row => row.payload.clientMutationId === clientMutationId);
        if (audit !== undefined) {
          const inverse = audit.payload.inverse;
          if (inverse?.operation !== 'restore_map' || !/^[1-9][0-9]*$/u.test(inverse.args.revisionId ?? '')) throw new Error('static_history_rehearsal_inverse_missing');
          return { auditId: audit.id, inverseRevisionId: inverse.args.revisionId! };
        }
        const next = page.nextCursor;
        if (next === null || seen.has(next)) throw new Error('static_history_rehearsal_audit_missing');
        seen.add(next); cursor = next;
      }
    },
  };
}

export async function main(env = process.env): Promise<void> {
  const host = env['SPACETIMEDB_HOST'] ?? '', database = env['SPACETIMEDB_DATABASE'] ?? '';
  assertHistoryRehearsalTarget(host, database);
  if (env['WORLD_RESTORE_STATIC_MAP_HISTORY'] !== 'run') throw new Error('static_history_rehearsal_opt_in_required');
  const file = env['WORLD_REJOIN_TOKENS_FILE'], label = env['WORLD_RESTORE_CONTENT_OWNER_LABEL'];
  const report = env['WORLD_RESTORE_STATIC_MAP_HISTORY_REPORT'];
  if (!file || !label || !report || !isAbsolute(report)) throw new Error('static_history_rehearsal_inputs_required');
  if (await lstat(report).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; })) {
    throw new Error('static_history_rehearsal_report_exists');
  }
  const token = historyTokenProvider(file, label);
  const world = await connectWorld({ host, database }, token);
  const progress: object[] = [];
  const repository = fileURLToPath(new URL('..', import.meta.url));
  try {
    const result = await runStaticMapHistoryRehearsal({ world, database, progress: entry => {progress.push(entry);console.error(`[static-history] ${JSON.stringify(entry)}`);}, origin: httpOrigin('https://orchard.dastari.net'), materialize: materializeInProcess,
      openAdmin: () => connectAdmin(host, database, token), verifyRejoin: async () => {
        const run = promisify(execFile);
        const snapshot = `${report}.rejoin-before.json`, after = `${report}.rejoin-after.json`;
        const options = { cwd: repository, env: { ...env, SPACETIMEDB_HOST: host, SPACETIMEDB_DATABASE: database,
          WORLD_REJOIN_TOKENS_FILE: file, WORLD_REJOIN_REQUIRE_REFRESH: '1' } };
        await run('node', ['--import', 'tsx', 'scripts/world-rejoin-smoke.ts', 'capture', snapshot], options);
        await run('node', ['--import', 'tsx', 'scripts/world-rejoin-smoke.ts', 'verify', snapshot, after], options);
      } });
    await writeFile(report, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ ok: true, evidence: report }));
  } catch (error) {
    const code = error instanceof Error && /^(?:static_history_rehearsal|chunk_history|live_map_revision)[a-z0-9_:.-]*$/u.test(error.message) ? error.message : 'static_history_rehearsal_failed';
    await writeFile(report, `${JSON.stringify({ok:false,code,progress},null,2)}\n`, {flag:'wx',mode:0o600});
    throw new Error(code, {cause:error});
  } finally { world.close(); }
}
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => { console.error('static_history_rehearsal_failed'); process.exitCode = 1; });
}
