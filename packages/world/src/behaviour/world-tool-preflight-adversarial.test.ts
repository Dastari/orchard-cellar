import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function between(source: string, startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

function expectNoDurableMutation(source: string): void {
  expect(source).not.toMatch(/ctx\.db\.[\s\S]*\.(?:insert|update|delete)\(/);
  expect(source).not.toContain('spendToolVigour(');
  expect(source).not.toContain('wearInventoryTool(');
  expect(source).not.toContain('dropWorldItemStack(');
  expect(source).not.toContain('applyLootDropsBehaviour(');
  expect(source).not.toContain('recordPlayerStatistic(');
}

describe('authored world-tool complete preflight', () => {
  it('preflights every worldTool operation before recording the planned effect', () => {
    const writer = between(
      worldSource,
      "if (kind === 'worldTool')",
      "if (kind === 'meleeAttack')",
    );
    for (const invocation of [
      'applyHarvestResourceLifecycle(ctx, 0n, false);',
      'applyHarvestPlaceableLifecycle(ctx, placeable.id, false);',
      'applyHarvestResourceLifecycle(ctx, BigInt(target.ref.id), false);',
      'applyDigCellarTileLifecycle(ctx, tileX, tileY, false);',
    ]) {
      expect(writer, invocation).toContain(invocation);
    }
    expect(writer.lastIndexOf(', false);')).toBeLessThan(writer.lastIndexOf('plannedWorldTool ='));
  });

  it('keeps authored placeable and cellar validation prefixes read-only', () => {
    const placeable = between(
      worldSource,
      'function applyHarvestPlaceableLifecycle(',
      'if (!mutate) {',
    );
    expect(placeable).toContain('activeCookingJob');
    expect(placeable).toContain('campfireWithinReach(');
    expect(placeable).toContain('damageable.toolSpecialization');
    expectNoDurableMutation(placeable);

    const cellar = between(
      worldSource,
      'function applyDigCellarTileLifecycle(',
      'if (!mutate) {',
    );
    expect(cellar).toContain('cellar_wall_not_exposed');
    expect(cellar).toContain(
      "runtimeToolSpecialization(registry, slot.itemKind) !== 'mining'",
    );
    expect(cellar).not.toContain("slot.itemKind !== 'pickaxe'");
    expectNoDurableMutation(cellar);
  });

  it('checks target state, authored mining permission, claims, and Vigour before resource writes', () => {
    const resource = between(
      worldSource,
      'function applyHarvestResourceLifecycle(',
      'function applyFishingCastLifecycle(',
    );
    const targetChecks = resource.indexOf("if (result === 'depleted')");
    const permissionCheck = resource.indexOf('if (!runtimeToolCanMineResource(registry, slot.itemKind, miningKind))');
    const claimCheck = resource.indexOf("throw new SenderError('mining_claimed_by_other_party')");
    const miningPreflight = resource.indexOf('if (!mutate) {', claimCheck);
    const firstTargetWrite = resource.indexOf('spendToolVigour(', miningPreflight);
    expect(targetChecks).toBeGreaterThanOrEqual(0);
    expect(permissionCheck).toBeGreaterThan(targetChecks);
    expect(claimCheck).toBeGreaterThan(permissionCheck);
    expect(resource.slice(permissionCheck, claimCheck)).toContain("throw new SenderError('pickaxe_tier_too_low')");
    expect(resource).not.toContain('miningRequiredPickaxeTier(');
    expect(miningPreflight).toBeGreaterThan(claimCheck);
    expect(resource.slice(miningPreflight, firstTargetWrite)).toContain('validateToolVigourSpend(');

    const nonMiningPreflight = resource.indexOf('if (!mutate) {', firstTargetWrite);
    const nonMiningWrite = resource.indexOf('spendToolVigour(', nonMiningPreflight);
    expect(nonMiningPreflight).toBeGreaterThan(firstTargetWrite);
    expect(resource.slice(nonMiningPreflight, nonMiningWrite)).toContain('validateToolVigourSpend(');
  });
});
