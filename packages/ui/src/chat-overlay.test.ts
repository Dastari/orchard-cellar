import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiElement } from './kit/runtime/element.js';
import { GameUiRuntime } from './game-host/runtime.js';
import { UiTextBridge } from './kit/runtime/text-bridge.js';
import type { ChatOverlayModel } from './chat-overlay.js';
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

let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
beforeEach(() => vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) }));
const overlays: ChatOverlay[] = [];
afterEach(() => { overlays.splice(0).forEach(overlay => overlay.dispose()); vi.unstubAllGlobals(); vi.useRealTimers(); });
function chatModel(): ChatOverlayModel {
  return { sessionKey: 'self:connection-1', width: 480, height: 270, connected: true, canAdministerWorld: false,
    onlinePlayerNames: ['Mara', 'Toby'], replyPlayerName: 'Toby', messages: [{ id: 1n, channelName: 'General', senderDisplayName: 'Mara', kind: 'chat', body: 'Apples for sale', itemLinksJson: '[]' }] };
}
function retainedFixture(send = vi.fn<(_: string) => Promise<void>>(async () => {}), initial = chatModel(), prefs = new Map<string, string>()) {
  const changed = vi.fn(), write = vi.fn((key: string, value: string) => { prefs.set(key, value); });
  const overlay = new ChatOverlay(art, send, changed, { read: key => prefs.get(key) ?? null, write }); overlays.push(overlay); overlay.update(initial, 1000);
  const node = (id: string) => { overlay.root.arrange(); const row = overlay.root.entries().find(row => row.element.id === id); expect(row, id).toBeDefined(); return row!.element; };
  const point = (element: UiElement) => ({ x: element.clip.x + element.clip.width / 2, y: element.clip.y + element.clip.height / 2 });
  const click = (id: string, pointerId = 1) => { const p = point(node(id)); overlay.root.pointer({ type: 'down', point: p, pointerId, button: 0 }); overlay.root.pointer({ type: 'up', point: p, pointerId, button: 0 }); };
  return { overlay, send, changed, node, point, click, write, prefs };
}
describe('production retained chat adapter', () => {
  it('keeps one stable root/editor, opens from global shortcuts once and preserves draft, selection and scroll across snapshots', () => {
    const f = retainedFixture(), root = f.overlay.root, editor = f.overlay.editor;
    expect(f.overlay.handleGlobalKeyDown({ key: '/', repeat: false })).toBe(true); expect(f.changed).toHaveBeenCalledExactlyOnceWith(true);
    expect(root.focus.current).toBe(f.node('chat.input')); expect(editor.snapshot().value).toBe('/');
    root.input.text('whisper M'); root.key({ key: 'Tab' }); expect(editor.snapshot().value).toBe('/whisper Mara ');
    editor.setSelection(2, 6); f.overlay.update({ ...chatModel(), width: 320, height: 180, replyPlayerName: 'Mara' }, 1500);
    expect(f.overlay.root).toBe(root); expect(f.overlay.editor).toBe(editor); expect(editor.snapshot()).toMatchObject({ value: '/whisper Mara ', anchor: 2, focus: 6 });
    expect(f.overlay.handleGlobalKeyDown({ key: 'Enter', repeat: false })).toBe(false);
    root.key({ key: 'Escape' }); expect(f.overlay.isOpen).toBe(false); expect(f.changed.mock.calls).toEqual([[true], [false]]);
    expect(f.overlay.handleGlobalKeyDown({ key: 'Enter', repeat: true })).toBe(false);
  });
  it('submits once, leaves a newer draft untouched on rejection, and discards completion from old identities', async () => {
    const rejects: ((error: Error) => void)[] = [], send = vi.fn<(_: string) => Promise<void>>(() => new Promise((_resolve, reject) => rejects.push(reject)));
    const f = retainedFixture(send); f.overlay.open(' first '); f.overlay.root.key({ key: 'Enter' });
    expect(send).toHaveBeenCalledExactlyOnceWith('first'); expect(f.overlay.isOpen).toBe(false); expect(f.overlay.editor.snapshot().value).toBe('');
    f.overlay.open('newer draft'); f.overlay.editor.setSelection(1, 5); rejects[0]!(new Error('Rejected')); await Promise.resolve();
    expect(f.overlay.editor.snapshot()).toMatchObject({ value: 'newer draft', anchor: 1, focus: 5 });
    expect(f.overlay.root.entries().some(row => row.element.id.startsWith('chat.message.local-error.'))).toBe(true);
    f.overlay.root.key({ key: 'Enter', repeat: true }); expect(send).toHaveBeenCalledOnce();
    f.overlay.root.key({ key: 'Enter' }); expect(send).toHaveBeenCalledTimes(2);
    f.overlay.update({ ...chatModel(), sessionKey: 'other:connection-2', messages: [] }, 2000); rejects[1]!(new Error('Old player')); await Promise.resolve();
    expect(f.overlay.editor.snapshot().value).toBe(''); expect(f.overlay.root.entries().some(row => row.element.id.startsWith('chat.message.local-error.'))).toBe(false);
  });
  it('uses the actual shared native bridge for IME/clipboard and enforces240 without submitting composition Enter', () => {
    const f = retainedFixture(); f.overlay.open();
    const documentStub = { activeElement: null as unknown, body: { append() {} }, createElement: () => new Input() };
    class Input extends EventTarget { style = {}; dataset = {}; value = ''; tabIndex = 0; spellcheck = false; readOnly = false;
      focus() { documentStub.activeElement = this; } setAttribute() {} setSelectionRange() {} remove() {} }
    const canvas = { focus() { documentStub.activeElement = canvas; } } as unknown as HTMLCanvasElement; vi.stubGlobal('document', documentStub);
    const bridge = new UiTextBridge(canvas, () => f.overlay.active ? f.overlay.root.focus.current : null, event => f.overlay.root.key(event), node => node.rect, () => f.overlay.root.invalidate());
    try {
      bridge.sync(); bridge.input.dispatchEvent(Object.assign(new Event('compositionstart'), { data: '' }));
      bridge.input.dispatchEvent(Object.assign(new Event('compositionupdate'), { data: '果樹' }));
      bridge.input.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter', isComposing: true })); expect(f.send).not.toHaveBeenCalled();
      f.overlay.root.key({ key: 'Enter' }); expect(f.send).not.toHaveBeenCalled();
      bridge.input.dispatchEvent(Object.assign(new Event('compositionend'), { data: '果樹' })); expect(f.overlay.editor.snapshot().value).toBe('果樹');
      bridge.input.dispatchEvent(Object.assign(new Event('paste', { cancelable: true }), { clipboardData: { getData: () => 'a'.repeat(300) } }));
      expect([...f.overlay.editor.snapshot().value]).toHaveLength(240);
      bridge.input.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter', isComposing: false })); expect(f.send).toHaveBeenCalledOnce();
    } finally { bridge.dispose(); }
  });
  it('opens a history tap only on release while touch scrolling and cancellation keep the native editor closed', () => {
    const initial = { ...chatModel(), touchControls: true, messages: Array.from({ length: 80 }, (_, i) => ({ ...chatModel().messages[0]!, id: BigInt(i), body: `Message ${i}` })) };
    const f = retainedFixture(undefined, initial), root = f.overlay.root, history = f.node('chat.history');
    const p = { x: history.clip.x + 20, y: history.clip.y + 20 };
    root.pointer({ type: 'down', point: p, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true }); expect(f.overlay.isOpen).toBe(false);
    root.pointer({ type: 'move', point: { x: p.x, y: p.y + 10 }, pointerId: 1, button: 0, pointerType: 'touch' });
    root.pointer({ type: 'up', point: p, pointerId: 1, button: 0, pointerType: 'touch' }); expect(f.overlay.isOpen).toBe(false);
    root.pointer({ type: 'down', point: p, pointerId: 2, button: 0, pointerType: 'touch', isPrimary: true }); root.input.cancelPointers();
    root.pointer({ type: 'up', point: p, pointerId: 2, button: 0, pointerType: 'touch' }); expect(f.overlay.isOpen).toBe(false);
    root.pointer({ type: 'down', point: p, pointerId: 3, button: 0, pointerType: 'touch', isPrimary: true }); expect(root.focus.current?.id).not.toBe('chat.input');
    root.pointer({ type: 'up', point: p, pointerId: 3, button: 0, pointerType: 'touch' }); expect(f.overlay.isOpen).toBe(true); expect(root.focus.current).toBe(f.node('chat.input'));
    root.key({ key: 'Home' }); expect(history.scroll.y).toBe(0); root.key({ key: 'End' }); expect(history.scroll.y).toBe(history.scroll.maxY);
    f.overlay.blurInput(); expect(f.overlay.isOpen).toBe(true); f.overlay.update({ ...initial, touchControls: false }, 1100); f.overlay.blurInput(); expect(f.overlay.isOpen).toBe(false);
  });
  it('retains first-arrival time, exact channel colors and unread semantics without treating initial history as new', () => {
    const prefs = new Map([['orchard:chat-collapsed', 'true']]), f = retainedFixture(undefined, chatModel(), prefs);
    expect(f.overlay.isCollapsed).toBe(true); expect(f.overlay.hasUnread).toBe(false);
    f.overlay.root.pointer({ type: 'move', point: { x: 120, y: f.node('chat.toggle').rect.y + 5 }, pointerId: 9, button: 0 }); expect(f.overlay.isHovered).toBe(false);
    expect(f.overlay.root.pointer({ type: 'down', point: { x: 120, y: f.node('chat.toggle').rect.y + 50 }, pointerId: 9, button: 0 })).toBe(false);
    f.overlay.update({ ...chatModel(), messages: [...chatModel().messages, { ...chatModel().messages[0]!, id: 2n }] }, 2000); expect(f.overlay.hasUnread).toBe(true);
    f.click('chat.toggle'); expect(f.overlay.isCollapsed).toBe(false); expect(f.overlay.hasUnread).toBe(false);
    f.overlay.root.input.clearHover(); f.overlay.update(chatModel(), 5000);
    const line = f.overlay.root.entries().find(row => row.element.id === 'chat.message.1.0')!.element;
    const context = createCanvas(480,270).getContext('2d') as unknown as CanvasRenderingContext2D;
    line.hooks.paint!(line, { context, art, now: 10000, focused: false, hovered: false, reducedMotion: false }); expect(context.globalAlpha).toBeCloseTo(.75, 2);
    expect(chatMessagePresentation({ ...chatModel().messages[0]!, kind: 'whisper' }).color).toBe('#ef9dea');
    expect(chatMessagePresentation({ ...chatModel().messages[0]!, kind: 'motd' }).color).toBe('#ffe17a');
    expect(chatMessagePresentation({ ...chatModel().messages[0]!, kind: 'system' }).color).toBe('#a9ef9d');
  });
  it('persists drag/collapse preferences, cancels blocked gestures and leaves outside world input usable', () => {
    const f = retainedFixture(), root = f.overlay.root, runtime = new GameUiRuntime(); runtime.register({ id: 'chat', root, priority: 100, active: () => f.overlay.active, blocking: () => false });
    expect(runtime.pointer({ type: 'down', point: { x: 450, y: 20 }, pointerId: 5, button: 0 })).toBe(false);
    const empty = { x: f.node('chat.toggle').rect.x + 100, y: f.node('chat.toggle').rect.y + 8 };
    expect(runtime.pointer({ type: 'down', point: empty, pointerId: 6, button: 0, pointerType: 'touch', isPrimary: true })).toBe(false);
    expect(runtime.pointer({ type: 'up', point: empty, pointerId: 6, button: 0, pointerType: 'touch' })).toBe(false);
    const tap = f.point(f.node('chat.toggle'));
    runtime.pointer({ type: 'down', point: tap, pointerId: 7, button: 0, pointerType: 'touch', isPrimary: true }); runtime.pointer({ type: 'up', point: tap, pointerId: 7, button: 0, pointerType: 'touch' });
    expect(f.overlay.isCollapsed).toBe(true); f.click('chat.toggle',8);
    const p = f.point(f.node('chat.toggle')); runtime.pointer({ type: 'down', point: p, pointerId: 1, button: 0 });
    runtime.pointer({ type: 'move', point: { x: p.x + 40, y: p.y - 10 }, pointerId: 1, button: 0 }); runtime.pointer({ type: 'up', point: { x: p.x + 40, y: p.y - 10 }, pointerId: 1, button: 0 });
    expect(f.overlay.isCollapsed).toBe(false); expect(f.prefs.has('orchard:chat-anchor')).toBe(true);
    const restored = retainedFixture(undefined, chatModel(), f.prefs); expect(restored.node('chat.toggle').rect).toEqual(f.node('chat.toggle').rect);
    const moved = f.point(f.node('chat.toggle')); runtime.pointer({ type: 'down', point: moved, pointerId: 2, button: 0 });
    f.overlay.update({ ...chatModel(), interactionBlocked: true }, 1100); runtime.reconcile(); runtime.pointer({ type: 'up', point: moved, pointerId: 2, button: 0 }); expect(f.overlay.isCollapsed).toBe(false);
    expect(f.overlay.handleGlobalKeyDown({ key: 'Enter', repeat: false })).toBe(false); expect(f.overlay.isHovered).toBe(false); runtime.dispose();
  });
  it.each([1,2,3])('keeps editor/toggle and command suggestions usable in compact/wide and keyboard-inset geometry at scale%i DPR1.25', scale => {
    for (const [width,height,inset,touch] of [[320,180,0,false],[800,500,0,false],[390,844,330,true],[320,180,0,true],[320,180,80,true],[320,180,100,true],[320,180,101,true],[640,180,80,true]] as const) {
      const f = retainedFixture(undefined, { ...chatModel(), width, height, keyboardInset: inset, touchControls: touch }); f.overlay.open('/');
      const canvas = createCanvas(Math.round(width*scale*1.25),Math.round(height*scale*1.25)), ctx = canvas.getContext('2d'); ctx.scale(scale*1.25,scale*1.25); f.overlay.draw(ctx as unknown as CanvasRenderingContext2D,1000);
      for (const id of ['chat.toggle','chat.input']) { const node = f.node(id); expect(node.clip,`${id}/${width}/${inset}`).toEqual(node.rect); expect(node.rect.width).toBeGreaterThan(15); expect(node.rect.height).toBeGreaterThan(15); }
      expect(f.node('chat.suggestion.0').clip).toEqual(f.node('chat.suggestion.0').rect);
      expect(f.node('chat.input').rect.y + f.node('chat.input').rect.height).toBeLessThanOrEqual(height-inset);
      f.overlay.root.key({ key: 'Tab' }); expect(f.overlay.editor.snapshot().value).toBe('/say ');
      expect(f.overlay.root.scale).toBe(1);
    }
  });
  it('keeps the compact command row and editor whole at minimum keyboard clearance without replacing an active composition', () => {
    const initial = { ...chatModel(), width: 320, height: 180, touchControls: true, keyboardInset: 80 };
    const f = retainedFixture(undefined, initial); f.overlay.open('/');
    const input = f.node('chat.input'), editor = f.overlay.editor;
    editor.handleCompositionStart(); editor.handleCompositionUpdate({ data: '果' });
    const composition = editor.snapshot();
    for (const keyboardInset of [101, 80, 0]) {
      f.overlay.update({ ...initial, keyboardInset }, 1000);
      expect(f.node('chat.input')).toBe(input); expect(editor.snapshot()).toEqual(composition);
      expect(input.clip).toEqual(input.rect); expect(input.rect.height).toBe(22);
      expect(input.rect.y + input.rect.height).toBeLessThanOrEqual(initial.height - keyboardInset);
      f.overlay.root.key({ key: 'Enter' }); expect(f.send).not.toHaveBeenCalled();
    }
    editor.handleCompositionEnd({ data: '果' });
    f.overlay.root.key({ key: 'Escape' }); expect(f.overlay.isOpen).toBe(false);
    expect(f.changed.mock.calls).toEqual([[true], [false]]);
  });
});
