import { describe, expect, it } from 'vitest';
import { GameUiRuntime } from './runtime.js';
import { UiRoot } from '../kit/runtime/root.js';
import { UiElement } from '../kit/runtime/element.js';
import { uiFixed } from '../kit/layout/box.js';
import type { UiRootPointer } from '../kit/runtime/input.js';
import { uiButton } from '../kit/components/button.js';
import { uiInput } from '../kit/components/input.js';
import { CanvasTextEditor } from '../kit/runtime/text-editor.js';

function fixture(priority = 1) {
  const events: string[] = [];
  let active = true, blocking = false, commands = 0;
  const root = new UiRoot({ scale: 1 });
  root.resize(200, 100);
  root.mount(new UiElement({ focusable: true, style: { width: uiFixed(50), height: uiFixed(30) },
    onPointer: event => {
      events.push(event.type);
      if (event.type === 'down') event.capture();
      if (event.type === 'up') commands++;
      return true;
    },
    onKey: event => { if (event.key === 'Enter') { commands++; return true; } return false; },
  }));
  return { root, events, get commands() { return commands; },
    host: { id: `host-${priority}`, root, priority, active: () => active, blocking: () => blocking },
    hide: () => { active = false; }, block: () => { blocking = true; },
  };
}
const pointer = (type: UiRootPointer['type'], x = 10, pointerId = 7): UiRootPointer =>
  ({ type, point: { x, y: 10 }, button: 0, pointerId });

describe('game retained host input ownership', () => {
  it('issues one activation for a held key while allowing a distinct next press', () => {
    const runtime = new GameUiRuntime(), root = new UiRoot({ scale: 1 });
    let commands = 0;
    root.resize(200, 100);
    root.mount(uiButton({ label: 'Purchase', onPress: () => { commands++; } }));
    runtime.register({ id: 'purchase', priority: 1, root, active: () => true, blocking: () => false });
    runtime.focus('purchase'); runtime.key({ key: 'Tab' });
    try {
      for (const key of ['Enter', ' ']) {
        const before = commands;
        expect(runtime.key({ key })).toBe(true);
        expect(runtime.key({ key, repeat: true })).toBe(true);
        expect(runtime.key({ key, repeat: true })).toBe(true);
        expect(commands).toBe(before + 1);
        expect(runtime.key({ key, repeat: false })).toBe(true);
        expect(commands).toBe(before + 2);
      }
      expect(runtime.key({ key: 'ContextMenu', repeat: true })).toBe(true);
    } finally { runtime.dispose(); root.dispose(); }
  });

  it('preserves repeated text editing and navigation in an actual editor', () => {
    const runtime = new GameUiRuntime(), root = new UiRoot({ scale: 1 });
    const editor = new CanvasTextEditor({ value: 'hello' });
    root.resize(200, 100); root.mount(uiInput({ label: 'Search', editor }));
    runtime.register({ id: 'search', priority: 1, root, active: () => true, blocking: () => true });
    runtime.key({ key: 'Tab' }); editor.setSelection(5, 5);
    try {
      expect(runtime.key({ key: ' ', repeat: true })).toBe(true);
      expect(editor.snapshot().value).toBe('hello ');
      expect(runtime.key({ key: 'Backspace', repeat: true })).toBe(true);
      expect(editor.snapshot().value).toBe('hello');
      expect(runtime.key({ key: 'ArrowLeft', repeat: true })).toBe(true);
      expect(editor.snapshot().focus).toBe(4);
    } finally { runtime.dispose(); root.dispose(); }
  });
  it('unregisters idempotently without disposing an externally owned replacement', () => {
    const runtime = new GameUiRuntime(), first = fixture(), next = fixture();
    const remove = runtime.register(first.host); remove();
    runtime.register(next.host); remove();
    expect(runtime.pointer(pointer('down'))).toBe(true);
    runtime.pointer(pointer('up'));
    expect(next.commands).toBe(1); expect(first.commands).toBe(0);
    runtime.dispose();
    expect(first.root.disposed).toBe(false); expect(next.root.disposed).toBe(false);
    first.root.dispose(); next.root.dispose();
  });
  it('keeps a consumed pointer through outside release, with one command', () => {
    const runtime = new GameUiRuntime(), f = fixture(); runtime.register(f.host);
    expect(runtime.pointer(pointer('down'))).toBe(true);
    expect(runtime.pointer(pointer('move', 500))).toBe(true);
    expect(runtime.pointer(pointer('up', 500))).toBe(true);
    expect(f.events).toEqual(['down', 'move', 'up']); expect(f.commands).toBe(1);
    expect(runtime.pointer(pointer('up', 10))).toBe(false);
    expect(f.commands).toBe(1);
  });

  it('never sends a world-origin release to an up-activated control', () => {
    const runtime = new GameUiRuntime(), f = fixture(); runtime.register(f.host);
    expect(runtime.pointer(pointer('down', 500))).toBe(false);
    expect(runtime.pointer(pointer('up', 10))).toBe(false);
    expect(f.commands).toBe(0); expect(f.events).toEqual([]);
    expect(runtime.pointer(pointer('down', 500))).toBe(false);
    f.block();
    expect(runtime.pointer(pointer('up', 10))).toBe(true);
    expect(f.commands).toBe(0); expect(f.events).toEqual([]);
  });

  it('cancels a hidden owner and consumes its tail without invoking a new host', () => {
    const runtime = new GameUiRuntime(), f = fixture(), other = fixture(2);
    runtime.register(f.host); runtime.pointer(pointer('down')); f.hide(); runtime.register(other.host);
    expect(runtime.pointer(pointer('up'))).toBe(true);
    expect(f.events).toEqual(['down', 'cancel']); expect(f.commands).toBe(0);
    expect(other.events).toEqual([]);
  });

  it('cancels lower ownership when a blocker appears and blocks outside input', () => {
    const runtime = new GameUiRuntime(), f = fixture(), blocker = fixture(9);
    runtime.register(f.host); runtime.pointer(pointer('down'));
    blocker.block(); runtime.register(blocker.host); runtime.reconcile();
    expect(f.events).toEqual(['down', 'cancel']);
    expect(runtime.pointer(pointer('up'))).toBe(true); expect(blocker.commands).toBe(0);
    expect(runtime.pointer(pointer('down', 500, 8))).toBe(true);
    expect(runtime.key({ key: 'w' })).toBe(true);
  });

  it('routes keys to one eligible owner and preserves focus over resize', () => {
    const runtime = new GameUiRuntime(), f = fixture(); runtime.register(f.host);
    expect(runtime.key({ key: 'Tab' })).toBe(false);
    runtime.pointer(pointer('down')); runtime.pointer(pointer('up'));
    const focus = runtime.focusedElement;
    for (const width of [390, 768, 1366, 1920]) runtime.resize(width, 844);
    expect(runtime.focusedElement).toBe(focus);
    expect(runtime.key({ key: 'Enter' })).toBe(true); expect(f.commands).toBe(2);
    expect(f.root.scale).toBe(1); expect(f.root.viewport.width).toBe(1920);
    runtime.pointer(pointer('down', 500)); runtime.pointer(pointer('up', 500));
    expect(runtime.key({ key: 'Tab' })).toBe(false);
  });

  it('supports separate pointer identities and cancellation on blur/disposal', () => {
    const runtime = new GameUiRuntime(), f = fixture(); const remove = runtime.register(f.host);
    runtime.pointer(pointer('down', 10, 1)); runtime.pointer(pointer('down', 10, 2));
    runtime.cancel();
    expect(f.events.filter(type => type === 'cancel')).toHaveLength(2);
    expect(runtime.pointer(pointer('up', 10, 1))).toBe(true);
    expect(runtime.pointer(pointer('up', 10, 2))).toBe(true);
    expect(f.commands).toBe(0); remove(); runtime.dispose();
    expect(runtime.key({ key: 'Tab' })).toBe(false);
  });

  it('lets a keyboard-opened passive panel own focus without swallowing world keys', () => {
    const runtime = new GameUiRuntime(), f = fixture(), blocker = fixture(9);
    runtime.register(f.host);
    expect(runtime.focus('missing')).toBe(false);
    expect(runtime.focus(f.host.id)).toBe(true);
    expect(runtime.key({ key: 'Tab' })).toBe(true);
    expect(runtime.focusedElement).not.toBeNull();
    expect(runtime.key({ key: 'Enter' })).toBe(true);
    expect(f.commands).toBe(1);
    expect(runtime.key({ key: 'w' })).toBe(false);
    runtime.pointer(pointer('down', 500));
    expect(runtime.focusedElement).toBeNull();
    expect(runtime.key({ key: 'Tab' })).toBe(false);
    blocker.block(); runtime.register(blocker.host);
    expect(runtime.focus(f.host.id)).toBe(false);
    expect(runtime.key({ key: 'w' })).toBe(true);
    blocker.hide(); f.hide();
    expect(runtime.focus(f.host.id)).toBe(false);
  });

  it('clears obscured hover and tooltips when another eligible host consumes the pointer', () => {
    const runtime = new GameUiRuntime(), lower = fixture(), upper = fixture(2);
    upper.root.tree.children[0]!.setStyle({ position: 'absolute', inset: { left: uiFixed(100) } });
    runtime.register(lower.host); runtime.register(upper.host);
    runtime.pointer(pointer('move', 10));
    expect(lower.root.input.hovered).not.toBeNull();
    runtime.pointer(pointer('move', 110));
    expect(upper.root.input.hovered).not.toBeNull();
    expect(lower.root.input.hovered).toBeNull();
    runtime.pointer(pointer('down', 110));
    runtime.pointer(pointer('move', 10));
    expect(lower.root.input.hovered).toBeNull();
  });

  it('lets legacy chat consume between scoped hosts without activating the lower tracker', () => {
    const runtime = new GameUiRuntime(), tracker = fixture(), name = fixture(9);
    name.root.tree.children[0]!.setStyle({ position: 'absolute', inset: { left: uiFixed(100) } });
    runtime.register(tracker.host); runtime.register(name.host);
    let chatCommands = 0;
    // The point misses the high host and is then handled by legacy chat.
    if (!runtime.pointer(pointer('down'), { hostId: name.host.id })) {
      chatCommands++;
      runtime.clearFocus();
    }
    expect(chatCommands).toBe(1);
    expect(tracker.events).toEqual([]);
    expect(runtime.tracksPointer(7)).toBe(false);
    expect(runtime.pointer(pointer('up'), { hostId: tracker.host.id })).toBe(false);
    expect(tracker.commands).toBe(0);
  });

  it('keeps focus across intermediate misses until the final world handoff', () => {
    const runtime = new GameUiRuntime(), lower = fixture(), upper = fixture(9);
    runtime.register(lower.host); runtime.register(upper.host);
    runtime.focus(lower.host.id); lower.root.tree.children[0]!.requestFocus();
    expect(runtime.focusedElement).not.toBeNull();
    expect(runtime.pointer(pointer('down', 500), { hostId: upper.host.id })).toBe(false);
    expect(runtime.key({ key: 'Enter' }, upper.host.id)).toBe(false);
    expect(runtime.key({ key: 'Enter' }, lower.host.id)).toBe(true);
    expect(lower.commands).toBe(1);
    runtime.clearFocus();
    expect(runtime.focusedElement).toBeNull();
    expect(runtime.key({ key: 'Enter' })).toBe(false);
  });

  it('tracks owned and cancelled tails globally across scoped stages and recovery', () => {
    const runtime = new GameUiRuntime(), lower = fixture(), upper = fixture(9);
    runtime.register(lower.host); runtime.register(upper.host);
    runtime.pointer(pointer('down'), { hostId: lower.host.id });
    expect(runtime.tracksPointer(7)).toBe(true);
    runtime.pointer(pointer('move', 500), { hostId: upper.host.id });
    expect(lower.events).toEqual(['down', 'move']);
    expect(upper.events).toEqual([]);
    lower.hide();
    expect(runtime.tracksPointer(7)).toBe(true); // reconcile cancels, still swallows release
    expect(lower.events).toEqual(['down', 'move', 'cancel']);
    expect(runtime.pointer(pointer('up'), { hostId: upper.host.id })).toBe(true);
    expect(runtime.tracksPointer(7)).toBe(false);
    expect(lower.commands).toBe(0); expect(upper.commands).toBe(0);
  });

  it('scopes wheel dispatch without bypassing a higher modal', () => {
    const runtime = new GameUiRuntime(), lower = fixture(), upper = fixture(9);
    let lowerScrolls = 0, upperScrolls = 0;
    lower.root.mount(new UiElement({ style: { width: uiFixed(50), height: uiFixed(30) },
      onWheel: () => { lowerScrolls++; return true; } }));
    upper.root.mount(new UiElement({ style: { width: uiFixed(50), height: uiFixed(30) },
      onWheel: () => { upperScrolls++; return true; } }));
    runtime.register(lower.host); runtime.register(upper.host);
    const wheel = { point: { x: 10, y: 10 }, deltaX: 0, deltaY: 10 };
    expect(runtime.wheel(wheel, lower.host.id)).toBe(true);
    expect([lowerScrolls, upperScrolls]).toEqual([1, 0]);
    upper.block();
    expect(runtime.wheel(wheel, lower.host.id)).toBe(false);
    expect(runtime.wheel(wheel, upper.host.id)).toBe(true);
    expect([lowerScrolls, upperScrolls]).toEqual([1, 1]);
  });

});
