import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedRenderer } from '@orchard/engine/renderer';
import { CanvasWorldPassBackend } from '@orchard/engine/world-pass-canvas';
import { RenderMetrics } from '@orchard/engine/metrics';
import { GameplayWorldBackend } from './gameplay-world-backend.js';

const controllers: GameplayWorldBackend[] = [];
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('document', { createElement: () => ({ width: 300, height: 150,
    getContext: () => ({ setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn() }) }) });
});
afterEach(() => { for (const controller of controllers) controller.dispose(); controllers.length = 0; vi.unstubAllGlobals(); });
function gpu() {
  return { kind: 'webgl2' as const, width: 4096, height: 2304, bytes: 1234, presentBytes: 0,
    context: {} as CanvasRenderingContext2D, reserve: vi.fn(), begin: vi.fn(), composite: vi.fn(), dispose: vi.fn(),
    sprite: vi.fn(), chunk: vi.fn(), capRun: vi.fn(), multiplyPlane: vi.fn(), weather: vi.fn(), particles: vi.fn(),
    diagnostics: { contextLost: false, restoreFailure: null as string | null,
      gpuTimingAvailable: false, gpuTimeMs: null, gpuCompletedSamples: 0, gpuDisjointSamples: 0,
      gpuPendingQueries: 0, gpuQueries: 0, textures: 2, textureBytes: 100, textureUploads: 2,
      buffers: 1, programs: 1, vertexArrays: 1, drawCalls: 2, bytes: 1234 } };
}
function setup(load: () => Promise<() => ReturnType<typeof gpu>>) {
  const renderer = new UnifiedRenderer(document.createElement('canvas'));
  const metrics = new RenderMetrics();
  const controller = new GameplayWorldBackend(renderer, load, () => new CanvasWorldPassBackend(), metrics);
  controllers.push(controller); return { renderer, controller, metrics };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
describe('experimental world backend session policy', () => {
  it('loads lazily and changes only at a frame boundary; switching off disposes GPU resources', async () => {
    const candidate = gpu(), load = vi.fn(async () => () => candidate);
    const { renderer, controller, metrics } = setup(load);
    expect(load).not.toHaveBeenCalled(); controller.request(true); await settle();
    expect(renderer.worldPassBackend).toBe('canvas2d'); renderer.beginWorld(2);
    expect(renderer.worldPassBackend).toBe('webgl2');
    expect(metrics.snapshot().worldPass).toMatchObject({ backend: 'webgl2', gpu: { textures: 2 } });
    const state = candidate.diagnostics;
    Object.defineProperty(candidate, 'diagnostics', { get: () => ({ ...state }) });
    candidate.composite.mockImplementation(() => { state.drawCalls = 7; });
    renderer.compositeWorld();
    expect(metrics.snapshot().worldPass.gpu?.drawCalls).toBe(7);
    controller.request(false); expect(candidate.dispose).not.toHaveBeenCalled(); renderer.beginWorld(2);
    expect(renderer.worldPassBackend).toBe('canvas2d'); expect(candidate.dispose).toHaveBeenCalledOnce();
  });
  it('ignores a stale module load after disabling or disposing the owner', async () => {
    let resolve!: (factory: () => ReturnType<typeof gpu>) => void;
    const factory = vi.fn(gpu), pending = new Promise<() => ReturnType<typeof gpu>>(done => { resolve = done; });
    const { renderer, controller } = setup(() => pending);
    controller.request(true); controller.request(false); resolve(factory); await settle(); renderer.beginWorld(2);
    expect(factory).not.toHaveBeenCalled();
    controller.request(true); controller.dispose(); await settle(); renderer.beginWorld(2);
    expect(factory).not.toHaveBeenCalled();
  });
  it.each(['webgl2_unavailable', 'webgl_shader_compile_failed', 'webgl_program_link_failed',
    'webgl_required_extension_missing', 'webgl_texture_upload_error', 'arbitrary backend throw'])('latches Canvas after %s', async reason => {
    const load = vi.fn(async () => () => { throw new Error(reason); });
    const { renderer, controller } = setup(load);
    controller.request(true); await settle(); renderer.beginWorld(2);
    expect(renderer.worldPassBackend).toBe('canvas2d'); expect(controller.fallbackReason).toBe(reason);
    controller.request(false); controller.request(true); await settle(); renderer.beginWorld(2);
    expect(load).toHaveBeenCalledOnce();
  });
  it('contains failed imports and failed candidate reservation without replacing Canvas', async () => {
    const first = setup(async () => { throw new Error('module fetch failed'); });
    first.controller.request(true); await settle();
    expect(first.controller.fallbackReason).toBe('module fetch failed');
    const candidate = gpu(); candidate.reserve.mockImplementation(() => { throw new Error('allocation failed'); });
    const second = setup(async () => () => candidate);
    second.controller.request(true); await settle(); second.renderer.beginWorld(2);
    expect(second.renderer.worldPassBackend).toBe('canvas2d'); expect(candidate.dispose).toHaveBeenCalledOnce();
    expect(second.controller.fallbackReason).toBe('allocation failed');
  });
  it('allows restoration before the next boundary; otherwise falls back within that frame', async () => {
    const candidate = gpu(), { renderer, controller } = setup(async () => () => candidate);
    controller.request(true); await settle(); renderer.beginWorld(2);
    candidate.diagnostics.contextLost = true; candidate.diagnostics.contextLost = false;
    renderer.beginWorld(2); expect(renderer.worldPassBackend).toBe('webgl2');
    candidate.diagnostics.contextLost = true; renderer.beginWorld(2);
    expect(renderer.worldPassBackend).toBe('canvas2d'); expect(controller.fallbackReason).toBe('webgl_context_lost');
  });
  it('reports restoration failure and completes fallback despite failed GPU disposal', async () => {
    const candidate = gpu(), { renderer, controller } = setup(async () => () => candidate);
    controller.request(true); await settle(); renderer.beginWorld(2);
    candidate.diagnostics.restoreFailure = 'webgl_restore_failed';
    candidate.dispose.mockImplementation(() => { throw new Error('delete failed'); });
    expect(() => renderer.beginWorld(2)).not.toThrow();
    expect(renderer.worldPassBackend).toBe('canvas2d'); expect(controller.fallbackReason).toBe('webgl_restore_failed');
  });
  it('retries a failed world draw but does not misclassify a later HUD failure', async () => {
    const candidate = gpu(), { renderer, controller } = setup(async () => () => candidate);
    controller.request(true); await settle(); renderer.beginWorld(2); renderer.compositeWorld();
    expect(controller.fallback(new Error('HUD failure'))).toBe(false);
    renderer.beginWorld(2); expect(controller.fallback(new Error('world draw failure'))).toBe(true);
    expect(renderer.worldPassBackend).toBe('canvas2d');
  });
});
