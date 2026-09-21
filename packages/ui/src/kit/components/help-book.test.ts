import {expect,it} from 'vitest';
import {uiHelpBook,UI_HELP_BOOK_SOURCE} from './help-book.js';
import {HELP_TOPICS} from '../../help-book.js';
import {UiRoot} from '../runtime/root.js';
import {uiTestArt} from '../lab/testing/art.js';
it('includes all help topics and turns, clamps and resets spreads through the retained book',async()=>{
 const art=await uiTestArt(),root=new UiRoot({art,scale:1});root.resize(640,400);const frame=uiHelpBook({art});root.mount(frame);root.arrange();const book=root.entries().find(e=>e.element.kind==='book')!.element;
 for(const topic of HELP_TOPICS)expect(UI_HELP_BOOK_SOURCE).toContain(topic.title);
 expect(Number(book.props['spreadCount'])).toBeGreaterThan(1);expect(frame.handleHelpKey('KeyE')).toBe(true);root.arrange();expect(book.props['spread']).toBe(1);frame.handleHelpKey('KeyQ');root.arrange();expect(book.props['spread']).toBe(0);frame.handleHelpKey('End');root.arrange();expect(book.props['spread']).toBe(Number(book.props['spreadCount'])-1);frame.handleHelpKey('Home');root.arrange();expect(book.props['spread']).toBe(0);expect(frame.handleHelpKey('KeyF')).toBe(false);root.dispose();
});
