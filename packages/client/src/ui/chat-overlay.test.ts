import { describe, expect, it, vi } from 'vitest';
import type { PixelUi } from '../render/pixel-ui.js';
import type { UiSkin } from './skin.js';
import {
  CHAT_FADE_DELAY_MS,
  CHAT_FADE_DURATION_MS,
  CHAT_HOVER_SHADE_ALPHA,
  ChatOverlay,
  chatHistoryExpanded,
  chatToggleTooltipText,
  chatOverlayLayout,
  positionedChatOverlayLayout,
  chatToggleButtonRect,
  chatLineAlpha,
  chatMessagePresentation,
  hasUnseenChatMessage,
  storedChatCollapsed,
  wrapChatText,
} from './chat-overlay.js';

function chatInput(): HTMLInputElement & { focus: ReturnType<typeof vi.fn> } {
  return {
    value: '',
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    setSelectionRange: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn() },
  } as unknown as HTMLInputElement & { focus: ReturnType<typeof vi.fn> };
}

describe('chat overlay helpers', () => {
  it('uses a subtle dark hover wash without changing message colors', () => {
    expect(CHAT_HOVER_SHADE_ALPHA).toBeGreaterThan(0.2);
    expect(CHAT_HOVER_SHADE_ALPHA).toBeLessThan(0.4);
  });

  it('keeps recent chat readable before fading it away', () => {
    expect(chatLineAlpha(CHAT_FADE_DELAY_MS, false)).toBe(1);
    expect(chatLineAlpha(CHAT_FADE_DELAY_MS + CHAT_FADE_DURATION_MS / 2, false)).toBe(0.5);
    expect(chatLineAlpha(CHAT_FADE_DELAY_MS + CHAT_FADE_DURATION_MS, false)).toBe(0);
    expect(chatLineAlpha(60_000, true)).toBe(1);
    expect(chatHistoryExpanded(true, false, false)).toBe(false);
    expect(chatHistoryExpanded(true, false, true)).toBe(false);
    expect(chatHistoryExpanded(true, true, false)).toBe(true);
    expect(chatHistoryExpanded(false, false, false)).toBe(false);
    expect(chatHistoryExpanded(false, false, true)).toBe(true);
  });

  it('wraps on words and hard-wraps words wider than the chat panel', () => {
    expect(wrapChatText('one two three', 7)).toEqual(['one two', 'three']);
    expect(wrapChatText('abcdefgh', 4)).toEqual(['abcd', 'efgh']);
  });

  it('renders private MOTDs and session notices without a fake player name', () => {
    expect(chatMessagePresentation({
      channelName: 'MOTD', senderDisplayName: 'World', kind: 'motd', body: 'Welcome!',
    }).text).toBe('[MOTD] Welcome!');
    expect(chatMessagePresentation({
      channelName: 'World', senderDisplayName: 'World', kind: 'system', body: 'Toby entered the world.',
    }).text).toBe('[World] Toby entered the world.');
    expect(chatMessagePresentation({
      channelName: 'Whisper', senderDisplayName: 'Nathan', kind: 'whisper', body: 'Hello',
    }).text).toBe('[From Nathan] Hello');
    expect(chatMessagePresentation({
      channelName: 'Whisper', senderDisplayName: 'Nathan', kind: 'whisper_outgoing', body: 'Hello',
    }).text).toBe('[To Nathan] Hello');
  });

  it('places the collapse button immediately above the left edge of chat', () => {
    expect(chatToggleButtonRect({ x: 5, y: 100, width: 300, height: 70 }))
      .toEqual({ x: 5, y: 75, width: 22, height: 22 });
  });

  it('labels the chat control on pointer devices without faking hover on touch', () => {
    expect(chatToggleTooltipText(true, false)).toBe('CHAT');
    expect(chatToggleTooltipText(false, false)).toBeNull();
    expect(chatToggleTooltipText(true, true)).toBeNull();
  });

  it('restores only an explicitly collapsed chat preference', () => {
    expect(storedChatCollapsed('true')).toBe(true);
    expect(storedChatCollapsed('false')).toBe(false);
    expect(storedChatCollapsed(null)).toBe(false);
    expect(storedChatCollapsed('invalid')).toBe(false);
  });

  it('defers native input focus until pointer release for iOS keyboards', () => {
    const input = chatInput();
    const overlay = new ChatOverlay(
      { panelParchment: { slice: [0, 0, 0, 0] } } as unknown as UiSkin,
      {} as PixelUi,
      input,
      async () => undefined,
      () => undefined,
    );
    const model = {
      width: 480,
      height: 270,
      connected: true,
      canAdministerWorld: false,
      onlinePlayerNames: [],
      replyPlayerName: null,
      messages: [],
      touchControls: true,
    } as const;
    overlay.update(model);
    const target = chatOverlayLayout(model).input;
    expect(overlay.pointerDown({ x: target.x + 2, y: target.y + 2 }, 0)).toBe(true);
    expect(input.focus).not.toHaveBeenCalled();
    expect(overlay.pointerUp()).toBe(true);
    expect(input.focus).toHaveBeenCalledOnce();
  });

  it('clears and suppresses hover while a higher modal owns the canvas', () => {
    const overlay = new ChatOverlay(
      { panelParchment: { slice: [0, 0, 0, 0] } } as unknown as UiSkin,
      {} as PixelUi,
      chatInput(),
      async () => undefined,
      () => undefined,
    );
    const model = {
      width: 480,
      height: 270,
      connected: true,
      canAdministerWorld: false,
      onlinePlayerNames: [],
      replyPlayerName: null,
      messages: [],
      touchControls: false,
    } as const;
    overlay.update(model);
    const history = chatOverlayLayout(model).history;
    overlay.pointerMove({ x: history.x + 4, y: history.y + 4 });
    expect(overlay.isHovered).toBe(true);

    overlay.update({ ...model, interactionBlocked: true });
    expect(overlay.isHovered).toBe(false);
    overlay.pointerMove({ x: history.x + 4, y: history.y + 4 });
    expect(overlay.isHovered).toBe(false);
    expect(overlay.pointerDown({ x: history.x + 4, y: history.y + 4 }, 0)).toBe(false);
    expect(overlay.wheel({ x: history.x + 4, y: history.y + 4 }, 1)).toBe(false);
    expect(overlay.handleGlobalKeyDown({ key: 'Enter', repeat: false } as KeyboardEvent)).toBe(false);
  });

  it('marks only newly arrived chat ids as unseen', () => {
    expect(hasUnseenChatMessage(new Set([1n, 2n]), [{ id: 1n }, { id: 2n }])).toBe(false);
    expect(hasUnseenChatMessage(new Set([1n, 2n]), [{ id: 1n }, { id: 3n }])).toBe(true);
  });

  it('keeps mobile chat above the thumb-control band and software keyboard', () => {
    const controlsReserved = chatOverlayLayout({
      width: 480, height: 270, touchControls: true, keyboardInset: 0,
    }, [8, 8, 8, 8]);
    expect(controlsReserved.input.y + controlsReserved.input.height).toBeLessThanOrEqual(170);
    expect(controlsReserved.visibleLines).toBeGreaterThan(1);

    const keyboardReserved = chatOverlayLayout({
      width: 390, height: 844, touchControls: true, keyboardInset: 330,
    }, [8, 8, 8, 8]);
    expect(keyboardReserved.input.y + keyboardReserved.input.height).toBeLessThanOrEqual(509);
    expect(keyboardReserved.history.y).toBeGreaterThanOrEqual(4);
  });

  it('moves the complete chat composition from the toggle anchor and clamps it safely', () => {
    const base = chatOverlayLayout({ width: 480, height: 270, touchControls: false });
    const moved = positionedChatOverlayLayout(base, { width: 480, height: 270 }, { x: 160, y: 40 });
    const deltaX = moved.toggle.x - base.toggle.x;
    const deltaY = moved.toggle.y - base.toggle.y;
    expect(moved.history.x - base.history.x).toBe(deltaX);
    expect(moved.history.y - base.history.y).toBe(deltaY);
    expect(moved.input.x - base.input.x).toBe(deltaX);
    expect(moved.input.y - base.input.y).toBe(deltaY);

    const clamped = positionedChatOverlayLayout(base, { width: 480, height: 270 }, { x: 999, y: 999 });
    expect(clamped.history.x + clamped.history.width).toBeLessThanOrEqual(476);
    expect(clamped.input.y + clamped.input.height).toBeLessThanOrEqual(base.input.y + base.input.height);
  });
});
