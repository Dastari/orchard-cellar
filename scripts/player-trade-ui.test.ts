import { describe, expect, it } from 'vitest';
import { BASE_BACKPACK_CAPACITY, EQUIPMENT_SLOT_OFFSET } from '@orchard/sim';
import type { Identity } from 'spacetimedb';
import { TradeUi, type TradeUiModel } from '../packages/ui/src/trade-ui.js';
import type { UiKitArt } from '../packages/ui/src/kit/components/art.js';
import type { OverworldUiItemArt } from '../packages/ui/src/overworld-ui.js';
import { tradeHarness } from './player-trade-test-harness.js';

/** Real retained gestures -> current production reducers under two distinct
 * authorized identities. The existing in-memory table adapter supplies rollback;
 * no server transport, JWT verification, subscription delivery or live writes. */
function client(h: ReturnType<typeof tradeHarness>, identity: Identity) {
  const errors: string[] = [], commands: string[] = [];
  const run = (name: Parameters<typeof h.run>[0], args: Record<string, unknown>) => {
    commands.push(name);
    try { h.run(name, identity, args); } catch (error) { errors.push(String(error)); }
  };
  const ui = new TradeUi({} as UiKitArt, {} as OverworldUiItemArt, {
    acceptRequest: tradeId => run('acceptTradeRequest', { tradeId }),
    declineRequest: tradeId => run('declineTrade', { tradeId }), cancel: tradeId => run('cancelTrade', { tradeId }),
    offerItem: (tradeId, inventorySlot, tradeSlot, quantity) => run('setTradeOfferItem', { tradeId, inventorySlot, tradeSlot, quantity }),
    removeItem: (tradeId, tradeSlot) => run('removeTradeOfferItem', { tradeId, tradeSlot }),
    offerBronze: (tradeId, amount) => run('setTradeOfferBronze', { tradeId, amount }),
    setAccepted: (tradeId, accepted, revision) => run('setTradeAccepted', { tradeId, accepted, revision }),
  });
  const sync = () => {
    const session = h.session(identity);
    const model: TradeUiModel | null = !session ? null : {
      session, contentRegistry: h.registry, identityHex: identity.toHexString(), requesterName: 'Alice', recipientName: 'Bob',
      walletBronze: h.wallets.identity.find(identity)!.balanceBronze,
      offers: h.api.ownTradeOffers(h.context(identity)), backpackSlotCapacity: BASE_BACKPACK_CAPACITY,
      inventorySlots: [...h.inventory.iter()].filter(row => row.identity.isEqual(identity)),
    };
    ui.update(model); ui.root.arrange();
  };
  ui.resize(800, 600); sync();
  const activate = (id: string, key = 'Enter') => {
    const node = ui.root.entries().find(entry => entry.element.id === id)!.element;
    expect(node).toBeDefined(); ui.root.focus.set(node); ui.root.arrange(); ui.root.key({ key });
  };
  return { ui, sync, activate, commands, errors };
}

describe('production TradeUi with two-identity reducer authority', () => {
  it('accepts the real request and exchanges metadata/escrow once through retained gestures', () => {
    const h = tradeHarness(); expect(h.alice.isEqual(h.bob)).toBe(false);
    h.put(h.alice, 0, 'axe', 1, 73, false); h.put(h.bob, 0, 'wood', 12);
    h.run('requestTrade', h.alice, { target: h.bob });
    const alice = client(h, h.alice), bob = client(h, h.bob);
    bob.activate('trade.request.accept'); alice.sync(); bob.sync();
    alice.activate('trade.inventory.slot.0'); bob.activate('trade.inventory.slot.0', 'ContextMenu');
    expect(alice.commands).toEqual(['setTradeOfferItem']); expect(bob.commands).toEqual(['acceptTradeRequest', 'setTradeOfferItem']);
    alice.sync(); bob.sync(); alice.activate('trade.accept'); bob.activate('trade.accept');
    // Successful callback alone does not hide either retained window.
    expect(alice.ui.active).toBe(true); expect(bob.ui.active).toBe(true);
    alice.sync(); bob.sync(); expect(alice.ui.active).toBe(false); expect(bob.ui.active).toBe(false);
    expect(h.owned(h.alice)).toMatchObject([{ itemKind: 'wood', quantity: 1 }]);
    expect(h.owned(h.bob).find(row => row.itemKind === 'axe')).toMatchObject({ quantity: 1, durability: 73, lit: false });
    expect(h.owned(h.bob).find(row => row.itemKind === 'wood')?.quantity).toBe(11);
    expect([...h.offers.iter()]).toHaveLength(0); expect([...alice.errors, ...bob.errors]).toEqual([]);
    alice.ui.dispose(); bob.ui.dispose();
  });

  it('exposes reducer rejection for a stale subscription without optimistic acceptance or lost escrow', () => {
    const h = tradeHarness(); h.put(h.alice, 0, 'wood', 3); h.put(h.bob, 0, 'stone', 4); h.start();
    const alice = client(h, h.alice), bob = client(h, h.bob);
    bob.activate('trade.inventory.slot.0'); // Alice has not received the revised subscription yet.
    alice.activate('trade.accept'); expect(alice.errors[0]).toContain('trade_offer_changed');
    expect(h.session()?.requesterAccepted).toBe(false); expect([...h.offers.iter()]).toHaveLength(1);
    expect(alice.ui.active).toBe(true); alice.sync(); alice.activate('trade.accept');
    expect(h.session()?.requesterAccepted).toBe(true); expect(alice.commands).toHaveLength(2);
    alice.ui.dispose(); bob.ui.dispose();
  });

  it('retains full-inventory escrow after refusal and cancels it safely to overflow', () => {
    const h = tradeHarness(); h.put(h.alice, 0, 'axe', 1, 55, false); h.start();
    const alice = client(h, h.alice), bob = client(h, h.bob);
    alice.activate('trade.inventory.slot.0'); h.fill(h.bob); alice.sync(); bob.sync();
    alice.activate('trade.accept'); bob.activate('trade.accept');
    expect(bob.errors[0]).toContain('trade_inventory_full'); expect([...h.offers.iter()]).toHaveLength(1);
    expect(alice.ui.active).toBe(true); expect(bob.ui.active).toBe(true);
    h.fill(h.alice); alice.sync(); alice.activate('trade.cancel'); alice.sync(); bob.sync();
    expect(h.session()).toBeUndefined(); expect([...h.offers.iter()]).toHaveLength(0);
    expect([...h.overflow.iter()]).toMatchObject([{ itemKind: 'axe', quantity: 1, durability: 55, lit: false }]);
    alice.ui.dispose(); bob.ui.dispose();
  });

  it('does not offer equipped slots (BUG-018) and closes from real disconnect cleanup', () => {
    const h = tradeHarness(); h.put(h.alice, EQUIPMENT_SLOT_OFFSET, 'axe', 1); h.put(h.alice, 0, 'wood', 5);
    const tradeId = h.start(); const alice = client(h, h.alice);
    expect(alice.ui.root.entries().some(entry => entry.element.id === `trade.inventory.slot.${EQUIPMENT_SLOT_OFFSET}`)).toBe(false);
    expect(() => h.run('setTradeOfferItem', h.alice, { tradeId, inventorySlot: EQUIPMENT_SLOT_OFFSET, tradeSlot: 0, quantity: 1 })).toThrow('trade_slot_inaccessible');
    alice.activate('trade.inventory.slot.0'); alice.sync();
    h.run('onDisconnect', h.alice); alice.sync(); expect(alice.ui.active).toBe(false);
    expect(h.owned(h.alice).find(row => row.itemKind === 'wood')?.quantity).toBe(5);
    expect(alice.commands).toEqual(['setTradeOfferItem']); expect(alice.errors).toEqual([]); alice.ui.dispose();
  });
});
