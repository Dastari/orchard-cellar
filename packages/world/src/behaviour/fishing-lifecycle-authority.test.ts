import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
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

describe('authored fishing lifecycle authority', () => {
  it('preflights and applies the bounded effect through exact legacy adapters', () => {
    const writer = between(
      worldSource,
      'function worldBehaviourEffectWriter(',
      '\nfunction applyWorldBehaviourEffects(',
    );
    expect(writer).toContain("if (kind === 'fishing')");
    expect(writer).toContain('applyFishingCastLifecycle(ctx, poolId, tileX, tileY, false)');
    expect(writer).toContain('applyFishingReelLifecycle(ctx, false)');
    expect(writer).toContain('applyFishingCastLifecycle(ctx, planned.poolId, planned.tileX, planned.tileY)');
    expect(writer).toContain('applyFishingReelLifecycle(ctx)');

    const adapters = between(
      worldSource,
      'function applyFishingCastLifecycle(',
      'function authorityBowChargeMs(',
    );
    for (const mechanic of [
      'activePersonalQuestResource(ctx, ctx.sender, poolId)',
      "poolId === 0n ? null",
      'spendToolVigour(',
      'cancelFishingCastFor(',
      'resolveFishingLoot(',
      'applyLootDropsBehaviour(',
      'wearInventoryTool(',
      "'fish_caught'",
      'grantSkillExperience(',
    ]) expect(adapters, mechanic).toContain(mechanic);
    expect(adapters).not.toContain('FISHERMAN_TUTORIAL_');
    expect(clientSource).toContain('function personalQuestResource(');
    expect(clientSource).not.toContain('FISHERMAN_TUTORIAL_');
  });

  it('routes casts and reels through generic useSelected and retires specialized reducers', () => {
    expect(clientSource).toContain('fishingCastLifecycleRequest(');
    expect(clientSource).toContain('fishingReelLifecycleRequest(');
    expect(clientSource).toContain('network.useSelected(request.verb, request.options)');
    expect(clientSource).not.toContain('network.castFishingRod(');
    expect(clientSource).not.toContain('network.reelFishingRod(');
    expect(connectionSource).not.toContain('castFishingRod(');
    expect(connectionSource).not.toContain('reelFishingRod(');
    expect(worldSource).not.toContain('export const castFishingRod');
    expect(worldSource).not.toContain('export const reelFishingRod');
    expect(existsSync(new URL('../../../world-bindings/src/cast_fishing_rod_reducer.ts', import.meta.url)))
      .toBe(false);
    expect(existsSync(new URL('../../../world-bindings/src/reel_fishing_rod_reducer.ts', import.meta.url)))
      .toBe(false);
  });

  it('lets reel reach the cancellation path while casts use authored tool reach', () => {
    const authority = between(
      worldSource,
      'const useSelectedAuthority:',
      'function timerBehaviourSnapshot(',
    );
    expect(authority).toContain("'fishing' in effect && effect.fishing.action === 'reel'");
    expect(authority).toContain('effects?.length === 1');
    expect(authority).not.toContain("selectedItem?.kind === 'fishing_rod'");
    const cast = between(
      worldSource,
      'function applyFishingCastLifecycle(',
      'function applyFishingReelLifecycle(',
    );
    expect(cast).toContain('runtimeToolReachFixed(registry, selected.itemKind)');
    expect(cast).not.toContain("'fishing_rod'");
    expect(cast).toContain("throw new SenderError('target_out_of_range')");
  });
});
