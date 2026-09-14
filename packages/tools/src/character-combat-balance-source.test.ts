import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('character/combat authored balance source boundary', () => {
  it('does not retain the retired simulation constant catalog', () => {
    const balance = source('../../sim/src/balance.ts');
    for (const retiredName of [
      'BASE_ATTRIBUTE', 'MIN_ATTRIBUTE', 'MAX_ATTRIBUTE', 'BASIS_POINTS',
      'CENTI_UNITS_PER_DISPLAY_UNIT', 'HEALTH_CENTI_PER_STRENGTH',
      'MANA_CENTI_PER_INTELLIGENCE', 'VIGOUR_CENTI_PER_CONSTITUTION',
      'HEALTH_REGEN_CENTI_PER_SECOND', 'MANA_REGEN_CENTI_PER_WISDOM',
      'VIGOUR_REGEN_CENTI_PER_CONSTITUTION', 'REGEN_SWEEP_TICKS',
      'BOW_BASE_DAMAGE_CENTI', 'SWORD_BASE_DAMAGE_CENTI',
      'COMBAT_MINIMUM_DAMAGE_CENTI', 'ARCHERY_TARGET_MAX_HEALTH_CENTI',
      'ARCHERY_TARGET_REGEN_CENTI_PER_SECOND', 'ARCHERY_TARGET_REGEN_INTERVAL_TICKS',
    ]) expect(balance).not.toContain(retiredName);
  });

  it('keeps world tuning out of balance.ts and uses the semantic live profile', () => {
    const balance = source('../../sim/src/balance.ts');
    const world = source('../../world/src/index.ts');
    const client = source('../../client/src/overworld-main.ts');
    for (const retiredName of [
      'FIBER_TILL_DROP_PERCENT', 'CRAFTING_STATION_REACH_TILES', 'ITEM_DESPAWN_TICKS',
      'SURVIVAL_SPAWN_SEARCH_RADIUS_TILES', 'PROCEDURAL_WORLD_CHUNK_TILES',
      'PROCEDURAL_WORLD_EXTENT_TILES', 'PROCEDURAL_SPAWN_PREGEN_RADIUS_CHUNKS',
      'PROCEDURAL_GENERATION_LOOKAHEAD_CHUNKS', 'SURVIVAL_TERRAIN_MAX_ELEVATION',
      'SURVIVAL_TERRAIN_CONTOUR_INSET_TILES', 'SURVIVAL_TERRAIN_MINIMUM_SUMMIT_TILES',
    ]) expect(balance).not.toContain(retiredName);
    expect(world).toContain('runtimeWorldPolicyBalance(contentRegistry(ctx))');
    expect(world).toContain("throw new SenderError('world_policy_unavailable')");
    expect(client).toContain('runtimeWorldPolicyBalance(snapshot.content.registry)');
  });

  it('requires the active semantic profile on live world and client paths', () => {
    const world = source('../../world/src/index.ts');
    const client = source('../../client/src/overworld-main.ts');
    expect(world).toContain('runtimeCharacterCombatBalance(contentRegistry(ctx))');
    expect(world).toContain("throw new SenderError('character_balance_unavailable')");
    expect(world).not.toMatch(/\bresolveStats\(/);
    expect(world).not.toMatch(/\bresolveCombatDamage\(/);
    expect(client).toContain('runtimeCharacterCombatBalance(snapshot.content.registry)');
    expect(client).not.toMatch(/\bresolveStats\(/);
  });
});
