import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const dispatchSource = readFileSync(new URL('./use-selected.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(
  new URL('../../../client/src/overworld-main.ts', import.meta.url),
  'utf8',
);
const connectionSource = readFileSync(
  new URL('../../../client/src/net/overworld-connection.ts', import.meta.url),
  'utf8',
);

function between(source: string, startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('authored woodcutting and mining tool world authority', () => {
  it('preflights one bounded worldTool effect before delegating to engine transactions', () => {
    const writer = between(
      worldSource,
      'function worldBehaviourEffectWriter(',
      '\nfunction applyWorldBehaviourEffects(',
    );
    expect(writer).toContain("if (kind === 'worldTool')");
    expect(writer).toContain(
      'runtimeToolSpecialization(contentRegistry(ctx), selected.itemKind)',
    );
    expect(writer).toContain("specialization !== 'woodcutting' && specialization !== 'mining'");
    expect(writer).not.toContain("selected.itemKind !== 'axe'");
    expect(writer).not.toContain("selected.itemKind !== 'pickaxe'");
    expect(writer).toContain("effect.worldTool.action === 'whiff'");
    expect(writer).toContain("target.kind !== 'resource' && target.kind !== 'placeable'");
    expect(writer).toContain("effect.worldTool.action !== 'digCellar'");
    expect(writer).toContain('applyHarvestResourceLifecycle(ctx, 0n)');
    expect(writer).toContain('applyHarvestCampfireLifecycle(ctx, planned.targetId)');
    expect(writer).toContain('applyDigCellarTileLifecycle(ctx, planned.tileX, planned.tileY)');
  });

  it('preserves resource, campfire, and cellar transaction semantics verbatim', () => {
    const resource = between(
      worldSource,
      'function applyHarvestResourceLifecycle(',
      'function authorityBowChargeMs(',
    );
    for (const marker of [
      'resourceHarvestResult(', 'spendToolVigour(', 'wearInventoryTool(',
      'miningWorkPerHit(', 'resolveMiningLoot(', 'applyLootDropsBehaviour(',
      'world_resource_mining_claim', 'grantSkillExperience(', "'tool_uses'",
    ]) expect(resource, marker).toContain(marker);

    const campfire = between(
      worldSource,
      'function applyHarvestCampfireLifecycle(',
      '\nexport const moveChestItem',
    );
    for (const marker of [
      "runtimeToolSpecialization(contentRegistry(ctx), selected.itemKind) !== 'woodcutting'",
      'runtimeItemAvatarAction(contentRegistry(ctx), selected.itemKind)',
      'campfireWithinReach(', 'spendToolVigour(',
      'wearInventoryTool(', 'settleProcessorPlaceable(', 'recipeIngredientStacks(',
      'world_placeable_damage', "'placeables_removed'",
    ]) expect(campfire, marker).toContain(marker);
    expect(campfire).not.toContain("selected?.itemKind !== 'axe'");

    const cellar = between(
      worldSource,
      'function applyDigCellarTileLifecycle(',
      'function applyHarvestResourceLifecycle(',
    );
    for (const marker of [
      "runtimeToolSpecialization(registry, slot.itemKind) !== 'mining'",
      'runtimeItemAvatarAction(registry, slot.itemKind)', 'requireWorldModificationAuthorized(',
      "'cellar_wall_not_exposed'", 'CELLAR_WALL_TOOL_WEAR', 'spendToolVigour(',
      'cellarWallHitsRequired(', 'ctx.db.cellar_excavation.insert(',
      'cellarOreKindAt(', "itemKind: 'pebble'", "'rocks_broken'",
    ]) expect(cellar, marker).toContain(marker);
    expect(cellar).not.toContain("slot.itemKind !== 'pickaxe'");
  });

  it('routes targets and tiles through useSelected and retires specialized surfaces', () => {
    expect(dispatchSource).toContain("request.verb === 'use_at'");
    expect(dispatchSource).toContain("type: 'useAt'");
    expect(clientSource).toContain("network.useSelected('use_with', { targetKind: 'resource'");
    expect(clientSource).toContain("network.useSelected('use_with', { targetKind: 'placeable'");
    expect(clientSource).toContain("network.useSelected('use_at', {");
    expect(clientSource).toContain('actionId: cellarToolAction.actionId');
    expect(clientSource).toContain("network.useSelected('secondary')");
    for (const retired of ['harvestResource', 'harvestCampfire', 'digCellarTile']) {
      expect(worldSource).not.toContain(`export const ${retired} =`);
      expect(connectionSource).not.toContain(`${retired}(`);
      expect(clientSource).not.toContain(`network.${retired}(`);
    }
    for (const binding of [
      'harvest_resource_reducer.ts', 'harvest_campfire_reducer.ts', 'dig_cellar_tile_reducer.ts',
    ]) expect(existsSync(new URL(`../../../world-bindings/src/${binding}`, import.meta.url))).toBe(false);
  });
});
