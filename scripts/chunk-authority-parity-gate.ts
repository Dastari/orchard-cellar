import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRuntimeManifest } from '../packages/sim/src/chunk-runtime.js';
import {
  compareHeads, connectWorld, loadMaterialized, materializeLiveRows, readLiveRows, readTokenFile, subscribeChunkInputs,
  type HeadComparison, type LiveRows, type MaterializedChunks,
} from './chunk-authority-live-rows.js';

/**
 * Static-world live-row parity gate (release time, before any head or blob publish).
 *
 * READ-ONLY. It connects with a credentialed SDK connection, subscribes to the public
 * `live_map_document`, `content_definition`, `content_head`, `world_chunk_shadow` and
 * `world_chunk_head` tables, copies the rows, and disconnects. It never calls a reducer
 * or a procedure. It then runs
 * `materialize-world-chunks.ts --input <row> --content-rows <rows>` (which fails unless
 * chunk and authority parity against the server oracle pass) and compares the heads it
 * produces with:
 *
 * - `--candidate DIR`: the materialized output the release would stage and publish
 *   (`manifest.json` and blobs), chunk by chunk and by map source; and
 * - the heads currently published on the world (reported; a first publish has none).
 *
 * The token comes from the file named by `CHUNK_PARITY_TOKEN_FILE` (optionally
 * `CHUNK_PARITY_TOKEN_LABEL` for a rejoin credential file). It is never printed.
 *
 *   CHUNK_PARITY_TOKEN_FILE=/private/path npm run world:chunks:parity-gate -- \
 *     --host https://HOST --database DATABASE --candidate DIR [--out DIR]
 */

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export interface ParityGateOptions {
  readonly host: string;
  readonly database: string;
  readonly tokenFile: string;
  readonly tokenLabel: string | undefined;
  readonly candidate: string | null;
  readonly out: string;
}

export class ParityGateUsageError extends Error {}

const USAGE = 'Usage: CHUNK_PARITY_TOKEN_FILE=PATH tsx scripts/chunk-authority-parity-gate.ts --host URL --database NAME [--candidate DIR] [--out DIR]';

export function parseParityGateArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): ParityGateOptions {
  const known = new Set(['--host', '--database', '--candidate', '--out']);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]!, value = argv[index + 1];
    // Tokens only ever come from a file: a token on the command line would show in `ps`.
    if (/token/iu.test(flag)) throw new ParityGateUsageError('pass the token file with CHUNK_PARITY_TOKEN_FILE, never on the command line');
    if (!known.has(flag) || value === undefined || value.startsWith('--')) throw new ParityGateUsageError(USAGE);
    values.set(flag, value);
  }
  const host = values.get('--host'), database = values.get('--database'), tokenFile = env['CHUNK_PARITY_TOKEN_FILE'];
  if (host === undefined || database === undefined || tokenFile === undefined || tokenFile.length === 0) throw new ParityGateUsageError(USAGE);
  try {
    const url = new URL(host);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
  } catch {
    throw new ParityGateUsageError('invalid --host');
  }
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  return {
    host, database, tokenFile, tokenLabel: env['CHUNK_PARITY_TOKEN_LABEL'],
    candidate: values.get('--candidate') ?? null,
    out: values.get('--out') ?? resolve(REPO_ROOT, 'output', `chunk-parity-gate-${stamp}`),
  };
}

export interface ParityGateReport {
  readonly schema: 1;
  readonly passed: boolean;
  readonly failures: readonly string[];
  readonly target: { readonly host: string; readonly database: string };
  readonly readAt: string;
  readonly liveRows: {
    readonly mapRevision: number | null;
    readonly mapHash: string | null;
    readonly contentHead: LiveRows['contentHead'];
    readonly contentRows: number | 'bootstrap';
  };
  readonly materialized: MaterializedChunks['summary'] & { readonly materializeMs: number; readonly chunks: number } | null;
  readonly registryMatchesContentHead: boolean | null;
  readonly candidate: HeadComparison | null;
  readonly published: {
    readonly shadowRevision: number | null;
    readonly heads: number;
    readonly vsLive: HeadComparison | null;
  };
}

/** Pure decision over the gathered inputs, so the gate's pass rule is unit-tested. */
export function parityGateReport(input: {
  readonly target: { readonly host: string; readonly database: string };
  readonly readAt: string;
  readonly rows: LiveRows;
  readonly live: Pick<MaterializedChunks, 'summary' | 'manifest' | 'materializeMs'> | null;
  readonly materializeError: string | null;
  readonly candidate: Pick<MaterializedChunks, 'manifest'> | null;
}): ParityGateReport {
  const failures: string[] = [];
  if (input.rows.mapRow === null) failures.push('the world has no live map row');
  if (input.materializeError !== null) failures.push(`materialize: ${input.materializeError}`);
  const live = input.live;
  const registryMatchesContentHead = live === null || input.rows.contentHead === null ? null : live.summary.contentHash === input.rows.contentHead.contentHash;
  if (registryMatchesContentHead === false) failures.push('the materialized registry content hash differs from content_head');
  const candidate = live === null || input.candidate === null ? null : compareHeads(input.candidate.manifest, live.manifest);
  if (candidate !== null && !candidate.equal) {
    failures.push(`candidate heads differ from the live-row materialization (${candidate.differences.length} chunk(s)${candidate.source.equal ? '' : ', map source differs'})`);
  }
  const shadow = input.rows.published.shadow;
  let vsLive: HeadComparison | null = null;
  if (live !== null && shadow !== null) {
    try {
      vsLive = compareHeads(validateRuntimeManifest(JSON.parse(shadow.manifestJson)), live.manifest);
    } catch (error) {
      failures.push(`published manifest unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    schema: 1,
    passed: failures.length === 0 && live !== null,
    failures,
    target: input.target,
    readAt: input.readAt,
    liveRows: {
      mapRevision: input.rows.mapRow?.revision ?? null,
      mapHash: input.rows.mapRow?.contentHash ?? null,
      contentHead: input.rows.contentHead,
      contentRows: input.rows.contentRows?.length ?? 'bootstrap',
    },
    materialized: live === null ? null : { ...live.summary, materializeMs: live.materializeMs, chunks: live.manifest.chunks.length },
    registryMatchesContentHead,
    candidate,
    published: { shadowRevision: shadow?.revision ?? null, heads: input.rows.published.heads.length, vsLive },
  };
}

/** Reads the rows with one short-lived connection. Subscriptions only: no reducer or procedure call. */
async function readRowsOnce(options: ParityGateOptions): Promise<LiveRows> {
  const token = await readTokenFile(options.tokenFile, options.tokenLabel);
  const world = await connectWorld({ host: options.host, database: options.database }, token);
  try {
    await subscribeChunkInputs(world);
    return readLiveRows(world);
  } finally {
    world.connection.disconnect();
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const options = parseParityGateArgs(argv, env);
  await mkdir(options.out, { recursive: true, mode: 0o700 });
  const candidate = options.candidate === null ? null : await loadMaterialized(options.candidate);
  const readAt = new Date().toISOString();
  const rows = await readRowsOnce(options);
  let live: MaterializedChunks | null = null, materializeError: string | null = null;
  try {
    live = await materializeLiveRows(rows, resolve(options.out, 'live'));
  } catch (error) {
    materializeError = error instanceof Error ? error.message.split('\n')[0]!.slice(0, 400) : String(error);
  }
  const report = parityGateReport({ target: { host: options.host, database: options.database }, readAt, rows, live, materializeError, candidate });
  await writeFile(resolve(options.out, 'parity-gate.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, failures: report.failures, report: resolve(options.out, 'parity-gate.json'),
    chunks: report.materialized?.chunks ?? null, candidateEqual: report.candidate?.equal ?? null, publishedShadowRevision: report.published.shadowRevision }));
  return report.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code), (error: unknown) => {
    console.error(`[chunk-parity-gate] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
}
