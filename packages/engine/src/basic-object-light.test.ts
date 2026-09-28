/// <reference types="node" />
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { BASIC_LIGHT_BANDS, BASIC_LIGHT_WORLD_PIXELS_PER_TEXEL, BasicObjectLight, basicLightBandRadius } from './basic-object-light.js';
import type { PointLight, RgbColor } from './lighting.js';

// BUG-061 (owner approved 2026-09-28, "ship as shown"): Basic lighting keeps object light as hard-edged, two-band pools.
// The oracle is the approved look's definition, written out independently: per 4-world-pixel texel, the ambient or the
// brightest band covering the texel's centre row span, multiplied onto the world with nearest-neighbour upscaling.

const W = 96, H = 64, SCALE = 2, WORLD = { r: 200, g: 200, b: 200 };
const NIGHT: RgbColor = { r: 60, g: 62, b: 80 };
const torch = (worldX: number, worldY: number, extra: Partial<PointLight> = {}): PointLight => ({ worldX, worldY, radiusTiles: 2, color: { r: 255, g: 176, b: 84 }, ...extra });
const newLight = () => new BasicObjectLight((width, height) => createCanvas(width, height) as unknown as HTMLCanvasElement);

function render(lights: readonly PointLight[], cameraX = 0, cameraY = 0, ambient = NIGHT, light = newLight()): Canvas {
  const canvas = createCanvas(W, H), context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  context.fillStyle = `rgb(${WORLD.r}, ${WORLD.g}, ${WORLD.b})`; context.fillRect(0, 0, W, H);
  light.composite(context, W, H, SCALE, cameraX, cameraY, ambient, lights);
  return canvas;
}
const pixel = (canvas: Canvas, x: number, y: number) => { const d = canvas.getContext('2d').getImageData(x, y, 1, 1).data; return [d[0]!, d[1]!, d[2]!]; };

/** The approved look, independently: the light colour a texel (column, row in world texels) receives. */
function oracleTexel(tx: number, ty: number, lights: readonly PointLight[], ambient: RgbColor): number[] {
  const texel = BASIC_LIGHT_WORLD_PIXELS_PER_TEXEL;
  let best = [ambient.r, ambient.g, ambient.b];
  for (const light of lights) {
    const intensity = (light.intensityPerMille ?? 1000) / 1000 * (light.strengthPerMille ?? 1000) / 1000;
    const radius = light.radiusTiles * 16 / texel, cx = light.worldX / texel, cy = light.worldY / texel;
    for (const band of BASIC_LIGHT_BANDS) {
      const r = radius * basicLightBandRadius(band.threshold, intensity);
      const dy = ty + 0.5 - cy, half = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (r < 0.5 || half <= 0) continue;
      if (tx >= Math.round(cx - half) && tx < Math.round(cx + half)) {
        const level = Math.min(1, band.level * Math.max(1, intensity));
        const c = [Math.round(light.color.r * level), Math.round(light.color.g * level), Math.round(light.color.b * level)];
        best = best.map((value, i) => Math.max(value, c[i]!));
      }
    }
  }
  return best;
}
/** The expected screen pixel: the world colour multiplied by its texel's light (world pixel = screen / SCALE + camera). */
function oracle(x: number, y: number, lights: readonly PointLight[], cameraX = 0, cameraY = 0, ambient = NIGHT): number[] {
  const texel = BASIC_LIGHT_WORLD_PIXELS_PER_TEXEL;
  const light = oracleTexel(Math.floor((x / SCALE + cameraX) / texel), Math.floor((y / SCALE + cameraY) / texel), lights, ambient);
  return [WORLD.r, WORLD.g, WORLD.b].map((w, i) => Math.round(w * light[i]! / 255));
}
const near = (actual: number[], expected: number[]) => actual.every((v, i) => Math.abs(v - expected[i]!) <= 1);

describe('BUG-061: Basic lighting keeps object light as hard-edged pools', () => {
  it('draws the approved stepped two-band pool, pixel for pixel', () => {
    const lights = [torch(24, 16)];
    const canvas = render(lights);
    const mismatches: string[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const actual = pixel(canvas, x, y), expected = oracle(x, y, lights);
      if (!near(actual, expected)) mismatches.push(`${x},${y}: ${actual} vs ${expected}`);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    // Both bands and the ambient appear.
    const centre = pixel(canvas, 24 * SCALE, 16 * SCALE), edge = pixel(canvas, (24 - 14) * SCALE, 16 * SCALE), dark = pixel(canvas, 90, 60);
    expect(new Set([centre, edge, dark].map(String)).size).toBe(3);
  });

  it('is hard-edged and stepped: only whole-texel blocks of ambient or a band colour, no feathering', () => {
    const lights = [torch(24, 16), torch(30, 20, { color: { r: 255, g: 217, b: 160 }, intensityPerMille: 3500, radiusTiles: 1 })];
    const canvas = render(lights), block = BASIC_LIGHT_WORLD_PIXELS_PER_TEXEL * SCALE;
    const colours = new Set<string>();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const value = pixel(canvas, x, y); colours.add(String(value));
      // Every screen pixel equals the top-left pixel of its texel block: no gradient inside a texel.
      expect(pixel(canvas, x - x % block, y - y % block), `${x},${y}`).toEqual(value);
    }
    // Ambient, plus at most two bands per light: a handful of flat colours, not a gradient.
    expect(colours.size).toBeLessThanOrEqual(1 + BASIC_LIGHT_BANDS.length * lights.length);
  });

  it('anchors pools to the world: a camera move shifts them on screen, the world texel keeps its light', () => {
    const lights = [torch(40, 24)];
    const still = render(lights, 0, 0), moved = render(lights, 4, 8);
    for (const [wx, wy] of [[40, 24], [34, 24], [40, 30], [20, 10]] as const) {
      expect(pixel(moved, (wx - 4) * SCALE, (wy - 8) * SCALE), `${wx},${wy}`).toEqual(pixel(still, wx * SCALE, wy * SCALE));
    }
    // A sub-texel camera move keeps the grid on the world too.
    const sub = render(lights, 1, 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) expect(near(pixel(sub, x, y), oracle(x, y, lights, 1, 0))).toBe(true);
  });

  it('where pools overlap, the brighter wins per channel (no additive blow-out)', () => {
    const warm = torch(24, 16, { color: { r: 255, g: 100, b: 40 } }), cool = torch(27, 16, { color: { r: 80, g: 160, b: 255 } });
    const both = render([warm, cool]), only = (light: PointLight) => render([light]);
    const x = 26 * SCALE, y = 16 * SCALE, a = pixel(only(warm), x, y), b = pixel(only(cool), x, y);
    expect(pixel(both, x, y)).toEqual(a.map((v, i) => Math.max(v, b[i]!)));
  });

  it('keeps each source\'s reach: a bright streetlamp gets a wide flat pool, a torch a small one', () => {
    expect(basicLightBandRadius(0.75, 1)).toBeCloseTo(0.25); expect(basicLightBandRadius(0.4, 1)).toBeCloseTo(0.6);
    expect(basicLightBandRadius(0.75, 3.5)).toBeCloseTo(1 - 0.75 / 3.5); expect(basicLightBandRadius(0.4, 0)).toBe(0);
  });

  it('does nothing by day and darkens evenly with no lights, like Basic before', () => {
    const day = render([torch(24, 16)], 0, 0, { r: 255, g: 255, b: 255 });
    expect(pixel(day, 48, 32)).toEqual([WORLD.r, WORLD.g, WORLD.b]);
    const night = render([]);
    for (const [x, y] of [[0, 0], [48, 32], [95, 63]] as const) expect(near(pixel(night, x, y), oracle(x, y, []))).toBe(true);
  });

  it('reuses its buffer while nothing changes, and repaints when a light or the camera texel moves', () => {
    const light = newLight(), lights = [torch(24, 16)];
    const first = render(lights, 0, 0, NIGHT, light), again = render(lights, 0, 0, NIGHT, light);
    expect(again.toBuffer('image/png').equals(first.toBuffer('image/png'))).toBe(true);
    const movedLight = render([torch(32, 16)], 0, 0, NIGHT, light);
    expect(near(pixel(movedLight, 32 * SCALE, 16 * SCALE), oracle(32 * SCALE, 16 * SCALE, [torch(32, 16)]))).toBe(true);
    expect(near(pixel(movedLight, 20 * SCALE, 16 * SCALE), oracle(20 * SCALE, 16 * SCALE, [torch(32, 16)]))).toBe(true);
  });
});
