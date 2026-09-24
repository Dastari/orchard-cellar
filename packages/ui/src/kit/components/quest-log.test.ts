import {expect,it,vi} from 'vitest';
import {uiQuestLog} from './quest-log.js';
import {UiRoot} from '../runtime/root.js';
import type {QuestLogEntry} from '../../quest-log.js';
it('reveals tracker selections, navigates quests and applies actions to current authority',()=>{
 const entries:QuestLogEntry[]=Array.from({length:30},(_,i)=>({id:`quest${i}`,title:`Quest ${i}`,summary:'Gather apples',state:'active',pinned:false,objectives:[{label:'Apples',complete:false,progress:'1/3'}],rewards:['Fruit','Coins','Experience','Seeds']}));
 const setPinned=vi.fn(),drop=vi.fn(),navigate=vi.fn(),root=new UiRoot({scale:1});root.resize(640,400);const frame=uiQuestLog({entries,setPinned,drop,onNavigate:navigate});root.mount(frame);root.arrange();
 expect(frame.select('missing')).toBe(false);expect(frame.select('quest29')).toBe(true);frame.focusQuests();root.arrange();const list=root.entries().map(e=>e.element).find(e=>e.label==='Quests'&&e.kind==='scroll-area')!;expect(list.scroll.y).toBeGreaterThan(0);
 expect(root.focus.current?.id).toBe('quests.row.quest29');root.key({key:'ArrowUp'});root.arrange();expect(frame.selectedQuest).toBe('quest28');expect(root.focus.current?.id).toBe('quests.row.quest28');
 const press=(label:string)=>{const button=root.entries().map(e=>e.element).find(e=>e.kind==='button'&&e.props['label']===label)!;root.focus.set(button,'keyboard');root.key({key:'Enter'});};press('Pin');expect(setPinned).toHaveBeenCalledWith('quest28',true);
 frame.updateQuests(entries.map(entry=>({...entry,pinned:true})));root.arrange();press('Unpin');expect(setPinned).toHaveBeenLastCalledWith('quest28',false);press('Abandon');expect(drop).toHaveBeenCalledWith('quest28');
 root.focus.set(root.entries().find(e=>e.element.id==='book.tab.statistics')!.element);root.key({key:'Enter'});expect(navigate).toHaveBeenCalledWith('statistics');
 frame.updateQuests([]);root.arrange();expect(frame.selectedQuest).toBeNull();expect(root.entries().some(e=>e.element.label==='No active quests')).toBe(true);root.dispose();
});
it('resizes both leaves in place, keeping nodes and focus',()=>{
 const entries:QuestLogEntry[]=[{id:'a',title:'A',summary:'S',state:'active',pinned:false,objectives:[],rewards:[]}];
 const root=new UiRoot({scale:1});root.resize(640,400);const frame=uiQuestLog({entries,setPinned:vi.fn(),drop:vi.fn(),page:{width:200,height:248}});root.mount(frame);frame.focusQuests();root.arrange();
 const book=root.entries().find(e=>e.element.id==='quests.book')!.element,focused=root.focus.current;expect(book.rect.width).toBe(456);
 frame.setBookPage({width:160,height:200});root.arrange();expect(book.rect.width).toBe(376);expect(book.rect.height).toBe(232);expect(root.focus.current).toBe(focused);root.dispose();
});
