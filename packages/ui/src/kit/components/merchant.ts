import type { LoadedAsset } from '../../assets.js';
import { boundedStepperValue } from '../../bounded-stepper.js';
import type { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiTable, type UiTableState } from './collections.js';
import { uiText } from './text.js';
import { uiInput } from './input.js';
import { uiButton, type UiButtonModifiers } from './button.js';
import { uiSprite } from './media.js';
import { uiPurseLabel } from './purse.js';
export interface UiMerchantRow {readonly itemKind:string;readonly name:string;readonly unitPrice:number;readonly maximumQuantity:number;readonly quantity:number;readonly ownedQuantity?:number}
export interface UiMerchantModel {readonly speaker:string;readonly tab:'buy'|'sell';readonly rows:readonly UiMerchantRow[];readonly balanceBronze:bigint;readonly totalBronze:bigint;readonly pending:boolean;readonly canCommit:boolean;readonly filter:string}
export interface UiMerchantOptions {readonly model:UiMerchantModel;readonly artwork?:Readonly<Record<string,LoadedAsset>>;readonly onTab:(tab:'buy'|'sell')=>void;readonly onFilter:(query:string)=>void;readonly onQuantity:(itemKind:string,quantity:number)=>void;readonly onCommit:()=>void;readonly onBack:()=>void;readonly onClose:()=>void;readonly layout?:UiStyle}
export interface UiMerchantElement extends UiElement {updateMerchant(model:UiMerchantModel):void;readonly filterEditor:CanvasTextEditor}
export function uiMerchant(options:UiMerchantOptions):UiMerchantElement {
 let model=options.model,key='',tableState:UiTableState|undefined;
 const editor=new CanvasTextEditor({value:model.filter,maxLength:32});
 const controls=new Map<string,{value:UiElement;minus:UiElement;plus:UiElement}>();
 const balance=uiText(''),total=uiText('');
 const adjust=(id:string,direction:-1|1,event:UiButtonModifiers)=>{const row=model.rows.find(row=>row.itemKind===id);if(!row||model.pending)return;options.onQuantity(id,boundedStepperValue(row.quantity,direction,0,row.maximumQuantity,{shift:event.shiftKey,control:event.ctrlKey}));};
 const input=uiInput({label:'Filter merchant items',placeholder:'FILTER ITEMS',editor,clearable:true,onChange:query=>options.onFilter(query),layout:{width:'grow',shrink:0}});
 const tableHost=uiFlex({width:'grow',height:uiFixed(220),shrink:0});
 const commit=uiButton({id:'merchant.commit',label:'PURCHASE',ariaLabel:'Commit merchant cart',tone:'success',size:'sm',onPress:()=>{if(model.canCommit&&!model.pending)options.onCommit();}});
 const tabs=uiFlex({direction:'row',gap:4,shrink:0},[uiButton({label:'BUY',size:'sm',onPress:()=>options.onTab('buy')}),uiButton({label:'SELL',size:'sm',onPress:()=>options.onTab('sell')})]);
 const frame=uiFrame({id:'game.merchant',header:{title:`${model.speaker}'S SHOP`,closable:true,onClose:options.onClose},layout:{width:'grow',height:'grow',...options.layout},children:[uiScrollArea({width:'grow',height:'grow',gap:4},[tabs,input,balance,tableHost,total,uiFlex({direction:'row',gap:4,shrink:0},[uiButton({label:'BACK',size:'sm',onPress:options.onBack}),commit])])]});
 const updateMerchant=(next:UiMerchantModel)=>{
  const reset=next.tab!==model.tab||next.filter!==model.filter;model=next;if(editor.snapshot().value!==next.filter)editor.setValue(next.filter);
  balance.setProps({text:`BALANCE ${uiPurseLabel(next.balanceBronze)}`});total.setProps({text:`${next.tab.toUpperCase()} TOTAL ${uiPurseLabel(next.totalBronze)}`});commit.setProps({label:next.pending?'PROCESSING':next.tab==='buy'?'PURCHASE':'SELL'}).setDisabled(!next.canCommit||next.pending);
  const nextKey=JSON.stringify([next.tab,next.filter,next.rows.map(row=>[row.itemKind,row.name,row.unitPrice,row.maximumQuantity,row.ownedQuantity])]);
  if(nextKey!==key){key=nextKey;if(reset)tableState=undefined;for(const child of [...tableHost.children])child.dispose();controls.clear();
   tableHost.append(uiTable({id:'merchant.stock',label:'Merchant stock',surface:'game',pageSize:6,rows:next.rows,key:row=>row.itemKind,state:tableState,onStateChange:state=>{tableState=state;},columns:[
    {id:'item',label:'Item',value:row=>row.name,render:row=>{const asset=options.artwork?.[row.itemKind];return uiFlex({direction:'row',gap:4,width:'grow'},[...(asset?[uiSprite(asset,{label:row.name,animation:Object.keys(asset.metadata.animations)[0]??'base',playing:false,layout:{width:uiFixed(16),height:uiFixed(16),shrink:0}})]:[]),uiText(row.name,{layout:{width:'grow'}})]);}},
    {id:'price',label:'Price',width:uiFixed(108),value:row=>row.unitPrice,render:row=>uiText(uiPurseLabel(BigInt(row.unitPrice)))},
    {id:'owned',label:'Owned',width:uiFixed(52),value:row=>row.ownedQuantity??0,render:row=>uiText(row.ownedQuantity===undefined?'-':String(row.ownedQuantity))},
    {id:'quantity',label:'Quantity',width:uiFixed(108),sortable:false,value:row=>row.quantity,render:row=>{const current=()=>model.rows.find(entry=>entry.itemKind===row.itemKind)??row;const value=uiText(String(current().quantity),{align:'center',layout:{width:'grow'}});const minus=uiButton({label:'-',ariaLabel:`Decrease ${row.name}`,size:'sm',disabled:model.pending||current().quantity===0,onPress:event=>adjust(row.itemKind,-1,event)}),plus=uiButton({label:'+',ariaLabel:`Increase ${row.name}`,size:'sm',disabled:model.pending||current().quantity>=current().maximumQuantity,onPress:event=>adjust(row.itemKind,1,event)});controls.set(row.itemKind,{value,minus,plus});return uiFlex({direction:'row',width:'grow',gap:2},[minus,value,plus]);}},
   ]}));
  }
  for(const row of next.rows){const control=controls.get(row.itemKind);if(!control)continue;control.value.setProps({text:String(row.quantity)});control.minus.setDisabled(next.pending||row.quantity<=0);control.plus.setDisabled(next.pending||row.quantity>=row.maximumQuantity);}
 };
 updateMerchant(model);return Object.assign(frame,{updateMerchant,filterEditor:editor});
}
