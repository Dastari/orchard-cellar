import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, generateSurvivalResources, hearthSupplyCacheInstalled,
  LIVE_ISLAND_MAP_ID, mapStreetlampPlans, resolvedMapBiomeAt, runtimeHearthSupplyCache, serializeMapDocumentV3, SURVIVAL_WORLD_SEED,
  TOPSIDE_SPACE_ID, type ContentRegistry, type MapDocumentV3,
} from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { canonicalChunkJson, decodeWorldChunk, type WorldChunkAuthorityResource } from '@orchard/sim/world-chunk';
import { compareLiveIslandRuntime, LIVE_ISLAND_OUTSIDE_MAP_BIOME, type ChunkLiveIslandRuntime } from '../packages/world/src/content/chunk-authority-runtime.js';
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

/** `generateSurvivalResources(SURVIVAL_WORLD_SEED, bootstrap registry)`: count and SHA-256 of its JSON (pinned at S3a head 560ed7b6). */
const PINNED_GENERATED_RESOURCES = { count: 5_981, sha256: '238de603a4ccf0d398b8f1b789a81edb127f763a6f6ef43445124913f74475fa' };
/** SHA-256 of the production map's `authority.resource` records in ordinal order (canonical JSON). */
const PINNED_RESOURCE_RECORDS_SHA256 = 'PINNED_RECORDS_PLACEHOLDER';

const assetFor = (name: string) => {
  const category = name.startsWith('building_') ? 'buildings' : name.startsWith('tree_') ? 'trees' : name.startsWith('crop_') ? 'crops' : name.startsWith('wildlife_') ? 'characters' : 'props';
  const source = JSON.parse(readFileSync(new URL(`../packages/assets/${category}/${name}.sprite.json`, import.meta.url), 'utf8')) as { size: [number, number]; anchor: [number, number] };
  return { id: stableAssetId(name), width: source.size[0], height: source.size[1], anchor: source.anchor };
};
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

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
        { id: String(moved.id), originTileX: moved.tileX, originTileY: moved.tileY, tileX: moved.tileX + 1, tileY: moved.tileY }] };
    const row: LiveMapDocumentRow = { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'static-view-production',
      documentJson: serializeMapDocumentV3(document) };
    fixture = chunkRuntimeParityFixture(row, registry);
    runtime = fixture.assemble();
  }, 120_000);

  it('pins the generated resource ids, and the chunk records carry them byte-identically with the compiled placements and suppression', () => {
    const generated = generateSurvivalResources(SURVIVAL_WORLD_SEED, registry);
    expect({ count: generated.length, sha256: sha256(JSON.stringify(generated)) }).toEqual(PINNED_GENERATED_RESOURCES);
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
});
