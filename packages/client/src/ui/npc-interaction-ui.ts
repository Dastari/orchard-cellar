import {
  BACKPACK_SLOT_COUNT,
  BACKPACK_SLOT_OFFSET,
  BASE_BACKPACK_CAPACITY,
  ITEM_ECONOMY,
  TOOL_MERCHANT_OFFERS,
  dialogueDefinition,
  dialogueNode,
  itemDefinition,
  maxStackFor,
  type DialogueChoice,
  type MerchantCartLine,
} from '@orchard/sim';
import type { LoadedAsset } from '../render/assets.js';
import { drawPixelText, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
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
import { drawUiLabelPlate, drawUiSkinAsset, drawUiSkinNatural, uiAssetFrame, type UiSkin } from './skin.js';

const PLAYER_SELLABLE_SLOT_LIMIT = BACKPACK_SLOT_OFFSET + BACKPACK_SLOT_COUNT;
const PLAYER_DEFAULT_SELLABLE_SLOT_LIMIT = BACKPACK_SLOT_OFFSET + BASE_BACKPACK_CAPACITY;
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
  readonly nodeId: string;
  readonly balanceBronze: bigint;
  readonly inventory: readonly OverworldUiInventorySlot[];
  readonly quests?: readonly { readonly questId: string; readonly state: string }[];
  readonly touchControls?: boolean;
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
): boolean {
  if (choice.quest === undefined) return true;
  const row = quests.find((quest) => quest.questId === choice.quest?.questId);
  return choice.quest.requires === 'available' ? row === undefined : row?.state === choice.quest.requires;
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

/** Reusable modal interaction surface for branching dialogue and merchant
 * inventories. Server rows choose the current node; this class only presents
 * options and emits explicit intent. */
export class NpcInteractionUi {
  private model: NpcInteractionModel | null = null;
  private tab: 'buy' | 'sell' = 'buy';
  private selectedItemKind: string | null = null;
  private readonly buyQuantities = new Map<string, number>();
  private readonly sellQuantities = new Map<string, number>();
  private transactionPending = false;
  private pointer: UiPoint = { x: -100, y: -100 };
  private hoveredItemKind: string | null = null;
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
    const definition = dialogueDefinition(this.model.dialogueId);
    return definition !== null && dialogueNode(definition, this.model.nodeId)?.mode === 'shop';
  }
  get filterValue(): string { return this.filterText; }

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
    const wasShopOpen = this.shopOpen;
    const previousNode = this.model?.nodeId ?? null;
    this.model = model;
    if (model === null) {
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
    if (this.filterInput !== undefined) this.filterInput.hidden = !this.shopOpen;
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
    if (code === 'Escape') {
      if (this.shopOpen) this.callbacks.chooseDialogueOption('back');
      else this.callbacks.closeDialogue();
      return true;
    }
    if (repeat) return true;
    const definition = dialogueDefinition(this.model.dialogueId);
    const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
    if (node?.mode === 'dialogue') {
      const match = /^Digit([1-9])$/.exec(code);
      const index = match ? Number(match[1]) - 1 : -1;
      const choice = this.allDialogueChoices()[index];
      if (choice) this.callbacks.chooseDialogueOption(choice.id);
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
    this.scrollBar.pointerMove(point);
    this.dialogueScrollBar.pointerMove(point);
    this.hoveredItemKind = null;
    if (this.shopOpen) {
      for (const entry of this.visibleShopRows()) {
        if (containsPoint(entry.rect, point)) this.hoveredItemKind = entry.row.itemKind;
      }
    }
    return true;
  }

  pointerDown(point: UiPoint, button: number, modifiers: BoundedStepperModifiers = {}): boolean {
    if (this.model === null) return false;
    this.pointer = point;
    if (button !== 0) return true;
    const layout = npcInteractionLayout(this.model.width, this.model.height, this.shopOpen);
    if (containsPoint(layout.close, point)) { this.callbacks.closeDialogue(); return true; }
    const definition = dialogueDefinition(this.model.dialogueId);
    const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
    if (node?.mode !== 'shop') {
      if (this.dialogueScrollBar.pointerDown(point)) return true;
      const choices = this.visibleDialogueChoices();
      const choiceRects = this.dialogueChoiceRects(layout, choices.length);
      const index = choiceRects.findIndex((rect) => containsPoint(rect, point));
      const choice = choices[index];
      if (choice) this.callbacks.chooseDialogueOption(choice.id);
      return true;
    }
    if (containsPoint(layout.buyTab, point)) { this.setTab('buy'); return true; }
    if (containsPoint(layout.sellTab, point)) { this.setTab('sell'); return true; }
    if (containsPoint(layout.filter, point)) {
      this.filterInput?.focus({ preventScroll: true });
      return true;
    }
    if (this.scrollBar.pointerDown(point)) return true;
    if (containsPoint(layout.back, point)) { this.callbacks.chooseDialogueOption('back'); return true; }
    for (const entry of this.visibleShopRows()) {
      if (!containsPoint(entry.rect, point)) continue;
      this.selectedItemKind = entry.row.itemKind;
      const minus = { x: entry.rect.x + entry.rect.width - 76, y: entry.rect.y + 8, width: 18, height: 18 };
      const plus = { x: entry.rect.x + entry.rect.width - 22, y: entry.rect.y + 8, width: 18, height: 18 };
      if (!this.transactionPending && containsPoint(minus, point)) this.adjustQuantity(entry.row, -1, modifiers);
      else if (!this.transactionPending && containsPoint(plus, point)) this.adjustQuantity(entry.row, 1, modifiers);
      return true;
    }
    if (containsPoint(layout.action, point)) this.commitCart();
    return true;
  }

  pointerUp(): boolean {
    if (this.model === null) return false;
    this.scrollBar.pointerUp();
    this.dialogueScrollBar.pointerUp();
    return true;
  }

  pointerLeave(): void {
    this.pointer = { x: -100, y: -100 };
    this.hoveredItemKind = null;
    this.scrollBar.pointerLeave();
    this.dialogueScrollBar.pointerLeave();
  }

  wheel(point: UiPoint, deltaY: number): boolean {
    if (this.model === null) return false;
    const layout = npcInteractionLayout(this.model.width, this.model.height, this.shopOpen);
    if (!containsPoint(layout.frame, point)) return false;
    return this.shopOpen ? this.scrollBar.wheel(deltaY, 1) : this.dialogueScrollBar.wheel(deltaY, 1);
  }

  draw(context: CanvasRenderingContext2D): void {
    if (this.model === null) return;
    const definition = dialogueDefinition(this.model.dialogueId);
    const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
    if (!node) return;
    const layout = npcInteractionLayout(this.model.width, this.model.height, node.mode === 'shop');
    drawUiSkinAsset(context, this.skin.panelWood, layout.frame);
    this.ribbon.draw(context, node.mode === 'shop' ? `${node.speaker.toUpperCase()}'S SHOP` : node.speaker.toUpperCase(), layout.frame.x + layout.frame.width / 2, layout.frame.y - 5);
    drawUiSkinAsset(context, this.skin.buttonDeny, layout.close, 'idle');
    drawPixelText(context, this.fonts, 'X', layout.close.x + layout.close.width / 2, layout.close.y + 4, { align: 'center', color: '#fff1d2' });
    if (node.mode === 'shop') this.drawShop(context, layout);
    else this.drawDialogue(context, layout, node.body, this.visibleDialogueChoices());
    if (this.model.touchControls !== true && this.pointer.x >= 0 && this.pointer.y >= 0) {
      drawUiSkinNatural(context, this.skin.cursor, this.pointer.x, this.pointer.y, 'idle');
    }
  }

  private setTab(tab: 'buy' | 'sell'): void {
    this.tab = tab;
    this.selectedItemKind = null;
    this.scrollBar.scrollToEnd();
    this.scrollBar.scrollBy(-this.scrollBar.maximum);
    const rows = this.shopRows();
    this.scrollBar.setMetrics(rows.length, npcInteractionLayout(this.model?.width ?? 320, this.model?.height ?? 240, true).visibleRows);
    this.selectedItemKind = rows[0]?.itemKind ?? null;
  }

  private allShopRows(tab: 'buy' | 'sell' = this.tab): ShopRow[] {
    if (this.model === null) return [];
    if (tab === 'buy') return TOOL_MERCHANT_OFFERS.map((itemKind) => {
      const economy = ITEM_ECONOMY[itemKind];
      return {
        itemKind,
        name: itemDefinition(itemKind)?.displayName ?? itemKind,
        unitPrice: economy.buyPriceBronze ?? 0,
        maximumQuantity: maxStackFor(itemKind) ?? 1,
      };
    });
    const quantityByKind = new Map<string, number>();
    const hasBackpack = this.model.inventory.some((slot) => slot.itemKind === 'backpack' && slot.quantity > 0);
    const sellableSlotLimit = hasBackpack ? PLAYER_SELLABLE_SLOT_LIMIT : PLAYER_DEFAULT_SELLABLE_SLOT_LIMIT;
    for (const slot of this.model.inventory) {
      if (slot.slot >= sellableSlotLimit || slot.itemKind === 'empty' || slot.quantity <= 0) continue;
      quantityByKind.set(slot.itemKind, (quantityByKind.get(slot.itemKind) ?? 0) + slot.quantity);
    }
    return [...quantityByKind].flatMap(([itemKind, quantity]) => {
      const economy = ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY];
      return economy && itemKind !== 'homestead_deed' ? [{
        itemKind,
        name: itemDefinition(itemKind)?.displayName ?? itemKind,
        unitPrice: economy.sellPriceBronze,
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

  private allDialogueChoices(): readonly DialogueChoice[] {
    if (this.model === null) return [];
    const definition = dialogueDefinition(this.model.dialogueId);
    const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
    return node?.mode === 'dialogue'
      ? node.choices.filter((choice) => dialogueChoiceIsAvailable(choice, this.model?.quests))
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
  }

  private drawShop(context: CanvasRenderingContext2D, layout: InteractionLayout): void {
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
      drawPixelText(context, this.fonts, row.name, rect.x + 31, rect.y + 6, { color: selected ? '#fff1d2' : '#51351f' });
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
    drawUiSkinAsset(context, this.skin.button, layout.back, 'idle');
    drawPixelText(context, this.fonts, 'BACK', layout.back.x + layout.back.width / 2, layout.back.y + 5, { align: 'center', color: '#51351f' });
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
      const economy = ITEM_ECONOMY[this.hoveredItemKind as keyof typeof ITEM_ECONOMY];
      if (economy) {
        const tooltip = {
          x: layout.frame.x + MODAL_HORIZONTAL_PADDING,
          y: layout.list.y + layout.list.height + 2,
          width: layout.frame.width - MODAL_HORIZONTAL_PADDING * 2,
          height: 16,
        };
        drawUiLabelPlate(context, this.skin, tooltip);
        drawPixelText(context, this.fonts, (itemDefinition(this.hoveredItemKind)?.displayName ?? this.hoveredItemKind).toUpperCase(), tooltip.x + tooltip.width / 2, tooltip.y + 4, { align: 'center', color: '#51351f' });
      }
    }
  }
}
