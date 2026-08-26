import { describe, expect, it } from 'vitest';
import { HELP_TOPICS, helpBookLayout, paginateHelp } from './help-book.js';

describe('help book', () => {
  it('fits the authored two-page frame inside wide and narrow viewports', () => {
    for (const [width, height] of [[480, 270], [360, 180]] as const) {
      const layout = helpBookLayout(width, height);
      expect(layout.book.x).toBeGreaterThanOrEqual(0);
      expect(layout.book.y).toBeGreaterThanOrEqual(0);
      expect(layout.book.x + layout.book.width).toBeLessThanOrEqual(width);
      expect(layout.book.y + layout.book.height).toBeLessThanOrEqual(height);
      expect(layout.leftPage.x + layout.leftPage.width).toBeLessThan(layout.rightPage.x);
    }
  });

  it('paginates every implemented control and rule without overflowing a page', () => {
    const pages = paginateHelp(28, 14);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every((page) => page.length <= 14)).toBe(true);
    const headings = pages.flat().filter((line) => line.heading).map((line) => line.text);
    expect(headings).toEqual(HELP_TOPICS.map((topic) => topic.title));
  });
});
