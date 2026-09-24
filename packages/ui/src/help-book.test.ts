import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { HELP_TOPICS, HelpBook } from './help-book.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiElement } from './kit/runtime/element.js';
import { parseGameMarkdown } from './design-system/game-markdown.js';
import { UI_HELP_BOOK_SOURCE } from './kit/components/help-book.js';
import { uiText } from './kit/components/text.js';
import { UiRoot } from './kit/runtime/root.js';

let art: UiKitArt;
const fonts = new WeakMap<object, string>(); let glyphs: string[] = [];
function canvas(width: number, height: number) {
  const image = createCanvas(width, height), context = image.getContext('2d'), draw = context.drawImage.bind(context);
  context.drawImage = ((...args: Parameters<typeof context.drawImage>) => {
    const font = fonts.get(args[0]);
    if (font && args.length === 9) {
      if (args[3] === 5 && args[4] === 7 || args[3] === 8 && args[4] === 12) glyphs.push(font);
      else if (args[3] === args[0].width && args[4] === args[0].height) fonts.set(image, font);
    }
    return draw(...args);
  }) as typeof context.drawImage;
  return image;
}
beforeAll(async () => {
  art = await uiTestArt(); fonts.set(art.pixel.font.image, 'font_5x7'); fonts.set(art.pixel.headerFont.image, 'font_8x12');
  vi.stubGlobal('document', { createElement: () => canvas(1, 1) });
});
afterAll(() => vi.unstubAllGlobals());
const books: HelpBook[] = [];
afterEach(() => books.splice(0).forEach(book => book.dispose()));
function fixture(width = 640, height = 400) {
  const close = vi.fn(), link = vi.fn(), guide = new HelpBook(art, close, link); books.push(guide);
  guide.setBounds({ x: 4, y: 4, width: width - 8, height: height - 8 }, width, height); guide.focus();
  return { guide, close, link };
}
function node(guide: HelpBook, id = 'game.help.pages'): UiElement { guide.root.arrange(); return guide.root.entries().find(entry => entry.element.id === id)!.element; }
function press(guide: HelpBook, id: string) { const target = node(guide, id); expect(target.disabled).toBe(false); guide.root.focus.set(target); guide.root.key({ key: 'Enter' }); }

describe('production help book retained adapter', () => {
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

  it('uses every unchanged topic in the shared paginated book', () => {
    const { guide } = fixture(); expect(guide.root.scale).toBe(1);
    expect(node(guide, 'game.help').label).toBe('ORCHARD GUIDE');
    expect(parseGameMarkdown(UI_HELP_BOOK_SOURCE).blocks.filter(block => block.kind === 'heading')).toHaveLength(HELP_TOPICS.length);
    for (const topic of HELP_TOPICS) { expect(UI_HELP_BOOK_SOURCE).toContain(topic.title); for (const entry of topic.entries) expect(UI_HELP_BOOK_SOURCE).toContain(entry); }
    expect(Number(node(guide).props['pageCount'])).toBeGreaterThan(2);
  });

  it('preserves root/book/focus and current spread across resize, while reset and navigation clamp correctly', () => {
    const { guide } = fixture(), root = guide.root, book = node(guide);
    root.key({ key: 'e' }); root.arrange(); expect(book.props['spread']).toBe(1);
    root.key({ key: 'q' }); root.arrange(); expect(book.props['spread']).toBe(0);
    root.key({ key: 'PageDown' }); root.arrange(); expect(book.props['spread']).toBe(1);
    guide.setBounds({ x: 8, y: 8, width: 544, height: 344 }, 560, 360);
    expect(guide.root).toBe(root); expect(node(guide)).toBe(book); expect(root.focus.current).toBe(book); expect(book.props['spread']).toBe(1);
    root.key({ key: 'End' }); root.arrange(); expect(book.props['spread']).toBe(Number(book.props['spreadCount']) - 1);
    root.key({ key: 'ArrowRight' }); root.arrange(); expect(book.props['spread']).toBe(Number(book.props['spreadCount']) - 1);
    guide.reset(); root.arrange(); expect(book.props['spread']).toBe(0);
    root.key({ key: 'ArrowLeft' }); root.arrange(); expect(book.props['spread']).toBe(0);
  });

  it('activates navigation on release, cancels abandoned presses and keeps keyboard focus on recreated navigation', () => {
    const { guide } = fixture(), root = guide.root, book = node(guide), next = node(guide, 'game.help.pages:Next');
    const point = { x: next.clip.x + next.clip.width / 2, y: next.clip.y + next.clip.height / 2 };
    root.pointer({ type: 'down', point, pointerId: 1, button: 0 }); expect(book.props['spread']).toBe(0);
    root.pointer({ type: 'cancel', point, pointerId: 1, button: 0 }); expect(book.props['spread']).toBe(0);
    root.pointer({ type: 'down', point, pointerId: 2, button: 0 }); root.pointer({ type: 'up', point, pointerId: 2, button: 0 });
    root.arrange(); expect(book.props['spread']).toBe(1); expect(root.focus.current?.id).toBe('game.help.pages:Next');
    press(guide, 'game.help.pages:Next'); root.arrange(); expect(book.props['spread']).toBe(2);
    root.key({ key: 'q' }); root.arrange(); expect(book.props['spread']).toBe(1); expect(root.focus.current).toBe(book);
    root.key({ key: 'e' }); root.arrange(); expect(book.props['spread']).toBe(2);
    root.key({ key: 'q' }); root.arrange();
    press(guide, 'game.help.pages:Next'); root.arrange();
    guide.setBounds({ x: 4, y: 4, width: 312, height: 232 }, 320, 240);
    expect(root.focus.current?.id).toBe('game.help.pages:Next');
    root.key({ key: 'q' }); root.arrange(); expect(book.props['spread']).toBe(1);
  });

  it('forwards book links, resolves page links and delegates close without a second input path', () => {
    const { guide, link, close } = fixture(), book = node(guide);
    // A real authored-source fixture verifies the same uiBook link adapter without adding fake production links.
    book.setProps({ source: '[Website](https://example.com/) [Later](#later)\n\n' + 'A long paragraph. '.repeat(600) + '\n\n## Later\n\nLast page.' }); guide.root.arrange();
    const links = guide.root.entries().map(entry => entry.element).filter(element => element.kind === 'book-link');
    expect(links.length).toBeGreaterThanOrEqual(2);
    guide.root.focus.set(links[0]!); guide.root.key({ key: 'Enter' }); expect(link).toHaveBeenCalledExactlyOnceWith({ kind: 'url', href: 'https://example.com/' });
    guide.root.focus.set(links[1]!); guide.root.key({ key: 'Enter' }); guide.root.arrange(); expect(Number(book.props['spread'])).toBeGreaterThan(0);
    expect(link).toHaveBeenLastCalledWith({ kind: 'page', anchor: 'later' }); expect(guide.root.focus.current).toBe(book);
    guide.focus(); guide.root.key({ key: 'x' }); expect(close).toHaveBeenCalledOnce();
    const x = guide.root.entries().find(entry => entry.element.kind === 'button' && entry.element.label === 'X')!.element;
    guide.root.focus.set(x); guide.root.key({ key: 'q' }); guide.root.arrange(); expect(Number(book.props['spread'])).toBeGreaterThanOrEqual(0);
    expect(guide.root.focus.current).toBe(book); guide.root.focus.set(x);
    guide.root.key({ key: 'Enter' }); expect(close).toHaveBeenCalledTimes(2);
    guide.reset(); guide.focus(); expect(node(guide).props['spread']).toBe(0); expect(guide.root.focus.current).toBe(book);
    guide.dispose(); expect(guide.root.disposed).toBe(true);
  });

  it('keeps book navigation reachable in a short viewport and renders every chrome glyph in 5x7', () => {
    const { guide } = fixture(320, 180); const next = node(guide, 'game.help.pages:Next');
    guide.root.focus.set(next); guide.root.arrange(); expect(next.clip.height).toBe(next.rect.height); expect(next.clip.width).toBe(next.rect.width);
    const context = canvas(320, 180).getContext('2d') as unknown as CanvasRenderingContext2D;
    for (const entry of guide.root.entries()) {
      let page = false; for (let parent = entry.element.parent; parent; parent = parent.parent) page ||= parent.kind === 'book-page';
      if (page) continue;
      glyphs = []; entry.element.hooks.paint?.(entry.element, { context, art, now: 0, focused: false, hovered: false, reducedMotion: true });
      expect(glyphs.every(font => font === 'font_5x7'), entry.element.label).toBe(true);
    }
  });

  it('calibrates actual atlas tracking against the explicit special-heading font', () => {
    const root = new UiRoot({ art, scale: 1 }); root.resize(200, 40); root.mount(uiText('Reading heading', { role: 'special-heading' }));
    glyphs = []; root.drawInContext(canvas(200, 40).getContext('2d') as unknown as CanvasRenderingContext2D);
    expect(new Set(glyphs)).toEqual(new Set(['font_8x12'])); root.dispose();
  });

  it.each(['first', 'middle', 'last'] as const)('draws %s pages and 5x7 chrome at compact/wide scales 1/2/3 and fractional DPR', state => {
    for (const width of [320, 640]) for (const scale of [1, 2, 3]) for (const dpr of [1, 1.25]) {
      const height = width === 320 ? 240 : 400;
      const { guide } = fixture(width, height);
      if (state === 'middle') guide.root.key({ key: 'PageDown' });
      if (state === 'last') guide.root.key({ key: 'End' });
      const image = canvas(Math.round(width * scale * dpr), Math.round(height * scale * dpr)), ctx = image.getContext('2d'); ctx.scale(scale * dpr, scale * dpr);
      glyphs = []; guide.draw(ctx as unknown as CanvasRenderingContext2D);
      expect(glyphs).toContain('font_5x7'); expect(glyphs.every(font => font === 'font_5x7' || font === 'font_8x12')).toBe(true);
      // Only book page content has an explicit special-heading purpose; frame title and controls keep the default font.
      for (const entry of guide.root.entries()) if (entry.element.props['role'] === 'special-heading') expect(entry.element.isDescendantOf(node(guide))).toBe(true);
      const next = node(guide, 'game.help.pages:Next'); expect(next.clip.height).toBe(next.rect.height); expect(next.clip.width).toBe(next.rect.width);
      expect(guide.root.scale).toBe(1);
      const directory = process.env['ORCHARD_QUEST_HELP_EVIDENCE']; if (directory && dpr === 1.25) { mkdirSync(directory, { recursive: true }); writeFileSync(`${directory}/help-${state}-${width}-scale${scale}.png`, image.toBuffer('image/png')); }
    }
  });
});
