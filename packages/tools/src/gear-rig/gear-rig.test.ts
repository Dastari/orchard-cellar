import { describe, expect, it } from 'vitest';
import { HEAD_DESIGNS, PAULDRON, paint } from './designs.js';
import { flipVertical, rotateQuarter, uprightFromDiagonal } from './held.js';
import { MATERIALS, WORN_OUTLINE, rampSwap } from './materials.js';
import { Raster } from './raster.js';

const ramps = { primary: MATERIALS.iron, accent: MATERIALS.gold, detail: MATERIALS.ruby };

describe('gear rig designs', () => {
  it('authors every head part as a rectangular grid of known roles in all three facings', () => {
    for (const design of HEAD_DESIGNS) {
      for (const facing of ['down', 'right', 'up'] as const) {
        expect(design.parts[facing].length, `${design.name} ${facing}`).toBeGreaterThan(0);
        for (const part of design.parts[facing]) {
          const widths = new Set(part.grid.map((row) => row.length));
          expect(widths.size, `${design.name} ${facing} rows`).toBe(1);
          expect(part.grid.join('')).toMatch(/^[.o0-4A-EP-T]+$/);
          expect(() => paint(part.grid, ramps)).not.toThrow();
        }
      }
    }
    expect(new Set(PAULDRON.map((row) => row.length)).size).toBe(1);
  });

  it('paints roles from the requested ramps', () => {
    const image = paint(['o0A', 'P4E'], ramps);
    expect(image.hex(0, 0)).toBe(WORN_OUTLINE);
    expect(image.hex(1, 0)).toBe(MATERIALS.iron[0]);
    expect(image.hex(2, 0)).toBe(MATERIALS.gold[0]);
    expect(image.hex(0, 1)).toBe(MATERIALS.ruby[0]);
    expect(image.hex(1, 1)).toBe(MATERIALS.iron[4]);
    expect(image.hex(2, 1)).toBe(MATERIALS.gold[4]);
    expect(() => paint(['x'], ramps)).toThrow(/Unknown role/);
  });

  it('swaps a worn layer between materials index for index', () => {
    const swap = rampSwap(MATERIALS.iron, MATERIALS.frost);
    expect(swap.get(MATERIALS.iron[3])).toBe(MATERIALS.frost[3]);
    expect(swap.size).toBe(5);
  });
});

describe('gear rig held items', () => {
  it('stands a 45° one-pixel shaft upright without gaps and keeps a crossguard horizontal', () => {
    const icon = new Raster(16, 16);
    for (let step = 0; step < 12; step += 1) icon.set(2 + step, 13 - step, '#c0cbdc');
    // A crossguard perpendicular to the shaft near the grip.
    for (const [x, y] of [[3, 10], [4, 11], [6, 13], [7, 14]] as const) icon.set(x, y, '#feae34');
    const upright = uprightFromDiagonal(icon);
    const bounds = upright.bounds()!;
    const shaftColumns = new Set<number>();
    for (let y = 0; y < upright.height; y += 1) {
      for (let x = 0; x < upright.width; x += 1) if (upright.hex(x, y) === '#c0cbdc') shaftColumns.add(x);
    }
    expect(shaftColumns.size).toBe(1);
    const column = [...shaftColumns][0]!;
    // The guard crosses the shaft; together they form one unbroken column.
    const itemRows: number[] = [];
    for (let y = 0; y < upright.height; y += 1) {
      if (['#c0cbdc', '#feae34'].includes(upright.hex(column, y) ?? '')) itemRows.push(y);
    }
    expect(itemRows.at(-1)! - itemRows[0]! + 1).toBe(itemRows.length);
    expect(bounds.height).toBeGreaterThanOrEqual(12);
    const guardRows = new Set<number>();
    for (let y = 0; y < upright.height; y += 1) {
      for (let x = 0; x < upright.width; x += 1) if (upright.hex(x, y) === '#feae34') guardRows.add(y);
    }
    expect(guardRows.size).toBe(1);
  });

  it('turns and flips sprites exactly', () => {
    const image = new Raster(3, 2);
    image.set(0, 0, '#ff0000');
    const turned = rotateQuarter(image);
    expect([turned.width, turned.height]).toEqual([2, 3]);
    expect(turned.hex(1, 0)).toBe('#ff0000');
    expect(flipVertical(image).hex(0, 1)).toBe('#ff0000');
  });
});
