import { expect, it } from 'vitest';
import { WebGLWorldPassBackend, type WebGLSourceOptions } from './world-pass-webgl.js';
import { WorldGeometry } from './geometry.js';

it.each(['rgb', 'ground', 'rotated-ground'] as const)('partitions %s emission without overlap, retaining alpha and ground coordinates', mode => {
  const backend = Object.create(WebGLWorldPassBackend.prototype) as WebGLWorldPassBackend;
  const geometry = Object.create(WorldGeometry.prototype) as WorldGeometry;
  const vertices = new Float32Array(1024);
  Reflect.set(geometry, 'vertices', vertices); Reflect.set(geometry, 'count', 0);
  Reflect.set(backend, 'geometry', geometry);
  Reflect.set(backend, 'requireFrame', () => {});
  Reflect.set(backend, 'select', () => ({ width: 4, height: 4 }));
  Reflect.set(backend, 'options', { allowUnverifiedLighting: true });
  const image = {} as CanvasImageSource;
  const source = { image, x: 0, y: 0, width: 4, height: 4, emissiveSpans: [1, 1, 2] };
  const basis = mode === 'rotated-ground' ? { a: 0, b: -2, c: -2, d: 0 } : undefined;
  const options: WebGLSourceOptions = mode === 'rgb' ? { receiverRgb: { r: 32, g: 32, b: 32 }, revision: 0 }
    : { ground: { field: { left: 0, top: 0, width: 100, height: 100, step: 1 } as never,
      worldX: 40, worldY: 50, ...(basis ? { basis } : {}) }, revision: 0 };
  Reflect.set(backend, 'pending', { source, options });
  Reflect.get(backend, 'image').call(backend, image, [0, 0, 4, 4, 0, 0, 4, 4], {
    matrix: [1, 0, 0, 1, 0, 0], alpha: .5, composite: 'source-over', smooth: false, clip: null,
  });
  const count = Reflect.get(geometry, 'count') as number;
  const coverage = Array.from({ length: 16 }, () => [] as number[]);
  for (let i = 0; i < count; i += 6) {
    const x = vertices[i * 11]!, y = vertices[i * 11 + 1]!;
    const right = vertices[(i + 1) * 11]!, bottom = vertices[(i + 2) * 11 + 1]!;
    const operation = vertices[i * 11 + 10]!;
    for (let py = y; py < bottom; py++) for (let px = x; px < right; px++) coverage[py * 4 + px]!.push(operation);
    for (let j = i; j < i + 6; j++) {
      expect(vertices[j * 11 + 7]).toBe(.5);
      if (mode !== 'rgb') {
        const vx = vertices[j * 11]!, vy = vertices[j * 11 + 1]!;
        expect(vertices[j * 11 + 8]).toBeCloseTo((40 + vx * (basis?.a ?? 1) + vy * (basis?.c ?? 0)) / 100);
        expect(vertices[j * 11 + 9]).toBeCloseTo((50 + vx * (basis?.b ?? 0) + vy * (basis?.d ?? 1)) / 100);
      }
    }
  }
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++)
    expect(coverage[y * 4 + x]).toEqual([y === 1 && (x === 1 || x === 2) ? 4 : mode === 'rgb' ? 1 : 2]);
});
