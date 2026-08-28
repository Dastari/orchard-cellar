import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing source marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('unique quest item reducer policy', () => {
  it('rejects every world-drop path before it writes inventory or a drop', () => {
    const menuDrop = sourceBetween('export const throwMenuItem', 'function dropCursorStack');
    expect(menuDrop).toContain('requireAuthorizedSender');
    expect(menuDrop).toContain("throw new SenderError('item_not_droppable')");
    expect(menuDrop.indexOf('isUniqueQuestItemKind')).toBeLessThan(menuDrop.indexOf('writeOpenMenuInventory'));

    const cursorDrop = sourceBetween('function dropCursorStack', 'function returnInventoryCursorToStorage');
    expect(cursorDrop).toContain("throw new SenderError('item_not_droppable')");
    expect(cursorDrop.indexOf('isUniqueQuestItemKind')).toBeLessThan(cursorDrop.indexOf('dropWorldItemStack'));

    const selectedDrop = sourceBetween('export const dropSelected', 'export const pickupWorldItem');
    expect(selectedDrop).toContain('requireAuthorizedSender');
    expect(selectedDrop).toContain("throw new SenderError('item_not_droppable')");
    expect(selectedDrop.indexOf('isUniqueQuestItemKind')).toBeLessThan(selectedDrop.indexOf('inventory_slot.id.update'));
  });

  it('rejects direct trades and new shared-storage deposits before writes', () => {
    const trade = sourceBetween('export const setTradeOfferItem', 'export const removeTradeOfferItem');
    expect(trade).toContain('requireActiveTrade');
    expect(trade).toContain("throw new SenderError('item_not_tradeable')");
    expect(trade.indexOf('isUniqueQuestItemKind')).toBeLessThan(trade.indexOf('inventory_slot.id.update'));

    const menuWrite = sourceBetween('function writeOpenMenuInventory', 'function stashOverflow');
    expect(menuWrite).toContain("const sharedContainerIds = ['chest', 'placeable'] as const");
    expect(menuWrite).toContain("throw new SenderError('item_not_tradeable')");
    expect(menuWrite.indexOf('previousUniqueCounts')).toBeLessThan(menuWrite.indexOf('writePlayerInventory'));
  });

  it('refreshes inventory-sensed quests after an authoritative merchant sale', () => {
    const sale = sourceBetween('function sellMerchantCartTransaction', 'export const buyMerchantItem');
    expect(sale).toContain('planMerchantSale');
    expect(sale).toContain('refreshSenderQuestsFromInventory(ctx)');
    expect(sale.indexOf('planMerchantSale')).toBeLessThan(sale.indexOf('writePlayerInventory'));
  });
});
