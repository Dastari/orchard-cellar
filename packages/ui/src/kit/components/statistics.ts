import { visiblePlayerStatisticRows, formatPlayerStatisticValue, playerStatisticSubjectLabel, type StatisticsScreenModel } from '../../statistics-screen.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex } from './layout.js';
import { uiButton } from './button.js';
import { uiText } from './text.js';
import { uiTable, type UiTableState } from './collections.js';
export interface UiStatisticsOptions { readonly model: StatisticsScreenModel; readonly onClose?: () => void; readonly onNavigate?: (page: 'character'|'skills'|'statistics') => void; readonly layout?: UiStyle }
export interface UiStatisticsElement extends UiElement { updateStatistics(model: StatisticsScreenModel): void }
export function uiStatistics(options: UiStatisticsOptions): UiStatisticsElement {
  let state: UiTableState | undefined, key = '';
  const body = uiFlex({ width: 'grow', height: 'grow', gap: 4 });
  const frame = uiFrame({ id: 'game.statistics', header: { title: 'LIFETIME RECORDS', closable: true, onClose: options.onClose },
    resizable: { handles: 'all', min: {width:160,height:160} }, layout: {width:'grow',height:'grow',...options.layout}, children: [
      uiFlex({direction:'row',width:'grow',gap:4,shrink:0}, (['character','skills','statistics'] as const).map(page => uiButton({label:page.toUpperCase(),size:'sm',tone:page==='statistics'?'primary':'neutral',onPress:()=>options.onNavigate?.(page)}))), body,
    ] });
  const updateStatistics = (model: StatisticsScreenModel): void => {
    const rows = visiblePlayerStatisticRows(model), next = rows.map(row=>`${row.statisticKind}:${row.subjectKind}:${row.value}`).join('|');
    if (next === key && body.children.length) return; key = next;
    for (const child of [...body.children]) child.dispose();
    body.append(uiText(`${rows.length} TRACKED`));
    if (!rows.length) { body.append(uiText('NO LIFETIME RECORDS YET')); return; }
    body.append(uiTable({ label:'Lifetime records', rows, key:row=>`${row.statisticKind}:${row.subjectKind}`,surface:'game',pageSize:6,state,
      onStateChange:next=>{state=next;},layout:{height:'grow',minHeight:uiFixed(180)}, columns:[
        {id:'record',label:'Record',value:row=>row.definition.name},
        {id:'subject',label:'Subject',value:row=>playerStatisticSubjectLabel(row.subjectKind)||row.definition.category.toUpperCase()},
        {id:'value',label:'Total',width:uiFixed(180),value:row=>formatPlayerStatisticValue(row.value,row.definition),sortable:false},
      ],
    }));
  }; updateStatistics(options.model); return Object.assign(frame,{updateStatistics});
}
