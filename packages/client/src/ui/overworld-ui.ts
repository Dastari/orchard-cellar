import type { LoadedAsset } from '../render/assets.js';
import { drawPixelText, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import type { UiPoint, UiRect } from './geometry.js';
import { UiInputRouter } from './input-router.js';
import { drawUiSkinAsset, drawUiSkinNatural, uiAssetFrame, type UiSkin } from './skin.js';
import { widget, type WidgetNode } from './widget.js';

export type OverworldWindow = 'pack' | 'crafting' | 'barrel';

export interface OverworldUiInventorySlot {
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
}

export interface OverworldUiModel {
  readonly width: number;
  readonly height: number;
  readonly connected: boolean;
  readonly playerCount: number;
  readonly selectedSlot: number;
  readonly inventory: readonly OverworldUiInventorySlot[];
  readonly timeLabel: string;
  readonly timeFraction: number;
  readonly raining: boolean;
  readonly prompt: string | null;
  readonly toast: string | null;
}

export interface OverworldUiCallbacks {
  readonly selectHotbar: (slot: number) => void;
  readonly setTimeFraction: (fraction: number) => void;
  readonly toggleRain: () => void;
  readonly signOut: () => void;
}

export interface OverworldUiItemArt {
  readonly axe: LoadedAsset;
  readonly pickaxe: LoadedAsset;
  readonly hoe: LoadedAsset;
  readonly watering_can: LoadedAsset;
  readonly wood: LoadedAsset;
}

export interface OverworldUiLayout {
  readonly status: UiRect;
  readonly weather: UiRect;
  readonly timeSlider: UiRect;
  readonly rainButton: UiRect;
  readonly hotbar: UiRect;
  readonly slots: readonly UiRect[];
  readonly tooltip: UiRect;
  readonly window: UiRect;
  readonly closeButton: UiRect;
  readonly signOutButton: UiRect;
}

const SLOT_WIDTH = 30;
const SLOT_HEIGHT = 31;
const HOTBAR_SLOTS = 9;

export function overworldUiLayout(width: number, height: number): OverworldUiLayout {
  const hotbarWidth = HOTBAR_SLOTS * SLOT_WIDTH;
  const hotbar = { x: Math.round((width - hotbarWidth) / 2), y: height - SLOT_HEIGHT - 6, width: hotbarWidth, height: SLOT_HEIGHT };
  const weather = { x: width - 174, y: 4, width: 170, height: 51 };
  const windowWidth = Math.min(270, Math.max(220, width - 16));
  const windowHeight = Math.min(184, Math.max(150, height - 30));
  const window = { x: Math.round((width - windowWidth) / 2), y: Math.round((height - windowHeight) / 2), width: windowWidth, height: windowHeight };
  return {
    status: { x: 4, y: 4, width: 190, height: 21 },
    weather,
    timeSlider: { x: weather.x + 9, y: weather.y + 23, width: weather.width - 18, height: 14 },
    rainButton: { x: weather.x + 9, y: weather.y + 35, width: 64, height: 14 },
    hotbar,
    slots: Array.from({ length: HOTBAR_SLOTS }, (_, slot) => ({ x: hotbar.x + slot * SLOT_WIDTH, y: hotbar.y, width: 28, height: SLOT_HEIGHT })),
    tooltip: { x: Math.round(width / 2) - 100, y: hotbar.y - 25, width: 200, height: 19 },
    window,
    closeButton: { x: window.x + window.width - 24, y: window.y + 8, width: 16, height: 16 },
    signOutButton: { x: window.x + 17, y: window.y + window.height - 23, width: 68, height: 16 },
  };
}

function fitLabel(text: string, characters: number): string {
  return text.length <= characters ? text : `${text.slice(0, Math.max(0, characters - 3))}...`;
}

function drawLabel(context: CanvasRenderingContext2D, ui: PixelUi, text: string, x: number, y: number, options: { align?: CanvasTextAlign; color?: string; font?: 'body' | 'header' } = {}): void {
  drawPixelText(context, ui, text, Math.round(x), Math.round(y), { align: options.align, color: options.color ?? '#3f2d25', font: options.font });
}

export class OverworldUi {
  readonly root: WidgetNode;
  private readonly router: UiInputRouter;
  private readonly hotbarNodes: WidgetNode[];
  private readonly weatherNode: WidgetNode;
  private readonly sliderNode: WidgetNode;
  private readonly rainNode: WidgetNode;
  private readonly windowNode: WidgetNode;
  private readonly closeNode: WidgetNode;
  private readonly signOutNode: WidgetNode;
  private model: OverworldUiModel = {
    width: 480, height: 270, connected: false, playerCount: 0, selectedSlot: 0,
    inventory: [], timeLabel: '06:00', timeFraction: 0, raining: false, prompt: null, toast: null,
  };
  private layout = overworldUiLayout(480, 270);
  private pointer: UiPoint = { x: -100, y: -100 };
  private hoveredSlot: number | null = null;
  private sliderDragging = false;
  private clickStartedAt = Number.NEGATIVE_INFINITY;
  private openWindowValue: OverworldWindow | null = null;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly itemArt: OverworldUiItemArt,
    private readonly callbacks: OverworldUiCallbacks,
  ) {
    this.root = widget('root', 'overworld.ui.root');
    this.weatherNode = widget('panel', 'hud.weather', { capturePointer: true });
    this.sliderNode = widget('slider', 'hud.weather.time', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.sliderDragging = true;
        this.setTimeAt(event.point.x);
        return true;
      },
      onWheel: () => true,
    });
    this.rainNode = widget('button', 'hud.weather.rain', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.toggleRain();
        return true;
      },
    });
    this.weatherNode.add(this.sliderNode, this.rainNode);
    const hotbar = widget('inventory_grid', 'hud.hotbar', { capturePointer: true });
    this.hotbarNodes = Array.from({ length: HOTBAR_SLOTS }, (_, slot) => widget('slot', `hud.hotbar.${slot}`, {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.selectHotbar(slot);
        return true;
      },
    }));
    hotbar.add(...this.hotbarNodes);
    this.windowNode = widget('window', 'window.active', { capturePointer: true });
    this.closeNode = widget('button', 'window.close', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.openWindow = null;
        return true;
      },
    });
    this.signOutNode = widget('button', 'window.pack.sign-out', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.signOut();
        return true;
      },
    });
    this.windowNode.add(this.closeNode, this.signOutNode);
    this.root.add(widget('label', 'hud.status'), this.weatherNode, hotbar, this.windowNode);
    this.router = new UiInputRouter(this.root);
  }

  get openWindow(): OverworldWindow | null { return this.openWindowValue; }
  set openWindow(window: OverworldWindow | null) {
    this.openWindowValue = window;
    this.windowNode.visible = window !== null;
  }

  update(model: OverworldUiModel): void {
    this.model = model;
    this.layout = overworldUiLayout(model.width, model.height);
    this.root.setBounds({ x: 0, y: 0, width: model.width, height: model.height });
    this.weatherNode.setBounds(this.layout.weather);
    this.sliderNode.setBounds(this.layout.timeSlider);
    this.rainNode.setBounds(this.layout.rainButton);
    const hotbar = this.root.children.find((child) => child.id === 'hud.hotbar');
    hotbar?.setBounds(this.layout.hotbar);
    this.hotbarNodes.forEach((node, slot) => node.setBounds(this.layout.slots[slot]!));
    this.windowNode.setBounds(this.layout.window);
    this.windowNode.visible = this.openWindowValue !== null;
    this.closeNode.setBounds(this.layout.closeButton);
    this.signOutNode.setBounds(this.layout.signOutButton);
    this.signOutNode.visible = this.openWindowValue === 'pack';
  }

  handleKeyDown(code: string, repeat: boolean): boolean {
    if (repeat) return false;
    if (code === 'Escape' && this.openWindowValue !== null) { this.openWindow = null; return true; }
    if (code === 'Tab' || code === 'KeyI') { this.openWindow = this.openWindowValue === 'pack' ? null : 'pack'; return true; }
    if (code === 'KeyC') { this.openWindow = this.openWindowValue === 'crafting' ? null : 'crafting'; return true; }
    if (code === 'KeyV') { this.openWindow = this.openWindowValue === 'barrel' ? null : 'barrel'; return true; }
    return false;
  }

  pointerMove(point: UiPoint): void {
    this.pointer = point;
    this.hoveredSlot = this.hotbarNodes.findIndex((node) => node.contains(point));
    if (this.hoveredSlot < 0) this.hoveredSlot = null;
    if (this.sliderDragging) this.setTimeAt(point.x);
  }

  pointerDown(point: UiPoint, button: number): boolean {
    this.pointer = point;
    this.clickStartedAt = performance.now();
    return this.router.routePointer({ kind: 'pointer_down', point, button });
  }

  pointerUp(point: UiPoint, button: number): boolean {
    this.pointer = point;
    const consumed = this.router.routePointer({ kind: 'pointer_up', point, button });
    if (this.sliderDragging) {
      this.setTimeAt(point.x);
      this.sliderDragging = false;
      return true;
    }
    return consumed;
  }

  pointerLeave(): void { this.hoveredSlot = null; this.sliderDragging = false; }

  wheel(point: UiPoint, deltaX: number, deltaY: number): boolean {
    return this.router.routeWheel({ point, deltaX, deltaY });
  }

  draw(context: CanvasRenderingContext2D): void {
    this.drawStatus(context);
    this.drawWeather(context);
    this.drawHotbar(context);
    if (this.openWindowValue) this.drawWindow(context, this.openWindowValue);
    this.drawTooltip(context);
    this.drawCursor(context);
  }

  drawNameplates(context: CanvasRenderingContext2D, labels: readonly { readonly x: number; readonly y: number; readonly text: string }[]): void {
    for (const label of labels) {
      const text = fitLabel(label.text.toUpperCase(), 20);
      const width = measurePixelText(text) + 10;
      const rect = { x: Math.round(label.x - width / 2), y: Math.round(label.y), width, height: 15 };
      drawUiSkinAsset(context, this.skin.panelParchment, rect);
      drawLabel(context, this.fonts, text, label.x, rect.y + 4, { align: 'center', color: '#5f3b24' });
    }
  }

  private drawStatus(context: CanvasRenderingContext2D): void {
    drawUiSkinAsset(context, this.skin.panelWood, this.layout.status);
    const status = `${this.model.connected ? 'ONLINE' : 'CONNECTING'}  ${this.model.playerCount} FARMER${this.model.playerCount === 1 ? '' : 'S'}`;
    drawLabel(context, this.fonts, status, this.layout.status.x + this.layout.status.width / 2, this.layout.status.y + 7, { align: 'center', color: '#4d2e22' });
  }

  private drawWeather(context: CanvasRenderingContext2D): void {
    const { weather, timeSlider, rainButton } = this.layout;
    drawUiSkinAsset(context, this.skin.panelWood, weather);
    drawLabel(context, this.fonts, `TIME ${this.model.timeLabel}`, weather.x + 10, weather.y + 9, { color: '#f8dfb4' });
    drawUiSkinAsset(context, this.skin.sliderTrack, { x: timeSlider.x, y: timeSlider.y + 4, width: timeSlider.width, height: 6 });
    const fillWidth = Math.max(1, Math.round((timeSlider.width - 2) * this.model.timeFraction));
    drawUiSkinAsset(context, this.skin.barGold, { x: timeSlider.x + 1, y: timeSlider.y + 5, width: fillWidth, height: 4 });
    drawUiSkinNatural(context, this.skin.sliderHandle, timeSlider.x + Math.round((timeSlider.width - 6) * this.model.timeFraction), timeSlider.y);
    drawUiSkinAsset(context, this.model.raining ? this.skin.buttonConfirm : this.skin.button, rainButton, 'idle');
    drawLabel(context, this.fonts, `RAIN ${this.model.raining ? 'ON' : 'OFF'}`, rainButton.x + rainButton.width / 2, rainButton.y + 4, { align: 'center', color: '#f8dfb4' });
  }

  private drawHotbar(context: CanvasRenderingContext2D): void {
    const itemBySlot = new Map(this.model.inventory.map((item) => [item.slot, item]));
    for (let slot = 0; slot < HOTBAR_SLOTS; slot += 1) {
      const rect = this.layout.slots[slot]!;
      drawUiSkinAsset(context, this.skin.slot, rect, 'idle');
      const item = itemBySlot.get(slot);
      const asset = item ? this.itemArt[item.itemKind as keyof OverworldUiItemArt] : undefined;
      if (asset) {
        const frame = uiAssetFrame(asset);
        if (frame) context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, rect.x + 6, rect.y + 7, 16, 16);
      }
      drawLabel(context, this.fonts, String(slot + 1), rect.x + 3, rect.y + 3, { color: '#51351f' });
      if ((item?.quantity ?? 0) > 1) drawLabel(context, this.fonts, String(item!.quantity), rect.x + rect.width - 3, rect.y + rect.height - 9, { align: 'right', color: '#f8ead0' });
      if (slot === this.model.selectedSlot || slot === this.hoveredSlot) {
        const selector = slot === this.model.selectedSlot ? this.skin.selectorConfirm : this.skin.selectorNeutral;
        drawUiSkinNatural(context, selector, rect.x - 10, rect.y - 9, 'idle');
      }
    }
  }

  private drawTooltip(context: CanvasRenderingContext2D): void {
    const hovered = this.hoveredSlot === null ? null : this.model.inventory.find((item) => item.slot === this.hoveredSlot) ?? null;
    const text = hovered?.itemKind.replaceAll('_', ' ').toUpperCase() ?? this.model.prompt ?? this.model.toast;
    if (!text) return;
    const width = Math.min(this.model.width - 12, Math.max(104, measurePixelText(text) + 16));
    const rect = { ...this.layout.tooltip, x: Math.round((this.model.width - width) / 2), width };
    drawUiSkinAsset(context, this.skin.panelParchment, rect);
    drawLabel(context, this.fonts, fitLabel(text, 44), rect.x + rect.width / 2, rect.y + 6, { align: 'center', color: '#5f3b24' });
  }

  private drawWindow(context: CanvasRenderingContext2D, window: OverworldWindow): void {
    const rect = this.layout.window;
    drawUiSkinAsset(context, this.skin.panelWood, rect);
    drawUiSkinAsset(context, this.skin.panelParchment, { x: rect.x + 10, y: rect.y + 13, width: rect.width - 20, height: rect.height - 23 });
    drawUiSkinNatural(context, this.skin.banner, rect.x + rect.width / 2 - 39, rect.y - 2);
    drawLabel(context, this.fonts, window === 'pack' ? 'PACK' : window === 'crafting' ? 'CRAFTING' : 'TEST BARREL', rect.x + rect.width / 2, rect.y + 7, { align: 'center', color: '#4d2e22', font: 'header' });
    drawUiSkinAsset(context, this.skin.buttonDeny, this.layout.closeButton, 'idle');
    drawLabel(context, this.fonts, 'X', this.layout.closeButton.x + 8, this.layout.closeButton.y + 5, { align: 'center', color: '#fff2d0' });
    if (window === 'pack') this.drawPack(context, rect);
    else if (window === 'crafting') this.drawCrafting(context, rect);
    else this.drawBarrel(context, rect);
  }

  private drawPack(context: CanvasRenderingContext2D, rect: UiRect): void {
    drawLabel(context, this.fonts, 'EQUIPMENT', rect.x + 20, rect.y + 32, { color: '#6b4428' });
    for (let index = 0; index < 4; index += 1) drawUiSkinAsset(context, this.skin.slot, { x: rect.x + 22, y: rect.y + 45 + index * 31, width: 28, height: 31 }, 'idle');
    const items = new Map(this.model.inventory.map((item) => [item.slot, item]));
    const startX = rect.x + 68; const startY = rect.y + 42;
    for (let index = 0; index < 20; index += 1) {
      const x = startX + index % 5 * 32; const y = startY + Math.floor(index / 5) * 31;
      drawUiSkinAsset(context, this.skin.slot, { x, y, width: 28, height: 31 }, 'idle');
      const item = items.get(index);
      const asset = item ? this.itemArt[item.itemKind as keyof OverworldUiItemArt] : undefined;
      const frame = asset ? uiAssetFrame(asset) : null;
      if (asset && frame) context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, x + 6, y + 6, 16, 16);
      if ((item?.quantity ?? 0) > 1) drawLabel(context, this.fonts, String(item!.quantity), x + 25, y + 19, { align: 'right', color: '#f8ead0' });
    }
    const signOut = this.layout.signOutButton;
    drawUiSkinAsset(context, this.skin.buttonDeny, signOut, 'idle');
    drawLabel(context, this.fonts, 'SIGN OUT', signOut.x + signOut.width / 2, signOut.y + 5, { align: 'center', color: '#fff2d0' });
  }

  private drawCrafting(context: CanvasRenderingContext2D, rect: UiRect): void {
    const startX = rect.x + 25; const startY = rect.y + 48;
    for (let index = 0; index < 9; index += 1) drawUiSkinAsset(context, this.skin.slot, {
      x: startX + index % 3 * 31, y: startY + Math.floor(index / 3) * 31, width: 28, height: 31,
    }, 'idle');
    drawLabel(context, this.fonts, '2 WOOD', startX + 46, startY - 14, { align: 'center', color: '#6b4428' });
    drawLabel(context, this.fonts, '>', rect.x + 134, rect.y + 86, { align: 'center', color: '#6b4428', font: 'header' });
    drawUiSkinAsset(context, this.skin.slot, { x: rect.x + 155, y: rect.y + 71, width: 28, height: 31 }, 'idle');
    drawLabel(context, this.fonts, '4 PLANKS', rect.x + 197, rect.y + 81, { color: '#6b4428' });
    const button = { x: rect.x + 150, y: rect.y + 117, width: 84, height: 16 };
    drawUiSkinAsset(context, this.skin.button, button, 'disabled');
    drawLabel(context, this.fonts, 'SERVER PENDING', button.x + button.width / 2, button.y + 5, { align: 'center', color: '#d5c6ad' });
  }

  private drawBarrel(context: CanvasRenderingContext2D, rect: UiRect): void {
    const startX = rect.x + Math.round((rect.width - 4 * 34) / 2); const startY = rect.y + 58;
    for (let index = 0; index < 8; index += 1) drawUiSkinAsset(context, this.skin.slot, {
      x: startX + index % 4 * 34, y: startY + Math.floor(index / 4) * 34, width: 28, height: 31,
    }, 'idle');
    drawLabel(context, this.fonts, 'CONTAINER REDUCER NOT YET PUBLISHED', rect.x + rect.width / 2, rect.y + rect.height - 25, { align: 'center', color: '#8c5d3a' });
  }

  private drawCursor(context: CanvasRenderingContext2D): void {
    if (this.pointer.x < 0 || this.pointer.y < 0) return;
    drawUiSkinNatural(context, this.skin.cursor, this.pointer.x, this.pointer.y, 'idle');
    const elapsed = performance.now() - this.clickStartedAt;
    if (elapsed < 280) drawUiSkinNatural(context, this.skin.cursorClick, this.pointer.x - 8, this.pointer.y - 8, 'click', Math.min(3, Math.floor(elapsed / 70)));
  }

  private setTimeAt(pointerX: number): void {
    const fraction = Math.max(0, Math.min(1, (pointerX - this.layout.timeSlider.x) / this.layout.timeSlider.width));
    this.callbacks.setTimeFraction(fraction);
  }
}
