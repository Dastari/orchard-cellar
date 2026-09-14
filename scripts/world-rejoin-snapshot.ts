import {
  compareDurableWorldSnapshots,
  DURABLE_WORLD_SNAPSHOT_VERSION,
  type DurableWorldSnapshot,
  type WorldStateParityIssue,
} from '../packages/tools/src/world-state-parity.js';

export const WORLD_REJOIN_SNAPSHOT_VERSION = 2 as const;

export const RETIRED_CHEST_ACCESSORS = Object.freeze([
  'worldChest',
  'ownActiveChest',
  'ownOpenChestSlots',
] as const);

export const OBSERVER_EFFECT_STATISTICS = Object.freeze([
  'connections_opened',
  'world_entries',
  'time_played',
] as const);

/** These rows are deliberately not continuity evidence: connecting creates or
 * clears them, or they represent an in-flight/session-only UI interaction. */
export const WORLD_REJOIN_EXCLUSIONS = Object.freeze([
  { accessor: 'activeFarmSkillNodes', reason: 'derived estate presentation; durable personal ranks are covered by ownPlayerSkillNodes' },
  { accessor: 'activeFarmUpgrades', reason: 'derived estate presentation; durable owned upgrades are covered by ownHomesteadUpgrades' },
  { accessor: 'connectionPresenceV2', reason: 'transport presence lease; connecting necessarily replaces it' },
  { accessor: 'playerPublic.online/lastActiveAtMicros', reason: 'presence projection fields changed by the read-only reconnect act' },
  { accessor: 'contentHead.updatedAt', reason: 'first-connect bootstrap seed uses the independent host wall clock' },
  { accessor: 'ownStats.regenTick', reason: 'regeneration scheduler cursor advances with world time while all stat values and remainders remain exact' },
  { accessor: 'ownConnectionNotices', reason: 'ephemeral per-connection inbox' },
  { accessor: 'ownSessionChatNotices', reason: 'ephemeral per-connection chat inbox' },
  { accessor: 'ownPlayerPrediction', reason: 'movement acknowledgement/session sequencing' },
  { accessor: 'ownFishingCast', reason: 'in-flight action canceled or settled across disconnect' },
  { accessor: 'ownTradeSession', reason: 'in-flight player session canceled on disconnect' },
  { accessor: 'ownTradeOffers', reason: 'rows owned by the excluded in-flight trade session' },
  { accessor: 'ownActiveDialogue', reason: 'session UI selection' },
  { accessor: 'ownActiveHearthStash', reason: 'connection-bound stash UI session; contents are preserved through ownHearthStashSlots' },
  { accessor: 'ownCombatState', reason: 'connection-bound dodge/block action and recovery timing; durable health and stamina remain in ownStats' },
  { accessor: 'worldChest', reason: 'temporary legacy mirror; durable container state is proven through generic placeables' },
  { accessor: 'ownActiveChest', reason: 'legacy in-flight container UI session' },
  { accessor: 'ownOpenChestSlots', reason: 'legacy in-flight container UI session' },
  { accessor: 'ownActivePlaceable', reason: 'in-flight container UI session' },
  { accessor: 'ownOpenPlaceableSlots', reason: 'in-flight container UI session; durable owned slots use ownPlacedPlaceableSlots' },
  { accessor: 'visibleWorldSpeech', reason: 'short-lived presentation event' },
  { accessor: 'observer statistics', reason: 'connections_opened, world_entries, and time_played are changed by the read-only reconnect act itself' },
] as const);

export type RejoinCoverageCategory =
  | 'inventory' | 'equipment' | 'profile' | 'economy' | 'survival'
  | 'progression' | 'homestead' | 'position' | 'spawn' | 'containers'
  | 'world_session' | 'social' | 'world_revision';

export interface RejoinTableCoverage {
  readonly accessor: string;
  readonly categories: readonly RejoinCoverageCategory[];
  readonly cardinality: 'exactly_one' | 'at_least_one' | 'zero_or_more';
  readonly identityScoped: boolean;
  readonly identityField?: 'identity' | 'owner' | 'placedBy';
  readonly query: 'identity' | 'caller_view';
}

/** Mirrors the durable portion of OverworldConnection.subscribeSelf plus its
 * identity-filtered public profile/appearance and the overflow/spawn views
 * required by the continuity invariant. The additive `ownPlayerSpawn` view is
 * caller-private; missing or stale deployed bindings still fail closed. */
export const REQUIRED_REJOIN_TABLES: readonly RejoinTableCoverage[] = Object.freeze([
  { accessor: 'liveMapDocument', categories: ['world_revision'], cardinality: 'exactly_one', identityScoped: false, query: 'caller_view' },
  { accessor: 'contentHead', categories: ['world_revision'], cardinality: 'exactly_one', identityScoped: false, query: 'caller_view' },
  { accessor: 'spaceAdminFlag', categories: ['world_revision'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'playerPublic', categories: ['profile'], cardinality: 'exactly_one', identityScoped: true, query: 'identity' },
  { accessor: 'playerAppearance', categories: ['profile'], cardinality: 'exactly_one', identityScoped: true, query: 'identity' },
  { accessor: 'playerPosition', categories: ['position'], cardinality: 'exactly_one', identityScoped: true, query: 'identity' },
  { accessor: 'worldPlaceable', categories: ['containers'], cardinality: 'zero_or_more', identityScoped: true, identityField: 'placedBy', query: 'identity' },
  { accessor: 'ownPlacedPlaceableSlots', categories: ['containers'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'ownPlacedPlaceableDamage', categories: ['containers'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'ownPlayerSpawn', categories: ['spawn'], cardinality: 'exactly_one', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownSurvival', categories: ['survival'], cardinality: 'exactly_one', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownCookingJob', categories: ['survival'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownStats', categories: ['survival'], cardinality: 'exactly_one', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownWallet', categories: ['economy'], cardinality: 'exactly_one', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownEffects', categories: ['survival', 'progression'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownRogueRun', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'ownRogueRoomExits', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'ownRogueRewardOffers', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'ownRogueRunUpgrades', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'ownInventorySlots', categories: ['inventory', 'equipment'], cardinality: 'at_least_one', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownInventoryCursor', categories: ['inventory'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownInventoryOverflow', categories: ['inventory'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownHearthStashSlots', categories: ['containers', 'inventory'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownEquipmentPreferences', categories: ['equipment'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownOutdoorRewards', categories: ['inventory', 'progression'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownVillageOrders', categories: ['economy', 'progression'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'ownKnownRecipes', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownPlayerQuests', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownPlayerQuestBaselines', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownPlayerStatistics', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownPlayerStatisticMilestones', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownPlayerSkillTracks', categories: ['progression'], cardinality: 'at_least_one', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownPlayerSkillNodes', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownQuestWorldItems', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownPlayerThought', categories: ['progression'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownCharacterProfile', categories: ['profile'], cardinality: 'exactly_one', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownMembership', categories: ['profile'], cardinality: 'exactly_one', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownCurrentHomestead', categories: ['homestead'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'ownHomesteadUpgrades', categories: ['homestead'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'ownHomesteadMembers', categories: ['homestead'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
  { accessor: 'ownChatChannels', categories: ['social'], cardinality: 'at_least_one', identityScoped: false, query: 'caller_view' },
  { accessor: 'visibleChatMessages', categories: ['social'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view' },
]);

export interface WorldRejoinIdentitySnapshot {
  readonly label: string;
  readonly identity: string;
  readonly tables: Readonly<Record<string, readonly unknown[]>>;
}

export interface WorldRejoinSnapshot {
  readonly formatVersion: typeof WORLD_REJOIN_SNAPSHOT_VERSION;
  readonly database: string;
  readonly capturedAt: string;
  readonly exclusions: typeof WORLD_REJOIN_EXCLUSIONS;
  readonly identities: readonly WorldRejoinIdentitySnapshot[];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function identityHex(value: unknown): string | null {
  const source = record(value);
  const method = source?.['toHexString'];
  if (typeof method !== 'function') return null;
  const result = Reflect.apply(method, value, []) as unknown;
  return typeof result === 'string' ? result : null;
}

const CREDENTIAL_FIELD = /^(?:token|accessToken|refreshToken|idToken|authorization)$/i;

export function assertNoCredentialMaterial(value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) assertNoCredentialMaterial(child);
    return;
  }
  const source = record(value);
  if (source === null) return;
  for (const [key, child] of Object.entries(source)) {
    if (CREDENTIAL_FIELD.test(key)) throw new Error(`credential_material_in_snapshot:${key}`);
    assertNoCredentialMaterial(child);
  }
}

export function normalizeRejoinValue(value: unknown): unknown {
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString('hex') };
  if (Array.isArray(value)) return value.map(normalizeRejoinValue);
  const identity = identityHex(value);
  if (identity !== null) return { $identity: identity };
  const source = record(value);
  if (source === null) return value;
  const timestamp = source['microsSinceUnixEpoch'];
  if (typeof timestamp === 'bigint') return { $timestampMicros: timestamp.toString() };
  return Object.fromEntries(Object.entries(source)
    .filter(([, child]) => child !== undefined && typeof child !== 'function')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, normalizeRejoinValue(child)]));
}

function normalizedRows(accessor: string, rows: readonly unknown[]): readonly unknown[] {
  const filtered = accessor !== 'ownPlayerStatistics' ? rows : rows.filter((row) => {
    const kind = record(row)?.['statisticKind'];
    return typeof kind !== 'string' || !(OBSERVER_EFFECT_STATISTICS as readonly string[]).includes(kind);
  });
  const withoutPresenceFields = accessor !== 'playerPublic' ? filtered : filtered.map((row) => {
    const source = record(row);
    if (source === null) return row;
    return Object.fromEntries(Object.entries(source).filter(([key]) => (
      key !== 'online' && key !== 'lastActiveAtMicros'
    )));
  });
  // A legacy database has no content head until the transitional module's
  // first authenticated connection. The isolated restore and production seed
  // identical content at different wall-clock instants, so that one timestamp
  // is not continuity evidence. Keep every semantic field (including revision,
  // hashes, mutation id, definition count, engine version, and updatedBy) exact.
  const withoutBootstrapTimestamp = accessor !== 'contentHead' ? withoutPresenceFields
    : withoutPresenceFields.map((row) => {
      const source = record(row);
      if (source === null) return row;
      return Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'updatedAt'));
    });
  // `regenTick` is a scheduler cursor advanced by the authority clock even when
  // a fully regenerated player is idle. Attribute/resource values, fractional
  // remainders, and `lastSwingTick` remain exact continuity evidence.
  const withoutRegenCursor = accessor !== 'ownStats' ? withoutBootstrapTimestamp
    : withoutBootstrapTimestamp.map((row) => {
      const source = record(row);
      if (source === null) return row;
      return Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'regenTick'));
    });
  return Object.freeze(withoutRegenCursor.map(normalizeRejoinValue).sort((left, right) => (
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  )));
}

export function assertRejoinTableCoverage(availableAccessors: ReadonlySet<string>): void {
  const missing = REQUIRED_REJOIN_TABLES
    .map(({ accessor }) => accessor)
    .filter((accessor) => !availableAccessors.has(accessor));
  if (missing.length > 0) throw new Error(`required_table_missing:${missing.join(',')}`);
}

/** Retirement releases must use the v2 continuity surface, where durable chest
 * ownership/content/damage is represented only by generic placeables. */
export function assertGenericOnlyRejoinContract(): void {
  const required = new Set(REQUIRED_REJOIN_TABLES.map(({ accessor }) => accessor));
  const legacy = RETIRED_CHEST_ACCESSORS.filter((accessor) => required.has(accessor));
  if (WORLD_REJOIN_SNAPSHOT_VERSION !== 2 || legacy.length > 0
    || !required.has('worldPlaceable') || !required.has('ownPlacedPlaceableSlots')
    || !required.has('ownPlacedPlaceableDamage')) {
    throw new Error(`world_rejoin_generic_only_contract_invalid:${legacy.join(',')}`);
  }
}

export function normalizeRejoinTables(
  rawTables: Readonly<Record<string, readonly unknown[]>>,
  expectedIdentity: string,
): Readonly<Record<string, readonly unknown[]>> {
  const available = new Set(Object.keys(rawTables));
  assertRejoinTableCoverage(available);
  const normalized: Record<string, readonly unknown[]> = {};
  for (const coverage of REQUIRED_REJOIN_TABLES) {
    const rows = rawTables[coverage.accessor]!;
    if (coverage.cardinality === 'exactly_one' && rows.length !== 1) {
      throw new Error(`required_row_count:${coverage.accessor}:expected_1:actual_${rows.length}`);
    }
    if (coverage.cardinality === 'at_least_one' && rows.length < 1) {
      throw new Error(`required_row_missing:${coverage.accessor}`);
    }
    if (coverage.identityScoped) {
      for (const row of rows) {
        const value = record(row)?.[coverage.identityField ?? 'identity'];
        const hex = typeof value === 'string' ? value : identityHex(value);
        if (hex !== expectedIdentity) throw new Error(`identity_scope_mismatch:${coverage.accessor}`);
      }
    }
    normalized[coverage.accessor] = normalizedRows(coverage.accessor, rows);
  }
  return Object.freeze(normalized);
}

export function parseWorldRejoinSnapshot(value: unknown): WorldRejoinSnapshot {
  assertNoCredentialMaterial(value);
  const source = record(value);
  if (source?.['formatVersion'] !== WORLD_REJOIN_SNAPSHOT_VERSION
    || typeof source['database'] !== 'string'
    || typeof source['capturedAt'] !== 'string'
    || JSON.stringify(source['exclusions']) !== JSON.stringify(WORLD_REJOIN_EXCLUSIONS)
    || !Array.isArray(source['identities'])) throw new Error('invalid_world_rejoin_snapshot');
  const identities = source['identities'];
  if (identities.length === 0) throw new Error('world_rejoin_snapshot_has_no_identities');
  const labels = new Set<string>();
  const identityValues = new Set<string>();
  for (const entry of identities) {
    const identity = record(entry);
    if (typeof identity?.['label'] !== 'string' || typeof identity['identity'] !== 'string'
      || record(identity['tables']) === null) throw new Error('invalid_world_rejoin_identity_snapshot');
    if (!/^[A-Za-z0-9._-]+$/.test(identity['label'])
      || labels.has(identity['label']) || identityValues.has(identity['identity'])) {
      throw new Error('invalid_world_rejoin_identity_snapshot');
    }
    labels.add(identity['label']);
    identityValues.add(identity['identity']);
    const snapshotTables = identity['tables'] as Record<string, unknown>;
    assertRejoinTableCoverage(new Set(Object.keys(snapshotTables)));
    for (const coverage of REQUIRED_REJOIN_TABLES) {
      const rows = snapshotTables[coverage.accessor];
      if (!Array.isArray(rows)) throw new Error(`invalid_world_rejoin_snapshot_table:${coverage.accessor}`);
      if (coverage.cardinality === 'exactly_one' && rows.length !== 1) {
        throw new Error(`required_row_count:${coverage.accessor}:expected_1:actual_${rows.length}`);
      }
      if (coverage.cardinality === 'at_least_one' && rows.length < 1) {
        throw new Error(`required_row_missing:${coverage.accessor}`);
      }
    }
  }
  return value as WorldRejoinSnapshot;
}

export function compareWorldRejoinSnapshots(
  before: WorldRejoinSnapshot,
  after: WorldRejoinSnapshot,
): readonly WorldStateParityIssue[] {
  const beforeLabels = before.identities.map(({ label }) => label).sort();
  const afterLabels = after.identities.map(({ label }) => label).sort();
  if (JSON.stringify(beforeLabels) !== JSON.stringify(afterLabels)) {
    throw new Error('credential_labels_changed');
  }
  for (const expected of before.identities) {
    const actual = after.identities.find(({ label }) => label === expected.label)!;
    if (actual.identity !== expected.identity) throw new Error(`identity_drift:${expected.label}`);
  }
  function parity(snapshot: WorldRejoinSnapshot): DurableWorldSnapshot {
    return {
      formatVersion: DURABLE_WORLD_SNAPSHOT_VERSION,
      database: snapshot.database,
      capturedAt: snapshot.capturedAt,
      tables: Object.fromEntries(snapshot.identities.flatMap((identity) => (
        Object.entries(identity.tables).map(([table, rows]) => [`${identity.label}:${table}`, rows])
      ))),
    };
  }
  return compareDurableWorldSnapshots(parity(before), parity(after));
}
