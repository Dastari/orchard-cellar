import { describe, expect, it } from 'vitest';
import { bootstrapContentRows } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import { frameEntitySlotIndexes, frameRestrictions } from './frame-runtime.js';
import { MAX_CONTAINER_CAPACITY } from './parse-contract.js';

// Uncapped Storage steps 3 and 5 (wiki Roadmap/Uncapped Storage): `entitySlots: all` binds a whole container, and every
// container shares one technical ceiling of 65,535 slots.
type Json = Record<string, unknown>;
const edit = (id: string, change: (json: Json) => Json) => buildContentRegistry(bootstrapContentRows().map(row => row.id !== id ? row
  : { ...row, json: JSON.stringify(change(JSON.parse(String(row.json)) as Json)) }));
const errors = (built: ReturnType<typeof buildContentRegistry>) => built.report.errors.map(issue => `${issue.definitionId} ${issue.path}: ${issue.message}`);

describe('Uncapped Storage step 3 content', () => {
  const whole = (json: Json, extra: Json = {}): Json => ({ ...json, panes: (json.panes as Json[]).map(pane => (pane.bind as Json).entitySlots === undefined ? pane
    : { ...pane, ...extra, bind: { entitySlots: 'all' } }) });
  // Step 5 content switch: the shipped chest, barrel and stash frames bind `all` (clients since 0.52 parse it), and
  // every object that opens them has exactly the slots their former lists named, so nothing moves on screen.
  it('ships the chest, barrel and stash contents bound to their whole containers, the same slots as their former lists', () => {
    const shipped = buildContentRegistry(bootstrapContentRows());
    expect(shipped.report.errors).toEqual([]);
    const sizes = { 'frame:chest': 16, 'frame:barrel': 8, 'frame:hearth_stash': 20 } as const;
    for (const [id, size] of Object.entries(sizes)) {
      const panes = shipped.registry.frames.get(id as keyof typeof sizes)!.panes.filter(candidate => 'entitySlots' in candidate.bind);
      expect(panes.map(pane => pane.bind)).toEqual([{ entitySlots: 'all' }]);
      const pane = panes[0]!;
      expect('entitySlots' in pane.bind ? frameEntitySlotIndexes(pane.bind, size) : null).toEqual(Array.from({ length: size }, (_, index) => index));
    }
    const opened = (frame: string) => [...shipped.registry.objects.values()].filter(object => JSON.stringify(object).includes(`"${frame}"`));
    for (const frame of ['frame:chest', 'frame:barrel'] as const) {
      expect(opened(frame).length).toBeGreaterThan(0);
      for (const object of opened(frame)) expect((object.components as { container?: { slotCount?: number } }).container?.slotCount).toBe(sizes[frame]);
    }
    const stashes = bootstrapContentRows().flatMap(row => [...String(row.json).matchAll(/"stashCapacity":\s*(\d+)/gu)].map(match => Number(match[1])));
    expect(stashes).toEqual([sizes['frame:hearth_stash']]);
  });

  it('gives a whole-container pane\'s rule to every slot of the container', () => {
    const built = edit('frame:chest', json => whole(json, { restriction: { acceptedItems: ['item:apple'] } }));
    expect(built.report.errors).toEqual([]);
    const frame = built.registry.frames.get('frame:chest')!;
    expect(Object.keys(frameRestrictions(frame, built.registry, 256)).map(Number)).toEqual(Array.from({ length: 256 }, (_, index) => index));
    expect(frameRestrictions(frame, built.registry)).toEqual({});
  });

  it('refuses a second entity pane beside a whole-container pane', () => {
    const built = edit('frame:chest', json => ({ ...whole(json), panes: [...(whole(json).panes as Json[]),
      { id: 'extra', kind: 'slots', columns: 1, rows: 1, bind: { entitySlots: [0] } }] }));
    expect(errors(built).join('\n')).toContain('an entitySlots: all pane must be the frame\'s only entity pane');
  });

  // Step 5: one shared technical ceiling, 65,535, for a placeable's slotCount, the stash and an equipped bag.
  it('caps a placeable container, the hearth stash and a bag at 65,535 slots', () => {
    expect(MAX_CONTAINER_CAPACITY).toBe(65_535);
    const container = (slotCount: number) => edit('object:chest', json => ({ ...json,
      components: { ...(json.components as Json), container: { ...((json.components as Json).container as Json), slotCount } } }));
    for (const allowed of [257, 1000, 65_535]) expect(container(allowed).report.errors).toEqual([]);
    expect(errors(container(65_536)).join('\n')).toMatch(/slotCount/u);
    const lobby = bootstrapContentRows().find(row => String(row.json).includes('"stashCapacity"'))!;
    const stash = (stashCapacity: number) => edit(lobby.id, json => JSON.parse(JSON.stringify(json).replace(/"stashCapacity":\d+/u, `"stashCapacity":${stashCapacity}`)) as Json);
    for (const allowed of [257, 65_535]) expect(stash(allowed).report.errors).toEqual([]);
    expect(errors(stash(65_536)).join('\n')).toMatch(/stashCapacity/u);
    const bag = (inventoryCapacity: number) => edit('item:backpack', json => ({ ...json, equip: { ...(json.equip as Json), inventoryCapacity } }));
    for (const allowed of [21, 1000, 65_535]) {
      const built = bag(allowed);
      expect(built.report.errors).toEqual([]);
      expect(built.registry.items.get('item:backpack')?.equip?.inventoryCapacity).toBe(allowed);
    }
    expect(errors(bag(65_536)).join('\n')).toMatch(/inventoryCapacity/u);
  });
});
