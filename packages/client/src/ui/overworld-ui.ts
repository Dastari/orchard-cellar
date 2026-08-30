import { BACKPACK_SLOT_COUNT, BACKPACK_SLOT_OFFSET, CAMPFIRE_COOKING_RECIPES, CHEST_STORAGE_CAPACITY, CHEST_STORAGE_COLUMNS, COOKING_FIRE_INPUT_SLOT, COOKING_FIRE_OUTPUT_SLOT, CRAFTING_SLOT_COUNT, CRAFTING_SLOT_OFFSET, EQUIPMENT_SLOT_OFFSET, FERMENTATION_INPUT_SLOT, FERMENTATION_OUTPUT_SLOT, FURNACE_FUEL_SLOT, FURNACE_INPUT_SLOT, FURNACE_OUTPUT_SLOT, HOTBAR_SLOT_COUNT, PRESSABLE_FRUIT_KINDS, PRESS_INPUT_SLOT, PRESS_MUST_OUTPUT_SLOT, PRESS_POMACE_OUTPUT_SLOT, SMELTING_RECIPES, clickContainerSlot, craftingRecipeOutput, durabilityFraction, hotbarSlotForInputCode, hotbarSlotLabel, itemDefinition, itemStacksCompatible, matchingRecipeId, maxStackFor, pickupAllToCursor, quickCraftCursorStack, quickMoveAllMatchingStacks, recipeDefinition, toolDurabilityDefinition, type ContainerSnapshot, type CraftingStation, type ItemStack, type MoonPhase, type MoveItemRequest, type WeatherMode, type WindDirectionMode } from '@orchard/sim';
import type { LoadedAsset } from '../render/assets.js';
import type { LightingModel } from '../render/lighting.js';
import { drawOutlinedPixelText, drawPixelText, drawPixelTextInRect, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import { hotbarItemName } from '../survival-ui.js';
import { craftingRecipeBookEntries } from './recipe-book.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { UiInputRouter } from './input-router.js';
import { Slider } from './slider.js';
import { BUTTON_HEIGHT, CanvasButton, drawButton } from './button.js';
import { drawToggleSwitch, Toggle } from './toggle.js';
import { Ribbon, STACKED_RIBBON_HEIGHT } from './ribbon.js';
import { EQUIPMENT_SLOT_RESTRICTIONS, ItemSlot, itemSlotRejectsCursor } from './item-slot.js';
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
import { drawUiInventorySlotBacking, uiInventorySelectorRect } from './design-system/inventory.js';
import {
  drawFantasyButton,
  drawFantasyIconCell,
  fantasyAudioIconFrame,
  type FantasyButtonGlyph,
  type FantasyButtonTone,
} from './design-system/fantasy-controls.js';
import { SKILL_TRACKS, type Direction, type PlayerAppearanceSelection, type SkillTrack } from '@orchard/sim';

export type OverworldWindow = 'inventory' | 'pack' | 'crafting' | 'chest' | 'barrel' | 'furnace' | 'cooking' | 'press' | 'fermentation' | 'character' | 'skills' | 'quests' | 'system' | 'settings' | 'developer' | 'help';
export const SYSTEM_MENU_TITLE = 'GAME MENU';

export const SETTINGS_TABS = [
  'gameplay', 'controls', 'video', 'audio', 'interface', 'accessibility',
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEVELOPER_TABS = ['world', 'player', 'quests', 'render'] as const;
export type DeveloperTab = (typeof DEVELOPER_TABS)[number];

type AudioVolumeBus = 'master' | 'music' | 'sfx';

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
  readonly identityHex?: string;
  readonly displayName: string;
  readonly self: boolean;
  readonly idleMinutes: number | null;
  readonly homesteadRole?: 'guest' | 'worker' | 'builder' | null;
}

export const ONLINE_PLAYER_IDLE_THRESHOLD_MINUTES = 10;
const MICROS_PER_MINUTE = 60_000_000n;

export function onlinePlayerIdleMinutes(
  lastActiveAtMicros: bigint,
  nowMillis = Date.now(),
): number | null {
  if (lastActiveAtMicros <= 0n) return null;
  const elapsedMicros = BigInt(Math.floor(nowMillis)) * 1_000n - lastActiveAtMicros;
  const threshold = BigInt(ONLINE_PLAYER_IDLE_THRESHOLD_MINUTES) * MICROS_PER_MINUTE;
  return elapsedMicros > threshold ? Number(elapsedMicros / MICROS_PER_MINUTE) : null;
}

export function onlinePlayerListLabel(player: OnlinePlayerListEntry): string {
  const selfSuffix = player.self ? '  (YOU)' : '';
  const idleSuffix = player.idleMinutes === null ? '' : `  (idle ${player.idleMinutes} min)`;
  return `${player.displayName}${selfSuffix}${idleSuffix}`;
}

export function nextHomesteadMemberRole(
  role: OnlinePlayerListEntry['homesteadRole'],
): 'guest' | 'worker' | 'builder' | null {
  if (role === null || role === undefined) return 'guest';
  if (role === 'guest') return 'worker';
  if (role === 'worker') return 'builder';
  return null;
}

export function processorCountdownLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '';
  const remaining = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(remaining / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  const secs = remaining % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
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
  readonly canManageHomestead?: boolean;
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
  readonly furnaceProgress?: number;
  readonly furnaceRemainingSeconds?: number | null;
  readonly cookingFireProgress?: number;
  readonly cookingFireRemainingSeconds?: number | null;
  readonly cookingFireLit?: boolean;
  readonly cellarProcessorProgress?: number;
  readonly cellarProcessorRemainingSeconds?: number | null;
  readonly cellarProductLabel?: string;
  readonly hunger?: { readonly current: number; readonly maximum: number };
  readonly barrelProgress?: number;
  readonly barrelSealed?: boolean;
  readonly cookingJob?: {
    readonly recipeId: string; readonly outputKind: string; readonly quantity: number;
    readonly progress: number; readonly ready: boolean;
  } | null;
  readonly hasBackpack: boolean;
  readonly backpackSlotCapacity?: number;
  readonly audioVolumes: { readonly master: number; readonly music: number; readonly sfx: number };
  readonly audioBackground?: { readonly music: boolean; readonly sounds: boolean };
  readonly nameplatesVisible?: boolean;
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
  readonly lightingModel?: LightingModel;
  readonly cellarOrePreview?: boolean;
  readonly fullscreen?: boolean;
  readonly fullscreenAvailable?: boolean;
  readonly pwaUpdateStatus?: PwaUpdateStatus;
  readonly prompt: string | null;
  readonly toast: string | null;
  readonly toastKind?: 'info' | 'success' | 'failure';
  readonly nearbyCraftingStations?: readonly CraftingStation[];
  readonly knownRecipeIds?: readonly string[];
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
  readonly setLightingModel?: (model: LightingModel) => void;
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
  readonly setNameplatesVisible?: (visible: boolean) => void;
  readonly signOut: () => void;
  readonly quitToTitle: () => void;
  readonly toggleFullscreen: () => void;
  readonly checkForClientUpdate: () => void;
  readonly applyClientUpdate: () => void;
  readonly toggleOnlinePlayers: () => void;
  readonly manageHomesteadMember?: (
    identityHex: string,
    role: 'guest' | 'worker' | 'builder' | null,
    kick: boolean,
  ) => void;
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
  readonly sealBarrel?: () => void;
  readonly startCooking?: (recipeId: string) => void;
  readonly collectCooking?: () => void;
  readonly cancelCooking?: () => void;
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
  readonly craftingWindow: UiRect;
  readonly chestWindow: UiRect;
  readonly chestStorageFrame: StorageFrameLayout;
  readonly systemWindow: UiRect;
  readonly settingsWindow: UiRect;
  readonly settingsContent: UiRect;
  readonly settingsTabs: Readonly<Record<SettingsTab, UiRect>>;
  readonly lightingModelButton: UiRect;
  readonly developerWindow: UiRect;
  readonly developerContent: UiRect;
  readonly developerTabs: Readonly<Record<DeveloperTab, UiRect>>;
  readonly progressionWindow: UiRect;
  readonly closeButton: UiRect;
  readonly equipmentSlots: readonly UiRect[];
  readonly backpackSlots: readonly UiRect[];
  readonly inventoryHotbarSlots: readonly UiRect[];
  readonly inventorySortButton: UiRect;
  readonly inventoryFilter: UiRect;
  readonly inventoryBackpackViewport: UiRect;
  readonly inventoryBackpackScroll: UiRect;
  readonly inventoryBackpackColumns: number;
  readonly craftingInventoryFilter: UiRect;
  readonly craftingBackpackSortButton: UiRect;
  readonly craftingSlots: readonly UiRect[];
  readonly craftingResult: UiRect;
  readonly craftingInventorySlots: readonly UiRect[];
  readonly craftingRecipeRows: readonly UiRect[];
  readonly craftingRecipeScroll: UiRect;
  readonly chestSlots: readonly UiRect[];
  readonly chestBackpackSlots: readonly UiRect[];
  readonly chestHotbarSlots: readonly UiRect[];
  readonly chestSortButton: UiRect;
  readonly chestBackpackSortButton: UiRect;
  readonly barrelSlots: readonly UiRect[];
  readonly barrelSortButton: UiRect;
  readonly furnaceSlots: readonly UiRect[];
  readonly furnaceProgress: UiRect;
  readonly furnaceTimer: UiRect;
  readonly furnaceStatus: UiRect;
  readonly pressSlots: readonly UiRect[];
  readonly pressProgress: UiRect;
  readonly cookingSlots: readonly UiRect[];
  readonly cookingProgress: UiRect;
  readonly cookingTimer: UiRect;
  readonly processorStatus: UiRect;
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
  readonly audioMuteButtons: Readonly<Record<AudioVolumeBus, UiRect>>;
  readonly musicBackgroundToggle: UiRect;
  readonly soundsBackgroundToggle: UiRect;
  readonly nameplatesToggle: UiRect;
  readonly settingsBackButton: UiRect;
  readonly developerBackButton: UiRect;
}

export interface PwaUpdatePromptLayout {
  readonly frame: UiRect;
  readonly refreshButton: UiRect;
  readonly laterButton: UiRect;
}

export function pwaUpdatePromptLayout(width: number, height: number): PwaUpdatePromptLayout {
  const frameWidth = Math.min(330, Math.max(260, width - 16));
  const frameHeight = Math.min(132, Math.max(98, height - 12));
  const frame = {
    x: Math.round((width - frameWidth) / 2),
    y: Math.round((height - frameHeight) / 2),
    width: frameWidth,
    height: frameHeight,
  };
  const buttonWidth = Math.min(112, Math.floor((frameWidth - 42) / 2));
  const buttonY = frame.y + frame.height - 31;
  return {
    frame,
    refreshButton: { x: frame.x + 16, y: buttonY, width: buttonWidth, height: BUTTON_HEIGHT.regular },
    laterButton: {
      x: frame.x + frame.width - 16 - buttonWidth,
      y: buttonY,
      width: buttonWidth,
      height: BUTTON_HEIGHT.regular,
    },
  };
}

function barrelSealButtonRect(rect: UiRect): UiRect {
  return { x: rect.x + 48, y: rect.y + 108, width: rect.width - 96, height: 22 };
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
  readonly canAdministerWorld?: boolean;
  readonly pwaUpdateVisible?: boolean;
}

export function nameplateRect(centerX: number, y: number, text: string, leadingIcon = false): UiRect {
  const width = measurePixelText(fitLabel(text, 20))
    + NAMEPLATE_HORIZONTAL_PADDING * 2
    + (leadingIcon ? 9 : 0);
  return {
    x: Math.round(centerX - width / 2),
    y: Math.round(y),
    width,
    height: NAMEPLATE_HEIGHT,
  };
}

export function offlineNameplateFrameAt(elapsedMs: number, frameCount: number, fps = 6): number {
  if (!Number.isFinite(elapsedMs) || frameCount <= 0 || fps <= 0) return 0;
  return Math.floor(Math.max(0, elapsedMs) * fps / 1_000) % Math.max(1, Math.floor(frameCount));
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
  const craftingWidth = Math.max(1, Math.min(560, width - 12));
  const craftingHeight = Math.max(1, Math.min(260, height - 12));
  const craftingWindow = {
    x: Math.round((width - craftingWidth) / 2),
    y: Math.round((height - craftingHeight) / 2),
    width: craftingWidth,
    height: craftingHeight,
  };
  const chestStorageFrame = layoutStorageFrame({ width, height }, CHEST_STORAGE_FRAME_SPEC, options.chestFrame);
  const chestWindow = chestStorageFrame.frame;
  type SystemMenuAction = 'resume' | 'settings' | 'help' | 'developer' | 'fullscreen' | 'update' | 'signOut' | 'quit';
  const visibleSystemMenuActions: SystemMenuAction[] = ['resume', 'settings', 'help'];
  if (options.canAdministerWorld === true) visibleSystemMenuActions.push('developer');
  visibleSystemMenuActions.push('fullscreen');
  if (options.pwaUpdateVisible === true) visibleSystemMenuActions.push('update');
  visibleSystemMenuActions.push('signOut', 'quit');
  const systemWidth = Math.min(width - 12, 190);
  const systemButtonGap = 3;
  const systemButtonTopInset = 30;
  const systemButtonBottomInset = 18;
  const systemMaxHeight = Math.max(1, height - 12);
  const systemButtonHeight = Math.max(16, Math.min(BUTTON_HEIGHT.regular, Math.floor(
    (systemMaxHeight - systemButtonTopInset - systemButtonBottomInset
      - systemButtonGap * (visibleSystemMenuActions.length - 1)) / visibleSystemMenuActions.length,
  )));
  const systemHeight = Math.min(systemMaxHeight,
    systemButtonTopInset + systemButtonBottomInset
      + visibleSystemMenuActions.length * systemButtonHeight
      + (visibleSystemMenuActions.length - 1) * systemButtonGap);
  const systemWindow = {
    x: Math.round((width - systemWidth) / 2), y: Math.round((height - systemHeight) / 2),
    width: systemWidth, height: systemHeight,
  };
  const settingsWidth = Math.max(1, Math.min(440, width - 12));
  const settingsHeight = Math.max(1, Math.min(252, height - 12));
  const settingsWindow = {
    x: Math.round((width - settingsWidth) / 2), y: Math.round((height - settingsHeight) / 2),
    width: settingsWidth, height: settingsHeight,
  };
  const settingsTabWidth = Math.min(106, Math.max(76, Math.floor(settingsWindow.width * 0.26)));
  const settingsTabHeight = Math.max(14, Math.min(24, Math.floor(
    (settingsWindow.height - 70 - (SETTINGS_TABS.length - 1) * 2) / SETTINGS_TABS.length,
  )));
  const settingsTabs = Object.fromEntries(SETTINGS_TABS.map((tab, index) => [tab, {
    x: settingsWindow.x + 14,
    y: settingsWindow.y + 31 + index * (settingsTabHeight + 2),
    width: settingsTabWidth,
    height: settingsTabHeight,
  }])) as unknown as Readonly<Record<SettingsTab, UiRect>>;
  const settingsContent = {
    x: settingsWindow.x + settingsTabWidth + 24,
    y: settingsWindow.y + 31,
    width: Math.max(80, settingsWindow.width - settingsTabWidth - 38),
    height: Math.max(80, settingsWindow.height - 48),
  };
  const videoRowHeight = Math.max(14, Math.min(27, Math.floor((settingsContent.height - 38) / 6)));
  const lightingModelButton = {
    x: settingsContent.x + Math.floor(settingsContent.width * 0.5),
    y: settingsContent.y + 23 + 4 * videoRowHeight,
    width: Math.max(40, settingsContent.width * 0.5 - 10),
    height: Math.min(18, videoRowHeight),
  };
  const settingsRowStep = Math.max(18, Math.min(30, Math.floor((settingsContent.height - 28) / 5)));
  const settingsRowY = (row: number): number => settingsContent.y + 18 + row * settingsRowStep;
  const settingsSliderLabelSpace = Math.min(72, Math.max(70, Math.floor(settingsContent.width * 0.25)));
  const settingsSliderRightSpace = Math.min(112, Math.max(96, Math.floor(settingsContent.width * 0.4)));
  const settingsSlider = (row: number): UiRect => ({
    x: settingsContent.x + settingsSliderLabelSpace,
    y: settingsRowY(row),
    width: Math.max(40, settingsContent.width - settingsSliderRightSpace),
    height: 16,
  });
  const developerWidth = Math.max(1, Math.min(440, width - 12));
  const developerHeight = Math.max(1, Math.min(252, height - 12));
  const developerWindow = { x: Math.round((width - developerWidth) / 2), y: Math.round((height - developerHeight) / 2), width: developerWidth, height: developerHeight };
  const developerTabWidth = Math.min(106, Math.max(76, Math.floor(developerWindow.width * 0.26)));
  const developerTabs = Object.fromEntries(DEVELOPER_TABS.map((tab, index) => [tab, {
    x: developerWindow.x + 14,
    y: developerWindow.y + 31 + index * 28,
    width: developerTabWidth,
    height: 24,
  }])) as unknown as Readonly<Record<DeveloperTab, UiRect>>;
  const developerContent = {
    x: developerWindow.x + developerTabWidth + 24,
    y: developerWindow.y + 31,
    width: Math.max(80, developerWindow.width - developerTabWidth - 38),
    height: Math.max(80, developerWindow.height - 48),
  };
  const paperOrigin = { x: inventoryWindow.x + 22, y: inventoryWindow.y + 51 };
  const equipmentCells = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]] as const;
  const inventoryBackpackColumns = inventoryWindow.width < 400 ? 5 : INVENTORY_BACKPACK_COLUMNS;
  const inventoryBackpackGridWidth = inventoryBackpackColumns * 31 - 3;
  const inventoryBackpackRegionWidth = inventoryBackpackGridWidth + 18;
  const backpackOrigin = {
    x: inventoryWindow.x + inventoryWindow.width - 12 - inventoryBackpackRegionWidth,
    y: inventoryWindow.y + 51,
  };
  const craftingBackpackColumns = craftingWindow.width < 430 ? 4 : 5;
  const craftingBackpackGridWidth = craftingBackpackColumns * 31 - 3;
  const craftingBackpackOrigin = {
    x: craftingWindow.x + craftingWindow.width - 17 - craftingBackpackGridWidth,
    y: craftingWindow.y + 54,
  };
  const craftingRecipeX = craftingWindow.x + 18;
  // On phone-width canvases the result slot moves ten pixels closer to the
  // grid. This preserves the left-to-right recipe -> grid -> result ->
  // backpack flow without allowing the result to sit beneath the backpack.
  const craftingResultOffset = craftingWindow.width < 390 ? 98 : 112;
  const craftingFlowWidth = craftingResultOffset + 28;
  const craftingRecipeWidth = Math.max(56, Math.min(154,
    craftingBackpackOrigin.x - craftingRecipeX - craftingFlowWidth - 10));
  const craftingGridX = craftingRecipeX + craftingRecipeWidth + 10;
  const craftingRecipeVisibleRows = Math.max(4, Math.min(8,
    Math.floor((craftingWindow.height - 112) / 17)));
  const barrelOrigin = {
    x: inventoryWindow.x + Math.round((inventoryWindow.width - 4 * 34) / 2),
    y: inventoryWindow.y + 58,
  };
  const processorPane = {
    x: inventoryWindow.x + 18,
    y: inventoryWindow.y + 38,
    width: Math.max(72, backpackOrigin.x - inventoryWindow.x - 28),
    height: inventoryWindow.height - 102,
  };
  const cookingTop = inventoryWindow.y + 43;
  const cookingGroupWidth = 56;
  const cookingGroupX = processorPane.x + Math.round((processorPane.width - cookingGroupWidth) / 2);
  const furnaceGroupWidth = 143;
  const furnaceGroupX = processorPane.x + Math.round((processorPane.width - furnaceGroupWidth) / 2);
  const furnaceInputX = furnaceGroupX;
  const furnaceOutputX = furnaceGroupX + 78;
  const furnaceProgressX = furnaceGroupX + 112;
  const pressProgressY = inventoryWindow.y + inventoryWindow.height - 95;
  const chestPane = chestStorageFrame.panes.find((pane) => pane.id === 'chest')!;
  const chestBackpackPane = chestStorageFrame.panes.find((pane) => pane.id === 'backpack')!;
  // Modal hotbars always remain a single ten-slot row. They must not inherit
  // the compact HUD's five-column width or the row appears shifted right.
  const windowHotbarWidth = (HOTBAR_SLOT_COUNT - 1) * SLOT_WIDTH + 28;
  const inventoryHotbarX = Math.round((width - windowHotbarWidth) / 2);
  const systemContentX = systemWindow.x + 18;
  const systemContentWidth = systemWindow.width - 36;
  const hiddenSystemButton: UiRect = {
    x: systemContentX,
    y: systemWindow.y + systemButtonTopInset,
    width: 0,
    height: systemButtonHeight,
  };
  const systemMenuButtons = Object.fromEntries(visibleSystemMenuActions.map((action, index) => [action, {
    x: systemContentX,
    y: systemWindow.y + systemButtonTopInset + index * (systemButtonHeight + systemButtonGap),
    width: systemContentWidth,
    height: systemButtonHeight,
  }])) as Partial<Record<SystemMenuAction, UiRect>>;
  const systemMenuButton = (action: SystemMenuAction): UiRect => systemMenuButtons[action] ?? hiddenSystemButton;
  return {
    status,
    currency,
    previousDayButton: { x: developerContent.x + 8, y: developerContent.y + 25, width: 58, height: 20 },
    timeSlider: { x: developerContent.x + 72, y: developerContent.y + 27, width: Math.max(32, developerContent.width - 144), height: 16 },
    nextDayButton: { x: developerContent.x + developerContent.width - 66, y: developerContent.y + 25, width: 58, height: 20 },
    weatherButton: { x: developerContent.x + 8, y: developerContent.y + 56, width: developerContent.width - 16, height: 22 },
    windDirectionButton: { x: developerContent.x + 8, y: developerContent.y + 84, width: developerContent.width - 16, height: 22 },
    lightingEffectsButton: { x: developerContent.x + developerContent.width - 48, y: developerContent.y + 32, width: 40, height: 18 },
    orePreviewButton: { x: developerContent.x + developerContent.width - 48, y: developerContent.y + 67, width: 40, height: 18 },
    skillPointButtons: Object.fromEntries(SKILL_TRACKS.map((track, index) => [track, {
      x: developerContent.x + 8 + index * Math.floor((developerContent.width - 12) / 3),
      y: developerContent.y + 36,
      width: Math.floor((developerContent.width - 28) / 3),
      height: 22,
    }])) as unknown as Readonly<Record<SkillTrack, UiRect>>,
    backpackCapacityDownButton: { x: developerContent.x + 8, y: developerContent.y + 82, width: 58, height: 22 },
    backpackCapacityUpButton: { x: developerContent.x + developerContent.width - 66, y: developerContent.y + 82, width: 58, height: 22 },
    resetQuestsButton: {
      x: developerContent.x + 14,
      y: developerContent.y + 56,
      width: developerContent.width - 28,
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
    craftingWindow,
    chestWindow,
    chestStorageFrame,
    systemWindow,
    settingsWindow,
    settingsContent,
    settingsTabs,
    lightingModelButton,
    developerWindow,
    developerContent,
    developerTabs,
    progressionWindow: progressionWindowRect(width, height),
    closeButton: { x: window.x + window.width - 24, y: window.y + 8, width: 16, height: 16 },
    equipmentSlots: equipmentCells.map(([column, row]) => ({ x: paperOrigin.x + column * 31, y: paperOrigin.y + row * 34, width: 28, height: 31 })),
    backpackSlots: Array.from({ length: BACKPACK_SLOT_COUNT }, (_, index) => ({ x: backpackOrigin.x + index % inventoryBackpackColumns * 31, y: backpackOrigin.y + Math.floor(index / inventoryBackpackColumns) * 31, width: 28, height: 31 })),
    inventoryHotbarSlots: Array.from({ length: HOTBAR_SLOT_COUNT }, (_, slot) => ({ x: inventoryHotbarX + slot * SLOT_WIDTH, y: inventoryWindow.y + inventoryWindow.height - 48, width: 28, height: 31 })),
    inventorySortButton: { x: backpackOrigin.x + inventoryBackpackGridWidth - 16, y: inventoryWindow.y + 31, width: 16, height: 16 },
    inventoryFilter: { x: backpackOrigin.x, y: inventoryWindow.y + 28, width: Math.max(40, inventoryBackpackGridWidth - 23), height: 20 },
    inventoryBackpackViewport: { x: backpackOrigin.x, y: backpackOrigin.y, width: inventoryBackpackGridWidth, height: 93 },
    inventoryBackpackScroll: { x: backpackOrigin.x + inventoryBackpackGridWidth + 4, y: backpackOrigin.y, width: 14, height: 93 },
    inventoryBackpackColumns,
    craftingInventoryFilter: {
      x: craftingBackpackOrigin.x,
      y: craftingWindow.y + 29,
      width: Math.max(40, craftingBackpackGridWidth - 21),
      height: 20,
    },
    craftingBackpackSortButton: {
      x: craftingBackpackOrigin.x + craftingBackpackGridWidth - 16,
      y: craftingWindow.y + 31,
      width: 16,
      height: 16,
    },
    craftingSlots: Array.from({ length: CRAFTING_SLOT_COUNT }, (_, index) => ({
      x: craftingGridX + index % 3 * 31,
      y: craftingWindow.y + 54 + Math.floor(index / 3) * 31,
      width: 28,
      height: 31,
    })),
    craftingResult: { x: craftingGridX + craftingResultOffset, y: craftingWindow.y + 85, width: 28, height: 31 },
    craftingInventorySlots: Array.from({ length: BACKPACK_SLOT_COUNT }, (_, index) => ({
      x: craftingBackpackOrigin.x + index % craftingBackpackColumns * 31,
      y: craftingBackpackOrigin.y + Math.floor(index / craftingBackpackColumns) * 31,
      width: 28,
      height: 31,
    })),
    craftingRecipeRows: Array.from({ length: craftingRecipeVisibleRows }, (_, index) => ({
      x: craftingRecipeX,
      y: craftingWindow.y + 51 + index * 17,
      width: Math.max(40, craftingRecipeWidth - 15),
      height: 15,
    })),
    craftingRecipeScroll: {
      x: craftingRecipeX + craftingRecipeWidth - 13,
      y: craftingWindow.y + 51,
      width: 13,
      height: craftingRecipeVisibleRows * 17 - 2,
    },
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
    furnaceSlots: [
      { x: furnaceInputX, y: cookingTop, width: 28, height: 31 },
      { x: furnaceInputX, y: cookingTop + 62, width: 28, height: 31 },
      { x: furnaceOutputX, y: cookingTop + 31, width: 28, height: 31 },
    ],
    furnaceProgress: {
      x: furnaceProgressX,
      y: cookingTop,
      width: 16,
      height: 93,
    },
    furnaceTimer: { x: furnaceProgressX - 9, y: cookingTop + 96, width: 34, height: 10 },
    furnaceStatus: {
      x: processorPane.x,
      y: cookingTop + 108,
      width: processorPane.width,
      height: 12,
    },
    pressSlots: [
      { x: processorPane.x, y: inventoryWindow.y + 52, width: 28, height: 31 },
      { x: processorPane.x, y: inventoryWindow.y + 92, width: 28, height: 31 },
      { x: processorPane.x + processorPane.width - 28, y: inventoryWindow.y + 72, width: 28, height: 31 },
    ],
    pressProgress: { x: processorPane.x, y: pressProgressY, width: processorPane.width, height: 12 },
    cookingSlots: [
      { x: cookingGroupX, y: cookingTop, width: 28, height: 31 },
      { x: cookingGroupX, y: cookingTop + 62, width: 28, height: 31 },
    ],
    cookingProgress: { x: cookingGroupX + 40, y: cookingTop, width: 16, height: 93 },
    cookingTimer: { x: cookingGroupX + 31, y: cookingTop + 96, width: 34, height: 10 },
    processorStatus: {
      x: processorPane.x,
      y: cookingTop + 108,
      width: processorPane.width,
      height: 12,
    },
    resumeButton: systemMenuButton('resume'),
    settingsButton: systemMenuButton('settings'),
    helpButton: systemMenuButton('help'),
    developerButton: systemMenuButton('developer'),
    fullscreenButton: systemMenuButton('fullscreen'),
    updateButton: systemMenuButton('update'),
    signOutButton: systemMenuButton('signOut'),
    quitButton: systemMenuButton('quit'),
    masterSlider: settingsSlider(0),
    musicSlider: settingsSlider(1),
    sfxSlider: settingsSlider(2),
    audioMuteButtons: {
      master: { x: settingsContent.x + 4, y: settingsRowY(0) - 2, width: 20, height: 20 },
      music: { x: settingsContent.x + 4, y: settingsRowY(1) - 2, width: 20, height: 20 },
      sfx: { x: settingsContent.x + 4, y: settingsRowY(2) - 2, width: 20, height: 20 },
    },
    musicBackgroundToggle: {
      x: settingsContent.x + settingsContent.width - 42, y: settingsRowY(3) - 1, width: 40, height: 18,
    },
    soundsBackgroundToggle: {
      x: settingsContent.x + settingsContent.width - 42, y: settingsRowY(4) - 1, width: 40, height: 18,
    },
    nameplatesToggle: {
      x: settingsContent.x + settingsContent.width - 42, y: settingsContent.y + 30, width: 40, height: 18,
    },
    settingsBackButton: {
      x: settingsWindow.x + 14,
      y: settingsWindow.y + settingsWindow.height - 28,
      width: settingsTabWidth,
      height: 20,
    },
    developerBackButton: {
      x: developerWindow.x + 14,
      y: developerWindow.y + developerWindow.height - 28,
      width: developerTabWidth,
      height: 20,
    },
  };
}

function fitLabel(text: string, characters: number): string {
  return text.length <= characters ? text : `${text.slice(0, Math.max(0, characters - 3))}...`;
}

function drawLabel(context: CanvasRenderingContext2D, ui: PixelUi, text: string, x: number, y: number, options: { align?: CanvasTextAlign; color?: string; font?: 'body' | 'header' } = {}): void {
  drawPixelText(context, ui, text, Math.round(x), Math.round(y), { align: options.align, color: options.color ?? '#3f2d25', font: options.font });
}

function drawMenuButton(
  context: CanvasRenderingContext2D,
  skin: UiSkin,
  fonts: PixelUi,
  pointer: UiPoint,
  rect: UiRect,
  label: string,
  options: {
    readonly tone?: FantasyButtonTone;
    readonly glyph?: FantasyButtonGlyph;
    readonly disabled?: boolean;
    readonly active?: boolean;
    readonly compact?: boolean;
  } = {},
): void {
  const tone = options.tone ?? (options.active === true ? 'green' : 'peach');
  drawFantasyButton(context, skin, fonts, rect, {
    tone,
    shape: options.compact === true || options.active === true ? 'square' : 'chamfered',
    ...(options.compact === true ? { size: 'small' as const } : {}),
    state: options.disabled === true ? 'disabled' : 'idle',
    hovered: options.disabled !== true && containsPoint(rect, pointer),
    hoverOutline: 'gold',
    ...(options.compact === true ? {} : { label }),
    ...(options.glyph === undefined ? {} : { glyph: options.glyph }),
  });
}

function drawInsetPanel(context: CanvasRenderingContext2D, skin: UiSkin, rect: UiRect): void {
  drawUiSkinAsset(context, skin.frameThin, rect);
  context.save();
  context.fillStyle = '#ead0aa44';
  context.fillRect(rect.x + 6, rect.y + 7, Math.max(0, rect.width - 12), Math.max(0, rect.height - 14));
  context.restore();
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
  private readonly lightingEffectsToggle: Toggle;
  private readonly orePreviewToggle: Toggle;
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
  private readonly furnaceItemSlots: ItemSlot[];
  private readonly cookingFireItemSlots: ItemSlot[];
  private readonly pressItemSlots: ItemSlot[];
  private readonly fermentationItemSlots: ItemSlot[];
  private readonly backpackSortNode: WidgetNode;
  private readonly chestSortNode: WidgetNode;
  private readonly barrelSortNode: WidgetNode;
  private readonly resumeNode: WidgetNode;
  private readonly helpNode: WidgetNode;
  private readonly settingsNode: WidgetNode;
  private readonly fullscreenNode: WidgetNode;
  private readonly updateNode: WidgetNode;
  private readonly updatePromptNode: WidgetNode;
  private readonly updateRefreshButton: CanvasButton;
  private readonly updateLaterButton: CanvasButton;
  private readonly developerNode: WidgetNode;
  private readonly signOutNode: WidgetNode;
  private readonly quitNode: WidgetNode;
  private readonly settingsBackNode: WidgetNode;
  private readonly developerBackNode: WidgetNode;
  private readonly settingsTabNodes: Readonly<Record<SettingsTab, WidgetNode>>;
  private readonly lightingModelNode: WidgetNode;
  private readonly developerTabNodes: Readonly<Record<DeveloperTab, WidgetNode>>;
  private readonly masterSlider: Slider;
  private readonly musicSlider: Slider;
  private readonly sfxSlider: Slider;
  private readonly audioMuteNodes: Readonly<Record<AudioVolumeBus, WidgetNode>>;
  private readonly musicBackgroundToggle: Toggle;
  private readonly soundsBackgroundToggle: Toggle;
  private readonly nameplatesToggle: Toggle;
  private readonly windowRibbon: Ribbon;
  private readonly zoneRibbon: Ribbon;
  private readonly helpBook: HelpBook;
  private readonly onlinePlayersScrollBar: ScrollBar;
  private readonly inventoryScrollBar: ScrollBar;
  private readonly craftingRecipeScrollBar: ScrollBar;
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
    nameplatesVisible: true,
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
  private onlinePlayerRows: readonly { readonly player: OnlinePlayerListEntry; readonly rect: UiRect }[] = [];
  private pendingTouchRecipeId: string | null = null;
  private zoneCollapsed = false;
  private minimapCollapsed = false;
  private minimapZoomIndex = 1;
  private sortButtonPressed: 'backpack' | 'chest' | 'placeable' | null = null;
  private sortButtonPressedAt = Number.NEGATIVE_INFINITY;
  private updatePromptDismissed = false;
  private updatePrompt = pwaUpdatePromptLayout(480, 270);
  private settingsTab: SettingsTab = 'gameplay';
  private developerTab: DeveloperTab = 'world';
  private readonly audioRestoreVolume: Record<AudioVolumeBus, number> = {
    master: 0.8,
    music: 0.7,
    sfx: 0.35,
  };

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
    this.craftingRecipeScrollBar = new ScrollBar(skin);
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
    this.lightingEffectsToggle = new Toggle({
      id: 'window.developer.lighting-effects', skin, fonts,
      onChange: () => this.callbacks.toggleLightingEffects(),
    });
    this.orePreviewToggle = new Toggle({
      id: 'window.developer.cellar-ore-preview', skin, fonts,
      onChange: () => this.callbacks.toggleCellarOrePreview?.(),
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
    this.furnaceItemSlots = [
      new ItemSlot('window.furnace.input', 'placeable', FURNACE_INPUT_SLOT, { acceptedKinds: Object.keys(SMELTING_RECIPES) }),
      new ItemSlot('window.furnace.fuel', 'placeable', FURNACE_FUEL_SLOT, { acceptedKinds: ['wood', 'plank'] }),
      new ItemSlot('window.furnace.output', 'placeable', FURNACE_OUTPUT_SLOT, { readOnly: true }),
    ];
    this.cookingFireItemSlots = [
      new ItemSlot('window.cooking-fire.input', 'placeable', COOKING_FIRE_INPUT_SLOT, {
        acceptedKinds: Object.values(CAMPFIRE_COOKING_RECIPES).map((recipe) => recipe.inputKind),
      }),
      new ItemSlot('window.cooking-fire.output', 'placeable', COOKING_FIRE_OUTPUT_SLOT, { readOnly: true }),
    ];
    this.pressItemSlots = [
      new ItemSlot('window.press.input', 'placeable', PRESS_INPUT_SLOT, { acceptedKinds: PRESSABLE_FRUIT_KINDS }),
      new ItemSlot('window.press.must', 'placeable', PRESS_MUST_OUTPUT_SLOT, { readOnly: true }),
      new ItemSlot('window.press.pomace', 'placeable', PRESS_POMACE_OUTPUT_SLOT, { readOnly: true }),
    ];
    this.fermentationItemSlots = [
      new ItemSlot('window.fermentation.input', 'placeable', FERMENTATION_INPUT_SLOT, { acceptedKinds: ['must'] }),
      new ItemSlot('window.fermentation.output', 'placeable', FERMENTATION_OUTPUT_SLOT, { readOnly: true }),
    ];
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
    this.updatePromptNode = widget('window', 'pwa.update-prompt', { capturePointer: true });
    this.updateRefreshButton = new CanvasButton({
      id: 'pwa.update-prompt.refresh', skin, fonts, label: 'REFRESH NOW', tone: 'success',
      onPress: () => this.callbacks.applyClientUpdate(),
    });
    this.updateLaterButton = new CanvasButton({
      id: 'pwa.update-prompt.later', skin, fonts, label: 'LATER',
      onPress: () => {
        this.updatePromptDismissed = true;
        this.updatePromptNode.visible = false;
      },
    });
    this.updatePromptNode.add(this.updateRefreshButton.node, this.updateLaterButton.node);
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
    this.settingsTabNodes = Object.fromEntries(SETTINGS_TABS.map((tab) => [tab, widget(
      'button', `window.settings.tab.${tab}`, {
        onPointer: (event) => {
          if (event.kind !== 'pointer_down' || event.button !== 0) return false;
          this.settingsTab = tab;
          this.syncActiveWindow();
          return true;
        },
      },
    )])) as unknown as Readonly<Record<SettingsTab, WidgetNode>>;
    this.lightingModelNode = widget('button', 'window.settings.video.lighting-model', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down' || event.button !== 0) return false;
        const current = this.model.lightingModel ?? 'classic';
        this.callbacks.setLightingModel?.(current === 'unified' ? 'classic' : 'unified');
        return true;
      },
    });
    this.developerTabNodes = Object.fromEntries(DEVELOPER_TABS.map((tab) => [tab, widget(
      'button', `window.developer.tab.${tab}`, {
        onPointer: (event) => {
          if (event.kind !== 'pointer_down' || event.button !== 0) return false;
          this.developerTab = tab;
          this.syncActiveWindow();
          return true;
        },
      },
    )])) as unknown as Readonly<Record<DeveloperTab, WidgetNode>>;
    this.masterSlider = new Slider({
      id: 'window.settings.master', skin, tone: 'gold',
      onChange: (value) => this.callbacks.setAudioVolume('master', value),
    });
    this.musicSlider = new Slider({
      id: 'window.settings.music', skin, tone: 'green',
      onChange: (value) => this.callbacks.setAudioVolume('music', value),
    });
    this.sfxSlider = new Slider({
      id: 'window.settings.sfx', skin, tone: 'peach',
      onChange: (value) => this.callbacks.setAudioVolume('sfx', value),
    });
    this.audioMuteNodes = Object.fromEntries((['master', 'music', 'sfx'] as const).map((bus) => [bus, widget(
      'button', `window.settings.${bus}.mute`, {
        onPointer: (event) => {
          if (event.kind !== 'pointer_down' || event.button !== 0) return false;
          this.toggleAudioMute(bus);
          return true;
        },
      },
    )])) as unknown as Readonly<Record<AudioVolumeBus, WidgetNode>>;
    this.musicBackgroundToggle = new Toggle({
      id: 'window.settings.music-background', skin, fonts,
      onChange: (value) => this.callbacks.setAudioBackground('music', value),
    });
    this.soundsBackgroundToggle = new Toggle({
      id: 'window.settings.sounds-background', skin, fonts,
      onChange: (value) => this.callbacks.setAudioBackground('sounds', value),
    });
    this.nameplatesToggle = new Toggle({
      id: 'window.settings.nameplates', skin, fonts, value: true,
      onChange: (value) => this.callbacks.setNameplatesVisible?.(value),
    });
    this.windowNode.add(
      this.closeNode,
      ...this.inventoryHotbarSlots.map((slot) => slot.node),
      ...this.backpackItemSlots.map((slot) => slot.node),
      ...this.equipmentItemSlots.map((slot) => slot.node),
      ...this.craftingItemSlots.map((slot) => slot.node),
      ...this.chestItemSlots.map((slot) => slot.node),
      ...this.barrelItemSlots.map((slot) => slot.node),
      ...this.furnaceItemSlots.map((slot) => slot.node),
      ...this.cookingFireItemSlots.map((slot) => slot.node),
      ...this.pressItemSlots.map((slot) => slot.node),
      ...this.fermentationItemSlots.map((slot) => slot.node),
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
      ...SETTINGS_TABS.map((tab) => this.settingsTabNodes[tab]),
      this.lightingModelNode,
      ...DEVELOPER_TABS.map((tab) => this.developerTabNodes[tab]),
      this.previousDayNode,
      this.timeSlider.node,
      this.nextDayNode,
      this.weatherModeNode,
      this.windDirectionNode,
      this.lightingEffectsToggle.node,
      this.backpackCapacityDownNode,
      this.backpackCapacityUpNode,
      this.orePreviewToggle.node,
      ...SKILL_TRACKS.map((track) => this.skillPointNodes[track]),
      this.resetQuestsButton.node,
      this.masterSlider.node,
      this.musicSlider.node,
      this.sfxSlider.node,
      ...(['master', 'music', 'sfx'] as const).map((bus) => this.audioMuteNodes[bus]),
      this.musicBackgroundToggle.node,
      this.soundsBackgroundToggle.node,
      this.nameplatesToggle.node,
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
      this.updatePromptNode,
    );
    this.router = new UiInputRouter(this.root);
  }

  get openWindow(): OverworldWindow | null { return this.openWindowValue; }
  get selectedSettingsTab(): SettingsTab { return this.settingsTab; }
  get selectedDeveloperTab(): DeveloperTab { return this.developerTab; }
  get blockingUpdatePromptVisible(): boolean {
    return this.model.pwaUpdateStatus === 'available' && !this.updatePromptDismissed;
  }
  get minimapBounds(): UiRect {
    return this.minimapCollapsed ? this.layout.collapsedMinimapTab : this.layout.minimap;
  }

  private toggleAudioMute(bus: AudioVolumeBus): void {
    const current = this.model.audioVolumes[bus];
    if (current > 0.001) {
      this.audioRestoreVolume[bus] = current;
      this.callbacks.setAudioVolume(bus, 0);
      return;
    }
    this.callbacks.setAudioVolume(bus, Math.max(0.05, this.audioRestoreVolume[bus]));
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
    if ((this.openWindowValue === 'barrel' || this.openWindowValue === 'furnace' || this.openWindowValue === 'cooking'
      || this.openWindowValue === 'press' || this.openWindowValue === 'fermentation')
      && nextWindow !== this.openWindowValue) this.callbacks.closePlaceable();
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
    const previousUpdateStatus = this.model.pwaUpdateStatus;
    this.model = model;
    if (model.pwaUpdateStatus !== 'available' || previousUpdateStatus !== 'available') {
      this.updatePromptDismissed = false;
    }
    if (model.character !== undefined) this.characterScreen.update(model.character);
    if (model.skills !== undefined) this.skillTree.update(model.skills);
    this.questLog.update(model.quests ?? []);
    if (this.openWindowValue === 'developer' && !model.canAdministerWorld) this.openWindowValue = 'system';
    this.layout = overworldUiLayout(model.width, model.height, {
      ...(this.chestFrameOverride === null ? {} : { chestFrame: this.chestFrameOverride }),
      touchControls: model.touchControls === true,
      canAdministerWorld: model.canAdministerWorld,
      pwaUpdateVisible: model.pwaUpdateStatus !== undefined && model.pwaUpdateStatus !== 'unsupported',
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
    this.lightingEffectsToggle.setBounds(this.layout.lightingEffectsButton);
    this.orePreviewToggle.setBounds(this.layout.orePreviewButton);
    this.lightingEffectsToggle.value = model.lightingEffectsDisabled !== true;
    this.orePreviewToggle.value = model.cellarOrePreview === true;
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
    this.furnaceItemSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.furnaceSlots[index]!); slot.enabled = true; slot.item = placeableBySlot.get(index) ?? null;
    });
    this.cookingFireItemSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.cookingSlots[index]!);
      slot.enabled = true;
      slot.item = placeableBySlot.get(index) ?? null;
    });
    this.pressItemSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.pressSlots[index]!);
      slot.enabled = true;
      slot.item = placeableBySlot.get(index) ?? null;
    });
    this.fermentationItemSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.cookingSlots[index]!);
      slot.enabled = true;
      slot.item = placeableBySlot.get(index) ?? null;
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
    this.fullscreenNode.enabled = model.fullscreenAvailable ?? true;
    this.updateNode.setBounds(this.layout.updateButton);
    this.updateNode.enabled = model.pwaUpdateStatus !== undefined
      && model.pwaUpdateStatus !== 'unsupported'
      && model.pwaUpdateStatus !== 'checking'
      && model.pwaUpdateStatus !== 'updating';
    this.updatePrompt = pwaUpdatePromptLayout(model.width, model.height);
    this.updatePromptNode.setBounds({ x: 0, y: 0, width: model.width, height: model.height });
    this.updatePromptNode.visible = this.blockingUpdatePromptVisible;
    this.updateRefreshButton.setBounds(this.updatePrompt.refreshButton);
    this.updateLaterButton.setBounds(this.updatePrompt.laterButton);
    this.updateRefreshButton.enabled = model.pwaUpdateStatus === 'available';
    this.updateLaterButton.enabled = model.pwaUpdateStatus === 'available';
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
    for (const tab of SETTINGS_TABS) this.settingsTabNodes[tab].setBounds(this.layout.settingsTabs[tab]);
    this.lightingModelNode.setBounds(this.layout.lightingModelButton);
    for (const tab of DEVELOPER_TABS) this.developerTabNodes[tab].setBounds(this.layout.developerTabs[tab]);
    this.masterSlider.setBounds(this.layout.masterSlider);
    this.musicSlider.setBounds(this.layout.musicSlider);
    this.sfxSlider.setBounds(this.layout.sfxSlider);
    for (const bus of ['master', 'music', 'sfx'] as const) {
      this.audioMuteNodes[bus].setBounds(this.layout.audioMuteButtons[bus]);
      if (model.audioVolumes[bus] > 0.001) this.audioRestoreVolume[bus] = model.audioVolumes[bus];
    }
    this.musicBackgroundToggle.setBounds(this.layout.musicBackgroundToggle);
    this.soundsBackgroundToggle.setBounds(this.layout.soundsBackgroundToggle);
    this.nameplatesToggle.setBounds(this.layout.nameplatesToggle);
    this.masterSlider.value = model.audioVolumes.master;
    this.musicSlider.value = model.audioVolumes.music;
    this.sfxSlider.value = model.audioVolumes.sfx;
    this.musicBackgroundToggle.value = model.audioBackground?.music ?? false;
    this.soundsBackgroundToggle.value = model.audioBackground?.sounds ?? false;
    this.nameplatesToggle.value = model.nameplatesVisible ?? true;
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
    const scrollable = this.openWindowValue === 'inventory'
      || this.openWindowValue === 'furnace'
      || this.openWindowValue === 'cooking'
      || this.openWindowValue === 'press'
      || this.openWindowValue === 'fermentation';
    if (!scrollable) return;
    const capacity = this.model.backpackSlotCapacity
      ?? (this.model.hasBackpack ? BACKPACK_SLOT_COUNT : DEFAULT_INVENTORY_SLOTS);
    const slots = this.openWindowValue === 'inventory'
      ? this.filteredInventoryBackpackSlots()
      : this.backpackItemSlots.filter((_slot, index) => index < capacity);
    const columns = this.layout.inventoryBackpackColumns;
    this.inventoryScrollBar.setMetrics(Math.ceil(slots.length / columns), INVENTORY_BACKPACK_VISIBLE_ROWS);
    this.inventoryScrollBar.setBounds(this.layout.inventoryBackpackScroll);
    const first = this.inventoryScrollBar.position * columns;
    this.backpackItemSlots.forEach((slot) => { slot.visible = false; });
    slots.slice(first, first + columns * INVENTORY_BACKPACK_VISIBLE_ROWS).forEach((slot, visibleIndex) => {
      slot.visible = true;
      slot.setBounds({
        x: this.layout.inventoryBackpackViewport.x + visibleIndex % columns * 31,
        y: this.layout.inventoryBackpackViewport.y + Math.floor(visibleIndex / columns) * 31,
        width: 28,
        height: 31,
      });
    });
  }

  private syncCraftingBackpackSlots(): void {
    if (this.openWindowValue !== 'crafting') return;
    const slots = this.filteredInventoryBackpackSlots();
    this.backpackItemSlots.forEach((slot) => { slot.visible = false; });
    slots.slice(0, this.layout.craftingInventorySlots.length).forEach((slot, visibleIndex) => {
      slot.visible = true;
      slot.setBounds(this.layout.craftingInventorySlots[visibleIndex]!);
    });
  }

  private syncCraftingRecipeScroll(): void {
    const entries = this.recipeBookEntries();
    this.craftingRecipeScrollBar.setMetrics(entries.length, this.layout.craftingRecipeRows.length);
    this.craftingRecipeScrollBar.setBounds(this.layout.craftingRecipeScroll);
  }

  handleKeyDown(code: string, repeat: boolean, modifiers: { readonly ctrl?: boolean } = {}): boolean {
    if (repeat) return false;
    if (this.blockingUpdatePromptVisible) {
      if (code === 'Escape') {
        this.updatePromptDismissed = true;
        this.updatePromptNode.visible = false;
      } else if (code === 'Enter' || code === 'Space') this.callbacks.applyClientUpdate();
      return true;
    }
    if (this.openWindowValue === 'help' && this.helpBook.handleKeyDown(code)) return true;
    if (this.openWindowValue === 'quests'
      && this.questLog.handleKeyDown(code, this.layout.progressionWindow)) return true;
    if (this.openWindowValue === 'settings' && (code === 'ArrowUp' || code === 'ArrowDown')) {
      const current = SETTINGS_TABS.indexOf(this.settingsTab);
      const delta = code === 'ArrowUp' ? -1 : 1;
      this.settingsTab = SETTINGS_TABS[(current + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length]!;
      this.syncActiveWindow();
      return true;
    }
    if (this.openWindowValue === 'settings' && this.settingsTab === 'gameplay' && code === 'KeyN') {
      this.nameplatesToggle.toggle();
      return true;
    }
    if (this.openWindowValue === 'developer' && (code === 'ArrowUp' || code === 'ArrowDown')) {
      const current = DEVELOPER_TABS.indexOf(this.developerTab);
      const delta = code === 'ArrowUp' ? -1 : 1;
      this.developerTab = DEVELOPER_TABS[(current + delta + DEVELOPER_TABS.length) % DEVELOPER_TABS.length]!;
      this.syncActiveWindow();
      return true;
    }
    if (code === 'Escape') {
      if (this.openWindowValue === 'settings' || this.openWindowValue === 'developer' || this.openWindowValue === 'help') this.openWindow = 'system';
      else if (this.openWindowValue !== null) this.openWindow = null;
      else this.openWindow = 'system';
      return true;
    }
    if (code === 'KeyI') { this.openWindow = this.openWindowValue === 'inventory' ? null : 'inventory'; return true; }
    if (code === 'KeyC') { this.openWindow = this.openWindowValue === 'crafting' ? null : 'crafting'; return true; }
    if (code === 'KeyP') { this.openWindow = this.openWindowValue === 'character' ? null : 'character'; return true; }
    if (code === 'KeyK') { this.openWindow = this.openWindowValue === 'skills' ? null : 'skills'; return true; }
    if (code === 'KeyL') { this.openWindow = this.openWindowValue === 'quests' ? null : 'quests'; return true; }
    if (this.openWindowValue === 'barrel' && code === 'KeyS') {
      this.callbacks.sealBarrel?.();
      return true;
    }
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
    this.systemCursorMove(point);
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
    if ((this.openWindowValue === 'inventory' || this.openWindowValue === 'furnace'
      || this.openWindowValue === 'cooking' || this.openWindowValue === 'press'
      || this.openWindowValue === 'fermentation')
      && this.inventoryScrollBar.pointerMove(point)) this.syncInventoryBackpackSlots();
    if (this.openWindowValue === 'crafting') this.craftingRecipeScrollBar.pointerMove(point);
    const onlineSwiped = this.onlinePlayersScrollBar.swipeMove(point, ONLINE_PLAYER_LIST_ROW_HEIGHT);
    const inventorySwiped = this.inventoryScrollBar.swipeMove(point, 31);
    if (inventorySwiped) this.syncInventoryBackpackSlots();
    const recipesSwiped = this.craftingRecipeScrollBar.swipeMove(point, 17);
    if (onlineSwiped || inventorySwiped || recipesSwiped) {
      this.pendingTouchRecipeId = null;
      this.cancelQuickCraftPreview();
      this.cursorPress = null;
      this.inventoryOutsidePress = null;
      return;
    }
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

  pointerDown(point: UiPoint, button: number, modifiers: {
    readonly shift?: boolean;
    readonly pointerType?: string;
  } = {}): boolean {
    this.systemCursorDown(point);
    if (button === 0) {
      if (this.onlinePlayerListActive) {
        this.onlinePlayersScrollBar.beginSwipe(point, this.onlinePlayerListRect, modifiers.pointerType);
      }
      if (this.openWindowValue === 'inventory' || this.openWindowValue === 'furnace'
        || this.openWindowValue === 'cooking' || this.openWindowValue === 'press'
        || this.openWindowValue === 'fermentation') {
        this.inventoryScrollBar.beginSwipe(point, this.layout.inventoryBackpackViewport, modifiers.pointerType);
      }
      if (this.openWindowValue === 'crafting') {
        const first = this.layout.craftingRecipeRows[0];
        const last = this.layout.craftingRecipeRows.at(-1);
        if (first !== undefined && last !== undefined) this.craftingRecipeScrollBar.beginSwipe(point, {
          x: first.x,
          y: first.y,
          width: this.layout.craftingRecipeScroll.x + this.layout.craftingRecipeScroll.width - first.x,
          height: last.y + last.height - first.y,
        }, modifiers.pointerType);
      }
    }
    if (this.blockingUpdatePromptVisible) {
      if (button === 0) this.router.routePointer({ kind: 'pointer_down', point, button });
      return true;
    }
    if (button === 0 && this.onlinePlayerListActive
      && containsPoint(this.onlinePlayerListCloseButton, point)) {
      this.onlinePlayerListActive = false;
      this.callbacks.toggleOnlinePlayers();
      return true;
    }
    if (this.onlinePlayerListActive && this.model.canManageHomestead === true
      && (button === 0 || button === 2)) {
      const row = this.onlinePlayerRows.find((candidate) => containsPoint(candidate.rect, point));
      if (row !== undefined && !row.player.self && row.player.identityHex !== undefined) {
        const nextRole = button === 2 ? null : nextHomesteadMemberRole(row.player.homesteadRole);
        this.callbacks.manageHomesteadMember?.(row.player.identityHex, nextRole, button === 2);
        return true;
      }
    }
    if (this.openWindowValue === 'chest' && this.cursorPress === null
      && this.chestFrameResize.pointerDown(point, button, this.layout.chestStorageFrame)) return true;
    if (button === 0 && this.onlinePlayerListActive && this.onlinePlayersScrollBar.pointerDown(point)) return true;
    if (button === 0 && (this.openWindowValue === 'inventory' || this.openWindowValue === 'furnace'
      || this.openWindowValue === 'cooking' || this.openWindowValue === 'press'
      || this.openWindowValue === 'fermentation') && this.inventoryScrollBar.pointerDown(point)) {
      this.syncInventoryBackpackSlots();
      return true;
    }
    if (button === 0 && this.openWindowValue === 'crafting'
      && this.craftingRecipeScrollBar.pointerDown(point)) return true;
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
      && this.questLog.pointerDown(point, button, this.layout.progressionWindow, modifiers.pointerType)) return true;
    if (this.openWindowValue === 'crafting' && button === 0 && containsPoint(this.layout.craftingResult, point)) {
      const recipeId = this.currentRecipeId();
      if (recipeId !== null && !this.currentRecipeStationLocked()) {
        this.callbacks.craftInventoryRecipe(recipeId, modifiers.shift === true);
      }
      return true;
    }
    if (this.openWindowValue === 'barrel' && button === 0
      && this.model.barrelSealed !== true && containsPoint(barrelSealButtonRect(this.layout.inventoryWindow), point)) {
      this.callbacks.sealBarrel?.();
      return true;
    }
    if ((this.openWindowValue === 'inventory' || this.openWindowValue === 'crafting')
      && button === 0
      && containsPoint(this.openWindowValue === 'crafting'
        ? this.layout.craftingInventoryFilter : this.layout.inventoryFilter, point)) {
      this.inventoryFilterInput?.focus({ preventScroll: true });
      return true;
    }
    if (this.openWindowValue === 'crafting' && button === 0) {
      const rowIndex = this.layout.craftingRecipeRows.findIndex((rect) => containsPoint(rect, point));
      const entry = this.recipeBookEntries()[this.craftingRecipeScrollBar.position + rowIndex];
      if (rowIndex >= 0 && entry !== undefined) {
        if (modifiers.pointerType === 'touch') this.pendingTouchRecipeId = entry.recipeId;
        else this.callbacks.ghostFillCraftingRecipe(entry.recipeId);
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
    const onlineSwipeConsumed = this.onlinePlayersScrollBar.endSwipe();
    const inventorySwipeConsumed = this.inventoryScrollBar.endSwipe();
    const recipeSwipeConsumed = this.craftingRecipeScrollBar.endSwipe();
    const touchSwipeConsumed = onlineSwipeConsumed || inventorySwipeConsumed || recipeSwipeConsumed;
    if (touchSwipeConsumed) {
      this.pendingTouchRecipeId = null;
      this.cancelQuickCraftPreview();
      this.cursorPress = null;
      this.inventoryOutsidePress = null;
      return true;
    }
    if (this.pendingTouchRecipeId !== null) {
      const recipeId = this.pendingTouchRecipeId;
      this.pendingTouchRecipeId = null;
      this.callbacks.ghostFillCraftingRecipe(recipeId);
      return true;
    }
    if (this.blockingUpdatePromptVisible) {
      this.router.routePointer({ kind: 'pointer_up', point, button });
      return true;
    }
    if (this.openWindowValue === 'skills' && this.skillTree.pointerUp()) return true;
    if (this.openWindowValue === 'quests' && this.questLog.pointerUp()) return true;
    if (this.chestFrameResize.pointerUp()) return true;
    if (this.onlinePlayersScrollBar.pointerUp()) return true;
    if (this.inventoryScrollBar.pointerUp()) return true;
    if (this.craftingRecipeScrollBar.pointerUp()) return true;
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
      if (this.inventoryItemSlotAt(point) === null) {
        if (containsPoint(this.activeWindowRect(), point)) {
          this.cancelQuickCraftPreview();
          this.clearOptimisticMenu();
          this.callbacks.returnInventoryCursor();
        } else if (this.predictCursorDrop(outsideButton)) {
          this.trackInventoryPrediction(this.callbacks.dropInventoryCursor(outsideButton));
        }
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
    this.systemCursorLeave();
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
    this.craftingRecipeScrollBar.pointerLeave();
    this.pendingTouchRecipeId = null;
    this.chestFrameResize.cancel();
  }

  wheel(point: UiPoint, deltaX: number, deltaY: number): boolean {
    if (this.blockingUpdatePromptVisible) return true;
    if (this.openWindowValue === 'skills'
      && this.skillTree.wheel(point, deltaY, this.layout.progressionWindow)) return true;
    if (this.openWindowValue === 'quests'
      && this.questLog.wheel(point, deltaY, this.layout.progressionWindow)) return true;
    if (this.onlinePlayerListActive && containsPoint(this.onlinePlayerListRect, point) && deltaY !== 0) {
      this.onlinePlayersScrollBar.wheel(deltaY, 1);
      return true;
    }
    if ((this.openWindowValue === 'inventory' || this.openWindowValue === 'furnace'
      || this.openWindowValue === 'cooking' || this.openWindowValue === 'press'
      || this.openWindowValue === 'fermentation')
      && containsPoint(this.layout.inventoryBackpackViewport, point)
      && this.inventoryScrollBar.wheel(deltaY, 1)) {
      this.syncInventoryBackpackSlots();
      return true;
    }
    if (this.openWindowValue === 'crafting'
      && (this.layout.craftingRecipeRows.some((rect) => containsPoint(rect, point))
        || containsPoint(this.layout.craftingRecipeScroll, point)) && deltaY !== 0) {
      return this.craftingRecipeScrollBar.wheel(deltaY, 1);
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
    if (this.openWindowValue === null || this.openWindowValue === 'system'
      || this.isInventoryWindow(this.openWindowValue)) this.drawTooltip(context);
    this.drawNotification(context);
  }

  /** Final UI pass so an update decision cannot sit behind another modal. */
  drawBlockingOverlay(context: CanvasRenderingContext2D): void {
    if (!this.blockingUpdatePromptVisible) return;
    const { frame } = this.updatePrompt;
    context.save();
    context.fillStyle = 'rgba(24, 17, 20, 0.76)';
    context.fillRect(0, 0, this.model.width, this.model.height);
    context.restore();
    drawUiSkinAsset(context, this.skin.panelWood, frame);
    drawUiSkinAsset(context, this.skin.panelParchment, {
      x: frame.x + 10, y: frame.y + 13, width: frame.width - 20, height: frame.height - 23,
    });
    this.windowRibbon.draw(context, 'UPDATE READY', frame.x + frame.width / 2, frame.y - 5);
    drawLabel(context, this.fonts, 'A NEW ORCHARD VERSION IS READY.', frame.x + frame.width / 2, frame.y + 32, {
      align: 'center', color: '#6b4428',
    });
    drawLabel(context, this.fonts, 'REFRESH NOW TO USE IT, OR CONTINUE SAFELY.', frame.x + frame.width / 2, frame.y + 45, {
      align: 'center', color: '#6b4428',
    });
    this.updateRefreshButton.draw(context);
    this.updateLaterButton.draw(context);
  }

  drawNameplates(context: CanvasRenderingContext2D, labels: readonly {
    readonly x: number;
    readonly y: number;
    readonly text: string;
    readonly offline?: boolean;
  }[]): void {
    for (const label of labels) {
      const text = fitLabel(label.text, 20);
      const offline = label.offline === true;
      const rect = nameplateRect(label.x, label.y, text, offline);
      context.save();
      context.fillStyle = offline ? 'rgba(29, 34, 36, 0.76)' : 'rgba(0, 0, 0, 0.58)';
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      context.restore();
      if (!offline) {
        drawLabel(context, this.fonts, text, label.x, rect.y + 2, { align: 'center', color: '#fff1cf' });
        continue;
      }
      const frames = this.skin.onlinePlayersIcon.metadata.animations['offline'] ?? [];
      const frame = uiAssetFrame(
        this.skin.onlinePlayersIcon,
        'offline',
        offlineNameplateFrameAt(performance.now(), frames.length),
      );
      const contentX = rect.x + NAMEPLATE_HORIZONTAL_PADDING;
      if (frame !== null) context.drawImage(
        this.skin.onlinePlayersIcon.image,
        frame.x, frame.y, frame.width, frame.height,
        contentX, rect.y + 1, 8, 8,
      );
      drawLabel(context, this.fonts, text, contentX + 9, rect.y + 2, {
        align: 'left', color: '#d8d9d2',
      });
    }
  }

  drawOnlinePlayers(context: CanvasRenderingContext2D, players: readonly OnlinePlayerListEntry[]): void {
    const maximumRows = Math.max(1, Math.floor((this.model.height - 65) / ONLINE_PLAYER_LIST_ROW_HEIGHT));
    this.onlinePlayersScrollBar.setMetrics(players.length, maximumRows);
    const visiblePlayers = players.slice(
      this.onlinePlayersScrollBar.position,
      this.onlinePlayersScrollBar.position + maximumRows,
    );
    const width = Math.min(300, Math.max(170, this.model.width - 16));
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
    this.windowRibbon.draw(context, `ONLINE PLAYERS  ${players.length}`, rect.x + rect.width / 2, rect.y - 5, {
      maxWidth: rect.width - 46,
    });
    drawButton(context, this.skin, this.fonts, this.onlinePlayerListCloseButton, {
      label: 'X', tone: 'danger', size: 'compact',
    });
    visiblePlayers.forEach((player, index) => {
      const rowY = rect.y + ONLINE_PLAYER_LIST_CONTENT_TOP + index * ONLINE_PLAYER_LIST_ROW_HEIGHT;
      context.fillStyle = player.idleMinutes === null ? '#4f8f42' : '#d7a928';
      context.fillRect(rect.x + 17, rowY + 2, 4, 4);
      const roleSuffix = player.homesteadRole === null || player.homesteadRole === undefined
        ? '' : `  [${player.homesteadRole.toUpperCase()}]`;
      const maximumCharacters = Math.max(20, Math.floor((rect.width - 44) / 6));
      drawLabel(context, this.fonts, fitLabel(`${onlinePlayerListLabel(player)}${roleSuffix}`, maximumCharacters), rect.x + 27, rowY, {
        color: player.self ? '#4d2e22' : '#6b4428',
      });
    });
    this.onlinePlayerRows = visiblePlayers.map((player, index) => ({
      player,
      rect: {
        x: rect.x + 12,
        y: rect.y + ONLINE_PLAYER_LIST_CONTENT_TOP + index * ONLINE_PLAYER_LIST_ROW_HEIGHT - 2,
        width: rect.width - 36,
        height: ONLINE_PLAYER_LIST_ROW_HEIGHT,
      },
    }));
    this.onlinePlayersScrollBar.draw(context);
  }

  /** Drawn by the scene after every window and overlay. The system cursor is
   * intentionally the final UI composite and therefore cannot be occluded. */
  drawCursorOverlay(context: CanvasRenderingContext2D): void {
    if (this.isInventoryWindow(this.openWindowValue)) this.drawDraggedItem(context);
    this.drawCursor(context);
  }

  systemCursorMove(point: UiPoint): void {
    this.pointer = point;
  }

  systemCursorDown(point: UiPoint): void {
    this.pointer = point;
    this.clickStartedAt = performance.now();
  }

  systemCursorLeave(): void {
    // Touch pointers commonly emit pointerleave immediately after a tap. Keep
    // the last touch position so a held stack remains visible and movable.
    if (this.model.touchControls !== true) this.pointer = { x: -100, y: -100 };
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
    if (this.openWindowValue === 'crafting') return this.layout.craftingWindow;
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
    const furnaceVisible = this.openWindowValue === 'furnace';
    const cookingVisible = this.openWindowValue === 'cooking';
    const pressVisible = this.openWindowValue === 'press';
    const fermentationVisible = this.openWindowValue === 'fermentation';
    const systemVisible = this.openWindowValue === 'system';
    const settingsVisible = this.openWindowValue === 'settings';
    const developerVisible = this.openWindowValue === 'developer' && this.model.canAdministerWorld;
    this.windowNode.setBounds(activeWindow);
    this.windowNode.visible = this.openWindowValue !== null;
    this.closeNode.setBounds({ x: activeWindow.x + activeWindow.width - 17, y: activeWindow.y + 7, width: 16, height: 16 });
    this.inventoryHotbarSlots.forEach((slot, index) => {
      slot.visible = inventoryVisible || craftingVisible || chestVisible || barrelVisible || furnaceVisible || cookingVisible || pressVisible || fermentationVisible;
      slot.setBounds(chestVisible ? this.layout.chestHotbarSlots[index]! : this.layout.inventoryHotbarSlots[index]!);
    });
    this.backpackItemSlots.forEach((slot, index) => {
      slot.visible = inventoryVisible || craftingVisible || chestVisible || furnaceVisible || cookingVisible || pressVisible || fermentationVisible;
      slot.setBounds(craftingVisible
        ? this.layout.craftingInventorySlots[index]!
        : chestVisible ? this.layout.chestBackpackSlots[index]! : this.layout.backpackSlots[index]!);
    });
    for (const slot of this.equipmentItemSlots) slot.visible = inventoryVisible;
    for (const slot of this.craftingItemSlots) slot.visible = craftingVisible;
    for (const slot of this.chestItemSlots) slot.visible = chestVisible;
    for (const slot of this.barrelItemSlots) slot.visible = barrelVisible;
    for (const slot of this.furnaceItemSlots) slot.visible = furnaceVisible;
    for (const slot of this.cookingFireItemSlots) slot.visible = cookingVisible;
    for (const slot of this.pressItemSlots) slot.visible = pressVisible;
    for (const slot of this.fermentationItemSlots) slot.visible = fermentationVisible;
    this.backpackSortNode.visible = inventoryVisible || craftingVisible || chestVisible;
    this.backpackSortNode.setBounds(chestVisible
      ? this.layout.chestBackpackSortButton
      : craftingVisible ? this.layout.craftingBackpackSortButton : this.layout.inventorySortButton);
    this.chestSortNode.visible = chestVisible;
    this.barrelSortNode.visible = barrelVisible;
    for (const node of [this.resumeNode, this.helpNode, this.settingsNode, this.fullscreenNode, this.signOutNode, this.quitNode]) {
      node.visible = systemVisible;
    }
    this.developerNode.visible = systemVisible && this.model.canAdministerWorld;
    this.updateNode.visible = systemVisible
      && this.model.pwaUpdateStatus !== undefined
      && this.model.pwaUpdateStatus !== 'unsupported';
    this.settingsBackNode.visible = settingsVisible;
    this.developerBackNode.visible = developerVisible;
    for (const tab of SETTINGS_TABS) this.settingsTabNodes[tab].visible = settingsVisible;
    this.lightingModelNode.visible = settingsVisible && this.settingsTab === 'video';
    this.lightingModelNode.enabled = this.lightingModelNode.visible;
    for (const tab of DEVELOPER_TABS) this.developerTabNodes[tab].visible = developerVisible;
    const developerWorldVisible = developerVisible && this.developerTab === 'world';
    const developerPlayerVisible = developerVisible && this.developerTab === 'player';
    const developerQuestVisible = developerVisible && this.developerTab === 'quests';
    const developerRenderVisible = developerVisible && this.developerTab === 'render';
    for (const node of [this.previousDayNode, this.timeSlider.node, this.nextDayNode, this.weatherModeNode, this.windDirectionNode]) {
      node.visible = developerWorldVisible;
    }
    this.lightingEffectsToggle.node.visible = developerRenderVisible;
    this.orePreviewToggle.node.visible = developerRenderVisible;
    this.resetQuestsButton.node.visible = developerQuestVisible;
    this.backpackCapacityDownNode.visible = developerPlayerVisible;
    this.backpackCapacityUpNode.visible = developerPlayerVisible;
    for (const track of SKILL_TRACKS) this.skillPointNodes[track].visible = developerPlayerVisible;
    if (this.inventoryFilterInput !== null) {
      this.inventoryFilterInput.hidden = !(inventoryVisible || craftingVisible);
      if (!inventoryVisible && !craftingVisible) this.inventoryFilterInput.blur();
    }
    this.syncInventoryBackpackSlots();
    this.syncCraftingBackpackSlots();
    if (craftingVisible) this.syncCraftingRecipeScroll();
    this.timeSlider.enabled = developerWorldVisible;
    this.lightingEffectsToggle.enabled = developerRenderVisible;
    this.orePreviewToggle.enabled = developerRenderVisible;
    const settingsAudioVisible = settingsVisible && this.settingsTab === 'audio';
    const settingsGameplayVisible = settingsVisible && this.settingsTab === 'gameplay';
    for (const slider of [this.masterSlider, this.musicSlider, this.sfxSlider]) {
      slider.node.visible = settingsAudioVisible;
      slider.enabled = settingsAudioVisible;
    }
    for (const bus of ['master', 'music', 'sfx'] as const) {
      this.audioMuteNodes[bus].visible = settingsAudioVisible;
      this.audioMuteNodes[bus].enabled = settingsAudioVisible;
    }
    for (const toggle of [this.musicBackgroundToggle, this.soundsBackgroundToggle]) {
      toggle.node.visible = settingsAudioVisible;
      toggle.enabled = settingsAudioVisible;
    }
    this.nameplatesToggle.node.visible = settingsGameplayVisible;
    this.nameplatesToggle.enabled = settingsGameplayVisible;
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
    const { developerContent } = this.layout;
    drawInsetPanel(context, this.skin, developerContent);
    for (const tab of DEVELOPER_TABS) drawMenuButton(
      context, this.skin, this.fonts, this.pointer, this.layout.developerTabs[tab],
      tab.toUpperCase(), { active: tab === this.developerTab, glyph: tab === 'world' ? 'star'
        : tab === 'player' ? 'heart' : tab === 'quests' ? 'key_e' : 'wrench' },
    );
    drawMenuButton(context, this.skin, this.fonts, this.pointer,
      this.layout.developerBackButton, 'BACK', { glyph: 'back' });
    drawLabel(context, this.fonts, this.developerTab.toUpperCase(),
      developerContent.x + 10, developerContent.y + 8, { color: '#6b4428', font: 'header' });

    if (this.developerTab === 'world') {
      drawMenuButton(context, this.skin, this.fonts, this.pointer, this.layout.previousDayButton, '- DAY', { glyph: 'left_1' });
      this.timeSlider.draw(context);
      drawMenuButton(context, this.skin, this.fonts, this.pointer, this.layout.nextDayButton, '+ DAY', { glyph: 'up_1' });
      drawMenuButton(context, this.skin, this.fonts, this.pointer, this.layout.weatherButton,
        `WEATHER ${this.model.weatherMode.toUpperCase()}`, { tone: this.model.raining ? 'green' : 'peach' });
      const directionMode = (this.model.windDirectionMode ?? 'auto').toUpperCase();
      const effectiveDirection = directionMode === 'AUTO' && this.model.windDirectionLabel
        ? ` (${this.model.windDirectionLabel})` : '';
      drawMenuButton(context, this.skin, this.fonts, this.pointer, this.layout.windDirectionButton,
        `WIND ${directionMode}${effectiveDirection}`);
      drawLabel(context, this.fonts, `${this.model.dateLabel} · ${this.model.timeLabel}`,
        developerContent.x + developerContent.width / 2,
        developerContent.y + Math.min(116, developerContent.height - 11),
        { align: 'center', color: '#8c5d3a' });
      return;
    }

    if (this.developerTab === 'player') {
      drawLabel(context, this.fonts, 'GRANT SKILL POINTS', developerContent.x + 10,
        developerContent.y + 25, { color: '#8c5d3a' });
      for (const track of SKILL_TRACKS) drawMenuButton(
        context, this.skin, this.fonts, this.pointer, this.layout.skillPointButtons[track],
        `+1 ${track.toUpperCase()}`, { tone: 'green' },
      );
      drawMenuButton(context, this.skin, this.fonts, this.pointer,
        this.layout.backpackCapacityDownButton, '- SLOT', { glyph: 'down' });
      drawPixelTextInRect(context, this.fonts,
        `BACKPACK ${this.model.backpackSlotCapacity ?? (this.model.hasBackpack ? BACKPACK_SLOT_COUNT : DEFAULT_INVENTORY_SLOTS)} SLOTS`, {
          x: this.layout.backpackCapacityDownButton.x + this.layout.backpackCapacityDownButton.width + 3,
          y: this.layout.backpackCapacityDownButton.y,
          width: Math.max(0, this.layout.backpackCapacityUpButton.x
            - this.layout.backpackCapacityDownButton.x - this.layout.backpackCapacityDownButton.width - 6),
          height: this.layout.backpackCapacityDownButton.height,
        }, { align: 'center', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      drawMenuButton(context, this.skin, this.fonts, this.pointer,
        this.layout.backpackCapacityUpButton, '+ SLOT', { glyph: 'up' });
      drawLabel(context, this.fonts, 'PLAYER DEBUG CHANGES ARE SERVER AUTHORITATIVE.',
        developerContent.x + 10,
        developerContent.y + Math.min(119, developerContent.height - 11), { color: '#8c5d3a' });
      return;
    }

    if (this.developerTab === 'quests') {
      drawPixelTextInRect(context, this.fonts,
        'RESETS ONLY YOUR OWN QUEST STATE.', {
          x: developerContent.x + 12, y: developerContent.y + 28,
          width: developerContent.width - 24, height: 10,
        }, { align: 'left', color: '#6b4428', overflow: 'ellipsis' });
      drawPixelTextInRect(context, this.fonts,
        'WORLD DEFINITIONS AND OTHER PLAYERS STAY UNCHANGED.', {
          x: developerContent.x + 12, y: developerContent.y + 40,
          width: developerContent.width - 24, height: 10,
        }, { align: 'left', color: '#6b4428', overflow: 'ellipsis' });
      drawMenuButton(context, this.skin, this.fonts, this.pointer,
        this.layout.resetQuestsButton, 'RESET MY QUESTS', { tone: 'red', glyph: 'alert' });
      return;
    }

    drawLabel(context, this.fonts, 'LIGHTING EFFECTS', developerContent.x + 12,
      this.layout.lightingEffectsButton.y + 5, { color: '#6b4428' });
    drawLabel(context, this.fonts, 'CELLAR ORE VEINS', developerContent.x + 12,
      this.layout.orePreviewButton.y + 5, { color: '#6b4428' });
    this.lightingEffectsToggle.draw(context);
    this.orePreviewToggle.draw(context);
    const placeholderRows = [
      ['COLLISION BOUNDS', false],
      ['PATHFINDING OVERLAY', false],
    ] as const;
    const renderPlaceholderStart = Math.min(102, Math.max(72, developerContent.height - 48));
    placeholderRows.forEach(([label, value], index) => {
      const row = { x: developerContent.x + developerContent.width - 48,
        y: developerContent.y + renderPlaceholderStart + index * 24, width: 40, height: 18 };
      drawLabel(context, this.fonts, label, developerContent.x + 12, row.y + 5, { color: '#8c6c54' });
      drawToggleSwitch(context, this.skin, row, { value, style: 'neutral', enabled: false });
    });
  }

  private drawHotbar(context: CanvasRenderingContext2D): void {
    const itemBySlot = new Map(this.model.inventory.map((item) => [item.slot, item]));
    for (let slot = 0; slot < HOTBAR_SLOT_COUNT; slot += 1) {
      const rect = this.layout.slots[slot]!;
      const item = itemBySlot.get(slot);
      drawUiInventorySlotBacking(context, this.skin, rect, item?.itemKind);
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
    const hunger = this.model.hunger;
    if (hunger !== undefined) {
      const width = this.layout.vitals.width - 8;
      const x = this.layout.vitals.x + 4;
      const y = this.layout.vitals.y - 9;
      context.fillStyle = '#3f2832'; context.fillRect(x, y, width, 7);
      context.fillStyle = hunger.current <= hunger.maximum * 0.25 ? '#d56a55' : '#e1ad52';
      context.fillRect(x + 1, y + 1, Math.round((width - 2) * Math.max(0, Math.min(1, hunger.current / hunger.maximum))), 5);
      drawOutlinedPixelText(context, this.fonts, `HUNGER ${Math.ceil(hunger.current / 100)}`, x + width, y - 1, {
        align: 'right', color: '#fff1cf', outlineColor: '#3f2832',
      });
    }
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
    if (this.openWindowValue === 'system') {
      if (this.resumeNode.contains(this.pointer)) return 'RETURN TO WORLD';
      if (this.settingsNode.contains(this.pointer)) return 'SETTINGS';
      if (this.helpNode.contains(this.pointer)) return 'HELP';
      if (this.developerNode.visible && this.developerNode.contains(this.pointer)) return 'DEVELOPER';
      if (this.fullscreenNode.contains(this.pointer)) {
        return this.model.fullscreen && this.model.fullscreenAvailable !== false ? 'WINDOWED' : 'FULLSCREEN';
      }
      if (this.updateNode.visible && this.updateNode.contains(this.pointer)) {
        return pwaUpdateLabel(this.model.pwaUpdateStatus ?? 'unsupported');
      }
      if (this.signOutNode.contains(this.pointer)) return 'SIGN OUT';
      if (this.quitNode.contains(this.pointer)) return 'QUIT TO TITLE';
    }
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
          : window === 'furnace' ? 'FURNACE'
          : window === 'cooking' ? 'COOKING FIRE'
          : window === 'press' ? 'FRUIT PRESS'
          : window === 'fermentation' ? 'FERMENTATION CASK'
          : window === 'character' ? 'CHARACTER'
          : window === 'skills' ? 'SKILLS'
          : window === 'quests' ? 'QUEST LOG'
          : window === 'settings' ? 'SETTINGS'
            : window === 'developer' ? 'DEVELOPER TOOLS' : SYSTEM_MENU_TITLE;
    this.windowRibbon.draw(context, title, rect.x + rect.width / 2, rect.y - 5);
    drawFantasyButton(context, this.skin, this.fonts, this.closeNode.bounds, {
      tone: 'red', shape: 'square', size: 'small', glyph: 'cross',
      hovered: containsPoint(this.closeNode.bounds, this.pointer), hoverOutline: 'white',
    });
    if (window === 'inventory' || window === 'pack') this.drawInventory(context, rect);
    else if (window === 'crafting') this.drawCrafting(context, rect);
    else if (window === 'chest') this.drawChest(context, rect);
    else if (window === 'barrel') this.drawBarrel(context, rect);
    else if (window === 'furnace') this.drawFurnace(context, rect);
    else if (window === 'cooking') this.drawCooking(context, rect);
    else if (window === 'press') this.drawFruitPress(context, rect);
    else if (window === 'fermentation') this.drawFermentation(context, rect);
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
      this.drawItemSlotBacking(context, slot);
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
      this.drawItemSlotBacking(context, slot);
      if (slot.enabled && slot.item !== null) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    this.inventoryScrollBar.draw(context);
    context.fillStyle = '#9d6843';
    context.fillRect(rect.x + 17, rect.y + rect.height - 61, rect.width - 34, 1);
    drawLabel(context, this.fonts, 'HOTBAR', rect.x + 21, rect.y + rect.height - 59, { color: '#6b4428' });
    this.inventoryHotbarSlots.forEach((slot, index) => {
      const slotRect = slot.bounds;
      const item = slot.item;
      this.drawItemSlotBacking(context, slot);
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
    drawUiInventorySlotBacking(context, this.skin, destination, cursor.itemKind);
    this.drawInventoryItem(context, destination, cursor.itemKind, cursor.quantity, cursor.durability, cursor.lit);
    const target = this.inventoryItemSlotAt(this.pointer);
    if (target !== null && itemSlotRejectsCursor(target, cursor)) {
      const deny = { x: destination.x - 2, y: destination.y - 2, width: 10, height: 10 };
      context.fillStyle = '#a9363e';
      context.fillRect(deny.x, deny.y, deny.width, deny.height);
      context.fillStyle = '#fff1cf';
      for (let offset = 2; offset <= 7; offset += 1) {
        context.fillRect(deny.x + offset, deny.y + offset, 1, 1);
        context.fillRect(deny.x + 9 - offset, deny.y + offset, 1, 1);
      }
    }
  }

  private drawItemSlotBacking(context: CanvasRenderingContext2D, slot: ItemSlot): void {
    drawUiInventorySlotBacking(context, this.skin, slot.bounds, slot.item?.itemKind, !slot.enabled);
    if (!itemSlotRejectsCursor(slot, this.heldCursorStack())) return;
    context.save();
    context.fillStyle = 'rgba(169, 54, 62, 0.58)';
    context.fillRect(slot.bounds.x + 3, slot.bounds.y + 3, slot.bounds.width - 6, slot.bounds.height - 6);
    drawUiSkinAsset(context, this.skin.selectorDeny, uiInventorySelectorRect(slot.bounds), 'idle');
    context.restore();
  }

  private drawSystemMenu(context: CanvasRenderingContext2D): void {
    const updateStatus = this.model.pwaUpdateStatus ?? 'unsupported';
    const buttons: [UiRect, string, FantasyButtonTone, FantasyButtonGlyph, boolean][] = [
      [this.resumeNode.bounds, 'RETURN TO WORLD', 'green', 'play', false],
      [this.settingsNode.bounds, 'SETTINGS', 'peach', 'wrench', false],
      [this.helpNode.bounds, 'HELP', 'peach', 'help', false],
      [this.fullscreenNode.bounds,
        this.model.fullscreen && this.model.fullscreenAvailable !== false ? 'WINDOWED' : 'FULLSCREEN',
        'blue', 'square', this.model.fullscreenAvailable === false],
      [this.layout.signOutButton, 'SIGN OUT', 'red', 'back', false],
      [this.layout.quitButton, 'QUIT TO TITLE', 'red', 'power', false],
    ];
    if (this.developerNode.visible) buttons.splice(3, 0, [
      this.developerNode.bounds, 'DEVELOPER', 'gold', 'wrench', false,
    ]);
    if (this.updateNode.visible) buttons.splice(buttons.length - 2, 0, [
      this.updateNode.bounds,
      pwaUpdateLabel(updateStatus),
      updateStatus === 'available' ? 'green' : 'peach',
      'return',
      updateStatus === 'checking' || updateStatus === 'updating',
    ]);
    for (const [rect, label, tone, glyph, disabled] of buttons) drawMenuButton(
      context, this.skin, this.fonts, this.pointer, rect, label, { tone, glyph, disabled },
    );
  }

  private drawSettings(context: CanvasRenderingContext2D): void {
    const { settingsContent } = this.layout;
    drawInsetPanel(context, this.skin, settingsContent);
    const tabGlyphs: Readonly<Record<SettingsTab, FantasyButtonGlyph>> = {
      gameplay: 'play',
      controls: 'key_a',
      video: 'square',
      audio: 'star',
      interface: 'pointer',
      accessibility: 'heart',
    };
    const tabLabels: Readonly<Record<SettingsTab, string>> = {
      gameplay: 'GAMEPLAY',
      controls: 'CONTROLS',
      video: 'VIDEO',
      audio: 'AUDIO',
      interface: 'INTERFACE',
      accessibility: 'ACCESS',
    };
    for (const tab of SETTINGS_TABS) drawMenuButton(
      context, this.skin, this.fonts, this.pointer, this.layout.settingsTabs[tab],
      tabLabels[tab], { active: tab === this.settingsTab, glyph: tabGlyphs[tab] },
    );
    drawMenuButton(context, this.skin, this.fonts, this.pointer,
      this.layout.settingsBackButton, 'BACK', { glyph: 'back' });
    drawPixelTextInRect(context, this.fonts, this.settingsTab.toUpperCase(), {
      x: settingsContent.x + 10,
      y: settingsContent.y + 7,
      width: settingsContent.width - 20,
      height: 12,
    }, { font: 'header', color: '#6b4428', overflow: 'ellipsis' });

    if (this.settingsTab === 'audio') {
      const rows = [
        ['MASTER', 'master', 'sound', this.masterSlider, this.model.audioVolumes.master],
        ['MUSIC', 'music', 'music', this.musicSlider, this.model.audioVolumes.music],
        ['EFFECTS', 'sfx', 'sound', this.sfxSlider, this.model.audioVolumes.sfx],
      ] as const;
      for (const [label, bus, icon, slider, value] of rows) {
        const mute = this.layout.audioMuteButtons[bus];
        const visual = { x: mute.x + 2, y: mute.y + 2, width: 16, height: 16 };
        drawFantasyButton(context, this.skin, this.fonts, visual, {
          tone: value <= 0.001 ? 'red' : 'green',
          shape: 'square',
          size: 'small',
          hovered: containsPoint(mute, this.pointer),
          hoverOutline: 'gold',
        });
        drawFantasyIconCell(context, this.skin.iconCatalog, {
          x: visual.x + 1, y: visual.y + 1, width: 14, height: 14,
        }, fantasyAudioIconFrame(icon, value <= 0.001 ? 'muted' : 'normal'));
        drawPixelTextInRect(context, this.fonts, label, {
          x: mute.x + mute.width + 2,
          y: slider.node.bounds.y,
          width: Math.max(0, slider.node.bounds.x - mute.x - mute.width - 4),
          height: slider.node.bounds.height,
        }, { align: 'left', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
        slider.draw(context);
        drawPixelTextInRect(context, this.fonts, `${Math.round(value * 100)}%`, {
          x: slider.node.bounds.x + slider.node.bounds.width + 3,
          y: slider.node.bounds.y,
          width: Math.max(0, settingsContent.x + settingsContent.width
            - slider.node.bounds.x - slider.node.bounds.width - 6),
          height: slider.node.bounds.height,
        }, { align: 'right', verticalAlign: 'center', color: '#8c5d3a', overflow: 'ellipsis' });
      }
      drawLabel(context, this.fonts, 'MUSIC IN BACKGROUND', settingsContent.x + 10,
        this.layout.musicBackgroundToggle.y + 5, { color: '#6b4428' });
      drawLabel(context, this.fonts, 'SOUNDS IN BACKGROUND', settingsContent.x + 10,
        this.layout.soundsBackgroundToggle.y + 5, { color: '#6b4428' });
      this.musicBackgroundToggle.draw(context);
      this.soundsBackgroundToggle.draw(context);
      return;
    }

    if (this.settingsTab === 'gameplay') {
      drawLabel(context, this.fonts, 'PLAYER NAMEPLATES', settingsContent.x + 10,
        this.layout.nameplatesToggle.y + 5, { color: '#6b4428' });
      this.nameplatesToggle.draw(context);
      drawPixelTextInRect(context, this.fonts, 'TOUCH-FRIENDLY VERSION OF THE N SHORTCUT', {
        x: settingsContent.x + 10, y: this.layout.nameplatesToggle.y + 22,
        width: settingsContent.width - 20, height: 10,
      }, { color: '#8c5d3a', overflow: 'ellipsis' });
      const rows = [
        ['SHOW TUTORIAL HINTS', true],
        ['CONFIRM RARE ITEM DROPS', true],
        ['AUTO-SORT PICKUPS', false],
        ['HOLD TO HARVEST', false],
      ] as const;
      const gameplayRowStep = Math.max(14, Math.min(27, Math.floor((settingsContent.height - 58) / rows.length)));
      rows.forEach(([label, value], index) => {
        const toggle = {
          x: settingsContent.x + settingsContent.width - 42,
          y: settingsContent.y + 57 + index * gameplayRowStep,
          width: 40,
          height: Math.min(18, gameplayRowStep),
        };
        drawPixelTextInRect(context, this.fonts, label, {
          x: settingsContent.x + 10, y: toggle.y,
          width: settingsContent.width - 58, height: toggle.height,
        }, { verticalAlign: 'center', color: '#8c6c54', overflow: 'ellipsis' });
        drawToggleSwitch(context, this.skin, toggle, { value, style: 'neutral', enabled: false });
      });
      return;
    }

    const settingRows = this.settingsTab === 'controls' ? [
      ['MOVE', 'WASD / STICK'],
      ['INTERACT', 'E / SOUTH'],
      ['INVENTORY', 'I / WEST'],
      ['NAMEPLATES', 'N'],
      ['CHAT', 'ENTER'],
      ['PAUSE', 'ESC / START'],
    ] as const : this.settingsTab === 'video' ? [
      ['DISPLAY MODE', this.model.fullscreen ? 'FULLSCREEN' : 'WINDOWED'],
      ['PIXEL SCALING', 'INTEGER'],
      ['WORLD ZOOM', 'AUTO'],
      ['UI SCALE', 'AUTO'],
      ['LIGHTING MODEL', this.model.lightingModel === 'classic' ? 'CLASSIC' : 'UNIFIED V2'],
      ['WEATHER DETAIL', 'HIGH'],
    ] as const : this.settingsTab === 'interface' ? [
      ['HUD VISIBILITY', 'FULL'],
      ['MINIMAP', 'EXPANDED'],
      ['CHAT TIMESTAMPS', 'OFF'],
      ['TOOLTIP DELAY', 'SHORT'],
      ['ITEM LABELS', 'ON'],
      ['UI SAFE AREA', 'AUTO'],
    ] as const : [
      ['REDUCED MOTION', 'OFF'],
      ['FLASH REDUCTION', 'OFF'],
      ['HIGH CONTRAST', 'OFF'],
      ['CHAT TEXT SIZE', 'NORMAL'],
      ['COLOUR FILTER', 'NONE'],
      ['HOLD ASSIST', 'OFF'],
    ] as const;
    const rowHeight = Math.max(14, Math.min(27, Math.floor((settingsContent.height - 38) / settingRows.length)));
    settingRows.forEach(([label, value], index) => {
      const y = settingsContent.y + 23 + index * rowHeight;
      drawPixelTextInRect(context, this.fonts, label, {
        x: settingsContent.x + 10, y, width: Math.max(40, settingsContent.width * 0.46), height: 18,
      }, { verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      const interactiveLightingModel = this.settingsTab === 'video' && label === 'LIGHTING MODEL';
      drawMenuButton(context, this.skin, this.fonts, this.pointer, interactiveLightingModel
        ? this.lightingModelNode.bounds : {
        x: settingsContent.x + Math.floor(settingsContent.width * 0.5), y,
        width: Math.max(40, settingsContent.width * 0.5 - 10), height: Math.min(18, rowHeight),
      }, value, { tone: interactiveLightingModel ? 'green' : 'silver', disabled: !interactiveLightingModel });
    });
    drawPixelTextInRect(context, this.fonts, 'CONFIGURATION SUPPORT IS RESERVED FOR A LATER UPDATE.', {
      x: settingsContent.x + 10,
      y: settingsContent.y + settingsContent.height - 17,
      width: settingsContent.width - 20,
      height: 10,
    }, { align: 'center', color: '#8c6c54', overflow: 'ellipsis' });
  }

  private drawCooking(context: CanvasRenderingContext2D, rect: UiRect): void {
    const [input, output] = this.cookingFireItemSlots;
    drawLabel(context, this.fonts, 'RAW', input!.bounds.x + input!.bounds.width / 2, input!.bounds.y - 12, {
      align: 'center', color: '#6b4428',
    });
    drawLabel(context, this.fonts, 'COOKED', output!.bounds.x + output!.bounds.width / 2, output!.bounds.y - 12, {
      align: 'center', color: '#6b4428',
    });
    this.drawDownChevron(
      context,
      input!.bounds.x + input!.bounds.width / 2,
      input!.bounds.y + input!.bounds.height + 7,
    );
    for (const slot of this.cookingFireItemSlots) {
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    const progress = Math.max(0, Math.min(1, this.model.cookingFireProgress ?? 0));
    const status = this.model.cookingFireLit === false
      ? 'PRESS F TO LIGHT'
      : this.model.cookingFireRemainingSeconds != null ? 'COOKING' : 'ADD RAW FOOD';
    this.drawCookingProgress(
      context,
      progress,
      this.model.cookingFireRemainingSeconds,
      status,
      this.model.cookingFireLit === false ? '#a5483f' : '#6b4428',
    );
    drawLabel(context, this.fonts, 'BACKPACK', this.layout.backpackSlots[0]!.x, rect.y + 35, { color: '#6b4428' });
    for (const slot of this.backpackItemSlots) {
      if (!slot.visible) continue;
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    this.inventoryScrollBar.draw(context);
    this.drawWindowHotbar(context, rect);
  }

  private drawFruitPress(context: CanvasRenderingContext2D, rect: UiRect): void {
    const [input, must, pomace] = this.pressItemSlots;
    drawLabel(context, this.fonts, 'FRUIT', input!.bounds.x, input!.bounds.y - 12, { color: '#6b4428' });
    drawLabel(context, this.fonts, 'MUST', must!.bounds.x, must!.bounds.y - 12, { color: '#6b4428' });
    drawLabel(context, this.fonts, 'POMACE', pomace!.bounds.x, pomace!.bounds.y - 12, { color: '#6b4428' });
    for (const slot of this.pressItemSlots) {
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    const progress = Math.max(0, Math.min(1, this.model.cellarProcessorProgress ?? 0));
    this.drawProcessorProgress(
      context,
      this.layout.pressProgress,
      progress,
      this.model.cellarProcessorRemainingSeconds,
      this.model.cellarProcessorRemainingSeconds != null ? 'PRESSING FRUIT' : 'ADD FRUIT',
      '#6b4428',
    );
    drawLabel(context, this.fonts, 'BACKPACK', this.layout.backpackSlots[0]!.x, rect.y + 35, { color: '#6b4428' });
    for (const slot of this.backpackItemSlots) {
      if (!slot.visible) continue;
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    this.inventoryScrollBar.draw(context);
    this.drawWindowHotbar(context, rect);
  }

  private drawFermentation(context: CanvasRenderingContext2D, rect: UiRect): void {
    const [input, output] = this.fermentationItemSlots;
    drawLabel(context, this.fonts, '3 MUST', input!.bounds.x + input!.bounds.width / 2, input!.bounds.y - 12, {
      align: 'center', color: '#6b4428',
    });
    drawLabel(context, this.fonts, (this.model.cellarProductLabel ?? 'BOTTLES').toUpperCase(), output!.bounds.x + output!.bounds.width / 2, output!.bounds.y - 12, {
      align: 'center', color: '#6b4428',
    });
    this.drawDownChevron(context, input!.bounds.x + input!.bounds.width / 2, input!.bounds.y + input!.bounds.height + 7);
    for (const slot of this.fermentationItemSlots) {
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    const remaining = this.model.cellarProcessorRemainingSeconds;
    this.drawCookingProgress(
      context,
      Math.max(0, Math.min(1, this.model.cellarProcessorProgress ?? 0)),
      remaining,
      remaining != null ? 'FERMENTING' : 'ADD 3 MUST',
      '#6b4428',
    );
    drawLabel(context, this.fonts, 'BACKPACK', this.layout.backpackSlots[0]!.x, rect.y + 35, { color: '#6b4428' });
    for (const slot of this.backpackItemSlots) {
      if (!slot.visible) continue;
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    this.inventoryScrollBar.draw(context);
    this.drawWindowHotbar(context, rect);
  }

  private drawCrafting(context: CanvasRenderingContext2D, rect: UiRect): void {
    const recipeRows = this.layout.craftingRecipeRows;
    const gridLeft = this.layout.craftingSlots[0]!.x;
    drawLabel(context, this.fonts, 'RECIPES', recipeRows[0]?.x ?? rect.x + 18, rect.y + 35, { color: '#6b4428' });
    drawLabel(context, this.fonts, 'CRAFTING GRID', gridLeft, rect.y + 35, { color: '#6b4428' });
    for (const slot of this.craftingItemSlots) {
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    const gridRight = Math.max(...this.layout.craftingSlots.map((slot) => slot.x + slot.width));
    drawLabel(context, this.fonts, '>', (gridRight + this.layout.craftingResult.x) / 2, this.layout.craftingResult.y + 6, {
      align: 'center', color: '#6b4428', font: 'header',
    });
    const stationLocked = this.currentRecipeStationLocked();
    const output = craftingRecipeOutput(this.currentRecipeId() ?? '');
    drawUiInventorySlotBacking(
      context,
      this.skin,
      this.layout.craftingResult,
      output?.itemKind,
      this.currentRecipeId() === null || stationLocked,
    );
    if (output) this.drawInventoryItem(context, this.layout.craftingResult, output.itemKind, output.quantity);
    if (stationLocked) {
      context.fillStyle = 'rgba(47, 34, 39, 0.72)';
      context.fillRect(this.layout.craftingResult.x + 3, this.layout.craftingResult.y + 3, this.layout.craftingResult.width - 6, this.layout.craftingResult.height - 6);
      drawLabel(context, this.fonts, 'LOCK', this.layout.craftingResult.x + this.layout.craftingResult.width / 2, this.layout.craftingResult.y + 12, { align: 'center', color: '#f7dca0' });
    }
    drawLabel(context, this.fonts, output ? 'TAKE' : 'RECIPE',
      this.layout.craftingResult.x + this.layout.craftingResult.width / 2,
      this.layout.craftingResult.y + this.layout.craftingResult.height + 8,
      { align: 'center', color: '#6b4428' });
    const entries = this.recipeBookEntries();
    if (entries.length === 0) {
      const firstRow = this.layout.craftingRecipeRows[0];
      if (firstRow !== undefined) {
        drawLabel(context, this.fonts, 'READ RECIPE BOOKS', firstRow.x + firstRow.width / 2, firstRow.y + 4, {
          align: 'center', color: '#8e8177',
        });
        drawLabel(context, this.fonts, 'TO REVEAL PATTERNS', firstRow.x + firstRow.width / 2, firstRow.y + 16, {
          align: 'center', color: '#8e8177',
        });
      }
    }
    this.layout.craftingRecipeRows.forEach((row, index) => {
      const entry = entries[this.craftingRecipeScrollBar.position + index];
      if (entry === undefined) return;
      context.fillStyle = entry.missingIngredients ? 'rgba(104, 82, 71, 0.25)' : 'rgba(239, 213, 163, 0.5)';
      context.fillRect(row.x, row.y, row.width, row.height);
      const name = itemDefinition(entry.outputKind)?.displayName ?? entry.outputKind;
      const maximumCharacters = Math.max(4, Math.floor((row.width - 6) / 6));
      drawLabel(context, this.fonts, fitLabel(`${entry.outputQuantity} ${name.toUpperCase()}`, maximumCharacters), row.x + 3, row.y + 4, {
        color: entry.missingIngredients ? '#8e8177' : '#5f3b24',
      });
    });
    this.craftingRecipeScrollBar.draw(context);
    drawUiSkinAsset(context, this.skin.frameThin, this.layout.craftingInventoryFilter);
    if (this.inventoryFilterInput !== null) {
      drawCanvasTextInput(context, this.fonts, this.inventoryFilterInput, {
        x: this.layout.craftingInventoryFilter.x + 6,
        y: this.layout.craftingInventoryFilter.y + 5,
        width: this.layout.craftingInventoryFilter.width - 12,
        placeholder: this.model.hasBackpack ? 'SEARCH BACKPACK' : 'SEARCH INVENTORY',
        color: '#51351f',
        placeholderColor: '#986846',
      });
    } else drawLabel(context, this.fonts, this.inventoryFilterText || 'SEARCH ITEMS',
      this.layout.craftingInventoryFilter.x + 6, this.layout.craftingInventoryFilter.y + 5, {
        color: this.inventoryFilterText ? '#51351f' : '#986846',
      });
    this.drawStorageSortButton(context, this.backpackSortNode, 'backpack');
    for (const slot of this.backpackItemSlots) {
      this.drawItemSlotBacking(context, slot);
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
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    drawLabel(context, this.fonts, this.model.hasBackpack ? 'BACKPACK' : backpackPane.label,
      backpackPane.labelPosition.x, backpackPane.labelPosition.y, { color: '#6b4428' });
    this.drawStorageSortButton(context, this.backpackSortNode, 'backpack');
    for (const slot of this.backpackItemSlots) {
      this.drawItemSlotBacking(context, slot);
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
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
      drawLabel(context, this.fonts, hotbarSlotLabel(index) ?? '', slot.bounds.x + 3, slot.bounds.y + 3, { color: '#51351f' });
    });
  }

  private isInventoryWindow(window: OverworldWindow | null): boolean {
    return window === 'inventory' || window === 'pack' || window === 'crafting' || window === 'chest' || window === 'barrel' || window === 'furnace' || window === 'cooking' || window === 'press' || window === 'fermentation';
  }

  private visibleItemSlots(): ItemSlot[] {
    if (this.openWindowValue === 'inventory') return [...this.equipmentItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'crafting') return [...this.craftingItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'chest') return [...this.chestItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'barrel') return [...this.barrelItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'furnace') return [...this.furnaceItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'cooking') return [...this.cookingFireItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'press') return [...this.pressItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'fermentation') return [...this.fermentationItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
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
    return craftingRecipeBookEntries(
      this.model.nearbyCraftingStations ?? [],
      this.model.inventory,
      this.model.knownRecipeIds ?? [],
    );
  }

  private quickMoveDestinations(source: string): readonly string[] {
    if (source === 'chest') return ['hotbar', 'backpack'];
    if (this.openWindowValue === 'chest') return ['chest'];
    if (source === 'placeable') return ['hotbar', 'backpack'];
    if (this.openWindowValue === 'barrel' || this.openWindowValue === 'furnace' || this.openWindowValue === 'cooking'
      || this.openWindowValue === 'press' || this.openWindowValue === 'fermentation') return ['placeable'];
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
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    const progress = Math.max(0, Math.min(1, this.model.barrelProgress ?? 0));
    const sealButton = barrelSealButtonRect(rect);
    drawUiSkinAsset(context, this.skin.button, sealButton, this.model.barrelSealed ? 'disabled' : 'idle');
    drawLabel(context, this.fonts, this.model.barrelSealed
      ? `CURING ${Math.floor(progress * 100)}%`
      : '[S] SEAL 4-24 MATCHING CROPS', sealButton.x + sealButton.width / 2, sealButton.y + 6, {
      align: 'center', color: '#6b4428',
    });
    this.drawWindowHotbar(context, rect);
  }

  private drawFurnace(context: CanvasRenderingContext2D, rect: UiRect): void {
    const labels = ['ORE', 'FUEL', 'BAR'] as const;
    for (const [index, slot] of this.furnaceItemSlots.entries()) {
      drawPixelTextInRect(context, this.fonts, labels[index]!, {
        x: slot.bounds.x - 5,
        y: slot.bounds.y - 13,
        width: slot.bounds.width + 10,
        height: 10,
      }, { align: 'center', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    const inputRight = this.furnaceItemSlots[0]!.bounds.x + this.furnaceItemSlots[0]!.bounds.width;
    const outputLeft = this.furnaceItemSlots[2]!.bounds.x;
    drawLabel(context, this.fonts, '>', (inputRight + outputLeft) / 2,
      this.furnaceItemSlots[2]!.bounds.y + 7, { align: 'center', color: '#6b4428', font: 'header' });
    const progress = Math.max(0, Math.min(1, this.model.furnaceProgress ?? 0));
    this.drawVerticalProcessorProgress(
      context,
      this.layout.furnaceProgress,
      this.layout.furnaceTimer,
      this.layout.furnaceStatus,
      progress,
      this.model.furnaceRemainingSeconds,
      this.model.furnaceRemainingSeconds != null ? 'SMELTING' : 'ADD INPUTS',
      '#6b4428',
    );
    drawLabel(context, this.fonts, 'BACKPACK', this.layout.backpackSlots[0]!.x, rect.y + 35, { color: '#6b4428' });
    for (const slot of this.backpackItemSlots) {
      if (!slot.visible) continue;
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
    }
    this.inventoryScrollBar.draw(context);
    this.drawWindowHotbar(context, rect);
  }

  private drawProcessorProgress(
    context: CanvasRenderingContext2D,
    rect: UiRect,
    progress: number,
    remainingSeconds: number | null | undefined,
    status: string,
    statusColor: string,
  ): void {
    const active = remainingSeconds !== null && remainingSeconds !== undefined;
    const track = {
      x: rect.x,
      y: rect.y + Math.round((rect.height - 6) / 2),
      width: rect.width,
      height: 6,
    };
    drawUiSkinAsset(context, this.skin.sliderTrack, track, 'base', 2);
    if (active) {
      const fillWidth = Math.max(1, Math.round((track.width - 2) * Math.max(0, Math.min(1, progress))));
      drawUiSkinAsset(context, this.skin.sliderFill, {
        x: track.x + 1,
        y: track.y + 1,
        width: fillWidth,
        height: 4,
      }, 'base', 2);
    }
    const statusWithTimer = active ? `${status} ${processorCountdownLabel(remainingSeconds)}` : status;
    drawPixelTextInRect(context, this.fonts, statusWithTimer, this.layout.processorStatus, {
      align: 'center', verticalAlign: 'center', color: statusColor, overflow: 'ellipsis',
    });
  }

  private drawCookingProgress(
    context: CanvasRenderingContext2D,
    progress: number,
    remainingSeconds: number | null | undefined,
    status: string,
    statusColor: string,
  ): void {
    this.drawVerticalProcessorProgress(
      context,
      this.layout.cookingProgress,
      this.layout.cookingTimer,
      this.layout.processorStatus,
      progress,
      remainingSeconds,
      status,
      statusColor,
    );
  }

  private drawVerticalProcessorProgress(
    context: CanvasRenderingContext2D,
    track: UiRect,
    timer: UiRect,
    statusRect: UiRect,
    progress: number,
    remainingSeconds: number | null | undefined,
    status: string,
    statusColor: string,
  ): void {
    const active = remainingSeconds !== null && remainingSeconds !== undefined;
    drawUiSkinAsset(context, this.skin.sliderTrackVertical, track, 'base', 2);
    if (active) {
      const fillHeight = Math.max(1, Math.round(track.height * Math.max(0, Math.min(1, progress))));
      context.save();
      context.beginPath();
      context.rect(track.x, track.y + track.height - fillHeight, track.width, fillHeight);
      context.clip();
      drawUiSkinAsset(context, this.skin.sliderFillVertical, track, 'base', 2);
      context.restore();
    }
    drawPixelTextInRect(
      context,
      this.fonts,
      active ? processorCountdownLabel(remainingSeconds) : '--:--',
      timer,
      { align: 'center', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' },
    );
    drawPixelTextInRect(context, this.fonts, status, statusRect, {
      align: 'center', verticalAlign: 'center', color: statusColor, overflow: 'ellipsis',
    });
  }

  private drawDownChevron(context: CanvasRenderingContext2D, centerX: number, top: number): void {
    context.save();
    context.fillStyle = '#6b4428';
    context.fillRect(Math.round(centerX) - 4, top, 2, 2);
    context.fillRect(Math.round(centerX) + 3, top, 2, 2);
    context.fillRect(Math.round(centerX) - 2, top + 2, 2, 2);
    context.fillRect(Math.round(centerX) + 1, top + 2, 2, 2);
    context.fillRect(Math.round(centerX), top + 4, 1, 2);
    context.restore();
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
