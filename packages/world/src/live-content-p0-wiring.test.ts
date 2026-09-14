import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('P0 active-content world wiring', () => {
  it('plans authored admission before new survival custody and leaves reconnect admission skipped', () => {
    const connect = between('export const onConnect =', 'export const onDisconnect =');
    const planning = connect.indexOf('planNewPlayerLoadout(contentRegistry(ctx)');
    expect(planning).toBeGreaterThanOrEqual(0);
    expect(connect).toContain('existingCharacter: !enteringSurvivalWorld');
    expect(connect.indexOf('if (!newPlayerLoadout.ok) throw new SenderError(newPlayerLoadout.code)'))
      .toBeGreaterThan(planning);
    expect(connect.indexOf('ctx.db.player_survival.insert({')).toBeGreaterThan(planning);
    expect(connect.indexOf('ctx.db.inventory_slot.insert({')).toBeGreaterThan(planning);
    expect(connect).toContain('selectedSlot: newPlayerLoadout.selectedSlot');
    expect(connect).toContain('for (const slot of newPlayerLoadout.slots)');
    expect(connect).not.toContain('STARTER_HOTBAR_ITEMS');
    expect(connect).not.toContain('STARTER_ITEM_QUANTITIES');
  });

  it('quotes arbitrary active homestead upgrades before mutating wallet or durable rows', () => {
    const purchase = between(
      'export const purchaseHomesteadUpgrade =',
      'export const removeHomesteadBuildable =',
    );
    const quote = purchase.indexOf('runtimeHomesteadUpgradeQuote(registry, upgradeKind, rank)');
    const walletWrite = purchase.indexOf('ctx.db.player_wallet.identity.update');
    expect(purchase).toContain('runtimeUpgradeDefinition(registry, upgradeKind)');
    expect(purchase).toContain("throw new SenderError('unknown_homestead_upgrade')");
    expect(purchase).toContain("throw new SenderError('homestead_upgrade_maximum')");
    expect(quote).toBeGreaterThanOrEqual(0);
    expect(walletWrite).toBeGreaterThan(quote);
    expect(purchase).toContain('rank: quote.nextRank');
    expect(purchase).toContain('wallet.balanceBronze - quote.costBronze');
    expect(purchase).not.toContain('HOMESTEAD_UPGRADE_DEFINITIONS');
    expect(purchase).not.toContain('homesteadUpgradeCostBronze');
  });

  it('injects one active item policy into admin plans and creatures into loot registration', () => {
    const inventory = between('function executeAdminInventoryMutation(', 'export const adminGiveItems =');
    const objects = between('function executeAdminObjectMutation(', 'export const adminSpawnEntity =');
    for (const mutation of [inventory, objects]) {
      expect(mutation).toContain('itemPolicy: itemContainerContentResolver(contentRegistry(ctx))');
    }
    const bridge = between('function currentWorldBehaviourHandlers(', 'function behaviourItemSnapshot(');
    expect(bridge).toContain('content.registry.resources.values(),');
    expect(bridge).toContain('content.registry.creatures.values(),');
  });

  it('uses active tags and active stack limits at live inventory boundaries', () => {
    expect(source).not.toContain('isUniqueQuestItemKind(');
    expect(source).not.toContain('insertItemStack(');
    expect(source).toContain('runtimeItemHasTag(contentRegistry(ctx), stack.itemKind, UNIQUE_QUEST_ITEM_TAG)');
    expect(source).toContain('insertItemStackPartial(compacted, stack, activeItemContainerContent(ctx))');
    expect(source).toContain('insertItemStackPartial(carried, found, activeItemContainerContent(ctx))');
  });
});
