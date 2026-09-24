import { uiRibbon } from './anchors.js';
import type { LoadedAsset } from '../../assets.js';
import { scrollUiElement } from '../layout/scroll.js';
import { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiInput } from './input.js';
import { uiButton } from './button.js';
import { uiSprite } from './media.js';

export type UiGatewayAction = 'sign-in'|'register'|'recover'|'enter-world'|'sign-out'|'continue-local'|'toggle-preview';
export interface UiGatewayModel {
  readonly localPreview: boolean; readonly signedIn: boolean; readonly displayName?: string;
  readonly profiles: readonly string[]; readonly selected: number;
  readonly message: string; readonly error?: string|null; readonly busy: boolean;
  readonly version?: string; readonly allowLocalPreview?: boolean; readonly allowPreviewToggle?: boolean;
}
export interface UiGatewayOptions {
  readonly preserveNameOnNavigate?: boolean;
  readonly model: UiGatewayModel; readonly emblem?: LoadedAsset; readonly layout?: UiStyle;
  readonly onAction: (action: UiGatewayAction, name?: string) => void;
  readonly onSelectProfile: (index: number) => void; readonly onNameChange?: (name: string) => void;
}
export interface UiGatewayElement extends UiElement {
  readonly editor: CanvasTextEditor;
  updateGateway(model: UiGatewayModel): void;
  focusName(): void;
  selectAdjacentProfile(direction: -1|1): void;
  submit(): void;
  invokeAction(action: UiGatewayAction): void;
  clearName(): void;
}
/** Account entry and local profiles share one retained frame; hosts own auth and navigation. */
export function uiGateway(options: UiGatewayOptions): UiGatewayElement {
  let model=options.model,namesKey='';
  const editor=new CanvasTextEditor({maxLength:20});
  const invoke=(action:UiGatewayAction)=>{
    if(model.busy)return;
    if(action==='toggle-preview'&&!(model.allowPreviewToggle??model.allowLocalPreview))return;
    if(action==='continue-local'&&!model.localPreview)return;
    if(['sign-in','register','recover'].includes(action)&&(model.signedIn||model.localPreview))return;
    if(['enter-world','sign-out'].includes(action)&&(!model.signedIn||model.localPreview))return;
    options.onAction(action,action==='continue-local'?editor.snapshot().value:undefined);
  };
  const submit=()=>{if(editor.snapshot().composing)return;invoke(model.localPreview?'continue-local':model.signedIn?'enter-world':'sign-in');};
  const input=uiInput({id:'gateway.name',label:'New local development profile name',editor,placeholder:'TYPE 3-20 CHARACTERS',onChange:options.onNameChange,onSubmit:submit,layout:{width:'grow',shrink:0}});
  const message=uiText('',{wrap:true}),version=uiText('',{role:'caption',align:'right'}),signedIn=uiText('',{wrap:true});
  const profiles=uiScrollArea({id:'gateway.profiles',height:uiFixed(104),width:'grow',gap:2,shrink:0});
  const empty=uiText('NO SAVED FARMERS YET',{wrap:true});
  const controls=new Map<UiGatewayAction,UiElement>();
  const action=(id:UiGatewayAction,label:string,tone:'primary'|'success'|'danger'='primary')=>{const button=uiButton({id:`gateway.${id}`,label,tone,layout:{width:'grow',shrink:0},onPress:()=>invoke(id)});controls.set(id,button);return button;};
  const account=uiFlex({width:'grow',gap:8},[signedIn,action('enter-world','ENTER THE ORCHARD','success'),action('sign-out','SIGN OUT','danger'),
    uiFlex({direction:'row',wrap:true,width:'grow',gap:4},[action('sign-in','SIGN IN','success'),action('register','CREATE ACCOUNT','success')]),action('recover','RECOVER ACCOUNT')]);
  const local=uiFlex({width:'grow',gap:6},[uiText('LOCAL DEVELOPMENT PREVIEW'),profiles,empty,uiText('NEW DEVELOPMENT FARMER'),input,action('continue-local','CREATE OR CONTINUE','success'),uiText('ARROWS SELECT · ENTER CONTINUE · N NEW',{wrap:true})]);
  const toggle=action('toggle-preview','LOCAL DEVELOPMENT PREVIEW');
  const emblem=options.emblem?uiSprite(options.emblem,{animation:Object.keys(options.emblem.metadata.animations)[0]??'base',playing:false,label:'Orchard emblem',layout:{width:uiFixed(16),height:uiFixed(16),shrink:0}}):undefined;
  const frame=uiFrame({id:'game.gateway',header:{title:'ORCHARD & CELLAR',content:uiRibbon({label:'ORCHARD & CELLAR',layout:{width:'grow'}})},layout:{width:'grow',height:'grow',...options.layout},children:[uiScrollArea({id:'gateway.content',gap:8},[uiFlex({direction:'row',width:'grow',gap:4,align:'center'},[...(emblem?[emblem]:[]),version]),message,account,local,toggle])]});
  const clearName=()=>{editor.setValue('');frame.invalidate();};
  const selectProfile=(index:number,clear=true)=>{if(model.busy||!model.localPreview||!model.profiles[index])return;if(clear)clearName();options.onSelectProfile(index);};
  const updateGateway=(next:UiGatewayModel)=>{
    model=next;
    message.setProps({text:(model.error??model.message).toUpperCase(),tone:model.error?'danger':'primary'});
    version.setProps({text:model.version?`V${model.version}`:''});
    account.setStyle({visible:!model.localPreview});local.setStyle({visible:model.localPreview});empty.setStyle({visible:model.profiles.length===0});profiles.setStyle({visible:model.profiles.length>0});
    signedIn.setStyle({visible:model.signedIn}).setProps({text:`SIGNED IN AS ${model.displayName?.toUpperCase()??''}`});
    for(const [id,button]of controls){button.setDisabled(model.busy);button.setStyle({visible:id==='toggle-preview'?(model.allowPreviewToggle??model.allowLocalPreview)===true:id==='continue-local'?model.localPreview:['enter-world','sign-out'].includes(id)?model.signedIn:!model.signedIn});}
    toggle.setProps({label:model.localPreview?'ACCOUNT LOGIN':'LOCAL DEVELOPMENT PREVIEW'});input.setDisabled(model.busy);
    const key=JSON.stringify(model.profiles);
    if(key!==namesKey){namesKey=key;profiles.replaceChildren(model.profiles.map((name,index)=>uiButton({id:`gateway.profile.${index}`,label:name.toUpperCase(),size:'sm',layout:{width:'grow',shrink:0},onPress:()=>selectProfile(index)})));}
    for(const [index,button]of profiles.children.entries())button.setDisabled(model.busy).setProps({tone:index===model.selected?'success':'primary'});
  };
  frame.setProps({singlePointer:true,touchScroll:true});
  updateGateway(model);
  return Object.assign(frame, {
    editor, updateGateway, submit, invokeAction: invoke, clearName,
    focusName() { if (model.localPreview && !model.busy) input.requestFocus(); },
    selectAdjacentProfile(direction: -1 | 1) {
      if (model.busy || !model.localPreview || !model.profiles.length) return;
      const index = (model.selected + direction + model.profiles.length) % model.profiles.length;
      selectProfile(index, !options.preserveNameOnNavigate);
      const row = profiles.children[index];
      if (row) {
        if (options.preserveNameOnNavigate) row.requestFocus();
        const top = row.rect.y - profiles.contentRect.y;
        scrollUiElement(profiles, 0, profiles.scroll.y + (top < 0 ? top : Math.max(0, top + row.rect.height - profiles.contentRect.height)));
      }
    },
  });
}
