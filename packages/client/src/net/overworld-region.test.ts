import { describe, expect, it } from 'vitest';
import { subscriptionChunkBounds, viewRadiusForViewport } from './overworld-connection.js';

describe('overworld regional subscriptions', () => {
  it('covers an ultrawide 1x viewport without a six-chunk ceiling', () => {
    const radius = viewRadiusForViewport(3840, 2160, 1);
    expect(radius).toBe(9);
    expect(subscriptionChunkBounds(3, 5, radius)).toEqual({ minX: 0, minY: 0, maxX: 12, maxY: 14 });
  });

  it('clamps queries to the twenty by twenty expanded world at every supported zoom', () => {
    expect([1, 2, 3].map((zoom) => viewRadiusForViewport(1920, 1080, zoom))).toEqual([5, 3, 3]);
    expect(subscriptionChunkBounds(0, 0, 5)).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 5 });
    expect(subscriptionChunkBounds(19, 19, 5)).toEqual({ minX: 14, minY: 14, maxX: 19, maxY: 19 });
  });

  it('includes the far visible chunk plus a safety margin', () => {
    const radius = viewRadiusForViewport(1366, 768, 2);
    expect(radius).toBe(3);
    const bounds = subscriptionChunkBounds(6, 6, radius);
    expect(bounds.minX).toBeLessThanOrEqual(4);
    expect(bounds.maxX).toBeGreaterThanOrEqual(8);
  });
});
