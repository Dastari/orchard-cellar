import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const generatedIndex = readFileSync(
  new URL('../../client/src/net/generated/index.ts', import.meta.url),
  'utf8',
);

function sourceBetween(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('docs/53 T7 consolidated container moves', () => {
  it('routes drag and distribution through the generic open-menu helpers', () => {
    const helpers = sourceBetween('type MenuMoveRequest =', 'export const throwMenuItem =');
    expect(helpers).toContain('loadOpenMenuInventory(ctx)');
    expect(helpers.match(/writeOpenMenuInventory\(ctx, menu, result\.containers\)/g)).toHaveLength(2);

    for (const reducer of ['moveInventoryItem', 'moveChestItem', 'movePlaceableItem']) {
      const body = sourceBetween(`export const ${reducer} =`, '\n);');
      expect(body, reducer).toContain('moveOpenMenuItem(ctx, request)');
    }
    for (const reducer of ['distributeInventoryItem', 'distributeChestItem']) {
      const body = sourceBetween(`export const ${reducer} =`, '\n);');
      expect(body, reducer).toContain('distributeOpenMenuItem(ctx, request)');
    }
  });

  it('retires the four uncalled quick-move reducers and generated bindings', () => {
    for (const name of [
      'quickMoveInventoryItem',
      'quickMoveAllInventoryItems',
      'quickMoveChestItem',
      'quickMoveAllChestItems',
    ]) {
      expect(source).not.toContain(`export const ${name} =`);
      expect(generatedIndex).not.toContain(name);
    }

    for (const file of [
      'quick_move_inventory_item_reducer.ts',
      'quick_move_all_inventory_items_reducer.ts',
      'quick_move_chest_item_reducer.ts',
      'quick_move_all_chest_items_reducer.ts',
    ]) {
      expect(existsSync(new URL(`../../client/src/net/generated/${file}`, import.meta.url))).toBe(false);
    }
  });
});
