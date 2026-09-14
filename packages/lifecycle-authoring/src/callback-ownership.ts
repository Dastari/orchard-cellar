import type { ItemLifecycleSource } from './contract.js';

/** One item owns one authored TypeScript callback. That callback may declare
 * every canonical input trigger it needs, but split callback ownership is
 * rejected even when the trigger sets do not overlap. */
export function assertSingleItemLifecycleCallbacks(
  handlers: readonly Pick<ItemLifecycleSource, 'itemId'>[],
): void {
  const itemIds = new Set<string>();
  for (const handler of handlers) {
    if (itemIds.has(handler.itemId)) throw new Error(`duplicate_item_lifecycle:${handler.itemId}`);
    itemIds.add(handler.itemId);
  }
}
