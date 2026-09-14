export { assertSingleItemLifecycleCallbacks } from './callback-ownership.js';
import { createHash } from 'node:crypto';
import {
  ITEM_ON_USE_EVENT_TYPES,
  isItemOnUseEventType,
  type ItemOnUseEventType,
} from '@orchard/sim';

export const LIFECYCLE_SOURCE_FORMAT = 'orchard-lifecycle-source-v1' as const;
export const LIFECYCLE_ENGINE_API_VERSION = 1 as const;

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9_.:-]{0,126}[a-z0-9])?$/u;
const MAX_HANDLER_SOURCE_BYTES = 16_384;
const MAX_HANDLERS_PER_BUNDLE = 512;

export interface ItemLifecycleSource {
  readonly itemId: string;
  readonly id: string;
  readonly event: 'onUse';
  readonly prompt: string;
  /** Omitted by v1 bundles to retain the original secondary/F behavior. */
  readonly triggers?: readonly ItemOnUseEventType[];
  /** TypeScript statements forming the body of run(context). */
  readonly source: string;
}

export interface LifecycleSourceBundle {
  readonly format: typeof LIFECYCLE_SOURCE_FORMAT;
  readonly bundleId: string;
  readonly revision: number;
  readonly engineApiVersion: typeof LIFECYCLE_ENGINE_API_VERSION;
  readonly handlers: readonly ItemLifecycleSource[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`unexpected field: ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) throw new Error(`missing field: ${key}`);
  }
}

function assertId(label: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new Error(`${label} must be a stable lowercase id`);
  }
}

function assertNonEmptyText(label: string, value: unknown, maxLength = 256): asserts value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > maxLength) {
    throw new Error(`${label} must be non-empty trimmed text of at most ${maxLength} characters`);
  }
}

function parseItemLifecycleTriggers(
  value: unknown,
  path: string,
): readonly ItemOnUseEventType[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > ITEM_ON_USE_EVENT_TYPES.length) {
    throw new Error(`${path} must contain 1-${ITEM_ON_USE_EVENT_TYPES.length} item lifecycle triggers`);
  }
  const triggers: ItemOnUseEventType[] = [];
  const seen = new Set<ItemOnUseEventType>();
  let previousRank = -1;
  for (const [index, trigger] of value.entries()) {
    if (!isItemOnUseEventType(trigger)) {
      throw new Error(`${path}[${index}] must be secondary, equipmentUse, worldItemUse, useWith, useAt, aimedUse, or place`);
    }
    if (seen.has(trigger)) throw new Error(`${path} contains duplicate trigger ${trigger}`);
    const rank = ITEM_ON_USE_EVENT_TYPES.indexOf(trigger);
    if (rank <= previousRank) {
      throw new Error(`${path} must use canonical secondary, equipmentUse, worldItemUse, useWith, useAt, aimedUse, place order`);
    }
    seen.add(trigger);
    previousRank = rank;
    triggers.push(trigger);
  }
  return Object.freeze(triggers);
}

export function parseLifecycleSourceBundle(value: unknown): LifecycleSourceBundle {
  if (!isRecord(value)) throw new Error('lifecycle source bundle must be an object');
  assertExactKeys(value, ['format', 'bundleId', 'revision', 'engineApiVersion', 'handlers']);
  if (value.format !== LIFECYCLE_SOURCE_FORMAT) throw new Error('unsupported lifecycle source format');
  assertId('bundleId', value.bundleId);
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 1) {
    throw new Error('revision must be a positive safe integer');
  }
  if (value.engineApiVersion !== LIFECYCLE_ENGINE_API_VERSION) {
    throw new Error('lifecycle bundle targets an unsupported engine API');
  }
  if (!Array.isArray(value.handlers) || value.handlers.length === 0
    || value.handlers.length > MAX_HANDLERS_PER_BUNDLE) {
    throw new Error(`handlers must contain 1-${MAX_HANDLERS_PER_BUNDLE} entries`);
  }

  const handlers: ItemLifecycleSource[] = [];
  const ids = new Set<string>();
  const itemIds = new Set<string>();
  let previousSortKey = '';
  for (const [index, entry] of value.handlers.entries()) {
    if (!isRecord(entry)) throw new Error(`handlers[${index}] must be an object`);
    assertExactKeys(entry, ['itemId', 'id', 'event', 'prompt', 'source'], ['triggers']);
    assertId(`handlers[${index}].itemId`, entry.itemId);
    if (!entry.itemId.startsWith('item:')) {
      throw new Error(`handlers[${index}].itemId must be a full item:* content id`);
    }
    if (itemIds.has(entry.itemId)) throw new Error(`duplicate_item_lifecycle:${entry.itemId}`);
    itemIds.add(entry.itemId);
    assertId(`handlers[${index}].id`, entry.id);
    if (entry.event !== 'onUse') throw new Error(`handlers[${index}].event must be onUse`);
    assertNonEmptyText(`handlers[${index}].prompt`, entry.prompt, 96);
    const triggers = parseItemLifecycleTriggers(entry.triggers, `handlers[${index}].triggers`);
    if (typeof entry.source !== 'string' || entry.source.length === 0
      || Buffer.byteLength(entry.source, 'utf8') > MAX_HANDLER_SOURCE_BYTES
      || entry.source.includes('\0') || entry.source.includes('\r')) {
      throw new Error(`handlers[${index}].source must be non-empty LF-only TypeScript under ${MAX_HANDLER_SOURCE_BYTES} bytes`);
    }
    if (ids.has(entry.id)) throw new Error(`duplicate lifecycle handler id: ${entry.id}`);
    ids.add(entry.id);
    const sortKey = `${entry.itemId}\0${entry.event}\0${entry.id}`;
    if (sortKey <= previousSortKey) throw new Error('handlers must be strictly sorted by itemId, event, then id');
    previousSortKey = sortKey;
    handlers.push(Object.freeze({
      itemId: entry.itemId,
      id: entry.id,
      event: entry.event,
      prompt: entry.prompt,
      ...(triggers === undefined ? {} : { triggers }),
      source: entry.source,
    }));
  }

  return Object.freeze({
    format: LIFECYCLE_SOURCE_FORMAT,
    bundleId: value.bundleId,
    revision: value.revision as number,
    engineApiVersion: LIFECYCLE_ENGINE_API_VERSION,
    handlers: Object.freeze(handlers),
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

export function lifecycleBundleSha256(bundle: LifecycleSourceBundle): string {
  return createHash('sha256').update(canonicalJson(bundle), 'utf8').digest('hex');
}
