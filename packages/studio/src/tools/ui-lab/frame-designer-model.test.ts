import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentDefinitions, type FrameContentDefinition } from '@orchard/sim';
import { createFrameDesignerModel } from './frame-designer-model.js';

const definitions = bootstrapContentDefinitions();
const furnace = definitions.find((definition): definition is FrameContentDefinition => definition.id === 'frame:furnace')!;

describe('Frame Designer model', () => {
  it('reorders panes through the parsed immutable definition path', () => {
    const model = createFrameDesignerModel({ definition: furnace, definitions, access: 'anonymous' });
    const moved = model.movePane('output', 0);
    expect(moved.definition.panes[0]?.id).toBe('output');
    expect(moved.dirty).toBe(true);
    expect(moved.validation.valid).toBe(true);
  });

  it('edits grid dimensions and exposes inspected preview hit targets', () => {
    const model = createFrameDesignerModel({ definition: furnace, definitions, access: 'anonymous' });
    const state = model.updatePaneGrid('backpack', 4, 5);
    expect(state.definition.panes.find(({ id }) => id === 'backpack')).toMatchObject({ columns: 4, rows: 5 });
    expect(state.hitTargets.some(({ id, kind }) => id.includes('.pane.backpack.slot.') && kind === 'slot')).toBe(true);
    expect(model.updatePaneRestriction('output', { readOnly: true }).definition.panes
      .find(({ id }) => id === 'output')?.restriction).toEqual({ readOnly: true });
  });

  it('keeps anonymous drafts local and read-only sessions immutable', async () => {
    const anonymous = createFrameDesignerModel({
      definition: furnace, definitions, access: 'anonymous',
      createPublishAdapter: () => ({ publishContentChangeSet: vi.fn(async () => undefined) }),
    });
    anonymous.movePane('output', 0);
    expect(anonymous.snapshot().canPublish).toBe(false);
    await expect(anonymous.publish('frame.test', '')).rejects.toThrow('frame_designer_publish_unavailable');

    const readOnly = createFrameDesignerModel({ definition: furnace, definitions, access: 'read_only' });
    expect(() => readOnly.movePane('output', 0)).toThrow('frame_designer_read_only');
  });

  it('publishes one CAS upsert only through an authenticated adapter', async () => {
    const publishContentChangeSet = vi.fn(async () => undefined);
    const model = createFrameDesignerModel({
      definition: furnace, definitions, access: 'write', baseRevision: 42n,
      createPublishAdapter: () => ({ publishContentChangeSet }),
    });
    model.movePane('output', 0);
    const request = await model.publish('frame.test.42', 'Reorder output');
    expect(request).toMatchObject({ packId: 'live', expectedRevision: 42n, deletes: '[]', note: 'Reorder output' });
    expect(JSON.parse(request.upserts)).toHaveLength(1);
    expect(publishContentChangeSet).toHaveBeenCalledWith(request);
  });

  it('inspects the actual kit preview at three logical viewport sizes', () => {
    for (const width of [480, 320, 160]) {
      const state = createFrameDesignerModel({
        definition: furnace, definitions, access: 'anonymous',
        viewport: { width, height: 270 },
      }).snapshot();
      const frame = state.hitTargets.find(node => node.id === furnace.id)!;
      expect(frame.kind).toBe('window');
      // Game windows fit their content and never exceed the viewport.
      expect(frame.rect.x).toBe(0); expect(frame.rect.y).toBe(0);
      expect(frame.rect.width).toBeLessThanOrEqual(width); expect(frame.rect.height).toBeLessThanOrEqual(270);
      for (const node of state.hitTargets) {
        if (node.clip.width === 0 || node.clip.height === 0) continue;
        expect(node.clip.x).toBeGreaterThanOrEqual(0);
        expect(node.clip.y).toBeGreaterThanOrEqual(0);
        expect(node.clip.x + node.clip.width).toBeLessThanOrEqual(width);
        expect(node.clip.y + node.clip.height).toBeLessThanOrEqual(270);
      }
    }
  });
});
