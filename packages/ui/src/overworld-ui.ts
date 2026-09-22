import { EquipmentTooltipDwell, equipmentTooltipRect } from './equipment-tooltip.js';
import type { HearthDangerNotice } from '@orchard/sim';
import {HEARTH_LOBBY_STASH_CAPACITY} from '@orchard/sim';
import {FerryMenu} from './ferry-menu.js';
import type {HearthFerryDock} from '@orchard/sim';
import {OutdoorRewards,type OutdoorRewardEntry} from './outdoor-rewards.js';
import { equipmentDescriptionLines } from './equipment-description.js';
import { changeExperimentalWebGL, readExperimentalWebGL, worldBackendStatus } from './world-backend-setting.js';
export { changeExperimentalWebGL, readExperimentalWebGL, worldBackendStatus, updateWorldBackendStatus, EXPERIMENTAL_WEBGL_EVENT } from './world-backend-setting.js';
import { compactVideoRows, videoRowHeight as videoSettingsRowHeight } from './video-rows.js';
import { changePresentationCap, readPresentationCap } from './presentation-cap-setting.js';
export { changePresentationCap, readPresentationCap, PRESENTATION_CAP_EVENT, type PresentationCapSetting } from './presentation-cap-setting.js';
import { HudSectionCache, type HudCacheKey } from './hud-section-cache.js';
export { disposeHudDisplayCaches, hudDisplayCacheDiagnostics, type HudDisplayCacheDiagnostics } from './hud-display-caches.js';
import { changeWorldScale, readWorldScale, worldScaleSettingLabel } from './world-scale-setting.js';
export { changeWorldScale, readWorldScale, worldScaleSettingLabel, WORLD_SCALE_EVENT, type WorldScaleSetting } from './world-scale-setting.js';
import { renderProtocolAction } from './render-protocol-action.js';
import { MAIN_HAND_INVENTORY_SLOT, BACKPACK_SLOT_COUNT, BACKPACK_SLOT_OFFSET, BOOTSTRAP_ITEM_CONTAINER_CONTENT, CHEST_STORAGE_CAPACITY, CHEST_STORAGE_COLUMNS, CRAFTING_SLOT_COUNT, CRAFTING_SLOT_OFFSET, EQUIPMENT_SLOTS, EQUIPMENT_SLOT_OFFSET, HOTBAR_SLOT_COUNT, clickContainerSlot, craftingRecipeOutput, hotbarSlotForInputCode, hotbarSlotLabel, itemContainerContentResolver, itemDefinition, itemStacksCompatible, bootstrapContentRegistry, maxStackFor, pickupAllToCursor, quickCraftCursorStack, quickMoveAllMatchingStacks, recipeDefinition, runtimeCraftingRecipeOutput, runtimeDurabilityDefinition, runtimeItemDefinition, runtimeMatchingRecipeId, runtimeMaxStack, runtimeRecipeDefinition, runtimeRecipeSkillSatisfied, type ContainerSnapshot, type ContentRegistry, type CraftingStation, type FrameDefinitionId, type ItemDefinition, type ItemStack, type MoonPhase, type MoveItemRequest, type WeatherMode, type WindDirectionMode } from '@orchard/sim';
import type { LoadedAsset } from './assets.js';
import { isolatedAtlasFrameImage } from './atlas-frame-image.js';
import { drawOutlinedPixelText, drawPixelText, drawPixelTextInRect, measurePixelText, type PixelUi } from './pixel-ui.js';
import { craftingRecipeBookEntries, craftingRecipeStacks } from './recipe-book.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { UiInputRouter } from './input-router.js';
import { Slider } from './slider.js';
import { MAX_TOUCH_BOTTOM_OFFSET, DEFAULT_TOUCH_CONTROL_PREFERENCES, type TouchControlPreferences } from './touch-controls.js';
import { BUTTON_HEIGHT, CanvasButton, drawButton } from './button.js';
import { drawToggleSwitch, Toggle } from './toggle.js';
import { Ribbon, STACKED_RIBBON_HEIGHT } from './ribbon.js';
import { EQUIPMENT_SLOT_RESTRICTIONS, ItemSlot, itemSlotRejectsCursor } from './item-slot.js';
import { HelpBook } from './help-book.js';
import { ScrollBar } from './scrollbar.js';
import {
  drawStorageFrameChrome,
  layoutStorageFrame,
  type StorageFrameLayout,
  type StorageFrameSpec,
} from './storage-frame.js';
import {
  chestInventorySearchRect,
  contentFrameButtonAt,
  contentFramePaneVisible,
  drawContentFrame,
  layoutContentFrame,
  type ContentFrameLayout,
  type ContentFramePaneLayout,
} from './content-frame.js';
import { CurrencyDisplay } from './currency-display.js';
import { PlayerResourceFrame } from './player-resource-frame.js';
import { pwaUpdateLabel, type PwaUpdateStatus } from './pwa-update.js';
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
import type { SkillPointNotice } from './skill-point-notice.js';
import { StatisticsScreen, type StatisticsScreenModel } from './statistics-screen.js';
import { PROGRESSION_TABS, progressionTabsLayout, type ProgressionTab } from './progression-tabs.js';
import { QuestLog, type QuestLogEntry } from './quest-log.js';
import { drawUiInventorySlotBacking, uiInventorySelectorRect } from './design-system/inventory.js';
import { uiDurabilityFraction } from './item-durability.js';
import {
  drawFantasyButton,
  drawFantasyIconCell,
  fantasyAudioIconFrame,
  type FantasyButtonGlyph,
  type FantasyButtonTone,
} from './design-system/fantasy-controls.js';
import { type Direction, type PlayerAppearanceSelection, type SkillTrack } from '@orchard/sim';

type LightingModel = 'classic' | 'unified';
type LightingQuality = 'basic' | 'dynamic';
type LightingSettingsMode = 'basic' | 'classic' | 'dynamic';
export function lightingSettingsMode(model: { readonly lightingQuality?: LightingQuality; readonly lightingModel?: LightingModel }): LightingSettingsMode {
  return model.lightingQuality === 'basic' ? 'basic' : model.lightingModel === 'unified' ? 'dynamic' : 'classic';
}
type FrameSurface = 'inventory' | 'crafting' | 'entity' | 'merchant';

/** Bespoke bootstrap effects keep their art; newly authored effects remain
 * legible without being misrepresented as one of those known statuses. */
export function effectStatusAsset(skin: UiSkin, effectKind: string): LoadedAsset {
  return effectKind === 'winded' ? skin.effectWinded
    : effectKind === 'orchard_tea' ? skin.effectOrchardTea
      : effectKind === 'fruitful_energy' ? skin.effectFruitfulEnergy
        : effectKind === 'well_rested' ? skin.effectWellRested
          : skin.selectorNeutral;
}

export type OverworldWindow = 'inventory' | 'pack' | 'crafting' | 'content' | 'chest' | 'barrel' | 'furnace' | 'cooking' | 'press' | 'fermentation' | ProgressionTab | 'quests' | 'outdoor-rewards' | 'ferry' | 'delve-confirmation' | 'system' | 'settings' | 'developer' | 'help';
export type ContentFrameWindow = 'pack' | 'crafting' | 'chest' | 'barrel' | 'furnace' | 'cooking' | 'press' | 'fermentation' | 'shop';

export function contentFrameDefinitionForSurface(
  frames: ReadonlyMap<string, import('@orchard/sim').FrameContentDefinition>,
  surface: FrameSurface,
): import('@orchard/sim').FrameContentDefinition | null {
  return [...frames.values()].find((definition) => definition.retired !== true
    && definition.presentation?.surface === surface) ?? null;
}
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

const RING_EQUIPMENT_SLOT_INDEX = 2;

/** The time readout is an equipment effect, not an inventory possession
 * effect. A watch in the backpack or hotbar must not reveal it. */
export function hasEquippedWatch(
  inventory: readonly OverworldUiInventorySlot[],
  registry: ContentRegistry = bootstrapContentRegistry(),
): boolean {
  return inventory.some((slot) => slot.slot === EQUIPMENT_SLOT_OFFSET + RING_EQUIPMENT_SLOT_INDEX
    && slot.quantity > 0
    && runtimeItemDefinition(registry, slot.itemKind)?.tags.includes('utility.time') === true
    && runtimeItemDefinition(registry, slot.itemKind)?.tags.includes('gear.ring') === true);
}

export function watchStatusLabel(
  timeLabel: string,
  dateLabel: string,
  moonPhase: MoonPhase | undefined,
): string {
  const moonLabel = moonPhase === undefined ? 'Moon Unknown' : MOON_PHASE_LABELS[moonPhase];
  return `Time ${timeLabel} · ${dateLabel} · ${moonLabel}`;
}

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
  readonly touchControlPreferences?: TouchControlPreferences;
  readonly playerCount: number;
  readonly onlinePlayersVisible?: boolean;
  readonly canManageHomestead?: boolean;
  readonly zoneName?: string;
  readonly dangerNotice?: HearthDangerNotice | null;
  readonly selectedSlot: number;
  readonly balanceBronze?: bigint;
  readonly inventory: readonly OverworldUiInventorySlot[];
  readonly cursorStack?: ItemStack | null;
  readonly vitals?: OverworldUiVitals;
  readonly targetVitals?: OverworldUiTargetVitals;
  readonly effects?: readonly OverworldUiEffect[];
  readonly vigourDenied?: boolean;
  readonly openChestInventory?: readonly OverworldUiInventorySlot[];
  readonly openStashInventory?:readonly OverworldUiInventorySlot[];
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
  readonly hasBackpack: boolean;
  readonly backpackSlotCapacity?: number;
  readonly audioVolumes: { readonly master: number; readonly music: number; readonly sfx: number };
  readonly audioBackground?: { readonly music: boolean; readonly sounds: boolean };
  readonly nameplatesVisible?: boolean;
  readonly canAdministerWorld: boolean;
  /** A private Delve run is active, so the system menu may offer a safe exit. */
  readonly delveActive?: boolean;
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
  readonly lightingQuality?: LightingQuality;
  readonly lightingFallbackReason?: string | null;
  readonly cellarOrePreview?: boolean;
  readonly fullscreen?: boolean;
  readonly fullscreenAvailable?: boolean;
  readonly pwaUpdateStatus?: PwaUpdateStatus;
  readonly prompt: string | null;
  readonly toast: string | null;
  readonly toastKind?: 'info' | 'success' | 'failure';
  readonly skillPointNotice?: SkillPointNotice | null;
  readonly nearbyCraftingStations?: readonly CraftingStation[];
  readonly knownRecipeIds?: readonly string[];
  readonly character?: CharacterScreenModel;
  readonly skills?: SkillTreeModel;
  readonly statistics?: StatisticsScreenModel;
  readonly quests?: readonly QuestLogEntry[];
  readonly outdoorRewards?: readonly OutdoorRewardEntry[];
  readonly outdoorRewardCount?: number;
  /** Explorer-gated overlay capability. The player marker remains visible. */
  readonly minimapTrackingEnabled?: boolean;
  /** Last fully verified live content registry. Omitting it retains the
   * compiled layouts as a continuity fallback. */
  readonly contentRegistry?: ContentRegistry;
  /** The server-selected object's authored frame ref. Presentation cannot use
   * this value to bypass container reducers or create inventory authority. */
  readonly activeFrameId?: FrameDefinitionId;
  readonly activeFrameProgress?: number;
  readonly activeFrameState?: Readonly<Record<string, boolean | string | number>>;
  readonly inventoryFrameState?: Readonly<Record<string, boolean | string | number>>;
}

export type MinimapDrawer = (
  context: CanvasRenderingContext2D,
  rect: UiRect,
  pixelsPerTile: number,
  trackingEnabled: boolean,
) => void;

export interface OverworldUiCallbacks {
  readonly toggleBuild?: () => void;
  readonly selectHotbar: (slot: number) => void;
  readonly setTimeFraction: (fraction: number) => void;
  readonly shiftDay: (days: number) => void;
  readonly cycleWeather: () => void;
  readonly cycleWindDirection: () => void;
  readonly toggleLightingEffects: () => void;
  readonly setLightingQuality?: (quality: LightingQuality) => void;
  readonly setLightingModel?: (model: LightingModel) => void;
  readonly toggleCellarOrePreview?: () => void;
  readonly travelHearthFerry?: (from:HearthFerryDock,to:HearthFerryDock)=>Promise<void>;
  readonly claimOutdoorReward?: (id:string)=>Promise<void>;
  readonly setQuestPinned: (questId: string, pinned: boolean) => void;
  readonly abandonQuest: (questId: string) => void;
  readonly setAppearance?: (appearance: PlayerAppearanceSelection) => void;
  readonly prioritizeEquipmentSkill?: (nodeId:string)=>void;
  readonly purchaseSkillNode?: (nodeId: string) => void;
  readonly resetSkillTree?: (track: SkillTrack) => void;
  readonly dismissSkillPointNotice?: () => void;
  readonly setAudioVolume: (bus: 'master' | 'music' | 'sfx', value: number) => void;
  readonly setAudioBackground: (bus: 'music' | 'sounds', enabled: boolean) => void;
  readonly setNameplatesVisible?: (visible: boolean) => void;
  readonly setTouchControlPreferences?: (preferences: TouchControlPreferences) => void;
  readonly signOut: () => void;
  readonly quitToTitle: () => void;
  readonly startDelve: () => void;
  readonly exitDelve: () => void;
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
  readonly frameAction?: (actionId: string) => void;
}

export interface OverworldUiItemArt {
  readonly [itemKind: string]: LoadedAsset;
  readonly avatar: LoadedAsset;
  readonly missing: LoadedAsset;
}

export interface OverworldUiLayout {
  readonly status: UiRect;
  readonly watchStatus: UiRect;
  readonly currency: UiRect;
  readonly timeSlider: UiRect;
  readonly previousDayButton: UiRect;
  readonly nextDayButton: UiRect;
  readonly weatherButton: UiRect;
  readonly windDirectionButton: UiRect;
  readonly lightingEffectsButton: UiRect;
  readonly orePreviewButton: UiRect;
  readonly mobileMenuButton: UiRect;
  readonly craftingButton: UiRect;
  readonly buildButton: UiRect;
  readonly moonPhase: UiRect;
  readonly collapsedZoneTab: UiRect;
  readonly minimap: UiRect;
  readonly minimapViewport: UiRect;
  readonly collapsedMinimapTab: UiRect;
  readonly minimapZoomOutButton: UiRect;
  readonly minimapZoomInButton: UiRect;
  readonly hotbar: UiRect;
  readonly weaponShortcut: UiRect;
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
  readonly contentFrames: ReadonlyMap<string, ContentFrameLayout>;
  readonly systemWindow: UiRect;
  readonly settingsWindow: UiRect;
  readonly settingsContent: UiRect;
  readonly settingsTabs: Readonly<Record<SettingsTab, UiRect>>;
  readonly lightingQualityButton: UiRect;
  readonly worldScaleButton: UiRect;
  readonly presentationCapButton: UiRect;
  readonly experimentalWebGLButton: UiRect;
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
  readonly craftingRecipeFilter: UiRect;
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
  readonly delveConfirmButton: UiRect;
  readonly delveCancelButton: UiRect;
  readonly exitDelveButton: UiRect;
  readonly helpButton: UiRect;
  readonly settingsButton: UiRect;
  readonly outdoorRewardsButton: UiRect;
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
  readonly touchSwapToggle: UiRect;
  readonly touchBottomOffsetSlider: UiRect;
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
  const buttonY = frame.y + frame.height - BUTTON_HEIGHT.regular - 21;
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

export const CHEST_STORAGE_FRAME_SPEC: StorageFrameSpec = {
  title: 'CHEST',
  style: 'wood_parchment',
  preferredWidth: 380,
  resizable: false,
  panes: [
    { id: 'chest', label: 'CHEST', columns: CHEST_STORAGE_COLUMNS, rows: CHEST_STORAGE_CAPACITY / CHEST_STORAGE_COLUMNS },
    { id: 'backpack', label: 'INVENTORY', columns: 5, rows: 4, columnGap: 3 },
  ],
  hotbar: { label: 'HOT BAR', columns: HOTBAR_SLOT_COUNT },
};

export interface OverworldUiLayoutOptions {
  readonly chestFrame?: UiRect;
  readonly frameOverrides?: ReadonlyMap<string, UiRect>;
  readonly touchControls?: boolean;
  readonly canAdministerWorld?: boolean;
  readonly pwaUpdateVisible?: boolean;
  readonly delveActive?: boolean;
  readonly contentRegistry?: Pick<ContentRegistry, 'frames' | 'items' | 'processes'>;
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

export function overworldItemDefinition(
  itemKind: string,
  registry?: ContentRegistry,
): ItemDefinition | null {
  return registry === undefined
    ? itemDefinition(itemKind)
    : runtimeItemDefinition(registry, itemKind);
}

export function overworldItemMaxStack(itemKind: string, registry?: ContentRegistry): number {
  return registry === undefined
    ? maxStackFor(itemKind) ?? 0
    : runtimeMaxStack(registry, itemKind) ?? 0;
}

export function itemIconAnimation(itemKind: string, registry?: ContentRegistry): string {
  return overworldItemDefinition(itemKind, registry)?.iconAnimation ?? 'base';
}

/** Selects slot artwork without allowing a retained asset map to revive an
 * item which is absent or retired in the supplied live registry. Omitting the
 * registry preserves the explicit bootstrap/sandbox presentation path. */
export function overworldItemArtwork(
  itemArt: OverworldUiItemArt,
  itemKind: string,
  registry?: ContentRegistry,
): LoadedAsset | undefined {
  if (itemKind === 'empty') return undefined;
  if (registry === undefined) return itemArt[itemKind];
  const definition = registry.items.get(`item:${itemKind}`);
  return definition === undefined || definition.retired === true
    ? itemArt.missing
    : itemArt[itemKind] ?? itemArt.missing;
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
  const status = { x: 4, y: 2, width: Math.min(220, width - 160), height: STACKED_RIBBON_HEIGHT };
  const watchStatus = {
    x: status.x,
    y: status.y + status.height,
    width: status.width,
    height: 18,
  };
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
  const contentFrames = new Map<string, ContentFrameLayout>();
  if (options.contentRegistry !== undefined) {
    for (const definition of options.contentRegistry.frames.values()) {
      if (definition.retired === true) continue;
      // Keep the long-standing outer window dimensions during the additive
      // migration. Authored panes own the internal geometry; legacy filters,
      // labels, and recipe controls remain aligned until each becomes a pane
      // renderer of its own.
      const requestedFrame = options.frameOverrides?.get(definition.id)
        ?? (definition.presentation?.entityContainer === 'chest' ? options.chestFrame
        : definition.presentation?.surface === 'crafting' ? craftingWindow
          : definition.presentation?.surface === 'merchant' ? undefined
            : inventoryWindow);
      contentFrames.set(definition.id, layoutContentFrame(
        { width, height },
        definition,
        {
          entity: definition.presentation?.entityContainer ?? 'placeable',
          backpack: 'backpack', hotbar: 'hotbar', equipment: 'equipment', crafting: 'crafting', merchant: 'merchant',
        },
        options.contentRegistry,
        requestedFrame,
      ));
    }
  }
  type SystemMenuAction = 'outdoorRewards' | 'resume' | 'settings' | 'help' | 'developer' | 'fullscreen' | 'update' | 'exitDelve' | 'signOut' | 'quit';
  const visibleSystemMenuActions: SystemMenuAction[] = ['resume', 'outdoorRewards', 'settings', 'help'];
  if (options.canAdministerWorld === true) visibleSystemMenuActions.push('developer');
  visibleSystemMenuActions.push('fullscreen');
  if (options.pwaUpdateVisible === true) visibleSystemMenuActions.push('update');
  if (options.delveActive === true) visibleSystemMenuActions.push('exitDelve');
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
  const videoRowHeight = videoSettingsRowHeight(settingsContent.height);
  const lightingQualityButton = {
    x: settingsContent.x + Math.floor(settingsContent.width * 0.5),
    y: settingsContent.y + 23 + (compactVideoRows(settingsContent.height) ? 0 : 4) * videoRowHeight,
    width: Math.max(40, settingsContent.width * 0.5 - 10),
    height: Math.min(18, videoRowHeight),
  };
  const worldScaleButton = { ...lightingQualityButton, y: lightingQualityButton.y + videoRowHeight };
  const presentationCapButton = { ...worldScaleButton, y: worldScaleButton.y + videoRowHeight };
  const experimentalWebGLButton = { ...presentationCapButton, x: settingsContent.x + settingsContent.width - 60,
    width: 50, y: presentationCapButton.y + videoRowHeight };
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
  const equipmentCells = Array.from({ length: EQUIPMENT_SLOTS.length }, (_, index) => (
    [index % 3, Math.floor(index / 3)] as const
  ));
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
    watchStatus,
    currency,
    previousDayButton: { x: developerContent.x + 8, y: developerContent.y + 25, width: 58, height: 20 },
    timeSlider: { x: developerContent.x + 72, y: developerContent.y + 27, width: Math.max(32, developerContent.width - 144), height: 16 },
    nextDayButton: { x: developerContent.x + developerContent.width - 66, y: developerContent.y + 25, width: 58, height: 20 },
    weatherButton: { x: developerContent.x + 8, y: developerContent.y + 56, width: developerContent.width - 16, height: 22 },
    windDirectionButton: { x: developerContent.x + 8, y: developerContent.y + 84, width: developerContent.width - 16, height: 22 },
    lightingEffectsButton: { x: developerContent.x + developerContent.width - 48, y: developerContent.y + 32, width: 40, height: 18 },
    orePreviewButton: { x: developerContent.x + developerContent.width - 48, y: developerContent.y + 67, width: 40, height: 18 },
    mobileMenuButton: { x: width - 50, y: 4, width: 44, height: 24 },
    buildButton: { x: Math.max(4, hotbar.x - 28), y: hotbar.y - 30, width: 24, height: 24 },
    craftingButton: {
      x: Math.max(4, hotbar.x - 28),
      y: hotbar.y + Math.round((Math.min(SLOT_HEIGHT, hotbar.height) - 24) / 2),
      width: 24,
      height: 24,
    },
    // Keep this action inside the banner's writable face. The final 28 pixels
    // are the folded tail, which clips an icon placed against the outer rect.
    moonPhase: { x: status.x + status.width + 2, y: status.y + 1, width: 32, height: 32 },
    collapsedZoneTab: { x: 0, y: 4, width: 32, height: 16 },
    minimap: { x: width - 120, y: 4, width: 116, height: 92 },
    minimapViewport: { x: width - 114, y: 10, width: 104, height: 66 },
    collapsedMinimapTab: { x: width - 32, y: 4, width: 32, height: 16 },
    minimapZoomOutButton: { x: width - 112, y: 76, width: 24, height: 14 },
    minimapZoomInButton: { x: width - 34, y: 76, width: 24, height: 14 },
    hotbar,
    weaponShortcut: {x:Math.max(4,hotbar.x-32),y:hotbar.y-64,width:28,height:31},
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
    contentFrames,
    systemWindow,
    settingsWindow,
    settingsContent,
    settingsTabs,
    lightingQualityButton,
    worldScaleButton,
    presentationCapButton,
    experimentalWebGLButton,
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
    craftingRecipeFilter: {
      x: craftingRecipeX,
      y: craftingWindow.y + 29,
      width: craftingRecipeWidth,
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
      width: Math.max(40, craftingRecipeWidth - 18),
      height: 15,
    })),
    craftingRecipeScroll: {
      x: craftingRecipeX + craftingRecipeWidth - 15,
      y: craftingWindow.y + 51,
      width: 15,
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
    delveConfirmButton: {
      x: window.x + 28 + Math.floor((window.width - 48) / 2),
      y: window.y + window.height - 45,
      width: Math.floor((window.width - 48) / 2),
      height: BUTTON_HEIGHT.regular,
    },
    delveCancelButton: {
      x: window.x + 20,
      y: window.y + window.height - 45,
      width: Math.floor((window.width - 48) / 2),
      height: BUTTON_HEIGHT.regular,
    },
    exitDelveButton: systemMenuButton('exitDelve'),
    settingsButton: systemMenuButton('settings'),
    outdoorRewardsButton: systemMenuButton('outdoorRewards'),
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
    touchSwapToggle: { x: settingsContent.x + settingsContent.width - 42, y: settingsContent.y + 18, width: 40, height: 18 },
    touchBottomOffsetSlider: { x: settingsContent.x + 10, y: settingsContent.y + 58, width: Math.max(36, settingsContent.width - 58), height: 18 },
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
  private readonly statusCache = new HudSectionCache();
  private readonly currencyCache = new HudSectionCache();
  private readonly hotbarCache = new HudSectionCache();
  private readonly hudHotbarItems: Array<OverworldUiInventorySlot | undefined> = new Array(HOTBAR_SLOT_COUNT);
  private hudCacheEnabled = true;
  private hudArtRevision = 0;

  /** Diagnostics/golden reference; disabling also releases retained surfaces. */
  setHudCacheEnabled(enabled: boolean): void {
    this.hudCacheEnabled = enabled;
    if (!enabled) this.disposeHudCache();
  }
  /** Call after replacing UI artwork or mutating authored frame metadata. */
  invalidateHudArtwork(): void { this.hudArtRevision++; }
  disposeHudCache(): void {
    this.statusCache.dispose(); this.currencyCache.dispose(); this.hotbarCache.dispose(); this.hudHotbarItems.fill(undefined);
  }
  get hudCacheDiagnostics(): { builds: number; reuses: number; allocations: number; bytes: number } {
    const caches = [this.statusCache, this.currencyCache, this.hotbarCache];
    return {
      builds: caches.reduce((sum, cache) => sum + cache.builds, 0),
      reuses: caches.reduce((sum, cache) => sum + cache.reuses, 0),
      allocations: caches.reduce((sum, cache) => sum + cache.allocations, 0),
      bytes: caches.reduce((sum, cache) => sum + cache.bytes, 0),
    };
  }

  readonly root: WidgetNode;
  private readonly router: UiInputRouter;
  private readonly hotbarNodes: WidgetNode[];
  private readonly weaponShortcutNode: WidgetNode;
  private readonly zoneNode: WidgetNode;
  private readonly minimapNode: WidgetNode;
  private readonly minimapZoomOutNode: WidgetNode;
  private readonly minimapZoomInNode: WidgetNode;
  private readonly currencyNode: WidgetNode;
  private readonly timeSlider: Slider;
  private readonly previousDayNode: WidgetNode;
  private readonly nextDayNode: WidgetNode;
  private readonly weatherModeNode: WidgetNode;
  private readonly windDirectionNode: WidgetNode;
  private readonly lightingEffectsToggle: Toggle;
  private readonly orePreviewToggle: Toggle;
  private readonly mobileMenuNode: WidgetNode;
  private readonly craftingNode: WidgetNode;
  private readonly buildNode: WidgetNode;
  private readonly windowNode: WidgetNode;
  private readonly closeNode: WidgetNode;
  private readonly inventoryHotbarSlots: ItemSlot[];
  private readonly backpackItemSlots: ItemSlot[];
  private readonly equipmentItemSlots: ItemSlot[];
  private readonly craftingItemSlots: ItemSlot[];
  private readonly chestItemSlots: ItemSlot[];
  /** One retained pool for all authored placeable frames. Slot meaning,
   * ordering, restrictions and visibility come from the active definition. */
  private readonly stashItemSlots:ItemSlot[];
  private readonly placeableItemSlots: ItemSlot[];
  // Compatibility views for legacy drawing helpers retained until the pack
  // and crafting pane renderers finish their separate migration.
  private get barrelItemSlots(): ItemSlot[] { return this.placeableItemSlots.slice(0, 8); }
  private get furnaceItemSlots(): ItemSlot[] { return this.placeableItemSlots.slice(0, 3); }
  private get cookingFireItemSlots(): ItemSlot[] { return this.placeableItemSlots.slice(0, 2); }
  private get pressItemSlots(): ItemSlot[] { return this.placeableItemSlots.slice(0, 3); }
  private get fermentationItemSlots(): ItemSlot[] { return this.placeableItemSlots.slice(0, 2); }
  private readonly backpackSortNode: WidgetNode;
  private readonly chestSortNode: WidgetNode;
  private readonly barrelSortNode: WidgetNode;
  private readonly resumeNode: WidgetNode;
  private readonly delveConfirmButton: CanvasButton;
  private readonly delveCancelButton: CanvasButton;
  private readonly exitDelveNode: WidgetNode;
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
  private readonly lightingQualityNode: WidgetNode;
  private readonly worldScaleNode: WidgetNode;
  private readonly presentationCapNode: WidgetNode;
  private readonly experimentalWebGLNode: WidgetNode;
  private readonly renderProtocolNode: WidgetNode;
  private readonly developerTabNodes: Readonly<Record<DeveloperTab, WidgetNode>>;
  private readonly masterSlider: Slider;
  private readonly musicSlider: Slider;
  private readonly sfxSlider: Slider;
  private readonly audioMuteNodes: Readonly<Record<AudioVolumeBus, WidgetNode>>;
  private readonly musicBackgroundToggle: Toggle;
  private readonly soundsBackgroundToggle: Toggle;
  private readonly nameplatesToggle: Toggle;
  private readonly touchSwapToggle: Toggle;
  private readonly touchBottomOffsetSlider: Slider;
  private readonly windowRibbon: Ribbon;
  private readonly zoneRibbon: Ribbon;
  private readonly helpBook: HelpBook;
  private readonly onlinePlayersScrollBar: ScrollBar;
  private readonly inventoryScrollBar: ScrollBar;
  private readonly craftingRecipeScrollBar: ScrollBar;
  private readonly inventoryFilterInput: HTMLInputElement | null;
  private readonly recipeFilterInput: HTMLInputElement | null;
  private readonly watchStatusOutput: HTMLElement | null;
  private inventoryFilterText = '';
  private recipeFilterText = '';
  private selectedCraftingRecipeId: string | null = null;
  private readonly currencyDisplay: CurrencyDisplay;
  private readonly playerResourceFrame: PlayerResourceFrame;
  private readonly targetResourceFrame: PlayerResourceFrame;
  private readonly characterScreen: CharacterScreen;
  private readonly skillTree: SkillTreeUi;
  private readonly statisticsScreen: StatisticsScreen;
  private readonly questLog: QuestLog;
  private readonly ferryMenu:FerryMenu;
  private readonly outdoorRewards:OutdoorRewards;
  private readonly outdoorRewardsNode:WidgetNode;
  private model: OverworldUiModel = {
    width: 480, height: 270, connected: false, playerCount: 0, selectedSlot: 0, balanceBronze: 0n,
    inventory: [], openChestInventory: [], hasBackpack: false, audioVolumes: { master: 0.8, music: 0.7, sfx: 0.35 },
    audioBackground: { music: false, sounds: false },
    nameplatesVisible: true, delveActive: false,
    canAdministerWorld: false, dateLabel: 'SPRING 1', timeLabel: '06:00',
    timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null,
  };
  private layout = overworldUiLayout(480, 270);
  private pointer: UiPoint = { x: -100, y: -100 };
  private hoveredSlot: number | null = null;
  private readonly equipmentTooltipDwell = new EquipmentTooltipDwell();
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
    this.ferryMenu=new FerryMenu(skin,fonts,(from,to)=>this.callbacks.travelHearthFerry?.(from,to)??Promise.reject(new Error('ferry_unavailable')),
      ()=>{if(this.openWindowValue==='ferry')this.openWindow=null;},()=>this.model.contentRegistry);
    this.outdoorRewards=new OutdoorRewards(skin,fonts,id=>this.callbacks.claimOutdoorReward?.(id)??Promise.reject(new Error('reward_unavailable')),
      (context,rect,kind)=>this.drawInventoryItem(context,rect,kind,1));
    this.questLog = new QuestLog(skin, fonts, {
      setPinned: (questId, pinned) => this.callbacks.setQuestPinned(questId, pinned),
      drop: (questId) => this.callbacks.abandonQuest(questId),
    });
    this.onlinePlayersScrollBar = new ScrollBar(skin);
    this.inventoryScrollBar = new ScrollBar(skin);
    this.craftingRecipeScrollBar = new ScrollBar(skin, {
      showWhenDisabled: true,
      trackClick: 'jump',
    });
    this.inventoryFilterInput = typeof document === 'undefined'
      ? null : document.querySelector<HTMLInputElement>('#inventory-filter');
    this.recipeFilterInput = typeof document === 'undefined'
      ? null : document.querySelector<HTMLInputElement>('#recipe-filter');
    this.watchStatusOutput = typeof document === 'undefined'
      ? null : document.querySelector<HTMLElement>('#watch-accessibility-status');
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
    if (this.recipeFilterInput !== null) {
      this.recipeFilterInput.addEventListener('input', () => {
        this.recipeFilterText = this.recipeFilterInput?.value.replace(/[\r\n]/g, '').slice(0, 32) ?? '';
        this.craftingRecipeScrollBar.scrollBy(-this.craftingRecipeScrollBar.maximum);
        this.update(this.model);
      });
      this.recipeFilterInput.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          if (this.recipeFilterInput?.value) {
            this.recipeFilterInput.value = '';
            this.recipeFilterText = '';
            this.update(this.model);
          } else this.recipeFilterInput?.blur();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          this.recipeFilterInput?.blur();
        }
      });
      this.recipeFilterInput.addEventListener('keyup', (event) => event.stopPropagation());
    }
    for (const input of [this.inventoryFilterInput, this.recipeFilterInput]) {
      input?.addEventListener('focus', () => input.classList.add('keyboard-active'));
      input?.addEventListener('blur', () => input.classList.remove('keyboard-active'));
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
      prioritize:(nodeId)=>this.callbacks.prioritizeEquipmentSkill?.(nodeId),
      purchase: (nodeId) => this.callbacks.purchaseSkillNode?.(nodeId),
      reset: (track) => this.callbacks.resetSkillTree?.(track),
    });
    this.statisticsScreen = new StatisticsScreen(skin, fonts);
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
      onChange: () => this.selectLightingMode(lightingSettingsMode(this.model) === 'dynamic' ? 'classic' : 'dynamic'),
    });
    this.orePreviewToggle = new Toggle({
      id: 'window.developer.cellar-ore-preview', skin, fonts,
      onChange: () => this.callbacks.toggleCellarOrePreview?.(),
    });
    this.mobileMenuNode = widget('button', 'hud.mobile-menu', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.openWindow = this.openWindowValue === 'system' ? null : 'system';
        return true;
      },
    });
    this.buildNode = widget('button', 'hud.build', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.toggleBuild?.();
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
    this.weaponShortcutNode = widget('slot','hud.equipped_weapon',{
      onPointer: event => {
        if (event.kind !== 'pointer_down') return false;
        this.callbacks.selectHotbar(MAIN_HAND_INVENTORY_SLOT);
        return true;
      },
    });
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
    this.equipmentItemSlots = EQUIPMENT_SLOTS.map(({ index }) => (
      new ItemSlot(
        `window.inventory.equipment.${index}`, 'equipment', index,
        EQUIPMENT_SLOT_RESTRICTIONS[index],
      )
    ));
    this.craftingItemSlots = Array.from({ length: CRAFTING_SLOT_COUNT }, (_, slot) => new ItemSlot(`window.crafting.${slot}`, 'crafting', slot));
    this.chestItemSlots = Array.from({ length: CHEST_STORAGE_CAPACITY }, (_, slot) => new ItemSlot(`window.chest.${slot}`, 'chest', slot));
    this.stashItemSlots=Array.from({length:HEARTH_LOBBY_STASH_CAPACITY},(_,slot)=>new ItemSlot(`window.stash.${slot}`,'stash',slot));
    this.placeableItemSlots = Array.from({ length: CHEST_STORAGE_CAPACITY }, (_, slot) => (
      new ItemSlot(`window.content.entity.${slot}`, 'placeable', slot)
    ));
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
    this.delveConfirmButton = new CanvasButton({
      id: 'window.delve-confirmation.confirm',
      skin,
      fonts,
      label: 'BEGIN DELVE',
      tone: 'success',
      onPress: () => this.confirmDelve(),
    });
    this.delveCancelButton = new CanvasButton({
      id: 'window.delve-confirmation.cancel',
      skin,
      fonts,
      label: 'CANCEL',
      onPress: () => { this.openWindow = null; },
    });
    this.exitDelveNode = widget('button', 'window.system.exit-delve', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down' || this.model.delveActive !== true) return false;
        this.openWindow = null;
        this.callbacks.exitDelve();
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
    this.outdoorRewardsNode=widget('button','window.system.outdoor-rewards',{
      onPointer:event=>{if(event.kind!=='pointer_down')return false;this.openWindow='outdoor-rewards';return true;},
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
    this.lightingQualityNode = widget('button', 'window.settings.video.lighting-quality', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down' || event.button !== 0) return false;
        const current = lightingSettingsMode(this.model);
        this.selectLightingMode(current === 'basic' ? 'classic' : current === 'classic' ? 'dynamic' : 'basic');
        return true;
      },
    });
    this.worldScaleNode = widget('button', 'window.settings.video.world-scale', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down' || event.button !== 0) return false;
        const current = readWorldScale();
        changeWorldScale(current === '1x' ? '2x' : current === '2x' ? 'native' : '1x');
        return true;
      },
    });
    this.presentationCapNode = widget('button', 'window.settings.video.presentation-cap', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down' || event.button !== 0) return false;
        changePresentationCap(readPresentationCap() === '30hz' ? 'off' : '30hz');
        return true;
      },
    });
    this.experimentalWebGLNode = widget('button', 'window.settings.video.experimental-webgl', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down' || event.button !== 0) return false;
        changeExperimentalWebGL(!readExperimentalWebGL());
        return true;
      },
    });
    this.renderProtocolNode = widget('button', 'window.developer.render.protocol', {
      onPointer: (event) => {
        if (event.kind !== 'pointer_down' || event.button !== 0) return false;
        renderProtocolAction.run();
        this.openWindow = null;
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
    this.touchSwapToggle = new Toggle({
      id: 'window.settings.touch-swap', skin, fonts,
      onChange: (swapped) => this.callbacks.setTouchControlPreferences?.({
        ...(this.model.touchControlPreferences ?? DEFAULT_TOUCH_CONTROL_PREFERENCES), swapped,
      }),
    });
    this.touchBottomOffsetSlider = new Slider({
      id: 'window.settings.touch-bottom-offset', skin, tone: 'gold',
      onChange: (value) => this.callbacks.setTouchControlPreferences?.({
        ...(this.model.touchControlPreferences ?? DEFAULT_TOUCH_CONTROL_PREFERENCES),
        bottomOffset: Math.round(value * MAX_TOUCH_BOTTOM_OFFSET),
      }),
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
      this.delveConfirmButton.node,
      this.delveCancelButton.node,
      this.exitDelveNode,
      this.helpNode,
      this.settingsNode,
      this.outdoorRewardsNode,
      this.fullscreenNode,
      this.updateNode,
      this.developerNode,
      this.signOutNode,
      this.quitNode,
      this.settingsBackNode,
      this.developerBackNode,
      ...SETTINGS_TABS.map((tab) => this.settingsTabNodes[tab]),
      this.lightingQualityNode,
      this.worldScaleNode,
      this.presentationCapNode,
      this.experimentalWebGLNode,
      this.renderProtocolNode,
      ...DEVELOPER_TABS.map((tab) => this.developerTabNodes[tab]),
      this.previousDayNode,
      this.timeSlider.node,
      this.nextDayNode,
      this.weatherModeNode,
      this.windDirectionNode,
      this.lightingEffectsToggle.node,
      this.orePreviewToggle.node,
      this.masterSlider.node,
      this.musicSlider.node,
      this.sfxSlider.node,
      ...(['master', 'music', 'sfx'] as const).map((bus) => this.audioMuteNodes[bus]),
      this.musicBackgroundToggle.node,
      this.soundsBackgroundToggle.node,
      this.nameplatesToggle.node,
      this.touchSwapToggle.node,
      this.touchBottomOffsetSlider.node,
    );
    this.root.add(
      this.zoneNode,
      this.minimapNode,
      this.minimapZoomOutNode,
      this.minimapZoomInNode,
      this.currencyNode,
      hotbar,
      this.weaponShortcutNode,
      this.craftingNode,
      this.buildNode,
      this.mobileMenuNode,
      this.windowNode,
      this.updatePromptNode,
    );
    this.router = new UiInputRouter(this.root);
  }

  openFerry(source:HearthFerryDock):void {this.ferryMenu.open(source);this.openWindow='ferry';}
  get openWindow(): OverworldWindow | null { return this.openWindowValue; }
  get activeSkillTrack(): SkillTrack { return this.skillTree.selectedTrack; }
  private selectLightingMode(mode: LightingSettingsMode): void {
    if (mode !== 'basic') this.callbacks.setLightingModel?.(mode === 'dynamic' ? 'unified' : 'classic');
    this.callbacks.setLightingQuality?.(mode === 'basic' ? 'basic' : 'dynamic');
  }

  get selectedSettingsTab(): SettingsTab { return this.settingsTab; }
  get selectedDeveloperTab(): DeveloperTab { return this.developerTab; }
  get blockingUpdatePromptVisible(): boolean {
    return this.model.pwaUpdateStatus === 'available' && !this.updatePromptDismissed;
  }

  /** Service-worker events must make their modal interactive immediately,
   * including while the world render loop is paused in a background tab. */
  setPwaUpdateStatus(status: PwaUpdateStatus, viewport?: { readonly width: number; readonly height: number }): void {
    const previous = this.model.pwaUpdateStatus;
    this.model = { ...this.model, ...viewport, pwaUpdateStatus: status };
    this.syncPwaUpdatePrompt(previous);
  }

  private syncPwaUpdatePrompt(previous: PwaUpdateStatus | undefined): void {
    const { pwaUpdateStatus: status, width, height } = this.model;
    if (status !== 'available' || previous !== 'available') this.updatePromptDismissed = false;
    if (status === 'available' && previous !== 'available') this.pointerLeave();
    this.updateNode.enabled = status !== undefined && status !== 'unsupported'
      && status !== 'checking' && status !== 'updating';
    this.updatePrompt = pwaUpdatePromptLayout(width, height);
    this.root.setBounds({ x: 0, y: 0, width, height });
    this.updatePromptNode.setBounds({ x: 0, y: 0, width, height });
    this.updatePromptNode.visible = this.blockingUpdatePromptVisible;
    this.updateRefreshButton.setBounds(this.updatePrompt.refreshButton);
    this.updateLaterButton.setBounds(this.updatePrompt.laterButton);
    this.updateRefreshButton.enabled = status === 'available';
    this.updateLaterButton.enabled = status === 'available';
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

  private confirmDelve(): void {
    if (this.openWindowValue !== 'delve-confirmation') return;
    this.openWindow = null;
    this.callbacks.startDelve();
  }

  openQuest(questId: string): boolean {
    if (!this.questLog.select(questId)) return false;
    this.openWindow = 'quests';
    return true;
  }

  openSkillTrack(track: SkillTrack): void {
    this.skillTree.selectTrack(track, this.progressionContentRect());
    this.openWindow = 'skills';
  }
  set openWindow(window: OverworldWindow | null) {
    const requestedWindow = window === 'pack' ? 'inventory' : window;
    const nextWindow = requestedWindow === 'developer' && !this.model.canAdministerWorld ? 'system' : requestedWindow;
    if (this.openWindowValue === 'chest' && nextWindow !== 'chest') this.callbacks.closeChest();
    if ((this.openWindowValue === 'content' || this.openWindowValue === 'barrel' || this.openWindowValue === 'furnace' || this.openWindowValue === 'cooking'
      || this.openWindowValue === 'press' || this.openWindowValue === 'fermentation')
      && nextWindow !== this.openWindowValue) this.callbacks.closePlaceable();
    if (this.openWindowValue === 'crafting' && nextWindow !== 'crafting') {
      this.selectedCraftingRecipeId = null;
      this.callbacks.closeCrafting();
    }
    if (this.isInventoryWindow(this.openWindowValue) && !this.isInventoryWindow(nextWindow)) {
      this.cancelQuickCraftPreview();
      this.clearOptimisticMenu();
      this.cursorPress = null;
      this.inventoryOutsidePress = null;
      this.callbacks.returnInventoryCursor();
    }
    if (nextWindow === 'help' && this.openWindowValue !== 'help') this.helpBook.reset();
    if (this.openWindowValue === 'skills' && nextWindow !== 'skills') this.skillTree.pointerLeave();
    if (this.openWindowValue === 'statistics' && nextWindow !== 'statistics') this.statisticsScreen.pointerLeave();
    this.openWindowValue = nextWindow;
    this.syncActiveWindow();
  }

  update(model: OverworldUiModel): void {
    this.onlinePlayerListActive = false;
    const previousUpdateStatus = this.model.pwaUpdateStatus;
    this.model = model;
    const itemContent = this.itemContainerContent();
    for (const slot of [
      ...this.inventoryHotbarSlots, ...this.backpackItemSlots, ...this.equipmentItemSlots,
      ...this.craftingItemSlots, ...this.chestItemSlots, ...this.placeableItemSlots,
      ...this.stashItemSlots,
    ]) slot.setContentResolver(itemContent);
    if (this.watchStatusOutput !== null) {
      const watchStatus = hasEquippedWatch(model.inventory, model.contentRegistry)
        ? watchStatusLabel(model.timeLabel, model.dateLabel, model.moonPhase)
        : '';
      const skillStatus = model.skillPointNotice === null || model.skillPointNotice === undefined
        ? ''
        : `${model.skillPointNotice.points} new ${model.skillPointNotice.track} skill point${model.skillPointNotice.points === 1 ? '' : 's'}. Press K to open that skill tree.`;
      this.watchStatusOutput.textContent = [watchStatus, skillStatus].filter(Boolean).join(' ');
    }
    this.syncPwaUpdatePrompt(previousUpdateStatus);
    if (model.character !== undefined) this.characterScreen.update(model.character);
    if (model.skills !== undefined) this.skillTree.update(model.skills);
    this.statisticsScreen.update({
      ...(model.statistics ?? { statistics: [] }),
      ...(model.contentRegistry === undefined ? {} : { contentRegistry: model.contentRegistry }),
    });
    this.questLog.update(model.quests ?? []);
    this.outdoorRewards.update(model.outdoorRewards??[],model.delveActive===true);
    if (this.openWindowValue === 'developer' && !model.canAdministerWorld) this.openWindowValue = 'system';
    if (this.openWindowValue === 'delve-confirmation' && model.delveActive === true) {
      this.openWindowValue = null;
    }
    this.layout = overworldUiLayout(model.width, model.height, {
      touchControls: model.touchControls === true,
      canAdministerWorld: model.canAdministerWorld,
      pwaUpdateVisible: model.pwaUpdateStatus !== undefined && model.pwaUpdateStatus !== 'unsupported',
      delveActive: model.delveActive === true,
      ...(model.contentRegistry === undefined ? {} : { contentRegistry: model.contentRegistry }),
    });
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
    this.lightingEffectsToggle.value = lightingSettingsMode(model) === 'dynamic';
    this.orePreviewToggle.value = model.cellarOrePreview === true;
    const hotbar = this.root.children.find((child) => child.id === 'hud.hotbar');
    hotbar?.setBounds(this.layout.hotbar);
    this.hotbarNodes.forEach((node, slot) => node.setBounds(this.layout.slots[slot]!));
    this.weaponShortcutNode.setBounds(this.layout.weaponShortcut);
    this.weaponShortcutNode.visible = this.openWindowValue === null
      && model.inventory.some(item => item.slot === MAIN_HAND_INVENTORY_SLOT && item.itemKind !== 'empty' && item.quantity > 0);
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
    this.equipmentItemSlots.forEach((slot, visualIndex) => {
      slot.setBounds(this.layout.equipmentSlots[visualIndex]!);
      slot.enabled = true;
      slot.item = inventoryBySlot.get(EQUIPMENT_SLOT_OFFSET + slot.index) ?? null;
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
    const stashBySlot=new Map((model.openStashInventory??[]).filter(item=>item.quantity>0&&item.itemKind!=='empty').map(item=>[item.slot,item]));
    this.stashItemSlots.forEach((slot,index)=>{slot.setBounds(this.layout.inventoryWindow);slot.enabled=true;slot.item=stashBySlot.get(index)??null;});
    const placeableBySlot = new Map((model.openPlaceableInventory ?? [])
      .filter((item) => item.itemKind !== 'empty' && item.quantity > 0)
      .map((item) => [item.slot, item]));
    this.placeableItemSlots.forEach((slot, index) => {
      slot.setBounds(this.layout.inventoryWindow);
      slot.enabled = true;
      slot.item = placeableBySlot.get(index) ?? null;
      slot.setRestriction(undefined);
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
    this.delveConfirmButton.setBounds(this.layout.delveConfirmButton);
    this.delveCancelButton.setBounds(this.layout.delveCancelButton);
    this.exitDelveNode.setBounds(this.layout.exitDelveButton);
    this.helpNode.setBounds(this.layout.helpButton);
    this.settingsNode.setBounds(this.layout.settingsButton);
    this.outdoorRewardsNode.setBounds(this.layout.outdoorRewardsButton);
    this.fullscreenNode.setBounds(this.layout.fullscreenButton);
    this.fullscreenNode.enabled = model.fullscreenAvailable ?? true;
    this.updateNode.setBounds(this.layout.updateButton);
    this.developerNode.setBounds(this.layout.developerButton);
    this.mobileMenuNode.setBounds(this.layout.mobileMenuButton);
    this.mobileMenuNode.visible = (model.touchControls === true || model.width < 420)
      && this.openWindowValue === null;
    this.buildNode.setBounds(this.layout.buildButton);
    this.buildNode.visible = this.openWindowValue === null && this.callbacks.toggleBuild !== undefined;
    this.craftingNode.setBounds(this.layout.craftingButton);
    this.craftingNode.visible = this.openWindowValue === null;
    this.signOutNode.setBounds(this.layout.signOutButton);
    this.quitNode.setBounds(this.layout.quitButton);
    this.settingsBackNode.setBounds(this.layout.settingsBackButton);
    this.developerBackNode.setBounds(this.layout.developerBackButton);
    for (const tab of SETTINGS_TABS) this.settingsTabNodes[tab].setBounds(this.layout.settingsTabs[tab]);
    this.lightingQualityNode.setBounds(this.layout.lightingQualityButton);
    this.worldScaleNode.setBounds(this.layout.worldScaleButton);
    this.presentationCapNode.setBounds(this.layout.presentationCapButton);
    this.experimentalWebGLNode.setBounds(this.layout.experimentalWebGLButton);
    this.renderProtocolNode.setBounds({ ...this.layout.orePreviewButton,
      x: this.layout.developerContent.x + 12, width: this.layout.developerContent.width - 24,
      y: this.layout.orePreviewButton.y + 30 });
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
    this.touchSwapToggle.setBounds(this.layout.touchSwapToggle);
    this.touchBottomOffsetSlider.setBounds(this.layout.touchBottomOffsetSlider);
    this.touchSwapToggle.value = model.touchControlPreferences?.swapped ?? false;
    this.touchBottomOffsetSlider.value = (model.touchControlPreferences?.bottomOffset ?? 0) / MAX_TOUCH_BOTTOM_OFFSET;
    this.masterSlider.value = model.audioVolumes.master;
    this.musicSlider.value = model.audioVolumes.music;
    this.sfxSlider.value = model.audioVolumes.sfx;
    this.musicBackgroundToggle.value = model.audioBackground?.music ?? false;
    this.soundsBackgroundToggle.value = model.audioBackground?.sounds ?? false;
    this.nameplatesToggle.value = model.nameplatesVisible ?? true;
    this.syncActiveWindow();
  }

  private inventorySearchRect(): UiRect | null {
    if (this.openWindowValue === 'inventory') return this.layout.inventoryFilter;
    if (this.openWindowValue === 'crafting') return this.layout.craftingInventoryFilter;
    const frame = this.activeContentFrame();
    return frame === null ? null : chestInventorySearchRect(frame);
  }

  private inventorySlotMatchesSearch(slot: ItemSlot): boolean {
    const query = this.inventoryFilterText.trim().toLowerCase();
    if (!query) return true;
    if (slot.item === null) return false;
    return slot.item.itemKind.toLowerCase().includes(query)
      || (this.itemDefinition(slot.item.itemKind)?.displayName.toLowerCase().includes(query) ?? false);
  }

  private chestPaneSlots(pane: ContentFramePaneLayout): readonly ItemSlot[] {
    const backpack = this.filteredInventoryBackpackSlots();
    return pane.slots.flatMap((binding) => {
      const collection = binding.containerId === 'chest' ? this.chestItemSlots : backpack;
      const slot = collection.find((candidate) => candidate.index === binding.index);
      return slot !== undefined && this.inventorySlotMatchesSearch(slot) ? [slot] : [];
    });
  }

  private filteredInventoryBackpackSlots(): ItemSlot[] {
    const capacity = this.model.backpackSlotCapacity
      ?? (this.model.hasBackpack ? BACKPACK_SLOT_COUNT : DEFAULT_INVENTORY_SLOTS);
    return this.backpackItemSlots.filter((slot, index) => index < capacity && this.inventorySlotMatchesSearch(slot));
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
    if(this.openWindowValue==='ferry'&&this.ferryMenu.key(code))return true;
    if(this.openWindowValue==='outdoor-rewards'&&this.outdoorRewards.handleKeyDown(code,this.layout.progressionWindow))return true;
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
    if (this.openWindowValue === 'delve-confirmation'
      && (code === 'Enter' || code === 'Space' || code === 'KeyE')) {
      this.confirmDelve();
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
    if (code === 'KeyK') {
      const notice = this.model.skillPointNotice;
      if (notice !== null && notice !== undefined) {
        this.openSkillTrack(notice.track);
        this.callbacks.dismissSkillPointNotice?.();
      } else this.openWindow = this.openWindowValue === 'skills' ? null : 'skills';
      return true;
    }
    if(code==='KeyO'){this.openWindow=this.openWindowValue==='outdoor-rewards'?null:'outdoor-rewards';return true;}
    if (code === 'KeyL') { this.openWindow = this.openWindowValue === 'quests' ? null : 'quests'; return true; }
    if (this.openWindowValue === 'barrel' && code === 'KeyS') {
      const seal = this.activeContentFrame()?.definition.buttons
        ?.find(({ interaction }) => interaction === 'seal');
      if (seal !== undefined) this.callbacks.frameAction?.(seal.interaction);
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
    if (this.blockingUpdatePromptVisible) return;
    if (this.openWindowValue === 'skills') this.skillTree.pointerMove(point, this.progressionContentRect());
    if (this.openWindowValue === 'statistics') this.statisticsScreen.pointerMove(point);
    if (this.openWindowValue === 'quests') this.questLog.pointerMove(point, this.layout.progressionWindow);
    if(this.openWindowValue==='outdoor-rewards')this.outdoorRewards.pointerMove(point,this.layout.progressionWindow);
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
    if (this.openWindowValue === null && this.weaponShortcutNode.visible && this.weaponShortcutNode.contains(point)) this.hoveredSlot = MAIN_HAND_INVENTORY_SLOT;
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
        && targetStack.quantity < this.maxStackFor(cursor.itemKind));
      if (target !== null && cursor != null && target.accepts(cursor.itemKind) && targetCompatible
        && !this.cursorPress.targets.includes(target)) {
        this.cursorPress.targets.push(target);
        if (target !== this.cursorPress.origin) this.cursorPress.dragged = true;
        if (this.cursorPress.targets.length > 1) this.applyQuickCraftPreview();
      }
    }
    this.timeSlider.pointerMove(point);
    this.touchBottomOffsetSlider.pointerMove(point);
    this.masterSlider.pointerMove(point);
    this.musicSlider.pointerMove(point);
    this.sfxSlider.pointerMove(point);
  }

  pointerDown(point: UiPoint, button: number, modifiers: {
    readonly shift?: boolean;
    readonly pointerType?: string;
  } = {}): boolean {
    const skillPointNotice = this.skillPointNoticeLayout();
    if (!this.blockingUpdatePromptVisible && button === 0
      && skillPointNotice !== null && containsPoint(skillPointNotice.frame, point)) {
      if (!containsPoint(skillPointNotice.dismiss, point)) this.openSkillTrack(this.model.skillPointNotice!.track);
      this.callbacks.dismissSkillPointNotice?.();
      return true;
    }
    this.systemCursorDown(point);
    if (this.blockingUpdatePromptVisible) {
      if (button === 0) this.router.routePointer({ kind: 'pointer_down', point, button });
      return true;
    }
    const clickedCraftingRecipe = this.openWindowValue === 'crafting' && button === 0
      ? this.craftingRecipeEntryAt(point)
      : undefined;
    if (this.openWindowValue === 'crafting' && this.selectedCraftingRecipeId !== null
      && (button === 0 || button === 2) && clickedCraftingRecipe === undefined && !containsPoint(this.layout.craftingResult,point)) {
      this.selectedCraftingRecipeId = null;
    }
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
    if (button === 0 && (this.openWindowValue === 'character' || this.openWindowValue === 'skills'
      || this.openWindowValue === 'statistics')) {
      const tabs = progressionTabsLayout(this.layout.progressionWindow).tabs;
      const tab = PROGRESSION_TABS.find((candidate) => containsPoint(tabs[candidate], point));
      if (tab !== undefined) {
        this.openWindow = tab;
        return true;
      }
    }
    if (this.openWindowValue === 'character'
      && this.characterScreen.pointerDown(point, this.progressionContentRect())) return true;
    if (this.openWindowValue === 'skills'
      && this.skillTree.pointerDown(point, button, this.progressionContentRect())) return true;
    if (this.openWindowValue === 'statistics'
      && this.statisticsScreen.pointerDown(point, this.progressionContentRect(),
        modifiers.pointerType === 'touch' ? 'touch' : 'mouse')) return true;
    if(this.openWindowValue==='ferry'&&!containsPoint(this.closeNode.bounds,point)
      &&this.ferryMenu.pointerDown(point,button,this.layout.progressionWindow))return true;
    if(this.openWindowValue==='outdoor-rewards'&&!containsPoint(this.closeNode.bounds,point)
      &&this.outdoorRewards.pointerDown(point,button,this.layout.progressionWindow,modifiers.pointerType))return true;
    if (this.openWindowValue === 'quests' && !containsPoint(this.closeNode.bounds, point)
      && this.questLog.pointerDown(point, button, this.layout.progressionWindow, modifiers.pointerType)) return true;
    if (this.openWindowValue === 'crafting' && button === 0 && containsPoint(this.layout.craftingResult, point)) {
      const recipeId = this.currentRecipeId();
      if (recipeId !== null && !this.currentRecipeLocked()) {
        this.callbacks.craftInventoryRecipe(recipeId, modifiers.shift === true);
      }
      return true;
    }
    if (button === 0) {
      const frameButton = this.activeContentFrame() === null ? null : contentFrameButtonAt(
        this.activeContentFrame()!, point, this.activeContentFrameState(),
      );
      if (frameButton !== null) {
        this.callbacks.frameAction?.(frameButton.interaction);
        return true;
      }
      if (this.openWindowValue === 'barrel' && this.model.barrelSealed !== true
        && containsPoint(barrelSealButtonRect(this.layout.inventoryWindow), point)) {
        this.callbacks.frameAction?.('seal');
        return true;
      }
    }
    const searchRect = this.inventorySearchRect();
    if (searchRect !== null && button === 0 && containsPoint(searchRect, point)) {
      this.inventoryFilterInput?.focus({ preventScroll: true });
      return true;
    }
    if (this.openWindowValue === 'crafting' && button === 0
      && containsPoint(this.layout.craftingRecipeFilter, point)) {
      this.recipeFilterInput?.focus({ preventScroll: true });
      return true;
    }
    if (this.openWindowValue === 'crafting' && button === 0) {
      if (clickedCraftingRecipe !== undefined) {
        if (modifiers.pointerType === 'touch') this.pendingTouchRecipeId = clickedCraftingRecipe.recipeId;
        else this.selectCraftingRecipe(clickedCraftingRecipe.recipeId);
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
            && stack.quantity < this.maxStackFor(cursor.itemKind)));
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
    if (this.blockingUpdatePromptVisible) {
      this.router.routePointer({ kind: 'pointer_up', point, button });
      return true;
    }
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
      this.selectCraftingRecipe(recipeId);
      return true;
    }
    if (this.openWindowValue === 'skills' && this.skillTree.pointerUp()) return true;
    if (this.openWindowValue === 'statistics' && this.statisticsScreen.pointerUp()) return true;
    if (this.openWindowValue === 'quests' && this.questLog.pointerUp()) return true;
    if(this.openWindowValue==='outdoor-rewards'&&this.outdoorRewards.pointerUp())return true;
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
      || this.touchBottomOffsetSlider.pointerUp(point)
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
    this.touchBottomOffsetSlider.pointerLeave();
    this.masterSlider.pointerLeave();
    this.musicSlider.pointerLeave();
    this.sfxSlider.pointerLeave();
    this.onlinePlayersScrollBar.pointerLeave();
    this.skillTree.pointerLeave();
    this.statisticsScreen.pointerLeave();
    this.questLog.pointerLeave();
    this.outdoorRewards.pointerLeave();
    this.inventoryScrollBar.pointerLeave();
    this.craftingRecipeScrollBar.pointerLeave();
    this.pendingTouchRecipeId = null;
  }

  wheel(point: UiPoint, deltaX: number, deltaY: number): boolean {
    if (this.blockingUpdatePromptVisible) return true;
    if (this.openWindowValue === 'skills'
      && this.skillTree.wheel(point, deltaY, this.progressionContentRect())) return true;
    if (this.openWindowValue === 'statistics'
      && this.statisticsScreen.wheel(point, deltaY, this.progressionContentRect())) return true;
    if(this.openWindowValue==='outdoor-rewards'&&this.outdoorRewards.wheel(point,deltaY,this.layout.progressionWindow))return true;
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

  /** Keep the build toggle reachable above the external build catalogue. */
  pointerBuildControl(point: UiPoint, button: number): boolean {
    if (button !== 0 || !this.buildNode.visible || !this.buildNode.contains(point)) return false;
    this.callbacks.toggleBuild?.();
    return true;
  }

  drawBuildControl(context: CanvasRenderingContext2D): void {
    if (this.buildNode.visible) {
      const rect = this.layout.buildButton;
      this.drawHudIconButton(context, rect, this.buildNode.contains(this.pointer), this.itemArt.hammer);
    }
  }

  drawCraftingControl(context: CanvasRenderingContext2D): void {
    if (this.openWindowValue === null) {
      this.drawHudIconButton(context, this.layout.craftingButton, this.craftingNode.contains(this.pointer), this.skin.craftingIcon);
    }
  }

  private drawHudIconButton(context: CanvasRenderingContext2D, rect: UiRect,
    hovered: boolean, icon: LoadedAsset | undefined): void {
    drawUiSkinAsset(context, this.skin.button, rect, hovered ? 'hover' : 'idle');
    if (icon !== undefined) drawUiSkinAsset(context, icon, {
      x: rect.x + 4, y: rect.y + 4, width: 16, height: 16,
    });
  }

  draw(context: CanvasRenderingContext2D): void {
    this.drawCachedStatus(context);
    this.drawMinimapHud(context);
    this.drawCachedCurrency(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawCachedHotbar(context);
    if (this.weaponShortcutNode.visible) this.drawWeaponShortcut(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawVitals(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawTargetVitals(context);
    if (!this.isInventoryWindow(this.openWindowValue)) this.drawEffects(context);
    if ((this.model.touchControls === true || this.model.width < 420) && this.openWindowValue === null) {
      drawUiSkinAsset(context, this.skin.button, this.layout.mobileMenuButton, 'idle');
      drawLabel(context, this.fonts, 'MENU', this.layout.mobileMenuButton.x + 22, this.layout.mobileMenuButton.y + 8, {
        align: 'center', color: '#5f3b24',
      });
    }
    this.drawCraftingControl(context);
    this.drawBuildControl(context);
    if (this.openWindowValue === 'help') this.helpBook.draw(context, this.model.width, this.model.height);
    else if (this.openWindowValue) {
      if (this.openWindowValue === 'delve-confirmation') {
        context.save();
        context.fillStyle = 'rgba(20, 14, 19, 0.68)';
        context.fillRect(0, 0, this.model.width, this.model.height);
        context.restore();
      }
      this.drawWindow(context, this.openWindowValue);
    }
    if (this.isInventoryWindow(this.openWindowValue)) this.drawQuickCraftTargets(context);
    if (this.openWindowValue === null || this.openWindowValue === 'system'
      || this.isInventoryWindow(this.openWindowValue)) this.drawTooltip(context);
    this.drawNotification(context);
    this.drawSkillPointNotice(context);
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
    // The scene restores the native cursor while the blocking update is shown.
    if (this.blockingUpdatePromptVisible) return;
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

  private beginHudKey(cache: HudSectionCache): HudCacheKey {
    const key = cache.key;
    key.begin();
    return key.add(this.hudArtRevision).add(this.model.width).add(this.model.height)
      .asset(this.fonts.font).asset(this.fonts.headerFont);
  }

  private drawCachedStatus(context: CanvasRenderingContext2D): void {
    if (!this.hudCacheEnabled) { this.drawStatus(context); return; }
    this.beginHudKey(this.statusCache).add(this.zoneCollapsed).add(this.model.zoneName).add(this.model.dangerNotice)
      .add(this.model.moonPhase).add(hasEquippedWatch(this.model.inventory, this.model.contentRegistry))
      .add(this.model.timeLabel).add(this.model.dateLabel)
      .asset(this.skin.banner).asset(this.skin.bookTab).asset(this.skin.moonPhase).asset(this.skin.button)
      .rect(this.layout.status).rect(this.layout.watchStatus).rect(this.layout.moonPhase).rect(this.layout.collapsedZoneTab);
    this.statusCache.draw(context, { x: 0, y: 0,
      width: Math.max(this.layout.collapsedZoneTab.width, this.layout.moonPhase.x + this.layout.moonPhase.width) + 2,
      height: this.layout.watchStatus.y + this.layout.watchStatus.height + 2 }, draw => this.drawStatus(draw));
  }

  private drawCachedCurrency(context: CanvasRenderingContext2D): void {
    if (!this.hudCacheEnabled) { this.drawCurrency(context); return; }
    this.beginHudKey(this.currencyCache).add(this.model.balanceBronze ?? 0n).rect(this.layout.currency)
      .asset(this.skin.button).asset(this.skin.backpackIcon)
      .asset(this.skin.coinGold).asset(this.skin.coinSilver).asset(this.skin.coinBronze);
    // Coin labels can extend beyond their chrome at very large balances. Retain
    // the original display clipping rather than cropping them at the button.
    this.currencyCache.draw(context, { ...this.layout.currency, width: this.model.width }, draw => this.drawCurrency(draw));
  }

  private drawCachedHotbar(context: CanvasRenderingContext2D): void {
    if (!this.hudCacheEnabled) { this.drawHotbar(context); return; }
    const key = this.beginHudKey(this.hotbarCache).add(this.model.selectedSlot).add(this.hoveredSlot)
      .asset(this.skin.slot).asset(this.skin.selectorConfirm).asset(this.skin.selectorNeutral)
      .asset(this.skin.barGreen).asset(this.skin.barGold).asset(this.skin.barRed);
    this.hudHotbarItems.fill(undefined);
    for (const item of this.model.inventory) {
      if (Number.isInteger(item.slot) && item.slot >= 0 && item.slot < HOTBAR_SLOT_COUNT) this.hudHotbarItems[item.slot] = item;
    }
    let right = 0;
    for (let slot = 0; slot < HOTBAR_SLOT_COUNT; slot++) {
      right = Math.max(right, this.layout.slots[slot]!.x + this.layout.slots[slot]!.width);
      const item = this.hudHotbarItems[slot];
      key.rect(this.layout.slots[slot]!).add(item?.itemKind).add(item?.quantity)
        .add(item === undefined ? null : uiDurabilityFraction(item.itemKind, item.durability, this.model.contentRegistry))
        .asset(item === undefined ? undefined : overworldItemArtwork(
          this.itemArt, item.itemKind, this.model.contentRegistry,
        ));
    }
    const first = this.layout.slots[0]!, last = this.layout.slots[HOTBAR_SLOT_COUNT - 1]!;
    this.hotbarCache.draw(context, { x: first.x - HOTBAR_RETICLE_SIZE / 2, y: first.y - HOTBAR_RETICLE_SIZE / 2,
      width: right - first.x + HOTBAR_RETICLE_SIZE,
      height: last.y + last.height - first.y + HOTBAR_RETICLE_SIZE }, draw => this.drawHotbar(draw));
  }

  private drawStatus(context: CanvasRenderingContext2D): void {
    if (this.zoneCollapsed) {
      drawUiSkinAsset(context, this.skin.bookTab, this.layout.collapsedZoneTab, 'base');
      if (this.model.dangerNotice) drawPixelText(context, this.fonts, this.model.dangerNotice === 'protected' ? 'P' : '!', 12, 7, { color: '#4d2e22' });
      return;
    }
    if (this.model.dangerNotice) {
      this.zoneRibbon.drawStacked(context, 'CINDERWAKE', hearthDangerStatusLabel(this.model.dangerNotice), this.layout.status);
    } else this.zoneRibbon.drawSingle(
      context,
      fitLabel(this.model.zoneName ?? 'Overworld', 21),
      this.layout.status,
    );
    if (this.model.moonPhase !== undefined) {
      drawUiSkinAsset(context, this.skin.moonPhase, this.layout.moonPhase, this.model.moonPhase);
    }
    if (hasEquippedWatch(this.model.inventory, this.model.contentRegistry)) this.drawWatchStatus(context);
  }

  private drawWatchStatus(context: CanvasRenderingContext2D): void {
    const rect = this.layout.watchStatus;
    drawUiSkinAsset(context, this.skin.button, rect, 'idle');
    const content = {
      x: rect.x + 7,
      y: rect.y + 3,
      width: Math.max(0, rect.width - 14),
      height: Math.max(0, rect.height - 7),
    };
    const timeWidth = Math.min(42, Math.max(28, Math.floor(content.width * 0.22)));
    const dateWidth = Math.min(68, Math.max(42, Math.floor(content.width * 0.34)));
    const moonX = content.x + timeWidth + dateWidth + 6;
    const moonWidth = Math.max(0, content.x + content.width - moonX);
    drawPixelTextInRect(context, this.fonts, this.model.timeLabel, {
      x: content.x, y: content.y, width: timeWidth, height: content.height,
    }, { align: 'center', verticalAlign: 'center', color: '#5f3b24', overflow: 'ellipsis' });
    drawPixelTextInRect(context, this.fonts, this.model.dateLabel, {
      x: content.x + timeWidth + 3, y: content.y, width: dateWidth, height: content.height,
    }, { align: 'center', verticalAlign: 'center', color: '#5f3b24', overflow: 'ellipsis' });
    context.save();
    context.fillStyle = '#9b6443';
    context.fillRect(content.x + timeWidth + 1, content.y + 1, 1, Math.max(0, content.height - 2));
    context.fillRect(moonX - 3, content.y + 1, 1, Math.max(0, content.height - 2));
    context.restore();
    if (this.model.moonPhase === undefined || moonWidth < 10) return;
    const iconX = moonX;
    const iconY = rect.y + 5;
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const pixel = moonPhasePixel(this.model.moonPhase, x, y);
        if (pixel === 0) continue;
        context.fillStyle = pixel === 2 ? '#ffe5a3' : '#4b5368';
        context.fillRect(iconX + x, iconY + y, 1, 1);
      }
    }
    drawPixelTextInRect(context, this.fonts, MOON_PHASE_LABELS[this.model.moonPhase].toUpperCase(), {
      x: moonX + 10,
      y: content.y,
      width: Math.max(0, moonWidth - 10),
      height: content.height,
    }, { align: 'left', verticalAlign: 'center', color: '#5f3b24', overflow: 'ellipsis' });
  }

  private syncZoneChrome(): void {
    this.zoneNode.setBounds(this.zoneCollapsed ? this.layout.collapsedZoneTab : this.layout.status);
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
    const contentFrame = this.activeContentFrame();
    if (contentFrame !== null) return contentFrame.storage.frame;
    if (this.openWindowValue === 'chest') return this.layout.chestWindow;
    if (this.openWindowValue === 'crafting') return this.layout.craftingWindow;
    if (this.isInventoryWindow(this.openWindowValue)) return this.layout.inventoryWindow;
    if (this.openWindowValue === 'system') return this.layout.systemWindow;
    if (this.openWindowValue === 'settings') return this.layout.settingsWindow;
    if (this.openWindowValue === 'developer') return this.layout.developerWindow;
    if (this.openWindowValue === 'character' || this.openWindowValue === 'skills'
      || this.openWindowValue === 'statistics' || this.openWindowValue === 'quests'||this.openWindowValue==='outdoor-rewards'||this.openWindowValue==='ferry') return this.layout.progressionWindow;
    return this.layout.window;
  }

  private activeContentFrame(window: OverworldWindow | null = this.openWindowValue): ContentFrameLayout | null {
    if (window === null) return null;
    const entityWindow = window === 'content' || window === 'chest' || window === 'barrel'
      || window === 'furnace' || window === 'cooking' || window === 'press' || window === 'fermentation';
    if (entityWindow && this.model.activeFrameId !== undefined) {
      const selected = this.layout.contentFrames.get(this.model.activeFrameId);
      if (selected !== undefined && selected.definition.presentation?.surface === 'entity') return selected;
    }
    const surface: FrameSurface | null = window === 'inventory' || window === 'pack'
      ? 'inventory'
      : window === 'crafting' ? 'crafting' : null;
    if (surface === null || this.model.contentRegistry === undefined) return null;
    const definition = contentFrameDefinitionForSurface(this.model.contentRegistry.frames, surface);
    return definition === null ? null : this.layout.contentFrames.get(definition.id) ?? null;
  }

  private activeContentFrameState(): Readonly<Record<string, boolean | string | number>> {
    return this.activeContentFrame()?.definition.presentation?.surface === 'inventory'
      ? this.model.inventoryFrameState ?? {} : this.model.activeFrameState ?? {};
  }

  private progressionContentRect(): UiRect {
    return progressionTabsLayout(this.layout.progressionWindow).content;
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
    const delveConfirmationVisible = this.openWindowValue === 'delve-confirmation';
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
    for (const slot of [...this.placeableItemSlots,...this.stashItemSlots]) slot.visible = false;
    this.backpackSortNode.visible = inventoryVisible || craftingVisible || chestVisible;
    this.backpackSortNode.setBounds(chestVisible
      ? this.layout.chestBackpackSortButton
      : craftingVisible ? this.layout.craftingBackpackSortButton : this.layout.inventorySortButton);
    this.chestSortNode.visible = chestVisible;
    this.barrelSortNode.visible = barrelVisible;
    this.delveConfirmButton.node.visible = delveConfirmationVisible;
    this.delveCancelButton.node.visible = delveConfirmationVisible;
    for (const node of [this.resumeNode, this.helpNode, this.settingsNode, this.outdoorRewardsNode, this.fullscreenNode, this.signOutNode, this.quitNode]) {
      node.visible = systemVisible;
    }
    this.exitDelveNode.visible = systemVisible && this.model.delveActive === true;
    this.developerNode.visible = systemVisible && this.model.canAdministerWorld;
    this.updateNode.visible = systemVisible
      && this.model.pwaUpdateStatus !== undefined
      && this.model.pwaUpdateStatus !== 'unsupported';
    this.settingsBackNode.visible = settingsVisible;
    this.developerBackNode.visible = developerVisible;
    for (const tab of SETTINGS_TABS) this.settingsTabNodes[tab].visible = settingsVisible;
    this.lightingQualityNode.visible = settingsVisible && this.settingsTab === 'video';
    this.lightingQualityNode.enabled = this.lightingQualityNode.visible;
    this.worldScaleNode.visible = this.lightingQualityNode.visible;
    this.worldScaleNode.enabled = this.worldScaleNode.visible;
    this.presentationCapNode.visible = this.lightingQualityNode.visible;
    this.presentationCapNode.enabled = this.presentationCapNode.visible;
    this.experimentalWebGLNode.visible = this.lightingQualityNode.visible;
    this.experimentalWebGLNode.enabled = this.experimentalWebGLNode.visible;
    for (const tab of DEVELOPER_TABS) this.developerTabNodes[tab].visible = developerVisible;
    const developerWorldVisible = developerVisible && this.developerTab === 'world';
    const developerRenderVisible = developerVisible && this.developerTab === 'render';
    this.renderProtocolNode.visible = developerRenderVisible;
    for (const node of [this.previousDayNode, this.timeSlider.node, this.nextDayNode, this.weatherModeNode, this.windDirectionNode]) {
      node.visible = developerWorldVisible;
    }
    this.lightingEffectsToggle.node.visible = developerRenderVisible;
    this.orePreviewToggle.node.visible = developerRenderVisible;
    if (this.inventoryFilterInput !== null) {
      this.inventoryFilterInput.hidden = this.inventorySearchRect() === null;
      if (this.inventoryFilterInput.hidden) this.inventoryFilterInput.blur();
    }
    if (this.recipeFilterInput !== null) {
      this.recipeFilterInput.hidden = !craftingVisible;
      if (!craftingVisible) this.recipeFilterInput.blur();
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
    const settingsControlsVisible = settingsVisible && this.settingsTab === 'controls';
    this.touchSwapToggle.node.visible = settingsControlsVisible;
    this.touchSwapToggle.enabled = settingsControlsVisible;
    this.touchBottomOffsetSlider.node.visible = settingsControlsVisible;
    this.touchBottomOffsetSlider.enabled = settingsControlsVisible;
    if (this.activeContentFrame() !== null) {
      for (const slot of [
        ...this.inventoryHotbarSlots, ...this.backpackItemSlots, ...this.equipmentItemSlots,
        ...this.craftingItemSlots, ...this.chestItemSlots, ...this.placeableItemSlots, ...this.stashItemSlots,
      ]) slot.visible = false;
    }
    this.applyContentFrameBindings();
    const chestFrame = this.activeContentFrame();
    if (chestFrame !== null && chestInventorySearchRect(chestFrame) !== null) {
      for (const [container, node] of [['chest', this.chestSortNode], ['backpack', this.backpackSortNode]] as const) {
        const pane = chestFrame.panes.find((candidate) => candidate.slots.some((binding) => binding.containerId === container)
          && contentFramePaneVisible(candidate.definition, this.activeContentFrameState()));
        node.visible = pane !== undefined;
        if (pane !== undefined) node.setBounds({
          x: pane.layout.grid.x + pane.layout.grid.width - 16,
          y: pane.layout.labelPosition.y - 4, width: 16, height: 16,
        });
      }
    }
  }

  /** Projects authored pane bindings onto the stable retained ItemSlot nodes.
   * The nodes keep their pointer identity; only geometry and the restriction
   * from the verified content revision change. */
  private applyContentFrameBindings(): void {
    const frame = this.activeContentFrame();
    if (frame === null) return;
    const state = this.activeContentFrameState();
    const craftingSurface = frame.definition.presentation?.surface === 'crafting';
    const chestSurface = chestInventorySearchRect(frame) !== null;
    const craftingBackpack = craftingSurface ? this.filteredInventoryBackpackSlots() : [];
    const entitySlots = frame.definition.presentation?.entityContainer === 'chest'
      ? this.chestItemSlots : this.placeableItemSlots;
    const collections: Readonly<Record<string, readonly ItemSlot[]>> = {
      backpack: this.backpackItemSlots,
      hotbar: this.inventoryHotbarSlots,
      equipment: this.equipmentItemSlots,
      crafting: this.craftingItemSlots,
      chest: this.chestItemSlots,
      placeable: entitySlots,
      stash:this.stashItemSlots,
    };
    for (const pane of frame.panes) {
      if (!contentFramePaneVisible(pane.definition, state)) continue;
      const chestSlots = chestSurface
        && pane.slots.every((binding) => binding.containerId === 'chest' || binding.containerId === 'backpack')
        ? this.chestPaneSlots(pane) : null;
      pane.slots.forEach((binding, visualIndex) => {
        const slot = chestSlots === null
          ? collections[binding.containerId]?.find((candidate) => candidate.index === binding.index)
          : chestSlots[visualIndex];
        if (slot === undefined) return;
        // Crafting's recipe list, grid, and result share one composed layout.
        // Keep its retained draw/hit nodes on that same grid while authored
        // bindings continue to supply custody, visibility, and restrictions.
        const rect = craftingSurface && binding.containerId === 'crafting'
          ? this.layout.craftingSlots[binding.index]
          : craftingSurface && binding.containerId === 'backpack'
            ? this.layout.craftingInventorySlots[craftingBackpack.indexOf(slot)]
            : pane.layout.slots[visualIndex];
        if (rect === undefined) return;
        slot.setBounds(rect);
        slot.setRestriction(chestSlots === null ? binding.restriction
          : pane.slots.find((candidate) => candidate.containerId === slot.containerId && candidate.index === slot.index)?.restriction);
        slot.visible = true;
      });
    }
    frame.storage.hotbar?.slots.forEach((rect, index) => {
      const slot = this.inventoryHotbarSlots[index];
      if (slot === undefined) return;
      slot.setBounds(rect);
      slot.visible = true;
    });
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
      drawPixelTextInRect(context, this.fonts,
        'PLAYER ADMINISTRATION HAS MOVED TO ORCHARD STUDIO.', {
          x: developerContent.x + 12, y: developerContent.y + 28,
          width: developerContent.width - 24, height: 24,
        }, { align: 'center', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      return;
    }

    if (this.developerTab === 'quests') {
      drawPixelTextInRect(context, this.fonts,
        'QUEST ADMINISTRATION HAS MOVED TO ORCHARD STUDIO.', {
          x: developerContent.x + 12, y: developerContent.y + 28,
          width: developerContent.width - 24, height: 24,
        }, { align: 'center', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      return;
    }

    drawLabel(context, this.fonts, 'UNIFIED SOLVER', developerContent.x + 12,
      this.layout.lightingEffectsButton.y + 5, { color: '#6b4428' });
    drawLabel(context, this.fonts, 'CELLAR ORE VEINS', developerContent.x + 12,
      this.layout.orePreviewButton.y + 5, { color: '#6b4428' });
    this.lightingEffectsToggle.draw(context);
    this.orePreviewToggle.draw(context);
    drawMenuButton(context, this.skin, this.fonts, this.pointer, {
      ...this.layout.orePreviewButton, x: developerContent.x + 12,
      width: developerContent.width - 24, y: this.layout.orePreviewButton.y + 30,
    }, renderProtocolAction.label);
  }

  private drawWeaponShortcut(context: CanvasRenderingContext2D): void {
    const item=this.model.inventory.find(item=>item.slot===MAIN_HAND_INVENTORY_SLOT && item.quantity>0);
    if (item===undefined) return;
    const rect=this.layout.weaponShortcut;
    drawUiInventorySlotBacking(context,this.skin,rect,item.itemKind);
    const asset=overworldItemArtwork(this.itemArt,item.itemKind,this.model.contentRegistry);
    if (asset!==undefined) this.drawItemArtwork(context,rect,item.itemKind,asset);
    if (this.model.selectedSlot===MAIN_HAND_INVENTORY_SLOT || this.hoveredSlot===MAIN_HAND_INVENTORY_SLOT) {
      drawUiSkinAsset(context,this.model.selectedSlot===MAIN_HAND_INVENTORY_SLOT ? this.skin.selectorConfirm : this.skin.selectorNeutral,hotbarReticleRect(rect),'idle');
    }
    drawLabel(context,this.fonts,'V',rect.x+3,rect.y+3,{color:'#51351f'});
    this.drawDurabilityBar(context,rect,item.itemKind,item.durability);
  }

  private drawHotbar(context: CanvasRenderingContext2D): void {
    const itemBySlot = new Map(this.model.inventory
      .filter(item => item.itemKind !== 'empty' && item.quantity > 0)
      .map(item => [item.slot, item]));
    for (let slot = 0; slot < HOTBAR_SLOT_COUNT; slot += 1) {
      const rect = this.layout.slots[slot]!;
      const item = itemBySlot.get(slot);
      drawUiInventorySlotBacking(context, this.skin, rect, item?.itemKind);
      const asset = item
        ? overworldItemArtwork(this.itemArt, item.itemKind, this.model.contentRegistry)
        : undefined;
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
      const asset = effectStatusAsset(this.skin, effect.effectKind);
      drawUiSkinAsset(context, asset, rect);
    });
  }

  private drawDurabilityBar(
    context: CanvasRenderingContext2D,
    rect: UiRect,
    itemKind: string,
    durability?: number,
  ): void {
    const fraction = uiDurabilityFraction(itemKind, durability, this.model.contentRegistry);
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
    const item = this.hoveredItem();
    const detailsReady = this.equipmentTooltipDwell.ready(item?.itemKind ?? null, performance.now());
    const text = this.tooltipText();
    if (!text) return;
    const gear=!detailsReady || this.model.touchControls === true || text.startsWith('REQUIRES ') || item===null || this.model.contentRegistry===undefined ? null : equipmentDescriptionLines(
      this.model.contentRegistry,item.itemKind,this.model.inventory,this.model.selectedSlot,
      Object.fromEntries((this.model.skills?.ranks??[]).map(({nodeId,rank})=>[nodeId,rank])),this.model.skills?.skillPriority??[],
    );
    if (gear!==null) {
      const maximumWidth=Math.min(this.model.width-12,390);
      const characters=Math.max(4,Math.floor((maximumWidth-16)/6));
      const details = item?.durability === undefined ? gear : gear.map(line =>
        line.startsWith('MAX DURABILITY ') ? `DURABILITY ${item.durability} / ${line.slice(15)}` : line);
      const lines=details.flatMap(line=>{
        const rows:string[]=[]; let current='';
        for (const word of line.split(' ')) {
          if (current && current.length+word.length+1>characters) {rows.push(current);current=word;}
          else current=current?`${current} ${word}`:word;
        }
        if (current) rows.push(current);
        return rows;
      });
      const width=Math.min(maximumWidth,Math.max(150,...lines.map(line=>measurePixelText(line)+16)));
      const height=lines.length*10+12;
      const rect = equipmentTooltipRect(this.model.width, this.touchInventoryTooltipRect(), width, height);
      drawUiSkinAsset(context,this.skin.frameThin,rect);
      lines.slice(0, Math.max(0, Math.floor((rect.height - 12) / 10))).forEach((line,index)=>drawLabel(context,this.fonts,line,rect.x+8,rect.y+6+index*10,{color:'#5f3b24'}));
      return;
    }
    const width = Math.min(this.model.width - 12, Math.max(104, measurePixelText(text) + 16));
    const base = this.touchInventoryTooltipRect();
    const rect = { ...base, x: Math.round((this.model.width - width) / 2), width };
    drawUiLabelPlate(context, this.skin, rect);
    drawLabel(context, this.fonts, fitLabel(text, Math.max(4, Math.floor((rect.width - 16) / 6))), rect.x + rect.width / 2, rect.y + 4, { align: 'center', color: '#5f3b24' });
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
    drawLabel(context, this.fonts, fitLabel(text, Math.max(4, Math.floor((rect.width - 16) / 6))), rect.x + rect.width / 2, rect.y + 4, {
      align: 'center', color: kind === 'info' ? '#5f3b24' : '#fff1cf',
    });
  }

  notificationText(): string | null {
    return this.model.toast;
  }

  skillPointNoticeLayout(): { readonly frame: UiRect; readonly dismiss: UiRect } | null {
    const notice = this.model.skillPointNotice;
    if (notice === null || notice === undefined) return null;
    const label = notice.points === 1
      ? `NEW ${notice.track.toUpperCase()} SKILL POINT · OPEN`
      : `${notice.points} NEW ${notice.track.toUpperCase()} SKILL POINTS · OPEN`;
    const width = Math.min(this.model.width - 12, Math.max(164, measurePixelText(label) + 42));
    const frame = {
      x: Math.round((this.model.width - width) / 2),
      y: Math.max(4, this.layout.notification.y - (this.model.toast === null ? 0 : 20)),
      width,
      height: 18,
    };
    return {
      frame,
      dismiss: { x: frame.x + frame.width - 21, y: frame.y, width: 21, height: frame.height },
    };
  }

  private drawSkillPointNotice(context: CanvasRenderingContext2D): void {
    const notice = this.model.skillPointNotice;
    const layout = this.skillPointNoticeLayout();
    if (notice === null || notice === undefined || layout === null) return;
    drawUiSkinAsset(context, this.skin.buttonConfirm, layout.frame, 'idle');
    context.save();
    context.strokeStyle = '#e6c078';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(layout.dismiss.x + 0.5, layout.dismiss.y + 3);
    context.lineTo(layout.dismiss.x + 0.5, layout.dismiss.y + layout.dismiss.height - 3);
    context.stroke();
    context.restore();
    const text = notice.points === 1
      ? `NEW ${notice.track.toUpperCase()} SKILL POINT · OPEN`
      : `${notice.points} NEW ${notice.track.toUpperCase()} SKILL POINTS · OPEN`;
    drawLabel(context, this.fonts, fitLabel(text, 36), layout.frame.x + (layout.frame.width - 21) / 2, layout.frame.y + 5, {
      align: 'center', color: '#fff1cf',
    });
    drawLabel(context, this.fonts, 'X', layout.dismiss.x + layout.dismiss.width / 2, layout.dismiss.y + 5, {
      align: 'center', color: '#fff1cf',
    });
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
      if (this.exitDelveNode.visible && this.exitDelveNode.contains(this.pointer)) return 'EXIT DELVE';
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
      if (this.buildNode.visible && this.buildNode.contains(this.pointer)) return 'BUILD (B)';
      if (this.craftingNode.contains(this.pointer)) return 'CRAFTING';
      if (this.currencyNode.contains(this.pointer)) return 'BACKPACK';
      if (this.model.moonPhase !== undefined && containsPoint(this.layout.moonPhase, this.pointer)) return MOON_PHASE_LABELS[this.model.moonPhase].toUpperCase();
      if (this.zoneNode.contains(this.pointer)) {
        if (this.model.dangerNotice) return `${hearthDangerStatusDescription(this.model.dangerNotice)} / ${this.zoneCollapsed ? 'EXPAND' : 'COLLAPSE'} ZONE`;
        if (this.zoneCollapsed) return 'EXPAND ZONE NAME';
      }
      if (!this.zoneCollapsed && hasEquippedWatch(this.model.inventory, this.model.contentRegistry)
        && containsPoint(this.layout.watchStatus, this.pointer)) {
        return watchStatusLabel(this.model.timeLabel, this.model.dateLabel, this.model.moonPhase).toUpperCase();
      }
    }
    if (this.openWindowValue === 'crafting') {
      const hoveredRecipeRow = this.layout.craftingRecipeRows
        .findIndex((rect) => containsPoint(rect, this.pointer));
      const hoveredRecipe = hoveredRecipeRow < 0 ? undefined
        : this.recipeBookEntries()[this.craftingRecipeScrollBar.position + hoveredRecipeRow];
      if (hoveredRecipe?.stationAvailable === false && hoveredRecipe.requiredStation !== null) {
        return this.craftingStationRequirement(hoveredRecipe.requiredStation);
      }
      if (hoveredRecipe?.skillAvailable === false) return this.recipeSkillRequirement(hoveredRecipe.recipeId);
      if (containsPoint(this.layout.craftingResult, this.pointer) && this.currentRecipeLocked()) {
        if(this.currentRecipeKnowledgeMissing())return 'LEARN THIS RECIPE FIRST';
        const station = this.recipeDefinition(this.currentRecipeId() ?? '')?.station;
        if (station !== undefined && !(this.model.nearbyCraftingStations ?? []).includes(station)) {
          return this.craftingStationRequirement(station);
        }
        return this.recipeSkillRequirement(this.currentRecipeId() ?? '');
      }
    }
    const item = this.hoveredItem();
    if (item !== null) {
      const label = this.itemDefinition(item.itemKind)?.displayName.toUpperCase()
        ?? item.itemKind.replaceAll('_', ' ').toUpperCase();
      return label;
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
        return this.recipeOutput(this.currentRecipeId() ?? '') ?? null;
      }
      const ghost = this.hoveredCraftingGhostItem();
      if (ghost !== null) return ghost;
      return this.visibleItemSlots()
        .find((slot) => slot.node.contains(this.pointer))?.item ?? null;
    }
    if (this.hoveredSlot === null) return null;
    const hovered = this.model.inventory.find((item) => item.slot === this.hoveredSlot);
    return hovered && hovered.itemKind !== 'empty' && hovered.quantity > 0 ? hovered : null;
  }

  private drawWindow(context: CanvasRenderingContext2D, window: OverworldWindow): void {
    const rect = this.activeWindowRect();
    const contentFrame = this.activeContentFrame(window);
    const authoredEntityFrame = contentFrame?.definition.presentation?.surface === 'entity';
    const chestSearch = contentFrame === null ? null : chestInventorySearchRect(contentFrame);
    if (contentFrame !== null) drawContentFrame(context, contentFrame, {
      progress: this.model.activeFrameProgress,
      state: this.activeContentFrameState(),
    }, {
      skin: this.skin,
      fonts: this.fonts,
      pointer: this.pointer,
      drawSlot: (_drawContext, _pane, slotRect, binding) => {
        if (!authoredEntityFrame) return;
        const collection = binding.containerId === 'chest' ? this.chestItemSlots
          : binding.containerId === 'stash' ? this.stashItemSlots
          : binding.containerId === 'placeable' ? this.placeableItemSlots
            : binding.containerId === 'backpack' ? this.backpackItemSlots
              : binding.containerId === 'hotbar' ? this.inventoryHotbarSlots
                : binding.containerId === 'equipment' ? this.equipmentItemSlots
                  : binding.containerId === 'crafting' ? this.craftingItemSlots : [];
        const chestPane = chestSearch !== null
          && (binding.containerId === 'chest' || binding.containerId === 'backpack');
        const slot = chestPane
          ? collection.find((candidate) => candidate.visible && candidate.bounds.x === slotRect.x && candidate.bounds.y === slotRect.y)
          : collection.find((candidate) => candidate.index === binding.index);
        if (slot === undefined) {
          if (chestPane) drawUiInventorySlotBacking(_drawContext, this.skin, slotRect, undefined);
          return;
        }
        this.drawItemSlotBacking(_drawContext, slot);
        if (slot.item) this.drawInventoryItem(
          _drawContext, slotRect, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit,
        );
      },
      drawPane: authoredEntityFrame ? undefined : (_context, pane) => !('state' in pane.definition.bind),
      drawResizeHandles: false,
    });
    else if (window === 'chest') drawStorageFrameChrome(context, this.skin, this.layout.chestStorageFrame);
    else {
      drawUiSkinAsset(context, this.skin.panelWood, rect);
      drawUiSkinAsset(context, this.skin.panelParchment, { x: rect.x + 10, y: rect.y + 13, width: rect.width - 20, height: rect.height - 23 });
    }
    const title = contentFrame?.definition.title ?? (window === 'inventory' || window === 'pack' ? 'INVENTORY'
      : window === 'crafting' ? 'CRAFTING'
        : window === 'chest' ? 'CHEST'
          : window === 'barrel' ? 'BARREL'
          : window === 'furnace' ? 'FURNACE'
          : window === 'cooking' ? 'COOKING FIRE'
          : window === 'press' ? 'FRUIT PRESS'
          : window === 'fermentation' ? 'FERMENTATION CASK'
          : window === 'character' || window === 'skills' || window === 'statistics' ? 'CHARACTER'
          : window === 'ferry' ? 'ISLAND FERRY'
          : window === 'outdoor-rewards' ? 'EXPEDITION REWARDS'
          : window === 'quests' ? 'QUEST LOG'
          : window === 'delve-confirmation' ? 'START DELVE'
          : window === 'settings' ? 'SETTINGS'
            : window === 'developer' ? 'DEVELOPER TOOLS' : SYSTEM_MENU_TITLE);
    this.windowRibbon.draw(context, title, rect.x + rect.width / 2, rect.y - 5);
    drawFantasyButton(context, this.skin, this.fonts, this.closeNode.bounds, {
      tone: 'red', shape: 'square', size: 'small', glyph: 'cross',
      hovered: containsPoint(this.closeNode.bounds, this.pointer), hoverOutline: 'white',
    });
    if (authoredEntityFrame) {
      if (chestSearch !== null) {
        if (this.chestSortNode.visible) this.drawStorageSortButton(context, this.chestSortNode, 'chest');
        if (this.backpackSortNode.visible) this.drawStorageSortButton(context, this.backpackSortNode, 'backpack');
        this.drawInventorySearch(context, chestSearch);
      }
      if (contentFrame.storage.hotbar !== undefined) this.drawWindowHotbar(context, rect, contentFrame.storage);
    }
    else if (window === 'inventory' || window === 'pack') this.drawInventory(context, rect);
    else if (window === 'crafting') this.drawCrafting(context, rect);
    else if (window === 'chest') this.drawChest(context, rect);
    else if (window === 'barrel') this.drawBarrel(context, rect);
    else if (window === 'furnace') this.drawFurnace(context, rect);
    else if (window === 'cooking') this.drawCooking(context, rect);
    else if (window === 'press') this.drawFruitPress(context, rect);
    else if (window === 'fermentation') this.drawFermentation(context, rect);
    else if (window === 'character' || window === 'skills' || window === 'statistics') {
      const progression = progressionTabsLayout(rect);
      const tabGlyphs: Readonly<Record<ProgressionTab, FantasyButtonGlyph>> = {
        character: 'heart',
        skills: 'star',
        statistics: 'up',
      };
      for (const tab of PROGRESSION_TABS) drawMenuButton(
        context,
        this.skin,
        this.fonts,
        this.pointer,
        progression.tabs[tab],
        tab.toUpperCase(),
        { active: tab === window, glyph: tabGlyphs[tab] },
      );
      if (window === 'character') this.characterScreen.draw(context, progression.content);
      else if (window === 'skills') this.skillTree.draw(context, progression.content);
      else this.statisticsScreen.draw(context, progression.content);
    }
    else if (window === 'quests') this.questLog.draw(context, rect);
    else if(window==='outdoor-rewards')this.outdoorRewards.draw(context,rect);
    else if(window==='ferry')this.ferryMenu.draw(context,rect);
    else if (window === 'delve-confirmation') this.drawDelveConfirmation(context, rect);
    else if (window === 'settings') this.drawSettings(context);
    else if (window === 'developer') this.drawDeveloper(context);
    else this.drawSystemMenu(context);
  }

  private drawDelveConfirmation(context: CanvasRenderingContext2D, rect: UiRect): void {
    const compact = rect.height < 170;
    drawLabel(context, this.fonts, 'BEGIN A SOLO DELVE?', rect.x + rect.width / 2, rect.y + (compact ? 32 : 37), {
      align: 'center', color: '#5f3b24', font: 'header',
    });
    drawLabel(context, this.fonts, '12 ROOMS. HOME RECIPE ON FIRST WIN.',
      rect.x + rect.width / 2, rect.y + (compact ? 52 : 60), { align: 'center', color: '#6b4428' });
    drawLabel(context, this.fonts, 'BOONS AND EMBERS LAST FOR THIS RUN.',
      rect.x + rect.width / 2, rect.y + (compact ? 66 : 75), { align: 'center', color: '#8c5d3a' });
    drawLabel(context, this.fonts, 'YOU RETURN HERE WHEN THE RUN ENDS.',
      rect.x + rect.width / 2, rect.y + (compact ? 80 : 90), { align: 'center', color: '#8c5d3a' });
    if (!compact) {
      drawLabel(context, this.fonts, 'E / ENTER: BEGIN   ESC: CANCEL',
        rect.x + rect.width / 2, rect.y + rect.height - 65, { align: 'center', color: '#986846' });
    }
    this.delveConfirmButton.draw(context);
    this.delveCancelButton.draw(context);
  }

  private drawInventorySearch(context: CanvasRenderingContext2D, rect: UiRect): void {
    drawUiSkinAsset(context, this.skin.frameThin, rect);
    if (this.inventoryFilterInput !== null) {
      drawCanvasTextInput(context, this.fonts, this.inventoryFilterInput, {
        x: rect.x + 6,
        y: rect.y + 5,
        width: rect.width - 12,
        placeholder: 'FILTER ITEMS',
        color: '#51351f',
        placeholderColor: '#986846',
      });
    } else drawLabel(context, this.fonts, this.inventoryFilterText || 'FILTER ITEMS', rect.x + 6, rect.y + 5, {
      color: this.inventoryFilterText ? '#51351f' : '#986846',
    });
  }

  private drawInventory(context: CanvasRenderingContext2D, rect: UiRect): void {
    drawLabel(context, this.fonts, 'EQUIPMENT', rect.x + 21, rect.y + 35, { color: '#6b4428' });
    this.drawInventorySearch(context, this.layout.inventoryFilter);
    this.drawStorageSortButton(context, this.backpackSortNode, 'backpack');
    this.equipmentItemSlots.forEach((slot, visualIndex) => {
      const equipmentSlot = slot.bounds;
      const definition = EQUIPMENT_SLOTS[visualIndex]!;
      const locked = false;
      drawUiInventorySlotBacking(context, this.skin, equipmentSlot, slot.item?.itemKind, locked);
      if (slot.item === null) {
        context.save();
        if (locked) context.globalAlpha *= 0.42;
        drawUiSkinNatural(
          context,
          this.skin.equipmentSlotIcons,
          equipmentSlot.x + Math.round((equipmentSlot.width - 16) / 2),
          equipmentSlot.y + Math.round((equipmentSlot.height - 16) / 2) - 1,
          definition.iconAnimation,
        );
        context.restore();
      } else this.drawInventoryItem(context, equipmentSlot, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
      if (itemSlotRejectsCursor(slot, this.heldCursorStack())) {
        drawUiSkinAsset(context, this.skin.selectorDeny, uiInventorySelectorRect(slot.bounds), 'idle');
      }
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
    const asset = overworldItemArtwork(this.itemArt, itemKind, this.model.contentRegistry)
      ?? this.itemArt.missing;
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
    const frame = uiAssetFrame(asset, itemIconAnimation(itemKind, this.model.contentRegistry));
    if (!frame) return;
    const scale = Math.min(16 / frame.width, 16 / frame.height);
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    const x = Math.round(rect.x + 6 + (16 - width) / 2);
    const y = Math.round(rect.y + 7 + (16 - height) / 2);
    context.save();
    if (!lit) {
      context.filter = 'brightness(42%) saturate(55%)';
      context.globalAlpha *= 0.88;
    }
    // Fractional DPR/UI scaling can sample beyond an atlas source rectangle.
    // A cached native-sized frame has no neighbouring pixels to bleed in.
    const isolated = isolatedAtlasFrameImage(asset.image, frame);
    context.drawImage(isolated ?? asset.image, isolated ? 0 : frame.x, isolated ? 0 : frame.y,
      frame.width, frame.height, x, y, width, height);
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
      [this.outdoorRewardsNode.bounds, `REWARDS (${this.model.outdoorRewardCount??0}) [O]`, 'gold', 'star', false],
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
    if (this.exitDelveNode.visible) buttons.splice(buttons.length - 2, 0, [
      this.exitDelveNode.bounds, 'EXIT DELVE', 'red', 'back', false,
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

    if (this.settingsTab === 'controls') {
      drawPixelTextInRect(context, this.fonts, 'SWAP MOVEMENT / ACTIONS', {
        x: settingsContent.x + 10, y: this.layout.touchSwapToggle.y,
        width: settingsContent.width - 58, height: 18,
      }, { verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      this.touchSwapToggle.draw(context);
      drawLabel(context, this.fonts, 'BOTTOM OFFSET', settingsContent.x + 10, settingsContent.y + 44, { color: '#6b4428' });
      this.touchBottomOffsetSlider.draw(context);
      drawPixelTextInRect(context, this.fonts, `${Math.round(this.touchBottomOffsetSlider.value * MAX_TOUCH_BOTTOM_OFFSET)}`, {
        x: settingsContent.x + settingsContent.width - 42, y: this.layout.touchBottomOffsetSlider.y,
        width: 34, height: 18,
      }, { align: 'right', verticalAlign: 'center', color: '#8c5d3a' });
      const hints = ['PINCH THE WORLD TO ZOOM', 'MOVE: WASD / STICK', 'ACT: E / F / SPACE', 'INVENTORY: I   CHAT: ENTER'];
      hints.forEach((hint, index) => {
        const y = settingsContent.y + 91 + index * 18;
        if (y + 14 > settingsContent.y + settingsContent.height) return;
        drawPixelTextInRect(context, this.fonts, hint, {
          x: settingsContent.x + 10, y, width: settingsContent.width - 20, height: 14,
        }, { color: '#8c5d3a', overflow: 'ellipsis' });
      });
      return;
    }

    const settingRows = this.settingsTab === 'video' ? [
      ['DISPLAY MODE', this.model.fullscreen ? 'FULLSCREEN' : 'WINDOWED'],
      ['PIXEL SCALING', 'INTEGER'],
      ['WORLD ZOOM', 'AUTO'],
      ['UI SCALE', 'AUTO'],
      ['LIGHTING', lightingSettingsMode(this.model).toUpperCase()],
      ['WORLD SCALE', worldScaleSettingLabel(readWorldScale())],
      ['30 HZ CAP', readPresentationCap() === '30hz' ? 'ON' : 'OFF'],
      ['EXPERIMENTAL: WEBGL RENDERER', readExperimentalWebGL() ? 'ON' : 'OFF'],
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
    const visibleRows = this.settingsTab === 'video' && compactVideoRows(settingsContent.height)
      ? settingRows.filter(([label]) => label === 'LIGHTING' || label === 'WORLD SCALE' || label === '30 HZ CAP' || label === 'EXPERIMENTAL: WEBGL RENDERER') : settingRows;
    const rowHeight = this.settingsTab === 'video' ? videoSettingsRowHeight(settingsContent.height)
      : Math.max(14, Math.min(27, Math.floor((settingsContent.height - 38) / visibleRows.length)));
    visibleRows.forEach(([label, value], index) => {
      const y = settingsContent.y + 23 + index * rowHeight;
      const displayLabel = label === 'EXPERIMENTAL: WEBGL RENDERER' && settingsContent.width < 280 ? 'WEBGL*' : label;
      drawPixelTextInRect(context, this.fonts, displayLabel, {
        x: settingsContent.x + 10, y, width: label === 'EXPERIMENTAL: WEBGL RENDERER' ? settingsContent.width - 75 : Math.max(40, settingsContent.width * 0.46), height: Math.min(18, rowHeight),
      }, { verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
      const interactiveLightingModel = this.settingsTab === 'video' && label === 'LIGHTING';
      const interactiveWorldScale = this.settingsTab === 'video' && label === 'WORLD SCALE';
      const interactiveCap = this.settingsTab === 'video' && label === '30 HZ CAP';
      const interactiveBackend = this.settingsTab === 'video' && label === 'EXPERIMENTAL: WEBGL RENDERER';
      drawMenuButton(context, this.skin, this.fonts, this.pointer, interactiveLightingModel
        ? this.lightingQualityNode.bounds : interactiveWorldScale ? this.worldScaleNode.bounds : interactiveCap ? this.presentationCapNode.bounds : interactiveBackend ? this.experimentalWebGLNode.bounds : {
        x: settingsContent.x + Math.floor(settingsContent.width * 0.5), y,
        width: Math.max(40, settingsContent.width * 0.5 - 10), height: Math.min(18, rowHeight),
      }, value, { tone: interactiveLightingModel || interactiveWorldScale || interactiveCap || interactiveBackend ? 'green' : 'silver', disabled: !interactiveLightingModel && !interactiveWorldScale && !interactiveCap && !interactiveBackend });
    });
    const lightingHint = lightingSettingsMode(this.model) === 'dynamic' && this.model.lightingEffectsDisabled
      ? this.model.lightingFallbackReason === 'preparing' ? 'PREPARING DYNAMIC LIGHTING...' : 'DYNAMIC UNAVAILABLE; USING BASIC'
      : 'CLICK LIGHTING: BASIC / CLASSIC / DYNAMIC';
    const backend = worldBackendStatus();
    const videoHint = backend.fallbackReason !== null ? `CANVAS: ${backend.fallbackReason.replace(/^webgl_/, '').replaceAll('_', ' ').toUpperCase()}`
      : backend.preparing ? 'PREPARING EXPERIMENTAL WEBGL...' : backend.backend === 'webgl2' ? 'EXPERIMENTAL WEBGL ACTIVE'
        : settingsContent.width < 280 ? '* EXPERIMENTAL WEBGL RENDERER' : lightingHint;
    drawPixelTextInRect(context, this.fonts, this.settingsTab === 'video' ? videoHint : 'CONFIGURATION SUPPORT IS RESERVED FOR A LATER UPDATE.', {
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
    const gridLeft = this.layout.craftingSlots[0]!.x;
    drawUiSkinAsset(context, this.skin.frameThin, this.layout.craftingRecipeFilter);
    if (this.recipeFilterInput !== null) {
      drawCanvasTextInput(context, this.fonts, this.recipeFilterInput, {
        x: this.layout.craftingRecipeFilter.x + 6,
        y: this.layout.craftingRecipeFilter.y + 5,
        width: this.layout.craftingRecipeFilter.width - 12,
        placeholder: 'SEARCH RECIPES',
        color: '#51351f',
        placeholderColor: '#986846',
      });
    } else drawLabel(context, this.fonts, this.recipeFilterText || 'SEARCH RECIPES',
      this.layout.craftingRecipeFilter.x + 6, this.layout.craftingRecipeFilter.y + 5, {
        color: this.recipeFilterText ? '#51351f' : '#986846',
      });
    const selectedRecipe = this.selectedCraftingRecipeEntry();
    const selectedStationLocked = selectedRecipe?.stationAvailable === false;
    const craftingGridLabel = selectedStationLocked && selectedRecipe.requiredStation !== null
      ? `NEEDS ${this.craftingStationLabel(selectedRecipe.requiredStation)}`
      : selectedRecipe?.skillAvailable === false ? 'SKILL REQUIRED' : 'CRAFTING GRID';
    drawLabel(context, this.fonts, craftingGridLabel, gridLeft, rect.y + 35, {
      color: selectedStationLocked || selectedRecipe?.skillAvailable === false ? '#a5483f' : '#6b4428',
    });
    const previewPattern = this.selectedCraftingRecipeId === null ? null : craftingRecipeStacks(
      this.selectedCraftingRecipeId,
      this.model.knownRecipeIds ?? [],
      this.model.contentRegistry,
    );
    this.craftingItemSlots.forEach((slot, index) => {
      this.drawItemSlotBacking(context, slot);
      if (slot.item) this.drawInventoryItem(context, slot.bounds, slot.item.itemKind, slot.item.quantity, slot.item.durability, slot.item.lit);
      else {
        const ghost = previewPattern?.[index] ?? null;
        if (ghost !== null) {
          context.save();
          context.globalAlpha *= 0.42;
          context.filter = 'grayscale(35%)';
          this.drawInventoryItem(context, slot.bounds, ghost.itemKind, ghost.quantity);
          context.restore();
        }
      }
    });
    const gridRight = Math.max(...this.layout.craftingSlots.map((slot) => slot.x + slot.width));
    drawLabel(context, this.fonts, '>', (gridRight + this.layout.craftingResult.x) / 2, this.layout.craftingResult.y + 6, {
      align: 'center', color: '#6b4428', font: 'header',
    });
    const stationLocked = this.currentRecipeLocked();
    const output = this.recipeOutput(this.currentRecipeId() ?? '');
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
        drawLabel(context, this.fonts, this.recipeFilterText ? 'NO MATCHING RECIPES' : 'READ RECIPE BOOKS', firstRow.x + firstRow.width / 2, firstRow.y + 4, {
          align: 'center', color: '#8e8177',
        });
        drawLabel(context, this.fonts, this.recipeFilterText ? 'CLEAR THE SEARCH' : 'TO REVEAL PATTERNS', firstRow.x + firstRow.width / 2, firstRow.y + 16, {
          align: 'center', color: '#8e8177',
        });
      }
    }
    this.layout.craftingRecipeRows.forEach((row, index) => {
      const entry = entries[this.craftingRecipeScrollBar.position + index];
      if (entry === undefined) return;
      const selected = entry.recipeId === this.selectedCraftingRecipeId;
      const stationLocked = !entry.stationAvailable || !entry.skillAvailable;
      context.fillStyle = selected
        ? 'rgba(245, 203, 91, 0.62)'
        : stationLocked ? 'rgba(126, 61, 54, 0.32)'
          : entry.missingIngredients ? 'rgba(104, 82, 71, 0.25)' : 'rgba(239, 213, 163, 0.5)';
      context.fillRect(row.x, row.y, row.width, row.height);
      if (selected) {
        context.strokeStyle = '#8a5a22';
        context.lineWidth = 1;
        context.strokeRect(row.x + 0.5, row.y + 0.5, row.width - 1, row.height - 1);
      }
      const name = this.itemDefinition(entry.outputKind)?.displayName ?? entry.outputKind;
      const stationCode = entry.requiredStation !== null
        ? this.craftingStationCode(entry.requiredStation, row.width < 72)
        : null;
      const reservedWidth = stationCode === null ? 0 : measurePixelText(stationCode) + 5;
      const maximumCharacters = Math.max(2, Math.floor((row.width - 6 - reservedWidth) / 6));
      drawLabel(context, this.fonts, fitLabel(`${entry.outputQuantity} ${name.toUpperCase()}`, maximumCharacters), row.x + 3, row.y + 4, {
        color: stationLocked ? '#9a5147' : entry.missingIngredients ? '#8e8177' : '#5f3b24',
      });
      if (stationCode !== null) drawLabel(context, this.fonts, stationCode, row.x + row.width - 3, row.y + 4, {
        align: 'right', color: stationLocked ? '#a5483f' : '#6b4428',
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
    storageFrame ??= this.activeContentFrame()?.storage;
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
    return window === 'inventory' || window === 'pack' || window === 'crafting' || window === 'content' || window === 'chest' || window === 'barrel' || window === 'furnace' || window === 'cooking' || window === 'press' || window === 'fermentation';
  }

  private visibleItemSlots(): ItemSlot[] {
    if (this.activeContentFrame() !== null) {
      return [
        ...this.inventoryHotbarSlots, ...this.backpackItemSlots, ...this.equipmentItemSlots,
        ...this.craftingItemSlots, ...this.chestItemSlots, ...this.placeableItemSlots, ...this.stashItemSlots,
      ].filter((slot) => slot.visible);
    }
    if (this.openWindowValue === 'inventory') return [...this.equipmentItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'crafting') return [...this.craftingItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'chest') return [...this.chestItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    if (this.openWindowValue === 'content' || this.openWindowValue === 'barrel' || this.openWindowValue === 'furnace'
      || this.openWindowValue === 'cooking' || this.openWindowValue === 'press'
      || this.openWindowValue === 'fermentation') {
      return [...this.placeableItemSlots, ...this.backpackItemSlots, ...this.inventoryHotbarSlots];
    }
    return [];
  }

  private currentRecipeId(): string | null {
    const grid = { id: 'crafting', capacity: 9, slots: this.craftingItemSlots.map((slot) => slot.item) };
    const registry=this.model.contentRegistry??bootstrapContentRegistry();
    return runtimeMatchingRecipeId(registry,grid,grid.capacity,this.selectedCraftingRecipeId,this.model.knownRecipeIds??[],
      recipe=>(recipe.station===undefined||(this.model.nearbyCraftingStations??[]).includes(recipe.station))
        &&runtimeRecipeSkillSatisfied(registry,recipe.id,this.recipeSkillRanks()));
  }

  private itemDefinition(itemKind: string) {
    return overworldItemDefinition(itemKind, this.model.contentRegistry);
  }

  private durabilityDefinition(itemKind: string) {
    return runtimeDurabilityDefinition(
      this.model.contentRegistry ?? bootstrapContentRegistry(), itemKind,
    );
  }

  private maxStackFor(itemKind: string): number {
    return overworldItemMaxStack(itemKind, this.model.contentRegistry);
  }

  private itemContainerContent() {
    return this.model.contentRegistry === undefined
      ? BOOTSTRAP_ITEM_CONTAINER_CONTENT
      : itemContainerContentResolver(this.model.contentRegistry);
  }

  private recipeDefinition(recipeId: string) {
    return this.model.contentRegistry === undefined
      ? recipeDefinition(recipeId)
      : runtimeRecipeDefinition(this.model.contentRegistry, recipeId);
  }

  private recipeOutput(recipeId: string): ItemStack | null {
    return this.model.contentRegistry === undefined
      ? craftingRecipeOutput(recipeId)
      : runtimeCraftingRecipeOutput(this.model.contentRegistry, recipeId);
  }

  private currentRecipeKnowledgeMissing(): boolean {
    const id=this.currentRecipeId();
    return id!==null&&this.recipeDefinition(id)?.requiresKnowledge===true
      && !(this.model.knownRecipeIds??[]).includes(id);
  }

  private currentRecipeLocked(): boolean {
    const recipe = this.recipeDefinition(this.currentRecipeId() ?? '');
    return this.currentRecipeKnowledgeMissing() || (recipe?.station !== undefined
      && !(this.model.nearbyCraftingStations ?? []).includes(recipe.station))
      || (this.model.contentRegistry !== undefined && this.currentRecipeId() !== null
        && !runtimeRecipeSkillSatisfied(this.model.contentRegistry, this.currentRecipeId()!, this.recipeSkillRanks()));
  }

  private recipeSkillRanks(): Readonly<Record<string, number>> {
    return Object.fromEntries((this.model.skills?.ranks ?? []).map(({ nodeId, rank }) => [nodeId, rank]));
  }

  private recipeSkillRequirement(recipeId: string): string | null {
    const registry = this.model.contentRegistry;
    const requirement = registry?.recipes.get(recipeId.startsWith('recipe:') ? recipeId : `recipe:${recipeId}`)?.skillRequirement;
    if (requirement === undefined) return null;
    const name = registry?.compiled.skillNodes.find(({ id }) => id === requirement.skillNode)?.name
      ?? requirement.skillNode.replaceAll('_', ' ');
    return `REQUIRES ${name.toUpperCase()} RANK ${requirement.minimumRank}`;
  }

  private selectedCraftingRecipeEntry() {
    if (this.selectedCraftingRecipeId === null) return null;
    return this.recipeBookEntries().find((entry) => entry.recipeId === this.selectedCraftingRecipeId) ?? null;
  }

  private craftingStationLabel(station: CraftingStation): string {
    return station.replaceAll('_', ' ').toUpperCase();
  }

  private craftingStationCode(station: CraftingStation, compact: boolean): string {
    if (compact) return ({ workbench: 'W', furnace: 'F', anvil: 'A', campfire: 'C' })[station];
    return ({ workbench: 'WB', furnace: 'FUR', anvil: 'ANV', campfire: 'FIRE' })[station];
  }

  private craftingStationRequirement(station: CraftingStation): string {
    return `REQUIRES A ${this.craftingStationLabel(station)} WITHIN 2 TILES`;
  }

  private recipeBookEntries() {
    const entries = craftingRecipeBookEntries(
      this.model.nearbyCraftingStations ?? [],
      this.model.inventory,
      this.model.knownRecipeIds ?? [],
      this.model.contentRegistry,
      this.recipeSkillRanks(),
    );
    const query = this.recipeFilterText.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => {
      const definition = this.itemDefinition(entry.outputKind);
      return entry.recipeId.toLowerCase().includes(query)
        || entry.outputKind.toLowerCase().includes(query)
        || (definition?.displayName.toLowerCase().includes(query) ?? false);
    });
  }

  private selectCraftingRecipe(recipeId: string): void {
    if (this.selectedCraftingRecipeId === recipeId) {
      this.selectedCraftingRecipeId = null;
      return;
    }
    this.selectedCraftingRecipeId = recipeId;
    this.callbacks.ghostFillCraftingRecipe(recipeId);
  }

  private craftingRecipeEntryAt(point: UiPoint) {
    const rowIndex = this.layout.craftingRecipeRows.findIndex((rect) => containsPoint(rect, point));
    return rowIndex < 0
      ? undefined
      : this.recipeBookEntries()[this.craftingRecipeScrollBar.position + rowIndex];
  }

  private hoveredCraftingGhostItem(): ItemStack | null {
    if (this.openWindowValue !== 'crafting' || this.selectedCraftingRecipeId === null) return null;
    const slotIndex = this.layout.craftingSlots.findIndex((slot) => containsPoint(slot, this.pointer));
    if (slotIndex < 0 || this.craftingItemSlots[slotIndex]?.item !== null) return null;
    const pattern = craftingRecipeStacks(
      this.selectedCraftingRecipeId,
      this.model.knownRecipeIds ?? [],
      this.model.contentRegistry,
    );
    return pattern?.[slotIndex] ?? null;
  }

  private quickMoveDestinations(source: string): readonly string[] {
    if (source === 'stash') return ['hotbar','backpack'];
    if(this.activeContentFrame()?.definition.presentation?.entityContainer==='stash')return ['stash'];
    if (source === 'chest') return ['hotbar', 'backpack'];
    if (this.openWindowValue === 'chest') return ['chest'];
    if (source === 'placeable') return ['hotbar', 'backpack'];
    if (this.openWindowValue === 'content' || this.openWindowValue === 'barrel' || this.openWindowValue === 'furnace' || this.openWindowValue === 'cooking'
      || this.openWindowValue === 'press' || this.openWindowValue === 'fermentation') return ['placeable'];
    if (this.openWindowValue === 'crafting') return source === 'crafting' ? ['hotbar', 'backpack'] : ['crafting'];
    if (source === 'hotbar') return ['backpack'];
    return ['hotbar'];
  }

  private quickMoveSourceContainers(source: string): readonly string[] {
    if (source === 'stash') return ['stash'];
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
    }, this.itemContainerContent());
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
    }, this.itemContainerContent());
    if (!result.ok) return false;
    this.acceptOptimisticMenu(result.containers, result.cursor);
    return true;
  }

  private predictPickupAll(): boolean {
    const result = pickupAllToCursor(
      this.visibleMenuContainers(), this.heldCursorStack(), this.visibleContainerOrder(),
      this.itemContainerContent(),
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
    }, this.itemContainerContent());
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
    const sealButton = this.activeContentFrame()?.buttons
      .find(({ definition }) => definition.interaction === 'seal')?.rect ?? barrelSealButtonRect(rect);
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

export function hearthDangerStatusLabel(notice: HearthDangerNotice): string {
  return notice === 'protected' ? 'PROTECTED' : notice === 'boundary' ? 'DANGER NEAR' : 'HOSTILE';
}
export function hearthDangerStatusDescription(notice: HearthDangerNotice): string {
  return notice === 'protected' ? 'ENEMY DAMAGE BLOCKED' : notice === 'boundary' ? 'PROTECTED / HOSTILE AREA BEYOND BOUNDARY' : 'ENEMIES CAN ATTACK';
}
