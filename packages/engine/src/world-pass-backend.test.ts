import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasWorldPassBackend } from './world-pass-canvas.js';
import { UnifiedRenderer, worldPassLayout } from './renderer.js';
import { CanvasWorldPresent } from './world-pass-present.js';

afterEach(() => vi.unstubAllGlobals());
function surfaces() {
  const result: Array<{ width: number; height: number }> = [];
  vi.stubGlobal('document', { createElement: () => {
    const context = { setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(),
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), globalCompositeOperation: 'source-over' };
    const canvas = { width: 300, height: 150, getContext: () => context };
    result.push(canvas); return canvas;
  } });
  return result;
}
describe('Canvas world backend lifetime and submission boundary', () => {
  it('attempts both present backing axes when one disposal setter throws', () => {
    const canvases = surfaces(), present = new CanvasWorldPresent(), backing = canvases[0]!;
    present.reserve(1280, 720);
    Object.defineProperty(backing, 'width', { get: () => 1280, set: () => { throw new Error('width failed'); } });
    expect(() => present.dispose()).toThrow('world_present_disposal_failed');
    expect(backing.height).toBe(0); expect(present.bytes).toBe(0);
  });
  it('clears an inaccessible present backing when context creation throws', () => {
    const canvas = { width: 300, height: 150, getContext: () => { throw new Error('context creation failed'); } };
    vi.stubGlobal('document', { createElement: () => canvas });
    expect(() => new CanvasWorldPassBackend()).toThrow('context creation failed');
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
  it('retains world and present capacity then releases every backing on dispose', () => {
    const canvases = surfaces();
    const backend = new CanvasWorldPassBackend();
    backend.reserve(768, 432, 1280, 720);
    const layout = worldPassLayout(1280, 720, 1, 2, '1x');
    for (let frame = 0; frame < 600; frame++) backend.begin(layout);
    expect(canvases).toHaveLength(2);
    expect(backend.bytes).toBe((768 * 432 + 1280 * 720) * 4);
    backend.dispose(); backend.dispose();
    expect(backend.bytes).toBe(0);
    expect(canvases.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(() => backend.begin(layout)).toThrow('world_pass_disposed');
  });
  it('uses prepared Canvas sprite rectangles and preserves the shared call order', () => {
    surfaces();
    const backend = new CanvasWorldPassBackend();
    backend.reserve(768, 432, 1280, 720);
    backend.begin(worldPassLayout(1280, 720, 1, 2, '1x'));
    const original = { image: {} as CanvasImageSource, x: 2, y: 3, width: 4, height: 5 };
    const prepared = { ...original, x: 40, y: 50 };
    const destination = { x: 10, y: 20, width: 8, height: 10 };
    backend.sprite({ source: original, canvasSource: prepared, destination,
      receiverRgb: { r: 100, g: 150, b: 200 }, variant: 'normal' });
    backend.chunk({ source: original, destination });
    backend.capRun({ source: original, destination, flipX: true });
    const drawImage = vi.mocked(backend.context.drawImage);
    expect(drawImage.mock.calls[0]).toEqual([prepared.image, 40, 50, 4, 5, 10, 20, 8, 10]);
    expect(drawImage.mock.calls[1]).toEqual([original.image, 2, 3, 4, 5, 10, 20, 8, 10]);
    expect(drawImage.mock.calls[2]).toEqual([original.image, 2, 3, 4, 5, 0, 0, 8, 10]);
    backend.multiplyPlane({ source: original, destination });
    const weather = vi.fn(), particles = vi.fn();
    backend.weather(weather); backend.particles(particles);
    expect(weather).toHaveBeenCalledWith(backend.context);
    expect(particles).toHaveBeenCalledWith(backend.context);
    expect(backend.context.save).toHaveBeenCalledTimes(2);
    expect(backend.context.restore).toHaveBeenCalledTimes(2);
  });
  it('validates the display before allocating backend surfaces and releases a failed world allocation', () => {
    const canvases = surfaces();
    expect(() => new UnifiedRenderer({ getContext: () => null } as unknown as HTMLCanvasElement)).toThrow('Canvas 2D unavailable');
    expect(canvases).toHaveLength(0);
    const created: Array<{ width: number; height: number }> = [];
    vi.stubGlobal('document', { createElement: () => {
      const index = created.length;
      const canvas = { width: 300, height: 150, getContext: () => index === 0 ? {} : null };
      created.push(canvas); return canvas;
    } });
    expect(() => new CanvasWorldPassBackend()).toThrow('Offscreen Canvas 2D unavailable');
    expect(created).toHaveLength(2);
    expect(created.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  it('rejects unbegun submission and samples an upscaled light plane smoothly', () => {
    surfaces();
    const backend = new CanvasWorldPassBackend();
    const draw = { source: { image: {} as CanvasImageSource, x: 0, y: 0, width: 2, height: 2 },
      destination: { x: 0, y: 0, width: 8, height: 8 } };
    expect(() => backend.chunk(draw)).toThrow('beginWorld must precede world submission');
    backend.reserve(768, 432, 1280, 720);
    backend.begin(worldPassLayout(1280, 720, 1, 2, '1x'));
    let smoothing = false;
    vi.mocked(backend.context.drawImage).mockImplementation(() => { smoothing = backend.context.imageSmoothingEnabled; });
    backend.multiplyPlane(draw);
    expect(smoothing).toBe(true);
  });
});
