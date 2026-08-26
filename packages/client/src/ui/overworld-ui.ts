import { craftingRecipeOutput, durabilityFraction, distributeItemStack, itemDefinition, matchingRecipeId, maxStackFor, recipeDefinition, toolDurabilityDefinition, type ContainerSnapshot, type CraftingStation, type ItemStack, type MoveItemRequest, type WeatherMode, type WindDirectionMode } from '@orchard/sim';
import type { LoadedAsset } from '../render/assets.js';
import { drawOutlinedPixelText, drawPixelText, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import { hotbarItemName } from '../survival-ui.js';
import { craftingRecipeBookEntries } from './recipe-book.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { UiInputRouter } from './input-router.js';
import { Slider } from './slider.js';
import { Ribbon } from './ribbon.js';
import { DragContext } from './drag-context.js';
import { EQUIPMENT_SLOT_RESTRICTIONS, ItemSlot } from './item-slot.js';
import { HelpBook } from './help-book.js';
import { ScrollBar } from './scrollbar.js';
import { CurrencyDisplay } from './currency-display.js';
import { PlayerResourceFrame } from './player-resource-frame.js';
import { drawUiLabelPlate, drawUiSkinAsset, drawUiSkinNatural, uiAssetFrame, type UiSkin } from './skin.js';
import { widget, type WidgetNode } from './widget.js';

export type OverworldWindow = 'inventory' | 'pack' | 'crafting' | 'chest' | 'barrel' | 'cooking' | 'system' | 'settings' | 'developer' | 'help';

export interface OverworldUiInventorySlot {
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
}

export interface OverworldUiVitals {
  readonly playerId: string;
  readonly health: number; readonly maxHealth: number;
  readonly mana: number; readonly maxMana: number;
  readonly vigour: number; readonly maxVigour: number;
}

export interface OverworldUiTargetVitals {
  readonly targetId: string;
  readonly displayName: string;
  readonly health: number; readonly maxHealth: number;
  readonly mana?: number; readonly maxMana?: number;
  readonly vigour?: number; readonly maxVigour?: number;
  readonly portrait:
    | { readonly kind: 'player'; readonly playerId: string }
    | { readonly kind: 'npc'; readonly npcKind: string; readonly species?: string; readonly variant: number };
}

export interface OverworldUiEffect {
  readonly effectKind: string; readonly name: string; readonly stacks: number;
  readonly remainingTicks: number; readonly durationTicks: number;
}

export interface OnlinePlayerListEntry {
  readonly displayName: string;
  readonly self: boolean;
}

export interface OverworldUiModel {
  readonly width: number;
  readonly height: number;
  readonly connected: boolean;
  readonly playerCount: number;
  readonly selectedSlot: number;
  readonly balanceBronze?: bigint;
  readonly inventory: readonly OverworldUiInventorySlot[];
  readonly vitals?: OverworldUiVitals;
  readonly targetVitals?: OverworldUiTargetVitals;
  readonly effects?: readonly OverworldUiEffect[];
  readonly vigourDenied?: boolean;
  readonly openChestInventory?: readonly OverworldUiInventorySlot[];
  readonly openPlaceableInventory?: readonly OverworldUiInventorySlot[];
  readonly hasBackpack: boolean;
  readonly audioVolumes: { readonly master: number; readonly music: number; readonly sfx: number };
  readonly canAdministerWorld: boolean;
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly timeFraction: number;
  readonly raining: boolean;
  readonly weatherMode: WeatherMode;
  readonly windDirectionMode?: WindDirectionMode;
  readonly windDirectionLabel?: string;
  readonly prompt: string | null;
  readonly toast: string | null;
  readonly nearbyCraftingStations?: readonly CraftingStation[];
}

export interface OverworldUiCallbacks {
  readonly selectHotbar: (slot: number) => void;
  readonly setTimeFraction: (fraction: number) => void;
  readonly shiftDay: (days: number) => void;
  readonly cycleWeather: () => void;
  readonly cycleWindDirection: () => void;
  readonly setAudioVolume: (bus: 'master' | 'music' | 'sfx', value: number) => void;
  readonly signOut: () => void;
  readonly quitToTitle: () => void;
  readonly moveInventoryItem: (request: MoveItemRequest) => void;
  readonly quickMoveInventoryItem: (fromContainer: string, fromIndex: number, toContainers: readonly string[]) => void;
  readonly quickMoveAllInventoryItems: (itemKind: string, fromContainers: readonly string[], toContainers: readonly string[]) => void;
  readonly distributeInventoryItem: (fromContainer: string, fromIndex: number, targets: readonly { container: string; index: number }[], quantity: number) => void;
  readonly craftInventoryRecipe: (recipeId: string, craftAll: boolean) => void;
  readonly ghostFillCraftingRecipe: (recipeId: string) => void;
  readonly closeChest: () => void;
  readonly closePlaceable: () => void;
  readonly closeCrafting: () => void;
}

export interface OverworldUiItemArt {
  readonly [itemKind: string]: LoadedAsset;
  readonly avatar: LoadedAsset;
  readonly missing: LoadedAsset;
}

export interface OverworldUiLayout {
  readonly status: UiRect;
  readonly weather: UiRect;
  readonly timeSlider: UiRect;
  readonly previousDayButton: UiRect;
  readonly nextDayButton: UiRect;
  readonly weatherButton: UiRect;
  readonly windDirectionButton: UiRect;
  readonly hotbar: UiRect;
  readonly vitals: UiRect;
  readonly targetVitals: UiRect;
  readonly slots: readonly UiRect[];
  readonly tooltip: UiRect;
  readonly window: UiRect;
  readonly inventoryWindow: UiRect;
  readonly systemWindow: UiRect;
  readonly settingsWindow: UiRect;
  readonly developerWindow: UiRect;
  readonly closeButton: UiRect;
  readonly equipmentSlots: readonly UiRect[];
  readonly backpackSlots: readonly UiRect[];
  readonly inventoryHotbarSlots: readonly UiRect[];
  readonly craftingSlots: readonly UiRect[];
  readonly craftingResult: UiRect;
  readonly craftingInventorySlots: readonly UiRect[];
  readonly craftingRecipeRows: readonly UiRect[];
  readonly chestSlots: readonly UiRect[];
  readonly barrelSlots: readonly UiRect[];
  readonly resumeButton: UiRect;
  readonly helpButton: UiRect;
  readonly settingsButton: UiRect;
  readonly developerButton: UiRect;
  readonly signOutButton: UiRect;
  readonly quitButton: UiRect;
  readonly masterSlider: UiRect;
  readonly musicSlider: UiRect;
  readonly sfxSlider: UiRect;
  readonly settingsBackButton: UiRect;
  readonly developerBackButton: UiRect;
}

const SLOT_WIDTH = 30;
const SLOT_HEIGHT = 31;
const HOTBAR_SLOTS = 9;
const BACKPACK_SLOTS = 20;
const DEFAULT_INVENTORY_SLOTS = 8;
const BACKPACK_SLOT_OFFSET = HOTBAR_SLOTS;
const EQUIPMENT_SLOT_OFFSET = BACKPACK_SLOT_OFFSET + BACKPACK_SLOTS;
const CRAFTING_SLOT_OFFSET = EQUIPMENT_SLOT_OFFSET + 9;
export const HUD_RESOURCE_FRAME_SCALE = 1.5;
const HUD_RESOURCE_FRAME_WIDTH = Math.round(48 * HUD_RESOURCE_FRAME_SCALE);
const HUD_RESOURCE_FRAME_HEIGHT = Math.round(19 * HUD_RESOURCE_FRAME_SCALE);
const NAMEPLATE_HORIZONTAL_PADDING = 5;
const NAMEPLATE_HEIGHT = 11;
export const ONLINE_PLAYER_LIST_BOTTOM_PADDING = 12;
const ONLINE_PLAYER_LIST_CONTENT_TOP = 29;
const ONLINE_PLAYER_LIST_ROW_HEIGHT = 12;
const EQUIPMENT_SLOT_KINDS = ['neck', 'head', 'ring', 'main_hand', 'body', 'off_hand', 'hands', 'legs', 'feet'] as const;

export function nameplateRect(centerX: number, y: number, text: string): UiRect {
  const width = measurePixelText(fitLabel(text, 20)) + NAMEPLATE_HORIZONTAL_PADDING * 2;
  return {
    x: Math.round(centerX - width / 2),
    y: Math.round(y),
    width,
    height: NAMEPLATE_HEIGHT,
  };
}

export function isNameplateToggle(code: string, repeat: boolean): boolean {
  return code === 'KeyN' && !repeat;
}

export function onlinePlayerListFrameHeight(contentRows: number): number {
  return ONLINE_PLAYER_LIST_CONTENT_TOP
    + Math.max(0, contentRows) * ONLINE_PLAYER_LIST_ROW_HEIGHT
    + ONLINE_PLAYER_LIST_BOTTOM_PADDING;
}

/** Lower-right quantity label position inside the slot's usable face. The
 * bottom six rows belong to the bevel and must not be treated as content. */
export function slotStackLabelPosition(rect: UiRect): UiPoint {
  return {
    x: rect.x + rect.width - 5,
    y: rect.y + rect.height - 14,
  };
}

export function slotDurabilityBarRect(rect: UiRect): UiRect {
  return { x: rect.x + 5, y: rect.y + rect.height - 7, width: rect.width - 10, height: 3 };
}

export function itemIconAnimation(itemKind: string): string {
  return itemDefinition(itemKind)?.iconAnimation ?? 'base';
}

export function overworldUiLayout(width: number, height: number): OverworldUiLayout {
  const hotbarWidth = HOTBAR_SLOTS * SLOT_WIDTH;
  const hotbar = { x: Math.round((width - hotbarWidth) / 2), y: height - SLOT_HEIGHT - 6, width: hotbarWidth, height: SLOT_HEIGHT };
  const vitals = {
    x: hotbar.x, y: hotbar.y - HUD_RESOURCE_FRAME_HEIGHT - 4,
    width: HUD_RESOURCE_FRAME_WIDTH, height: HUD_RESOURCE_FRAME_HEIGHT,
  };
  const targetVitals = {
    x: hotbar.x + hotbar.width - HUD_RESOURCE_FRAME_WIDTH, y: vitals.y,
    width: HUD_RESOURCE_FRAME_WIDTH, height: HUD_RESOURCE_FRAME_HEIGHT,
  };
  const weather = { x: width - 224, y: 4, width: 220, height: 24 };
  const windowWidth = Math.min(270, Math.max(220, width - 16));
  const windowHeight = Math.min(184, Math.max(150, height - 30));
  const window = { x: Math.round((width - windowWidth) / 2), y: Math.round((height - windowHeight) / 2), width: windowWidth, height: windowHeight };
  const inventoryWidth = Math.min(464, Math.max(350, width - 16));
  const inventoryHeight = Math.min(240, Math.max(220, height - 16));
  const inventoryWindow = { x: Math.round((width - inventoryWidth) / 2), y: Math.round((height - inventoryHeight) / 2), width: inventoryWidth, height: inventoryHeight };
  const systemHeight = Math.min(202, height - 16);
  const systemWindow = { x: Math.round((width - 190) / 2), y: Math.round((height - systemHeight) / 2), width: 190, height: systemHeight };
  const settingsWindow = { x: Math.round((width - 270) / 2), y: Math.round((height - 184) / 2), width: 270, height: 184 };
  const developerWidth = Math.min(400, Math.max(220, width - 24));
  const developerHeight = Math.min(230, Math.max(170, height - 24));
  const developerWindow = { x: Math.round((width - developerWidth) / 2), y: Math.round((height - developerHeight) / 2), width: developerWidth, height: developerHeight };
  const paperOrigin = { x: inventoryWindow.x + 22, y: inventoryWindow.y + 51 };
  const equipmentCells = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]] as const;
  const backpackOrigin = { x: inventoryWindow.x + inventoryWindow.width - 183, y: inventoryWindow.y + 51 };
  const inventoryHotbarX = inventoryWindow.x + Math.round((inventoryWindow.width - hotbarWidth) / 2);
  const menuStep = Math.min(24, Math.max(19, Math.floor((systemWindow.height - 61) / 5)));
  const menuButton = (row: number): UiRect => ({ x: systemWindow.x + 35, y: systemWindow.y + 31 + row * menuStep, width: 120, height: 19 });
  const settingsSlider = (row: number): UiRect => ({ x: settingsWindow.x + 91, y: settingsWindow.y + 49 + row * 28, width: 132, height: 14 });
  return {
    status: { x: 4, y: 4, width: 190, height: 24 },
    weather,
    previousDayButton: { x: developerWindow.x + 30, y: developerWindow.y + 49, width: 64, height: 20 },
    timeSlider: { x: developerWindow.x + 102, y: developerWindow.y + 52, width: developerWindow.width - 204, height: 14 },
    nextDayButton: { x: developerWindow.x + developerWindow.width - 94, y: developerWindow.y + 49, width: 64, height: 20 },
    weatherButton: { x: developerWindow.x + 30, y: developerWindow.y + 84, width: developerWindow.width - 60, height: 22 },
    windDirectionButton: { x: developerWindow.x + 30, y: developerWindow.y + 119, width: developerWindow.width - 60, height: 22 },
    hotbar,
    vitals,
    targetVitals,
    slots: Array.from({ length: HOTBAR_SLOTS }, (_, slot) => ({ x: hotbar.x + slot * SLOT_WIDTH, y: hotbar.y, width: 28, height: SLOT_HEIGHT })),
    tooltip: { x: Math.round(width / 2) - 100, y: vitals.y - 20, width: 200, height: 16 },
    window,
    inventoryWindow,
    systemWindow,
    settingsWindow,
    developerWindow,
    closeButton: { x: window.x + window.width - 24, y: window.y + 8, width: 16, height: 16 },
    equipmentSlots: equipmentCells.map(([column, row]) => ({ x: paperOrigin.x + column * 31, y: paperOrigin.y + row * 34, width: 28, height: 31 })),
    backpackSlots: Array.from({ length: 20 }, (_, index) => ({ x: backpackOrigin.x + index % 5 * 31, y: backpackOrigin.y + Math.floor(index / 5) * 31, width: 28, height: 31 })),
    inventoryHotbarSlots: Array.from({ length: HOTBAR_SLOTS }, (_, slot) => ({ x: inventoryHotbarX + slot * SLOT_WIDTH, y: inventoryWindow.y + inventoryWindow.height - 48, width: 28, height: 31 })),
    craftingSlots: Array.from({ length: 9 }, (_, index) => ({ x: inventoryWindow.x + 20 + index % 3 * 31, y: inventoryWindow.y + 51 + Math.floor(index / 3) * 31, width: 28, height: 31 })),
    craftingResult: { x: inventoryWindow.x + 144, y: inventoryWindow.y + 82, width: 28, height: 31 },
    craftingInventorySlots: Array.from({ length: BACKPACK_SLOTS }, (_, index) => ({
      x: inventoryWindow.x + inventoryWindow.width - 183 + index % 5 * 31,
      y: inventoryWindow.y + 51 + Math.floor(index / 5) * 31,
      width: 28,
      height: 31,
    })),
    craftingRecipeRows: Array.from({ length: 7 }, (_, index) => ({
      x: inventoryWindow.x + 182,
      y: inventoryWindow.y + 49 + index * 17,
      width: Math.max(72, inventoryWindow.width - 182 - 191),
      height: 15,
    })),
    chestSlots: Array.from({ length: 27 }, (_, index) => ({ x: inventoryWindow.x + 40 + index % 9 * 30, y: inventoryWindow.y + 50 + Math.floor(index / 9) * 31, width: 28, height: 31 })),
    barrelSlots: Array.from({ length: 8 }, (_, index) => ({
      x: inventoryWindow.x + Math.round((inventoryWindow.width - 4 * 34) / 2) + index % 4 * 34,
      y: inventoryWindow.y + 58 + Math.floor(index / 4) * 34,
      width: 28,
      height: 31,
    })),
    resumeButton: menuButton(0),
    helpButton: menuButton(1),
    settingsButton: menuButton(2),
    developerButton: menuButton(3),
    signOutButton: menuButton(4),
    quitButton: menuButton(5),
    masterSlider: settingsSlider(0),
    musicSlider: settingsSlider(1),
    sfxSlider: settingsSlider(2),
    settingsBackButton: { x: settingsWindow.x + 91, y: settingsWindow.y + 142, width: 88, height: 18 },
    developerBackButton: { x: developerWindow.x + Math.round((developerWindow.width - 88) / 2), y: developerWindow.y + developerWindow.height - 32, width: 88, height: 18 },
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
  private readonly timeSlider: Slider;
  private readonly previousDayNode: WidgetNode;
  private readonly nextDayNode: WidgetNode;
  private readonly weatherModeNode: WidgetNode;
  private readonly windDirectionNode: WidgetNode;
  private readonly windowNode: WidgetNode;
  private readonly closeNode: WidgetNode;
  private readonly inventoryHotbarSlots: ItemSlot[];
  private readonly backpackItemSlots: ItemSlot[];
  private readonly equipmentItemSlots: ItemSlot[];
  private readonly craftingItemSlots: ItemSlot[];
  private readonly chestItemSlots: ItemSlot[];
  private readonly barrelItemSlots: ItemSlot[];
  private readonly resumeNode: WidgetNode;
  private readonly helpNode: WidgetNode;
  private readonly settingsNode: WidgetNode;
  private readonly developerNode: WidgetNode;
  private readonly signOutNode: WidgetNode;
  private readonly quitNode: WidgetNode;
  private readonly settingsBackNode: WidgetNode;
  private readonly developerBackNode: WidgetNode;
  private readonly masterSlider: Slider;
  private readonly musicSlider: Slider;
  private readonly sfxSlider: Slider;
  private readonly windowRibbon: Ribbon;
  private readonly helpBook: HelpBook;
  private readonly onlinePlayersScrollBar: ScrollBar;
  private readonly currencyDisplay: CurrencyDisplay;
  private readonly playerResourceFrame: PlayerResourceFrame;
  private readonly targetResourceFrame: PlayerResourceFrame;
  private readonly drag = new DragContext();
  private model: OverworldUiModel = {
    width: 480, height: 270, connected: false, playerCount: 0, selectedSlot: 0, balanceBronze: 0n,
    inventory: [], openChestInventory: [], hasBackpack: false, audioVolumes: { master: 0.8, music: 0.7, sfx: 0.35 },
    canAdministerWorld: false, dateLabel: 'SPRING 1', timeLabel: '06:00',
    timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null,
  };
  private layout = overworldUiLayout(480, 270);
  private pointer: UiPoint = { x: -100, y: -100 };
  private hoveredSlot: number | null = null;
  private pressedInventorySlot: ItemSlot | null = null;
  private shiftDrag = false;
  private shiftDragTargets: ItemSlot[] = [];
  private shiftDragOriginalItems = new Map<ItemSlot, ItemStack | null>();
  private shiftDragRemaining: number | null = null;
  private holdingClickStack = false;
  private dragGrabbedAt = Number.NEGATIVE_INFINITY;
  private lastShiftClick: { readonly key: string; readonly itemKind: string; readonly at: number } | null = null;
  private clickStartedAt = Number.NEGATIVE_INFINITY;
  private openWindowValue: OverworldWindow | null = null;
  private onlinePlayerListActive = false;
  private onlinePlayerListRect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
  private craftingRecipeScroll = 0;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly itemArt: OverworldUiItemArt,
    private readonly callbacks: OverworldUiCallbacks,
    drawPlayerHead: (context: CanvasRenderingContext2D, playerId: string, rect: UiRect) => void = () => undefined,
    drawTargetPortrait: (context: CanvasRenderingContext2D, target: OverworldUiTargetVitals, rect: UiRect) => void = () => undefined,
  ) {
    this.root = widget('root', 'overworld.ui.root');
    this.windowRibbon = new Ribbon(skin.banner, fonts);
    this.helpBook = new HelpBook(skin, fonts);
    this.onlinePlayersScrollBar = new ScrollBar(skin);
    this.currencyDisplay = new CurrencyDisplay(skin, fonts);
    this.playerResourceFrame = new PlayerResourceFrame(skin, {
      resolve: (playerId) => this.model.vitals?.playerId === playerId ? this.model.vitals : null,
      drawHead: drawPlayerHead,
    });
    this.targetResourceFrame = new PlayerResourceFrame(skin, {
      resolve: (targetId) => this.model.targetVitals?.targetId === targetId ? this.model.targetVitals : null,
      drawHead: (context, targetId, rect) => {
        const target = this.model.targetVitals;
        if (target?.targetId === targetId) drawTargetPortrait(context, target, rect);
      },
    });
    this.weatherNode = widget('panel', 'hud.weather', { capturePointer: true });
    this.timeSlider = new Slider({
      id: 'hud.weather.time',
      skin,
      onChange: (value) => this.callbacks.setTimeFraction(value),
    });
    this.previousDayNode = widget('button', 'hud.weather.previous-day', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.shiftDay(-1);
        return true;
      },
    });
    this.nextDayNode = widget('button', 'hud.weather.next-day', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.shiftDay(1);
        return true;
      },
    });
    this.weatherModeNode = widget('button', 'hud.weather.mode', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.cycleWeather();
        return true;
      },
    });
    this.windDirectionNode = widget('button', 'hud.weather.wind-direction', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.cycleWindDirection();
        return true;
      },
    });
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
    this.inventoryHotbarSlots = Array.from({ length: HOTBAR_SLOTS }, (_, slot) => new ItemSlot(`window.inventory.hotbar.${slot}`, 'hotbar', slot));
    this.backpackItemSlots = Array.from({ length: BACKPACK_SLOTS }, (_, slot) => new ItemSlot(`window.inventory.backpack.${slot}`, 'backpack', slot));
    this.equipmentItemSlots = EQUIPMENT_SLOT_RESTRICTIONS.map((restriction, slot) => (
      new ItemSlot(`window.inventory.equipment.${slot}`, 'equipment', slot, restriction)
    ));
    this.craftingItemSlots = Array.from({ length: 9 }, (_, slot) => new ItemSlot(`window.crafting.${slot}`, 'crafting', slot));
    this.chestItemSlots = Array.from({ length: 27 }, (_, slot) => new ItemSlot(`window.chest.${slot}`, 'chest', slot));
    this.barrelItemSlots = Array.from({ length: 8 }, (_, slot) => new ItemSlot(`window.barrel.${slot}`, 'placeable', slot));
    this.resumeNode = widget('button', 'window.system.resume', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.openWindow = null;
        return true;
      },
    });
    this.helpNode = widget('button', 'window.system.help', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.openWindow = 'help';
        return true;
      },
    });
    this.settingsNode = widget('button', 'window.system.settings', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.openWindow = 'settings';
        return true;
      },
    });
    this.developerNode = widget('button', 'window.system.developer', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        if (this.model.canAdministerWorld) this.openWindow = 'developer';
        return true;
      },
    });
    this.signOutNode = widget('button', 'window.system.sign-out', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.signOut();
        return true;
      },
    });
    this.quitNode = widget('button', 'window.system.quit', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.quitToTitle();
        return true;
      },
    });
    this.settingsBackNode = widget('button', 'window.settings.back', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.openWindow = 'system';
        return true;
      },
    });
    this.developerBackNode = widget('button', 'window.developer.back', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.openWindow = 'system';
        return true;
      },
    });
    this.masterSlider = new Slider({ id: 'window.settings.master', skin, onChange: (value) => this.callbacks.setAudioVolume('master', value) });
    this.musicSlider = new Slider({ id: 'window.settings.music', skin, onChange: (value) => this.callbacks.setAudioVolume('music', value) });
    this.sfxSlider = new Slider({ id: 'window.settings.sfx', skin, onChange: (value) => this.callbacks.setAudioVolume('sfx', value) });
    this.windowNode.add(
      this.closeNode,
      ...this.inventoryHotbarSlots.map((slot) => slot.node),
      ...this.backpackItemSlots.map((slot) => slot.node),
      ...this.equipmentItemSlots.map((slot) => slot.node),
      ...this.craftingItemSlots.map((slot) => slot.node),
      ...this.chestItemSlots.map((slot) => slot.node),
      ...this.barrelItemSlots.map((slot) => slot.node),
      this.resumeNode,
      this.helpNode,
      this.settingsNode,
      this.developerNode,
      this.signOutNode,
      this.quitNode,
      this.settingsBackNode,
      this.developerBackNode,
      this.previousDayNode,
      this.timeSlider.node,
      this.nextDayNode,
      this.weatherModeNode,
      this.windDirectionNode,
      this.masterSlider.node,
      this.musicSlider.node,
      this.sfxSlider.node,
    );
    this.root.add(widget('label', 'hud.status'), this.weatherNode, hotbar, this.windowNode);
    this.router = new UiInputRouter(this.root);
  }

  get openWindow(): OverworldWindow | null { return this.openWindowValue; }
  set openWindow(window: OverworldWindow | null) {
    const requestedWindow = window === 'pack' ? 'inventory' : window;
    const nextWindow = requestedWindow === 'developer' && !this.model.canAdministerWorld ? 'system' : requestedWindow;
    if (nextWindow !== this.openWindowValue && this.isInventoryWindow(this.openWindowValue)) {
      this.clearShiftDistributionPreview();
    }
    if (this.openWindowValue === 'chest' && nextWindow !== 'chest') this.callbacks.closeChest();
    if (this.openWindowValue === 'barrel' && nextWindow !== 'barrel') this.callbacks.closePlaceable();
    if (this.openWindowValue === 'crafting' && nextWindow !== 'crafting') this.callbacks.closeCrafting();
    if (this.isInventoryWindow(this.openWindowValue) && !this.isInventoryWindow(nextWindow)) {
      this.pressedInventorySlot = null;
      this.shiftDrag = false;
      this.shiftDragTargets = [];
      this.holdingClickStack = false;
      this.drag.dispatch({ type: 'cancel' });
    }
    if (nextWindow === 'help' && this.openWindowValue !== 'help') this.helpBook.reset();
    this.openWindowValue = nextWindow;
    this.syncActiveWindow();
  }

  update(model: OverworldUiModel): void {
    this.onlinePlayerListActive = false;
    this.model = model;
    if (this.openWindowValue === 'developer' && !model.canAdministerWorld) this.openWindowValue = 'system';
    this.layout = overworldUiLayout(model.width, model.height);
    this.root.setBounds({ x: 0, y: 0, width: model.width, height: model.height });
    this.weatherNode.setBounds(this.layout.weather);
    this.timeSlider.setBounds(this.layout.timeSlider);
    this.timeSlider.value = model.timeFraction;
    this.previousDayNode.setBounds(this.layout.previousDayButton);
    this.nextDayNode.setBounds(this.layout.nextDayButton);
    this.weatherModeNode.setBounds(this.layout.weatherButton);
    this.windDirectionNode.setBounds(this.layout.windDirectionButton);
    const hotbar = this.root.children.find((child) => child.id === 'hud.hotbar');
    hotbar?.setBounds(this.layout.hotbar);
    this.hotbarNodes.forEach((node, slot) => node.setBounds(this.layout.slots[slot]!));
    // The world table keeps explicit `empty` rows for vacant cells. Those are a
    // persistence detail, not an item stack: retaining them here makes a slot
    // look empty while drop validation sees an incompatible item occupying it.
    const inventoryBySlot = new Map(model.inventory
      .filter((item) => item.itemKind !== 'empty' && item.quantity > 0)
      .map((item) => [item.slot, item]));
    this.inventoryHotbarSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.inventoryHotbarSlots[index]!);
      slot.enabled = true;
      slot.item = inventoryBySlot.get(index) ?? null;
    });
    this.backpackItemSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.backpackSlots[index]!);
      slot.enabled = index < DEFAULT_INVENTORY_SLOTS || model.hasBackpack;
      slot.item = inventoryBySlot.get(BACKPACK_SLOT_OFFSET + index) ?? null;
    });
    this.equipmentItemSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.equipmentSlots[index]!);
      slot.enabled = true;
      slot.item = inventoryBySlot.get(EQUIPMENT_SLOT_OFFSET + index) ?? null;
    });
    this.craftingItemSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.craftingSlots[index]!); slot.enabled = true;
      slot.item = inventoryBySlot.get(CRAFTING_SLOT_OFFSET + index) ?? null;
    });
    const chestBySlot = new Map((model.openChestInventory ?? [])
      .filter((item) => item.itemKind !== 'empty' && item.quantity > 0)
      .map((item) => [item.slot, item]));
    this.chestItemSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.chestSlots[index]!); slot.enabled = true; slot.item = chestBySlot.get(index) ?? null;
    });
    const placeableBySlot = new Map((model.openPlaceableInventory ?? [])
      .filter((item) => item.itemKind !== 'empty' && item.quantity > 0)
      .map((item) => [item.slot, item]));
    this.barrelItemSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.barrelSlots[index]!); slot.enabled = true; slot.item = placeableBySlot.get(index) ?? null;
    });
    if (this.shiftDrag && this.shiftDragTargets.length > 0) this.applyShiftDistributionPreview();
    this.resumeNode.setBounds(this.layout.resumeButton);
    this.helpNode.setBounds(this.layout.helpButton);
    this.settingsNode.setBounds(this.layout.settingsButton);
    this.developerNode.setBounds(this.layout.developerButton);
    this.signOutNode.setBounds(this.layout.signOutButton);
    this.quitNode.setBounds(this.layout.quitButton);
    this.settingsBackNode.setBounds(this.layout.settingsBackButton);
    this.developerBackNode.setBounds(this.layout.developerBackButton);
    this.masterSlider.setBounds(this.layout.masterSlider);
    this.musicSlider.setBounds(this.layout.musicSlider);
    this.sfxSlider.setBounds(this.layout.sfxSlider);
    this.masterSlider.value = model.audioVolumes.master;
    this.musicSlider.value = model.audioVolumes.music;
    this.sfxSlider.value = model.audioVolumes.sfx;
    this.syncActiveWindow();
  }

  handleKeyDown(code: string, repeat: boolean): boolean {
    if (repeat) return false;
    if (this.openWindowValue === 'help' && this.helpBook.handleKeyDown(code)) return true;
    if (code === 'Escape') {
      if (this.openWindowValue === 'settings' || this.openWindowValue === 'developer' || this.openWindowValue === 'help') this.openWindow = 'system';
      else if (this.openWindowValue === 'cooking') this.openWindow = null;
      else if (this.openWindowValue === 'system') this.openWindow = null;
      else this.openWindow = 'system';
      return true;
    }
    if (code === 'KeyI') { this.openWindow = this.openWindowValue === 'inventory' ? null : 'inventory'; return true; }
    if (code === 'KeyC') { this.openWindow = this.openWindowValue === 'crafting' ? null : 'crafting'; return true; }
    return this.openWindowValue !== null;
  }

  handleOnlinePlayersKeyDown(code: string): boolean {
    return this.onlinePlayerListActive && this.onlinePlayersScrollBar.handleKey(code);
  }

  pointerMove(point: UiPoint, modifiers: { readonly shift?: boolean } = {}): void {
    this.pointer = point;
    if (this.onlinePlayerListActive) this.onlinePlayersScrollBar.pointerMove(point);
    const slotNodes = this.openWindowValue === 'inventory' ? this.inventoryHotbarSlots.map((slot) => slot.node) : this.hotbarNodes;
    this.hoveredSlot = slotNodes.findIndex((node) => node.contains(point));
    if (this.hoveredSlot < 0) this.hoveredSlot = null;
    if (this.drag.state.phase !== 'idle' && this.drag.state.phase !== 'awaiting_commit') {
      if (modifiers.shift) this.shiftDrag = true;
      const target = this.inventoryItemSlotAt(point);
      if (target === null) this.drag.dispatch({ type: 'leave' });
      else {
        this.drag.dispatch({ type: 'hover', target, accepts: this.canDropOn(target) });
        const sourceIsTarget = target.containerId === this.drag.state.source.containerId
          && target.index === this.drag.state.source.index;
        if (this.shiftDrag && modifiers.shift && !sourceIsTarget
          && this.canDropOn(target) && !this.shiftDragTargets.includes(target)) {
          this.shiftDragTargets.push(target);
          this.applyShiftDistributionPreview();
        }
      }
    }
    this.timeSlider.pointerMove(point);
    this.masterSlider.pointerMove(point);
    this.musicSlider.pointerMove(point);
    this.sfxSlider.pointerMove(point);
  }

  pointerDown(point: UiPoint, button: number, modifiers: { readonly shift?: boolean } = {}): boolean {
    this.pointer = point;
    this.clickStartedAt = performance.now();
    if (button === 2 && this.drag.state.phase !== 'idle') {
      const state = this.drag.state;
      const target = this.inventoryItemSlotAt(point);
      const sourceIsTarget = target !== null
        && target.containerId === state.source.containerId
        && target.index === state.source.index;
      this.pressedInventorySlot = null;
      this.shiftDrag = false;
      this.shiftDragTargets = [];
      this.clearShiftDistributionPreview();
      if (target !== null && !sourceIsTarget && this.canDropOn(target)) {
        this.callbacks.moveInventoryItem({
          fromContainer: state.source.containerId,
          fromIndex: state.source.index,
          toContainer: target.containerId,
          toIndex: target.index,
          quantity: 1,
        });
        const hasRemainder = state.quantity > 1;
        this.drag.dispatch({ type: 'place_one' });
        this.holdingClickStack = hasRemainder;
      } else {
        this.holdingClickStack = false;
        this.drag.dispatch({ type: 'cancel' });
      }
      return true;
    }
    if (button === 0 && this.onlinePlayerListActive && this.onlinePlayersScrollBar.pointerDown(point)) return true;
    if (this.openWindowValue === null
      && ((this.model.vitals !== undefined && containsPoint(this.layout.vitals, point))
        || (this.model.targetVitals !== undefined && containsPoint(this.layout.targetVitals, point)))) return true;
    if (this.openWindowValue === 'help') {
      const result = this.helpBook.pointerDown(point);
      if (result === 'back') this.openWindow = 'system';
      if (result !== null) return true;
    }
    if (this.openWindowValue === 'crafting' && button === 0 && containsPoint(this.layout.craftingResult, point)) {
      const recipeId = this.currentRecipeId();
      if (recipeId !== null && !this.currentRecipeStationLocked()) {
        this.callbacks.craftInventoryRecipe(recipeId, modifiers.shift === true);
      }
      return true;
    }
    if (this.openWindowValue === 'crafting' && button === 0) {
      const rowIndex = this.layout.craftingRecipeRows.findIndex((rect) => containsPoint(rect, point));
      const entry = this.recipeBookEntries()[this.craftingRecipeScroll + rowIndex];
      if (rowIndex >= 0 && entry !== undefined) {
        this.callbacks.ghostFillCraftingRecipe(entry.recipeId);
        return true;
      }
    }
    if (this.isInventoryWindow(this.openWindowValue)) {
      const slot = this.inventoryItemSlotAt(point);
      if (slot !== null) {
        const continuingShiftDrag = this.drag.state.phase !== 'idle' && modifiers.shift === true && this.shiftDrag;
        this.pressedInventorySlot = slot;
        this.shiftDrag = modifiers.shift === true;
        if (!continuingShiftDrag) {
          this.shiftDragTargets = [];
          this.clearShiftDistributionPreview();
        }
        if (this.drag.state.phase === 'idle' && slot.item !== null) {
          this.drag.dispatch({ type: 'grab', source: slot, item: slot.item, half: button === 2 });
          this.dragGrabbedAt = performance.now();
        }
        if (this.drag.state.phase !== 'idle' && this.shiftDrag) {
          const sourceIsTarget = slot.containerId === this.drag.state.source.containerId
            && slot.index === this.drag.state.source.index;
          if (!sourceIsTarget && this.canDropOn(slot) && !this.shiftDragTargets.includes(slot)) {
            this.shiftDragTargets.push(slot);
            this.applyShiftDistributionPreview();
          }
        }
        return true;
      }
    }
    return this.router.routePointer({ kind: 'pointer_down', point, button });
  }

  pointerUp(point: UiPoint, button: number, modifiers: { readonly shift?: boolean } = {}): boolean {
    this.pointer = point;
    if (this.onlinePlayersScrollBar.pointerUp()) return true;
    if (this.pressedInventorySlot !== null) {
      const pressed = this.pressedInventorySlot;
      const target = this.inventoryItemSlotAt(point);
      this.pressedInventorySlot = null;
      if (this.drag.state.phase !== 'idle') {
        const sourceIsTarget = target !== null
          && target.containerId === this.drag.state.source.containerId
          && target.index === this.drag.state.source.index;
        if (this.shiftDrag && this.shiftDragTargets.length > 0) {
          const source = this.drag.state.source;
          this.callbacks.distributeInventoryItem(
            source.containerId, source.index,
            this.shiftDragTargets.map((slot) => ({ container: slot.containerId, index: slot.index })),
            this.drag.state.quantity,
          );
          this.drag.dispatch({ type: 'commit' });
          this.holdingClickStack = false;
        } else if (modifiers.shift && target === pressed) {
          const itemKind = this.drag.state.item.itemKind;
          const key = `${pressed.containerId}:${pressed.index}`;
          const now = performance.now();
          if (this.lastShiftClick !== null && this.lastShiftClick.key === key
            && this.lastShiftClick.itemKind === itemKind && now - this.lastShiftClick.at <= 350) {
            this.callbacks.quickMoveAllInventoryItems(
              itemKind,
              this.quickMoveSourceContainers(pressed.containerId),
              this.quickMoveDestinations(pressed.containerId),
            );
            this.lastShiftClick = null;
          } else {
            this.callbacks.quickMoveInventoryItem(pressed.containerId, pressed.index, this.quickMoveDestinations(pressed.containerId));
            this.lastShiftClick = { key, itemKind, at: now };
          }
          this.drag.dispatch({ type: 'commit' });
          this.holdingClickStack = false;
        } else if (target !== null && !sourceIsTarget) {
          this.drag.dispatch({ type: 'hover', target, accepts: this.canDropOn(target) });
          if (this.canDropOn(target)) {
            const state = this.drag.state;
            this.callbacks.moveInventoryItem({
              fromContainer: state.source.containerId, fromIndex: state.source.index,
              toContainer: target.containerId, toIndex: target.index,
              quantity: button === 2 && this.holdingClickStack ? 1 : state.quantity,
            });
            this.drag.dispatch({ type: 'commit' });
            this.holdingClickStack = false;
          } else {
            this.holdingClickStack = true;
          }
        } else if (sourceIsTarget) {
          // A first click picks a stack up for click-to-place. A return to the
          // source only cancels after a deliberate hold, avoiding accidental
          // cancellation from click jitter or a tiny drag.
          const returningToSource = this.holdingClickStack || this.drag.state.phase === 'hovering';
          if (returningToSource && performance.now() - this.dragGrabbedAt >= 1_200) {
            this.drag.dispatch({ type: 'cancel' });
            this.holdingClickStack = false;
          } else {
            this.holdingClickStack = true;
          }
        } else {
          this.drag.dispatch({ type: 'commit' });
          this.holdingClickStack = false;
        }
      }
      this.shiftDrag = false;
      this.shiftDragTargets = [];
      this.clearShiftDistributionPreview();
      if (target === pressed && pressed.containerId === 'hotbar' && button === 0) this.callbacks.selectHotbar(pressed.index);
      return true;
    }
    const consumed = this.router.routePointer({ kind: 'pointer_up', point, button });
    return this.timeSlider.pointerUp(point)
      || this.masterSlider.pointerUp(point)
      || this.musicSlider.pointerUp(point)
      || this.sfxSlider.pointerUp(point)
      || consumed;
  }

  pointerLeave(): void {
    this.hoveredSlot = null;
    this.pressedInventorySlot = null;
    this.shiftDrag = false;
    this.shiftDragTargets = [];
    this.clearShiftDistributionPreview();
    this.holdingClickStack = false;
    this.drag.dispatch({ type: 'cancel' });
    this.timeSlider.pointerLeave();
    this.masterSlider.pointerLeave();
    this.musicSlider.pointerLeave();
    this.sfxSlider.pointerLeave();
    this.onlinePlayersScrollBar.pointerLeave();
  }

  wheel(point: UiPoint, deltaX: number, deltaY: number): boolean {
    if (this.onlinePlayerListActive && containsPoint(this.onlinePlayerListRect, point) && deltaY !== 0) {
      this.onlinePlayersScrollBar.wheel(deltaY, 1);
      return true;
    }
    if (this.openWindowValue === 'crafting'
      && this.layout.craftingRecipeRows.some((rect) => containsPoint(rect, point)) && deltaY !== 0) {
      const maximum = Math.max(0, this.recipeBookEntries().length - this.layout.craftingRecipeRows.length);
      this.craftingRecipeScroll = Math.max(0, Math.min(maximum, this.craftingRecipeScroll + (deltaY > 0 ? 1 : -1)));
      return true;
    }
    return this.router.routeWheel({ point, deltaX, deltaY });
  }

  draw(context: CanvasRenderingContext2D): void {
    this.drawStatus(context);
    this.drawWeather(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawHotbar(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawVitals(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawTargetVitals(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawEffects(context);
    if (this.openWindowValue === 'help') this.helpBook.draw(context, this.model.width, this.model.height);
    else if (this.openWindowValue) this.drawWindow(context, this.openWindowValue);
    if (this.isInventoryWindow(this.openWindowValue)) this.drawShiftDragTargets(context);
    if (this.isInventoryWindow(this.openWindowValue)) this.drawDraggedItem(context);
    if (this.openWindowValue === null || this.isInventoryWindow(this.openWindowValue)) this.drawTooltip(context);
    this.drawCursor(context);
  }

  drawNameplates(context: CanvasRenderingContext2D, labels: readonly { readonly x: number; readonly y: number; readonly text: string }[]): void {
    for (const label of labels) {
      const text = fitLabel(label.text, 20);
      const rect = nameplateRect(label.x, label.y, text);
      context.save();
      context.fillStyle = 'rgba(0, 0, 0, 0.58)';
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      context.restore();
      drawLabel(context, this.fonts, text, label.x, rect.y + 2, { align: 'center', color: '#fff1cf' });
    }
  }

  drawOnlinePlayers(context: CanvasRenderingContext2D, players: readonly OnlinePlayerListEntry[]): void {
    const maximumRows = Math.max(1, Math.floor((this.model.height - 65) / ONLINE_PLAYER_LIST_ROW_HEIGHT));
    this.onlinePlayersScrollBar.setMetrics(players.length, maximumRows);
    const visiblePlayers = players.slice(
      this.onlinePlayersScrollBar.position,
      this.onlinePlayersScrollBar.position + maximumRows,
    );
    const width = Math.min(230, Math.max(170, this.model.width - 16));
    const height = onlinePlayerListFrameHeight(visiblePlayers.length);
    const rect = {
      x: Math.round((this.model.width - width) / 2),
      y: 12,
      width,
      height,
    };
    this.onlinePlayerListActive = true;
    this.onlinePlayerListRect = rect;
    this.onlinePlayersScrollBar.setBounds({
      x: rect.x + rect.width - 24,
      y: rect.y + ONLINE_PLAYER_LIST_CONTENT_TOP,
      width: 14,
      height: visiblePlayers.length * ONLINE_PLAYER_LIST_ROW_HEIGHT,
    });
    drawUiSkinAsset(context, this.skin.panelWood, rect);
    drawUiSkinAsset(context, this.skin.panelParchment, {
      x: rect.x + 8,
      y: rect.y + 10,
      width: rect.width - 16,
      height: rect.height - 18,
    });
    drawLabel(context, this.fonts, `ONLINE PLAYERS  ${players.length}`, rect.x + rect.width / 2, rect.y + 15, {
      align: 'center',
      color: '#4d2e22',
    });
    visiblePlayers.forEach((player, index) => {
      const rowY = rect.y + ONLINE_PLAYER_LIST_CONTENT_TOP + index * ONLINE_PLAYER_LIST_ROW_HEIGHT;
      context.fillStyle = '#4f8f42';
      context.fillRect(rect.x + 17, rowY + 2, 4, 4);
      const suffix = player.self ? '  (YOU)' : '';
      drawLabel(context, this.fonts, fitLabel(`${player.displayName}${suffix}`, 25), rect.x + 27, rowY, {
        color: player.self ? '#4d2e22' : '#6b4428',
      });
    });
    this.onlinePlayersScrollBar.draw(context);
  }

  private drawStatus(context: CanvasRenderingContext2D): void {
    drawUiSkinAsset(context, this.skin.frameThin, this.layout.status);
    const status = `${this.model.connected ? 'ONLINE' : 'CONNECTING'}  ${this.model.playerCount} FARMER${this.model.playerCount === 1 ? '' : 'S'}`;
    drawLabel(context, this.fonts, status, this.layout.status.x + this.layout.status.width / 2, this.layout.status.y + 7, { align: 'center', color: '#4d2e22' });
  }

  private activeWindowRect(): UiRect {
    if (this.openWindowValue === 'help') return { x: 0, y: 0, width: this.model.width, height: this.model.height };
    if (this.isInventoryWindow(this.openWindowValue)) return this.layout.inventoryWindow;
    if (this.openWindowValue === 'system') return this.layout.systemWindow;
    if (this.openWindowValue === 'settings') return this.layout.settingsWindow;
    if (this.openWindowValue === 'developer') return this.layout.developerWindow;
    return this.layout.window;
  }

  /** Keep the active modal's hit targets in lockstep with its visual state. */
  private syncActiveWindow(): void {
    const activeWindow = this.activeWindowRect();
    const inventoryVisible = this.openWindowValue === 'inventory';
    const craftingVisible = this.openWindowValue === 'crafting';
    const chestVisible = this.openWindowValue === 'chest';
    const barrelVisible = this.openWindowValue === 'barrel';
    const systemVisible = this.openWindowValue === 'system';
    const settingsVisible = this.openWindowValue === 'settings';
    const developerVisible = this.openWindowValue === 'developer' && this.model.canAdministerWorld;
    this.windowNode.setBounds(activeWindow);
    this.windowNode.visible = this.openWindowValue !== null;
    this.closeNode.setBounds({ x: activeWindow.x + activeWindow.width - 17, y: activeWindow.y + 7, width: 16, height: 16 });
    for (const slot of this.inventoryHotbarSlots) slot.visible = inventoryVisible || craftingVisible || chestVisible || barrelVisible;
    this.backpackItemSlots.forEach((slot, index) => {
      slot.visible = inventoryVisible || craftingVisible;
      slot.setBounds(craftingVisible ? this.layout.craftingInventorySlots[index]! : this.layout.backpackSlots[index]!);
    });
    for (const slot of this.equipmentItemSlots) slot.visible = inventoryVisible;
    for (const slot of this.craftingItemSlots) slot.visible = craftingVisible;
    for (const slot of this.chestItemSlots) slot.visible = chestVisible;
    for (const slot of this.barrelItemSlots) slot.visible = barrelVisible;
    for (const node of [this.resumeNode, this.helpNode, this.settingsNode, this.developerNode, this.signOutNode, this.quitNode]) node.visible = systemVisible;
    this.settingsBackNode.visible = settingsVisible;
    this.developerBackNode.visible = developerVisible;
    for (const node of [this.previousDayNode, this.timeSlider.node, this.nextDayNode, this.weatherModeNode, this.windDirectionNode]) {
      node.visible = developerVisible;
    }
    this.timeSlider.enabled = developerVisible;
    for (const slider of [this.masterSlider, this.musicSlider, this.sfxSlider]) {
      slider.node.visible = settingsVisible;
      slider.enabled = settingsVisible;
    }
  }

  private drawWeather(context: CanvasRenderingContext2D): void {
    const { weather } = this.layout;
    drawUiSkinAsset(context, this.skin.frameThin, weather);
    drawLabel(context, this.fonts, `${this.model.dateLabel}  ${this.model.timeLabel}`, weather.x + 10, weather.y + 8, { color: '#4d2e22' });
    this.currencyDisplay.draw(context, this.model.balanceBronze ?? 0n, weather.x + weather.width - 9, weather.y + 8, {
      size: 'small', align: 'right', color: '#5f3b24', includeZero: true,
    });
  }

  private drawDeveloper(context: CanvasRenderingContext2D): void {
    const { developerWindow, previousDayButton, nextDayButton, weatherButton, windDirectionButton } = this.layout;
    drawLabel(context, this.fonts, 'WORLD TIME', developerWindow.x + 30, developerWindow.y + 35, { color: '#6b4428' });
    drawUiSkinAsset(context, this.skin.button, previousDayButton, 'idle');
    drawLabel(context, this.fonts, '-DAY', previousDayButton.x + previousDayButton.width / 2, previousDayButton.y + 6, { align: 'center', color: '#5f3b24' });
    this.timeSlider.draw(context);
    drawUiSkinAsset(context, this.skin.button, nextDayButton, 'idle');
    drawLabel(context, this.fonts, '+DAY', nextDayButton.x + nextDayButton.width / 2, nextDayButton.y + 6, { align: 'center', color: '#5f3b24' });
    drawUiSkinAsset(context, this.model.raining ? this.skin.buttonConfirm : this.skin.button, weatherButton, 'idle');
    drawLabel(context, this.fonts, `WEATHER ${this.model.weatherMode.toUpperCase()}`, weatherButton.x + weatherButton.width / 2, weatherButton.y + 7, {
      align: 'center', color: this.model.raining ? '#fff2d0' : '#5f3b24',
    });
    drawUiSkinAsset(context, this.skin.button, windDirectionButton, 'idle');
    const directionMode = (this.model.windDirectionMode ?? 'auto').toUpperCase();
    const effectiveDirection = directionMode === 'AUTO' && this.model.windDirectionLabel
      ? ` (${this.model.windDirectionLabel})` : '';
    drawLabel(context, this.fonts, `WIND DIR ${directionMode}${effectiveDirection}`, windDirectionButton.x + windDirectionButton.width / 2, windDirectionButton.y + 7, {
      align: 'center', color: '#5f3b24',
    });
    drawLabel(context, this.fonts, 'OWNER-AUTHORIZED SERVER CONTROLS', developerWindow.x + developerWindow.width / 2, developerWindow.y + 155, { align: 'center', color: '#8c5d3a' });
    drawLabel(context, this.fonts, 'ADDITIONAL DEVELOPER TOOLS WILL APPEAR HERE.', developerWindow.x + developerWindow.width / 2, developerWindow.y + 168, { align: 'center', color: '#8c5d3a' });
    drawUiSkinAsset(context, this.skin.button, this.layout.developerBackButton, 'idle');
    drawLabel(context, this.fonts, 'BACK', this.layout.developerBackButton.x + this.layout.developerBackButton.width / 2, this.layout.developerBackButton.y + 5, {
      align: 'center', color: '#5f3b24',
    });
  }

  private drawHotbar(context: CanvasRenderingContext2D): void {
    const itemBySlot = new Map(this.model.inventory.map((item) => [item.slot, item]));
    for (let slot = 0; slot < HOTBAR_SLOTS; slot += 1) {
      const rect = this.layout.slots[slot]!;
      drawUiSkinAsset(context, this.skin.slot, rect, 'idle');
      const item = itemBySlot.get(slot);
      const asset = item ? this.itemArt[item.itemKind as keyof OverworldUiItemArt] : undefined;
      if (asset && item) this.drawItemArtwork(context, rect, item.itemKind, asset);
      drawLabel(context, this.fonts, String(slot + 1), rect.x + 3, rect.y + 3, { color: '#51351f' });
      if ((item?.quantity ?? 0) > 1) {
        const stackLabel = slotStackLabelPosition(rect);
        drawOutlinedPixelText(context, this.fonts, String(item!.quantity), stackLabel.x, stackLabel.y, {
          align: 'right', color: '#3f2832', outlineColor: '#f8ead0',
        });
      }
      if (item) this.drawDurabilityBar(context, rect, item.itemKind, item.durability);
      if (slot === this.model.selectedSlot || slot === this.hoveredSlot) {
        const selector = slot === this.model.selectedSlot ? this.skin.selectorConfirm : this.skin.selectorNeutral;
        drawUiSkinNatural(context, selector, rect.x - 10, rect.y - 9, 'idle');
      }
    }
  }

  private drawVitals(context: CanvasRenderingContext2D): void {
    const vitals = this.model.vitals;
    if (!vitals) return;
    this.playerResourceFrame.draw(
      context, vitals.playerId, this.layout.vitals.x, this.layout.vitals.y,
      this.model.vigourDenied, HUD_RESOURCE_FRAME_SCALE,
    );
  }

  private drawTargetVitals(context: CanvasRenderingContext2D): void {
    const target = this.model.targetVitals;
    if (!target) return;
    this.targetResourceFrame.draw(
      context, target.targetId, this.layout.targetVitals.x, this.layout.targetVitals.y,
      false, HUD_RESOURCE_FRAME_SCALE, true,
    );
    drawOutlinedPixelText(
      context, this.fonts, fitLabel(target.displayName.toUpperCase(), 18),
      this.layout.targetVitals.x + this.layout.targetVitals.width,
      this.layout.targetVitals.y - 2,
      { align: 'right', color: '#fff1cf', outlineColor: '#3f2832' },
    );
  }

  private effectRects(): readonly UiRect[] {
    return (this.model.effects ?? []).map((_, index) => ({
      x: this.layout.vitals.x + this.layout.vitals.width + 4 + index * 13,
      y: this.layout.vitals.y + this.layout.vitals.height - 12,
      width: 12,
      height: 12,
    }));
  }

  private drawEffects(context: CanvasRenderingContext2D): void {
    const effects = this.model.effects ?? [];
    const rects = this.effectRects();
    effects.forEach((effect, index) => {
      const rect = rects[index]!;
      const finalTenth = effect.durationTicks > 0 && effect.remainingTicks <= effect.durationTicks / 10;
      const blinkHidden = finalTenth && Math.floor(effect.remainingTicks / 5) % 2 === 0;
      if (blinkHidden) return;
      const asset = effect.effectKind === 'winded' ? this.skin.effectWinded
        : effect.effectKind === 'orchard_tea' ? this.skin.effectOrchardTea
          : this.skin.effectWellRested;
      drawUiSkinAsset(context, asset, rect);
    });
  }

  private drawDurabilityBar(
    context: CanvasRenderingContext2D,
    rect: UiRect,
    itemKind: string,
    durability?: number,
  ): void {
    const fraction = durabilityFraction(itemKind, durability);
    if (fraction === null) return;
    const track = slotDurabilityBarRect(rect);
    context.fillStyle = '#3f2832';
    context.fillRect(track.x, track.y, track.width, track.height);
    const width = Math.round(track.width * fraction);
    if (width <= 0) {
      context.fillStyle = '#c34242'; context.fillRect(track.x, track.y, 1, track.height);
      return;
    }
    const fill = fraction > 0.5 ? this.skin.barGreen : fraction > 0.2 ? this.skin.barGold : this.skin.barRed;
    drawUiSkinAsset(context, fill, { ...track, width });
  }

  private drawTooltip(context: CanvasRenderingContext2D): void {
    const text = this.tooltipText();
    if (!text) return;
    const width = Math.min(this.model.width - 12, Math.max(104, measurePixelText(text) + 16));
    const rect = { ...this.layout.tooltip, x: Math.round((this.model.width - width) / 2), width };
    drawUiLabelPlate(context, this.skin, rect);
    drawLabel(context, this.fonts, fitLabel(text, 44), rect.x + rect.width / 2, rect.y + 4, { align: 'center', color: '#5f3b24' });
  }

  private drawShiftDragTargets(context: CanvasRenderingContext2D): void {
    if (!this.shiftDrag) return;
    for (const slot of this.shiftDragTargets) {
      if (!slot.visible || !slot.enabled) continue;
      drawUiSkinNatural(context, this.skin.selectorNeutral, slot.bounds.x - 10, slot.bounds.y - 9, 'idle');
    }
  }

  tooltipText(): string | null {
    if (this.openWindowValue === 'crafting'
      && containsPoint(this.layout.craftingResult, this.pointer)
      && this.currentRecipeStationLocked()) return 'REQUIRES A WORKBENCH WITHIN 2 TILES';
    const item = this.hoveredItem();
    if (item !== null) {
      const label = hotbarItemName(item.itemKind) ?? item.itemKind.replaceAll('_', ' ').toUpperCase();
      const durability = toolDurabilityDefinition(item.itemKind);
      return durability === null ? label : `${label}  ${item.durability ?? 0}/${durability.maximum}`;
    }
    const effectIndex = this.effectRects().findIndex((rect) => containsPoint(rect, this.pointer));
    const effect = (this.model.effects ?? [])[effectIndex];
    if (effect) return `${effect.name.toUpperCase()}  ${Math.ceil(effect.remainingTicks / 20)}S`;
    if (this.openWindowValue === null && this.model.vitals) {
      const resource = this.playerResourceFrame.resourceAtPoint(
        this.layout.vitals.x, this.layout.vitals.y, this.pointer, HUD_RESOURCE_FRAME_SCALE,
      );
      if (resource !== null) {
        const entries = {
          health: ['HEALTH', this.model.vitals.health, this.model.vitals.maxHealth],
          mana: ['MANA', this.model.vitals.mana, this.model.vitals.maxMana],
          vigour: ['VIGOUR', this.model.vitals.vigour, this.model.vitals.maxVigour],
        } as const;
        const [name, current, maximum] = entries[resource];
        return `${name}  ${(current / 100).toFixed(1)}/${(maximum / 100).toFixed(1)}`;
      }
    }
    if (this.openWindowValue === null && this.model.targetVitals) {
      const target = this.model.targetVitals;
      const resource = this.targetResourceFrame.resourceAtPoint(
        this.layout.targetVitals.x, this.layout.targetVitals.y, this.pointer,
        HUD_RESOURCE_FRAME_SCALE, true,
      );
      const values = resource === 'health' ? ['HEALTH', target.health, target.maxHealth] as const
        : resource === 'mana' && target.mana !== undefined && target.maxMana !== undefined
          ? ['MANA', target.mana, target.maxMana] as const
          : resource === 'vigour' && target.vigour !== undefined && target.maxVigour !== undefined
            ? ['VIGOUR', target.vigour, target.maxVigour] as const : null;
      if (values !== null) {
        const [name, current, maximum] = values;
        return `${target.displayName.toUpperCase()}  ${name}  ${Math.round(current)}/${Math.round(maximum)}`;
      }
    }
    return this.openWindowValue === null ? this.model.prompt ?? this.model.toast : null;
  }

  private hoveredItem(): ItemStack | null {
    if (this.isInventoryWindow(this.openWindowValue)) {
      if (this.openWindowValue === 'crafting' && containsPoint(this.layout.craftingResult, this.pointer)) {
        return craftingRecipeOutput(this.currentRecipeId() ?? '') ?? null;
      }
      return this.visibleItemSlots()
        .find((slot) => slot.node.contains(this.pointer))?.item ?? null;
    }
    if (this.hoveredSlot === null) return null;
    const hovered = this.model.inventory.find((item) => item.slot === this.hoveredSlot);
    return hovered && hovered.itemKind !== 'empty' && hovered.quantity > 0 ? hovered : null;
  }

  private drawWindow(context: CanvasRenderingContext2D, window: OverworldWindow): void {
    const rect = this.activeWindowRect();
    drawUiSkinAsset(context, this.skin.panelWood, rect);
    drawUiSkinAsset(context, this.skin.panelParchment, { x: rect.x + 10, y: rect.y + 13, width: rect.width - 20, height: rect.height - 23 });
    const title = window === 'inventory' || window === 'pack' ? 'INVENTORY'
      : window === 'crafting' ? 'CRAFTING'
        : window === 'chest' ? 'CHEST'
          : window === 'barrel' ? 'BARREL'
          : window === 'cooking' ? 'COOKING'
          : window === 'settings' ? 'SETTINGS'
            : window === 'developer' ? 'DEVELOPER TOOLS' : 'MENU';
    this.windowRibbon.draw(context, title, rect.x + rect.width / 2, rect.y - 5);
    drawUiSkinAsset(context, this.skin.buttonDeny, this.closeNode.bounds, 'idle');
    drawLabel(context, this.fonts, 'X', this.closeNode.bounds.x + 8, this.closeNode.bounds.y + 5, { align: 'center', color: '#fff2d0' });
    if (window === 'inventory' || window === 'pack') this.drawInventory(context, rect);
    else if (window === 'crafting') this.drawCrafting(context, rect);
    else if (window === 'chest') this.drawChest(context, rect);
    else if (window === 'barrel') this.drawBarrel(context, rect);
    else if (window === 'cooking') this.drawCooking(context, rect);
    else if (window === 'settings') this.drawSettings(context);
    else if (window === 'developer') this.drawDeveloper(context);
    else this.drawSystemMenu(context);
  }

  private drawInventory(context: CanvasRenderingContext2D, rect: UiRect): void {
    drawLabel(context, this.fonts, 'EQUIPMENT', rect.x + 21, rect.y + 35, { color: '#6b4428' });
    drawLabel(context, this.fonts, this.model.hasBackpack ? 'BACKPACK - 20 SLOTS' : 'INVENTORY - 8 SLOTS', rect.x + rect.width - 183, rect.y + 35, {
      color: '#6b4428',
    });
    this.equipmentItemSlots.forEach((slot, index) => {
      const equipmentSlot = slot.bounds;
      drawUiSkinAsset(context, this.skin.slot, equipmentSlot, 'idle');
      if (slot.item === null) drawUiSkinNatural(
          context,
          this.skin.equipmentSlotIcons,
          equipmentSlot.x + Math.round((equipmentSlot.width - 16) / 2),
          equipmentSlot.y + Math.round((equipmentSlot.height - 16) / 2) - 1,
          EQUIPMENT_SLOT_KINDS[index],
        );
      else this.drawInventoryItem(context, equipmentSlot, slot.item.itemKind, slot.item.quantity, slot.item.durability);
    });
    for (const slot of this.backpackItemSlots) {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, slot.enabled ? 'idle' : 'disabled');
      if (slot.enabled && slot.item !== null) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability);
    }
    context.fillStyle = '#9d6843';
    context.fillRect(rect.x + 17, rect.y + rect.height - 61, rect.width - 34, 1);
    drawLabel(context, this.fonts, 'HOTBAR', rect.x + 21, rect.y + rect.height - 59, { color: '#6b4428' });
    this.inventoryHotbarSlots.forEach((slot, index) => {
      const slotRect = slot.bounds;
      drawUiSkinAsset(context, this.skin.slot, slotRect, 'idle');
      const item = slot.item;
      if (item) this.drawInventoryItem(context, slotRect, item.itemKind, item.quantity, item.durability);
      drawLabel(context, this.fonts, String(index + 1), slotRect.x + 3, slotRect.y + 3, { color: '#51351f' });
      if (index === this.model.selectedSlot || index === this.hoveredSlot) {
        const selector = index === this.model.selectedSlot ? this.skin.selectorConfirm : this.skin.selectorNeutral;
        drawUiSkinNatural(context, selector, slotRect.x - 10, slotRect.y - 9, 'idle');
      }
    });
  }

  private inventoryItemSlotAt(point: UiPoint): ItemSlot | null {
    const visible = this.visibleItemSlots();
    return visible
      .find((slot) => slot.node.contains(point) && slot.enabled) ?? null;
  }

  private canDropOn(target: ItemSlot): boolean {
    const state = this.drag.state;
    if (state.phase === 'idle' || state.phase === 'awaiting_commit' || !target.accepts(state.item.itemKind)) return false;
    const targetItem = target.item;
    if (targetItem === null) return true;
    if (targetItem.itemKind === state.item.itemKind) return targetItem.quantity < (maxStackFor(targetItem.itemKind) ?? 0);
    const source = this.visibleItemSlots()
      .find((slot) => slot.containerId === state.source.containerId && slot.index === state.source.index);
    return source?.accepts(targetItem.itemKind) ?? false;
  }

  private drawInventoryItem(context: CanvasRenderingContext2D, rect: UiRect, itemKind: string, quantity: number, durability?: number): void {
    const asset = this.itemArt[itemKind as keyof OverworldUiItemArt] ?? this.itemArt['missing'];
    if (asset) this.drawItemArtwork(context, rect, itemKind, asset);
    if (quantity > 1) {
      const stackLabel = slotStackLabelPosition(rect);
      drawOutlinedPixelText(context, this.fonts, String(quantity), stackLabel.x, stackLabel.y, {
        align: 'right', color: '#3f2832', outlineColor: '#f8ead0',
      });
    }
    this.drawDurabilityBar(context, rect, itemKind, durability);
  }

  /** Inventory art is fitted without stretching so tall authored props such as
   * torches and lanterns remain crisp while the closed chest tile becomes the
   * expected compact slot icon. */
  private drawItemArtwork(context: CanvasRenderingContext2D, rect: UiRect, itemKind: string, asset: LoadedAsset): void {
    const frame = uiAssetFrame(asset, itemIconAnimation(itemKind));
    if (!frame) return;
    const scale = Math.min(16 / frame.width, 16 / frame.height);
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    const x = Math.round(rect.x + 6 + (16 - width) / 2);
    const y = Math.round(rect.y + 7 + (16 - height) / 2);
    context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, x, y, width, height);
  }

  private drawDraggedItem(context: CanvasRenderingContext2D): void {
    const state = this.drag.state;
    if (state.phase === 'idle') return;
    const destination = { x: this.pointer.x - 14, y: this.pointer.y - 15, width: 28, height: 31 };
    drawUiSkinAsset(context, this.skin.slot, destination, state.phase === 'hovering' && !state.accepts ? 'disabled' : 'idle');
    const quantity = this.shiftDragRemaining ?? state.quantity;
    if (quantity > 0) this.drawInventoryItem(context, destination, state.item.itemKind, quantity, state.item.durability);
  }

  private drawSystemMenu(context: CanvasRenderingContext2D): void {
    const buttons = [
      [this.layout.resumeButton, 'RESUME', this.skin.buttonConfirm],
      [this.layout.helpButton, 'HELP', this.skin.button],
      [this.layout.settingsButton, 'SETTINGS', this.skin.button],
      [this.layout.developerButton, 'DEVELOPER', this.model.canAdministerWorld ? this.skin.buttonConfirm : this.skin.button],
      [this.layout.signOutButton, 'SIGN OUT', this.skin.buttonDeny],
      [this.layout.quitButton, 'QUIT TO TITLE', this.skin.button],
    ] as const;
    for (const [rect, label, asset] of buttons) {
      const disabled = label === 'DEVELOPER' && !this.model.canAdministerWorld;
      drawUiSkinAsset(context, asset, rect, disabled ? 'disabled' : 'idle');
      drawLabel(context, this.fonts, label, rect.x + rect.width / 2, rect.y + 6, {
        align: 'center', color: disabled ? '#8c6c54' : asset === this.skin.button ? '#5f3b24' : '#fff2d0',
      });
    }
  }

  private drawSettings(context: CanvasRenderingContext2D): void {
    const rows = [
      ['MASTER', this.masterSlider, this.model.audioVolumes.master],
      ['MUSIC', this.musicSlider, this.model.audioVolumes.music],
      ['SFX', this.sfxSlider, this.model.audioVolumes.sfx],
    ] as const;
    for (const [label, slider, value] of rows) {
      drawLabel(context, this.fonts, label, slider.node.bounds.x - 12, slider.node.bounds.y + 4, { align: 'right', color: '#6b4428' });
      slider.draw(context);
      drawLabel(context, this.fonts, `${Math.round(value * 100)}%`, slider.node.bounds.x + slider.node.bounds.width + 5, slider.node.bounds.y + 4, { color: '#8c5d3a' });
    }
    drawUiSkinAsset(context, this.skin.button, this.layout.settingsBackButton, 'idle');
    drawLabel(context, this.fonts, 'BACK', this.layout.settingsBackButton.x + this.layout.settingsBackButton.width / 2, this.layout.settingsBackButton.y + 5, {
      align: 'center', color: '#5f3b24',
    });
  }

  private drawCooking(context: CanvasRenderingContext2D, rect: UiRect): void {
    drawLabel(context, this.fonts, 'MARLOW\'S CAMPFIRE', rect.x + rect.width / 2, rect.y + 52, {
      align: 'center', color: '#6b4428', font: 'header',
    });
    drawLabel(context, this.fonts, 'THE FIRE IS WARM AND READY.', rect.x + rect.width / 2, rect.y + 82, {
      align: 'center', color: '#6b4428',
    });
    drawLabel(context, this.fonts, 'COOKING RECIPES ARE COMING SOON.', rect.x + rect.width / 2, rect.y + 100, {
      align: 'center', color: '#8c5d3a',
    });
  }

  private drawCrafting(context: CanvasRenderingContext2D, rect: UiRect): void {
    drawLabel(context, this.fonts, 'CRAFTING GRID', rect.x + 20, rect.y + 35, { color: '#6b4428' });
    for (const slot of this.craftingItemSlots) {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, 'idle');
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability);
    }
    drawLabel(context, this.fonts, '>', rect.x + 128, rect.y + 88, { align: 'center', color: '#6b4428', font: 'header' });
    const stationLocked = this.currentRecipeStationLocked();
    drawUiSkinAsset(context, this.skin.slot, this.layout.craftingResult, this.currentRecipeId() === null || stationLocked ? 'disabled' : 'idle');
    const output = craftingRecipeOutput(this.currentRecipeId() ?? '');
    if (output) this.drawInventoryItem(context, this.layout.craftingResult, output.itemKind, output.quantity);
    if (stationLocked) {
      context.fillStyle = 'rgba(47, 34, 39, 0.72)';
      context.fillRect(this.layout.craftingResult.x + 3, this.layout.craftingResult.y + 3, this.layout.craftingResult.width - 6, this.layout.craftingResult.height - 6);
      drawLabel(context, this.fonts, 'LOCK', this.layout.craftingResult.x + this.layout.craftingResult.width / 2, this.layout.craftingResult.y + 12, { align: 'center', color: '#f7dca0' });
    }
    drawLabel(context, this.fonts, output ? 'TAKE' : 'RECIPE', rect.x + 158, rect.y + 120, { align: 'center', color: '#6b4428' });
    drawLabel(context, this.fonts, 'RECIPES', rect.x + 182, rect.y + 35, { color: '#6b4428' });
    const entries = this.recipeBookEntries();
    this.layout.craftingRecipeRows.forEach((row, index) => {
      const entry = entries[this.craftingRecipeScroll + index];
      if (entry === undefined) return;
      context.fillStyle = entry.missingIngredients ? 'rgba(104, 82, 71, 0.25)' : 'rgba(239, 213, 163, 0.5)';
      context.fillRect(row.x, row.y, row.width, row.height);
      const name = itemDefinition(entry.outputKind)?.displayName ?? entry.outputKind;
      drawLabel(context, this.fonts, fitLabel(`${entry.outputQuantity} ${name.toUpperCase()}`, 14), row.x + 3, row.y + 4, {
        color: entry.missingIngredients ? '#8e8177' : '#5f3b24',
      });
    });
    const inventoryLabelX = rect.x + rect.width - 183;
    drawLabel(context, this.fonts, this.model.hasBackpack ? 'BACKPACK' : 'INVENTORY', inventoryLabelX, rect.y + 35, { color: '#6b4428' });
    for (const slot of this.backpackItemSlots) {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, slot.enabled ? 'idle' : 'disabled');
      if (slot.enabled && slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability);
    }
    this.drawWindowHotbar(context, rect);
  }

  private drawChest(context: CanvasRenderingContext2D, rect: UiRect): void {
    drawLabel(context, this.fonts, 'STORAGE', rect.x + 40, rect.y + 35, { color: '#6b4428' });
    for (const slot of this.chestItemSlots) {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, 'idle');
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability);
    }
    this.drawWindowHotbar(context, rect);
  }

  private drawWindowHotbar(context: CanvasRenderingContext2D, rect: UiRect): void {
    context.fillStyle = '#9d6843'; context.fillRect(rect.x + 17, rect.y + rect.height - 61, rect.width - 34, 1);
    drawLabel(context, this.fonts, 'HOTBAR', rect.x + 21, rect.y + rect.height - 59, { color: '#6b4428' });
    this.inventoryHotbarSlots.forEach((slot, index) => {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, 'idle');
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability);
      drawLabel(context, this.fonts, String(index + 1), slot.bounds.x + 3, slot.bounds.y + 3, { color: '#51351f' });
    });
  }

  private isInventoryWindow(window: OverworldWindow | null): boolean {
    return window === 'inventory' || window === 'pack' || window === 'crafting' || window === 'chest' || window === 'barrel';
  }

  private visibleItemSlots(): ItemSlot[] {
    if (this.openWindowValue === 'inventory') return [...this.equipmentItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'crafting') return [...this.craftingItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'chest') return [...this.chestItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'barrel') return [...this.barrelItemSlots, ...this.inventoryHotbarSlots];
    return [];
  }

  private currentRecipeId(): string | null {
    return matchingRecipeId({ id: 'crafting', capacity: 9, slots: this.craftingItemSlots.map((slot) => slot.item) });
  }

  private currentRecipeStationLocked(): boolean {
    const recipe = recipeDefinition(this.currentRecipeId() ?? '');
    return recipe?.station !== undefined
      && !(this.model.nearbyCraftingStations ?? []).includes(recipe.station);
  }

  private recipeBookEntries() {
    return craftingRecipeBookEntries(this.model.nearbyCraftingStations ?? [], this.model.inventory);
  }

  private quickMoveDestinations(source: string): readonly string[] {
    if (source === 'chest') return ['hotbar', 'backpack'];
    if (this.openWindowValue === 'chest') return ['chest'];
    if (source === 'placeable') return [];
    if (this.openWindowValue === 'barrel') return [];
    if (this.openWindowValue === 'crafting') return source === 'crafting' ? ['hotbar', 'backpack'] : ['crafting'];
    if (source === 'hotbar') return ['backpack'];
    return ['hotbar'];
  }

  private quickMoveSourceContainers(source: string): readonly string[] {
    if (source === 'chest') return ['chest'];
    if (source === 'crafting') return ['crafting'];
    if (source === 'equipment') return ['equipment'];
    if (source === 'placeable') return ['placeable'];
    return ['hotbar', 'backpack'];
  }

  /** Applies a client-only live preview while the authoritative distribution
   * remains one reducer call on release. This gives immediate slot counts
   * without exposing the gesture to stale-snapshot network races. */
  private applyShiftDistributionPreview(): void {
    const state = this.drag.state;
    if (state.phase === 'idle' || state.phase === 'awaiting_commit' || this.shiftDragTargets.length === 0) return;
    const slots = this.visibleItemSlots();
    if (this.shiftDragOriginalItems.size === 0) {
      for (const slot of slots) this.shiftDragOriginalItems.set(slot, slot.item === null ? null : { ...slot.item });
    }
    const grouped = new Map<string, ItemSlot[]>();
    for (const slot of slots) grouped.set(slot.containerId, [...(grouped.get(slot.containerId) ?? []), slot]);
    const containers: Record<string, ContainerSnapshot> = {};
    for (const [id, containerSlots] of grouped) {
      const capacity = Math.max(...containerSlots.map((slot) => slot.index)) + 1;
      containers[id] = {
        id,
        capacity,
        slots: Array.from({ length: capacity }, (_, index) => {
          const slot = containerSlots.find((candidate) => candidate.index === index);
          return slot === undefined ? null : this.shiftDragOriginalItems.get(slot) ?? null;
        }),
      };
    }
    const preview = distributeItemStack(containers, {
      fromContainer: state.source.containerId,
      fromIndex: state.source.index,
      quantity: state.quantity,
      targets: this.shiftDragTargets.map((slot) => ({ container: slot.containerId, index: slot.index })),
    });
    if (!preview.ok) return;
    for (const slot of slots) slot.item = preview.containers[slot.containerId]?.slots[slot.index] ?? null;
    this.shiftDragRemaining = preview.containers[state.source.containerId]?.slots[state.source.index]?.quantity ?? 0;
  }

  private clearShiftDistributionPreview(): void {
    for (const [slot, item] of this.shiftDragOriginalItems) slot.item = item;
    this.shiftDragOriginalItems.clear();
    this.shiftDragRemaining = null;
  }

  private drawBarrel(context: CanvasRenderingContext2D, rect: UiRect): void {
    drawLabel(context, this.fonts, '8-SLOT STORAGE', rect.x + rect.width / 2, rect.y + 35, { align: 'center', color: '#6b4428' });
    for (const slot of this.barrelItemSlots) {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, 'idle');
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability);
    }
    this.drawWindowHotbar(context, rect);
  }

  private drawCursor(context: CanvasRenderingContext2D): void {
    if (this.pointer.x < 0 || this.pointer.y < 0) return;
    drawUiSkinNatural(context, this.skin.cursor, this.pointer.x, this.pointer.y, 'idle');
    const elapsed = performance.now() - this.clickStartedAt;
    if (elapsed < 280) drawUiSkinNatural(context, this.skin.cursorClick, this.pointer.x - 8, this.pointer.y - 8, 'click', Math.min(3, Math.floor(elapsed / 70)));
  }
}
