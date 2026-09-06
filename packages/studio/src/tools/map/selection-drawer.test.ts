import { applyMapDocumentV3Edit, createEmptyMapDocument, migrateMapDocumentV2 } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { mapSelectionDrawerRows } from './selection-drawer.js';
import { inspectMapSelection, type MapGeneratedSelectionDescriptor } from './selection-inspection.js';

describe('map selection drawer projection', () => {
  it('retains provenance, resolved terrain, semantic WHY, and exact production draw roles', () => {
    let document = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'drawer-tile', title: 'Drawer Tile', width: 8, height: 8,
    }));
    document = applyMapDocumentV3Edit(document, {
      kind: 'terrain', command: { kind: 'paint', points: [{ tileX: 3, tileY: 4 }], patch: {
        surface: 'water', elevation: 1, collision: 'force_block', collisionReason: 'editor test barrier',
      } },
    }).document;
    const inspection = inspectMapSelection({
      document, selection: { kind: 'tile', spaceId: 0, tileX: 3, tileY: 4 }, activeLayer: 'objects',
    });
    expect(inspection).not.toBeNull();
    const rows = mapSelectionDrawerRows(inspection!);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'provenance', label: expect.stringContaining('AUTHORED') }),
      expect.objectContaining({ id: 'layer', label: expect.stringMatching(/TERRAIN.*INACTIVE.*VISIBLE.*EDITABLE/u) }),
      expect.objectContaining({ id: 'material', label: expect.stringMatching(/WATER.*AUTHORED/u) }),
      expect.objectContaining({ id: 'collision', label: expect.stringMatching(/BLOCKED.*FORCE BLOCK.*PLANE/u) }),
      expect.objectContaining({ id: 'collision-reason', label: expect.stringContaining('editor test barrier') }),
      expect.objectContaining({ id: 'why-0', label: expect.stringContaining('WHY 1') }),
      expect.objectContaining({ id: 'visual-0', label: expect.stringMatching(/DRAW 1.*·.*L/u) }),
    ]));
  });

  it('retains object transforms and reversible generated suppression metadata', () => {
    const document = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'drawer-object', title: 'Drawer Object', width: 8, height: 8,
    }));
    const generated: MapGeneratedSelectionDescriptor = {
      entityKind: 'resource', id: '42', spaceId: 0, name: 'Apple Tree', tileX: 3, tileY: 4,
      elevation: 2, layer: 'player_owned', source: 'live-world:resource', suppressionId: 'resource-42',
    };
    const inspection = inspectMapSelection({
      document,
      selection: { kind: 'entity', entityKind: 'resource', id: '42', spaceId: 0 },
      activeLayer: 'player_owned', generatedEntities: [generated],
    });
    expect(inspection).not.toBeNull();
    const rows = mapSelectionDrawerRows(inspection!);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'object', label: expect.stringMatching(/Apple Tree.*GENERATED OBJECT/u) }),
      expect.objectContaining({ id: 'transform', label: expect.stringMatching(/0°.*SCALE 1×.*ELEV 2/u) }),
      { id: 'suppression', label: 'SUPPRESSION  resource-42 · GENERATED' },
    ]));
  });

  it('identifies authored anchors and exposes runtime binding state', () => {
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'drawer-anchor', title: 'Drawer Anchor', width: 8, height: 8,
    }));
    const document = {
      ...base,
      anchors: [{ id: 'entry', kind: 'spawn' as const, tileX: 2, tileY: 3, elevation: 0 }],
    };
    const inspection = inspectMapSelection({
      document,
      selection: { kind: 'entity', entityKind: 'map-anchor', id: 'entry', spaceId: 0 },
      activeLayer: 'anchors',
    });
    const rows = mapSelectionDrawerRows(inspection!);
    expect(rows).toEqual(expect.arrayContaining([
      { id: 'provenance', label: 'SOURCE  AUTHORED · map-anchor:entry' },
      expect.objectContaining({ id: 'object', label: expect.stringContaining('ANCHOR  entry · AUTHORED ANCHOR') }),
      { id: 'live-detail-1', label: 'RUNTIME  UNBOUND' },
    ]));
    expect(rows.find((row) => row.id === 'object')?.label).not.toMatch(/VISIBLE|HIDDEN/u);
    expect(rows.some((row) => row.id === 'transform')).toBe(false);
  });
});
