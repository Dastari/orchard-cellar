import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import { createGameplayMinimap } from './gameplay-minimap-painter.js';

const terrain = vi.hoisted(() => ({ color: vi.fn(() => '#234522') }));
vi.mock('@orchard/engine/terrain', () => ({ terrainForSpace: () => ({}), terrainColorAt: terrain.color }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
type Inputs = Parameters<typeof createGameplayMinimap>[0];

function fixture() {
  const backing = { imageSmoothingEnabled: true, fillStyle: '', fillRect: vi.fn(), clearRect: vi.fn() };
  const canvas = { width: 300, height: 150, getContext: vi.fn(() => backing) };
  const create = vi.fn(() => canvas);
  vi.stubGlobal('document', { createElement: create });
  const local = { x: 0, y: 0 };
  let snapshot = { identityHex: 'test', players: { get: () => local }, worldSeed: { seed: 1, version: 1 } };
  let space = { spaceId: 0 };
  const perception = vi.fn((snapshot: unknown) => { void snapshot; return { buriedOre: [], minimapOre: [], fishingPools: [] }; });
  const input = { get latestSnapshot() { return snapshot; }, get activeSpaceDefinition() { return space; },
    CELLAR_ORE_PREVIEW_COLORS: {}, resourcePerceptionForSnapshot: perception } as unknown as Inputs;
  const draw = createGameplayMinimap(input);
  const target = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
  const rect = { x: 3.5, y: 4.25, width: 128, height: 128 };
  return { backing, canvas, create, local, target, rect, perception,
    paint: (rectangle = rect, scale = 2) => draw(target as unknown as CanvasRenderingContext2D, rectangle, scale, false),
    replaceScene: () => { space = { spaceId: 1 }; snapshot = { ...snapshot, worldSeed: { seed: 2, version: 2 } }; } };
}

describe('minimap backing lifetime', () => {
  it('repaints moving terrain and current markers for 600 frames using one canvas', () => {
    const f = fixture(); f.paint();
    const warmedRepaints = f.backing.clearRect.mock.calls.length;
    for (let frame = 1; frame <= 600; frame++) { f.local.x = frame * 16 * FIXED_UNITS_PER_PIXEL; f.paint(); }
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.backing.clearRect.mock.calls.length - warmedRepaints).toBe(600);
    expect(f.perception).toHaveBeenCalledTimes(601);
    expect(f.target.drawImage).toHaveBeenLastCalledWith(f.canvas, 3, 4);
    expect(f.canvas.width).toBe(128); expect(f.canvas.height).toBe(128);
    expect(f.backing.imageSmoothingEnabled).toBe(false);
    const repaints = f.backing.clearRect.mock.calls.length;
    for (let frame = 0; frame < 600; frame++) f.paint();
    expect(f.backing.clearRect).toHaveBeenCalledTimes(repaints);
    expect(f.target.fillRect).toHaveBeenCalledTimes(1201 * 2);
  });
  it('reuses the same backing across scene, zoom and dimension changes while clearing old contents', () => {
    const f = fixture(); f.paint(); f.replaceScene(); f.paint();
    f.paint({ ...f.rect, width: 96.25, height: 72.5 }, 3);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.canvas.width).toBe(97); expect(f.canvas.height).toBe(73);
    expect(f.backing.clearRect).toHaveBeenLastCalledWith(0, 0, 97, 73);
    expect(f.backing.clearRect).toHaveBeenCalledTimes(3);
    expect(f.perception.mock.calls[0]?.[0]).not.toBe(f.perception.mock.calls[1]?.[0]);
  });
});
