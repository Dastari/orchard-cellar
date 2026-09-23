import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import type { WorldCrop, WorldResource } from '@orchard/world-bindings/types';
import { GrowthTimingHoverIndex, projectResourceTiming } from './growth-timing.js';
import { KeyedStore } from '../net/keyed-store.js';
const registry = bootstrapContentRegistry();
const crop = { id: '0:5:5', tileX: 5, tileY: 5, spaceId: 0 } as WorldCrop;

describe('growth inspection', () => {
  it('picks projected crops without action reach and invalidates same-count replacement', () => {
    const rows = new KeyedStore<string, WorldCrop>(); rows.set(crop.id, crop);
    const index = new GrowthTimingHoverIndex();
    const input = { registry, revision: String(rows.revision), spaceId: 0, crops: rows, resources: [], x: 85, y: 65, projectionAt: () => 20 };
    expect(index.pick(input)).toEqual({ kind: 'crop', row: crop });
    rows.set(crop.id, { ...crop, tileX: 6 });
    expect(index.pick({ ...input, revision: String(rows.revision) })).toBeNull();
    expect(index.pick({ ...input, revision: String(rows.revision), x: 100 })?.row.tileX).toBe(6);
    expect(index.pick({ ...input, spaceId: 1 })).toBeNull();
  });
  it('uses authored resource target bounds and caches only immutable snapshots', () => {
    const definition = [...registry.resources.values()].find(row => row.regrowth !== undefined && row.fruitHarvest !== undefined)!;
    const row = { id: 5n, definitionId: definition.id, kind: definition.runtimeKind,
      tileX: 10, tileY: 10, spaceId: 0, growthStage: 3, regrowthProgress: 24,
      health: 3, depleted: false, fruitReadyAtTick: 1_200n } as WorldResource;
    const rect = definition.target.footprint, x = 168 + (rect.left + rect.right) / 2,
      y = 176 + (rect.top + rect.bottom) / 2 - 10;
    const index = new GrowthTimingHoverIndex();
    expect(index.pick({ registry, revision: '1', spaceId: 0, crops: [], resources: [row], x, y, projectionAt: () => 10 })?.row).toBe(row);
    const first = projectResourceTiming(registry, row, 100n, false);
    expect(projectResourceTiming(registry, row, 100n, false)).toBe(first);
    expect(projectResourceTiming(registry, row, 101n, false)).not.toBe(first);
    expect(projectResourceTiming(registry, { ...row, fruitReadyAtTick: 0n }, 100n, false)?.status).toBe('ready');
  });
});
