import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  activeSurvivalLandmarks, bootstrapContentRegistry, CombatRegionPolicy, createLiveIslandMapDocument, HEARTH_COMBAT_REGIONS,
  LIVE_ISLAND_MAP_ID, runtimeTraversalPolicy, serializeMapDocumentV3, TOPSIDE_SPACE_ID, type ContentRegistry,
} from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { decodeWorldChunk, WORLD_CHUNK_AUTHORITY_SCHEMA, WORLD_CHUNK_AUTHORITY_SCHEMA_V2 } from '@orchard/sim/world-chunk';
import { chunkAuthorityMode } from '../packages/world/src/chunk-authority-setting.js';
import { ChunkAuthorityDispatcher } from '../packages/world/src/content/chunk-authority-dispatch.js';
import { assembleChunkLiveIslandRuntime, compareLiveIslandRuntime, type ChunkLiveIslandRuntime,
  type LiveIslandCollisionRuntime } from '../packages/world/src/content/chunk-authority-runtime.js';
import { composeHearthArchipelago } from '../packages/tools/src/hearth-archipelago-authoring.js';
import { materializeWorldChunks } from './materialize-world-chunks.js';
import { chunkRuntimeParityFixture, combatPolicyDisagreements, combatPolicyTileCounts, type ChunkRuntimeParityFixture } from './world-chunk-runtime-parity.js';

/**
 * Static-world S3a on the island with the production combat regions (the Hearth archipelago
 * composition: nested hostile regions and sanctuaries). The compiled policy is pinned (so `off`,
 * which serves the compiled runtime's own policy object, is byte-identical to before S3a); the
 * chunk-built policy from authority schema 2 and schema 1 blobs equals it at every probe; and the
 * real index.ts `liveIslandCombatPolicy` serves compiled in off and shadow and the chunk policy in on.
 * Nightly (heavy): one oracle run, one snapshot, two materializations.
 */

/** `regionAt` at every tile centre of the compiled Hearth policy, before S3a (origin/main e35cdd54: `new CombatRegionPolicy(document.combatRegions ?? [])`). */
const PINNED_COMPILED_TILE_COUNTS: Readonly<Record<string, number>> = {
  cinderwake: 35_709, 'cinderwake-landing': 1_155, willowharbour: 25_600, none: 629_760,
};
/** SHA-256 over the per-tile region ids (row-major, `-` for none, joined by `,`). */
const PINNED_COMPILED_DIGEST = 'e1319ecd925a6762d7718fbcd23f452c71114d304d98507ebb6e958a1cfbdb27';

function policyDigest(policy: LiveIslandCollisionRuntime['combatPolicy'], width: number, height: number): string {
  const ids: string[] = [];
  for (let tileY = 0; tileY < height; tileY++) for (let tileX = 0; tileX < width; tileX++) {
    ids.push(policy.regionAt({ spaceId: TOPSIDE_SPACE_ID, tileX: tileX + .5, tileY: tileY + .5 })?.id ?? '-');
  }
  return createHash('sha256').update(ids.join(',')).digest('hex');
}

/** The real index.ts dispatcher wiring (liveIslandCollisionRuntime, chunkAuthoritySource, liveIslandCombatPolicy). */
function serverCombatFunctions(dependencies: Record<string, unknown>): {
  liveIslandCollisionRuntime(ctx: unknown): LiveIslandCollisionRuntime | null;
  liveIslandCombatPolicy(ctx: unknown): LiveIslandCollisionRuntime['combatPolicy'] | undefined;
} {
  const source = ts.createSourceFile('index.ts', readFileSync(new URL('../packages/world/src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['liveIslandCollisionRuntime', 'chunkAuthoritySource', 'liveIslandCombatPolicy'];
  const text = names.map(name => {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (fn === undefined) throw new Error(`missing ${name}`);
    return fn.getText(source);
  }).join('\n');
  const javascript = ts.transpileModule(`${text}\nreturn { ${names.join(', ')} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies));
}

describe('S3a combat policy parity on the production (Hearth) combat regions', () => {
  let registry: ContentRegistry;
  let row: LiveMapDocumentRow;
  let fixture: ChunkRuntimeParityFixture;
  let runtime: ChunkLiveIslandRuntime;
  const width = 832, height = 832;

  beforeAll(() => {
    registry = bootstrapContentRegistry();
    const document = composeHearthArchipelago(createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) })).document;
    row = { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'combat-hearth', documentJson: serializeMapDocumentV3(document) };
    fixture = chunkRuntimeParityFixture(row, registry);
    runtime = fixture.assemble();
  }, 120_000);

  it('pins the compiled policy: off serves exactly this, unchanged by S3a', () => {
    const compiled = fixture.server.runtime;
    expect(compiled.combatRegions).toBe(compiled.document.combatRegions);
    expect(compiled.combatRegions!.map(({ id }) => id)).toEqual(HEARTH_COMBAT_REGIONS.map(({ id }) => id).sort());
    // Independent of the runtime: a policy built straight from the parsed document answers the same.
    const fresh = new CombatRegionPolicy(compiled.document.combatRegions ?? []);
    expect(combatPolicyDisagreements(compiled, { combatPolicy: fresh, combatRegions: compiled.document.combatRegions }, width, height).disagreements).toEqual([]);
    expect(combatPolicyTileCounts(compiled.combatPolicy, width, height)).toEqual(PINNED_COMPILED_TILE_COUNTS);
    expect(policyDigest(compiled.combatPolicy, width, height)).toBe(PINNED_COMPILED_DIGEST);
  }, 120_000);

  it('the chunk runtime from authority schema 2 blobs serves the same combat policy (and the full runtime compares equal)', () => {
    expect(new Set(fixture.published.blobs.map(bytes => decodeWorldChunk(bytes).authoritySchema))).toEqual(new Set([WORLD_CHUNK_AUTHORITY_SCHEMA_V2]));
    expect(runtime.issues).toEqual([]);
    const { disagreements, probes } = combatPolicyDisagreements(runtime, fixture.server.runtime, width, height);
    expect(disagreements).toEqual([]);
    expect(probes).toBeGreaterThan(2 * width * height);
    expect(combatPolicyTileCounts(runtime.combatPolicy, width, height)).toEqual(PINNED_COMPILED_TILE_COUNTS);
    expect(policyDigest(runtime.combatPolicy, width, height)).toBe(PINNED_COMPILED_DIGEST);
    const diff = compareLiveIslandRuntime(runtime, fixture.server.runtime);
    expect(diff.fields).toEqual({});
  }, 120_000);

  it('authority schema 1 blobs of the same publication serve the identical policy', () => {
    const v1 = materializeWorldChunks(fixture.snapshot, row, registry, { authoritySchema: WORLD_CHUNK_AUTHORITY_SCHEMA });
    expect(new Set(v1.blobs.map(bytes => decodeWorldChunk(bytes).authoritySchema))).toEqual(new Set([WORLD_CHUNK_AUTHORITY_SCHEMA]));
    const blobs = new Map(v1.manifest.chunks.map((head, index) => [head.contentHash, v1.blobs[index]!]));
    const schema1 = assembleChunkLiveIslandRuntime(v1.manifest, hash => blobs.get(hash), registry);
    expect(schema1.issues).toEqual([]);
    expect(combatPolicyDisagreements(schema1, runtime, width, height).disagreements).toEqual([]);
    expect(combatPolicyDisagreements(schema1, fixture.server.runtime, width, height).disagreements).toEqual([]);
  }, 120_000);

  it('the real liveIslandCombatPolicy: the chunk policy (equal to compiled everywhere), none while off (S3-final)', () => {
    const manifestJson = JSON.stringify(fixture.published.manifest);
    const probe = (flagsJson: string | null) => {
      const dispatcher = new ChunkAuthorityDispatcher({ logger: { info() {}, warn() {}, time() {}, timeEnd() {} } });
      const functions = serverCombatFunctions({
        chunkAuthorityMode, TOPSIDE_SPACE_ID, LIVE_ISLAND_MAP_ID, chunkAuthorityDispatcher: dispatcher,
        contentRegistry: () => registry, runtimeTraversalPolicy,
      });
      const ctx = { db: {
        space_admin_flag: { spaceId: { find: () => flagsJson === null ? null : { flagsJson } } },
        world_chunk_shadow: { spaceId: { find: () => ({ revision: 1, mapId: LIVE_ISLAND_MAP_ID, contentHash: registry.contentHash, manifestJson }) } },
        live_map_document: { mapId: { find: () => ({ revision: row.revision, contentHash: row.contentHash }) } },
        world_chunk_blob: { contentHash: { find: (hash: string) => { const bytes = fixture.blobs.get(hash); return bytes === undefined ? null : { bytes: bytes.slice() }; } } },
      } };
      return { policy: functions.liveIslandCombatPolicy(ctx), runtime: functions.liveIslandCollisionRuntime(ctx), dispatcher };
    };
    expect(probe('{"chunkAuthority":"off"}').policy).toBeUndefined();
    const on = probe(null);
    const served = on.runtime as ChunkLiveIslandRuntime;
    expect(served.source).toBe('chunks');
    expect(on.policy).toBe(served.combatPolicy);
    expect(on.policy).not.toBe(fixture.server.runtime.combatPolicy);
    expect(combatPolicyDisagreements(served, fixture.server.runtime, width, height).disagreements).toEqual([]);
  }, 120_000);
});
