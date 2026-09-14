import type { UiPoint, UiRect } from './geometry.js';
import { touchControlLayout } from './touch-controls.js';
import { chatCommandSuggestions } from './chat-command.js';
import { UiRoot } from './kit/runtime/root.js';
import { UiTextBridge } from './kit/runtime/text-bridge.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import { uiFixed } from './kit/layout/box.js';
import type { UiTone } from './kit/tokens.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiChat, uiChatContains, uiChatLineAlpha, uiChatHistoryExpanded, UI_CHAT_FADE_DELAY_MS, UI_CHAT_FADE_DURATION_MS, type UiChatElement, type UiChatModel, type UiChatLine } from './kit/components/chat.js';

export const CHAT_FADE_DELAY_MS = UI_CHAT_FADE_DELAY_MS;
export const CHAT_FADE_DURATION_MS = UI_CHAT_FADE_DURATION_MS;
const CHAT_POSITION_STORAGE_KEY = 'orchard:chat-anchor';
const CHAT_COLLAPSED_STORAGE_KEY = 'orchard:chat-collapsed';

export interface ChatOverlayMessage {
  readonly id: bigint;
  readonly channelName: string;
  readonly senderDisplayName: string;
  readonly kind: string;
  readonly body: string;
  /** Reserved structured data for item-link spans rendered as interactive segments later. */
  readonly itemLinksJson: string;
}

export interface ChatOverlayModel {
  readonly width: number;
  readonly height: number;
  readonly connected: boolean;
  readonly canAdministerWorld: boolean;
  readonly onlinePlayerNames: readonly string[];
  readonly replyPlayerName: string | null;
  readonly messages: readonly ChatOverlayMessage[];
  readonly touchControls?: boolean;
  /** Logical UI pixels covered by a software keyboard at the viewport bottom. */
  readonly keyboardInset?: number;
  /** A visually higher modal owns pointer interaction for this frame. */
  readonly interactionBlocked?: boolean;
}

export const chatLineAlpha = uiChatLineAlpha;
export const chatHistoryExpanded = uiChatHistoryExpanded;

export function storedChatCollapsed(value: string | null): boolean {
  return value === 'true';
}

export function chatMessagePresentation(message: Pick<ChatOverlayMessage, 'channelName' | 'senderDisplayName' | 'kind' | 'body'>): {
  readonly text: string;
  readonly tone: UiTone;
} {
  if (message.kind === 'motd') return { text: `[MOTD] ${message.body}`, tone: 'warning' };
  if (message.kind === 'system') return { text: `[${message.channelName}] ${message.body}`, tone: 'success' };
  if (message.kind === 'whisper_outgoing') {
    return { text: `[To ${message.senderDisplayName}] ${message.body}`, tone: 'info' };
  }
  if (message.kind === 'whisper') {
    return { text: `[From ${message.senderDisplayName}] ${message.body}`, tone: 'info' };
  }
  return { text: `[${message.channelName}] ${message.senderDisplayName}: ${message.body}`, tone: 'neutral' };
}

export function hasUnseenChatMessage(
  knownIds: ReadonlySet<bigint>,
  messages: readonly Pick<ChatOverlayMessage, 'id'>[],
): boolean {
  return messages.some((message) => !knownIds.has(message.id));
}


/** Only the whole composition is positioned by the host; kit layout owns every child. */
export function chatFrameBounds(model: Pick<ChatOverlayModel,'width'|'height'|'touchControls'|'keyboardInset'>, anchor: UiPoint | null, suggestions = 0): UiRect {
  const controls = model.touchControls ? touchControlLayout(model.width,model.height) : null;
  const controlsTop = controls ? Math.min(controls.joystickCenter.y-controls.joystickRadius,controls.interactButton.y,controls.secondaryButton.y)-5 : Infinity;
  const bottom = Math.max(4,Math.min(model.height-38,controlsTop,model.keyboardInset ? model.height-model.keyboardInset-5 : Infinity));
  const width = Math.max(0,Math.min(330,Math.max(210,Math.floor(model.width*.43)),model.width-8));
  const height = Math.max(0,Math.min(166+suggestions*18,bottom-4));
  return {x:Math.max(4,Math.min(model.width-width-4,anchor?.x??4)),y:Math.max(4,Math.min(bottom-height,anchor?.y??bottom-height)),width,height};
}
export class ChatOverlay {
  private model:ChatOverlayModel={width:480,height:270,connected:false,canAdministerWorld:false,onlinePlayerNames:[],replyPlayerName:null,messages:[]};
  private arrivals=new Map<bigint,number>(); private initialized=false;
  private openValue=false; private collapsedValue=false; private unreadValue=false; private hovered=false;
  private errorText:string|null=null; private errorAt=0; private suggestionIndex=0; private scrollbarFocused=false;
  private anchor:UiPoint|null=null; private dragAnchor:UiPoint|null=null;
  private point:UiPoint={x:-100,y:-100}; private pressed=false; private deferredFocus=false;
  private swipe?:{y:number;offset:number;active:boolean}; private bridge?:UiTextBridge;
  readonly kitRoot:UiRoot; readonly chat:UiChatElement;
  constructor(art:UiKitArt,private readonly send:(body:string)=>Promise<void>,private readonly onOpenChanged:(open:boolean)=>void){
    try { if(typeof localStorage!=='undefined'){
      this.collapsedValue=storedChatCollapsed(localStorage.getItem(CHAT_COLLAPSED_STORAGE_KEY));
      const value=JSON.parse(localStorage.getItem(CHAT_POSITION_STORAGE_KEY)??'null') as unknown;
      if(value&&typeof value==='object'&&'x'in value&&'y'in value&&typeof value.x==='number'&&typeof value.y==='number'&&Number.isFinite(value.x+value.y))this.anchor={x:value.x,y:value.y};
    }}catch{ /* Keep in-memory defaults when storage is unavailable. */ }
    this.kitRoot=new UiRoot({art,scale:1});
    this.chat=uiChat({model:this.view(),onSubmit:value=>this.submit(value),onChange:()=>{this.errorText=null;this.suggestionIndex=0;this.scrollbarFocused=false;this.refresh();},
      onToggle:()=>this.setCollapsed(!this.collapsedValue),onSuggestionIndex:index=>{this.suggestionIndex=index;this.refresh();},onComplete:index=>this.complete(index),
      onMove:delta=>{if(this.dragAnchor){this.anchor={x:this.dragAnchor.x+delta.x,y:this.dragAnchor.y+delta.y};this.refresh();}},onMoveEnd:()=>this.save(CHAT_POSITION_STORAGE_KEY,JSON.stringify(this.anchor)),layout:{position:'fixed'}});
    this.kitRoot.mount(this.chat);this.refresh();
  }
  get isOpen():boolean{return this.openValue;} get isCollapsed():boolean{return this.collapsedValue;}
  get hasUnread():boolean{return this.unreadValue;} get isHovered():boolean{return this.hovered;}
  dismiss():void{this.close();}
  private suggestions(){return this.chat?chatCommandSuggestions(this.chat.editor.snapshot().value,this.model.onlinePlayerNames,this.model.canAdministerWorld,this.model.replyPlayerName):[];}
  private view(now=performance.now()):UiChatModel{
    const lines:UiChatLine[]=[...this.model.messages].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(message=>({...chatMessagePresentation(message),id:String(message.id),arrivedAt:this.arrivals.get(message.id)??now}));
    if(this.errorText&&now-this.errorAt<CHAT_FADE_DELAY_MS+CHAT_FADE_DURATION_MS)lines.push({id:'error',text:`[Chat] ${this.errorText}`,tone:'danger',arrivedAt:this.errorAt});
    return {open:this.openValue,collapsed:this.collapsedValue,unread:this.unreadValue,hovered:this.hovered,touch:this.model.touchControls===true,blocked:this.model.interactionBlocked===true,lines,suggestions:this.openValue?this.suggestions():[],suggestionIndex:this.suggestionIndex};
  }
  private refresh(now=performance.now()):void{
    const view=this.view(now),bounds=chatFrameBounds(this.model,this.anchor,view.suggestions.length);
    if(this.anchor)this.anchor={x:bounds.x,y:bounds.y};
    this.kitRoot.resize(this.model.width,this.model.height);
    this.chat.setStyle({inset:{left:uiFixed(bounds.x),top:uiFixed(bounds.y)},width:uiFixed(bounds.width),height:uiFixed(bounds.height)});
    this.chat.updateChat(view);this.kitRoot.arrange();this.bridge?.sync();
  }
  update(model:ChatOverlayModel,now=performance.now()):void{
    if(this.initialized&&this.collapsedValue&&hasUnseenChatMessage(new Set(this.arrivals.keys()),model.messages))this.unreadValue=true;
    this.model=model;const ids=new Set(model.messages.map(message=>message.id));
    for(const message of model.messages)if(!this.arrivals.has(message.id))this.arrivals.set(message.id,now);
    for(const id of this.arrivals.keys())if(!ids.has(id))this.arrivals.delete(id);
    this.initialized=true;if(model.interactionBlocked){this.pointerCancel();this.pointerLeave();}this.refresh(now);
  }
  handleGlobalKeyDown(event:KeyboardEvent):boolean{
    if(this.model.interactionBlocked||event.repeat)return false;
    if(this.openValue)return this.handleEditorKey(event);
    if(event.key!=='Enter'&&event.key!=='/')return false;this.open(event.key==='/'?'/':'');return true;
  }
  private handleEditorKey(event:KeyboardEvent):boolean{
    if(this.model.interactionBlocked)return false;
    if(event.isComposing)return false;
    if(event.key==='Escape'){this.close();return true;}
    if(['PageUp','PageDown'].includes(event.key)||this.scrollbarFocused&&['Home','End','ArrowUp','ArrowDown'].includes(event.key)){this.chat.scrollHistory(event.key);this.refresh();return true;}
    const handled=this.kitRoot.key(event);this.refresh();return handled;
  }
  private complete(index:number):void{const suggestion=this.suggestions()[index];if(!suggestion)return;this.chat.editor.setValue(suggestion.completion);this.suggestionIndex=0;this.chat.focusInput();this.refresh();}
  private submit(raw:string):void{
    const body=raw.trim();if(!this.openValue||this.model.interactionBlocked)return;
    this.chat.editor.setValue('');this.close();if(!body)return;
    void this.send(body).catch((error:unknown)=>{this.errorText=error instanceof Error?error.message:String(error);this.errorAt=performance.now();this.refresh();});
  }
  private setCollapsed(value:boolean):void{
    if(value===this.collapsedValue)return;if(value)this.close();this.collapsedValue=value;if(!value)this.unreadValue=false;
    this.hovered=false;this.save(CHAT_COLLAPSED_STORAGE_KEY,String(value));this.refresh();
  }
  private open(value='',focus=true):void{
    if(!this.model.connected||this.model.interactionBlocked)return;
    this.collapsedValue=false;this.unreadValue=false;this.save(CHAT_COLLAPSED_STORAGE_KEY,'false');
    if(!this.openValue){this.openValue=true;this.chat.editor.setValue(value);this.suggestionIndex=0;this.chat.scrollToEnd();this.onOpenChanged(true);}
    this.deferredFocus=!focus;this.refresh();if(focus){this.chat.focusInput();this.refresh();}
  }
  private close():void{if(!this.openValue)return;this.openValue=false;this.deferredFocus=false;this.scrollbarFocused=false;this.kitRoot.focus.set(null);this.onOpenChanged(false);this.refresh();}
  pointerMove(point:UiPoint):void{
    this.point=point;if(this.model.interactionBlocked){this.pointerLeave();return;}
    this.hovered=uiChatContains(this.chat.toggle,point)||!this.collapsedValue&&(uiChatContains(this.chat.history.parent!,point)||this.openValue&&uiChatContains(this.chat.input,point));
    if(this.swipe&&(this.swipe.active||Math.abs(point.y-this.swipe.y)>=4)){
      if(!this.swipe.active){this.kitRoot.pointer({type:'cancel',point,button:0,pointerId:1});this.swipe.active=true;}
      scrollUiElement(this.chat.history,0,this.swipe.offset+this.swipe.y-point.y);
    }else this.kitRoot.pointer({type:'move',point,button:0,pointerId:1});
    this.refresh();
  }
  pointerLeave():void{this.hovered=false;this.kitRoot.input.clearHover();this.refresh();}
  pointerDown(point:UiPoint,button:number,pointerType?:string):boolean{
    if(this.model.interactionBlocked||button!==0)return false;this.point=point;
    if(uiChatContains(this.chat.toggle,point)){this.dragAnchor={x:this.chat.rect.x,y:this.chat.rect.y};this.pressed=true;this.kitRoot.pointer({type:'down',point,button,pointerId:1});return true;}
    if(this.collapsedValue)return false;
    const history=uiChatContains(this.chat.history.parent!,point),input=uiChatContains(this.chat.input,point),suggestion=this.kitRoot.input.hits(point).some(node=>node.id.startsWith('chat.suggestion.'));
    if(!history&&!input&&!suggestion){if(!this.model.touchControls)this.close();return false;}
    this.open('',false);this.pressed=true;this.scrollbarFocused=history;
    this.swipe=history&&pointerType==='touch'?{y:point.y,offset:this.chat.history.scroll.y,active:false}:undefined;
    this.kitRoot.pointer({type:'down',point,button,pointerId:1});return true;
  }
  pointerUp():boolean{
    if(this.model.interactionBlocked){this.pointerCancel();return false;}if(!this.pressed)return false;
    this.pressed=false;const swiped=this.swipe?.active;this.swipe=undefined;
    this.kitRoot.pointer({type:swiped?'cancel':'up',point:this.point,button:0,pointerId:1});
    this.dragAnchor=null;this.deferredFocus=false;if(this.openValue&&!swiped)this.chat.focusInput();this.refresh();return true;
  }
  pointerCancel():void{this.kitRoot.pointer({type:'cancel',point:this.point,button:0,pointerId:1});this.pressed=false;this.deferredFocus=false;this.swipe=undefined;this.dragAnchor=null;}
  wheel(point:UiPoint,deltaY:number):boolean{if(this.model.interactionBlocked||this.collapsedValue||!uiChatContains(this.chat.history.parent!,point)||!deltaY)return false;this.kitRoot.wheel({point,deltaX:0,deltaY});return true;}
  draw(context:CanvasRenderingContext2D,now=performance.now()):void{this.kitRoot.drawInContext(context,now);this.bridge?.sync();}
  bindTextInput(canvas:HTMLCanvasElement,clientRect:(rect:UiRect)=>UiRect):void{
    this.bridge?.dispose();
    this.bridge=new UiTextBridge(canvas,()=>this.openValue&&!this.deferredFocus&&!this.model.interactionBlocked?this.kitRoot.focus.current:null,event=>this.handleEditorKey(event),node=>clientRect(node.rect),()=>this.kitRoot.invalidate());
    this.bridge.input.maxLength=240;for(const type of ['keydown','keyup']as const)this.bridge.input.addEventListener(type,event=>event.stopPropagation());
    this.bridge.input.addEventListener('blur',()=>{if(this.openValue&&!this.model.touchControls&&!this.model.interactionBlocked&&!UiTextBridge.isCanvasBlocked(canvas))this.close();});
  }
  dispose():void{this.bridge?.dispose();this.kitRoot.dispose();}
  private save(key:string,value:string):void{try{if(typeof localStorage!=='undefined')localStorage.setItem(key,value);}catch{/* Retain in-memory preferences. */}}
}
