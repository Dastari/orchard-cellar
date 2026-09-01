import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyTickUpdateCounters, recordTickRowTouch } from './scalability.js';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('docs/53 T4 indexed caller views', () => {
  it('indexes online, trade, homestead, chat, and speech view candidates', () => {
    const online = sourceBetween('export const onlinePlayerPublic =', 'export const ownStats =');
    expect(online.match(/player_public\.by_online\.filter\(true\)/g)).toHaveLength(2);
    expect(online).toContain('player_appearance.identity.find(profile.identity)');

    const trade = sourceBetween('function tradeForPlayer(', 'function requireTradeParticipant(');
    expect(trade).toContain('player_trade_session.by_requester.filter(identity)');
    expect(trade).toContain('player_trade_session.by_recipient.filter(identity)');

    const homestead = sourceBetween('export const ownHomesteadUpgrades =', 'export const ownMembership =');
    expect(homestead.match(/homesteadForOwner\(ctx, ctx\.sender\)/g)).toHaveLength(2);
    expect(homestead).toContain('homestead_guest.by_guest.filter(ctx.sender)');

    const chat = sourceBetween('export const visibleChatMessages =', 'export const visibleWorldSpeech =');
    expect(chat).toContain('chat_message.by_conversation.filter(');
    expect(chat).toContain('chat_message.by_sender.filter(ctx.sender)');
    expect(chat).toContain('chat_message.by_recipient.filter(ctx.sender)');

    const speech = sourceBetween('export const visibleWorldSpeech =', '\nexport const ');
    expect(speech).toContain('world_speech.by_space.filter(caller.spaceId)');
  });

  it('contains no full-table iterators in the optimized view and helper bodies', () => {
    for (const [start, end] of [
      ['export const onlinePlayerPublic =', 'export const ownStats ='],
      ['export const ownTradeSession =', 'export const ownEffects ='],
      ['export const ownHomesteadUpgrades =', 'export const ownMembership ='],
      ['export const visibleChatMessages =', '\nexport const '],
      ['function tradeForPlayer(', 'function requireTradeParticipant('],
    ] as const) {
      expect(sourceBetween(start, end), start).not.toContain('.iter()');
    }
  });

  it('reduces a representative evaluation from 111,500 candidate touches to 323', () => {
    const before = emptyTickUpdateCounters();
    recordTickRowTouch(before, undefined, 10_000 + 1_000 + 500 + 100_000);
    const after = emptyTickUpdateCounters();
    recordTickRowTouch(after, undefined, 200 + 2 + 1 + 120);
    expect(before.rowsTouched).toBe(111_500);
    expect(after.rowsTouched).toBe(323);
  });
});
