import { UI_TONES, type UiTone } from '../../tokens.js';
import type { UiLabSpecimen } from '../registry.js';
export const feedbackSpecimen: UiLabSpecimen = {
  id: 'feedback', title: 'Meters, popovers, menus and toasts', district: 'feedback', size: { width: 800, height: 900 }, matrix: { tone: UI_TONES, open: [false, true] },
  build(ui, props, mock) {
    const tone = (props['tone'] ?? 'info') as UiTone;
    const items = [{ id: 'copy', label: 'Copy', onSelect: () => mock.activate('copy') }, { id: 'delete', label: 'Delete', tone: 'danger' as const, onSelect: () => mock.activate('delete') }];
    const menuButton = ui.button({ label: 'Open menu', tone, onPress: () => { menu.open(menuButton); mock.activate('menu'); } });
    const menu = ui.menu({ anchor: menuButton, items });
    const popButton = ui.button({ label: 'Show details', tone, onPress: () => { popover.open(popButton); mock.activate('popover'); } });
    const popover = ui.popover({ anchor: popButton, tone, content: ui.flex({ gap: 4 }, [ui.text('Popover content wraps and stays in its viewport.'), ui.button({ label: 'Done', onPress: () => { popover.close(); mock.activate('done'); } })]) });
    const toast = ui.toast({ message: 'Orchard saved.', tone, action: { id: 'undo', label: 'Undo', onSelect: () => mock.activate('undo') } });
    if (props['open']) menu.open(menuButton);
    return ui.frame({ tone, header: { title: 'Feedback' }, layout: { width: 'grow', height: 'grow', gap: 8, overflow: 'scroll-y' }, children: [
      ui.text('Meters retain their authored thickness. Toast actions pause timed dismissal while focused.'),
      ui.meter({ label: 'Pill', variant: 'pill', value: .6, tone }), ui.meter({ label: 'Thin', variant: 'thin', value: .4, tone }),
      ui.meter({ label: 'Segments', variant: 'segmented', value: .8, tone }), ui.meter({ label: 'Vitals', variant: 'vitals', value: .7, tone }),
      menuButton, menu, popButton, popover,
      ui.contextMenu(ui.button({ label: 'Right click / Shift+F10', onPress: () => mock.activate('context target') }), items),
      ui.button({ label: 'Show toast', tone, onPress: () => { toast.open(); mock.activate('toast'); } }), toast,
    ] });
  },
};
