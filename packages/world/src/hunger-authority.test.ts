import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(start, startNeedle).toBeGreaterThanOrEqual(0);
  expect(end, endNeedle).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('authority hunger and Vigour coupling', () => {
  it('has no elapsed-time hunger settlement path', () => {
    expect(source).not.toContain('advancePlayerHunger');
    expect(source).not.toContain('advanceHunger');
    expect(source).not.toContain('HUNGER_PASSIVE');
  });

  it('charges only authority-approved Vigour expenditure', () => {
    const tools = sourceBetween('function spendToolVigour(', 'function requireUsableTool');
    expect(tools).toContain('spendPlayerHunger(');
    expect(tools).toContain('HUNGER_WEAPON_USE_CENTI : HUNGER_TOOL_USE_CENTI');

    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toMatch(/sprintCostCenti > 0[\s\S]*spendPlayerHunger\([\s\S]*hungerCostForSprintVigour\(sprintCostCenti\)/);
    expect(source.match(/spendPlayerHunger\(/g)).toHaveLength(3);
  });

  it('derives hunger penalties from the shared simulation rules', () => {
    const modifiers = sourceBetween('function activePlayerModifiers(', 'function spendPlayerHunger(');
    expect(modifiers).toContain('modifiersForHunger(hunger)');
    expect(modifiers).not.toContain("value: -5_000");
  });
});
