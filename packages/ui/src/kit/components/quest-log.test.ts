import {expect,it,vi} from 'vitest';
import {uiQuestLog} from './quest-log.js';
import {UiRoot} from '../runtime/root.js';
import type {QuestLogEntry} from '../../quest-log.js';
it('reveals tracker selections, navigates quests and applies actions to current authority',()=>{
 const entries:QuestLogEntry[]=Array.from({length:30},(_,i)=>({id:`quest${i}`,title:`Quest ${i}`,summary:'Gather apples',state:'active',pinned:false,objectives:[{label:'Apples',complete:false,progress:'1/3'}],rewards:['Fruit','Coins','Experience','Seeds']}));
 const setPinned=vi.fn(),drop=vi.fn(),root=new UiRoot({scale:1});root.resize(640,400);const frame=uiQuestLog({entries,setPinned,drop});root.mount(frame);root.arrange();
 expect(frame.select('missing')).toBe(false);expect(frame.select('quest29')).toBe(true);root.arrange();const list=root.entries().map(e=>e.element).find(e=>e.label==='Quests')!;expect(list.scroll.y).toBeGreaterThan(0);
 root.focus.set(list,'keyboard');root.key({key:'ArrowUp'});root.arrange();expect(frame.selectedQuest).toBe('quest28');
 const press=(label:string)=>{const button=root.entries().map(e=>e.element).find(e=>e.kind==='button'&&e.props['label']===label)!;root.focus.set(button,'keyboard');root.key({key:'Enter'});};press('TRACK');expect(setPinned).toHaveBeenCalledWith('quest28',true);
 frame.updateQuests(entries.map(entry=>({...entry,pinned:true})));root.arrange();press('UNTRACK');expect(setPinned).toHaveBeenLastCalledWith('quest28',false);press('DROP QUEST');expect(drop).toHaveBeenCalledWith('quest28');
 frame.updateQuests([]);root.arrange();expect(frame.selectedQuest).toBeNull();expect(root.entries().some(e=>e.element.label==='NO ACTIVE QUESTS')).toBe(true);root.dispose();
});
