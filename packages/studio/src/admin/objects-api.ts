import { diffAdminValues, type AdminJsonObject } from '@orchard/sim';
import {
  parseAdminReason,
  type AdminAuditRow,
  type AdminContainerSnapshot,
  type AdminEntityMutation,
  type AdminEntitySummary,
  type AdminMutationPreview,
  type AdminReason,
} from '../../../world/src/admin/contracts.js';

export interface AdminEntityRecord extends AdminEntitySummary {
  readonly ownerIdentity: string | null;
  readonly version: string;
}

export interface AdminEntityQuery {
  readonly kinds: readonly AdminEntitySummary['kind'][];
  readonly spaceId: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly text: string;
  readonly cursor: string | null;
  readonly limit: number;
}

export interface AdminEntityPage {
  readonly rows: readonly AdminEntityRecord[];
  readonly nextCursor: string | null;
  readonly worldVersion: string;
  readonly rowsScanned: number;
}

export interface AdminObjectMutationResult {
  readonly preview: AdminMutationPreview;
  readonly previewFingerprint: string;
  readonly committed: boolean;
  readonly version: string;
  readonly audit: AdminAuditRow | null;
  readonly notice: string | null;
}

/** Injectable U4 boundary. A future generated-binding adapter implements this;
 * tools never open their own connection or import world bindings. */
export interface AdminObjectsApi {
  readonly source: 'mock' | 'live';
  listEntities(query: AdminEntityQuery): Promise<AdminEntityPage>;
  container(entityId: string): Promise<AdminContainerSnapshot>;
  mutate(
    mutation: AdminEntityMutation,
    expectedBaseVersion: string,
    previewFingerprint: string | null,
  ): Promise<AdminObjectMutationResult>;
}

interface MutableEntity {
  entityId: string;
  kind: AdminEntityRecord['kind'];
  definitionId: string;
  ownerIdentity: string | null;
  spaceId: string;
  tileX: number;
  tileY: number;
  state: AdminJsonObject;
  version: string;
  container: AdminContainerSnapshot | null;
  revision: number;
}

interface Receipt {
  readonly mutation: AdminEntityMutation;
  readonly baseVersion: string;
  readonly fingerprint: string;
  readonly preview: AdminMutationPreview;
}

const freeze = <T>(value: T): Readonly<T> => Object.freeze(structuredClone(value));
const entityVersion = (entity: MutableEntity): string => `entity-v${entity.revision}`;

function fixture(
  entityId: string,
  kind: AdminEntityRecord['kind'],
  definitionId: string,
  tileX: number,
  tileY: number,
  state: AdminJsonObject,
  ownerIdentity: string | null,
  container: AdminContainerSnapshot | null,
): MutableEntity {
  return {
    entityId, kind, definitionId, spaceId: '0', tileX, tileY, state,
    ownerIdentity, version: 'entity-v1', container, revision: 1,
  };
}

function initialEntities(): MutableEntity[] {
  return [
    fixture('10', 'chest', 'object:chest', 12, 18, { carriedBy: null }, 'player-a', {
      entityId: '10', definitionId: 'object:chest', ownerIdentity: 'player-a',
      position: { spaceId: '0', tileX: 12, tileY: 18 }, state: { carriedBy: null }, processor: null,
      slots: [{ itemKind: 'apple', displayName: 'Apple', quantity: 3, maxStack: 20, tags: ['food'] }, null],
      version: 'entity-v1',
    }),
    fixture('11', 'placeable', 'object:furnace', 15, 20, { lit: true }, 'player-a', {
      entityId: '11', definitionId: 'object:furnace', ownerIdentity: 'player-a',
      position: { spaceId: '0', tileX: 15, tileY: 20 }, state: { lit: true },
      processor: { processStartTick: '900', processInputKind: 'iron_ore', processStartedBy: 'player-a' },
      slots: [{ itemKind: 'iron_ore', displayName: 'Iron ore', quantity: 2, maxStack: 20, tags: ['ore'] }, null],
      version: 'entity-v1',
    }),
    fixture('21', 'placeable', 'object:standing_torch', 20, 16, { lit: true }, 'player-b', null),
    fixture('7', 'npc', 'npc:fisherman_fin', 22, 21, { activity: 'fish_wait' }, null, null),
  ];
}

function normalizedReason(value: AdminReason): AdminReason {
  const parsed = parseAdminReason(String(value));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function targetId(mutation: AdminEntityMutation): string | null {
  return 'entityId' in mutation ? mutation.entityId : 'npcId' in mutation ? mutation.npcId : null;
}

function entityDocument(entity: MutableEntity | null): AdminJsonObject {
  if (entity === null) return {};
  return {
    definitionId: entity.definitionId, spaceId: entity.spaceId,
    tileX: entity.tileX, tileY: entity.tileY, state: entity.state,
    container: entity.container === null ? null : {
      entityId: entity.container.entityId,
      definitionId: entity.container.definitionId,
      version: entity.container.version,
      processor: entity.container.processor,
      slots: entity.container.slots.map((stack) => stack === null ? null : ({
        itemKind: stack.itemKind, quantity: stack.quantity,
        ...(stack.durability === undefined ? {} : { durability: stack.durability }),
      })),
    },
  };
}

function mutationAfter(entity: MutableEntity | null, mutation: AdminEntityMutation): AdminJsonObject {
  const before = entityDocument(entity);
  switch (mutation.operation) {
    case 'spawn_entity': return { ...before, definitionId: mutation.definitionId, spaceId: mutation.spaceId,
      tileX: mutation.tileX, tileY: mutation.tileY, state: mutation.state ?? {} };
    case 'despawn_entity': return {};
    case 'move_entity': return { ...before, spaceId: mutation.spaceId, tileX: mutation.tileX, tileY: mutation.tileY };
    case 'set_entity_state': return { ...before, state: { ...(entity?.state ?? {}), ...mutation.patch } };
    case 'set_container_slot': return { ...before, slot: mutation.slot,
      stack: mutation.stack === null ? null : { itemKind: mutation.stack.itemKind,
        quantity: mutation.stack.quantity,
        ...(mutation.stack.durability === undefined ? {} : { durability: mutation.stack.durability }) } };
    case 'repair_entity': return { ...before, damage: 0, processor: null };
    case 'replace_entity': return { ...before, definitionId: mutation.definitionId };
    case 'relocate_npc': return { ...before, spaceId: mutation.spaceId, tileX: mutation.tileX, tileY: mutation.tileY };
    case 'respawn_resources': return { ...before, area: [mutation.x0, mutation.y0, mutation.x1, mutation.y1] };
  }
}

function fingerprint(mutation: AdminEntityMutation, baseVersion: string): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify({ ...mutation, dryRun: false, baseVersion })) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `preview:${hash.toString(16).padStart(8, '0')}`;
}

export class MockAdminObjectsApi implements AdminObjectsApi {
  readonly source = 'mock' as const;
  readonly #entities = initialEntities();
  readonly #receipts = new Map<string, Receipt>();
  #worldRevision = 1;

  async listEntities(query: AdminEntityQuery): Promise<AdminEntityPage> {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100
      || query.x0 > query.x1 || query.y0 > query.y1) throw new Error('admin_payload_invalid');
    const offset = query.cursor === null ? 0 : Number(query.cursor);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('admin_payload_invalid');
    const text = query.text.trim().toLocaleLowerCase('en-US');
    const matches = this.#entities.filter((entity) => query.kinds.includes(entity.kind)
      && entity.spaceId === query.spaceId && entity.tileX >= query.x0 && entity.tileX <= query.x1
      && entity.tileY >= query.y0 && entity.tileY <= query.y1
      && (text.length === 0 || `${entity.entityId} ${entity.definitionId}`.toLocaleLowerCase('en-US').includes(text)))
      .sort((left, right) => left.entityId.localeCompare(right.entityId));
    const rows = matches.slice(offset, offset + query.limit).map((entity) => freeze({ ...entity, container: undefined }));
    return freeze({ rows, nextCursor: offset + rows.length < matches.length ? String(offset + rows.length) : null,
      worldVersion: `world-v${this.#worldRevision}`, rowsScanned: Math.min(matches.length, offset + query.limit) });
  }

  async container(entityId: string): Promise<AdminContainerSnapshot> {
    const entity = this.#entities.find((candidate) => candidate.entityId === entityId);
    if (entity?.container === null || entity?.container === undefined) throw new Error('admin_entity_not_found');
    return freeze({ ...entity.container, version: entityVersion(entity) });
  }

  async mutate(mutation: AdminEntityMutation, expectedBaseVersion: string, previewFingerprint: string | null): Promise<AdminObjectMutationResult> {
    normalizedReason(mutation.reason);
    const id = targetId(mutation);
    const entity = id === null ? null : this.#entities.find((candidate) => candidate.entityId === id) ?? null;
    const baseVersion = entity === null ? `world-v${this.#worldRevision}` : entityVersion(entity);
    if (baseVersion !== expectedBaseVersion) throw new Error('admin_preview_stale');
    const before = entityDocument(entity);
    const after = mutationAfter(entity, mutation);
    const preview: AdminMutationPreview = freeze({ operation: mutation.operation,
      target: id === null ? { kind: 'space', spaceId: 'spaceId' in mutation ? mutation.spaceId : '0' } : { kind: 'entity', entityId: id },
      baseVersion, preview: diffAdminValues(before, after), warnings: mutation.operation === 'despawn_entity'
        ? ['Despawn may spill or explicitly destroy container custody.'] : [], expiresAtMicros: '1780000060000000' });
    const nextFingerprint = fingerprint(mutation, baseVersion);
    if (mutation.dryRun) {
      this.#receipts.set(mutation.clientMutationId, { mutation, baseVersion, fingerprint: nextFingerprint, preview });
      return freeze({ preview, previewFingerprint: nextFingerprint, committed: false,
        version: baseVersion, audit: null, notice: null });
    }
    const receipt = this.#receipts.get(mutation.clientMutationId);
    if (receipt === undefined || receipt.baseVersion !== baseVersion || receipt.fingerprint !== previewFingerprint
      || fingerprint(receipt.mutation, baseVersion) !== nextFingerprint) throw new Error('admin_preview_required');
    this.apply(entity, mutation);
    this.#receipts.delete(mutation.clientMutationId);
    const version = entity === null ? `world-v${this.#worldRevision}` : entityVersion(entity);
    return freeze({ preview, previewFingerprint: nextFingerprint, committed: true, version,
      audit: { id: `audit-${mutation.clientMutationId}`, actorIdentity: 'studio-admin', operation: mutation.operation,
        target: preview.target, occurredAtMicros: '1780000000000000', payload: {
          schemaVersion: 1, clientMutationId: mutation.clientMutationId, target: preview.target,
          reason: mutation.reason, changes: preview.preview.changes, inverse: null,
        } }, notice: entity?.ownerIdentity === null ? null : 'The object was changed by an administrator.' });
  }

  private apply(entity: MutableEntity | null, mutation: AdminEntityMutation): void {
    if (mutation.operation === 'spawn_entity') {
      const nextId = String(100 + this.#entities.length);
      const chest = mutation.definitionId === 'object:chest';
      const ownerIdentity = mutation.ownerIdentity ?? null;
      const created = fixture(nextId, chest ? 'chest' : 'placeable', mutation.definitionId, mutation.tileX, mutation.tileY,
        mutation.state ?? {}, ownerIdentity, chest ? {
          entityId: nextId, definitionId: mutation.definitionId, ownerIdentity,
          position: { spaceId: mutation.spaceId, tileX: mutation.tileX, tileY: mutation.tileY },
          state: mutation.state ?? {}, processor: null, slots: [null, null], version: 'entity-v1',
        } : null);
      created.spaceId = mutation.spaceId;
      this.#entities.push(created);
      this.#worldRevision += 1; return;
    }
    if (mutation.operation === 'respawn_resources') { this.#worldRevision += 1; return; }
    if (entity === null) throw new Error('admin_entity_not_found');
    if (mutation.operation === 'despawn_entity') {
      this.#entities.splice(this.#entities.indexOf(entity), 1); this.#worldRevision += 1; return;
    }
    if (mutation.operation === 'move_entity' || mutation.operation === 'relocate_npc') {
      entity.spaceId = mutation.spaceId; entity.tileX = mutation.tileX; entity.tileY = mutation.tileY;
    } else if (mutation.operation === 'set_entity_state') entity.state = freeze({ ...entity.state, ...mutation.patch });
    else if (mutation.operation === 'replace_entity') entity.definitionId = mutation.definitionId;
    else if (mutation.operation === 'set_container_slot') {
      if (entity.container === null) throw new Error('admin_entity_not_found');
      const slots = [...entity.container.slots];
      slots[mutation.slot] = mutation.stack === null ? null : {
        ...mutation.stack, displayName: mutation.stack.itemKind, maxStack: 99, tags: [],
      };
      entity.container = freeze({ ...entity.container, slots });
    } else if (mutation.operation === 'repair_entity' && entity.container !== null) {
      entity.container = freeze({ ...entity.container, processor: null });
    }
    entity.revision += 1; entity.version = entityVersion(entity);
    if (entity.container !== null) entity.container = freeze({ ...entity.container, version: entity.version,
      position: { spaceId: entity.spaceId, tileX: entity.tileX, tileY: entity.tileY },
      state: entity.state, definitionId: entity.definitionId });
    this.#worldRevision += 1;
  }
}

export function createMockAdminObjectsApi(): AdminObjectsApi { return new MockAdminObjectsApi(); }
