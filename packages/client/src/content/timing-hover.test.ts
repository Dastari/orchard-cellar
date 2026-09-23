import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, type ContentRegistry } from '@orchard/sim';
import type { WorldPlaceable } from '@orchard/world-bindings/types';
import { TimingHoverIndex } from './timing-hover.js';
import { cachedProcessorRuntime, projectProcessorTiming } from './processor-timing.js';

const base = bootstrapContentRegistry();
const row = { id: 1n, kind: 'furnace', definitionId: 'object:furnace', spaceId: 0,
  tileX: 10, tileY: 20, stateJson: '{}', open: false, lit: false } as WorldPlaceable;
function registry(target = false): ContentRegistry {
  const object = base.objects.get('object:furnace')!;
  return { ...base, objects: new Map(base.objects).set(object.id, { ...object,
    components: { ...object.components,
      ...(target ? { target: { rect: { left: -16, right: 16, top: -48, bottom: 0 } } } : {}),
      placement: { ...object.components.placement!, footprint: [[15, 15], [15, 15]] },
    } }) };
}
describe('timing hover spatial inspection', () => {
  it('picks the full footprint without a player/reach input and hides carried/other-space objects', () => {
    const index = new TimingHoverIndex();
    const input = { registry: registry(), revision: '1', spaceId: 0, rows: [row],
      x: 185, y: 340, projectionAt: () => 0 };
    expect(index.pick(input)?.id).toBe(1n);
    expect(index.pick({ ...input, x: 200 })).toBeNull();
    expect(index.pick({ ...input, spaceId: 1 })).toBeNull();
    expect(index.pick({ ...input, revision: '2', rows: [{ ...row, carriedBy: {} as WorldPlaceable['placedBy'] }] })).toBeNull();
  });
  it('uses authored target bounds and terrain projection; invalidates on content revision', () => {
    const index = new TimingHoverIndex();
    const input = { registry: registry(true), revision: '1', spaceId: 0, rows: [row],
      x: 166, y: 275, projectionAt: () => 20 };
    expect(index.pick(input)?.id).toBe(1n);
    expect(index.pick({ ...input, registry: registry(false) })).toBeNull();
    expect(index.pick({ ...input, x: 100 })).toBeNull();
  });
  it('reuses unchanged projections and invalidates slot, tick and content snapshots', () => {
    const context = { registry: base, barrelRank: 0, vintageRank: 0, barrelingRank: 0 };
    const result = projectProcessorTiming(row, 100n, context);
    expect(projectProcessorTiming(row, 100n, context)).toBe(result);
    expect(projectProcessorTiming(row, 101n, context)).not.toBe(result);
    expect(projectProcessorTiming(row, 100n, { ...context, slots: { get: () => undefined } })).not.toBe(result);
    expect(projectProcessorTiming(row, 100n, { ...context, registry: registry() })).not.toBe(result);
  });
  it('caches processor metadata per immutable registry, never across revisions', () => {
    const first = cachedProcessorRuntime(base, row);
    expect(cachedProcessorRuntime(base, row)).toBe(first);
    expect(cachedProcessorRuntime(registry(), row)).not.toBe(first);
    const retired = { ...base, processes: new Map() };
    expect(cachedProcessorRuntime(retired, row)).toBeNull();
  });
});
