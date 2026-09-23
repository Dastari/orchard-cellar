import { SURVIVAL_CHUNK_TILES, SURVIVAL_WORLD_SIZE, OUTDOOR_SIGHT_PADDING_TILES } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MAX_VIEW_RADIUS,
  REGION_CENTER_DEADBAND_TILES,
  outsideRegionCenterDeadband,
  regionSubscriptionQueryCount,
  rogueRunRequiresRegionRefresh,
  subscriptionChunkBounds,
  viewRadiusForViewport,
} from './overworld-connection.js';

describe('overworld regional subscriptions', () => {
  it('keeps outdoor population outside the largest permitted regional sight bound',()=>{
    expect(OUTDOOR_SIGHT_PADDING_TILES).toBeGreaterThanOrEqual(
      (MAX_VIEW_RADIUS+1)*SURVIVAL_CHUNK_TILES+REGION_CENTER_DEADBAND_TILES+8,
    );
  });
  it('Architecture/Netcode: caps an ultrawide viewport with rectangular per-axis radii', () => {
    const radius = viewRadiusForViewport(3840, 2160, 1);
    expect(radius).toEqual({ x: 9, y: 6 });
    expect(subscriptionChunkBounds(12, 12, radius)).toEqual({ minX: 3, minY: 6, maxX: 21, maxY: 18 });
  });

  it('Architecture/Netcode: clamps each axis to the world and the hard budget at every zoom', () => {
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

  it('Architecture/Netcode: uses one indexed query per regional table', () => {
    expect(regionSubscriptionQueryCount({ minX: 2, minY: 3, maxX: 2, maxY: 3 })).toBe(19);
    expect(regionSubscriptionQueryCount({ minX: 0, minY: 0, maxX: 2, maxY: 1 })).toBe(19);
    expect(regionSubscriptionQueryCount(
      { minX: 0, minY: 0, maxX: 2, maxY: 1 },
      30_001,
      'cellar',
    )).toBe(18);
  });

  it('World/Spaces & Interiors: bounds an instance space and budgets every space-aware table', () => {
    const bounds = subscriptionChunkBounds(1, 1, { x: 9, y: 9 }, 32);
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(regionSubscriptionQueryCount(bounds, 65_534)).toBe(17);
    expect(regionSubscriptionQueryCount(bounds, 50_000, 'roguelike')).toBe(6);
  });

  it('Architecture/Netcode: does not churn a boundary crossing and return inside the deadband', () => {
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
    expect(globals).toContain('tables.worldMerchant');
    expect(globals).not.toContain('tables.worldCampfireState');
    expect(globals).not.toContain('tables.spacePortal');
    expect(globals).not.toContain('tables.homestead');
    expect(globals).not.toContain('tables.onlinePlayerPublic');
    expect(globals).not.toContain('tables.onlinePlayerAppearances');
    expect(source).toContain('ownRow || this.profiles.get(id) !== undefined');
    expect(source).not.toContain("this.profiles.get(id)?.online ?? true");
    expect(region).toContain('tables.worldHive');
    expect(region).toContain('tables.worldWildlifeProfile');
    expect(region).not.toContain('positions.rightSemijoin');
    expect(region).not.toContain('npcs.rightSemijoin');
    expect(region).toContain('tables.spacePortal.where');
    expect(region).toContain('tables.worldCampfireState');
    expect(region).toContain('? [overworldHomesteads]');
    expect(region).toContain(': []');
    expect(source).toContain('tables.ownCurrentHomestead');
    expect(source).toContain('connection.db.ownCurrentHomestead.spaceId.find(row.spaceId)');
    expect(source).toContain('connection.db.homestead.spaceId.find(row.spaceId)');
    expect(region).not.toContain('row.residenceSpaceId.eq(spaceId)');
    expect(region).toContain('rogueInstance');
    expect(region).toContain('? [positions, playerJumps, projectiles, npcs, rogueEnemyProfiles, enemyAttacks, ...discoveryQueries]');
    expect(region).toContain('rogueInstance ? [] : [portals, campfires, ...homesteadQueries]');
    expect(region).toContain('core world streaming remains active');
    expect(region).toContain('private subscribeCellarExcavations');
    expect(region).toContain('this.subscribeCellarExcavations(connection, spaceId');
    expect(region).not.toContain('surfaces, cellarExcavations');
    expect(region.indexOf('.subscribe(auxiliaryQueries)'))
      .toBeLessThan(region.indexOf('.subscribe(coreQueries)'));
    expect(region).not.toContain('hydrateRegion');
    expect(region.match(/row\.spaceId\.eq\(spaceId\)/g)).toHaveLength(18);
    expect(region.indexOf('previous?.isActive()')).toBeGreaterThan(region.indexOf('.onApplied('));
  });

  it('subscribes to the complete cellar excavation set used by authority collision', () => {
    const source = readFileSync(new URL('./overworld-connection.ts', import.meta.url), 'utf8');
    const start = source.indexOf('const query = tables.cellarExcavation');
    const end = source.indexOf('let next:', start);
    const query = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(query).toContain('row.spaceId.eq(spaceId)');
    expect(query).not.toContain('row.chunkX');
    expect(query).not.toContain('row.chunkY');
  });

  it('rehydrates cellar collision rows before retiring the previous per-space subscription', () => {
    const source = readFileSync(new URL('./overworld-connection.ts', import.meta.url), 'utf8');
    const subscription = source.slice(
      source.indexOf('private subscribeCellarExcavations'),
      source.indexOf('private bindTableEvents'),
    );
    const hydrate = source.slice(
      source.indexOf('private hydrateCellarExcavations'),
      source.indexOf('private hydrateSelf'),
    );
    expect(subscription).toContain('this.hydrateCellarExcavations(connection, spaceId)');
    expect(subscription.indexOf('this.hydrateCellarExcavations(connection, spaceId)'))
      .toBeLessThan(subscription.indexOf('previous?.isActive()'));
    expect(hydrate).toContain('this.cellarExcavations.clear()');
    expect(hydrate).toContain('connection.db.cellarExcavation.iter()');
    expect(hydrate).toContain('row.spaceId === spaceId');
    expect(hydrate).toContain('this.cellarExcavationRevisionValue += 1');
  });

  it('refreshes once for a newly resolved Delve space but not run-state updates', () => {
    expect(rogueRunRequiresRegionRefresh(null, { spaceId: 50_000 }, 50_000)).toBe(true);
    expect(rogueRunRequiresRegionRefresh(
      { spaceId: 50_000 },
      { spaceId: 50_000 },
      50_000,
    )).toBe(false);
    expect(rogueRunRequiresRegionRefresh(null, { spaceId: 50_000 }, 1)).toBe(false);
    expect(rogueRunRequiresRegionRefresh({ spaceId: 50_000 }, null, 50_000)).toBe(false);
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

  it('Architecture/Netcode: reduces settled 1080p query count from the stage-1 baseline', () => {
    const stage1Baseline = 8 + 15 + 11 * 11 * 8;
    const bounds = subscriptionChunkBounds(20, 20, viewRadiusForViewport(1920, 1080, 1));
    const stage2Settled = 2 + 5 + 28 + regionSubscriptionQueryCount(bounds);
    // Cellar excavation moved to a dedicated per-space subscription, removing
    // that table from ordinary viewport churn.
    expect(stage2Settled).toBe(54);
    expect(stage2Settled).toBeLessThanOrEqual(stage1Baseline);
  });
});
