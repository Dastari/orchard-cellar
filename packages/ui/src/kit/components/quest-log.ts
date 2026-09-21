import type { QuestLogEntry, QuestLogCallbacks } from '../../quest-log.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { scrollUiElement } from '../layout/scroll.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiList } from './collections.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
export interface UiQuestLogOptions extends QuestLogCallbacks {readonly entries:readonly QuestLogEntry[];readonly selected?:string|null;readonly onClose?:()=>void;readonly layout?:UiStyle}
export interface UiQuestLogElement extends UiElement {select(id:string):boolean;updateQuests(entries:readonly QuestLogEntry[]):void;readonly selectedQuest:string|null}
export function uiQuestLog(options:UiQuestLogOptions):UiQuestLogElement {
 let entries=options.entries,selected=options.selected??entries[0]?.id??null,key='',list:UiElement;
 const listHost=uiFlex({width:'grow',height:'grow',basis:uiFixed(180),minHeight:uiFixed(100)});
 const details=uiFlex({width:'grow',gap:8});
 const current=()=>entries.find(entry=>entry.id===selected);
 const pin=uiButton({label:'TRACK',size:'sm',onPress:()=>{const quest=current();if(quest)options.setPinned(quest.id,!quest.pinned);}});
 const drop=uiButton({label:'DROP QUEST',size:'sm',tone:'danger',onPress:()=>{const quest=current();if(quest)options.drop(quest.id);}});
 const detailScroll=uiScrollArea({width:'grow',height:'grow'},[details]);
 const refresh=()=>{
  for(const child of [...details.children])child.dispose();
  const quest=current();pin.setDisabled(!quest);drop.setDisabled(!quest);pin.setProps({label:quest?.pinned?'UNTRACK':'TRACK'});
  if(!quest){details.append(uiText('NO ACTIVE QUESTS'));return;}
  details.append(uiText(quest.title.toUpperCase(),{role:'header',wrap:true})).append(uiText(quest.state==='complete'?'READY TO TURN IN':'IN PROGRESS')).append(uiText(quest.summary,{wrap:true})).append(uiText('OBJECTIVES',{role:'header'}));
  for(const objective of quest.objectives)details.append(uiText(`${objective.complete?'[X]':'[ ]'} ${objective.progress?`${objective.progress} `:''}${objective.label}`,{wrap:true}));
  if(quest.rewards.length){details.append(uiText('REWARDS',{role:'header'}));for(const reward of quest.rewards)details.append(uiText(`- ${reward}`,{wrap:true}));}
 };
 const rebuild=(reveal=false)=>{
  const scroll=list?.scroll.y??0;list?.dispose();const index=Math.max(0,entries.findIndex(entry=>entry.id===selected));
  list=uiList({label:'Quests',items:entries,key:entry=>entry.id,selected:selected?[selected]:[],initialActive:index,initialScrollY:reveal?index*28:scroll,rowHeight:uiFixed(28),render:entry=>uiText(`${entry.state==='complete'?'!':entry.pinned?'*':'-'} ${entry.title}`),
   onActiveChange:index=>{selected=entries[index]?.id??null;scrollUiElement(detailScroll,0,0);refresh();},onSelect:(_keys,entry)=>{selected=entry.id;scrollUiElement(detailScroll,0,0);refresh();},

  });listHost.append(list);refresh();
 };
 const select=(id:string)=>{if(!entries.some(entry=>entry.id===id))return false;selected=id;rebuild(true);scrollUiElement(detailScroll,0,0);return true;};
 const updateQuests=(next:readonly QuestLogEntry[])=>{const nextKey=JSON.stringify(next);if(nextKey===key)return;key=nextKey;entries=next;if(!current())selected=entries[0]?.id??null;rebuild();};
 const frame=uiFrame({id:'game.quests',header:{title:'QUEST LOG',closable:true,onClose:options.onClose},resizable:{handles:'all',min:{width:240,height:200}},layout:{width:'grow',height:'grow',...options.layout},children:[uiFlex({direction:'row',wrap:true,width:'grow',height:'grow',gap:8},[listHost,uiFlex({width:'grow',height:'grow',basis:uiFixed(260),gap:8},[detailScroll,uiFlex({direction:'row',wrap:true,gap:4,shrink:0},[pin,drop])])])]});
 updateQuests(entries);return Object.defineProperty(Object.assign(frame,{select,updateQuests}),'selectedQuest',{get:()=>selected}) as UiQuestLogElement;
}
