// Static-world conversion readiness (doc 61 D1, migration steps 4-6).
//
// Counts the code dependencies each remaining step must remove, so the PR
// series can be measured instead of described. Source scans are deliberately
// simple identifier counts: they track progress, they do not prove parity.
// Gates that need live evidence (published heads, parity runs, rollback
// rehearsal) are listed as manual and never reported as passing here.
//
// Usage: tsx scripts/static-world-readiness.ts [--json] [--require step4|step5|step6]

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { validChunkRuntimeBuildAudit, type ChunkRuntimeArtifact } from '../packages/client/src/chunk-shadow-build-gate.js';

export type MigrationStep = 'step4' | 'step5' | 'step6';

export interface ReadinessProbe {
  readonly id: string;
  readonly step: MigrationStep;
  readonly description: string;
  readonly roots: readonly string[];
  /** Each match of any pattern counts once. */
  readonly patterns: readonly RegExp[];
  /** Already at zero and must stay there: a regression guard rather than a count to burn down. */
  readonly guard?: true;
}

export interface ManualGate {
  readonly id: string;
  readonly step: MigrationStep;
  readonly evidence: string;
}

export interface ProbeResult {
  readonly id: string;
  readonly step: MigrationStep;
  readonly description: string;
  readonly count: number;
  readonly files: readonly string[];
}

const SERVER = ['packages/world/src'];
const CLIENT = ['packages/client/src'];
const STUDIO = ['packages/studio/src'];

/** Target for every probe is zero remaining references. */
export const READINESS_PROBES: readonly ReadinessProbe[] = [
  {
    id: 'client.whole-world-chunk-store',
    step: 'step4',
    description: 'Client use of the whole-world ChunkTerrainStore adapter (the bounded store is the client runtime)',
    roots: CLIENT,
    guard: true,
    // Word boundaries leave BoundedChunkTerrainStore and bounded-chunk-terrain-store alone.
    patterns: [/\bChunkTerrainStore\b/gu, /(?<![\w-])chunk-terrain-store\b/gu],
  },
  {
    id: 'server.whole-map-compile',
    step: 'step4',
    description: 'Server call sites that compile the whole live map (collision, combat regions, suppressed resources)',
    roots: SERVER,
    patterns: [/(?<!function )\bcompiledLiveIslandRuntime\(/gu],
  },
  {
    id: 'server.precomputed-generator-collision',
    step: 'step4',
    description: 'Server reads of the precomputed generator collision for topside',
    roots: SERVER,
    patterns: [/\bprecomputed-survival-collision\b/gu, /\bPRECOMPUTED_SURVIVAL_COLLISION\b/gu],
  },
  {
    id: 'server.generated-resources',
    step: 'step4',
    description: 'Server calls that generate topside resources instead of reading chunk records',
    roots: SERVER,
    patterns: [/\bgenerateSurvivalResources\(/gu],
  },
  {
    id: 'client.generator-terrain',
    step: 'step5',
    description: 'Client references to generator or whole-map terrain builders',
    roots: CLIENT,
    patterns: [
      /\bterrainForSnapshot\(/gu,
      /\bliveIslandTerrain\(/gu,
      /\bliveIslandDocument\(/gu,
      /\bterrainForSpace\(/gu,
      /\bgenerateSurvival[A-Za-z]*\(/gu,
    ],
  },
  {
    id: 'client.live-map-document',
    step: 'step5',
    description: 'Client subscriptions to or reads of the whole live map document',
    roots: CLIENT,
    patterns: [/\blive_map_document\b/gu, /\bliveMapDocument\b/gu],
  },
  {
    id: 'studio.document-json',
    step: 'step6',
    description: 'Studio reads or writes of the whole-document map (documentJson / publishLiveMapDocument)',
    roots: STUDIO,
    patterns: [/\bdocumentJson\b/gu, /\bpublishLiveMapDocument\b/gu],
  },
  {
    id: 'studio.live-map-document-table',
    step: 'step6',
    description: 'Studio direct reads of or subscriptions to the live_map_document table',
    roots: STUDIO,
    patterns: [/\bliveMapDocument\b/gu, /\blive_map_document\b/gu],
  },
  {
    id: 'server.document-json',
    step: 'step6',
    description: 'Server references to the whole-document map row',
    roots: SERVER,
    patterns: [/\bdocumentJson\b/gu],
  },
];

export const MANUAL_GATES: readonly ManualGate[] = [
  { id: 'publish.pinned-heads', step: 'step4', evidence: 'Map/content/asset-pinned blobs served before heads are CAS-published under the guarded release; head revision recorded.' },
  { id: 'parity.every-cell', step: 'step4', evidence: 'Client/server parity over every cell of every published chunk, including dynamic overlays (player objects, depletion, chests).' },
  { id: 'parity.water-15', step: 'step4', evidence: 'The 15 waterfall cells x414-416 y357-361 resolved by medium under D6 (no coordinate patch), with the boat-ability parity test green.' },
  { id: 'chunks.server-channels', step: 'step4', evidence: 'Published blobs carry the authoritative collision, obstacles, horse-jump and combat-region channels the server reads (not audit-only oracle channels).' },
  { id: 'runtime.bounded-memory', step: 'step5', evidence: 'View churn over all chunk centres stays within the bounded store; offline/IndexedDB cache invalidates on head revision change.' },
  { id: 'runtime.chunk-native-render', step: 'step5', evidence: 'Renderer and client collision sample chunks without whole-world arrays (ChunkTerrainStore adapter unused in gameplay).' },
  { id: 'runtime.spawn-readiness', step: 'step5', evidence: 'Spawn-pack prefetch completes before movement is enabled; missing chunks stay void and solid.' },
  { id: 'release.coordinated-switch', step: 'step5', evidence: 'Client and server switch together in one guarded release with a rehearsed rollback to the legacy path.' },
  { id: 'retire.generator-free-build', step: 'step5', evidence: 'ORCHARD_REQUIRE_GENERATOR_FREE=1 npm run client:chunks:check passes and is made mandatory in CI.' },
  { id: 'studio.chunk-authoring', step: 'step6', evidence: 'Studio reads chunks and publishes chunk edits; the documentJson row is retired by a separate reviewed, additive migration.' },
  { id: 'spaces.f4', step: 'step6', evidence: 'Spaces other than topside stream only after the F4 map-to-space authority contract lands.' },
];

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist') out.push(...sourceFiles(path));
    } else if (/\.tsx?$/u.test(entry) && !/\.test\.tsx?$/u.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

export function runProbe(probe: ReadinessProbe, repoRoot: string): ProbeResult {
  let count = 0;
  const files: string[] = [];
  for (const root of probe.roots) {
    for (const file of sourceFiles(resolve(repoRoot, root))) {
      const text = readFileSync(file, 'utf8');
      const hits = probe.patterns.reduce((sum, pattern) => sum + (text.match(pattern)?.length ?? 0), 0);
      if (hits > 0) {
        count += hits;
        files.push(relative(repoRoot, file));
      }
    }
  }
  return { id: probe.id, step: probe.step, description: probe.description, count, files: files.sort() };
}

/**
 * Legacy modules recorded by the last client build, or null when the audit is
 * missing or is not exactly the envelope `chunkRuntimeBuildAudit`
 * (packages/client/src/chunk-shadow-build-gate.ts) emits: schema 1, mode
 * off|shadow|on and string legacyModules. The dist is a production artifact, so an
 * `on` audit is valid only with activationAllowed true and the reviewed
 * CHUNK_RUNTIME_ACTIVATION_RELEASE (null until S5c).
 */
export function clientBuildLegacyModules(repoRoot: string): readonly string[] | null {
  const path = resolve(repoRoot, 'packages/client/dist/chunk-runtime-audit.json');
  if (!existsSync(path)) return null;
  let audit: unknown;
  try {
    audit = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  return validClientBuildAudit(audit) ? audit.legacyModules : null;
}

/** The production artifact envelope: an unapproved `on` build is rejected (see the gate). */
export function validClientBuildAudit(audit: unknown, artifact: ChunkRuntimeArtifact = 'production'): audit is { readonly legacyModules: readonly string[] } {
  return validChunkRuntimeBuildAudit(audit, artifact);
}

const STEP_ORDER: readonly MigrationStep[] = ['step4', 'step5', 'step6'];

/** Probes that must be at zero for a step (a step includes every earlier step). */
export function blockingProbes(results: readonly ProbeResult[], step: MigrationStep): readonly ProbeResult[] {
  const through = STEP_ORDER.slice(0, STEP_ORDER.indexOf(step) + 1);
  return results.filter((result) => through.includes(result.step) && result.count > 0);
}

export interface ReadinessArgs {
  readonly json: boolean;
  readonly required: MigrationStep | null;
}

/** Strict: a bare, repeated or unknown --require value is an error, never "no requirement". */
export function parseReadinessArgs(argv: readonly string[]): ReadinessArgs | { readonly error: string } {
  let json = false;
  let required: MigrationStep | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--json') {
      json = true;
    } else if (arg === '--require') {
      const value = argv[index + 1];
      if (value === undefined || !(STEP_ORDER as readonly string[]).includes(value)) {
        return { error: `--require expects one of ${STEP_ORDER.join(', ')}` };
      }
      if (required !== null) return { error: '--require may be given only once' };
      required = value as MigrationStep;
      index += 1;
    } else {
      return { error: `unknown argument ${arg}` };
    }
  }
  return { json, required };
}

/**
 * Why a step is not ready. Steps 5 and 6 need a valid client build audit: a
 * missing or unreadable audit blocks rather than passing silently.
 */
export function requirementFailures(
  results: readonly ProbeResult[], legacyModules: readonly string[] | null, step: MigrationStep,
): readonly string[] {
  const failures: string[] = [];
  if (step !== 'step4') {
    if (legacyModules === null) failures.push('no valid client build audit (run npm run build -w @orchard/client)');
    else if (legacyModules.length > 0) failures.push(`client build still bundles ${legacyModules.length} legacy module(s)`);
  }
  const blocking = blockingProbes(results, step);
  if (blocking.length > 0) failures.push(`probes ${blocking.map((r) => `${r.id} (${r.count})`).join(', ')}`);
  return failures;
}

export function main(argv: readonly string[], repoRoot = resolve('.')): number {
  const args = parseReadinessArgs(argv);
  if ('error' in args) {
    console.error(args.error);
    return 2;
  }
  const results = READINESS_PROBES.map((probe) => runProbe(probe, repoRoot));
  const legacyModules = clientBuildLegacyModules(repoRoot);

  if (args.json) {
    console.log(JSON.stringify({ schema: 1, probes: results, clientBuildLegacyModules: legacyModules, manualGates: MANUAL_GATES }, null, 2));
  } else {
    console.log('Static-world readiness (target: every count 0)\n');
    for (const step of STEP_ORDER) {
      console.log(`${step}`);
      for (const result of results.filter((r) => r.step === step)) {
        const guard = READINESS_PROBES.find((probe) => probe.id === result.id)?.guard === true ? ' (guard: must stay 0)' : '';
        console.log(`  ${String(result.count).padStart(4)}  ${result.id}${guard} — ${result.description}`);
      }
      for (const gate of MANUAL_GATES.filter((g) => g.step === step)) {
        console.log(`  manual  ${gate.id} — ${gate.evidence}`);
      }
    }
    console.log(`\nclient build legacy modules: ${legacyModules === null ? 'no valid build audit (run npm run build -w @orchard/client)' : legacyModules.length}`);
  }

  if (args.required === null) return 0;
  const failures = requirementFailures(results, legacyModules, args.required);
  if (failures.length > 0) {
    console.error(`${args.required} blocked by: ${failures.join('; ')}`);
    return 1;
  }
  console.log(`${args.required}: automated probes clear; manual gates still need recorded evidence.`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve('scripts/static-world-readiness.ts')) {
  process.exitCode = main(process.argv.slice(2));
}
