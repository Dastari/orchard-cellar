import { uiFixed } from '../../layout/box.js';
import type { UiLabSpecimen } from '../registry.js';
export const dataSpecimen: UiLabSpecimen = {
  id: 'data', title: 'Virtual rows, trees and tables', district: 'forms', size: { width: 1000, height: 1000 }, matrix: { mode: ['virtual', 'pagination'], ordered: [false, true] },
  build(ui, props, mock) {
    const rows = Array.from({ length: props['empty'] ? 0 : props['thousands'] ? 2000 : 80 }, (_, index) => ({ id: String(index), name: `Orchard ${index + 1}`, fruit: index % 3 ? 'Apple' : 'Pear', count: 80 - index }));
    return ui.frame({ style: 'parchment_plain', header: { title: 'Forms and data' }, layout: { width: 'grow', height: 'grow', gap: 8, overflow: 'scroll-y' }, children: [
      ui.text('Shift + header activation adds a sort column. Drag or arrow a column edge. Lists keep a bounded row window.'),
      ui.table({ label: 'Orchards', rows, key: row => row.id, mode: props['mode'] as 'virtual' | 'pagination', sort: props['ordered'] ? [{ column: 'count', direction: 'asc' }] : [], pageSize: 10, multiple: true,
        columns: [{ id: 'name', label: 'Name', value: row => row.name }, { id: 'fruit', label: 'Fruit', value: row => row.fruit }, { id: 'count', label: 'Count', value: row => row.count, width: uiFixed(60) }],
        layout: { height: uiFixed(210) }, onSelect: keys => mock.activate(`rows:${keys.join(',')}`) }),
      ui.tabs({ label: 'Data views', layout: { height: uiFixed(180) }, onChange: id => mock.activate(id), tabs: [
        { id: 'list', label: 'List', badge: rows.length, content: ui.list({ label: 'Selectable orchards', items: rows, key: row => row.id, render: row => ui.text(row.name), onSelect: keys => mock.activate(keys.join(',')) }) },
        { id: 'tree', label: 'Tree', content: ui.tree({ label: 'World outliner', expanded: ['world'], nodes: [{ id: 'world', label: 'World', children: [{ id: 'orchard', label: 'Orchard', children: [{ id: 'press', label: 'Fruit Press' }] }, { id: 'cellar', label: 'Cellar' }] }], onSelect: id => mock.activate(id) }) },
      ] }),
      ui.button({ label: 'Inspect selection', onPress: () => mock.activate('inspect') }),
    ] });
  },
};
