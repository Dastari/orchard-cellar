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
import { StatisticsScreen } from './statistics-screen.js';
import { progressionWindowRect } from './character-screen.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import { UI_TEXT_METRICS } from './kit/tokens.js';
let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
const screens: StatisticsScreen[] = [];
afterEach(() => { screens.splice(0).forEach(screen => screen.dispose()); vi.unstubAllGlobals(); });
const records = Array.from({ length: 18 }, (_, index) => ({ statisticKind: 'items_obtained', subjectKind: `item_${String(index).padStart(2, '0')}`, value: 9007199254740993n + BigInt(index) }));
function fixture(width = 640, height = 400) {
  const navigate = vi.fn(), close = vi.fn(), screen = new StatisticsScreen(art, { onNavigate: navigate, onClose: close }); screens.push(screen);
  screen.update({ statistics: records }); screen.setBounds(progressionWindowRect(width, height), width, height); screen.focus();
  const node = (id: string) => { screen.root.arrange(); return screen.root.entries().find(entry => entry.element.id === id)!.element; };
  const byLabel = (label: string) => { screen.root.arrange(); return screen.root.entries().find(entry => entry.element.label === label)!.element; };
  const press = (label: string) => { screen.root.focus.set(byLabel(label)); screen.root.key({ key: 'Enter' }); screen.root.arrange(); };
  return { screen, node, byLabel, press, navigate, close };
}
describe('production retained statistics adapter', () => {
  it('keeps the table, focus, page, sort and exact bigint totals through authoritative counter ticks', () => {
    const f = fixture(); f.press('Next'); const table = f.node('statistics.table'), list = f.node('statistics.table:rows');
    f.screen.root.focus.set(list); f.screen.root.key({ key: 'ArrowDown' }); const focus = f.screen.root.focus.current;
    expect((table.props['state'] as { page: number }).page).toBe(1);
    f.screen.update({ statistics: records.map(row => ({ ...row, value: row.value + 1n })) });
    expect(f.node('statistics.table')).toBe(table); expect(f.node('statistics.table:rows')).toBe(list); expect(f.screen.root.focus.current).toBe(focus);
    expect(list.props['active']).toBe(1); expect((table.props['state'] as { page: number }).page).toBe(1);
    expect(f.screen.root.entries().some(entry => entry.element.label === '9,007,199,254,741,000')).toBe(true);
  });
  it('preserves captured sorting controls across value updates and cancellation prevents sorting', () => {
    const f = fixture(), root = f.screen.root, sort = f.node('statistics.table:sort:subject');
    root.focus.set(sort); root.arrange(); const point = { x: sort.clip.x + 8, y: sort.clip.y + 8 };
    root.pointer({ type: 'down', point, pointerId: 1, button: 0 });
    f.screen.update({ statistics: records.map(row => ({ ...row, value: row.value + 1n })) });
    expect(f.node('statistics.table:sort:subject')).toBe(sort);
    root.pointer({ type: 'up', point, pointerId: 1, button: 0 });
    expect(f.node('statistics.table').props['sort']).toEqual([{ column: 'subject', direction: 'asc' }]);
    root.pointer({ type: 'down', point, pointerId: 2, button: 0 }); root.pointer({ type: 'cancel', point, pointerId: 2, button: 0 });
    expect(f.node('statistics.table').props['sort']).toEqual([{ column: 'subject', direction: 'asc' }]);
  });
  it('clamps a disappearing page, restores list focus, and never activates replacement rows on release', () => {
    const f = fixture(); f.press('Next'); f.press('Next'); const root = f.screen.root, list = f.node('statistics.table:rows'); root.focus.set(list); root.arrange();
    const row = root.entries().find(entry => entry.element.kind === 'list-row' && entry.element.clip.height > 0)!.element;
    const point = { x: row.clip.x + 8, y: row.clip.y + 8 };
    root.pointer({ type: 'down', point, pointerId: 3, button: 0 });
    f.screen.update({ statistics: records.slice(0, 2) }); root.pointer({ type: 'up', point, pointerId: 3, button: 0 });
    expect((f.node('statistics.table').props['state'] as { page: number }).page).toBe(0);
    expect(root.focus.current?.id).toBe('statistics.table:rows');
    expect(f.node('statistics.table:rows').props['selected']).toEqual([]);
  });
  it('uses current authored subject labels and updates registry-only label changes', () => {
    const source = bootstrapContentRegistry();
    const registry = (displayName: string) => buildContentRegistry(bootstrapContentRows().map(row => row.id === 'item:wood' ? { ...row, json: { ...source.items.get('item:wood')!, displayName } } : row)).registry;
    const f = fixture(); const statistics = [{ statisticKind: 'items_obtained', subjectKind: 'wood', value: 9007199254740993n }];
    f.screen.update({ statistics, contentRegistry: registry('Old Authored Name') }); expect(f.byLabel('OLD AUTHORED NAME')).toBeDefined();
    f.screen.update({ statistics, contentRegistry: registry('New Authored Name') }); expect(f.byLabel('NEW AUTHORED NAME')).toBeDefined();
  });
  it('restores focused pagination by role when membership changes and preserves updated values on later pages', () => {
    const f = fixture(); const next = f.byLabel('Next'); f.screen.root.focus.set(next);
    f.screen.update({ statistics: [...records, { ...records[0]!, subjectKind: 'last_item', value: 44n }] });
    expect(f.screen.root.focus.current?.label).toBe('Next');
    f.screen.update({ statistics: [...records.map(row => ({ ...row, value: 77n })), { ...records[0]!, subjectKind: 'last_item', value: 77n }] });
    f.press('Next'); expect(f.screen.root.entries().filter(entry => entry.element.label === '77')).toHaveLength(6);
  });
  it('retains a selected record identity when unrelated rows arrive', () => {
    const f = fixture(), list = f.node('statistics.table:rows');
    f.screen.root.focus.set(list); f.screen.root.key({ key: 'ArrowDown' }); f.screen.root.key({ key: 'Enter' });
    const selected = list.props['selected'];
    f.screen.update({ statistics: [...records, { ...records[0]!, subjectKind: 'last_item', value: 1n }] });
    expect(f.node('statistics.table:rows').props['selected']).toEqual(selected);
    expect(f.node('statistics.table:rows').props['active']).toBe(1);
  });
  it('keeps compact touch scroll, keyboard browsing and resize state independent from totals', () => {
    const f = fixture(320, 180), root = f.screen.root, list = f.node('statistics.table:rows');
    root.focus.set(list); root.arrange(); scrollUiElement(list, 0, 0); root.arrange();
    const point = { x: list.clip.x + 10, y: list.clip.y + Math.min(20, list.clip.height / 2) };
    root.pointer({ type: 'down', point, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    root.pointer({ type: 'move', point: { x: point.x, y: point.y - 12 }, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    expect(list.scroll.y).toBeGreaterThan(0);
    root.pointer({ type: 'up', point: { x: point.x, y: point.y - 12 }, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    expect(list.props['selected']).toEqual([]); root.focus.set(list); root.key({ key: 'End' }); expect(list.props['active']).toBe(5);
    f.screen.setBounds(progressionWindowRect(640, 400), 640, 400); expect(f.node('statistics.table:rows')).toBe(list); expect(root.focus.current).toBe(list);
    root.key({ key: 'Home' }); expect(list.props['active']).toBe(0);
  });
  it('delegates navigation and close, resets on disconnect and paints real kit art', () => {
    const f = fixture(); f.press('CHARACTER'); expect(f.navigate).toHaveBeenCalledExactlyOnceWith('character');
    f.screen.root.key({ key: 'Escape' }); expect(f.close).toHaveBeenCalledOnce();
    const root = f.screen.root; f.screen.update(null); expect(f.screen.active).toBe(false);
    f.screen.update({ statistics: [] }); f.screen.focus(); expect(f.screen.root).toBe(root); expect(f.byLabel('NO LIFETIME RECORDS YET')).toBeDefined();
    vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
    f.screen.draw(createCanvas(640, 400).getContext('2d') as unknown as CanvasRenderingContext2D);
    f.screen.dispose(); expect(root.disposed).toBe(true);
  });
  it.each([1, 2, 3])('renders compact/wide records at UI scale %s and fractional DPR', scale => {
    vi.stubGlobal('document', { createElement: () => createCanvas(1, 1) });
    for (const [width, height] of [[320, 180], [640, 400]]) {
      const f = fixture(width!, height!), root = f.screen.root;
      const next = f.byLabel('Next'); root.focus.set(next); root.arrange();
      expect(next.clip.height).toBe(next.rect.height); expect(next.clip.width).toBe(next.rect.width);
      const canvas = createCanvas(Math.round(width! * scale * 1.25), Math.round(height! * scale * 1.25)), context = canvas.getContext('2d');
      context.scale(scale * 1.25, scale * 1.25); f.screen.draw(context as unknown as CanvasRenderingContext2D);
      expect(root.scale).toBe(1);
      for (const { element } of root.entries()) if (element.kind === 'text') {
        expect(UI_TEXT_METRICS[element.props['role'] as keyof typeof UI_TEXT_METRICS].font).toBe('body');
      }
    }
  });
});
