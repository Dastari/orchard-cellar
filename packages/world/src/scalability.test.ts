import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONNECTION_AUDIT_RETENTION_MICROS,
  anyFieldChanged,
  connectionAuditExpired,
  emptyTickUpdateCounters,
  recordTickRowScan,
  updateRowWhenChanged,
  worldItemExpired,
} from './scalability.js';

describe('Architecture/World-SpacetimeDB: stage-1 scalability rules', () => {
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
    expect(source).toContain('ctx.db.player_public.by_online.filter(true)');
    expect(source).toContain('ctx.db.connection_presence_v2.by_identity.filter(profile.identity)');
    const tickPresencePath = source.slice(source.indexOf('function activePresenceLeases('));
    expect(tickPresencePath).not.toContain('ctx.db.connection_presence_v2.iter()');
    expect(source).not.toContain('ctx.db.world_resource.clear()');
    expect(source.match(/reconcileGeneratedSurvivalResources\(ctx\)/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(2);
    expect(source).toContain('ctx.db.world_hive.clear()');
  });

  it('World/Map & Terrain: reconciles generated terrain resources without resetting unchanged progress', () => {
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
      'interactNpc', 'applyMountLifecycle',
      'jumpHorse', 'dropSelected', 'gatherWorldResource',
      'tendTree',
    ];
    for (const reducerName of reducerNames) {
      const implementation = reducerName === 'applyMountLifecycle'
        ? 'function applyMountLifecycle(' : `export const ${reducerName} =`;
      const implementationSource = source;
      const start = implementationSource.indexOf(implementation);
      const end = implementationSource.indexOf('\nexport const ', start + 1);
      const reducer = implementationSource.slice(start, end < 0 ? implementationSource.length : end);
      const auth = Math.max(
        reducer.indexOf('requireAuthorizedSender('),
        reducer.indexOf('dependencies.authorize(ctx)'),
      );
      const indexedLookup = Math.max(
        reducer.indexOf('mountedNpcFor('),
        reducer.indexOf('carriedChestFor('),
      );
      expect(start, reducerName).toBeGreaterThanOrEqual(0);
      expect(auth, reducerName).toBeGreaterThanOrEqual(0);
      expect(indexedLookup, reducerName).toBeGreaterThan(auth);
    }
    const mountTransport = source.slice(source.indexOf('export const interactHorse ='), source.indexOf('export const jumpHorse ='));
    expect(mountTransport).toContain("interactEntityBehaviour(ctx, { targetKind: 'npc', entityId: horseId, verb: 'use' }");
    expect(mountTransport).not.toContain('ctx.db.');
    const generic = readFileSync(new URL('./behaviour/interact-entity.ts', import.meta.url), 'utf8');
    expect(generic.indexOf('authority.authorize(ctx)')).toBeLessThan(generic.indexOf('authority.resolveTarget(ctx'));
  });

  it('World/Spaces & Interiors: authorizes portal reducers before target and mount lookups', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export const usePortal =');
    const end = source.indexOf('\nexport const toggleHomesteadGate', start);
    const reducer = source.slice(start, end);
    expect(reducer.indexOf('requireAuthorizedSender(')).toBeGreaterThanOrEqual(0);
    expect(reducer.indexOf('space_portal.id.find')).toBeGreaterThan(reducer.indexOf('requireAuthorizedSender('));
    expect(reducer.indexOf('usePortalRow(')).toBeGreaterThan(reducer.indexOf('requireAuthorizedSender('));
  });

  it('World/Spaces & Interiors: keeps scheduled collision and entity work scoped through space/chunk indexes', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const step = source.slice(source.indexOf('function runOneHertzTickMaintenance('));
    expect(step).toContain('playersBySpace');
    expect(step).toContain('world_resource.by_chunk.filter([spaceId, chunkX, chunkY])');
    expect(step).toContain('world_chest.by_chunk.filter([spaceId, chunkX, chunkY])');
    expect(step).toContain('world_projectile.by_chunk.filter(spaceId)');
    expect(step).toContain('world_combat_target.by_chunk.filter([spaceId, chunkX, chunkY])');
    expect(step).toContain('world_npc.by_chunk.filter([spaceId, chunkX, chunkY])');
    expect(step).toContain('tickCollisionChunkScope(');
    expect(step).toContain('player_position.identity.find(presence.identity)');
  });

  it('reuses the tick spatial rows and one revision runtime when building collision', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const collision = source.slice(
      source.indexOf('interface PrefetchedSpaceCollisionRows'),
      source.indexOf('function waterCollisionForSpace'),
    );
    const tick = source.slice(
      source.indexOf('const collisionBySpace =', source.indexOf('export const stepWorld =')),
      source.indexOf("tickStageTiming(telemetryTimingSample, 'collision', true)"),
    );

    expect(collision).toContain('prefetchedRows?.resources');
    expect(collision).toContain('prefetchedRows?.chests');
    expect(collision).toContain('prefetchedRows?.combatTargets');
    expect(collision).toContain('liveMapRuntimeGeneratedResourceSuppressed(liveMapRuntime, resource.id)');
    // One dispatcher lookup per occupied space (static-world S2b: off is exactly the compiled runtime).
    expect(tick.match(/liveIslandCollisionRuntime\(ctx\)/gu)).toHaveLength(1);
    expect(tick).not.toContain('compiledLiveIslandRuntime(ctx)');
    expect(tick).toContain('collisionForSpace(ctx, spaceId, undefined, {');
    expect(tick).toContain('resources,\n        chests,\n        combatTargets,\n        chunkScope:');
    expect(tick).toContain('waterCollisionForSpace(\n        ctx,\n        spaceId,\n        liveMapRuntime,');
  });

  it('allocates combined projectile terrain lazily and once per projectile-bearing space', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const collisionSetupStart = source.indexOf(
      'const collisionBySpace =', source.indexOf('export const stepWorld ='),
    );
    const projectileStageStart = source.indexOf(
      "tickStageTiming(telemetryTimingSample, 'projectiles');", collisionSetupStart,
    );
    const collisionSetup = source.slice(collisionSetupStart, projectileStageStart);
    const projectileStage = source.slice(
      projectileStageStart,
      source.indexOf("tickStageTiming(telemetryTimingSample, 'projectiles', true);", projectileStageStart),
    );

    expect(collisionSetup).toContain('const projectileCollisionBySpace = new Map<number, CollisionMap>()');
    expect(collisionSetup).not.toContain('projectileTraversalCollision(');
    expect(collisionSetup).toContain('world_projectile.by_chunk.filter(spaceId)');
    expect(projectileStage).toContain('const occupiedProjectiles = [...projectilesBySpace.values()].flat()');
    expect(projectileStage).toContain('let collision = projectileCollisionBySpace.get(projectile.spaceId)');
    expect(projectileStage).toContain('collision = runtimeActorCollision(contentRegistry(ctx), projectileTraversalCollision(groundCollision, waterCollision)');
    expect(projectileStage).toContain('projectileCollisionBySpace.set(projectile.spaceId, collision)');
    expect(projectileStage.match(/projectileTraversalCollision\(/gu)).toHaveLength(1);
    expect(projectileStage.indexOf('projectileTraversalCollision(groundCollision, waterCollision)'))
      .toBeGreaterThan(projectileStage.indexOf('const occupiedProjectiles'));
    expect(projectileStage.indexOf('projectileTraversalCollision(groundCollision, waterCollision)'))
      .toBeLessThan(projectileStage.indexOf('if (projectile.expiresTick <= authorityTick)'));
  });

  it('repairs the deterministic bee roster through primary-key probes', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const start = source.indexOf('if (authorityTick % 600n === 0n)');
    const end = source.indexOf("tickStageTiming(telemetryTimingSample, 'collision')", start);
    const roster = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(roster).toContain('world_wildlife_profile.npcId.find(npcId)');
    expect(roster).toContain('world_npc.id.find(npcId)');
    expect(roster).not.toContain('world_wildlife_profile.iter()');
    expect(roster).not.toContain('world_npc.iter()');
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
      source.indexOf("tickStageTiming(telemetryTimingSample, 'projectiles', true)"),
    );
    expect(projectileStep).toContain('itemKind: projectile.ammunitionItemKind');
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

  it('records scanned candidates separately from mutated rows', () => {
    const counters = emptyTickUpdateCounters();
    recordTickRowScan(counters, 'itemRowsScanned', 7);
    recordTickRowScan(counters, 'speechRowsScanned', 2);
    expect(counters).toMatchObject({
      itemRowsScanned: 7,
      speechRowsScanned: 2,
      rowsScanned: 9,
      rowsTouched: 0,
    });

    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const step = source.slice(source.indexOf('function runOneHertzTickMaintenance('));
    for (const counter of [
      'tradeRowsScanned', 'overflowRowsScanned', 'regrowthRowsScanned',
      'effectRowsScanned', 'inviteRowsScanned', 'itemRowsScanned',
      'auditRowsScanned', 'speechRowsScanned',
    ]) {
      expect(step, counter).toContain(`recordTickRowScan(updateCounters, '${counter}')`);
    }
  });

  it('cadences trade and overflow maintenance at one hertz', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const start = source.indexOf('function runOneHertzTickMaintenance(');
    const end = source.indexOf('function expirePresenceLeases(', start);
    const maintenance = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(maintenance).toContain('maintenanceAuthorityTick % BigInt(AUTHORITY_HZ) !== 0n');
    expect(maintenance).toContain('player_trade_session.iter()');
    expect(maintenance).toContain('inventory_overflow.iter()');
    expect(maintenance).toContain('inventory_overflow_retry.identity.find(row.identity)');
    expect(maintenance).toContain("recordTickRowScan(updateCounters, 'tradeRowsScanned')");
    expect(maintenance).toContain("recordTickRowScan(updateCounters, 'overflowRowsScanned')");
    const acceptStart = source.indexOf('export const acceptTradeRequest =');
    const acceptEnd = source.indexOf('\nexport const cancelTrade =', acceptStart);
    const accept = source.slice(acceptStart, acceptEnd);
    expect(accept).toContain('PLAYER_TRADE_REQUEST_TTL_TICKS');
    expect(accept).toContain("throw new SenderError('trade_request_expired')");
  });

  it('cadences expiry storage cleanup without extending authoritative validity', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const start = source.indexOf("tickStageTiming(telemetryTimingSample, 'expiry')");
    const end = source.indexOf("tickStageTiming(telemetryTimingSample, 'expiry', true)", start);
    const expiry = source.slice(start, end);
    expect(expiry).toContain('if (oneHertzMaintenanceTick)');
    expect(expiry).toContain('player_effect.by_expires_tick.filter(expiredThrough)');
    expect(expiry).toContain('player_party_invite.by_expires_tick.filter(expiredThrough)');
    expect(expiry).toContain('world_item.by_expires_tick.filter(expiredThrough)');
    expect(expiry).toContain('world_speech.by_expires_tick.filter(expiredThrough)');
    expect(expiry).not.toMatch(/(?:player_effect|player_party_invite|world_item|world_speech)\.iter\(\)/);
    expect(source).toContain('worldItemExpiredForRow(contentRegistry(ctx), item, clock.authorityTick)');
    expect(source).toContain('effect.expiresTick > authorityTick');
    expect(source).toContain('speech.expiresTick <= clock');
  });

  it('bounds cadenced regrowth and audit work through integer indexes', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('world_resource.by_regrowth_progress.filter(progress)');
    expect(step).toContain('connection_audit.by_occurred_at_micros.filter(expiredAuditRange)');
    expect(step).not.toContain('ctx.db.world_resource.iter()');
    expect(step).not.toContain('ctx.db.connection_audit.iter()');
  });

  it('reduces 1,000 expiry candidates from 20,000 scans/s to expired rows only', () => {
    const before = emptyTickUpdateCounters();
    recordTickRowScan(before, 'itemRowsScanned', 1_000 * 20);
    const after = emptyTickUpdateCounters();
    recordTickRowScan(after, 'itemRowsScanned', 25);
    expect(before.itemRowsScanned).toBe(20_000);
    expect(after.itemRowsScanned).toBe(25);
  });
});

describe('Architecture/World-SpacetimeDB: stage-2 scalability rules', () => {
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
    const onlineViews = source.slice(
      source.indexOf('export const onlinePlayerPublic ='),
      source.indexOf('export const ownStats ='),
    );
    expect(onlineViews.match(/player_public\.by_online\.filter\(true\)/g)).toHaveLength(2);
    expect(onlineViews).toContain('player_appearance.identity.find(profile.identity)');
    expect(onlineViews).not.toContain('player_public.iter()');
    expect(onlineViews).not.toContain('player_appearance.iter()');
    const bootstrap = source.slice(
      source.indexOf('function prepareConnection('),
      source.indexOf('export const onConnect ='),
    );
    const connect = source.slice(
      source.indexOf('export const onConnect ='),
      source.indexOf('\nexport const onDisconnect'),
    );
    expect(bootstrap.indexOf('requireAuthorizedSender(')).toBeGreaterThanOrEqual(0);
    expect(connect).toContain('prepareConnection(ctx)');
    expect(connect).toContain('findSurvivalSpawnTile(');
    expect(connect).not.toContain('Array.from({ length: 25 }');
  });
});
