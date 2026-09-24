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
  const setPinned = vi.fn(), drop = vi.fn(), close = vi.fn(), log = new QuestLog(art, { setPinned, drop }, close); logs.push(log);
  log.update(entries); log.setBounds({ x: 4, y: 4, width: width - 8, height: height - 8 }, width, height); log.focus();
  return { log, setPinned, drop, close };
}
function node(log: QuestLog, id: string): UiElement { log.root.arrange(); return log.root.entries().find(entry => entry.element.id === id)!.element; }
function press(log: QuestLog, id: string) { const element = node(log, id); expect(element.disabled).toBe(false); log.root.focus.set(element); log.root.key({ key: 'Enter' }); }
function point(element: UiElement) { return { x: element.clip.x + element.clip.width / 2, y: element.clip.y + element.clip.height / 2 }; }

describe('production quest log retained adapter', () => {
  it('uses real shared composition and keeps list, focus, selection and scroll through authority updates/resizing', () => {
    const { log } = fixture(); const root = log.root;
    expect(root.scale).toBe(1); expect(node(log, 'game.quests').label).toBe('QUEST LOG');
    expect(log.select('missing')).toBe(false); expect(log.select('quest29')).toBe(true); log.focus();
    const list = node(log, 'quests.list'); expect(list.scroll.y).toBeGreaterThan(0);
    const visibleRows = log.root.entries().filter(entry => entry.element.kind === 'list-row' && entry.element.clip.height > 0);
    expect(visibleRows.length).toBeGreaterThanOrEqual(Math.floor(list.contentRect.height / 28));
    const offset = list.scroll.y;
    log.update(quests.map(quest => ({ ...quest, pinned: true })));
    log.setBounds({ x: 4, y: 4, width: 552, height: 352 }, 560, 360);
    expect(log.root).toBe(root); expect(node(log, 'quests.list')).toBe(list); expect(root.focus.current).toBe(list);
    expect(log.selectedQuest).toBe('quest29'); expect(list.scroll.y).toBeGreaterThanOrEqual(offset);
    root.key({ key: 'ArrowUp' }); expect(log.selectedQuest).toBe('quest28'); expect(list.props['selected']).toEqual(['quest28']);
    root.key({ key: 'Tab' }); expect(list.props['selected']).toEqual(['quest28']); log.focus();
    root.key({ key: 'Home' }); expect(log.selectedQuest).toBe('quest0');
    root.key({ key: 'End' }); expect(log.selectedQuest).toBe('quest29');
  });

  it('sends pin/drop once on release or keyboard, using latest authoritative pinned state', () => {
    const { log, setPinned, drop } = fixture(); log.select('quest29'); log.root.arrange();
    const p = point(node(log, 'quests.pin'));
    log.root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 }); expect(setPinned).not.toHaveBeenCalled();
    log.root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 }); expect(setPinned).toHaveBeenCalledExactlyOnceWith('quest29', true);
    log.update(quests.map(quest => ({ ...quest, pinned: true })));
    press(log, 'quests.pin'); expect(setPinned).toHaveBeenLastCalledWith('quest29', false);
    press(log, 'quests.drop'); expect(drop).toHaveBeenCalledExactlyOnceWith('quest29');
  });

  it('retires captured actions when their quest disappears, handles empty data and cancellation', () => {
    const { log, drop } = fixture(); const p = point(node(log, 'quests.drop'));
    log.root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 });
    log.update(quests.slice(1)); log.root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 }); expect(drop).not.toHaveBeenCalled();
    const next = point(node(log, 'quests.drop'));
    log.root.pointer({ type: 'down', point: next, pointerId: 2, button: 0 }); log.root.pointer({ type: 'cancel', point: next, pointerId: 2, button: 0 });
    expect(drop).not.toHaveBeenCalled(); log.update([]); log.root.arrange(); expect(log.selectedQuest).toBeNull();
    expect(node(log, 'quests.drop').disabled).toBe(true); expect(node(log, 'quests.pin').disabled).toBe(true);
    expect(log.root.entries().some(entry => entry.element.label === 'NO ACTIVE QUESTS')).toBe(true);
  });

  it('consumes a captured row release after authoritative reorder and accepts a fresh gesture', () => {
    const { log, setPinned, drop } = fixture(quests.slice(0, 3));
    const row = log.root.entries().find(entry => entry.element.kind === 'list-row' && entry.element.label === 'quest1')!.element;
    const p = point(row);
    expect(log.root.pointer({ type: 'down', point: p, pointerId: 7, button: 0 })).toBe(true);
    log.update([quests[0]!, quests[2]!, quests[1]!]); log.root.arrange();
    expect(row.disposed).toBe(true);
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
    for (const id of ['quests.list', 'quests.pin', 'quests.drop']) { const action = node(log, id); expect(action.clip.height).toBe(action.rect.height); expect(action.clip.height).toBeGreaterThan(0); }
  });

  it('keeps host-owned bounds and reachable actions after compact edge drags and viewport resizing', () => {
    const { log, setPinned, drop } = fixture(quests, 320, 180);
    const compact = { x: 4, y: 4, width: 312, height: 172 };
    const check = (bounds: typeof compact) => {
      expect(node(log, 'game.quests').rect).toEqual(bounds);
      for (const id of ['quests.list', 'quests.pin', 'quests.drop']) {
        const control = node(log, id);
        expect(control.clip).toEqual(control.rect); expect(control.clip.height).toBeGreaterThan(0);
        expect(control.rect.y + control.rect.height).toBeLessThanOrEqual(bounds.y + bounds.height);
        expect(control.rect.x + control.rect.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      }
    };
    check(compact);
    for (const [pointerId, point] of [{ x: 308, y: 168 }, { x: 12, y: 168 }, { x: 308, y: 12 }, { x: 160, y: 174 }].entries()) {
      log.root.pointer({ type: 'down', point, pointerId, button: 0 });
      log.root.pointer({ type: 'move', point: { x: point.x + 40, y: point.y + 40 }, pointerId, button: 0 });
      log.root.pointer({ type: 'up', point: { x: point.x + 40, y: point.y + 40 }, pointerId, button: 0 });
      check(compact);
    }
    expect(setPinned).not.toHaveBeenCalled(); expect(drop).not.toHaveBeenCalled();
    const wide = { x: 4, y: 4, width: 792, height: 592 };
    log.setBounds(wide, 800, 600); check(wide);
    log.setBounds(compact, 320, 180); check(compact);
    const action = point(node(log, 'quests.pin'));
    log.root.pointer({ type: 'down', point: action, pointerId: 10, button: 0 });
    log.root.pointer({ type: 'up', point: action, pointerId: 10, button: 0 });
    expect(setPinned).toHaveBeenCalledExactlyOnceWith('quest0', true);
  });

  it('returns close to the host and reopens/focuses the same root', () => {
    const { log, close } = fixture(); const root = log.root;
    const x = root.entries().find(entry => entry.element.kind === 'button' && entry.element.label === 'X')!.element;
    root.focus.set(x); root.key({ key: 'Enter' }); expect(close).toHaveBeenCalledOnce();
    log.focus(); expect(log.root).toBe(root); expect(root.focus.current?.id).toBe('quests.list');
    log.dispose(); expect(root.disposed).toBe(true);
  });

  it.each(['active', 'complete', 'empty'] as const)('draws %s real-art state at compact/wide scales 1/2/3 and fractional DPR with 5x7 only', state => {
    for (const width of [320, 640]) for (const scale of [1, 2, 3]) for (const dpr of [1, 1.25]) {
      const height = width === 320 ? 240 : 400;
      const { log } = fixture(state === 'empty' ? [] : quests, width, height);
      if (state === 'complete') log.select('quest29');
      const image = canvas(Math.round(width * scale * dpr), Math.round(height * scale * dpr)), ctx = image.getContext('2d'); ctx.scale(scale * dpr, scale * dpr);
      glyphs = []; log.draw(ctx as unknown as CanvasRenderingContext2D); expect(new Set(glyphs)).toEqual(new Set(['font_5x7']));
      for (const id of ['quests.pin', 'quests.drop']) { const action = node(log, id); expect(action.clip.height).toBe(action.rect.height); expect(action.clip.width).toBe(action.rect.width); }
      expect(log.root.scale).toBe(1);
      const directory = process.env['ORCHARD_QUEST_HELP_EVIDENCE']; if (directory && dpr === 1.25) { mkdirSync(directory, { recursive: true }); writeFileSync(`${directory}/quests-${state}-${width}-scale${scale}.png`, image.toBuffer('image/png')); }
    }
  });
});
