import { afterEach, beforeAll, expect, it } from 'vitest';
import { StatisticsScreen, type StatisticsScreenModel } from '../../statistics-screen.js';
import { progressionWindowRect } from '../../character-screen.js';
import { uiTestArt } from '../lab/testing/art.js';
import { UiRoot } from '../runtime/root.js';
import { UiElement } from '../runtime/element.js';
import { scrollUiElement, uiScrollThumb } from '../layout/scroll.js';
import { uiFixed } from '../layout/box.js';
import { uiTable } from './collections.js';
import type { UiKitArt } from './art.js';
let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()));
const records: StatisticsScreenModel = { statistics: Array.from({ length: 18 }, (_, i) => ({ statisticKind: 'items_obtained', subjectKind: `subject_${i}`, value: 9007199254740993n + BigInt(i) })) };
function fixture() {
  const screen = new StatisticsScreen(art); cleanup.push(() => screen.dispose());
  screen.update(records); screen.setBounds(progressionWindowRect(320, 180), 320, 180); screen.focus();
  const root = screen.root, node = (id: string) => root.entries().find(entry => entry.element.id === id)!.element;
  const button = (label: string) => root.entries().find(entry => entry.element.label === label && entry.element.kind === 'button')!.element;
  const reveal = (label: string) => { const target = button(label); root.focus.set(target); root.arrange(); return target; };
  const center = (element: UiElement) => ({ x: element.rect.x + element.rect.width / 2, y: element.rect.y + element.rect.height / 2 });
  return { screen, root, node, button, reveal, center };
}
it('pages the real compact statistics table from the visual center above its horizontal scrollbar', () => {
  const f = fixture(), next = f.reveal('Next'), table = f.node('statistics.table'), point = f.center(next);
  expect(table.scroll.maxX).toBeGreaterThan(0);
  f.root.pointer({ type: 'down', point, pointerId: 1, button: 0 });
  f.root.pointer({ type: 'up', point, pointerId: 1, button: 0 });
  expect(table.props['page']).toBe(1);
  const currentNext = f.reveal('Next'), geometry = uiScrollThumb(table, 'x')!;
  expect(currentNext.rect.y + currentNext.rect.height).toBeLessThanOrEqual(geometry.track.y);
  expect(currentNext.clip.height).toBe(currentNext.rect.height);
});
it('keeps horizontal range and thumb drag separate from pagination, including cancelled page gestures', () => {
  const f = fixture(), table = f.node('statistics.table');
  scrollUiElement(table, 0, 0); f.root.arrange();
  const geometry = uiScrollThumb(table, 'x')!, start = f.center({ rect: geometry.thumb } as UiElement);
  f.root.pointer({ type: 'down', point: start, pointerId: 2, button: 0 });
  const end = { x: geometry.track.x + geometry.track.width, y: start.y };
  f.root.pointer({ type: 'move', point: end, pointerId: 2, button: 0 });
  f.root.pointer({ type: 'up', point: end, pointerId: 2, button: 0 });
  expect(table.scroll.x).toBe(table.scroll.maxX); expect(table.props['page']).toBe(0);
  const point = f.center(f.reveal('Next'));
  f.root.pointer({ type: 'down', point, pointerId: 3, button: 0 });
  f.root.pointer({ type: 'cancel', point, pointerId: 3, button: 0 });
  f.root.pointer({ type: 'up', point, pointerId: 3, button: 0 }); expect(table.props['page']).toBe(0);
  f.root.pointer({ type: 'down', point, pointerId: 4, button: 0 });
  f.root.pointer({ type: 'up', point, pointerId: 4, button: 0 }); expect(table.props['page']).toBe(1);
});
it('gives the primary touch sole ownership of compact pagination and keeps body touch scrolling read-only', () => {
  const f = fixture(), table = f.node('statistics.table'), point = f.center(f.reveal('Next'));
  const pointer = (type: 'down' | 'move' | 'up' | 'cancel', id: number, p = point) => f.root.pointer({ type, point: p, pointerId: id, button: 0, pointerType: 'touch', isPrimary: id === 1 });
  pointer('down', 1); pointer('down', 2); pointer('up', 2); expect(table.props['page']).toBe(0);
  pointer('up', 1); expect(table.props['page']).toBe(1);
  const list = f.node('statistics.table:rows'); f.root.focus.set(list); f.root.arrange(); scrollUiElement(list, 0, 0); f.root.arrange();
  const start = { x: list.clip.x + 10, y: list.clip.y + list.clip.height / 2 };
  pointer('down', 1, start); pointer('move', 1, { x: start.x, y: start.y - 12 }); pointer('up', 1, { x: start.x, y: start.y - 12 });
  expect(list.scroll.y).toBeGreaterThan(0); expect(list.props['selected']).toEqual([]); expect(table.props['page']).toBe(1);
});
it.each(['studio', 'game'] as const)('preserves %s table mode, sorting, resizing and range without geometry oscillation', surface => {
  const root = new UiRoot({ art, scale: 1 }); cleanup.push(() => root.dispose()); root.resize(280, 180);
  const table = uiTable({ id: 'test.table', label: 'Rows', surface, pageSize: 6, rows: records.statistics, key: row => row.subjectKind,
    columns: [{ id: 'subject', label: 'Subject', width: uiFixed(240), value: row => row.subjectKind }, { id: 'total', label: 'Total', width: uiFixed(180), value: row => row.value.toString() }] }); root.mount(table); root.arrange();
  expect(table.props['mode']).toBe(surface === 'studio' ? 'virtual' : 'pagination');
  const initial = { ...table.contentRect }, maxX = table.scroll.maxX;
  for (let i = 0; i < 5; i++) { root.arrange(); expect(table.contentRect).toEqual(initial); expect(table.scroll.maxX).toBe(maxX); }
  const sort = root.entries().find(e => e.element.id === 'test.table:sort:subject')!.element; root.focus.set(sort); root.key({ key: 'Enter' });
  expect(table.props['sort']).toEqual([{ column: 'subject', direction: 'asc' }]);
  root.resize(700, 400); root.arrange(); expect(table.scroll.maxX).toBe(0); expect(uiScrollThumb(table, 'x')).toBeNull();
  root.resize(280, 180); root.arrange(); expect(table.scroll.maxX).toBe(maxX);
  if (surface === 'game') { const next = root.entries().find(e => e.element.label === 'Next')!.element; expect(next.rect.y + next.rect.height).toBeLessThanOrEqual(uiScrollThumb(table, 'x')!.track.y); }
});
