import { uiFixed } from '../../layout/box.js';
import type { UiLabSpecimen } from '../registry.js';
export const patternsSpecimen: UiLabSpecimen = {
  id: 'dialogs', title: 'Confirm, danger and prompt', district: 'patterns', size: { width: 800, height: 720 }, matrix: { pattern: ['confirm', 'danger', 'prompt'], open: [false, true] },
  build(ui, props, mock) {
    const dialog = props['pattern'] === 'prompt' ? ui.prompt({ title: 'Rename orchard', label: 'Orchard name', value: 'Sunny Orchard', onConfirm: value => mock.activate(value) })
      : ui.confirm({ title: props['pattern'] === 'danger' ? 'Delete orchard?' : 'Save changes?', message: props['longLabels'] ? 'This message wraps. '.repeat(20) : 'Review this action before continuing.', danger: props['pattern'] === 'danger', onConfirm: () => mock.activate('confirm') });
    const open = ui.button({ label: 'Open dialog', tone: props['pattern'] === 'danger' ? 'danger' : 'primary', onPress: () => { dialog.open(open); mock.activate('opened'); } });
    if (props['open']) dialog.open(open);
    return ui.frame({ style: 'parchment_plain', header: { title: 'Dialog patterns' }, layout: { width: 'grow', height: 'grow', gap: 8 }, children: [
      ui.text('Tab is trapped while a dialog is open. Escape, close and backdrop restore its opener.'), open, dialog,
    ] });
  },
};
export const compositionPatternsSpecimen: UiLabSpecimen = {
  id: 'composition-patterns', title: 'Forms, master detail and window focus', district: 'patterns', size: { width: 960, height: 900 }, matrix: { pattern: ['form', 'master-detail', 'settings', 'search-list', 'windows'] },
  build(ui, props, mock) {
    const detail = ui.text('Choose an orchard'), rows = ['Sunny Orchard', 'Cellar Garden', 'Old Grove'];
    const list = ui.list({ label: 'Orchards', items: rows, key: value => value, render: value => ui.text(value), onSelect: (_keys, value) => { detail.setProps({ text: `${value}: trees, fruit and cellar supplies.` }); mock.activate(value); }, onActivate: mock.activate });
    if (props['pattern'] === 'form') {
      let value = '';
      const dialog = ui.dialog({ title: 'New orchard', children: [ui.flex({ gap: 8 }, [ui.input({ label: 'Name', onChange: next => { value = next; } }), ui.checkbox({ label: 'Public orchard', onChange: checked => mock.activate(String(checked)) }), ui.button({ label: 'Create orchard', tone: 'success', onPress: () => { mock.activate(value || 'created'); dialog.close(); } })])] });
      const open = ui.button({ label: 'New orchard', onPress: () => { dialog.open(open); mock.activate('open-form'); } }); return ui.frame({ header: { title: 'Form dialog' }, children: [open, dialog] });
    }
    if (props['pattern'] === 'windows') return ui.windowStack({ width: 'grow', height: 'grow' }, [
      ui.frame({ header: { title: 'Orchard', draggable: true }, layout: { width: { mode: 'percent', fraction: .6 }, height: { mode: 'percent', fraction: .6 } }, children: [ui.button({ label: 'Inspect orchard', onPress: () => mock.activate('orchard') })] }),
      ui.frame({ header: { title: 'Cellar', draggable: true }, layout: { width: { mode: 'percent', fraction: .6 }, height: { mode: 'percent', fraction: .6 }, position: 'absolute', inset: { left: uiFixed(80), top: uiFixed(60) } }, children: [ui.button({ label: 'Inspect cellar', onPress: () => mock.activate('cellar') })] }),
    ]);
    if (props['pattern'] === 'settings') return ui.frame({ header: { title: 'Settings rows' }, children: [ui.switch({ label: 'Show names', value: true, onChange: value => mock.activate(String(value)) }), ui.slider({ label: 'Music volume', value: .7, min: 0, max: 1, step: .01, valueLabel: true, onChange: value => mock.activate(String(value)) }), ui.button({ label: 'Save settings', onPress: () => mock.activate('save-settings') })] });
    return ui.frame({ header: { title: props['pattern'] === 'search-list' ? 'Search and list' : 'Master detail' }, layout: { width: 'grow', height: 'grow', gap: 8 }, children: [
      ...(props['pattern'] === 'search-list' ? [ui.input({ label: 'Find orchard', onChange: query => list.setProps({ items: rows.filter(row => row.toLowerCase().includes(query.toLowerCase())) }) })] : []),
      ui.flex({ direction: 'row', wrap: true, gap: 8, width: 'grow', height: 'grow' }, [list, detail]),
    ] });
  },
};
