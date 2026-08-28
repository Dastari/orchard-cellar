import { SURVIVAL_CHUNK_TILES, SURVIVAL_WORLD_SIZE } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MAX_VIEW_RADIUS,
  outsideRegionCenterDeadband,
  regionSubscriptionQueryCount,
  subscriptionChunkBounds,
  viewRadiusForViewport,
} from './overworld-connection.js';

describe('overworld regional subscriptions', () => {
  it('34§4 caps an ultrawide viewport with rectangular per-axis radii', () => {
    const radius = viewRadiusForViewport(3840, 2160, 1);
    expect(radius).toEqual({ x: 9, y: 6 });
    expect(subscriptionChunkBounds(12, 12, radius)).toEqual({ minX: 3, minY: 6, maxX: 21, maxY: 18 });
  });

  it('34§4 clamps each axis to the world and the hard budget at every zoom', () => {
    const finalChunk = Math.ceil(SURVIVAL_WORLD_SIZE / SURVIVAL_CHUNK_TILES) - 1;
    expect([1, 2, 3].map((zoom) => viewRadiusForViewport(1920, 1080, zoom))).toEqual([
      { x: 5, y: 4 }, { x: 3, y: 3 }, { x: 3, y: 2 },
    ]);
    expect(viewRadiusForViewport(32_768, 32_768, 0.01)).toEqual({
      x: MAX_VIEW_RADIUS,
      y: MAX_VIEW_RADIUS,
    });
    expect(subscriptionChunkBounds(0, 0, { x: 5, y: 4 })).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 4 });
    expect(subscriptionChunkBounds(finalChunk, finalChunk, { x: 5, y: 4 })).toEqual({
      minX: finalChunk - 5,
      minY: finalChunk - 4,
      maxX: finalChunk,
      maxY: finalChunk,
    });
  });

  it('includes the far visible chunk plus a safety margin', () => {
    const radius = viewRadiusForViewport(1366, 768, 2);
    expect(radius).toEqual({ x: 3, y: 2 });
    const bounds = subscriptionChunkBounds(6, 6, radius);
    expect(bounds.minX).toBeLessThanOrEqual(4);
    expect(bounds.maxX).toBeGreaterThanOrEqual(8);
  });

  it('34§5 uses one bounded rectangular query per regional table', () => {
    expect(regionSubscriptionQueryCount({ minX: 2, minY: 3, maxX: 2, maxY: 3 })).toBe(14);
    expect(regionSubscriptionQueryCount({ minX: 0, minY: 0, maxX: 2, maxY: 1 })).toBe(14);
  });

  it('26§13 bounds an instance space and budgets every space-aware table', () => {
    const bounds = subscriptionChunkBounds(1, 1, { x: 9, y: 9 }, 32);
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(regionSubscriptionQueryCount(bounds, 65_534)).toBe(14);
  });

  it('34§4 does not churn a boundary crossing and return inside the deadband', () => {
    const center = [15, 8] as const;
    expect(outsideRegionCenterDeadband(center, 16, 8)).toBe(false);
    expect(outsideRegionCenterDeadband(center, 15, 8)).toBe(false);
    expect(outsideRegionCenterDeadband(center, 24, 8)).toBe(true);
    expect(outsideRegionCenterDeadband(null, 15, 8)).toBe(true);
  });

  it('34§6 keeps profiles and hives out of globals and inside regional handover', () => {
    const source = readFileSync(new URL('./overworld-connection.ts', import.meta.url), 'utf8');
    const globals = source.slice(
      source.indexOf('private subscribeGlobals'),
      source.indexOf('private subscribeSelf'),
    );
    const region = source.slice(
      source.indexOf('private subscribeRegion'),
      source.indexOf('private bindTableEvents'),
    );
    expect(globals).not.toContain('tables.worldHive');
    expect(globals).not.toContain('tables.worldWildlifeProfile');
    expect(globals).toContain('tables.onlinePlayerPublic');
    expect(globals).toContain('tables.onlinePlayerAppearances');
    expect(globals).not.toMatch(/tables\.playerPublic[,\]]/);
    expect(globals).not.toMatch(/tables\.playerAppearance[,\]]/);
    expect(region).toContain('tables.worldHive');
    expect(region).toContain('tables.worldWildlifeProfile');
    expect(region).toContain('hives, surfaces, cellarExcavations]);');
    expect(region).not.toContain('hydrateRegion');
    expect(region.match(/row\.spaceId\.eq\(spaceId\)/g)).toHaveLength(14);
    expect(region.indexOf('previous?.isActive()')).toBeGreaterThan(region.indexOf('.onApplied('));
  });

  it('34§6 reduces settled 1080p query count from the stage-1 baseline', () => {
    const stage1Baseline = 8 + 15 + 11 * 11 * 8;
    const bounds = subscriptionChunkBounds(20, 20, viewRadiusForViewport(1920, 1080, 1));
    const stage2Settled = 8 + 18 + regionSubscriptionQueryCount(bounds);
    expect(stage2Settled).toBe(40);
    expect(stage2Settled).toBeLessThanOrEqual(stage1Baseline);
  });
});
