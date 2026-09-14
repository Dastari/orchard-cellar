import { readFileSync } from 'node:fs';
import { bootstrapContentRegistry } from '@orchard/sim';
import { describe, expect, it } from 'vitest';

import { AUTHORED_ITEM_LIFECYCLE_METADATA } from '../generated/item-lifecycles.js';

interface ReviewedInertCatalog {
  readonly format: string;
  readonly reviewedAgainst: {
    readonly bootstrapItemCount: number;
    readonly authoredCallbackCount: number;
    readonly inertItemCount: number;
  };
  readonly groups: readonly {
    readonly classification: string;
    readonly interactionPolicy: 'inert';
    readonly reason: string;
    readonly itemIds: readonly string[];
  }[];
}

const reviewedInert = JSON.parse(readFileSync(
  new URL('../audit/reviewed-inert-items.json', import.meta.url),
  'utf8',
)) as ReviewedInertCatalog;

describe('complete item lifecycle catalog ownership', () => {
  it('partitions every live item into one authored callback or an explicit inert review', () => {
    const items = [...bootstrapContentRegistry().items.values()]
      .filter(({ retired }) => retired !== true);
    const itemIds = items.map(({ id }) => id).sort();
    const callbackIds = AUTHORED_ITEM_LIFECYCLE_METADATA.map(({ itemId }) => itemId).sort();
    const inertIds = reviewedInert.groups.flatMap(({ itemIds: ids }) => ids).sort();

    expect(reviewedInert.format).toBe('orchard-reviewed-inert-items-v1');
    expect(new Set(callbackIds).size).toBe(callbackIds.length);
    expect(new Set(inertIds).size).toBe(inertIds.length);
    expect(callbackIds.filter((id) => inertIds.includes(id))).toEqual([]);
    expect([...callbackIds, ...inertIds].sort()).toEqual(itemIds);
    expect(reviewedInert.reviewedAgainst).toMatchObject({
      bootstrapItemCount: itemIds.length,
      authoredCallbackCount: callbackIds.length,
      inertItemCount: inertIds.length,
    });
  });

  it('never exposes an item action for a reviewed-inert definition', () => {
    const registry = bootstrapContentRegistry();
    for (const group of reviewedInert.groups) {
      expect(group.interactionPolicy, group.classification).toBe('inert');
      expect(group.reason.trim().length, group.classification).toBeGreaterThan(20);
      for (const itemId of group.itemIds) {
        expect(registry.items.get(itemId)?.onUse, itemId).toEqual([]);
        expect(AUTHORED_ITEM_LIFECYCLE_METADATA.some((entry) => entry.itemId === itemId), itemId)
          .toBe(false);
      }
    }
  });
});
