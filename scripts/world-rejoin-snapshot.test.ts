import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  OBSERVER_EFFECT_STATISTICS,
  REQUIRED_REJOIN_TABLES,
  WORLD_REJOIN_EXCLUSIONS,
  RETIRED_CHEST_ACCESSORS,
  assertNoCredentialMaterial,
  assertGenericOnlyRejoinContract,
  assertRejoinTableCoverage,
  compareWorldRejoinSnapshots,
  normalizeRejoinTables,
  normalizeRejoinValue,
  type WorldRejoinSnapshot,
} from './world-rejoin-snapshot.js';

function rawTables(identity = 'identity-a'): Record<string, readonly unknown[]> {
  return Object.fromEntries(REQUIRED_REJOIN_TABLES.map((coverage) => {
    const identityField = coverage.identityField ?? 'identity';
    const row = { id: coverage.accessor, ...(coverage.identityScoped ? { [identityField]: identity } : {}) };
    return [coverage.accessor, coverage.cardinality === 'zero_or_more' ? [] : [row]];
  }));
}

function snapshot(identity = 'identity-a'): WorldRejoinSnapshot {
  return {
    formatVersion: 2,
    database: 'orchard-cellar-world',
    capturedAt: '2026-09-03T00:00:00.000Z',
    exclusions: WORLD_REJOIN_EXCLUSIONS,
    identities: [{ label: 'owner', identity, tables: normalizeRejoinTables(rawTables(identity), identity) }],
  };
}

describe('world rejoin snapshot normalization', () => {
  it('preserves Hearth custody, skill priorities, pending rewards and order revision across reconnect', () => {
    const rows = {
      ownHearthStashSlots: [{ identity: 'identity-a', id: 'stash:0', slot: 0, itemKind: 'sword', quantity: 1, durability: 71, lit: false }],
      ownEquipmentPreferences: [{ identity: 'identity-a', skillPriority: ['sword_mastery', 'vitality'] }],
      ownOutdoorRewards: [{ identity: 'identity-a', id: 'reward:1', itemsJson: '[{"kind":"ember_seal","quantity":1}]', combatExperience: 25, claimed: false }],
      ownVillageOrders: [{ id: 'timber', revision: 3n, totalBronze: 40n, contentHash: 'reviewed' }],
    };
    const before = snapshot();
    const tables = normalizeRejoinTables({ ...rawTables(), ...rows }, 'identity-a');
    const withTables = (value: typeof tables): WorldRejoinSnapshot => ({ ...before, identities: [{ label: 'owner', identity: 'identity-a', tables: value }] });
    expect(compareWorldRejoinSnapshots(withTables(tables), withTables(tables))).toEqual([]);
    for (const accessor of Object.keys(rows)) {
      const lost = normalizeRejoinTables({ ...rawTables(), ...rows, [accessor]: [] }, 'identity-a');
      expect(compareWorldRejoinSnapshots(withTables(tables), withTables(lost)).length).toBeGreaterThan(0);
    }
    for (const accessor of ['ownHearthStashSlots', 'ownEquipmentPreferences', 'ownOutdoorRewards']) {
      expect(() => normalizeRejoinTables({ ...rawTables(), [accessor]: [{ identity: 'someone-else' }] }, 'identity-a'))
        .toThrow(`identity_scope_mismatch:${accessor}`);
    }
  });
  it('retains every pending cooking obligation field across rejoin rather than normalizing its clock away', () => {
    const job = {
      identity: 'identity-a', targetKind: 'landmark', targetId: 3_000_000_004n,
      spaceId: 0, recipeId: 'cook_beef', inputKind: 'raw_beef', outputKind: 'cooked_beef',
      quantity: 8, startedTick: 21n, readyTick: 101n,
    };
    const tables = { ...rawTables(), ownCookingJob: [job] };
    expect(normalizeRejoinTables(tables, 'identity-a').ownCookingJob).toEqual([normalizeRejoinValue(job)]);
    for (const [field, value] of Object.entries(job)) {
      if (field === 'identity') continue;
      const changed = typeof value === 'bigint' ? value + 1n
        : typeof value === 'number' ? value + 1 : `${value}_changed`;
      expect(normalizeRejoinTables({ ...tables, ownCookingJob: [{ ...job, [field]: changed }] }, 'identity-a').ownCookingJob)
        .not.toEqual(normalizeRejoinTables(tables, 'identity-a').ownCookingJob);
    }
  });
  it('covers every mandated durable state family and owned generic containers', () => {
    const categories = new Set(REQUIRED_REJOIN_TABLES.flatMap(({ categories }) => categories));
    expect([...categories].sort()).toEqual([
      'containers', 'economy', 'equipment', 'homestead', 'inventory', 'position',
      'profile', 'progression', 'social', 'spawn', 'survival', 'world_revision',
    ]);
    expect(REQUIRED_REJOIN_TABLES.map(({ accessor }) => accessor)).toEqual(expect.arrayContaining([
      'ownInventorySlots', 'ownInventoryCursor', 'ownInventoryOverflow', 'ownPlayerSpawn',
      'worldPlaceable', 'ownPlacedPlaceableSlots', 'ownPlacedPlaceableDamage',
      'liveMapDocument', 'contentHead', 'spaceAdminFlag',
    ]));
  });

  it('pins retirement continuity to the v2 generic-only chest surface', () => {
    expect(() => assertGenericOnlyRejoinContract()).not.toThrow();
    expect(RETIRED_CHEST_ACCESSORS).toEqual(['worldChest', 'ownActiveChest', 'ownOpenChestSlots']);
    expect(REQUIRED_REJOIN_TABLES.map(({ accessor }) => accessor))
      .not.toEqual(expect.arrayContaining(RETIRED_CHEST_ACCESSORS));
  });

  it('fails closed on a missing view, singleton row, or identity-scoped leak', () => {
    const accessors = new Set(REQUIRED_REJOIN_TABLES.map(({ accessor }) => accessor));
    accessors.delete('ownPlayerSpawn');
    expect(() => assertRejoinTableCoverage(accessors)).toThrow('required_table_missing:ownPlayerSpawn');
    const missing = rawTables();
    missing['ownWallet'] = [];
    expect(() => normalizeRejoinTables(missing, 'identity-a')).toThrow('required_row_count:ownWallet');
    const leaked = rawTables();
    leaked['ownInventorySlots'] = [{ identity: 'identity-b' }];
    expect(() => normalizeRejoinTables(leaked, 'identity-a')).toThrow('identity_scope_mismatch:ownInventorySlots');
    const wrongPlacer = rawTables();
    wrongPlacer['worldPlaceable'] = [{ placedBy: 'identity-b' }];
    expect(() => normalizeRejoinTables(wrongPlacer, 'identity-a')).toThrow('identity_scope_mismatch:worldPlaceable');
  });

  it('normalizes bigint, bytes, identities, timestamps, keys, and row order', () => {
    const identity = { toHexString: () => 'abc' };
    const normalized = normalizeRejoinValue({
      z: 4n,
      bytes: new Uint8Array([2, 15]),
      identity,
      timestamp: { microsSinceUnixEpoch: 99n },
    });
    expect(normalized).toEqual({
      bytes: { $bytes: '020f' },
      identity: { $identity: 'abc' },
      timestamp: { $timestampMicros: '99' },
      z: { $bigint: '4' },
    });
  });

  it('excludes only enumerated session surfaces and observer-effect statistics', () => {
    expect(OBSERVER_EFFECT_STATISTICS).toEqual(['connections_opened', 'world_entries', 'time_played']);
    expect(WORLD_REJOIN_EXCLUSIONS.map(({ accessor }) => accessor)).toEqual([
      'activeFarmSkillNodes', 'activeFarmUpgrades',
      'connectionPresenceV2', 'playerPublic.online/lastActiveAtMicros',
      'contentHead.updatedAt', 'ownStats.regenTick',
      'ownConnectionNotices', 'ownSessionChatNotices',
      'ownPlayerPrediction', 'ownFishingCast', 'ownTradeSession', 'ownTradeOffers',
      'ownActiveDialogue', 'ownActiveHearthStash', 'ownCombatState',
      'worldChest', 'ownActiveChest', 'ownOpenChestSlots',
      'ownActivePlaceable', 'ownOpenPlaceableSlots', 'visibleWorldSpeech', 'observer statistics',
    ]);
    const tables = rawTables();
    tables['ownPlayerStatistics'] = [
      { identity: 'identity-a', statisticKind: 'connections_opened', value: 4n },
      { identity: 'identity-a', statisticKind: 'trees_tended', value: 9n },
    ];
    expect(normalizeRejoinTables(tables, 'identity-a')['ownPlayerStatistics']).toHaveLength(1);
    const presenceTables = rawTables();
    presenceTables['playerPublic'] = [{ identity: 'identity-a', displayName: 'Toby', online: true, lastActiveAtMicros: 4n }];
    expect(normalizeRejoinTables(presenceTables, 'identity-a')['playerPublic']).toEqual([
      { displayName: 'Toby', identity: 'identity-a' },
    ]);
  });

  it('ignores only the stats regeneration cursor while keeping player values exact', () => {
    const stats = {
      identity: 'identity-a', str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      healthCenti: 10_000, healthRemainder: 0, manaCenti: 10_000, manaRemainder: 0,
      vigourCenti: 10_000, vigourRemainder: 0, lastSwingTick: 40n, regenTick: 100n,
    };
    const beforeTables = rawTables();
    beforeTables['ownStats'] = [stats];
    const afterTables = rawTables();
    afterTables['ownStats'] = [{ ...stats, regenTick: 110n }];
    const withTables = (tables: Record<string, readonly unknown[]>) => ({
      ...snapshot(), identities: [{ label: 'owner', identity: 'identity-a',
        tables: normalizeRejoinTables(tables, 'identity-a') }],
    });
    expect(compareWorldRejoinSnapshots(withTables(beforeTables), withTables(afterTables))).toEqual([]);

    const driftedTables = rawTables();
    driftedTables['ownStats'] = [{ ...stats, healthCenti: 9_999, regenTick: 110n }];
    expect(compareWorldRejoinSnapshots(withTables(beforeTables), withTables(driftedTables))).toEqual([
      expect.objectContaining({ code: 'row_mismatch', table: 'owner:ownStats' }),
    ]);
  });

  it('ignores only the independent content bootstrap timestamp and still detects semantic drift', () => {
    const contentHead = {
      packId: 'live', revision: 1n, contentHash: 'content-a', engineVersion: 1,
      definitionCount: 459, clientMutationId: 'bootstrap-content-v1',
      updatedBy: 'database-identity', updatedAt: { microsSinceUnixEpoch: 10n },
    };
    const beforeTables = rawTables();
    beforeTables['contentHead'] = [contentHead];
    const afterTables = rawTables();
    afterTables['contentHead'] = [{ ...contentHead, updatedAt: { microsSinceUnixEpoch: 99n } }];
    const before = {
      ...snapshot(), identities: [{ label: 'owner', identity: 'identity-a',
        tables: normalizeRejoinTables(beforeTables, 'identity-a') }],
    };
    const after = {
      ...snapshot(), identities: [{ label: 'owner', identity: 'identity-a',
        tables: normalizeRejoinTables(afterTables, 'identity-a') }],
    };
    expect(before.identities[0]!.tables['contentHead']).toEqual([{
      clientMutationId: 'bootstrap-content-v1', contentHash: 'content-a', definitionCount: 459,
      engineVersion: 1, packId: 'live', revision: { $bigint: '1' }, updatedBy: 'database-identity',
    }]);
    expect(compareWorldRejoinSnapshots(before, after)).toEqual([]);

    const driftedTables = rawTables();
    driftedTables['contentHead'] = [{ ...contentHead, contentHash: 'content-b',
      updatedAt: { microsSinceUnixEpoch: 99n } }];
    const drifted = {
      ...snapshot(), identities: [{ label: 'owner', identity: 'identity-a',
        tables: normalizeRejoinTables(driftedTables, 'identity-a') }],
    };
    expect(compareWorldRejoinSnapshots(before, drifted)).toEqual([
      expect.objectContaining({ code: 'row_mismatch', table: 'owner:contentHead' }),
    ]);

    const actorDriftTables = rawTables();
    actorDriftTables['contentHead'] = [{ ...contentHead, updatedBy: 'different-database-identity',
      updatedAt: { microsSinceUnixEpoch: 99n } }];
    const actorDrift = {
      ...snapshot(), identities: [{ label: 'owner', identity: 'identity-a',
        tables: normalizeRejoinTables(actorDriftTables, 'identity-a') }],
    };
    expect(compareWorldRejoinSnapshots(before, actorDrift)).toEqual([
      expect.objectContaining({ code: 'row_mismatch', table: 'owner:contentHead' }),
    ]);
  });

  it('uses exact parity for all remaining values and rejects identity drift', () => {
    const before = snapshot();
    const same = { ...snapshot(), capturedAt: '2026-09-04T00:00:00.000Z' };
    expect(compareWorldRejoinSnapshots(before, same)).toEqual([]);
    const changed = snapshot();
    const tables = { ...changed.identities[0]!.tables, ownWallet: [{ identity: 'identity-a', balance: 1 }] };
    expect(compareWorldRejoinSnapshots(before, {
      ...changed, identities: [{ ...changed.identities[0]!, tables }],
    })).toEqual([expect.objectContaining({ code: 'row_mismatch', table: 'owner:ownWallet' })]);
    expect(() => compareWorldRejoinSnapshots(before, snapshot('identity-b'))).toThrow('identity_drift:owner');
  });

  it('rejects credential material anywhere in a snapshot payload', () => {
    expect(() => assertNoCredentialMaterial({ identities: [{ tables: {}, refreshToken: 'secret' }] }))
      .toThrow('credential_material_in_snapshot:refreshToken');
    expect(() => assertNoCredentialMaterial(snapshot())).not.toThrow();
  });
});

describe('world rejoin smoke safety contract', () => {
  const source = readFileSync(new URL('./world-rejoin-smoke.ts', import.meta.url), 'utf8');
  const credentialSource = readFileSync(new URL('./world-rejoin-credentials.ts', import.meta.url), 'utf8');
  const clientSource = readFileSync(new URL('../packages/client/src/net/overworld-connection.ts', import.meta.url), 'utf8');

  it('loads in the Node release process without requiring Vite browser globals', async () => {
    await expect(import('./world-rejoin-smoke.js')).resolves.toBeDefined();
  });

  it('uses saved tokens only for connection and never invokes reducers or broad subscriptions', () => {
    expect(source).toContain('.withToken(credential.token)');
    expect(source).not.toMatch(/\.reducers\b|callReducer|subscribeToAllTables/);
    expect(source).not.toMatch(/\.heartbeat\s*\(/);
    expect(source).toContain('.onApplied(');
    expect(source).toContain('.onError(');
    expect(source).toContain("grant_type: 'refresh_token'");
    expect(source).toContain('refreshRejoinCredentialFile({');
    expect(credentialSource).toContain('refresh_capable_rejoin_credentials_required');
  });

  it('checks binding coverage before credentials/connect and creates snapshots mode 0600', () => {
    const main = source.slice(source.indexOf('async function main'));
    expect(main.indexOf("if (mode === 'refresh')")).toBeLessThan(main.indexOf('assertCurrentBindings()'));
    expect(main.indexOf('assertCurrentBindings()')).toBeLessThan(main.lastIndexOf('credentials()'));
    expect(main.indexOf('assertCurrentBindings()')).toBeLessThan(main.indexOf('captureAll(savedCredentials)'));
    expect(source).toContain("open(path, 'wx', 0o600)");
    expect(source).toContain('file.chmod(0o600)');
    expect(source).toContain('JSON.stringify(snapshot, null, 2)');
    expect(source).toContain('writePrivateSnapshot(afterSnapshotPath, actual)');
  });

  it('classifies every table in the current client self-subscription as durable or explicitly ephemeral', () => {
    const selfSubscription = clientSource.slice(
      clientSource.indexOf('private subscribeSelf'),
      clientSource.indexOf('private subscribeRegion'),
    );
    const currentAccessors = [...selfSubscription.matchAll(/tables\.([A-Za-z0-9]+)/g)]
      .map((match) => match[1]!);
    const classified = new Set([
      ...REQUIRED_REJOIN_TABLES.map(({ accessor }) => accessor),
      ...WORLD_REJOIN_EXCLUSIONS.map(({ accessor }) => accessor).filter((accessor) => /^[A-Za-z0-9]+$/.test(accessor)),
    ]);
    expect(currentAccessors.length).toBeGreaterThan(30);
    expect(currentAccessors.filter((accessor) => !classified.has(accessor))).toEqual([]);
  });
});
