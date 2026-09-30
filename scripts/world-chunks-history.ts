/** S7c operational backfill: exact verified manifests before retiring private history documents.
 * Credentials come only from WORLD_CHUNKS_TOKEN_FILE / WORLD_CHUNKS_TOKEN_LABEL, never command arguments.
 *
 * npx tsx scripts/world-chunks-history.ts plan|backfill|check|rematerialize
 *   --host http://127.0.0.1:3000 --database orchard-cellar-world --origin https://orchard.dastari.net
 *   [--revision ID] [--report /absolute/private/report.json]
 *
 * `plan` returns the exact metadata/content/art-bound confirmation. `backfill` archives missing
 * revisions; `rematerialize --revision ID` refreshes one archived revision against current content/art
 * before restore. Each reducer verifies reconstruction against the old document and then clears its
 * copy atomically. `check` verifies every retained revision server-side and refuses remaining copies.
 */
import { lstat, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeJwtClaims } from '@orchard/auth/oidc-token';
import { refreshRejoinCredentials } from './world-rejoin-smoke.js';
import { verifiedChunkHistoryDocument } from '../packages/world/src/live-map-chunk-history.js';
import { historyPhase, type HistoryPhaseEvent } from './static-map-history-diagnostics.js';
import {
  connectWorld, httpOrigin, materializeInProcess, readTokenFile, sha256Hex,
  PRODUCTION_DATABASE, PRODUCTION_HOST, PRODUCTION_ORIGIN,
  type HistoryRow, type HistoryWorldPort, type MaterializePort, type OriginPort,
} from './world-chunks-publish.js';

/** Re-read atomic keepalive checkpoints on every reconnect; only rotate near expiry, under the shared lock. */
export function historyTokenProvider(path: string, label?: string, deps: {
  readonly read?: typeof readTokenFile; readonly refresh?: typeof refreshRejoinCredentials; readonly now?: () => number; readonly wait?: () => Promise<void>;
} = {}): () => Promise<string> {
  return async () => {
    let token = '';
    for (let attempt = 0; attempt < 240; attempt += 1) {
      try { token = await (deps.read ?? readTokenFile)(path, label); break; }
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'token_file_token_missing_refresh_first' || attempt === 239) throw error;
        await (deps.wait ?? (() => new Promise<void>(resolve => setTimeout(resolve, 250))))();
      }
    }
    const expiry = decodeJwtClaims(token)?.exp;
    if (typeof expiry !== 'number' || expiry * 1000 > (deps.now ?? Date.now)() + 120_000) return token;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const credentials = await (deps.refresh ?? refreshRejoinCredentials)(path);
        const selected = label === undefined && credentials.length === 1 ? credentials[0] : credentials.find(row => row.label === label);
        if (selected === undefined) throw new Error('chunk_history_credential_label_required');
        return selected.token;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'rejoin_credentials_locked' || attempt === 39) throw error;
        await new Promise<void>(resolve => setTimeout(resolve, 250));
      }
    }
    throw new Error('chunk_history_credential_refresh_failed');
  };
}

export async function allHistoryRows(world: Pick<HistoryWorldPort, 'listHistory'>): Promise<readonly HistoryRow[]> {
  const rows: HistoryRow[] = [];
  let afterId = 0n;
  for (;;) {
    const page = await world.listHistory(afterId, 100);
    for (const row of page.rows) {
      const id = BigInt(row.id);
      if (id <= afterId) throw new Error('chunk_history_pagination_not_advancing');
      afterId = id;
      rows.push(row);
    }
    if (!page.more) return rows;
    if (page.rows.length === 0) throw new Error('chunk_history_pagination_incomplete');
  }
}

export interface HistoryReport {
  readonly command: string;
  readonly rows: number;
  readonly processed: readonly string[];
  readonly confirmation?: string;
  readonly auditCopiesRetired?: number;
}

export async function runHistory(command: 'plan' | 'backfill' | 'check' | 'rematerialize', deps: {
  readonly world: HistoryWorldPort; readonly origin: OriginPort; readonly materialize: MaterializePort;
  readonly database: string; readonly confirmation?: string; readonly revisionId?: bigint;
  readonly log?: (message: string) => void;
  readonly progress?: (entry: HistoryPhaseEvent) => void;
}): Promise<HistoryReport> {
  const phase = <T>(name: Parameters<typeof historyPhase>[0], action: () => T | Promise<T>, row?: HistoryRow) => historyPhase(name, action, deps.progress, row);
  const all = await phase('history-list', () => allHistoryRows(deps.world));
  const selected = deps.revisionId === undefined ? all : all.filter(row => BigInt(row.id) === deps.revisionId);
  if (deps.revisionId !== undefined && selected.length !== 1) throw new Error('live_map_revision_not_found');
  if (command === 'rematerialize' && deps.revisionId === undefined) throw new Error('chunk_history_rematerialize_requires_revision');
  const copyStatus = await phase('history-copy-status', () => deps.world.historyCopyStatus());
  if (command === 'check') {
    if (selected.length === 0) throw new Error('chunk_history_empty');
    for (const row of selected) {
      await phase('history-verify-server', async () => {
        if (!row.archived || row.hasDocumentCopy) throw new Error(`chunk_history_incomplete:${row.id}`);
        const checked = await deps.world.verifyHistory(BigInt(row.id));
        if (checked.id !== row.id || checked.revision !== row.revision || checked.hasDocumentCopy) throw new Error(`chunk_history_incomplete:${row.id}`);
      }, row);
    }
    await phase('history-copy-status', () => {
      if (copyStatus.historyCopies || copyStatus.missingArchives || copyStatus.auditCopies || copyStatus.previewCopies) throw new Error('chunk_history_document_copies_remaining');
    });
    return { command, rows: selected.length, processed: selected.map(row => row.id) };
  }
  const pending = command === 'rematerialize' ? selected : selected.filter(row => !row.archived || row.hasDocumentCopy);
  const atlasIndex = await phase('history-atlas', () => deps.origin.atlasIndex());
  const state = deps.world.read();
  const confirmation = `history:${sha256Hex(JSON.stringify({ database: deps.database,
    rows: selected, copyStatus, contentHash: state.contentHead?.contentHash ?? null, assetHash: sha256Hex(atlasIndex) }))}:${deps.database}`;
  if (command === 'plan') return { command, rows: selected.length, processed: pending.map(row => row.id), confirmation };
  if (deps.confirmation !== confirmation) throw new Error(`chunk_history_confirmation_required:${confirmation}`);
  const processed: string[] = [];
  for (const row of pending) {
    const historical = await phase('history-read', async () => {
      const result = await deps.world.readHistory(BigInt(row.id));
      if (result.mapId !== row.mapId || result.revision !== row.revision || result.contentHash !== row.contentHash) throw new Error('chunk_history_revision_conflict');
      return result;
    }, row);
    const contentRows = deps.world.read().contentRows;
    deps.log?.(`Materializing history row ${row.id} (revision ${row.revision})`);
    // The CPU-bound materializer outlasts the host's client timeout. Reconnect before staging.
    await phase('history-suspend', () => deps.world.suspend(), row);
    const materialized = await phase('history-materialize', () => deps.materialize({ mapRow: historical, contentRows, atlasIndex }), row)
      .then(candidate => ({ ok: true as const, candidate }), (error: unknown) => ({ ok: false as const, error }));
    // Always reconnect, but a second failure must not replace the primary materialization error.
    try { await phase('history-resume', () => deps.world.resume(), row); }
    catch (error) { if (materialized.ok) throw error; }
    if (!materialized.ok) throw materialized.error;
    const candidate = materialized.candidate;
    const blobs = new Map(candidate.blobs.map(blob => [blob.contentHash, blob.bytes]));
    await phase('history-verify-local', () => verifiedChunkHistoryDocument(row, candidate.manifestJson, hash => blobs.get(hash), historical.documentJson), row);
    await phase('history-stage-blobs', async () => {
      for (const blob of candidate.blobs) await deps.world.stageBlob(blob.bytes);
    }, row);
    await phase('history-archive', () => deps.world.backfillHistory({ revisionId: BigInt(row.id), manifestJson: candidate.manifestJson,
      registryContentHash: candidate.registryContentHash, expectedManifestHash: historical.manifestHash }), row);
    await phase('history-verify-server', async () => {
      const checked = await deps.world.verifyHistory(BigInt(row.id));
      if (checked.hasDocumentCopy) throw new Error(`chunk_history_document_copy_retained:${row.id}`);
    }, row);
    processed.push(row.id);
    await phase('history-row-complete', () => undefined, row);
  }
  if (command === 'backfill') {
    await phase('history-retire-audit', () => deps.world.retireAuditDocuments());
    await phase('history-copy-status', async () => {
      const remaining = await deps.world.historyCopyStatus();
      if (remaining.historyCopies || remaining.missingArchives || remaining.auditCopies || remaining.previewCopies) throw new Error('chunk_history_document_copies_remaining');
    });
  }
  return { command, rows: selected.length, processed, auditCopiesRetired: command === 'backfill' ? copyStatus.auditCopies : 0 };
}

export async function main(argv = process.argv.slice(2), env = process.env): Promise<number> {
  const args = [...argv];
  const command = args.shift();
  if (command !== 'plan' && command !== 'backfill' && command !== 'check' && command !== 'rematerialize') throw new Error('chunk_history_command_required');
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]!, value = args[index + 1];
    if (!['--host', '--database', '--origin', '--report', '--revision'].includes(flag) || value === undefined || value.startsWith('--') || values.has(flag)) throw new Error('chunk_history_usage');
    values.set(flag, value);
  }
  const host = values.get('--host'), database = values.get('--database'), origin = values.get('--origin');
  if (host === undefined || database === undefined || origin === undefined || !env['WORLD_CHUNKS_TOKEN_FILE']) throw new Error('chunk_history_target_and_token_file_required');
  const validOrigin = (raw: string): string => {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('chunk_history_invalid_origin');
    return url.origin;
  };
  const hostOrigin = validOrigin(host), publicOrigin = validOrigin(origin);
  if (database === PRODUCTION_DATABASE && (hostOrigin !== PRODUCTION_HOST || publicOrigin !== PRODUCTION_ORIGIN)) throw new Error('production_target_must_be_canonical');
  const report = values.get('--report');
  if (report !== undefined) {
    if (!isAbsolute(report)) throw new Error('chunk_history_report_must_be_absolute');
    const exists = await lstat(report).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; });
    if (exists) throw new Error('chunk_history_report_exists');
  }
  const revision = values.get('--revision');
  if (revision !== undefined && !/^[1-9][0-9]*$/u.test(revision)) throw new Error('chunk_history_revision_invalid');
  const world = await connectWorld({ host: hostOrigin, database }, historyTokenProvider(env['WORLD_CHUNKS_TOKEN_FILE'], env['WORLD_CHUNKS_TOKEN_LABEL']));
  try {
    const result = await runHistory(command, { world, origin: httpOrigin(publicOrigin), materialize: materializeInProcess,
      database, ...(env['WORLD_CHUNKS_HISTORY_CONFIRM'] === undefined ? {} : { confirmation: env['WORLD_CHUNKS_HISTORY_CONFIRM'] }),
      ...(revision === undefined ? {} : { revisionId: BigInt(revision) }), log: message => console.error(`[chunk-history] ${message}`) });
    if (report !== undefined) await writeFile(report, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(result));
    return 0;
  } finally { world.close(); }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(code => { process.exitCode = code; }, (error: unknown) => {
    // Only known application codes are reported: never SDK/network details which could include tokens.
    const message = error instanceof Error && /^(?:chunk_history|live_map_revision|production_target)[a-z0-9_:.-]*(?:history:[a-f0-9]+:[a-z0-9-]+)?$/u.test(error.message)
      ? error.message : 'chunk_history_failed';
    console.error(message);
    process.exitCode = 1;
  });
}
