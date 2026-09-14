import { describe, expect, it, vi } from 'vitest';
import { StudioCanvas } from './studio-canvas.js';

function fakeCanvas(): { readonly canvas: HTMLCanvasElement; readonly setTransform: ReturnType<typeof vi.fn> } {
  const setTransform = vi.fn();
  const context = { setTransform, clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const canvas = {
    style: {}, width: 1, height: 1,
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 200 }),
  } as unknown as HTMLCanvasElement;
  return { canvas, setTransform };
}

describe('StudioCanvas', () => {
  it('owns a capped DPR backing store and maps pointer coordinates through bounds', () => {
    const fake = fakeCanvas(); const studio = new StudioCanvas(fake.canvas);
    studio.resize(200, 100, 2);
    expect(fake.canvas.width).toBe(400); expect(fake.canvas.height).toBe(200);
    expect(fake.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(studio.screenPoint(210, 120)).toEqual({ x: 100, y: 50 });
  });

  it('picks front-to-back through injectable overlay layers', () => {
    const fake = fakeCanvas(); const studio = new StudioCanvas(fake.canvas);
    studio.setLayers([
      { id: 'world', draw: () => undefined, pick: () => ({ kind: 'tile', id: '1,2' }) },
      { id: 'overlay', draw: () => undefined, pick: () => ({ kind: 'handle', id: 'north' }) },
    ]);
    expect(studio.pick({ x: 16, y: 32 })).toEqual({ layerId: 'overlay', kind: 'handle', id: 'north' });
  });
});
