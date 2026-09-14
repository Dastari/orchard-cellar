import { describe, expect, it } from 'vitest';
import { parseFrameDefinition } from './frame-definition.js';
import { bootstrapContentRegistry } from './bootstrap-registry.js';

const bootstrapFrameDefinitions = () => [...bootstrapContentRegistry().frames.values()];

describe('authored frame definitions', () => {
  it('bootstraps every legacy inventory and station window with unique bindings', () => {
    const frames = bootstrapFrameDefinitions();
    expect(frames.map(({ id }) => id)).toEqual([
      'frame:barrel',
      'frame:chest',
      'frame:cooking',
      'frame:crafting',
      'frame:fermentation',
      'frame:furnace',
      'frame:hearth_stash',
      'frame:pack',
      'frame:press',
      'frame:shop',
    ]);
    for (const frame of frames) {
      expect(parseFrameDefinition(JSON.stringify(frame))).toEqual(frame);
      expect(new Set(frame.panes.map(({ id }) => id)).size).toBe(frame.panes.length);
    }
  });

  it('round-trips process-derived restrictions and conditional buttons', () => {
    const furnace = bootstrapFrameDefinitions().find(({ id }) => id === 'frame:furnace');
    expect(furnace).toBeDefined();
    expect(furnace?.panes.find(({ id }) => id === 'input')?.restriction).toEqual({
      acceptedFrom: { stationTag: 'station.furnace', role: 'input' },
    });
    const barrel = bootstrapFrameDefinitions().find(({ id }) => id === 'frame:barrel');
    expect(barrel?.buttons).toEqual([expect.objectContaining({
      interaction: 'seal', visibleWhen: { state: 'sealed', equals: false },
    })]);
  });

  it('owns client surface/custody presentation without deriving it from the frame id', () => {
    const parsed = parseFrameDefinition({
      ...bootstrapFrameDefinitions()[0],
      id: 'frame:renamed_mystery_vessel',
      title: 'MYSTERY VESSEL',
      presentation: { surface: 'entity', entityContainer: 'placeable' },
    });
    expect(parsed.id).toBe('frame:renamed_mystery_vessel');
    expect(parsed.presentation).toEqual({ surface: 'entity', entityContainer: 'placeable' });
  });

  it('rejects ambiguous bindings, duplicate panes, and incomplete slot grids', () => {
    const valid = bootstrapFrameDefinitions()[0]!;
    expect(() => parseFrameDefinition({ ...valid, panes: [{
      id: 'bad', kind: 'slots', columns: 1, rows: 1,
      bind: { self: 'backpack', entitySlots: [0] },
    }] })).toThrow('expected exactly one binding');
    expect(() => parseFrameDefinition({ ...valid, panes: [valid.panes[0], valid.panes[0]] }))
      .toThrow('unique ids');
    expect(() => parseFrameDefinition({ ...valid, panes: [{ id: 'bad', kind: 'slots', bind: { entitySlots: [0] } }] }))
      .toThrow('slot panes require columns and rows');
    expect(() => parseFrameDefinition({ ...valid, presentation: { surface: 'entity' } }))
      .toThrow('entity surface requires a container');
  });
});
