import {
  applyMapDocumentV3Edit,
  compileMapDocument,
  createEmptyMapDocument,
  migrateMapDocumentV2,
  serializeMapDocumentV3,
  terrainDocumentForMapV3,
} from '@orchard/sim';
import { terrainArrayForMapDocument } from '@orchard/engine/editor-terrain';
import { describe, expect, it } from 'vitest';
import {
  StudioInspectorKernel,
  StudioNotifications,
  StudioSelectionBus,
  StudioValidationPanel,
} from '../../shell/index.js';
import type { AssetPaletteItem } from '../object/asset-palette.js';
import { MapEditorController, exactTileCellPart } from './editor-controller.js';
import { patchMapEditorTerrain } from './editor-terrain-patch.js';
import { mapObjectCatalog } from './map-object-catalog.js';
import { MapEditorModel } from './model.js';

function tileItems(assetName: string, frames: number): AssetPaletteItem[] {
  return Array.from({ length: frames }, (_, frameIndex) => ({
    key: `${assetName}:variant:base:${frameIndex}`, assetId: assetName.length, assetName, category: 'tiles',
    tags: ['kind.tiles', 'review.approved', 'variant.base'],
    layer: 'ground', footprint: [1, 1], blocksMovement: false, builderAvailable: false,
    visual: { kind: 'variant', name: 'base', frameIndex },
    frame: { x: frameIndex * 16, y: 0, width: 16, height: 16, durationTicks: 0 }, animated: false,
  })) as AssetPaletteItem[];
}

const catalog = mapObjectCatalog([
  ...tileItems('tile_cf_path', 47),
  ...tileItems('tile_cf_grass_2_sheet', 4),
  ...tileItems('tile_cf_path_decorated', 2),
], 'test');

function harness() {
  const base = migrateMapDocumentV2(createEmptyMapDocument({ id: 'parts-studio', title: 'Parts', width: 8, height: 8 }));
  const source = JSON.stringify({
    version: 2, baseRevision: 0, baseSemanticHash: null, dirty: true, document: serializeMapDocumentV3(base),
  });
  const model = new MapEditorModel('parts-studio', {
    selection: new StudioSelectionBus(),
    inspector: new StudioInspectorKernel(),
    validation: new StudioValidationPanel(),
    notifications: new StudioNotifications(),
    live: () => null,
  }, { getItem: () => source, setItem: () => undefined });
  const controller = new MapEditorController(model);
  controller.setViewport({ x: 80, y: 20, width: 960, height: 700 });
  controller.setCatalog(catalog);
  controller.setAutomaticGeneration(false);
  return { controller, model };
}

function screenForTile(controller: MapEditorController, tileX: number, tileY: number) {
  const { camera, viewport } = controller.snapshot();
  return {
    x: viewport.x + (tileX * 16 + 8 - camera.x) * camera.zoom,
    y: viewport.y + (tileY * 16 + 8 - camera.y) * camera.zoom,
  };
}

describe('Studio Exact tiles write cell parts', () => {
  it('classifies terrain-component tiles as parts and decorations as objects', () => {
    const byId = new Map(catalog.map((prefab) => [prefab.placements[0]!.assetName + ':' + prefab.placements[0]!.visual.frameIndex, prefab]));
    expect(exactTileCellPart(byId.get('tile_cf_path:12')!)).toEqual({ slot: 'path', exact: { frame: 12 } });
    expect(exactTileCellPart(byId.get('tile_cf_grass_2_sheet:3')!)).toEqual({ slot: 'fringe:grass_2', exact: { frame: 3 } });
    expect(exactTileCellPart(byId.get('tile_cf_path_decorated:1')!)).toBeNull();
  });

  it('paints a path edge as a terrain part, not a Ground Details object, and reverts it to smart', () => {
    const { controller, model } = harness();
    const edge = catalog.find((prefab) => prefab.placements[0]!.assetName === 'tile_cf_path'
      && prefab.placements[0]!.visual.frameIndex === 12)!;
    controller.selectExactTile(edge.id);
    expect(controller.selectedExactPart()).toEqual({ slot: 'path', exact: { frame: 12 } });
    expect(model.workspace()).toBe('terrain');
    expect(controller.snapshot().activeLayer).toBe('terrain');
    expect(controller.pointerDown(screenForTile(controller, 3, 4), 0)).toBe(true);
    controller.pointerUp();
    expect(model.document().objects).toHaveLength(0);
    expect(model.document().cells['3,4']).toEqual({ parts: [{ slot: 'path', exact: { frame: 12 } }] });
    expect(controller.selectedCellExactParts()).toEqual([{ slot: 'path', exact: { frame: 12 } }]);
    expect(controller.revertSelectedCellPartExact('path')).toBe(true);
    expect(model.document().cells['3,4']).toBeUndefined();
  });

  it('keeps decorative tiles on the Ground Details object layer', () => {
    const { controller, model } = harness();
    const decoration = catalog.find((prefab) => prefab.placements[0]!.assetName === 'tile_cf_path_decorated')!;
    controller.selectExactTile(decoration.id);
    expect(controller.selectedExactPart()).toBeNull();
    expect(model.workspace()).toBe('objects');
    expect(controller.snapshot().activeLayer).toBe('ground');
  });

  it('patches Studio terrain with the same part stack as a full game compile', () => {
    const before = migrateMapDocumentV2(createEmptyMapDocument({ id: 'patch', title: 'Patch', width: 8, height: 8 }));
    const after = applyMapDocumentV3Edit(before, {
      kind: 'terrain',
      command: { kind: 'paint', points: [{ tileX: 2, tileY: 5 }], patch: { cellPart: { slot: 'water', exact: { frame: 3 } } } },
    }).document;
    const full = terrainArrayForMapDocument(terrainDocumentForMapV3(after), compileMapDocument(terrainDocumentForMapV3(after)), after);
    const patched = patchMapEditorTerrain(terrainArrayForMapDocument(terrainDocumentForMapV3(before), undefined, before), before, after);
    expect(patched).not.toBeNull();
    expect([...patched!.terrain.cellParts ?? []]).toEqual([...full.cellParts ?? []]);
    const reverted = applyMapDocumentV3Edit(after, {
      kind: 'terrain',
      command: { kind: 'paint', points: [{ tileX: 2, tileY: 5 }], patch: { revertPartExact: 'water' } },
    }).document;
    expect(patchMapEditorTerrain(patched!.terrain, after, reverted)!.terrain.cellParts?.size ?? 0).toBe(0);
  });
});
