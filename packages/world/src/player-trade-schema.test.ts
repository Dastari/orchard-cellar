import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function between(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('secure direct player trading', () => {
  it('keeps sessions and escrow private and exposes only participant-owned views', () => {
    const tables = between('const player_trade_session = table(', 'const player_effect = table(');
    const lookup = between('function tradeForPlayer(', 'function requireTradeParticipant(');
    expect(tables).not.toContain('public: true');
    expect(tables).toContain("name: 'player_trade_offer'");
    expect(source).toContain("name: 'own_trade_session', public: true");
    expect(source).toContain("name: 'own_trade_offers', public: true");
    expect(lookup).toContain('player_trade_session.by_requester.filter(identity)');
    expect(lookup).toContain('player_trade_session.by_recipient.filter(identity)');
    expect(lookup).not.toContain('player_trade_session.iter()');
    const views = between('export const ownTradeSession =', 'export const ownEffects =');
    expect(views.match(/tradeForPlayer\(ctx, ctx\.sender\)/g)).toHaveLength(2);
    expect(views).not.toContain('player_trade_session.iter()');
  });

  it('validates identity, availability, exclusivity, space, and proximity before requesting', () => {
    const reducer = between('export const requestTrade =', 'export const acceptTradeRequest =');
    expect(reducer).toContain('requireAuthorizedSender');
    expect(reducer).toContain("throw new SenderError('cannot_trade_self')");
    expect(reducer).toContain('tradeForPlayer(ctx, ctx.sender)');
    expect(reducer).toContain('tradeForPlayer(ctx, target)');
    expect(reducer).toContain('requester.spaceId !== recipient.spaceId');
    expect(reducer).toContain('PLAYER_TRADE_REACH_FIXED ** 2');
    const accept = between('export const acceptTradeRequest =', 'export const cancelTrade =');
    expect(accept).toContain('PLAYER_TRADE_REQUEST_TTL_TICKS');
    expect(accept).toContain("throw new SenderError('trade_request_expired')");
  });

  it('moves offered items into escrow and clears both approvals after every offer change', () => {
    const item = between('export const setTradeOfferItem =', 'export const removeTradeOfferItem =');
    const remove = between('export const removeTradeOfferItem =', 'export const setTradeOfferBronze =');
    const money = between('export const setTradeOfferBronze =', 'function completePlayerTrade');
    expect(item).toContain('ctx.db.inventory_slot.id.update');
    expect(item).toContain('ctx.db.player_trade_offer.insert');
    expect(item).toContain('resetTradeAcceptance(ctx, trade)');
    expect(remove).toContain('insertEscrowStacksIntoInventory');
    expect(remove).toContain('resetTradeAcceptance(ctx, trade)');
    expect(money).toContain('resetTradeAcceptance(ctx, trade)');
  });

  it('preflights capacity, revalidates balances, and completes only after both accept', () => {
    const complete = between('function completePlayerTrade', 'export const setTradeAccepted =');
    const accept = between('export const setTradeAccepted =', 'function merchantCartLines');
    expect(complete).toContain("throw new SenderError('insufficient_funds')");
    expect(complete).toContain('insertEscrowStacksIntoInventory(ctx, trade.requester, recipientOffers, false)');
    expect(complete).toContain('insertEscrowStacksIntoInventory(ctx, trade.recipient, requesterOffers, false)');
    expect(complete.indexOf('insertEscrowStacksIntoInventory')).toBeLessThan(complete.indexOf('player_wallet.identity.update'));
    expect(accept).toContain('if (next.requesterAccepted && next.recipientAccepted) completePlayerTrade(ctx, next)');
    expect(accept).toContain("if (trade.revision !== revision) throw new SenderError('trade_offer_changed')");
  });

  it('returns escrow on cancellation, disconnect, range loss, and request expiry', () => {
    const cancel = between('function cancelPlayerTrade', 'function requireActiveTrade');
    expect(cancel).toContain('insertEscrowStacksIntoInventory');
    expect(cancel).toContain('true');
    expect(between('export const onDisconnect =', 'export const createChatChannel ='))
      .toContain('cancelPlayerTrade(ctx, disconnectedTrade)');
    const step = source.slice(source.indexOf('function runOneHertzTickMaintenance('));
    expect(step).toContain('PLAYER_TRADE_REQUEST_TTL_TICKS');
    expect(step).toContain('!tradePlayersWithinReach(ctx, trade)');
  });
});
