import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { QuestLog, type QuestLogEntry } from './quest-log.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiElement } from './kit/runtime/element.js';

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
const logs: QuestLog[] = [];
afterEach(() => logs.splice(0).forEach(log => log.dispose()));
const quests: QuestLogEntry[] = Array.from({ length: 30 }, (_, index) => ({ id: `quest${index}`, title: `A long quest title ${index}`, summary: 'Find the important book and return it safely. '.repeat(30),
  state: index === 29 ? 'complete' : 'active', pinned: false, objectives: [{ label: 'Collect the important book', complete: false, progress: '0/1' }], rewards: ['1 GOLD', '100 EXPLORER XP', 'Fruit', 'Seeds'] }));
function fixture(entries = quests, width = 640, height = 400) {
  const setPinned = vi.fn(), drop = vi.fn(), close = vi.fn(), navigate = vi.fn(), log = new QuestLog(art, { setPinned, drop }, close, navigate); logs.push(log);
  log.update(entries); log.setBounds({ x: 4, y: 4, width: width - 8, height: height - 8 }, width, height); log.focus();
  return { log, setPinned, drop, close, navigate };
}
function node(log: QuestLog, id: string): UiElement { log.root.arrange(); return log.root.entries().find(entry => entry.element.id === id)!.element; }
function press(log: QuestLog, id: string) { const element = node(log, id); expect(element.disabled).toBe(false); log.root.focus.set(element); log.root.key({ key: 'Enter' }); }
function point(element: UiElement) { return { x: element.clip.x + element.clip.width / 2, y: element.clip.y + element.clip.height / 2 }; }
function click(log: QuestLog, element: UiElement, pointerId = 1) { const p = point(element); log.root.pointer({ type: 'down', point: p, pointerId, button: 0 }); log.root.pointer({ type: 'up', point: p, pointerId, button: 0 }); }
const row = (id: string) => `quests.row.${id}`;

describe('production quest log retained adapter (Quests chapter of the player book)', () => {
  it('uses the shared book composition and keeps list, focus, selection and scroll through authority updates/resizing', () => {
    const { log } = fixture(); const root = log.root;
    expect(root.scale).toBe(1); expect(node(log, 'game.quests').label).toBe('Quests');
    expect(node(log, 'quests.book').props['label']).toBe('Quests');
    for (const chapter of ['character', 'skills', 'quests', 'statistics']) expect(node(log, `book.tab.${chapter}`).kind).toBe('tab');
    const labels = root.entries().map(entry => entry.element.label);
    expect(labels).toContain('ACTIVE'); expect(labels).toContain('COMPLETED');
    expect(log.selectedQuest).toBe('quest0'); expect(root.focus.current?.id).toBe(row('quest0'));
    expect(log.select('missing')).toBe(false); expect(log.select('quest28')).toBe(true); log.focus();
    const list = node(log, 'quests.list'); expect(list.scroll.y).toBeGreaterThan(0);
    expect(list.props['selected']).toEqual(['quest28']); expect(root.focus.current?.id).toBe(row('quest28'));
    const visibleRows = root.entries().filter(entry => entry.element.kind === 'page-row' && entry.element.clip.height > 0);
    expect(visibleRows.length).toBeGreaterThanOrEqual(Math.floor(list.contentRect.height / 18));
    const offset = list.scroll.y, focused = root.focus.current;
    log.update(quests.map(quest => ({ ...quest, pinned: true })));
    log.setBounds({ x: 4, y: 4, width: 552, height: 352 }, 560, 360);
    expect(log.root).toBe(root); expect(node(log, 'quests.list')).toBe(list); expect(root.focus.current).toBe(focused);
    expect(log.selectedQuest).toBe('quest28'); expect(list.scroll.y).toBeGreaterThanOrEqual(offset);
    root.key({ key: 'ArrowUp' }); expect(log.selectedQuest).toBe('quest27'); expect(list.props['selected']).toEqual(['quest27']);
    root.arrange(); expect(root.focus.current?.id).toBe(row('quest27'));
    root.key({ key: 'ArrowDown' }); root.key({ key: 'ArrowDown' }); expect(log.selectedQuest).toBe('quest29');
    root.key({ key: 'Home' }); expect(log.selectedQuest).toBe('quest0');
    root.key({ key: 'End' }); expect(log.selectedQuest).toBe('quest29');
  });

  it('lists active quests with objective progress and completed quests after them', () => {
    const entries: QuestLogEntry[] = [
      { ...quests[0]!, id: 'done', state: 'complete', title: 'First Harvest' },
      { ...quests[0]!, id: 'cellar', title: 'From Orchard to Cellar', giver: 'Marlow', objectives: [{ label: 'Press', complete: true, progress: '3/3' }, { label: 'Age', complete: false, progress: '0/1' }, { label: 'Sell', complete: false }] },
    ];
    const { log } = fixture(entries);
    expect(log.selectedQuest).toBe('cellar');
    const rows = log.root.entries().map(entry => entry.element).filter(element => element.kind === 'page-row');
    expect(rows.map(element => element.id)).toEqual([row('cellar'), row('done')]);
    expect(log.root.entries().some(entry => entry.element.kind === 'page-heading' && entry.element.label === 'From Orchard to Cellar')).toBe(true);
    expect(log.root.entries().filter(entry => entry.element.kind === 'objective').map(entry => entry.element.label)).toEqual(['Press 3/3', 'Age 0/1', 'Sell']);
    click(log, node(log, row('done'))); expect(log.selectedQuest).toBe('done');
    expect(log.root.entries().some(entry => entry.element.label === 'READY TO TURN IN')).toBe(true);
  });

  it('sends pin/abandon once on release or keyboard, using latest authoritative pinned state', () => {
    const { log, setPinned, drop } = fixture(); log.select('quest29'); log.root.arrange();
    expect(node(log, 'quests.pin').props['label']).toBe('Pin');
    const p = point(node(log, 'quests.pin'));
    log.root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 }); expect(setPinned).not.toHaveBeenCalled();
    log.root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 }); expect(setPinned).toHaveBeenCalledExactlyOnceWith('quest29', true);
    log.update(quests.map(quest => ({ ...quest, pinned: true })));
    expect(node(log, 'quests.pin').props['label']).toBe('Unpin');
    press(log, 'quests.pin'); expect(setPinned).toHaveBeenLastCalledWith('quest29', false);
    press(log, 'quests.drop'); expect(drop).toHaveBeenCalledExactlyOnceWith('quest29');
  });

  it('retires captured actions when their quest disappears, handles empty data and cancellation', () => {
    const { log, drop } = fixture(); const p = point(node(log, 'quests.drop'));
    log.root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 });
    log.update(quests.slice(1)); log.root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 }); expect(drop).not.toHaveBeenCalled();
    expect(log.selectedQuest).toBe('quest1');
    const next = point(node(log, 'quests.drop'));
    log.root.pointer({ type: 'down', point: next, pointerId: 2, button: 0 }); log.root.pointer({ type: 'cancel', point: next, pointerId: 2, button: 0 });
    expect(drop).not.toHaveBeenCalled(); log.update([]); log.root.arrange(); expect(log.selectedQuest).toBeNull();
    expect(node(log, 'quests.drop').disabled).toBe(true); expect(node(log, 'quests.pin').disabled).toBe(true);
    expect(log.root.entries().some(entry => entry.element.label === 'No active quests')).toBe(true);
  });

  it('never lets a captured row release select a different quest after an authoritative reorder, and accepts a fresh gesture', () => {
    const { log, setPinned, drop } = fixture(quests.slice(0, 3));
    const pressed = node(log, row('quest1')), p = point(pressed);
    expect(log.root.pointer({ type: 'down', point: p, pointerId: 7, button: 0 })).toBe(true);
    log.update([quests[0]!, quests[2]!, quests[1]!]); log.root.arrange();
    // Rows are retained per quest: the pressed row now sits lower, so the release lands outside it.
    expect(node(log, row('quest1'))).toBe(pressed); expect(pressed.clip.y).toBeGreaterThan(p.y);
    expect(log.root.pointer({ type: 'up', point: p, pointerId: 7, button: 0 })).toBe(true);
    expect(log.selectedQuest).toBe('quest0'); expect(setPinned).not.toHaveBeenCalled(); expect(drop).not.toHaveBeenCalled();
    log.root.pointer({ type: 'down', point: p, pointerId: 7, button: 0 });
    log.root.pointer({ type: 'up', point: p, pointerId: 7, button: 0 });
    expect(log.selectedQuest).toBe('quest2'); press(log, 'quests.pin');
    expect(setPinned).toHaveBeenCalledExactlyOnceWith('quest2', true);
  });

  it('keeps detail scroll across progress updates and resets it for a deep link', () => {
    const { log } = fixture(); const details = node(log, 'quests.details'); scrollUiElement(details, 0, 60); log.root.arrange();
    expect(details.scroll.y).toBeGreaterThan(0);
    log.update(quests.map(quest => ({ ...quest, objectives: [{ label: 'Collect the important book', complete: true, progress: '1/1' }] })));
    log.root.arrange(); expect(details.scroll.y).toBeGreaterThan(0);
    log.select('quest1'); log.root.arrange(); expect(details.scroll.y).toBe(0);
  });

  it('keeps quest actions reachable in a short 320 by 180 viewport', () => {
    const { log } = fixture(quests, 320, 180);
    for (const id of ['quests.list', row('quest0'), 'quests.pin', 'quests.drop']) {
      const action = node(log, id); expect(action.clip).toEqual(action.rect); expect(action.clip.height).toBeGreaterThan(0);
      expect(action.rect.y + action.rect.height).toBeLessThanOrEqual(180); expect(action.rect.x + action.rect.width).toBeLessThanOrEqual(320);
    }
  });

  it('centres the book in host-owned bounds, ignores edge drags and keeps actions reachable across viewport resizing', () => {
    const { log, setPinned, drop } = fixture(quests, 320, 180);
    const check = (bounds: { x: number; y: number; width: number; height: number }, viewport: { width: number; height: number }) => {
      const book = node(log, 'game.quests').rect;
      expect(book.x).toBeGreaterThanOrEqual(0); expect(book.y).toBeGreaterThanOrEqual(0);
      expect(book.x + book.width).toBeLessThanOrEqual(viewport.width); expect(book.y + book.height).toBeLessThanOrEqual(viewport.height);
      if (book.width <= bounds.width) expect(Math.abs(book.x + book.width / 2 - (bounds.x + bounds.width / 2))).toBeLessThanOrEqual(1);
      if (book.height <= bounds.height) expect(Math.abs(book.y + book.height / 2 - (bounds.y + bounds.height / 2))).toBeLessThanOrEqual(1);
      for (const id of ['quests.list', 'quests.pin', 'quests.drop']) {
        const control = node(log, id);
        expect(control.clip).toEqual(control.rect); expect(control.clip.height).toBeGreaterThan(0);
        expect(control.rect.y + control.rect.height).toBeLessThanOrEqual(book.y + book.height);
        expect(control.rect.x + control.rect.width).toBeLessThanOrEqual(book.x + book.width);
      }
      return book;
    };
    const compact = { x: 4, y: 4, width: 312, height: 172 };
    const before = check(compact, { width: 320, height: 180 });
    for (const [pointerId, point] of [{ x: 308, y: 168 }, { x: 12, y: 168 }, { x: 160, y: 174 }].entries()) {
      log.root.pointer({ type: 'down', point, pointerId, button: 0 });
      log.root.pointer({ type: 'move', point: { x: point.x + 40, y: point.y + 40 }, pointerId, button: 0 });
      log.root.pointer({ type: 'up', point: { x: point.x + 40, y: point.y + 40 }, pointerId, button: 0 });
      expect(check(compact, { width: 320, height: 180 })).toEqual(before);
    }
    expect(setPinned).not.toHaveBeenCalled(); expect(drop).not.toHaveBeenCalled();
    const wide = { x: 200, y: 100, width: 400, height: 400 };
    log.setBounds(wide, 800, 600); expect(check(wide, { width: 800, height: 600 }).width).toBe(456);
    log.setBounds(compact, 320, 180); expect(check(compact, { width: 320, height: 180 })).toEqual(before);
    const action = point(node(log, 'quests.pin'));
    log.root.pointer({ type: 'down', point: action, pointerId: 10, button: 0 });
    log.root.pointer({ type: 'up', point: action, pointerId: 10, button: 0 });
    expect(setPinned).toHaveBeenCalledExactlyOnceWith('quest0', true);
  });

  it('returns close and chapter navigation to the host and reopens/focuses the same root', () => {
    const { log, close, navigate } = fixture(); const root = log.root;
    const x = root.entries().find(entry => entry.element.kind === 'button' && entry.element.label === 'Close book')!.element;
    root.focus.set(x); root.key({ key: 'Enter' }); expect(close).toHaveBeenCalledOnce();
    root.key({ key: 'Escape' }); expect(close).toHaveBeenCalledTimes(2);
    press(log, 'book.tab.quests'); expect(navigate).not.toHaveBeenCalled();
    press(log, 'book.tab.character'); expect(navigate).toHaveBeenCalledExactlyOnceWith('character');
    click(log, node(log, 'book.tab.skills'), 3); expect(navigate).toHaveBeenLastCalledWith('skills');
    log.focus(); expect(log.root).toBe(root); expect(root.focus.current?.id).toBe(row('quest0'));
    log.dispose(); expect(root.disposed).toBe(true);
  });

  it('orders keyboard focus: chapter tabs, close, quest rows, then the selected quest actions', () => {
    const { log } = fixture(quests.slice(0, 2)); const root = log.root; root.focus.set(null);
    const order: string[] = [];
    for (let index = 0; index < 9; index++) { root.key({ key: 'Tab' }); const current = root.focus.current!; order.push(current.kind === 'button' && current.label === 'Close book' ? 'close' : current.id); }
    expect(order).toEqual(['book.tab.character', 'book.tab.skills', 'book.tab.quests', 'book.tab.statistics', 'close', row('quest0'), row('quest1'), 'quests.pin', 'quests.drop']);
  });

  it.each(['active', 'complete', 'empty'] as const)('draws %s real-art state at compact/wide scales 1/2/3 and fractional DPR in the book fonts', state => {
    for (const width of [320, 640]) for (const scale of [1, 2, 3]) for (const dpr of [1, 1.25]) {
      const height = width === 320 ? 240 : 400;
      const { log } = fixture(state === 'empty' ? [] : quests, width, height);
      if (state === 'complete') log.select('quest29');
      const image = canvas(Math.round(width * scale * dpr), Math.round(height * scale * dpr)), ctx = image.getContext('2d'); ctx.scale(scale * dpr, scale * dpr);
      glyphs = []; log.draw(ctx as unknown as CanvasRenderingContext2D);
      // Page headings use the reading font; everything else keeps the 5x7 body font.
      expect(glyphs).toContain('font_5x7'); expect(glyphs).toContain('font_8x12'); expect(new Set(glyphs).size).toBe(2);
      for (const id of ['quests.pin', 'quests.drop']) { const action = node(log, id); expect(action.clip.height).toBe(action.rect.height); expect(action.clip.width).toBe(action.rect.width); }
      expect(log.root.scale).toBe(1);
      const directory = process.env['ORCHARD_QUEST_HELP_EVIDENCE']; if (directory && dpr === 1.25) { mkdirSync(directory, { recursive: true }); writeFileSync(`${directory}/quests-${state}-${width}-scale${scale}.png`, image.toBuffer('image/png')); }
    }
  });
});
