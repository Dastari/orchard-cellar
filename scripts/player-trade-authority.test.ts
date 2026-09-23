import { describe, expect, it } from 'vitest';
import { EQUIPMENT_SLOT_OFFSET, TILE_SIZE_FIXED } from '@orchard/sim';
import { tradeHarness } from './player-trade-test-harness.js';

describe('two-identity production trade reducer integration', () => {
  it('exchanges escrow and bronze exactly once, preserving item metadata and private views', () => {
    const h = tradeHarness();
    expect(h.alice.isEqual(h.bob)).toBe(false);
    h.put(h.alice, 0, 'axe', 1, 73, false); h.put(h.bob, 0, 'wood', 12);
    const tradeId = h.start();
    h.run('setTradeOfferItem', h.alice, { tradeId, inventorySlot: 0, tradeSlot: 0, quantity: 1 });
    h.run('setTradeOfferItem', h.bob, { tradeId, inventorySlot: 0, tradeSlot: 0, quantity: 4 });
    h.run('setTradeOfferBronze', h.alice, { tradeId, amount: 30n });
    h.run('setTradeOfferBronze', h.bob, { tradeId, amount: 5n });
    expect(h.owned(h.alice)).toEqual([]);
    expect(h.api.ownTradeOffers(h.context(h.alice))).toHaveLength(2);
    expect(h.api.ownTradeOffers(h.context(h.bob))).toEqual(h.api.ownTradeOffers(h.context(h.alice)));
    expect(h.api.ownTradeOffers(h.context(h.outsider))).toEqual([]);
    expect(h.session(h.outsider)).toBeUndefined();
    const revision = h.session()!.revision;
    h.run('setTradeAccepted', h.alice, { tradeId, accepted: true, revision });
    expect(h.session()?.requesterAccepted).toBe(true);
    expect(h.wallets.identity.find(h.alice)?.balanceBronze).toBe(100n);
    h.run('setTradeAccepted', h.bob, { tradeId, accepted: true, revision });
    expect(h.session()).toBeUndefined(); expect([...h.offers.iter()]).toEqual([]);
    expect(h.owned(h.alice)).toMatchObject([{ itemKind: 'wood', quantity: 4 }]);
    expect(h.owned(h.bob).find(row => row.itemKind === 'axe')).toMatchObject({ quantity: 1, durability: 73, lit: false });
    expect(h.owned(h.bob).find(row => row.itemKind === 'wood')?.quantity).toBe(8);
    expect(h.wallets.identity.find(h.alice)?.balanceBronze).toBe(75n);
    expect(h.wallets.identity.find(h.bob)?.balanceBronze).toBe(125n);
    const committed = h.snapshot();
    expect(() => h.run('setTradeAccepted', h.bob, { tradeId, accepted: true, revision })).toThrow('trade_not_found');
    expect(h.snapshot()).toEqual(committed);
  });

  it('invalidates both approvals after an offer changes and rejects a stale acceptance revision', () => {
    const h = tradeHarness(), tradeId = h.start(), revision = h.session()!.revision;
    h.run('setTradeAccepted', h.alice, { tradeId, accepted: true, revision });
    h.run('setTradeOfferBronze', h.bob, { tradeId, amount: 10n });
    expect(h.session()).toMatchObject({ requesterAccepted: false, recipientAccepted: false, revision: revision + 1n });
    const before = h.snapshot();
    expect(() => h.run('setTradeAccepted', h.alice, { tradeId, accepted: true, revision })).toThrow('trade_offer_changed');
    expect(h.snapshot()).toEqual(before);
  });

  it('returns the recipient cursor before accepting and prevents overlapping sessions', () => {
    const h = tradeHarness();
    h.run('requestTrade', h.alice, { target: h.bob });
    const tradeId = h.session()!.id;
    h.cursors.insert({ identity: h.bob, itemKind: 'wood', quantity: 4, durability: 0, lit: true });
    const before = h.snapshot();
    expect(() => h.run('acceptTradeRequest', h.alice, { tradeId })).toThrow('trade_request_not_pending');
    expect(() => h.run('requestTrade', h.outsider, { target: h.bob })).toThrow('player_already_trading');
    expect(h.snapshot()).toEqual(before);
    h.run('acceptTradeRequest', h.bob, { tradeId });
    expect(h.cursors.identity.find(h.bob)).toBeNull();
    expect(h.owned(h.bob)).toMatchObject([{ itemKind: 'wood', quantity: 4 }]);
    expect(h.session()?.state).toBe('active');
  });

  it.each(['range', 'space', 'offline'] as const)('rejects active %s loss before either participant can change custody', reason => {
    const h = tradeHarness(); h.put(h.alice, 0, 'wood', 9);
    const tradeId = h.start(), position = h.positions.identity.find(h.bob)!;
    if (reason === 'range') h.positions.identity.update({ ...position, x: position.x + 10 * TILE_SIZE_FIXED });
    else if (reason === 'space') h.positions.identity.update({ ...position, spaceId: position.spaceId + 1 });
    else h.publicPlayers.identity.update({ identity: h.bob, online: false });
    const before = h.snapshot();
    expect(() => h.run('setTradeOfferItem', h.alice, { tradeId, inventorySlot: 0, tradeSlot: 0, quantity: 1 })).toThrow('trade_out_of_range');
    expect(() => h.run('setTradeAccepted', h.bob, { tradeId, accepted: true, revision: h.session()!.revision })).toThrow('trade_out_of_range');
    expect(h.snapshot()).toEqual(before);
    h.run('cancelTrade', h.alice, { tradeId });
    expect(h.session()).toBeUndefined();
  });

  it('rejects wallet overflow without committing either side', () => {
    const h = tradeHarness(), tradeId = h.start();
    h.wallets.identity.update({ identity: h.bob, balanceBronze: (1n << 64n) - 1n });
    h.run('setTradeOfferBronze', h.alice, { tradeId, amount: 1n });
    const revision = h.session()!.revision;
    h.run('setTradeAccepted', h.alice, { tradeId, accepted: true, revision });
    const before = h.snapshot();
    expect(() => h.run('setTradeAccepted', h.bob, { tradeId, accepted: true, revision })).toThrow('wallet_overflow');
    expect(h.snapshot()).toEqual(before);
  });

  it('rolls back the first recipient write when the second recipient inventory is full', () => {
    const h = tradeHarness(); h.put(h.alice, 0, 'axe', 1, 73); h.put(h.bob, 0, 'wood', 4);
    const tradeId = h.start();
    for (const sender of [h.alice, h.bob]) h.run('setTradeOfferItem', sender, { tradeId, inventorySlot: 0, tradeSlot: 0, quantity: sender.isEqual(h.alice) ? 1 : 4 });
    h.fill(h.bob);
    const revision = h.session()!.revision;
    h.run('setTradeAccepted', h.alice, { tradeId, accepted: true, revision });
    const before = h.snapshot(), writeStart = h.writes.length;
    expect(() => h.run('setTradeAccepted', h.bob, { tradeId, accepted: true, revision })).toThrow('trade_inventory_full');
    // Proves failure occurred after production wrote Alice's received wood,
    // rather than exercising only an early no-write validation branch.
    expect(h.writes.slice(writeStart)).toContainEqual({ table: 'inventory_slot', key: `${h.alice.toHexString()}:0` });
    expect(h.snapshot()).toEqual(before);
    expect(h.api.ownTradeOffers(h.context(h.alice))).toHaveLength(2);
  });

  it('revalidates the earlier accepting player balance at settlement without losing escrow', () => {
    const h = tradeHarness(); h.put(h.alice, 0, 'wood', 9);
    const tradeId = h.start();
    h.run('setTradeOfferItem', h.alice, { tradeId, inventorySlot: 0, tradeSlot: 0, quantity: 4 });
    h.run('setTradeOfferBronze', h.alice, { tradeId, amount: 80n });
    const revision = h.session()!.revision;
    h.run('setTradeAccepted', h.alice, { tradeId, accepted: true, revision });
    h.wallets.identity.update({ identity: h.alice, balanceBronze: 20n });
    const before = h.snapshot();
    expect(() => h.run('setTradeAccepted', h.bob, { tradeId, accepted: true, revision })).toThrow('insufficient_funds');
    expect(h.snapshot()).toEqual(before);
    h.run('cancelTrade', h.bob, { tradeId });
    expect(h.owned(h.alice)).toMatchObject([{ itemKind: 'wood', quantity: 9 }]);
    expect(h.wallets.identity.find(h.alice)?.balanceBronze).toBe(20n);
  });

  it('keeps full-inventory cancellations in owner-specific durable overflow', () => {
    const h = tradeHarness(); h.put(h.alice, 0, 'axe', 1, 73, false);
    const tradeId = h.start();
    h.run('setTradeOfferItem', h.alice, { tradeId, inventorySlot: 0, tradeSlot: 0, quantity: 1 });
    h.fill(h.alice); h.run('cancelTrade', h.bob, { tradeId });
    const overflow = [...h.overflow.iter()];
    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toMatchObject({ identity: h.alice, itemKind: 'axe', quantity: 1, durability: 73, lit: false });
    expect(h.session()).toBeUndefined(); expect([...h.offers.iter()]).toEqual([]);
  });

  it('executes disconnect escrow recovery and exposes recovered state to a new connection', () => {
    const h = tradeHarness(); h.put(h.alice, 0, 'wood', 9);
    const tradeId = h.start();
    h.run('setTradeOfferItem', h.alice, { tradeId, inventorySlot: 0, tradeSlot: 0, quantity: 4 });
    h.cursors.insert({ identity: h.bob, itemKind: 'stone', quantity: 2, durability: 0, lit: true });
    h.run('onDisconnect', h.bob);
    expect(h.owned(h.alice)).toMatchObject([{ itemKind: 'wood', quantity: 9 }]);
    expect(h.owned(h.bob)).toMatchObject([{ itemKind: 'stone', quantity: 2 }]);
    expect(h.cursors.identity.find(h.bob)).toBeNull();
    const reconnected = h.context(h.alice, '2');
    expect(h.api.ownTradeSession(reconnected)).toBeUndefined();
    expect(h.api.ownTradeOffers(reconnected)).toEqual([]);
    h.run('requestTrade', reconnected, { target: h.bob });
    expect(h.session()?.state).toBe('requested');
  });

  it('rejects unrelated identities, occupied offers, equipment and forbidden items without writes', () => {
    const h = tradeHarness(); h.put(h.alice, 0, 'wood', 9); h.put(h.alice, 1, 'marlow_book', 1);
    const tradeId = h.start();
    h.run('setTradeOfferItem', h.alice, { tradeId, inventorySlot: 0, tradeSlot: 0, quantity: 1 });
    const before = h.snapshot();
    expect(() => h.run('cancelTrade', h.outsider, { tradeId })).toThrow('trade_not_participant');
    expect(() => h.run('setTradeOfferItem', h.outsider, { tradeId, inventorySlot: 0, tradeSlot: 0, quantity: 1 })).toThrow('trade_not_participant');
    expect(() => h.run('setTradeOfferItem', h.alice, { tradeId, inventorySlot: 0, tradeSlot: 0, quantity: 1 })).toThrow('trade_offer_slot_occupied');
    expect(() => h.run('setTradeOfferItem', h.alice, { tradeId, inventorySlot: EQUIPMENT_SLOT_OFFSET, tradeSlot: 1, quantity: 1 })).toThrow('trade_slot_inaccessible');
    expect(() => h.run('setTradeOfferItem', h.alice, { tradeId, inventorySlot: 1, tradeSlot: 1, quantity: 1 })).toThrow('item_not_tradeable');
    expect(h.snapshot()).toEqual(before);
    h.run('removeTradeOfferItem', h.alice, { tradeId, tradeSlot: 0 });
    expect(h.owned(h.alice).find(row => row.itemKind === 'wood')?.quantity).toBe(9);
  });

  it.each(['anonymous', 'issuer', 'audience', 'missing', 'blocked', 'revoked'] as const)(
    'runs the real authorization policy for %s requests', kind => {
      const h = tradeHarness(), ctx = h.context(h.alice);
      let error: string;
      if (kind === 'anonymous') { ctx.senderAuth.jwt = null; error = 'authentication_required'; }
      else if (kind === 'issuer') { ctx.senderAuth.jwt = { issuer: 'https://invalid.example', audience: ['orchard-web'] }; error = 'authentication_invalid_issuer'; }
      else if (kind === 'audience') { ctx.senderAuth.jwt = { issuer: ctx.senderAuth.jwt!.issuer, audience: ['wrong-client'] }; error = 'authentication_invalid_audience'; }
      else if (kind === 'missing') { h.members.identity.delete(h.alice); error = 'membership_required'; }
      else { h.members.identity.update({ identity: h.alice, role: 'friend', blocked: kind === 'blocked', ...(kind === 'revoked' ? { revokedAt: 1n } : {}) }); error = `membership_${kind}`; }
      const before = h.snapshot();
      expect(() => h.run('requestTrade', ctx, { target: h.bob })).toThrow(error);
      expect(h.snapshot()).toEqual(before);
    },
  );

  it('rejects self-trades, cursor custody conflicts, stale range and expired requests', () => {
    const h = tradeHarness();
    expect(() => h.run('requestTrade', h.alice, { target: h.alice })).toThrow('cannot_trade_self');
    h.cursors.insert({ identity: h.alice, itemKind: 'wood', quantity: 1, durability: 0, lit: true });
    expect(() => h.run('requestTrade', h.alice, { target: h.bob })).toThrow('finish_inventory_action_first');
    h.cursors.identity.delete(h.alice);
    h.run('requestTrade', h.alice, { target: h.bob });
    const tradeId = h.session()!.id;
    const position = h.positions.identity.find(h.bob)!;
    h.positions.identity.update({ ...position, x: position.x + 10 * TILE_SIZE_FIXED });
    expect(() => h.run('acceptTradeRequest', h.bob, { tradeId })).toThrow('trade_out_of_range');
    h.positions.identity.update(position); h.clock.id.update({ id: 0, authorityTick: 100_000n });
    expect(() => h.run('acceptTradeRequest', h.bob, { tradeId })).toThrow('trade_request_expired');
    h.run('declineTrade', h.bob, { tradeId });
    expect(h.session()).toBeUndefined();
  });
});
