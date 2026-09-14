import { diffAdminValues, type AdminJsonObject, type AdminJsonValue } from '@orchard/sim';
import {
  ADMIN_MUTATION_ID_PATTERN,
  parseAdminReason,
  type AdminAuditRow,
  type AdminConnectionRow,
  type AdminErrorCode,
  type AdminMutationPreview,
  type AdminPage,
  type AdminPlayerInventory,
  type AdminPlayerMutation,
  type AdminPlayerSnapshot,
  type AdminPlayerSummary,
  type AdminReason,
} from '../../../world/src/admin/contracts.js';

export type {
  AdminAuditRow,
  AdminConnectionRow,
  AdminMutationPreview,
  AdminPage,
  AdminPlayerInventory,
  AdminPlayerMutation,
  AdminPlayerSnapshot,
  AdminPlayerSummary,
  AdminReason,
};

export interface AdminPlayerMutationResult {
  readonly preview: AdminMutationPreview;
  readonly committed: boolean;
  readonly version: string;
  readonly audit: AdminAuditRow | null;
  readonly notice: string | null;
  readonly undoAuditId: string | null;
}

export interface AdminUndoRequest {
  readonly auditId: string;
  readonly targetIdentity: string;
  readonly reason: AdminReason;
  readonly clientMutationId: string;
  readonly expectedBaseVersion: string;
}

/** W1/W2 implement this interface with typed procedure/reducer transports.
 * U1 deliberately knows nothing about subscriptions or connection lifecycle. */
export interface AdminApi {
  readonly source: 'mock' | 'live';
  findPlayers(query: string, cursor: string | null): Promise<AdminPage<AdminPlayerSummary>>;
  playerSnapshot(identity: string): Promise<AdminPlayerSnapshot>;
  playerInventory(identity: string): Promise<AdminPlayerInventory>;
  connections(identity: string, cursor: string | null): Promise<AdminPage<AdminConnectionRow>>;
  mutatePlayer(mutation: AdminPlayerMutation, expectedBaseVersion: string): Promise<AdminPlayerMutationResult>;
  undoPlayer(request: AdminUndoRequest): Promise<AdminPlayerMutationResult>;
}

export class AdminApiError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
    this.name = 'AdminApiError';
  }
}

export function normalizeAdminReason(input: string): AdminReason {
  const parsed = parseAdminReason(input);
  if (!parsed.ok) throw new AdminApiError(parsed.error);
  return parsed.value;
}

/** Procedure transports may return their typed SDK value directly or a JSON
 * string on hosts using the fallback procedure bridge. Decoding and validation
 * stay behind AdminApi implementations, never in tool models. */
export function decodeAdminTransportResult<T>(
  payload: unknown,
  isResult: (value: unknown) => value is T,
): T {
  let decoded = payload;
  if (typeof payload === 'string') {
    try { decoded = JSON.parse(payload) as unknown; }
    catch { throw new AdminApiError('admin_payload_invalid'); }
  }
  if (!isResult(decoded)) throw new AdminApiError('admin_payload_invalid');
  return decoded;
}

interface MutablePlayerRecord {
  snapshot: AdminPlayerSnapshot;
  inventory: AdminPlayerInventory;
  connections: readonly AdminConnectionRow[];
  version: number;
}

interface MockPreviewRecord {
  readonly identity: string;
  readonly baseVersion: string;
  readonly mutation: AdminPlayerMutation;
  readonly preview: AdminMutationPreview;
  readonly undoState: { readonly snapshot: AdminPlayerSnapshot; readonly inventory: AdminPlayerInventory };
}

function frozen<T>(value: T): Readonly<T> {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object' || Object.isFrozen(candidate)) return;
    for (const child of Object.values(candidate)) freeze(child);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function version(value: number): string { return `player-v${value}`; }

function mutationFingerprint(mutation: AdminPlayerMutation): string {
  return JSON.stringify({ ...mutation, dryRun: false });
}

function micros(value: number): string { return String(1_780_000_000_000_000 + value * 1_000_000); }

function fixture(
  identity: string, displayName: string, role: AdminPlayerSummary['role'], online: boolean,
  spaceId: string, tileX: number, tileY: number, seed: number,
): MutablePlayerRecord {
  const currentVersion = version(seed);
  return {
    version: seed,
    snapshot: frozen({
      identity, displayName,
      membership: { role, grants: role === 'friend' ? [] : ['support'], blocked: false, revoked: false },
      online,
      position: { spaceId, tileX, tileY },
      spawn: { spaceId: 'topside', tileX: 12, tileY: 18 },
      walletBronze: String(120 + seed * 25),
      stats: { farming: seed + 2, fishing: seed + 1, mining: seed },
      vitals: { health: 100, stamina: 82, hunger: 64 },
      effects: [{ id: 'well_fed', remainingTicks: 420 }],
      skillTracks: [{ id: 'farming', points: seed + 1 }, { id: 'mining', points: seed }],
      skillNodes: [{ id: 'green_thumb', unlocked: seed > 1 }],
      quests: [{ id: 'orchard_welcome', state: seed > 1 ? 'complete' : 'active', baseline: 0 }],
      statistics: [{ id: 'trees_tended', value: seed * 7 }, { id: 'fish_caught', value: seed * 3 }],
      homestead: { spaceId: `homestead-${seed}`, role: 'member' },
      dialogue: online ? { npcId: 'marlow', nodeId: 'greeting' } : null,
      mount: null,
      version: currentVersion,
    } satisfies AdminPlayerSnapshot),
    inventory: frozen({
      identity,
      slots: [
        { slot: { area: 'hotbar', index: 0 }, stack: { itemKind: 'apple', displayName: 'Apple', quantity: seed + 1, maxStack: 20, tags: ['food'] } },
        { slot: { area: 'backpack', index: 0 }, stack: { itemKind: 'wood', displayName: 'Wood', quantity: seed * 4, maxStack: 99, tags: ['material'] } },
        { slot: { area: 'equipment', index: 0 }, stack: null },
        { slot: { area: 'crafting', index: 0 }, stack: null },
        { slot: { area: 'cursor', index: 0 }, stack: null },
        { slot: { area: 'overflow', index: 0 }, stack: null },
      ],
      version: currentVersion,
    } satisfies AdminPlayerInventory),
    connections: frozen([
      { connectionId: `${identity}-active`, identity, connectedAtMicros: micros(seed), disconnectedAtMicros: online ? null : micros(seed + 1), remoteAddress: null, active: online },
      { connectionId: `${identity}-prior`, identity, connectedAtMicros: micros(seed - 2), disconnectedAtMicros: micros(seed - 1), remoteAddress: null, active: false },
    ]),
  };
}

function mutationDocument(
  snapshot: AdminPlayerSnapshot,
  inventory: AdminPlayerInventory,
  mutation: AdminPlayerMutation,
): readonly [AdminJsonObject, AdminJsonObject] {
  const before: Record<string, AdminJsonValue> = {};
  const after: Record<string, AdminJsonValue> = {};
  const stackJson = (stack: { readonly itemKind: string; readonly quantity: number; readonly durability?: number } | null): AdminJsonValue => (
    stack === null ? null : { itemKind: stack.itemKind, quantity: stack.quantity, ...(stack.durability === undefined ? {} : { durability: stack.durability }) }
  );
  const inventoryJson = (): AdminJsonValue => inventory.slots.map(({ slot, stack }) => ({
    area: slot.area, index: slot.index, stack: stackJson(stack),
  }));
  switch (mutation.operation) {
    case 'set_wallet': {
      before['walletBronze'] = snapshot.walletBronze;
      after['walletBronze'] = (BigInt(snapshot.walletBronze) + BigInt(mutation.deltaBronze)).toString();
      break;
    }
    case 'set_stats': before['stats'] = snapshot.stats; after['stats'] = { ...snapshot.stats, ...mutation.patch }; break;
    case 'set_vitals': before['vitals'] = snapshot.vitals; after['vitals'] = { ...snapshot.vitals, ...mutation.patch }; break;
    case 'grant_skill_points':
      before['skillTracks'] = snapshot.skillTracks;
      after['skillTracks'] = [...snapshot.skillTracks, { id: mutation.track, grantedPoints: mutation.points }];
      break;
    case 'reset_skill_tree': before['skillNodes'] = snapshot.skillNodes; after['skillNodes'] = []; break;
    case 'set_quest_state':
      before['quests'] = snapshot.quests;
      after['quests'] = [...snapshot.quests, { id: mutation.questId, state: mutation.state }];
      break;
    case 'reset_quests': before['quests'] = snapshot.quests; after['quests'] = []; break;
    case 'give_items':
    case 'remove_items':
      before['inventory'] = inventoryJson();
      after['inventoryOperation'] = { operation: mutation.operation, stacks: mutation.stacks.map(stackJson) };
      break;
    case 'clear_cursor':
    case 'drain_overflow':
      before['inventory'] = inventoryJson();
      after['inventoryOperation'] = mutation.operation;
      break;
    case 'set_slot': {
      const old = inventory.slots.find(({ slot }) => slot.area === mutation.slot.area && slot.index === mutation.slot.index)?.stack ?? null;
      before['slot'] = stackJson(old);
      after['slot'] = stackJson(mutation.stack);
      break;
    }
    case 'set_spawn': before['spawn'] = snapshot.spawn; after['spawn'] = { spaceId: mutation.spaceId, tileX: mutation.tileX, tileY: mutation.tileY }; break;
    case 'respawn': before['position'] = snapshot.position; after['position'] = snapshot.spawn; break;
    case 'unstick': before['position'] = snapshot.position; after['position'] = { remedy: 'nearest_walkable_tile' }; break;
    case 'teleport_player': before['position'] = snapshot.position; after['position'] = { spaceId: mutation.spaceId, tileX: mutation.tileX, tileY: mutation.tileY }; break;
    case 'set_display_name': before['displayName'] = snapshot.displayName; after['displayName'] = mutation.displayName; break;
    case 'kick': before['online'] = snapshot.online; after['online'] = false; after['notice'] = mutation.notice; break;
    case 'notify': before['notice'] = null; after['notice'] = mutation.body; break;
  }
  return [before, after];
}

function applyMutation(record: MutablePlayerRecord, mutation: AdminPlayerMutation): void {
  const snapshot = record.snapshot;
  const update: { -readonly [Key in keyof AdminPlayerSnapshot]?: AdminPlayerSnapshot[Key] } = {};
  switch (mutation.operation) {
    case 'set_wallet': update.walletBronze = (BigInt(snapshot.walletBronze) + BigInt(mutation.deltaBronze)).toString(); break;
    case 'set_stats': update.stats = { ...snapshot.stats, ...mutation.patch }; break;
    case 'set_vitals': update.vitals = { ...snapshot.vitals, ...mutation.patch }; break;
    case 'grant_skill_points': update.skillTracks = [...snapshot.skillTracks, { id: mutation.track, grantedPoints: mutation.points }]; break;
    case 'reset_skill_tree': update.skillNodes = []; break;
    case 'set_quest_state': update.quests = [...snapshot.quests, { id: mutation.questId, state: mutation.state }]; break;
    case 'reset_quests': update.quests = []; break;
    case 'set_spawn': update.spawn = { spaceId: mutation.spaceId, tileX: mutation.tileX, tileY: mutation.tileY }; break;
    case 'respawn': update.position = snapshot.spawn; update.mount = null; break;
    case 'unstick': update.position = { ...(snapshot.position ?? {}), remedy: 'nearest_walkable_tile' }; break;
    case 'teleport_player': update.position = { spaceId: mutation.spaceId, tileX: mutation.tileX, tileY: mutation.tileY }; break;
    case 'set_display_name': update.displayName = mutation.displayName; break;
    case 'kick': update.online = false; break;
    case 'set_slot': {
      record.inventory = frozen({ ...record.inventory, slots: record.inventory.slots.map((entry) => (
        entry.slot.area === mutation.slot.area && entry.slot.index === mutation.slot.index
          ? { ...entry, stack: mutation.stack === null ? null : { ...mutation.stack, displayName: mutation.stack.itemKind, maxStack: 99, tags: [] } }
          : entry
      )) });
      break;
    }
    case 'clear_cursor': record.inventory = frozen({ ...record.inventory, slots: record.inventory.slots.map((entry) => entry.slot.area === 'cursor' ? { ...entry, stack: null } : entry) }); break;
    case 'drain_overflow': record.inventory = frozen({ ...record.inventory, slots: record.inventory.slots.map((entry) => entry.slot.area === 'overflow' ? { ...entry, stack: null } : entry) }); break;
    case 'give_items':
    case 'remove_items':
    case 'notify': break;
  }
  record.snapshot = frozen({ ...snapshot, ...update });
}

/** Deterministic stand-in for W1/W2. It models preview tokens, version conflicts,
 * audit/notices and undo without constructing a live adapter. */
export class MockAdminApi implements AdminApi {
  readonly source = 'mock' as const;
  readonly #players = new Map<string, MutablePlayerRecord>([
    ['identity-ada', fixture('identity-ada', 'Ada Orchard', 'owner', true, 'topside', 18, 22, 4)],
    ['identity-bea', fixture('identity-bea', 'Bea Bramble', 'admin', true, 'cellar-1', 8, 11, 3)],
    ['identity-cy', fixture('identity-cy', 'Cy Moss', 'friend', false, 'topside', 31, 14, 2)],
    ['identity-dee', fixture('identity-dee', 'Dee Reed', 'moderator', true, 'homestead-4', 5, 7, 1)],
  ]);
  readonly #previews = new Map<string, MockPreviewRecord>();
  readonly #audits = new Map<string, MockPreviewRecord>();
  readonly #pageSize: number;
  #auditSequence = 0;

  constructor(pageSize = 2) { this.#pageSize = Math.max(1, Math.trunc(pageSize)); }

  async findPlayers(query: string, cursor: string | null): Promise<AdminPage<AdminPlayerSummary>> {
    const normalized = query.trim().toLocaleLowerCase('en');
    const offset = cursor === null ? 0 : Number.parseInt(cursor, 10);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new AdminApiError('admin_invalid_cursor');
    const matches = [...this.#players.values()].filter(({ snapshot }) => (
      normalized.length === 0
      || snapshot.displayName.toLocaleLowerCase('en').includes(normalized)
      || snapshot.identity.toLocaleLowerCase('en').includes(normalized)
    )).sort((left, right) => left.snapshot.displayName.localeCompare(right.snapshot.displayName, 'en'));
    const rows = matches.slice(offset, offset + this.#pageSize).map(({ snapshot }) => ({
      identity: snapshot.identity, displayName: snapshot.displayName, role: snapshot.membership.role,
      grants: snapshot.membership.grants, online: snapshot.online,
      spaceId: typeof snapshot.position?.['spaceId'] === 'string' ? snapshot.position['spaceId'] : null,
      tileX: typeof snapshot.position?.['tileX'] === 'number' ? snapshot.position['tileX'] : null,
      tileY: typeof snapshot.position?.['tileY'] === 'number' ? snapshot.position['tileY'] : null,
      lastSeenMicros: micros(matches.length - offset),
    }));
    const next = offset + rows.length;
    return frozen({ rows, nextCursor: next < matches.length ? String(next) : null });
  }

  async playerSnapshot(identity: string): Promise<AdminPlayerSnapshot> {
    return frozen(this.record(identity).snapshot);
  }

  async playerInventory(identity: string): Promise<AdminPlayerInventory> {
    return frozen(this.record(identity).inventory);
  }

  async connections(identity: string, cursor: string | null): Promise<AdminPage<AdminConnectionRow>> {
    const rows = this.record(identity).connections;
    const offset = cursor === null ? 0 : Number.parseInt(cursor, 10);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new AdminApiError('admin_invalid_cursor');
    const page = rows.slice(offset, offset + this.#pageSize);
    const next = offset + page.length;
    return frozen({ rows: page, nextCursor: next < rows.length ? String(next) : null });
  }

  async mutatePlayer(mutation: AdminPlayerMutation, expectedBaseVersion: string): Promise<AdminPlayerMutationResult> {
    normalizeAdminReason(mutation.reason);
    if (!ADMIN_MUTATION_ID_PATTERN.test(mutation.clientMutationId)) throw new AdminApiError('admin_invalid_mutation_id');
    const record = this.record(mutation.targetIdentity);
    if (record.snapshot.version !== expectedBaseVersion) throw new AdminApiError('admin_preview_stale');
    const [before, after] = mutationDocument(record.snapshot, record.inventory, mutation);
    const changes = diffAdminValues(before, after);
    if (changes.changes.length === 0) throw new AdminApiError('admin_no_changes');
    const preview: AdminMutationPreview = frozen({
      operation: mutation.operation,
      target: { kind: 'player', identity: mutation.targetIdentity },
      baseVersion: expectedBaseVersion,
      preview: changes,
      warnings: mutation.operation === 'teleport_player' || mutation.operation === 'kick'
        ? ['The affected online player will receive a notice.'] : [],
      expiresAtMicros: micros(record.version + 60),
    });
    if (mutation.dryRun) {
      this.#previews.set(mutation.clientMutationId, {
        identity: mutation.targetIdentity, baseVersion: expectedBaseVersion, mutation, preview,
        undoState: frozen({ snapshot: record.snapshot, inventory: record.inventory }),
      });
      return frozen({ preview, committed: false, version: expectedBaseVersion, audit: null, notice: null, undoAuditId: null });
    }
    const staged = this.#previews.get(mutation.clientMutationId);
    if (staged === undefined || staged.identity !== mutation.targetIdentity || staged.baseVersion !== expectedBaseVersion
      || mutationFingerprint(staged.mutation) !== mutationFingerprint(mutation)) throw new AdminApiError('admin_preview_required');
    applyMutation(record, mutation);
    record.version += 1;
    const committedVersion = version(record.version);
    record.snapshot = frozen({ ...record.snapshot, version: committedVersion });
    record.inventory = frozen({ ...record.inventory, version: committedVersion });
    const auditId = `mock-audit-${++this.#auditSequence}`;
    const notice = mutation.operation === 'notify' ? mutation.body
      : mutation.operation === 'kick' ? mutation.notice
        : ['teleport_player', 'set_spawn', 'respawn', 'unstick', 'give_items', 'remove_items', 'set_slot', 'clear_cursor', 'drain_overflow', 'set_quest_state', 'reset_quests'].includes(mutation.operation)
          ? `An administrator applied ${mutation.operation.replaceAll('_', ' ')}.` : null;
    const audit: AdminAuditRow = frozen({
      id: auditId, actorIdentity: 'mock-studio-operator', operation: mutation.operation,
      target: { kind: 'player', identity: mutation.targetIdentity }, occurredAtMicros: micros(record.version),
      payload: {
        schemaVersion: 1, clientMutationId: mutation.clientMutationId,
        target: { kind: 'player', identity: mutation.targetIdentity }, reason: mutation.reason,
        changes: preview.preview.changes,
        inverse: { operation: 'undo', args: { auditId } },
        ...(notice === null ? {} : { notice }),
      },
    });
    this.#audits.set(auditId, staged);
    this.#previews.delete(mutation.clientMutationId);
    return frozen({ preview, committed: true, version: committedVersion, audit, notice, undoAuditId: auditId });
  }

  async undoPlayer(request: AdminUndoRequest): Promise<AdminPlayerMutationResult> {
    normalizeAdminReason(request.reason);
    if (!ADMIN_MUTATION_ID_PATTERN.test(request.clientMutationId)) throw new AdminApiError('admin_invalid_mutation_id');
    const staged = this.#audits.get(request.auditId);
    if (staged === undefined || staged.identity !== request.targetIdentity) throw new AdminApiError('admin_entity_not_found');
    const record = this.record(request.targetIdentity);
    if (record.snapshot.version !== request.expectedBaseVersion) throw new AdminApiError('admin_world_revision_conflict');
    const beforeVersion = record.snapshot.version;
    record.version += 1;
    const committedVersion = version(record.version);
    record.snapshot = frozen({ ...staged.undoState.snapshot, version: committedVersion });
    record.inventory = frozen({ ...staged.undoState.inventory, version: committedVersion });
    const preview: AdminMutationPreview = frozen({
      operation: 'undo', target: { kind: 'player', identity: request.targetIdentity }, baseVersion: beforeVersion,
      preview: { changes: staged.preview.preview.changes.map(({ path, before, after }) => ({ path, before: after, after: before })), truncated: false },
      warnings: [], expiresAtMicros: micros(record.version + 60),
    });
    const audit: AdminAuditRow = frozen({
      id: `mock-audit-${++this.#auditSequence}`, actorIdentity: 'mock-studio-operator', operation: 'undo',
      target: { kind: 'player', identity: request.targetIdentity }, occurredAtMicros: micros(record.version),
      payload: { schemaVersion: 1, clientMutationId: request.clientMutationId, target: { kind: 'player', identity: request.targetIdentity }, reason: request.reason, changes: preview.preview.changes, inverse: null },
    });
    this.#audits.delete(request.auditId);
    return frozen({ preview, committed: true, version: committedVersion, audit, notice: 'The previous administration action was undone.', undoAuditId: null });
  }

  private record(identity: string): MutablePlayerRecord {
    const record = this.#players.get(identity);
    if (record === undefined) throw new AdminApiError('admin_target_not_found');
    return record;
  }
}

export function createMockAdminApi(pageSize?: number): AdminApi { return new MockAdminApi(pageSize); }
