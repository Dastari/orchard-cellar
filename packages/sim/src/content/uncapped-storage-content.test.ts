import { describe, expect, it } from 'vitest';
import { bootstrapContentRows } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import { frameEntitySlotIndexes, frameRestrictions } from './frame-runtime.js';
import { MAX_CONTAINER_CAPACITY } from './parse-contract.js';

// Uncapped Storage step 3 (wiki Roadmap/Uncapped Storage): `entitySlots: all` binds a whole container, and stored
// containers are capped at 256 slots until the step-4 migration widens slot numbers.
type Json = Record<string, unknown>;
const edit = (id: string, change: (json: Json) => Json) => buildContentRegistry(bootstrapContentRows().map(row => row.id !== id ? row
  : { ...row, json: JSON.stringify(change(JSON.parse(String(row.json)) as Json)) }));
const errors = (built: ReturnType<typeof buildContentRegistry>) => built.report.errors.map(issue => `${issue.definitionId} ${issue.path}: ${issue.message}`);

describe('Uncapped Storage step 3 content', () => {
  it('binds the chest, barrel and stash contents to their whole containers, the same slots as before', () => {
    const built = buildContentRegistry(bootstrapContentRows());
    expect(built.report.errors).toEqual([]);
    const sizes = { 'frame:chest': 16, 'frame:barrel': 8, 'frame:hearth_stash': 20 } as const;
    for (const [id, size] of Object.entries(sizes)) {
      const frame = built.registry.frames.get(id as keyof typeof sizes)!;
      const pane = frame.panes.find(candidate => 'entitySlots' in candidate.bind)!;
      expect(pane.bind).toEqual({ entitySlots: 'all' });
      expect('entitySlots' in pane.bind && frameEntitySlotIndexes(pane.bind, size)).toEqual(Array.from({ length: size }, (_, index) => index));
    }
  });

  it('gives a whole-container pane\'s rule to every slot of the container', () => {
    const built = edit('frame:chest', json => ({ ...json, panes: (json.panes as Json[]).map(pane => (pane.bind as Json).entitySlots === undefined ? pane
      : { ...pane, restriction: { acceptedItems: ['item:apple'] } }) }));
    expect(built.report.errors).toEqual([]);
    const frame = built.registry.frames.get('frame:chest')!;
    expect(Object.keys(frameRestrictions(frame, built.registry, 256)).map(Number)).toEqual(Array.from({ length: 256 }, (_, index) => index));
    expect(frameRestrictions(frame, built.registry)).toEqual({});
  });

  it('refuses a second entity pane beside a whole-container pane', () => {
    const built = edit('frame:chest', json => ({ ...json, panes: [...(json.panes as Json[]),
      { id: 'extra', kind: 'slots', columns: 1, rows: 1, bind: { entitySlots: [0] } }] }));
    expect(errors(built).join('\n')).toContain('an entitySlots: all pane must be the frame\'s only entity pane');
  });

  it('caps a placeable container and the hearth stash at 256 slots', () => {
    expect(MAX_CONTAINER_CAPACITY).toBe(256);
    const container = (slotCount: number) => edit('object:chest', json => ({ ...json,
      components: { ...(json.components as Json), container: { ...((json.components as Json).container as Json), slotCount } } }));
    expect(container(256).report.errors).toEqual([]);
    expect(errors(container(257)).join('\n')).toMatch(/slotCount/u);
    const lobby = bootstrapContentRows().find(row => String(row.json).includes('"stashCapacity"'))!;
    const stash = (stashCapacity: number) => edit(lobby.id, json => JSON.parse(JSON.stringify(json).replace(/"stashCapacity":\d+/u, `"stashCapacity":${stashCapacity}`)) as Json);
    expect(stash(256).report.errors).toEqual([]);
    expect(errors(stash(257)).join('\n')).toMatch(/stashCapacity/u);
  });
});
