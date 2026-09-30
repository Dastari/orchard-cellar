/** Fixed S7c acceptance runner, called before the isolated restore authority is cleaned up.
 * It never accepts a production host or port and never changes the release's expected snapshots.
 */
import { execFile } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DbConnection, tables } from '@orchard/world-bindings';
import { normalizeMapDocumentV3, type MapDocumentV3 } from '@orchard/sim';
import { normalizedMapDocumentSha256 } from '@orchard/sim/world-chunk-document';
import { loadChunkMapHead } from '../packages/studio/src/world-chunks/map-head.js';
import { allHistoryRows, historyTokenProvider, runHistory } from './world-chunks-history.js';
import { restoreHistoryWithPreview } from './static-map-history-restore.js';
import { historyFailure, historyPhase, type HistoryPhase, type HistoryPhaseRow, type HistoryPhaseEvent } from './static-map-history-diagnostics.js';
import { connectWorld, materializeInProcess, sha256Hex, type HistoryWorldPort, type LiveState,
  type MaterializePort, type OriginPort } from './world-chunks-publish.js';

export function assertHistoryRehearsalTarget(host: string, database: string): void {
  const url = new URL(host);
  const port = Number(url.port);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash || !Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(database)) throw new Error('static_history_rehearsal_target_refused');
}

/** The migration lane builds and validates this artifact while the public frontend is stopped. */
export async function candidateAtlasOrigin(repository: string): Promise<{
  readonly origin: OriginPort;
  readonly evidence: { readonly path: string; readonly sha256: string; readonly byteLength: number; readonly schemaVersion: number; readonly revision: string };
  readonly assertUnchanged: () => Promise<void>;
}> {
  const relative = 'packages/client/dist/generated/atlas.packs.json';
  const path = resolve(repository, relative);
  const readCandidate = async (): Promise<Uint8Array> => {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(path) !== path || stat.size < 1 || stat.size > 16 * 1024 * 1024) {
      throw new Error('static_history_rehearsal_candidate_atlas_file_invalid');
    }
    const bytes = await readFile(path);
    if (bytes.byteLength < 1 || bytes.byteLength > 16 * 1024 * 1024) throw new Error('static_history_rehearsal_candidate_atlas_file_invalid');
    return bytes;
  };
  const bytes = new Uint8Array(await readCandidate());
  let index: unknown;
  try { index = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
  catch (error) { throw new Error('static_history_rehearsal_candidate_atlas_index_invalid', {cause:error}); }
  const record = index as { schemaVersion?: unknown; revision?: unknown; packs?: unknown; assetPacks?: unknown } | null;
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(record) || record['schemaVersion'] !== 5 || typeof record['revision'] !== 'string' || record['revision'].length === 0
    || !object(record['packs']) || !object(record['assetPacks'])
    || Object.values(record['packs']).some(value => typeof value !== 'string' || value.length === 0)
    || Object.values(record['assetPacks']).some(value => typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(record['packs'], value))) {
    throw new Error('static_history_rehearsal_candidate_atlas_index_invalid');
  }
  const digest = sha256Hex(bytes);
  const assertUnchanged = async (): Promise<void> => {
    if (sha256Hex(await readCandidate()) !== digest) throw new Error('static_history_rehearsal_candidate_atlas_changed');
  };
  return { evidence: {path:relative,sha256:digest,byteLength:bytes.byteLength,schemaVersion:5,revision:record['revision']}, assertUnchanged,
    origin: { origin:'candidate-client-artifact', atlasIndex:async()=>{await assertUnchanged();return bytes.slice();},
      blob:async()=>{throw new Error('static_history_rehearsal_candidate_blob_read_refused');} } };
}

export interface RehearsalAdmin {
  restore(revisionId: bigint, row?: HistoryPhaseRow): Promise<{ readonly auditId: string; readonly inverseRevisionId: string }>;
  privateTableRefused(documentJson: string): Promise<void>;
  close(): void;
}
const bodyHash = (text: string): string => normalizedMapDocumentSha256({ ...JSON.parse(text), revision: 0 });

export async function runStaticMapHistoryRehearsal(deps: {
  readonly world: HistoryWorldPort; readonly database: string; readonly origin: OriginPort; readonly materialize: MaterializePort;
  readonly openAdmin: () => Promise<RehearsalAdmin>; readonly verifyRejoin: () => Promise<void>;
  readonly progress?: (entry: object) => void;
}): Promise<object> {
  const phase = <T>(name: HistoryPhase, action: () => T | Promise<T>, row?: HistoryPhaseRow) => historyPhase(name, action, deps.progress, row);
  const rows = await phase('inventory-list', async () => {
    const result = await allHistoryRows(deps.world);
    if (result.length === 0) throw new Error('static_history_rehearsal_empty');
    return result;
  });
  const inventory: object[] = [];
  for (const row of rows) {
    deps.progress?.({stage:'inventory',historyId:row.id,revision:row.revision});
    inventory.push(await phase('inventory-read', async () => {
      const historical = await deps.world.readHistory(BigInt(row.id));
      const raw = JSON.parse(historical.documentJson) as MapDocumentV3;
      return { id: row.id, revision: row.revision, schemaVersion: raw.schemaVersion,
        generatorVersion: raw.provenance.generatorVersion ?? null,
        exactDocumentSha256: normalizedMapDocumentSha256(raw),
        currentNormalizationUnchanged: normalizedMapDocumentSha256(raw) === normalizedMapDocumentSha256(normalizeMapDocumentV3(raw)) };
    }, row));
  }
  deps.progress?.({stage:'inventory-complete',inventory});
  const planned = {...deps,log:(message:string)=>deps.progress?.({stage:'backfill',message})};
  const plan = await phase('history-plan', () => runHistory('plan', planned));
  await phase('history-backfill', () => runHistory('backfill', { ...planned, confirmation: plan.confirmation! }));
  const history = await phase('history-check', () => runHistory('check', deps));
  const { before, original } = await phase('history-head', async () => {
    const state = await deps.world.settle(() => true, 10_000);
    if (state.mapRow === null || state.shadow === null) throw new Error('static_history_rehearsal_head_missing');
    const archived = rows.find(row => row.revision === state.mapRow!.revision && row.contentHash === state.mapRow!.contentHash);
    if (archived === undefined) throw new Error('static_history_rehearsal_current_archive_missing');
    return { before: { ...state, mapRow: state.mapRow, shadow: state.shadow }, original: archived };
  });
  const selected = rows[0]!;
  const selectedDocument = await phase('history-read', () => deps.world.readHistory(BigInt(selected.id)), selected);
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
  const admin = await phase('history-open-admin', () => deps.openAdmin()); // Open after CPU materialization, which closes long-lived SDK sockets.
  try {
    await phase('history-privacy', () => admin.privateTableRefused(before.mapRow!.documentJson));
    const restored = await phase('history-restore', async () => {
      const result = await admin.restore(BigInt(selected.id), selected);
      if (result.inverseRevisionId !== original.id) throw new Error('static_history_rehearsal_inverse_mismatch');
      return result;
    }, selected);
    const afterRestore = await phase('history-restore-settle', async () => {
      const state = await deps.world.settle(value => value.mapRow?.revision === before.mapRow.revision + 1, 30_000);
      if (state.mapRow?.revision !== before.mapRow.revision + 1 || state.shadow?.revision !== before.shadow.revision + 1) throw new Error('static_history_rehearsal_restore_not_atomic');
      return state;
    }, selected);
    await phase('history-restore-publication', () => checkPublication(afterRestore, selectedDocument.documentJson), selected);
    // Replay the exact audited inverse through the same guarded preview/commit interface.
    const undone = await phase('history-inverse', () => admin.restore(BigInt(restored.inverseRevisionId), original), original);
    const afterUndo = await phase('history-inverse-settle', async () => {
      const state = await deps.world.settle(value => value.mapRow?.revision === before.mapRow.revision + 2, 30_000);
      if (state.mapRow?.revision !== before.mapRow.revision + 2 || state.shadow?.revision !== before.shadow.revision + 2) throw new Error('static_history_rehearsal_undo_not_atomic');
      return { ...state, mapRow: state.mapRow, shadow: state.shadow };
    }, original);
    await phase('history-inverse-publication', () => checkPublication(afterUndo, before.mapRow!.documentJson), original);
    await phase('history-check', () => runHistory('check', deps)); // Also verifies both newly created revision archives.
    await phase('history-reconnect', async () => { await deps.world.suspend(); await deps.world.resume(); });
    await phase('history-reconnect-publication', () => checkPublication(deps.world.read(), before.mapRow!.documentJson));
    await phase('rejoin-verify', () => deps.verifyRejoin());
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
async function connectAdmin(host: string, database: string, token: () => Promise<string>, progress?: (entry: HistoryPhaseEvent) => void): Promise<RehearsalAdmin> {
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
    restore: (revisionId, row) => restoreHistoryWithPreview(revisionId, {
      async preview(common) {
        await bound(connection.reducers.adminRestoreMap({ ...common, dryRun: true, expectedWorldVersion: '', previewFingerprint: undefined }), 'static_history_rehearsal_preview_timeout');
        const deadline = Date.now() + 10_000;
        let preview;
        do {
          preview = [...connection.db.ownAdminMutationPreviews.iter()].find(value => value.clientMutationId === common.clientMutationId);
          if (preview === undefined) await new Promise<void>(resolve => setTimeout(resolve, 25));
        } while (preview === undefined && Date.now() < deadline);
        if (preview === undefined) throw new Error('static_history_rehearsal_preview_missing');
        return { baseVersion: preview.baseVersion, fingerprint: preview.fingerprint };
      },
      commit: (common, preview) => bound(connection.reducers.adminRestoreMap({ ...common, dryRun: false,
        expectedWorldVersion: preview.baseVersion, previewFingerprint: preview.fingerprint }), 'static_history_rehearsal_restore_timeout', 120_000),
      async audit(clientMutationId) {
        let cursor: string | undefined;
        const seen = new Set<string>();
        for (;;) {
          const page = JSON.parse(await bound(connection.procedures.adminAuditPage({ filter: JSON.stringify({ targetKey: 'world' }), cursor }),
            'static_history_rehearsal_audit_timeout')) as { rows: { id: string; payload: { clientMutationId: string;
              inverse: { operation: string; args: { revisionId?: string } } | null } }[]; nextCursor: string | null };
          if (!Array.isArray(page.rows)) throw new Error('static_history_rehearsal_audit_failed');
          const audit = page.rows.find(value => value.payload.clientMutationId === clientMutationId);
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
    }, progress, row),
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
  const progress: object[] = [];
  const checkpoint = (entry: object): void => { progress.push(entry); console.error(`[static-history] ${JSON.stringify(entry)}`); };
  let world: Awaited<ReturnType<typeof connectWorld>> | undefined;
  const repository = fileURLToPath(new URL('..', import.meta.url));
  try {
    world = await historyPhase('connect', () => connectWorld({ host, database }, token), checkpoint);
    const atlas = await historyPhase('candidate-atlas', () => candidateAtlasOrigin(repository), checkpoint);
    progress.push({stage:'candidate-atlas',...atlas.evidence});
    const result = await runStaticMapHistoryRehearsal({ world, database, progress: checkpoint, origin: atlas.origin, materialize: materializeInProcess,
      openAdmin: () => connectAdmin(host, database, token, checkpoint), verifyRejoin: async () => {
        const run = promisify(execFile);
        const snapshot = `${report}.rejoin-before.json`, after = `${report}.rejoin-after.json`;
        const options = { cwd: repository, env: { ...env, SPACETIMEDB_HOST: host, SPACETIMEDB_DATABASE: database,
          WORLD_REJOIN_TOKENS_FILE: file, WORLD_REJOIN_REQUIRE_REFRESH: '1' } };
        await historyPhase('rejoin-capture', () => run('node', ['--import', 'tsx', 'scripts/world-rejoin-smoke.ts', 'capture', snapshot], options), checkpoint);
        await historyPhase('rejoin-verify', () => run('node', ['--import', 'tsx', 'scripts/world-rejoin-smoke.ts', 'verify', snapshot, after], options), checkpoint);
      } });
    await historyPhase('candidate-atlas-final', () => atlas.assertUnchanged(), checkpoint);
    await writeFile(report, `${JSON.stringify({...result,candidateAtlas:atlas.evidence}, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ ok: true, evidence: report }));
  } catch (error) {
    await writeFile(report, `${JSON.stringify({ok:false,...historyFailure(error),progress},null,2)}\n`, {flag:'wx',mode:0o600});
    throw error;
  } finally { world?.close(); }
}
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(JSON.stringify(historyFailure(error))); process.exitCode = 1; });
}
