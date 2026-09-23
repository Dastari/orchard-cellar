import { expect, it, vi } from 'vitest';
import { UiRoot } from './root.js';
import { UiElement, type UiElementPointer } from './element.js';
import { uiFixed } from '../layout/box.js';

it('forwards native pointer identity and modifiers in logical coordinates', () => {
  const received: UiElementPointer[] = [];
  class NativeInput extends EventTarget {
    style = {}; dataset = {}; value = '';
    setAttribute() {} setSelectionRange() {} remove() {} focus() {}
  }
  const documentStub = Object.assign(new EventTarget(), {
    hidden: false, activeElement: null, body: { append() {} },
    createElement: () => new NativeInput(),
  });
  const canvas = Object.assign(new EventTarget(), {
    width: 0, height: 0, style: { touchAction: 'auto' },
    setAttribute() {}, focus() {}, setPointerCapture() {},
    hasPointerCapture: () => false, releasePointerCapture() {},
    getBoundingClientRect: () => ({ x: 20, y: 30, left: 20, top: 30, width: 400, height: 200 }),
  });
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    devicePixelRatio: 1.25,
    matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
  }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const root = new UiRoot({ scale: 2 });
  try {
    root.mount(new UiElement({ style: { width: uiFixed(100), height: uiFixed(100) },
      onPointer: event => { received.push(event); return true; } }));
    root.bindCanvas(canvas as unknown as HTMLCanvasElement);
    canvas.dispatchEvent(Object.assign(new Event('pointerdown', { cancelable: true }), {
      clientX: 60, clientY: 70, pointerId: 42, pointerType: 'touch', isPrimary: false,
      button: 0, shiftKey: true, altKey: true, ctrlKey: true, metaKey: true,
    }));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'down', point: { x: 20, y: 20 },
      pointerId: 42, pointerType: 'touch', isPrimary: false, button: 0,
      shiftKey: true, altKey: true, ctrlKey: true, metaKey: true });
  } finally { root.dispose(); vi.unstubAllGlobals(); }
});
