import { BACKPACK_SLOT_COUNT, BACKPACK_SLOT_OFFSET, CHEST_STORAGE_CAPACITY, CHEST_STORAGE_COLUMNS, CRAFTING_SLOT_COUNT, CRAFTING_SLOT_OFFSET, EQUIPMENT_SLOT_OFFSET, HOTBAR_SLOT_COUNT, clickContainerSlot, craftingRecipeOutput, durabilityFraction, hotbarSlotForInputCode, hotbarSlotLabel, itemDefinition, itemStacksCompatible, matchingRecipeId, maxStackFor, pickupAllToCursor, quickCraftCursorStack, quickMoveAllMatchingStacks, recipeDefinition, toolDurabilityDefinition, type ContainerSnapshot, type CraftingStation, type ItemStack, type MoonPhase, type MoveItemRequest, type WeatherMode, type WindDirectionMode } from '@orchard/sim';
import type { LoadedAsset } from '../render/assets.js';
import { drawOutlinedPixelText, drawPixelText, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import { hotbarItemName } from '../survival-ui.js';
import { craftingRecipeBookEntries } from './recipe-book.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { UiInputRouter } from './input-router.js';
import { Slider } from './slider.js';
import { BUTTON_HEIGHT, CanvasButton, drawButton } from './button.js';
import { Toggle } from './toggle.js';
import { Ribbon, STACKED_RIBBON_HEIGHT } from './ribbon.js';
import { EQUIPMENT_SLOT_RESTRICTIONS, ItemSlot } from './item-slot.js';
import { HelpBook } from './help-book.js';
import { ScrollBar } from './scrollbar.js';
import {
  StorageFrameResizeController,
  drawStorageFrameChrome,
  drawStorageResizeHandles,
  layoutStorageFrame,
  type StorageFrameLayout,
  type StorageFrameSpec,
} from './storage-frame.js';
import { CurrencyDisplay } from './currency-display.js';
import { PlayerResourceFrame } from './player-resource-frame.js';
import { pwaUpdateLabel, type PwaUpdateStatus } from '../pwa.js';
import { drawCanvasTextInput } from './canvas-text-input.js';
import {
  drawUiLabelPlate,
  drawUiSkinAsset,
  drawUiSkinNatural,
  uiAssetFrame,
  type UiSkin,
} from './skin.js';
import { widget, type WidgetNode } from './widget.js';
import { CharacterScreen, progressionWindowRect, type CharacterScreenModel } from './character-screen.js';
import { SkillTreeUi, type SkillTreeModel } from './skill-tree-ui.js';
import { QuestLog, type QuestLogEntry } from './quest-log.js';
import { SKILL_TRACKS, type Direction, type PlayerAppearanceSelection, type SkillTrack } from '@orchard/sim';

export type OverworldWindow = 'inventory' | 'pack' | 'crafting' | 'chest' | 'barrel' | 'cooking' | 'character' | 'skills' | 'quests' | 'system' | 'settings' | 'developer' | 'help';

export interface OverworldUiInventorySlot {
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
  readonly lit?: boolean;
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
    | { readonly kind: 'npc'; readonly npcKind: string; readonly species?: string; readonly variant: number }
    | { readonly kind: 'combat_target' };
}

export interface OverworldUiEffect {
  readonly effectKind: string; readonly name: string; readonly stacks: number;
  readonly remainingTicks: number; readonly durationTicks: number;
}

export interface OnlinePlayerListEntry {
  readonly displayName: string;
  readonly self: boolean;
}

export const MOON_PHASE_LABELS: Readonly<Record<MoonPhase, string>> = {
  full_moon: 'Full Moon',
  waning_gibbous: 'Waning Gibbous',
  last_quarter: 'Last Quarter',
  waning_crescent: 'Waning Crescent',
  new_moon: 'New Moon',
  waxing_crescent: 'Waxing Crescent',
  first_quarter: 'First Quarter',
  waxing_gibbous: 'Waxing Gibbous',
};

/** 0 outside, 1 shadow, 2 illuminated. Waxing grows on the right; waning
 * recedes on the left, matching docs/27 §7. */
export function moonPhasePixel(phase: MoonPhase, x: number, y: number): 0 | 1 | 2 {
  const dx = x - 3;
  const dy = y - 3;
  if (dx * dx + dy * dy > 10) return 0;
  let lit = false;
  if (phase === 'full_moon') lit = true;
  else if (phase === 'waxing_gibbous') lit = x >= 1;
  else if (phase === 'first_quarter') lit = x >= 3;
  else if (phase === 'waxing_crescent') lit = x >= 5 || (x === 4 && Math.abs(dy) <= 1);
  else if (phase === 'waning_gibbous') lit = x <= 5;
  else if (phase === 'last_quarter') lit = x <= 3;
  else if (phase === 'waning_crescent') lit = x <= 1 || (x === 2 && Math.abs(dy) <= 1);
  return lit ? 2 : 1;
}

export interface OverworldUiModel {
  readonly width: number;
  readonly height: number;
  readonly connected: boolean;
  readonly touchControls?: boolean;
  readonly playerCount: number;
  readonly onlinePlayersVisible?: boolean;
  readonly zoneName?: string;
  readonly selectedSlot: number;
  readonly balanceBronze?: bigint;
  readonly inventory: readonly OverworldUiInventorySlot[];
  readonly cursorStack?: ItemStack | null;
  readonly vitals?: OverworldUiVitals;
  readonly targetVitals?: OverworldUiTargetVitals;
  readonly effects?: readonly OverworldUiEffect[];
  readonly vigourDenied?: boolean;
  readonly openChestInventory?: readonly OverworldUiInventorySlot[];
  readonly openPlaceableInventory?: readonly OverworldUiInventorySlot[];
  readonly hasBackpack: boolean;
  readonly backpackSlotCapacity?: number;
  readonly audioVolumes: { readonly master: number; readonly music: number; readonly sfx: number };
  readonly audioBackground?: { readonly music: boolean; readonly sounds: boolean };
  readonly canAdministerWorld: boolean;
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly timeFraction: number;
  readonly moonPhase?: MoonPhase;
  readonly moonIlluminationPerMille?: number;
  readonly raining: boolean;
  readonly weatherMode: WeatherMode;
  readonly windDirectionMode?: WindDirectionMode;
  readonly windDirectionLabel?: string;
  readonly lightingEffectsDisabled?: boolean;
  readonly cellarOrePreview?: boolean;
  readonly fullscreen?: boolean;
  readonly pwaUpdateStatus?: PwaUpdateStatus;
  readonly prompt: string | null;
  readonly toast: string | null;
  readonly toastKind?: 'info' | 'success' | 'failure';
  readonly nearbyCraftingStations?: readonly CraftingStation[];
  readonly character?: CharacterScreenModel;
  readonly skills?: SkillTreeModel;
  readonly quests?: readonly QuestLogEntry[];
  /** Explorer-gated overlay capability. The player marker remains visible. */
  readonly minimapTrackingEnabled?: boolean;
}

export type MinimapDrawer = (
  context: CanvasRenderingContext2D,
  rect: UiRect,
  pixelsPerTile: number,
  trackingEnabled: boolean,
) => void;

export interface OverworldUiCallbacks {
  readonly selectHotbar: (slot: number) => void;
  readonly setTimeFraction: (fraction: number) => void;
  readonly shiftDay: (days: number) => void;
  readonly cycleWeather: () => void;
  readonly cycleWindDirection: () => void;
  readonly toggleLightingEffects: () => void;
  readonly toggleCellarOrePreview?: () => void;
  readonly resetMyQuestProgress: () => void;
  readonly setQuestPinned: (questId: string, pinned: boolean) => void;
  readonly abandonQuest: (questId: string) => void;
  readonly setAppearance?: (appearance: PlayerAppearanceSelection) => void;
  readonly purchaseSkillNode?: (nodeId: string) => void;
  readonly resetSkillTree?: (track: SkillTrack) => void;
  readonly grantDebugSkillPoints?: (track: SkillTrack, points: number) => void;
  readonly adjustDebugBackpackSlots?: (increase: boolean) => void;
  readonly setAudioVolume: (bus: 'master' | 'music' | 'sfx', value: number) => void;
  readonly setAudioBackground: (bus: 'music' | 'sounds', enabled: boolean) => void;
  readonly signOut: () => void;
  readonly quitToTitle: () => void;
  readonly toggleFullscreen: () => void;
  readonly checkForClientUpdate: () => void;
  readonly applyClientUpdate: () => void;
  readonly toggleOnlinePlayers: () => void;
  readonly moveInventoryItem: (request: MoveItemRequest) => void;
  readonly quickMoveInventoryItem: (fromContainer: string, fromIndex: number, toContainers: readonly string[]) => void;
  readonly quickMoveAllInventoryItems: (itemKind: string, fromContainers: readonly string[], toContainers: readonly string[]) => void | Promise<void>;
  readonly distributeInventoryItem: (fromContainer: string, fromIndex: number, targets: readonly { container: string; index: number }[], quantity: number) => void;
  readonly inventoryCursorClick: (container: string, index: number, button: 'left' | 'right') => void | Promise<void>;
  readonly sortInventoryContainer: (container: 'backpack' | 'chest' | 'placeable') => void | Promise<void>;
  readonly inventoryCursorQuickCraft: (targets: readonly { container: string; index: number }[], mode: 'even' | 'one_each') => void | Promise<void>;
  readonly inventoryCursorPickupAll: (containerOrder: readonly string[]) => void | Promise<void>;
  readonly inventoryCursorSwapHotbar: (container: string, index: number, hotbarIndex: number) => void;
  readonly dropInventoryCursor: (button: 'left' | 'right') => void | Promise<void>;
  readonly throwMenuItem: (container: string, index: number, wholeStack: boolean) => void;
  readonly returnInventoryCursor: () => void;
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
  readonly currency: UiRect;
  readonly timeSlider: UiRect;
  readonly previousDayButton: UiRect;
  readonly nextDayButton: UiRect;
  readonly weatherButton: UiRect;
  readonly windDirectionButton: UiRect;
  readonly lightingEffectsButton: UiRect;
  readonly orePreviewButton: UiRect;
  readonly resetQuestsButton: UiRect;
  readonly skillPointButtons: Readonly<Record<SkillTrack, UiRect>>;
  readonly backpackCapacityDownButton: UiRect;
  readonly backpackCapacityUpButton: UiRect;
  readonly mobileMenuButton: UiRect;
  readonly craftingButton: UiRect;
  readonly onlinePlayersButton: UiRect;
  readonly collapsedZoneTab: UiRect;
  readonly minimap: UiRect;
  readonly minimapViewport: UiRect;
  readonly collapsedMinimapTab: UiRect;
  readonly minimapZoomOutButton: UiRect;
  readonly minimapZoomInButton: UiRect;
  readonly hotbar: UiRect;
  readonly vitals: UiRect;
  readonly targetVitals: UiRect;
  readonly slots: readonly UiRect[];
  readonly tooltip: UiRect;
  readonly notification: UiRect;
  readonly window: UiRect;
  readonly inventoryWindow: UiRect;
  readonly chestWindow: UiRect;
  readonly chestStorageFrame: StorageFrameLayout;
  readonly systemWindow: UiRect;
  readonly settingsWindow: UiRect;
  readonly developerWindow: UiRect;
  readonly progressionWindow: UiRect;
  readonly closeButton: UiRect;
  readonly equipmentSlots: readonly UiRect[];
  readonly backpackSlots: readonly UiRect[];
  readonly inventoryHotbarSlots: readonly UiRect[];
  readonly inventorySortButton: UiRect;
  readonly inventoryFilter: UiRect;
  readonly inventoryBackpackViewport: UiRect;
  readonly inventoryBackpackScroll: UiRect;
  readonly craftingSlots: readonly UiRect[];
  readonly craftingResult: UiRect;
  readonly craftingInventorySlots: readonly UiRect[];
  readonly craftingRecipeRows: readonly UiRect[];
  readonly chestSlots: readonly UiRect[];
  readonly chestBackpackSlots: readonly UiRect[];
  readonly chestHotbarSlots: readonly UiRect[];
  readonly chestSortButton: UiRect;
  readonly chestBackpackSortButton: UiRect;
  readonly barrelSlots: readonly UiRect[];
  readonly barrelSortButton: UiRect;
  readonly resumeButton: UiRect;
  readonly helpButton: UiRect;
  readonly settingsButton: UiRect;
  readonly fullscreenButton: UiRect;
  readonly updateButton: UiRect;
  readonly developerButton: UiRect;
  readonly signOutButton: UiRect;
  readonly quitButton: UiRect;
  readonly masterSlider: UiRect;
  readonly musicSlider: UiRect;
  readonly sfxSlider: UiRect;
  readonly musicBackgroundToggle: UiRect;
  readonly soundsBackgroundToggle: UiRect;
  readonly settingsBackButton: UiRect;
  readonly developerBackButton: UiRect;
}

const SLOT_WIDTH = 30;
const SLOT_HEIGHT = 31;
const HOTBAR_RETICLE_SIZE = 60;
const DEFAULT_INVENTORY_SLOTS = 8;
const INVENTORY_BACKPACK_COLUMNS = 7;
const INVENTORY_BACKPACK_VISIBLE_ROWS = 3;
export const HUD_RESOURCE_FRAME_SCALE = 1.5;
const HUD_RESOURCE_FRAME_WIDTH = Math.round(48 * HUD_RESOURCE_FRAME_SCALE);
const HUD_RESOURCE_FRAME_HEIGHT = Math.round(19 * HUD_RESOURCE_FRAME_SCALE);
const NAMEPLATE_HORIZONTAL_PADDING = 5;
const NAMEPLATE_HEIGHT = 11;
export const ONLINE_PLAYER_LIST_BOTTOM_PADDING = 12;
const ONLINE_PLAYER_LIST_CONTENT_TOP = 29;
const ONLINE_PLAYER_LIST_ROW_HEIGHT = 12;
const INVENTORY_DOUBLE_CLICK_MS = 500;
const INVENTORY_DRAG_START_DISTANCE = 3;
const EQUIPMENT_SLOT_KINDS = ['neck', 'head', 'ring', 'main_hand', 'body', 'off_hand', 'hands', 'legs', 'feet'] as const;

export const CHEST_STORAGE_FRAME_SPEC: StorageFrameSpec = {
  title: 'CHEST',
  style: 'wood_parchment',
  preferredWidth: 380,
  resizable: true,
  panes: [
    { id: 'chest', label: 'CHEST', columns: CHEST_STORAGE_COLUMNS, rows: CHEST_STORAGE_CAPACITY / CHEST_STORAGE_COLUMNS },
    { id: 'backpack', label: 'INVENTORY', columns: 5, rows: 4, columnGap: 3 },
  ],
  hotbar: { label: 'HOT BAR', columns: HOTBAR_SLOT_COUNT },
};

export interface OverworldUiLayoutOptions {
  readonly chestFrame?: UiRect;
  readonly touchControls?: boolean;
}

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

/** Full-interface visibility shortcut. */
export function isInterfaceVisibilityToggle(
  code: string,
  repeat: boolean,
  textEntryActive = false,
): boolean {
  return code === 'KeyZ' && !repeat && !textEntryActive;
}

export function onlinePlayerListFrameHeight(contentRows: number): number {
  return ONLINE_PLAYER_LIST_CONTENT_TOP
    + Math.max(0, contentRows) * ONLINE_PLAYER_LIST_ROW_HEIGHT
    + ONLINE_PLAYER_LIST_BOTTOM_PADDING;
}

export function onlinePlayerListCloseButtonRect(frame: UiRect): UiRect {
  return {
    x: frame.x + frame.width - 25,
    y: frame.y + 8,
    width: 16,
    height: 16,
  };
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

/** Centres the selector's transparent 60 px canvas around a slot. Its opaque
 * corners then sit a few pixels outside the bevel instead of covering labels. */
export function hotbarReticleRect(rect: UiRect): UiRect {
  return {
    x: Math.round(rect.x + (rect.width - HOTBAR_RETICLE_SIZE) / 2),
    y: Math.round(rect.y + (rect.height - HOTBAR_RETICLE_SIZE) / 2),
    width: HOTBAR_RETICLE_SIZE,
    height: HOTBAR_RETICLE_SIZE,
  };
}

export function itemIconAnimation(itemKind: string): string {
  return itemDefinition(itemKind)?.iconAnimation ?? 'base';
}

export function overworldUiLayout(width: number, height: number, options: OverworldUiLayoutOptions = {}): OverworldUiLayout {
  const compactHotbar = width < 420;
  const hotbarColumns = compactHotbar ? Math.min(5, HOTBAR_SLOT_COUNT) : HOTBAR_SLOT_COUNT;
  const hotbarRows = Math.ceil(HOTBAR_SLOT_COUNT / hotbarColumns);
  const hotbarWidth = hotbarColumns * SLOT_WIDTH;
  const hotbarHeight = hotbarRows * SLOT_HEIGHT;
  const hotbar = { x: Math.round((width - hotbarWidth) / 2), y: height - hotbarHeight - 6, width: hotbarWidth, height: hotbarHeight };
  const vitals = {
    x: hotbar.x, y: hotbar.y - HUD_RESOURCE_FRAME_HEIGHT - 4,
    width: HUD_RESOURCE_FRAME_WIDTH, height: HUD_RESOURCE_FRAME_HEIGHT,
  };
  const targetVitals = {
    x: hotbar.x + hotbar.width - HUD_RESOURCE_FRAME_WIDTH, y: vitals.y,
    width: HUD_RESOURCE_FRAME_WIDTH, height: HUD_RESOURCE_FRAME_HEIGHT,
  };
  const status = { x: 4, y: 2, width: Math.min(220, width - 112), height: STACKED_RIBBON_HEIGHT };
  const currencyWidth = Math.min(112, Math.max(94, width - hotbar.x - hotbar.width - 6));
  const currency = {
    x: width - currencyWidth - 6,
    y: height - 32,
    width: currencyWidth,
    height: 26,
  };
  const windowWidth = Math.min(270, Math.max(220, width - 16));
  const windowHeight = Math.min(184, Math.max(150, height - 30));
  const window = { x: Math.round((width - windowWidth) / 2), y: Math.round((height - windowHeight) / 2), width: windowWidth, height: windowHeight };
  const inventoryWidth = Math.min(438, Math.max(350, width - 16));
  const inventoryHeight = Math.min(240, Math.max(220, height - 16));
  const inventoryWindow = { x: Math.round((width - inventoryWidth) / 2), y: Math.round((height - inventoryHeight) / 2), width: inventoryWidth, height: inventoryHeight };
  const chestStorageFrame = layoutStorageFrame({ width, height }, CHEST_STORAGE_FRAME_SPEC, options.chestFrame);
  const chestWindow = chestStorageFrame.frame;
  const systemHeight = Math.min(202, height - 16);
  const systemWindow = { x: Math.round((width - 190) / 2), y: Math.round((height - systemHeight) / 2), width: 190, height: systemHeight };
  const settingsWidth = Math.min(310, Math.max(270, width - 16));
  const settingsHeight = Math.min(226, Math.max(184, height - 16));
  const settingsWindow = {
    x: Math.round((width - settingsWidth) / 2), y: Math.round((height - settingsHeight) / 2),
    width: settingsWidth, height: settingsHeight,
  };
  const developerWidth = Math.min(400, Math.max(220, width - 24));
  const developerHeight = Math.min(275, Math.max(250, height - 24));
  const developerWindow = { x: Math.round((width - developerWidth) / 2), y: Math.round((height - developerHeight) / 2), width: developerWidth, height: developerHeight };
  const developerToggleWidth = Math.floor((developerWindow.width - 64) / 2);
  const paperOrigin = { x: inventoryWindow.x + 22, y: inventoryWindow.y + 51 };
  const equipmentCells = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]] as const;
  const backpackOrigin = { x: inventoryWindow.x + inventoryWindow.width - 244, y: inventoryWindow.y + 51 };
  const barrelOrigin = {
    x: inventoryWindow.x + Math.round((inventoryWindow.width - 4 * 34) / 2),
    y: inventoryWindow.y + 58,
  };
  const chestPane = chestStorageFrame.panes.find((pane) => pane.id === 'chest')!;
  const chestBackpackPane = chestStorageFrame.panes.find((pane) => pane.id === 'backpack')!;
  const inventoryHotbarX = inventoryWindow.x + Math.round((inventoryWindow.width - hotbarWidth) / 2);
  const menuStep = Math.min(24, Math.max(18, Math.floor((systemWindow.height - 58) / 6)));
  const menuButton = (row: number): UiRect => ({ x: systemWindow.x + 35, y: systemWindow.y + 29 + row * menuStep, width: 120, height: 19 });
  const settingsSlider = (row: number): UiRect => ({
    x: settingsWindow.x + 95,
    y: settingsWindow.y + 49 + row * 28,
    width: settingsWindow.width - 160,
    height: 14,
  });
  return {
    status,
    currency,
    previousDayButton: { x: developerWindow.x + 30, y: developerWindow.y + 49, width: 64, height: 20 },
    timeSlider: { x: developerWindow.x + 102, y: developerWindow.y + 52, width: developerWindow.width - 204, height: 14 },
    nextDayButton: { x: developerWindow.x + developerWindow.width - 94, y: developerWindow.y + 49, width: 64, height: 20 },
    weatherButton: { x: developerWindow.x + 30, y: developerWindow.y + 76, width: developerWindow.width - 60, height: 22 },
    windDirectionButton: { x: developerWindow.x + 30, y: developerWindow.y + 101, width: developerWindow.width - 60, height: 22 },
    lightingEffectsButton: { x: developerWindow.x + 30, y: developerWindow.y + 126, width: developerToggleWidth, height: 20 },
    orePreviewButton: { x: developerWindow.x + 34 + developerToggleWidth, y: developerWindow.y + 126, width: developerToggleWidth, height: 20 },
    skillPointButtons: Object.fromEntries(SKILL_TRACKS.map((track, index) => [track, {
      x: developerWindow.x + 30 + index * Math.floor((developerWindow.width - 64) / 3),
      y: developerWindow.y + developerWindow.height - 103,
      width: Math.floor((developerWindow.width - 72) / 3),
      height: 19,
    }])) as unknown as Readonly<Record<SkillTrack, UiRect>>,
    backpackCapacityDownButton: { x: developerWindow.x + 30, y: developerWindow.y + developerWindow.height - 79, width: 54, height: 20 },
    backpackCapacityUpButton: { x: developerWindow.x + developerWindow.width - 84, y: developerWindow.y + developerWindow.height - 79, width: 54, height: 20 },
    resetQuestsButton: {
      x: developerWindow.x + 30,
      y: developerWindow.y + developerWindow.height - 59,
      width: developerWindow.width - 60,
      height: BUTTON_HEIGHT.regular,
    },
    mobileMenuButton: { x: width - 50, y: 4, width: 44, height: 24 },
    craftingButton: {
      x: Math.max(4, hotbar.x - 28),
      y: hotbar.y + Math.round((Math.min(SLOT_HEIGHT, hotbar.height) - 24) / 2),
      width: 24,
      height: 24,
    },
    // Keep this action inside the banner's writable face. The final 28 pixels
    // are the folded tail, which clips an icon placed against the outer rect.
    onlinePlayersButton: { x: status.x + status.width - 46, y: status.y + 6, width: 18, height: 18 },
    collapsedZoneTab: { x: 0, y: 4, width: 32, height: 16 },
    minimap: { x: width - 120, y: 4, width: 116, height: 92 },
    minimapViewport: { x: width - 114, y: 10, width: 104, height: 66 },
    collapsedMinimapTab: { x: width - 32, y: 4, width: 32, height: 16 },
    minimapZoomOutButton: { x: width - 112, y: 76, width: 24, height: 14 },
    minimapZoomInButton: { x: width - 34, y: 76, width: 24, height: 14 },
    hotbar,
    vitals,
    targetVitals,
    slots: Array.from({ length: HOTBAR_SLOT_COUNT }, (_, slot) => ({
      x: hotbar.x + (slot % hotbarColumns) * SLOT_WIDTH,
      y: hotbar.y + Math.floor(slot / hotbarColumns) * SLOT_HEIGHT,
      width: 28, height: SLOT_HEIGHT,
    })),
    tooltip: { x: Math.round(width / 2) - 100, y: vitals.y - 20, width: 200, height: 16 },
    notification: { x: Math.round(width / 2) - 100, y: Math.max(32, vitals.y - 40), width: 200, height: 16 },
    window,
    inventoryWindow,
    chestWindow,
    chestStorageFrame,
    systemWindow,
    settingsWindow,
    developerWindow,
    progressionWindow: progressionWindowRect(width, height),
    closeButton: { x: window.x + window.width - 24, y: window.y + 8, width: 16, height: 16 },
    equipmentSlots: equipmentCells.map(([column, row]) => ({ x: paperOrigin.x + column * 31, y: paperOrigin.y + row * 34, width: 28, height: 31 })),
    backpackSlots: Array.from({ length: BACKPACK_SLOT_COUNT }, (_, index) => ({ x: backpackOrigin.x + index % INVENTORY_BACKPACK_COLUMNS * 31, y: backpackOrigin.y + Math.floor(index / INVENTORY_BACKPACK_COLUMNS) * 31, width: 28, height: 31 })),
    inventoryHotbarSlots: Array.from({ length: HOTBAR_SLOT_COUNT }, (_, slot) => ({ x: inventoryHotbarX + slot * SLOT_WIDTH, y: inventoryWindow.y + inventoryWindow.height - 48, width: 28, height: 31 })),
    inventorySortButton: { x: backpackOrigin.x + 198, y: inventoryWindow.y + 31, width: 16, height: 16 },
    inventoryFilter: { x: backpackOrigin.x, y: inventoryWindow.y + 28, width: 191, height: 20 },
    inventoryBackpackViewport: { x: backpackOrigin.x, y: backpackOrigin.y, width: 214, height: 93 },
    inventoryBackpackScroll: { x: backpackOrigin.x + 218, y: backpackOrigin.y, width: 14, height: 93 },
    craftingSlots: Array.from({ length: CRAFTING_SLOT_COUNT }, (_, index) => ({ x: inventoryWindow.x + 20 + index % 3 * 31, y: inventoryWindow.y + 51 + Math.floor(index / 3) * 31, width: 28, height: 31 })),
    craftingResult: { x: inventoryWindow.x + 144, y: inventoryWindow.y + 82, width: 28, height: 31 },
    craftingInventorySlots: Array.from({ length: BACKPACK_SLOT_COUNT }, (_, index) => ({
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
    chestSlots: chestStorageFrame.panes.find((pane) => pane.id === 'chest')!.slots,
    chestBackpackSlots: chestStorageFrame.panes.find((pane) => pane.id === 'backpack')!.slots,
    chestHotbarSlots: chestStorageFrame.hotbar!.slots,
    chestSortButton: { x: chestPane.grid.x + chestPane.grid.width - 16, y: chestStorageFrame.frame.y + 31, width: 16, height: 16 },
    chestBackpackSortButton: { x: chestBackpackPane.grid.x + chestBackpackPane.grid.width - 16, y: chestStorageFrame.frame.y + 31, width: 16, height: 16 },
    barrelSlots: Array.from({ length: 8 }, (_, index) => ({
      x: barrelOrigin.x + index % 4 * 34,
      y: barrelOrigin.y + Math.floor(index / 4) * 34,
      width: 28,
      height: 31,
    })),
    barrelSortButton: { x: barrelOrigin.x + 114, y: inventoryWindow.y + 31, width: 16, height: 16 },
    resumeButton: menuButton(0),
    helpButton: menuButton(1),
    settingsButton: menuButton(2),
    fullscreenButton: { x: systemWindow.x + 25, y: menuButton(3).y, width: 68, height: 19 },
    updateButton: { x: systemWindow.x + 97, y: menuButton(3).y, width: 68, height: 19 },
    developerButton: menuButton(4),
    signOutButton: menuButton(5),
    quitButton: menuButton(6),
    masterSlider: settingsSlider(0),
    musicSlider: settingsSlider(1),
    sfxSlider: settingsSlider(2),
    musicBackgroundToggle: {
      x: settingsWindow.x + settingsWindow.width - 67, y: settingsWindow.y + 139, width: 52, height: 18,
    },
    soundsBackgroundToggle: {
      x: settingsWindow.x + settingsWindow.width - 67, y: settingsWindow.y + 165, width: 52, height: 18,
    },
    settingsBackButton: {
      x: settingsWindow.x + Math.round((settingsWindow.width - 88) / 2),
      y: settingsWindow.y + settingsWindow.height - 30,
      width: 88,
      height: 18,
    },
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
  private readonly zoneNode: WidgetNode;
  private readonly minimapNode: WidgetNode;
  private readonly minimapZoomOutNode: WidgetNode;
  private readonly minimapZoomInNode: WidgetNode;
  private readonly onlinePlayersNode: WidgetNode;
  private readonly currencyNode: WidgetNode;
  private readonly timeSlider: Slider;
  private readonly previousDayNode: WidgetNode;
  private readonly nextDayNode: WidgetNode;
  private readonly weatherModeNode: WidgetNode;
  private readonly windDirectionNode: WidgetNode;
  private readonly lightingEffectsNode: WidgetNode;
  private readonly orePreviewNode: WidgetNode;
  private readonly resetQuestsButton: CanvasButton;
  private readonly backpackCapacityDownNode: WidgetNode;
  private readonly backpackCapacityUpNode: WidgetNode;
  private readonly skillPointNodes: Readonly<Record<SkillTrack, WidgetNode>>;
  private readonly mobileMenuNode: WidgetNode;
  private readonly craftingNode: WidgetNode;
  private readonly windowNode: WidgetNode;
  private readonly closeNode: WidgetNode;
  private readonly inventoryHotbarSlots: ItemSlot[];
  private readonly backpackItemSlots: ItemSlot[];
  private readonly equipmentItemSlots: ItemSlot[];
  private readonly craftingItemSlots: ItemSlot[];
  private readonly chestItemSlots: ItemSlot[];
  private readonly barrelItemSlots: ItemSlot[];
  private readonly backpackSortNode: WidgetNode;
  private readonly chestSortNode: WidgetNode;
  private readonly barrelSortNode: WidgetNode;
  private readonly resumeNode: WidgetNode;
  private readonly helpNode: WidgetNode;
  private readonly settingsNode: WidgetNode;
  private readonly fullscreenNode: WidgetNode;
  private readonly updateNode: WidgetNode;
  private readonly developerNode: WidgetNode;
  private readonly signOutNode: WidgetNode;
  private readonly quitNode: WidgetNode;
  private readonly settingsBackNode: WidgetNode;
  private readonly developerBackNode: WidgetNode;
  private readonly masterSlider: Slider;
  private readonly musicSlider: Slider;
  private readonly sfxSlider: Slider;
  private readonly musicBackgroundToggle: Toggle;
  private readonly soundsBackgroundToggle: Toggle;
  private readonly windowRibbon: Ribbon;
  private readonly zoneRibbon: Ribbon;
  private readonly helpBook: HelpBook;
  private readonly onlinePlayersScrollBar: ScrollBar;
  private readonly inventoryScrollBar: ScrollBar;
  private readonly inventoryFilterInput: HTMLInputElement | null;
  private inventoryFilterText = '';
  private readonly currencyDisplay: CurrencyDisplay;
  private readonly playerResourceFrame: PlayerResourceFrame;
  private readonly targetResourceFrame: PlayerResourceFrame;
  private readonly characterScreen: CharacterScreen;
  private readonly skillTree: SkillTreeUi;
  private readonly questLog: QuestLog;
  private readonly chestFrameResize = new StorageFrameResizeController();
  private model: OverworldUiModel = {
    width: 480, height: 270, connected: false, playerCount: 0, selectedSlot: 0, balanceBronze: 0n,
    inventory: [], openChestInventory: [], hasBackpack: false, audioVolumes: { master: 0.8, music: 0.7, sfx: 0.35 },
    audioBackground: { music: false, sounds: false },
    canAdministerWorld: false, dateLabel: 'SPRING 1', timeLabel: '06:00',
    timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null,
  };
  private layout = overworldUiLayout(480, 270);
  private pointer: UiPoint = { x: -100, y: -100 };
  private hoveredSlot: number | null = null;
  private cursorPress: {
    readonly origin: ItemSlot;
    readonly button: 'left' | 'right';
    readonly cursorWasHeld: boolean;
    readonly startPoint: UiPoint;
    readonly targets: ItemSlot[];
    dragged: boolean;
    pickedUpDuringDrag: boolean;
  } | null = null;
  private readonly quickCraftOriginalItems = new Map<ItemSlot, ItemStack | null>();
  private readonly quickCraftPreviewItems = new Map<ItemSlot, ItemStack | null>();
  private quickCraftOriginalCursor: ItemStack | null = null;
  private quickCraftPreviewCursor: ItemStack | null | undefined;
  private readonly optimisticMenuItems = new Map<ItemSlot, ItemStack | null>();
  private optimisticMenuCursor: ItemStack | null | undefined;
  private optimisticMenuStartedAt: number | null = null;
  private inventoryOutsidePress: 'left' | 'right' | null = null;
  private lastShiftClick: { readonly sourceRegion: string; readonly itemKind: string; readonly at: number } | null = null;
  private lastCursorClick: {
    readonly itemKind: string;
    readonly sourceRegion: string;
    readonly transferCandidate: boolean;
    readonly at: number;
  } | null = null;
  private clickStartedAt = Number.NEGATIVE_INFINITY;
  private openWindowValue: OverworldWindow | null = null;
  private chestFrameOverride: UiRect | null = null;
  private onlinePlayerListActive = false;
  private onlinePlayerListRect: UiRect = { x: 0, y: 0, width: 0, height: 0 };
  private onlinePlayerListCloseButton: UiRect = { x: 0, y: 0, width: 0, height: 0 };
  private craftingRecipeScroll = 0;
  private zoneCollapsed = false;
  private minimapCollapsed = false;
  private minimapZoomIndex = 1;
  private sortButtonPressed: 'backpack' | 'chest' | 'placeable' | null = null;
  private sortButtonPressedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly itemArt: OverworldUiItemArt,
    private readonly callbacks: OverworldUiCallbacks,
    drawPlayerHead: (context: CanvasRenderingContext2D, playerId: string, rect: UiRect) => void = () => undefined,
    drawTargetPortrait: (context: CanvasRenderingContext2D, target: OverworldUiTargetVitals, rect: UiRect) => void = () => undefined,
    drawPlayerDoll: (context: CanvasRenderingContext2D, appearance: PlayerAppearanceSelection, facing: Direction, rect: UiRect) => void = () => undefined,
    private readonly drawMinimap: MinimapDrawer = () => undefined,
  ) {
    this.root = widget('root', 'overworld.ui.root');
    this.windowRibbon = new Ribbon(skin.banner, fonts);
    this.zoneRibbon = new Ribbon(skin.banner, fonts);
    this.helpBook = new HelpBook(skin, fonts);
    this.questLog = new QuestLog(skin, fonts, {
      setPinned: (questId, pinned) => this.callbacks.setQuestPinned(questId, pinned),
      drop: (questId) => this.callbacks.abandonQuest(questId),
    });
    this.onlinePlayersScrollBar = new ScrollBar(skin);
    this.inventoryScrollBar = new ScrollBar(skin);
    this.inventoryFilterInput = typeof document === 'undefined'
      ? null : document.querySelector<HTMLInputElement>('#inventory-filter');
    if (this.inventoryFilterInput !== null) {
      this.inventoryFilterInput.addEventListener('input', () => {
        this.inventoryFilterText = this.inventoryFilterInput?.value.replace(/[\r\n]/g, '').slice(0, 32) ?? '';
        this.inventoryScrollBar.scrollBy(-this.inventoryScrollBar.maximum);
        this.update(this.model);
      });
      this.inventoryFilterInput.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          if (this.inventoryFilterInput?.value) {
            this.inventoryFilterInput.value = '';
            this.inventoryFilterText = '';
            this.update(this.model);
          } else this.inventoryFilterInput?.blur();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          this.inventoryFilterInput?.blur();
        }
      });
      this.inventoryFilterInput.addEventListener('keyup', (event) => event.stopPropagation());
    }
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
    this.characterScreen = new CharacterScreen(
      skin,
      fonts,
      { setAppearance: (appearance) => this.callbacks.setAppearance?.(appearance) },
      drawPlayerDoll,
      (context, rect, item) => this.drawInventoryItem(
        context, rect, item.itemKind, item.quantity, item.durability, item.lit,
      ),
    );
    this.skillTree = new SkillTreeUi(skin, fonts, {
      purchase: (nodeId) => this.callbacks.purchaseSkillNode?.(nodeId),
      reset: (track) => this.callbacks.resetSkillTree?.(track),
    });
    this.zoneNode = widget('button', 'hud.zone', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.zoneCollapsed = !this.zoneCollapsed;
        this.syncZoneChrome();
        return true;
      },
    });
    this.minimapNode = widget('button', 'hud.minimap', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.minimapCollapsed = !this.minimapCollapsed;
        this.syncMinimapChrome();
        return true;
      },
      onWheel: (event) => {
        if (this.minimapCollapsed || event.deltaY === 0) return false;
        this.minimapZoomIndex = Math.max(0, Math.min(3, this.minimapZoomIndex + (event.deltaY < 0 ? 1 : -1)));
        this.syncMinimapChrome();
        return true;
      },
    });
    this.minimapZoomOutNode = widget('button', 'hud.minimap.zoom-out', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.minimapZoomIndex = Math.max(0, this.minimapZoomIndex - 1);
        this.syncMinimapChrome();
        return true;
      },
    });
    this.minimapZoomInNode = widget('button', 'hud.minimap.zoom-in', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.minimapZoomIndex = Math.min(3, this.minimapZoomIndex + 1);
        this.syncMinimapChrome();
        return true;
      },
    });
    this.onlinePlayersNode = widget('button', 'hud.online-players', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.toggleOnlinePlayers();
        return true;
      },
    });
    this.currencyNode = widget('button', 'hud.currency-inventory', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.openWindow = this.openWindowValue === 'inventory' ? null : 'inventory';
        return true;
      },
    });
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
    this.lightingEffectsNode = widget('button', 'window.developer.lighting-effects', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.toggleLightingEffects();
        return true;
      },
    });
    this.orePreviewNode = widget('button', 'window.developer.cellar-ore-preview', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.toggleCellarOrePreview?.();
        return true;
      },
    });
    this.resetQuestsButton = new CanvasButton({
      id: 'window.developer.reset-quests',
      skin,
      fonts,
      label: 'RESET MY QUESTS',
      tone: 'danger',
      onPress: () => this.callbacks.resetMyQuestProgress(),
    });
    this.backpackCapacityDownNode = widget('button', 'window.developer.backpack-capacity-down', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.adjustDebugBackpackSlots?.(false);
        return true;
      },
    });
    this.backpackCapacityUpNode = widget('button', 'window.developer.backpack-capacity-up', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.adjustDebugBackpackSlots?.(true);
        return true;
      },
    });
    this.skillPointNodes = Object.fromEntries(SKILL_TRACKS.map((track) => [track, widget('button', `window.developer.skill-points.${track}`, {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.grantDebugSkillPoints?.(track, 1);
        return true;
      },
    })])) as unknown as Readonly<Record<SkillTrack, WidgetNode>>;
    this.mobileMenuNode = widget('button', 'hud.mobile-menu', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.openWindow = this.openWindowValue === 'system' ? null : 'system';
        return true;
      },
    });
    this.craftingNode = widget('button', 'hud.crafting', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.openWindow = this.openWindowValue === 'crafting' ? null : 'crafting';
        return true;
      },
    });
    const hotbar = widget('inventory_grid', 'hud.hotbar', { capturePointer: true });
    this.hotbarNodes = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, slot) => widget('slot', `hud.hotbar.${slot}`, {
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
    this.inventoryHotbarSlots = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, slot) => new ItemSlot(`window.inventory.hotbar.${slot}`, 'hotbar', slot));
    this.backpackItemSlots = Array.from({ length: BACKPACK_SLOT_COUNT }, (_, slot) => new ItemSlot(`window.inventory.backpack.${slot}`, 'backpack', slot));
    this.equipmentItemSlots = EQUIPMENT_SLOT_RESTRICTIONS.map((restriction, slot) => (
      new ItemSlot(`window.inventory.equipment.${slot}`, 'equipment', slot, restriction)
    ));
    this.craftingItemSlots = Array.from({ length: CRAFTING_SLOT_COUNT }, (_, slot) => new ItemSlot(`window.crafting.${slot}`, 'crafting', slot));
    this.chestItemSlots = Array.from({ length: CHEST_STORAGE_CAPACITY }, (_, slot) => new ItemSlot(`window.chest.${slot}`, 'chest', slot));
    this.barrelItemSlots = Array.from({ length: 8 }, (_, slot) => new ItemSlot(`window.barrel.${slot}`, 'placeable', slot));
    const sortNode = (id: string, container: 'backpack' | 'chest' | 'placeable') => widget('button', id, {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.sortButtonPressed = container;
        this.sortButtonPressedAt = performance.now();
        this.trackInventoryPrediction(this.callbacks.sortInventoryContainer(container));
        return true;
      },
    });
    this.backpackSortNode = sortNode('window.inventory.sort', 'backpack');
    this.chestSortNode = sortNode('window.chest.sort', 'chest');
    this.barrelSortNode = sortNode('window.barrel.sort', 'placeable');
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
    this.fullscreenNode = widget('button', 'window.system.fullscreen', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.toggleFullscreen();
        return true;
      },
    });
    this.updateNode = widget('button', 'window.system.update', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        if (this.model.pwaUpdateStatus === 'available') this.callbacks.applyClientUpdate();
        else this.callbacks.checkForClientUpdate();
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
    this.musicBackgroundToggle = new Toggle({
      id: 'window.settings.music-background', skin, fonts,
      onChange: (value) => this.callbacks.setAudioBackground('music', value),
    });
    this.soundsBackgroundToggle = new Toggle({
      id: 'window.settings.sounds-background', skin, fonts,
      onChange: (value) => this.callbacks.setAudioBackground('sounds', value),
    });
    this.windowNode.add(
      this.closeNode,
      ...this.inventoryHotbarSlots.map((slot) => slot.node),
      ...this.backpackItemSlots.map((slot) => slot.node),
      ...this.equipmentItemSlots.map((slot) => slot.node),
      ...this.craftingItemSlots.map((slot) => slot.node),
      ...this.chestItemSlots.map((slot) => slot.node),
      ...this.barrelItemSlots.map((slot) => slot.node),
      this.backpackSortNode,
      this.chestSortNode,
      this.barrelSortNode,
      this.resumeNode,
      this.helpNode,
      this.settingsNode,
      this.fullscreenNode,
      this.updateNode,
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
      this.lightingEffectsNode,
      this.backpackCapacityDownNode,
      this.backpackCapacityUpNode,
      this.orePreviewNode,
      ...SKILL_TRACKS.map((track) => this.skillPointNodes[track]),
      this.resetQuestsButton.node,
      this.masterSlider.node,
      this.musicSlider.node,
      this.sfxSlider.node,
      this.musicBackgroundToggle.node,
      this.soundsBackgroundToggle.node,
    );
    this.root.add(
      this.zoneNode,
      this.onlinePlayersNode,
      this.minimapNode,
      this.minimapZoomOutNode,
      this.minimapZoomInNode,
      this.currencyNode,
      hotbar,
      this.craftingNode,
      this.mobileMenuNode,
      this.windowNode,
    );
    this.router = new UiInputRouter(this.root);
  }

  get openWindow(): OverworldWindow | null { return this.openWindowValue; }
  get minimapBounds(): UiRect {
    return this.minimapCollapsed ? this.layout.collapsedMinimapTab : this.layout.minimap;
  }
  openQuest(questId: string): boolean {
    if (!this.questLog.select(questId)) return false;
    this.openWindow = 'quests';
    return true;
  }
  set openWindow(window: OverworldWindow | null) {
    const requestedWindow = window === 'pack' ? 'inventory' : window;
    const nextWindow = requestedWindow === 'developer' && !this.model.canAdministerWorld ? 'system' : requestedWindow;
    if (this.openWindowValue === 'chest' && nextWindow !== 'chest') this.callbacks.closeChest();
    if (nextWindow !== 'chest') this.chestFrameResize.cancel();
    if (this.openWindowValue === 'barrel' && nextWindow !== 'barrel') this.callbacks.closePlaceable();
    if (this.openWindowValue === 'crafting' && nextWindow !== 'crafting') this.callbacks.closeCrafting();
    if (this.isInventoryWindow(this.openWindowValue) && !this.isInventoryWindow(nextWindow)) {
      this.cancelQuickCraftPreview();
      this.clearOptimisticMenu();
      this.cursorPress = null;
      this.inventoryOutsidePress = null;
      this.callbacks.returnInventoryCursor();
    }
    if (nextWindow === 'help' && this.openWindowValue !== 'help') this.helpBook.reset();
    this.openWindowValue = nextWindow;
    this.syncActiveWindow();
  }

  update(model: OverworldUiModel): void {
    this.onlinePlayerListActive = false;
    this.model = model;
    if (model.character !== undefined) this.characterScreen.update(model.character);
    if (model.skills !== undefined) this.skillTree.update(model.skills);
    this.questLog.update(model.quests ?? []);
    if (this.openWindowValue === 'developer' && !model.canAdministerWorld) this.openWindowValue = 'system';
    this.layout = overworldUiLayout(model.width, model.height, {
      ...(this.chestFrameOverride === null ? {} : { chestFrame: this.chestFrameOverride }),
      touchControls: model.touchControls === true,
    });
    if (this.chestFrameOverride !== null) this.chestFrameOverride = this.layout.chestWindow;
    this.root.setBounds({ x: 0, y: 0, width: model.width, height: model.height });
    this.syncZoneChrome();
    this.syncMinimapChrome();
    this.currencyNode.setBounds(this.layout.currency);
    this.timeSlider.setBounds(this.layout.timeSlider);
    this.timeSlider.value = model.timeFraction;
    this.previousDayNode.setBounds(this.layout.previousDayButton);
    this.nextDayNode.setBounds(this.layout.nextDayButton);
    this.weatherModeNode.setBounds(this.layout.weatherButton);
    this.windDirectionNode.setBounds(this.layout.windDirectionButton);
    this.lightingEffectsNode.setBounds(this.layout.lightingEffectsButton);
    this.orePreviewNode.setBounds(this.layout.orePreviewButton);
    this.backpackCapacityDownNode.setBounds(this.layout.backpackCapacityDownButton);
    this.backpackCapacityUpNode.setBounds(this.layout.backpackCapacityUpButton);
    for (const track of SKILL_TRACKS) this.skillPointNodes[track].setBounds(this.layout.skillPointButtons[track]);
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
      slot.enabled = index < (model.backpackSlotCapacity ?? (model.hasBackpack ? BACKPACK_SLOT_COUNT : DEFAULT_INVENTORY_SLOTS));
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
    this.backpackSortNode.setBounds(this.openWindowValue === 'chest'
      ? this.layout.chestBackpackSortButton : this.layout.inventorySortButton);
    this.chestSortNode.setBounds(this.layout.chestSortButton);
    this.barrelSortNode.setBounds(this.layout.barrelSortButton);
    for (const node of [this.backpackSortNode, this.chestSortNode, this.barrelSortNode]) {
      node.enabled = model.cursorStack === null || model.cursorStack === undefined;
    }
    this.reconcileOptimisticMenu();
    if (this.cursorPress?.cursorWasHeld && this.cursorPress.targets.length > 0) this.applyQuickCraftPreview();
    this.resumeNode.setBounds(this.layout.resumeButton);
    this.helpNode.setBounds(this.layout.helpButton);
    this.settingsNode.setBounds(this.layout.settingsButton);
    this.fullscreenNode.setBounds(this.layout.fullscreenButton);
    this.updateNode.setBounds(this.layout.updateButton);
    this.updateNode.enabled = model.pwaUpdateStatus !== 'unsupported'
      && model.pwaUpdateStatus !== 'checking'
      && model.pwaUpdateStatus !== 'updating';
    this.developerNode.setBounds(this.layout.developerButton);
    this.resetQuestsButton.setBounds(this.layout.resetQuestsButton);
    this.mobileMenuNode.setBounds(this.layout.mobileMenuButton);
    this.mobileMenuNode.visible = (model.touchControls === true || model.width < 420)
      && this.openWindowValue === null;
    this.craftingNode.setBounds(this.layout.craftingButton);
    this.craftingNode.visible = this.openWindowValue === null;
    this.signOutNode.setBounds(this.layout.signOutButton);
    this.quitNode.setBounds(this.layout.quitButton);
    this.settingsBackNode.setBounds(this.layout.settingsBackButton);
    this.developerBackNode.setBounds(this.layout.developerBackButton);
    this.masterSlider.setBounds(this.layout.masterSlider);
    this.musicSlider.setBounds(this.layout.musicSlider);
    this.sfxSlider.setBounds(this.layout.sfxSlider);
    this.musicBackgroundToggle.setBounds(this.layout.musicBackgroundToggle);
    this.soundsBackgroundToggle.setBounds(this.layout.soundsBackgroundToggle);
    this.masterSlider.value = model.audioVolumes.master;
    this.musicSlider.value = model.audioVolumes.music;
    this.sfxSlider.value = model.audioVolumes.sfx;
    this.musicBackgroundToggle.value = model.audioBackground?.music ?? false;
    this.soundsBackgroundToggle.value = model.audioBackground?.sounds ?? false;
    this.syncActiveWindow();
  }

  private filteredInventoryBackpackSlots(): ItemSlot[] {
    const capacity = this.model.backpackSlotCapacity
      ?? (this.model.hasBackpack ? BACKPACK_SLOT_COUNT : DEFAULT_INVENTORY_SLOTS);
    const query = this.inventoryFilterText.trim().toLowerCase();
    return this.backpackItemSlots.filter((slot, index) => {
      if (index >= capacity) return false;
      if (!query) return true;
      if (slot.item === null) return false;
      const definition = itemDefinition(slot.item.itemKind);
      return slot.item.itemKind.toLowerCase().includes(query)
        || (definition?.displayName.toLowerCase().includes(query) ?? false);
    });
  }

  private syncInventoryBackpackSlots(): void {
    if (this.openWindowValue !== 'inventory') return;
    const slots = this.filteredInventoryBackpackSlots();
    this.inventoryScrollBar.setMetrics(Math.ceil(slots.length / INVENTORY_BACKPACK_COLUMNS), INVENTORY_BACKPACK_VISIBLE_ROWS);
    this.inventoryScrollBar.setBounds(this.layout.inventoryBackpackScroll);
    const first = this.inventoryScrollBar.position * INVENTORY_BACKPACK_COLUMNS;
    this.backpackItemSlots.forEach((slot) => { slot.visible = false; });
    slots.slice(first, first + INVENTORY_BACKPACK_COLUMNS * INVENTORY_BACKPACK_VISIBLE_ROWS).forEach((slot, visibleIndex) => {
      slot.visible = true;
      slot.setBounds({
        x: this.layout.inventoryBackpackViewport.x + visibleIndex % INVENTORY_BACKPACK_COLUMNS * 31,
        y: this.layout.inventoryBackpackViewport.y + Math.floor(visibleIndex / INVENTORY_BACKPACK_COLUMNS) * 31,
        width: 28,
        height: 31,
      });
    });
  }

  handleKeyDown(code: string, repeat: boolean, modifiers: { readonly ctrl?: boolean } = {}): boolean {
    if (repeat) return false;
    if (this.openWindowValue === 'help' && this.helpBook.handleKeyDown(code)) return true;
    if (this.openWindowValue === 'quests'
      && this.questLog.handleKeyDown(code, this.layout.progressionWindow)) return true;
    if (code === 'Escape') {
      if (this.openWindowValue === 'settings' || this.openWindowValue === 'developer' || this.openWindowValue === 'help') this.openWindow = 'system';
      else if (this.openWindowValue === 'cooking' || this.openWindowValue === 'quests') this.openWindow = null;
      else if (this.openWindowValue === 'system') this.openWindow = null;
      else this.openWindow = 'system';
      return true;
    }
    if (code === 'KeyI') { this.openWindow = this.openWindowValue === 'inventory' ? null : 'inventory'; return true; }
    if (code === 'KeyC') { this.openWindow = this.openWindowValue === 'crafting' ? null : 'crafting'; return true; }
    if (code === 'KeyP') { this.openWindow = this.openWindowValue === 'character' ? null : 'character'; return true; }
    if (code === 'KeyK') { this.openWindow = this.openWindowValue === 'skills' ? null : 'skills'; return true; }
    if (code === 'KeyL') { this.openWindow = this.openWindowValue === 'quests' ? null : 'quests'; return true; }
    if (this.isInventoryWindow(this.openWindowValue)) {
      const hovered = this.inventoryItemSlotAt(this.pointer);
      const hotbarIndex = hotbarSlotForInputCode(code);
      if (hovered !== null && hotbarIndex !== null) {
        this.callbacks.inventoryCursorSwapHotbar(hovered.containerId, hovered.index, hotbarIndex);
        return true;
      }
      if (code === 'KeyQ') {
        if (this.model.cursorStack !== null && this.model.cursorStack !== undefined) {
          this.callbacks.dropInventoryCursor(modifiers.ctrl ? 'left' : 'right');
          return true;
        }
        if (hovered !== null && hovered.item !== null) {
          this.callbacks.throwMenuItem(hovered.containerId, hovered.index, modifiers.ctrl === true);
          return true;
        }
      }
    }
    return this.openWindowValue !== null;
  }

  handleOnlinePlayersKeyDown(code: string): boolean {
    return this.onlinePlayerListActive && this.onlinePlayersScrollBar.handleKey(code);
  }

  pointerMove(point: UiPoint, _modifiers: { readonly shift?: boolean } = {}): void {
    void _modifiers;
    this.pointer = point;
    if (this.openWindowValue === 'skills') this.skillTree.pointerMove(point, this.layout.progressionWindow);
    if (this.openWindowValue === 'quests') this.questLog.pointerMove(point, this.layout.progressionWindow);
    if (this.chestFrameResize.active) {
      const resized = this.chestFrameResize.pointerMove(point, { width: this.model.width, height: this.model.height });
      if (resized !== null) {
        this.chestFrameOverride = resized;
        this.update(this.model);
      }
      return;
    }
    if (this.onlinePlayerListActive) this.onlinePlayersScrollBar.pointerMove(point);
    if (this.openWindowValue === 'inventory' && this.inventoryScrollBar.pointerMove(point)) this.syncInventoryBackpackSlots();
    const slotNodes = this.openWindowValue === 'inventory' ? this.inventoryHotbarSlots.map((slot) => slot.node) : this.hotbarNodes;
    this.hoveredSlot = slotNodes.findIndex((node) => node.contains(point));
    if (this.hoveredSlot < 0) this.hoveredSlot = null;
    if (this.cursorPress !== null && !this.cursorPress.cursorWasHeld
      && !this.cursorPress.pickedUpDuringDrag && this.cursorPress.origin.item !== null) {
      const dx = point.x - this.cursorPress.startPoint.x;
      const dy = point.y - this.cursorPress.startPoint.y;
      if (dx * dx + dy * dy >= INVENTORY_DRAG_START_DISTANCE * INVENTORY_DRAG_START_DISTANCE
        && this.predictCursorClick(this.cursorPress.origin, this.cursorPress.button)) {
        this.cursorPress.pickedUpDuringDrag = true;
        this.cursorPress.dragged = true;
        this.trackInventoryPrediction(this.callbacks.inventoryCursorClick(
          this.cursorPress.origin.containerId,
          this.cursorPress.origin.index,
          this.cursorPress.button,
        ));
      }
    }
    if (this.cursorPress?.cursorWasHeld) {
      const target = this.inventoryItemSlotAt(point);
      const cursor = this.heldCursorStack();
      const targetStack = target?.item ?? null;
      const targetCompatible = targetStack === null || (cursor !== null && cursor !== undefined
        && itemStacksCompatible(targetStack, cursor)
        && targetStack.quantity < (maxStackFor(cursor.itemKind) ?? 0));
      if (target !== null && cursor != null && target.accepts(cursor.itemKind) && targetCompatible
        && !this.cursorPress.targets.includes(target)) {
        this.cursorPress.targets.push(target);
        if (target !== this.cursorPress.origin) this.cursorPress.dragged = true;
        if (this.cursorPress.targets.length > 1) this.applyQuickCraftPreview();
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
    if (button === 0 && this.onlinePlayerListActive
      && containsPoint(this.onlinePlayerListCloseButton, point)) {
      this.onlinePlayerListActive = false;
      this.callbacks.toggleOnlinePlayers();
      return true;
    }
    if (this.openWindowValue === 'chest' && this.cursorPress === null
      && this.chestFrameResize.pointerDown(point, button, this.layout.chestStorageFrame)) return true;
    if (button === 0 && this.onlinePlayerListActive && this.onlinePlayersScrollBar.pointerDown(point)) return true;
    if (button === 0 && this.openWindowValue === 'inventory' && this.inventoryScrollBar.pointerDown(point)) {
      this.syncInventoryBackpackSlots();
      return true;
    }
    if (this.openWindowValue === null && this.model.vitals !== undefined
      && containsPoint(this.layout.vitals, point)) {
      if (button === 0) this.openWindow = 'character';
      return true;
    }
    if (this.openWindowValue === null && this.model.targetVitals !== undefined
      && containsPoint(this.layout.targetVitals, point)) return true;
    if (this.openWindowValue === 'help') {
      const result = this.helpBook.pointerDown(point);
      if (result === 'back') this.openWindow = 'system';
      if (result !== null) return true;
    }
    if (this.openWindowValue === 'character'
      && this.characterScreen.pointerDown(point, this.layout.progressionWindow)) return true;
    if (this.openWindowValue === 'skills'
      && this.skillTree.pointerDown(point, button, this.layout.progressionWindow)) return true;
    if (this.openWindowValue === 'quests' && !containsPoint(this.closeNode.bounds, point)
      && this.questLog.pointerDown(point, button, this.layout.progressionWindow)) return true;
    if (this.openWindowValue === 'crafting' && button === 0 && containsPoint(this.layout.craftingResult, point)) {
      const recipeId = this.currentRecipeId();
      if (recipeId !== null && !this.currentRecipeStationLocked()) {
        this.callbacks.craftInventoryRecipe(recipeId, modifiers.shift === true);
      }
      return true;
    }
    if (this.openWindowValue === 'inventory' && button === 0 && containsPoint(this.layout.inventoryFilter, point)) {
      this.inventoryFilterInput?.focus({ preventScroll: true });
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
      if (slot !== null && (button === 0 || button === 2)) {
        const cursor = this.heldCursorStack();
        const cursorWasHeld = cursor != null;
        const stack = slot.item;
        const originEligible = cursor !== null && cursor !== undefined && slot.accepts(cursor.itemKind)
          && (stack === null || (itemStacksCompatible(stack, cursor)
            && stack.quantity < (maxStackFor(cursor.itemKind) ?? 0)));
        this.cursorPress = {
          origin: slot, button: button === 2 ? 'right' : 'left', cursorWasHeld,
          startPoint: point,
          targets: cursorWasHeld && originEligible ? [slot] : [], dragged: false,
          pickedUpDuringDrag: false,
        };
        if (cursorWasHeld && originEligible) this.applyQuickCraftPreview();
        return true;
      }
      if ((button === 0 || button === 2) && this.heldCursorStack() != null) {
        this.inventoryOutsidePress = button === 2 ? 'right' : 'left';
        return true;
      }
    }
    return this.router.routePointer({ kind: 'pointer_down', point, button });
  }

  pointerUp(point: UiPoint, button: number, modifiers: { readonly shift?: boolean } = {}): boolean {
    this.pointer = point;
    if (this.openWindowValue === 'skills' && this.skillTree.pointerUp()) return true;
    if (this.openWindowValue === 'quests' && this.questLog.pointerUp()) return true;
    if (this.chestFrameResize.pointerUp()) return true;
    if (this.onlinePlayersScrollBar.pointerUp()) return true;
    if (this.inventoryScrollBar.pointerUp()) return true;
    if (this.cursorPress !== null) {
      const press = this.cursorPress;
      this.cursorPress = null;
      const pressed = press.origin;
      if (press.pickedUpDuringDrag) {
        this.cancelQuickCraftPreview();
        this.lastCursorClick = null;
      } else if (modifiers.shift && press.button === 'left') {
          this.cancelQuickCraftPreview();
          const sourceContainers = this.quickMoveSourceContainers(pressed.containerId);
          const sourceRegion = sourceContainers.join('|');
          const now = performance.now();
          const previousClick = this.lastShiftClick;
          const secondClickKind = pressed.item?.itemKind
            ?? (press.cursorWasHeld ? previousClick?.itemKind : undefined);
          const doubleClick = secondClickKind !== undefined && previousClick !== null
            && previousClick.sourceRegion === sourceRegion && previousClick.itemKind === secondClickKind
            && now - previousClick.at <= INVENTORY_DOUBLE_CLICK_MS;
          if (doubleClick) {
            const destinations = this.quickMoveDestinations(pressed.containerId);
            this.predictQuickMoveAll(secondClickKind, sourceContainers, destinations);
            this.trackInventoryPrediction(this.callbacks.quickMoveAllInventoryItems(
              secondClickKind, sourceContainers, destinations,
            ));
            this.lastShiftClick = null;
          } else if (pressed.item !== null) {
            const itemKind = pressed.item.itemKind;
            this.callbacks.quickMoveInventoryItem(pressed.containerId, pressed.index, this.quickMoveDestinations(pressed.containerId));
            this.lastShiftClick = { sourceRegion, itemKind, at: now };
          } else {
            this.lastShiftClick = null;
          }
      } else if (press.cursorWasHeld && press.targets.length > 0
        && (press.dragged || press.targets.length > 1)) {
        if (this.quickCraftPreviewCursor === undefined) {
          this.cancelQuickCraftPreview();
          return true;
        }
        this.promoteQuickCraftPreview();
        this.trackInventoryPrediction(this.callbacks.inventoryCursorQuickCraft(
          press.targets.map((slot) => ({ container: slot.containerId, index: slot.index })),
          press.button === 'right' ? 'one_each' : 'even',
        ));
      } else {
        this.cancelQuickCraftPreview();
        const cursor = this.heldCursorStack();
        const now = performance.now();
        const clickedKind = cursor?.itemKind ?? pressed.item?.itemKind;
        const sourceContainers = this.quickMoveSourceContainers(pressed.containerId);
        const sourceRegion = sourceContainers.join('|');
        const previousClick = this.lastCursorClick;
        const doubleClick = press.button === 'left' && clickedKind !== undefined
          && previousClick?.itemKind === clickedKind && previousClick.sourceRegion === sourceRegion
          && now - previousClick.at <= INVENTORY_DOUBLE_CLICK_MS;
        if (doubleClick) {
          if (previousClick.transferCandidate) {
            const destinations = this.quickMoveDestinations(pressed.containerId);
            this.predictQuickMoveAll(clickedKind, sourceContainers, destinations);
            this.trackInventoryPrediction(this.callbacks.quickMoveAllInventoryItems(
              clickedKind, sourceContainers, destinations,
            ));
          } else if (this.predictPickupAll()) {
            this.trackInventoryPrediction(this.callbacks.inventoryCursorPickupAll(this.visibleContainerOrder()));
          }
          this.lastCursorClick = null;
        } else {
          const transferCandidate = cursor !== null && pressed.item !== null
            && itemStacksCompatible(cursor, pressed.item);
          if (this.predictCursorClick(pressed, press.button)) {
            this.trackInventoryPrediction(
              this.callbacks.inventoryCursorClick(pressed.containerId, pressed.index, press.button),
            );
          }
          this.lastCursorClick = press.button !== 'left' || clickedKind === undefined
            ? null
            : { itemKind: clickedKind, sourceRegion, transferCandidate, at: now };
        }
      }
      return true;
    }
    if (this.inventoryOutsidePress !== null) {
      const outsideButton = this.inventoryOutsidePress;
      this.inventoryOutsidePress = null;
      if (this.inventoryItemSlotAt(point) === null && this.predictCursorDrop(outsideButton)) {
        this.trackInventoryPrediction(this.callbacks.dropInventoryCursor(outsideButton));
      }
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
    this.cancelQuickCraftPreview();
    this.cursorPress = null;
    this.inventoryOutsidePress = null;
    this.timeSlider.pointerLeave();
    this.masterSlider.pointerLeave();
    this.musicSlider.pointerLeave();
    this.sfxSlider.pointerLeave();
    this.onlinePlayersScrollBar.pointerLeave();
    this.skillTree.pointerLeave();
    this.questLog.pointerLeave();
    this.inventoryScrollBar.pointerLeave();
    this.chestFrameResize.cancel();
  }

  wheel(point: UiPoint, deltaX: number, deltaY: number): boolean {
    if (this.openWindowValue === 'skills'
      && this.skillTree.wheel(point, deltaY, this.layout.progressionWindow)) return true;
    if (this.openWindowValue === 'quests'
      && this.questLog.wheel(point, deltaY, this.layout.progressionWindow)) return true;
    if (this.onlinePlayerListActive && containsPoint(this.onlinePlayerListRect, point) && deltaY !== 0) {
      this.onlinePlayersScrollBar.wheel(deltaY, 1);
      return true;
    }
    if (this.openWindowValue === 'inventory' && containsPoint(this.layout.inventoryBackpackViewport, point)
      && this.inventoryScrollBar.wheel(deltaY, 1)) {
      this.syncInventoryBackpackSlots();
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
    this.drawMinimapHud(context);
    this.drawCurrency(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawHotbar(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawVitals(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawTargetVitals(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawEffects(context);
    if ((this.model.touchControls === true || this.model.width < 420) && this.openWindowValue === null) {
      drawUiSkinAsset(context, this.skin.button, this.layout.mobileMenuButton, 'idle');
      drawLabel(context, this.fonts, 'MENU', this.layout.mobileMenuButton.x + 22, this.layout.mobileMenuButton.y + 8, {
        align: 'center', color: '#5f3b24',
      });
    }
    if (this.openWindowValue === null) {
      drawUiSkinNatural(
        context,
        this.skin.craftingIcon,
        this.layout.craftingButton.x + 4,
        this.layout.craftingButton.y + 4,
      );
    }
    if (this.openWindowValue === 'help') this.helpBook.draw(context, this.model.width, this.model.height);
    else if (this.openWindowValue) this.drawWindow(context, this.openWindowValue);
    if (this.isInventoryWindow(this.openWindowValue)) this.drawQuickCraftTargets(context);
    if (this.isInventoryWindow(this.openWindowValue)) this.drawDraggedItem(context);
    if (this.openWindowValue === null || this.isInventoryWindow(this.openWindowValue)) this.drawTooltip(context);
    this.drawNotification(context);
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
    this.onlinePlayerListCloseButton = onlinePlayerListCloseButtonRect(rect);
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
    drawButton(context, this.skin, this.fonts, this.onlinePlayerListCloseButton, {
      label: 'X', tone: 'danger', size: 'compact',
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

  /** Drawn by the scene after every window and overlay. The system cursor is
   * intentionally the final UI composite and therefore cannot be occluded. */
  drawCursorOverlay(context: CanvasRenderingContext2D): void {
    this.drawCursor(context);
  }

  private drawStatus(context: CanvasRenderingContext2D): void {
    if (this.zoneCollapsed) {
      drawUiSkinAsset(context, this.skin.bookTab, this.layout.collapsedZoneTab, 'base');
      return;
    }
    this.zoneRibbon.drawSingle(
      context,
      fitLabel(this.model.zoneName ?? 'Overworld', 21),
      this.layout.status,
    );
    const frame = uiAssetFrame(this.skin.onlinePlayersIcon, 'base');
    if (frame !== null) {
      context.save();
      context.globalAlpha *= this.model.onlinePlayersVisible === true ? 1 : 0.72;
      context.drawImage(
        this.skin.onlinePlayersIcon.image,
        frame.x, frame.y, frame.width, frame.height,
        this.layout.onlinePlayersButton.x + Math.floor((this.layout.onlinePlayersButton.width - 8) / 2),
        this.layout.onlinePlayersButton.y + Math.floor((this.layout.onlinePlayersButton.height - 8) / 2),
        8,
        8,
      );
      context.restore();
    }
  }

  private syncZoneChrome(): void {
    this.zoneNode.setBounds(this.zoneCollapsed ? this.layout.collapsedZoneTab : this.layout.status);
    this.onlinePlayersNode.setBounds(this.layout.onlinePlayersButton);
    this.onlinePlayersNode.visible = !this.zoneCollapsed;
  }

  private syncMinimapChrome(): void {
    this.minimapNode.setBounds(this.minimapCollapsed ? this.layout.collapsedMinimapTab : this.layout.minimap);
    this.minimapZoomOutNode.setBounds(this.layout.minimapZoomOutButton);
    this.minimapZoomInNode.setBounds(this.layout.minimapZoomInButton);
    this.minimapZoomOutNode.visible = !this.minimapCollapsed;
    this.minimapZoomInNode.visible = !this.minimapCollapsed;
    this.minimapZoomOutNode.enabled = this.minimapZoomIndex > 0;
    this.minimapZoomInNode.enabled = this.minimapZoomIndex < 3;
  }

  private drawMinimapHud(context: CanvasRenderingContext2D): void {
    if (this.minimapCollapsed) {
      context.save();
      context.translate(this.layout.collapsedMinimapTab.x + this.layout.collapsedMinimapTab.width, 0);
      context.scale(-1, 1);
      drawUiSkinAsset(context, this.skin.bookTab, {
        x: 0,
        y: this.layout.collapsedMinimapTab.y,
        width: this.layout.collapsedMinimapTab.width,
        height: this.layout.collapsedMinimapTab.height,
      }, 'base');
      context.restore();
      return;
    }
    drawUiSkinAsset(context, this.skin.panelWood, this.layout.minimap);
    drawUiSkinAsset(context, this.skin.panelParchment, {
      x: this.layout.minimap.x + 4,
      y: this.layout.minimap.y + 4,
      width: this.layout.minimap.width - 8,
      height: this.layout.minimap.height - 8,
    });
    context.save();
    context.beginPath();
    context.rect(
      this.layout.minimapViewport.x,
      this.layout.minimapViewport.y,
      this.layout.minimapViewport.width,
      this.layout.minimapViewport.height,
    );
    context.clip();
    context.fillStyle = '#183c35';
    context.fillRect(
      this.layout.minimapViewport.x,
      this.layout.minimapViewport.y,
      this.layout.minimapViewport.width,
      this.layout.minimapViewport.height,
    );
    this.drawMinimap(
      context,
      this.layout.minimapViewport,
      [1, 2, 3, 4][this.minimapZoomIndex]!,
      this.model.minimapTrackingEnabled === true,
    );
    context.restore();
    drawUiSkinAsset(context, this.skin.button, this.layout.minimapZoomOutButton, this.minimapZoomIndex === 0 ? 'disabled' : 'idle');
    drawLabel(context, this.fonts, '-', this.layout.minimapZoomOutButton.x + 12, this.layout.minimapZoomOutButton.y + 3, { align: 'center', color: '#5f3b24' });
    drawUiSkinAsset(context, this.skin.button, this.layout.minimapZoomInButton, this.minimapZoomIndex === 3 ? 'disabled' : 'idle');
    drawLabel(context, this.fonts, '+', this.layout.minimapZoomInButton.x + 12, this.layout.minimapZoomInButton.y + 3, { align: 'center', color: '#5f3b24' });
    drawLabel(context, this.fonts, `MAP ${this.minimapZoomIndex + 1}X`, this.layout.minimap.x + this.layout.minimap.width / 2, this.layout.minimap.y + 76, { align: 'center', color: '#6b4428' });
  }

  private activeWindowRect(): UiRect {
    if (this.openWindowValue === 'help') return { x: 0, y: 0, width: this.model.width, height: this.model.height };
    if (this.openWindowValue === 'chest') return this.layout.chestWindow;
    if (this.isInventoryWindow(this.openWindowValue)) return this.layout.inventoryWindow;
    if (this.openWindowValue === 'system') return this.layout.systemWindow;
    if (this.openWindowValue === 'settings') return this.layout.settingsWindow;
    if (this.openWindowValue === 'developer') return this.layout.developerWindow;
    if (this.openWindowValue === 'character' || this.openWindowValue === 'skills' || this.openWindowValue === 'quests') return this.layout.progressionWindow;
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
    this.inventoryHotbarSlots.forEach((slot, index) => {
      slot.visible = inventoryVisible || craftingVisible || chestVisible || barrelVisible;
      slot.setBounds(chestVisible ? this.layout.chestHotbarSlots[index]! : this.layout.inventoryHotbarSlots[index]!);
    });
    this.backpackItemSlots.forEach((slot, index) => {
      slot.visible = inventoryVisible || craftingVisible || chestVisible;
      slot.setBounds(craftingVisible
        ? this.layout.craftingInventorySlots[index]!
        : chestVisible ? this.layout.chestBackpackSlots[index]! : this.layout.backpackSlots[index]!);
    });
    for (const slot of this.equipmentItemSlots) slot.visible = inventoryVisible;
    for (const slot of this.craftingItemSlots) slot.visible = craftingVisible;
    for (const slot of this.chestItemSlots) slot.visible = chestVisible;
    for (const slot of this.barrelItemSlots) slot.visible = barrelVisible;
    this.backpackSortNode.visible = inventoryVisible || craftingVisible || chestVisible;
    this.backpackSortNode.setBounds(chestVisible ? this.layout.chestBackpackSortButton : this.layout.inventorySortButton);
    this.chestSortNode.visible = chestVisible;
    this.barrelSortNode.visible = barrelVisible;
    for (const node of [this.resumeNode, this.helpNode, this.settingsNode, this.fullscreenNode, this.updateNode, this.developerNode, this.signOutNode, this.quitNode]) node.visible = systemVisible;
    this.settingsBackNode.visible = settingsVisible;
    this.developerBackNode.visible = developerVisible;
    for (const node of [this.previousDayNode, this.timeSlider.node, this.nextDayNode, this.weatherModeNode, this.windDirectionNode, this.lightingEffectsNode, this.orePreviewNode, this.resetQuestsButton.node]) {
      node.visible = developerVisible;
    }
    this.backpackCapacityDownNode.visible = developerVisible;
    this.backpackCapacityUpNode.visible = developerVisible;
    for (const track of SKILL_TRACKS) this.skillPointNodes[track].visible = developerVisible;
    if (this.inventoryFilterInput !== null) {
      this.inventoryFilterInput.hidden = !inventoryVisible;
      if (!inventoryVisible) this.inventoryFilterInput.blur();
    }
    this.syncInventoryBackpackSlots();
    this.timeSlider.enabled = developerVisible;
    for (const slider of [this.masterSlider, this.musicSlider, this.sfxSlider]) {
      slider.node.visible = settingsVisible;
      slider.enabled = settingsVisible;
    }
    for (const toggle of [this.musicBackgroundToggle, this.soundsBackgroundToggle]) {
      toggle.node.visible = settingsVisible;
      toggle.enabled = settingsVisible;
    }
  }

  private drawCurrency(context: CanvasRenderingContext2D): void {
    const { currency } = this.layout;
    drawUiSkinAsset(context, this.skin.button, currency, 'idle');
    this.currencyDisplay.draw(context, this.model.balanceBronze ?? 0n, currency.x + 7, currency.y + 9, {
      size: 'small', align: 'left', color: '#5f3b24', includeZero: true,
    });
    drawUiSkinNatural(context, this.skin.backpackIcon, currency.x + currency.width - 21, currency.y + 5);
  }

  private drawDeveloper(context: CanvasRenderingContext2D): void {
    const { developerWindow, previousDayButton, nextDayButton, weatherButton, windDirectionButton, lightingEffectsButton, orePreviewButton, backpackCapacityDownButton, backpackCapacityUpButton } = this.layout;
    drawLabel(context, this.fonts, 'WORLD TIME', developerWindow.x + 30, developerWindow.y + 35, { color: '#6b4428' });
    drawButton(context, this.skin, this.fonts, previousDayButton, { label: '-DAY' });
    this.timeSlider.draw(context);
    drawButton(context, this.skin, this.fonts, nextDayButton, { label: '+DAY' });
    drawButton(context, this.skin, this.fonts, weatherButton, {
      label: `WEATHER ${this.model.weatherMode.toUpperCase()}`,
      tone: this.model.raining ? 'success' : 'neutral',
    });
    const directionMode = (this.model.windDirectionMode ?? 'auto').toUpperCase();
    const effectiveDirection = directionMode === 'AUTO' && this.model.windDirectionLabel
      ? ` (${this.model.windDirectionLabel})` : '';
    drawButton(context, this.skin, this.fonts, windDirectionButton, {
      label: `WIND DIR ${directionMode}${effectiveDirection}`,
    });
    drawButton(context, this.skin, this.fonts, lightingEffectsButton, {
      label: `LIGHTING ${this.model.lightingEffectsDisabled ? 'OFF' : 'ON'}`,
      tone: this.model.lightingEffectsDisabled ? 'success' : 'neutral',
    });
    drawButton(context, this.skin, this.fonts, orePreviewButton, {
      label: `ORE VEINS ${this.model.cellarOrePreview ? 'SHOWN' : 'HIDDEN'}`,
      tone: this.model.cellarOrePreview ? 'success' : 'neutral',
    });
    for (const track of SKILL_TRACKS) {
      const rect = this.layout.skillPointButtons[track];
      drawButton(context, this.skin, this.fonts, rect, {
        label: `+1 ${track.toUpperCase()}`,
        tone: 'success',
      });
    }
    drawButton(context, this.skin, this.fonts, backpackCapacityDownButton, { label: '- SLOT' });
    drawLabel(context, this.fonts, `BACKPACK ${this.model.backpackSlotCapacity ?? (this.model.hasBackpack ? BACKPACK_SLOT_COUNT : DEFAULT_INVENTORY_SLOTS)} SLOTS`, developerWindow.x + developerWindow.width / 2, backpackCapacityDownButton.y + 6, { align: 'center', color: '#6b4428' });
    drawButton(context, this.skin, this.fonts, backpackCapacityUpButton, { label: '+ SLOT' });
    this.resetQuestsButton.draw(context);
    drawButton(context, this.skin, this.fonts, this.layout.developerBackButton, { label: 'BACK' });
  }

  private drawHotbar(context: CanvasRenderingContext2D): void {
    const itemBySlot = new Map(this.model.inventory.map((item) => [item.slot, item]));
    for (let slot = 0; slot < HOTBAR_SLOT_COUNT; slot += 1) {
      const rect = this.layout.slots[slot]!;
      drawUiSkinAsset(context, this.skin.slot, rect, 'idle');
      const item = itemBySlot.get(slot);
      const asset = item ? this.itemArt[item.itemKind as keyof OverworldUiItemArt] : undefined;
      if (asset && item) this.drawItemArtwork(context, rect, item.itemKind, asset);
      if (slot === this.model.selectedSlot || slot === this.hoveredSlot) {
        const selector = slot === this.model.selectedSlot ? this.skin.selectorConfirm : this.skin.selectorNeutral;
        drawUiSkinAsset(context, selector, hotbarReticleRect(rect), 'idle');
      }
      drawLabel(context, this.fonts, hotbarSlotLabel(slot) ?? '', rect.x + 3, rect.y + 3, { color: '#51351f' });
      if ((item?.quantity ?? 0) > 1) {
        const stackLabel = slotStackLabelPosition(rect);
        drawOutlinedPixelText(context, this.fonts, String(item!.quantity), stackLabel.x, stackLabel.y, {
          align: 'right', color: '#3f2832', outlineColor: '#f8ead0',
        });
      }
      if (item) this.drawDurabilityBar(context, rect, item.itemKind, item.durability);
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
    const base = this.touchInventoryTooltipRect();
    const rect = { ...base, x: Math.round((this.model.width - width) / 2), width };
    drawUiLabelPlate(context, this.skin, rect);
    drawLabel(context, this.fonts, fitLabel(text, 44), rect.x + rect.width / 2, rect.y + 4, { align: 'center', color: '#5f3b24' });
  }

  /** Touch users cannot hover away from an item. Keep its label below the
   * window hotbar instead of laying it over the slots they are manipulating. */
  private touchInventoryTooltipRect(): UiRect {
    if (this.model.touchControls !== true || !this.isInventoryWindow(this.openWindowValue)) {
      return this.layout.tooltip;
    }
    const slots = this.openWindowValue === 'chest'
      ? this.layout.chestHotbarSlots : this.layout.inventoryHotbarSlots;
    const bottom = Math.max(...slots.map((slot) => slot.y + slot.height));
    return {
      ...this.layout.tooltip,
      y: Math.min(this.model.height - this.layout.tooltip.height - 3, bottom + 3),
    };
  }

  private drawNotification(context: CanvasRenderingContext2D): void {
    const text = this.notificationText();
    if (!text) return;
    const width = Math.min(this.model.width - 12, Math.max(104, measurePixelText(text) + 16));
    const rect = { ...this.layout.notification, x: Math.round((this.model.width - width) / 2), width };
    const kind = this.model.toastKind ?? 'info';
    const asset = kind === 'failure' ? this.skin.buttonDeny
      : kind === 'success' ? this.skin.buttonConfirm : this.skin.button;
    drawUiSkinAsset(context, asset, rect, 'idle');
    drawLabel(context, this.fonts, fitLabel(text, 44), rect.x + rect.width / 2, rect.y + 4, {
      align: 'center', color: kind === 'info' ? '#5f3b24' : '#fff1cf',
    });
  }

  notificationText(): string | null {
    return this.model.toast;
  }

  private drawQuickCraftTargets(context: CanvasRenderingContext2D): void {
    if (!this.cursorPress?.cursorWasHeld || this.cursorPress.targets.length <= 1) return;
    for (const slot of this.cursorPress.targets) {
      if (!slot.visible || !slot.enabled) continue;
      drawUiSkinNatural(context, this.skin.selectorNeutral, slot.bounds.x - 10, slot.bounds.y - 9, 'idle');
    }
  }

  tooltipText(): string | null {
    if (this.backpackSortNode.contains(this.pointer)
      || this.chestSortNode.contains(this.pointer)
      || this.barrelSortNode.contains(this.pointer)) return 'SORT & STACK';
    if (this.openWindowValue === null) {
      if (this.craftingNode.contains(this.pointer)) return 'CRAFTING';
      if (this.currencyNode.contains(this.pointer)) return 'BACKPACK';
      if (this.onlinePlayersNode.contains(this.pointer)) return 'ONLINE PLAYERS';
      if (this.zoneCollapsed && this.zoneNode.contains(this.pointer)) return 'EXPAND ZONE NAME';
    }
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
    return this.openWindowValue === null ? this.model.prompt : null;
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
    if (window === 'chest') drawStorageFrameChrome(context, this.skin, this.layout.chestStorageFrame);
    else {
      drawUiSkinAsset(context, this.skin.panelWood, rect);
      drawUiSkinAsset(context, this.skin.panelParchment, { x: rect.x + 10, y: rect.y + 13, width: rect.width - 20, height: rect.height - 23 });
    }
    const title = window === 'inventory' || window === 'pack' ? 'INVENTORY'
      : window === 'crafting' ? 'CRAFTING'
        : window === 'chest' ? 'CHEST'
          : window === 'barrel' ? 'BARREL'
          : window === 'cooking' ? 'COOKING'
          : window === 'character' ? 'CHARACTER'
          : window === 'skills' ? 'SKILLS'
          : window === 'quests' ? 'QUEST LOG'
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
    else if (window === 'character') this.characterScreen.draw(context, rect);
    else if (window === 'skills') this.skillTree.draw(context, rect);
    else if (window === 'quests') this.questLog.draw(context, rect);
    else if (window === 'settings') this.drawSettings(context);
    else if (window === 'developer') this.drawDeveloper(context);
    else this.drawSystemMenu(context);
    if (window === 'chest') drawStorageResizeHandles(context, this.layout.chestStorageFrame);
  }

  private drawInventory(context: CanvasRenderingContext2D, rect: UiRect): void {
    drawLabel(context, this.fonts, 'EQUIPMENT', rect.x + 21, rect.y + 35, { color: '#6b4428' });
    drawUiSkinAsset(context, this.skin.frameThin, this.layout.inventoryFilter);
    if (this.inventoryFilterInput !== null) {
      drawCanvasTextInput(context, this.fonts, this.inventoryFilterInput, {
        x: this.layout.inventoryFilter.x + 6,
        y: this.layout.inventoryFilter.y + 5,
        width: this.layout.inventoryFilter.width - 12,
        placeholder: 'FILTER ITEMS',
        color: '#51351f',
        placeholderColor: '#986846',
      });
    } else drawLabel(context, this.fonts, this.inventoryFilterText || 'FILTER ITEMS', this.layout.inventoryFilter.x + 6, this.layout.inventoryFilter.y + 5, {
      color: this.inventoryFilterText ? '#51351f' : '#986846',
    });
    this.drawStorageSortButton(context, this.backpackSortNode, 'backpack');
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
      else this.drawInventoryItem(context, equipmentSlot, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    });
    for (const slot of this.backpackItemSlots) {
      if (!slot.visible) continue;
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, slot.enabled ? 'idle' : 'disabled');
      if (slot.enabled && slot.item !== null) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    this.inventoryScrollBar.draw(context);
    context.fillStyle = '#9d6843';
    context.fillRect(rect.x + 17, rect.y + rect.height - 61, rect.width - 34, 1);
    drawLabel(context, this.fonts, 'HOTBAR', rect.x + 21, rect.y + rect.height - 59, { color: '#6b4428' });
    this.inventoryHotbarSlots.forEach((slot, index) => {
      const slotRect = slot.bounds;
      drawUiSkinAsset(context, this.skin.slot, slotRect, 'idle');
      const item = slot.item;
      if (index === this.model.selectedSlot || index === this.hoveredSlot) {
        const selector = index === this.model.selectedSlot ? this.skin.selectorConfirm : this.skin.selectorNeutral;
        drawUiSkinAsset(context, selector, hotbarReticleRect(slotRect), 'idle');
      }
      if (item) this.drawInventoryItem(context, slotRect, item.itemKind, item.quantity, item.durability, item.lit);
      drawLabel(context, this.fonts, hotbarSlotLabel(index) ?? '', slotRect.x + 3, slotRect.y + 3, { color: '#51351f' });
    });
  }

  private inventoryItemSlotAt(point: UiPoint): ItemSlot | null {
    const visible = this.visibleItemSlots();
    return visible
      .find((slot) => slot.node.contains(point) && slot.enabled) ?? null;
  }

  private drawInventoryItem(
    context: CanvasRenderingContext2D,
    rect: UiRect,
    itemKind: string,
    quantity: number,
    durability?: number,
    lit = true,
  ): void {
    const asset = this.itemArt[itemKind as keyof OverworldUiItemArt] ?? this.itemArt['missing'];
    if (asset) this.drawItemArtwork(context, rect, itemKind, asset, lit);
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
  private drawItemArtwork(
    context: CanvasRenderingContext2D,
    rect: UiRect,
    itemKind: string,
    asset: LoadedAsset,
    lit = true,
  ): void {
    const frame = uiAssetFrame(asset, itemIconAnimation(itemKind));
    if (!frame) return;
    const scale = Math.min(16 / frame.width, 16 / frame.height);
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    const x = Math.round(rect.x + 6 + (16 - width) / 2);
    const y = Math.round(rect.y + 7 + (16 - height) / 2);
    context.save();
    if (itemKind === 'lantern' && !lit) {
      context.filter = 'brightness(42%) saturate(55%)';
      context.globalAlpha *= 0.88;
    }
    context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, x, y, width, height);
    context.restore();
  }

  private drawDraggedItem(context: CanvasRenderingContext2D): void {
    // During QUICK_CRAFT the item under the pointer is a ghost of the original
    // carried stack. Destination cells preview the allocation independently;
    // the ghost remains visible until mouse-up even when the preview remainder is zero.
    const cursor = this.cursorPress?.cursorWasHeld && this.quickCraftPreviewCursor !== undefined
      ? this.quickCraftOriginalCursor
      : this.heldCursorStack();
    if (cursor == null) return;
    const destination = { x: this.pointer.x - 14, y: this.pointer.y - 15, width: 28, height: 31 };
    drawUiSkinAsset(context, this.skin.slot, destination, 'idle');
    this.drawInventoryItem(context, destination, cursor.itemKind, cursor.quantity, cursor.durability, cursor.lit);
  }

  private drawSystemMenu(context: CanvasRenderingContext2D): void {
    const updateStatus = this.model.pwaUpdateStatus ?? 'unsupported';
    const buttons = [
      [this.layout.resumeButton, 'RESUME', this.skin.buttonConfirm, false],
      [this.layout.helpButton, 'HELP', this.skin.button, false],
      [this.layout.settingsButton, 'SETTINGS', this.skin.button, false],
      [this.layout.fullscreenButton, this.model.fullscreen ? 'WINDOWED' : 'FULLSCREEN', this.skin.button, false],
      [this.layout.updateButton, pwaUpdateLabel(updateStatus), updateStatus === 'available' ? this.skin.buttonConfirm : this.skin.button,
        updateStatus === 'unsupported' || updateStatus === 'checking' || updateStatus === 'updating'],
      [this.layout.developerButton, 'DEVELOPER', this.model.canAdministerWorld ? this.skin.buttonConfirm : this.skin.button, !this.model.canAdministerWorld],
      [this.layout.signOutButton, 'SIGN OUT', this.skin.buttonDeny, false],
      [this.layout.quitButton, 'QUIT TO TITLE', this.skin.button, false],
    ] as const;
    for (const [rect, label, asset, disabled] of buttons) {
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
    drawLabel(context, this.fonts, 'MUSIC IN BACKGROUND', this.layout.settingsWindow.x + 25,
      this.layout.musicBackgroundToggle.y + 5, { color: '#6b4428' });
    drawLabel(context, this.fonts, 'SOUNDS IN BACKGROUND', this.layout.settingsWindow.x + 25,
      this.layout.soundsBackgroundToggle.y + 5, { color: '#6b4428' });
    this.musicBackgroundToggle.draw(context);
    this.soundsBackgroundToggle.draw(context);
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
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
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
    this.drawStorageSortButton(context, this.backpackSortNode, 'backpack');
    for (const slot of this.backpackItemSlots) {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, slot.enabled ? 'idle' : 'disabled');
      if (slot.enabled && slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    this.drawWindowHotbar(context, rect);
  }

  private drawChest(context: CanvasRenderingContext2D, rect: UiRect): void {
    const chestPane = this.layout.chestStorageFrame.panes.find((pane) => pane.id === 'chest')!;
    const backpackPane = this.layout.chestStorageFrame.panes.find((pane) => pane.id === 'backpack')!;
    drawLabel(context, this.fonts, chestPane.label, chestPane.labelPosition.x, chestPane.labelPosition.y, { color: '#6b4428' });
    this.drawStorageSortButton(context, this.chestSortNode, 'chest');
    for (const slot of this.chestItemSlots) {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, 'idle');
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    drawLabel(context, this.fonts, this.model.hasBackpack ? 'BACKPACK' : backpackPane.label,
      backpackPane.labelPosition.x, backpackPane.labelPosition.y, { color: '#6b4428' });
    this.drawStorageSortButton(context, this.backpackSortNode, 'backpack');
    for (const slot of this.backpackItemSlots) {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, slot.enabled ? 'idle' : 'disabled');
      if (slot.enabled && slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    this.drawWindowHotbar(context, rect, this.layout.chestStorageFrame);
  }

  private drawWindowHotbar(context: CanvasRenderingContext2D, rect: UiRect, storageFrame?: StorageFrameLayout): void {
    const divider = storageFrame?.divider ?? { x: rect.x + 17, y: rect.y + rect.height - 61, width: rect.width - 34, height: 1 };
    const label = storageFrame?.hotbar?.label ?? 'HOT BAR';
    const labelPosition = storageFrame?.hotbar?.labelPosition
      ?? { x: this.inventoryHotbarSlots[0]!.bounds.x, y: rect.y + rect.height - 59 };
    context.fillStyle = '#9d6843'; context.fillRect(divider.x, divider.y, divider.width, divider.height);
    drawLabel(context, this.fonts, label, labelPosition.x, labelPosition.y, { color: '#6b4428' });
    this.inventoryHotbarSlots.forEach((slot, index) => {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, 'idle');
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
      drawLabel(context, this.fonts, hotbarSlotLabel(index) ?? '', slot.bounds.x + 3, slot.bounds.y + 3, { color: '#51351f' });
    });
  }

  private isInventoryWindow(window: OverworldWindow | null): boolean {
    return window === 'inventory' || window === 'pack' || window === 'crafting' || window === 'chest' || window === 'barrel';
  }

  private visibleItemSlots(): ItemSlot[] {
    if (this.openWindowValue === 'inventory') return [...this.equipmentItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'crafting') return [...this.craftingItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'chest') return [...this.chestItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
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
    if (source === 'placeable') return ['hotbar', 'backpack'];
    if (this.openWindowValue === 'barrel') return ['placeable'];
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

  private visibleContainerOrder(): readonly string[] {
    return [...new Set(this.visibleItemSlots().map((slot) => slot.containerId))];
  }

  /** Recomputes QUICK_CRAFT from the gesture's original snapshots every time a
   * new slot is visited. This is presentation prediction only; release still
   * emits one reducer transaction containing the complete visited-slot list. */
  private applyQuickCraftPreview(): void {
    const press = this.cursorPress;
    const cursor = this.heldCursorStack();
    if (!press?.cursorWasHeld || press.targets.length === 0 || cursor == null) return;
    const slots = this.visibleItemSlots();
    if (this.quickCraftOriginalItems.size === 0) {
      this.quickCraftOriginalCursor = { ...cursor };
      for (const slot of slots) {
        this.quickCraftOriginalItems.set(slot, slot.item === null ? null : { ...slot.item });
      }
    }
    const grouped = new Map<string, ItemSlot[]>();
    for (const slot of slots) grouped.set(slot.containerId, [...(grouped.get(slot.containerId) ?? []), slot]);
    const containers: Record<string, ContainerSnapshot> = {};
    for (const [id, containerSlots] of grouped) {
      const capacity = Math.max(...containerSlots.map((slot) => slot.index)) + 1;
      const restrictions = Object.fromEntries(containerSlots.flatMap((slot) => (
        slot.restriction === undefined ? [] : [[slot.index, slot.restriction] as const]
      )));
      containers[id] = {
        id, capacity,
        slots: Array.from({ length: capacity }, (_, index) => {
          const slot = containerSlots.find((candidate) => candidate.index === index);
          return slot === undefined ? null : this.quickCraftOriginalItems.get(slot) ?? null;
        }),
        ...(Object.keys(restrictions).length === 0 ? {} : { restrictions }),
      };
    }
    const preview = quickCraftCursorStack(containers, cursor, {
      mode: press.button === 'right' ? 'one_each' : 'even',
      targets: press.targets.map((slot) => ({ container: slot.containerId, index: slot.index })),
    });
    if (!preview.ok) return;
    this.quickCraftPreviewItems.clear();
    for (const slot of slots) {
      const item = preview.containers[slot.containerId]?.slots[slot.index] ?? null;
      this.quickCraftPreviewItems.set(slot, item);
      slot.item = item;
    }
    this.quickCraftPreviewCursor = preview.cursor;
  }

  private samePreviewStack(left: ItemStack | null, right: ItemStack | null): boolean {
    return left === null || right === null
      ? left === right
      : left.itemKind === right.itemKind && left.quantity === right.quantity
        && left.durability === right.durability && left.lit === right.lit;
  }

  private clearQuickCraftPreview(): void {
    this.quickCraftOriginalItems.clear();
    this.quickCraftPreviewItems.clear();
    this.quickCraftOriginalCursor = null;
    this.quickCraftPreviewCursor = undefined;
  }

  private cancelQuickCraftPreview(): void {
    for (const [slot, item] of this.quickCraftOriginalItems) slot.item = item;
    this.clearQuickCraftPreview();
  }

  private promoteQuickCraftPreview(): void {
    if (this.quickCraftPreviewCursor === undefined) return;
    this.optimisticMenuItems.clear();
    for (const [slot, item] of this.quickCraftPreviewItems) this.optimisticMenuItems.set(slot, item);
    this.optimisticMenuCursor = this.quickCraftPreviewCursor;
    this.optimisticMenuStartedAt = performance.now();
    this.clearQuickCraftPreview();
    this.reapplyOptimisticMenu();
  }

  private heldCursorStack(): ItemStack | null {
    return this.optimisticMenuCursor === undefined
      ? this.model.cursorStack ?? null
      : this.optimisticMenuCursor;
  }

  private visibleMenuContainers(): Readonly<Record<string, ContainerSnapshot>> {
    const grouped = new Map<string, ItemSlot[]>();
    for (const slot of this.visibleItemSlots()) {
      grouped.set(slot.containerId, [...(grouped.get(slot.containerId) ?? []), slot]);
    }
    return Object.fromEntries([...grouped].map(([id, slots]) => {
      const capacity = Math.max(...slots.map((slot) => slot.index)) + 1;
      const restrictions = Object.fromEntries(slots.flatMap((slot) => (
        slot.restriction === undefined ? [] : [[slot.index, slot.restriction] as const]
      )));
      return [id, {
        id, capacity,
        slots: Array.from({ length: capacity }, (_, index) => (
          slots.find((slot) => slot.index === index)?.item ?? null
        )),
        ...(Object.keys(restrictions).length === 0 ? {} : { restrictions }),
      } satisfies ContainerSnapshot];
    }));
  }

  private acceptOptimisticMenu(
    containers: Readonly<Record<string, ContainerSnapshot>>,
    cursor: ItemStack | null,
  ): void {
    this.optimisticMenuItems.clear();
    for (const slot of this.visibleItemSlots()) {
      this.optimisticMenuItems.set(slot, containers[slot.containerId]?.slots[slot.index] ?? null);
    }
    this.optimisticMenuCursor = cursor;
    this.optimisticMenuStartedAt = performance.now();
    this.reapplyOptimisticMenu();
  }

  private predictCursorClick(slot: ItemSlot, button: 'left' | 'right'): boolean {
    const result = clickContainerSlot(this.visibleMenuContainers(), this.heldCursorStack(), {
      container: slot.containerId, index: slot.index, button,
    });
    if (!result.ok) return false;
    this.acceptOptimisticMenu(result.containers, result.cursor);
    return true;
  }

  private predictPickupAll(): boolean {
    const result = pickupAllToCursor(
      this.visibleMenuContainers(), this.heldCursorStack(), this.visibleContainerOrder(),
    );
    if (!result.ok) return false;
    this.acceptOptimisticMenu(result.containers, result.cursor);
    return true;
  }

  private predictQuickMoveAll(
    itemKind: string,
    fromContainers: readonly string[],
    toContainers: readonly string[],
  ): boolean {
    const result = quickMoveAllMatchingStacks(this.visibleMenuContainers(), {
      itemKind, fromContainers, toContainers,
    });
    if (!result.ok) return false;
    this.acceptOptimisticMenu(result.containers, this.heldCursorStack());
    return true;
  }

  private predictCursorDrop(button: 'left' | 'right'): boolean {
    const cursor = this.heldCursorStack();
    if (cursor === null) return false;
    const quantity = button === 'right' ? 1 : cursor.quantity;
    this.acceptOptimisticMenu(this.visibleMenuContainers(), quantity === cursor.quantity
      ? null
      : { ...cursor, quantity: cursor.quantity - quantity });
    return true;
  }

  private reapplyOptimisticMenu(): void {
    for (const [slot, item] of this.optimisticMenuItems) slot.item = item;
  }

  private optimisticMenuMatchesAuthority(): boolean {
    if (this.optimisticMenuCursor === undefined) return true;
    if (!this.samePreviewStack(this.model.cursorStack ?? null, this.optimisticMenuCursor)) return false;
    for (const [slot, expected] of this.optimisticMenuItems) {
      if (!this.samePreviewStack(slot.item, expected)) return false;
    }
    return true;
  }

  private reconcileOptimisticMenu(): void {
    if (this.optimisticMenuCursor === undefined) return;
    if (this.optimisticMenuMatchesAuthority()
      || (this.optimisticMenuStartedAt !== null && performance.now() - this.optimisticMenuStartedAt > 5_000)) {
      this.clearOptimisticMenu();
      return;
    }
    this.reapplyOptimisticMenu();
  }

  private clearOptimisticMenu(): void {
    this.optimisticMenuItems.clear();
    this.optimisticMenuCursor = undefined;
    this.optimisticMenuStartedAt = null;
  }

  private trackInventoryPrediction(result: void | Promise<void>): void {
    void Promise.resolve(result).catch(() => {
      this.cancelQuickCraftPreview();
      this.clearOptimisticMenu();
      // Restore the latest subscribed authority snapshot immediately. The
      // callback owns the error toast; this path only rolls presentation back.
      this.update(this.model);
    });
  }

  private drawBarrel(context: CanvasRenderingContext2D, rect: UiRect): void {
    const firstSlot = this.barrelItemSlots[0]!.bounds;
    drawLabel(context, this.fonts, '8-SLOT STORAGE', firstSlot.x, rect.y + 35, { color: '#6b4428' });
    this.drawStorageSortButton(context, this.barrelSortNode, 'placeable');
    for (const slot of this.barrelItemSlots) {
      drawUiSkinAsset(context, this.skin.slot, slot.bounds, 'idle');
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    this.drawWindowHotbar(context, rect);
  }

  private drawStorageSortButton(
    context: CanvasRenderingContext2D,
    node: WidgetNode,
    container: 'backpack' | 'chest' | 'placeable',
  ): void {
    const pressed = node.enabled && this.sortButtonPressed === container
      && performance.now() - this.sortButtonPressedAt < 140;
    const state = node.enabled ? (pressed ? 'pressed' : 'idle') : 'disabled';
    drawUiSkinAsset(context, this.skin.buttonSmall, node.bounds, state);
    const frame = uiAssetFrame(this.skin.craftingIcon, 'base');
    if (frame === null) return;
    context.save();
    if (!node.enabled) context.globalAlpha *= 0.45;
    const y = node.bounds.y + 3 + (pressed ? 1 : 0);
    context.drawImage(
      this.skin.craftingIcon.image,
      frame.x, frame.y, frame.width, frame.height,
      node.bounds.x + 3, y, 10, 10,
    );
    context.restore();
  }

  private drawCursor(context: CanvasRenderingContext2D): void {
    if (this.model.touchControls === true || this.pointer.x < 0 || this.pointer.y < 0) return;
    drawUiSkinNatural(context, this.skin.cursor, this.pointer.x, this.pointer.y, 'idle');
    const elapsed = performance.now() - this.clickStartedAt;
    if (elapsed < 280) drawUiSkinNatural(context, this.skin.cursorClick, this.pointer.x - 8, this.pointer.y - 8, 'click', Math.min(3, Math.floor(elapsed / 70)));
  }
}
