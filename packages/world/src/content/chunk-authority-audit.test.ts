import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { LIVE_ISLAND_MAP_ID, TILE_SIZE_FIXED, type MapDocumentV3 } from '@orchard/sim';
import { decodeWorldChunk, encodeWorldChunk, WORLD_CHUNK_STRIDE, type ChunkArray, type WorldChunkManifest,
  type WorldChunkRecord } from '@orchard/sim/world-chunk';
import { authenticationRejection, isWorldOwnerRole, membershipRejection, OIDC_ISSUER } from '../auth-policy.js';
import { chunkAuthorityMode } from '../chunk-authority-setting.js';
import { assembleChunkLiveIslandRuntime } from './chunk-authority-runtime.js';
import { ChunkAuthorityDispatcher, type ChunkAuthoritySource, type CompiledCollisionRuntime } from './chunk-authority-dispatch.js';
import {
  CHUNK_AUTHORITY_AUDIT_SCHEMA, chunkAuthorityAuditClock, runChunkAuthorityAudit,
  type ChunkAuthorityAuditClock, type ChunkAuthorityAuditInput, type ChunkAuthorityAuditReport, type ChunkHeadView,
} from './chunk-authority-audit.js';

const CELLS = WORLD_CHUNK_STRIDE ** 2;
const T = TILE_SIZE_FIXED;
const WORLD = { width: 100, height: 64 };
const REGISTRY_HASH = 'content-1';
const box = (tileX: number, tileY: number, tiles = 1) => ({ left: tileX * T, top: tileY * T, right: (tileX + tiles) * T - 1, bottom: tileY * T + T - 1 });

/** A 100x64 island in two chunks (the dispatcher test's fixture, trimmed). */
function island() {
  const records = (cx: number): WorldChunkRecord[] => cx === 0
    ? [{ kind: 'authority.ground.obstacle', ordinal: 0, tileX: 62, tileY: 1, value: { group: 'authored', ordinal: 0, ...box(62, 1, 5), sourceId: 'landmark:bridge' } }]
    : [];
  const blobs = [0, 1].map(cx => encodeWorldChunk({ schema: 1, mediumSchema: 1, authoritySchema: 1, spaceId: 0, cx, cy: 0, assetRevision: 'assets-1',
    arrays: { medium: new Uint8Array(CELLS), solidBlocked: new Uint8Array(CELLS), biomes: new Uint8Array(CELLS),
      'authority.ground.blocked': new Uint8Array(CELLS), 'authority.ground.elevations': new Int16Array(CELLS),
      'authority.ground.terrainPlaneBlocked': new Uint8Array(CELLS), 'authority.ground.horseJumpableTerrain': new Uint8Array(CELLS),
      'authority.water.blocked': new Uint8Array(CELLS).fill(1), 'authority.combatRegion': new Uint8Array(CELLS) } satisfies Record<string, ChunkArray>,
    records: records(cx), assetIds: [], atlasPackIds: [] }));
  const manifest: WorldChunkManifest = { schema: 1, chunkSize: 64, spaceId: 0, ...WORLD, assetRevision: 'assets-1', sourceRevision: 3, sourceHash: 'map-3',
    metadata: {
      channels: { 'authority.ground.terrainPlaneBlocked': { type: 'u8', planes: 1 } }, biomePalette: ['meadow'],
      document: { id: LIVE_ISLAND_MAP_ID, prefabs: [], provenance: { kind: 'generated', generator: 'survival-island', generatorSeed: 1 } },
      authority: { schema: 1, combatRegions: [], generatedSuppressions: [],
        collisions: { ground: { hasTraversalChannels: true, terrainMinimumElevation: 0, terrainTransitions: [] }, water: { hasTraversalChannels: true } } },
    },
    chunks: blobs.map((bytes, cx) => ({ cx, cy: 0, contentHash: decodeWorldChunk(bytes).contentHash, byteLength: bytes.length })) };
  const store = new Map(manifest.chunks.map((head, index) => [head.contentHash, blobs[index]!]));
  return { manifest, store };
}

/** A clock that advances 1.5 ms per read, so every timing is a positive number. */
function fakeClock(): ChunkAuthorityAuditClock {
  let now = 0;
  return { label: 'performance', now: () => (now += 1.5) };
}

interface AuditHarnessOptions {
  readonly missing?: readonly string[];
  readonly shadow?: 'none' | { readonly contentHash?: string; readonly revision?: number };
  readonly headRevision?: number;
  readonly dropHead?: boolean;
  readonly compiled?: 'null' | ((runtime: CompiledCollisionRuntime) => CompiledCollisionRuntime);
  readonly clock?: ChunkAuthorityAuditClock;
}

function auditHarness(options: AuditHarnessOptions = {}) {
  const { manifest, store } = island();
  const reads = new Map<string, number>();
  let compiledBuilds = 0;
  const complete = assembleChunkLiveIslandRuntime(manifest, hash => store.get(hash), { contentHash: REGISTRY_HASH });
  const baseCompiled: CompiledCollisionRuntime = { ...complete, key: `3:map-3:${REGISTRY_HASH}`, document: {} as MapDocumentV3 };
  const shadowRow = options.shadow === 'none' ? null
    : { revision: options.shadow?.revision ?? 1, mapId: LIVE_ISLAND_MAP_ID, contentHash: options.shadow?.contentHash ?? REGISTRY_HASH, manifestJson: JSON.stringify(manifest) };
  const source: Omit<ChunkAuthoritySource, 'mode'> = {
    compiled: () => baseCompiled,
    shadow: () => shadowRow,
    liveMap: () => ({ revision: 3, contentHash: 'map-3' }),
    registryContentHash: () => REGISTRY_HASH,
    traversalPolicyActive: () => true,
    readBlob: (hash) => {
      reads.set(hash, (reads.get(hash) ?? 0) + 1);
      return options.missing?.includes(hash) ? undefined : store.get(hash);
    },
  };
  const heads: ChunkHeadView[] = manifest.chunks
    .filter((_, index) => !(options.dropHead === true && index === 1))
    .map(head => ({ cx: head.cx, cy: head.cy, contentHash: head.contentHash, revision: options.headRevision ?? 1 }));
  const input: ChunkAuthorityAuditInput = {
    mode: 'shadow',
    source,
    heads: () => heads,
    coldCompiled: () => {
      compiledBuilds += 1;
      if (options.compiled === 'null') return null;
      return options.compiled === undefined ? baseCompiled : options.compiled(baseCompiled);
    },
    clock: options.clock ?? fakeClock(),
    worldSize: WORLD,
  };
  return { input, manifest, reads, compiledBuilds: () => compiledBuilds };
}

describe('runChunkAuthorityAudit', () => {
  it('reports a complete, servable, agreeing publication with keys, completeness and timings', () => {
    const h = auditHarness();
    const report = runChunkAuthorityAudit(h.input);
    expect(report).toMatchObject({
      schema: CHUNK_AUTHORITY_AUDIT_SCHEMA,
      ok: true,
      mode: 'shadow',
      keys: {
        shadowRevision: 1, shadowMapId: LIVE_ISLAND_MAP_ID, shadowContentHash: REGISTRY_HASH,
        manifestSourceRevision: 3, manifestSourceHash: 'map-3', liveMapRevision: 3, liveMapHash: 'map-3',
        registryContentHash: REGISTRY_HASH, chunkRuntimeKey: `chunks:0:1:3:map-3:${REGISTRY_HASH}`, compiledKey: `3:map-3:${REGISTRY_HASH}`,
      },
      completeness: {
        complete: true, expectedChunks: 2, manifestChunks: 2,
        heads: { rows: 2, atShadowRevision: 2, matchingManifest: 2 },
        blobs: { present: 2, missing: 0, missingSamples: [] },
        runtimeComplete: true, issueCount: 0, issues: [],
      },
      servable: { ok: true },
      manifestError: null,
      disagreements: { compared: true, equal: true, count: 0, fields: {}, samples: [] },
      stats: { expectedChunks: 2, decodedChunks: 2 },
    });
    for (const key of ['chunkBuildMs', 'compiledBuildMs', 'compareMs', 'totalMs'] as const) {
      expect(report.timings[key], key).toBeGreaterThan(0);
    }
    expect(report.timings).toMatchObject({ clock: 'performance', diagnosticAssembleMs: null });
    // One cold compiled build, and each blob is read from the table once for the whole audit.
    expect(h.compiledBuilds()).toBe(1);
    expect([...h.reads.values()]).toEqual([1, 1]);
    // The report is plain JSON (the procedure returns JSON.stringify of it).
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('counts every disagreement but keeps at most 32 samples', () => {
    const h = auditHarness({ compiled: runtime => ({ ...runtime,
      ground: { ...runtime.ground, blocked: runtime.ground.blocked.map((value, index) => (index < 100 ? !value : value)) } }) });
    const report = runChunkAuthorityAudit(h.input);
    expect(report.ok).toBe(false);
    expect(report.servable).toEqual({ ok: true });
    expect(report.disagreements).toMatchObject({ compared: true, equal: false, count: 100, fields: { 'ground.blocked': 100 } });
    expect(report.disagreements.samples).toHaveLength(32);
    expect(report.disagreements.samples[0]).toMatchObject({ field: 'ground.blocked', index: 0, tileX: 0, tileY: 0 });
  });

  it('reports a missing blob as incomplete and still compares through a diagnostic assembly', () => {
    const h = auditHarness();
    const missing = h.manifest.chunks[1]!.contentHash;
    const report = runChunkAuthorityAudit(auditHarness({ missing: [missing] }).input);
    expect(report.ok).toBe(false);
    expect(report.servable).toMatchObject({ ok: false, reason: 'incomplete' });
    expect(report.completeness).toMatchObject({ complete: false, runtimeComplete: false, blobs: { present: 1, missing: 1, missingSamples: [missing] } });
    expect(report.completeness.issues[0]).toMatch(/^blob_missing@1,0/u);
    // The void, solid chunk 1 disagrees with compiled; the counts say where.
    expect(report.disagreements.compared).toBe(true);
    expect(report.disagreements.count).toBeGreaterThan(0);
    expect(report.timings.diagnosticAssembleMs).toBeGreaterThan(0);
  });

  it('reports stale content as not servable and compares the published chunks anyway', () => {
    const report = runChunkAuthorityAudit(auditHarness({ shadow: { contentHash: 'older-content' } }).input);
    expect(report.servable).toMatchObject({ ok: false, reason: 'stale_content' });
    expect(report.ok).toBe(false);
    // Freshness is a serving guard, not a completeness gap: the chunks themselves are whole and equal.
    expect(report.completeness.complete).toBe(true);
    expect(report.disagreements).toMatchObject({ compared: true, equal: true, count: 0 });
    expect(report.timings.diagnosticAssembleMs).not.toBeNull();
  });

  it('is incomplete when heads are missing or not at the pinned shadow revision', () => {
    for (const options of [{ headRevision: 0 }, { dropHead: true }]) {
      const report = runChunkAuthorityAudit(auditHarness(options).input);
      expect(report.completeness.complete, JSON.stringify(options)).toBe(false);
      expect(report.ok).toBe(false);
    }
    expect(runChunkAuthorityAudit(auditHarness({ headRevision: 0 }).input).completeness.heads).toEqual({ rows: 2, atShadowRevision: 0, matchingManifest: 0 });
  });

  it('reports no publication without comparing', () => {
    const report = runChunkAuthorityAudit(auditHarness({ shadow: 'none' }).input);
    expect(report).toMatchObject({
      ok: false, manifestError: 'shadow_missing', servable: { ok: false, reason: 'shadow_missing' },
      keys: { shadowRevision: null, chunkRuntimeKey: null },
      completeness: { complete: false, expectedChunks: 2, manifestChunks: 0 },
      disagreements: { compared: false, count: -1, samples: [] },
      timings: { compareMs: null },
    });
  });

  it('never treats a null compiled runtime as parity', () => {
    const report = runChunkAuthorityAudit(auditHarness({ compiled: 'null' }).input);
    expect(report.servable).toMatchObject({ ok: false, reason: 'compiled_null' });
    expect(report.disagreements.compared).toBe(false);
    expect(report.ok).toBe(false);
  });

  it('reports null timings without a usable clock', () => {
    const report = runChunkAuthorityAudit(auditHarness({ clock: { label: 'none', now: () => 0 } }).input);
    expect(report.ok).toBe(true);
    expect(report.timings).toEqual({ clock: 'none', chunkBuildMs: null, diagnosticAssembleMs: null, compiledBuildMs: null, compareMs: null, totalMs: null });
  });

  it('does not touch the caller dispatcher: the resolve is a fresh instance', () => {
    const resolve = vi.spyOn(ChunkAuthorityDispatcher.prototype, 'resolve');
    runChunkAuthorityAudit(auditHarness().input);
    expect(resolve).toHaveBeenCalledTimes(1);
    resolve.mockRestore();
  });
});

describe('chunkAuthorityAuditClock', () => {
  it('prefers performance.now, then Date.now, else none', () => {
    expect(chunkAuthorityAuditClock({ performance: { now: () => 5 }, Date: { now: () => 7 } })).toMatchObject({ label: 'performance' });
    expect(chunkAuthorityAuditClock({ performance: { now: () => 5 } }).now()).toBe(5);
    const date = chunkAuthorityAuditClock({ Date: { now: () => 7 } });
    expect([date.label, date.now()]).toEqual(['date', 7]);
    expect(chunkAuthorityAuditClock({}).label).toBe('none');
  });
});

// --- The procedure in the real module source -------------------------------------------------

const indexSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const sourceFile = ts.createSourceFile('index.ts', indexSource, ts.ScriptTarget.Latest, true);

function declarationText(name: string): string {
  for (const node of sourceFile.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(sourceFile);
    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations.find(candidate => candidate.name.getText(sourceFile) === name);
      if (declaration?.initializer !== undefined) return declaration.initializer.getText(sourceFile);
    }
  }
  throw new Error(`declaration ${name} not found`);
}
const transpile = (code: string): string => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function compile<T>(name: string, scope: Record<string, unknown>): T {
  return new Function(...Object.keys(scope), transpile(`return ${declarationText(name)};`))(...Object.values(scope)) as T;
}

class SenderError extends Error {}
const jwt = { issuer: OIDC_ISSUER, audience: ['orchard-web'] };
const requireAuthorizedSender = compile('requireAuthorizedSender', { authenticationRejection, membershipRejection, SenderError });
const requireStrictWorldOwner = compile('requireStrictWorldOwner', { requireAuthorizedSender, isWorldOwnerRole, SenderError });

/** A read-only table view: any write method access fails the test. */
function readOnlyTables(tables: Record<string, object>): Record<string, object> {
  return new Proxy(tables, {
    get(target, table: string) {
      const value = target[table];
      if (value === undefined) throw new Error(`unexpected table ${table}`);
      return new Proxy(value, {
        get(inner, key: string) {
          if (['insert', 'update', 'delete', 'clear'].includes(key)) throw new Error(`write attempted: ${table}.${key}`);
          return (inner as Record<string, unknown>)[key];
        },
      });
    },
  });
}

function procedureHarness(member: { role: string; blocked: boolean; revokedAt?: unknown } | null) {
  const h = auditHarness();
  const heads = h.input.heads();
  const tables = readOnlyTables({
    membership: { identity: { find: () => member } },
    space_admin_flag: { spaceId: { find: () => ({ spaceId: 0, flagsJson: JSON.stringify({ chunkAuthority: 'shadow' }) }) } },
    world_chunk_head: { by_space: { filter: (spaceId: bigint) => (spaceId === 0n ? heads : []) } },
  });
  const tx = { sender: 'sender', senderAuth: { jwt }, db: tables };
  const withTx = vi.fn((body: (value: typeof tx) => string) => body(tx));
  const procedure = compile<(ctx: unknown, args: Record<string, never>) => string>('auditChunkAuthority', {
    spacetimedb: { procedure: (_args: unknown, _returns: unknown, handler: unknown) => handler },
    t: { string: () => null },
    requireStrictWorldOwner,
    chunkAuthorityAuditCalls: 0,
    chunkAuthoritySource: () => ({ ...h.input.source, compiled: () => { throw new Error('the audit must build compiled cold'); } }),
    coldCompiledLiveIslandRuntime: () => h.input.coldCompiled(),
    runChunkAuthorityAudit: (input: ChunkAuthorityAuditInput) => runChunkAuthorityAudit({ ...input, worldSize: WORLD }),
    chunkAuthorityMode,
    chunkAuthorityAuditClock: () => fakeClock(),
    chunkAuthorityDispatcher: { status: () => ({ compares: 0 }) },
    TOPSIDE_SPACE_ID: 0,
  });
  return { call: () => procedure({ withTx }, {}), withTx, compiledBuilds: h.compiledBuilds };
}

describe('auditChunkAuthority procedure', () => {
  it('returns the JSON report to the world owner without writing', () => {
    const p = procedureHarness({ role: 'owner', blocked: false });
    const report = JSON.parse(p.call()) as ChunkAuthorityAuditReport;
    expect(p.withTx).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ schema: 1, ok: true, mode: 'shadow', instance: { auditCalls: 1 }, liveDispatcher: { compares: 0 },
      completeness: { complete: true }, disagreements: { count: 0 } });
    expect(p.compiledBuilds()).toBe(1);
  });

  it.each([
    ['admin', { role: 'admin', blocked: false }],
    ['player', { role: 'player', blocked: false }],
    ['no membership', null],
    ['a blocked owner', { role: 'owner', blocked: true }],
  ])('refuses %s before reading anything', (_label, member) => {
    const p = procedureHarness(member);
    expect(() => p.call()).toThrow(SenderError);
    expect(p.compiledBuilds()).toBe(0);
  });

  it('uses the strict owner gate, the live dispatcher source and no table writes', () => {
    const text = declarationText('auditChunkAuthority');
    expect(text).toContain('spacetimedb.procedure(');
    expect(text).toContain('ctx.withTx(');
    expect(text).toContain('requireStrictWorldOwner(tx.senderAuth.jwt, tx.db.membership.identity.find(tx.sender))');
    expect(text).not.toMatch(/requireWorldOwner\(/u);
    expect(text).toContain('chunkAuthoritySource(world)');
    expect(text).not.toMatch(/\.(insert|update|delete|clear)\(/u);
    // The live dispatcher reads the same source helper.
    expect(declarationText('liveIslandCollisionRuntime')).toContain('chunkAuthoritySource(ctx)');
  });
});

describe('coldCompiledLiveIslandRuntime', () => {
  function harness(initial: unknown) {
    const factory = new Function('initial', `let liveIslandRuntimeCache = initial;
      const cold = ${transpile(declarationText('coldCompiledLiveIslandRuntime'))};
      return { cold, cache: () => liveIslandRuntimeCache, set: value => { liveIslandRuntimeCache = value; } };`);
    return factory(initial) as { cold: (compiled: () => unknown) => unknown; cache: () => unknown; set: (value: unknown) => void };
  }

  it('builds with the cache cleared, then restores the cache the live call sites were using', () => {
    const previous = { key: 'live' };
    const h = harness(previous);
    const fresh = { key: 'fresh' };
    const result = h.cold(() => {
      expect(h.cache(), 'the build must not hit the cache').toBeNull();
      h.set(fresh);
      return fresh;
    });
    expect(result).toBe(fresh);
    expect(h.cache()).toBe(previous);
  });

  it('keeps the fresh build when nothing was cached, and restores the cache after a throw', () => {
    const empty = harness(null);
    const fresh = { key: 'fresh' };
    empty.cold(() => { empty.set(fresh); return fresh; });
    expect(empty.cache()).toBe(fresh);
    const previous = { key: 'live' };
    const failing = harness(previous);
    expect(() => failing.cold(() => { throw new Error('compile failed'); })).toThrow('compile failed');
    expect(failing.cache()).toBe(previous);
  });
});
