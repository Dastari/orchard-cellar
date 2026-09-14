import type { PixelUi } from './pixel-ui.js';
import type { UiSkin } from './skin.js';
import type { OverworldUiInventorySlot, OverworldUiItemArt } from './game/index.js';
import type { UiPoint,UiRect } from './geometry.js';
import { UiRoot } from './kit/runtime/root.js';
import { UiTextBridge } from './kit/runtime/text-bridge.js';
import type { UiElement } from './kit/runtime/element.js';
import { uiFixed } from './kit/layout/box.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import { uiTrade,type UiTradeElement } from './kit/components/trade.js';
import type { UiKitArt } from './kit/components/art.js';
interface TradeIdentity {
  toHexString(): string;
}

interface PlayerTradeSession {
  readonly id: string;
  readonly requester: TradeIdentity;
  readonly recipient: TradeIdentity;
  readonly state: string;
  readonly requesterAccepted: boolean;
  readonly recipientAccepted: boolean;
  readonly requesterBronze: bigint;
  readonly recipientBronze: bigint;
  readonly revision: bigint;
  readonly createdTick: bigint;
}

interface PlayerTradeOffer {
  readonly id: string;
  readonly tradeId: string;
  readonly owner: TradeIdentity;
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
}

export interface TradeUiModel {
  readonly identityHex: string;
  readonly session: PlayerTradeSession;
  readonly offers: readonly PlayerTradeOffer[];
  readonly inventorySlots: readonly OverworldUiInventorySlot[];
  readonly walletBronze: bigint;
  readonly requesterName: string;
  readonly recipientName: string;
}

export interface TradeUiCallbacks {
  readonly acceptRequest: (tradeId: string) => void;
  readonly declineRequest: (tradeId: string) => void;
  readonly cancel: (tradeId: string) => void;
  readonly offerItem: (tradeId: string, inventorySlot: number, tradeSlot: number, quantity: number) => void;
  readonly removeItem: (tradeId: string, tradeSlot: number) => void;
  readonly offerBronze: (tradeId: string, amount: bigint) => void;
  readonly setAccepted: (tradeId: string, accepted: boolean, revision: bigint) => void;
}

/** Server-owned trade state mounted on the shared kit root. */
export class TradeUi {
 private model:TradeUiModel|null=null;
 private frame?:UiTradeElement;
 private bridge?:UiTextBridge;
 private pointer:UiPoint={x:-100,y:-100};
 private button=0;
 private viewport={width:480,height:270};
 private swipe?:{node:UiElement;start:UiPoint;y:number;active:boolean};
 readonly kitRoot:UiRoot;
 private readonly ownsRoot:boolean;
 constructor(skin:UiSkin,fonts:PixelUi,private readonly itemArt:OverworldUiItemArt,private readonly callbacks:TradeUiCallbacks,art?:UiKitArt,root?:UiRoot){void skin;void fonts;this.ownsRoot=!root;this.kitRoot=root??new UiRoot({art,scale:1});}
 get active():boolean{return this.model!==null;}
 update(model:TradeUiModel|null,width=this.viewport.width,height=this.viewport.height):void{
  if(this.model?.session.id!==model?.session.id||this.model?.session.state!==model?.session.state){this.frame?.dispose();this.frame=undefined;}
  this.model=model;this.viewport={width,height};
  if(!model){this.frame?.dispose();this.frame=undefined;this.swipe=undefined;this.bridge?.sync();return;}
  if(this.ownsRoot)this.kitRoot.resize(width,height);
  const layout={position:'fixed' as const,zLayer:'modal' as const,inset:{left:8 as const,top:8 as const},width:uiFixed(Math.max(0,width-16)),height:uiFixed(Math.max(0,height-16))};
  if(!this.frame){this.frame=uiTrade({model,callbacks:this.callbacks,artwork:this.itemArt,layout});this.kitRoot.mount(this.frame);}
  this.frame.setStyle(layout);this.frame.updateTrade(model);this.kitRoot.arrange();this.bridge?.sync();
 }
 draw(context:CanvasRenderingContext2D,width:number,height:number):void{if(!this.model)return;if(width!==this.viewport.width||height!==this.viewport.height)this.update(this.model,width,height);if(this.ownsRoot)this.kitRoot.drawInContext(context);this.bridge?.sync();}
 pointerDown(point:UiPoint,button:number,pointerType?:string):boolean{
  if(!this.model)return false;this.pointer=point;this.button=button;this.kitRoot.pointer({type:'move',point,button,pointerId:1});this.kitRoot.pointer({type:'down',point,button,pointerId:1});
  if(pointerType==='touch'){let node=this.kitRoot.input.hovered;while(node&&node.scroll.maxY<=0)node=node.parent;if(node)this.swipe={node,start:point,y:node.scroll.y,active:false};}this.bridge?.sync();return true;
 }
 pointerMove(point:UiPoint):boolean{if(!this.model)return false;this.pointer=point;if(this.swipe){const delta=point.y-this.swipe.start.y;if(Math.abs(delta)>4&&!this.swipe.active){this.swipe.active=true;this.kitRoot.pointer({type:'cancel',point,button:this.button,pointerId:1});}if(this.swipe.active){scrollUiElement(this.swipe.node,0,this.swipe.y-delta);return true;}}this.kitRoot.pointer({type:'move',point,button:this.button,pointerId:1});return true;}
 pointerUp():boolean{if(!this.model)return false;const swiped=this.swipe?.active;this.swipe=undefined;if(!swiped)this.kitRoot.pointer({type:'up',point:this.pointer,button:this.button,pointerId:1});this.bridge?.sync();return true;}
 pointerLeave():void{this.kitRoot.pointer({type:'cancel',point:this.pointer,button:this.button,pointerId:1});this.pointer={x:-100,y:-100};this.swipe=undefined;}
 wheel(point:UiPoint,deltaY:number):boolean{if(!this.model)return false;this.kitRoot.wheel({point,deltaX:0,deltaY});return true;}
 handleKeyDown(code:string,repeat:boolean,modifiers:{shift?:boolean;control?:boolean;alt?:boolean;meta?:boolean}={}):boolean{if(!this.model)return false;if(repeat)return true;if(code==='Escape')this.callbacks.cancel(this.model.session.id);else this.kitRoot.key({key:code==='Space'?' ':code,shiftKey:modifiers.shift,ctrlKey:modifiers.control,altKey:modifiers.alt,metaKey:modifiers.meta});this.bridge?.sync();return true;}
 bindTextInput(canvas:HTMLCanvasElement,clientRect:(rect:UiRect)=>UiRect):void{
  this.bridge?.dispose();this.bridge=new UiTextBridge(canvas,()=>this.active?this.kitRoot.focus.current:null,event=>{if(event.key==='Enter'||event.key==='Escape'){this.kitRoot.focus.set(null);return true;}return this.kitRoot.key(event);},node=>clientRect(node.rect),()=>this.kitRoot.invalidate());
  this.bridge.input.inputMode='numeric';for(const type of ['keydown','keyup']as const)this.bridge.input.addEventListener(type,event=>event.stopPropagation());
 }
}
