import { describe, expect, it } from 'vitest';
import {
  canJoinChatChannel,
  channelConversationKey,
  chatMembershipId,
  normalizeChatChannelName,
  normalizeChatMessage,
  normalizeMessageOfDay,
  isLegacyPersistentLifecycleMessage,
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
    expect(isLegacyPersistentLifecycleMessage('system')).toBe(true);
    expect(isLegacyPersistentLifecycleMessage('channel')).toBe(false);
    expect(isLegacyPersistentLifecycleMessage('whisper')).toBe(false);
  });
});
