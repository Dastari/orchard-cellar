import { SKILL_TRACKS, availableSkillPoints, skillExperienceForLevel, skillLevelForExperience, skillNodeIsImplemented, skillNodesForTrack, skillPurchaseRejection, skillRespecCostBronze, type SkillTrack } from '@orchard/sim';
import type { SkillTreeModel, SkillTreeCallbacks } from '../../skill-tree-ui.js';
import type { LoadedAsset } from '../../assets.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiButton } from './button.js';
import { uiText } from './text.js';
import { uiMeter } from './meter.js';
import { uiSkillGraph, type UiSkillGraphElement } from './skill-graph.js';
export interface UiSkillsOptions extends SkillTreeCallbacks {
 readonly model:SkillTreeModel;readonly track?:SkillTrack;readonly artwork?:Readonly<Record<string,LoadedAsset>>;
 readonly onNavigate?:(page:'character'|'skills'|'statistics')=>void;readonly onClose?:()=>void;readonly layout?:UiStyle;
}
export interface UiSkillsElement extends UiElement { readonly selectedTrack:SkillTrack;selectTrack(track:SkillTrack):void;updateSkills(model:SkillTreeModel):void }
export function uiSkills(options:UiSkillsOptions):UiSkillsElement {
 let model=options.model,track=options.track??'explorer',selected:string|null=null,key='';
 let graph:UiSkillGraphElement;
 const progress=()=>model.tracks.find(entry=>entry.track===track)??{track,experience:0n,spentPoints:0,bonusPoints:0,respecCount:0};
 const ranks=()=>Object.fromEntries(model.ranks.map(entry=>[entry.nodeId,entry.rank]));
 const selectedNode=()=>skillNodesForTrack(track).find(node=>node.id===selected);
 const canLearn=()=>selected!==null&&skillPurchaseRejection(selected,{...progress(),ranks:ranks()})===null;
 const canReset=()=>progress().spentPoints>0&&model.balanceBronze>=skillRespecCostBronze(progress().respecCount);
 const heading=uiText('',{wrap:true}),xpLabel=uiText(''),xp=uiMeter({label:'Skill experience',value:0,tone:'warning'});
 const detail=uiFlex({width:'grow',gap:4});
 const learn=uiButton({label:'LEARN 1 RANK',tone:'success',size:'sm',layout:{width:'grow'},onPress:()=>{if(canLearn())options.purchase(selected!);}});
 const reset=uiButton({label:'RESET TREE',tone:'danger',size:'sm',layout:{width:'grow'},onPress:()=>{if(canReset())options.reset(track);}});
 const graphHost=uiFlex({width:'grow',height:'grow',minHeight:uiFixed(180)},[]);
 const tabs=uiFlex({direction:'row',wrap:true,width:'grow',gap:4,shrink:0});
 const refresh=()=>{
  const p=progress(),level=skillLevelForExperience(p.experience),start=skillExperienceForLevel(level),end=skillExperienceForLevel(Math.min(50,level+1)),points=availableSkillPoints(p.experience,p.spentPoints,p.bonusPoints);
  heading.setProps({text:`${track.toUpperCase()} LEVEL ${level} · ${points} UNSPENT POINT${points===1?'':'S'}`});
  xpLabel.setProps({text:level>=50?'MAX LEVEL':`${p.experience-start} / ${end-start} XP`});xp.setProps({value:level>=50?1:Number(p.experience-start)/Number(end-start)});
  graph.updateRanks(ranks(),selected);
  for(const child of [...detail.children])child.dispose();
  const node=selectedNode();
  if(node){detail.append(uiText(node.name.toUpperCase(),{role:'header',wrap:true}));detail.append(uiText(skillNodeIsImplemented(node)?'LIVE IN GAME':'PLACEHOLDER — NO EFFECT YET',{wrap:true}));detail.append(uiText(node.root?'ROOT — ALWAYS OWNED':`RANK ${ranks()[node.id]??0}/${node.maxRank} · COST ${node.pointCost}`,{wrap:true}));detail.append(uiText(node.description,{wrap:true}));const rejection=skillPurchaseRejection(node.id,{...p,ranks:ranks()});if(rejection&&!node.root)detail.append(uiText(rejection.replaceAll('_',' ').toUpperCase(),{wrap:true}));}
  else detail.append(uiText('Select a skill to inspect it. Drag to pan; wheel to zoom. Focus the graph and use arrow keys to pan or Home to center.',{wrap:true}));
  const cost=skillRespecCostBronze(p.respecCount);reset.setProps({label:`RESET TREE ${cost/10000n}G ${cost%10000n/100n}S ${cost%100n}C`}).setDisabled(!canReset());learn.setProps({label:node?.root?'ROOT OWNED':'LEARN 1 RANK'}).setDisabled(!canLearn());
 };
 const selectTrack=(next:SkillTrack)=>{
  track=next;selected=null;key='';graph?.dispose();graph=uiSkillGraph({nodes:skillNodesForTrack(track),ranks:ranks(),canLearn:id=>skillPurchaseRejection(id,{...progress(),ranks:ranks()})===null,artwork:options.artwork,onSelect:id=>{selected=id;refresh();}});graphHost.append(graph);
  for(const child of [...tabs.children])child.dispose();
  for(const candidate of SKILL_TRACKS)tabs.append(uiButton({label:candidate.toUpperCase(),tone:candidate===track?'success':'neutral',size:'sm',onPress:()=>selectTrack(candidate)}));refresh();
 };
 const frame=uiFrame({id:'game.skills',header:{title:'SKILLS',closable:true,onClose:options.onClose},resizable:{handles:'all',min:{width:240,height:240}},layout:{width:'grow',height:'grow',...options.layout},children:[
  uiFlex({direction:'row',width:'grow',gap:4,shrink:0},(['character','skills','statistics']as const).map(page=>uiButton({label:page.toUpperCase(),size:'sm',tone:page==='skills'?'primary':'neutral',onPress:()=>options.onNavigate?.(page)}))),tabs,heading,xpLabel,xp,
  uiFlex({direction:'row',wrap:true,width:'grow',height:'grow',gap:8},[
   uiFlex({width:'grow',height:'grow',basis:uiFixed(240),gap:4},[uiButton({label:'CENTER',size:'sm',onPress:()=>graph.center()}),graphHost]),
   uiFlex({width:'grow',height:'grow',basis:uiFixed(180),gap:4},[uiScrollArea({width:'grow',height:'grow'},[detail]),reset,learn]),
  ]),
 ]});
 const updateSkills=(next:SkillTreeModel)=>{model=next;const nextKey=JSON.stringify(next,(_key,value)=>typeof value==='bigint'?value.toString():value);if(key===nextKey)return;key=nextKey;refresh();};
 selectTrack(track);return Object.defineProperty(Object.assign(frame,{selectTrack,updateSkills}),'selectedTrack',{get:()=>track}) as UiSkillsElement;
}
