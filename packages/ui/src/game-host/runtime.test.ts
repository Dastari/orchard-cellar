import { describe, expect, it } from 'vitest';
import { GameUiRuntime } from './runtime.js';
import { UiRoot } from '../kit/runtime/root.js';
import { UiElement } from '../kit/runtime/element.js';
import { uiFixed } from '../kit/layout/box.js';
import type { UiRootPointer } from '../kit/runtime/input.js';

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
});
