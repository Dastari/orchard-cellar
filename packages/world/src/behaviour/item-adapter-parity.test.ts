import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function slice(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('item world-adapter row-write parity', () => {
  const writer = slice('function worldBehaviourEffectWriter(', 'function applyWorldBehaviourEffects(');

  it('registers item and placeable handlers once in deterministic composition', () => {
    const bridge = slice(
      '// --- authoring lane 55-B0: generic behaviour authority bridge ---',
      'function behaviourItemSnapshot(',
    );
    expect(bridge).toContain('createHandlerRegistry(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS)');
    expect(bridge).not.toContain('registerItemHandlers(');
    expect(bridge).toContain('content.registry.resources.values(),');
    expect(bridge).toContain('content.registry.creatures.values(),');
    expect(bridge).toContain('registerProcessorHandlers(content.registry.objects.values(), registerNpcHandlers(');
  });

  it('lets the approved lifecycle effect own deed capability while retaining site validation', () => {
    const validate = slice('function validateHomesteadDeedPlacement(', 'function establishHomesteadAt(');
    const create = slice('function establishHomesteadAt(', 'function validateBoatLaunch(');
    expect(validate).not.toContain('selected?.itemKind');
    expect(validate).not.toContain("'homestead_deed'");
    expect(validate).toContain('homesteadForOwner(ctx, ctx.sender)');
    expect(validate).toContain('homesteadMarkerPlacementTiles(tileX, tileY)');
    expect(validate).toContain('tileOverlapsAnyOtherPlayer(');
    expect(create).toContain('ctx.db.homestead.insert({');
    expect(create.match(/ctx\.db\.space_portal\.insert\(\{/g)).toHaveLength(2);
    expect(create).toContain('installHomesteadChildSpaces(ctx)');
    expect(writer).toContain('validateHomesteadDeedPlacement(ctx, position, tileX, tileY)');
    expect(writer).toContain('establishHomesteadAt(ctx, tileX, tileY)');
  });

  it('lets the approved lifecycle effect own boat-item capability while retaining launch checks', () => {
    const validate = slice('function validateBoatLaunch(', 'function launchBoatAt(');
    const create = slice('function launchBoatAt(', 'function requireHomesteadBuildPlacement(');
    expect(validate).not.toContain('selected?.itemKind');
    expect(validate).not.toContain("'boat'");
    expect(validate).toContain('requireBoatPlacementTile(ctx, position, tileX, tileY)');
    expect(validate).toContain('nextBoatNpcId(ctx)');
    expect(create).toContain("kind: definition.runtimeKind ?? definition.id.slice('npc:'.length)");
    expect(create).toContain('health: definition.health');
    expect(create).toContain('homeX: position.x');
    expect(writer).not.toContain("effect.spawnNpc.definitionId !== 'npc:boat'");
    expect(writer).toContain("contentRegistry(ctx).npcs.get(effect.spawnNpc.definitionId)?.spawnPolicy !== 'dynamic'");
    expect(writer).toContain("contentRegistry(ctx).npcs.get(effect.spawnNpc.definitionId)?.mount?.adapter !== 'boat'");
    expect(writer).toContain('plannedBoatId = validateBoatLaunch(');
    expect(writer).toContain('launchBoatAt(ctx, position, boatId, tileX, tileY, definition)');
  });

  it('preflights selected ownership, carrying precedence, permissions, and atomic consumption', () => {
    expect(writer).toContain('const selected = selectedRow()');
    expect(writer).toContain("subjectItem.containerId !== 'hotbar'");
    expect(writer).toContain('subjectItem.slot !== survival.selectedSlot');
    expect(writer).toContain('row.id !== subjectItem.instanceId');
    expect(writer).toContain('row.itemKind !== subjectItem.kind');
    expect(writer).toContain('requireWorldModificationAuthorized(ctx, position)');
    expect(writer).toContain("throw new SenderError('mounted_action_forbidden')");
    expect(writer).toContain("throw new SenderError('homestead_builder_required')");
    expect(writer).toContain('plannedSelectedConsumption < plannedPlaceableSpawns + plannedItemSpawns');
    expect(writer).toContain("throw new SenderError('behaviour_spawn_requires_selected_item')");
  });

  it('matches selected food and registry-driven durable effect/statistic writes', () => {
    expect(writer).toContain("kind === 'restoreHunger'");
    expect(writer).toContain('runtimeFoodRestoreCenti(registry, selected.itemKind)');
    expect(writer).toContain('restoreHunger(survival, amount)');
    expect(writer).toContain("authoredReferenceSlug(applied.effectId, 'effect')");
    expect(writer).toContain('runtimeEffectDefinition(contentRegistry(ctx), effectKind)');
    expect(writer).toContain("authoredReferenceSlug(payload.kind, 'statistic')");
    expect(writer).not.toContain("applied.effectId === 'fruitful_energy'");
    expect(writer).not.toContain("applied.effectId === 'orchard_tea'");
    expect(writer).not.toContain("effect.applyEffect.effectId === 'hunger'");
  });

  it('matches one-shot recipe-book learning and statistics', () => {
    expect(writer).toContain("kind === 'learnRecipes'");
    expect(writer).toContain("definition.kind !== 'recipe' && definition.kind !== 'process'");
    expect(writer).toContain('ctx.db.player_known_recipe.insert({');
    expect(writer).toContain("'recipe_books_read', 1n, authorityTick, selected.itemKind");
    expect(writer).toContain("'recipes_learned', BigInt(newRecipeIds.length), authorityTick");
  });

  it('matches atomic repair material, bronze, durability, and statistics writes', () => {
    expect(writer).toContain("kind === 'repairSelected'");
    expect(writer).toContain('placeableAtFacingTile(ctx, actorPosition())?.id !== anvil.id');
    expect(writer).toContain('plannedRepairMaterial !== plannedRepairExpectedMaterial');
    expect(writer).toContain('plannedRepairMaterialCount !== 1');
    expect(writer).toContain('plannedRepairCharge !== plannedRepairExpectedCharge');
    expect(writer).toContain('durability: definition.maximum');
    expect(writer).toContain("'bronze_spent', BigInt(definition.repairCostBronze), authorityTick");
    expect(writer).not.toContain("'tools_repaired', 1n, authorityTick, selected.itemKind");
    expect(writer).toContain("'durability_restored'");
    expect(writer).not.toContain("effect.applyEffect.effectId === 'repair_selected'");
  });

  it('keeps each concrete equipped light row and replicated light state in sync', () => {
    expect(writer).toContain("subjectItem?.containerId !== 'equipment'");
    expect(writer).toContain('`${ctx.sender.toHexString()}:${subjectItem.slot}`');
    expect(writer).toContain('row.id !== subjectItem.instanceId');
    expect(writer).toContain('row.itemKind !== subjectItem.kind');
    expect(writer).toContain('row.quantity <= 0');
    expect(writer).toContain("runtimeItemHasTag(contentRegistry(ctx), row.itemKind, 'emits.light')");
    expect(writer).toContain("runtimeItemHasTag(contentRegistry(ctx), row.itemKind, 'gear.off_hand')");
    expect(writer).toContain('ctx.db.inventory_slot.id.update({ ...row, lit: !row.lit })');
    expect(writer).toContain('equippedKind: lightItem.itemKind');
    expect(writer).toContain('equippedLit: light.enabled');
  });
});
