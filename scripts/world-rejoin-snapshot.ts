import {
  compareDurableWorldSnapshots,
  DURABLE_WORLD_SNAPSHOT_VERSION,
  type DurableWorldSnapshot,
  type WorldStateParityIssue,
} from '../packages/tools/src/world-state-parity.js';
import { legacyGlobalSlotToCell } from '../packages/sim/src/container-addressing.js';

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
 * clears them, or they represent an in-flight/session-only UI interaction. An entry tagged `introducedWith` names a
 * view that release added; a snapshot captured before it (by the previous release's tooling) lacks exactly those. */
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
  { accessor: 'ownOpenPlaceableContainerCells', reason: 'in-flight container UI session (container cells); durable owned cells use ownPlacedPlaceableContainerCells', introducedWith: 'container_cells' },
  { accessor: 'visibleWorldSpeech', reason: 'short-lived presentation event' },
  { accessor: 'observer statistics', reason: 'connections_opened, world_entries, and time_played are changed by the read-only reconnect act itself' },
] as const);

/** The exclusion list a snapshot captured before the container-cell release carries: the current list without the
 * entries introduced with it, in the same order and byte-identical otherwise. */
export const PRE_CONTAINER_CELL_REJOIN_EXCLUSIONS = Object.freeze(
  WORLD_REJOIN_EXCLUSIONS.filter((exclusion) => !('introducedWith' in exclusion)),
);

/** Only the current list, or the pre-container-cell list (older tooling across the upgrade), is accepted. */
function acceptedRejoinExclusions(exclusions: unknown): boolean {
  const serialized = JSON.stringify(exclusions);
  return serialized === JSON.stringify(WORLD_REJOIN_EXCLUSIONS)
    || serialized === JSON.stringify(PRE_CONTAINER_CELL_REJOIN_EXCLUSIONS);
}

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
  /** Views that appeared with the container-cell tables (Uncapped Storage step 4). A snapshot captured before them
   * may lack them; parity then compares the derived custody (`derived:*`) against the legacy views instead. */
  readonly introducedWith?: 'container_cells';
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
  { accessor: 'ownPlacedPlaceableContainerCells', categories: ['containers'], cardinality: 'zero_or_more', identityScoped: false, query: 'caller_view', introducedWith: 'container_cells' },
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
  // Frozen since the container-cell move (a character created after it has no legacy rows); still compared exactly.
  { accessor: 'ownInventorySlots', categories: ['inventory', 'equipment'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view' },
  { accessor: 'ownPlayerContainerCells', categories: ['inventory', 'equipment', 'containers'], cardinality: 'zero_or_more', identityScoped: true, query: 'caller_view', introducedWith: 'container_cells' },
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
  /** The capturing tooling's list: the current one, or the pre-container-cell one for a snapshot from before it. */
  readonly exclusions: typeof WORLD_REJOIN_EXCLUSIONS | typeof PRE_CONTAINER_CELL_REJOIN_EXCLUSIONS;
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
  // Observer-effect counters (and the milestones they cross) move because the release's own reconnects count as
  // connections and world entries; a milestone such as world_entries 500 can be crossed mid-release.
  const filtered = accessor !== 'ownPlayerStatistics' && accessor !== 'ownPlayerStatisticMilestones' ? rows : rows.filter((row) => {
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

export function assertRejoinTableCoverage(
  availableAccessors: ReadonlySet<string>,
  options: { readonly allowIntroduced?: boolean } = {},
): void {
  const missing = REQUIRED_REJOIN_TABLES
    .filter(({ introducedWith }) => options.allowIntroduced !== true || introducedWith === undefined)
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
    || !acceptedRejoinExclusions(source['exclusions'])
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
    // A snapshot captured before the container-cell views may lack exactly those; parity derives custody instead.
    assertRejoinTableCoverage(new Set(Object.keys(snapshotTables)), { allowIntroduced: true });
    for (const coverage of REQUIRED_REJOIN_TABLES) {
      const rows = snapshotTables[coverage.accessor];
      if (rows === undefined && coverage.introducedWith !== undefined) continue;
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

function field(row: unknown, key: string): unknown {
  return record(row)?.[key];
}

function occupied(row: unknown): boolean {
  const quantity = field(row, 'quantity');
  return field(row, 'itemKind') !== 'empty' && typeof quantity === 'number' && quantity > 0;
}

function custodyEntry(row: unknown, address: Record<string, unknown>): Record<string, unknown> {
  return { ...address, itemKind: field(row, 'itemKind'), quantity: field(row, 'quantity'),
    durability: field(row, 'durability'), lit: field(row, 'lit') };
}

function sortedCustody(entries: readonly Record<string, unknown>[]): readonly unknown[] {
  return Object.freeze(entries.map(normalizeRejoinValue)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}

/**
 * Item custody in container-cell terms, derived from whichever views a snapshot has: the container-cell views when
 * present, otherwise the legacy dense views (inventory slots by the frozen legacy layout, stash slots as the `stash`
 * container, placeable slots by index). Vacant legacy rows hold no item and are not custody.
 */
export function derivedCustodyTables(tables: Readonly<Record<string, readonly unknown[]>>): Readonly<Record<string, readonly unknown[]>> {
  const player = tables['ownPlayerContainerCells'] !== undefined
    ? tables['ownPlayerContainerCells'].filter(occupied).map((row) => custodyEntry(row, {
      container: field(row, 'container'), index: field(row, 'index'),
    }))
    : [
      ...(tables['ownInventorySlots'] ?? []).filter(occupied).map((row) => {
        const slot = field(row, 'slot');
        const cell = typeof slot === 'number' ? legacyGlobalSlotToCell(slot) : null;
        return custodyEntry(row, cell === null ? { container: 'legacy', index: slot } : { container: cell.container, index: cell.index });
      }),
      ...(tables['ownHearthStashSlots'] ?? []).filter(occupied).map((row) => custodyEntry(row, {
        container: 'stash', index: field(row, 'slot'),
      })),
    ];
  const placeables = tables['ownPlacedPlaceableContainerCells'] !== undefined
    ? tables['ownPlacedPlaceableContainerCells'].filter(occupied).map((row) => custodyEntry(row, {
      placeableId: field(row, 'placeableId'), index: field(row, 'index'),
    }))
    : (tables['ownPlacedPlaceableSlots'] ?? []).filter(occupied).map((row) => custodyEntry(row, {
      placeableId: field(row, 'placeableId'), index: field(row, 'slot'),
    }));
  return Object.freeze({
    'derived:playerContainerCustody': sortedCustody(player),
    'derived:placedPlaceableCustody': sortedCustody(placeables),
  });
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
  // Views introduced with the container cells are compared raw only when both snapshots have them; the derived
  // custody tables always compare, so a capture before the move and one after it still prove every item kept.
  const introduced = new Set(REQUIRED_REJOIN_TABLES.flatMap(({ accessor, introducedWith }) => (
    introducedWith === undefined ? [] : [accessor])));
  const comparable = (table: string, label: string): boolean => !introduced.has(table)
    || [before, after].every((snapshot) => snapshot.identities.find((identity) => identity.label === label)
      ?.tables[table] !== undefined);
  function parity(snapshot: WorldRejoinSnapshot): DurableWorldSnapshot {
    return {
      formatVersion: DURABLE_WORLD_SNAPSHOT_VERSION,
      database: snapshot.database,
      capturedAt: snapshot.capturedAt,
      tables: Object.fromEntries(snapshot.identities.flatMap((identity) => [
        ...Object.entries(identity.tables).filter(([table]) => comparable(table, identity.label))
          .map(([table, rows]) => [`${identity.label}:${table}`, rows] as const),
        ...Object.entries(derivedCustodyTables(identity.tables)).map(([table, rows]) => [`${identity.label}:${table}`, rows] as const),
      ])),
    };
  }
  return compareDurableWorldSnapshots(parity(before), parity(after));
}
