import { describe, expect, it } from 'vitest';
import { bootstrapContentRows } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';
import {
  BOOTSTRAP_ITEM_CONTAINER_CONTENT,
  ITEM_DEFINITIONS,
  clickContainerSlot,
  distributeItemStack,
  itemContainerContentResolver,
  moveItemStacks,
  quickMoveAllMatchingStacks,
  quickMoveItemStack,
  quickCraftCursorStack,
  pickupAllToCursor,
  sortAndStackContainer,
} from './item-containers.js';

function revisedRegistry() {
  const rows = bootstrapContentRows().map((row) => {
    if (row.id !== 'item:wood') return row;
    return {
      ...row,
      json: JSON.stringify({
        ...(JSON.parse(String(row.json)) as Record<string, unknown>),
        displayName: 'Revision Wood',
        maxStack: 7,
        tags: ['item.resource', 'revision.only'],
      }),
    };
  });
  const built = buildContentRegistry(rows);
  expect(built.report.errors).toEqual([]);
  return built.registry;
}

describe('active content inventory authority', () => {
  it('preserves exact bootstrap max-stack, tags, and sort-name parity', () => {
    for (const [itemKind, definition] of Object.entries(ITEM_DEFINITIONS)) {
      expect(BOOTSTRAP_ITEM_CONTAINER_CONTENT.maxStackFor(itemKind), itemKind)
        .toBe(definition.maxStack);
      expect(BOOTSTRAP_ITEM_CONTAINER_CONTENT.displayNameFor?.(itemKind), itemKind)
        .toBe(definition.displayName);
      for (const tag of definition.tags) {
        expect(BOOTSTRAP_ITEM_CONTAINER_CONTENT.hasTag(itemKind, tag), `${itemKind}:${tag}`)
          .toBe(true);
      }
    }
  });

  it('uses one revised registry for moves, restrictions, and deterministic sorting', () => {
    const content = itemContainerContentResolver(revisedRegistry());
    const moved = moveItemStacks({
      source: { id: 'source', capacity: 1, slots: [{ itemKind: 'wood', quantity: 2 }] },
      target: { id: 'target', capacity: 1, slots: [{ itemKind: 'wood', quantity: 6 }] },
    }, {
      fromContainer: 'source', fromIndex: 0, toContainer: 'target', toIndex: 0, quantity: 2,
    }, content);
    expect(moved).toMatchObject({
      ok: true,
      movedQuantity: 1,
      containers: {
        source: { slots: [{ itemKind: 'wood', quantity: 1 }] },
        target: { slots: [{ itemKind: 'wood', quantity: 7 }] },
      },
    });

    const restricted = moveItemStacks({
      source: { id: 'source', capacity: 1, slots: [{ itemKind: 'wood', quantity: 1 }] },
      target: {
        id: 'target', capacity: 1, slots: [null],
        restrictions: { 0: { requiredTags: ['material.wood'] } },
      },
    }, {
      fromContainer: 'source', fromIndex: 0, toContainer: 'target', toIndex: 0, quantity: 1,
    }, content);
    expect(restricted).toEqual({ ok: false, code: 'slot_rejects_item' });

    const sorted = sortAndStackContainer({
      id: 'bag', capacity: 2,
      slots: [{ itemKind: 'wood', quantity: 1 }, { itemKind: 'stone', quantity: 1 }],
    }, content);
    expect(sorted.ok && sorted.container.slots.map((stack) => stack?.itemKind))
      .toEqual(['wood', 'stone']);
  });

  it('fails closed for unknown rows across cursor and bulk gestures', () => {
    const content = itemContainerContentResolver(revisedRegistry());
    const unknown = { itemKind: 'unpublished_relic', quantity: 1 } as const;
    expect(clickContainerSlot({
      bag: { id: 'bag', capacity: 1, slots: [unknown] },
    }, null, { container: 'bag', index: 0, button: 'left' }, content))
      .toEqual({ ok: false, code: 'unknown_item_kind' });

    expect(quickMoveAllMatchingStacks({
      bag: { id: 'bag', capacity: 1, slots: [unknown] },
      chest: { id: 'chest', capacity: 1, slots: [null] },
    }, {
      itemKind: unknown.itemKind, fromContainers: ['bag'], toContainers: ['chest'],
    }, content)).toEqual({ ok: false, code: 'unknown_item_kind' });

    expect(distributeItemStack({
      bag: { id: 'bag', capacity: 2, slots: [unknown, null] },
    }, {
      fromContainer: 'bag', fromIndex: 0, targets: [{ container: 'bag', index: 1 }],
    }, content)).toEqual({ ok: false, code: 'unknown_item_kind' });
  });

  it('applies a published stack limit consistently to every cursor and quick-move path', () => {
    const content = itemContainerContentResolver(revisedRegistry());
    const menu = {
      bag: { id: 'bag', capacity: 2, slots: [{ itemKind: 'wood', quantity: 2 }, null] },
      chest: { id: 'chest', capacity: 2, slots: [{ itemKind: 'wood', quantity: 6 }, null] },
    } as const;

    expect(clickContainerSlot(
      menu,
      { itemKind: 'wood', quantity: 2 },
      { container: 'chest', index: 0, button: 'left' },
      content,
    )).toMatchObject({ ok: true, movedQuantity: 1, cursor: { quantity: 1 } });

    expect(quickCraftCursorStack(
      menu,
      { itemKind: 'wood', quantity: 2 },
      { mode: 'even', targets: [{ container: 'chest', index: 0 }] },
      content,
    )).toMatchObject({ ok: true, movedQuantity: 1, cursor: { quantity: 1 } });

    expect(pickupAllToCursor(
      menu,
      { itemKind: 'wood', quantity: 6 },
      ['bag'],
      content,
    )).toMatchObject({ ok: true, movedQuantity: 1, cursor: { quantity: 7 } });

    expect(quickMoveItemStack(
      menu,
      { fromContainer: 'bag', fromIndex: 0, toContainers: ['chest'] },
      content,
    )).toMatchObject({
      ok: true,
      movedQuantity: 2,
      containers: { chest: { slots: [{ quantity: 7 }, { quantity: 1 }] } },
    });
  });
});
