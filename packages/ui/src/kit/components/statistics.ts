import type { PlayerStatisticCategory } from '@orchard/sim';
import { visiblePlayerStatisticRows, formatPlayerStatisticValue, playerStatisticSubjectName, type StatisticsScreenModel, type StatisticsScreenRow } from '../../statistics-screen.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiGameBook, uiLedgerRow, uiPageHeading, uiPageRow, type UiGameBookChapter } from './character-book.js';

export interface UiStatisticsPage { readonly width: number; readonly height: number }
export interface UiStatisticsOptions {
  readonly onKey?: (key: string, repeat: boolean) => boolean; readonly model: StatisticsScreenModel; readonly onClose?: () => void;
  readonly onNavigate?: (chapter: UiGameBookChapter) => void; readonly layout?: UiStyle;
  /** Leaf size of the book spread; hosts derive it from the viewport with `uiGameBookPage`. */
  readonly page?: UiStatisticsPage;
}
export interface UiStatisticsElement extends UiElement {
  updateStatistics(model: StatisticsScreenModel): void; focusStatistics(): void;
  /** Kept for hosts that still report compact bounds; the book sizes itself from its page instead. */
  setCompactStatistics(compact: boolean): void;
  setStatisticsPage(page: UiStatisticsPage): void;
}

/** The Records chapter's categories: each gathers related statistic categories under one page row. */
export const STATISTICS_BOOK_GROUPS: readonly { readonly id: string; readonly label: string; readonly categories: readonly PlayerStatisticCategory[] }[] = [
  { id: 'general', label: 'General', categories: ['account', 'progression', 'social', 'future'] },
  { id: 'farming', label: 'Farming', categories: ['farming'] },
  { id: 'world', label: 'World', categories: ['world', 'tools'] },
  { id: 'crafting', label: 'Crafting', categories: ['crafting', 'items'] },
  { id: 'economy', label: 'Economy', categories: ['commerce'] },
  { id: 'adventure', label: 'Adventure', categories: ['exploration', 'creatures', 'combat'] },
];
const groupOf = (category: PlayerStatisticCategory): string => STATISTICS_BOOK_GROUPS.find(group => group.categories.includes(category))?.id ?? 'general';
const ROW_HEIGHT = 11, LABEL_HEIGHT = 10, HEADING_HEIGHT = 20;
const recordId = (row: StatisticsScreenRow): string => `statistics.record:${row.statisticKind}:${row.subjectKind}`;
/** Book ink is mixed case: `1H 20M` reads as `1h 20m`, `3 TILES` as `3 tiles`. */
const valueText = (row: StatisticsScreenRow): string => formatPlayerStatisticValue(row.value, row.definition).toLowerCase();

/** A ledger line whose value can change without replacing the node, so focus and scroll survive counter ticks. */
function recordRow(id: string, text: string, value: string): UiElement {
  let painted = value, painter = uiLedgerRow(text, value);
  return new UiElement({ id, kind: 'ledger-row', label: `${text} ${value}`, focusable: true, focusGroup: 'statistics.records', props: { value, text },
    style: { height: uiFixed(11), shrink: 0, alignSelf: 'stretch' },
    paint(element, context) {
      const next = element.props['value'] as string;
      if (next !== painted) { painter.dispose(); painter = uiLedgerRow(text, next); painted = next; }
      painter.hooks.paint?.(element, context);
    },
    onDispose() { painter.dispose(); } });
}

export function uiStatistics(options: UiStatisticsOptions): UiStatisticsElement {
  let key = '', selected = '', rows: readonly StatisticsScreenRow[] = [], model = options.model, page = options.page ?? { width: 200, height: 248 };
  const records = new Map<string, UiElement>();
  const left = uiFlex({ direction: 'column', gap: 2, alignSelf: 'stretch' });
  const right = uiFlex({ direction: 'column', gap: 2, alignSelf: 'stretch', height: 'grow' });
  const book = uiGameBook({ id: 'game.statistics', active: 'statistics', left, right, page,
    onNavigate: chapter => options.onNavigate?.(chapter), onClose: options.onClose });
  const host = new UiElement({ id: 'game.statistics.host', kind: 'statistics-screen', children: [book],
    style: { display: 'flex', direction: 'column', justify: 'center', align: 'center', width: 'grow', height: 'grow', zLayer: 'modal', ...options.layout },
    props: { touchScroll: true, singlePointer: true },
    onKeyCapture(event) { if (options.onKey?.(event.key, event.repeat === true)) return true; if (event.key !== 'Escape') return false; if (!event.repeat) options.onClose?.(); return true; } });

  const categoryRow = (id: string) => left.children.find(node => node.id === `statistics.category.${id}`);
  const render = (): void => {
    const groups = STATISTICS_BOOK_GROUPS.map(group => ({ ...group, rows: rows.filter(row => groupOf(row.definition.category) === group.id) })).filter(group => group.rows.length);
    if (!groups.some(group => group.id === selected)) selected = groups[0]?.id ?? '';
    const previousArea = right.children.find(node => node.id === 'statistics.rows');
    const keepScroll = previousArea?.props['group'] === selected ? previousArea.scroll.y : 0;
    for (const child of [...left.children, ...right.children]) child.dispose();
    records.clear();
    left.append(uiPageHeading('Records'));
    for (const group of groups) {
      const row = uiPageRow({ id: `statistics.category.${group.id}`, label: group.label, selected: group.id === selected, onPress: () => select(group.id) });
      row.focusGroup = 'statistics.categories'; left.append(row);
    }
    const current = groups.find(group => group.id === selected);
    if (!current) { right.append(uiText('No lifetime records yet', { wrap: true, layout: { alignSelf: 'stretch' } })); return; }
    right.append(uiPageHeading(current.label));
    const lines: UiElement[] = [];
    current.rows.forEach((row, index) => {
      const subject = playerStatisticSubjectName(row.subjectKind, model.contentRegistry);
      // Per-subject records sit under one small-caps heading so the subject, not the statistic name, is what gets truncated last.
      if (subject && current.rows[index - 1]?.statisticKind !== row.statisticKind)
        lines.push(uiText(row.definition.name.toUpperCase(), { role: 'label', overflow: 'ellipsis', layout: { alignSelf: 'stretch', shrink: 0, height: uiFixed(LABEL_HEIGHT) } }));
      const line = recordRow(recordId(row), subject || row.definition.name, valueText(row));
      records.set(recordId(row), line); lines.push(subject ? uiFlex({ alignSelf: 'stretch', shrink: 0, height: uiFixed(ROW_HEIGHT), padding: { left: 6 } }, [line]) : line);
    });
    const area = uiScrollArea({ id: 'statistics.rows', label: current.label, scrollStyle: 'wood', gap: 2, initialScrollY: keepScroll }, lines).setProps({ group: selected });
    right.append(area); fitGutter();
  };
  /** Every record line has a fixed height, so whether the page overflows is known up front: only then does the
   * scroll area reserve the wood rail's gutter, and short chapters keep full-width ledger lines as in the approved spread. */
  const fitGutter = (): void => {
    const area = right.children.find(node => node.id === 'statistics.rows'); if (!area) return;
    const content = area.children.reduce((sum, line) => sum + (line.kind === 'text' ? LABEL_HEIGHT : ROW_HEIGHT), 0) + 2 * Math.max(0, area.children.length - 1);
    const gutter = content > page.height - HEADING_HEIGHT - 2 ? 24 : 0;
    if (area.props['gutter'] === gutter) return;
    area.setStyle({ padding: { right: gutter } }).setProps({ gutter, scrollbarWidth: 12 });
  };
  const select = (id: string): void => {
    if (id === selected) return;
    selected = id; render();
    categoryRow(id)?.requestFocus();
  };
  const updateStatistics = (nextModel: StatisticsScreenModel): void => {
    model = nextModel; rows = visiblePlayerStatisticRows(model);
    const next = JSON.stringify(rows.map(row => [recordId(row), row.definition.name, row.definition.category, row.definition.unit,
      playerStatisticSubjectName(row.subjectKind, model.contentRegistry)]));
    if (next === key && left.children.length) {
      // Subscribed counters tick frequently. Keep every node, focus and the scroll position stable while changing values.
      for (const row of rows) {
        const line = records.get(recordId(row)); if (!line) continue;
        const value = valueText(row);
        if (line.props['value'] !== value) line.setProps({ value, label: `${String(line.props['text'])} ${value}` }, false);
      }
      return;
    }
    key = next; render();
  };
  updateStatistics(options.model);
  return Object.assign(host, {
    updateStatistics,
    setCompactStatistics: (): void => {},
    setStatisticsPage: (next: UiStatisticsPage): void => {
      if (next.width === page.width && next.height === page.height) return;
      page = next; book.setBookPage(page); fitGutter();
    },
    focusStatistics: (): void => {
      host.setStyle({ visible: true });
      const walk = (node: UiElement): UiElement | undefined => node.focusable ? node : node.children.map(walk).find(Boolean);
      (categoryRow(selected) ?? walk(host))?.requestFocus();
    },
  });
}
