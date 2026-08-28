import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function reducerSource(name: string): string {
  const start = source.indexOf(`export const ${name} =`);
  const end = source.indexOf('\nexport const ', start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return source.slice(start, end < 0 ? source.length : end);
}

describe('Minecraft-style inventory cursor authority', () => {
  it('stores carried stacks privately and exposes only the caller-filtered view', () => {
    const table = source.slice(source.indexOf('const inventory_cursor = table('), source.indexOf('const inventory_migration = table('));
    expect(table).toContain("name: 'inventory_cursor'");
    expect(table).not.toContain('public: true');
    expect(source).toContain("name: 'own_inventory_cursor', public: true");
    expect(source).toContain('ctx.db.inventory_cursor.identity.find(ctx.sender)');
  });

  it('uses shared pure rules after authorization and re-resolves open menu reach', () => {
    for (const [name, authority] of [
      ['inventoryCursorClick', 'clickContainerSlot('],
      ['inventoryCursorQuickCraft', 'quickCraftCursorStack('],
      ['inventoryCursorPickupAll', 'pickupAllToCursor('],
      ['quickMoveMenuItem', 'quickMoveItemStack('],
      ['quickMoveAllMenuItems', 'quickMoveAllMatchingStacks('],
      ['sortMenuContainer', 'sortAndStackContainer('],
    ] as const) {
      const reducer = reducerSource(name);
      expect(reducer.indexOf('requireAuthorizedSender('), name).toBeLessThan(reducer.indexOf('loadOpenMenuInventory('));
      expect(reducer).toContain(authority);
      expect(reducer).toContain('writeOpenMenuInventory(');
    }
    expect(source).toContain('chest.spaceId === position.spaceId');
    expect(source).toContain('chestWithinReach(position.x, position.y, chest)');
    expect(source).toContain('placeable.spaceId === position.spaceId');
    const sort = reducerSource('sortMenuContainer');
    expect(sort).toContain("container !== 'backpack' && container !== 'chest' && container !== 'placeable'");
    expect(sort).toContain("throw new SenderError('inventory_cursor_not_empty')");
  });

  it('returns cursor custody to inventory or overflow on close and disconnect', () => {
    const recovery = source.slice(source.indexOf('function returnInventoryCursorToStorage('), source.indexOf('export const moveInventoryItem ='));
    expect(recovery).toContain("toContainers: ['hotbar', 'backpack']");
    expect(recovery).toContain('stashOverflow(ctx, identity');
    expect(recovery).toContain('writePlayerInventoryCursor(ctx, identity, null)');
    expect(source.slice(source.indexOf('export const onDisconnect ='), source.indexOf('export const requestLastConnections =')))
      .toContain('returnInventoryCursorToStorage(ctx, ctx.sender)');
  });

  it('crafts normal output onto the cursor and shift output across full inventory capacity', () => {
    const craft = reducerSource('craftInventoryRecipe');
    expect(craft).toContain('const originalCursor = playerInventoryCursor(ctx, ctx.sender)');
    expect(craft).toContain('if (craftAll)');
    expect(craft).toContain("toContainers: ['hotbar', 'backpack']");
    expect(craft).toContain('writePlayerInventoryCursor(ctx, ctx.sender, cursor)');
    expect(craft).not.toContain('craftedQuantity + consumed.crafted.quantity > maximum');
    expect(craft.indexOf('quickMoveItemStack(')).toBeLessThan(craft.indexOf('results = {'));
  });
});
