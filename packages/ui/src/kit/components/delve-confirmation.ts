import { uiDialog, type UiDialogOptions } from './overlays.js';
import { uiScrollArea, uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';

export interface UiDelveConfirmationOptions {
  readonly onBegin: () => void; readonly onCancel: () => void;
  readonly canBegin?: boolean;
  readonly layout?: UiDialogOptions['layout'];
}
export function uiDelveConfirmation(options: UiDelveConfirmationOptions) {
  const begin = uiButton({ id: 'delve-confirmation.begin', label: 'BEGIN DELVE', tone: 'success',
    disabled: options.canBegin === false, onPress: () => { if (!begin.disabled) options.onBegin(); }, layout: { width: 'grow' } });
  const dialog = uiDialog({ id: 'game.delve-confirmation', title: 'START DELVE', tone: 'primary', open: true,
    dismissOnBackdrop: false, onClose: options.onCancel, layout: options.layout, children: [
      uiScrollArea({ gap: 8, height: 'fit' }, [
        uiText('BEGIN A SOLO DELVE?', { wrap: true }),
        uiText('12 ROOMS. HOME RECIPE ON FIRST WIN.', { wrap: true }),
        uiText('BOONS AND EMBERS LAST FOR THIS RUN.', { wrap: true }),
        uiText('YOU RETURN HERE WHEN THE RUN ENDS.', { wrap: true }),
        uiFlex({ direction: 'row', wrap: true, gap: 4, width: 'grow' }, [begin,
          uiButton({ id: 'delve-confirmation.cancel', label: 'CANCEL', onPress: () => dialog.close(), layout: { width: 'grow' } }),
        ]),
      ]),
    ],
  });
  dialog.setProps({ singlePointer: true, touchScroll: true });
  return Object.assign(dialog, { updateCanBegin(value: boolean) { begin.setDisabled(!value); }, focusBegin() { begin.requestFocus(); } });
}
