import { HELP_TOPICS } from '../../help-book.js';
import { uiBook } from './book.js';
import { uiFrame } from './frame.js';
import type { UiKitArt } from './art.js';
import type { UiStyle } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
export const UI_HELP_BOOK_SOURCE=HELP_TOPICS.map(topic=>`## ${topic.title}\n\n${topic.entries.map(entry=>`- ${entry}`).join('\n')}`).join('\n\n');
export interface UiHelpBookOptions {readonly art?:UiKitArt;readonly onClose?:()=>void;readonly layout?:UiStyle}
export interface UiHelpBookElement extends UiElement {handleHelpKey(code:string):boolean}
export function uiHelpBook(options:UiHelpBookOptions):UiHelpBookElement {
 const book=uiBook({id:'game.help.pages',source:UI_HELP_BOOK_SOURCE,art:options.art});
 const handleHelpKey=(code:string)=>{const key=code==='KeyQ'?'ArrowLeft':code==='KeyE'?'ArrowRight':code;if(!['ArrowLeft','ArrowRight','PageUp','PageDown','Home','End'].includes(key))return false;return book.hooks.onKey?.({key},book)??false;};
 const frame=uiFrame({id:'game.help',header:{title:'ORCHARD GUIDE',closable:true,onClose:options.onClose},layout:{width:'grow',height:'grow',...options.layout},children:[book]});return Object.assign(frame,{handleHelpKey});
}
