import { uiDialog, type UiDialogOptions } from './overlays.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
export interface UiUpdateReadyOptions {
  readonly onRefresh: () => void;
  readonly onLater: () => void;
  readonly layout?: UiDialogOptions['layout'];
}
/** An update decision stays above gameplay; closing is equivalent to Later. */
export function uiUpdateReady(options: UiUpdateReadyOptions) {
  const dialog = uiDialog({ id: 'game.update-ready', title: 'UPDATE READY', tone: 'primary', open: true,
    dismissOnBackdrop: false, onClose: options.onLater, layout: options.layout,
    children: [uiScrollArea({gap:8,height:'fit'}, [
      uiText('A NEW ORCHARD VERSION IS READY.', {wrap:true}),
      uiText('REFRESH NOW TO USE IT, OR CONTINUE SAFELY.', {wrap:true}),
      uiFlex({direction:'row',wrap:true,width:'grow',gap:4},[
        uiButton({id:'update-ready.refresh',label:'REFRESH NOW',tone:'success',layout:{width:'grow'},onPress:options.onRefresh}),
        uiButton({id:'update-ready.later',label:'LATER',layout:{width:'grow'},onPress:()=>dialog.close()}),
      ]),
    ])],
  });
  return dialog;
}
