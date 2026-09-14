import { expect, it, vi } from 'vitest';
import { MinimapRaster, type MinimapRasterModel } from './minimap.js';
import type { TerrainArray } from './terrain.js';

function fixture() {
  const terrain: TerrainArray = { spaceId: 1, seed: 1, version: 1, width: 4, height: 4,
    biomes: new Uint8Array(16), blocked: [], horseJumpableTerrain: [], elevations: new Int16Array(16),
    dirtCliffRoles: new Uint8Array(16), dirtTerraces: new Uint8Array(16) };
  const paint = { fillStyle: '', imageSmoothingEnabled: true, fillRect: vi.fn() };
  const create = vi.fn(() => ({ width: 0, height: 0, getContext: () => paint }) as unknown as HTMLCanvasElement);
  const pixels: { color: string; rect: number[] }[] = [];
  const target = { fillStyle: '', imageSmoothingEnabled: true, save: vi.fn(), restore: vi.fn(),
    beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), drawImage: vi.fn(),
    fillRect(...rect: number[]) { pixels.push({ color: this.fillStyle, rect }); } };
  const raster = new MinimapRaster(create);
  const rect = { x: 10, y: 20, width: 40, height: 30 };
  const model: MinimapRasterModel = { terrain, revision: '1', center: { x: 16, y: 16 }, pixelsPerTile: 2, markers: [] };
  return { raster, create, paint, pixels, target, context: target as unknown as CanvasRenderingContext2D, rect, model };
}

it('reuses terrain across marker movement and invalidates on tile, zoom, viewport or terrain changes', () => {
  const f = fixture();
  f.raster.draw(f.context, f.rect, f.model);
  f.raster.draw(f.context, f.rect, { ...f.model, center: { x: 17, y: 17 }, markers: [{ x: 17, y: 17, kind: 'self' }] });
  expect(f.create).toHaveBeenCalledTimes(1);
  for (const model of [
    { ...f.model, center: { x: 32, y: 16 } },
    { ...f.model, pixelsPerTile: 3 },
    { ...f.model, revision: '2' },
    { ...f.model, terrain: { ...f.model.terrain } },
  ]) f.raster.draw(f.context, f.rect, model);
  expect(f.create).toHaveBeenCalledTimes(5);
  f.raster.draw(f.context, { ...f.rect, width: 60 }, f.model);
  expect(f.create).toHaveBeenCalledTimes(6);
  f.raster.dispose(); f.raster.draw(f.context, f.rect, f.model);
  expect(f.create).toHaveBeenCalledTimes(7);
});

it('projects semantic markers and clips edge outlines to the viewport', () => {
  const f = fixture();
  f.raster.draw(f.context, f.rect, { ...f.model, markers: [
    { x: 16, y: 16, kind: 'self' }, { x: 32, y: 16, kind: 'player' },
    { x: 16, y: 32, kind: 'npc' }, { x: 10000, y: 10000, kind: 'npc' },
  ] });
  expect(f.target.rect).toHaveBeenCalledWith(10, 20, 40, 30);
  expect(f.target.clip).toHaveBeenCalledOnce(); expect(f.target.restore).toHaveBeenCalledOnce();
  expect(f.pixels.filter(pixel => pixel.color !== '#2b1914')).toEqual([
    { color: '#fff3be', rect: [28, 33, 4, 4] },
    { color: '#64b7e8', rect: [31, 34, 3, 3] },
    { color: '#f1b34b', rect: [29, 36, 3, 3] },
  ]);
});

it('aligns the center terrain tile with marker coordinates when viewport dimensions are not tile multiples', () => {
  const f = fixture();
  f.raster.draw(f.context, f.rect, f.model);
  // Center tile (1, 1) is column 10, row 8 in this 2px raster.
  const columns = Math.ceil(f.rect.width / f.model.pixelsPerTile) + 2;
  expect(f.paint.fillRect.mock.calls[8 * columns + 10]).toEqual([20, 15, 2, 2]);
  expect(f.paint.fillRect.mock.calls[0]).toEqual([0, -1, 2, 2]);
});
