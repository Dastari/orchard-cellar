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

describe('placeable world-adapter row-write parity', () => {
  const writer = slice('function worldBehaviourEffectWriter(', 'function applyWorldBehaviourEffects(');

  it('registers generic placeable handlers once and processors from the active registry', () => {
    const bridge = slice(
      '// --- docs/55 lane 55-B0: generic behaviour authority bridge ---',
      'function behaviourItemSnapshot(',
    );
    expect(bridge).toContain('createHandlerRegistry(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS)');
    expect(bridge).not.toContain('registerItemHandlers(');
    expect(bridge.match(/registerPlaceableHandlers\(/gu)).toHaveLength(1);
    expect(bridge).toContain('content.registry.resources.values(),');
    expect(bridge).toContain('content.registry.creatures.values(),');
    expect(bridge).toContain('const content = cachedContentRegistry(ctx)');
    expect(bridge).toContain('registerProcessorHandlers(content.registry.objects.values(), registerNpcHandlers(');
  });

  it('resolves colliding numeric ids only through their explicit namespace', () => {
    const resolver = slice('function resolvedBehaviourTarget(', 'function assertBehaviourTargetReach(');
    for (const targetKind of ['placeable', 'chest', 'combat_target', 'world_item']) {
      expect(resolver).toContain(`targetKind === '${targetKind}'`);
    }
    expect(resolver).toContain("const npc = ctx.db.world_npc.id.find(entityId)");
    expect(writer).toContain("target?.kind !== 'placeable'");
    expect(writer).toContain("target?.kind !== 'chest'");
    expect(writer).toContain("target?.kind !== 'combat_target'");
    expect(writer).toContain("target?.kind !== 'world_item'");
    const reducers = slice(
      '// --- docs/55 lane 55-B0: additive generic behaviour reducers ---',
      '// --- end docs/55 lane 55-B0 generic behaviour reducers ---',
    );
    expect(reducers).toContain('{ targetKind: t.string(), entityId: t.u64(), verb: t.string() }');
  });

  it('preflights permissions, mount state, item ownership, and placement before spawning', () => {
    const validate = writer.slice(writer.indexOf("if (kind === 'spawnObject')"));
    expect(validate).toContain('requireWorldModificationAuthorized(ctx, position)');
    expect(validate).toContain("throw new SenderError('mounted_action_forbidden')");
    expect(validate).toContain("throw new SenderError('homestead_builder_required')");
    expect(validate).toContain('requireChestPlacementTile(ctx, position, tileX, tileY)');
    expect(validate).toContain('requirePlaceablePlacementTile(ctx, position, tileX, tileY, { kind: runtimeKind, definitionId: definition.id })');
  });

  it('writes the same fresh chest/placeable rows and consumes only the selected quantity', () => {
    expect(writer).toContain('insertWorldPlaceable(ctx, position, spawn.definitionId, tileX, tileY)');
    expect(source).toContain('const definition = contentRegistry(ctx).objects.get(definitionId)');
    expect(source).toContain("const runtimeKind = definition.id.slice('object:'.length)");
    expect(source).toContain('const capacity = definition.components.container?.slotCount ?? 0');
    expect(source).toContain('if (isChest) syncGenericChestLegacyMirror(ctx, placed)');
    expect(writer).toContain("'chests_placed'");
    expect(writer).toContain("'placeables_placed'");
    expect(writer).toContain('const remaining = selected.quantity - quantity');
    expect(writer).toContain("itemKind: remaining === 0 ? 'empty' : selected.itemKind");
    expect(writer).toContain('lit: remaining === 0 ? true : selected.lit');
  });

  it('moves carried rows without replacing their contents, process, or state columns', () => {
    const carry = writer.slice(writer.indexOf('carry: () => {'), writer.indexOf('placeCarried:'));
    expect(carry).toContain('const carried = {\n          ...row,');
    expect(carry).toContain('ctx.db.world_placeable.id.update(carried)');
    expect(carry).toContain('carriedBy: ctx.sender');
    expect(carry).not.toContain('world_placeable_slot.id.delete');
    expect(carry).not.toContain('world_placeable.id.delete');
    const placement = writer.slice(writer.indexOf('placeCarried:'), writer.indexOf('toggleState:'));
    expect(placement).toContain('placeCarriedHandsObject(');
    expect(placement).toContain('placeCarriedChest(');
  });

  it('retains the verified chest row operations after retiring the legacy reducer', () => {
    expect(writer).toContain('ensureChestStorageRows(ctx, chest.id)');
    expect(writer).toContain('ctx.db.active_chest.insert({ identity: ctx.sender, chestId: chest.id })');
    expect(writer).toContain('harvestChestTransaction(ctx, targetChest().id)');
    expect(source).not.toContain('export const harvestChest =');
    const harvest = slice('function harvestChestTransaction(', '/** Authored tool strikes dismantle');
    expect(harvest).toContain('dropWorldItemStack(ctx, {');
    expect(harvest).toContain('ctx.db.world_chest_slot.id.delete(slot.id)');
    expect(harvest).toContain('ctx.db.world_chest.id.delete(chest.id)');
  });

  it('keeps collision derived and mirrors Marlow campfire light state', () => {
    expect(writer).toContain('planPlaceableCollisionEffect(contentRegistry(ctx), row, enabled)');
    expect(writer).not.toContain('setCollision: () => undefined');
    expect(writer).toContain('ctx.db.world_placeable.id.update(litRow)');
    expect(writer).toContain('ctx.db.world_campfire_state.id.update({');
    expect(writer).toContain('manualOverride: true');
    expect(writer).toContain('ctx.db.world_item.id.update({ ...row, lit: light.enabled })');
    expect(writer).toContain('settleProcessorPlaceable(ctx, litRow)');
  });
});
