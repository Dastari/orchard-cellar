import {
  BACKPACK_SLOT_OFFSET,
  BRONZE_PER_GOLD,
  BRONZE_PER_SILVER,
  HOTBAR_SLOT_COUNT,
  coinPurseFromBronze,
  itemDefinition,
  isUniqueQuestItemKind,
} from '@orchard/sim';
import type { LoadedAsset } from '../render/assets.js';
import { drawOutlinedPixelText, drawPixelText, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import type { PlayerTradeOffer, PlayerTradeSession } from '../net/overworld-connection.js';
import { drawButton } from './button.js';
import { drawCanvasTextInput } from './canvas-text-input.js';
import { CurrencyDisplay } from './currency-display.js';
import { drawUiInventorySlotBacking } from './design-system/inventory.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { itemIconAnimation, type OverworldUiInventorySlot, type OverworldUiItemArt } from './overworld-ui.js';
import { ScrollBar } from './scrollbar.js';
import { drawUiSkinAsset, uiAssetFrame, type UiSkin } from './skin.js';

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

export interface TradeMoneyInputs {
  readonly gold: HTMLInputElement;
  readonly silver: HTMLInputElement;
  readonly bronze: HTMLInputElement;
}

interface TradeLayout {
  readonly frame: UiRect;
  readonly requestAccept: UiRect;
  readonly requestDecline: UiRect;
  readonly cancel: UiRect;
  readonly accept: UiRect;
  readonly moneyGold: UiRect;
  readonly moneySilver: UiRect;
  readonly moneyBronze: UiRect;
  readonly ownOffers: readonly UiRect[];
  readonly otherOffers: readonly UiRect[];
  readonly inventory: readonly { readonly rect: UiRect; readonly row: OverworldUiInventorySlot }[];
  readonly inventoryViewport: UiRect;
}

const EMPTY: UiRect = { x: 0, y: 0, width: 0, height: 0 };
const OFFER_SLOT = 27;
const INVENTORY_SLOT = 22;
const INVENTORY_COLUMNS = 10;
const OFFER_SLOTS = 6;

function drawItemIcon(context: CanvasRenderingContext2D, asset: LoadedAsset | undefined, itemKind: string, rect: UiRect): void {
  if (asset === undefined) return;
  const frame = uiAssetFrame(asset, itemIconAnimation(itemKind));
  if (frame === null) return;
  const scale = Math.min((rect.width - 6) / frame.width, (rect.height - 6) / frame.height);
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  context.drawImage(
    asset.image, frame.x, frame.y, frame.width, frame.height,
    Math.round(rect.x + (rect.width - width) / 2), Math.round(rect.y + (rect.height - height) / 2),
    width, height,
  );
}

function offerForSlot(offers: readonly PlayerTradeOffer[], ownerHex: string, slot: number): PlayerTradeOffer | undefined {
  return offers.find((offer) => offer.owner.toHexString() === ownerHex && offer.slot === slot);
}

export class TradeUi {
  private model: TradeUiModel | null = null;
  private pointer: UiPoint = { x: -100, y: -100 };
  private viewport = { width: 480, height: 270 };
  private syncedRevision = -1n;
  private readonly currency: CurrencyDisplay;
  private readonly inventoryScroll: ScrollBar;
  private readonly moneyInputList: readonly HTMLInputElement[];
  private pendingTouchInventoryAction: (() => void) | null = null;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly itemArt: OverworldUiItemArt,
    private readonly moneyInputs: TradeMoneyInputs,
    private readonly callbacks: TradeUiCallbacks,
  ) {
    this.currency = new CurrencyDisplay(skin, fonts);
    this.inventoryScroll = new ScrollBar(skin);
    this.moneyInputList = [moneyInputs.gold, moneyInputs.silver, moneyInputs.bronze];
    this.moneyInputList.forEach((input, index) => {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        input.blur();
        event.preventDefault();
      });
      input.addEventListener('blur', () => this.commitMoney());
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '').slice(0, index === 0 ? 16 : 2);
      });
    });
  }

  get active(): boolean { return this.model !== null; }

  update(model: TradeUiModel | null): void {
    this.model = model;
    if (model === null) {
      this.pendingTouchInventoryAction = null;
      for (const input of this.moneyInputList) {
        input.blur();
        input.hidden = true;
        input.classList.remove('keyboard-active');
      }
      this.syncedRevision = -1n;
      return;
    }
    const ownBronze = model.session.requester.toHexString() === model.identityHex
      ? model.session.requesterBronze : model.session.recipientBronze;
    if (!this.moneyInputList.includes(document.activeElement as HTMLInputElement)
      && this.syncedRevision !== model.session.revision) {
      const purse = coinPurseFromBronze(ownBronze);
      this.moneyInputs.gold.value = purse.gold.toString();
      this.moneyInputs.silver.value = purse.silver.toString();
      this.moneyInputs.bronze.value = purse.bronze.toString();
      this.syncedRevision = model.session.revision;
    }
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number): void {
    const model = this.model;
    if (model === null) return;
    this.viewport = { width, height };
    const layout = this.layout(model);
    context.save();
    context.fillStyle = 'rgba(12, 20, 17, 0.5)';
    context.fillRect(0, 0, width, height);
    drawUiSkinAsset(context, this.skin.panelWood, layout.frame);
    drawUiSkinAsset(context, this.skin.panelParchment, {
      x: layout.frame.x + 8, y: layout.frame.y + 12,
      width: layout.frame.width - 16, height: layout.frame.height - 20,
    });
    drawUiSkinAsset(context, this.skin.ribbon, {
      x: layout.frame.x + layout.frame.width / 2 - 76,
      y: layout.frame.y - 2, width: 152, height: 25,
    });
    drawPixelText(context, this.fonts, model.session.state === 'requested' ? 'TRADE REQUEST' : 'TRADE',
      layout.frame.x + layout.frame.width / 2, layout.frame.y + 6, { align: 'center', color: '#56351f' });
    if (model.session.state === 'requested') this.drawRequest(context, model, layout);
    else this.drawActive(context, model, layout);
    context.restore();
  }

  private drawRequest(context: CanvasRenderingContext2D, model: TradeUiModel, layout: TradeLayout): void {
    const incoming = model.session.recipient.toHexString() === model.identityHex;
    const name = incoming ? model.requesterName : model.recipientName;
    drawPixelText(context, this.fonts,
      incoming ? `${name.toUpperCase()} WANTS TO TRADE` : `WAITING FOR ${name.toUpperCase()}`,
      layout.frame.x + layout.frame.width / 2, layout.frame.y + 48,
      { align: 'center', color: '#56351f' });
    if (incoming) {
      drawButton(context, this.skin, this.fonts, layout.requestAccept, { label: 'ACCEPT', tone: 'success' });
      drawButton(context, this.skin, this.fonts, layout.requestDecline, { label: 'DECLINE', tone: 'danger' });
    } else drawButton(context, this.skin, this.fonts, layout.cancel, { label: 'CANCEL', tone: 'danger' });
  }

  private drawSlot(context: CanvasRenderingContext2D, rect: UiRect, offer: PlayerTradeOffer | undefined): void {
    drawUiInventorySlotBacking(context, this.skin, rect, offer?.itemKind);
    if (offer === undefined) return;
    drawItemIcon(context, this.itemArt[offer.itemKind] ?? this.itemArt.missing, offer.itemKind, rect);
    if (offer.quantity > 1) drawOutlinedPixelText(context, this.fonts, String(offer.quantity),
      rect.x + rect.width - 3, rect.y + rect.height - 10, { align: 'right', color: '#fff3d0', outlineColor: '#3d2418' });
  }

  private drawActive(context: CanvasRenderingContext2D, model: TradeUiModel, layout: TradeLayout): void {
    const requesterSide = model.session.requester.toHexString() === model.identityHex;
    const otherName = requesterSide ? model.recipientName : model.requesterName;
    const otherHex = requesterSide ? model.session.recipient.toHexString() : model.session.requester.toHexString();
    const ownAccepted = requesterSide ? model.session.requesterAccepted : model.session.recipientAccepted;
    const otherAccepted = requesterSide ? model.session.recipientAccepted : model.session.requesterAccepted;
    const otherBronze = requesterSide ? model.session.recipientBronze : model.session.requesterBronze;
    const leftCenter = layout.ownOffers[1]!.x + OFFER_SLOT / 2;
    const rightCenter = layout.otherOffers[1]!.x + OFFER_SLOT / 2;
    drawPixelText(context, this.fonts, ownAccepted ? 'YOUR OFFER - ACCEPTED' : 'YOUR OFFER', leftCenter, layout.frame.y + 29,
      { align: 'center', color: ownAccepted ? '#28713b' : '#56351f' });
    drawPixelText(context, this.fonts, `${otherName.toUpperCase()} OFFER`, rightCenter, layout.frame.y + 29,
      { align: 'center', color: otherAccepted ? '#28713b' : '#56351f' });
    for (let slot = 0; slot < OFFER_SLOTS; slot += 1) {
      this.drawSlot(context, layout.ownOffers[slot]!, offerForSlot(model.offers, model.identityHex, slot));
      this.drawSlot(context, layout.otherOffers[slot]!, offerForSlot(model.offers, otherHex, slot));
    }
    this.drawMoneyInput(context, this.skin.coinGold, layout.moneyGold, this.moneyInputs.gold);
    this.drawMoneyInput(context, this.skin.coinSilver, layout.moneySilver, this.moneyInputs.silver);
    this.drawMoneyInput(context, this.skin.coinBronze, layout.moneyBronze, this.moneyInputs.bronze);
    const walletLabel = 'YOU HAVE';
    const walletLabelWidth = measurePixelText(walletLabel, 1, this.fonts.font);
    const walletMoney = this.currency.measure(model.walletBronze, { size: 'small', includeZero: true });
    const walletLineWidth = walletLabelWidth + 5 + walletMoney.width;
    const walletLineX = Math.round(leftCenter - walletLineWidth / 2);
    const walletLineY = layout.moneyGold.y + 24;
    drawPixelText(context, this.fonts, walletLabel, walletLineX, walletLineY + 1, { color: '#7b5030' });
    this.currency.draw(context, model.walletBronze, walletLineX + walletLabelWidth + 5, walletLineY,
      { size: 'small', includeZero: true });
    const otherMoney = this.currency.measure(otherBronze, { size: 'small', includeZero: true });
    this.currency.draw(context, otherBronze, rightCenter - otherMoney.width / 2, layout.moneyGold.y + 4,
      { size: 'small', includeZero: true });
    if (otherAccepted) drawPixelText(context, this.fonts, 'ACCEPTED', rightCenter, layout.moneyGold.y + 23,
      { align: 'center', color: '#28713b' });
    drawPixelText(context, this.fonts, 'YOUR INVENTORY - CLICK TO OFFER', layout.inventoryViewport.x,
      layout.inventoryViewport.y - 13, { color: '#56351f' });
    for (const entry of layout.inventory) {
      drawUiInventorySlotBacking(context, this.skin, entry.rect, entry.row.itemKind);
      if (entry.row.itemKind === 'empty' || entry.row.quantity <= 0) continue;
      drawItemIcon(context, this.itemArt[entry.row.itemKind] ?? this.itemArt.missing, entry.row.itemKind, entry.rect);
      if (entry.row.quantity > 1) drawOutlinedPixelText(context, this.fonts, String(entry.row.quantity),
        entry.rect.x + entry.rect.width - 3, entry.rect.y + entry.rect.height - 10,
        { align: 'right', color: '#fff3d0', outlineColor: '#3d2418' });
    }
    this.inventoryScroll.draw(context);
    drawButton(context, this.skin, this.fonts, layout.cancel, { label: 'CANCEL', tone: 'danger' });
    drawButton(context, this.skin, this.fonts, layout.accept, {
      label: ownAccepted ? 'UNACCEPT' : 'ACCEPT TRADE', tone: ownAccepted ? 'neutral' : 'success',
    });
    const hovered = [...layout.ownOffers, ...layout.otherOffers].findIndex((rect) => containsPoint(rect, this.pointer));
    if (hovered >= 0) {
      const own = hovered < OFFER_SLOTS;
      const slot = own ? hovered : hovered - OFFER_SLOTS;
      const owner = own ? model.identityHex : otherHex;
      const offer = offerForSlot(model.offers, owner, slot);
      if (offer !== undefined) this.drawTooltip(context, itemDefinition(offer.itemKind)?.displayName ?? offer.itemKind);
    }
  }

  private drawMoneyInput(
    context: CanvasRenderingContext2D,
    coin: UiSkin['coinGold'],
    rect: UiRect,
    input: HTMLInputElement,
  ): void {
    drawUiSkinAsset(context, coin, { x: rect.x, y: rect.y + 4, width: 9, height: 9 });
    const field = { x: rect.x + 11, y: rect.y, width: rect.width - 11, height: rect.height };
    drawUiSkinAsset(context, this.skin.frameThin, field);
    drawCanvasTextInput(context, this.fonts, input, {
      x: field.x + 4, y: field.y + 5, width: field.width - 8,
      placeholder: '0', color: '#56351f', now: performance.now(),
    });
  }

  private drawTooltip(context: CanvasRenderingContext2D, label: string): void {
    const width = measurePixelText(label.toUpperCase(), 1, this.fonts.font) + 10;
    const rect = { x: Math.min(this.viewport.width - width - 3, this.pointer.x + 5), y: Math.max(3, this.pointer.y - 19), width, height: 16 };
    drawUiSkinAsset(context, this.skin.frameThin, rect);
    drawPixelText(context, this.fonts, label.toUpperCase(), rect.x + 5, rect.y + 4, { color: '#56351f' });
  }

  pointerMove(point: UiPoint): boolean {
    this.pointer = point;
    this.inventoryScroll.pointerMove(point);
    this.inventoryScroll.swipeMove(point, INVENTORY_SLOT);
    return this.active;
  }

  pointerLeave(): void {
    this.pointer = { x: -100, y: -100 };
    this.inventoryScroll.pointerLeave();
    this.pendingTouchInventoryAction = null;
  }

  pointerUp(): boolean {
    if (!this.active) return false;
    if (this.inventoryScroll.endSwipe()) {
      this.pendingTouchInventoryAction = null;
      return true;
    }
    const pending = this.pendingTouchInventoryAction;
    this.pendingTouchInventoryAction = null;
    pending?.();
    this.inventoryScroll.pointerUp();
    return true;
  }

  wheel(point: UiPoint, deltaY: number): boolean {
    const model = this.model;
    if (model === null) return false;
    const layout = this.layout(model);
    if (containsPoint(layout.inventoryViewport, point) || containsPoint(this.inventoryScroll.bounds, point)) {
      this.inventoryScroll.wheel(deltaY, 1);
    }
    return true;
  }

  pointerDown(point: UiPoint, button: number, pointerType?: string): boolean {
    const model = this.model;
    if (model === null) return false;
    this.pointer = point;
    const layout = this.layout(model);
    if (model.session.state === 'requested') {
      const incoming = model.session.recipient.toHexString() === model.identityHex;
      if (incoming && containsPoint(layout.requestAccept, point)) this.callbacks.acceptRequest(model.session.id);
      else if (incoming && containsPoint(layout.requestDecline, point)) this.callbacks.declineRequest(model.session.id);
      else if (!incoming && containsPoint(layout.cancel, point)) this.callbacks.cancel(model.session.id);
      return true;
    }
    this.inventoryScroll.beginSwipe(point, layout.inventoryViewport, pointerType);
    if (this.inventoryScroll.pointerDown(point)) return true;
    if (containsPoint(layout.cancel, point)) this.callbacks.cancel(model.session.id);
    else if (containsPoint(layout.accept, point)) {
      const ownAccepted = model.session.requester.toHexString() === model.identityHex
        ? model.session.requesterAccepted : model.session.recipientAccepted;
      this.callbacks.setAccepted(model.session.id, !ownAccepted, model.session.revision);
    } else if (containsPoint(layout.moneyGold, point)) {
      this.focusMoneyInput(this.moneyInputs.gold);
    } else if (containsPoint(layout.moneySilver, point)) {
      this.focusMoneyInput(this.moneyInputs.silver);
    } else if (containsPoint(layout.moneyBronze, point)) {
      this.focusMoneyInput(this.moneyInputs.bronze);
    } else {
      const ownOffer = layout.ownOffers.findIndex((rect) => containsPoint(rect, point));
      if (ownOffer >= 0 && offerForSlot(model.offers, model.identityHex, ownOffer) !== undefined) {
        this.callbacks.removeItem(model.session.id, ownOffer);
      } else {
        const inventory = layout.inventory.find((entry) => containsPoint(entry.rect, point));
        if (inventory !== undefined && inventory.row.itemKind !== 'empty' && inventory.row.quantity > 0
          && !isUniqueQuestItemKind(inventory.row.itemKind)) {
          const free = Array.from({ length: OFFER_SLOTS }, (_, slot) => slot)
            .find((slot) => offerForSlot(model.offers, model.identityHex, slot) === undefined);
          if (free !== undefined) {
            const offer = () => this.callbacks.offerItem(
              model.session.id, inventory.row.slot, free, button === 2 ? 1 : inventory.row.quantity,
            );
            if (pointerType === 'touch') this.pendingTouchInventoryAction = offer;
            else offer();
          }
        }
      }
    }
    return true;
  }

  handleKeyDown(code: string, repeat: boolean): boolean {
    const model = this.model;
    if (model === null) return false;
    if (code === 'Escape' && !repeat) this.callbacks.cancel(model.session.id);
    else this.inventoryScroll.handleKey(code);
    return true;
  }

  private commitMoney(): void {
    const model = this.model;
    for (const input of this.moneyInputList) {
      input.classList.remove('keyboard-active');
      input.hidden = true;
    }
    if (model === null || model.session.state !== 'active') return;
    const gold = this.moneyInputs.gold.value === '' ? 0n : BigInt(this.moneyInputs.gold.value);
    const silver = BigInt(Math.min(99, Number(this.moneyInputs.silver.value || '0')));
    const bronze = BigInt(Math.min(99, Number(this.moneyInputs.bronze.value || '0')));
    const amount = gold * BRONZE_PER_GOLD + silver * BRONZE_PER_SILVER + bronze;
    this.callbacks.offerBronze(model.session.id, amount > model.walletBronze ? model.walletBronze : amount);
  }

  private focusMoneyInput(input: HTMLInputElement): void {
    input.hidden = false;
    input.classList.add('keyboard-active');
    input.focus({ preventScroll: true });
    input.select();
  }

  private layout(model: TradeUiModel): TradeLayout {
    if (model.session.state === 'requested') {
      const width = Math.min(330, this.viewport.width - 12);
      const frame = { x: Math.round((this.viewport.width - width) / 2), y: Math.round((this.viewport.height - 128) / 2), width, height: 128 };
      return {
        frame,
        requestAccept: { x: frame.x + 24, y: frame.y + 78, width: 126, height: 22 },
        requestDecline: { x: frame.x + frame.width - 150, y: frame.y + 78, width: 126, height: 22 },
        cancel: { x: frame.x + frame.width / 2 - 64, y: frame.y + 78, width: 128, height: 22 },
        accept: EMPTY,
        moneyGold: EMPTY, moneySilver: EMPTY, moneyBronze: EMPTY,
        ownOffers: [], otherOffers: [], inventory: [], inventoryViewport: EMPTY,
      };
    }
    const width = Math.min(400, this.viewport.width - 8);
    const height = Math.min(264, this.viewport.height - 6);
    const frame = { x: Math.round((this.viewport.width - width) / 2), y: Math.round((this.viewport.height - height) / 2), width, height };
    const offerTop = frame.y + 41;
    const offerWidth = OFFER_SLOT * 3;
    const offerInset = Math.round((frame.width / 2 - offerWidth) / 2);
    const ownStart = frame.x + offerInset;
    const otherStart = frame.x + frame.width / 2 + offerInset;
    const slots = (start: number): UiRect[] => Array.from({ length: OFFER_SLOTS }, (_, index) => ({
      x: start + (index % 3) * OFFER_SLOT,
      y: offerTop + Math.floor(index / 3) * OFFER_SLOT,
      width: OFFER_SLOT, height: OFFER_SLOT,
    }));
    const inventoryRows = [...model.inventorySlots]
      .filter((row) => row.slot < HOTBAR_SLOT_COUNT || row.slot >= BACKPACK_SLOT_OFFSET)
      .sort((left, right) => left.slot - right.slot);
    const visibleInventoryRows = height >= 250 ? 3 : 2;
    const inventoryWidth = INVENTORY_COLUMNS * INVENTORY_SLOT;
    const buttonY = frame.y + frame.height - 38;
    const inventoryTop = buttonY - 9 - visibleInventoryRows * INVENTORY_SLOT;
    const inventoryLeft = Math.round(frame.x + (frame.width - inventoryWidth) / 2);
    const inventoryViewport = {
      x: inventoryLeft,
      y: inventoryTop,
      width: inventoryWidth,
      height: visibleInventoryRows * INVENTORY_SLOT,
    };
    this.inventoryScroll.setMetrics(Math.ceil(inventoryRows.length / INVENTORY_COLUMNS), visibleInventoryRows);
    this.inventoryScroll.setBounds({
      x: inventoryViewport.x + inventoryViewport.width + 3,
      y: inventoryViewport.y,
      width: 12,
      height: inventoryViewport.height,
    });
    const firstVisibleInventory = this.inventoryScroll.position * INVENTORY_COLUMNS;
    const inventory = inventoryRows
      .slice(firstVisibleInventory, firstVisibleInventory + visibleInventoryRows * INVENTORY_COLUMNS)
      .map((row, index) => ({
      row,
      rect: {
        x: inventoryLeft + (index % INVENTORY_COLUMNS) * INVENTORY_SLOT,
        y: inventoryTop + Math.floor(index / INVENTORY_COLUMNS) * INVENTORY_SLOT,
        width: INVENTORY_SLOT, height: INVENTORY_SLOT,
      },
      }));
    const moneyY = offerTop + OFFER_SLOT * 2 + 5;
    const moneyWidth = 39;
    const moneyStart = Math.round(ownStart + (offerWidth - (moneyWidth * 3 + 4)) / 2);
    return {
      frame,
      requestAccept: EMPTY, requestDecline: EMPTY,
      ownOffers: slots(ownStart), otherOffers: slots(otherStart),
      moneyGold: { x: moneyStart, y: moneyY, width: moneyWidth, height: 18 },
      moneySilver: { x: moneyStart + moneyWidth + 2, y: moneyY, width: moneyWidth, height: 18 },
      moneyBronze: { x: moneyStart + (moneyWidth + 2) * 2, y: moneyY, width: moneyWidth, height: 18 },
      cancel: { x: frame.x + frame.width / 2 - 105, y: buttonY, width: 90, height: 22 },
      accept: { x: frame.x + frame.width / 2 + 15, y: buttonY, width: 110, height: 22 },
      inventory, inventoryViewport,
    };
  }
}
