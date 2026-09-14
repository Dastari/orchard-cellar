import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const world = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/overworld-main.ts', import.meta.url), 'utf8');
const npcUi = readFileSync(new URL('../../ui/src/npc-interaction-ui.ts', import.meta.url), 'utf8');

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('active-registry commerce and equipment policy authority', () => {
  it('selects purchase requirements and durable grants without exact item ids', () => {
    const purchase = between(world, 'function purchaseMerchantCart(', '/** Sales remove');
    expect(purchase).toContain('runtimeItemPurchaseRequirement(registry, line.itemKind)');
    expect(purchase).toContain("runtimeItemPurchaseGrant(registry, line.itemKind) === 'homestead_claim'");
    expect(purchase).toContain('planMerchantPurchase(');
    expect(purchase).not.toContain("line.itemKind === 'sprinkler'");
    expect(purchase).not.toContain("line.itemKind === 'homestead_deed'");
  });

  it('selects premium lines and drop denial from authored policy while preserving reducer math', () => {
    const sale = between(world, 'function sellMerchantCartTransaction(', 'export const buyMerchantItem');
    const drop = between(world, 'export const dropSelected', 'export const pickupWorldItem');
    expect(sale).toContain("runtimeItemSalePremium(registry, line.itemKind) !== 'estate_vintage'");
    expect(sale).toContain('planned.totalBronze + vintagePremium');
    expect(sale).not.toContain("line.itemKind === 'bottles'");
    expect(drop).toContain('runtimeItemIsDroppable(contentRegistry(ctx), slot.itemKind)');
    expect(drop).not.toContain("slot.itemKind === 'homestead_deed'");
  });

  it('derives carried capacity and client sale visibility from active definitions', () => {
    const inventory = between(world, 'function equippedInventoryCapacity(', 'function playerDebugBackpackSlots(');
    expect(inventory).toContain('runtimeItemInventoryCapacity(contentRegistry(ctx), row.itemKind)');
    expect(world).not.toContain('inventoryHasEquippedBackpack(');
    expect(client).toContain('runtimeItemInventoryCapacity(snapshot.content.registry, capacityEquipment.itemKind)');
    expect(client).not.toContain('inventoryHasEquippedBackpack(');
    expect(npcUi).toContain('?.equip?.inventoryCapacity');
    expect(npcUi).toContain("!tags.includes('trade.unsellable')");
    expect(npcUi).not.toContain("itemKind !== 'homestead_deed'");
  });
});
