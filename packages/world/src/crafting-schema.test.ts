import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, placeableKinds, runtimePlaceableDefinition } from '@orchard/sim';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const processorsSource = readFileSync(new URL('./behaviour/processors.ts', import.meta.url), 'utf8');

function reducerSource(name: string): string {
  const start = source.indexOf(`export const ${name} =`);
  const end = source.indexOf('\nexport const ', start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return source.slice(start, end < 0 ? source.length : end);
}

function reducerAuthoritySource(name: string): string {
  if (name === 'harvestChest') {
    return source.slice(
      source.indexOf('function harvestChestTransaction('),
      source.indexOf('/** Axe strikes dismantle'),
    );
  }
  if (name === 'harvestCampfire') {
    return source.slice(
      source.indexOf('function applyHarvestPlaceableLifecycle('),
      source.indexOf('\nexport const moveChestItem'),
    );
  }
  return reducerSource(name);
}

function handsAuthoritySource(): string {
  return source.slice(source.indexOf('function worldBehaviourEffectWriter('), source.indexOf('function applyWorldBehaviourEffects('));
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
      'closePlaceable',
      'movePlaceableItem',
    ]) {
      const reducer = reducerAuthoritySource(reducerName);
      const auth = Math.max(
        reducer.indexOf('requireAuthorizedSender('),
        reducer.indexOf('dependencies.authorize(ctx)'),
      );
      expect(auth, reducerName).toBeGreaterThanOrEqual(0);
      for (const operation of ['.find(', '.insert(', '.update(', '.delete(']) {
        const first = reducer.indexOf(operation);
        if (first >= 0) expect(first, `${reducerName}:${operation}`).toBeGreaterThan(auth);
      }
    }
    const interact = readFileSync(new URL('./behaviour/interact-entity.ts', import.meta.url), 'utf8');
    const selected = readFileSync(new URL('./behaviour/use-selected.ts', import.meta.url), 'utf8');
    expect(interact.indexOf('authority.authorize(ctx)')).toBeLessThan(interact.indexOf('authority.resolveTarget(ctx'));
    expect(selected.indexOf('authority.authorize(ctx)')).toBeLessThan(selected.indexOf('authority.selectedItem(ctx)'));
  });

  it('round-trips every phase-3 kind and rejects non-empty or cross-space pickup', () => {
    const hands = handsAuthoritySource();
    const registry = bootstrapContentRegistry();
    for (const kind of placeableKinds(registry)) expect(runtimePlaceableDefinition(registry, kind), kind).not.toBeNull();
    expect(hands).toContain('placementObjectForSelectedItem(');
    expect(hands).toContain('insertWorldPlaceable(ctx, position, spawn.definitionId, tileX, tileY)');
    expect(hands).not.toContain("selected.itemKind !== itemKind");
    expect(hands).toContain('ctx.db.world_placeable.id.update({');
    expect(hands).toContain('carriedBy: ctx.sender');
    expect(source).toContain('world_placeable.by_chunk.filter(position.spaceId)');
    expect(source).toContain("throw new SenderError('placement_blocked')");
  });

  it('resolves durable and pre-schema placeable rows through authored placement edges', () => {
    const resolver = source.slice(
      source.indexOf('function authoredPlaceableDefinition('),
      source.indexOf('function genericPlaceableCapacity('),
    );
    expect(resolver).toContain('placeableObjectDefinition(contentRegistry(ctx), row)');
    expect(resolver).not.toContain('`object:${row.kind}`');
  });

  it('checks live station proximity before inventory mutation and records placement atomically', () => {
    const craft = reducerSource('craftInventoryRecipe');
    expect(craft.indexOf("throw new SenderError('station_required')"))
      .toBeLessThan(craft.indexOf('inventory_slot.id.update'));
    const hands = handsAuthoritySource();
    expect(hands.indexOf('insertWorldPlaceable(ctx')).toBeLessThan(hands.lastIndexOf("'placeables_placed'"));
  });

  it('derives manual crafts from the authoritative grid with opt-in knowledge checks', () => {
    const craft = reducerSource('craftInventoryRecipe');
    expect(craft).toContain('if (!runtimeRecipeMatchesGrid(registry, original.crafting, recipeId))');
    expect(craft).toContain('requestedRecipe.requiresKnowledge === true');
    expect(craft.indexOf("throw new SenderError('recipe_knowledge_required')")).toBeLessThan(craft.indexOf('runtimeConsumeCraftingRecipe'));
    expect(craft.indexOf('runtimeRecipeMatchesGrid(registry, original.crafting, recipeId)'))
      .toBeLessThan(craft.indexOf('runtimeRecipeDefinition(registry, recipeId)'));
  });

  it('maintains collision, gate state, fiber acquisition, and regional subscriptions', () => {
    expect(source).toContain('const collisionBySpace = new Map<number, ReturnType<typeof createAuthoritySpaceCollisionMap>>()');
    expect(source).toContain('const collision = collisionForSpace(ctx, spaceId, undefined, {');
    expect(source).toContain('collisionBySpace.set(spaceId, collision)');
    expect(source).toContain('planPlaceableStateEffect(contentRegistry(ctx), row, { toggleState: state })');
    const farmTool = source.slice(
      source.indexOf('function applyFarmToolUse('),
      source.indexOf('function applyFarmTileRestore('),
    );
    expect(farmTool).toContain('fiberDropsFromTilling(');
    expect(farmTool).toContain('runtimeItemKindForUniqueTag(registry, SOIL_TILL_OUTPUT_ITEM_TAG)');
    expect(farmTool).toContain("throw new SenderError('ambient_output_content_missing')");
  });

  it('keeps tagged processor interfaces, close, and item moves authority-owned', () => {
    expect(source).toContain('placeableFrameDefinition(contentRegistry(ctx), placeable)');
    expect(source).toContain('settleProcessorPlaceable(ctx, placeable)');
    expect(source).not.toContain('furnaceMutationIsValid(');
    expect(source).not.toContain('cookingFireMutationIsValid(');
    expect(source).not.toContain('cellarProcessorMutationIsValid(');
    expect(source).toContain('placeableFrameRestrictions(contentRegistry(ctx), placeable)');
    expect(processorsSource).toContain('settleProcess(definitions, adapter');
    expect(source).toContain('genericPlaceableCapacity(ctx, placeable)');
    expect(source).toContain('ctx.db.world_placeable_slot.insert({');
    expect(source).toContain('ctx.db.active_placeable.insert({ identity: ctx.sender, placeableId: placeable.id })');
    expect(reducerSource('closePlaceable')).toContain('clearActivePlaceable(ctx, ctx.sender)');
    expect(source).toContain('ctx.db.active_placeable.identity.delete(identity)');
    const hands = handsAuthoritySource();
    expect(hands).toContain("processorAdapterForPlaceableBehaviour(contentRegistry(ctx), placeable) === 'barrel'");
    expect(hands).not.toContain("placeable.kind === 'barrel'");
    const move = reducerSource('movePlaceableItem');
    expect(move).toContain('moveOpenMenuItem(ctx, request)');
    expect(source).toContain('const result = moveItemStacks(menu.containers, request, activeItemContainerContent(ctx))');
    expect(source).toContain('writeOpenMenuInventory(ctx, menu, result.containers)');
  });

  it('keeps first-bottle processors additive, lazy-settled, and capability-driven', () => {
    const placeable = source.slice(source.indexOf('const world_placeable = table('), source.indexOf('const world_placeable_slot = table('));
    expect(placeable).toContain('processStartTick: t.option(t.u64()).default(undefined)');
    expect(placeable).toContain('processStartedBy: t.option(t.identity()).default(undefined)');
    expect(placeable).toContain('processInputKind: t.option(t.string()).default(undefined)');
    expect(processorsSource).toContain('runtimeObjectProcessor(registry, placeable)');
    expect(processorsSource).not.toContain('registry.objects.get(');
    expect(processorsSource).not.toContain('registry.processes.values(');
    expect(processorsSource).toContain("if (adapter === 'press') return 'press'");
    expect(processorsSource).toContain("return adapter === 'fermentation' ? 'fermentation' : null");
    expect(processorsSource).toContain('runtimeProcessorCompletionRewards(');
    expect(processorsSource).not.toContain("'fruit_pressed'");
    expect(processorsSource).not.toContain("'bottles_produced'");
    expect(source).not.toContain('scheduled_cellar_processor');
  });

  it('salvages chest recipe inputs rather than duplicating the intact crafted object', () => {
    const harvest = reducerAuthoritySource('harvestChest');
    expect(harvest).toContain('legacyChestDamageable(ctx)');
    expect(harvest).toContain('authoredSalvageRecipe(ctx, damageable.salvageRecipe)');
    expect(harvest).toContain('recipeIngredientStacks(chestRecipe)');
    expect(harvest).not.toContain("stacks.unshift({ itemKind: 'chest'");
  });

  it('dismantles movable authored damageable placeables with their tool, threshold, and salvage', () => {
    const harvest = reducerAuthoritySource('harvestCampfire');
    expect(harvest).toContain('authoredHitsDamageable(ctx, fire)');
    expect(harvest).toContain('isAuthoredLandmarkPlaceable(ctx, fire.id)');
    expect(harvest).toContain('runtimeToolSpecialization(contentRegistry(ctx), selected.itemKind) !== damageable.toolSpecialization');
    expect(harvest).toContain('runtimeObjectFootprintTiles(contentRegistry(ctx), fire)');
    expect(harvest).toContain('campfireWithinReach(position.x, position.y, tile)');
    expect(harvest).toContain('recipeIngredientStacks(salvageRecipe)');
    expect(harvest).toContain('world_placeable_damage');
    expect(harvest).toContain('if (hits < damageable.maximumHits)');
    expect(harvest).toContain('dropWorldItemStack(ctx');
  });

  it('uses one shared radial range for placed and landmark campfires', () => {
    const reach = source.slice(
      source.indexOf('function assertBehaviourTargetReach('),
      source.indexOf('function behaviourRegistrySnapshot('),
    );
    expect(reach).toContain("target.snapshot.tags.includes('station.campfire')");
    expect(reach).toContain('CAMPFIRE_INTERACTION_REACH_FIXED');
    const harvest = reducerAuthoritySource('harvestCampfire');
    expect(harvest).toContain('runtimeObjectFootprintTiles(contentRegistry(ctx), fire)');
    expect(harvest).toContain('campfireWithinReach(position.x, position.y, tile)');
  });

  it('opens the nearest chest radially instead of requiring one faced tile', () => {
    const reach = source.slice(
      source.indexOf('function assertBehaviourTargetReach('),
      source.indexOf('function behaviourRegistrySnapshot('),
    );
    expect(reach).toContain("target.kind === 'chest'");
    expect(reach).toContain('CHEST_INTERACTION_REACH_FIXED');
    expect(reach).toContain('tileTargetWithinFixedReach(');
  });

  it('keeps placed anvils and tagged furnaces out of inventory and repairs anvils atomically for copper', () => {
    const hands = handsAuthoritySource();
    expect(hands).toContain("target?.kind !== 'placeable'");
    expect(hands).toContain('carriedPlaceableFor(ctx, ctx.sender)');
    expect(hands).toContain('carriedBy: ctx.sender');
    expect(source).toContain('const placed = {\n    ...carriedPlaceable,');
    expect(source).toContain('carriedBy: undefined');
    expect(source).toContain('world_placeable.by_carrier.filter(row.identity)');
    expect(hands).toContain('plannedRepairMaterial !== plannedRepairExpectedMaterial');
    expect(hands).toContain('plannedRepairCharge !== plannedRepairExpectedCharge');
    expect(hands).toContain('durability: definition.maximum');
    expect(hands).toContain("authoredReferenceSlug(payload.kind, 'statistic')");
    expect(hands).toContain('ctx, ctx.sender, statisticKind, delta');
    expect(hands).not.toContain("ctx, ctx.sender, 'tools_repaired'");
  });
});
