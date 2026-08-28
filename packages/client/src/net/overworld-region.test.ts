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
    expect(regionSubscriptionQueryCount({ minX: 2, minY: 3, maxX: 2, maxY: 3 })).toBe(20);
    expect(regionSubscriptionQueryCount({ minX: 0, minY: 0, maxX: 2, maxY: 1 })).toBe(20);
  });

  it('26§13 bounds an instance space and budgets every space-aware table', () => {
    const bounds = subscriptionChunkBounds(1, 1, { x: 9, y: 9 }, 32);
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(regionSubscriptionQueryCount(bounds, 65_534)).toBe(19);
  });

  it('34§4 does not churn a boundary crossing and return inside the deadband', () => {
    const center = [15, 8] as const;
    expect(outsideRegionCenterDeadband(center, 16, 8)).toBe(false);
    expect(outsideRegionCenterDeadband(center, 15, 8)).toBe(false);
    expect(outsideRegionCenterDeadband(center, 24, 8)).toBe(true);
    expect(outsideRegionCenterDeadband(null, 15, 8)).toBe(true);
  });

  it('keeps only online presence global and streams world registries with the active region', () => {
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
    expect(globals).toContain('row.online.eq(true)');
    expect(globals).toContain('onlineProfiles.rightSemijoin');
    expect(globals).not.toContain('tables.worldMerchant');
    expect(globals).not.toContain('tables.worldCampfireState');
    expect(globals).not.toContain('tables.spacePortal');
    expect(globals).not.toContain('tables.homestead');
    expect(globals).not.toContain('tables.onlinePlayerPublic');
    expect(globals).not.toContain('tables.onlinePlayerAppearances');
    expect(source).toContain('ownRow || this.profiles.get(id) !== undefined');
    expect(source).not.toContain("this.profiles.get(id)?.online ?? true");
    expect(region).toContain('tables.worldHive');
    expect(region).toContain('tables.worldWildlifeProfile');
    expect(region).toContain('positions.rightSemijoin');
    expect(region).toContain('npcs.rightSemijoin');
    expect(region).toContain('tables.spacePortal.where');
    expect(region).toContain('tables.worldCampfireState');
    expect(region).toContain('? [overworldHomesteads]');
    expect(region).toContain(': []');
    expect(source).toContain('tables.ownCurrentHomestead');
    expect(region).not.toContain('row.residenceSpaceId.eq(spaceId)');
    expect(region).toContain('portals, campfires, ...homesteadQueries');
    expect(region).not.toContain('hydrateRegion');
    expect(region.match(/row\.spaceId\.eq\(spaceId\)/g)).toHaveLength(15);
    expect(region.indexOf('previous?.isActive()')).toBeGreaterThan(region.indexOf('.onApplied('));
  });

  it('isolates and verifies hot singleton rows before other subscriptions', () => {
    const source = readFileSync(new URL('./overworld-connection.ts', import.meta.url), 'utf8');
    const connect = source.slice(source.indexOf('.onConnect('), source.indexOf('.onConnectError('));
    const time = source.slice(
      source.indexOf('private subscribeTimeState'),
      source.indexOf('private subscribeGlobals'),
    );
    const globals = source.slice(
      source.indexOf('private subscribeGlobals'),
      source.indexOf('private subscribeSelf'),
    );
    expect(connect).toContain('this.subscribeTimeState(connection, identity)');
    expect(connect).not.toContain('this.subscribeGlobals(connection, identity)');
    expect(connect).not.toContain('this.subscribeSelf(connection, identity)');
    expect(time).toContain('.subscribe([tables.worldClock, tables.worldEnvironment])');
    expect(time).toContain('if (!this.hasTimeState(connection))');
    expect(time).toContain('this.scheduleTimeStateRecovery(connection, identity)');
    expect(time).toContain('this.subscribeGlobals(connection, identity)');
    expect(globals).not.toContain('tables.worldClock');
    expect(globals).not.toContain('tables.worldEnvironment');
    expect(globals.indexOf('this.hydrateGlobals(connection)'))
      .toBeLessThan(globals.indexOf('this.subscribeSelf(connection, identity)'));
  });

  it('34§6 reduces settled 1080p query count from the stage-1 baseline', () => {
    const stage1Baseline = 8 + 15 + 11 * 11 * 8;
    const bounds = subscriptionChunkBounds(20, 20, viewRadiusForViewport(1920, 1080, 1));
    const stage2Settled = 2 + 4 + 28 + regionSubscriptionQueryCount(bounds);
    expect(stage2Settled).toBe(54);
    expect(stage2Settled).toBeLessThanOrEqual(stage1Baseline);
  });
});
