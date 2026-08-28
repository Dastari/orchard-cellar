import { describe, expect, it } from 'vitest';
import {
  BALANCE_LEADERBOARD_LIMIT,
  LAST_CONNECTION_DEDUPE_WINDOW_MICROS,
  balanceLeaderboardMessage,
  canJoinChatChannel,
  channelConversationKey,
  chatMembershipId,
  normalizeChatChannelName,
  normalizeChatMessage,
  normalizeMessageOfDay,
  isLegacyPersistentLifecycleMessage,
  lastConnectionEventMessage,
  recentConnectionEvents,
  topBalanceLeaderboard,
  validCreatableChatChannelKind,
  whisperConversationKey,
  worldDisconnectMessage,
  worldEntryMessage,
} from './chat-policy.js';

describe('chat policy', () => {
  it('normalizes a single-line Unicode message without accepting empty/control-only content', () => {
    expect(normalizeChatMessage('  Hello\nthere  ')).toBe('Hello there');
    expect(normalizeChatMessage('')).toBeNull();
    expect(normalizeChatMessage('\u0000hidden')).toBeNull();
    expect(normalizeChatMessage('x'.repeat(241))).toBeNull();
  });

  it('creates stable channel names and membership keys', () => {
    expect(normalizeChatChannelName("  Farmer's Market  ")).toEqual({
      name: "Farmer's Market",
      slug: 'farmer-s-market',
    });
    expect(normalizeChatChannelName('x')).toBeNull();
    expect(chatMembershipId(3n, 'abc')).toBe('3:abc');
    expect(channelConversationKey(3n)).toBe('channel:3');
  });

  it('uses the same private conversation key regardless of whisper direction', () => {
    expect(whisperConversationKey('bbb', 'aaa')).toBe('whisper:aaa:bbb');
    expect(whisperConversationKey('aaa', 'bbb')).toBe('whisper:aaa:bbb');
  });

  it('keeps group channels invite-only and reserves General creation', () => {
    expect(canJoinChatChannel('general')).toBe(true);
    expect(canJoinChatChannel('custom')).toBe(true);
    expect(canJoinChatChannel('group')).toBe(false);
    expect(validCreatableChatChannelKind('custom')).toBe(true);
    expect(validCreatableChatChannelKind('group')).toBe(true);
    expect(validCreatableChatChannelKind('general')).toBe(false);
  });

  it('normalizes the MOTD and formats session-only lifecycle notices', () => {
    expect(normalizeMessageOfDay('  Welcome\n farmers!  ')).toBe('Welcome farmers!');
    expect(normalizeMessageOfDay('')).toBeNull();
    expect(normalizeMessageOfDay('x'.repeat(241))).toBeNull();
    expect(worldEntryMessage('Toby')).toBe('Toby entered the world.');
    expect(worldDisconnectMessage('Toby')).toBe('Toby disconnected.');
    expect(lastConnectionEventMessage(
      'Toby', 'connected', '2026-08-27T06:15:30.123456Z',
    )).toBe('Toby logged in — 2026-08-27 06:15:30 UTC');
    expect(lastConnectionEventMessage(
      'Nathan', 'lease_expired', '2026-08-27T07:00:00.000000Z',
    )).toBe('Nathan logged out — 2026-08-27 07:00:00 UTC');
    expect(isLegacyPersistentLifecycleMessage('system')).toBe(true);
    expect(isLegacyPersistentLifecycleMessage('channel')).toBe(false);
    expect(isLegacyPersistentLifecycleMessage('whisper')).toBe(false);
  });

  it('deduplicates the same connection action within five seconds', () => {
    const second = 1_000_000n;
    const recent = recentConnectionEvents([
      { id: 1n, identityHex: 'a', eventKind: 'connected', occurredAtMicros: 3n * second },
      { id: 2n, identityHex: 'b', eventKind: 'connected', occurredAtMicros: 5n * second },
      { id: 3n, identityHex: 'a', eventKind: 'connected', occurredAtMicros: 6n * second },
      { id: 4n, identityHex: 'a', eventKind: 'connected', occurredAtMicros: 9n * second },
      { id: 5n, identityHex: 'a', eventKind: 'lease_expired', occurredAtMicros: 10n * second },
      { id: 6n, identityHex: 'a', eventKind: 'disconnected', occurredAtMicros: 12n * second },
      { id: 7n, identityHex: 'a', eventKind: 'ignored', occurredAtMicros: 13n * second },
    ]);
    expect(LAST_CONNECTION_DEDUPE_WINDOW_MICROS).toBe(5n * second);
    expect(recent.map(({ id }) => id)).toEqual([6n, 4n, 2n, 1n]);
    expect(recentConnectionEvents(Array.from({ length: 20 }, (_, index) => ({
      id: BigInt(index),
      identityHex: `player-${index}`,
      eventKind: 'connected',
      occurredAtMicros: BigInt(index) * second,
    })))).toHaveLength(12);
  });

  it('ranks only the ten richest wallets with stable ties and coin formatting', () => {
    const ranked = topBalanceLeaderboard([
      ...Array.from({ length: BALANCE_LEADERBOARD_LIMIT }, (_, index) => ({
        identityHex: `player-${index}`,
        displayName: `Player ${index}`,
        balanceBronze: BigInt(index) * 10_000n,
      })),
      { identityHex: 'z-tie', displayName: 'Zed', balanceBronze: 200_000n },
      { identityHex: 'a-tie', displayName: 'Ada', balanceBronze: 200_000n },
    ]);
    expect(ranked).toHaveLength(10);
    expect(ranked.slice(0, 2).map(({ displayName }) => displayName)).toEqual(['Ada', 'Zed']);
    expect(ranked.some(({ displayName }) => displayName === 'Player 0')).toBe(false);
    expect(balanceLeaderboardMessage(1, {
      identityHex: 'ada', displayName: 'Ada', balanceBronze: 50_403n,
    })).toBe('1. Ada — 5G 4S 3C');
  });
});
