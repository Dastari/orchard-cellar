import { describe, expect, it } from 'vitest';
import { catalogueMarkdown } from './catalogue-md.js';
import type { IconLibrary } from './icons.js';

describe('gear catalogue markdown', () => {
  it('never writes an empty table cell (the wiki drops them and shifts the row)', () => {
    const library = { rows: () => 1 } as unknown as IconLibrary;
    const rows = catalogueMarkdown(library, []).split('\n').filter((line) => line.startsWith('|'));
    expect(rows.length).toBeGreaterThan(0);
    const empty = rows.filter((line) => line.slice(1, -1).split('|').some((value) => value.trim() === ''));
    expect(empty).toEqual([]);
  });
});
