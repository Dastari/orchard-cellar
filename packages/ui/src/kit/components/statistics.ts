import { visiblePlayerStatisticRows, formatPlayerStatisticValue, playerStatisticSubjectLabel, type StatisticsScreenModel, type StatisticsScreenRow } from '../../statistics-screen.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex } from './layout.js';
import { uiButton } from './button.js';
import { uiText } from './text.js';
import { uiTable, type UiTableState } from './collections.js';
export interface UiStatisticsOptions { readonly model: StatisticsScreenModel; readonly onClose?: () => void; readonly onNavigate?: (page: 'character'|'skills'|'statistics') => void; readonly layout?: UiStyle }
export interface UiStatisticsElement extends UiElement { updateStatistics(model: StatisticsScreenModel): void; focusStatistics(): void }
export function uiStatistics(options: UiStatisticsOptions): UiStatisticsElement {
  let state: UiTableState | undefined, key = '', model = options.model;
  let current = new Map<string, StatisticsScreenRow>();
  const cells = new Map<UiElement, string>();
  const rowId = (row: StatisticsScreenRow) => JSON.stringify([row.statisticKind, row.subjectKind]);
  const body = uiFlex({ width: 'grow', height: 'grow', gap: 4 });
  const base = uiFrame({ id: 'game.statistics', blockInput: true, header: { title: 'LIFETIME RECORDS', closable: true, onClose: options.onClose },
    layout: {width:'grow',height:'grow',...options.layout}, children: [
      uiFlex({direction:'row',wrap:true,width:'grow',gap:4,shrink:0}, (['character','skills','statistics'] as const).map(page => uiButton({id:`statistics.navigate.${page}`,label:page.toUpperCase(),size:'sm',tone:page==='statistics'?'primary':'neutral',onPress:()=>options.onNavigate?.(page)}))), body,
    ] });
  const frame = new UiElement({ id: 'game.statistics.host', kind: 'statistics-screen', children: [base],
    style: { display: 'stack', width: 'grow', height: 'grow', zLayer: 'modal' }, props: { touchScroll: true, singlePointer: true },
    onKeyCapture(event) { if (event.key !== 'Escape') return false; if (!event.repeat) options.onClose?.(); return true; } });
  const descendants = (node: UiElement): UiElement[] => node.children.flatMap(child => [child, ...descendants(child)]);
  const updateStatistics = (nextModel: StatisticsScreenModel): void => {
    model = nextModel;
    const rows = visiblePlayerStatisticRows(model);
    current = new Map(rows.map(row => [rowId(row), row]));
    const next = JSON.stringify(rows.map(row => [rowId(row), row.definition.name, row.definition.category, row.definition.unit,
      playerStatisticSubjectLabel(row.subjectKind, model.contentRegistry)]));
    if (next === key && body.children.length) {
      // Subscribed counters tick frequently. Keep the table, focus, selection,
      // scrollbars and captured controls stable while changing their text.
      for (const [cell, id] of cells) {
        if (cell.disposed) { cells.delete(cell); continue; }
        const row = current.get(id)!;
        const text = formatPlayerStatisticValue(row.value, row.definition);
        if (cell.props['text'] !== text) cell.setProps({ text });
      }
      return;
    }
    const previousOrder = descendants(body).find(node => node.kind === 'table')?.props['rowOrder'] as readonly string[] | undefined;
    const selected = (descendants(body).find(node => node.id === 'statistics.table:rows')?.props['selected'] as readonly string[] | undefined)?.filter(id => current.has(id));
    const selectedId = previousOrder?.[(state?.page ?? 0) * 6 + (state?.active ?? 0)];
    const focus = descendants(body).find(node => node.props['focused'])?.id;
    key = next;
    for (const child of [...body.children]) child.dispose(); cells.clear();
    body.append(uiText(`${rows.length} TRACKED`));
    if (!rows.length) { body.append(uiText('NO LIFETIME RECORDS YET', { wrap: true })); return; }
    if (state) state = { ...state, page: Math.min(state.page, Math.floor((rows.length - 1) / 6)) };
    const table = uiTable({ id:'statistics.table',label:'Lifetime records', rows, key:rowId,surface:'game',pageSize:6,state,selected,
      onStateChange:next=>{state=next;},layout:{height:'grow',minHeight:uiFixed(28)}, columns:[
        {id:'record',label:'Record',value:row=>row.definition.name},
        {id:'subject',label:'Subject',value:row=>playerStatisticSubjectLabel(row.subjectKind, model.contentRegistry)||row.definition.category.toUpperCase()},
        {id:'value',label:'Total',width:uiFixed(180),value:row=>formatPlayerStatisticValue(row.value,row.definition),sortable:false,
          render: row => { const latest = current.get(rowId(row)) ?? row; const text = uiText(formatPlayerStatisticValue(latest.value, latest.definition), { overflow:'ellipsis' }); cells.set(text, rowId(row)); return text; }},
      ],
    });
    body.append(table);
    const list = descendants(table).find(node => node.id === 'statistics.table:rows');
    const order = table.props['rowOrder'] as readonly string[];
    if (selectedId && list) {
      const index = order.indexOf(selectedId);
      if (index >= (state?.page ?? 0) * 6 && index < ((state?.page ?? 0) + 1) * 6) list.setProps({ active: index % 6 });
    }
    if (focus) descendants(table).find(node => node.id === focus)?.requestFocus();
  };
  updateStatistics(options.model);
  return Object.assign(frame, { updateStatistics, focusStatistics: () => {
    base.setStyle({ visible: true });
    (descendants(frame).find(node => node.id === 'statistics.table:rows') ?? descendants(frame).find(node => node.focusable))?.requestFocus();
  } });
}
