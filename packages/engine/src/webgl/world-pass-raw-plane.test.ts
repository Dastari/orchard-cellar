import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RawReceiverField } from '../receiver-raw-field.js';
import { worldPassLayout } from '../renderer.js';
import { WebGLWorldPassBackend } from './world-pass-webgl.js';

function fixture() {
  const calls = { NO_ERROR: 0, getError: () => 0, getParameter: () => 4096, getExtension: () => null,
    isContextLost: () => false, createTexture: vi.fn(() => ({})), createBuffer: () => ({}), createVertexArray: () => ({}),
    createProgram: () => ({}), createShader: () => ({}), getShaderParameter: () => true, getProgramParameter: () => true,
    getUniformLocation: () => ({}), texImage2D: vi.fn(), bufferSubData: vi.fn(), drawArrays: vi.fn() };
  const constants = new Map<PropertyKey, number>(), noop = () => {};
  const gl = new Proxy(calls, { get(target, key) {
    if (key in target) return target[key as keyof typeof target];
    if (typeof key === 'string' && /^[A-Z0-9_]+$/.test(key)) {
      if (!constants.has(key)) constants.set(key, constants.size + 1);
      return constants.get(key);
    }
    return noop;
  } });
  class Canvas {
    width = 1; height = 1;
    getContext(kind: string) { return kind === 'webgl2' ? gl : { fillRect() {} }; }
    addEventListener() {} removeEventListener() {}
  }
  const create = vi.fn(() => new Canvas());
  vi.stubGlobal('HTMLCanvasElement', Canvas); vi.stubGlobal('document', { createElement: create });
  const backend = new WebGLWorldPassBackend(), layout = worldPassLayout(64, 32, 1, 1, '1x');
  backend.reserve(64, 32, 0, 0); backend.begin(layout);
  const field: RawReceiverField = { left: -4, top: -4, width: 19, height: 11, step: 4, revision: 1,
    coverage: { sun: new Uint8Array(209), moon: new Uint8Array(209), contact: new Uint8Array(209) },
    localPixels: new Uint8ClampedArray(836), diffuse: { r: 40, g: 60, b: 80 },
    sunLight: { r: 200, g: 180, b: 150 }, moonLight: { r: 80, g: 100, b: 120 } };
  const rect = { x: -4.25, y: -4.5, width: 76, height: 44 };
  return { backend, field, rect, calls, create, layout, Canvas };
}
afterEach(() => vi.unstubAllGlobals());

describe('qualified raw ground-plane submission', () => {
  it('submits raw fields with full plane UVs and retains textures for 600 frames', () => {
    const f = fixture();
    try {
      f.backend.multiplyRawLightPlane(f.field, f.rect); f.backend.flush();
      const before = f.backend.diagnostics, surfaces = f.create.mock.calls.length;
      const vertices = f.calls.bufferSubData.mock.calls[0]![2] as Float32Array;
      expect([...vertices.slice(0, 2)]).toEqual([-4.25, -4.5]);
      expect([...vertices.slice(8, 11)]).toEqual([0, 0, 5]);
      expect([...vertices.slice(19, 22)]).toEqual([1, 0, 5]);
      for (let frame = 0; frame < 600; frame++) {
        f.backend.begin(f.layout); f.backend.multiplyRawLightPlane(f.field, f.rect); f.backend.flush();
      }
      expect(f.backend.diagnostics.textureUploads).toBe(before.textureUploads);
      expect(f.backend.bytes).toBe(before.bytes); expect(f.create).toHaveBeenCalledTimes(surfaces);
      f.field.revision++; f.field.localPixels[0] = 240;
      f.backend.multiplyRawLightPlane(f.field, f.rect); f.backend.flush();
      expect(f.backend.diagnostics.textureUploads - before.textureUploads).toBe(4);
    } finally { f.backend.dispose(); }
    expect(f.backend.bytes).toBe(0); expect(f.backend.diagnostics.textures).toBe(0);
  });
  it('restores painter state when a raw-field upload fails', () => {
    const f = fixture(), context = f.backend.context;
    context.globalCompositeOperation = 'source-over'; context.imageSmoothingEnabled = true; context.globalAlpha = 0.75;
    f.backend.multiplyRawLightPlane(f.field, f.rect); f.backend.flush(); f.field.revision++;
    f.calls.texImage2D.mockImplementationOnce(() => { throw new Error('upload-failed'); });
    try {
      expect(() => f.backend.multiplyRawLightPlane(f.field, f.rect)).toThrow('upload-failed');
      expect(context.globalCompositeOperation).toBe('source-over'); expect(context.imageSmoothingEnabled).toBe(true);
      expect(context.globalAlpha).toBe(0.75);
    } finally { f.backend.dispose(); }
    expect(f.backend.bytes).toBe(0);
  });
  it('keeps unsupported source downsampling and filter rejection after a qualified plane', () => {
    const f = fixture();
    try {
      f.backend.multiplyRawLightPlane(f.field, f.rect);
      const image = new f.Canvas(); image.width = image.height = 16;
      expect(() => f.backend.context.drawImage(image as unknown as CanvasImageSource, 0, 0, 8, 8)).toThrow('webgl_accuracy_unverified_downsample');
      expect(() => { f.backend.context.filter = 'brightness(1.15)'; }).toThrow('webgl_unsupported_canvas_property:filter');
    } finally { f.backend.dispose(); }
    expect(() => f.backend.multiplyRawLightPlane(f.field, f.rect)).toThrow('webgl_disposed');
  });
});
