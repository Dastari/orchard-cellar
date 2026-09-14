import { describe, expect, it } from 'vitest';
import { StudioInspectorKernel, StudioSelectionBus, StudioValidationPanel } from '../../shell/index.js';
import { ObjectStudioModel, type ObjectDraftStorage } from './model.js';

class MemoryStorage implements ObjectDraftStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function placement(id: string, tileX: number, tileY: number) {
  return {
    id, assetId: 1, assetName: 'prop_cf_wall', visual: { kind: 'state' as const, name: 'default', frameIndex: 0 },
    tileX, tileY, elevation: 2, layer: 'object' as const, quarterTurns: 0 as const, flipX: false,
  };
}

function harness(storage: ObjectDraftStorage = new MemoryStorage()) {
  const selection = new StudioSelectionBus();
  const inspector = new StudioInspectorKernel();
  const validation = new StudioValidationPanel();
  const model = new ObjectStudioModel('untitled-layout', { selection, inspector, validation }, storage);
  return { model, selection, inspector, validation, storage };
}

describe('Studio Object Studio model', () => {
  it('moves and transforms an individual placement without requiring a group',()=>{
    const {model}=harness();model.stamp(placement('single',10,12));
    model.move('single',1,-2);model.transform('single','rotate_clockwise');model.transform('single','flip_horizontal');
    expect(model.workspace().placements[0]).toMatchObject({tileX:11,tileY:10,quarterTurns:1,flipX:true});
    model.transform('single','rotate_counterclockwise');expect(model.workspace().placements[0]?.quarterTurns).toBe(0);
    expect(()=>model.move('single',.5,0)).toThrow('whole tiles');
  });
  it('supports Shift-add/Ctrl-toggle semantics, marquee selection, grouping, transforms, pivot, and prefab export', () => {
    const { model } = harness();
    model.stamp(placement('wall-1', 10, 12));
    model.stamp(placement('wall-2', 11, 12));
    model.select('wall-1'); model.select('wall-2', 'add');
    expect(model.selectedIds()).toEqual(['wall-1', 'wall-2']);
    model.select('wall-1', 'toggle'); expect(model.selectedIds()).toEqual(['wall-2']);
    model.marquee(['wall-1', 'wall-2']);
    model.group('wall_group', 'Wall Group');
    model.setPivot('wall_group', 10, 12);
    model.transform('wall_group', 'flip_horizontal');
    const prefab = model.exportPrefab('wall_group');
    expect(prefab).toMatchObject({ id: 'wall-group', title: 'Wall Group', pivot: { tileX: 1, tileY: 0 } });
    expect(prefab.placements).toHaveLength(2);
    model.explode('wall_group'); expect(model.workspace().objects).toHaveLength(0);
  });

  it('preserves collection frames, fractional collision, target-layer visibility, and autosaved drafts', () => {
    const storage = new MemoryStorage();
    const { model, inspector, validation } = harness(storage);
    model.stamp(placement('wall-1', 10, 12));
    model.setCollision({ id: 'wall-cell-1', tileX: 10, tileY: 12, elevation: 3, collisionMask: 0x0033 });
    model.upsertCollection({ id: 'buildings', label: 'Buildings', color: '#d66a4a', tileX: 4, tileY: 5, width: 24, height: 20 });
    model.selectLayer('canopy'); model.toggleLayer('ground');
    expect(model.activeLayer()).toBe('canopy'); expect(model.layerVisible('ground')).toBe(false);
    expect(inspector.groups().flatMap(({ rows }) => rows).map(({ id }) => id)).toContain('layer');
    expect(validation.errorCount()).toBe(0);
    const restored = harness(storage).model.workspace();
    expect(restored.collections[0]).toMatchObject({ id: 'buildings', color: '#d66a4a' });
    expect(restored.cells[0]?.collisionMask).toBe(0x0033);
  });
});
