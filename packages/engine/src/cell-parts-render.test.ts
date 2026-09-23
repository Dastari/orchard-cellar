import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMapEdit,
  createEmptyMapDocument,
  type MapCellPatch,
  type MapDocumentV2,
} from '@orchard/sim';
import type { LoadedAsset } from '@orchard/ui';
import { terrainArrayForMapDocument } from './editor-terrain.js';
import { exactGroundPartsAt, GroundChunkCache } from './ground-cache.js';
import type { OverworldArt } from './overworld-art.js';

/** Minimal atlas: 128 base frames laid out in one 16px row. */
function fakeAsset(name: string): LoadedAsset {
  const frames = Array.from({ length: 128 }, (_, index) => ({ x: index * 16, y: 0, width: 16, height: 16 }));
  return {
    image: { name } as unknown as CanvasImageSource,
    anchor: [8, 15],
    metadata: { animations: {}, variants: { base: frames } },
  } as unknown as LoadedAsset;
}

function fakeArt(): OverworldArt {
  const assets = new Map<string, LoadedAsset>();
  const asset = (name: string): LoadedAsset => {
    let value = assets.get(name);
    if (value === undefined) { value = fakeAsset(name); assets.set(name, value); }
    return value;
  };
  const named: Record<string, string> = {
    dirtTerrace: 'tile_cf_path', dirtCliffEdge: 'tile_cf_grass_dirt_cliff_edge', farmland: 'tile_cf_farmland',
    freshwater: 'tile_cf_freshwater', farmlandGrassInset: 'tile_cf_farmland_grass_inset', grass: 'tile_cf_grass',
  };
  const terrainAssets = new Proxy({}, { get: (_target, key) => typeof key === 'string' ? asset(key) : undefined });
  return new Proxy({}, {
    get: (_target, key) => key === 'terrainAssets' ? terrainAssets
      : typeof key === 'string' ? asset(named[key] ?? `art_${key}`) : undefined,
  }) as OverworldArt;
}

interface DrawCall { readonly asset: string; readonly frame: number; readonly x: number; readonly y: number }

function renderTile(document: MapDocumentV2, tileX: number, tileY: number): readonly string[] {
  const calls: DrawCall[] = [];
  const context = {
    imageSmoothingEnabled: false, fillStyle: '', fillRect: vi.fn(),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
    drawImage: (image: { name: string }, sx: number, _sy: number, _sw: number, _sh: number, dx: number, dy: number) => {
      calls.push({ asset: image.name, frame: sx / 16, x: dx, y: dy });
    },
  };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  const cache = new GroundChunkCache() as unknown as {
    renderChunk: (art: OverworldArt, terrain: ReturnType<typeof terrainArrayForMapDocument>, x: number, y: number) => unknown;
  };
  cache.renderChunk(fakeArt(), terrainArrayForMapDocument(document), 0, 0);
  return calls.filter(({ x, y }) => x === tileX * 16 && y === tileY * 16).map(({ asset, frame }) => `${asset}#${frame}`);
}

function paint(document: MapDocumentV2, points: readonly { tileX: number; tileY: number }[], patch: MapCellPatch): MapDocumentV2 {
  return applyMapEdit(document, { kind: 'paint', points, patch }).document;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('cell part rendering (shared by game and Studio ground chunks)', () => {
  const base = createEmptyMapDocument({ id: 'parts-render', title: 'Parts', width: 6, height: 6 });

  it('draws an exact path part where the smart path would otherwise be absent or different', () => {
    expect(renderTile(base, 2, 2).some((call) => call.startsWith('tile_cf_path#'))).toBe(false);
    const edged = paint(base, [{ tileX: 2, tileY: 2 }], { cellPart: { slot: 'path', exact: { frame: 12 } } });
    expect(renderTile(edged, 2, 2)).toEqual(expect.arrayContaining(['tile_cf_path#12', 'tile_cf_grass_dirt_cliff_edge#12']));
    // A smart path cell is replaced, not layered.
    const path = paint(base, [0, 1, 2, 3, 4].map((tileX) => ({ tileX, tileY: 2 })), { feature: 'path' });
    const smart = renderTile(path, 2, 2).filter((call) => call.startsWith('tile_cf_path#'));
    expect(smart).toHaveLength(1);
    const exact = paint(path, [{ tileX: 2, tileY: 2 }], { cellPart: { slot: 'path', exact: { frame: 30 } } });
    expect(renderTile(exact, 2, 2).filter((call) => call.startsWith('tile_cf_path#'))).toEqual(['tile_cf_path#30']);
    // Neighbours keep their smart topology: an exact part is appearance only.
    expect(renderTile(exact, 1, 2)).toEqual(renderTile(path, 1, 2));
    // Revert to smart restores the resolver's frame.
    const reverted = paint(exact, [{ tileX: 2, tileY: 2 }], { revertPartExact: 'path' });
    expect(reverted.cells['2,2']).toEqual({ feature: 'path' });
    expect(renderTile(reverted, 2, 2)).toEqual(renderTile(path, 2, 2));
  });

  it('replaces only the matching smart grass fringe family', () => {
    let document = paint(base, [{ tileX: 2, tileY: 2 }], { surface: 'sand' });
    document = paint(document, [{ tileX: 2, tileY: 1 }], { surface: 'grass', surfaceFamily: 'grass_2' });
    expect(renderTile(document, 2, 2)).toContain('tile_cf_grass_2_sheet#1');
    const exact = paint(document, [{ tileX: 2, tileY: 2 }], { cellPart: { slot: 'fringe:grass_2', exact: { frame: 64 } } });
    const calls = renderTile(exact, 2, 2);
    expect(calls).toContain('tile_cf_grass_2_sheet#64');
    expect(calls).not.toContain('tile_cf_grass_2_sheet#1');
  });

  it('draws water and farmland parts from their shared source atlases', () => {
    const document = paint(base, [{ tileX: 3, tileY: 3 }], { cellPart: { slot: 'water', exact: { frame: 7 } } });
    expect(renderTile(document, 3, 3)).toContain('tile_cf_freshwater#7');
    const farm = paint(base, [{ tileX: 1, tileY: 1 }], { feature: 'farmland', cellPart: { slot: 'farmland', exact: { frame: 5 } } });
    const calls = renderTile(farm, 1, 1);
    expect(calls).toContain('tile_cf_farmland#5');
    expect(calls).not.toContain('tile_cf_farmland#0');
  });

  it('leaves maps without parts on the historical fast path', () => {
    const terrain = terrainArrayForMapDocument(base);
    expect(terrain.cellParts).toBeUndefined();
    expect(exactGroundPartsAt(terrain, 1, 1)).toBeNull();
  });
});
