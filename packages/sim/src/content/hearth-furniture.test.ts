import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';
import { HEARTH_FURNITURE_SHAPES } from '../hearth-furniture-state.js';
import { runtimeHomesteadBuildDefinition } from '../homestead-build.js';

describe('base furniture catalogue contracts', () => {
  it('contains 32 base pieces plus one earned keepsake, retaining storage and source-backed cooking states', () => {
    const registry = bootstrapContentRegistry();
    const ids = Object.keys(HEARTH_FURNITURE_SHAPES);
    expect(ids.filter(id => id.startsWith('furniture_'))).toHaveLength(32);
    expect(ids.filter(id => !id.startsWith('furniture_'))).toEqual(['delver_memorial_planter']);
    expect(ids).toHaveLength(33);
    for (const suffix of ['rustic_chest', 'rustic_bookshelf', 'rustic_cupboard', 'townhouse_wardrobe', 'townhouse_bookcase', 'townhouse_cabinet']) {
      expect(registry.objects.get(`object:furniture_${suffix}`)?.components.container).toMatchObject({ slotCount: 16, access: 'private' });
    }
    const range = registry.objects.get('object:furniture_rustic_cooking_range')!;
    expect(range.components.sprite?.animationByState).toEqual({ default: 'off', lit: 'burn' });
    expect(range.components.processor).toMatchObject({ processTag: 'station.campfire', autoStart: true });
    expect(range.components.frame?.ref).toBe('frame:cooking');
    expect(range.components.light).toMatchObject({ offsetY: -6, radiusTiles: 3, when: { state: 'lit', equals: true } });
  });
  it('binds every reviewed shape to nondurable native art and residence-only placement', () => {
    const registry = bootstrapContentRegistry();
    for (const shape of Object.values(HEARTH_FURNITURE_SHAPES)) {
      const item = registry.items.get(`item:${shape.id}`)!;
      const object = registry.objects.get(`object:${shape.id}`)!;
      expect(item).toBeDefined(); expect(object).toBeDefined();
      expect(item.durability).toBeUndefined();
      const earnedKeepsake = shape.id === 'delver_memorial_planter';
      expect(item.icon.asset).toBe(earnedKeepsake ? 'prop_delver_memorial_planter' : `prop_cf_${shape.id}`);
      expect(object.components.sprite?.asset).toBe(item.icon.asset);
      expect(object.components.placement).toMatchObject({ item: item.id, spaces: ['residence'], requiresRole: 'builder', facing: false });
      expect(object.components.placement?.footprint).toEqual(Array.from({ length: shape.height }, () => Array(shape.width).fill(15)));
      expect(object.components.collision?.blocksMovement).toBe(shape.base !== undefined);
      expect(object.components.collision?.when).toBeUndefined();
      expect(runtimeHomesteadBuildDefinition(registry, { kind: shape.id, definitionId: object.id })).toBeNull();
      if (earnedKeepsake) expect(item.economy).toEqual({ buy: null, sell: 0 });
      else expect(item.economy.sell).toBeLessThan(item.economy.buy!);
    }
  });
  it('uses independent storage and a steady switchable light without combat power', () => {
    const registry = bootstrapContentRegistry();
    const chest = registry.objects.get('object:furniture_rustic_chest')!;
    expect(chest.components.container).toMatchObject({ slotCount: 16, access: 'private' });
    expect(chest.components.identity?.tags).not.toContain('damageable');
    expect(chest.components.frame?.ref).toBe('frame:chest');
    const lamp = registry.objects.get('object:furniture_townhouse_table_lamp')!;
    expect(lamp.components.light).toMatchObject({ profile: 'steady', when: { state: 'lit', equals: true } });
    expect(lamp.components.interactions?.[0]?.effects).toEqual([{ toggleState: 'lit' }]);
    for (const shape of Object.values(HEARTH_FURNITURE_SHAPES)) {
      const item = registry.items.get(`item:${shape.id}`)!;
      expect(item.combat).toBeUndefined(); expect(item.modifiers).toBeUndefined();
    }
  });
});
