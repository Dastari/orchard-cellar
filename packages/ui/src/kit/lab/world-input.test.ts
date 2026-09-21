import { createCanvas } from '@napi-rs/canvas';
import { expect, it, vi } from 'vitest';
import { UiLabWorld } from './world.js';
import { touchSpecimen } from './specimens/anchors.js';
import { uiTestArt } from './testing/art.js';

it('releases simultaneous specimen pointers independently and cancels held input on blur or Escape', async () => {
  const art = await uiTestArt(), frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  class Input extends EventTarget {
    style = {}; dataset = {}; value = ''; tabIndex = 0; spellcheck = false;
    setAttribute() {} remove() {} setSelectionRange() {}
    focus() { documentStub.activeElement = this; }
  }
  const documentStub = Object.assign(new EventTarget(), { activeElement: null as unknown, hidden: false,
    body: { append() {} }, createElement: (tag: string) => tag === 'canvas' ? createCanvas(1, 1) : new Input() });
  const windowStub = Object.assign(new EventTarget(), { devicePixelRatio: 1,
    matchMedia: () => Object.assign(new EventTarget(), { matches: false }) });
  const captured = new Set<number>();
  const canvasStub = Object.assign(new EventTarget(), { clientWidth: 1280, clientHeight: 800,
    width: 1280, height: 800, style: { touchAction: '' }, dataset: {} as Record<string, string>, tabIndex: 0,
    setAttribute() {}, focus() { documentStub.activeElement = this; },
    setPointerCapture: (id: number) => captured.add(id), hasPointerCapture: (id: number) => captured.has(id), releasePointerCapture: (id: number) => captured.delete(id),
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1280, height: 800 }),
    getContext: () => createCanvas(1280, 800).getContext('2d'),
  });
  vi.stubGlobal('document', documentStub); vi.stubGlobal('window', windowStub);
  vi.stubGlobal('location', { search: '?specimen=touch-actions&scale=2' });
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem() {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  let lab: UiLabWorld | undefined;
  try {
    lab = new UiLabWorld(canvasStub as unknown as HTMLCanvasElement, { art, specimens: [touchSpecimen] });
    const flush = () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); };
    flush();
    const state = lab.inspect(), specimen = state.specimens.find(entry => !entry.code)!;
    const point = (label: string) => {
      const rect = specimen.elements.find(entry => entry.label === label)!.rect, camera = state.camera;
      return { x: camera.viewport.x + (specimen.rect.x - camera.x + (rect.x + rect.width / 2) * state.scale) * camera.zoom,
        y: camera.viewport.y + (specimen.rect.y - camera.y + (rect.y + rect.height / 2) * state.scale) * camera.zoom };
    };
    const movement = point('Movement'), action = point('interact');
    const send = (type: string, pointerId: number, position: { x: number; y: number }) => {
      canvasStub.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId, button: 0, clientX: position.x, clientY: position.y })); flush();
    };
    const direction = () => lab!.inspect().specimens.find(entry => !entry.code)!.elements.find(entry => entry.label === 'right' || entry.label === 'idle')?.label;
    send('pointerdown', 1, movement); send('pointermove', 1, { x: movement.x + 30, y: movement.y });
    send('pointerdown', 2, action); send('pointerup', 2, action);
    expect(direction()).toBe('right'); expect(captured.has(1)).toBe(true);
    send('pointerup', 1, movement); expect(direction()).toBe('idle'); expect(captured.size).toBe(0);
    for (const cancel of ['blur', 'Escape']) {
      send('pointerdown', 1, { x: movement.x + 30, y: movement.y }); send('pointerdown', 2, action);
      if (cancel === 'blur') windowStub.dispatchEvent(new Event('blur'));
      else canvasStub.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
      flush(); expect(direction()).toBe('idle'); expect(captured.size).toBe(0);
    }
  } finally { lab?.dispose(); vi.unstubAllGlobals(); }
});
