import { describe, expect, it } from 'vitest';
import {
  CHAT_FADE_DELAY_MS,
  CHAT_FADE_DURATION_MS,
  chatLineAlpha,
  chatMessagePresentation,
  wrapChatText,
} from './chat-overlay.js';

describe('chat overlay helpers', () => {
  it('keeps recent chat readable before fading it away', () => {
    expect(chatLineAlpha(CHAT_FADE_DELAY_MS, false)).toBe(1);
    expect(chatLineAlpha(CHAT_FADE_DELAY_MS + CHAT_FADE_DURATION_MS / 2, false)).toBe(0.5);
    expect(chatLineAlpha(CHAT_FADE_DELAY_MS + CHAT_FADE_DURATION_MS, false)).toBe(0);
    expect(chatLineAlpha(60_000, true)).toBe(1);
  });

  it('wraps on words and hard-wraps words wider than the chat panel', () => {
    expect(wrapChatText('one two three', 7)).toEqual(['one two', 'three']);
    expect(wrapChatText('abcdefgh', 4)).toEqual(['abcd', 'efgh']);
  });

  it('renders private MOTDs and server entry notices without a fake player name', () => {
    expect(chatMessagePresentation({
      channelName: 'MOTD', senderDisplayName: 'World', kind: 'motd', body: 'Welcome!',
    }).text).toBe('[MOTD] Welcome!');
    expect(chatMessagePresentation({
      channelName: 'General', senderDisplayName: 'World', kind: 'system', body: 'Toby entered the world.',
    }).text).toBe('[General] Toby entered the world.');
    expect(chatMessagePresentation({
      channelName: 'Whisper', senderDisplayName: 'Nathan', kind: 'whisper', body: 'Hello',
    }).text).toBe('[From Nathan] Hello');
    expect(chatMessagePresentation({
      channelName: 'Whisper', senderDisplayName: 'Nathan', kind: 'whisper_outgoing', body: 'Hello',
    }).text).toBe('[To Nathan] Hello');
  });
});
