import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, readFileSync } from 'node:fs';
import { cp, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { tables } from '@orchard/world-bindings';
import { Identity } from 'spacetimedb';
import {
  activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, parseMapDocumentV3, serializeMapDocumentV3,
  TILE_SIZE_FIXED, TOPSIDE_SPACE_ID,
} from '../packages/sim/src/index.js';
import { validateRuntimeManifest } from '../packages/sim/src/chunk-runtime.js';
import { WORLD_CHUNK_SIZE, type WorldChunkManifest } from '../packages/sim/src/world-chunk.js';
import { stableAssetId } from '../packages/tools/src/assets/asset-id.js';
import { composeHearthContentMap } from '../packages/tools/src/hearth-map-composition.js';
import { assertSoakTarget, connectWorld, readTokenFile, subscribeChunkInputs, withTimeout, type WorldConnection } from './chunk-authority-live-rows.js';
import { assembleChunkLiveIslandRuntime } from '../packages/world/src/content/chunk-authority-runtime.js';
import { chunkWalkTargets, type WalkTarget } from './chunk-authority-soak.js';

/**
 * Static-world S4g: browser acceptance for the client chunk runtime. LOCAL (DISPOSABLE) WORLDS ONLY.
 *
 * `scripts/run-chunk-runtime-browser-acceptance.sh` starts a disposable in-memory host, builds the
 * client twice (legacy `off` and `on`, see chunk-runtime-acceptance.vite.config.ts), serves both on
 * loopback preview ports, and runs this. Against the two builds, in Chromium:
 *
 * 1. Publishes the production-shaped island (the full Hearth content composition, as the nightly
 *    parity tests use) and its chunk heads through the S5b pipeline (world-chunks-publish.ts,
 *    local origin and chunk directory), then switches the disposable world's chunkAuthority on.
 * 2. Sweeps all 169 chunk centres with one player per build (admin teleports to the same tile):
 *    store occupancy, installs and evictions, JS heap plus array-buffer backing store after a
 *    forced GC (CDP), and a pixel diff of the two builds' frames with entities hidden (terrain)
 *    and shown (full scene; the players' own sprites masked).
 * 3. Spawn-pack prefetch: a fresh profile with delayed `/world/` responses holds a movement key
 *    from the first frame; the server position must not move until the spawn ring is resident.
 *    The same after a far teleport.
 * 4. Invalidation on head revision: two map edits republished as head revisions 2 and 3; the
 *    `on` client swaps, prunes its IndexedDB chunk cache to the current plus previous manifest,
 *    and the service worker never caches `/world/`.
 *
 * Evidence (summary.json, steps.jsonl, memory.csv, diffs.csv, PNGs) goes to --evidence.
 */

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIB = 1024 * 1024;

// --- Options ------------------------------------------------------------------------------------

export interface AcceptanceOptions {
  readonly host: string;
  readonly database: string;
  readonly tokenFile: string;
  readonly legacyUrl: string;
  readonly onUrl: string;
  readonly chunkDir: string;
  readonly evidenceDir: string;
  readonly playwrightModule: string;
  readonly chromePath: string;
  /** Sweep only the first N chunk centres (quick runs). */
  readonly limit: number | null;
  /** Channel delta above which a pixel counts as different. */
  readonly pixelThreshold: number;
  /** Largest share of differing pixels a matched frame may have. */
  readonly maxDiffRatio: number;
  readonly steadyBudgetMiB: number;
  /** G5a: the rollback drill (on, server off followed, previous-build swap, on again) on its own preview. */
  readonly rollbackDrill: RollbackDrillOptions | null;
  /** Phases to skip for quick runs (`invalidation`, `prefetch`). */
  readonly skip: ReadonlySet<string>;
}

export interface RollbackDrillOptions {
  /** Loopback port of the drill's own preview, which the drill stops and restarts to swap builds. */
  readonly swapPort: number;
  /** The `on` and legacy builds, and the directory the drill preview serves (replaced on each swap). */
  readonly distOn: string;
  readonly distLegacy: string;
  readonly swapDir: string;
  /** The harness work directory (`/tmp/orchard-s4g-acceptance.*`): the swap directory is a direct child of it. */
  readonly workDir: string;
}

/** The run script's mktemp work directory: the only place the drill ever deletes. */
const WORK_DIR = /^\/tmp\/orchard-s4g-acceptance\.[A-Za-z0-9]{6,}$/u;

/**
 * The swap directory is deleted recursively on every build swap, so it must be a direct child of
 * the harness work directory (`/tmp/orchard-s4g-acceptance.*`), not one of the builds, and never
 * `packages/client/dist`.
 */
export function assertSwapDirShape(workDir: string, swapDir: string, keep: readonly string[]): void {
  if (!WORK_DIR.test(workDir)) throw new AcceptanceUsageError('work_dir_must_be_the_harness_temporary_directory');
  if (dirname(swapDir) !== workDir || !/^[A-Za-z0-9._-]+$/u.test(basename(swapDir)) || basename(swapDir).startsWith('.')) {
    throw new AcceptanceUsageError('swap_dir_must_be_a_direct_child_of_the_work_dir');
  }
  if (keep.includes(swapDir) || /\/packages\/client\/dist/u.test(swapDir)) throw new AcceptanceUsageError('swap_dir_must_be_its_own_directory');
}

/** On disk, right before each recursive delete: no symlink anywhere on the way, and still inside the work directory. */
export async function assertSwapDirOnDisk(workDir: string, swapDir: string): Promise<void> {
  const work = await lstat(workDir);
  if (!work.isDirectory() || work.isSymbolicLink() || await realpath(workDir) !== workDir) throw new Error('drill_work_dir_not_a_real_directory');
  const existing = await lstat(swapDir).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing !== null && (existing.isSymbolicLink() || !existing.isDirectory())) throw new Error('drill_swap_dir_not_a_real_directory');
  if (existing !== null && await realpath(swapDir) !== join(workDir, basename(swapDir))) throw new Error('drill_swap_dir_outside_work_dir');
}

export class AcceptanceUsageError extends Error {}

const FLAGS = new Set(['--host', '--database', '--token-file', '--legacy-url', '--on-url', '--chunk-dir', '--evidence', '--playwright', '--chrome',
  '--limit', '--pixel-threshold', '--max-diff-ratio', '--steady-budget-mib', '--swap-port', '--dist-on', '--dist-legacy', '--swap-dir', '--work-dir', '--skip']);
const BOOLEAN_FLAGS = new Set(['--rollback-drill']);
const SKIPPABLE = new Set(['invalidation', 'prefetch']);

function loopbackUrl(value: string, label: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new AcceptanceUsageError(`${label}_invalid`); }
  const loopback = url.hostname === 'localhost' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(url.hostname);
  if (url.protocol !== 'http:' || !loopback || url.port === '' || url.port === '3000' || url.port === '5173') {
    throw new AcceptanceUsageError(`${label}_must_be_a_local_preview_port`);
  }
  return url.origin;
}

/** Parses and guards the command line: disposable loopback world and loopback preview origins only. */
export function parseAcceptanceArgs(argv: readonly string[]): AcceptanceOptions {
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]!, value = argv[index + 1];
    if (BOOLEAN_FLAGS.has(flag) && !booleans.has(flag)) { booleans.add(flag); index -= 1; continue; }
    if (!FLAGS.has(flag) || value === undefined || value.startsWith('--') || values.has(flag)) throw new AcceptanceUsageError(`bad argument ${flag}`);
    values.set(flag, value);
  }
  const required = (flag: string): string => {
    const value = values.get(flag);
    if (value === undefined) throw new AcceptanceUsageError(`missing ${flag}`);
    return value;
  };
  const target = { host: required('--host'), database: required('--database') };
  assertSoakTarget(target);
  const number = (flag: string, fallback: number, valid: (value: number) => boolean): number => {
    const raw = values.get(flag);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!valid(value)) throw new AcceptanceUsageError(`invalid ${flag}`);
    return value;
  };
  const absolute = (flag: string): string => {
    const value = required(flag);
    if (!value.startsWith('/')) throw new AcceptanceUsageError(`${flag} must be absolute`);
    return value;
  };
  const limit = values.has('--limit') ? number('--limit', 0, value => Number.isSafeInteger(value) && value >= 1) : null;
  return {
    host: target.host, database: target.database, tokenFile: absolute('--token-file'),
    legacyUrl: loopbackUrl(required('--legacy-url'), 'legacy_url'), onUrl: loopbackUrl(required('--on-url'), 'on_url'),
    chunkDir: absolute('--chunk-dir'), evidenceDir: absolute('--evidence'), playwrightModule: absolute('--playwright'),
    chromePath: values.get('--chrome') ?? '/usr/bin/google-chrome', limit,
    pixelThreshold: number('--pixel-threshold', 24, value => Number.isInteger(value) && value >= 0 && value <= 255),
    maxDiffRatio: number('--max-diff-ratio', 0.002, value => value >= 0 && value <= 1),
    steadyBudgetMiB: number('--steady-budget-mib', 24, value => value > 0),
    rollbackDrill: booleans.has('--rollback-drill') ? {
      swapPort: Number(new URL(loopbackUrl(`http://127.0.0.1:${required('--swap-port')}`, 'swap_port')).port),
      distOn: absolute('--dist-on'), distLegacy: absolute('--dist-legacy'), workDir: absolute('--work-dir'), swapDir: (() => {
        const swapDir = absolute('--swap-dir');
        assertSwapDirShape(absolute('--work-dir'), swapDir, [values.get('--dist-on') ?? '', values.get('--dist-legacy') ?? '']);
        return swapDir;
      })(),
    } : null,
    skip: (() => {
      const skip = new Set((values.get('--skip') ?? '').split(',').filter(Boolean));
      for (const phase of skip) if (!SKIPPABLE.has(phase)) throw new AcceptanceUsageError(`invalid --skip ${phase}`);
      return skip;
    })(),
  };
}

// --- Pure helpers -------------------------------------------------------------------------------

export interface SweepStep {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
  readonly tileX: number;
  readonly tileY: number;
  /** False when the chunk has no walkable ground: the nearest walkable tile of any chunk stands in. */
  readonly inChunk: boolean;
  readonly alternatives?: readonly { readonly tileX: number; readonly tileY: number }[];
}

export type NearestWalkable = (tileX: number, tileY: number, count: number) => readonly { readonly tileX: number; readonly tileY: number }[];

/**
 * The `count` walkable tiles nearest a point (Euclidean, then row-major), from a ground `blocked`
 * grid. Only tiles whose eight neighbours are walkable too: a shoreline tile is walkable ground
 * but the player's collision box there overlaps the water, so the server refuses the teleport.
 */
export function nearestWalkableIn(width: number, height: number, blocked: ArrayLike<boolean | number>): NearestWalkable {
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && !blocked[y * width + x];
  const interior = (x: number, y: number) => open(x - 1, y - 1) && open(x, y - 1) && open(x + 1, y - 1) && open(x - 1, y) && open(x, y)
    && open(x + 1, y) && open(x - 1, y + 1) && open(x, y + 1) && open(x + 1, y + 1);
  return (tileX, tileY, count) => {
    const best: { tileX: number; tileY: number; distance: number }[] = [];
    for (let y = 0; y < height; y++) {
      const dy = (y - tileY) ** 2;
      if (best.length === count && dy > best[best.length - 1]!.distance) continue;
      for (let x = 0; x < width; x++) {
        if (!interior(x, y)) continue;
        const distance = dy + (x - tileX) ** 2;
        if (best.length === count && distance >= best[best.length - 1]!.distance) continue;
        best.push({ tileX: x, tileY: y, distance });
        best.sort((a, b) => a.distance - b.distance || a.tileY - b.tileY || a.tileX - b.tileX);
        if (best.length > count) best.pop();
      }
    }
    return best.map(({ tileX: x, tileY: y }) => ({ tileX: x, tileY: y }));
  };
}

/**
 * One step per chunk, row-major (a one-chunk move each step and a long jump at each row end,
 * so the store both follows the view and evicts). A chunk without walkable ground uses the
 * walkable tiles nearest its centre (`nearest`, else the nearest of every chunk's candidates):
 * players stand only on walkable ground, and chunk-mode readiness keeps the view on the player.
 * `alternatives` are tried in order when the server refuses a tile (a tree or rock stands there).
 */
export function sweepPlan(targets: readonly WalkTarget[], nearest?: NearestWalkable, count = 48): SweepStep[] {
  const everywhere = targets.flatMap(target => target.candidates);
  if (everywhere.length === 0) throw new Error('sweep_has_no_walkable_tile');
  return [...targets].sort((a, b) => a.cy - b.cy || a.cx - b.cx).map((target, index) => {
    const centreX = target.cx * WORLD_CHUNK_SIZE + WORLD_CHUNK_SIZE / 2, centreY = target.cy * WORLD_CHUNK_SIZE + WORLD_CHUNK_SIZE / 2;
    const inChunk = target.candidates.length > 0;
    const alternatives = inChunk ? [...target.candidates, ...(nearest?.(centreX, centreY, count) ?? [])] : nearest !== undefined ? nearest(centreX, centreY, count)
      : [...everywhere].sort((a, b) => (a.tileX - centreX) ** 2 + (a.tileY - centreY) ** 2 - ((b.tileX - centreX) ** 2 + (b.tileY - centreY) ** 2)).slice(0, count);
    const first = alternatives[0] ?? everywhere[0]!;
    return { index, cx: target.cx, cy: target.cy, tileX: first.tileX, tileY: first.tileY, inChunk, alternatives };
  });
}

export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface PixelDiff {
  readonly pixels: number;
  /** Pixels whose largest channel delta is above zero. */
  readonly anyChange: number;
  /** Pixels whose largest channel delta is above the threshold. */
  readonly changed: number;
  readonly ratio: number;
  readonly maxDelta: number;
  readonly bbox: Rect | null;
}

/** Compares two RGBA buffers of the same size; masked pixels are skipped. Fills `heat` (one byte per pixel) if given. */
export function diffRgba(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray, width: number, height: number,
  threshold: number, mask: readonly Rect[] = [], heat?: Uint8Array): PixelDiff {
  if (a.length !== width * height * 4 || b.length !== a.length) throw new Error('diff_size_mismatch');
  let pixels = 0, anyChange = 0, changed = 0, maxDelta = 0;
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask.some(rect => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height)) continue;
      pixels++;
      const offset = (y * width + x) * 4;
      const delta = Math.max(Math.abs(a[offset]! - b[offset]!), Math.abs(a[offset + 1]! - b[offset + 1]!),
        Math.abs(a[offset + 2]! - b[offset + 2]!), Math.abs(a[offset + 3]! - b[offset + 3]!));
      if (heat !== undefined) heat[y * width + x] = delta;
      if (delta === 0) continue;
      anyChange++;
      if (delta > maxDelta) maxDelta = delta;
      if (delta <= threshold) continue;
      changed++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { pixels, anyChange, changed, ratio: pixels === 0 ? 0 : changed / pixels, maxDelta,
    bbox: changed === 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
}

export function percentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

export interface StoreSample { readonly id: number; readonly residentCount: number; readonly residentBytes: number; readonly installs: number;
  readonly pinned: number; readonly pinnedKeys?: readonly string[]; readonly maxChunks: number; readonly maxBytes: number }

/** Distinct chunks the sweep ever pinned (the view window plus its ring), out of every chunk. */
export function pinCoverage(records: readonly { readonly store: StoreSample | null }[], allKeys: readonly string[]): { pinned: number; of: number; never: string[] } {
  const seen = new Set(records.flatMap(record => record.store?.pinnedKeys ?? []));
  return { pinned: allKeys.filter(key => seen.has(key)).length, of: allKeys.length, never: allKeys.filter(key => !seen.has(key)) };
}

/** Evictions so far: every install beyond what the store (per store instance) still holds. */
export function evictionsFrom(samples: readonly (StoreSample | null)[]): number {
  const latest = new Map<number, StoreSample>();
  for (const sample of samples) if (sample !== null) latest.set(sample.id, sample);
  let evictions = 0;
  for (const sample of latest.values()) evictions += Math.max(0, sample.installs - sample.residentCount);
  return evictions;
}

export interface MemorySample { readonly usedBytes: number; readonly backingBytes: number }
export const totalBytes = (sample: MemorySample): number => sample.usedBytes + sample.backingBytes;

export interface CriterionVerdict { readonly pass: boolean; readonly reasons: readonly string[] }

export interface StepRecord {
  readonly step: SweepStep;
  readonly arrivedMs: number;
  readonly readyMs: number | null;
  readonly store: StoreSample | null;
  readonly runtimeState: string | null;
  readonly readiness: string | null;
  /** After a forced GC once both pages are settled; `onTransition` on the `on` page right after the teleport (next window loading). */
  readonly memory: { readonly legacy: MemorySample; readonly on: MemorySample; readonly onTransition?: MemorySample } | null;
  readonly terrain: PixelDiff | null;
  readonly full: PixelDiff | null;
  readonly noise: PixelDiff | null;
  /** Why the `on` build was not drawing and colliding from chunks at this step (null: it was). */
  readonly notServing: string | null;
}

/** Null when the `on` page draws and collides from its chunk window; otherwise why not. */
export function notServingReason(value: { readonly runtime: { readonly mode: string; readonly state: string; readonly stale: boolean } | null;
  readonly collision: { readonly fallbackReason: string | null; readonly failures: number } | null;
  readonly windowStatus: { readonly fallback: boolean; readonly failures: number } | null; readonly records: { readonly failures: number } | null } | null): string | null {
  if (value === null || value.runtime === null) return 'no_runtime';
  if (value.runtime.mode !== 'on') return `mode_${value.runtime.mode}`;
  if (value.runtime.state !== 'on' || value.runtime.stale) return `state_${value.runtime.state}${value.runtime.stale ? '_stale' : ''}`;
  if (value.windowStatus?.fallback === true || (value.windowStatus?.failures ?? 0) > 0) return 'window_fallback';
  if (value.collision?.fallbackReason) return `collision_${value.collision.fallbackReason}`;
  if ((value.collision?.failures ?? 0) > 0) return 'collision_failures';
  if ((value.records?.failures ?? 0) > 0) return 'records_failures';
  return null;
}

/** Criterion 1: bounded store over the whole sweep, and the chunk runtime's memory in the browser. */
export function occupancyVerdict(records: readonly StepRecord[], expectedSteps: number, steadyBudgetMiB: number): CriterionVerdict & {
  readonly peakResident: number; readonly peakResidentBytes: number; readonly evictions: number;
  readonly steadyDeltaMiB: number | null; readonly peakDeltaMiB: number | null; readonly steadyOnMiB: number | null; readonly steadyLegacyMiB: number | null } {
  const reasons: string[] = [];
  const stores = records.map(record => record.store);
  const present = stores.filter((store): store is StoreSample => store !== null);
  if (records.length !== expectedSteps) reasons.push(`swept ${records.length} of ${expectedSteps} chunk centres`);
  if (present.length !== records.length) reasons.push(`${records.length - present.length} step(s) without a serving store`);
  const peakResident = Math.max(0, ...present.map(store => store.residentCount));
  const peakResidentBytes = Math.max(0, ...present.map(store => store.residentBytes));
  for (const store of present) {
    if (store.residentCount > store.maxChunks || store.pinned > store.maxChunks) reasons.push(`store ${store.id} over ${store.maxChunks} chunks`);
    if (store.residentBytes > store.maxBytes) reasons.push(`store ${store.id} over ${store.maxBytes} bytes`);
  }
  const notReady = records.filter(record => record.readyMs === null).length;
  if (notReady > 0) reasons.push(`${notReady} step(s) never became ready`);
  const deltas = records.flatMap(record => record.memory === null ? [] : [(totalBytes(record.memory.on) - totalBytes(record.memory.legacy)) / MIB]);
  const transitions = records.flatMap(record => record.memory?.onTransition === undefined ? []
    : [(totalBytes(record.memory.onTransition) - totalBytes(record.memory.legacy)) / MIB]);
  const steadyDeltaMiB = percentile(deltas, 0.5), peakDeltaMiB = deltas.length === 0 ? null : Math.max(...deltas, ...transitions);
  if (steadyDeltaMiB === null) reasons.push('no memory samples');
  else if (steadyDeltaMiB > steadyBudgetMiB) reasons.push(`steady chunk-runtime heap ${steadyDeltaMiB.toFixed(1)} MiB over the ${steadyBudgetMiB} MiB budget`);
  const on = records.flatMap(record => record.memory === null ? [] : [totalBytes(record.memory.on) / MIB]);
  const legacy = records.flatMap(record => record.memory === null ? [] : [totalBytes(record.memory.legacy) / MIB]);
  return { pass: reasons.length === 0, reasons: [...new Set(reasons)], peakResident, peakResidentBytes, evictions: evictionsFrom(stores),
    steadyDeltaMiB, peakDeltaMiB, steadyOnMiB: percentile(on, 0.5), steadyLegacyMiB: percentile(legacy, 0.5) };
}

/**
 * Criterion 2. Terrain frames (entities hidden) must differ by no more than `maxDiffRatio`, or by no
 * more than 1.5x the step's own noise floor (each build against itself 400 ms later: animated
 * water and waterfalls are not in phase between two pages). Full-scene frames add wildlife and the
 * players, which move independently in each page: they must stay under `fullMaxDiffRatio`, and every
 * one over `maxDiffRatio` is listed for review. The on build must serve from chunks at every step.
 */
export function parityVerdict(records: readonly StepRecord[], maxDiffRatio: number, fullMaxDiffRatio = 0.01): CriterionVerdict & {
  readonly terrainOver: number; readonly fullOver: number; readonly worstTerrain: number; readonly worstFull: number; readonly exactTerrain: number;
  readonly terrainOverNoise: number; readonly reviewFull: readonly number[] } {
  const reasons: string[] = [];
  const terrain = records.flatMap(record => record.terrain === null ? [] : [record.terrain]);
  const full = records.flatMap(record => record.full === null ? [] : [record.full]);
  const terrainAllowance = (record: StepRecord) => Math.max(maxDiffRatio, 1.5 * (record.noise?.ratio ?? 0));
  const terrainOver = records.filter(record => record.terrain !== null && record.terrain.ratio > terrainAllowance(record)).length;
  const terrainOverNoise = records.filter(record => record.terrain !== null && record.terrain.ratio > maxDiffRatio).length;
  const fullOver = full.filter(diff => diff.ratio > fullMaxDiffRatio).length;
  const reviewFull = records.filter(record => record.full !== null && record.full.ratio > maxDiffRatio).map(record => record.step.index);
  if (terrain.length !== records.length) reasons.push(`${records.length - terrain.length} step(s) without a terrain comparison`);
  const notServing = records.filter(record => record.notServing !== null);
  if (notServing.length > 0) reasons.push(`${notServing.length} step(s) where the on build was not serving from chunks (${[...new Set(notServing.map(record => record.notServing))].join(', ')})`);
  if (terrainOver > 0) reasons.push(`${terrainOver} terrain frame(s) over ${(maxDiffRatio * 100).toFixed(2)}% differing pixels and over 1.5x their noise floor`);
  if (fullOver > 0) reasons.push(`${fullOver} full-scene frame(s) over ${(fullMaxDiffRatio * 100).toFixed(2)}% differing pixels`);
  return { pass: reasons.length === 0, reasons, terrainOver, terrainOverNoise, fullOver, reviewFull,
    worstTerrain: Math.max(0, ...terrain.map(diff => diff.ratio)), worstFull: Math.max(0, ...full.map(diff => diff.ratio)),
    exactTerrain: terrain.filter(diff => diff.anyChange === 0).length };
}

export interface ReadinessSample { readonly t: number; readonly ready: boolean; readonly reason: string | null; readonly state: string | null;
  readonly tileX: number | null; readonly tileY: number | null; readonly keyHeld: boolean; readonly key?: string;
  readonly predicted?: string | null; readonly ui?: string | null }

/** Movement before the terrain is ready: any server position change while a key was held and readiness was not ready. */
export function movementWhileWaiting(samples: readonly ReadinessSample[], start: { tileX: number; tileY: number } | null): {
  readonly waitedMs: number; readonly movedWhileWaiting: boolean; readonly movedAfterReady: boolean; readonly firstReadyAt: number | null } {
  let origin = start, waitedMs = 0, movedWhileWaiting = false, movedAfterReady = false, firstReadyAt: number | null = null, previous: ReadinessSample | undefined;
  for (const sample of samples) {
    if (origin === null && sample.tileX !== null && sample.tileY !== null) origin = { tileX: sample.tileX, tileY: sample.tileY };
    const moved = origin !== null && sample.tileX !== null && (sample.tileX !== origin.tileX || sample.tileY !== origin.tileY);
    if (!sample.ready) {
      if (previous !== undefined && !previous.ready) waitedMs += sample.t - previous.t;
      if (moved && sample.keyHeld && firstReadyAt === null) movedWhileWaiting = true;
    } else if (firstReadyAt === null) firstReadyAt = sample.t;
    if (sample.ready && moved) movedAfterReady = true;
    previous = sample;
  }
  return { waitedMs, movedWhileWaiting, movedAfterReady, firstReadyAt };
}

// --- The production-shaped island ---------------------------------------------------------------

const assetFor = (name: string) => {
  const category = name.startsWith('building_') ? 'buildings' : name.startsWith('tree_') ? 'trees' : name.startsWith('crop_') ? 'crops'
    : name.startsWith('wildlife_') ? 'characters' : 'props';
  const source = JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages/assets', category, `${name}.sprite.json`), 'utf8')) as { size: [number, number]; anchor: [number, number] };
  return { id: stableAssetId(name), width: source.size[0], height: source.size[1], anchor: source.anchor };
};

/** The production-shaped island the nightly parity tests use: the full Hearth content composition. */
export function productionShapedDocumentJson(): string {
  const registry = bootstrapContentRegistry();
  const landmarks = activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID);
  const composed = composeHearthContentMap(createLiveIslandMapDocument({ landmarks }), assetFor, 'source-fixture');
  if (composed.document === null) throw new Error(`hearth_composition_conflicts: ${composed.conflicts.slice(0, 5).join(',')}`);
  return serializeMapDocumentV3(composed.document);
}

/** A collision-only edit of one cell (changes exactly that chunk's blob). */
export function editedDocumentJson(documentJson: string, tileX: number, tileY: number): string {
  const registry = bootstrapContentRegistry();
  const raw = JSON.parse(documentJson) as { cells?: Record<string, unknown> };
  raw.cells = { ...(raw.cells ?? {}), [`${tileX},${tileY}`]: { collision: 'force_block', collisionReason: 's4g acceptance edit' } };
  return serializeMapDocumentV3(parseMapDocumentV3(JSON.stringify(raw), activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID)));
}

// --- World (owner) ------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>(resolvePromise => setTimeout(resolvePromise, ms));

async function waitFor<T>(label: string, read: () => T | undefined | null | false, timeoutMs: number, everyMs = 25): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (value !== undefined && value !== null && value !== false) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`${label}_timeout`);
    await sleep(everyMs);
  }
}

async function waitForAsync<T>(label: string, read: () => Promise<T | undefined | null | false>, timeoutMs: number, everyMs = 50): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await read();
    if (value !== undefined && value !== null && value !== false) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`${label}_timeout`);
    await sleep(everyMs);
  }
}

export class OwnerWorld {
  #sequence = 0;
  readonly #positionSubscriptions = new Set<string>();
  readonly #heartbeat: ReturnType<typeof setInterval>;
  constructor(readonly world: WorldConnection) {
    this.#heartbeat = setInterval(() => { void world.connection.reducers.heartbeat({ active: true }).catch(() => undefined); }, 5_000);
  }
  static async open(options: AcceptanceOptions): Promise<OwnerWorld> {
    const world = await connectWorld({ host: options.host, database: options.database }, await readTokenFile(options.tokenFile));
    await subscribeChunkInputs(world);
    await withTimeout('owner_subscription', new Promise<void>((resolvePromise, reject) => {
      world.connection.subscriptionBuilder().onApplied(() => resolvePromise()).onError(context => reject(new Error(String(context.event))))
        .subscribe([tables.ownAdminMutationPreviews]);
    }), 60_000);
    return new OwnerWorld(world);
  }
  get db() { return this.world.connection.db; }
  close(): void { clearInterval(this.#heartbeat); this.world.connection.disconnect(); }
  mapRow() { return this.db.liveMapDocument.mapId.find('live-island'); }
  shadowRevision(): number { return [...this.db.worldChunkShadow.iter()].find(row => row.spaceId === 0n)?.revision ?? 0; }
  manifest(): WorldChunkManifest {
    const row = [...this.db.worldChunkShadow.iter()].find(entry => entry.spaceId === 0n);
    if (row === undefined) throw new Error('no_published_manifest');
    return validateRuntimeManifest(JSON.parse(row.manifestJson));
  }
  chunkAuthority(): string {
    const row = this.db.spaceAdminFlag.spaceId.find(0);
    if (row === null) return 'off';
    try { return String((JSON.parse(row.flagsJson) as Record<string, unknown>)['chunkAuthority'] ?? 'off'); } catch { return 'off'; }
  }
  async publishMap(documentJson: string): Promise<{ revision: number; contentHash: string }> {
    const current = this.mapRow();
    const expectedRevision = current?.revision ?? 0;
    await this.world.connection.reducers.publishLiveMapDocument({ mapId: 'live-island', expectedRevision, documentJson,
      clientMutationId: `s4g-map-${Date.now()}` });
    const row = await waitFor('map_published', () => { const next = this.mapRow(); return next !== null && next.revision !== expectedRevision ? next : null; }, 60_000);
    return { revision: row.revision, contentHash: row.contentHash };
  }
  async setChunkAuthority(mode: 'off' | 'shadow' | 'on'): Promise<void> {
    await this.world.connection.reducers.setChunkAuthority({ mode });
    await waitFor(`chunk_authority_${mode}`, () => this.chunkAuthority() === mode, 10_000);
  }
  async trySetWeather(mode: string): Promise<string | null> {
    try { await this.world.connection.reducers.setWorldWeather({ weatherMode: mode }); return null; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  }
  async watchPosition(identityHex: string): Promise<void> {
    if (this.#positionSubscriptions.has(identityHex)) return;
    const identity = Identity.fromString(identityHex);
    await withTimeout('position_subscription', new Promise<void>((resolvePromise, reject) => {
      this.world.connection.subscriptionBuilder().onApplied(() => resolvePromise()).onError(context => reject(new Error(String(context.event))))
        .subscribe([tables.playerPosition.where(row => row.identity.eq(identity))]);
    }), 30_000);
    this.#positionSubscriptions.add(identityHex);
  }
  position(identityHex: string): { spaceId: number; tileX: number; tileY: number } | null {
    const row = this.db.playerPosition.identity.find(Identity.fromString(identityHex));
    return row === null ? null : { spaceId: Number(row.spaceId), tileX: Math.floor(row.x / TILE_SIZE_FIXED), tileY: Math.floor(row.y / TILE_SIZE_FIXED) };
  }
  /** Admin teleport (dry run, then the previewed mutation); null on arrival, else the refusal. */
  async teleport(identityHex: string, tileX: number, tileY: number): Promise<string | null> {
    await this.watchPosition(identityHex);
    const clientMutationId = `s4g-${Date.now()}-${++this.#sequence}`;
    const common = { identity: Identity.fromString(identityHex), reason: 's4g chunk runtime acceptance', clientMutationId,
      spaceId: TOPSIDE_SPACE_ID, tileX, tileY };
    try {
      await this.world.connection.reducers.adminTeleportPlayer({ ...common, dryRun: true, expectedBaseVersion: '', previewFingerprint: undefined });
      const preview = await waitFor('teleport_preview', () => [...this.db.ownAdminMutationPreviews.iter()].find(row => row.clientMutationId === clientMutationId), 10_000);
      await this.world.connection.reducers.adminTeleportPlayer({ ...common, dryRun: false, expectedBaseVersion: preview.baseVersion, previewFingerprint: preview.fingerprint });
      await waitFor('teleport_arrival', () => { const at = this.position(identityHex); return at !== null && at.spaceId === TOPSIDE_SPACE_ID && at.tileX === tileX && at.tileY === tileY; }, 10_000);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
}

// --- The S5b publish pipeline (local origin and chunk directory) ----------------------------------

export async function runPipeline(options: AcceptanceOptions, label: string): Promise<Record<string, unknown>> {
  const common = ['node_modules/tsx/dist/cli.mjs', 'scripts/world-chunks-publish.ts'];
  const target = ['--host', options.host, '--database', options.database, '--origin', options.onUrl, '--chunk-dir', options.chunkDir];
  const env: NodeJS.ProcessEnv = { ...process.env, WORLD_CHUNKS_TOKEN_FILE: options.tokenFile };
  delete env['WORLD_CHUNKS_TOKEN_LABEL']; delete env['WORLD_CHUNKS_PUBLISH_CONFIRM'];
  const planReport = join(options.evidenceDir, 'pipeline', `${label}-plan.json`), publishReport = join(options.evidenceDir, 'pipeline', `${label}-publish.json`);
  await mkdir(join(options.evidenceDir, 'pipeline'), { recursive: true });
  const started = Date.now();
  await execFileAsync(process.execPath, [...common, 'plan', ...target, '--report', planReport], { cwd: REPO_ROOT, env, maxBuffer: 64 * MIB, timeout: 600_000 });
  const plan = JSON.parse(await readFile(planReport, 'utf8')) as Record<string, unknown>;
  const confirmation = plan['confirmation'];
  if (typeof confirmation !== 'string') throw new Error('pipeline_plan_without_confirmation');
  await execFileAsync(process.execPath, [...common, 'publish', ...target, '--report', publishReport], {
    cwd: REPO_ROOT, env: { ...env, WORLD_CHUNKS_PUBLISH_CONFIRM: confirmation }, maxBuffer: 64 * MIB, timeout: 600_000 });
  const publish = JSON.parse(await readFile(publishReport, 'utf8')) as Record<string, unknown>;
  return { label, ms: Date.now() - started, outcome: publish['outcome'] ?? publish['ok'], confirmation, publish };
}

/** Walk targets from the published chunks the local origin serves (the chunk runtime's own ground collision). */
export async function walkTargets(owner: OwnerWorld, chunkDir: string): Promise<{ targets: WalkTarget[]; nearest: NearestWalkable }> {
  const manifest = owner.manifest();
  const blobs = new Map<string, Uint8Array>();
  for (const head of manifest.chunks) blobs.set(head.contentHash, new Uint8Array(await readFile(join(chunkDir, String(manifest.spaceId), `${head.contentHash}.bin`))));
  const contentHash = [...owner.db.worldChunkShadow.iter()].find(row => row.spaceId === 0n)!.contentHash;
  const runtime = assembleChunkLiveIslandRuntime(manifest, hash => blobs.get(hash), { contentHash });
  return { targets: chunkWalkTargets(manifest.width, manifest.height, runtime.ground.blocked),
    nearest: nearestWalkableIn(manifest.width, manifest.height, runtime.ground.blocked) };
}

// --- Browser ------------------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- playwright-core is loaded at runtime from outside the workspace */
type Browser = any; type Page = any; type CdpSession = any;

interface PageProbe {
  readonly identity: string | null;
  readonly connected: boolean;
  readonly error: string | null;
  readonly position: { readonly spaceId: number; readonly tileX: number; readonly tileY: number } | null;
  readonly runtime: { readonly mode: string; readonly state: string; readonly readyChunks: number; readonly residentBytes: number;
    readonly servingRevision: string | null; readonly pendingRevision: string | null; readonly swaps: number; readonly stale: boolean;
    readonly staleReasons: readonly string[]; readonly atlasPackFailures: number } | null;
  readonly readiness: { readonly ready: boolean; readonly reason: string; readonly missing: number } | null;
  readonly staging: { readonly pending: string | null; readonly staged: number; readonly synchronous: number } | null;
  readonly collision: { readonly missingChunks: number; readonly fallbackReason: string | null; readonly failures: number } | null;
  readonly windowStatus: { readonly failures: number; readonly lastError: string | null; readonly fallback: boolean } | null;
  readonly records: { readonly failures: number } | null;
  readonly store: StoreSample | null;
  readonly predicted?: { readonly tileX: number; readonly tileY: number } | null;
  readonly ui?: string | null;
}

const PROBE_SOURCE = `(() => {
  const o = window.__orchardOverworld; if (!o) return null;
  const s = o.snapshot(); const hex = value => value && typeof value.toHexString === 'function' ? value.toHexString() : String(value);
  const me = s.identityHex ? s.players.find(player => hex(player.identity) === s.identityHex) : undefined;
  const d = o.diagnostics(); const c = d.chunks ?? {};
  const tile = ${TILE_SIZE_FIXED};
  const plain = value => value === undefined ? null : JSON.parse(JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? Number(v) : v instanceof Set ? [...v] : v));
  return { identity: s.identityHex, connected: s.connected, error: s.error,
    position: me ? { spaceId: Number(me.spaceId), tileX: Math.floor(Number(me.x) / tile), tileY: Math.floor(Number(me.y) / tile) } : null,
    runtime: plain(c.runtime), readiness: plain(c.readiness), staging: plain(c.staging), collision: plain(c.collision),
    windowStatus: plain(c.window), records: plain(c.records), store: o.s4gChunkStore ? o.s4gChunkStore() : null,
    predicted: (() => { const p = o.predictedPosition ? o.predictedPosition() : null; return p ? { tileX: Math.floor(Number(p.x) / tile), tileY: Math.floor(Number(p.y) / tile) } : null; })(),
    ui: o.uiWindow ? o.uiWindow() : null, error2: s.error };
})()`;

async function probe(page: Page): Promise<PageProbe | null> {
  return await page.evaluate(PROBE_SOURCE) as PageProbe | null;
}

async function frames(page: Page, count = 3): Promise<void> {
  await page.evaluate(`new Promise(done => { let n = ${count}; const tick = () => (--n <= 0 ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); })`);
}

async function memory(cdp: CdpSession): Promise<MemorySample> {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const usage = await cdp.send('Runtime.getHeapUsage') as { usedSize: number; backingStorageSize?: number };
  return { usedBytes: usage.usedSize, backingBytes: usage.backingStorageSize ?? 0 };
}

const PRESENTATION = { clockHours: 12, continuousDay: 12, lunarProgress: 0.25, lunarIllumination: 0, cloudCover: 0 };

/** The shared camera (world pixels, top-left) centred on a tile, for a 1280 x 720 viewport at the default 2x world scale. */
export function cameraOn(tileX: number, tileY: number): { cameraX: number; cameraY: number } {
  return { cameraX: tileX * 16 + 8 - 320, cameraY: tileY * 16 + 8 - 180 };
}

/**
 * Fixed noon lighting, no clouds, no HUD or nameplates, and one camera for both builds (the two
 * players cannot share a tile, so they stand side by side and the camera, which also chooses the
 * chunk window, is pinned to the same world position in both pages). Null clears the preview.
 */
async function present(page: Page, entitiesHidden: boolean, camera: { cameraX: number; cameraY: number } | null): Promise<void> {
  const preview = camera === null ? null : { ...PRESENTATION, ...camera };
  await page.evaluate(`(() => { const o = window.__orchardOverworld; o.setInterfaceHidden(true); o.setNameplatesVisible(false);
    o.setEntitiesHidden(${entitiesHidden}); o.setLightingPreview(${JSON.stringify(preview)}); })()`);
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];

/** Bytes a page downloaded, by kind (CDP encoded lengths; WebSocket frames decoded). */
export interface LoadBytes { script: number; atlas: number; world: number; websocket: number; other: number; requests: number }

/** The byte category of a request path. */
export function loadCategory(path: string): keyof Omit<LoadBytes, 'websocket' | 'requests'> {
  if (/^\/world\//u.test(path)) return 'world';
  if (/^\/generated\//u.test(path)) return 'atlas';
  if (/^\/assets\/.*\.(?:js|css)$/u.test(path)) return 'script';
  return 'other';
}

interface Session { readonly label: 'legacy' | 'on'; readonly browser: Browser; readonly page: Page; readonly cdp: CdpSession; identity: string;
  /** Everything downloaded since the session opened (a cold profile). */
  readonly load: LoadBytes;
  /** The atlas page files (`/generated/atlas-<hash>.png`) it downloaded. */
  readonly atlasFiles: Set<string>;
  /** Cold-load screenshots still being written (see `openSession`'s `filmstrip`). */
  filmstrip?: Promise<number> }

/** Decoded bytes of the atlas pages a session downloaded, from the served consolidated index and
 * pack manifests (every page descriptor carries its decoded size). */
export async function decodedAtlasBytes(origin: string, files: ReadonlySet<string>): Promise<{ readonly pages: number; readonly decodedBytes: number }> {
  const sizes = new Map<string, number>();
  const json = async (path: string): Promise<Record<string, unknown> | null> => {
    const response = await fetch(`${origin}${path}`).catch(() => null);
    return response?.ok ? await response.json() as Record<string, unknown> : null;
  };
  const add = (atlases: unknown, pages: unknown): void => {
    for (const [key, file] of Object.entries((atlases ?? {}) as Record<string, string>)) {
      const page = (pages as Record<string, { decodedBytes?: number }> | undefined)?.[key.slice(0, key.lastIndexOf(':'))];
      if (typeof page?.decodedBytes === 'number') sizes.set(`/generated/${file}`, page.decodedBytes);
    }
  };
  const meta = await json('/generated/atlas.meta.json');
  add(meta?.['atlases'], meta?.['pages']);
  const index = await json('/generated/atlas.packs.json');
  for (const file of Object.values((index?.['packs'] ?? {}) as Record<string, string>)) {
    const pack = await json(`/generated/${file}`);
    add(pack?.['atlases'], pack?.['pages']);
  }
  let decodedBytes = 0, pages = 0;
  for (const file of files) { const bytes = sizes.get(file); if (bytes !== undefined) { decodedBytes += bytes; pages += 1; } }
  return { pages, decodedBytes };
}

export async function openSession(chromium: any, options: AcceptanceOptions, label: 'legacy' | 'on', url: string, slot: string,
  extra: { serviceWorkers?: 'allow' | 'block'; delayWorldMs?: number; seam?: 'on'; filmstrip?: string } = {}): Promise<Session> {
  const browser = await chromium.launch({ executablePath: options.chromePath, headless: true,
    args: ['--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: extra.serviceWorkers ?? 'allow' });
  if (extra.delayWorldMs !== undefined) {
    const delay = extra.delayWorldMs;
    await context.route(/\/world\/\d+\/[0-9a-f]{64}\.bin$/u, async (route: any) => { await sleep(delay); await route.continue(); });
  }
  if (extra.seam !== undefined) await context.addInitScript(`globalThis.__s4gChunkAuthority = ${JSON.stringify(extra.seam)}; globalThis.__s4gGateFix = true;`);
  const page = await context.newPage();
  page.on('pageerror', (error: Error) => console.error(`[s4g:${label}] pageerror ${error.message}`));
  const cdp = await context.newCDPSession(page);
  const load: LoadBytes = { script: 0, atlas: 0, world: 0, websocket: 0, other: 0, requests: 0 };
  const atlasFiles = new Set<string>();
  const paths = new Map<string, string>();
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (event: { requestId: string; request: { url: string } }) => {
    try { paths.set(event.requestId, new URL(event.request.url).pathname); } catch { /* data: URLs */ }
  });
  cdp.on('Network.loadingFinished', (event: { requestId: string; encodedDataLength: number }) => {
    const path = paths.get(event.requestId);
    if (path === undefined) return;
    load[loadCategory(path)] += event.encodedDataLength; load.requests += 1;
    if (/^\/generated\/atlas-[0-9a-f]{64}\.png$/u.test(path)) atlasFiles.add(path);
  });
  cdp.on('Network.webSocketFrameReceived', (event: { response: { opcode: number; payloadData: string } }) => {
    const data = event.response.payloadData;
    load.websocket += event.response.opcode === 2 ? Math.floor(data.length * 3 / 4) : data.length;
  });
  await page.goto(`${url}/?slot=${slot}`, { waitUntil: 'domcontentloaded' });
  const session: Session = { label, browser, page, cdp, identity: '', load, atlasFiles };
  // Cold-load filmstrip (static world S6): what a fresh profile shows while it loads, for the owner.
  if (extra.filmstrip !== undefined) {
    const directory = extra.filmstrip;
    session.filmstrip = (async () => {
      await mkdir(directory, { recursive: true });
      let shots = 0;
      for (; shots < 24; shots += 1) {
        await page.screenshot({ path: join(directory, `${label}-${String(shots).padStart(2, '0')}.png`), type: 'png' }).catch(() => undefined);
        await sleep(500);
      }
      return shots;
    })();
  }
  return session;
}

async function awaitPlaying(session: Session, timeoutMs = 180_000): Promise<PageProbe> {
  const state = await waitForAsync(`${session.label}_playing`, async () => {
    const value = await probe(session.page).catch(() => null);
    return value !== null && value.connected && value.identity !== null && value.position !== null ? value : null;
  }, timeoutMs, 250);
  session.identity = state.identity!;
  return state;
}

/** Ready at the tile: the page sees the position, and in `on` the spawn ring is resident and the window served and complete. */
async function awaitReadyAt(session: Session, step: { tileX: number; tileY: number }, requireOn: boolean, timeoutMs = 60_000): Promise<PageProbe> {
  return await waitForAsync(`${session.label}_ready_at_${step.tileX}_${step.tileY}`, async () => {
    const value = await probe(session.page);
    if (value === null || value.position === null || value.position.tileX !== step.tileX || value.position.tileY !== step.tileY) return null;
    if (!requireOn) return value;
    const runtime = value.runtime;
    if (runtime === null || runtime.mode !== 'on' || runtime.pendingRevision !== null || !(value.readiness?.ready ?? false)) return null;
    if ((value.staging?.pending ?? null) !== null || (value.collision?.missingChunks ?? 1) !== 0) return null;
    return value;
  }, timeoutMs, 50);
}

// --- Images -------------------------------------------------------------------------------------

async function loadCanvas(): Promise<any> {
  return await import('@napi-rs/canvas');
}

async function rgba(canvasModule: any, png: Uint8Array): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const image = await canvasModule.loadImage(Buffer.from(png));
  const canvas = canvasModule.createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return { data: context.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
}

/** legacy | on | heat map of the difference (red above the threshold, amber below, the legacy frame dimmed). */
async function sideBySide(canvasModule: any, legacy: Uint8Array, on: Uint8Array, threshold: number, path: string, title: string): Promise<void> {
  const a = await rgba(canvasModule, legacy), b = await rgba(canvasModule, on);
  const heat = new Uint8Array(a.width * a.height);
  diffRgba(a.data, b.data, a.width, a.height, threshold, [], heat);
  const canvas = canvasModule.createCanvas(a.width * 3, a.height + 24);
  const context = canvas.getContext('2d');
  context.fillStyle = '#111'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(await canvasModule.loadImage(Buffer.from(legacy)), 0, 24);
  context.drawImage(await canvasModule.loadImage(Buffer.from(on)), a.width, 24);
  const diff = context.createImageData(a.width, a.height);
  for (let index = 0; index < heat.length; index++) {
    const offset = index * 4, delta = heat[index]!;
    const grey = Math.round((a.data[offset]! * 0.3 + a.data[offset + 1]! * 0.59 + a.data[offset + 2]! * 0.11) * 0.35);
    diff.data[offset] = delta > threshold ? 255 : delta > 0 ? 255 : grey;
    diff.data[offset + 1] = delta > threshold ? 0 : delta > 0 ? 176 : grey;
    diff.data[offset + 2] = delta > threshold ? 0 : delta > 0 ? 0 : grey;
    diff.data[offset + 3] = 255;
  }
  context.putImageData(diff, a.width * 2, 24);
  context.fillStyle = '#eee'; context.font = '14px sans-serif';
  context.fillText(`legacy (off)  |  chunk runtime (on)  |  difference (red > ${threshold}, amber 1..${threshold})  —  ${title}`, 8, 17);
  await writeFile(path, canvas.encodeSync('png'));
}

async function memoryChart(canvasModule: any, records: readonly StepRecord[], path: string): Promise<void> {
  const width = 1200, height = 520, left = 64, right = 24, top = 40, bottom = 48;
  const series = records.filter(record => record.memory !== null);
  const legacy = series.map(record => totalBytes(record.memory!.legacy) / MIB), on = series.map(record => totalBytes(record.memory!.on) / MIB);
  const delta = series.map((_record, index) => on[index]! - legacy[index]!);
  const store = series.map(record => (record.store?.residentBytes ?? 0) / MIB);
  const all = [...legacy, ...on, ...delta, ...store, 0];
  const minimum = Math.min(...all), maximum = Math.max(...all) * 1.05;
  const canvas = canvasModule.createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
  const x = (index: number) => left + (series.length <= 1 ? 0 : index / (series.length - 1)) * (width - left - right);
  const y = (value: number) => top + (1 - (value - minimum) / (maximum - minimum || 1)) * (height - top - bottom);
  context.strokeStyle = '#ddd'; context.fillStyle = '#555'; context.font = '12px sans-serif'; context.lineWidth = 1;
  const stepSize = Math.max(1, Math.ceil((maximum - minimum) / 8 / 10) * 10);
  for (let value = Math.ceil(minimum / stepSize) * stepSize; value <= maximum; value += stepSize) {
    context.beginPath(); context.moveTo(left, y(value)); context.lineTo(width - right, y(value)); context.stroke();
    context.fillText(`${value} MiB`, 4, y(value) + 4);
  }
  context.fillText('sweep step (chunk centre, row-major)', width / 2 - 100, height - 14);
  const lines: [string, string, number[]][] = [['legacy build: heap + buffers', '#2a6fdb', legacy], ['on build: heap + buffers', '#d9480f', on],
    ['on − legacy (chunk runtime cost)', '#2b8a3e', delta], ['store resident (encoded chunks)', '#7048e8', store]];
  lines.forEach(([label, colour, values], index) => {
    context.strokeStyle = colour; context.lineWidth = 2; context.beginPath();
    values.forEach((value, step) => (step === 0 ? context.moveTo(x(step), y(value)) : context.lineTo(x(step), y(value))));
    context.stroke();
    context.fillStyle = colour; context.fillRect(left + index * 280, 12, 14, 4); context.fillStyle = '#222';
    context.fillText(label, left + index * 280 + 20, 18);
  });
  await writeFile(path, canvas.encodeSync('png'));
}

// --- Page state readers -------------------------------------------------------------------------

const IDB_SOURCE = `new Promise(resolvePromise => {
  const request = indexedDB.open('orchard-world-chunks-v2');
  request.onerror = () => resolvePromise({ error: String(request.error) });
  request.onsuccess = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains('meta')) { database.close(); resolvePromise({ entries: [] }); return; }
    const all = database.transaction('meta', 'readonly').objectStore('meta').getAll();
    all.onsuccess = () => { database.close(); resolvePromise({ entries: all.result.map(row => ({ hash: row.hash, spaceId: row.spaceId, byteLength: row.byteLength })) }); };
    all.onerror = () => { database.close(); resolvePromise({ error: String(all.error) }); };
  };
})`;

const SW_SOURCE = `(async () => {
  const names = typeof caches === 'undefined' ? [] : await caches.keys();
  const caches_ = [];
  for (const name of names) {
    const keys = await (await caches.open(name)).keys();
    caches_.push({ name, entries: keys.length, world: keys.filter(request => new URL(request.url).pathname.startsWith('/world/')).length });
  }
  const worldResources = performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.startsWith('/world/'));
  return { controller: navigator.serviceWorker?.controller?.scriptURL ?? null, caches: caches_,
    worldRequests: worldResources.length, worldViaWorker: worldResources.filter(entry => entry.workerStart > 0).length };
})()`;

// --- Rollback drill (G5a) ------------------------------------------------------------------------

/** A `vite preview` of one build directory on the drill port, started and stopped by the drill only. */
class DrillPreview {
  #child: ChildProcess | null = null;
  constructor(readonly options: AcceptanceOptions, readonly drill: RollbackDrillOptions, readonly logPath: string) {}
  get origin(): string { return `http://127.0.0.1:${this.drill.swapPort}`; }
  /** Replaces the served directory with a copy of `dist` (the release lane's dist swap), then starts the preview. */
  async serve(dist: string): Promise<void> {
    await this.stop();
    assertSwapDirShape(this.drill.workDir, this.drill.swapDir, [this.drill.distOn, this.drill.distLegacy]);
    await assertSwapDirOnDisk(this.drill.workDir, this.drill.swapDir);
    await rm(this.drill.swapDir, { recursive: true, force: true });
    await cp(dist, this.drill.swapDir, { recursive: true, verbatimSymlinks: true });
    const env: NodeJS.ProcessEnv = { ...process.env, S4G_OUT_DIR: this.drill.swapDir, S4G_PREVIEW_PORT: String(this.drill.swapPort),
      S4G_WORLD_HOST: this.options.host, VITE_SPACETIMEDB_DATABASE: this.options.database, ORCHARD_WORLD_CHUNK_DIR: this.options.chunkDir,
      S4G_CHUNK_AUTHORITY: '' };
    delete env['VITE_SPACETIMEDB_URI']; delete env['VITE_OIDC_CLIENT_ID'];
    const log = createWriteStream(this.logPath, { flags: 'a' });
    const child = spawn(process.execPath, [join(REPO_ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--config',
      join(REPO_ROOT, 'scripts/chunk-runtime-acceptance.vite.config.ts'), '--mode', 'chunk-runtime-preview'], { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.pipe(log); child.stderr?.pipe(log);
    this.#child = child;
    await waitForAsync('drill_preview_ready', async () => (await fetch(`${this.origin}/chunk-runtime-audit.json`).catch(() => null))?.ok === true, 60_000, 200);
  }
  async audit(): Promise<Record<string, unknown>> {
    return await (await fetch(`${this.origin}/chunk-runtime-audit.json`, { headers: { 'Cache-Control': 'no-cache' } })).json() as Record<string, unknown>;
  }
  async stop(): Promise<void> {
    const child = this.#child;
    this.#child = null;
    if (child === null || child.exitCode !== null) return;
    const exited = new Promise<void>(done => child.once('exit', () => done()));
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10_000)]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await exited; }
  }
}

export interface DrillPhase {
  readonly phase: 'on' | 'server-off' | 'previous-build' | 'on-again';
  readonly buildMode: unknown;
  readonly effectiveMode: string | null;
  readonly servingStore: boolean;
  readonly collisionFallback: string | null;
  /** Milliseconds from the switch (or the reload) until the page showed the expected mode. */
  readonly followMs: number | null;
  readonly worldRequests: number;
  /** Static world S6: the page showed "world updating" (no whole-map fallback) instead of the legacy path. */
  readonly worldUpdating?: boolean;
  readonly terrain: PixelDiff | null;
  readonly noise: PixelDiff | null;
  readonly failures: readonly string[];
}

/** What each drill phase must show. */
export function drillPhaseFailures(phase: Omit<DrillPhase, 'failures'>, maxDiffRatio: number): string[] {
  const failures: string[] = [];
  const expectOn = phase.phase === 'on' || phase.phase === 'on-again';
  if (phase.followMs === null) failures.push(`${phase.phase}: the page never reached the expected mode`);
  if (expectOn && (phase.effectiveMode !== 'on' || !phase.servingStore || phase.collisionFallback !== null)) {
    failures.push(`${phase.phase}: not serving from chunks (mode ${phase.effectiveMode}, fallback ${phase.collisionFallback})`);
  }
  if (!expectOn && (phase.servingStore || (phase.effectiveMode !== null && phase.effectiveMode !== 'off'))) {
    failures.push(`${phase.phase}: still on the chunk runtime (mode ${phase.effectiveMode})`);
  }
  // The previous build is any build that draws without chunks once the server is off: a legacy `off`
  // build, or (static world S6) the previous release's `on` client, which then falls back to its map.
  if (phase.phase !== 'previous-build' && phase.buildMode === 'off') failures.push(`${phase.phase}: served build mode off`);
  // Static world S6: with the server off, the S6 client shows "world updating" (there is no whole map to
  // fall back to), so its frame is not compared with the legacy page; the previous build then serves.
  if (phase.phase === 'server-off' && phase.worldUpdating === true) return failures;
  if (phase.phase === 'previous-build' && phase.worldUpdating === true) failures.push('previous-build: the previous client shows "world updating"');
  const allowance = Math.max(maxDiffRatio, 1.5 * (phase.noise?.ratio ?? 0));
  if (phase.terrain === null) failures.push(`${phase.phase}: no frame comparison`);
  else if (phase.terrain.ratio > allowance) failures.push(`${phase.phase}: frames differ on ${(phase.terrain.ratio * 100).toFixed(3)}% of pixels`);
  return failures;
}

// --- The run ------------------------------------------------------------------------------------

interface Evidence {
  schema: 1;
  startedAt: string;
  finishedAt?: string;
  result: 'passed' | 'failed';
  failures: string[];
  target: { host: string; database: string; legacyUrl: string; onUrl: string };
  builds: Record<string, unknown>;
  map?: Record<string, unknown>;
  pipeline: Record<string, unknown>[];
  weather?: string | null;
  sweep?: Record<string, unknown>;
  criteria: Record<string, unknown>;
  spawnPrefetch?: Record<string, unknown>;
  invalidation?: Record<string, unknown>;
  rollbackDrill?: Record<string, unknown>;
  coldLoad?: Record<string, unknown>;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const options = parseAcceptanceArgs(argv);
  const log = (line: string) => console.log(`[s4g] ${new Date().toISOString().slice(11, 19)} ${line}`);
  await mkdir(join(options.evidenceDir, 'side-by-side'), { recursive: true });
  const require = createRequire(import.meta.url);
  const { chromium } = require(options.playwrightModule) as { chromium: any };
  const canvasModule = await loadCanvas();
  const evidence: Evidence = { schema: 1, startedAt: new Date().toISOString(), result: 'failed', failures: [],
    target: { host: options.host, database: options.database, legacyUrl: options.legacyUrl, onUrl: options.onUrl }, builds: {}, pipeline: [], criteria: {} };
  const fail = (message: string) => { evidence.failures.push(message); log(`FAIL ${message}`); };
  // Letters only, unique per run: the slot becomes the character name, and a name the server
  // refuses (digits, a duplicate) opens the naming dialog, which then holds the keyboard.
  const runTag = Array.from({ length: 5 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  for (const [label, url] of [['legacy', options.legacyUrl], ['on', options.onUrl]] as const) {
    evidence.builds[label] = JSON.parse(await (await fetch(`${url}/chunk-runtime-audit.json`)).text());
  }
  const owner = await OwnerWorld.open(options);
  const sessions: Session[] = [];
  const stepsPath = join(options.evidenceDir, 'steps.jsonl');
  await writeFile(stepsPath, '');
  let legacySession: Session | null = null;

  /** G5a: on, the server switch off (the page follows), the previous build swapped in, the on build and switch back. */
  const rollbackDrill = async (drillOptions: RollbackDrillOptions): Promise<Record<string, unknown>> => {
    const legacy = legacySession!;
    const preview = new DrillPreview(options, drillOptions, join(options.evidenceDir, 'drill-preview.log'));
    // BUG-053 still on main: the build's seam is the acceptance hook, so the server switch is mirrored on the page.
    const hooked = (evidence.criteria['seam-unconnected (BUG-053)'] as { effectiveMode?: string } | undefined)?.effectiveMode === 'shadow';
    const phases: DrillPhase[] = [];
    try {
      await preview.serve(drillOptions.distOn);
      const drill = await openSession(chromium, options, 'on', preview.origin, `Drill${runTag}`, { seam: 'on' });
      sessions.push(drill);
      await awaitPlaying(drill);
      const anchor = (await probe(legacy.page))!.position!;
      let tile: { tileX: number; tileY: number } | null = null;
      for (const [dx, dy] of NEIGHBOURS) {
        if (await owner.teleport(drill.identity, anchor.tileX + dx, anchor.tileY + dy) === null) { tile = { tileX: anchor.tileX + dx, tileY: anchor.tileY + dy }; break; }
      }
      if (tile === null) throw new Error('drill_no_tile_beside_the_legacy_player');
      const at = tile;
      const camera = cameraOn(anchor.tileX, anchor.tileY);
      let worldRequests = 0;
      drill.page.on('request', (request: any) => { if (new URL(request.url()).pathname.startsWith('/world/')) worldRequests++; });
      const phase = async (name: DrillPhase['phase'], expectOn: boolean, startedAt: number): Promise<void> => {
        const reached = await waitForAsync(`drill_${name}`, async () => {
          const value = await probe(drill.page).catch(() => null);
          if (value === null || value.position === null || value.position.tileX !== at.tileX || value.position.tileY !== at.tileY) return null;
          if (expectOn) {
            return value.runtime?.mode === 'on' && value.runtime.state === 'on' && value.store !== null && value.collision?.fallbackReason === null
              && (value.readiness?.ready ?? false) && (value.staging?.pending ?? null) === null ? value : null;
          }
          return value.store === null && (value.runtime === null || value.runtime.mode === 'off') ? value : null;
        }, 60_000, 50).catch(() => null);
        const followMs = reached === null ? null : Date.now() - startedAt;
        await Promise.all([present(legacy.page, true, camera), present(drill.page, true, camera)]);
        await sleep(800);
        let best: { a: Uint8Array; b: Uint8Array; diff: PixelDiff } | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await sleep(400);
          await Promise.all([frames(legacy.page, 4), frames(drill.page, 4)]);
          const [a, b] = await Promise.all([legacy.page.screenshot({ type: 'png' }), drill.page.screenshot({ type: 'png' })]) as [Uint8Array, Uint8Array];
          const [ia, ib] = await Promise.all([rgba(canvasModule, a), rgba(canvasModule, b)]);
          const diff = diffRgba(ia.data, ib.data, ia.width, ia.height, options.pixelThreshold);
          if (best === null || diff.ratio < best.diff.ratio) best = { a, b, diff };
          if (diff.ratio <= options.maxDiffRatio / 4) break;
        }
        await sleep(400);
        await frames(drill.page, 2);
        const [first, again] = await Promise.all([rgba(canvasModule, best!.b), rgba(canvasModule, await drill.page.screenshot({ type: 'png' }) as Uint8Array)]);
        const noise = diffRgba(first.data, again.data, first.width, first.height, options.pixelThreshold);
        const after = await probe(drill.page);
        const record = { phase: name, buildMode: (await preview.audit())['mode'], effectiveMode: after?.runtime?.mode ?? null,
          servingStore: after?.store !== null && after?.store !== undefined, collisionFallback: after?.collision?.fallbackReason ?? null,
          followMs, worldRequests, terrain: best!.diff, noise, worldUpdating: after?.readiness?.reason === 'world_updating' };
        const failures = drillPhaseFailures(record, options.maxDiffRatio);
        phases.push({ ...record, failures });
        for (const failure of failures) fail(`rollback drill ${failure}`);
        await sideBySide(canvasModule, best!.a, best!.b, options.pixelThreshold, join(options.evidenceDir, 'side-by-side', `rollback-drill-${name}.png`),
          `rollback drill: ${name} (legacy page | drill page)`);
        log(`drill ${name}: mode ${record.effectiveMode}, follow ${followMs ?? '-'} ms, /world/ requests ${worldRequests}, diff ${(best!.diff.ratio * 100).toFixed(3)}%`);
        worldRequests = 0;
      };
      await phase('on', true, Date.now());
      // 1. The server switch goes off: the on client must follow and draw from the legacy path.
      const offAt = Date.now();
      await owner.setChunkAuthority('off');
      if (hooked) {
        // The hook stands in for the unconnected seam (BUG-053); a pin change makes the controller re-read it.
        await drill.page.evaluate(`globalThis.__s4gChunkAuthority = 'off';`);
        await present(drill.page, true, cameraOn(anchor.tileX + 3, anchor.tileY));
        await frames(drill.page, 3);
        await present(drill.page, true, null);
      }
      await phase('server-off', false, offAt);
      // 2. The previous (legacy) client build is swapped in and the page reloads, as after the lane's dist restore.
      const swapAt = Date.now();
      await preview.serve(drillOptions.distLegacy);
      await drill.page.reload({ waitUntil: 'domcontentloaded' });
      await awaitPlaying(drill);
      await phase('previous-build', false, swapAt);
      // 3. Re-activation: the on build back, then the server switch on.
      const againAt = Date.now();
      await preview.serve(drillOptions.distOn);
      await owner.setChunkAuthority('on');
      await drill.page.reload({ waitUntil: 'domcontentloaded' });
      await awaitPlaying(drill);
      await phase('on-again', true, againAt);
    } catch (error) {
      fail(`rollback drill aborted: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await preview.stop();
    }
    return { seamSimulated: hooked, phases, pass: phases.length === 4 && phases.every(phase => phase.failures.length === 0) };
  };
  try {
    // 1. Map, heads, authority.
    let documentJson: string;
    if (owner.mapRow() === null) {
      log('publishing the production-shaped island');
      documentJson = productionShapedDocumentJson();
      evidence.map = { initial: await owner.publishMap(documentJson), documentChars: documentJson.length };
    } else {
      documentJson = owner.mapRow()!.documentJson;
      evidence.map = { initial: { revision: owner.mapRow()!.revision, contentHash: owner.mapRow()!.contentHash, existing: true } };
    }
    log('publishing chunk heads through the S5b pipeline');
    evidence.pipeline.push(await runPipeline(options, 'initial'));
    await waitFor('shadow_revision_1', () => owner.shadowRevision() >= 1, 30_000);
    await owner.setChunkAuthority('on');
    evidence.weather = await owner.trySetWeather('clear');
    const manifest = owner.manifest();
    const walk = await walkTargets(owner, options.chunkDir);
    const plan = sweepPlan(walk.targets, walk.nearest);
    const steps = options.limit === null ? plan : plan.slice(0, options.limit);
    log(`${manifest.chunks.length} chunk heads at revision ${owner.shadowRevision()}; sweeping ${steps.length} chunk centres`
      + ` (${plan.filter(step => !step.inChunk).length} without walkable ground use the nearest walkable tile)`);

    // 2. Sweep.
    const filmstrip = join(options.evidenceDir, 'cold-load');
    const legacy = await openSession(chromium, options, 'legacy', options.legacyUrl, `Legacy${runTag}`, { filmstrip });
    const on = await openSession(chromium, options, 'on', options.onUrl, `Chunks${runTag}`, { filmstrip });
    sessions.push(legacy, on);
    legacySession = legacy;
    await Promise.all([awaitPlaying(legacy), awaitPlaying(on)]);
    log(`players: legacy ${legacy.identity.slice(0, 12)}…, on ${on.identity.slice(0, 12)}…`);
    // Cold load: bytes each fresh profile downloaded until it plays and its spawn ring is resident,
    // with the heap after a forced GC at that moment (static world S6 and atlas-pack measurements).
    {
      const coldLoad: Record<string, unknown> = {};
      for (const session of [legacy, on]) {
        const at = await probe(session.page);
        if (at?.position) await awaitReadyAt(session, at.position, session.label === 'on').catch(() => null);
        await sleep(1_500);
        coldLoad[session.label] = { bytes: { ...session.load }, memory: await memory(session.cdp),
          atlasPages: await decodedAtlasBytes(session.label === 'on' ? options.onUrl : options.legacyUrl, session.atlasFiles),
          filmstripFrames: await session.filmstrip };
      }
      evidence.coldLoad = coldLoad;
      log(`cold load: ${JSON.stringify(coldLoad)}`);
    }
    // BUG-053: with the seam as on main (no authority), the `on` build only ever runs `shadow`,
    // even though the world's chunkAuthority is `on`. Record that, then connect the hook.
    const unconnected = await waitForAsync('on_build_settles_unconnected', async () => {
      const value = await probe(on.page);
      return value?.runtime?.state === 'shadow' ? value : null;
    }, 30_000).catch(() => null);
    await sleep(2_000);
    const unconnectedLater = await probe(on.page);
    evidence.criteria['seam-unconnected (BUG-053)'] = { worldChunkAuthority: owner.chunkAuthority(), buildMode: (evidence.builds['on'] as { mode?: string }).mode,
      effectiveMode: unconnectedLater?.runtime?.mode ?? null, state: unconnectedLater?.runtime?.state ?? null, firstState: unconnected?.runtime?.state ?? null,
      readiness: unconnectedLater?.readiness?.reason ?? null, servingStore: unconnectedLater?.store !== null };
    await on.page.evaluate(`globalThis.__s4gChunkAuthority = 'on';`);
    // The controller reads the authority on its next update (a move): step the on player one tile.
    const here = (await probe(on.page))?.position;
    if (here) for (const [dx, dy] of NEIGHBOURS) if (await owner.teleport(on.identity, here.tileX + dx, here.tileY + dy) === null) break;
    // BUG-055: with the seam connected but the gate as on main, chunk collision and map records never serve.
    const gated = await waitForAsync('on_build_serves_store', async () => {
      const value = await probe(on.page);
      return value?.runtime?.mode === 'on' && value.runtime.state === 'on' && value.store !== null ? value : null;
    }, 60_000).catch(() => null);
    await sleep(1_000);
    const gatedLater = await probe(on.page);
    evidence.criteria['gate-null-coalesced (BUG-055)'] = { effectiveMode: gatedLater?.runtime?.mode ?? null, state: gatedLater?.runtime?.state ?? null,
      servedStore: gated !== null, gate: (gatedLater?.store as { gate?: unknown } | null)?.gate ?? null,
      collisionFallback: gatedLater?.collision?.fallbackReason ?? null };
    await on.page.evaluate(`globalThis.__s4gGateFix = true;`);
    await on.page.context().addInitScript(`globalThis.__s4gChunkAuthority = 'on'; globalThis.__s4gGateFix = true;`);
    const records: StepRecord[] = [];
    const worst: { index: number; ratio: number; kind: 'terrain' | 'full'; legacy: Uint8Array; on: Uint8Array }[] = [];
    const keep = new Set([0, Math.floor(steps.length / 4), Math.floor(steps.length / 2), Math.floor((3 * steps.length) / 4), steps.length - 1]);
    // Both players stand within two tiles of the camera centre: their sprites differ by build (own versus remote).
    const playerMask: Rect[] = [{ x: 640 - 112, y: 360 - 104, width: 224, height: 176 }];
    const sweepStarted = Date.now();
    for (const planned of steps) {
      const began = Date.now();
      // The camera follows each player again while they move (a pinned camera would hold the window).
      await Promise.all([present(legacy.page, true, null), present(on.page, true, null)]);
      // The legacy player on the first tile the server accepts, the on player right beside it.
      let step: SweepStep | null = null, onTile: { tileX: number; tileY: number } | null = null;
      const refusals: string[] = [];
      for (const tile of planned.alternatives ?? [planned]) {
        const first = await owner.teleport(legacy.identity, tile.tileX, tile.tileY);
        if (first !== null) { refusals.push(`${tile.tileX},${tile.tileY}:${first}`); continue; }
        for (const [dx, dy] of NEIGHBOURS) {
          const second = await owner.teleport(on.identity, tile.tileX + dx, tile.tileY + dy);
          if (second === null) { onTile = { tileX: tile.tileX + dx, tileY: tile.tileY + dy }; break; }
        }
        if (onTile !== null) { step = { ...planned, tileX: tile.tileX, tileY: tile.tileY }; break; }
        refusals.push(`${tile.tileX},${tile.tileY}:no_neighbour_for_on`);
      }
      if (step === null || onTile === null) { fail(`step ${planned.index} (${planned.cx},${planned.cy}): no tile accepted (${refusals.slice(0, 3).join('; ')})`); continue; }
      const arrivedMs = Date.now() - began;
      // While the next window loads and is prepared (the Node peak was measured there).
      const onTransition = step.index === 0 ? undefined : await memory(on.cdp);
      const camera = cameraOn(step.tileX, step.tileY);
      let ready: PageProbe | null = null;
      try {
        await awaitReadyAt(legacy, step, false);
        await awaitReadyAt(on, onTile, true);
        // Both cameras on the legacy player's tile; the on window follows the camera, so wait again.
        await Promise.all([present(legacy.page, true, camera), present(on.page, true, camera)]);
        await Promise.all([frames(legacy.page, 3), frames(on.page, 3)]);
        ready = await awaitReadyAt(on, onTile, true);
      } catch (error) { fail(`step ${step.index} (${step.cx},${step.cy}): ${error instanceof Error ? error.message : String(error)}`); }
      const readyMs = ready === null ? null : Date.now() - began;
      // Each page must also show the other player where it stands (remote positions arrive with the region subscription).
      await Promise.all([[legacy, on.identity, onTile], [on, legacy.identity, step]].map(([session, other, tile]) =>
        waitForAsync('remote_player_settled', async () => (await (session as Session).page.evaluate(`(() => {
          const s = window.__orchardOverworld.snapshot(); const hex = v => v && v.toHexString ? v.toHexString() : String(v);
          const p = s.players.find(q => hex(q.identity) === ${JSON.stringify(other)});
          return p !== undefined && Math.floor(Number(p.x) / ${TILE_SIZE_FIXED}) === ${(tile as { tileX: number }).tileX}
            && Math.floor(Number(p.y) / ${TILE_SIZE_FIXED}) === ${(tile as { tileY: number }).tileY};
        })()`)) as boolean, 5_000).catch(() => undefined)));
      // Let the ground cache, the staged window and remote interpolation settle before comparing frames.
      await sleep(800);
      const capture = async (entitiesHidden: boolean) => {
        await Promise.all([present(legacy.page, entitiesHidden, camera), present(on.page, entitiesHidden, camera)]);
        await Promise.all([frames(legacy.page, 4), frames(on.page, 4)]);
        const [a, b] = await Promise.all([legacy.page.screenshot({ type: 'png' }), on.page.screenshot({ type: 'png' })]) as [Uint8Array, Uint8Array];
        return { a, b };
      };
      // Up to three matched captures 400 ms apart, keeping the closest: animated water and waterfalls,
      // wildlife and remote-player interpolation are not in phase between two pages.
      const best = async (entitiesHidden: boolean, mask: readonly Rect[]) => {
        let chosen: { pngs: { a: Uint8Array; b: Uint8Array }; diff: PixelDiff; attempts: number } | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          if (attempt > 1) await sleep(400);
          const pngs = await capture(entitiesHidden);
          const [ia, ib] = await Promise.all([rgba(canvasModule, pngs.a), rgba(canvasModule, pngs.b)]);
          const diff = diffRgba(ia.data, ib.data, ia.width, ia.height, options.pixelThreshold, mask);
          if (chosen === null || diff.ratio < chosen.diff.ratio) chosen = { pngs, diff, attempts: attempt };
          if (diff.ratio <= options.maxDiffRatio / 4) break;
        }
        return chosen!;
      };
      const terrainBest = await best(true, []);
      const terrain = terrainBest.diff, terrainPngs = terrainBest.pngs;
      // Noise floor: each build against itself 400 ms later (animation phase alone), every step; the larger.
      let noise: PixelDiff | null = null;
      {
        const [firstA, firstB] = await Promise.all([rgba(canvasModule, terrainPngs.a), rgba(canvasModule, terrainPngs.b)]);
        await sleep(400);
        await Promise.all([frames(legacy.page, 2), frames(on.page, 2)]);
        const [againA, againB] = await Promise.all([legacy.page.screenshot({ type: 'png' }), on.page.screenshot({ type: 'png' })]) as [Uint8Array, Uint8Array];
        const [ra, rb] = await Promise.all([rgba(canvasModule, againA), rgba(canvasModule, againB)]);
        const selfA = diffRgba(firstA.data, ra.data, ra.width, ra.height, options.pixelThreshold);
        const selfB = diffRgba(firstB.data, rb.data, rb.width, rb.height, options.pixelThreshold);
        noise = selfA.ratio >= selfB.ratio ? selfA : selfB;
      }
      const fullBest = await best(false, playerMask);
      const full = fullBest.diff, fullShots = fullBest.pngs;
      const [legacyMemory, onMemory] = await Promise.all([memory(legacy.cdp), memory(on.cdp)]);
      const after = await probe(on.page);
      const record: StepRecord = { step, arrivedMs, readyMs, store: after?.store ?? null, runtimeState: after?.runtime?.state ?? null,
        readiness: after?.readiness?.reason ?? null, memory: { legacy: legacyMemory, on: onMemory, ...(onTransition === undefined ? {} : { onTransition }) }, terrain, full, noise, notServing: notServingReason(after) };
      records.push(record);
      await writeFile(stepsPath, `${JSON.stringify({ ...record, collision: after?.collision, staging: after?.staging, windowStatus: after?.windowStatus,
        runtime: after?.runtime })}\n`, { flag: 'a' });
      const label = `step ${step.index} chunk ${step.cx},${step.cy} tile ${step.tileX},${step.tileY}`;
      if (keep.has(step.index)) {
        await sideBySide(canvasModule, terrainPngs.a, terrainPngs.b, options.pixelThreshold, join(options.evidenceDir, 'side-by-side', `step-${String(step.index).padStart(3, '0')}-terrain.png`), `${label}, entities hidden`);
        await sideBySide(canvasModule, fullShots.a, fullShots.b, options.pixelThreshold, join(options.evidenceDir, 'side-by-side', `step-${String(step.index).padStart(3, '0')}-full.png`), `${label}, full scene`);
      }
      for (const [kind, diff, pngs] of [['terrain', terrain, terrainPngs], ['full', full, fullShots]] as const) {
        worst.push({ index: step.index, ratio: diff.ratio, kind, legacy: pngs.a, on: pngs.b });
        worst.sort((x, y) => y.ratio - x.ratio);
        worst.splice(4);
      }
      log(`${label}: ready ${readyMs ?? '-'} ms, store ${after?.store?.residentCount ?? '-'}/${after?.store?.pinned ?? '-'} `
        + `(${((after?.store?.residentBytes ?? 0) / MIB).toFixed(2)} MiB), Δheap ${((totalBytes(onMemory) - totalBytes(legacyMemory)) / MIB).toFixed(1)} MiB, `
        + `diff terrain ${(terrain.ratio * 100).toFixed(3)}% full ${(full.ratio * 100).toFixed(3)}%`);
    }
    for (const entry of worst) {
      if (entry.ratio === 0) continue;
      await sideBySide(canvasModule, entry.legacy, entry.on, options.pixelThreshold,
        join(options.evidenceDir, 'side-by-side', `worst-${entry.kind}-step-${String(entry.index).padStart(3, '0')}.png`),
        `worst ${entry.kind}: step ${entry.index}, ${(entry.ratio * 100).toFixed(3)}% over threshold`);
    }
    await memoryChart(canvasModule, records, join(options.evidenceDir, 'memory.png'));
    await writeFile(join(options.evidenceDir, 'memory.csv'), ['step,cx,cy,legacy_used,legacy_backing,on_used,on_backing,delta_mib,transition_delta_mib,store_resident,store_bytes,store_installs']
      .concat(records.map(record => [record.step.index, record.step.cx, record.step.cy, record.memory?.legacy.usedBytes, record.memory?.legacy.backingBytes,
        record.memory?.on.usedBytes, record.memory?.on.backingBytes,
        record.memory === null ? '' : ((totalBytes(record.memory.on) - totalBytes(record.memory.legacy)) / MIB).toFixed(3),
        record.memory?.onTransition === undefined ? '' : ((totalBytes(record.memory.onTransition) - totalBytes(record.memory.legacy)) / MIB).toFixed(3),
        record.store?.residentCount, record.store?.residentBytes, record.store?.installs].join(','))).join('\n') + '\n');
    await writeFile(join(options.evidenceDir, 'diffs.csv'), ['step,cx,cy,terrain_ratio,terrain_any,terrain_max,full_ratio,full_any,full_max,noise_ratio']
      .concat(records.map(record => [record.step.index, record.step.cx, record.step.cy, record.terrain?.ratio, record.terrain?.anyChange, record.terrain?.maxDelta,
        record.full?.ratio, record.full?.anyChange, record.full?.maxDelta, record.noise?.ratio ?? ''].join(','))).join('\n') + '\n');
    const occupancy = occupancyVerdict(records, steps.length, options.steadyBudgetMiB);
    const parity = parityVerdict(records, options.maxDiffRatio);
    const noiseRatios = records.flatMap(record => record.noise === null ? [] : [record.noise.ratio]);
    evidence.sweep = { steps: steps.length, sweepMs: Date.now() - sweepStarted, readyP50Ms: percentile(records.flatMap(r => r.readyMs ?? []), 0.5),
      readyP95Ms: percentile(records.flatMap(r => r.readyMs ?? []), 0.95), noiseFloor: { samples: noiseRatios.length, max: Math.max(0, ...noiseRatios),
        p50: percentile(noiseRatios, 0.5) }, withoutWalkableGround: steps.filter(step => !step.inChunk).map(step => `${step.cx},${step.cy}`),
      distinctStandingTiles: new Set(steps.map(step => `${step.tileX},${step.tileY}`)).size,
      pinCoverage: pinCoverage(records, manifest.chunks.map(head => `${head.cx}:${head.cy}`)) };
    evidence.criteria['1-occupancy-and-memory'] = occupancy;
    evidence.criteria['2-visual-parity'] = { ...parity, pixelThreshold: options.pixelThreshold, maxDiffRatio: options.maxDiffRatio, fullMaxDiffRatio: 0.01 };
    if (!occupancy.pass) for (const reason of occupancy.reasons) fail(`criterion 1: ${reason}`);
    if (!parity.pass) for (const reason of parity.reasons) fail(`criterion 2: ${reason}`);

    if (!options.skip.has('invalidation')) {
      // 4. Invalidation on head revision (while the sweep's `on` page is still open).
      log('invalidation: two map edits republished as head revisions');
      const invalidation: Record<string, unknown> = {};
      const at = await probe(on.page);
      const editChunk = { cx: Math.floor(at!.position!.tileX / WORLD_CHUNK_SIZE), cy: Math.floor(at!.position!.tileY / WORLD_CHUNK_SIZE) };
      const headOf = (revisionManifest: WorldChunkManifest) => revisionManifest.chunks.find(head => head.cx === editChunk.cx && head.cy === editChunk.cy)!.contentHash;
      const idb = async () => (await on.page.evaluate(IDB_SOURCE)) as { entries?: { hash: string; spaceId: number }[]; error?: string };
      const revisions: { revision: number; editedHash: string; manifest: WorldChunkManifest }[] = [{ revision: owner.shadowRevision(), editedHash: headOf(manifest), manifest }];
      invalidation['editChunk'] = editChunk;
      invalidation['before'] = { idbEntries: (await idb()).entries?.length ?? null, sw: await on.page.evaluate(SW_SOURCE) };
      let current = documentJson;
      const edits: Record<string, unknown>[] = [];
      // Cells not edited before (a rerun against the same world must still change the chunk).
      const base = 3 + ((owner.mapRow()?.revision ?? 0) * 7) % 40;
      for (const [index, offset] of [[1, base], [2, base + 2]] as const) {
        const tileX = editChunk.cx * WORLD_CHUNK_SIZE + offset, tileY = editChunk.cy * WORLD_CHUNK_SIZE + offset;
        current = editedDocumentJson(current, tileX, tileY);
        const map = await owner.publishMap(current);
        // SW-D2: until the heads follow the map the client reports the lag and keeps serving the pinned
        // chunks, collision included (the server does the same), never a legacy fallback.
        const stale = await waitForAsync('client_reports_map_lag', async () => {
          const value = await probe(on.page);
          const lagging = value?.runtime?.staleReasons.includes('map') === true
            || (value?.collision?.fallbackReason === null && value.runtime?.servingRevision !== null);
          return lagging && value?.collision?.fallbackReason === null
            ? { staleReasons: value.runtime?.staleReasons ?? [], collision: value.collision.fallbackReason } : null;
        }, 30_000).catch(() => null);
        const swapsBefore = (await probe(on.page))?.runtime?.swaps ?? 0;
        evidence.pipeline.push(await runPipeline(options, `edit-${index}`));
        const revision = owner.shadowRevision();
        const next = owner.manifest();
        revisions.push({ revision, editedHash: headOf(next), manifest: next });
        const swapped = await waitForAsync('client_swapped', async () => {
          const value = await probe(on.page);
          return value?.runtime?.servingRevision === `0:${revision}` && value.runtime.pendingRevision === null && value.collision?.fallbackReason === null ? value.runtime : null;
        }, 60_000).catch(() => null);
        await sleep(1_000);
        const entries = (await idb()).entries ?? [];
        const hashes = new Set(entries.map(entry => entry.hash));
        const keepSet = new Set([...next.chunks, ...revisions.at(-2)!.manifest.chunks].map(head => head.contentHash));
        const outside = entries.filter(entry => !keepSet.has(entry.hash)).length;
        edits.push({ index, tile: `${tileX},${tileY}`, map, lagWhileServing: stale, swapped: swapped !== null, swapsBefore, swapsAfter: swapped?.swaps ?? null,
          servingRevision: swapped?.servingRevision ?? null, editedHashChanged: revisions.at(-1)!.editedHash !== revisions.at(-2)!.editedHash,
          idbEntries: entries.length, idbHasNewHash: hashes.has(revisions.at(-1)!.editedHash), idbHasPreviousHash: hashes.has(revisions.at(-2)!.editedHash),
          idbHasRevisionOneHash: hashes.has(revisions[0]!.editedHash), idbEntriesOutsideCurrentAndPrevious: outside });
        if (stale === null) fail(`invalidation edit ${index}: the on client stopped serving its pinned chunks while the map lagged`);
        if (swapped === null) fail(`invalidation edit ${index}: the on client did not swap to head revision ${revision} and serve chunk collision again`);
        if (!hashes.has(revisions.at(-1)!.editedHash)) fail(`invalidation edit ${index}: the new chunk blob is not in IndexedDB`);
        if (outside > 0) fail(`invalidation edit ${index}: ${outside} IndexedDB entr(ies) outside the current and previous manifests`);
        if (index === 2 && hashes.has(revisions[0]!.editedHash)) fail('invalidation: the revision-1 blob of the edited chunk was not pruned after two swaps');
      }
      invalidation['edits'] = edits;
      const sw = await on.page.evaluate(SW_SOURCE) as { controller: string | null; caches: { world: number }[]; worldRequests: number; worldViaWorker: number };
      invalidation['serviceWorker'] = sw;
      if (sw.controller === null) fail('invalidation: no service worker controls the on page (cannot show it leaves /world/ alone)');
      if (sw.caches.some(cache => cache.world > 0)) fail('invalidation: a service worker cache holds /world/ responses');
      // Both builds agree on the edited chunk after the republish.
      await sleep(500);
      const shots = await (async () => {
        const final = (await probe(legacy.page))?.position;
        const finalCamera = final ? cameraOn(final.tileX, final.tileY) : null;
        await Promise.all([present(legacy.page, true, finalCamera), present(on.page, true, finalCamera)]);
        await Promise.all([frames(legacy.page, 4), frames(on.page, 4)]);
        return await Promise.all([legacy.page.screenshot({ type: 'png' }), on.page.screenshot({ type: 'png' })]) as [Uint8Array, Uint8Array];
      })();
      const [ea, eb] = await Promise.all([rgba(canvasModule, shots[0]), rgba(canvasModule, shots[1])]);
      invalidation['afterEditParity'] = diffRgba(ea.data, eb.data, ea.width, ea.height, options.pixelThreshold);
      await sideBySide(canvasModule, shots[0], shots[1], options.pixelThreshold, join(options.evidenceDir, 'side-by-side', 'after-head-revision-3.png'),
        `after two map edits and head revision ${owner.shadowRevision()}`);
      // A reload is served from the IndexedDB cache (no /world/ request for chunks it already holds).
      const reloadRequests: string[] = [];
      on.page.on('request', (request: any) => { const path = new URL(request.url()).pathname; if (path.startsWith('/world/')) reloadRequests.push(path); });
      await on.page.reload({ waitUntil: 'domcontentloaded' });
      await awaitPlaying(on);
      const reloaded = await awaitReadyAt(on, (await probe(on.page))!.position!, true).catch(() => null);
      invalidation['reload'] = { servingRevision: reloaded?.runtime?.servingRevision ?? null, worldRequests: reloadRequests.length,
        store: reloaded?.store ?? null };
      evidence.invalidation = invalidation;
    }

    if (options.rollbackDrill !== null) {
      log('rollback drill: on, server off, previous build, on again');
      evidence.rollbackDrill = await rollbackDrill(options.rollbackDrill);
    }

    for (const session of sessions.splice(0)) await session.browser.close();

    if (!options.skip.has('prefetch')) {
      // 3. Spawn-pack prefetch: a fresh profile, delayed chunk responses, a movement key held from the start.
      log('spawn prefetch: fresh profile with delayed /world/ responses');
      const delayWorldMs = 700;
      const mover = await openSession(chromium, options, 'on', options.onUrl, `Mover${runTag}`, { serviceWorkers: 'block', delayWorldMs, seam: 'on' });
      sessions.push(mover);
      const spawn = await watchMovement(mover, null, delayWorldMs, join(options.evidenceDir, 'side-by-side', 'spawn-prefetch-spawn.png'));
      // The in-chunk sweep target farthest from where the mover stands: never resident yet.
      const from = (await probe(mover.page))?.position ?? null;
      const far = from === null ? null : plan.filter(step => step.inChunk)
        .reduce((best, step) => ((step.tileX - from.tileX) ** 2 + (step.tileY - from.tileY) ** 2 > (best.tileX - from.tileX) ** 2 + (best.tileY - from.tileY) ** 2 ? step : best));
      let teleport: Record<string, unknown> | null = null;
      if (far !== null) {
        await mover.page.keyboard.up('ArrowRight');
        await sleep(300);
        let landed: { tileX: number; tileY: number } | null = null;
        const refusals: string[] = [];
        for (const tile of far.alternatives ?? [far]) {
          const refusal = await owner.teleport(mover.identity, tile.tileX, tile.tileY);
          if (refusal === null) { landed = tile; break; }
          refusals.push(refusal);
        }
        teleport = landed !== null ? { chunk: `${far.cx},${far.cy}`, tile: landed, ...await watchMovement(mover, landed, delayWorldMs, join(options.evidenceDir, 'side-by-side', 'spawn-prefetch-teleport.png')) } : { refusal: refusals.slice(0, 3).join('; ') };
      }
      evidence.spawnPrefetch = { delayWorldMs, spawn, teleport };
      const waited = (result: Record<string, unknown> | null) => result !== null && (result['summary'] as { waitedMs: number }).waitedMs > 0;
      for (const [label, result] of [['spawn', spawn], ['teleport', teleport]] as const) {
        if (result === null || result['refusal'] !== undefined) { fail(`spawn prefetch ${label}: no result ${JSON.stringify(result)}`); continue; }
        const summary = result['summary'] as ReturnType<typeof movementWhileWaiting>;
        if (!waited(result)) fail(`spawn prefetch ${label}: movement never waited for terrain`);
        if (summary.movedWhileWaiting) fail(`spawn prefetch ${label}: the player moved before the spawn ring was resident`);
        if (!summary.movedAfterReady) fail(`spawn prefetch ${label}: the player never moved once ready`);
      }
    }
  } catch (error) {
    fail(`aborted: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  } finally {
    for (const session of sessions) await session.browser.close().catch(() => undefined);
    try { if (owner.chunkAuthority() !== 'off') await owner.setChunkAuthority('off'); } catch { /* disposable world */ }
    owner.close();
  }
  evidence.finishedAt = new Date().toISOString();
  evidence.result = evidence.failures.length === 0 ? 'passed' : 'failed';
  await writeFile(join(options.evidenceDir, 'summary.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  log(`${evidence.result}: ${join(options.evidenceDir, 'summary.json')}`);
  return evidence.result === 'passed' ? 0 : 1;
}

/** Holds ArrowRight (then other directions) from the first frame and samples readiness and the server position every 50 ms. */
export async function watchMovement(session: Session, start: { tileX: number; tileY: number } | null, delayWorldMs: number,
  screenshot?: string): Promise<Record<string, unknown>> {
  const samples: ReadinessSample[] = [];
  // After a teleport, start once the page itself shows the player on the new tile.
  if (start !== null) {
    await waitForAsync('mover_at_start', async () => {
      const at = (await probe(session.page).catch(() => null))?.position;
      return at !== undefined && at !== null && at.tileX === start.tileX && at.tileY === start.tileY;
    }, 15_000, 25).catch(() => undefined);
  }
  const started = Date.now();
  let held = '', readyAt: number | null = null, direction = 0, sawWaiting = false, sawReady = false;
  const directions = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  const reasons = new Map<string, number>();
  while (Date.now() - started < 60_000) {
    const value = await probe(session.page).catch(() => null);
    if (value?.identity && session.identity === '') session.identity = value.identity;
    if (value !== null && held === '' && value.position !== null) held = directions[direction]!;
    // Held keys auto-repeat in a real browser (keydown with repeat): send one every sample.
    if (held !== '') await session.page.keyboard.down(held);
    const ready = value?.readiness?.ready === true && value.runtime?.mode === 'on';
    if (ready && !value.readiness!.reason.startsWith('awaiting')) sawReady = true;
    // Right after a teleport the readiness of the old position can show for a frame: skip it.
    if (start !== null && ready && !sawWaiting && Date.now() - started < 1_500) { await sleep(50); continue; }
    if (!ready) sawWaiting = true;
    const reason = value?.readiness?.reason ?? null;
    if (reason !== null) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    samples.push({ t: Date.now() - started, ready, reason, state: value?.runtime?.state ?? null,
      tileX: value?.position?.tileX ?? null, tileY: value?.position?.tileY ?? null, keyHeld: held !== '', key: held,
      predicted: value?.predicted ? `${value.predicted.tileX},${value.predicted.tileY}` : null, ui: value?.ui ?? null });
    if (ready && readyAt === null) readyAt = Date.now();
    if (readyAt !== null) {
      const summary = movementWhileWaiting(samples, start);
      if (summary.movedAfterReady) break;
      // Blocked that way: try the next direction every 2 s.
      if (Date.now() - readyAt > 2_000 * (direction + 1) && direction < directions.length - 1) {
        await session.page.keyboard.up(held); direction++; held = directions[direction]!;
      }
      if (Date.now() - readyAt > 10_000 && sawReady) break;
    }
    await sleep(50);
  }
  if (held !== '') await session.page.keyboard.up(held);
  if (screenshot !== undefined) await session.page.screenshot({ path: screenshot, type: 'png' }).catch(() => undefined);
  const summary = movementWhileWaiting(samples, start);
  return { summary, delayWorldMs, reasons: Object.fromEntries(reasons), samples: samples.filter((sample, index) => index % 4 === 0 || sample.ready !== samples[index - 1]?.ready) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code), (error: unknown) => {
    console.error(`[s4g] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exit(2);
  });
}
