import { describe, expect, it } from 'vitest';
import { parseFrameDefinition } from './frame-definition.js';
import { bootstrapContentRegistry, bootstrapContentRows } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import stageAContentRows from './fixtures/stage-a-content-459.json' with { type: 'json' };

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
      const chest = JSON.parse(String(row.json)) as { panes: { kind: string; bind: object; restriction?: unknown }[] };
      return { ...row, json: JSON.stringify({ ...chest, panes: chest.panes.map((pane) => 'entitySlots' in pane.bind
        ? { ...pane, restriction: { rejectedItems: [item] } } : pane) }) };
    }));
    expect(withDeny('item:coal').report.errors).toEqual([]);
    expect(withDeny('item:not_present').report.errors).toContainEqual(expect.objectContaining({
      code: 'unresolved_reference', definitionId: 'frame:chest',
    }));
  });

  it('keeps the original production pack valid: its furnace fuel type (no item carries it) is only a warning', () => {
    const { report } = buildContentRegistry(stageAContentRows);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toContainEqual(expect.objectContaining({ severity: 'warning', definitionId: 'frame:furnace',
      message: 'frame slot item type matches no item: fuel.furnace' }));
  });

  it('warns, without refusing, about slot item types that no item carries, for required and rejected types alike', () => {
    const rows = bootstrapContentRows();
    const withRestriction = (restriction: Record<string, unknown>) => buildContentRegistry(rows.map((row) => {
      if (row.id !== 'frame:chest') return row;
      const chest = JSON.parse(String(row.json)) as { panes: { kind: string; bind: object; restriction?: unknown }[] };
      return { ...row, json: JSON.stringify({ ...chest, panes: chest.panes.map((pane) => 'entitySlots' in pane.bind
        ? { ...pane, restriction } : pane) }) };
    })).report;
    const known = withRestriction({ requiredTags: ['item.tool'], rejectedTags: ['tool.farming.cultivate'] });
    expect(known.errors).toEqual([]);
    expect(known.warnings.filter(({ definitionId }) => definitionId === 'frame:chest')).toEqual([]);
    for (const field of ['requiredTags', 'rejectedTags']) {
      const report = withRestriction({ [field]: ['item.tool', 'item.nonexistent_tag'] });
      // A warning only: live payloads that already carry such a tag (production's furnace fuel pane) stay valid.
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.warnings).toContainEqual(expect.objectContaining({ severity: 'warning',
        code: 'unresolved_reference', definitionId: 'frame:chest', message: 'frame slot item type matches no item: item.nonexistent_tag',
        path: expect.stringMatching(new RegExp(`restriction\\.${field}\\[1\\]$`, 'u')),
      }));
    }
  });

  describe('restrictions on panes the server does not enforce (BUG-047)', () => {
    type Pane = { id: string; kind: string; bind: Record<string, unknown>; restriction?: unknown };
    /** Adds `restriction` to one pane of one bootstrap frame. */
    const withPaneRestriction = (frameId: string, paneId: string, restriction: Record<string, unknown>) => (
      bootstrapContentRows().map((row) => {
        if (row.id !== frameId) return row;
        const frame = JSON.parse(String(row.json)) as { panes: Pane[] };
        expect(frame.panes.some(({ id }) => id === paneId)).toBe(true);
        return { ...row, json: JSON.stringify({ ...frame, panes: frame.panes.map((pane) => pane.id === paneId
          ? { ...pane, restriction } : pane) }) };
      }));
    const selfPaneCases = [
      ['frame:chest', 'backpack', { rejectedItems: ['item:apple'] }],
      ['frame:crafting', 'crafting', { requiredTags: ['item.tool'] }],
      ['frame:pack', 'equipment', { readOnly: true }],
      ['frame:shop', 'backpack', { acceptedItems: ['item:apple'] }],
    ] as const;

    it.each(selfPaneCases)('refuses a new restriction on %s\'s self-bound %s pane', (frameId, paneId, restriction) => {
      const rows = withPaneRestriction(frameId, paneId, restriction);
      const paneIndex = (JSON.parse(String(rows.find(({ id }) => id === frameId)!.json)) as { panes: Pane[] }).panes
        .findIndex(({ id }) => id === paneId);
      const expected = { code: 'invalid_frame', definitionId: frameId, path: `panes[${paneIndex}].restriction` };
      // Authored now (the repository, a publication that writes the frame, the frame designer): an error.
      for (const authoredIds of ['all', new Set([frameId])] as const) {
        const { report } = buildContentRegistry(rows, { authoredIds });
        expect(report.valid).toBe(false);
        expect(report.errors).toEqual([expect.objectContaining({ ...expected, severity: 'error' })]);
      }
      // Already in a head (loading live content, or a publication that doesn't touch this frame): only a warning.
      for (const options of [{}, { authoredIds: new Set(['frame:barrel']) }]) {
        const { report } = buildContentRegistry(rows, options);
        expect(report.valid).toBe(true);
        expect(report.errors).toEqual([]);
        expect(report.warnings).toContainEqual(expect.objectContaining({ ...expected, severity: 'warning' }));
      }
    });

    it('still accepts restrictions on panes bound to entity slots, which the server enforces', () => {
      const rows = withPaneRestriction('frame:chest', 'contents', { rejectedItems: ['item:apple'] });
      const { report } = buildContentRegistry(rows, { authoredIds: 'all' });
      expect(report.errors).toEqual([]);
      expect(report.warnings.filter(({ definitionId }) => definitionId === 'frame:chest')).toEqual([]);
    });

    it('finds nothing to flag in the shipped content or the original production pack', () => {
      const shipped = buildContentRegistry(bootstrapContentRows(), { authoredIds: 'all' }).report;
      expect(shipped.errors).toEqual([]);
      expect(shipped.warnings.filter(({ code }) => code === 'invalid_frame')).toEqual([]);
      // Even judged as newly authored, production's first pack has no restriction on a self-bound pane.
      const production = buildContentRegistry(stageAContentRows, { authoredIds: 'all' }).report;
      expect(production.errors.filter(({ code }) => code === 'invalid_frame')).toEqual([]);
    });
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
