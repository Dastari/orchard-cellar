import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLifecycleSourceBundle } from './contract.js';

const sourceBundle = parseLifecycleSourceBundle(JSON.parse(readFileSync(
  new URL('../source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as unknown);
const client = readFileSync(new URL('../../client/src/overworld-main.ts', import.meta.url), 'utf8');
const world = readFileSync(new URL('../../world/src/index.ts', import.meta.url), 'utf8');
const placeables = readFileSync(
  new URL('../../sim/src/behaviour/handlers/placeables.ts', import.meta.url),
  'utf8',
);

describe('authored axe chest dismantling migration', () => {
  it('makes the one axe callback explicitly own chest targets', () => {
    const handlers = sourceBundle.handlers.filter(({ itemId }) => itemId === 'item:axe');
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toEqual(expect.objectContaining({
      id: 'item:axe.world_tool',
      triggers: ['secondary', 'useWith'],
    }));
    expect(handlers[0]?.source).toContain("target.definitionId === 'object:chest'");
    expect(handlers[0]?.source).toContain("worldTool: { action: 'target' }");
  });

  it('routes the chest namespace through generic useWith and retires target-owned capability', () => {
    expect(client).toContain('targetKind: network.chestTargetKind(chest.id), entityId: chest.id');
    expect(client).not.toContain("network.interactEntity('placeable', chest.id, 'break')");
    expect(placeables).not.toContain("id: 'placeable.chest-break'");
    const prompts = client.slice(
      client.indexOf('function interactionPrompt('),
      client.indexOf('function activateInteraction('),
    );
    expect(prompts).toContain('woodcuttingAction !== null');
    expect(prompts).not.toContain("selectedItem(snapshot) === 'axe'");
    const keyDispatch = client.slice(
      client.indexOf("if (event.code === 'KeyF'"),
      client.indexOf("if (event.code === 'KeyE'"),
    );
    expect(keyDispatch).toContain('selectedWoodcuttingAction !== null');
    expect(keyDispatch).not.toContain("chestDismantleAction?.id.endsWith('.world_tool')");
  });

  it('preflights and applies the exact legacy and generic chest transactions', () => {
    const writer = world.slice(
      world.indexOf('function worldBehaviourEffectWriter('),
      world.indexOf('function applyWorldBehaviourEffects('),
    );
    expect(writer).toContain("target.kind !== 'chest'");
    expect(writer).toContain('validateChestHarvestEffect(ctx, chest.id)');
    expect(writer).toContain('validatePlaceableChestHarvestEffect(ctx, placeable.id)');
    expect(writer).toContain('harvestChestTransaction(ctx, planned.targetId)');
    expect(writer).toContain('harvestPlaceableChestTransaction(ctx, planned.targetId)');
    for (const helper of ['validateChestHarvestEffect', 'validatePlaceableChestHarvestEffect']) {
      const start = world.indexOf(`function ${helper}(`);
      const end = world.indexOf('\n}', start) + 2;
      expect(start).toBeGreaterThanOrEqual(0);
      expect(world.slice(start, end)).toContain(
        'validateToolVigourSpend(ctx, ctx.sender, selected.itemKind',
      );
      expect(world.slice(start, end)).not.toContain("selected.itemKind !== 'axe'");
    }
    expect(world).toContain('syncLegacyChestGenericMirror(ctx, chest)');
    expect(world).toContain('syncGenericChestLegacyMirror(ctx, chest)');
    expect(world).toContain("'chests_broken'");
    expect(world).toContain("'tool_uses'");
  });

  it('keeps legacy and placeable namespaces phase-safe and id-exact', () => {
    const resolver = world.slice(
      world.indexOf('function resolvedBehaviourTarget('),
      world.indexOf('function assertBehaviourTargetReach('),
    );
    expect(resolver).toContain("if (targetKind === 'placeable')");
    expect(resolver).toContain('ctx.db.world_placeable.id.find(entityId)');
    expect(resolver).toContain('!chestMigrationReadsUsePlaceables(ctx)');
    expect(resolver).toContain("if (targetKind === 'chest')");
    expect(resolver).toContain('ctx.db.world_chest.id.find(entityId)');
    expect(resolver).toContain('chestMigrationReadsUsePlaceables(ctx)');
    expect(resolver).not.toContain('world_placeable.id.find(chest.id)');
    expect(resolver).not.toContain('world_chest.id.find(placeable.id)');
  });
});
