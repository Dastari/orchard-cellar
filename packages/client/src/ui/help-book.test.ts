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
      const seam = layout.book.x + layout.book.width / 2;
      expect(seam - (layout.leftPage.x + layout.leftPage.width)).toBeGreaterThanOrEqual(8);
      expect(layout.rightPage.x - seam).toBeGreaterThanOrEqual(8);
    }
  });

  it('paginates every implemented control and rule without overflowing a page', () => {
    const pages = paginateHelp(28, 14);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every((page) => page.length <= 14)).toBe(true);
    const headings = pages.flat().filter((line) => line.heading).map((line) => line.text);
    expect(headings).toEqual(HELP_TOPICS.map((topic) => topic.title));
  });

  it('documents every current top-level key and the homestead deed workflow', () => {
    const help = HELP_TOPICS.flatMap((topic) => topic.entries).join(' ');
    for (const key of ['1-0', 'Shift', 'E:', 'F:', 'Q:', 'Space:', 'I:', 'C:', 'L:', 'N:', 'Z:', 'F3:', 'G:', 'H:']) {
      expect(help).toContain(key);
    }
    expect(help).toContain('homestead deed');
    expect(help).toContain('press F');
    expect(help).toContain('anvil');
    expect(help).toContain('5 copper coins');
    expect(help).not.toContain('C / V');
  });
});
