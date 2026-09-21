import { UI_AUTHORED_FAMILIES, type UiAuthoredFamily } from '../../components/authored.js';
import type { UiLabSpecimen } from '../registry.js';
export const authoredSpecimen: UiLabSpecimen = {
  id: 'authored-catalog', title: 'Complete authored control families', district: 'authored', size: { width: 1120, height: 900 }, matrix: { family: UI_AUTHORED_FAMILIES },
  build(ui, props, mock) {
    return ui.frame({ header: { title: 'Authored art audit' }, layout: { width: 'grow', height: 'grow' }, children: [ui.authoredCatalog({ family: props['family'] as UiAuthoredFamily, art: mock.art, onSelect: name => mock.activate(name) })] });
  },
};
