import { uiSpeechBubble } from './anchors.js';
import type { LoadedAsset } from '../../assets.js';
import type { UiRect } from '../../geometry.js';
import type { UiTextLinkTarget } from '../../design-system/rich-text.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiButton } from './button.js';
import { uiRichText } from './text.js';
import { uiViewport } from './viewport.js';
import { uiSprite } from './media.js';
import { uiTooltip } from './tooltip.js';
export interface UiDialogueChoice {readonly id:string;readonly label:string;readonly tone?:UiTone;readonly marker?:LoadedAsset;readonly tooltip?:string|null}
export interface UiDialogueModel {readonly id:string;readonly speaker:string;readonly body:string;readonly choices:readonly UiDialogueChoice[]}
export interface UiDialogueOptions {readonly model:UiDialogueModel;readonly choose:(id:string)=>void;readonly onClose:()=>void;readonly onLink?:(target:UiTextLinkTarget)=>void;readonly portrait?:(context:CanvasRenderingContext2D,bounds:UiRect)=>void;readonly layout?:UiStyle}
export interface UiDialogueElement extends UiElement {updateDialogue(model:UiDialogueModel):void;handleDialogueKey(code:string):boolean}
export function uiDialogue(options:UiDialogueOptions):UiDialogueElement {
 let model=options.model,key='';
 const body=uiFlex({width:'grow',height:'grow',gap:8});
 const frame=uiFrame({id:'game.dialogue',header:{title:model.speaker,closable:true,onClose:options.onClose},layout:{width:'grow',height:'grow',...options.layout},children:[body]});
 const choose=(id:string)=>{if(model.choices.some(choice=>choice.id===id))options.choose(id);};
 const updateDialogue=(next:UiDialogueModel)=>{
  model=next;const nextKey=JSON.stringify([next.id,next.speaker,next.body,next.choices.map(choice=>[choice.id,choice.label,choice.tone,choice.marker?.name,choice.tooltip])]);if(nextKey===key)return;key=nextKey;
  // The speaker is an authored title; rebuilding only content retains the frame.
  const title=(node:UiElement):void=>{for(const child of node.children){if(child.kind==='text'&&child.props['role']==='header')child.setProps({text:model.speaker});else title(child);}};title(frame);
  for(const child of [...body.children])child.dispose();
  const speech=uiSpeechBubble({text:'',tail:'left',tone:'primary',layout:{width:'grow'}});
  for(const child of [...speech.children])child.dispose();speech.append(uiRichText(model.body,{wrap:true,onLink:options.onLink,layout:{width:'grow'}}));
  body.append(uiScrollArea({width:'grow',height:'grow',gap:8},[
   uiFlex({direction:'row',width:'grow',gap:8},[...(options.portrait?[uiViewport({label:`${model.speaker} portrait`,render:options.portrait,layout:{width:uiFixed(40),height:uiFixed(48),shrink:0}})]:[]),speech]),
   ...model.choices.map((choice,index)=>{const button=uiButton({id:`dialogue:${choice.id}`,label:`${index+1}. ${choice.label}`,tone:choice.tone??'neutral',size:'sm',leading:choice.marker?uiSprite(choice.marker,{label:'Quest marker',animation:Object.keys(choice.marker.metadata.animations)[0]??'base',playing:false,layout:{width:uiFixed(16),height:uiFixed(16)}}):undefined,onPress:()=>choose(choice.id),layout:{width:'grow',shrink:0}});return choice.tooltip?uiTooltip(choice.tooltip,button,{width:'grow',height:uiFixed(20),shrink:0}):button;}),
  ]));
 };
 const handleDialogueKey=(code:string)=>{if(code==='Escape'){options.onClose();return true;}const match=/^Digit([1-9])$/.exec(code);if(!match)return false;const choice=model.choices[Number(match[1])-1];if(choice)choose(choice.id);return true;};
 updateDialogue(model);return Object.assign(frame,{updateDialogue,handleDialogueKey});
}
