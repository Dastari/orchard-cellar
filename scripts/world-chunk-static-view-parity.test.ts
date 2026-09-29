import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as sim from '@orchard/sim';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, generateSurvivalResources, hearthSupplyCacheInstalled,
  LIVE_ISLAND_MAP_ID, mapStreetlampPlans, resolvedMapBiomeAt, runtimeHearthSupplyCache, serializeMapDocumentV3, SURVIVAL_WORLD_SEED,
  TOPSIDE_SPACE_ID, type ContentRegistry, type MapDocumentV3,
} from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { canonicalChunkJson, decodeWorldChunk, type WorldChunkAuthorityResource, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import { CHUNK_RESOURCE_GENERATOR, chunkResourceGeneratorMismatch, compareLiveIslandRuntime, LIVE_ISLAND_OUTSIDE_MAP_BIOME,
  type ChunkLiveIslandRuntime } from '../packages/world/src/content/chunk-authority-runtime.js';
import { materializeWorldChunksFromRows } from './materialize-world-chunks.js';
import { stableAssetId } from '../packages/tools/src/assets/asset-id.js';
import { composeHearthContentMap } from '../packages/tools/src/hearth-map-composition.js';
import { chunkRuntimeParityFixture, type ChunkRuntimeParityFixture } from './world-chunk-runtime-parity.js';

/**
 * Static-world S3b on the production-shaped island (the full Hearth content composition: archipelago,
 * town, 35 streetlamps, the supply cache, the production combat regions) plus two suppressed generated
 * resources and one moved placement. The chunk runtime's static view answers every S3b consumer exactly
 * as the compiled document did before S3b (supply cache, streetlamp plans, growth biome at every tile
 * and outside the map, generated-resource suppression), and the generated resource ids are pinned:
 * live depletion rows reference them, so they must stay byte-identical. Nightly (heavy).
 */

/**
 * `generateSurvivalResources(SURVIVAL_WORLD_SEED, bootstrap registry)`: count and SHA-256 of its JSON (pinned at S3a head 560ed7b6).
 * Live `world_resource` depletion rows reference these ids, so the ids and their order must NEVER change;
 * a mismatch here is a production data hazard, not a stale pin. Re-pin only for a reviewed, intentional
 * generator or bootstrap-content change that ships with a resource migration: take the new values from the
 * failure message, say why in the commit, and get owner sign-off.
 */
const PINNED_GENERATED_RESOURCES = { count: 5_981, sha256: '238de603a4ccf0d398b8f1b789a81edb127f763a6f6ef43445124913f74475fa' };
/** SHA-256 of the production map's `authority.resource` records in ordinal order (canonical JSON). */
const PINNED_RESOURCE_RECORDS_SHA256 = '11d67440992496db61ca8ac6b15ebffdb481586c1de1c065a3b4c8754a779691';

const assetFor = (name: string) => {
  const category = name.startsWith('building_') ? 'buildings' : name.startsWith('tree_') ? 'trees' : name.startsWith('crop_') ? 'crops' : name.startsWith('wildlife_') ? 'characters' : 'props';
  const source = JSON.parse(readFileSync(new URL(`../packages/assets/${category}/${name}.sprite.json`, import.meta.url), 'utf8')) as { size: [number, number]; anchor: [number, number] };
  return { id: stableAssetId(name), width: source.size[0], height: source.size[1], anchor: source.anchor };
};
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const ORPHAN_ID = 999_999_999_999n;

/** The real index.ts reconcile (S3c), with its sim dependencies, over an injected runtime and a recording table. */
function realReconcile(registry: ContentRegistry, runtime: unknown): (rows: readonly ResourceRow[]) => string[] {
  const source = ts.createSourceFile('index.ts', readFileSync(new URL('../packages/world/src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['reconcileGeneratedSurvivalResources', 'placedLiveIslandResources', 'liveIslandGeneratedResources'];
  const text = names.map(name => {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (fn === undefined) throw new Error(`missing ${name}`);
    return fn.getText(source);
  }).join('\n');
  const javascript = ts.transpileModule(`${text}\nreturn reconcileGeneratedSurvivalResources;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  // Row construction is out of scope (pinned by the oracle's mirror guard): record exactly what reconcile passes it.
  const dependencies = { ...sim, SenderError: Error, contentRegistry: () => registry, liveIslandCollisionRuntime: () => runtime,
    generatedWorldResourceRow: (resource: sim.GeneratedSurvivalResource) => ({ ...resource, id: BigInt(resource.id), maximumRichness: 1,
      chunkX: Math.floor(resource.tileX / 16), chunkY: Math.floor(resource.tileY / 16) }) };
  const reconcile = new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies)) as (ctx: unknown) => void;
  return rows => {
    const table = new Map(rows.map(row => [row.id, row])), writes: string[] = [];
    const json = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? `${item}n` : item);
    reconcile({ db: {
      world_resource: { iter: () => table.values(), insert: (row: ResourceRow) => { writes.push(`insert ${json(row)}`); table.set(row.id, row); },
        id: { update: (row: ResourceRow) => { writes.push(`update ${json(row)}`); table.set(row.id, row); },
          delete: (id: bigint) => { writes.push(`delete ${id}`); table.delete(id); } } },
      world_resource_mining_claim: { resourceId: { delete: (id: bigint) => writes.push(`claim ${id}`) } },
    } });
    return writes;
  };
}
interface ResourceRow { readonly id: bigint; readonly kind: string; readonly tileX: number; readonly tileY: number;
  readonly chunkX: number; readonly chunkY: number; readonly spaceId: number; readonly maximumRichness: number; readonly depleted?: boolean }

describe('S3b static document consumers on the production-shaped island', () => {
  let registry: ContentRegistry;
  let document: MapDocumentV3;
  let fixture: ChunkRuntimeParityFixture;
  let runtime: ChunkLiveIslandRuntime;
  let suppressedIds: readonly number[];
  const width = 832, height = 832;

  beforeAll(() => {
    registry = bootstrapContentRegistry();
    const landmarks = activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID);
    const composed = composeHearthContentMap(createLiveIslandMapDocument({ landmarks }), assetFor, 'source-fixture');
    if (composed.document === null) throw new Error(composed.conflicts.join(','));
    const generated = generateSurvivalResources(SURVIVAL_WORLD_SEED, registry);
    suppressedIds = [generated[0]!.id, generated[1_000]!.id];
    const moved = generated[2_000]!;
    document = { ...composed.document,
      generatedSuppressions: [...composed.document.generatedSuppressions, ...suppressedIds.map(id => `resource-${id}`)],
      resourcePlacements: [...composed.document.resourcePlacements ?? [],
        { id: String(moved.id), originTileX: moved.tileX, originTileY: moved.tileY, tileX: moved.tileX + 1, tileY: moved.tileY },
        // An orphan placement (not a generated id): reconcile keeps an existing row with it (S3c).
        { id: String(ORPHAN_ID), originTileX: 100, originTileY: 100, tileX: 101, tileY: 100 }] };
    const row: LiveMapDocumentRow = { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'static-view-production',
      documentJson: serializeMapDocumentV3(document) };
    fixture = chunkRuntimeParityFixture(row, registry);
    runtime = fixture.assemble();
  }, 120_000);

  it('pins the generated resource ids, and the chunk records carry them byte-identically with the compiled placements and suppression', () => {
    const generated = generateSurvivalResources(SURVIVAL_WORLD_SEED, registry);
    expect({ count: generated.length, sha256: sha256(JSON.stringify(generated)) },
      'generated resource ids/order changed: live depletion rows reference them (see PINNED_GENERATED_RESOURCES before re-pinning)')
      .toEqual(PINNED_GENERATED_RESOURCES);
    const records = fixture.published.blobs.flatMap(bytes => decodeWorldChunk(bytes).records)
      .filter(record => record.kind === 'authority.resource').sort((a, b) => a.ordinal - b.ordinal)
      .map(record => record.value as unknown as WorldChunkAuthorityResource);
    expect(records.map(({ id }) => id)).toEqual(generated.map(({ id }) => id));
    // The oracle runs the real server code: generator order, document placements, runtime suppression.
    expect(canonicalChunkJson(records)).toBe(canonicalChunkJson(fixture.server.resources));
    expect(records.filter(({ suppressed }) => suppressed).map(({ id }) => id)).toEqual(suppressedIds);
    expect(sha256(canonicalChunkJson(records))).toBe(PINNED_RESOURCE_RECORDS_SHA256);
  }, 120_000);

  it('the full runtime (static view included) compares equal, and the compiled runtime carries its view', () => {
    expect(runtime.issues).toEqual([]);
    expect(compareLiveIslandRuntime(runtime, fixture.server.runtime).fields).toEqual({});
    expect(fixture.server.runtime.staticView.objects).toBe(fixture.server.runtime.document.objects);
  }, 120_000);

  it('generated-resource suppression answers as the compiled document did, for every generated id', () => {
    const compiled = fixture.server.runtime;
    const before = new Set(compiled.document.generatedSuppressions);
    let suppressed = 0;
    for (const { id } of generateSurvivalResources(SURVIVAL_WORLD_SEED, registry)) {
      const key = `resource-${id}`;
      const expected = before.has(key);
      if (expected) suppressed += 1;
      if (runtime.generatedSuppressions.has(key) !== expected || compiled.generatedSuppressions.has(key) !== expected) throw new Error(`suppression ${id}`);
    }
    expect(suppressed).toBe(suppressedIds.length);
  }, 120_000);

  it('the supply cache and streetlamp plans read from the chunk view equal the compiled document', () => {
    const cache = runtimeHearthSupplyCache(registry)!;
    expect(hearthSupplyCacheInstalled(cache, fixture.server.runtime.document)).toBe(true);
    expect(hearthSupplyCacheInstalled(cache, runtime.staticView)).toBe(true);
    expect(hearthSupplyCacheInstalled(cache, fixture.server.runtime.staticView)).toBe(true);
    const plans = mapStreetlampPlans(fixture.server.runtime.document);
    expect(plans).toHaveLength(35);
    expect(mapStreetlampPlans(runtime.staticView)).toEqual(plans);
    expect(mapStreetlampPlans(fixture.server.runtime.staticView)).toEqual(plans);
  }, 120_000);

  it('the growth biome equals resolvedMapBiomeAt(document) at every tile and on a two-tile ring outside the map', () => {
    const compiled = fixture.server.runtime;
    const growthBiome = (view: typeof runtime.staticView, tileX: number, tileY: number) => view.biomeAt(tileX, tileY) ?? LIVE_ISLAND_OUTSIDE_MAP_BIOME;
    let mismatches = 0;
    for (let tileY = -2; tileY < height + 2; tileY++) for (let tileX = -2; tileX < width + 2; tileX++) {
      const expected = resolvedMapBiomeAt(compiled.document, tileX, tileY);
      if (growthBiome(runtime.staticView, tileX, tileY) !== expected || growthBiome(compiled.staticView, tileX, tileY) !== expected) mismatches += 1;
    }
    expect(mismatches).toBe(0);
  }, 120_000);
  it('S3c: the chunk runtime yields exactly the generator\'s resources (same objects field for field, same order, pinned)', () => {
    const compiled = fixture.server.runtime.generatedResources();
    const chunks = runtime.generatedResources();
    expect(chunks).toStrictEqual(compiled);
    // Key order too: the generator's JSON, byte for byte.
    expect(JSON.stringify(chunks)).toBe(JSON.stringify(compiled));
    expect({ count: chunks.length, sha256: sha256(JSON.stringify(chunks)) },
      'chunk-built generated resources changed (see PINNED_GENERATED_RESOURCES)').toEqual(PINNED_GENERATED_RESOURCES);
  }, 120_000);

  it('S3c: the publish path (materializeWorldChunksFromRows: S5b, and the CLI the soak runs) stamps the resource generator', () => {
    const stamped = (manifest: Pick<WorldChunkManifest, 'metadata'>) => (manifest.metadata['authority'] as Record<string, unknown>)['resourceGenerator'];
    expect(stamped(fixture.published.manifest)).toEqual(CHUNK_RESOURCE_GENERATOR);
    const live = materializeWorldChunksFromRows({ row: { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'static-view-production',
      documentJson: serializeMapDocumentV3(document) }, contentRows: null });
    const manifest = JSON.parse(live.manifestJson) as WorldChunkManifest;
    expect(stamped(manifest)).toEqual(CHUNK_RESOURCE_GENERATOR);
    expect(chunkResourceGeneratorMismatch(manifest)).toBeUndefined();
    // The same publication stamped by an older generator would be refused as stale.
    expect(chunkResourceGeneratorMismatch(manifest, { ...CHUNK_RESOURCE_GENERATOR, version: CHUNK_RESOURCE_GENERATOR.version + 1 })).toMatch(/^published /u);
  }, 120_000);

  it('S3c: the real reconcile writes exactly the same rows from the compiled and the chunk runtime', () => {
    const generated = runtime.generatedResources();
    const row = (resource: sim.GeneratedSurvivalResource, patch: Partial<ResourceRow> = {}): ResourceRow => ({ id: BigInt(resource.id), kind: resource.kind,
      tileX: resource.tileX, tileY: resource.tileY, chunkX: Math.floor(resource.tileX / 16), chunkY: Math.floor(resource.tileY / 16), spaceId: TOPSIDE_SPACE_ID,
      maximumRichness: 1, ...patch });
    const ore = generated.findIndex(resource => resource.kind.startsWith('ore_'));
    // Every reconcile branch: unchanged rows, a row the placement moves, a changed kind, a legacy ore with no
    // richness, a missing row (insert), a stale id (delete + claim) and an orphan placement's row (kept).
    const rows = [...generated.slice(0, 2_500).map(resource => row(resource)), row(generated[3_000]!, { kind: 'tree_legacy' }),
      row(generated[ore]!, { maximumRichness: 0, depleted: true }),
      { ...row(generated[0]!), id: 999_999_999_998n }, { ...row(generated[0]!), id: ORPHAN_ID, tileX: 101, tileY: 100 }];
    const compiledWrites = realReconcile(registry, fixture.server.runtime)(rows);
    const chunkWrites = realReconcile(registry, runtime)(rows);
    expect(chunkWrites).toEqual(compiledWrites);
    const kinds = new Set(compiledWrites.map(write => write.split(' ')[0]));
    expect(kinds).toEqual(new Set(['insert', 'update', 'delete', 'claim']));
    expect(compiledWrites).toContain('delete 999999999998');
    expect(compiledWrites.some(write => write.includes(`${ORPHAN_ID}`))).toBe(false);
    // The moved placement lands at its authored tile.
    const moved = generated[2_000]!;
    expect(compiledWrites.some(write => write.startsWith('update') && write.includes(`"id":"${moved.id}n"`) && write.includes(`"tileX":${moved.tileX + 1}`))).toBe(true);
  }, 120_000);
});
