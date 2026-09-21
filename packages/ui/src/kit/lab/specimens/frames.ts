import { uiFixed } from '../../layout/box.js';
import { UI_FRAME_STYLES, type UiSurfaceStyle } from '../../tokens.js';
import type { UiLabSpecimen } from '../registry.js';
export const framesSpecimen: UiLabSpecimen = {
  id: 'frames', title: 'Frames and responsive layout', district: 'frames', size: { width: 720, height: 440 }, matrix: { style: UI_FRAME_STYLES },
  build(ui, props, mock) {
    return ui.frame({ style: (props['style'] ?? 'wood_parchment') as UiSurfaceStyle,
      header: { title: 'Frame specimen', closable: true, draggable: true }, resizable: { handles: 'all', min: { width: 120, height: 100 } },
      layout: { width: 'grow', height: 'grow', gap: 8 }, children: [
        ui.text('Header, content and resize control stay inside the frame.'),
        ui.flex({ direction: 'row', wrap: true, gap: 8 }, [
          ui.button({ label: 'Primary', tone: 'primary', onPress: () => mock.activate('primary') }),
          ui.button({ label: 'Success', tone: 'success', onPress: () => mock.activate('success') }),
          ui.button({ label: 'Danger', tone: 'danger', onPress: () => mock.activate('danger') }),
        ]),
        ui.frame({ style: 'unframed', header: { title: 'Slots' }, layout: { width: 'grow', height: uiFixed(88) }, slots: {
          leading: ui.text('Leading / fit'), body: ui.text('Body / grow'), trailing: ui.text('Trailing / fit'),
        } }),
        ui.stack({ height: uiFixed(40), width: 'grow' }, [
          ui.text('Percent width', { layout: { width: { mode: 'percent', fraction: 0.5 } } }),
          ui.tooltip('A fixed viewport-clipped tooltip on an absolute child.', ui.button({ label: 'Absolute', size: 'sm', onPress: () => mock.activate('absolute') }), { position: 'absolute', inset: { right: 0, bottom: 0 } }),
        ]),
        ui.scrollArea({ height: 'grow', gap: 4 }, Array.from({ length: props['empty'] ? 0 : props['thousands'] ? 2000 : 16 }, (_, index) => ui.text(props['oversized'] ? `Scrollable row ${index + 1} `.repeat(16) : `Scrollable row ${index + 1}`))),
      ] });
  },
};
