import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, HEARTH_FURNITURE_SHAPES, TILE_SIZE_FIXED,
  type HearthFurniturePlacementContext, type HearthFurniturePlacement } from '@orchard/sim';
import { furnitureAtTile, furnishingPreview, furniturePickupFailure } from './hearth-furnishing.js';
const registry = bootstrapContentRegistry();
const table: HearthFurniturePlacement = { id: '1', tileX: 5, tileY: 5, shape: HEARTH_FURNITURE_SHAPES.furniture_rustic_dining_table! };
const position = { x: 6.5 * TILE_SIZE_FIXED, y: 7.5 * TILE_SIZE_FIXED };
function room(): HearthFurniturePlacementContext {
  return { canBuild: true, collision: { width: 16, height: 16,
    blocked: Array.from({ length: 256 }, (_, i) => i < 16 || i >= 240 || i % 16 === 0 || i % 16 === 15) },
    existing: [table], reserved: [{ tileX: 8, tileY: 12 }], exit: { tileX: 8, tileY: 12 }, occupants: [position] };
}
describe('furnishing controls', () => {
  it('excludes the moving footprint while retaining attachment constraints', () => {
    expect(furnishingPreview(registry, room(), position, 'furniture_rustic_dining_table', 5, 5, 1, '1').failure).toBeNull();
    const lamp = { id: '2', tileX: 5, tileY: 4, supportId: '1', shape: HEARTH_FURNITURE_SHAPES.furniture_townhouse_table_lamp! };
    const context = { ...room(), existing: [table, lamp] };
    expect(furnishingPreview(registry, context, position, 'furniture_rustic_dining_table', 5, 5, 1, '1').failure).toMatch(/attached/);
    const moved = furnishingPreview(registry, context, position, 'furniture_townhouse_table_lamp', 6, 4, 1, '2');
    expect(moved.failure).toBeNull(); expect(moved.candidate?.supportId).toBe('1');
  });
  it('infers actual tabletop support and rejects its leg row', () => {
    const preview = furnishingPreview(registry, room(), position, 'furniture_townhouse_table_lamp', 5, 4, 1);
    expect(preview.failure).toBeNull(); expect(preview.candidate?.supportId).toBe('1');
    expect(furnishingPreview(registry, room(), position, 'furniture_townhouse_table_lamp', 5, 5, 1).failure).toBe('Choose a tabletop');
  });
  it('selects attachments before their support and standing furniture before a rug', () => {
    const lamp: HearthFurniturePlacement = { id: '2', tileX: 5, tileY: 4, supportId: '1', shape: HEARTH_FURNITURE_SHAPES.furniture_townhouse_table_lamp! };
    const rug: HearthFurniturePlacement = { id: '3', tileX: 5, tileY: 5, shape: HEARTH_FURNITURE_SHAPES.furniture_rustic_woven_rug! };
    expect(furnitureAtTile([rug, table, lamp], 5, 4)?.id).toBe('2');
    expect(furnitureAtTile([rug, table], 5, 4)?.id).toBe('1');
    expect(furnitureAtTile([rug], 5, 4)?.id).toBe('3');
    expect(furnitureAtTile([rug], 10, 10)).toBeNull();
  });
  it('explains inventory, role, overlap, occupant and reserved approach failures', () => {
    expect(furnishingPreview(registry, room(), position, 'furniture_rustic_chair', 4, 7, 0).failure).toMatch(/bag/);
    expect(furnishingPreview(registry, { ...room(), canBuild: false }, position, 'furniture_rustic_chair', 4, 7, 1).failure).toMatch(/Builder/);
    expect(furnishingPreview(registry, room(), position, 'furniture_rustic_chair', 5, 5, 1).failure).toBe('Furniture overlaps');
    expect(furnishingPreview(registry, { ...room(), occupants: [{ x: 6.5 * TILE_SIZE_FIXED, y: 8.25 * TILE_SIZE_FIXED }] },
      position, 'furniture_rustic_chair', 6, 7, 1).failure).toBe('Someone is standing here');
    expect(furnishingPreview(registry, { ...room(), reserved: [{ tileX: 4, tileY: 7 }] }, position, 'furniture_rustic_chair', 4, 7, 1).failure).toBe('Keep the doorway clear');
  });
  it('rejects remote placement and placement through fixed geometry', () => {
    expect(furnishingPreview(registry, room(), position, 'furniture_rustic_chair', 12, 7, 1).failure).toMatch(/closer/);
    const context = room(), blocked = [...context.collision.blocked];
    for (let y = 1; y < 15; y++) blocked[y * 16 + 5] = true;
    expect(furnishingPreview(registry, { ...context, collision: { ...context.collision, blocked } }, position, 'furniture_rustic_chair', 4, 7, 1).failure).toMatch(/clear approach/);
  });
  it('explains known pickup failures without promising that private storage or inventory is available', () => {
    const lamp = { id: '2', tileX: 5, tileY: 4, supportId: '1', shape: HEARTH_FURNITURE_SHAPES.furniture_townhouse_table_lamp! };
    expect(furniturePickupFailure(table, [table, lamp], position, room().collision, false)).toMatch(/attached/);
    expect(furniturePickupFailure(table, [table], position, room().collision, true)).toMatch(/Close/);
    expect(furniturePickupFailure({ ...table, tileX: 14 }, [table], position, room().collision, false)).toMatch(/closer/);
    expect(furniturePickupFailure(lamp, [table, lamp], position, room().collision, false)).toBeNull();
  });
  it('rejects content revisions that the authority cannot preserve', () => {
    const id = 'item:furniture_rustic_chair', item = registry.items.get(id)!;
    const durable = { ...registry, items: new Map([...registry.items, [id, { ...item,
      durability: { max: 100, repairMaterial: 'item:wood' as const, repairCost: 1 } }]]) };
    expect(furnishingPreview(durable, room(), position, 'furniture_rustic_chair', 4, 7, 1).candidate).toBeNull();
    const retired = { ...registry, items: new Map([...registry.items, [id, { ...item, retired: true }]]) };
    expect(furnishingPreview(retired, room(), position, 'furniture_rustic_chair', 4, 7, 1).candidate).toBeNull();
  });
});
