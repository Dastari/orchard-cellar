import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`missing source boundary: ${start} -> ${end}`);
  return source.slice(from, to);
}

describe('live lifecycle loot authority', () => {
  it('routes gatherable and resource-break loot through the registered bus', () => {
    const gather = between('export const gatherWorldResource', 'function collisionForWildlife(');
    const harvest = between('function applyHarvestResourceLifecycle(', 'function applyFishingCastLifecycle(');
    expect(gather).toContain("type: 'use'");
    expect(gather).toContain('registeredLifecycleLoot(ctx');
    expect(harvest).toContain("type: 'break'");
    expect(harvest).toContain('registeredLifecycleLoot(ctx');
    expect(`${gather}\n${harvest}`).not.toContain('resolveResourceHitLoot(');
  });

  it('routes wildlife defeat loot through the same registered bus', () => {
    const wildlife = between('function damageHuntableWildlife(', 'function damageRogueEnemy(');
    expect(wildlife).toContain("definitionId: `creature:${profile.species}`");
    expect(wildlife).toContain("type: 'break'");
    expect(wildlife).toContain('registeredLifecycleLoot(ctx');
    expect(wildlife).not.toContain('resolveWildlifeLoot(');
  });

  it('fails closed on non-loot effects before row delivery', () => {
    const bridge = between('function registeredLifecycleLoot(', 'function settleProcessorPlaceable(');
    expect(bridge).toContain('currentWorldBehaviourHandlers(ctx)');
    expect(bridge).toContain('resolveLifecycleLootEffects(');
    expect(bridge).toContain("throw new SenderError('behaviour_loot_effect_unavailable')");
  });
});
