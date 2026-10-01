import { createMapPrefabDocument } from '@orchard/sim';
import { describe, expect, it, vi } from 'vitest';
import { StudioShellController } from '../../shell/controller.js';
import type { StudioCanvasToolContext } from '../../shell/canvas-tool.js';
import { kitElement, keyKit, pressKit } from '../kit-test-driver.js';
import { buildMapCanvasTool } from './canvas.js';
import type { MapEditorModel } from './model.js';
import type { MapEditorController } from './editor-controller.js';

describe('map group drawer', () => {
  it('groups keyboard-picked props and invokes complete group edits without individual property controls', () => {
    const controller = new StudioShellController(async () => { throw new Error('Fixture cannot connect'); }, null);
    controller.navigate('/build/map/terrain-lab');
    const context: StudioCanvasToolContext = { controller, route: controller.activeRoute(),
      controlsBounds: { x: 10, y: 20, width: 270, height: 720 },
      workspaceBounds: { x: 300, y: 20, width: 820, height: 720 },
      inspectorBounds: { x: 1140, y: 20, width: 286, height: 720 },
      bounds: { x: 300, y: 20, width: 820, height: 720 }, invalidate: vi.fn() };
    buildMapCanvasTool(context);
    const state = controller.toolState('map-canvas:terrain-lab', () => null) as unknown as { model: MapEditorModel; interaction: MapEditorController };
    const prefab = createMapPrefabDocument({ id: 'group-prop', title: 'Group prop' });
    state.model.embedPrefab(prefab);
    for (const [id, x] of [['group-a', 2], ['group-b', 5]] as const) state.model.placeObject({ id, prefabId: prefab.id, prefabRevision: prefab.revision,
      tileX: x, tileY: 2, elevation: 0, layer: 'objects', quarterTurns: 0, flipX: false, enabled: true });
    state.model.selectObject('group-a');
    let surface = buildMapCanvasTool(context);
    keyKit(surface, 'map-group-selection-mode', ' ');
    expect(state.model.groupSelectionMode()).toBe(true);
    state.model.selectObject('group-b');
    surface = buildMapCanvasTool(context);
    expect(kitElement(surface, 'map-group-count')).toBeDefined();
    expect(kitElement(surface, 'map-property-x')).toBeUndefined();
    expect(kitElement(surface, 'map-property-scale')).toBeUndefined();
    const before = state.model.document();
    pressKit(surface, 'map-group-down');
    expect(state.model.document().objects.filter(object => object.id.startsWith('group-')).map(object => object.tileY)).toEqual([3, 3]);
    state.interaction.undo(); expect(state.model.document()).toBe(before);
    surface = buildMapCanvasTool(context); pressKit(surface, 'map-group-duplicate');
    expect(state.model.selectedObjectIds()).toHaveLength(2);
    expect(state.model.selectedObjectIds().every(id => id.startsWith('clone-'))).toBe(true);
    surface = buildMapCanvasTool(context); pressKit(surface, 'map-group-delete');
    expect(state.model.document().objects.filter(object => object.id.startsWith('clone-'))).toHaveLength(0);
    state.interaction.undo();
    expect(state.model.document().objects.filter(object => object.id.startsWith('clone-'))).toHaveLength(2);
    state.interaction.dispose(); state.model.dispose();
  });
});
