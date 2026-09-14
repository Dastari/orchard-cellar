import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('live effect registry world authority', () => {
  it('keeps the durable player-effect shape while resolving arbitrary active slugs', () => {
    const schema = between("name: 'player_effect'", "name: 'player_skill_track'");
    for (const field of ['effectKind: t.string()', 'stacks: t.u8()', 'appliedTick: t.u64()', 'expiresTick: t.u64()']) {
      expect(schema).toContain(field);
    }
    const refresh = between('function applyOrRefreshPlayerEffect(', 'function isVitalsToolKind(');
    expect(refresh).toContain('runtimeEffectDefinition(registry, effectKind)');
    expect(refresh).toContain('existing?.id');
    expect(refresh).toContain('existing.appliedTick');
    expect(refresh).toContain('existing.expiresTick');
    expect(refresh).not.toContain('EFFECT_KINDS');
  });

  it('makes missing or retired persisted rows inert without deleting them', () => {
    const modifiers = between('function activePlayerModifiers(', 'function rogueUpgradeMagnitude(');
    expect(modifiers).toContain('runtimeEffectDefinition(registry, effectKind)');
    const cleanup = between('if (oneHertzMaintenanceTick) {', 'for (const invite of');
    expect(cleanup).toMatch(/runtimeEffectDefinition\(expiryRegistry, effect\.effectKind\) === null\) continue;[\s\S]*player_effect\.id\.delete/u);
    const own = between('export const ownEffects =', 'export const ownRogueRun =');
    expect(own).not.toContain('player_effect.id.delete');
  });

  it('uses generic effect/statistic preflight and rejects bootstrap ID branches', () => {
    const writer = between('function worldBehaviourEffectWriter(', 'function applyWorldBehaviourEffects(');
    expect(writer).toContain("authoredReferenceSlug(effect.applyEffect.effectId, 'effect')");
    expect(writer).toContain('stacks > definition.maxStacks');
    expect(writer).toContain("authoredReferenceSlug(payload.kind, 'statistic')");
    expect(writer).toContain('definition.reserved === true');
    expect(writer).toContain('statisticSubjectIsValidForDefinition(definition, payload.subject)');
    for (const branch of [
      "effect.applyEffect.effectId === 'hunger'",
      "effect.applyEffect.effectId === 'repair_selected'",
      "applied.effectId === 'fruitful_energy'",
      "applied.effectId === 'orchard_tea'",
    ]) expect(writer).not.toContain(branch);
  });

  it('validates admin playtest effects against the active revision', () => {
    const playtest = between('function loadAdminPlaytestState(', 'function writeAdminPlaytestAction(');
    expect(playtest).toContain('registry.effects.get(mutation.definitionId)');
    expect(playtest).toContain('definition.retired === true');
    expect(playtest).toContain('runtimeEffectDefinition(registry, effectKind) === null');
    expect(playtest).not.toContain('EFFECT_KINDS');
  });
});
