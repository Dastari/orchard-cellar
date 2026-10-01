import { createEmptyMapDocument, createMapPrefabDocument, migrateMapDocumentV2, normalizeMapPrefab, serializeMapDocumentV3 } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { StudioInspectorKernel, StudioNotifications, StudioSelectionBus, StudioValidationPanel } from '../../shell/index.js';
import { MapEditorController } from './editor-controller.js';
import { MapEditorModel } from './model.js';

function harness() {
  const prefab = normalizeMapPrefab({ ...createMapPrefabDocument({ id: 'prop', title: 'Prop' }), cells: [{ id: 'body', tileX: 0, tileY: 0, elevation: 0, collisionMask: 65535 }] });
  const base = migrateMapDocumentV2(createEmptyMapDocument({ id: 'groups', title: 'Groups', width: 12, height: 12 }));
  const objects = ['a', 'b'].map((id, index) => ({ id, prefabId: prefab.id, prefabRevision: prefab.revision,
    tileX: 2 + index * 2, tileY: 3, elevation: 0, layer: 'objects' as const, quarterTurns: 0 as const, flipX: false, enabled: true }));
  const document = { ...base, prefabs: [prefab], objects };
  const selection = new StudioSelectionBus(), notifications = new StudioNotifications();
  const model = new MapEditorModel('groups', { selection, notifications, inspector: new StudioInspectorKernel(), validation: new StudioValidationPanel(), live: () => null },
    { getItem: () => JSON.stringify({ version: 2, baseRevision: 0, baseSemanticHash: null, dirty: true, document: serializeMapDocumentV3(document) }), setItem: () => undefined });
  const controller = new MapEditorController(model);
  controller.setViewport({ x: 0, y: 0, width: 600, height: 600 });
  controller.selectEditingTool('objects');
  const point = (x: number, y: number) => {
    const { camera, viewport } = controller.snapshot();
    return { x: viewport.x + (x * 16 + 8 - camera.x) * camera.zoom, y: viewport.y + (y * 16 + 8 - camera.y) * camera.zoom };
  };
  return { model, controller, point, selection, notifications, prefab };
}

describe('authored prop groups', () => {
  it('toggles Shift-click membership, focuses the last member, and keeps ordinary clicks single', () => {
    const { controller, model, point, selection } = harness();
    controller.pointerDown(point(2, 3), 0); controller.pointerUp();
    controller.pointerDown(point(4, 3), 0, false, true); controller.pointerUp();
    expect(model.selectedObjectIds()).toEqual(['a', 'b']);
    expect(selection.current()).toMatchObject({ id: 'b' });
    controller.pointerDown(point(4, 3), 0, false, true); controller.pointerUp();
    expect(model.selectedObjectIds()).toEqual(['a']);
    controller.pointerDown(point(4, 3), 0); controller.pointerUp();
    expect(model.selectedObjectIds()).toEqual(['b']);
    controller.dispose(); model.dispose();
  });

  it('moves a group into its former cells as one undoable transaction and retains terrain cache', () => {
    const { model, controller } = harness();
    model.selectObjects(['a', 'b']); const before = model.document(), terrain = model.terrainIdentity();
    expect(controller.nudgeSelected(2, 0)).toBe(true);
    expect(model.document().objects.map(object => object.tileX)).toEqual([4, 6]);
    expect(model.document().revision).toBe(before.revision + 1);
    expect(model.terrainIdentity()).toBe(terrain);
    controller.undo(); expect(model.document()).toBe(before);
    controller.redo(); expect(model.document().objects.map(object => object.tileX)).toEqual([4, 6]);
    controller.dispose(); model.dispose();
  });

  it('clamps a drag as a whole, previews without committing, cancels with Escape, and commits once', () => {
    const { model, controller, point } = harness(); model.selectObjects(['a', 'b']);
    const before = model.document();
    controller.pointerDown(point(2, 3), 0); controller.pointerMove(point(11, 3));
    expect(controller.snapshot().groupDrag).toMatchObject({ deltaX: 7, deltaY: 0 });
    expect(model.document()).toBe(before);
    controller.keyDown('Escape'); controller.pointerUp();
    expect(model.document()).toBe(before); expect(model.selectedObjectIds()).toEqual(['a', 'b']);
    controller.pointerDown(point(2, 3), 0); controller.pointerMove(point(11, 3)); controller.pointerUp();
    expect(model.document().objects.map(object => object.tileX)).toEqual([9, 11]);
    controller.undo(); expect(model.document()).toBe(before);
    controller.dispose(); model.dispose();
  });

  it('rejects collisions, live occupancy and locked/hidden members without partial mutation/history', () => {
    const { model, controller } = harness();
    model.placeObject({ ...model.document().objects[0]!, id: 'blocker', tileX: 5 });
    model.selectObjects(['a', 'b']); const before = model.document();
    expect(controller.nudgeSelected(1, 0)).toBe(false); expect(model.document()).toBe(before);
    expect(model.selectedObjectIds()).toEqual(['a', 'b']);
    model.setLiveObjectOccupancy(object => object.tileX === 7);
    expect(controller.nudgeSelected(3, 0)).toBe(false); expect(model.document()).toBe(before);
    model.toggleLayer('objects'); expect(controller.deleteSelected()).toBe(false); expect(model.document()).toBe(before);
    model.toggleLayer('objects'); model.toggleLayerLock('objects');
    expect(controller.cloneSelected()).toBe(false); expect(model.document()).toBe(before);
    controller.undo(); expect(model.document().objects).toHaveLength(2);
    controller.dispose(); model.dispose();
  });

  it('duplicates unique IDs and deletes a group with one undo/redo each', () => {
    const { model, controller } = harness(); model.selectObjects(['a', 'b']); const before = model.document();
    expect(controller.keyDown('d', true)).toBe(true); const cloned = model.document();
    expect(cloned.objects).toHaveLength(4); expect(new Set(cloned.objects.map(object => object.id)).size).toBe(4);
    expect(model.selectedObjectIds().every(id => id.startsWith('clone-'))).toBe(true);
    expect(cloned.revision).toBe(before.revision + 1);
    controller.undo(); expect(model.document()).toBe(before); controller.redo(); expect(model.document()).toBe(cloned);
    model.selectObjects(cloned.objects.filter(object => object.id.startsWith('clone-')).map(object => object.id));
    expect(controller.keyDown('Delete')).toBe(true); expect(model.document().objects).toHaveLength(2);
    controller.undo(); expect(model.document()).toBe(cloned); controller.redo(); expect(model.document().objects).toHaveLength(2);
    controller.dispose(); model.dispose();
  });

  it('preserves per-object transforms/elevations and prevents single-active transforms on groups', () => {
    const { model, controller } = harness();
    model.placeObject({ ...model.document().objects[1]!, quarterTurns: 1, flipX: true, elevation: 2 });
    model.selectObjects(['a', 'b']);
    expect(controller.rotateSelected()).toBe(false); expect(controller.flipSelected()).toBe(false);
    expect(controller.cycleSelectedScale()).toBe(false); expect(controller.toggleSelectedVisibility()).toBe(false);
    expect(controller.nudgeSelected(0, 1)).toBe(true);
    expect(model.document().objects[1]).toMatchObject({ elevation: 2, quarterTurns: 1, flipX: true, tileY: 4 });
    controller.dispose(); model.dispose();
  });

  it('supports keyboard outliner grouping and excludes locked props, live rows and stale drag commits', () => {
    const { model, controller, selection, point } = harness();
    model.selectObject('a'); model.setGroupSelectionMode(true); model.selectObject('b');
    expect(model.selectedObjectIds()).toEqual(['a', 'b']); model.setGroupSelectionMode(false);
    controller.pointerDown(point(2, 3), 0); controller.pointerMove(point(3, 3));
    model.placeObject({ ...model.document().objects[1]!, tileY: 5 }); const remoteChange = model.document();
    controller.pointerUp(); expect(model.document()).toBe(remoteChange);
    selection.select({ kind: 'entity', entityKind: 'chest', id: 'live', spaceId: 0 });
    expect(model.selectedObjectIds()).toEqual([]); expect(controller.deleteSelected()).toBe(false);
    model.toggleLayerLock('objects'); controller.pointerDown(point(2, 3), 0, false, true);
    expect(model.selectedObjectIds()).toEqual([]);
    controller.dispose(); model.dispose();
  });
  it('clears the entire group if a member disappears, so a stale selection never edits a subset', () => {
    const { model, controller, selection } = harness(); model.selectObjects(['a', 'b']);
    model.removeObject('a'); const afterRemoval = model.document();
    expect(controller.nudgeSelected(1, 0)).toBe(false);
    expect(model.document()).toBe(afterRemoval); expect(model.selectedObjectIds()).toEqual([]);
    expect(selection.current()).toEqual({ kind: 'none' });
    controller.dispose(); model.dispose();
  });

  it('clamps transformed footprints, including disabled props, and refuses an out-of-map duplicate atomically', () => {
    const { model, controller, prefab } = harness();
    model.embedPrefab({ ...prefab, id: 'wide', width: 2,
      cells: [{ id: 'one', tileX: 0, tileY: 0, elevation: 0, collisionMask: 65535 }, { id: 'two', tileX: 1, tileY: 0, elevation: 0, collisionMask: 65535 }] });
    model.placeObject({ ...model.document().objects[1]!, prefabId: 'wide', quarterTurns: 0, scale: 2, enabled: false });
    model.selectObjects(['a', 'b']); const before = model.document();
    expect(controller.nudgeSelected(100, 0)).toBe(true);
    const delta = model.document().objects[0]!.tileX - before.objects[0]!.tileX;
    expect(model.document().objects[1]!.tileX - before.objects[1]!.tileX).toBe(delta);
    expect(delta).toBeLessThan(7);
    const moved = model.document();
    expect(controller.cloneSelected()).toBe(false); expect(model.document()).toBe(moved);
    controller.undo(); expect(model.document()).toBe(before);
    controller.dispose(); model.dispose();
  });

  it('refuses an occupied duplicate without IDs, prefabs or undo entries leaking into the draft', () => {
    const { model, controller } = harness();
    model.placeObject({ ...model.document().objects[0]!, id: 'blocker', tileX: 5 });
    const before = model.document(); model.selectObjects(['a', 'b']);
    expect(controller.cloneSelected()).toBe(false);
    expect(model.document()).toBe(before); expect(model.selectedObjectIds()).toEqual(['a', 'b']);
    controller.undo(); expect(model.document().objects).toHaveLength(2);
    controller.dispose(); model.dispose();
  });

});
