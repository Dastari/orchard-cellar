import {expect,it,vi} from 'vitest';
import {uiHelpBook,UI_HELP_BOOK_SOURCE,UI_HELP_CHAPTERS} from './help-book.js';
import {HELP_TOPICS} from '../../help-book.js';
import {UiRoot} from '../runtime/root.js';
import {uiTestArt} from '../lab/testing/art.js';
// Authored links are exercised with a real help-topic source rather than adding fake production links.
vi.mock('../../help-topics.js',async original=>{const actual=await original<typeof import('../../help-topics.js')>();return{HELP_TOPICS:[
 {title:'MOVEMENT',entries:['Read the [Website](https://example.com/) or turn to [crafting](#crafting).','- / + changes zoom.']},
 ...actual.HELP_TOPICS.filter(topic=>topic.title!=='MOVEMENT')]};});
it('includes all help topics and turns, clamps and resets topics through the retained book',async()=>{
 const art=await uiTestArt(),root=new UiRoot({art,scale:1});root.resize(640,400);const frame=uiHelpBook({art});root.mount(frame);root.arrange();
 for(const topic of HELP_TOPICS)expect(UI_HELP_BOOK_SOURCE.toUpperCase()).toContain(topic.title);
 const all=UI_HELP_CHAPTERS.flatMap(chapter=>chapter.topics);expect(all).toHaveLength(HELP_TOPICS.length);
 expect(frame.handleHelpKey('KeyE')).toBe(true);expect(frame.topic).toBe(all[1]!.id);frame.handleHelpKey('KeyQ');expect(frame.topic).toBe(all[0]!.id);
 frame.handleHelpKey('End');expect(frame.topic).toBe(all.at(-1)!.id);frame.handleHelpKey('Home');expect(frame.topic).toBe(all[0]!.id);
 frame.handleHelpKey('End');frame.reset();expect(frame.topic).toBe(all[0]!.id);expect(frame.chapter).toBe(UI_HELP_CHAPTERS[0]!.id);
 expect(frame.handleHelpKey('KeyF')).toBe(false);expect(frame.openTopic('missing')).toBe(false);root.dispose();
});
it('forwards authored links, opens page links on their topic and keeps plain entries literal',async()=>{
 const art=await uiTestArt(),root=new UiRoot({art,scale:1});root.resize(640,400);const link=vi.fn(),frame=uiHelpBook({art,onLink:link});root.mount(frame);root.arrange();
 const labels=root.entries().map(e=>e.element).filter(e=>e.kind==='text').map(e=>e.label);expect(labels).toContain('- / + changes zoom.');
 const links=root.entries().map(e=>e.element).filter(e=>e.kind==='book-link');expect(links.map(e=>e.label)).toEqual(['Website','crafting']);
 root.focus.set(links[0]!);root.key({key:'Enter'});expect(link).toHaveBeenCalledExactlyOnceWith({kind:'url',href:'https://example.com/'});expect(frame.topic).toBe('movement');
 root.focus.set(links[1]!);root.key({key:'Enter'});root.arrange();expect(link).toHaveBeenLastCalledWith({kind:'page',anchor:'crafting'});
 expect(frame.topic).toBe('crafting');expect(frame.chapter).toBe('crafting');expect(root.focus.current?.id).toBe('game.help.topic.crafting');root.dispose();
});
