import { HearthSealFlow, type HearthSealOffer } from './hearth-seal-flow.js';
import { hearthSealLayout, drawHearthSealPanel, hearthSealShopControls } from './hearth-seal-panel.js';
import {VillageOrderFlow,type VillageOrderOffer} from './village-order-flow.js';
import {villageOrderLayout,drawVillageOrderPanel} from './village-order-panel.js';
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
  runtimeQuestDefinition,
  dialogueNode,
  itemDefinition,
  maxStackFor,
  questDefinition,
  type DialogueChoice,
  type FrameContentDefinition,
  type ContentRegistry,
  type MerchantCartLine,
  hearthRecipeExchangeNpcForRuntimeId,
} from '@orchard/sim';
import type { LoadedAsset } from './assets.js';
import { furnitureShopDetails } from './furniture-shop-details.js';
import { drawPixelText, measurePixelText, type PixelUi } from './pixel-ui.js';
import { drawCanvasTextInput } from './canvas-text-input.js';
import { itemIconAnimation, type OverworldUiInventorySlot, type OverworldUiItemArt } from './overworld-ui.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { Ribbon } from './ribbon.js';
import { ScrollBar } from './scrollbar.js';
import { CurrencyDisplay } from './currency-display.js';
import {
  boundedStepperValue,
  type BoundedStepperModifiers,
  type StepperDirection,
} from './bounded-stepper.js';
import { drawUiLabelPlate, drawUiSkinAsset, uiAssetFrame, type UiSkin } from './skin.js';
import { drawContentFrame, layoutContentFrame } from './content-frame.js';

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
  readonly knownRecipeIds?: readonly string[];
  readonly sealSessionKey?: string;
  readonly villageOrders?:readonly VillageOrderOffer[];
  readonly orderSessionKey?:string;
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
  return frame?.retired !== true && frame?.presentation?.surface === 'merchant' ? frame : null;
}

export interface NpcInteractionCallbacks {
  readonly unlockHearthLegendaryRecipe?: (offer: HearthSealOffer) => Promise<void>;
  readonly fulfillVillageOrder?:(offer:VillageOrderOffer)=>Promise<void>;
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
  const footerY = frame.y + frame.height - SHOP_FOOTER_BOTTOM_PADDING - 19;
  const visibleRows = Math.max(1, Math.min(SHOP_MAX_VISIBLE_ROWS,
    Math.floor((footerY - (frame.y + SHOP_LIST_TOP) - 2) / SHOP_ROW_HEIGHT)));
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
      y: frame.y + (frameWidth < 360 ? 20 : SHOP_HEADER_TOP - 1),
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

function wrapText(text: string, maximumWidth: number, fonts: PixelUi): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measurePixelText(candidate, 1, fonts.font) > maximumWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

export function dialogueChoiceIsAvailable(
  choice: DialogueChoice,
  quests: readonly { readonly questId: string; readonly state: string }[] = [],
  registry?: ContentRegistry,
): boolean {
  if (choice.quest === undefined) return true;
  const definition = registry === undefined
    ? questDefinition(choice.quest.questId)
    : runtimeQuestDefinition(registry, choice.quest.questId);
  if (definition === null) return false;
  const row = quests.find((quest) => quest.questId === choice.quest?.questId);
  if (choice.quest.requires !== 'available') return row?.state === choice.quest.requires;
  if (row !== undefined) return false;
  return definition.prerequisiteQuestIds?.every((questId) => (
    quests.some((quest) => quest.questId === questId && quest.state === 'turned_in')
  )) !== false;
}

export function dialogueChoiceRewardTooltip(
  choice: DialogueChoice | null | undefined,
  registry?: ContentRegistry,
): string | null {
  if (choice?.quest?.action !== 'turn_in') return null;
  const definition = registry === undefined
    ? questDefinition(choice.quest.questId)
    : runtimeQuestDefinition(registry, choice.quest.questId);
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
    const name = itemPresentationName(reward.itemKind, registry);
    rewards.push(`${name.toUpperCase()} ×${reward.count}`);
  }
  if (definition.rewards.homesteadSizeTier !== undefined) {
    rewards.push(`HOMESTEAD TIER ${definition.rewards.homesteadSizeTier}`);
  }
  return `REWARDS: ${rewards.length > 0 ? rewards.join(' / ') : 'NONE'}`;
}

function drawItemIcon(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset | undefined,
  itemKind: string,
  destination: UiRect,
): void {
  if (!asset) return;
  const frame = uiAssetFrame(asset, itemIconAnimation(itemKind));
  if (!frame) return;
  const scale = Math.min(destination.width / frame.width, destination.height / frame.height);
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  context.drawImage(
    asset.image, frame.x, frame.y, frame.width, frame.height,
    Math.round(destination.x + (destination.width - width) / 2),
    Math.round(destination.y + (destination.height - height) / 2),
    width, height,
  );
}

function itemPresentationName(itemKind: string, registry?: ContentRegistry): string {
  if (registry === undefined) return itemDefinition(itemKind)?.displayName ?? itemKind.replaceAll('_', ' ');
  const definition = registry.items.get(`item:${itemKind}`);
  return definition === undefined || definition.retired === true
    ? itemKind.replaceAll('_', ' ')
    : definition.displayName;
}

/** Reusable modal interaction surface for branching dialogue and merchant
 * inventories. Server rows choose the current node; this class only presents
 * options and emits explicit intent. */
export class NpcInteractionUi {
  readonly sealFlow = new HearthSealFlow();
  private sealsOpen = false;
  private sealPage = 0;
  readonly orderFlow=new VillageOrderFlow();
  private ordersOpen=false;
  private model: NpcInteractionModel | null = null;
  private tab: 'buy' | 'sell' = 'buy';
  private selectedItemKind: string | null = null;
  private inspectingItemKind: string | null = null;
  private pendingTouchFurnitureKind: string | null = null;
  private readonly detailScrollBar: ScrollBar;
  private readonly buyQuantities = new Map<string, number>();
  private readonly sellQuantities = new Map<string, number>();
  private transactionPending = false;
  private pointer: UiPoint = { x: -100, y: -100 };
  private hoveredItemKind: string | null = null;
  private pendingTouchDialogueChoice: string | null = null;
  private filterText = '';
  private readonly ribbon: Ribbon;
  private readonly scrollBar: ScrollBar;
  private readonly dialogueScrollBar: ScrollBar;
  private readonly currencyDisplay: CurrencyDisplay;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly itemArt: OverworldUiItemArt,
    private readonly callbacks: NpcInteractionCallbacks,
    private readonly drawPortrait: NpcInteractionPortraitDrawer = () => undefined,
    private readonly filterInput?: HTMLInputElement,
  ) {
    this.ribbon = new Ribbon(skin.banner, fonts);
    this.scrollBar = new ScrollBar(skin);
    this.dialogueScrollBar = new ScrollBar(skin);
    this.detailScrollBar = new ScrollBar(skin);
    this.currencyDisplay = new CurrencyDisplay(skin, fonts);
    if (filterInput !== undefined) {
      filterInput.maxLength = 32;
      filterInput.autocomplete = 'off';
      filterInput.addEventListener('input', () => this.setFilterText(filterInput.value));
      filterInput.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          if (filterInput.value.length > 0) this.setFilterText('');
          else filterInput.blur();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          filterInput.blur();
        }
      });
      filterInput.addEventListener('keyup', (event) => event.stopPropagation());
    }
  }

  get active(): boolean { return this.model !== null; }
  get shopOpen(): boolean {
    if (this.model === null) return false;
    const definition = (this.model.contentRegistry === undefined ? dialogueDefinition(this.model.dialogueId)
      : runtimeDialogueDefinition(this.model.contentRegistry, this.model.dialogueId));
    return definition !== null && dialogueNode(definition, this.model.nodeId)?.mode === 'shop';
  }
  get filterValue(): string { return this.filterText; }
  get tooltipText(): string | null {
    return this.shopOpen ? null : dialogueChoiceRewardTooltip(
      this.hoveredDialogueChoice(), this.model?.contentRegistry,
    );
  }

  setFilterText(value: string): void {
    const next = value.replace(/[\r\n]/g, '').slice(0, 32);
    if (next === this.filterText) return;
    this.filterText = next;
    if (this.filterInput !== undefined && this.filterInput.value !== next) this.filterInput.value = next;
    this.scrollBar.scrollToEnd();
    this.scrollBar.scrollBy(-this.scrollBar.maximum);
    const rows = this.shopRows();
    this.scrollBar.setMetrics(rows.length, npcInteractionLayout(
      this.model?.width ?? 320, this.model?.height ?? 240, true,
    ).visibleRows);
    if (!rows.some((row) => row.itemKind === this.selectedItemKind)) {
      this.selectedItemKind = rows[0]?.itemKind ?? null;
    }
  }

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

  update(model: NpcInteractionModel | null): void {
    if (model?.sealSessionKey !== this.model?.sealSessionKey || model?.npcId !== this.model?.npcId || model?.nodeId !== 'shop') {
      this.sealsOpen = false; this.sealPage = 0;
    }
    this.sealFlow.update(model?.knownRecipeIds === undefined ? null : model.sealSessionKey ?? null,
      model?.npcId ?? null, model?.nodeId ?? null, model?.contentRegistry, new Set(model?.knownRecipeIds ?? []));
    this.sealPage = Math.min(this.sealPage, Math.max(0, Math.ceil(this.sealFlow.offers.length / 6) - 1));
    if(model?.npcId!==this.model?.npcId||model?.orderSessionKey!==this.model?.orderSessionKey)this.ordersOpen=false;
    this.orderFlow.update(model===null?null:model.orderSessionKey??model.npcId.toString(),model?.npcId??null,model?.villageOrders??[]);
    if (model?.npcId !== this.model?.npcId || model?.nodeId !== this.model?.nodeId) this.closeFurnitureDetails();
    const wasShopOpen = this.shopOpen;
    const previousNode = this.model?.nodeId ?? null;
    this.model = model;
    if (this.inspectingItemKind && (!furnitureShopDetails(model?.contentRegistry, this.inspectingItemKind)
      || !this.allShopRows().some(row => row.itemKind === this.inspectingItemKind))) this.closeFurnitureDetails();
    if (model === null) {
      this.pendingTouchDialogueChoice = null;
      this.selectedItemKind = null;
      this.hoveredItemKind = null;
      this.buyQuantities.clear();
      this.sellQuantities.clear();
      this.setFilterText('');
      if (this.filterInput !== undefined) {
        this.filterInput.hidden = true;
        this.filterInput.blur();
      }
      return;
    }
    if (wasShopOpen && !this.shopOpen) {
      this.buyQuantities.clear();
      this.sellQuantities.clear();
      this.setFilterText('');
    }
    if (this.filterInput !== undefined) this.filterInput.hidden = !this.shopOpen || this.inspectingItemKind !== null || this.sealsOpen;
    if (previousNode !== model.nodeId && !this.shopOpen) this.selectedItemKind = null;
    this.reconcileCartQuantities();
    const rows = this.shopRows();
    this.scrollBar.setMetrics(rows.length, npcInteractionLayout(model.width, model.height, true).visibleRows);
    const dialogueLayout = npcInteractionLayout(model.width, model.height, false);
    this.dialogueScrollBar.setMetrics(
      this.allDialogueChoices().length,
      Math.max(1, Math.floor(dialogueLayout.dialogueList.height / 22)),
    );
    if (previousNode !== model.nodeId) {
      this.dialogueScrollBar.scrollToEnd();
      this.dialogueScrollBar.scrollBy(-this.dialogueScrollBar.maximum);
    }
    const selected = rows.find((row) => row.itemKind === this.selectedItemKind);
    if (!selected) this.selectedItemKind = rows[0]?.itemKind ?? null;
  }

  handleKeyDown(code: string, repeat: boolean): boolean {
    if (this.model === null) return false;
    if (this.sealsOpen) {
      if (repeat) return true;
      if (code === 'Escape') this.sealBack();
      else if (code === 'Enter' && this.sealFlow.review) this.unlockSealRecipe();
      else if (!this.sealFlow.review) {
        if (code === 'ArrowRight') this.changeSealPage(1);
        else if (code === 'ArrowLeft') this.changeSealPage(-1);
        else {
          const index = Number(/^Digit([1-6])$/.exec(code)?.[1] ?? 0) - 1;
          const offer = index < 0 ? undefined : this.sealFlow.offers[this.sealPage * 6 + index];
          if (offer) this.sealFlow.select(offer.recipeId);
        }
      }
      return true;
    }
    if (code === 'KeyL' && !repeat && this.sealExchangeAvailable()) { this.openSealPanel(); return true; }
    if(this.ordersOpen){
      if(repeat)return true;
      if(code==='Escape')this.orderBack();
      else if(code==='Enter'&&this.orderFlow.review)this.deliverOrder();
      else {const index=Number(/^Digit([1-3])$/.exec(code)?.[1]??0)-1;const offer=this.orderFlow.offers[index];if(offer&&!this.orderFlow.review)this.orderFlow.select(offer.id);}
      return true;
    }
    if (code === 'Escape') {
      if (this.inspectingItemKind !== null) { this.closeFurnitureDetails(); return true; }
      if (this.shopOpen) this.callbacks.chooseDialogueOption('back');
      else this.callbacks.closeDialogue();
      return true;
    }
    if (repeat) return true;
    if (this.inspectingItemKind !== null) {
      if (code === 'Enter' && !this.transactionPending) this.addInspectedToCart({});
      else this.detailScrollBar.handleKey(code);
      return true;
    }
    const definition = (this.model.contentRegistry === undefined ? dialogueDefinition(this.model.dialogueId)
      : runtimeDialogueDefinition(this.model.contentRegistry, this.model.dialogueId));
    const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
    if (node?.mode === 'dialogue') {
      const match = /^Digit([1-9])$/.exec(code);
      const index = match ? Number(match[1]) - 1 : -1;
      const choice = this.allDialogueChoices()[index];
      if (choice) this.chooseChoice(choice.id);
      else this.dialogueScrollBar.handleKey(code);
      return true;
    }
    if (code === 'Digit1') { this.setTab('buy'); return true; }
    if (code === 'Digit2') { this.setTab('sell'); return true; }
    if (this.scrollBar.handleKey(code)) return true;
    return true;
  }

  pointerMove(point: UiPoint): boolean {
    if (this.model === null) return false;
    this.pointer = point;
    if(this.ordersOpen || this.sealsOpen)return true;
    if (this.inspectingItemKind !== null) {
      this.detailScrollBar.pointerMove(point); this.detailScrollBar.swipeMove(point, 10); return true;
    }
    this.scrollBar.pointerMove(point);
    this.dialogueScrollBar.pointerMove(point);
    if (this.shopOpen) this.scrollBar.swipeMove(point, SHOP_ROW_HEIGHT);
    else this.dialogueScrollBar.swipeMove(point, 22);
    this.hoveredItemKind = null;
    if (this.shopOpen) {
      for (const entry of this.visibleShopRows()) {
        if (containsPoint(entry.rect, point)) this.hoveredItemKind = entry.row.itemKind;
      }
    }
    return true;
  }

  pointerDown(point: UiPoint, button: number, modifiers: BoundedStepperModifiers & {
    readonly pointerType?: string;
  } = {}): boolean {
    if (this.model === null) return false;
    this.pointer = point;
    if (button !== 0) return true;
    if (this.sealsOpen) {
      const l = hearthSealLayout(this.model.width, this.model.height);
      if (containsPoint(l.back, point)) this.sealBack();
      else if (this.sealFlow.review) { if (containsPoint(l.unlock, point)) this.unlockSealRecipe(); }
      else {
        if (containsPoint(l.previous, point)) this.changeSealPage(-1);
        else if (containsPoint(l.next, point)) this.changeSealPage(1);
        else l.rows.forEach((row, i) => {
          const offer = this.sealFlow.offers[this.sealPage * 6 + i];
          if (offer && containsPoint(row, point)) this.sealFlow.select(offer.recipeId);
        });
      }
      return true;
    }
    if(this.ordersOpen){
      const l=villageOrderLayout(this.model.width,this.model.height);
      if(containsPoint(l.close,point)){this.ordersOpen=false;return true;}
      if(containsPoint(l.back,point)){this.orderBack();return true;}
      if(this.orderFlow.review){if(containsPoint(l.deliver,point))this.deliverOrder();}
      else l.rows.forEach((row,i)=>{const offer=this.orderFlow.offers[i];if(offer&&containsPoint(row,point))this.orderFlow.select(offer.id);});
      return true;
    }
    const layout = npcInteractionLayout(this.model.width, this.model.height, this.shopOpen);
    if (containsPoint(layout.close, point)) { this.callbacks.closeDialogue(); return true; }
    if (this.inspectingItemKind !== null) {
      this.detailScrollBar.beginSwipe(point, { ...layout.list, y: layout.frame.y + 34, height: layout.back.y - layout.frame.y - 38 }, modifiers.pointerType);
      if (this.detailScrollBar.pointerDown(point)) return true;
      if (containsPoint(layout.back, point)) this.closeFurnitureDetails();
      else if (containsPoint(layout.action, point) && !this.transactionPending) {
        this.addInspectedToCart(modifiers);
      }
      return true;
    }
    const definition = (this.model.contentRegistry === undefined ? dialogueDefinition(this.model.dialogueId)
      : runtimeDialogueDefinition(this.model.contentRegistry, this.model.dialogueId));
    const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
    if (node?.mode !== 'shop') {
      this.dialogueScrollBar.beginSwipe(point, layout.dialogueList, modifiers.pointerType);
      if (this.dialogueScrollBar.pointerDown(point)) return true;
      const choices = this.visibleDialogueChoices();
      const choiceRects = this.dialogueChoiceRects(layout, choices.length);
      const index = choiceRects.findIndex((rect) => containsPoint(rect, point));
      const choice = choices[index];
      if (choice) {
        if (modifiers.pointerType === 'touch') this.pendingTouchDialogueChoice = choice.id;
        else this.chooseChoice(choice.id);
      }
      return true;
    }
    if (this.sealExchangeAvailable() && containsPoint(hearthSealShopControls(layout.back, layout.action).seals, point)) { this.openSealPanel(); return true; }
    if (containsPoint(layout.buyTab, point)) { this.setTab('buy'); return true; }
    if (containsPoint(layout.sellTab, point)) { this.setTab('sell'); return true; }
    if (containsPoint(layout.filter, point)) {
      this.filterInput?.focus({ preventScroll: true });
      return true;
    }
    this.scrollBar.beginSwipe(point, layout.list, modifiers.pointerType);
    if (this.scrollBar.pointerDown(point)) return true;
    if (containsPoint(layout.back, point)) { this.callbacks.chooseDialogueOption('back'); return true; }
    for (const entry of this.visibleShopRows()) {
      if (!containsPoint(entry.rect, point)) continue;
      this.selectedItemKind = entry.row.itemKind;
      const minus = { x: entry.rect.x + entry.rect.width - 76, y: entry.rect.y + 8, width: 18, height: 18 };
      const plus = { x: entry.rect.x + entry.rect.width - 22, y: entry.rect.y + 8, width: 18, height: 18 };
      if (!this.transactionPending && containsPoint(minus, point)) this.adjustQuantity(entry.row, -1, modifiers);
      else if (!this.transactionPending && containsPoint(plus, point)) this.adjustQuantity(entry.row, 1, modifiers);
      else if (this.tab === 'buy' && furnitureShopDetails(this.model.contentRegistry, entry.row.itemKind)) {
        if (modifiers.pointerType === 'touch') this.pendingTouchFurnitureKind = entry.row.itemKind;
        else this.openFurnitureDetails(entry.row.itemKind);
      }
      return true;
    }
    if (containsPoint(layout.action, point)) this.commitCart();
    return true;
  }

  pointerUp(): boolean {
    if (this.model === null) return false;
    if (this.sealsOpen) return true;
    const shopSwiped = this.scrollBar.endSwipe();
    const dialogueSwiped = this.dialogueScrollBar.endSwipe();
    this.detailScrollBar.endSwipe(); this.detailScrollBar.pointerUp();
    if (shopSwiped || dialogueSwiped) {
      this.pendingTouchFurnitureKind = null;
      this.pendingTouchDialogueChoice = null;
      return true;
    }
    if (this.pendingTouchFurnitureKind !== null) {
      this.openFurnitureDetails(this.pendingTouchFurnitureKind); this.pendingTouchFurnitureKind = null;
    }
    if (this.pendingTouchDialogueChoice !== null) {
      const choiceId = this.pendingTouchDialogueChoice;
      this.pendingTouchDialogueChoice = null;
      this.chooseChoice(choiceId);
    }
    this.scrollBar.pointerUp();
    this.dialogueScrollBar.pointerUp();
    return true;
  }

  pointerLeave(): void {
    this.pendingTouchFurnitureKind = null;
    this.detailScrollBar.pointerLeave();
    this.pointer = { x: -100, y: -100 };
    this.hoveredItemKind = null;
    this.scrollBar.pointerLeave();
    this.dialogueScrollBar.pointerLeave();
    this.pendingTouchDialogueChoice = null;
  }

  wheel(point: UiPoint, deltaY: number): boolean {
    if (this.model === null) return false;
    if(this.ordersOpen || this.sealsOpen)return true;
    const layout = npcInteractionLayout(this.model.width, this.model.height, this.shopOpen);
    if (!containsPoint(layout.frame, point)) return false;
    if (this.inspectingItemKind !== null) return this.detailScrollBar.wheel(deltaY, 1);
    return this.shopOpen ? this.scrollBar.wheel(deltaY, 1) : this.dialogueScrollBar.wheel(deltaY, 1);
  }

  draw(context: CanvasRenderingContext2D): void {
    if (this.sealsOpen && this.model) { drawHearthSealPanel(context, this.skin, this.fonts, this.sealFlow, this.model.width, this.model.height, this.sealPage); return; }
    if(this.ordersOpen&&this.model){drawVillageOrderPanel(context,this.skin,this.fonts,this.orderFlow,this.model.width,this.model.height,kind=>itemPresentationName(kind,this.model?.contentRegistry));return;}
    if (this.model === null) return;
    const definition = (this.model.contentRegistry === undefined ? dialogueDefinition(this.model.dialogueId)
      : runtimeDialogueDefinition(this.model.contentRegistry, this.model.dialogueId));
    const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
    if (!node) return;
    const layout = npcInteractionLayout(this.model.width, this.model.height, node.mode === 'shop');
    const shopFrame = npcInteractionFrame(this.model);
    if (shopFrame !== null && this.model.contentRegistry !== undefined) {
      // This modal lays out its own offers and controls. Hidden storage panes
      // must not enlarge its outer frame beyond those controls or the viewport.
      const surfaceFrame: FrameContentDefinition = {
        id: shopFrame.id, kind: 'frame', schemaVersion: 1, title: shopFrame.title,
        style: shopFrame.style, panes: [{ id: 'surface', kind: 'recipe_list', minWidth: 1, bind: { merchant: 'offers' } }],
      };
      drawContentFrame(context, layoutContentFrame(
        { width: this.model.width, height: this.model.height },
        surfaceFrame,
        { backpack: 'backpack', merchant: 'merchant' },
        this.model.contentRegistry,
        layout.frame,
      ), {}, {
        skin: this.skin, fonts: this.fonts, pointer: this.pointer,
        drawSlot: () => undefined, drawPane: () => true,
        drawButtons: false, drawResizeHandles: false,
      });
    } else drawUiSkinAsset(context, this.skin.panelWood, layout.frame);
    this.ribbon.draw(context, node.mode === 'shop' ? `${node.speaker.toUpperCase()}'S SHOP` : node.speaker.toUpperCase(), layout.frame.x + layout.frame.width / 2, layout.frame.y - 5);
    drawUiSkinAsset(context, this.skin.buttonDeny, layout.close, 'idle');
    drawPixelText(context, this.fonts, 'X', layout.close.x + layout.close.width / 2, layout.close.y + 4, { align: 'center', color: '#fff1d2' });
    if (node.mode === 'shop') this.drawShop(context, layout);
    else this.drawDialogue(context, layout, node.body, this.visibleDialogueChoices());
  }

  private setTab(tab: 'buy' | 'sell'): void {
    this.closeFurnitureDetails();
    this.tab = tab;
    this.selectedItemKind = null;
    this.scrollBar.scrollToEnd();
    this.scrollBar.scrollBy(-this.scrollBar.maximum);
    const rows = this.shopRows();
    this.scrollBar.setMetrics(rows.length, npcInteractionLayout(this.model?.width ?? 320, this.model?.height ?? 240, true).visibleRows);
    this.selectedItemKind = rows[0]?.itemKind ?? null;
  }

  private closeFurnitureDetails(): void {
    this.inspectingItemKind = null;
    this.pendingTouchFurnitureKind = null;
    this.detailScrollBar.pointerLeave();
    if (this.filterInput) this.filterInput.hidden = !this.shopOpen;
  }

  private openFurnitureDetails(itemKind: string): void {
    this.inspectingItemKind = itemKind;
    this.detailScrollBar.scrollBy(-this.detailScrollBar.maximum);
    if (this.filterInput) { this.filterInput.hidden = true; this.filterInput.blur(); }
  }

  private addInspectedToCart(modifiers: BoundedStepperModifiers): void {
    const row = this.allShopRows().find(row => row.itemKind === this.inspectingItemKind);
    if (row) this.adjustQuantity(row, 1, modifiers);
    this.closeFurnitureDetails();
  }

  private allShopRows(tab: 'buy' | 'sell' = this.tab): ShopRow[] {
    if (this.model === null) return [];
    if (tab === 'buy') {
      const shopId = this.model.shopId;
      if (shopId === undefined || shopId.length === 0) return [];
      const registry = this.model.contentRegistry;
      if (registry !== undefined) {
        const shop = registry.shops.get(`shop:${shopId}`);
        if (shop === undefined || shop.retired === true) return [];
        return shop.offers.flatMap(({ item }): ShopRow[] => {
          const itemKind = item.slice('item:'.length);
          const definition = registry.items.get(item);
          if (definition === undefined || definition.retired === true || definition.economy.buy === null) return [];
          return [{
            itemKind,
            name: definition.displayName,
            unitPrice: definition.economy.buy,
            maximumQuantity: definition.maxStack,
          }];
        });
      }
      return merchantOffers(shopId).flatMap((itemKind): ShopRow[] => {
        const economy = ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY];
        if (economy?.buyPriceBronze == null) return [];
        return [{
          itemKind,
          name: itemDefinition(itemKind)?.displayName ?? itemKind,
          unitPrice: economy.buyPriceBronze,
          maximumQuantity: maxStackFor(itemKind) ?? 1,
        }];
      });
    }
    const quantityByKind = new Map<string, number>();
    const capacityEquipment = this.model.inventory.find((slot) => slot.slot === EQUIPMENT_SLOT_OFFSET + 4);
    const capacityDefinition = capacityEquipment === undefined || capacityEquipment.quantity <= 0
      || this.model.contentRegistry === undefined
      ? undefined
      : this.model.contentRegistry.items.get(`item:${capacityEquipment.itemKind}`);
    const authoredCapacity = capacityDefinition?.retired === true
      ? null
      : capacityDefinition?.equip?.inventoryCapacity;
    const capacity = this.model.backpackSlotCapacity ?? authoredCapacity ?? BASE_BACKPACK_CAPACITY;
    const sellableSlotLimit = BACKPACK_SLOT_OFFSET + Math.max(0, Math.min(BACKPACK_SLOT_COUNT, capacity));
    for (const slot of this.model.inventory) {
      if (slot.slot >= sellableSlotLimit || slot.itemKind === 'empty' || slot.quantity <= 0) continue;
      quantityByKind.set(slot.itemKind, (quantityByKind.get(slot.itemKind) ?? 0) + slot.quantity);
    }
    const registry = this.model.contentRegistry;
    return [...quantityByKind].flatMap(([itemKind, quantity]) => {
      if (registry !== undefined) {
        const definition = registry.items.get(`item:${itemKind}`);
        if (definition === undefined || definition.retired === true
          || definition.tags.includes('trade.unsellable')
          || definition.tags.includes('item.quest_unique')) return [];
        return [{
          itemKind,
          name: definition.displayName,
          unitPrice: this.model?.sellPriceOverrides?.[itemKind] ?? definition.economy.sell,
          maximumQuantity: quantity,
          ownedQuantity: quantity,
        }];
      }
      const economy = ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY];
      const tags = itemDefinition(itemKind)?.tags ?? [];
      return economy !== undefined && !tags.includes('trade.unsellable') && !tags.includes('item.quest_unique') ? [{
        itemKind,
        name: itemDefinition(itemKind)?.displayName ?? itemKind,
        unitPrice: this.model?.sellPriceOverrides?.[itemKind] ?? economy.sellPriceBronze,
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

  private visibleShopRows(): readonly { readonly row: ShopRow; readonly rect: UiRect }[] {
    if (this.model === null) return [];
    const layout = npcInteractionLayout(this.model.width, this.model.height, true);
    return this.shopRows().slice(this.scrollBar.position, this.scrollBar.position + layout.visibleRows).map((row, index) => ({
      row,
      rect: { x: layout.list.x, y: layout.list.y + index * SHOP_ROW_HEIGHT, width: layout.list.width, height: SHOP_ROW_HEIGHT - 2 },
    }));
  }

  private adjustQuantity(
    row: ShopRow,
    direction: StepperDirection,
    modifiers: BoundedStepperModifiers,
  ): void {
    const quantities = this.cartQuantities();
    const current = quantities.get(row.itemKind) ?? 0;
    quantities.set(row.itemKind, boundedStepperValue(current, direction, 0, row.maximumQuantity, modifiers));
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
    const submittedTab = state.tab;
    this.transactionPending = true;
    let request: Promise<void>;
    try {
      request = submittedTab === 'buy'
        ? this.callbacks.buy(state.lines)
        : this.callbacks.sell(state.lines);
    } catch {
      this.transactionPending = false;
      return;
    }
    void request.then(() => {
      const quantities = this.cartQuantities(submittedTab);
      for (const line of state.lines) quantities.set(line.itemKind, 0);
    }).catch(() => undefined).finally(() => {
      this.transactionPending = false;
    });
  }

  private sealExchangeAvailable(): boolean {
    const npc = this.model?.contentRegistry === undefined || this.model.npcId === undefined
      ? null : hearthRecipeExchangeNpcForRuntimeId(this.model.contentRegistry,this.model.npcId.toString());
    return !!this.callbacks.unlockHearthLegendaryRecipe && !!this.model?.sealSessionKey
      && this.model.knownRecipeIds !== undefined && this.model.nodeId === 'shop'
      && npc !== null;
  }
  private openSealPanel(): void {
    this.sealsOpen = true; this.pendingTouchFurnitureKind = null; this.pendingTouchDialogueChoice = null;
    this.scrollBar.pointerLeave(); this.dialogueScrollBar.pointerLeave();
    if (this.filterInput) { this.filterInput.hidden = true; this.filterInput.blur(); }
  }
  private sealBack(): void {
    if (this.sealFlow.review && !this.sealFlow.pending) this.sealFlow.cancel();
    else { this.sealsOpen = false; if (this.filterInput) this.filterInput.hidden = !this.shopOpen; }
  }
  private changeSealPage(delta: number): void {
    this.sealPage = Math.max(0, Math.min(Math.max(0, Math.ceil(this.sealFlow.offers.length / 6) - 1), this.sealPage + delta));
  }
  private unlockSealRecipe(): void {
    if (this.callbacks.unlockHearthLegendaryRecipe) void this.sealFlow.unlock(this.callbacks.unlockHearthLegendaryRecipe);
  }

  private chooseChoice(id:string):void{
    if(id==='__village_orders'){this.ordersOpen=true;this.pendingTouchDialogueChoice=null;return;}
    this.callbacks.chooseDialogueOption(id);
  }
  private orderBack():void{
    if(this.orderFlow.review&&!this.orderFlow.pending)this.orderFlow.cancel();
    else this.ordersOpen=false;
  }
  private deliverOrder():void{
    if(this.callbacks.fulfillVillageOrder)void this.orderFlow.deliver(this.callbacks.fulfillVillageOrder);
  }

  private allDialogueChoices(): readonly DialogueChoice[] {
    if (this.model === null) return [];
    const definition = (this.model.contentRegistry === undefined ? dialogueDefinition(this.model.dialogueId)
      : runtimeDialogueDefinition(this.model.contentRegistry, this.model.dialogueId));
    const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
    return node?.mode === 'dialogue'
      ? [...(this.callbacks.fulfillVillageOrder&&this.orderFlow.offers.length>0?[{id:'__village_orders',label:'Village orders',nextNodeId:null}]:[]),...node.choices.filter((choice) => dialogueChoiceIsAvailable(choice, this.model?.quests, this.model?.contentRegistry))]
      : [];
  }

  private visibleDialogueChoices(): readonly DialogueChoice[] {
    if (this.model === null) return [];
    const layout = npcInteractionLayout(this.model.width, this.model.height, false);
    const count = Math.max(1, Math.floor(layout.dialogueList.height / 22));
    return this.allDialogueChoices().slice(this.dialogueScrollBar.position, this.dialogueScrollBar.position + count);
  }

  private dialogueChoiceRects(layout: InteractionLayout, count: number): UiRect[] {
    const rowHeight = 22;
    return Array.from({ length: count }, (_, index) => ({
      x: layout.dialogueList.x,
      y: layout.dialogueList.y + index * rowHeight,
      width: layout.dialogueList.width,
      height: 19,
    }));
  }

  private hoveredDialogueChoice(): DialogueChoice | null {
    if (this.model === null || this.shopOpen) return null;
    const layout = npcInteractionLayout(this.model.width, this.model.height, false);
    const choices = this.visibleDialogueChoices();
    const index = this.dialogueChoiceRects(layout, choices.length)
      .findIndex((rect) => containsPoint(rect, this.pointer));
    return choices[index] ?? null;
  }

  private drawDialogue(context: CanvasRenderingContext2D, layout: InteractionLayout, body: string, choices: readonly DialogueChoice[]): void {
    drawUiSkinAsset(context, this.skin.panelParchment, layout.dialoguePortrait);
    drawUiSkinAsset(context, this.skin.frameThin, layout.dialoguePortrait);
    this.drawPortrait(context, this.model?.npcId ?? 0n, {
      x: layout.dialoguePortrait.x + 4,
      y: layout.dialoguePortrait.y + 4,
      width: layout.dialoguePortrait.width - 8,
      height: layout.dialoguePortrait.height - 8,
    });
    wrapText(body, layout.dialogueBody.width, this.fonts).slice(0, 5).forEach((line, index) => {
      drawPixelText(context, this.fonts, line, layout.dialogueBody.x, layout.dialogueBody.y + index * 10, { color: '#f1c58f' });
    });
    this.dialogueChoiceRects(layout, choices.length).forEach((rect, index) => {
      const choice = choices[index];
      const button = choice?.tone === 'accept' ? this.skin.buttonConfirm
        : choice?.tone === 'decline' ? this.skin.buttonDeny : this.skin.button;
      drawUiSkinAsset(context, button, rect, containsPoint(rect, this.pointer) ? 'pressed' : 'idle');
      const marker = choice?.questMarker === 'offer' ? this.itemArt.quest_offer
        : choice?.questMarker === 'complete' ? this.itemArt.quest_complete : undefined;
      if (marker !== undefined) drawItemIcon(context, marker, '', {
        x: rect.x + 4, y: rect.y + 2, width: 16, height: 16,
      });
      const localIndex = this.dialogueScrollBar.position + index + 1;
      drawPixelText(context, this.fonts, `${localIndex}. ${choice?.label ?? ''}`, rect.x + (marker ? 23 : 8), rect.y + 5, {
        color: choice?.tone === 'accept' || choice?.tone === 'decline' ? '#fff1d2' : '#51351f',
      });
    });
    this.dialogueScrollBar.setBounds(layout.dialogueScroll);
    this.dialogueScrollBar.draw(context);
    const tooltipText = this.tooltipText;
    if (tooltipText !== null) {
      const tooltipWidth = layout.frame.width - MODAL_HORIZONTAL_PADDING * 2;
      const lines = wrapText(tooltipText, tooltipWidth - 12, this.fonts).slice(0, 3);
      const tooltip = {
        x: layout.frame.x + MODAL_HORIZONTAL_PADDING,
        y: layout.frame.y + layout.frame.height - lines.length * 10 - 12,
        width: tooltipWidth,
        height: lines.length * 10 + 8,
      };
      drawUiLabelPlate(context, this.skin, tooltip);
      lines.forEach((line, index) => drawPixelText(
        context,
        this.fonts,
        line,
        tooltip.x + tooltip.width / 2,
        tooltip.y + 4 + index * 10,
        { align: 'center', color: '#51351f' },
      ));
    }
  }

  private drawShop(context: CanvasRenderingContext2D, layout: InteractionLayout): void {
    const detail = this.inspectingItemKind === null ? null : furnitureShopDetails(this.model?.contentRegistry, this.inspectingItemKind);
    if (detail) {
      const left = layout.frame.x + MODAL_HORIZONTAL_PADDING, top = layout.frame.y + 34;
      drawItemIcon(context, this.itemArt[detail.itemKind], detail.itemKind, { x: left, y: top, width: 48, height: 64 });
      const offer = this.allShopRows().find(row => row.itemKind === this.inspectingItemKind);
      this.currencyDisplay.draw(context, BigInt(offer?.unitPrice ?? 0), left + 48, top + 68,
        { size: 'small', align: 'right', color: '#51351f', includeZero: offer?.unitPrice === 0 });
      const textX = left + 56, width = layout.frame.width - MODAL_HORIZONTAL_PADDING * 2 - 70;
      const lines = [detail.name.toUpperCase(), ...detail.lines].flatMap(line => wrapText(line.toUpperCase(), width, this.fonts));
      const visible = Math.max(1, Math.floor((layout.back.y - top - 4) / 10));
      this.detailScrollBar.setMetrics(lines.length, visible);
      this.detailScrollBar.setBounds({ x: textX + width + 2, y: top, width: 12, height: visible * 10 });
      lines.slice(this.detailScrollBar.position, this.detailScrollBar.position + visible).forEach((line, index) =>
        drawPixelText(context, this.fonts, line, textX, top + index * 10, { color: '#51351f' }));
      this.detailScrollBar.draw(context);
      drawUiSkinAsset(context, this.skin.button, layout.back, 'idle');
      drawPixelText(context, this.fonts, 'CATALOGUE', layout.back.x + layout.back.width / 2, layout.back.y + 5, { align: 'center', color: '#51351f' });
      drawUiSkinAsset(context, this.transactionPending ? this.skin.buttonDeny : this.skin.buttonConfirm, layout.action, 'idle');
      drawPixelText(context, this.fonts, 'ADD TO CART', layout.action.x + layout.action.width / 2, layout.action.y + 5, { align: 'center', color: '#fff1d2' });
      return;
    }
    drawUiSkinAsset(context, this.tab === 'buy' ? this.skin.buttonConfirm : this.skin.button, layout.buyTab, 'idle');
    drawUiSkinAsset(context, this.tab === 'sell' ? this.skin.buttonConfirm : this.skin.button, layout.sellTab, 'idle');
    drawPixelText(context, this.fonts, 'BUY', layout.buyTab.x + layout.buyTab.width / 2, layout.buyTab.y + 5, { align: 'center', color: this.tab === 'buy' ? '#fff1d2' : '#51351f' });
    drawPixelText(context, this.fonts, 'SELL', layout.sellTab.x + layout.sellTab.width / 2, layout.sellTab.y + 5, { align: 'center', color: this.tab === 'sell' ? '#fff1d2' : '#51351f' });
    drawUiSkinAsset(context, this.skin.frameThin, layout.filter);
    if (this.filterInput !== undefined) {
      drawCanvasTextInput(context, this.fonts, this.filterInput, {
        x: layout.filter.x + 6,
        y: layout.filter.y + 5,
        width: layout.filter.width - 12,
        placeholder: 'FILTER ITEMS',
        color: '#51351f',
        placeholderColor: '#986846',
      });
    } else {
      drawPixelText(context, this.fonts, this.filterText || 'FILTER ITEMS', layout.filter.x + 6, layout.filter.y + 5, {
        color: this.filterText ? '#51351f' : '#986846',
      });
    }
    this.currencyDisplay.draw(context, this.model?.balanceBronze ?? 0n, layout.currency.x, layout.currency.y, {
      size: 'medium', align: 'right', color: '#6b4428', includeZero: true,
    });
    const visibleRows = this.visibleShopRows();
    const quantities = this.cartQuantities();
    for (const { row, rect } of visibleRows) {
      const selected = row.itemKind === this.selectedItemKind;
      drawUiSkinAsset(context, selected ? this.skin.buttonConfirm : this.skin.button, rect, 'idle');
      drawItemIcon(context, this.itemArt[row.itemKind] ?? this.itemArt['missing'], row.itemKind, { x: rect.x + 5, y: rect.y + 5, width: 22, height: 22 });
      const nameWidth = Math.max(0, rect.width - 31 - 80);
      let name = row.name;
      if (measurePixelText(name, 1, this.fonts.font) > nameWidth) {
        while (name.length && measurePixelText(`${name}...`, 1, this.fonts.font) > nameWidth) name = name.slice(0, -1);
        name += '...';
      }
      drawPixelText(context, this.fonts, name, rect.x + 31, rect.y + 6, { color: selected ? '#fff1d2' : '#51351f' });
      const price = this.currencyDisplay.draw(context, BigInt(row.unitPrice), rect.x + 31, rect.y + 17, {
        size: 'small', color: selected ? '#ffe3a1' : '#8c5d3a', includeZero: false,
      });
      if (row.ownedQuantity !== undefined) {
        drawPixelText(context, this.fonts, `OWNED ${row.ownedQuantity}`, price.x + price.width + 6, rect.y + 18, {
          color: selected ? '#ffe3a1' : '#8c5d3a',
        });
      }
      const minus = { x: rect.x + rect.width - 76, y: rect.y + 8, width: 18, height: 18 };
      const plus = { x: rect.x + rect.width - 22, y: rect.y + 8, width: 18, height: 18 };
      const quantity = quantities.get(row.itemKind) ?? 0;
      const canDecrease = !this.transactionPending && quantity > 0;
      const canIncrease = !this.transactionPending && quantity < row.maximumQuantity;
      drawUiSkinAsset(context, this.skin.buttonSmall, minus, canDecrease ? 'idle' : 'disabled');
      drawUiSkinAsset(context, this.skin.buttonSmall, plus, canIncrease ? 'idle' : 'disabled');
      drawPixelText(context, this.fonts, '-', minus.x + 9, minus.y + 5, { align: 'center', color: canDecrease ? '#51351f' : '#8c6f62' });
      drawPixelText(context, this.fonts, '+', plus.x + 9, plus.y + 5, { align: 'center', color: canIncrease ? '#51351f' : '#8c6f62' });
      drawPixelText(context, this.fonts, String(quantity), rect.x + rect.width - 40, rect.y + 12, { align: 'center', color: selected ? '#fff1d2' : '#51351f' });
    }
    this.scrollBar.setBounds(layout.scroll);
    this.scrollBar.draw(context);
    const sealControls = this.sealExchangeAvailable() ? hearthSealShopControls(layout.back, layout.action) : null;
    const back = sealControls?.back ?? layout.back;
    drawUiSkinAsset(context, this.skin.button, back, 'idle');
    drawPixelText(context, this.fonts, 'BACK', back.x + back.width / 2, back.y + 5, { align: 'center', color: '#51351f' });
    if (sealControls) {
      drawUiSkinAsset(context, this.skin.button, sealControls.seals, 'idle');
      drawPixelText(context, this.fonts, 'SEALS', sealControls.seals.x + sealControls.seals.width / 2, sealControls.seals.y + 5, { align: 'center', color: '#51351f' });
    }
    const state = this.shopState;
    drawUiSkinAsset(context, state.canCommit ? this.skin.buttonConfirm : this.skin.buttonDeny, layout.action, 'idle');
    const actionLabel = state.tab === 'buy' ? 'PURCHASE' : 'SELL';
    const actionCurrency = this.currencyDisplay.measure(state.totalBronze, { size: 'small', includeZero: false });
    const actionLabelWidth = measurePixelText(actionLabel, 1, this.fonts.font);
    const actionContentWidth = actionLabelWidth + 4 + actionCurrency.width;
    const actionX = layout.action.x + Math.round((layout.action.width - actionContentWidth) / 2);
    drawPixelText(context, this.fonts, actionLabel, actionX, layout.action.y + 5, { color: '#fff1d2' });
    this.currencyDisplay.draw(context, state.totalBronze, actionX + actionLabelWidth + 4, layout.action.y + 5, {
      size: 'small', color: '#fff1d2', includeZero: false,
    });
    if (this.hoveredItemKind) {
      const authoredItem = this.model?.contentRegistry?.items.get(`item:${this.hoveredItemKind}`);
      const economy = this.model?.contentRegistry === undefined
        ? ITEM_ECONOMY[this.hoveredItemKind as keyof typeof ITEM_ECONOMY]
        : authoredItem?.retired === true ? undefined : authoredItem?.economy;
      if (economy) {
        const tooltip = {
          x: layout.frame.x + MODAL_HORIZONTAL_PADDING,
          y: layout.list.y + layout.list.height + 2,
          width: layout.frame.width - MODAL_HORIZONTAL_PADDING * 2,
          height: 16,
        };
        drawUiLabelPlate(context, this.skin, tooltip);
        drawPixelText(context, this.fonts,
          itemPresentationName(this.hoveredItemKind, this.model?.contentRegistry).toUpperCase(),
          tooltip.x + tooltip.width / 2, tooltip.y + 4, { align: 'center', color: '#51351f' });
      }
    }
  }
}
