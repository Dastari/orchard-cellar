import { readFileSync } from 'node:fs';
import { bootstrapContentRegistry } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { parseLifecycleSourceBundle } from './contract.js';

const source = parseLifecycleSourceBundle(JSON.parse(readFileSync(
  new URL('../source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as unknown);
const metadata = JSON.parse(readFileSync(
  new URL('../generated/item-lifecycle-metadata.json', import.meta.url),
  'utf8',
)) as { readonly handlers: readonly {
  readonly itemId: string;
  readonly id: string;
  readonly triggers: readonly string[];
}[] };

describe('authored placement and repair migration', () => {
  it('gives every live placeable item one generated or dedicated transaction owner', () => {
    const expected = [...bootstrapContentRegistry().items.values()]
      .filter((item) => item.retired !== true && item.tags.includes('item.placeable') && !actionOwners.furnitureTransactions.itemIds.includes(item.id))
      .map(({ id }) => id)
      .sort();
    const handlers = source.handlers.filter(({ id }) => id.endsWith('.place'));
    expect(handlers.map(({ itemId }) => itemId)).toEqual([
      ...expected,
      'item:boat',
      'item:homestead_deed',
    ].sort());
    expect(handlers).toHaveLength(22);
    expect(handlers.every(({ triggers }) => triggers?.[0] === 'place')).toBe(true);
    expect(metadata.handlers.filter(({ id }) => id.endsWith('.place')))
      .toHaveLength(22);
  });

  it('gives every durability-bearing tool and weapon one exact anvil callback', () => {
    const expected = [...bootstrapContentRegistry().items.values()]
      .filter((item) => item.retired !== true && item.durability !== undefined)
      .map(({ id }) => id)
      .sort();
    const expectedIds: ReadonlySet<string> = new Set(expected);
    const handlers = source.handlers.filter(({ itemId, triggers }) => (
      expectedIds.has(itemId) && triggers?.includes('useWith') === true
    ));
    expect(handlers.map(({ itemId }) => itemId)).toEqual(expected);
    expect(handlers).toHaveLength(expected.length);
    expect(handlers.every(({ triggers }) => triggers?.includes('useWith') === true)).toBe(true);
    expect(metadata.handlers.filter(({ itemId, triggers }) => (
      expectedIds.has(itemId) && triggers.includes('useWith')
    )))
      .toHaveLength(expected.length);
  });
});

const actionOwners = JSON.parse(readFileSync(new URL('../audit/reviewed-item-action-owners.json', import.meta.url), 'utf8')) as { readonly format: string; readonly dataGraph: { readonly itemIds: readonly string[] }; readonly furnitureTransactions: { readonly itemIds: readonly string[]; readonly reducers: readonly string[] } };
