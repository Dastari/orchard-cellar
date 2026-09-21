import {uiTooltip} from './tooltip.js';
import { BACKPACK_SLOT_OFFSET,HOTBAR_SLOT_COUNT,coinPurseFromBronze,BRONZE_PER_GOLD,BRONZE_PER_SILVER } from '@orchard/sim';
import { tradeItemDisplayName, tradeItemIsOfferable, type TradeUiModel, type TradeUiCallbacks } from '../../trade-ui.js';
import type {LoadedAsset} from '../../assets.js';
import {UiElement} from '../runtime/element.js';
import {CanvasTextEditor} from '../runtime/text-editor.js';
import {uiFixed,type UiStyle} from '../layout/box.js';
import {uiFrame} from './frame.js';
import {uiFlex,uiScrollArea} from './layout.js';
import {uiText} from './text.js';
import {uiButton} from './button.js';
import {uiInput} from './input.js';
import {uiInventoryGrid} from './inventory.js';
import {uiPurseLabel} from './purse.js';
export interface UiTradeOptions {readonly model:TradeUiModel;readonly callbacks:TradeUiCallbacks;readonly artwork?:Readonly<Record<string,LoadedAsset>>;readonly layout?:UiStyle}
export interface UiTradeElement extends UiElement {updateTrade(model:TradeUiModel):void}
export function uiTrade(options:UiTradeOptions):UiTradeElement {
 let model=options.model,structure='',revision=-1n,editing=false;
 const own=()=>model.session.requester.toHexString()===model.identityHex;
 const ownMoney=()=>own()?model.session.requesterBronze:model.session.recipientBronze;
 const otherHex=()=>own()?model.session.recipient.toHexString():model.session.requester.toHexString();
 const ownAccepted=()=>own()?model.session.requesterAccepted:model.session.recipientAccepted;
 const otherAccepted=()=>own()?model.session.recipientAccepted:model.session.requesterAccepted;
 const offer=(owner:string,slot:number)=>model.offers.find(entry=>entry.owner.toHexString()===owner&&entry.slot===slot);
 const editors=[16,2,2].map(maxLength=>new CanvasTextEditor({value:'0',maxLength}));
 const commitMoney=()=>{if(!frame.parent||model.session.state!=='active')return;const values=editors.map(editor=>BigInt(editor.snapshot().value.replace(/[^0-9]/g,'')||'0'));const amount=values[0]!*BRONZE_PER_GOLD+(values[1]!>99n?99n:values[1]!)*BRONZE_PER_SILVER+(values[2]!>99n?99n:values[2]!);options.callbacks.offerBronze(model.session.id,amount>model.walletBronze?model.walletBronze:amount);};
 const content=uiFlex({width:'grow',height:'grow'});
 const frame=uiFrame({id:'game.trade',header:{title:'TRADE',closable:true,onClose:()=>options.callbacks.cancel(model.session.id)},layout:{width:'grow',height:'grow',...options.layout},children:[content]});
 let ownLabel:UiElement|undefined,otherLabel:UiElement|undefined,wallet:UiElement|undefined,otherMoney:UiElement|undefined,accept:UiElement|undefined;
 const inventory=()=>model.inventorySlots.filter(row=>row.slot<HOTBAR_SLOT_COUNT||row.slot>=BACKPACK_SLOT_OFFSET).toSorted((a,b)=>a.slot-b.slot);
 const updateTrade=(next:TradeUiModel)=>{
  model=next;
  if(!editing&&revision!==next.session.revision){revision=next.session.revision;const purse=coinPurseFromBronze(ownMoney());[purse.gold,purse.silver,purse.bronze].forEach((value,index)=>editors[index]!.setValue(String(value)));}
  const key=`${next.session.id}:${next.session.state}:${next.identityHex}:${inventory().map(row=>row.slot).join(',')}`;
  if(key!==structure){structure=key;for(const child of [...content.children])child.dispose();
   if(next.session.state==='requested'){
    const incoming=!own();content.append(uiText(incoming?`${next.requesterName} WANTS TO TRADE`:`WAITING FOR ${next.recipientName}`,{wrap:true}));content.append(uiFlex({direction:'row',wrap:true,gap:4},incoming?[uiButton({label:'ACCEPT REQUEST',tone:'success',onPress:()=>options.callbacks.acceptRequest(model.session.id)}),uiButton({label:'DECLINE',tone:'danger',onPress:()=>options.callbacks.declineRequest(model.session.id)})]:[uiButton({label:'CANCEL',tone:'danger',onPress:()=>options.callbacks.cancel(model.session.id)})]));return;
   }
   const moneyFields=editors.map((editor,index)=>{const label=['Gold','Silver','Bronze'][index]!;const base=uiInput({label,editor,layout:{width:'grow'},onChange:value=>{const clean=value.replace(/[^0-9]/g,'');if(clean!==value)editor.setValue(clean);},onSubmit:commitMoney});return uiFlex({width:'grow',basis:uiFixed(index===0?116:64),gap:2},[uiText(label),new UiElement({...base.hooks,onFocus:(focused,element)=>{base.hooks.onFocus?.(focused,element);editing=focused;if(!focused)commitMoney();}})]);});
   ownLabel=uiText('YOUR OFFER');otherLabel=uiText('');wallet=uiText('');otherMoney=uiText('');
   const ownGrid=uiInventoryGrid({container:'trade-own',count:6,columns:3,slotSize:'sm',gap:2,artwork:options.artwork,stack:index=>offer(model.identityHex,index)??null,onActivate:index=>{if(offer(model.identityHex,index))options.callbacks.removeItem(model.session.id,index);}});
   const otherGrid=uiInventoryGrid({container:'trade-other',count:6,columns:3,slotSize:'sm',gap:2,artwork:options.artwork,stack:index=>offer(otherHex(),index)??null});
   for(const [grid,owner]of [[ownGrid,()=>model.identityHex],[otherGrid,otherHex]]as const)for(const [index,cell]of [...grid.children].entries()){grid.remove(cell);grid.append(uiTooltip(()=>{const item=offer(owner(),index);return item?tradeItemDisplayName(model.contentRegistry,item.itemKind):'';},cell,{width:uiFixed(28),height:uiFixed(31)}));}
   const carried=uiInventoryGrid({container:'trade-inventory',cells:inventory().map(row=>({id:String(row.slot),index:row.slot})),columns:10,slotSize:'sm',gap:2,artwork:options.artwork,allowSecondary:true,stack:index=>model.inventorySlots.find(row=>row.slot===index)??null,onActivate:(index,event)=>{const row=model.inventorySlots.find(row=>row.slot===index),free=Array.from({length:6},(_,i)=>i).find(i=>!offer(model.identityHex,i));if(!row||row.itemKind==='empty'||row.quantity<=0||!tradeItemIsOfferable(model.contentRegistry,row.itemKind)||free===undefined)return;options.callbacks.offerItem(model.session.id,index,free,event.button===2?1:row.quantity);}});
   accept=uiButton({id:'trade.accept',label:'ACCEPT TRADE',tone:'success',onPress:()=>options.callbacks.setAccepted(model.session.id,!ownAccepted(),model.session.revision)});
   content.append(uiScrollArea({width:'grow',height:'grow',gap:8},[uiFlex({direction:'row',wrap:true,width:'grow',gap:8},[uiFlex({width:'grow',basis:uiFixed(220),gap:4},[ownLabel,ownGrid,uiFlex({direction:'row',wrap:true,width:'grow',gap:4},moneyFields),wallet]),uiFlex({width:'grow',basis:uiFixed(180),gap:4},[otherLabel,otherGrid,otherMoney])]),uiText('YOUR INVENTORY — CLICK TO OFFER'),carried,uiFlex({direction:'row',wrap:true,gap:4},[uiButton({label:'CANCEL',tone:'danger',onPress:()=>options.callbacks.cancel(model.session.id)}),accept])]));
  }
  ownLabel?.setProps({text:ownAccepted()?'YOUR OFFER — ACCEPTED':'YOUR OFFER'});otherLabel?.setProps({text:`${own()?model.recipientName:model.requesterName} OFFER${otherAccepted()?' — ACCEPTED':''}`});wallet?.setProps({text:`YOU HAVE ${uiPurseLabel(model.walletBronze)}`});otherMoney?.setProps({text:uiPurseLabel(own()?model.session.recipientBronze:model.session.requesterBronze)});accept?.setProps({label:ownAccepted()?'UNACCEPT':'ACCEPT TRADE'});frame.invalidate();
 };
 updateTrade(model);return Object.assign(frame,{updateTrade});
}
