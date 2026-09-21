import { describe, expect, it, vi } from 'vitest';
import { uiFixed } from '../layout/box.js';
import { UiElement } from './element.js';
import { UiRoot } from './root.js';
import { UiAnimations } from './animation.js';
import { createUiRecordingCanvas } from './recording-canvas.js';

function control(id: string, activate = vi.fn()) {
  return new UiElement({ id, focusable: true, label: id, style: { width: uiFixed(40), height: uiFixed(24) },
    onKey: event => { if (event.key === 'Enter' || event.key === ' ') { activate(); return true; } return false; } });
}
describe('retained input and lifecycle', () => {
  it('tabs in tree order, traps a modal, dismisses it and restores focus', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(320, 200);
    const a = control('a'), b = control('b');
    root.mount(new UiElement({ children: [a, b] })); root.arrange();
    root.key({ key: 'Tab' }); expect(root.focus.current).toBe(a);
    root.key({ key: 'Tab' }); expect(root.focus.current).toBe(b);
    const close = control('close');
    const modal = root.mount(new UiElement({ style: { zLayer: 'modal', width: uiFixed(100), height: uiFixed(100) },
      children: [close], onDismiss: node => root.unmount(node) }));
    root.arrange(); expect(root.focus.current).toBe(close);
    root.key({ key: 'Tab' }); expect(root.focus.current).toBe(close);
    expect(root.pointer({ type: 'down', point: { x: 300, y: 190 }, button: 0, pointerId: 1 })).toBe(true);
    root.key({ key: 'Escape' }); root.arrange(); expect(modal.parent).toBeNull(); expect(root.focus.current).toBe(b);
  });
  it('routes captured pointers outside a box and releases capture on unmount', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(100, 100); const seen: string[] = [];
    const node = root.mount(new UiElement({ style: { width: uiFixed(20), height: uiFixed(20) }, onPointer: event => {
      seen.push(event.type); if (event.type === 'down') event.capture(); return true;
    } }));
    root.pointer({ type: 'down', point: { x: 10, y: 10 }, button: 0, pointerId: 1 });
    root.pointer({ type: 'move', point: { x: 90, y: 90 }, button: 0, pointerId: 1 });
    root.unmount(node); root.pointer({ type: 'up', point: { x: 90, y: 90 }, button: 0, pointerId: 1 });
    expect(seen).toEqual(['down', 'move', 'cancel']);
    root.pointer({ type: 'move', point: { x: 90, y: 90 }, button: 0, pointerId: 1 });
    expect(seen).toEqual(['down', 'move', 'cancel']);
  });
  it('cancels an unfinished gesture before starting another with the same pointer', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(100, 100);
    const seen: string[] = [];
    root.mount(new UiElement({ style: { width: uiFixed(20), height: uiFixed(20) }, onPointer: event => {
      seen.push(event.type); if (event.type === 'down') event.capture(); return true;
    } }));
    for (const type of ['down', 'down', 'up'] as const) root.pointer({ type, point: { x: 10, y: 10 }, button: 0, pointerId: 1 });
    expect(seen).toEqual(['down', 'cancel', 'down', 'up']); root.dispose();
  });
  it('hits reverse paint order but cannot hit a child outside its ancestor clip', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(100, 100);
    const child = control('child');
    root.mount(new UiElement({ style: { width: uiFixed(10), height: uiFixed(10) }, children: [child] })); root.arrange();
    expect(root.input.hits({ x: 5, y: 5 })[0]).toBe(child);
    expect(root.input.hits({ x: 30, y: 5 })).not.toContain(child);
  });
  it('supports roving focus, activation and text without a pointer', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(100, 100); const activate = vi.fn(), text = vi.fn(() => true);
    const a = control('a'), b = control('b', activate); a.focusGroup = 'list'; b.focusGroup = 'list';
    const field = new UiElement({ focusable: true, onText: text });
    root.mount(new UiElement({ children: [a, b, field] })); root.arrange();
    root.key({ key: 'Tab' }); root.key({ key: 'ArrowRight' }); expect(root.focus.current).toBe(b);
    root.key({ key: 'Enter' }); root.key({ key: ' ' }); expect(activate).toHaveBeenCalledTimes(2);
    root.key({ key: 'Tab' }); root.text('Orchard'); expect(text).toHaveBeenCalledWith('Orchard', field);
  });
  it('rejects cycles, duplicate ids and attachment after disposal', () => {
    const root = new UiRoot(); const parent = new UiElement(), child = new UiElement(); parent.append(child);
    expect(() => child.append(parent)).toThrow('cycles'); child.dispose(); expect(() => parent.append(child)).toThrow('disposed');
    root.mount(control('same')); root.mount(control('same')); expect(() => root.arrange()).toThrow('Duplicate');
    root.dispose(); root.dispose();
  });
  it('ticks visible animation only and finishes decorative work in reduced motion', () => {
    const animation = new UiAnimations(), update = vi.fn(), complete = vi.fn();
    animation.add('press', { duration: 100, decorative: true, update, complete });
    animation.tick(0); animation.tick(20); expect(update).toHaveBeenLastCalledWith(0.2);
    animation.tick(50, false); animation.tick(60); expect(update).toHaveBeenLastCalledWith(0.3);
    animation.tick(70, true, true); expect(update).toHaveBeenLastCalledWith(1); expect(complete).toHaveBeenCalledOnce();
    expect(animation.active).toBe(false);
  });
});

describe('overflow paint invariant', () => {
  for (const scale of [1, 2, 3] as const) for (const width of [160, 320, 640]) it(`${width}px at ${scale}x`, () => {
    const root = new UiRoot({ scale }); root.resize(width, 240);
    const recorder = createUiRecordingCanvas(width, 240);
    const paint = new UiElement({ style: { width: uiFixed(1000), height: uiFixed(1000) }, paint: (node, { context }) => {
      context.fillRect(node.rect.x - 50, node.rect.y - 50, 2000, 2000);
      context.drawImage({ width: 16, height: 16 } as CanvasImageSource, 0, 0, 16, 16, node.rect.x, node.rect.y, 2000, 2000);
    } });
    root.mount(new UiElement({ style: { padding: 8, width: 'grow', height: 'grow', direction: 'column' }, children: [paint] }));
    root.draw(recorder.context);
    expect(recorder.records).toHaveLength(2);
    for (const record of recorder.records) {
      expect(record.rect.x).toBeGreaterThanOrEqual(paint.clip.x * scale);
      expect(record.rect.y).toBeGreaterThanOrEqual(paint.clip.y * scale);
      expect(record.rect.x + record.rect.width).toBeLessThanOrEqual((paint.clip.x + paint.clip.width) * scale);
      expect(record.rect.y + record.rect.height).toBeLessThanOrEqual((paint.clip.y + paint.clip.height) * scale);
    }
    expect(recorder.balanced).toBe(true);
  });
  it('restores the context after a painter throws', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(100, 100);
    root.mount(new UiElement({ style: { width: 'grow', height: 'grow' }, paint: () => { throw new Error('paint failed'); } }));
    const recorder = createUiRecordingCanvas(100, 100);
    expect(() => root.draw(recorder.context)).toThrow('paint failed'); expect(recorder.balanced).toBe(true);
  });
});

describe('defensive runtime contracts', () => {
  it('rejects un-tokenized spacing and unsupported overflow from JavaScript', () => {
    expect(() => new UiElement({ style: { padding: 7 } as never })).toThrow('spacing');
    expect(() => new UiElement({ style: { overflow: 'visible' } as never })).toThrow('overflow');
    expect(() => new UiElement({ style: { width: 100 } as never })).toThrow('dimensions');
  });
  it('disables the complete input subtree and removes invalid focus', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(100, 100);
    const button = control('inside');
    const parent = root.mount(new UiElement({ style: { width: 'grow', height: 'grow' }, children: [button] }));
    root.arrange(); root.key({ key: 'Tab' }); expect(root.focus.current).toBe(button);
    parent.setDisabled(true); root.arrange(); expect(root.focus.current).toBeNull();
    expect(root.input.hits({ x: 1, y: 1 })).not.toContain(button);
  });
  it('restores focus across two independently mounted modal layers', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(100, 100);
    const base = root.mount(control('base')); root.arrange(); root.focus.set(base);
    const firstButton = control('first'), secondButton = control('second');
    const first = root.mount(new UiElement({ style: { zLayer: 'modal' }, children: [firstButton] })); root.arrange();
    const second = root.mount(new UiElement({ style: { zLayer: 'modal' }, children: [secondButton] })); root.arrange();
    expect(root.focus.current).toBe(secondButton);
    root.unmount(second); root.arrange(); expect(root.focus.current).toBe(firstButton);
    root.unmount(first); root.arrange(); expect(root.focus.current).toBe(base);
  });
  it('does not charge a newly started animation for time spent idle', () => {
    const animation = new UiAnimations(), update = vi.fn();
    animation.tick(0); animation.tick(1000);
    animation.add('new', { duration: 100, update }); animation.tick(5000);
    expect(update).toHaveBeenLastCalledWith(0);
  });
});
