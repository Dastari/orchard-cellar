import { describe, expect, it, vi } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRows, buildContentRegistry, generateSurvivalLandmarkPathTiles } from '@orchard/sim';
import { drawInsetGround } from '@orchard/engine';
import type { LoadedAsset } from '@orchard/ui/studio';
import { drawStudioLiveGroundPaths, studioLiveGroundPathTiles } from './live-ground-paths.js';

const registry = buildContentRegistry(bootstrapContentRows()).registry;
const document = { id: 'live-island' };

function asset(name: string): LoadedAsset {
  return {
    assetId: 1, name, image: {} as CanvasImageSource, anchor: [8, 15], collision: [], tags: [], atlasRevision: 1,
    placement: { layer: 'ground', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
    metadata: { image: name, animations: {}, variants: { base: Array.from({ length: 47 }, (_, index) => ({
      x: index * 16, y: 0, width: 16, height: 16, durationTicks: 0,
    })) } },
  };
}

function context() {
  return { imageSmoothingEnabled: true, drawImage: vi.fn() } as unknown as CanvasRenderingContext2D & { drawImage: ReturnType<typeof vi.fn> };
}

describe('Studio live camp ground paths', () => {
  it('draws exactly the game ground pass including joined fringe frames', () => {
    const tiles = generateSurvivalLandmarkPathTiles(activeSurvivalLandmarks(registry, 0), 'automated_campfire');
    expect(tiles.length).toBeGreaterThan(0);
    const art = { dirtTerrace: asset('dirt'), farmlandGrassInset: asset('fringe') };
    const camera = { x: Math.min(...tiles.map(tile => tile.tileX)) * 16, y: Math.min(...tiles.map(tile => tile.tileY)) * 16, zoom: 2 };
    const viewport = { width: 1024, height: 1024 };
    const studio = context(), game = context();
    const gameDraws = drawInsetGround(game, art.dirtTerrace, art.farmlandGrassInset, tiles,
      camera.x, camera.y, camera.zoom, viewport.width, viewport.height);
    expect(drawStudioLiveGroundPaths(studio, art, document, registry, true, camera, viewport)).toBe(gameDraws);
    expect(studio.drawImage.mock.calls).toEqual(game.drawImage.mock.calls);
    expect(studio.drawImage.mock.calls.some(call => call[0] === art.farmlandGrassInset.image)).toBe(true);
    expect(studio.imageSmoothingEnabled).toBe(false);
  });

  it('hides and restores the Generated Base overlay without mutating map data', () => {
    const before = JSON.stringify(document);
    const visible = studioLiveGroundPathTiles(document, registry, true);
    expect(visible.length).toBeGreaterThan(0);
    expect(studioLiveGroundPathTiles(document, registry, false)).toEqual([]);
    expect(studioLiveGroundPathTiles(document, registry, true)).toEqual(visible);
    expect(JSON.stringify(document)).toBe(before);
  });

  it('does not put live paths onto offline maps or resurrect unverified/retired content', () => {
    expect(studioLiveGroundPathTiles({ id: 'draft' }, registry, true)).toEqual([]);
    expect(studioLiveGroundPathTiles(document, null, true)).toEqual([]);
    const spaces = new Map([...registry.spaces].map(([key, space]) => [key, { ...space, retired: true }]));
    expect(studioLiveGroundPathTiles(document, { ...registry, spaces }, true)).toEqual([]);
    expect(studioLiveGroundPathTiles(document, { ...registry, spaces: new Map() }, true)).toEqual([]);
  });
});
