import type { UiStyle } from '../layout/box.js';
import { uiFixed } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { uiButton } from './button.js';
import { uiFrame } from './frame.js';
export interface UiActionNoticeOptions {
  readonly id: string;
  readonly message: string;
  readonly tone?: UiTone;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
  readonly layout?: UiStyle;
}
/** A controlled announcement: the host owns its lifetime and action. */
export function uiActionNotice(options: UiActionNoticeOptions) {
  const tone = options.tone ?? 'info';
  return uiFrame({ id: options.id, tone, style: 'thin', blockInput: true,
    layout: { direction: 'row', gap: 4, width: 'grow', height: 'fit', ...options.layout },
    children: [uiButton({ id: `${options.id}:open`, label: options.message, tone, activateOn: 'down',
      onPress: options.onOpen, layout: { width: 'grow' } }),
    uiButton({ id: `${options.id}:dismiss`, label: 'Dismiss', ariaLabel: 'Dismiss notice', tone,
      activateOn: 'down', onPress: options.onDismiss, layout: { width: uiFixed(64), shrink: 0 } })],
  });
}
