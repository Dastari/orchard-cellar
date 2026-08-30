import { describe, expect, it } from 'vitest';
import { UI_LAB_COVERAGE, UI_LAB_MIGRATION_SURFACES } from './ui-lab-catalog.js';

describe('UI lab coverage ledger', () => {
  it('keeps specimen ids unique and covers every reusable component family', () => {
    const ids = UI_LAB_COVERAGE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(UI_LAB_COVERAGE.map((entry) => entry.group))).toEqual(new Set([
      'foundation', 'frame', 'control', 'inventory', 'feedback', 'pattern', 'book', 'actor', 'migration',
    ]));
    expect(UI_LAB_COVERAGE.filter((entry) => entry.interactive).length).toBeGreaterThanOrEqual(21);
  });

  it('tracks every live migration candidate exactly once', () => {
    const ids = UI_LAB_MIGRATION_SURFACES.map((surface) => surface.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(UI_LAB_MIGRATION_SURFACES).toHaveLength(27);
    expect(new Set(UI_LAB_MIGRATION_SURFACES.map((surface) => surface.category))).toEqual(new Set([
      'gateway', 'world', 'storage', 'progression', 'social', 'menu',
    ]));
    expect(UI_LAB_MIGRATION_SURFACES.filter((surface) => surface.closable).length).toBeGreaterThanOrEqual(16);
    const sizeKeys = UI_LAB_MIGRATION_SURFACES.map(({ specimenSize }) => `${specimenSize.width}x${specimenSize.height}`);
    expect(new Set(sizeKeys).size).toBeGreaterThanOrEqual(18);
    expect(Math.min(...UI_LAB_MIGRATION_SURFACES.map(({ specimenSize }) => specimenSize.width))).toBeLessThanOrEqual(430);
    expect(Math.max(...UI_LAB_MIGRATION_SURFACES.map(({ specimenSize }) => specimenSize.width))).toBeGreaterThanOrEqual(980);
    expect(UI_LAB_MIGRATION_SURFACES.every(({ specimenSize }) => specimenSize.width > 0 && specimenSize.height > 0)).toBe(true);
  });
});
