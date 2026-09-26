import { describe, expect, it } from 'vitest';
import { parseFrameDefinition } from './frame-definition.js';
import { bootstrapContentRegistry, bootstrapContentRows } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';

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

  it('round-trips authored deny lists by item and by item type', () => {
    const chest = bootstrapFrameDefinitions().find(({ id }) => id === 'frame:chest')!;
    const pane = chest.panes.find(({ kind }) => kind === 'slots')!;
    const restriction = { acceptedItems: ['item:wood', 'item:coal'], rejectedItems: ['item:coal'], rejectedTags: ['item.tool'] };
    const parsed = parseFrameDefinition(JSON.stringify({
      ...chest, panes: chest.panes.map((entry) => entry === pane ? { ...entry, restriction } : entry),
    }));
    expect(parsed.panes.find(({ id }) => id === pane.id)?.restriction).toEqual(restriction);
    expect(() => parseFrameDefinition({
      ...chest, panes: chest.panes.map((entry) => entry === pane ? { ...entry, restriction: { rejectedTags: ['Not A Tag'] } } : entry),
    })).toThrow('rejectedTags[0]: invalid stable reference');
    expect(() => parseFrameDefinition({
      ...chest, panes: chest.panes.map((entry) => entry === pane ? { ...entry, restriction: { rejectedItems: 'item:coal' } } : entry),
    })).toThrow('rejectedItems: expected array');
  });

  it('validates deny-listed items as item references', () => {
    const rows = bootstrapContentRows();
    const withDeny = (item: string) => buildContentRegistry(rows.map((row) => {
      if (row.id !== 'frame:chest') return row;
      const chest = JSON.parse(String(row.json)) as { panes: { kind: string; restriction?: unknown }[] };
      return { ...row, json: JSON.stringify({ ...chest, panes: chest.panes.map((pane) => pane.kind === 'slots'
        ? { ...pane, restriction: { rejectedItems: [item] } } : pane) }) };
    }));
    expect(withDeny('item:coal').report.errors).toEqual([]);
    expect(withDeny('item:not_present').report.errors).toContainEqual(expect.objectContaining({
      code: 'unresolved_reference', definitionId: 'frame:chest',
    }));
  });

  it('refuses slot item types that no item carries, for required and rejected types alike', () => {
    const rows = bootstrapContentRows();
    const withRestriction = (restriction: Record<string, unknown>) => buildContentRegistry(rows.map((row) => {
      if (row.id !== 'frame:chest') return row;
      const chest = JSON.parse(String(row.json)) as { panes: { kind: string; restriction?: unknown }[] };
      return { ...row, json: JSON.stringify({ ...chest, panes: chest.panes.map((pane) => pane.kind === 'slots'
        ? { ...pane, restriction } : pane) }) };
    })).report.errors;
    expect(withRestriction({ requiredTags: ['item.tool'], rejectedTags: ['tool.farming.cultivate'] })).toEqual([]);
    for (const field of ['requiredTags', 'rejectedTags']) {
      expect(withRestriction({ [field]: ['item.tool', 'item.nonexistent_tag'] })).toContainEqual(expect.objectContaining({
        code: 'unresolved_reference', definitionId: 'frame:chest', message: 'frame slot item type matches no item: item.nonexistent_tag',
        path: expect.stringMatching(new RegExp(`restriction\\.${field}\\[1\\]$`, 'u')),
      }));
    }
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
