import { UI_TONES, UI_SIZES, UI_SHAPES, type UiTone, type UiControlSize, type UiShape } from '../../tokens.js';
import type { UiLabSpecimen } from '../registry.js';
export const controlsSpecimen: UiLabSpecimen = {
  id: 'controls', title: 'Buttons and icon controls', district: 'controls', size: { width: 600, height: 440 },
  matrix: { tone: UI_TONES, size: UI_SIZES, shape: UI_SHAPES },
  build(ui, props, mock) {
    const tone = (props['tone'] ?? 'primary') as UiTone, size = (props['size'] ?? 'md') as UiControlSize, shape = (props['shape'] ?? 'chamfered') as UiShape;
    return ui.frame({ tone, header: { title: 'Controls' }, layout: { width: 'grow', height: 'grow', overflow: 'scroll-y', gap: 8 }, children: [
      ui.text('Tab to focus. Enter or Space to activate.'),
      ui.button({ label: props['longLabels'] ? 'An unusually long action label that must be clipped' : 'Activate', tone, size, shape, onPress: () => mock.activate('button') }),
      ui.button({ label: 'Loading', tone, size, shape, loading: true }),
      ui.button({ label: 'Adorned', tone, size, shape, leading: ui.icon({ cf: 'heart', level: 2 }), trailing: ui.text('+'), onPress: () => mock.activate('adorned') }),
      ui.button({ label: 'Disabled', tone, size, shape, disabled: true }),
      ui.iconButton({ lucide: 'visibility' }, { label: 'Inspect', tone, size, shape, onPress: () => mock.activate('search') }),
    ] });
  },
};
