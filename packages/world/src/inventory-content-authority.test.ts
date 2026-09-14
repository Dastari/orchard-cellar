import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const containerSource = readFileSync(new URL('../../sim/src/item-containers.ts', import.meta.url), 'utf8');

function reducerSource(name: string): string {
  const start = worldSource.indexOf(`export const ${name} =`);
  const end = worldSource.indexOf('\nexport const ', start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return worldSource.slice(start, end < 0 ? worldSource.length : end);
}

function simFunctionSource(name: string): string {
  const start = containerSource.indexOf(`export function ${name}(`);
  const end = containerSource.indexOf('\nexport function ', start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return containerSource.slice(start, end < 0 ? containerSource.length : end);
}

describe('inventory live-content source guard', () => {
  it('requires an explicit resolver in every authoritative gesture API', () => {
    expect(containerSource).not.toContain('LEGACY_ITEM_CONTENT');
    for (const name of [
      'sortAndStackContainer',
      'moveItemStacks',
      'clickContainerSlot',
      'quickCraftCursorStack',
      'pickupAllToCursor',
      'quickMoveItemStack',
      'quickMoveAllMatchingStacks',
      'distributeItemStack',
    ]) {
      const source = simFunctionSource(name);
      expect(source, name).toContain('content: ItemContainerContentResolver');
      expect(source, name).not.toMatch(/content: ItemContainerContentResolver\s*=/u);
      expect(source, name).not.toMatch(/(?<!\.)\bmaxStackFor\(/u);
    }
  });

  it('binds every public menu reducer to the current durable content head', () => {
    expect(worldSource).toContain('itemContainerContentResolver(contentRegistry(ctx))');
    for (const name of [
      'inventoryCursorClick',
      'sortMenuContainer',
      'inventoryCursorQuickCraft',
      'inventoryCursorPickupAll',
      'inventoryCursorSwapHotbar',
      'quickMoveMenuItem',
      'quickMoveAllMenuItems',
      'throwMenuItem',
      'fillCraftingRecipe',
    ]) {
      expect(reducerSource(name), name).toContain('activeItemContainerContent(ctx)');
    }
    const distribution = worldSource.slice(
      worldSource.indexOf('function distributeOpenMenuItem('),
      worldSource.indexOf('\nexport const throwMenuItem'),
    );
    expect(distribution).toContain('activeItemContainerContent(ctx)');
  });

  it('keeps unknown definitions fail closed with no authoritative bootstrap escape hatch', () => {
    const helperStart = worldSource.indexOf('function activeItemContainerContent(');
    const helperEnd = worldSource.indexOf('\n}', helperStart) + 2;
    const helper = worldSource.slice(helperStart, helperEnd);
    expect(helper).toContain('contentRegistry(ctx)');
    expect(helper).not.toMatch(/bootstrap/iu);
    expect(helper).not.toMatch(/\?\?|catch/gu);
  });
});
