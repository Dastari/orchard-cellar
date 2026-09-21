import { uiFixed } from '../../layout/box.js';
import type { UiLabSpecimen } from '../registry.js';
export const furnaceSpecimen: UiLabSpecimen = {
  id: 'furnace', title: 'Fruit Press / furnace layout', district: 'frames', size: { width: 720, height: 520 },
  build(ui, props, mock) {
    const progress = ui.progress({ tone: 'warning', value: 0.4 });
    return ui.frame({ style: 'wood_parchment',
      header: { title: 'Fruit Press', closable: true, draggable: true }, resizable: { min: { width: 96, height: 160 } },
      layout: { width: 'grow', height: 'grow', direction: 'row', wrap: true, gap: 8, padding: 8, overflow: 'scroll-y' }, children: [
        ui.flex({ direction: 'column', grow: 1, basis: uiFixed(80), gap: 6 }, [
          ui.text('Input', { role: 'header' }),
          ui.inventoryGrid({ container: 'press.input', slotSize: 'auto', columns: 'auto',
            cells: props['empty'] ? [] : Array.from({ length: 6 }, (_, index) => ({ id: String(index), ...(index < 3 ? { icon: { fantasy: 'star_full' as const } } : {}) })) }),
        ]),
        ui.flex({ direction: 'column', basis: uiFixed(96), gap: 6, align: 'center' }, [
          progress,
          ui.button({ label: props['longLabels'] ? 'Press selected fruit' : 'Press', tone: 'success', size: 'md', onPress: () => {
            progress.setProps({ value: Math.min(1, Number(progress.props['value']) + 0.1) }, false); mock.activate('press');
          } }),
        ]),
        ui.flex({ direction: 'column', grow: 1, basis: uiFixed(80), gap: 6 }, [
          ui.text('Output', { role: 'header' }),
          ui.inventoryGrid({ container: 'press.output', slotSize: 'auto', columns: 'auto' }),
        ]),
      ] });
  },
};
