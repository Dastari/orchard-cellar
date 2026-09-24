import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiLedgerRow } from './character-book.js';
import { uiWindow } from './window.js';

export interface UiDelveConfirmationOptions {
  readonly onBegin: () => void; readonly onCancel: () => void;
  readonly canBegin?: boolean;
  readonly layout?: UiStyle;
}
/** Solo Delve entry: what the run is, its ledger, then Stay or Delve. The wooden close and Escape stay. */
export function uiDelveConfirmation(options: UiDelveConfirmationOptions) {
  const cancel = () => { if (!dialog.visible) return; dialog.setStyle({ visible: false }); options.onCancel(); };
  const begin = uiButton({ id: 'delve-confirmation.begin', label: 'Delve', tone: 'danger',
    disabled: options.canBegin === false, onPress: () => { if (!begin.disabled) options.onBegin(); } });
  const dialog = uiWindow({ id: 'game.delve-confirmation', title: 'THE CELLAR DELVE', onClose: cancel,
    layout: { direction: 'column', gap: 6, width: uiFixed(220), maxWidth: { mode: 'percent', fraction: 1 }, ...options.layout }, children: [
      uiText('Twelve rooms beneath the old cellar. Boons and embers last for this run; you return here when it ends.', { wrap: true, layout: { width: 'grow' } }),
      uiLedgerRow('Rooms', '12'), uiLedgerRow('First win', 'Home recipe'), uiLedgerRow('Entry', 'Free'),
      uiFlex({ direction: 'row', gap: 4, justify: 'end', alignSelf: 'stretch' }, [
        uiButton({ id: 'delve-confirmation.cancel', label: 'Stay', tone: 'primary', onPress: cancel }), begin,
      ]),
    ] });
  Object.assign(dialog.hooks, { onDismiss: cancel });
  dialog.setProps({ singlePointer: true, touchScroll: true });
  return Object.assign(dialog, { updateCanBegin(value: boolean) { begin.setDisabled(!value); }, focusBegin() { begin.requestFocus(); } });
}
