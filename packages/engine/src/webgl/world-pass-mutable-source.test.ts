import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { worldPassLayout } from '../renderer.js';
vi.mock('./shaders.js', () => ({ createWorldProgram: () => ({ program: {} }) }));
import { WebGLWorldPassBackend } from './world-pass-webgl.js';

const events: string[] = [];
let uploaded = '';
const gl = {
  TEXTURE0: 10, TEXTURE1: 11, TEXTURE_2D: 1, RGBA: 2, UNSIGNED_BYTE: 3,
  MAX_TEXTURE_SIZE: 4, NO_ERROR: 0,
  createTexture: () => ({}), createBuffer: () => ({}), createVertexArray: () => ({}),
  getParameter: () => 4096, getExtension: () => null, getError: () => 0,
  isContextLost: () => false,
  texImage2D: (...args: unknown[]) => {
    uploaded = (args.at(-1) as TestCanvas).pixels;
    events.push(`upload:${uploaded}`);
  },
  drawArrays: () => events.push(`draw:${uploaded}`),
};
for (const name of ['deleteTexture', 'activeTexture', 'bindTexture', 'pixelStorei',
  'texParameteri', 'bindVertexArray', 'bindBuffer', 'bufferData', 'enableVertexAttribArray',
  'vertexAttribPointer', 'disable', 'enable', 'useProgram', 'uniform2f', 'viewport',
  'uniform1i', 'uniform1f', 'blendEquation', 'blendFunc', 'bufferSubData',
  'clearColor', 'clear', 'deleteBuffer', 'deleteVertexArray', 'deleteProgram']) {
  Object.defineProperty(gl, name, { value: () => {} });
}
class TestCanvas {
  width = 32; height = 32; pixels = 'red';
  getContext(kind: string) { return kind === 'webgl2' ? gl : { fillRect() {} }; }
  addEventListener() {}
  removeEventListener() {}
}
class TestOffscreenCanvas { width = 32; height = 32; pixels = 'red'; }
function begin() {
  const backend = new WebGLWorldPassBackend();
  backend.reserve(64, 32, 0, 0);
  backend.begin(worldPassLayout(64, 32, 1, 1, '1x'));
  return backend;
}
beforeEach(() => {
  events.length = 0; uploaded = '';
  vi.stubGlobal('HTMLCanvasElement', TestCanvas);
  vi.stubGlobal('OffscreenCanvas', TestOffscreenCanvas);
  vi.stubGlobal('document', { createElement: () => new TestCanvas() });
});
afterEach(() => vi.unstubAllGlobals());

describe('mutable world source submission', () => {
  it.each([TestCanvas, TestOffscreenCanvas])('flushes old pixels before uploading a rewritten %s', Canvas => {
    const backend = begin(), source = new Canvas();
    try {
      backend.context.drawImage(source as unknown as CanvasImageSource, 0, 0);
      source.pixels = 'blue';
      backend.context.drawImage(source as unknown as CanvasImageSource, 32, 0);
      backend.flush();
      expect(events).toEqual(['upload:red', 'draw:red', 'upload:blue', 'draw:blue']);
      expect(backend.diagnostics.textureUploads).toBe(2);
    } finally { backend.dispose(); }
    expect(backend.bytes).toBe(0);
  });
  it('retains explicitly versioned sources until their producer changes revision', () => {
    const backend = begin(), image = new TestCanvas();
    const source = { image: image as unknown as CanvasImageSource, x: 0, y: 0, width: 32, height: 32 };
    const draw = (revision: number) => {
      backend.associateSource(source, { revision });
      backend.context.drawImage(source.image, 0, 0, 32, 32, 0, 0, 32, 32);
    };
    try {
      draw(1); draw(1); backend.flush();
      image.pixels = 'blue'; draw(2); backend.flush();
      expect(events).toEqual(['upload:red', 'draw:red', 'upload:blue', 'draw:blue']);
      expect(backend.diagnostics.textureUploads).toBe(2);
    } finally { backend.dispose(); }
  });
  it('does not collide with an explicit revision when submission becomes unversioned', () => {
    const backend = begin(), image = new TestCanvas();
    const source = { image: image as unknown as CanvasImageSource, x: 0, y: 0, width: 32, height: 32 };
    try {
      backend.associateSource(source, { revision: 1 });
      backend.context.drawImage(source.image, 0, 0, 32, 32, 0, 0, 32, 32);
      image.pixels = 'blue'; backend.context.drawImage(source.image, 32, 0); backend.flush();
      expect(events).toEqual(['upload:red', 'draw:red', 'upload:blue', 'draw:blue']);
    } finally { backend.dispose(); }
  });
});
