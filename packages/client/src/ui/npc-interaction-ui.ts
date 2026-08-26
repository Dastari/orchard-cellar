import {
  ITEM_ECONOMY,
  TOOL_MERCHANT_OFFERS,
  dialogueDefinition,
  dialogueNode,
  itemDefinition,
  maxStackFor,
} from '@orchard/sim';
import type { LoadedAsset } from '../render/assets.js';
import { drawPixelText, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import { itemIconAnimation, type OverworldUiInventorySlot, type OverworldUiItemArt } from './overworld-ui.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { Ribbon } from './ribbon.js';
import { ScrollBar } from './scrollbar.js';
import { CurrencyDisplay } from './currency-display.js';
import { drawUiLabelPlate, drawUiSkinAsset, drawUiSkinNatural, uiAssetFrame, type UiSkin } from './skin.js';

const PLAYER_SELLABLE_SLOT_LIMIT = 29;
const SHOP_ROW_HEIGHT = 34;
const SHOP_MAX_VISIBLE_ROWS = 4;
const MODAL_HORIZONTAL_PADDING = 28;
const MODAL_BOTTOM_PADDING = 28;

export interface NpcInteractionModel {
  readonly width: number;
  readonly height: number;
  readonly npcId: bigint;
  readonly dialogueId: string;
  readonly nodeId: string;
  readonly balanceBronze: bigint;
  readonly inventory: readonly OverworldUiInventorySlot[];
}

export interface NpcInteractionCallbacks {
  readonly chooseDialogueOption: (choiceId: string) => void;
  readonly closeDialogue: () => void;
  readonly buy: (itemKind: string, quantity: number) => void;
  readonly sell: (itemKind: string, quantity: number) => void;
}

interface ShopRow {
  readonly itemKind: string;
  readonly name: string;
  readonly unitPrice: number;
  readonly maximumQuantity: number;
}

interface InteractionLayout {
  readonly frame: UiRect;
  readonly close: UiRect;
  readonly buyTab: UiRect;
  readonly sellTab: UiRect;
  readonly list: UiRect;
  readonly scroll: UiRect;
  readonly action: UiRect;
  readonly back: UiRect;
  readonly visibleRows: number;
}

export function npcInteractionLayout(width: number, height: number, shop: boolean): InteractionLayout {
  const frameWidth = Math.min(shop ? 398 : 390, Math.max(250, width - 16));
  const frameHeight = Math.min(shop ? 260 : 204, Math.max(160, height - 16));
  const frame = {
    x: Math.round((width - frameWidth) / 2),
    y: Math.round((height - frameHeight) / 2),
    width: frameWidth,
    height: frameHeight,
  };
  const visibleRows = shop && frameHeight < 260 ? 3 : SHOP_MAX_VISIBLE_ROWS;
  return {
    frame,
    close: { x: frame.x + frame.width - 22, y: frame.y + 8, width: 15, height: 15 },
    buyTab: { x: frame.x + MODAL_HORIZONTAL_PADDING, y: frame.y + 28, width: 62, height: 19 },
    sellTab: { x: frame.x + MODAL_HORIZONTAL_PADDING + 66, y: frame.y + 28, width: 62, height: 19 },
    list: {
      x: frame.x + MODAL_HORIZONTAL_PADDING,
      y: frame.y + 53,
      width: frame.width - MODAL_HORIZONTAL_PADDING * 2 - 9,
      height: SHOP_ROW_HEIGHT * visibleRows,
    },
    scroll: {
      x: frame.x + frame.width - MODAL_HORIZONTAL_PADDING - 12,
      y: frame.y + 55,
      width: 12,
      height: SHOP_ROW_HEIGHT * visibleRows - 4,
    },
    action: {
      x: frame.x + frame.width - MODAL_HORIZONTAL_PADDING - 112,
      y: frame.y + frame.height - MODAL_BOTTOM_PADDING - 19,
      width: 112,
      height: 19,
    },
    back: {
      x: frame.x + MODAL_HORIZONTAL_PADDING,
      y: frame.y + frame.height - MODAL_BOTTOM_PADDING - 19,
      width: 72,
      height: 19,
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
  private quantities = new Map<string, number>();
  private pointer: UiPoint = { x: -100, y: -100 };
  private hoveredItemKind: string | null = null;
  private readonly ribbon: Ribbon;
  private readonly scrollBar: ScrollBar;
  private readonly currencyDisplay: CurrencyDisplay;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly itemArt: OverworldUiItemArt,
    private readonly callbacks: NpcInteractionCallbacks,
  ) {
    this.ribbon = new Ribbon(skin.banner, fonts);
    this.scrollBar = new ScrollBar(skin);
    this.currencyDisplay = new CurrencyDisplay(skin, fonts);
  }

  get active(): boolean { return this.model !== null; }
  get shopOpen(): boolean {
    if (this.model === null) return false;
    const definition = dialogueDefinition(this.model.dialogueId);
    return definition !== null && dialogueNode(definition, this.model.nodeId)?.mode === 'shop';
  }

  update(model: NpcInteractionModel | null): void {
    const previousNode = this.model?.nodeId ?? null;
    this.model = model;
    if (model === null) {
      this.selectedItemKind = null;
      this.hoveredItemKind = null;
      return;
    }
    if (previousNode !== model.nodeId && !this.shopOpen) this.selectedItemKind = null;
    const rows = this.shopRows();
    this.scrollBar.setMetrics(rows.length, npcInteractionLayout(model.width, model.height, true).visibleRows);
    const selected = rows.find((row) => row.itemKind === this.selectedItemKind);
    if (!selected) this.selectedItemKind = rows[0]?.itemKind ?? null;
    if (this.selectedItemKind !== null) {
      const row = rows.find((candidate) => candidate.itemKind === this.selectedItemKind);
      if (row) this.quantities.set(row.itemKind, Math.min(row.maximumQuantity, Math.max(1, this.quantities.get(row.itemKind) ?? 1)));
    }
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
      const match = /^Digit([1-4])$/.exec(code);
      const index = match ? Number(match[1]) - 1 : -1;
      const choice = node.choices[index];
      if (choice) this.callbacks.chooseDialogueOption(choice.id);
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
    this.hoveredItemKind = null;
    if (this.shopOpen) {
      for (const entry of this.visibleShopRows()) {
        if (containsPoint(entry.rect, point)) this.hoveredItemKind = entry.row.itemKind;
      }
    }
    return true;
  }

  pointerDown(point: UiPoint, button: number): boolean {
    if (this.model === null) return false;
    this.pointer = point;
    if (button !== 0) return true;
    const layout = npcInteractionLayout(this.model.width, this.model.height, this.shopOpen);
    if (containsPoint(layout.close, point)) { this.callbacks.closeDialogue(); return true; }
    const definition = dialogueDefinition(this.model.dialogueId);
    const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
    if (node?.mode !== 'shop') {
      const choiceRects = this.dialogueChoiceRects(layout.frame, node?.choices.length ?? 0);
      const index = choiceRects.findIndex((rect) => containsPoint(rect, point));
      const choice = node?.choices[index];
      if (choice) this.callbacks.chooseDialogueOption(choice.id);
      return true;
    }
    if (containsPoint(layout.buyTab, point)) { this.setTab('buy'); return true; }
    if (containsPoint(layout.sellTab, point)) { this.setTab('sell'); return true; }
    if (this.scrollBar.pointerDown(point)) return true;
    if (containsPoint(layout.back, point)) { this.callbacks.chooseDialogueOption('back'); return true; }
    for (const entry of this.visibleShopRows()) {
      if (!containsPoint(entry.rect, point)) continue;
      this.selectedItemKind = entry.row.itemKind;
      const minus = { x: entry.rect.x + entry.rect.width - 76, y: entry.rect.y + 8, width: 18, height: 18 };
      const plus = { x: entry.rect.x + entry.rect.width - 22, y: entry.rect.y + 8, width: 18, height: 18 };
      if (containsPoint(minus, point)) this.adjustQuantity(entry.row, -1);
      else if (containsPoint(plus, point)) this.adjustQuantity(entry.row, 1);
      return true;
    }
    if (containsPoint(layout.action, point)) this.commitSelected();
    return true;
  }

  pointerUp(): boolean {
    if (this.model === null) return false;
    this.scrollBar.pointerUp();
    return true;
  }

  pointerLeave(): void {
    this.pointer = { x: -100, y: -100 };
    this.hoveredItemKind = null;
    this.scrollBar.pointerLeave();
  }

  wheel(point: UiPoint, deltaY: number): boolean {
    if (!this.shopOpen || this.model === null) return false;
    const layout = npcInteractionLayout(this.model.width, this.model.height, true);
    return containsPoint(layout.frame, point) && this.scrollBar.wheel(deltaY, 1);
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
    else this.drawDialogue(context, layout.frame, node.body, node.choices.map((choice) => choice.label));
    if (this.pointer.x >= 0 && this.pointer.y >= 0) {
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

  private shopRows(): ShopRow[] {
    if (this.model === null) return [];
    if (this.tab === 'buy') return TOOL_MERCHANT_OFFERS.map((itemKind) => {
      const economy = ITEM_ECONOMY[itemKind];
      return {
        itemKind,
        name: itemDefinition(itemKind)?.displayName ?? itemKind,
        unitPrice: economy.buyPriceBronze ?? 0,
        maximumQuantity: maxStackFor(itemKind) ?? 1,
      };
    });
    const quantityByKind = new Map<string, number>();
    for (const slot of this.model.inventory) {
      if (slot.slot >= PLAYER_SELLABLE_SLOT_LIMIT || slot.itemKind === 'empty' || slot.quantity <= 0) continue;
      quantityByKind.set(slot.itemKind, (quantityByKind.get(slot.itemKind) ?? 0) + slot.quantity);
    }
    return [...quantityByKind].flatMap(([itemKind, quantity]) => {
      const economy = ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY];
      return economy ? [{ itemKind, name: itemDefinition(itemKind)?.displayName ?? itemKind, unitPrice: economy.sellPriceBronze, maximumQuantity: quantity }] : [];
    }).sort((left, right) => left.name.localeCompare(right.name));
  }

  private visibleShopRows(): readonly { readonly row: ShopRow; readonly rect: UiRect }[] {
    if (this.model === null) return [];
    const layout = npcInteractionLayout(this.model.width, this.model.height, true);
    return this.shopRows().slice(this.scrollBar.position, this.scrollBar.position + layout.visibleRows).map((row, index) => ({
      row,
      rect: { x: layout.list.x, y: layout.list.y + index * SHOP_ROW_HEIGHT, width: layout.list.width, height: SHOP_ROW_HEIGHT - 2 },
    }));
  }

  private adjustQuantity(row: ShopRow, delta: number): void {
    const current = this.quantities.get(row.itemKind) ?? 1;
    this.quantities.set(row.itemKind, Math.max(1, Math.min(row.maximumQuantity, current + delta)));
  }

  private commitSelected(): void {
    const row = this.shopRows().find((candidate) => candidate.itemKind === this.selectedItemKind);
    if (!row) return;
    const quantity = Math.max(1, Math.min(row.maximumQuantity, this.quantities.get(row.itemKind) ?? 1));
    if (this.tab === 'buy') this.callbacks.buy(row.itemKind, quantity);
    else this.callbacks.sell(row.itemKind, quantity);
  }

  private dialogueChoiceRects(frame: UiRect, count: number): UiRect[] {
    const rowHeight = 22;
    const bottom = frame.y + frame.height - MODAL_BOTTOM_PADDING - 8;
    return Array.from({ length: count }, (_, index) => ({
      x: frame.x + MODAL_HORIZONTAL_PADDING,
      y: bottom - (count - index) * rowHeight,
      width: frame.width - MODAL_HORIZONTAL_PADDING * 2,
      height: 19,
    }));
  }

  private drawDialogue(context: CanvasRenderingContext2D, frame: UiRect, body: string, choices: readonly string[]): void {
    wrapText(body, frame.width - MODAL_HORIZONTAL_PADDING * 2, this.fonts).slice(0, 5).forEach((line, index) => {
      drawPixelText(context, this.fonts, line, frame.x + MODAL_HORIZONTAL_PADDING, frame.y + 34 + index * 10, { color: '#4d2e22' });
    });
    this.dialogueChoiceRects(frame, choices.length).forEach((rect, index) => {
      drawUiSkinAsset(context, this.skin.button, rect, containsPoint(rect, this.pointer) ? 'pressed' : 'idle');
      drawPixelText(context, this.fonts, `${index + 1}. ${choices[index] ?? ''}`, rect.x + 8, rect.y + 5, { color: '#51351f' });
    });
  }

  private drawShop(context: CanvasRenderingContext2D, layout: InteractionLayout): void {
    drawUiSkinAsset(context, this.tab === 'buy' ? this.skin.buttonConfirm : this.skin.button, layout.buyTab, 'idle');
    drawUiSkinAsset(context, this.tab === 'sell' ? this.skin.buttonConfirm : this.skin.button, layout.sellTab, 'idle');
    drawPixelText(context, this.fonts, 'BUY', layout.buyTab.x + layout.buyTab.width / 2, layout.buyTab.y + 5, { align: 'center', color: this.tab === 'buy' ? '#fff1d2' : '#51351f' });
    drawPixelText(context, this.fonts, 'SELL', layout.sellTab.x + layout.sellTab.width / 2, layout.sellTab.y + 5, { align: 'center', color: this.tab === 'sell' ? '#fff1d2' : '#51351f' });
    this.currencyDisplay.draw(context, this.model?.balanceBronze ?? 0n, layout.frame.x + layout.frame.width - MODAL_HORIZONTAL_PADDING, layout.frame.y + 27, {
      size: 'medium', align: 'right', color: '#6b4428', includeZero: true,
    });
    const visibleRows = this.visibleShopRows();
    for (const { row, rect } of visibleRows) {
      const selected = row.itemKind === this.selectedItemKind;
      drawUiSkinAsset(context, selected ? this.skin.buttonConfirm : this.skin.button, rect, 'idle');
      drawItemIcon(context, this.itemArt[row.itemKind] ?? this.itemArt['missing'], row.itemKind, { x: rect.x + 5, y: rect.y + 5, width: 22, height: 22 });
      drawPixelText(context, this.fonts, row.name, rect.x + 31, rect.y + 6, { color: selected ? '#fff1d2' : '#51351f' });
      this.currencyDisplay.draw(context, BigInt(row.unitPrice), rect.x + 31, rect.y + 19, {
        size: 'small', color: selected ? '#ffe3a1' : '#8c5d3a', includeZero: false,
      });
      const minus = { x: rect.x + rect.width - 76, y: rect.y + 8, width: 18, height: 18 };
      const plus = { x: rect.x + rect.width - 22, y: rect.y + 8, width: 18, height: 18 };
      drawUiSkinAsset(context, this.skin.buttonSmall, minus, 'idle');
      drawUiSkinAsset(context, this.skin.buttonSmall, plus, 'idle');
      drawPixelText(context, this.fonts, '-', minus.x + 9, minus.y + 5, { align: 'center', color: '#51351f' });
      drawPixelText(context, this.fonts, '+', plus.x + 9, plus.y + 5, { align: 'center', color: '#51351f' });
      drawPixelText(context, this.fonts, String(this.quantities.get(row.itemKind) ?? 1), rect.x + rect.width - 40, rect.y + 12, { align: 'center', color: selected ? '#fff1d2' : '#51351f' });
    }
    this.scrollBar.setBounds(layout.scroll);
    this.scrollBar.draw(context);
    drawUiSkinAsset(context, this.skin.button, layout.back, 'idle');
    drawPixelText(context, this.fonts, 'BACK', layout.back.x + layout.back.width / 2, layout.back.y + 5, { align: 'center', color: '#51351f' });
    const selected = this.shopRows().find((row) => row.itemKind === this.selectedItemKind);
    const quantity = selected ? this.quantities.get(selected.itemKind) ?? 1 : 0;
    const enabled = selected !== undefined;
    drawUiSkinAsset(context, enabled ? this.skin.buttonConfirm : this.skin.button, layout.action, enabled ? 'idle' : 'disabled');
    drawPixelText(context, this.fonts, enabled ? `${this.tab === 'buy' ? 'PURCHASE' : 'SELL'} x${quantity}` : 'NOTHING TO SELL', layout.action.x + layout.action.width / 2, layout.action.y + 5, { align: 'center', color: enabled ? '#fff1d2' : '#8c5d3a' });
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
