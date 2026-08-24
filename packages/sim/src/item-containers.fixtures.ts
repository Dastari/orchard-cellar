import type { ContainerSnapshot, MoveItemRequest } from './item-containers.js';

export interface MoveRuleFixture {
  readonly name: string;
  readonly containers: Readonly<Record<string, ContainerSnapshot>>;
  readonly request: MoveItemRequest;
  readonly expected: Readonly<Record<string, unknown>>;
}

const bag = (slots: ContainerSnapshot['slots'], capacity = 4): ContainerSnapshot => ({ id: 'bag', capacity, slots });

/** Shared fixtures intended to be replayed by the eventual SpaceTimeDB reducer harness. */
export const MOVE_RULE_FIXTURES: readonly MoveRuleFixture[] = [
  {
    name: 'moves a complete stack into an empty slot',
    containers: { bag: bag([{ itemKind: 'wood', quantity: 8 }, null]) },
    request: { fromContainer: 'bag', fromIndex: 0, toContainer: 'bag', toIndex: 1, quantity: 8 },
    expected: { ok: true, outcome: 'move', movedQuantity: 8, slots: [null, { itemKind: 'wood', quantity: 8 }, null, null] },
  },
  {
    name: 'splits a requested quantity',
    containers: { bag: bag([{ itemKind: 'wood', quantity: 8 }, null]) },
    request: { fromContainer: 'bag', fromIndex: 0, toContainer: 'bag', toIndex: 1, quantity: 3 },
    expected: { ok: true, outcome: 'split', movedQuantity: 3, slots: [{ itemKind: 'wood', quantity: 5 }, { itemKind: 'wood', quantity: 3 }, null, null] },
  },
  {
    name: 'merges only available stack capacity',
    containers: { bag: bag([{ itemKind: 'wood', quantity: 8 }, { itemKind: 'wood', quantity: 96 }]) },
    request: { fromContainer: 'bag', fromIndex: 0, toContainer: 'bag', toIndex: 1, quantity: 8 },
    expected: { ok: true, outcome: 'merge', movedQuantity: 3, slots: [{ itemKind: 'wood', quantity: 5 }, { itemKind: 'wood', quantity: 99 }, null, null] },
  },
  {
    name: 'swaps unlike complete stacks',
    containers: { bag: bag([{ itemKind: 'wood', quantity: 8 }, { itemKind: 'stone', quantity: 2 }]) },
    request: { fromContainer: 'bag', fromIndex: 0, toContainer: 'bag', toIndex: 1, quantity: 8 },
    expected: { ok: true, outcome: 'swap', movedQuantity: 8, slots: [{ itemKind: 'stone', quantity: 2 }, { itemKind: 'wood', quantity: 8 }, null, null] },
  },
  {
    name: 'rejects an index beyond capacity',
    containers: { bag: bag([{ itemKind: 'wood', quantity: 8 }], 1) },
    request: { fromContainer: 'bag', fromIndex: 0, toContainer: 'bag', toIndex: 1, quantity: 8 },
    expected: { ok: false, code: 'index_out_of_capacity' },
  },
  {
    name: 'rejects a kind-restricted destination',
    containers: {
      bag: bag([{ itemKind: 'wood', quantity: 8 }, null]),
      hand: { id: 'hand', capacity: 1, slots: [null], restrictions: { 0: { requiredTags: ['item.tool'] } } },
    },
    request: { fromContainer: 'bag', fromIndex: 0, toContainer: 'hand', toIndex: 0, quantity: 8 },
    expected: { ok: false, code: 'slot_rejects_item' },
  },
];
