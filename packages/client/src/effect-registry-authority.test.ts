import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('live effect registry client authority', () => {
  it('resolves modifier definitions from the subscribed content revision', () => {
    const modifiers = between('function snapshotEffectModifiers(', 'function snapshotPlayerModifiers(');
    expect(modifiers).toContain('modifiersForEffects([...snapshot.effects], authorityTick');
    expect(modifiers).toContain('runtimeEffectDefinition(snapshot.content.registry, effectKind)');
    expect(modifiers).not.toContain('EFFECT_DEFINITIONS');
    expect(modifiers).not.toContain('EFFECT_KINDS');
  });

  it('hides persisted missing or retired effects without rewriting their rows', () => {
    const visible = between('const visibleEffects = [...snapshot.effects]', 'const quests = questLogEntries(snapshot);');
    expect(visible).toContain('runtimeEffectDefinition(snapshot.content.registry, effect.effectKind) !== null');
    expect(visible).toContain('name: definition.name');
    expect(visible).toContain('durationTicks: definition.durationTicks');
    expect(visible).not.toContain('EFFECT_DEFINITIONS');
    expect(source).not.toContain('type EffectKind');
  });
});
