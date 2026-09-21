import { uiFixed } from '../../layout/box.js';
import type { UiLabSpecimen } from '../registry.js';
export const workbenchSpecimen: UiLabSpecimen = {
  id: 'studio-workbench', title: 'Studio rail and floating drawers', district: 'patterns', size: { width: 1280, height: 1000 },
  matrix: { view: ['desktop', 'phone-controls', 'phone-inspector', 'phone-workspace', 'split-row', 'split-column'] },
  build(ui, props, mock) {
    const view = String(props['view'] ?? 'desktop');
    return ui.workbench({
      layout: { width: view.startsWith('phone') ? uiFixed(195) : 'grow', height: 'grow' },
      activeDrawer: view === 'phone-inspector' ? 'inspector' : view === 'phone-workspace' ? 'none' : 'controls',
      navigation: ['Map', 'Objects', 'Terrain', 'Actors', 'Items', 'Audio', 'Narrative', 'Observe', 'UI Lab'].map((label, index) => ({
        id: label, label, icon: { cf: index === 0 ? 'star' : index === 8 ? 'gear' : 'book' }, selected: index === 0, onPress: () => mock.activate(label),
      })),
      workspace: view.startsWith('split-') ? ui.splitPane({ label: 'Editor panes', direction: view === 'split-row' ? 'row' : 'column',
        first: ui.frame({ style: 'grey_plain', layout: { width: 'grow', height: 'grow' }, children: [ui.text('Primary workspace')] }),
        second: ui.frame({ tone: 'neutral', layout: { width: 'grow', height: 'grow' }, children: [ui.text('Secondary workspace')] }),
        onResize: ratio => mock.activate(`split:${ratio}`),
      }) : ui.frame({ style: 'grey_plain', layout: { width: 'grow', height: 'grow', padding: 4 }, children: [
        ui.text('WORKSPACE', { role: 'header', align: 'center', layout: { width: 'grow' } }),
        ui.text('The canvas extends behind both floating drawers. Resize either inside edge with a pointer or arrow keys.', { layout: { width: 'grow' } }),
      ] }),
      controls: { title: 'Map editor', content: ui.flex({ gap: 4, width: 'grow' }, [
        ui.flex({ direction: 'row', gap: 4, wrap: true }, ['Save', 'Restore', 'Split'].map(label => ui.button({ label, size: 'sm', onPress: () => mock.activate(label) }))),
        ui.input({ label: 'Find asset', placeholder: 'Find asset', onChange: mock.activate }),
        ...Array.from({ length: 20 }, (_, index) => ui.button({ label: `Tool ${index + 1}`, onPress: () => mock.activate(`tool-${index}`), layout: { width: 'grow', shrink: 0 } })),
      ]) },
      inspector: { title: 'Selection', content: ui.flex({ gap: 8, width: 'grow' }, [ui.text('KIND: tile'), ui.text('Apple tree'), ui.input({ label: 'Name', value: 'Apple tree', onChange: mock.activate }), ui.checkbox({ label: 'Visible', value: true, onChange: value => mock.activate(String(value)) })]) },
      onDrawerResize: (side, width) => mock.activate(`${side}:${width.size}`),
    });
  },
};
