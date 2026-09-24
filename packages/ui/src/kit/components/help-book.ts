import { HELP_TOPICS } from '../../help-topics.js';
import type { UiTextLinkTarget } from '../../design-system/rich-text.js';
import { uiBook } from './book.js';
import { uiFrame } from './frame.js';
import type { UiKitArt } from './art.js';
import type { UiStyle } from '../layout/box.js';
import { UiElement } from '../runtime/element.js';
export const UI_HELP_BOOK_SOURCE = HELP_TOPICS.map(topic => `## ${topic.title}\n\n${topic.entries.map(entry => `- ${entry}`).join('\n')}`).join('\n\n');
export interface UiHelpBookOptions {
  readonly art?: UiKitArt; readonly onClose?: () => void; readonly onLink?: (target: UiTextLinkTarget) => void; readonly layout?: UiStyle;
}
export interface UiHelpBookElement extends UiElement { handleHelpKey(code: string): boolean; reset(): void; focusBook(): void }
export function uiHelpBook(options: UiHelpBookOptions): UiHelpBookElement {
  const book = uiBook({ id: 'game.help.pages', source: UI_HELP_BOOK_SOURCE, art: options.art, onLink: target => { if (target.kind === 'page') book.requestFocus(); options.onLink?.(target); } });
  const handleHelpKey = (code: string) => {
    const key = code === 'KeyQ' || code.toLowerCase() === 'q' ? 'ArrowLeft' : code === 'KeyE' || code.toLowerCase() === 'e' ? 'ArrowRight' : code;
    if (!['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(key)) return false;
    const handled = book.hooks.onKey?.({ key }, book) ?? false;
    if (handled) book.requestFocus();
    return handled;
  };
  const frame = uiFrame({ id: 'game.help.frame', blockInput: true, header: { title: 'ORCHARD GUIDE', closable: true, onClose: options.onClose },
    layout: { width: 'grow', height: 'grow', overflow: 'scroll-y', padding: 0 }, children: [book] });
  const host = new UiElement({ id: 'game.help', kind: 'help-book', label: 'ORCHARD GUIDE',
    style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout }, children: [frame],
    onKeyCapture(event) {
      if (event.key.toLowerCase() === 'x') { options.onClose?.(); return true; }
      return handleHelpKey(event.key);
    },
  });
  return Object.assign(host, { handleHelpKey, reset: () => { handleHelpKey('Home'); }, focusBook: () => { frame.setStyle({ visible: true }); book.requestFocus(); } });
}
