import { uiFixed } from '../../layout/box.js';
import type { UiLabSpecimen } from '../registry.js';
export const foundationsSpecimen: UiLabSpecimen = {
  id: 'foundations', title: 'Type, rhythm and links', district: 'foundations', size: { width: 640, height: 480 }, matrix: { fit: ['contain', 'cover', 'none', 'tile'] },
  build(ui, props, mock) {
    return ui.frame({ style: 'parchment_plain', header: { title: 'Orchard UI Kit' }, layout: { width: 'grow', height: 'grow', overflow: 'scroll-y', gap: 8 }, children: [
      ui.text('Shared canvas foundations', { role: 'header' }),
      ui.text(props['longLabels'] ? 'Long labels wrap within their arranged box. '.repeat(8) : '5x7 body. 8x12 headers. Integer scale. Clipped by default.'),
      ui.text('Clipped, without ellipsis: a deliberately long phrase', { overflow: 'clip', outline: true, layout: { width: uiFixed(120) } }),
      ui.text('An ellipsized line with a long phrase', { overflow: 'ellipsis', align: 'right', layout: { width: uiFixed(120) } }),
      ui.separator(),
      ui.richText('Open [[page:controls|the controls district]] to explore keyboard interaction.', { onLink: () => mock.activate('controls') }),
      ui.flex({ direction: 'row', gap: 8 }, [ui.icon({ cf: 'heart', level: 2 }), ui.icon({ fantasy: 'star_full' }), ui.icon({ lucide: 'visibility' }), ...(mock.art ? [ui.image(mock.art.icons.box.image, { width: 24, height: 24 }, { label: `Image fit: ${String(props['fit'] ?? 'contain')}`, fit: (props['fit'] ?? 'contain') as 'contain' | 'cover' | 'none' | 'tile', integerScale: true, layout: { width: uiFixed(64), height: uiFixed(32) } })] : [])]),
      ui.tooltip('Tooltips follow pointer and keyboard focus.', ui.button({ label: 'Explore controls', tone: 'primary', onPress: () => mock.activate('controls') })),
    ] });
  },
};
