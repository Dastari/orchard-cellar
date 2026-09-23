import { studioInspectorGroups } from '../../shell/studio-models.js';
import { describe, expect, it } from 'vitest';
import { buildLiveOutliner, buildWorldOutliner } from '../../shell/outliners.js';
import { mapCanvasInspectorRows, mapCanvasOutlinerRows } from './canvas-dock-projections.js';

describe('Map Canvas dock projections', () => {
  it('windows a stable hierarchy only through explicitly expanded branches', () => {
    const tree = buildWorldOutliner({ spaces: [{ id: 0, label: 'Map', layers: [{
      id: 'objects', label: 'Objects', objectIds: [], entities: [
        { id: 'tree-1', label: 'Apple Tree', entityKind: 'map-object' },
      ],
    }] }] });
    expect(mapCanvasOutlinerRows(tree, new Set())).toEqual([
      expect.objectContaining({ id: 'space:0', depth: 0, expandable: true, expanded: false }),
    ]);
    expect(mapCanvasOutlinerRows(tree, new Set(['space:0', 'space:0:layer:objects'])))
      .toEqual([
        expect.objectContaining({ id: 'space:0', depth: 0, expanded: true }),
        expect.objectContaining({ id: 'space:0:layer:objects', depth: 1, layerId: 'objects' }),
        expect.objectContaining({
          id: 'map-object:tree-1', depth: 2, layerId: 'objects',
          selection: { kind: 'entity', entityKind: 'map-object', id: 'tree-1', spaceId: 0 },
        }),
      ]);
  });

  it('projects subscribed live entities without changing their typed selection', () => {
    const tree = buildLiveOutliner({
      placeables: [{ id: 7n, spaceId: 0, kind: 'fruit_press' }],
      npcs: [], homesteads: [], players: [],
    });
    expect(mapCanvasOutlinerRows(tree, new Set(['live-space:0']))).toEqual([
      expect.objectContaining({ id: 'live-space:0', kind: 'space' }),
      expect.objectContaining({
        id: 'placeable:7', kind: 'entity',
        selection: { kind: 'entity', entityKind: 'placeable', id: '7', spaceId: 0 },
      }),
    ]);
  });

  it('uses the NPC display name while retaining its exact authority identifier', () => {
    const tree = buildLiveOutliner({
      placeables: [],
      npcs: [{ id: 9007n, spaceId: 0, kind: 'npc:fisherman_fin', displayName: 'Fisherman Fin' }],
      homesteads: [], players: [],
    });
    expect(mapCanvasOutlinerRows(tree, new Set(['live-space:0']))).toEqual([
      expect.objectContaining({ id: 'live-space:0', kind: 'space' }),
      expect.objectContaining({
        id: 'npc:9007', label: 'Fisherman Fin', kind: 'entity',
        selection: { kind: 'entity', entityKind: 'npc', id: '9007', spaceId: 0 },
      }),
    ]);
  });

  it('keeps every schema property value, status, and why explanation', () => {
    const rows = mapCanvasInspectorRows(studioInspectorGroups([{
      id: 'elevation', label: 'Elevation', component: 'selection', kind: 'number',
      value: 2, defaultValue: 0, why: 'Signed terrain plane.', pinned: true,
    }, {
      id: 'runtime', label: 'Runtime', component: 'selection', kind: 'readonly',
      value: 'unbound', why: 'No runtime authority.', readOnly: true, error: 'Unavailable',
    }]));
    expect(rows).toEqual([
      expect.objectContaining({ id: 'group-selection', heading: true, danger: true }),
      expect.objectContaining({
        id: 'property-elevation', label: expect.stringContaining('RESET AVAILABLE'), danger: false,
      }),
      expect.objectContaining({ id: 'why-elevation', label: 'WHY  Signed terrain plane.' }),
      expect.objectContaining({
        id: 'property-runtime', label: expect.stringContaining('ERROR Unavailable'), danger: true,
      }),
      expect.objectContaining({ id: 'why-runtime', label: 'WHY  No runtime authority.' }),
    ]);
  });
});
