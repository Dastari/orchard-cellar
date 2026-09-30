import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyMapEdit,
  bootstrapTilesetDefinitions,
  createEmptyMapDocument,
  runtimeTilesetResolver,
  validateMapDocument,
} from '@orchard/sim';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('revisioned live map authority', () => {
  it('stores one public atomic head and a private append-only revision trail', () => {
    expect(source).toMatch(/name: 'live_map_document', public: true/u);
    expect(source).toMatch(/name: 'live_map_revision'/u);
    expect(source).toMatch(/parentRevision: t\.u32\(\)/u);
    expect(source).toMatch(/clientMutationId: t\.string\(\)/u);
  });

  it('requires owner/admin authority and compare-and-swap publication', () => {
    const reducer = source.slice(source.indexOf('export const publishLiveMapDocument'),
      source.indexOf('export const restoreLiveMapRevision'));
    expect(reducer).toContain('requireWorldOwner');
    expect(source).toContain("throw new SenderError('live_map_revision_conflict')");
    expect(source).toContain('LIVE_MAP_ALLOWED_BEHAVIORS');
  });

  it('validates document data without enforcing whole-map design conventions', () => {
    const validation = source.slice(source.indexOf('function validatedLiveMapDocument'), source.indexOf('function commitLiveMapSnapshot'));
    expect(validation).toContain('validateLiveMapShape(document)');
    expect(validation).not.toContain('validateMapDocument(');
    expect(validation).not.toContain('invalid_live_map_terrain');
  });

  it('retains optional design diagnostics without using them as publication gates', () => {
    const base = createEmptyMapDocument({ id: 'live-island', title: 'Transition Gate', width: 4, height: 4 });
    const raised = applyMapEdit(base, {
      kind: 'paint',
      points: [
        { tileX: 2, tileY: 1 }, { tileX: 3, tileY: 1 },
        { tileX: 2, tileY: 2 }, { tileX: 3, tileY: 2 },
      ],
      patch: { elevation: 1 },
    }).document;
    const issues = validateMapDocument({
      ...raised,
      transitions: [1, 2].map((tileY) => ({
        contourLevel: 1,
        kind: 'slope' as const,
        direction: 'right' as const,
        lowerTileX: 1,
        lowerTileY: tileY,
        upperTileX: 2,
        upperTileY: tileY,
      })),
    }, undefined, runtimeTilesetResolver(bootstrapTilesetDefinitions()));
    expect(issues).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'transition_direction_art_unavailable',
    }));
  });

  it('caps annotations and rejects functional anchors before committing a live snapshot', () => {
    expect(source).toContain('const LIVE_MAP_MAX_ANCHORS = 4_096');
    expect(source).toContain("const LIVE_MAP_ANNOTATION_ANCHOR_KINDS = new Set(['poi', 'label'])");
    const validation = source.slice(
      source.indexOf('function validatedLiveMapDocument'),
      source.indexOf('function commitLiveMapSnapshot'),
    );
    expect(validation).toContain('document.anchors.length > LIVE_MAP_MAX_ANCHORS');
    expect(validation).toContain("throw new SenderError('live_map_anchor_kind_not_bound')");

    const reducerStart = source.indexOf('export const publishLiveMapDocument');
    const reducer = source.slice(
      reducerStart,
      source.indexOf('export const adminMoveHomestead', reducerStart),
    );
    expect(reducer.indexOf('validatedLiveMapDocument(')).toBeLessThan(
      reducer.indexOf('commitLiveMapSnapshot('),
    );
    expect(reducer).not.toContain('space_portal.');
    expect(reducer).not.toContain('world_npc.');
    expect(reducer).not.toContain('world_resource.');
  });

  it('restores history by creating a new head instead of mutating old audit rows', () => {
    const reducer = source.slice(source.indexOf('export const restoreLiveMapRevision'),
      source.indexOf('/** Owner-only operational grant'));
    expect(reducer).toContain('commitLiveMapSnapshot');
    expect(reducer).not.toContain('live_map_revision.id.update');
    expect(reducer).not.toContain('live_map_revision.id.delete');
  });

  it('compiles the production island revision into terrain and prefab collision authority', () => {
    // Static world S3-final: compiling is the chunk materializer's (tools); the server composes chunks.
    const compiled = readFileSync(new URL('../../studio/src/world-chunks/compiled-island.ts', import.meta.url), 'utf8');
    expect(source).toContain('LIVE_ISLAND_MAP_ID,');
    expect(compiled).toContain('compiledMapTerrainPlaneCollisionBytes(compiled)');
    expect(compiled).toContain('mapObjectCollisionCells(document, object)');
    expect(source).not.toContain('compileMapDocument(');
    expect(source).toContain("liveMapCollisionForSpace(ctx, spaceId, 'ground'");
    expect(source).toContain('liveMapGeneratedResourceSuppressed');
    expect(source).toContain("throw new SenderError('live_island_base_mismatch')");
  });

  it('caches suppression indexes and decoration overlays with the compiled revision', () => {
    const runtime = readFileSync(new URL('../../studio/src/world-chunks/compiled-island.ts', import.meta.url), 'utf8');
    // S7b: the server delegates to the shared composition (live-island-composition.ts), which the
    // Studio materializer runs too.
    const composition = readFileSync(new URL('./content/live-island-composition.ts', import.meta.url), 'utf8');
    expect(source.slice(source.indexOf('function liveMapCollisionForSpace'), source.indexOf('function validatedLiveMapDocument')))
      .toContain('composeLiveIslandCollision(base, runtime, medium)');
    expect(source.slice(source.indexOf('function liveMapRuntimeGeneratedResourceSuppressed')))
      .toContain('return runtimeSuppressesGeneratedResource(runtime, resourceId);');
    const collision = composition.slice(composition.indexOf('export function composeLiveIslandCollision'), composition.indexOf('export function runtimeSuppressesGeneratedResource'));
    const resourceSuppression = composition.slice(composition.indexOf('export function runtimeSuppressesGeneratedResource'));

    expect(runtime).toContain('readonly generatedSuppressions: ReadonlySet<string>');
    expect(runtime).toContain('readonly suppressedDecorationObstacleKeys:');
    expect(runtime).toContain('const generatedSuppressions = new Set(document.generatedSuppressions)');
    expect(runtime).toMatch(
      /ground:\s*suppressedGeneratedDecorationObstacleKeys\(\s*document, generatedSuppressions, 'ground', landmarks, registry,\s*\)/u,
    );
    expect(runtime).toMatch(
      /water:\s*suppressedGeneratedDecorationObstacleKeys\(\s*document, generatedSuppressions, 'water', landmarks, registry,\s*\)/u,
    );
    expect(runtime).toContain('generateSurvivalLandmarkDecorations(activeLandmarks)');
    expect(collision).toContain('runtime.suppressedDecorationObstacleKeys[medium]');
    expect(collision).not.toContain('generateSurvivalDecorations(');
    expect(resourceSuppression).toContain('runtime?.generatedSuppressions.has(`resource-${resourceId}`)');
    expect(resourceSuppression).not.toContain('.generatedSuppressions.includes(');

    const compile = runtime.slice(
      runtime.indexOf('function compiledLiveIslandRuntime'),
      runtime.indexOf('export function generatedSurvivalResources'),
    );
    // S7b: the caller passes the row and registry; the key covers both, and a hit skips the compile.
    expect(compile).toContain('`${row.revision}:${row.contentHash}:${registry.contentHash}`');
    expect(compile.indexOf('liveIslandRuntimeCache?.key === key'))
      .toBeLessThan(compile.indexOf('parseMapDocumentV3(row.documentJson'));
  });
});
