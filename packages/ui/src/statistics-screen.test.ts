import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows, buildContentRegistry, playerStatisticDefinition } from '@orchard/sim';
import {
  formatPlayerStatisticValue,
  playerStatisticSubjectLabel,
  visiblePlayerStatisticRows,
} from './statistics-screen.js';

describe('statistics screen', () => {
  it('sorts collected, non-reserved statistics into stable categories', () => {
    const rows = visiblePlayerStatisticRows({ statistics: [
      { statisticKind: 'damage_taken', subjectKind: 'fire', value: 4n },
      { statisticKind: 'crops_harvested', subjectKind: 'strawberry', value: 6n },
      { statisticKind: 'time_played', subjectKind: '', value: 400n },
      { statisticKind: 'messages_sent', subjectKind: 'say', value: 2n },
    ] });
    expect(rows.map((row) => row.statisticKind)).toEqual([
      'time_played', 'messages_sent', 'crops_harvested',
    ]);
  });

  it('formats each specialised statistic unit for players', () => {
    expect(formatPlayerStatisticValue(1_220n, playerStatisticDefinition('time_played')!)).toBe('1M 1S');
    expect(formatPlayerStatisticValue(12_345n, playerStatisticDefinition('bronze_earned')!)).toBe('1G 23S 45B');
    expect(formatPlayerStatisticValue(768n, playerStatisticDefinition('distance_travelled')!)).toBe('3 TILES');
    expect(formatPlayerStatisticValue(12_345n, playerStatisticDefinition('items_obtained')!)).toBe('12,345');
  });

  it('uses item display names for subject labels', () => {
    expect(playerStatisticSubjectLabel('strawberry')).toBe('STRAWBERRY');

  });

  it('shows arbitrary active statistics and item subjects without resurrecting retired definitions', () => {
    const source = bootstrapContentRegistry();
    const moonLedger = {
      ...source.items.get('item:wood')!,
      id: 'item:moon_ledger' as const,
      displayName: 'Moon Ledger',
    };
    const registry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: moonLedger.id, kind: moonLedger.kind, json: moonLedger },
      { id: 'statistic:moon_records', kind: 'statistic', json: {
        id: 'statistic:moon_records', kind: 'statistic', schemaVersion: 1,
        name: 'Moon Records', description: 'Arbitrary active statistic fixture.',
        category: 'items', unit: 'count', aggregation: 'counter', subject: 'item_kind',
        milestones: ['1', '5'],
      } },
      { id: 'statistic:retired_records', kind: 'statistic', json: {
        id: 'statistic:retired_records', kind: 'statistic', schemaVersion: 1, retired: true,
        name: 'Retired Records', description: 'Must remain hidden.',
        category: 'items', unit: 'count', aggregation: 'counter', subject: 'item_kind',
        milestones: ['1'],
      } },
    ]).registry;
    const rows = visiblePlayerStatisticRows({ contentRegistry: registry, statistics: [
      { statisticKind: 'retired_records', subjectKind: 'moon_ledger', value: 9n },
      { statisticKind: 'moon_records', subjectKind: 'moon_ledger', value: 2n },
    ] });
    expect(rows.map(({ statisticKind }) => statisticKind)).toEqual(['moon_records']);
    expect(playerStatisticSubjectLabel('moon_ledger', registry)).toBe('MOON LEDGER');
  });

  it('keeps missing statistics hidden and uses neutral subjects for retired live items', () => {
    const source = bootstrapContentRegistry();
    const registry = buildContentRegistry(bootstrapContentRows().map((row) => {
      if (row.id !== 'item:marlow_book') return row;
      return { ...row, json: { ...source.items.get(row.id)!, retired: true } };
    })).registry;
    expect(visiblePlayerStatisticRows({ contentRegistry: registry, statistics: [
      { statisticKind: 'missing_records', subjectKind: 'marlow_book', value: 3n },
    ] })).toEqual([]);
    expect(playerStatisticSubjectLabel('marlow_book', registry)).toBe('MARLOW BOOK');
    expect(playerStatisticSubjectLabel('missing_subject', registry)).toBe('MISSING SUBJECT');
  });
});

import { afterEach, beforeAll, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { StatisticsScreen, type PlayerStatisticModel } from './statistics-screen.js';
import { progressionWindowRect } from './character-screen.js';
import { uiGameBookPage } from './kit/components/character-book.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiElement } from './kit/runtime/element.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import { UI_TEXT_METRICS } from './kit/tokens.js';
let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
const screens: StatisticsScreen[] = [];
afterEach(() => { screens.splice(0).forEach(screen => screen.dispose()); vi.unstubAllGlobals(); });
/** Eighteen per-item records (Crafting) plus two General records, so the book opens on General with two categories. */
const records: PlayerStatisticModel[] = [
  { statisticKind: 'time_played', subjectKind: '', value: 400n },
  { statisticKind: 'world_entries', subjectKind: '', value: 3n },
  ...Array.from({ length: 18 }, (_, index) => ({ statisticKind: 'items_obtained', subjectKind: `item_${String(index).padStart(2, '0')}`, value: 9007199254740993n + BigInt(index) })),
];
const tick = (rows: readonly PlayerStatisticModel[], by = 1n) => rows.map(row => ({ ...row, value: row.value + by }));
function fixture(width = 640, height = 400) {
  const navigate = vi.fn(), close = vi.fn(), screen = new StatisticsScreen(art, { onNavigate: navigate, onClose: close }); screens.push(screen);
  screen.update({ statistics: records }); screen.setBounds(progressionWindowRect(width, height), width, height); screen.focus();
  const root = screen.root;
  const find = (id: string) => { root.arrange(); return root.entries().find(entry => entry.element.id === id)?.element; };
  const node = (id: string) => find(id)!;
  const byLabel = (label: string) => { root.arrange(); return root.entries().find(entry => entry.element.label === label)?.element; };
  const press = (id: string) => { root.focus.set(node(id)); root.key({ key: 'Enter' }); root.arrange(); };
  const heading = () => { root.arrange(); return root.entries().filter(entry => entry.element.kind === 'page-heading').map(entry => entry.element.label).find(label => label !== 'Records'); };
  const recordIds = () => { root.arrange(); return root.entries().filter(entry => entry.element.kind === 'ledger-row').map(entry => entry.element.id); };
  const tap = (element: UiElement, pointerId: number, finish: 'up' | 'cancel' = 'up', between?: () => void) => {
    const point = { x: element.clip.x + 8, y: element.clip.y + Math.floor(element.clip.height / 2) };
    root.pointer({ type: 'down', point, pointerId, button: 0 }); between?.(); root.pointer({ type: finish, point, pointerId, button: 0 }); root.arrange();
  };
  return { screen, root, find, node, byLabel, press, heading, recordIds, tap, navigate, close };
}
const item = (index: number) => `statistics.record:items_obtained:item_${String(index).padStart(2, '0')}`;
describe('production retained statistics adapter', () => {
  it('opens the Records chapter on the first category and groups only categories that have records', () => {
    const f = fixture();
    expect(f.node('game.statistics.host').kind).toBe('statistics-screen');
    expect(f.root.focus.current?.id).toBe('statistics.category.general');
    expect(f.node('statistics.category.general').props['selected']).toBe(true);
    expect(f.find('statistics.category.crafting')).toBeDefined();
    expect(['farming', 'world', 'economy', 'adventure'].map(id => f.find(`statistics.category.${id}`))).toEqual([undefined, undefined, undefined, undefined]);
    expect(f.heading()).toBe('General');
    expect(f.recordIds()).toEqual(['statistics.record:time_played:', 'statistics.record:world_entries:']);
    expect(f.byLabel('Time Played 20s')).toBeDefined();
  });
  it('keeps the chapter, rows, focus, scroll and exact bigint totals through authoritative counter ticks', () => {
    const f = fixture(); f.press('statistics.category.crafting');
    expect(f.heading()).toBe('Crafting'); expect(f.root.focus.current?.id).toBe('statistics.category.crafting');
    const area = f.node('statistics.rows'), row = f.node(item(17)); f.root.focus.set(row); f.root.arrange();
    const scroll = area.scroll.y; expect(scroll).toBeGreaterThan(0);
    const ids = f.recordIds();
    f.screen.update({ statistics: tick(records) });
    expect(f.node('statistics.rows')).toBe(area); expect(f.node(item(17))).toBe(row); expect(f.root.focus.current).toBe(row);
    expect(area.scroll.y).toBe(scroll); expect(f.recordIds()).toEqual(ids);
    expect(row.label).toBe('Item 17 9,007,199,254,741,011');
    expect(f.byLabel('Item 00 9,007,199,254,740,994')).toBeDefined();
  });
  it('lists one small-caps heading per statistic with its subjects beneath, in the shared sort order', () => {
    const f = fixture(); f.screen.update({ statistics: [...records,
      { statisticKind: 'items_dropped', subjectKind: 'wood', value: 2n }, { statisticKind: 'crafting_actions', subjectKind: '', value: 5n }] });
    f.press('statistics.category.crafting');
    const area = f.node('statistics.rows');
    const lines = area.children.map(line => line.kind === 'text' ? `# ${line.label}` : (line.kind === 'ledger-row' ? line : line.children[0]!).id);
    expect(lines.slice(0, 5)).toEqual(['statistics.record:crafting_actions:', '# ITEMS DROPPED', 'statistics.record:items_dropped:wood', '# ITEMS OBTAINED', item(0)]);
    expect(lines.filter(line => line === '# ITEMS OBTAINED')).toHaveLength(1);
    expect(f.node('statistics.record:items_dropped:wood').label).toBe('Wood 2');
  });
  it('preserves a captured category press across value updates and cancellation prevents selection', () => {
    const f = fixture(), crafting = f.node('statistics.category.crafting');
    f.tap(crafting, 1, 'cancel', () => f.screen.update({ statistics: tick(records) }));
    expect(f.heading()).toBe('General');
    f.tap(crafting, 2, 'up', () => { f.screen.update({ statistics: tick(records, 2n) }); expect(f.node('statistics.category.crafting')).toBe(crafting); });
    expect(f.heading()).toBe('Crafting');
    expect(f.node('statistics.category.crafting').props['selected']).toBe(true);
  });
  it('falls back to the first category when the selected one empties and restores focus to a category row', () => {
    const f = fixture(); f.press('statistics.category.crafting');
    f.screen.update({ statistics: records.slice(0, 2) });
    expect(f.heading()).toBe('General'); expect(f.find('statistics.category.crafting')).toBeUndefined();
    expect(f.root.focus.current?.id).toBe('statistics.category.general');
  });
  it('uses current authored subject labels and updates registry-only label changes', () => {
    const source = bootstrapContentRegistry();
    const registry = (displayName: string) => buildContentRegistry(bootstrapContentRows().map(row => row.id === 'item:wood' ? { ...row, json: { ...source.items.get('item:wood')!, displayName } } : row)).registry;
    const f = fixture(); const statistics = [{ statisticKind: 'items_obtained', subjectKind: 'wood', value: 9007199254740993n }];
    f.screen.update({ statistics, contentRegistry: registry('Old Authored Name') }); expect(f.byLabel('Old Authored Name 9,007,199,254,740,993')).toBeDefined();
    f.screen.update({ statistics, contentRegistry: registry('New Authored Name') }); expect(f.byLabel('New Authored Name 9,007,199,254,740,993')).toBeDefined();
    expect(f.byLabel('Old Authored Name 9,007,199,254,740,993')).toBeUndefined();
  });
  it('restores a focused record by identity and keeps its scroll when unrelated records arrive', () => {
    const f = fixture(); f.press('statistics.category.crafting');
    f.root.focus.set(f.node(item(17))); f.root.arrange(); const scroll = f.node('statistics.rows').scroll.y; expect(scroll).toBeGreaterThan(0);
    f.screen.update({ statistics: [...tick(records, 76n), { statisticKind: 'items_obtained', subjectKind: 'zz_last', value: 44n }] });
    expect(f.root.focus.current?.id).toBe(item(17)); expect(f.heading()).toBe('Crafting');
    expect(f.node('statistics.rows').scroll.y).toBe(scroll);
    expect(f.root.focus.current?.label).toBe('Item 17 9,007,199,254,741,086');
    expect(f.recordIds()).toContain('statistics.record:items_obtained:zz_last');
  });
  it('keeps compact touch scroll, keyboard browsing and resize state independent from totals', () => {
    const f = fixture(320, 180), root = f.root; f.press('statistics.category.crafting');
    const area = f.node('statistics.rows'); scrollUiElement(area, 0, 0); root.arrange();
    const point = { x: area.clip.x + 10, y: area.clip.y + Math.min(20, area.clip.height / 2) };
    root.pointer({ type: 'down', point, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    root.pointer({ type: 'move', point: { x: point.x, y: point.y - 12 }, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    expect(area.scroll.y).toBeGreaterThan(0);
    root.pointer({ type: 'up', point: { x: point.x, y: point.y - 12 }, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    expect(f.heading()).toBe('Crafting');
    root.focus.set(f.node(item(0))); root.key({ key: 'ArrowDown' }); expect(root.focus.current?.id).toBe(item(1));
    root.key({ key: 'End' }); expect(root.focus.current?.id).toBe(item(17));
    const row = root.focus.current!;
    f.screen.setBounds(progressionWindowRect(640, 400), 640, 400);
    expect(f.node('statistics.rows')).toBe(area); expect(root.focus.current).toBe(row);
    root.key({ key: 'Home' }); expect(root.focus.current?.id).toBe(item(0));
  });
  it('sizes the spread from the viewport, resizes it in place and centres it in the host bounds', () => {
    const f = fixture(640, 400), root = f.root, book = f.node('game.statistics'), tab = f.node('book.tab.skills');
    for (const [width, height] of [[960, 540], [390, 797], [640, 400]] as const) {
      f.screen.setBounds(progressionWindowRect(width, height), width, height); root.arrange();
      const page = uiGameBookPage(width, height), bounds = progressionWindowRect(width, height);
      expect(f.node('game.statistics')).toBe(book); expect(f.node('book.tab.skills')).toBe(tab);
      expect(book.rect.width).toBe(page.width * 2 + 56); expect(book.rect.height).toBe(page.height + 32);
      const host = f.node('game.statistics.host');
      expect(host.rect).toEqual(bounds);
      const window = f.node('game.statistics.window');
      expect(Math.abs(window.rect.x - bounds.x - (bounds.width - window.rect.width) / 2)).toBeLessThanOrEqual(1);
      expect(window.rect.y).toBeGreaterThanOrEqual(bounds.y);
      expect(window.rect.y + window.rect.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      const area = f.node('statistics.rows');
      expect(area.rect.y + area.rect.height).toBeLessThanOrEqual(book.rect.y + book.rect.height);
    }
  });
  it('reserves the rail gutter only when a chapter overflows its page', () => {
    const f = fixture(960, 540);
    expect(f.node('statistics.rows').props['gutter']).toBe(0); expect(f.node('statistics.rows').scroll.maxY).toBe(0);
    f.press('statistics.category.crafting');
    const area = f.node('statistics.rows'); expect(area.props['gutter']).toBe(24); expect(area.scroll.maxY).toBeGreaterThan(0);
    const row = f.node(item(0)); expect(row.rect.x + row.rect.width).toBeLessThanOrEqual(area.rect.x + area.rect.width - 24);
  });
  it('delegates chapter navigation and close, resets on disconnect and paints real kit art', () => {
    const f = fixture(); f.press('book.tab.character'); expect(f.navigate).toHaveBeenCalledExactlyOnceWith('character');
    f.press('book.tab.quests'); expect(f.navigate).toHaveBeenLastCalledWith('quests');
    f.press('book.tab.statistics'); expect(f.navigate).toHaveBeenCalledTimes(2);
    f.root.key({ key: 'Escape' }); expect(f.close).toHaveBeenCalledOnce();
    f.press('book.tab.skills'); expect(f.navigate).toHaveBeenLastCalledWith('skills');
    const root = f.screen.root; f.screen.update(null); expect(f.screen.active).toBe(false);
    f.screen.update({ statistics: [] }); f.screen.focus(); expect(f.screen.root).toBe(root); expect(f.byLabel('No lifetime records yet')).toBeDefined();
    vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
    f.screen.draw(createCanvas(640, 400).getContext('2d') as unknown as CanvasRenderingContext2D);
    f.screen.dispose(); expect(root.disposed).toBe(true);
  });
  it.each([1, 2, 3])('renders compact/wide records at UI scale %s and fractional DPR', scale => {
    vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
    for (const [width, height] of [[320, 180], [640, 400]]) {
      const f = fixture(width!, height!), root = f.root;
      const category = f.node('statistics.category.crafting');
      expect(category.clip.height).toBe(category.rect.height); expect(category.clip.width).toBe(category.rect.width);
      const canvas = createCanvas(Math.round(width! * scale * 1.25), Math.round(height! * scale * 1.25)), context = canvas.getContext('2d');
      context.scale(scale * 1.25, scale * 1.25); f.screen.draw(context as unknown as CanvasRenderingContext2D);
      expect(root.scale).toBe(1);
      for (const { element } of root.entries()) if (element.kind === 'text') {
        expect(UI_TEXT_METRICS[element.props['role'] as keyof typeof UI_TEXT_METRICS].font).toBe('body');
      }
    }
  });
});
