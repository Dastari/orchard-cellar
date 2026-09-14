import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const dispatchSource = readFileSync(new URL('./use-selected.ts', import.meta.url), 'utf8');
const lifecycleSource = JSON.parse(readFileSync(
  new URL('../../../lifecycle-authoring/source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as { readonly handlers: readonly {
  readonly itemId: string;
  readonly triggers?: readonly string[];
  readonly source: string;
}[] };

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('authored fishing adversarial authority', () => {
  it('binds a cast to the submitted pool id and exact authoritative tile tuple', () => {
    const handler = lifecycleSource.handlers.find(({ itemId }) => itemId === 'item:fishing_rod');
    expect(handler?.triggers).toEqual(['useWith', 'useAt']);
    expect(handler?.source).toContain("context.event.actionId === 'cast'");
    expect(handler?.source).toContain('poolId: context.event.targetId');
    expect(handler?.source).toContain('at: targetTile');

    const cast = between(
      worldSource,
      'function applyFishingCastLifecycle(',
      'function applyFishingReelLifecycle(',
    );
    expect(cast).toContain('poolId === 0n ? null : ctx.db.world_resource.id.find(poolId)');
    expect(cast).toContain('pool.tileX !== targetTileX || pool.tileY !== targetTileY');
    expect(cast).toContain('pool.spaceId !== position.spaceId');
    expect(cast).toContain('liveMapGeneratedResourceSuppressed(');
    expect(cast).toContain("throw new SenderError('target_not_ready')");
    expect(cast.indexOf('if (!mutate) return;')).toBeGreaterThan(cast.indexOf('resourceHarvestResult('));
    expect(cast.indexOf('ctx.db.fishing_cast.insert')).toBeGreaterThan(cast.indexOf('if (!mutate) return;'));
  });

  it('reels only the durable server tuple and treats the forged useAt tuple as irrelevant', () => {
    const handler = lifecycleSource.handlers.find(({ itemId }) => itemId === 'item:fishing_rod');
    const reelBranch = handler?.source.slice(handler.source.indexOf("actionId === 'reel'")) ?? '';
    expect(reelBranch).toContain("fishing: { action: 'reel' }");
    expect(reelBranch).not.toContain('targetId');
    expect(reelBranch).not.toContain('targetTile');

    const reel = between(
      worldSource,
      'function applyFishingReelLifecycle(',
      'function authorityBowChargeMs(',
    );
    expect(reel).toContain('const cast = ctx.db.fishing_cast.identity.find(ctx.sender)');
    const terminalCompletion = reel.indexOf('if (cast === null) return;');
    expect(terminalCompletion).toBeGreaterThanOrEqual(0);
    for (const validation of [
      'requireAuthorizedSender(',
      "throw new SenderError('player_not_ready')",
      "throw new SenderError('wrong_tool')",
      'requireUsableTool(ctx, selected)',
      "throw new SenderError('hands_occupied')",
      "throw new SenderError('mounted_action_forbidden')",
    ]) {
      expect(reel.indexOf(validation), validation).toBeGreaterThanOrEqual(0);
      expect(reel.indexOf(validation), validation).toBeLessThan(terminalCompletion);
    }
    expect(terminalCompletion).toBeLessThan(reel.indexOf('clock.authorityTick - cast.startedTick'));
    expect(terminalCompletion).toBeLessThan(reel.indexOf('if (!mutate) return;'));
    expect(terminalCompletion).toBeLessThan(reel.indexOf('ctx.db.fishing_cast.identity.delete(ctx.sender)'));
    expect(reel).toContain('clock.authorityTick - cast.startedTick < FISHING_CAST_TICKS');
    expect(reel).toContain('const pool = ctx.db.world_resource.id.find(cast.poolId)');
    expect(reel).toContain('pool.spaceId !== position.spaceId');
    expect(reel).toContain('pool.tileX !== cast.targetTileX || pool.tileY !== cast.targetTileY');
    expect(reel).toContain('liveMapGeneratedResourceSuppressed(');
    expect(reel.indexOf('if (!mutate) return;')).toBeGreaterThan(reel.indexOf("throw new SenderError('mounted_action_forbidden')"));
  });

  it('preflights stale casts and reels without writes, then applies the identical planned tuple', () => {
    const writer = between(
      worldSource,
      'function worldBehaviourEffectWriter(',
      '\nfunction applyWorldBehaviourEffects(',
    );
    const validation = between(writer, "if (kind === 'fishing')", "if (kind === 'consumeSelected')");
    expect(validation).toContain('applyFishingReelLifecycle(ctx, false)');
    expect(validation).toContain('applyFishingCastLifecycle(ctx, poolId, tileX, tileY, false)');
    expect(validation.indexOf('applyFishingCastLifecycle(ctx, poolId, tileX, tileY, false)'))
      .toBeLessThan(validation.indexOf("plannedFishing = {\n        action: 'cast'"));

    const apply = between(writer, 'fishing: (fishing) => {', 'consumeSelected: (quantity) => {');
    expect(apply).toContain("fishing.poolId !== planned.poolId.toString()");
    expect(apply).toContain('fishing.at.x !== planned.tileX || fishing.at.y !== planned.tileY');
    expect(apply).toContain('applyFishingCastLifecycle(ctx, planned.poolId, planned.tileX, planned.tileY)');
    expect(apply).toContain('applyFishingReelLifecycle(ctx)');
  });

  it('keeps useAt ids opaque and forbids a simultaneous entity namespace', () => {
    expect(dispatchSource).toContain("const target = request.verb === 'use_at'");
    expect(dispatchSource).toContain("request.targetKind.length > 0");
    expect(dispatchSource).toContain("authority.reject('behaviour_use_at_target_kind_invalid')");
    expect(dispatchSource).toContain('targetId: request.entityId.toString()');
  });
});
