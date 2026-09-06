import { readFileSync } from 'node:fs';
import {
  AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS,
  AUTHORED_LIFECYCLE_BUNDLE_SHA256,
} from '@orchard/lifecycle-authoring/generated';
import {
  bootstrapContentDefinitions,
  bootstrapContentRows,
  buildContentRegistry,
  compileItemDataGraph,
  createHandlerRegistry,
  type ItemContentDefinition,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';

import type { CachedContentRegistry } from './cache.js';
import {
  invalidateObjectGraphRegistryCache,
  objectGraphRegistryForContent,
} from './object-runtime.js';

interface LifecycleSourceBundleFixture {
  readonly revision: number;
  readonly handlers: readonly {
    readonly itemId: string;
    readonly event: 'onUse';
    readonly triggers?: readonly string[];
  }[];
}

interface ReviewedInertItemGroup {
  readonly classification: string;
  readonly interactionPolicy: 'inert' | 'presentation_only_pending_decision';
  readonly advertisedCapabilities: readonly string[];
  readonly reason: string;
  readonly itemIds: readonly string[];
}

interface ReviewedInertItemManifest {
  readonly format: 'orchard-reviewed-inert-items-v1';
  readonly reviewedAgainst: {
    readonly bootstrapItemCount: number;
    readonly lifecycleRevision: number;
    readonly lifecycleBundleSha256: string;
    readonly authoredCallbackCount: number;
    readonly inertItemCount: number;
  };
  readonly groups: readonly ReviewedInertItemGroup[];
}

const lifecycleSource = JSON.parse(readFileSync(
  new URL('../../../lifecycle-authoring/source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as LifecycleSourceBundleFixture;

const inertManifest = JSON.parse(readFileSync(
  new URL('../../../lifecycle-authoring/audit/reviewed-inert-items.json', import.meta.url),
  'utf8',
)) as ReviewedInertItemManifest;

const ACTIVE_CAPABILITY_TAGS = Object.freeze([
  'emits.light',
  'item.consumable',
  'item.document',
  'item.equipment',
  'item.food',
  'item.homestead_deed',
  'item.placeable',
  'item.seed',
  'item.tool',
  'item.vehicle',
  'item.weapon',
] as const);

function advertisedCapabilities(item: ItemContentDefinition): readonly string[] {
  const capabilities: string[] = [];
  if (item.onUse.length > 0) capabilities.push('component:onUse');
  if (item.durability !== undefined) capabilities.push('component:durability');
  if (item.equip !== undefined) capabilities.push('component:equip');
  if (item.food !== undefined) capabilities.push('component:food');
  if (item.light !== undefined) capabilities.push('component:light');
  if (item.tool !== undefined) capabilities.push('component:tool');
  if (item.vigour !== undefined) capabilities.push('component:vigour');
  for (const tag of ACTIVE_CAPABILITY_TAGS) {
    if (item.tags.includes(tag)) capabilities.push(`tag:${tag}`);
  }
  return Object.freeze(capabilities.sort());
}

function catalogItems(): readonly ItemContentDefinition[] {
  return bootstrapContentDefinitions().filter(
    (definition): definition is ItemContentDefinition => definition.kind === 'item',
  );
}

function inertItemsById(): ReadonlyMap<string, ReviewedInertItemGroup> {
  return new Map(inertManifest.groups.flatMap((group) => (
    group.itemIds.map((itemId) => [itemId, group] as const)
  )));
}

describe('bootstrap item lifecycle catalog ownership', () => {
  it('partitions every bootstrap item into exactly one callback or a reviewed inert classification', () => {
    const items = catalogItems();
    const catalogIds = items.map(({ id }) => id).sort();
    const catalogIdSet = new Set<string>(catalogIds);
    const callbackCounts = new Map<string, number>();
    for (const handler of lifecycleSource.handlers) {
      callbackCounts.set(handler.itemId, (callbackCounts.get(handler.itemId) ?? 0) + 1);
    }
    const inertIds = inertManifest.groups.flatMap(({ itemIds }) => itemIds).sort();
    const callbackIds = [...callbackCounts.keys()].sort();

    expect(inertManifest.format).toBe('orchard-reviewed-inert-items-v1');
    expect(lifecycleSource.revision).toBe(11);
    expect(items).toHaveLength(181);
    expect(callbackIds).toHaveLength(109);
    expect(inertIds).toHaveLength(72);
    expect(inertManifest.reviewedAgainst).toEqual({
      bootstrapItemCount: 181,
      lifecycleRevision: 11,
      lifecycleBundleSha256: AUTHORED_LIFECYCLE_BUNDLE_SHA256,
      authoredCallbackCount: 109,
      inertItemCount: 72,
    });
    expect([...callbackCounts].filter(([, count]) => count !== 1)).toEqual([]);
    expect(callbackIds.filter((itemId) => !catalogIdSet.has(itemId))).toEqual([]);
    expect(inertIds.filter((itemId, index) => inertIds.indexOf(itemId) !== index)).toEqual([]);
    expect(inertIds.filter((itemId) => callbackCounts.has(itemId))).toEqual([]);
    expect([...callbackIds, ...inertIds].sort()).toEqual(catalogIds);
  });

  it('requires reviewed capability evidence for every actionless item', () => {
    const inertById = inertItemsById();
    const items = catalogItems();
    const callbackIds = new Set(lifecycleSource.handlers.map(({ itemId }) => itemId));

    for (const item of items) {
      if (callbackIds.has(item.id)) continue;
      const review = inertById.get(item.id);
      expect(review, `missing inert review for ${item.id}`).toBeDefined();
      expect(review?.reason.length, `${item.id} review reason`).toBeGreaterThan(0);
      expect(review?.advertisedCapabilities, `${item.id} advertised capabilities`)
        .toEqual(advertisedCapabilities(item));
      expect(item.onUse, `${item.id} data graph must remain actionless while inert`).toEqual([]);
    }

    expect(inertManifest.groups.filter(
      ({ interactionPolicy }) => interactionPolicy === 'presentation_only_pending_decision',
    )).toEqual([]);
    expect(callbackIds).toContain('item:torch');
  });

  it('resolves item data graphs without leaving a competing code-owned lane', () => {
    invalidateObjectGraphRegistryCache();
    const built = buildContentRegistry(bootstrapContentRows());
    expect(built.report.valid).toBe(true);
    const content: CachedContentRegistry = {
      key: 'catalog-item-lifecycle-ownership',
      revision: 10n,
      contentHash: built.registry.contentHash,
      registry: built.registry,
    };
    const code = createHandlerRegistry(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS);
    const runtime = objectGraphRegistryForContent(code, content, 1);

    for (const item of built.registry.items.values()) {
      for (const graph of compileItemDataGraph(item, 1)) {
        const codeLane = code.registrations.filter((registration) => (
          registration.source === 'selectedItem'
          && registration.match.kind === 'definition'
          && registration.match.definitionId === item.id
          && registration.eventType === graph.eventType
        ));
        const graphLane = runtime.registrations.filter(({ id }) => id === graph.id);
        if (codeLane.length > 0) {
          expect(codeLane, `${item.id}:${graph.eventType} must have one code owner`).toHaveLength(1);
          expect(graphLane, `${graph.id} must be suppressed by its code owner`).toEqual([]);
        } else {
          expect(graphLane, `${graph.id} must remain the resolved data-graph owner`).toHaveLength(1);
        }
      }
    }
  });
});
