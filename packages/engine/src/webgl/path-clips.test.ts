import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldPathClips } from './path-clips.js';
import { WebGLCanvasAdapter } from './canvas-adapter.js';
function setup() {
  const context = { setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), clip: vi.fn(), fillRect: vi.fn() };
  const canvases: { width: number; height: number; getContext: () => typeof context }[] = [];
  vi.stubGlobal('document', { createElement: () => { const canvas = { width: 0, height: 0, getContext: () => context }; canvases.push(canvas); return canvas; } });
  const gl = { getParameter: () => 4096, createTexture: vi.fn(() => ({})), deleteTexture: vi.fn(), activeTexture: vi.fn(), bindTexture: vi.fn(), pixelStorei: vi.fn(), texImage2D: vi.fn(), texParameteri: vi.fn(), getError: () => 0, NO_ERROR: 0 };
  const clips = new WorldPathClips(gl as unknown as WebGL2RenderingContext);
  const path = {} as Path2D, rectangle = { x: -2, y: 5, width: 40, height: 52 };
  return { clips, gl, context, canvases, path, rectangle };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('bounded world cutaway masks', () => {
  it('reuses three masks across frames and resolves each registered path once per frame', () => {
    const { clips, path, rectangle, canvases, context } = setup();
    clips.register(path, rectangle, 0);
    const first = clips.resolve(path, 'nonzero');
    expect(clips.resolve(path, 'nonzero')).toBe(first); expect(context.clip).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 600; i++) { clips.begin(); expect(clips.resolve(path, 'nonzero').canvas).toBe(first.canvas); }
    expect(canvases).toHaveLength(1); expect(clips.canvasBytes).toBe(40 * 52 * 4);
    expect(context.translate).toHaveBeenLastCalledWith(2, -5);
  });
  it('rejects unknown, excessive and nonintegral geometry before acquiring unbounded resources', () => {
    const { clips, path, rectangle, canvases } = setup();
    expect(() => clips.resolve(path, 'evenodd')).toThrow('webgl_unsupported_clip_path');
    for (const bad of [{ ...rectangle, x: .5 }, { ...rectangle, width: 513 }, { ...rectangle, height: 2049 }, { ...rectangle, width: 0 }]) {
      expect(() => clips.register(path, bad, 0)).toThrow('webgl_clip_mask_bounds');
    }
    expect(canvases).toHaveLength(0);
    for (let i = 0; i < 3; i++) { const p = {} as Path2D; clips.register(p, rectangle, i % 2); clips.resolve(p, 'nonzero'); }
    clips.register(path, rectangle, 0);
    expect(() => clips.resolve(path, 'nonzero')).toThrow('webgl_clip_mask_budget'); expect(canvases).toHaveLength(3);
  });
  it('restores the native context on raster failure and permits full cleanup', () => {
    const { clips, path, rectangle, context } = setup(); clips.register(path, rectangle, 1);
    context.clip.mockImplementation(() => { throw new Error('clip failed'); });
    expect(() => clips.resolve(path, 'evenodd')).toThrow('clip failed'); expect(context.restore).toHaveBeenCalledOnce();
    clips.dispose(); expect(clips.bytes).toBe(0);
  });
  it('recreates texture handles after loss, then releases every resource despite a failing Canvas setter', () => {
    const { clips, path, rectangle, gl } = setup(); clips.register(path, rectangle, 0);
    const clip = clips.resolve(path, 'nonzero'); clips.bind(clip); const before = clips.bytes;
    clips.invalidate(); clips.bind(clips.resolve(path, 'nonzero'));
    expect(gl.createTexture).toHaveBeenCalledTimes(2); expect(clips.bytes).toBe(before);
    Object.defineProperty(clip.canvas, 'width', { get: () => 40, set: () => { throw new Error('width failed'); } });
    expect(() => clips.dispose()).toThrow('webgl_clip_dispose_failed');
    expect(clip.canvas.height).toBe(0); expect(gl.deleteTexture).toHaveBeenCalledOnce(); expect(clips.bytes).toBe(0);
    expect(() => clips.dispose()).not.toThrow(); expect(() => clips.resolve(path, 'nonzero')).toThrow('webgl_unsupported_clip_path');
  });
  it('restores path and rectangular clips independently and rejects nested or transformed paths', () => {
    const { clips, path, rectangle } = setup(); clips.register(path, rectangle, 0);
    const adapter = new WebGLCanvasAdapter({ canvas: {} as HTMLCanvasElement, valid: () => {}, image: vi.fn(), fill: vi.fn(), clear: vi.fn(), pathClip: (p, rule) => clips.resolve(p, rule) });
    const c = adapter.context;
    c.beginPath(); c.rect(0, 0, 100, 100); c.clip(); c.save(); c.clip(path);
    expect(adapter.snapshot().pathClip).toBeDefined(); expect(adapter.snapshot().clip).toEqual([0, 0, 100, 100]);
    expect(() => c.clip(path)).toThrow('webgl_unsupported_clip_path');
    c.restore(); expect(adapter.snapshot().pathClip).toBeUndefined();
    c.translate(1, 0); expect(() => c.clip(path)).toThrow('webgl_unsupported_clip_path');
  });
});
