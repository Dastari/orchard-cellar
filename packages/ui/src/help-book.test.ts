import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { HELP_TOPICS, HelpBook } from './help-book.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiElement } from './kit/runtime/element.js';
import { UI_HELP_BOOK_SOURCE, UI_HELP_CHAPTERS } from './kit/components/help-book.js';
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
function node(guide: HelpBook, id: string): UiElement { guide.root.arrange(); return guide.root.entries().find(entry => entry.element.id === id)!.element; }
function press(guide: HelpBook, id: string) { const target = node(guide, id); expect(target.disabled).toBe(false); guide.root.focus.set(target); guide.root.key({ key: 'Enter' }); }
const topics = UI_HELP_CHAPTERS.flatMap(chapter => chapter.topics.map(topic => ({ chapter: chapter.id, topic: topic.id })));
const topicRow = (id: string) => `game.help.topic.${id}`;

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

  it('places every unchanged topic in exactly one chapter of its own book', () => {
    const { guide } = fixture(); expect(guide.root.scale).toBe(1);
    expect(node(guide, 'game.help').label).toBe('ORCHARD GUIDE');
    expect(topics).toHaveLength(HELP_TOPICS.length); expect(new Set(topics.map(entry => entry.topic)).size).toBe(HELP_TOPICS.length);
    for (const topic of HELP_TOPICS) { expect(UI_HELP_BOOK_SOURCE.toUpperCase()).toContain(topic.title); for (const entry of topic.entries) expect(UI_HELP_BOOK_SOURCE).toContain(entry); }
    for (const chapter of UI_HELP_CHAPTERS) expect(node(guide, `book.tab.${chapter.id}`).kind).toBe('tab');
    // The guide is not the player's book: none of its chapter tabs appear.
    expect(guide.root.entries().some(entry => entry.element.id === 'book.tab.quests')).toBe(false);
    expect(guide.chapter).toBe('basics'); expect(guide.topic).toBe('movement');
    expect(guide.root.focus.current?.id).toBe(topicRow('movement'));
    const body = guide.root.entries().filter(entry => entry.element.kind === 'text' && entry.element.isDescendantOf(node(guide, 'game.help.page'))).map(entry => entry.element.label);
    expect(body).toEqual(HELP_TOPICS[0]!.entries);
  });

  it('turns topics across chapters, preserves root/focus across resize, and reset/navigation clamp correctly', () => {
    const { guide } = fixture(), root = guide.root;
    root.key({ key: 'e' }); expect(guide.topic).toBe(topics[1]!.topic);
    root.key({ key: 'q' }); expect(guide.topic).toBe(topics[0]!.topic);
    root.key({ key: 'ArrowDown' }); root.arrange(); expect(guide.topic).toBe(topics[1]!.topic); expect(root.focus.current?.id).toBe(topicRow(topics[1]!.topic));
    guide.setBounds({ x: 8, y: 8, width: 544, height: 344 }, 560, 360);
    expect(guide.root).toBe(root); expect(root.focus.current?.id).toBe(topicRow(topics[1]!.topic)); expect(guide.topic).toBe(topics[1]!.topic);
    root.key({ key: 'End' }); root.arrange(); expect(guide.topic).toBe(topics.at(-1)!.topic); expect(guide.chapter).toBe(topics.at(-1)!.chapter);
    expect(root.focus.current?.id).toBe(topicRow(topics.at(-1)!.topic));
    root.key({ key: 'ArrowRight' }); expect(guide.topic).toBe(topics.at(-1)!.topic);
    const lastOfFirst = UI_HELP_CHAPTERS[0]!.topics.at(-1)!.id;
    guide.reset(); root.arrange(); expect(guide.topic).toBe(topics[0]!.topic);
    root.key({ key: 'ArrowLeft' }); expect(guide.topic).toBe(topics[0]!.topic);
    for (let index = 1; index < UI_HELP_CHAPTERS[0]!.topics.length; index++) root.key({ key: 'e' });
    expect(guide.topic).toBe(lastOfFirst); root.key({ key: 'e' }); expect(guide.chapter).toBe(UI_HELP_CHAPTERS[1]!.id);
  });

  it('activates topics and chapter tabs on release, cancels abandoned presses and keeps keyboard focus on the new tab', () => {
    const { guide } = fixture(), root = guide.root, target = UI_HELP_CHAPTERS[0]!.topics[2]!;
    const row = node(guide, topicRow(target.id)), point = { x: row.clip.x + row.clip.width / 2, y: row.clip.y + row.clip.height / 2 };
    root.pointer({ type: 'down', point, pointerId: 1, button: 0 }); expect(guide.topic).toBe('movement');
    root.pointer({ type: 'cancel', point, pointerId: 1, button: 0 }); expect(guide.topic).toBe('movement');
    root.pointer({ type: 'down', point, pointerId: 2, button: 0 }); root.pointer({ type: 'up', point, pointerId: 2, button: 0 });
    expect(guide.topic).toBe(target.id); expect(node(guide, topicRow(target.id))).toBe(row);
    const world = UI_HELP_CHAPTERS.at(-1)!;
    press(guide, `book.tab.${world.id}`); root.arrange();
    expect(guide.chapter).toBe(world.id); expect(guide.topic).toBe(world.topics[0]!.id); expect(root.focus.current?.id).toBe(`book.tab.${world.id}`);
    guide.setBounds({ x: 4, y: 4, width: 312, height: 232 }, 320, 240);
    expect(root.focus.current?.id).toBe(`book.tab.${world.id}`);
  });

  it('opens page links on their topic, forwards every link and delegates close without a second input path', () => {
    const { guide, close } = fixture(), root = guide.root;
    root.key({ key: 'x' }); expect(close).toHaveBeenCalledOnce();
    root.key({ key: 'Escape' }); expect(close).toHaveBeenCalledTimes(2);
    const x = root.entries().find(entry => entry.element.kind === 'button' && entry.element.label === 'Close book')!.element;
    root.focus.set(x); root.key({ key: 'q' }); expect(guide.topic).toBe('movement'); root.focus.set(x);
    root.key({ key: 'Enter' }); expect(close).toHaveBeenCalledTimes(3);
    root.key({ key: 'End' }); guide.reset(); guide.focus(); expect(guide.topic).toBe('movement'); expect(root.focus.current?.id).toBe(topicRow('movement'));
    guide.dispose(); expect(guide.root.disposed).toBe(true);
  });

  it('keeps topics, tabs and close reachable in a short viewport and scrolls long pages', () => {
    const { guide } = fixture(320, 180), root = guide.root;
    for (const id of [topicRow('movement'), 'book.tab.basics', 'game.help.page']) { const target = node(guide, id); expect(target.clip).toEqual(target.rect); expect(target.rect.y + target.rect.height).toBeLessThanOrEqual(180); }
    const close = root.entries().find(entry => entry.element.label === 'Close book')!.element; expect(close.clip).toEqual(close.rect);
    root.key({ key: 'End' }); root.arrange(); const page = node(guide, 'game.help.page');
    expect(page.scroll.maxY).toBeGreaterThan(0);
    root.key({ key: 'PageDown' }); root.arrange(); expect(page.scroll.y).toBeGreaterThan(0);
    root.key({ key: 'PageUp' }); root.arrange(); expect(page.scroll.y).toBe(0);
  });

  it('calibrates actual atlas tracking against the explicit special-heading font', () => {
    const root = new UiRoot({ art, scale: 1 }); root.resize(200, 40); root.mount(uiText('Reading heading', { role: 'special-heading' }));
    glyphs = []; root.drawInContext(canvas(200, 40).getContext('2d') as unknown as CanvasRenderingContext2D);
    expect(new Set(glyphs)).toEqual(new Set(['font_8x12'])); root.dispose();
  });

  it.each(['first', 'middle', 'last'] as const)('draws %s topics at compact/wide scales 1/2/3 and fractional DPR in the book fonts', state => {
    for (const width of [320, 640]) for (const scale of [1, 2, 3]) for (const dpr of [1, 1.25]) {
      const height = width === 320 ? 240 : 400;
      const { guide } = fixture(width, height);
      if (state === 'middle') for (let index = 0; index < 6; index++) guide.root.key({ key: 'e' });
      if (state === 'last') guide.root.key({ key: 'End' });
      const image = canvas(Math.round(width * scale * dpr), Math.round(height * scale * dpr)), ctx = image.getContext('2d'); ctx.scale(scale * dpr, scale * dpr);
      glyphs = []; guide.draw(ctx as unknown as CanvasRenderingContext2D);
      // Only page headings use the reading font; rows and body text keep the 5x7 font.
      expect(glyphs).toContain('font_5x7'); expect(glyphs).toContain('font_8x12'); expect(new Set(glyphs).size).toBe(2);
      const row = node(guide, topicRow(guide.topic)); expect(row.clip).toEqual(row.rect);
      expect(guide.root.scale).toBe(1);
      const directory = process.env['ORCHARD_QUEST_HELP_EVIDENCE']; if (directory && dpr === 1.25) { mkdirSync(directory, { recursive: true }); writeFileSync(`${directory}/help-${state}-${width}-scale${scale}.png`, image.toBuffer('image/png')); }
    }
  });
});
