import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLACEABLE_KINDS, placeableDefinition } from '@orchard/sim';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function reducerSource(name: string): string {
  const start = source.indexOf(`export const ${name} =`);
  const end = source.indexOf('\nexport const ', start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return source.slice(start, end < 0 ? source.length : end);
}

describe('28§14 phase 3 authority contracts', () => {
  it('declares additive, space-born placeable and private slot authorities', () => {
    const placeable = source.slice(source.indexOf('const world_placeable = table('), source.indexOf('const world_placeable_slot = table('));
    expect(placeable).toContain("name: 'world_placeable'");
    expect(placeable).toContain('public: true');
    expect(placeable).toContain("columns: ['spaceId', 'chunkX', 'chunkY']");
    expect(placeable).toContain('spaceId: t.u16().default(0)');
    expect(placeable).toContain('smeltStartTick: t.option(t.u64())');
    expect(source).toContain("{ accessor: 'by_placeable', algorithm: 'btree', columns: ['placeableId'] }");
  });

  it('keeps auth ahead of all reads and writes in every changed reducer', () => {
    for (const reducerName of [
      'craftInventoryRecipe',
      'useHands',
      'interactPlaceable',
      'closePlaceable',
      'movePlaceableItem',
      'useFarmTool',
    ]) {
      const reducer = reducerSource(reducerName);
      const auth = reducer.indexOf('requireAuthorizedSender(');
      expect(auth, reducerName).toBeGreaterThanOrEqual(0);
      for (const operation of ['.find(', '.insert(', '.update(', '.delete(']) {
        const first = reducer.indexOf(operation);
        if (first >= 0) expect(first, `${reducerName}:${operation}`).toBeGreaterThan(auth);
      }
    }
  });

  it('round-trips every phase-3 kind and rejects non-empty or cross-space pickup', () => {
    const hands = reducerSource('useHands');
    for (const kind of PLACEABLE_KINDS) expect(placeableDefinition(kind), kind).not.toBeNull();
    expect(hands).toContain("selectedDefinition?.tags.includes('item.placeable')");
    expect(hands).toContain('world_placeable.insert');
    expect(hands).toContain('world_placeable.id.delete');
    expect(hands).toContain("throw new SenderError('placeable_not_empty')");
    expect(source).toContain('world_placeable.by_chunk.filter(position.spaceId)');
    expect(source).toContain("throw new SenderError('placement_blocked')");
  });

  it('checks live station proximity before inventory mutation and records placement atomically', () => {
    const craft = reducerSource('craftInventoryRecipe');
    expect(craft.indexOf("throw new SenderError('station_required')"))
      .toBeLessThan(craft.indexOf('inventory_slot.id.update'));
    const hands = reducerSource('useHands');
    expect(hands.indexOf('world_placeable.insert')).toBeLessThan(hands.indexOf("'placeables_placed'"));
    expect(hands.indexOf("'placeables_placed'")).toBeLessThan(hands.lastIndexOf('return;'));
  });

  it('maintains collision, gate state, fiber acquisition, and regional subscriptions', () => {
    expect(source).toContain("createAuthoritySpaceCollisionMap(spaceId, resources, chests, 'ground', placeables)");
    expect(reducerSource('interactPlaceable')).toContain('open: !placeable.open');
    expect(reducerSource('useFarmTool')).toContain('fiberDropsFromTilling(');
    expect(reducerSource('useFarmTool')).toContain("itemKind: 'fiber'");
  });

  it('keeps barrel open, close, and item moves authority-owned', () => {
    const interact = reducerSource('interactPlaceable');
    expect(interact).toContain("placeable.kind !== 'barrel'");
    expect(interact).toContain('active_placeable.insert');
    expect(reducerSource('closePlaceable')).toContain('active_placeable.identity.delete');
    const move = reducerSource('movePlaceableItem');
    expect(move).toContain("id === 'placeable'");
    expect(move).toContain('moveItemStacks(containers, request)');
    expect(move).toContain('world_placeable_slot.id.update');
  });

  it('salvages chest recipe inputs rather than duplicating the intact crafted object', () => {
    const harvest = reducerSource('harvestChest');
    expect(harvest).toContain("recipeDefinition('chest')");
    expect(harvest).toContain('recipeIngredientStacks(chestRecipe)');
    expect(harvest).not.toContain("stacks.unshift({ itemKind: 'chest'");
  });

  it('opens the nearest chest radially instead of requiring one faced tile', () => {
    const interact = reducerSource('interactChest');
    expect(interact).toContain('nearestTileTarget(');
    expect(interact).toContain('CHEST_INTERACTION_REACH_FIXED');
    expect(interact).not.toContain('facingTile(');
  });
});
