import { describe, expect, it } from 'vitest';
import {
  canJoinChatChannel,
  channelConversationKey,
  chatMembershipId,
  normalizeChatChannelName,
  normalizeChatMessage,
  normalizeMessageOfDay,
  isLegacyPersistentLifecycleMessage,
  lastConnectionEventMessage,
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
});
