import type { LootDrop } from './loot-definition.js';
import type { ContentRegistry } from './registry.js';

export interface TaggedLootTotal {
  readonly subjectKind: string;
  readonly quantity: number;
}

/**
 * Projects actual loot outcomes into semantic statistic subjects.
 *
 * Every drop must still resolve to an active item before any statistic is
 * emitted. This makes a stale loot-to-item edge fail closed as one unit rather
 * than partially recording a result. Matching subjects are aggregated and
 * sorted so multiple authored groups can award the same semantic item without
 * changing statistic order.
 */
export function runtimeTaggedLootTotals(
  registry: Pick<ContentRegistry, 'items'>,
  drops: readonly LootDrop[],
  tag: string,
): readonly TaggedLootTotal[] | null {
  const totals = new Map<string, number>();
  for (const drop of drops) {
    if (!Number.isSafeInteger(drop.quantity) || drop.quantity <= 0) return null;
    const definition = registry.items.get(`item:${drop.itemKind}`);
    if (definition === undefined || definition.retired === true) return null;
    if (!definition.tags.includes(tag)) continue;
    const next = (totals.get(drop.itemKind) ?? 0) + drop.quantity;
    if (!Number.isSafeInteger(next)) return null;
    totals.set(drop.itemKind, next);
  }
  return Object.freeze([...totals]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([subjectKind, quantity]) => Object.freeze({ subjectKind, quantity })));
}
