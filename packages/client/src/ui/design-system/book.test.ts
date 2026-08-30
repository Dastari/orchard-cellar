import { describe, expect, it } from 'vitest';
import type { PixelUi } from '../../render/pixel-ui.js';
import { parseGameMarkdown } from './game-markdown.js';
import {
  gameBookSpreadForPage,
  gameBookSpreadPageIndices,
  layoutGameBook,
  uiScaledBookPageRects,
} from './book.js';
import { uiFrameControlLayout } from './frame.js';

const fonts = {} as PixelUi;
const naturalBook = { x: 10, y: 20, width: 224, height: 133 };

describe('Markdown book layout', () => {
  it('scales authored page faces while retaining asymmetric spine padding', () => {
    expect(uiScaledBookPageRects(naturalBook)).toEqual([
      { x: 26, y: 36, width: 80, height: 101 },
      { x: 138, y: 36, width: 80, height: 101 },
    ]);
    const layout = layoutGameBook(fonts, parseGameMarkdown('A page.'), naturalBook);
    expect(layout.pageContentRects[0].x + layout.pageContentRects[0].width)
      .toBeLessThan(layout.pageRects[0].x + layout.pageRects[0].width);
    expect(layout.pageContentRects[1].x).toBeGreaterThan(layout.pageRects[1].x);
    const close = uiFrameControlLayout(naturalBook, 'book', false).close;
    expect(layout.pageContentRects[0].y).toBeGreaterThanOrEqual(close.y + close.height + 4);
    expect(layout.pageContentRects[1].y).toBe(layout.pageContentRects[0].y);
  });

  it('automatically overflows long Markdown across numbered pages', () => {
    const source = Array.from({ length: 28 }, (_, index) => `Paragraph ${index + 1} has enough words to wrap.`).join('\n\n');
    const layout = layoutGameBook(fonts, parseGameMarkdown(source), naturalBook);
    expect(layout.pageCount).toBeGreaterThan(2);
    expect(layout.pages.map((page) => page.number)).toEqual(
      Array.from({ length: layout.pageCount }, (_, index) => index + 1),
    );
    expect(layout.blockPages.size).toBe(28);
  });

  it('places following content on an explicitly authored one-based page', () => {
    const document = parseGameMarkdown('Page one.\n\n<!-- page: 5 -->\n\n# Fifth Page {#fifth}\nPlaced here.');
    const layout = layoutGameBook(fonts, document, naturalBook);
    expect(layout.pageCount).toBe(5);
    expect(layout.anchorPages.get('fifth')).toBe(4);
    expect(layout.pages.slice(1, 4).every((page) => page.entries.length === 0)).toBe(true);
  });

  it('keeps an explicit page-one directive on an otherwise empty first page', () => {
    const layout = layoutGameBook(fonts, parseGameMarkdown(
      '<!-- page: 1 -->\n# Opening {#opening}\nStarts on page one.',
    ), naturalBook);
    expect(layout.anchorPages.get('opening')).toBe(0);
    expect(layout.pages[0]?.entries.length).toBeGreaterThan(0);
  });

  it('opens page one on the right and pairs later even/odd pages', () => {
    expect(gameBookSpreadPageIndices(0, 5)).toEqual([null, 0]);
    expect(gameBookSpreadPageIndices(1, 5)).toEqual([1, 2]);
    expect(gameBookSpreadPageIndices(2, 5)).toEqual([3, 4]);
    expect([0, 1, 2, 3, 4].map(gameBookSpreadForPage)).toEqual([0, 1, 1, 2, 2]);
  });

  it('resolves colored bookmark targets to heading or following-block pages', () => {
    const document = parseGameMarkdown([
      '<!-- bookmark: start | Start | gold | left | intro -->',
      '# Intro {#intro}',
      'Opening.',
      '<!-- page: 4 -->',
      '<!-- bookmark: recipes | Recipes | green | right -->',
      '# Recipes',
      'Details.',
    ].join('\n'));
    const layout = layoutGameBook(fonts, document, naturalBook);
    expect(layout.bookmarks.map((bookmark) => ({
      id: bookmark.id, pageIndex: bookmark.pageIndex, spreadIndex: bookmark.spreadIndex,
    }))).toEqual([
      { id: 'start', pageIndex: 0, spreadIndex: 0 },
      { id: 'recipes', pageIndex: 3, spreadIndex: 2 },
    ]);
  });
});
