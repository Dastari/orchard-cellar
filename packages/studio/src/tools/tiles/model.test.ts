import { describe, expect, it, vi } from 'vitest';
import {
  TILESET_REQUIRED_ROLES,
  bootstrapContentDefinitions,
  type TilesetContentDefinition,
} from '@orchard/sim';
import { createTileEditorModel } from './model.js';
import { TILES_TOOL_REGISTRATION } from './contracts.js';

function firstTileset(): TilesetContentDefinition {
  const found = bootstrapContentDefinitions().find((entry): entry is TilesetContentDefinition => entry.kind === 'tileset');
  if (found === undefined) throw new Error('missing_tileset_fixture');
  return structuredClone(found);
}

describe('Tile Editor', () => {
  it('registers the complete Build workspace', () => {
    expect(TILES_TOOL_REGISTRATION).toMatchObject({
      id: 'tiles', mode: 'build', routes: ['/build/tiles'],
      docks: expect.arrayContaining(['asset_library', 'preview', 'validation', 'history']),
    });
  });

  it('auditions every frame bank and resolves the terrain-lab topology matrix', () => {
    const state = createTileEditorModel({ access: 'anonymous' }).snapshot();
    expect(state.auditions.length).toBeGreaterThan(20);
    expect(state.fixtures.map(({ id }) => id)).toEqual([
      'minimum_raised', 'donut_outer', 'donut_hole', 'peninsula_tip',
      'corner_nw', 'corner_ne', 'corner_sw', 'corner_se',
      'pit_in_plateau', 'peak_in_pit', 'four_to_one',
    ]);
    expect(state.fixtures.find(({ id }) => id === 'minimum_raised')?.layers)
      .toEqual(expect.arrayContaining([expect.objectContaining({ semanticRole: 'contour.edge.bottom_right', assetId: expect.any(String) })]));
  });

  it('clones a stable family, edits projection and role assets, and validates coverage continuously', () => {
    const model = createTileEditorModel({ access: 'anonymous' });
    expect(model.cloneAs('studio_moss').definition).toMatchObject({
      id: 'tileset:studio_moss', familyId: 'studio_moss', engineVersion: 1,
    });
    const projection = model.setProjection('interior', -4, 2);
    expect(projection.definition).toMatchObject({ projectionStyle: 'interior', baseDatum: -4, faceClearanceRows: 2 });
    const role = TILESET_REQUIRED_ROLES.edge[0]!;
    const assigned = model.setRoleFrame('edge', role, 'tile_studio_moss', 77);
    expect(assigned.definition.roleFrames).toContainEqual({ group: 'edge', role, assetId: 'tile_studio_moss', frame: 77 });
    expect(assigned.definition.assetIds).toContain('tile_studio_moss');
    expect(assigned.validation.valid).toBe(true);
  });

  it('requires explicit reasons for unavailable banks and validates transition variants', () => {
    const model = createTileEditorModel({ access: 'anonymous' });
    expect(() => model.markRoleGroupUnavailable('inset', '   ')).toThrow('tileset_unavailable_reason_required');
    const unavailable = model.markRoleGroupUnavailable('inset', 'Source art has no inverse bank.');
    expect(unavailable.validation.valid).toBe(true);
    const invalid = model.setTransition('ladder', { available: true, assetId: 'tile_ladder', variants: [] });
    expect(invalid.validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_tileset_transition' }),
    ]));
  });

  it('constructs no adapter offline/read-only and publishes one exact CAS upsert only on request', async () => {
    const createAdapter = vi.fn(() => ({ publishContentChangeSet: vi.fn(async () => undefined) }));
    const anonymous = createTileEditorModel({ access: 'anonymous', createPublishAdapter: createAdapter });
    const readOnly = createTileEditorModel({ access: 'read_only', createPublishAdapter: createAdapter });
    expect(createAdapter).not.toHaveBeenCalled();
    expect(() => readOnly.cloneAs('not_allowed')).toThrow('tile_editor_read_only');
    anonymous.cloneAs('offline_family');
    await expect(anonymous.publish('tiles.offline.1', 'offline')).rejects.toThrow('tile_editor_publish_unavailable');

    const publishContentChangeSet = vi.fn(async () => undefined);
    const live = createTileEditorModel({
      definition: firstTileset(), access: 'write', baseRevision: 42n,
      createPublishAdapter: () => ({ publishContentChangeSet }),
    });
    live.cloneAs('live_family');
    const request = live.buildPublishRequest('tiles.live.42', '  reviewed terrain family  ');
    expect(request).toMatchObject({ packId: 'live', expectedRevision: 42n, deletes: '[]', note: 'reviewed terrain family' });
    expect(JSON.parse(request.upserts)).toEqual([
      expect.objectContaining({ id: 'tileset:live_family', kind: 'tileset', json: expect.any(String) }),
    ]);
    await live.publish('tiles.live.42', 'reviewed terrain family');
    expect(publishContentChangeSet).toHaveBeenCalledWith(request);
  });
});
