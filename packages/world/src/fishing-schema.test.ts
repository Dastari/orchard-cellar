import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('fishing authority schema', () => {
  it('keeps cast tokens private while exposing scoped gameplay and presentation views', () => {
    const table = sourceBetween('const fishing_cast = table(', 'const private_inventory = table(');
    expect(table).toContain("{ name: 'fishing_cast' }");
    expect(table).not.toContain('public: true');
    expect(table).toContain('identity: t.identity().primaryKey()');
    expect(table).toContain('targetTileX: t.i32().default(0)');
    expect(table).toContain('targetTileY: t.i32().default(0)');
    const view = sourceBetween('export const ownFishingCast', 'export const ownCookingJob');
    expect(view).toContain('ctx.db.fishing_cast.identity.find(ctx.sender)');
    expect(view).toContain("name: 'active_fishing_casts'");
    expect(view).toContain('[...ctx.db.fishing_cast.iter()]');
  });

  it('guards both lifecycle adapters and validates elapsed authority ticks before reward mutation', () => {
    const adapters = sourceBetween('function applyFishingCastLifecycle', 'function authorityBowChargeMs');
    expect(adapters.match(/requireAuthorizedSender/g)).toHaveLength(2);
    expect(adapters).toContain('clock.authorityTick - cast.startedTick < FISHING_CAST_TICKS');
    expect(adapters.indexOf('clock.authorityTick - cast.startedTick < FISHING_CAST_TICKS'))
      .toBeLessThan(adapters.indexOf('resolveFishingLoot(contentRegistry(ctx).loots, ['));
    expect(adapters).toContain('applyLootDropsBehaviour(ctx, catchResult.drops, {');
    expect(adapters).toContain(
      "runtimeTaggedLootTotals(registry, catchResult.drops, 'food.fish')",
    );
    expect(adapters.indexOf('runtimeTaggedLootTotals('))
      .toBeLessThan(adapters.indexOf('applyLootDropsBehaviour('));
    expect(adapters).not.toContain("drop.itemKind === 'raw_fish'");
    expect(adapters).toContain("poolDefinition?.interaction.mode !== 'fish'");
    expect(adapters).toContain('modifiers, poolDefinition.loot');
    expect(adapters).toContain(
      "runtimeToolSpecialization(registry, selected.itemKind) !== 'fishing'",
    );
    expect(adapters).not.toContain("selected?.itemKind !== 'fishing_rod'");
    expect(adapters).toContain("throw new SenderError('fishing_requires_water')");
    expect(adapters).toContain('runtimeToolReachFixed(registry, selected.itemKind)');
    expect(adapters).toContain('pool.tileX !== targetTileX || pool.tileY !== targetTileY');
    expect(source).not.toContain('export const castFishingRod');
    expect(source).not.toContain('export const reelFishingRod');
  });

  it('cancels casts on disconnect, equipment changes, movement, and damage', () => {
    expect(sourceBetween('export const onDisconnect', 'export const setDisplayName'))
      .toContain('cancelFishingCastFor(ctx, ctx.sender)');
    expect(sourceBetween('export const selectHotbar', 'export const inventoryCursorClick'))
      .toContain('cancelFishingCastFor(ctx, ctx.sender)');
    expect(sourceBetween('function stepCommittedRogueAttack', 'type SwordMeleeTarget'))
      .toContain('cancelFishingCastFor(ctx,member.identity,authorityTick)');
    expect(sourceBetween('const fishingInterrupted = moved', 'const nextPosition ='))
      .toContain('ctx.db.fishing_cast.identity.delete(row.identity)');
  });
});
