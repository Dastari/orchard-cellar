import { describe, expect, it } from 'vitest';
import { UI_LAB_COVERAGE } from './ui-lab-catalog.js';

describe('UI lab coverage ledger', () => {
  it('keeps specimen ids unique and covers every reusable component family', () => {
    const ids = UI_LAB_COVERAGE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(UI_LAB_COVERAGE.map((entry) => entry.group))).toEqual(new Set([
      'foundation', 'frame', 'control', 'inventory', 'feedback', 'pattern', 'book',
    ]));
    expect(UI_LAB_COVERAGE.filter((entry) => entry.interactive).length).toBeGreaterThanOrEqual(21);
  });
});
