import type { UiTone } from '../../tokens.js';
import { UI_TONES } from '../../tokens.js';
import type { UiLabSpecimen } from '../registry.js';
export const anchorsSpecimen: UiLabSpecimen = {
  id: 'world-anchors', title: 'Speech, ribbons and world feedback', district: 'feedback', size: { width: 880, height: 860 }, matrix: { tone: UI_TONES, tail: ['up','down','left','right'] },
  build(ui, props, mock) {
    const tone = props['tone'] as UiTone;
    return ui.frame({ header: { title: 'World anchors' }, layout: { width: 'grow', height: 'grow' }, children: [ui.scrollArea({ gap: 8 }, [
      ui.speechBubble({ name: 'Mara', text: 'The orchard is ready. Bring your fruit to the press. '.repeat(props['longLabels'] ? 8 : 2), tone, tail: props['tail'] as 'up' | 'down' | 'left' | 'right' }),
      ui.speechBubble({ text: 'Mara — Orchard keeper', tone, nameplate: true }), ui.ribbon({ label: 'SANCTUARY', tone }), ui.banner({ label: 'Orchard & Cellar', subtitle: 'Early autumn', tone }), ui.badge({ label: 'Well rested', tone }),
      ui.flex({ direction: 'row', gap: 8 }, [ui.loadingSpinner(), ui.crosshair()]), ui.button({ label: 'Inspect anchor', onPress: () => mock.activate('anchor') }),
    ])] });
  },
};
export const touchSpecimen: UiLabSpecimen = {
  id: 'touch-actions', title: 'Simultaneous touch and keyboard actions', district: 'feedback', size: { width: 760, height: 420 },
  build(ui, _props, mock) {
    const status = ui.text('Move and act with separate pointers.');
    return ui.frame({ header: { title: 'Touch controls' }, layout: { width: 'grow', height: 'grow', gap: 8 }, children: [status, ui.touchControls({ onDirection: direction => { status.setProps({ text: direction }); mock.activate(direction); }, onAction: action => mock.activate(action) })] });
  },
};
