import {
  BACKPACK_SLOT_COUNT,
  BACKPACK_SLOT_OFFSET,
  BASE_BACKPACK_CAPACITY,
  EQUIPMENT_SLOT_OFFSET,
  ITEM_ECONOMY,
  merchantOffers,
  coinPurseFromBronze,
  dialogueDefinition,
  runtimeDialogueDefinition,
  dialogueNode,
  itemDefinition,
  maxStackFor,
  questDefinition,
  type DialogueChoice,
  type FrameContentDefinition,
  type ContentRegistry,
  type MerchantCartLine,
} from '@orchard/sim';

import { type OverworldUiInventorySlot, type OverworldUiItemArt } from './game/index.js';
import { type UiPoint, type UiRect } from './geometry.js';
import type { BoundedStepperModifiers } from './bounded-stepper.js';


const SHOP_ROW_HEIGHT = 34;
const SHOP_MAX_VISIBLE_ROWS = 4;
const MODAL_HORIZONTAL_PADDING = 28;
const SHOP_HEADER_TOP = 34;
const SHOP_LIST_TOP = 60;
const SHOP_FOOTER_BOTTOM_PADDING = 15;
const SHOP_CLOSE_RIGHT_PADDING = 12;
const DIALOGUE_SIDE_PADDING = 34;
const DIALOGUE_PORTRAIT_WIDTH = 40;
const DIALOGUE_PORTRAIT_HEIGHT = 46;
const DIALOGUE_PORTRAIT_GAP = 12;

export interface NpcInteractionModel {
  readonly width: number;
  readonly height: number;
  readonly npcId: bigint;
  readonly dialogueId: string;
  readonly shopId?: string;
  readonly nodeId: string;
  readonly balanceBronze: bigint;
  readonly inventory: readonly OverworldUiInventorySlot[];
  /** Effective player capacity already projected from equipment and unlocks. */
  readonly backpackSlotCapacity?: number;
  readonly sellPriceOverrides?: Readonly<Record<string, number>>;
  readonly quests?: readonly { readonly questId: string; readonly state: string }[];
  readonly touchControls?: boolean;
  readonly contentRegistry?: ContentRegistry;
}

export function npcInteractionFrame(model: NpcInteractionModel): FrameContentDefinition | null {
  const registry = model.contentRegistry;
  const definition = registry === undefined ? null : runtimeDialogueDefinition(registry, model.dialogueId);
  const node = definition === null ? null : dialogueNode(definition, model.nodeId);
  if (node?.mode !== 'shop' || node.frameId === undefined) return null;
  const frame = registry?.frames.get(node.frameId);
  return frame?.presentation?.surface === 'merchant' ? frame : null;
}

export interface NpcInteractionCallbacks {
  readonly chooseDialogueOption: (choiceId: string) => void;
  readonly closeDialogue: () => void;
  readonly buy: (lines: readonly MerchantCartLine[]) => Promise<void>;
  readonly sell: (lines: readonly MerchantCartLine[]) => Promise<void>;
}

export type NpcInteractionPortraitDrawer = (
  context: CanvasRenderingContext2D,
  npcId: bigint,
  rect: UiRect,
) => void;

interface ShopRow {
  readonly itemKind: string;
  readonly name: string;
  readonly unitPrice: number;
  readonly maximumQuantity: number;
  readonly ownedQuantity?: number;
}

export interface NpcShopState {
  readonly tab: 'buy' | 'sell';
  readonly lines: readonly MerchantCartLine[];
  readonly totalBronze: bigint;
  readonly affordable: boolean;
  readonly canCommit: boolean;
  readonly pending: boolean;
}

interface InteractionLayout {
  readonly frame: UiRect;
  readonly close: UiRect;
  readonly buyTab: UiRect;
  readonly sellTab: UiRect;
  readonly filter: UiRect;
  readonly currency: UiPoint;
  readonly list: UiRect;
  readonly scroll: UiRect;
  readonly action: UiRect;
  readonly back: UiRect;
  readonly dialoguePortrait: UiRect;
  readonly dialogueBody: UiRect;
  readonly dialogueList: UiRect;
  readonly dialogueScroll: UiRect;
  readonly visibleRows: number;
}

export function npcInteractionLayout(width: number, height: number, shop: boolean): InteractionLayout {
  const frameWidth = Math.min(shop ? 398 : 390, Math.max(250, width - 16));
  const frameHeight = Math.min(260, Math.max(160, height - 16));
  const frame = {
    x: Math.round((width - frameWidth) / 2),
    y: Math.round((height - frameHeight) / 2),
    width: frameWidth,
    height: frameHeight,
  };
  const visibleRows = shop && frameHeight < 260 ? 3 : SHOP_MAX_VISIBLE_ROWS;
  const footerY = frame.y + frame.height - SHOP_FOOTER_BOTTOM_PADDING - 19;
  const dialoguePortrait = {
    x: frame.x + DIALOGUE_SIDE_PADDING,
    y: frame.y + 34,
    width: DIALOGUE_PORTRAIT_WIDTH,
    height: DIALOGUE_PORTRAIT_HEIGHT,
  };
  const dialogueList = {
    x: frame.x + MODAL_HORIZONTAL_PADDING,
    y: frame.y + 94,
    width: frame.width - MODAL_HORIZONTAL_PADDING * 2 - 9,
    height: Math.max(22, frame.height - 122),
  };
  return {
    frame,
    close: {
      x: frame.x + frame.width - SHOP_CLOSE_RIGHT_PADDING - 15,
      y: frame.y + 7,
      width: 15,
      height: 15,
    },
    buyTab: { x: frame.x + MODAL_HORIZONTAL_PADDING, y: frame.y + SHOP_HEADER_TOP, width: 62, height: 19 },
    sellTab: { x: frame.x + MODAL_HORIZONTAL_PADDING + 66, y: frame.y + SHOP_HEADER_TOP, width: 62, height: 19 },
    filter: { x: frame.x + MODAL_HORIZONTAL_PADDING + 132, y: frame.y + SHOP_HEADER_TOP, width: 104, height: 19 },
    currency: {
      x: frame.x + frame.width - MODAL_HORIZONTAL_PADDING,
      y: frame.y + SHOP_HEADER_TOP - 1,
    },
    list: {
      x: frame.x + MODAL_HORIZONTAL_PADDING,
      y: frame.y + SHOP_LIST_TOP,
      width: frame.width - MODAL_HORIZONTAL_PADDING * 2 - 9,
      height: SHOP_ROW_HEIGHT * visibleRows,
    },
    scroll: {
      x: frame.x + frame.width - MODAL_HORIZONTAL_PADDING - 12,
      y: frame.y + SHOP_LIST_TOP + 2,
      width: 12,
      height: SHOP_ROW_HEIGHT * visibleRows - 4,
    },
    action: {
      x: frame.x + frame.width - MODAL_HORIZONTAL_PADDING - 112,
      y: footerY,
      width: 112,
      height: 19,
    },
    back: {
      x: frame.x + MODAL_HORIZONTAL_PADDING,
      y: footerY,
      width: 72,
      height: 19,
    },
    dialoguePortrait,
    dialogueBody: {
      x: dialoguePortrait.x + dialoguePortrait.width + DIALOGUE_PORTRAIT_GAP,
      y: dialoguePortrait.y + 2,
      width: frame.x + frame.width - DIALOGUE_SIDE_PADDING
        - (dialoguePortrait.x + dialoguePortrait.width + DIALOGUE_PORTRAIT_GAP),
      height: DIALOGUE_PORTRAIT_HEIGHT - 4,
    },
    dialogueList,
    dialogueScroll: {
      x: frame.x + frame.width - MODAL_HORIZONTAL_PADDING - 12,
      y: dialogueList.y + 2,
      width: 12,
      height: dialogueList.height - 4,
    },
    visibleRows,
  };
}

import type { PixelUi } from './pixel-ui.js';
import type { UiSkin } from './skin.js';
import { UiRoot } from './kit/runtime/root.js';
import { UiTextBridge } from './kit/runtime/text-bridge.js';
import type { UiElement } from './kit/runtime/element.js';
import { uiFixed } from './kit/layout/box.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import { uiDialogue, type UiDialogueElement } from './kit/components/dialogue.js';
import { uiMerchant, type UiMerchantElement } from './kit/components/merchant.js';
import type { UiKitArt } from './kit/components/art.js';
export function dialogueChoiceIsAvailable(
  choice: DialogueChoice,
  quests: readonly { readonly questId: string; readonly state: string }[] = [],
): boolean {
  if (choice.quest === undefined) return true;
  const row = quests.find((quest) => quest.questId === choice.quest?.questId);
  if (choice.quest.requires !== 'available') return row?.state === choice.quest.requires;
  if (row !== undefined) return false;
  const definition = questDefinition(choice.quest.questId);
  return definition !== null && definition.prerequisiteQuestIds?.every((questId) => (
    quests.some((quest) => quest.questId === questId && quest.state === 'turned_in')
  )) !== false;
}

export function dialogueChoiceRewardTooltip(choice: DialogueChoice | null | undefined): string | null {
  if (choice?.quest?.action !== 'turn_in') return null;
  const definition = questDefinition(choice.quest.questId);
  if (definition === null) return null;
  const rewards: string[] = [];
  const purse = coinPurseFromBronze(definition.rewards.bronze);
  if (purse.gold > 0n) rewards.push(`${purse.gold} GOLD`);
  if (purse.silver > 0) rewards.push(`${purse.silver} SILVER`);
  if (purse.bronze > 0) rewards.push(`${purse.bronze} BRONZE`);
  for (const reward of definition.rewards.experience) {
    rewards.push(`${reward.amount} ${reward.track.toUpperCase()} XP`);
  }
  for (const reward of definition.rewards.items) {
    const name = itemDefinition(reward.itemKind)?.displayName ?? reward.itemKind.replaceAll('_', ' ');
    rewards.push(`${name.toUpperCase()} ×${reward.count}`);
  }
  if (definition.rewards.homesteadSizeTier !== undefined) {
    rewards.push(`HOMESTEAD TIER ${definition.rewards.homesteadSizeTier}`);
  }
  return `REWARDS: ${rewards.length > 0 ? rewards.join(' / ') : 'NONE'}`;
}

/** Gameplay state adapter. All visuals and hit targets belong to the kit. */
export class NpcInteractionUi {
  private model:NpcInteractionModel|null=null;
  private tab:'buy'|'sell'='buy';
  private readonly buyQuantities=new Map<string,number>();
  private readonly sellQuantities=new Map<string,number>();
  private transactionPending=false;
  private sessionVersion=0;
  private filterText='';
  private pressModifiers:BoundedStepperModifiers={};
  private pointer:UiPoint={x:-100,y:-100};
  private dialogue?:UiDialogueElement;
  private merchant?:UiMerchantElement;
  private bridge?:UiTextBridge;
  private readonly ownsRoot:boolean;
  readonly kitRoot:UiRoot;
  private swipe?:{node:UiElement;start:UiPoint;y:number;active:boolean};
  constructor(skin:UiSkin,fonts:PixelUi,private readonly itemArt:OverworldUiItemArt,private readonly callbacks:NpcInteractionCallbacks,
    private readonly drawPortrait:NpcInteractionPortraitDrawer=()=>undefined,art?:UiKitArt,root?:UiRoot){
    void skin;void fonts;this.ownsRoot=!root;this.kitRoot=root??new UiRoot({art,scale:1});
  }
  get active():boolean{return this.model!==null;}
  private node(){if(!this.model)return null;const definition=this.model.contentRegistry===undefined?dialogueDefinition(this.model.dialogueId):runtimeDialogueDefinition(this.model.contentRegistry,this.model.dialogueId);return definition?dialogueNode(definition,this.model.nodeId):null;}
  get shopOpen():boolean{return this.node()?.mode==='shop';}
  get filterValue():string{return this.filterText;}
  get tooltipText():string|null{let hovered=this.kitRoot.input.hovered;while(hovered&&!hovered.id.startsWith('dialogue:'))hovered=hovered.parent;return dialogueChoiceRewardTooltip(this.allDialogueChoices().find(choice=>`dialogue:${choice.id}`===hovered?.id));}
  setFilterText(value:string):void{const next=value.replace(/[\r\n]/g,'').slice(0,32);if(next===this.filterText)return;this.filterText=next;this.syncKit();}
  get shopState(): NpcShopState {
    const quantities = this.cartQuantities();
    const rows = this.allShopRows();
    const lines = rows.flatMap((row): MerchantCartLine[] => {
      const quantity = quantities.get(row.itemKind) ?? 0;
      return quantity > 0 ? [{ itemKind: row.itemKind, quantity }] : [];
    });
    const totalBronze = lines.reduce((total, line) => {
      const row = rows.find((candidate) => candidate.itemKind === line.itemKind);
      return total + BigInt(row?.unitPrice ?? 0) * BigInt(line.quantity);
    }, 0n);
    const affordable = this.tab === 'sell' || totalBronze <= (this.model?.balanceBronze ?? 0n);
    return {
      tab: this.tab,
      lines,
      totalBronze,
      affordable,
      canCommit: !this.transactionPending && lines.length > 0 && affordable,
      pending: this.transactionPending,
    };
  }


  update(model:NpcInteractionModel|null):void{
    const wasShop=this.shopOpen,previous=this.model;this.model=model;
    if(!model||previous?.npcId!==model.npcId||previous?.dialogueId!==model.dialogueId||wasShop&&!this.shopOpen){this.sessionVersion++;this.transactionPending=false;}
    if(!model||wasShop&&!this.shopOpen){this.buyQuantities.clear();this.sellQuantities.clear();this.filterText='';}
    if(previous?.npcId!==model?.npcId||previous?.dialogueId!==model?.dialogueId){this.dialogue?.dispose();this.dialogue=undefined;this.merchant?.dispose();this.merchant=undefined;}
    this.reconcileCartQuantities();this.syncKit();
  }
  private syncKit():void{
    const model=this.model,node=this.node();
    if(!model||!node){this.dialogue?.dispose();this.dialogue=undefined;this.merchant?.dispose();this.merchant=undefined;this.bridge?.sync();return;}
    if(this.ownsRoot)this.kitRoot.resize(model.width,model.height);
    const layout={position:'fixed' as const,zLayer:'modal' as const,inset:{left:8 as const,top:8 as const},width:uiFixed(Math.max(0,model.width-16)),height:uiFixed(Math.max(0,model.height-16))};
    if(node.mode==='shop'){
      this.dialogue?.dispose();this.dialogue=undefined;const state=this.shopState;
      const data={speaker:node.speaker,tab:this.tab,rows:this.shopRows().map(row=>({...row,quantity:this.cartQuantities().get(row.itemKind)??0})),balanceBronze:model.balanceBronze,totalBronze:state.totalBronze,pending:state.pending,canCommit:state.canCommit,filter:this.filterText};
      if(!this.merchant){this.merchant=uiMerchant({model:data,artwork:this.itemArt,layout,onTab:tab=>this.setTab(tab),onFilter:query=>this.setFilterText(query),onQuantity:(id,quantity)=>{if(this.transactionPending)return;const row=this.allShopRows().find(row=>row.itemKind===id);if(row)this.cartQuantities().set(id,Math.max(0,Math.min(row.maximumQuantity,quantity)));this.syncKit();},onCommit:()=>this.commitCart(),onBack:()=>this.callbacks.chooseDialogueOption('back'),onClose:()=>this.callbacks.closeDialogue()});this.kitRoot.mount(this.merchant);}
      this.merchant.setStyle(layout);this.merchant.updateMerchant(data);
    }else{
      this.merchant?.dispose();this.merchant=undefined;
      const data={id:model.nodeId,speaker:node.speaker,body:node.body,choices:this.allDialogueChoices().map(choice=>({id:choice.id,label:choice.label,tone:choice.tone==='accept'?'success' as const:choice.tone==='decline'?'danger' as const:'neutral' as const,marker:choice.questMarker==='offer'?this.itemArt.quest_offer:choice.questMarker==='complete'?this.itemArt.quest_complete:undefined,tooltip:dialogueChoiceRewardTooltip(choice)}))};
      if(!this.dialogue){this.dialogue=uiDialogue({model:data,layout,choose:id=>this.callbacks.chooseDialogueOption(id),onClose:()=>this.callbacks.closeDialogue(),portrait:(context,bounds)=>this.drawPortrait(context,this.model?.npcId??0n,bounds)});this.kitRoot.mount(this.dialogue);}
      this.dialogue.setStyle(layout);this.dialogue.updateDialogue(data);
    }
    this.kitRoot.arrange();this.bridge?.sync();
  }
  handleKeyDown(code:string,repeat:boolean,modifiers:{shift?:boolean;control?:boolean;alt?:boolean;meta?:boolean}={}):boolean{
    if(!this.model)return false;if(repeat)return true;
    if(code==='Escape'){if(this.shopOpen)this.callbacks.chooseDialogueOption('back');else this.callbacks.closeDialogue();return true;}
    if(this.dialogue?.handleDialogueKey(code))return true;
    if(this.shopOpen&&(code==='Digit1'||code==='Digit2')){this.setTab(code==='Digit1'?'buy':'sell');return true;}
    this.kitRoot.key({key:code==='Space'?' ':code,shiftKey:modifiers.shift,ctrlKey:modifiers.control,altKey:modifiers.alt,metaKey:modifiers.meta});this.bridge?.sync();return true;
  }
  pointerMove(point:UiPoint):boolean{
    if(!this.model)return false;this.pointer=point;
    if(this.swipe){const delta=point.y-this.swipe.start.y;if(Math.abs(delta)>4&&!this.swipe.active){this.swipe.active=true;this.kitRoot.pointer({type:'cancel',point,button:0,pointerId:1});}if(this.swipe.active){scrollUiElement(this.swipe.node,0,this.swipe.y-delta);return true;}}
    this.kitRoot.pointer({type:'move',point,button:0,pointerId:1});return true;
  }
  pointerDown(point:UiPoint,button:number,modifiers:BoundedStepperModifiers&{readonly pointerType?:string}={}):boolean{
    if(!this.model)return false;this.pointer=point;this.pressModifiers=modifiers;this.kitRoot.pointer({type:'move',point,button,pointerId:1});this.kitRoot.pointer({type:'down',point,button,pointerId:1,shiftKey:modifiers.shift,ctrlKey:modifiers.control});
    if(modifiers.pointerType==='touch'){let node=this.kitRoot.input.hovered;while(node&&node.scroll.maxY<=0)node=node.parent;if(node)this.swipe={node,start:point,y:node.scroll.y,active:false};}
    this.bridge?.sync();return true;
  }
  pointerUp():boolean{if(!this.model)return false;const active=this.swipe?.active;this.swipe=undefined;if(!active)this.kitRoot.pointer({type:'up',point:this.pointer,button:0,pointerId:1,shiftKey:this.pressModifiers.shift,ctrlKey:this.pressModifiers.control});this.bridge?.sync();return true;}
  pointerLeave():void{this.kitRoot.pointer({type:'cancel',point:this.pointer,button:0,pointerId:1});this.pointer={x:-100,y:-100};this.swipe=undefined;}
  wheel(point:UiPoint,deltaY:number):boolean{if(!this.model)return false;this.kitRoot.wheel({point,deltaX:0,deltaY});return true;}
  draw(context:CanvasRenderingContext2D):void{if(this.ownsRoot&&this.model)this.kitRoot.drawInContext(context);this.bridge?.sync();}
  bindTextInput(canvas:HTMLCanvasElement,clientRect:(rect:UiRect)=>UiRect):void{
    this.bridge?.dispose();this.bridge=new UiTextBridge(canvas,()=>this.shopOpen?this.kitRoot.focus.current:null,event=>{if(event.key==='Escape'){if(this.filterText)this.setFilterText('');else this.kitRoot.focus.set(null);return true;}if(event.key==='Enter'){this.kitRoot.focus.set(null);return true;}return this.kitRoot.key(event);},node=>clientRect(node.rect),()=>this.kitRoot.invalidate());
    for(const type of ['keydown','keyup']as const)this.bridge.input.addEventListener(type,event=>event.stopPropagation());
  }
  private setTab(tab:'buy'|'sell'):void{this.tab=tab;this.syncKit();}
  private allShopRows(tab: 'buy' | 'sell' = this.tab): ShopRow[] {
    if (this.model === null) return [];
    if (tab === 'buy') {
      const shopId = this.model.shopId ?? 'general_tools';
      const authored = this.model.contentRegistry?.shops.get(`shop:${shopId}`)?.offers;
      const offers = authored?.map(({ item }) => item.slice('item:'.length)) ?? merchantOffers(shopId);
      return offers.map((itemKind) => {
        const authoredItem = this.model?.contentRegistry?.items.get(`item:${itemKind}`);
        const compiledEconomy = ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY];
        return {
          itemKind,
          name: authoredItem?.displayName ?? itemDefinition(itemKind)?.displayName ?? itemKind,
          unitPrice: authoredItem?.economy.buy ?? compiledEconomy?.buyPriceBronze ?? 0,
          maximumQuantity: authoredItem?.maxStack ?? maxStackFor(itemKind) ?? 1,
        };
      });
    }
    const quantityByKind = new Map<string, number>();
    const capacityEquipment = this.model.inventory.find((slot) => slot.slot === EQUIPMENT_SLOT_OFFSET + 4);
    const authoredCapacity = capacityEquipment === undefined || capacityEquipment.quantity <= 0
      ? null
      : this.model.contentRegistry?.items.get(`item:${capacityEquipment.itemKind}`)?.equip?.inventoryCapacity;
    const capacity = this.model.backpackSlotCapacity ?? authoredCapacity ?? BASE_BACKPACK_CAPACITY;
    const sellableSlotLimit = BACKPACK_SLOT_OFFSET + Math.max(0, Math.min(BACKPACK_SLOT_COUNT, capacity));
    for (const slot of this.model.inventory) {
      if (slot.slot >= sellableSlotLimit || slot.itemKind === 'empty' || slot.quantity <= 0) continue;
      quantityByKind.set(slot.itemKind, (quantityByKind.get(slot.itemKind) ?? 0) + slot.quantity);
    }
    return [...quantityByKind].flatMap(([itemKind, quantity]) => {
      const authoredItem = this.model?.contentRegistry?.items.get(`item:${itemKind}`);
      const economy = ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY];
      const sell = authoredItem?.economy.sell ?? economy?.sellPriceBronze;
      const tags = authoredItem?.tags ?? itemDefinition(itemKind)?.tags ?? [];
      return sell !== undefined && !tags.includes('trade.unsellable') && !tags.includes('item.quest_unique') ? [{
        itemKind,
        name: authoredItem?.displayName ?? itemDefinition(itemKind)?.displayName ?? itemKind,
        unitPrice: this.model?.sellPriceOverrides?.[itemKind] ?? sell,
        maximumQuantity: quantity,
        ownedQuantity: quantity,
      }] : [];
    }).sort((left, right) => left.name.localeCompare(right.name));
  }

  private shopRows(tab: 'buy' | 'sell' = this.tab): ShopRow[] {
    const query = this.filterText.trim().toLocaleLowerCase();
    const rows = this.allShopRows(tab);
    if (query.length === 0) return rows;
    return rows.filter((row) => row.name.toLocaleLowerCase().includes(query)
      || row.itemKind.toLocaleLowerCase().includes(query));
  }

  private cartQuantities(tab: 'buy' | 'sell' = this.tab): Map<string, number> {
    return tab === 'buy' ? this.buyQuantities : this.sellQuantities;
  }

  private reconcileCartQuantities(): void {
    for (const tab of ['buy', 'sell'] as const) {
      const maximumByKind = new Map(this.allShopRows(tab).map((row) => [row.itemKind, row.maximumQuantity]));
      const quantities = this.cartQuantities(tab);
      for (const [itemKind, quantity] of quantities) {
        const maximum = maximumByKind.get(itemKind);
        if (maximum === undefined) quantities.delete(itemKind);
        else quantities.set(itemKind, Math.max(0, Math.min(maximum, quantity)));
      }
    }
  }

  private commitCart(): void {
    const state = this.shopState;
    if (!state.canCommit) return;
    const submittedTab = state.tab, version=this.sessionVersion;
    this.transactionPending = true; this.syncKit();
    let request: Promise<void>;
    try {
      request = submittedTab === 'buy'
        ? this.callbacks.buy(state.lines)
        : this.callbacks.sell(state.lines);
    } catch {
      this.transactionPending = false; this.syncKit();
      return;
    }
    void request.then(() => {
      if(version!==this.sessionVersion)return;
      const quantities = this.cartQuantities(submittedTab);
      for (const line of state.lines) quantities.set(line.itemKind, 0);
    }).catch(() => undefined).finally(() => {
      if(version!==this.sessionVersion)return;
      this.transactionPending = false; this.syncKit();
    });
  }

  private allDialogueChoices(): readonly DialogueChoice[] {
    if (this.model === null) return [];
    const definition = (this.model.contentRegistry === undefined ? dialogueDefinition(this.model.dialogueId)
      : runtimeDialogueDefinition(this.model.contentRegistry, this.model.dialogueId));
    const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
    return node?.mode === 'dialogue'
      ? node.choices.filter((choice) => dialogueChoiceIsAvailable(choice, this.model?.quests))
      : [];
  }

}
