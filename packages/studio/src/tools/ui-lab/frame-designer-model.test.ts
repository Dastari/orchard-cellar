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

  it('previews at the three logical UI scales without changing authored coordinates', () => {
    for (const scale of [1, 2, 3]) {
      const state = createFrameDesignerModel({
        definition: furnace, definitions, access: 'anonymous',
        viewport: { width: 480, height: 270 },
      }).snapshot();
      expect(state.layout.storage.frame.x * scale).toBeGreaterThanOrEqual(0);
      expect((state.layout.storage.frame.x + state.layout.storage.frame.width) * scale).toBeLessThanOrEqual(480 * scale);
    }
  });
});
