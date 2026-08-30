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
    expect(placeable).toContain("columns: ['carriedBy']");
    expect(placeable).toContain('spaceId: t.u16().default(0)');
    expect(placeable).toContain('carriedBy: t.option(t.identity()).default(undefined)');
    expect(placeable.indexOf('lit: t.bool().default(true)'))
      .toBeLessThan(placeable.indexOf('carriedBy: t.option(t.identity()).default(undefined)'));
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
    expect(hands).toContain('insertWorldPlaceable(ctx, position, selected.itemKind, tileX, tileY)');
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
    expect(hands.indexOf('world_placeable.insert')).toBeLessThan(hands.lastIndexOf("'placeables_placed'"));
    expect(hands.lastIndexOf("'placeables_placed'")).toBeLessThan(hands.lastIndexOf('return;'));
  });

  it('maintains collision, gate state, fiber acquisition, and regional subscriptions', () => {
    expect(source).toContain('const collision = collisionForSpace(ctx, spaceId)');
    expect(reducerSource('interactPlaceable')).toContain('open: !placeable.open');
    expect(reducerSource('useFarmTool')).toContain('fiberDropsFromTilling(');
    expect(reducerSource('useFarmTool')).toContain("itemKind: 'fiber'");
  });

  it('keeps tagged processor interfaces, close, and item moves authority-owned', () => {
    const interact = reducerSource('interactPlaceable');
    expect(interact).toContain('placeableInterface(placeable.kind)');
    expect(interact).toContain("interfaceKind === 'barrel'");
    expect(interact).toContain("interfaceKind === 'furnace'");
    expect(interact).toContain("interfaceKind === 'cooking'");
    expect(interact).toContain("interfaceKind === 'press'");
    expect(interact).toContain("interfaceKind === 'fermentation'");
    expect(source).toContain('settleFurnacePlaceable(ctx, placeable)');
    expect(source).toContain('furnaceMutationIsValid(');
    expect(source).toContain('cellarProcessorMutationIsValid(');
    expect(source).toContain('settleCellarProductionPlaceable(ctx, placeable)');
    expect(source).toContain('placeableSlotCapacity(placeable.kind)');
    expect(source).toContain('ctx.db.world_placeable_slot.insert({');
    expect(interact).toContain('active_placeable.insert');
    expect(reducerSource('closePlaceable')).toContain('clearActivePlaceable(ctx, ctx.sender)');
    expect(source).toContain('ctx.db.active_placeable.identity.delete(identity)');
    const move = reducerSource('movePlaceableItem');
    expect(move).toContain("id === 'placeable'");
    expect(move).toContain('moveItemStacks(menu.containers, request)');
    expect(move).toContain('writeOpenMenuInventory(ctx, menu, moved.containers)');
  });

  it('keeps first-bottle processors additive, lazy-settled, and capability-driven', () => {
    const placeable = source.slice(source.indexOf('const world_placeable = table('), source.indexOf('const world_placeable_slot = table('));
    expect(placeable).toContain('processStartTick: t.option(t.u64()).default(undefined)');
    expect(placeable).toContain('processStartedBy: t.option(t.identity()).default(undefined)');
    expect(placeable).toContain('processInputKind: t.option(t.string()).default(undefined)');
    expect(source).toContain("placeableHasInterface(placeable.kind, 'press')");
    expect(source).toContain("placeableHasInterface(placeable.kind, 'fermentation')");
    expect(source).toContain("'fruit_pressed'");
    expect(source).toContain("'bottles_produced'");
    expect(source).not.toContain('scheduled_cellar_processor');
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

  it('keeps placed anvils and tagged furnaces out of inventory and repairs anvils atomically for copper', () => {
    const hands = reducerSource('useHands');
    expect(hands).toContain("targetPlaceable.kind === 'anvil' || placeableHasInterface(targetPlaceable.kind, 'furnace')");
    expect(hands).toContain("!placeableHasInterface(targetPlaceable.kind, 'furnace')");
    expect(hands).toContain('carriedPlaceableFor(ctx, ctx.sender)');
    expect(hands).toContain('carriedBy: ctx.sender');
    expect(hands).toContain('carriedBy: undefined');
    expect(source).toContain('world_placeable.by_carrier.filter(row.identity)');
    const interact = reducerSource('interactPlaceable');
    expect(interact).toContain("placeable.kind === 'anvil'");
    expect(interact).toContain('repairSelectedToolAtAnvil(ctx)');
    const repair = source.slice(
      source.indexOf('function repairSelectedToolAtAnvil'),
      source.indexOf('export const consumeOrchardTea'),
    );
    expect(repair).toContain('ctx.db.player_wallet.identity.find(ctx.sender)');
    expect(repair).toContain('ANVIL_REPAIR_COST_BRONZE');
    expect(repair).toContain('wallet.balanceBronze - repairCost');
    expect(repair).toContain("throw new SenderError('anvil_copper_missing')");
    expect(repair).toContain("recordPlayerStatistic(ctx, ctx.sender, 'bronze_spent', repairCost, authorityTick)");
    expect(repair).not.toContain("'anvil_repair'");
  });
});
