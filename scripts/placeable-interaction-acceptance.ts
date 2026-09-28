import { pathToFileURL } from 'node:url';
import { DbConnection, tables, type SubscriptionHandle } from '@orchard/world-bindings';
import type { Identity } from 'spacetimedb';
import { CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION, buildContentRegistry, contentDefinitionRowsHash, type ContentRegistry } from '@orchard/sim';
import { CONTENT_ENGINE_VERSION } from '../packages/world/src/content/version.js';
import {
  acceptanceCellsEqual,
  acceptanceCellsWellFormed,
  isPlaceableAcceptanceKind,
  placeableAcceptanceCapacity,
  planPlaceableAcceptance,
  type AcceptancePlaceable,
  type AcceptanceCell,
  type AcceptancePosition,
  type PlaceableAcceptanceKind,
  type PlaceableAcceptanceMode,
} from './placeable-interaction-acceptance-policy.js';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'https://orchard.dastari.net';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const TIMEOUT_MS = 40_000;

interface Client {
  readonly connection: DbConnection;
  readonly identity: Identity;
  subscription: SubscriptionHandle | null;
}

type WorldPlaceableRow = NonNullable<
  ReturnType<DbConnection['db']['worldPlaceable']['id']['find']>
>;

function timeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), TIMEOUT_MS);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => {
      clearTimeout(timer); reject(error);
    });
  });
}

async function waitUntil(label: string, predicate: () => boolean): Promise<void> {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > TIMEOUT_MS) throw new Error(`${label}_timeout`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * The harness reads the container-cell views, so it runs only against a world on inventory protocol 2 (the Uncapped
 * Storage step-4 release). Acknowledging the protocol is also what lets this connection open a placeable; an older
 * world has no such reducer and is refused here with a clear message rather than read through frozen legacy views.
 */
export const ACCEPTANCE_PROTOCOL_REQUIRED = 'acceptance_world_not_on_container_cells:'
  + 'this harness needs a world on inventory protocol 2 (Uncapped Storage step 4); the legacy slot views are frozen';

async function acknowledgeProtocol(client: Client): Promise<void> {
  try {
    await timeout('acceptance_protocol', client.connection.reducers.acknowledgeInventoryProtocol({
      version: CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION,
    }));
  } catch {
    throw new Error(ACCEPTANCE_PROTOCOL_REQUIRED);
  }
}

function connect(token: string): Promise<Client> {
  return timeout('acceptance_connect', new Promise((resolve, reject) => {
    DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE).withToken(token)
      .onConnect((connection, identity) => resolve({ connection, identity, subscription: null }))
      .onConnectError(() => reject(new Error('acceptance_connection_rejected')))
      .build();
  }));
}

function subscribe(client: Client, kind: PlaceableAcceptanceKind): Promise<void> {
  type SubscriptionQuery = Parameters<ReturnType<DbConnection['subscriptionBuilder']>['subscribe']>[0];
  const queries = [
    tables.worldPlaceable.where((row) => row.kind.eq(kind)),
    tables.playerPosition.where((row) => row.identity.eq(client.identity)),
    tables.ownActivePlaceable,
    tables.ownOpenPlaceableContainerCells,
    tables.ownPlacedPlaceableContainerCells,
    tables.contentHead.where((row) => row.packId.eq('live')),
    tables.contentDefinition,
  ];
  return timeout('acceptance_subscription', new Promise((resolve, reject) => {
    client.subscription = client.connection.subscriptionBuilder()
      .onApplied(() => resolve())
      // A world before inventory protocol 2 has no container-cell views, so the subscription itself is refused there.
      .onError(() => reject(new Error(`acceptance_subscription_rejected:${ACCEPTANCE_PROTOCOL_REQUIRED}`)))
      .subscribe(queries as unknown as SubscriptionQuery);
  }));
}

function registrySnapshot(client: Client): { readonly registry: ContentRegistry; readonly headKey: string } {
  const head = client.connection.db.contentHead.packId.find('live');
  const definitions = [...client.connection.db.contentDefinition.iter()];
  if (head === null || head.engineVersion !== CONTENT_ENGINE_VERSION
    || head.definitionCount !== definitions.length) throw new Error('acceptance_content_head_unavailable');
  const built = buildContentRegistry(definitions);
  if (!built.report.valid || contentDefinitionRowsHash(definitions) !== head.contentHash) {
    throw new Error('acceptance_content_head_invalid');
  }
  return { registry: built.registry,
    headKey: `${head.packId}:${head.revision}:${head.contentHash}:${head.engineVersion}:${head.definitionCount}` };
}

function identityHex(value: { toHexString(): string } | undefined): string | null {
  return value?.toHexString() ?? null;
}

function targetSnapshot(row: WorldPlaceableRow): AcceptancePlaceable {
  return { id: row.id, kind: row.kind, definitionId: row.definitionId,
    tileX: row.tileX, tileY: row.tileY, spaceId: row.spaceId,
    placedBy: row.placedBy.toHexString(), carriedBy: identityHex(row.carriedBy), open: row.open,
    processStartTick: row.processStartTick ?? null,
    processStartedBy: identityHex(row.processStartedBy), processInputKind: row.processInputKind ?? null };
}

function positionSnapshot(row: {
  readonly x: number; readonly y: number; readonly facing: string; readonly spaceId: number;
}): AcceptancePosition {
  return { x: row.x, y: row.y, facing: row.facing, spaceId: row.spaceId };
}

function cellSnapshot(row: AcceptanceCell): AcceptanceCell {
  const { placeableId, index, itemKind, quantity, durability, lit } = row;
  return { placeableId, index, itemKind, quantity, durability, lit };
}

/** The target's durable occupied cells (sparse: an empty container has none). */
function placedCells(client: Client, targetId: bigint): readonly AcceptanceCell[] {
  return [...client.connection.db.ownPlacedPlaceableContainerCells.iter()]
    .filter(({ placeableId }) => placeableId === targetId).map(cellSnapshot);
}

/** The open session's occupied cells, as the open-menu view serves them. */
function openCells(client: Client): readonly AcceptanceCell[] {
  return [...client.connection.db.ownOpenPlaceableContainerCells.iter()].map(cellSnapshot);
}

function selectedTarget(client: Client, targetId: bigint | null) {
  const rows = [...client.connection.db.worldPlaceable.iter()];
  if (targetId === null) return null;
  return rows.find(({ id }) => id === targetId) ?? null;
}

function activeId(client: Client): bigint | null {
  return [...client.connection.db.ownActivePlaceable.iter()][0]?.id ?? null;
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, field) => typeof field === 'bigint' ? field.toString() : field, 2);
}

export async function main(): Promise<void> {
  const mode = (process.argv[2] ?? 'inspect') as PlaceableAcceptanceMode;
  if (mode !== 'inspect' && mode !== 'interact') {
    throw new Error('usage: placeable-interaction-acceptance <inspect|interact>');
  }
  const rawKind = process.env['PLACEABLE_ACCEPTANCE_KIND'] ?? '';
  if (!isPlaceableAcceptanceKind(rawKind)) {
    throw new Error('PLACEABLE_ACCEPTANCE_KIND_required:chest|fruit_press|fermentation_cask');
  }
  const rawTargetId = process.env['PLACEABLE_ACCEPTANCE_TARGET_ID'];
  const targetId = rawTargetId === undefined || rawTargetId.length === 0 ? null : BigInt(rawTargetId);
  if (mode === 'interact' && targetId === null) throw new Error('PLACEABLE_ACCEPTANCE_TARGET_ID_required');
  const token = process.env['PLACEABLE_ACCEPTANCE_TOKEN'];
  if (token === undefined || token.length === 0) throw new Error('PLACEABLE_ACCEPTANCE_TOKEN_required');

  const client = await connect(token);
  try {
    await subscribe(client, rawKind);
    const content = registrySnapshot(client);
    const { registry } = content;
    const identity = client.identity.toHexString();
    const position = [...client.connection.db.playerPosition.iter()][0];
    if (position === undefined || !position.identity.isEqual(client.identity)) {
      throw new Error('acceptance_player_position_missing');
    }
    if (targetId === null) {
      const candidates = [...client.connection.db.worldPlaceable.iter()].map((row) => {
        const target = targetSnapshot(row);
        const candidate = planPlaceableAcceptance({
          registry, mode: 'inspect', host: HOST, database: DATABASE, identity,
          expectedIdentity: process.env['PLACEABLE_ACCEPTANCE_EXPECT_IDENTITY'], kind: rawKind, target,
          position: positionSnapshot(position), cells: placedCells(client, row.id),
          activePlaceableId: activeId(client), allowProduction: false,
        });
        return { id: row.id, tileX: row.tileX, tileY: row.tileY, spaceId: row.spaceId,
          inspection: candidate.inspection, issues: candidate.issues,
          requiredConfirmation: candidate.confirmation };
      });
      process.stdout.write(`${json({ ok: true, mode, host: HOST, database: DATABASE, identity,
        kind: rawKind, position: positionSnapshot(position), candidates,
        next: 'Set PLACEABLE_ACCEPTANCE_TARGET_ID to inspect an exact target. Interaction requires ownership because the durable pre-open cell projection is owner-scoped.' })}\n`);
      return;
    }
    const row = selectedTarget(client, targetId);
    if (row === null) throw new Error('acceptance_target_not_found');
    const target = targetSnapshot(row);
    const cellsBefore = placedCells(client, targetId);
    const capacity = placeableAcceptanceCapacity(registry, target);
    const input = { registry, mode, host: HOST, database: DATABASE, identity,
      expectedIdentity: process.env['PLACEABLE_ACCEPTANCE_EXPECT_IDENTITY'], kind: rawKind, target,
      position: positionSnapshot(position), cells: cellsBefore, activePlaceableId: activeId(client),
      confirmation: process.env['PLACEABLE_ACCEPTANCE_CONFIRM'],
      allowProduction: process.env['PLACEABLE_ACCEPTANCE_ALLOW_PRODUCTION'] === 'YES' } as const;
    const plan = planPlaceableAcceptance(input);
    if (mode === 'inspect') {
      process.stdout.write(`${json({ ok: plan.issues.length === 0, mode, production: plan.production,
        identity, target, position: input.position, occupiedCells: cellsBefore.length,
        capacity, inspection: plan.inspection,
        issues: plan.issues,
        requiredConfirmation: plan.confirmation,
        knownDurableSideEffects: rawKind === 'chest' ? ['player_statistics:chests_opened'] : [] })}\n`);
      return;
    }
    if (plan.issues.length > 0) throw new Error(`acceptance_preflight_failed:${plan.issues.join(',')}`);
    await acknowledgeProtocol(client);

    if (registrySnapshot(client).headKey !== content.headKey) {
      throw new Error('acceptance_content_head_changed');
    }
    let interactionDispatched = false;
    try {
      interactionDispatched = true;
      await timeout('acceptance_interact', client.connection.reducers.interactEntity({
        targetKind: 'placeable', entityId: targetId, verb: 'use',
      }));
      await waitUntil('acceptance_open_view', () => activeId(client) === targetId);
      // Sparse views: the open session must show exactly the durable cells, all inside the capacity. An empty
      // container shows no rows in either view.
      await waitUntil('acceptance_cell_view', () => acceptanceCellsEqual(cellsBefore, openCells(client)));
      if (!acceptanceCellsWellFormed(openCells(client), targetId, capacity)) {
        throw new Error('acceptance_open_cells_invalid');
      }
      if (!acceptanceCellsEqual(cellsBefore, placedCells(client, targetId))) {
        throw new Error('acceptance_cells_changed_while_opening');
      }
    } finally {
      // Always enqueue cleanup after dispatch, even when the reducer promise
      // times out locally. Calls on this connection retain wire order, so a
      // late successful open is followed by this close rather than being left
      // as a durable active_placeable session.
      if (interactionDispatched) {
        await timeout('acceptance_close', client.connection.reducers.closePlaceable({}));
        await waitUntil('acceptance_close_view', () => activeId(client) === null);
      }
    }
    const cellsAfter = placedCells(client, targetId);
    if (!acceptanceCellsEqual(cellsBefore, cellsAfter)) throw new Error('acceptance_cells_not_restored');
    await waitUntil('acceptance_open_state_restore', () => (
      selectedTarget(client, targetId)?.open === target.open
    ));
    const targetAfter = selectedTarget(client, targetId);
    if (targetAfter === null || targetAfter.open !== target.open) throw new Error('acceptance_open_state_not_restored');
    process.stdout.write(`${json({ ok: true, mode, production: plan.production, kind: rawKind,
      targetId, activeFrameObserved: true, capacity, occupiedCells: cellsBefore.length,
      itemsMoved: 0, durableCellsUnchanged: true, openStateRestored: true,
      knownDurableSideEffects: rawKind === 'chest' ? ['player_statistics:chests_opened'] : [] })}\n`);
  } finally {
    client.subscription?.unsubscribe();
    client.connection.disconnect();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
