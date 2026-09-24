import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiWindow, type UiWindowElement } from './window.js';
export interface UiUpdateReadyOptions {
  readonly onRefresh: () => void;
  readonly onLater: () => void;
  readonly layout?: UiStyle;
}
/** An update decision stays above gameplay; the wooden close and Escape are equivalent to Later. */
export function uiUpdateReady(options: UiUpdateReadyOptions): UiWindowElement {
  const later = () => { if (!dialog.visible) return; dialog.setStyle({ visible: false }); options.onLater(); };
  const dialog = uiWindow({ id: 'game.update-ready', title: 'UPDATE READY', onClose: later,
    layout: { direction: 'column', gap: 8, width: uiFixed(200), maxWidth: { mode: 'percent', fraction: 1 }, ...options.layout }, children: [
      uiText('A new version of Orchard & Cellar is ready. Reload to update; your progress is saved.', { wrap: true, layout: { width: 'grow' } }),
      uiFlex({ direction: 'row', gap: 4, justify: 'end', alignSelf: 'stretch' }, [
        uiButton({ id: 'update-ready.later', label: 'Later', tone: 'primary', onPress: later }),
        uiButton({ id: 'update-ready.refresh', label: 'Reload', tone: 'success', onPress: options.onRefresh }),
      ]),
    ] });
  Object.assign(dialog.hooks, { onDismiss: later });
  dialog.setProps({ singlePointer: true, touchScroll: true });
  return dialog;
}
