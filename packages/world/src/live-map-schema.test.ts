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

  it('rejects terrain which cannot be reproduced by the bootstrap engine registry', () => {
    expect(source).toContain(
      'const LIVE_MAP_TILESET_RESOLVER = runtimeTilesetResolver(bootstrapTilesetDefinitions())',
    );
    const validation = source.slice(
      source.indexOf('function validatedLiveMapDocument'),
      source.indexOf('function commitLiveMapSnapshot'),
    );
    expect(validation).toContain('validateMapDocument(');
    expect(validation).toContain('LIVE_MAP_TILESET_RESOLVER');
    expect(validation).toContain("terrainIssues.some(({ severity }) => severity === 'error')");
    expect(validation).toContain("throw new SenderError('invalid_live_map_terrain')");
    expect(validation.indexOf('validateMapDocument(')).toBeLessThan(validation.indexOf('return document'));
  });

  it('inherits fail-closed transition capability findings before live publication', () => {
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
    expect(source).toContain('LIVE_ISLAND_MAP_ID,');
    expect(source).toContain('compiledMapTerrainPlaneCollisionBytes(compiled)');
    expect(source).toContain('mapObjectCollisionCells(document, object)');
    expect(source).toContain("liveMapCollisionForSpace(ctx, spaceId, 'ground'");
    expect(source).toContain('liveMapGeneratedResourceSuppressed');
    expect(source).toContain("throw new SenderError('live_island_base_mismatch')");
  });

  it('caches suppression indexes and decoration overlays with the compiled revision', () => {
    const runtime = source.slice(
      source.indexOf('interface LiveIslandRuntime'),
      source.indexOf('function validatedLiveMapDocument'),
    );
    const collision = runtime.slice(runtime.indexOf('function liveMapCollisionForSpace'));
    const resourceSuppression = runtime.slice(
      runtime.indexOf('function liveMapRuntimeGeneratedResourceSuppressed'),
    );

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
      runtime.indexOf('function liveMapCollisionForSpace'),
    );
    expect(compile).toContain('ctx.db.content_head.packId.find(LIVE_CONTENT_PACK_ID)');
    expect(compile.indexOf('liveIslandRuntimeCache?.key === storedKey'))
      .toBeLessThan(compile.indexOf('const registry = contentRegistry(ctx)'));
  });
});
