import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONNECTION_AUDIT_RETENTION_MICROS,
  anyFieldChanged,
  connectionAuditExpired,
  emptyTickUpdateCounters,
  updateRowWhenChanged,
  worldItemExpired,
} from './scalability.js';

describe('34§6 stage-1 scalability rules', () => {
  it('routes carrier and mounted-player predicates through their indexes', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).toContain("{ accessor: 'by_rider', algorithm: 'hash', columns: ['rider'] }");
    expect(source.match(/world_chest\.by_carrier\.filter/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(source.match(/mountedNpcFor\(ctx,/g)?.length ?? 0).toBeGreaterThanOrEqual(10);
    expect(source).not.toMatch(/\[\.\.\.ctx\.db\.world_chest\.iter\(\)\]\.(?:some|find).*carriedBy\?\.isEqual/);
    expect(source).not.toMatch(/\[\.\.\.ctx\.db\.world_npc\.iter\(\)\]\.(?:some|find).*rider\?\.isEqual/);
    expect(source).not.toContain('membership_audit.id.delete');
    expect(source).not.toContain('world_admin_audit.id.delete');
    expect(source).not.toMatch(/name: 'connection_presence'/);
    expect(source).not.toMatch(/name: 'player_equipment'/);
    expect(source).toContain('ctx.db.connection_presence_v2.count()');
    expect(source).not.toContain('ctx.db.world_resource.clear()');
    expect(source.match(/reconcileGeneratedSurvivalResources\(ctx\)/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(2);
    expect(source).toContain('ctx.db.world_hive.clear()');
  });

  it('30§4 reconciles generated terrain resources without resetting unchanged progress', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const start = source.indexOf('function reconcileGeneratedSurvivalResources');
    const end = source.indexOf('\nexport const ownSurvival', start);
    const migration = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(migration).toContain('if (existing.kind !== generated.kind)');
    expect(migration).toContain('ctx.db.world_resource.id.update({\n        ...existing,');
    expect(migration).toContain('for (const resource of desired.values())');
    expect(migration).not.toContain('.clear()');
  });

  it('keeps authorization ahead of indexed lookups in changed client reducers', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const reducerNames = [
      'useHands', 'interactChest', 'interactNpc', 'harvestChest', 'interactHorse',
      'jumpHorse', 'dropSelected', 'gatherWorldResource', 'harvestResource',
      'fireBow', 'useFarmTool', 'restoreFarmTile', 'tendTree', 'useFarmTile',
    ];
    for (const reducerName of reducerNames) {
      const start = source.indexOf(`export const ${reducerName} =`);
      const end = source.indexOf('\nexport const ', start + 1);
      const reducer = source.slice(start, end < 0 ? source.length : end);
      const auth = reducer.indexOf('requireAuthorizedSender(');
      const indexedLookup = Math.max(
        reducer.indexOf('mountedNpcFor('),
        reducer.indexOf('carriedChestFor('),
      );
      expect(start, reducerName).toBeGreaterThanOrEqual(0);
      expect(auth, reducerName).toBeGreaterThanOrEqual(0);
      expect(indexedLookup, reducerName).toBeGreaterThan(auth);
    }
  });

  it('26§13 authorizes portal reducers before target and mount lookups', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export const usePortal =');
    const end = source.indexOf('\nexport const debugUsePortal', start);
    const reducer = source.slice(start, end);
    expect(reducer.indexOf('requireAuthorizedSender(')).toBeGreaterThanOrEqual(0);
    expect(reducer.indexOf('space_portal.id.find')).toBeGreaterThan(reducer.indexOf('requireAuthorizedSender('));
    expect(reducer.indexOf('usePortalRow(')).toBeGreaterThan(reducer.indexOf('requireAuthorizedSender('));
  });

  it('26§3 keeps scheduled collision and entity work scoped through space/chunk indexes', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('playersBySpace');
    expect(step).toContain('world_resource.by_chunk.filter(spaceId)');
    expect(step).toContain('world_chest.by_chunk.filter(spaceId)');
    expect(step).toContain('world_projectile.by_chunk.filter(spaceId)');
    expect(step).toContain('world_combat_target.by_chunk.filter(spaceId)');
    expect(step).toContain('world_npc.by_chunk.filter(spaceId)');
    expect(step).toContain('player_position.identity.find(presence.identity)');
  });

  it('keeps identity index results equivalent to the removed full scans', () => {
    const rows = [
      { id: 1, identity: 'alice' },
      { id: 2, identity: undefined },
      { id: 3, identity: 'bob' },
      { id: 4, identity: 'alice' },
    ] as const;
    const byIdentity = new Map<string, Array<(typeof rows)[number]>>();
    for (const row of rows) {
      if (row.identity === undefined) continue;
      const matches = byIdentity.get(row.identity) ?? [];
      matches.push(row);
      byIdentity.set(row.identity, matches);
    }
    for (const identity of ['alice', 'bob', 'nobody']) {
      expect(byIdentity.get(identity) ?? []).toEqual(
        rows.filter((row) => row.identity === identity),
      );
    }
  });

  it('expires ground items at 20 minutes, not one tick early', () => {
    expect(worldItemExpired(100n, 24_099n, 24_000)).toBe(false);
    expect(worldItemExpired(100n, 24_100n, 24_000)).toBe(true);
    expect(worldItemExpired(200n, 100n, 24_000)).toBe(false);
  });

  it('keeps projectile-landed arrows as server-authorized pickups for 30 seconds', () => {
    expect(worldItemExpired(100n, 699n, 600)).toBe(false);
    expect(worldItemExpired(100n, 700n, 600)).toBe(true);
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const projectileStep = source.slice(
      source.indexOf("tickStageTiming(telemetryTimingSample, 'projectiles')"),
      source.indexOf("tickStageTiming(telemetryTimingSample, 'movement')"),
    );
    expect(projectileStep).toContain("itemKind: 'arrow'");
    expect(projectileStep).toContain('RECOVERABLE_ARROW_LIFETIME_TICKS');
    expect(projectileStep).toContain('recoverableArrowAngle(');
    const pickup = source.slice(
      source.indexOf('export const pickupWorldItem ='),
      source.indexOf('\nexport const ', source.indexOf('export const pickupWorldItem =') + 1),
    );
    expect(pickup).toContain('requireAuthorizedSender(');
    expect(pickup).toContain('itemWithinPickupReach(');
    expect(pickup).toContain('worldItemExpiredForRow(');
  });

  it('trims only connection audit rows older than 90 days', () => {
    const now = CONNECTION_AUDIT_RETENTION_MICROS + 1_000n;
    expect(connectionAuditExpired(1_000n, now)).toBe(true);
    expect(connectionAuditExpired(1_001n, now)).toBe(false);
    expect(connectionAuditExpired(now + 1n, now)).toBe(false);
  });

  it('records zero row updates for unchanged input', () => {
    const current = { x: 10, y: 20, moving: false };
    const next = { ...current };
    const counters = emptyTickUpdateCounters();
    let persisted = 0;
    expect(updateRowWhenChanged(
      current,
      next,
      ['x', 'y', 'moving'],
      counters,
      'playerPositionUpdates',
      () => { persisted += 1; },
    )).toBe(false);
    expect(counters).toMatchObject({ playerPositionUpdates: 0, rowsTouched: 0 });
    expect(persisted).toBe(0);
    const changed = { ...next, x: 11 };
    expect(anyFieldChanged(current, changed, ['x', 'y', 'moving'])).toBe(true);
    expect(updateRowWhenChanged(
      current,
      changed,
      ['x', 'y', 'moving'],
      counters,
      'playerPositionUpdates',
      () => { persisted += 1; },
    )).toBe(true);
    expect(counters).toMatchObject({ playerPositionUpdates: 1, rowsTouched: 1 });
    expect(persisted).toBe(1);
  });
});

describe('34§6 stage-2 scalability rules', () => {
  it('keeps wildlife profile chunks indexed and synchronized through one update path', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const profileSchema = source.slice(
      source.indexOf('const world_wildlife_profile ='),
      source.indexOf('const world_merchant ='),
    );
    expect(profileSchema).toContain("{ accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] }");
    expect(profileSchema).toContain('chunkX: t.i16().default(0)');
    expect(profileSchema).toContain('chunkY: t.i16().default(0)');
    expect(profileSchema).toContain('spaceId: t.u16().default(0)');
    expect(source.match(/ctx\.db\.world_npc\.id\.update/g)).toHaveLength(1);
    expect(source).toContain('function updateWorldNpc(');
    expect(source).toContain('ctx.db.world_wildlife_profile.npcId.update');
  });

  it('returns the same chunk rows as the removed full scan', () => {
    const rows = [
      { id: 1, chunkX: 2, chunkY: 3 },
      { id: 2, chunkX: 3, chunkY: 3 },
      { id: 3, chunkX: 2, chunkY: 3 },
      { id: 4, chunkX: 2, chunkY: 4 },
    ] as const;
    const index = new Map<string, Array<(typeof rows)[number]>>();
    for (const row of rows) {
      const key = `${row.chunkX},${row.chunkY}`;
      const bucket = index.get(key) ?? [];
      bucket.push(row);
      index.set(key, bucket);
    }
    for (const [chunkX, chunkY] of [[2, 3], [3, 3], [9, 9]] as const) {
      expect(index.get(`${chunkX},${chunkY}`) ?? []).toEqual(
        rows.filter((row) => row.chunkX === chunkX && row.chunkY === chunkY),
      );
    }
  });

  it('scopes registry views to online rows and authenticates before spawn allocation', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).toContain("name: 'online_player_public'");
    expect(source).toContain("name: 'online_player_appearances'");
    expect(source).toContain('.filter((profile) => profile.online)');
    const connectStart = source.indexOf('export const onConnect =');
    const connectEnd = source.indexOf('\nexport const onDisconnect', connectStart);
    const connect = source.slice(connectStart, connectEnd);
    expect(connect.indexOf('requireAuthorizedSender(')).toBeGreaterThanOrEqual(0);
    expect(connect.indexOf('findSurvivalSpawnTile(')).toBeGreaterThan(connect.indexOf('requireAuthorizedSender('));
    expect(connect).not.toContain('Array.from({ length: 25 }');
  });
});
