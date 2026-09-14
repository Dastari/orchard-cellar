import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dispatcher = readFileSync(new URL('./use-selected.ts', import.meta.url), 'utf8');
const world = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function slice(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, start).toBeGreaterThanOrEqual(0);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('authored tile-effect reach authority', () => {
  it('resolves authored capability before a kind-agnostic transport ceiling', () => {
    const useAt = slice(dispatcher, "if (request.verb === 'use_at')", "if (request.verb === 'aimed_use')");
    expect(useAt.indexOf('raiseEvent(authority.handlers(ctx)'))
      .toBeLessThan(useAt.indexOf('authority.assertTileReach('));
    for (const kind of ['fishing_rod', 'hoe', 'watering_can', 'pickaxe']) {
      expect(dispatcher).not.toContain(`'${kind}'`);
    }
    const coarse = slice(world, 'assertTileReach: (ctx, tile', '  carriedObject:');
    expect(coarse).toContain('const reach = 3 * TILE_SIZE_FIXED;');
    expect(coarse).toContain("throw new SenderError('behaviour_target_out_of_range')");
    expect(coarse).toContain("'fishing' in effect && effect.fishing.action === 'reel'");
    expect(coarse).toContain('effects?.length === 1');
  });

  it('derives weapon hunger cost from live item metadata instead of item names', () => {
    const spend = slice(world, 'function spendToolVigour(', 'function requireUsableTool<');
    expect(spend).not.toContain("itemKind === 'sword'");
    expect(spend).not.toContain("itemKind === 'bow'");
    expect(spend).toContain("item?.tags.includes('item.melee_weapon')");
    expect(spend).toContain("item?.tags.includes('item.ranged_weapon')");
    expect(spend).toContain('weaponUse ? HUNGER_WEAPON_USE_CENTI : HUNGER_TOOL_USE_CENTI');
  });

  it('revalidates every emitted tile primitive at its exact bound before planning it', () => {
    const validation = slice(world, "if (kind === 'plantSeed')", "if (kind === 'bowAction')");
    expect(validation.indexOf('3 * TILE_SIZE_FIXED'))
      .toBeLessThan(validation.indexOf('plannedSeedPlant = {'));
    expect(validation.indexOf('validateFarmToolLifecycleAction('))
      .toBeLessThan(validation.indexOf('plannedFarmTool = {'));
    expect(validation.indexOf('applyDigCellarTileLifecycle(ctx, tileX, tileY, false)'))
      .toBeLessThan(validation.indexOf("action: 'digCellar', spaceId:"));
    expect(validation.indexOf('applyFishingCastLifecycle(ctx, poolId, tileX, tileY, false)'))
      .toBeLessThan(validation.indexOf("action: 'cast', poolId,"));

    const farm = slice(
      world,
      'function validateFarmToolLifecycleAction(',
      'function applyFarmToolLifecycleAction(',
    );
    expect(farm).toContain('farmSoilRestoreResult(');
    expect(farm).toContain('farmToolUseResult(');

    const cellar = slice(
      world,
      'function applyDigCellarTileLifecycle(',
      'const WILDLIFE_RESPAWN_TICKS',
    );
    expect(cellar).toContain('2 * TILE_SIZE_FIXED');
    expect(cellar.indexOf('2 * TILE_SIZE_FIXED'))
      .toBeLessThan(cellar.indexOf('if (!mutate)'));

    const fishing = slice(
      world,
      'function applyFishingCastLifecycle(',
      'function applyFishingReelLifecycle(',
    );
    expect(fishing).toContain('runtimeToolReachFixed(registry, selected.itemKind)');
    expect(fishing.indexOf('runtimeToolReachFixed(registry, selected.itemKind)'))
      .toBeLessThan(fishing.indexOf('if (!mutate) return'));
  });
});
