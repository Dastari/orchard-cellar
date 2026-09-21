import { uiFixed } from '../../layout/box.js';
import { UI_TONES, UI_SIZES, type UiTone, type UiControlSize } from '../../tokens.js';
import type { UiLabSpecimen } from '../registry.js';
export const formsSpecimen: UiLabSpecimen = {
  id: 'form-controls', title: 'Choices and numeric controls', district: 'forms', size: { width: 800, height: 940 }, matrix: { tone: UI_TONES, size: UI_SIZES },
  build(ui, props, mock) {
    const tone = (props['tone'] ?? 'primary') as UiTone, size = (props['size'] ?? 'md') as UiControlSize;
    const report = (value: unknown) => mock.activate(`form:${String(value)}`);
    return ui.frame({ tone, header: { title: 'Choices and values' }, layout: { width: 'grow', height: 'grow', gap: 8, overflow: 'scroll-y' }, children: [
      ui.text('Space toggles. Arrows choose or adjust. Home/End reach limits.'),
      ui.checkbox({ label: 'Unchecked', tone, size, value: false, onChange: report }),
      ui.checkbox({ label: 'Checked', tone, size, value: true, onChange: report }),
      ui.checkbox({ label: 'Indeterminate', tone, size, value: 'indeterminate', onChange: report }),
      ui.checkbox({ label: 'Disabled', tone, size, disabled: true, value: true }),
      ui.radioGroup({ label: 'Harvest policy', tone, size, options: [{ value: 'ripe', label: 'Ripe' }, { value: 'all', label: 'All' }, { value: 'locked', label: 'Locked', disabled: true }], onChange: report }),
      ui.switch({ label: 'Auto harvest', tone, value: true, onChange: report }),
      ui.switch({ label: 'Disabled switch', tone, disabled: true }),
      ui.slider({ label: 'Volume', tone, value: 40, ticks: 6, valueLabel: true, onChange: report }),
      ui.flex({ direction: 'row', gap: 16 }, [ui.slider({ label: 'Vertical value', tone, orientation: 'vertical', value: 65, ticks: 5, valueLabel: true, onChange: report }), ui.slider({ label: 'Disabled slider', tone, value: 50, disabled: true, layout: { width: uiFixed(100) } })]),
      ui.stepper({ label: 'Batch size', tone, size, min: 1, max: 99, value: 6, onChange: report }),
    ] });
  },
};
export const fieldsSpecimen: UiLabSpecimen = {
  id: 'text-and-selection', title: 'Text editing and suggestions', district: 'forms', size: { width: 800, height: 940 }, matrix: { tone: UI_TONES, size: UI_SIZES },
  build(ui, props, mock) {
    const tone = (props['tone'] ?? 'neutral') as UiTone, size = (props['size'] ?? 'md') as UiControlSize;
    const options = props['empty'] ? [] : [{ value: 'apple', label: 'Apple', group: 'Fruit' }, { value: 'pear', label: 'Pear', group: 'Fruit' }, { value: 'mint', label: 'Mint', group: 'Herbs' }, { value: 'locked', label: 'Locked', disabled: true }];
    return ui.frame({ tone, header: { title: 'Fields and selection' }, layout: { width: 'grow', height: 'grow', gap: 8, overflow: 'scroll-y' }, children: [
      ui.input({ label: 'Name', placeholder: 'Name your orchard', tone, size, clearable: true, leading: ui.icon({ lucide: 'search' }), onChange: value => mock.activate(value), onSubmit: value => mock.activate(`submit:${value}`) }),
      ui.input({ label: 'Disabled name', value: 'Read only while locked', tone, size, disabled: true }),
      ui.input({ label: 'Invalid name', value: '!', error: 'Use at least three characters', size }),
      ui.text('Use at least three characters.'),
      ui.textArea({ label: 'Notes', value: props['longLabels'] ? 'Long wrapped note '.repeat(40) : 'A shared text editor.\nSelect, copy, paste and compose text.\nResize with its handle.', tone, rows: 5, lineCount: true, resizable: true, onChange: value => mock.activate(value) }),
      ui.select({ label: 'Crop', options, tone, value: 'apple', onChange: value => mock.activate(value) }),
      ui.combobox({ label: 'Find crop', tone, placeholder: 'Search or create a crop', options, suggestions: async (query, signal) => { await Promise.resolve(); return signal.aborted ? [] : options.filter(option => option.label.toLowerCase().includes(query.toLowerCase())); }, onChange: value => mock.activate(value), onCreate: value => mock.activate(`create:${value}`) }),
      ui.button({ label: 'Submit fields', tone: 'success', onPress: () => mock.activate('submit') }),
    ] });
  },
};
