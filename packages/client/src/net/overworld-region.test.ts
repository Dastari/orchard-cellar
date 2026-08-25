import { SURVIVAL_CHUNK_TILES, SURVIVAL_WORLD_SIZE } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { subscriptionChunkBounds, viewRadiusForViewport } from './overworld-connection.js';

describe('overworld regional subscriptions', () => {
  it('covers an ultrawide 1x viewport without a six-chunk ceiling', () => {
    const radius = viewRadiusForViewport(3840, 2160, 1);
    expect(radius).toBe(9);
    expect(subscriptionChunkBounds(3, 5, radius)).toEqual({ minX: 0, minY: 0, maxX: 12, maxY: 14 });
  });

  it('clamps queries to the expanded world at every supported zoom', () => {
    const finalChunk = Math.ceil(SURVIVAL_WORLD_SIZE / SURVIVAL_CHUNK_TILES) - 1;
    expect([1, 2, 3].map((zoom) => viewRadiusForViewport(1920, 1080, zoom))).toEqual([5, 3, 3]);
    expect(subscriptionChunkBounds(0, 0, 5)).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 5 });
    expect(subscriptionChunkBounds(finalChunk, finalChunk, 5)).toEqual({
      minX: finalChunk - 5,
      minY: finalChunk - 5,
      maxX: finalChunk,
      maxY: finalChunk,
    });
  });

  it('includes the far visible chunk plus a safety margin', () => {
    const radius = viewRadiusForViewport(1366, 768, 2);
    expect(radius).toBe(3);
    const bounds = subscriptionChunkBounds(6, 6, radius);
    expect(bounds.minX).toBeLessThanOrEqual(4);
    expect(bounds.maxX).toBeGreaterThanOrEqual(8);
  });
});
