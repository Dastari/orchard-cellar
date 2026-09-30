import type { GameFeedbackModel } from './game-host/feedback.js';
import { GameHud, type GameHudSurface } from './game-host/hud.js';
import { DelveConfirmationUi, UpdateReadyUi } from './game-host/overlays.js';
import { SystemMenus } from './game-host/system-menus.js';
import type { TimingProjection } from '@orchard/sim';
import { InventoryMenus, type InventoryMenuAuthority } from './game-host/inventory-menus.js';
import { reportUiFailure, UiFailureLog, uiFailurePolicy } from './kit/runtime/failure-policy.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiRoot } from './kit/runtime/root.js';
import { UiElement } from './kit/runtime/element.js';
import type { UiInventorySlotRef } from './kit/runtime/inventory.js';
import { UI_SLOT_PICKUP_DISTANCE, UiSlotGestures, type UiSlotRef, type UiSlotSpreadMode } from './kit/components/slot-controller.js';
import { EquipmentTooltipDwell, equipmentTooltipRect } from './equipment-tooltip.js';
import type { HearthDangerNotice } from '@orchard/sim';
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
import type { ContainerSnapshot, ContentRegistry, ItemContainerContentResolver, CraftingStation, FrameDefinitionId, ItemDefinition, ItemStack, MoonPhase, MoveItemRequest, WeatherMode, WindDirectionMode } from '@orchard/sim';
import { bootstrapContentRegistry } from '@orchard/sim/content/bootstrap-registry';
import { runtimeRecipeSkillSatisfied } from '@orchard/sim/content/farming-runtime';
import { runtimeCraftingRecipeOutput, runtimeItemDefinition, runtimeItemInventoryCapacity, runtimeMatchingRecipeId, runtimeMaxStack, runtimeRecipeDefinition } from '@orchard/sim/content/runtime';
import { MAIN_HAND_EQUIPMENT_INDEX, MAIN_HAND_SELECTED_SLOT, isMainHandSelectedSlot, type PlayerContainerId } from '@orchard/sim/container-addressing';
import { CRAFTING_SLOT_COUNT, EQUIPMENT_SLOTS, HOTBAR_SLOT_COUNT, accessibleBackpackCapacity, hotbarSlotForInputCode, hotbarSlotLabel, inventoryContainerSlotCount } from '@orchard/sim/inventory-layout';
import { BOOTSTRAP_ITEM_CONTAINER_CONTENT, CHEST_STORAGE_CAPACITY, CHEST_STORAGE_COLUMNS, clickContainerSlot, craftingRecipeOutput, itemContainerContentResolver, itemDefinition, maxStackFor, pickupAllToCursor, quickCraftCursorStack, quickMoveAllMatchingStacks } from '@orchard/sim/item-containers';
import { recipeDefinition } from '@orchard/sim/recipes';
import type { LoadedAsset } from './assets.js';
import { isolatedAtlasFrameImage } from './atlas-frame-image.js';
import { drawOutlinedPixelText, drawPixelText, drawPixelTextInRect, measurePixelText, type PixelUi } from './pixel-ui.js';
import { craftingRecipeBookEntries, craftingRecipeStacks } from './recipe-book.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { UiInputRouter } from './input-router.js';
import { Slider } from './slider.js';
import { MAX_TOUCH_BOTTOM_OFFSET, DEFAULT_TOUCH_CONTROL_PREFERENCES, type TouchControlPreferences } from './touch-controls.js';
import { BUTTON_HEIGHT, CanvasButton } from './button.js';
import { drawToggleSwitch, Toggle } from './toggle.js';
import { Ribbon, STACKED_RIBBON_HEIGHT } from './ribbon.js';
import { EQUIPMENT_SLOT_RESTRICTIONS, INVENTORY_CONTAINER_IDS, ItemSlot, ItemSlotTable, type InventoryContainerId } from './item-slot.js';
import { isCarriedPlayerContainer, isOccupiedCell, selectedCellRow, type PlayerCellStack } from './player-cells.js';
import { HelpBook } from './help-book.js';
import { ScrollBar } from './scrollbar.js';
import {
  layoutStorageFrame,
  type StorageFrameLayout,
  type StorageFrameSpec,
} from './storage-frame.js';
import {
  contentFrameButtonAt,
  contentFramePaneVisible,
  frameSlotAuthorityRestriction,
  layoutContentFrame,
  type ContentFrameLayout,
  type ResolvedFrameSlotBinding,
} from './content-frame.js';
import { frameEntitySlotIndexes } from '@orchard/sim/content/frame-runtime';
import { CurrencyDisplay } from './currency-display.js';
import { PlayerResourceFrame } from './player-resource-frame.js';
import { pwaUpdateLabel, type PwaUpdateStatus } from './pwa-update.js';
import {
  drawUiLabelPlate,
  drawUiSkinAsset,
  drawUiSkinNatural,
  uiAssetFrame,
  type UiSkin,
} from './skin.js';
import { widget, type WidgetNode } from './widget.js';
import { CharacterScreen, progressionWindowRect, type CharacterScreenModel } from './character-screen.js';
import type { UiGameBookChapter } from './kit/components/character-book.js';
import { SkillTreeUi, type SkillTreeModel } from './skill-tree-ui.js';
import type { SkillPointNotice } from './skill-point-notice.js';
import { StatisticsScreen, type StatisticsScreenModel } from './statistics-screen.js';
import { type ProgressionTab } from './progression-tabs.js';
import { QuestLog, type QuestLogEntry } from './quest-log.js';
import { drawUiInventorySlotBacking } from './design-system/inventory.js';
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

/** A stack in one cell of an open chest, station or stash, by that container's own index. */
export interface OverworldUiContainerSlot {
  readonly index: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
  readonly lit?: boolean;
}

/** A stack the player carries, by container and index (Uncapped Storage step 4c): never a global slot number. */
export interface OverworldUiInventorySlot extends OverworldUiContainerSlot, PlayerCellStack {
  readonly container: PlayerContainerId;
}

/** The Main Hand weapon's row, when one is equipped. */
export function mainHandRow<T extends OverworldUiInventorySlot>(inventory: readonly T[]): T | undefined {
  return inventory.find(row => row.container === 'equipment' && row.index === MAIN_HAND_EQUIPMENT_INDEX && isOccupiedCell(row));
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
  return inventory.some((slot) => slot.container === 'equipment' && slot.index === RING_EQUIPMENT_SLOT_INDEX
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
 * recedes on the left, matching wiki: Systems/Lighting & Seasons. */
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
  readonly interactionSessionKey?: string;
  readonly width: number;
  readonly height: number;
  readonly connected: boolean;
  readonly touchControls?: boolean;
  readonly touchControlPreferences?: TouchControlPreferences;
  readonly playerCount: number;
  readonly onlinePlayersVisible?: boolean;
  readonly trackedQuestCount?: number;
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
  readonly openChestInventory?: readonly OverworldUiContainerSlot[];
  readonly openStashInventory?:readonly OverworldUiContainerSlot[];
  readonly openPlaceableInventory?: readonly OverworldUiContainerSlot[];
  /** The open chest's, placeable's or stash's container size, so a frame pane bound to `entitySlots: all` shows it all. */
  readonly openEntityCapacity?: number;
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
  readonly activeFrameTiming?: TimingProjection;
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
  readonly clearTarget?: (expectedTargetId: string) => void;
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
  readonly setAppearance?: (appearance: PlayerAppearanceSelection) => void | Promise<void>;
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
  readonly sortInventoryContainer: (container: 'backpack' | 'chest' | 'placeable' | 'stash') => void | Promise<void>;
  readonly inventoryCursorQuickCraft: (targets: readonly { container: string; index: number }[], mode: 'even' | 'one_each') => void | Promise<void>;
  readonly inventoryCursorPickupAll: (containerOrder: readonly string[]) => void | Promise<void>;
  readonly inventoryCursorSwapHotbar: (container: string, index: number, hotbarIndex: number) => void;
  readonly dropInventoryCursor: (button: 'left' | 'right') => void | Promise<void>;
  readonly throwMenuItem: (container: string, index: number, wholeStack: boolean) => void;
  readonly returnInventoryCursor: () => void;
  readonly craftInventoryRecipe: (recipeId: string, craftAll: boolean) => void;
  /** Resolves when the authority placed the pattern; rejects when it refused (the host shows why). */
  readonly ghostFillCraftingRecipe: (recipeId: string) => void | Promise<unknown>;
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
/** The legacy frame-less host windows' backpack grid: 5 columns by 4 rows of fixed rects. It is a layout, not a
 * capacity; cells past it are placed by the kit panes, which scroll over every cell the bag opens. */
const LEGACY_HOST_BACKPACK_GRID_CELLS = 20;

/** The backpack cells the model opens (BUG-056): its projected capacity, through the world's one rule. A model with
 * no projected capacity (older tests, the UI lab) falls back to the shipped backpack's authored capacity or the base
 * bag. */
function modelBackpackCapacity(model: Pick<OverworldUiModel, 'backpackSlotCapacity' | 'hasBackpack' | 'contentRegistry'>): number {
  return accessibleBackpackCapacity(model.backpackSlotCapacity ?? (model.hasBackpack
    ? runtimeItemInventoryCapacity(model.contentRegistry ?? bootstrapContentRegistry(), 'backpack') ?? DEFAULT_INVENTORY_SLOTS
    : DEFAULT_INVENTORY_SLOTS));
}

/** The model's stacks by container and cell: the player's carried rows by their own container and index, and the open
 * chest's, station's and stash's rows by theirs. Built once per update; a slot reads its cell from here. */
function modelItemRows(model: Pick<OverworldUiModel, 'inventory' | 'openChestInventory' | 'openPlaceableInventory' | 'openStashInventory'>): Readonly<Record<InventoryContainerId, ReadonlyMap<number, OverworldUiContainerSlot>>> {
  const rows = Object.fromEntries(INVENTORY_CONTAINER_IDS.map(container => [container, new Map<number, OverworldUiContainerSlot>()])) as Record<InventoryContainerId, Map<number, OverworldUiContainerSlot>>;
  // An explicit `empty` row (the legacy tables kept them for vacant cells; the sparse cells never store one) is not an
  // item stack: retaining it here makes a slot look empty while drop validation sees an incompatible item occupying it.
  const stacks = <T extends OverworldUiContainerSlot>(items: readonly T[] | undefined) => (items ?? []).filter(isOccupiedCell);
  // The stash is its own window's entity pane: it comes only from the open stash's rows.
  for (const item of stacks(model.inventory)) if (isCarriedPlayerContainer(item.container)) rows[item.container].set(item.index, item);
  for (const item of stacks(model.openChestInventory)) rows.chest.set(item.index, item);
  for (const item of stacks(model.openPlaceableInventory)) rows.placeable.set(item.index, item);
  for (const item of stacks(model.openStashInventory)) rows.stash.set(item.index, item);
  return rows;
}

/** A host item slot's widget id (unchanged from the fixed slot arrays). */
function itemSlotNodeId(container: InventoryContainerId, index: number): string {
  return container === 'hotbar' || container === 'backpack' || container === 'equipment' ? `window.inventory.${container}.${index}`
    : container === 'placeable' ? `window.content.entity.${index}` : `window.${container}.${index}`;
}
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
/** A touch drag past this distance leaves the backpack swipe to the slot pickup. */
const INVENTORY_DRAG_START_DISTANCE = UI_SLOT_PICKUP_DISTANCE;

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
    y: rect.y + rect.height - 15,
  };
}

export function slotDurabilityBarRect(rect: UiRect): UiRect {
  return { x: rect.x + 5, y: rect.y + rect.height - 8, width: rect.width - 10, height: 3 };
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
  const visibleSystemMenuActions: SystemMenuAction[] = ['resume', 'settings', 'help'];
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
    backpackSlots: Array.from({ length: LEGACY_HOST_BACKPACK_GRID_CELLS }, (_, index) => ({ x: backpackOrigin.x + index % inventoryBackpackColumns * 31, y: backpackOrigin.y + Math.floor(index / inventoryBackpackColumns) * 31, width: 28, height: 31 })),
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
    craftingInventorySlots: Array.from({ length: LEGACY_HOST_BACKPACK_GRID_CELLS }, (_, index) => ({
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

/** "REQUIRES A WORKBENCH WITHIN 2 TILES" in the book's sentence case. */
function sentenceCaseRequirement(text: string): string { const lower = text.toLowerCase(); return lower.charAt(0).toUpperCase() + lower.slice(1); }

export class OverworldUi {
  private retainedFeedback = false;
  enableRetainedFeedback(): void { this.retainedFeedback = true; }
  /** Project existing hover/dwell/notification authority; shared roots own paint. */
  feedbackHud(now: number): Omit<GameFeedbackModel['hud'], 'notice'> {
    const allowed = this.openWindowValue === null || this.openWindowValue === 'system' || this.isInventoryWindow(this.openWindowValue);
    const item = this.hoveredItem();
    const detailsReady = this.equipmentTooltipDwell.ready(item?.itemKind ?? null, now);
    const text = allowed && (!this.gameHud || this.isInventoryWindow(this.openWindowValue)) ? this.tooltipText() : null;
    let tooltip: GameFeedbackModel['hud']['tooltip'] = null;
    if (text) {
      const gear = !detailsReady || this.model.touchControls === true || text.startsWith('REQUIRES ') || item === null || this.model.contentRegistry === undefined ? null : equipmentDescriptionLines(
        this.model.contentRegistry, item.itemKind, this.model.inventory, this.model.selectedSlot,
        Object.fromEntries((this.model.skills?.ranks ?? []).map(({ nodeId, rank }) => [nodeId, rank])), this.model.skills?.skillPriority ?? [],
      );
      const details = gear === null ? null : item?.durability === undefined ? gear : gear.map(line =>
        line.startsWith('MAX DURABILITY ') ? `DURABILITY ${item.durability} / ${line.slice(15)}` : line);
      const base = this.touchInventoryTooltipRect();
      // A pointer names the slot it rests on: the label (and any details) sits centred just above that slot, so
      // it never covers the window's hotbar row. Near the top of a short screen, where the details don't fit above,
      // the host hangs them just below the slot instead; either way they never cover it. Touch keeps its labels
      // below the window hotbar, clear of the finger.
      const slot = this.retainedInventoryActive && this.model.touchControls !== true ? this.retainedMenus?.slotAt(this.pointer)?.rect ?? null : null;
      tooltip = slot ? { text: details?.join('\n') ?? text, anchor: { x: slot.x + slot.width / 2, y: slot.y - 4 }, below: slot.y + slot.height + 4, tone: 'neutral' }
        : { text: details?.join('\n') ?? text, anchor: { x: this.model.width / 2, y: details ? base.y - 4 : base.y + base.height },
          ...(details ? { maxHeight: Math.max(0, base.y - 8) } : {}), tone: 'neutral' };
    }
    const prompt = this.openWindowValue === null && !tooltip ? this.model.prompt : null;
    const toast = this.notificationText();
    return {
      prompt: prompt ? { text: prompt, anchor: { x: this.model.width / 2, y: this.layout.tooltip.y + this.layout.tooltip.height }, tone: 'neutral' } : null,
      toast: toast ? { text: toast, anchor: { x: this.model.width / 2, y: this.layout.notification.y + this.layout.notification.height },
        tone: this.model.toastKind === 'failure' ? 'danger' : this.model.toastKind === 'success' ? 'success' : 'primary' } : null,
      tooltip,
    };
  }
  private gameHud: GameHud | null = null;
  enableRetainedHud(art: UiKitArt, focusSurface?: (surface: GameHudSurface) => void): Readonly<Record<GameHudSurface, UiRoot>> {
    this.gameHud ??= new GameHud(art, {
      ...(focusSurface ? { focusSurface } : {}),
      selectHotbar: slot => this.callbacks.selectHotbar(slot),
      toggleInventory: () => { this.openWindow = this.openWindowValue === 'inventory' ? null : 'inventory'; },
      toggleCrafting: () => { this.openWindow = this.openWindowValue === 'crafting' ? null : 'crafting'; },
      toggleBuild: () => this.callbacks.toggleBuild?.(),
      openSystem: () => { this.openWindow = 'system'; },
      openCharacter: () => { this.openWindow = 'character'; },
      openOnlinePlayers: () => this.callbacks.toggleOnlinePlayers(),
      clearTarget: id => { if (this.model.targetVitals?.targetId === id) this.callbacks.clearTarget?.(id); },
    }, {
      itemLabel: stack => this.itemDefinition(stack.itemKind)?.displayName ?? stack.itemKind,
      drawItem: (context, rect, stack) => this.drawItemIcon(context, rect, stack.itemKind, stack.lit),
      contentRegistry: () => this.model.contentRegistry,
      drawPlayerHead: (context, id, rect) => this.drawPlayerHead(context, id, rect),
      drawTargetPortrait: (context, id, rect) => { const target = this.model.targetVitals; if (target?.targetId === id) this.drawTargetPortrait(context, target, rect); },
      drawMinimap: (context, rect, zoom, tracking) => this.drawMinimap(context, rect, zoom, tracking),
      drawMoon: (context, rect) => { if (this.model.moonPhase) drawUiSkinAsset(context, this.skin.moonPhase, rect, this.model.moonPhase); },
      drawEffect: (context, rect, effectKind) => drawUiSkinAsset(context, effectStatusAsset(this.skin, effectKind), rect),
    });
    this.syncRetainedHud(); return this.gameHud.roots;
  }
  get questTrackerVisible(): boolean { return this.gameHud?.questTrackerVisible ?? true; }
  get questTrackerRegion(): UiRect | undefined { return this.gameHud?.questTrackerRegion; }
  get retainedHudActive(): boolean { return this.gameHud?.active === true; }
  retainedHudVisible(surface: GameHudSurface): boolean { return this.gameHud?.isVisible(surface) === true; }
  private syncRetainedHud(): void {
    const hud = this.gameHud; if (!hud) return;
    const model = this.model, vitals = model.vitals, target = model.targetVitals;
    hud.resize(model.width, model.height);
    hud.update(!model.connected ? null : {
      sessionKey: model.interactionSessionKey ?? String(model.connected),
      zone: { title: model.dangerNotice ? 'CINDERWAKE' : model.zoneName ?? 'ORCHARD', onlineCount: model.playerCount,
        ...(model.dangerNotice ? { subtitle: hearthDangerStatusLabel(model.dangerNotice), description: hearthDangerStatusDescription(model.dangerNotice) } : {}),
        ...(hasEquippedWatch(model.inventory, model.contentRegistry) ? { watch: { time: model.timeLabel, date: model.dateLabel, moon: model.moonPhase ? MOON_PHASE_LABELS[model.moonPhase] : 'Moon Unknown' } } : {}),
        ...(model.moonPhase ? { moon: { phase: Object.keys(MOON_PHASE_LABELS).indexOf(model.moonPhase), label: MOON_PHASE_LABELS[model.moonPhase] } } : {}),
      },
      minimapTrackingEnabled: model.minimapTrackingEnabled === true, trackedQuestCount: model.trackedQuestCount,
      touchControls: { enabled: model.touchControls === true, preferences: model.touchControlPreferences ?? DEFAULT_TOUCH_CONTROL_PREFERENCES },
      inventory: { hotbar: model.inventory.filter(row => row.container === 'hotbar' && isOccupiedCell(row)).map(row => ({ index: row.index, stack: row })),
        mainHand: mainHandRow(model.inventory) ?? null, selectedSlot: model.selectedSlot, balanceBronze: model.balanceBronze ?? 0n },
      ...(vitals ? { player: { id: vitals.playerId, values: vitals, hunger: model.hunger, vigourDenied: model.vigourDenied } } : {}),
      ...(target ? { target: { id: target.targetId, name: target.displayName, values: target } } : {}),
      effects: (model.effects ?? []).map(effect => ({ ...effect, id: effect.effectKind })), ticksPerSecond: 20,
      visible: { zoneMinimap: true, hotbarVitals: !this.isInventoryWindow(this.openWindowValue), targetEffects: !this.isInventoryWindow(this.openWindowValue) },
      controls: { weapon: this.openWindowValue === null && mainHandRow(model.inventory) !== undefined,
        crafting: this.openWindowValue === null, build: this.openWindowValue === null && Boolean(this.callbacks.toggleBuild), system: this.openWindowValue === null },
    });
    // Legacy HUD hit nodes and painters retire together; inventory nodes retain custody.
    for (const child of this.root.children) if (child.id.startsWith('hud.')) child.visible = false;
    for (const node of [...this.hotbarNodes, this.weaponShortcutNode, this.mobileMenuNode, this.buildNode, this.craftingNode,
      this.currencyNode, this.zoneNode, this.minimapNode, this.minimapZoomOutNode, this.minimapZoomInNode]) node.visible = false;
  }
  disposeRetainedHud(): void { this.gameHud?.dispose(); this.gameHud = null; }

  private delveConfirmation: DelveConfirmationUi | null = null;
  private updateReady: UpdateReadyUi | null = null;
  enableRetainedOverlays(art: UiKitArt): { readonly confirmation: UiRoot; readonly update: UiRoot } {
    this.delveConfirmation ??= new DelveConfirmationUi(art, {
      begin: () => this.confirmDelve(), cancel: () => { this.openWindow = null; },
    });
    this.updateReady ??= new UpdateReadyUi(art, { refresh: () => this.callbacks.applyClientUpdate() });
    this.syncRetainedOverlays();
    return { confirmation: this.delveConfirmation.root, update: this.updateReady.root };
  }
  private syncRetainedOverlays(): void {
    const { width, height } = this.model;
    this.delveConfirmation?.update({ width, height,
      sessionKey: this.model.interactionSessionKey ?? String(this.model.connected),
      visible: this.openWindowValue === 'delve-confirmation' && this.model.connected,
      canBegin: this.model.connected && !this.model.delveActive,
    });
    this.updateReady?.update({ width, height, status: this.model.pwaUpdateStatus ?? 'unsupported' });
    if (this.delveConfirmation) { this.delveConfirmButton.node.visible = false; this.delveCancelButton.node.visible = false; }
    if (this.updateReady) this.updatePromptNode.visible = false;
  }
  get retainedConfirmationActive(): boolean { return this.delveConfirmation?.active === true; }
  disposeRetainedOverlays(): void {
    this.delveConfirmation?.dispose(); this.updateReady?.dispose(); this.delveConfirmation = null; this.updateReady = null;
  }

  private systemMenus: SystemMenus | null = null;
  get retainedSystemActive(): boolean { return this.systemMenus?.active === true; }
  enableRetainedSystem(art: UiKitArt): UiRoot {
    if (!this.systemMenus) this.systemMenus = new SystemMenus(art, {
      close: () => { this.openWindow = null; }, back: () => { this.openWindow = 'system'; },
      key: code => this.handleKeyDown(code, false),
      volume: (bus, value) => this.callbacks.setAudioVolume(bus, value), mute: bus => this.toggleAudioMute(bus),
      background: (bus, value) => this.callbacks.setAudioBackground(bus, value),
      nameplates: value => this.callbacks.setNameplatesVisible?.(value),
      lighting: mode => this.selectLightingMode(mode), worldScale: changeWorldScale,
      presentationCap: changePresentationCap, experimentalWebGL: changeExperimentalWebGL,
      touch: value => this.callbacks.setTouchControlPreferences?.(value),
      time: value => { if (this.model.canAdministerWorld) this.callbacks.setTimeFraction(value); },
      action: action => {
        switch (action) {
          case 'resume': this.openWindow = null; break;
          case 'settings': case 'help': case 'developer': case 'outdoor-rewards': case 'character': this.openWindow = action; break;
          case 'fullscreen': if (this.model.fullscreenAvailable !== false) this.callbacks.toggleFullscreen(); break;
          case 'check-update': if (this.model.pwaUpdateStatus !== 'checking' && this.model.pwaUpdateStatus !== 'updating') this.callbacks.checkForClientUpdate(); break;
          case 'apply-update': if (this.model.pwaUpdateStatus === 'available') this.callbacks.applyClientUpdate(); break;
          case 'exit-delve': if (this.model.delveActive) { this.openWindow = null; this.callbacks.exitDelve(); } break;
          case 'sign-out': this.callbacks.signOut(); break;
          case 'quit': this.callbacks.quitToTitle(); break;
          default:
            if (!this.model.canAdministerWorld) break;
            if (action === 'previous-day' || action === 'next-day') this.callbacks.shiftDay(action === 'previous-day' ? -1 : 1);
            else if (action === 'weather') this.callbacks.cycleWeather();
            else if (action === 'wind') this.callbacks.cycleWindDirection();
            else if (action === 'lighting-effects') this.selectLightingMode(lightingSettingsMode(this.model) === 'dynamic' ? 'classic' : 'dynamic');
            else if (action === 'ore-preview') this.callbacks.toggleCellarOrePreview?.();
            else if (action === 'render-protocol') { renderProtocolAction.run(); this.openWindow = null; }
        }
      },
    });
    this.syncRetainedSystem(); return this.systemMenus.root;
  }
  private syncRetainedSystem(): void {
    const window = this.openWindowValue === 'system' || this.openWindowValue === 'settings' || this.openWindowValue === 'developer' ? this.openWindowValue : null;
    this.systemMenus?.update({ ...this.model, window,
      frame: window === 'settings' ? this.layout.settingsWindow : window === 'developer' ? this.layout.developerWindow : this.layout.systemWindow,
      outdoorRewardCount: this.model.outdoorRewards?.length ?? 0,
      lightingMode: lightingSettingsMode(this.model), dynamicLighting: lightingSettingsMode(this.model) === 'dynamic',
      worldScale: readWorldScale(), presentationCap: readPresentationCap(), experimentalWebGL: readExperimentalWebGL(),
      touchPreferences: this.model.touchControlPreferences ?? DEFAULT_TOUCH_CONTROL_PREFERENCES,
      renderProtocolLabel: renderProtocolAction.label,
    });
  }
  disposeRetainedSystem(): void { this.systemMenus?.dispose(); this.systemMenus = null; }
  enableRetainedCharacter(art: UiKitArt): { readonly character: UiRoot; readonly statistics: UiRoot; readonly skills: UiRoot } {
    const navigation = { onKey: (key: string, repeat: boolean) => { if (!['i', 'c', 'p', 'k', 'o', 'l'].includes(key.toLowerCase())) return false; if (!repeat) this.handleKeyDown(`Key${key.toUpperCase()}`, false); return true; }, onNavigate: (page: UiGameBookChapter) => { this.openWindow = page; }, onClose: () => { this.openWindow = null; } };
    if (!this.characterScreen || !this.statisticsScreen || !this.skillTree) {
      this.characterScreen = new CharacterScreen(art, { setAppearance: appearance => this.callbacks.setAppearance?.(appearance) },
        this.drawPlayerDoll, (context, rect, item) => this.drawItemIcon(context, rect, item.itemKind, item.lit), navigation,
        () => this.model.contentRegistry);
      this.statisticsScreen = new StatisticsScreen(art, navigation);
      this.skillTree = new SkillTreeUi(art, {
        prioritize: nodeId => this.callbacks.prioritizeEquipmentSkill?.(nodeId),
        purchase: nodeId => this.callbacks.purchaseSkillNode?.(nodeId), reset: track => this.callbacks.resetSkillTree?.(track),
      }, { ...navigation, artwork: this.skin.skillIcons });

    }
    this.syncRetainedCharacter(); return { character: this.characterScreen.root, statistics: this.statisticsScreen.root, skills: this.skillTree.root };
  }
  get retainedCharacterActive(): boolean {
    return this.openWindowValue === 'character' && this.characterScreen?.active === true
      || this.openWindowValue === 'statistics' && this.statisticsScreen?.active === true
      || this.openWindowValue === 'skills' && this.skillTree?.active === true;
  }
  private syncRetainedCharacter(): void {
    this.characterScreen?.update(this.openWindowValue === 'character' && this.model.connected ? this.model.character ?? null : null);
    this.statisticsScreen?.update(this.openWindowValue === 'statistics' && this.model.connected ? {
      ...(this.model.statistics ?? { statistics: [] }), contentRegistry: this.model.contentRegistry,
    } : null);
    this.skillTree?.update(this.openWindowValue === 'skills' && this.model.connected ? this.model.skills ?? null : null);
    for (const view of [this.characterScreen, this.statisticsScreen, this.skillTree]) view?.setBounds(this.layout.progressionWindow, this.model.width, this.model.height);
  }
  disposeRetainedCharacter(): void { this.skillTree?.dispose(); this.skillTree = null; this.characterScreen?.dispose(); this.statisticsScreen?.dispose(); this.characterScreen = null; this.statisticsScreen = null; }
  private retainedMenus: InventoryMenus | null = null;
  private retainedArtwork: OverworldUiItemArt | null = null;
  get retainedInventoryRoot(): UiRoot | null { return this.retainedMenus?.root ?? null; }
  get retainedInventoryActive(): boolean { return this.retainedMenus?.active === true; }

  /** Central client registers this stable root once; no DOM listeners or RAF. */
  enableRetainedInventory(art: UiKitArt): UiRoot {
    const menus = this.createRetainedInventory(); menus.setArt(art); return menus.root;
  }

  private createRetainedInventory(): InventoryMenus {
    if (this.retainedMenus) return this.retainedMenus;
    this.retainedArtwork = new Proxy(this.itemArt, { get: (assets, key) => typeof key === 'string'
      ? overworldItemArtwork(assets, key, this.model.contentRegistry) : Reflect.get(assets, key) });
    const authority: InventoryMenuAuthority = {
      gestures: this.slotGestures,
      displayedCursor: () => this.quickCraftPreviewCursor === undefined ? this.heldCursorStack() : this.quickCraftOriginalCursor,
      hover: (point) => { this.pointer = point; this.systemCursorMove(point); },
      key: (event) => {
        const code = 'code' in event && typeof event.code === 'string' ? event.code
          : /^[0-9]$/u.test(event.key) ? `Digit${event.key}` : /^[a-z]$/iu.test(event.key) ? `Key${event.key.toUpperCase()}` : event.key;
        if (!['Escape', 'KeyI', 'KeyC', 'KeyP', 'KeyK', 'KeyO', 'KeyL', 'KeyQ'].includes(code)
          && !(this.openWindowValue === 'barrel' && code === 'KeyS') && !/^Digit[0-9]$/u.test(code)) return false;
        return this.handleKeyDown(code, 'repeat' in event && event.repeat === true, { ctrl: event.ctrlKey });
      },
      close: () => { this.openWindow = null; }, invoke: (id) => { this.callbacks.frameAction?.(id); },
      sort: (container) => { if (this.heldCursorStack() === null && (container === 'backpack' || container === 'chest' || container === 'placeable' || container === 'stash')) this.trackInventoryPrediction(this.callbacks.sortInventoryContainer(container)); },
      filter: (value) => { this.inventoryFilterText = value; }, recipeFilter: (value) => { this.recipeFilterText = value; },
      recipe: (id) => { this.placeCraftingRecipe(id); this.syncRetainedInventory(); },
      craft: (all) => { const id = this.currentRecipeId(); if (id !== null && !this.currentRecipeLocked()) this.callbacks.craftInventoryRecipe(id, all); },
      label: item => this.itemDefinition(item.itemKind)?.displayName ?? item.itemKind,
      iconAnimation: item => itemIconAnimation(item.itemKind, this.model.contentRegistry),
      contentRegistry: () => this.model.contentRegistry,
      artwork: () => this.retainedArtwork!,
    };
    this.retainedMenus = new InventoryMenus(undefined, authority);
    this.syncRetainedInventory();
    return this.retainedMenus;
  }

  disposeRetainedInventory(): void { this.retainedMenus?.dispose(); this.retainedMenus = null; }

  /** Reading hosts share the same central canvas input and frame loop. */
  enableRetainedReading(art: UiKitArt): { readonly quests: UiRoot; readonly help: UiRoot } {
    if (!this.questLog || !this.helpBook) {
      this.questLog = new QuestLog(art, {
        setPinned: (id, pinned) => this.callbacks.setQuestPinned(id, pinned),
        drop: id => this.callbacks.abandonQuest(id),
      }, () => { this.openWindow = null; }, page => { this.openWindow = page; });
      this.helpBook = new HelpBook(art, () => { this.openWindow = 'system'; }, undefined, (context, rect, itemKind) => this.drawItemIcon(context, rect, itemKind));
      for (const root of [this.questLog.root, this.helpBook.root]) {
        for (const { element } of root.entries()) if (element.id === 'game.quests' || element.id === 'game.help.frame') {
          element.setProps({ touchScroll: true, singlePointer: true });
          element.setStyle({ zLayer: 'modal' });
        }
        const children = [...root.tree.children];
        root.mount(new UiElement({ id: 'reading-host', style: { display: 'stack', width: 'grow', height: 'grow' },
          props: { touchScroll: true, singlePointer: true }, children,
          onKeyCapture: event => {
            const key = event.key.toLowerCase();
            if (event.key !== 'Escape' && !['i', 'c', 'p', 'k', 'o', 'l'].includes(key)) return false;
            if (event.repeat) return true;
            return this.handleKeyDown(event.key === 'Escape' ? 'Escape' : `Key${key.toUpperCase()}`, false);
          },
        }));
      }
      this.questLog.update(this.model.quests ?? []);
      this.syncRetainedReading();
    }
    return { quests: this.questLog.root, help: this.helpBook.root };
  }

  get retainedReadingActive(): boolean {
    return this.openWindowValue === 'quests' && this.questLog !== null
      || this.openWindowValue === 'help' && this.helpBook !== null;
  }

  private syncRetainedReading(): void {
    for (const [window, view] of [['quests', this.questLog], ['help', this.helpBook]] as const) {
      if (!view) continue;
      const active = this.openWindowValue === window;
      if (!active) { view.root.input.cancelPointers(); view.root.focus.set(null); }
      if (view.root.tree.visible !== active) view.root.tree.setStyle({ visible: active });
      const width = Math.max(0, Math.min(this.layout.progressionWindow.width, this.model.width - 8));
      const height = Math.max(0, Math.min(this.layout.progressionWindow.height, this.model.height - 8));
      view.setBounds(window === 'quests'
        ? { x: (this.model.width - width) / 2, y: (this.model.height - height) / 2, width, height }
        : { x: 4, y: 4, width: Math.max(0, this.model.width - 8), height: Math.max(0, this.model.height - 8) },
      this.model.width, this.model.height);
    }
  }

  disposeRetainedReading(): void {
    this.questLog?.dispose(); this.helpBook?.dispose(); this.questLog = null; this.helpBook = null;
  }

  private retainedFrame(): ContentFrameLayout | null {
    if (!this.retainedMenus) return null;
    const frame = this.activeContentFrame();
    // Authored placeables and the hearth stash enter through the generic content window. Every entity frame is the
    // kit's, whatever its id (a new Studio-authored frame too), so every window that shows the player's inventory
    // uses the shared kit pane (BUG-067, item slot S9).
    if (this.openWindowValue === 'content') return frame?.definition.presentation?.surface === 'entity' ? frame : null;
    return ['inventory', 'crafting', 'chest', 'barrel', 'furnace', 'cooking', 'press', 'fermentation']
      .includes(this.openWindowValue ?? '') ? frame : null;
  }

  /** Complete authored bindings, independent of filter, clipping and scrolling. */
  private retainedSlots(): ItemSlot[] { return this.retainedSlotIndex()?.slots ?? []; }

  private retainedSlot(ref: UiInventorySlotRef): ItemSlot | null { return this.retainedSlotIndex()?.byRef.get(ref.container)?.get(ref.index) ?? null; }

  /** The retained frame's slots, and the same slots by container and index. The set and its rules change only with
   * the model (slot items, enabled cells and cleared restrictions are set in update), the layout or the open window,
   * so it is rebuilt then and not per lookup: the slot controller asks for slots many times a frame. */
  private retainedIndex: { readonly model: OverworldUiModel; readonly layout: unknown; readonly window: OverworldWindow | null;
    readonly slots: ItemSlot[]; readonly byRef: ReadonlyMap<string, ReadonlyMap<number, ItemSlot>> } | null = null;
  private retainedSlotIndex(): { readonly slots: ItemSlot[]; readonly byRef: ReadonlyMap<string, ReadonlyMap<number, ItemSlot>> } | null {
    const cached = this.retainedIndex;
    if (cached && cached.model === this.model && cached.layout === this.layout && cached.window === this.openWindowValue) return cached;
    const frame = this.retainedFrame(); if (!frame) { this.retainedIndex = null; return null; }
    const slots = new Set<ItemSlot>();
    for (const pane of frame.panes) for (const binding of this.retainedPaneBindings(pane)) {
      const slot = this.itemSlots.find(binding.containerId, binding.index);
      if (!slot || !slot.enabled) continue;
      // The authority's rules only (BUG-050): equipment rules on equipment, none on other self panes.
      slot.setRestriction(frameSlotAuthorityRestriction(pane.definition, binding)); slots.add(slot);
    }
    if (frame.definition.hotbar) for (const slot of this.hostSlots('hotbar')) slots.add(slot);
    const byRef = new Map<string, Map<number, ItemSlot>>();
    for (const slot of slots) {
      let cells = byRef.get(slot.containerId); if (!cells) { cells = new Map(); byRef.set(slot.containerId, cells); }
      cells.set(slot.index, slot);
    }
    this.retainedIndex = { model: this.model, layout: this.layout, window: this.openWindowValue, slots: [...slots], byRef };
    return this.retainedIndex;
  }

  /** A retained pane's cells: its laid-out bindings, or, bound to `entitySlots: all`, every slot of the open entity's
   * container, and bound to the backpack, every cell the bag opens (the layout can't know either size), with the
   * pane's one restriction. */
  private retainedPaneBindings(pane: ContentFrameLayout['panes'][number]): readonly ResolvedFrameSlotBinding[] {
    const bind = pane.definition.bind, first = pane.slots[0];
    if ('self' in bind && bind.self === 'backpack' && first) return Array.from({ length: modelBackpackCapacity(this.model) },
      (_, index) => ({ containerId: first.containerId, index, ...(first.restriction ? { restriction: first.restriction } : {}) }));
    if (!('entitySlots' in bind) || bind.entitySlots !== 'all' || !first) return pane.slots;
    return frameEntitySlotIndexes(bind, this.model.openEntityCapacity ?? pane.slots.length)
      .map(index => ({ containerId: first.containerId, index, ...(first.restriction ? { restriction: first.restriction } : {}) }));
  }

  private syncRetainedInventory(): void {
    if (!this.retainedMenus) return;
    const frame = this.retainedFrame(), registry = this.model.contentRegistry;
    if (!frame || !registry || !this.model.connected) { this.retainedMenus.update(null); return; }
    const recipeId = this.currentRecipeId();
    const pattern = this.selectedCraftingRecipeId === null ? null
      : craftingRecipeStacks(this.selectedCraftingRecipeId, this.model.knownRecipeIds ?? [], registry);
    this.retainedMenus.update({ width: this.model.width, height: this.model.height, definition: frame.definition,
      aliases: { backpack: 'backpack', hotbar: 'hotbar', equipment: 'equipment', crafting: 'crafting',
        entity: retainedEntityContainer(frame.definition) },
      registry, state: this.activeContentFrameState(), timing: this.model.activeFrameTiming, progress: this.model.activeFrameProgress,
      backpackCapacity: modelBackpackCapacity(this.model),
      ...(this.model.openEntityCapacity === undefined ? {} : { entityCapacity: this.model.openEntityCapacity }),
      filter: this.inventoryFilterText, recipeFilter: this.recipeFilterText, artwork: this.retainedArtwork!,
      // The paper doll shows the wearer with the same painter as the character screen.
      portrait: (context, bounds) => { const appearance = this.model.character?.appearance; if (appearance) this.drawPlayerDoll(context, appearance, 'down', bounds); },
      selectedHotbar: this.model.selectedSlot,
      ...(this.openWindowValue === 'crafting' ? { crafting: {
        recipes: this.recipeBookEntries().map(entry => ({ id: entry.recipeId,
          label: this.itemDefinition(entry.outputKind)?.displayName ?? entry.outputKind,
          detail: entry.requiredStation === null ? undefined : this.craftingStationLabel(entry.requiredStation),
          output: { itemKind: entry.outputKind, quantity: entry.outputQuantity },
          status: !entry.skillAvailable ? 'locked' as const : !entry.stationAvailable ? 'station' as const : entry.missingIngredients ? 'missing' as const : 'ready' as const,
          // Why a recipe cannot be placed, shown on its page (touch has no hover).
          reason: !entry.skillAvailable ? sentenceCaseRequirement(this.recipeSkillRequirement(entry.recipeId) ?? 'Recipe requirements not met')
            : !entry.stationAvailable && entry.requiredStation !== null ? sentenceCaseRequirement(this.craftingStationRequirement(entry.requiredStation)) : undefined,
          ingredients: entry.ingredients.map(ingredient => ({ ...ingredient, name: this.itemDefinition(ingredient.itemKind)?.displayName ?? ingredient.itemKind })) })),
        selected: this.selectedCraftingRecipeId, pattern: (pattern ?? []).map(stack => stack?.itemKind ?? null),
        output: this.recipeOutput(recipeId ?? ''),
        requirement: this.currentRecipeLocked() ? this.craftResultRequirement() ?? 'RECIPE REQUIREMENTS NOT MET' : undefined,
      } } : {}),
    });
  }
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
  /** The host's item slots (the gesture source's cells) by container and index, each made on first lookup, so no
   * container has a fixed length (Uncapped Storage). Every authored frame shares the one placeable container: slot
   * meaning, ordering, restrictions and visibility come from the active definition. */
  private readonly itemSlots = new ItemSlotTable((container, index) => {
    const slot = new ItemSlot(itemSlotNodeId(container, index), container, index,
      container === 'equipment' ? EQUIPMENT_SLOT_RESTRICTIONS[index] : undefined);
    // Shown only once a window lays it out.
    slot.visible = false;
    return this.syncItemSlot(slot);
  });
  /** The model's stacks by container and cell, and the item rules, as of the last update. */
  private itemRows = modelItemRows({ inventory: [] });
  private itemSlotContent: ItemContainerContentResolver = BOOTSTRAP_ITEM_CONTAINER_CONTENT;
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
  private helpBook: HelpBook | null = null;
  private readonly inventoryScrollBar: ScrollBar;
  private readonly craftingRecipeScrollBar: ScrollBar;
  private readonly inventoryFilterInput: HTMLInputElement | null;
  private readonly recipeFilterInput: HTMLInputElement | null;
  private readonly watchStatusOutput: HTMLElement | null;
  private inventoryFilterText = '';
  private recipeFilterText = '';
  private selectedCraftingRecipeId: string | null = null;
  /** The pattern the authority last confirmed; a refused placement falls back to it (BUG-037). */
  private confirmedCraftingRecipeId: string | null = null;
  private craftingPlacementSequence = 0;
  /** Placements numbered below this were sent before the selection was dismissed or the window closed;
   * their late answers must not bring the dismissed pattern back. */
  private craftingPlacementFloor = 0;
  private readonly currencyDisplay: CurrencyDisplay;
  private readonly playerResourceFrame: PlayerResourceFrame;
  private readonly targetResourceFrame: PlayerResourceFrame;
  private characterScreen: CharacterScreen | null = null;
  private skillTree: SkillTreeUi | null = null;
  private statisticsScreen: StatisticsScreen | null = null;
  private questLog: QuestLog | null = null;
  private readonly ferryMenu:FerryMenu;
  private readonly outdoorRewards:OutdoorRewards;
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
  /** The hovered HUD slot as a selected-slot value: a hotbar index or `MAIN_HAND_SELECTED_SLOT`. */
  private hoveredSlot: number | null = null;
  private inventoryTouchStart: UiPoint | null = null;
  private readonly equipmentTooltipDwell = new EquipmentTooltipDwell();
  /** The inventory gesture state machine (kit `UiSlotGestures`), shared by the retained kit menus and this host's own
   * hit-tested slots. It reads the predicted slots below and changes them only through these reducer callbacks. */
  private readonly slotGestures = new UiSlotGestures({
    cursor: () => this.heldCursorStack(),
    has: ref => this.itemSlotFor(ref) !== null,
    stack: ref => this.itemSlotFor(ref)?.item ?? null,
    accepts: (ref, itemKind) => this.itemSlotFor(ref)?.accepts(itemKind) ?? false,
    maxStack: itemKind => this.maxStackFor(itemKind),
    quickMoveSources: container => this.quickMoveSourceContainers(container),
    slotAt: point => this.itemSlotRef(this.inventoryItemSlotAt(point)),
  }, {
    click: (ref, button) => {
      // Only a drop (a held stack placed) flashes when the server refuses it, not a pickup.
      const dropping = this.heldCursorStack() !== null;
      if (!this.predictCursorClick(ref, button)) return false;
      this.trackInventoryPrediction(this.callbacks.inventoryCursorClick(ref.container, ref.index, button), dropping ? [ref] : []);
      return true;
    },
    previewSpread: (targets, mode) => this.applyQuickCraftPreview(targets, mode),
    cancelSpread: () => this.cancelQuickCraftPreview(),
    spread: (targets, mode) => {
      if (this.quickCraftPreviewCursor === undefined) { this.cancelQuickCraftPreview(); return; }
      this.promoteQuickCraftPreview();
      this.trackInventoryPrediction(this.callbacks.inventoryCursorQuickCraft(
        targets.map((target) => ({ container: target.container, index: target.index })), mode,
      ), targets);
    },
    quickMove: ref => this.callbacks.quickMoveInventoryItem(ref.container, ref.index, this.quickMoveDestinations(ref.container)),
    quickMoveAll: (itemKind, container) => {
      const sources = this.quickMoveSourceContainers(container), destinations = this.quickMoveDestinations(container);
      this.predictQuickMoveAll(itemKind, sources, destinations);
      this.trackInventoryPrediction(this.callbacks.quickMoveAllInventoryItems(itemKind, sources, destinations));
    },
    collect: () => {
      if (this.predictPickupAll()) this.trackInventoryPrediction(this.callbacks.inventoryCursorPickupAll(this.visibleContainerOrder()));
    },
    drop: button => { if (this.predictCursorDrop(button)) this.trackInventoryPrediction(this.callbacks.dropInventoryCursor(button)); },
    return: () => { this.cancelQuickCraftPreview(); this.clearOptimisticMenu(); this.callbacks.returnInventoryCursor(); },
  });
  private readonly quickCraftOriginalItems = new Map<ItemSlot, ItemStack | null>();
  private readonly quickCraftPreviewItems = new Map<ItemSlot, ItemStack | null>();
  private quickCraftOriginalCursor: ItemStack | null = null;
  private quickCraftPreviewCursor: ItemStack | null | undefined;
  private readonly optimisticMenuItems = new Map<ItemSlot, ItemStack | null>();
  private optimisticMenuCursor: ItemStack | null | undefined;
  private optimisticMenuStartedAt: number | null = null;
  private clickStartedAt = Number.NEGATIVE_INFINITY;
  private openWindowValue: OverworldWindow | null = null;
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
    private readonly drawPlayerHead: (context: CanvasRenderingContext2D, playerId: string, rect: UiRect) => void = () => undefined,
    private readonly drawTargetPortrait: (context: CanvasRenderingContext2D, target: OverworldUiTargetVitals, rect: UiRect) => void = () => undefined,
    private readonly drawPlayerDoll: (context: CanvasRenderingContext2D, appearance: PlayerAppearanceSelection, facing: Direction, rect: UiRect) => void = () => undefined,
    private readonly drawMinimap: MinimapDrawer = () => undefined,
  ) {
    this.root = widget('root', 'overworld.ui.root');
    this.windowRibbon = new Ribbon(skin.banner, fonts);
    this.zoneRibbon = new Ribbon(skin.banner, fonts);
    this.ferryMenu=new FerryMenu(skin,fonts,(from,to)=>this.callbacks.travelHearthFerry?.(from,to)??Promise.reject(new Error('ferry_unavailable')),
      ()=>{if(this.openWindowValue==='ferry')this.openWindow=null;},()=>this.model.contentRegistry);
    this.outdoorRewards=new OutdoorRewards(skin,fonts,id=>this.callbacks.claimOutdoorReward?.(id)??Promise.reject(new Error('reward_unavailable')),
      (context,rect,kind)=>this.drawInventoryItem(context,rect,kind,1));
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
        this.callbacks.selectHotbar(MAIN_HAND_SELECTED_SLOT);
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
      this.backpackSortNode,
      this.chestSortNode,
      this.barrelSortNode,
      this.resumeNode,
      this.delveConfirmButton.node,
      this.delveCancelButton.node,
      this.exitDelveNode,
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
    // Every inventory window is the kit's (BUG-067, item slot S9): the retained inventory exists from the start; the
    // host hands it the kit art when it has loaded (enableRetainedInventory).
    this.createRetainedInventory();
  }

  openFerry(source:HearthFerryDock):void {this.ferryMenu.open(source);this.openWindow='ferry';}
  get openWindow(): OverworldWindow | null { return this.openWindowValue; }
  get activeSkillTrack(): SkillTrack { return this.skillTree?.selectedTrack ?? 'explorer'; }
  private selectLightingMode(mode: LightingSettingsMode): void {
    if (mode !== 'basic') this.callbacks.setLightingModel?.(mode === 'dynamic' ? 'unified' : 'classic');
    this.callbacks.setLightingQuality?.(mode === 'basic' ? 'basic' : 'dynamic');
  }

  get selectedSettingsTab(): SettingsTab { return this.systemMenus?.selectedSettingsTab ?? this.settingsTab; }
  get selectedDeveloperTab(): DeveloperTab { return this.systemMenus?.selectedDeveloperTab ?? this.developerTab; }
  get blockingUpdatePromptVisible(): boolean {
    return this.updateReady?.active ?? (this.model.pwaUpdateStatus === 'available' && !this.updatePromptDismissed);
  }

  /** Service-worker events must make their modal interactive immediately,
   * including while the world render loop is paused in a background tab. */
  setPwaUpdateStatus(status: PwaUpdateStatus, viewport?: { readonly width: number; readonly height: number }): void {
    const previous = this.model.pwaUpdateStatus;
    this.model = { ...this.model, ...viewport, pwaUpdateStatus: status };
    this.syncPwaUpdatePrompt(previous);
    this.syncRetainedOverlays();
    this.syncRetainedSystem();
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
    return this.gameHud?.minimapBounds ?? (this.minimapCollapsed ? this.layout.collapsedMinimapTab : this.layout.minimap);
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
    if (!this.questLog?.select(questId)) return false;
    this.openWindow = 'quests';
    return true;
  }

  openSkillTrack(track: SkillTrack): void {
    this.skillTree?.selectTrack(track);
    this.openWindow = 'skills';
  }
  set openWindow(window: OverworldWindow | null) {
    const previousWindow = this.openWindowValue;
    const requestedWindow = window === 'pack' ? 'inventory' : window;
    const nextWindow = requestedWindow === 'developer' && !this.model.canAdministerWorld ? 'system' : requestedWindow;
    if (nextWindow !== this.openWindowValue) {
      this.slotSession++;
      this.inventoryTouchStart = null;
      this.inventoryScrollBar.cancelSwipe();
    }
    if (this.openWindowValue === 'chest' && nextWindow !== 'chest') this.callbacks.closeChest();
    if ((this.openWindowValue === 'content' || this.openWindowValue === 'barrel' || this.openWindowValue === 'furnace' || this.openWindowValue === 'cooking'
      || this.openWindowValue === 'press' || this.openWindowValue === 'fermentation')
      && nextWindow !== this.openWindowValue) this.callbacks.closePlaceable();
    if (this.openWindowValue === 'crafting' && nextWindow !== 'crafting') {
      this.dismissCraftingRecipe();
      this.callbacks.closeCrafting();
    }
    if (this.isInventoryWindow(this.openWindowValue) && !this.isInventoryWindow(nextWindow)) {
      this.slotGestures.cancel();
      this.clearOptimisticMenu();
      this.callbacks.returnInventoryCursor();
    }
    if (nextWindow === 'help' && this.openWindowValue !== 'help') this.helpBook?.reset();
    this.openWindowValue = nextWindow;
    this.syncActiveWindow();
    if (previousWindow !== nextWindow) {
      if (nextWindow === 'skills') this.contained('skills', () => this.skillTree?.focus());
      if (nextWindow === 'character') this.contained('character', () => this.characterScreen?.focus());
      if (nextWindow === 'statistics') this.contained('statistics', () => this.statisticsScreen?.focus());
      if (nextWindow === 'quests') this.contained('quests', () => this.questLog?.focus());
      if (nextWindow === 'help') this.contained('help', () => this.helpBook?.focus());
    }
  }

  update(model: OverworldUiModel): void {
    const previousUpdateStatus = this.model.pwaUpdateStatus;
    this.model = model;
    this.itemSlotContent = this.itemContainerContent();
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
    this.questLog?.update(model.quests ?? []);
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
      && mainHandRow(model.inventory) !== undefined;
    this.itemRows = modelItemRows(model);
    for (const slot of this.itemSlots.all()) this.syncItemSlot(slot);
    this.backpackSortNode.setBounds(this.openWindowValue === 'chest'
      ? this.layout.chestBackpackSortButton : this.layout.inventorySortButton);
    this.chestSortNode.setBounds(this.layout.chestSortButton);
    this.barrelSortNode.setBounds(this.layout.barrelSortButton);
    for (const node of [this.backpackSortNode, this.chestSortNode, this.barrelSortNode]) {
      node.enabled = model.cursorStack === null || model.cursorStack === undefined;
    }
    this.reconcileOptimisticMenu();
    const press = this.slotGestures.press;
    if (press?.cursorWasHeld && press.targets.length > 0) this.applyQuickCraftPreview(press.targets, press.button === 'right' ? 'one_each' : 'even');
    this.resumeNode.setBounds(this.layout.resumeButton);
    this.delveConfirmButton.setBounds(this.layout.delveConfirmButton);
    this.delveCancelButton.setBounds(this.layout.delveCancelButton);
    this.exitDelveNode.setBounds(this.layout.exitDelveButton);
    this.helpNode.setBounds(this.layout.helpButton);
    this.settingsNode.setBounds(this.layout.settingsButton);
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
    // Storage and authored entity frames search with the kit pane's own filter (BUG-067).
    return null;
  }

  private inventorySlotMatchesSearch(slot: ItemSlot): boolean {
    const query = this.inventoryFilterText.trim().toLowerCase();
    if (!query) return true;
    if (slot.item === null) return false;
    return slot.item.itemKind.toLowerCase().includes(query)
      || (this.itemDefinition(slot.item.itemKind)?.displayName.toLowerCase().includes(query) ?? false);
  }


  /** Reads a slot's cell from the model: its stack, whether the cell is open, the item rules and its place in the
   * legacy host layout. Update runs this for every slot made so far, and a new slot runs it when it is made. */
  private syncItemSlot(slot: ItemSlot): ItemSlot {
    const { containerId: container, index } = slot;
    slot.setContentResolver(this.itemSlotContent);
    slot.enabled = this.itemCellOpen(container, index);
    slot.item = this.itemRows[container].get(index) ?? null;
    // An entity cell's restriction comes from the open frame's binding, set whenever the frame lays it out.
    if (container === 'placeable') slot.setRestriction(undefined);
    const bounds = this.legacyItemSlotBounds(container, index);
    if (bounds) slot.setBounds(bounds);
    return slot;
  }

  /** Whether a cell holds items: the backpack up to its accessible capacity, the player's fixed containers' cells, and
   * every cell of an open chest, station or stash (their frames bind the cells they have). */
  private itemCellOpen(container: InventoryContainerId, index: number): boolean {
    if (container === 'backpack') return index < modelBackpackCapacity(this.model);
    if (container === 'hotbar' || container === 'equipment' || container === 'crafting') return index < inventoryContainerSlotCount(container);
    return true;
  }

  /** A cell's place in the legacy host layout, where it has one. */
  private legacyItemSlotBounds(container: InventoryContainerId, index: number): UiRect | undefined {
    switch (container) {
      case 'hotbar': return this.layout.inventoryHotbarSlots[index];
      case 'backpack': return this.layout.backpackSlots[index];
      case 'equipment': return this.layout.equipmentSlots[EQUIPMENT_SLOTS.findIndex(slot => slot.index === index)];
      case 'crafting': return this.layout.craftingSlots[index];
      case 'chest': return this.layout.chestSlots[index];
      default: return this.layout.inventoryWindow;
    }
  }

  /** The cells the host's own frame-less windows hit-test (the host draws none of them): the player's fixed
   * containers; every open backpack cell, and at least the legacy grid; every stack of an open chest or station, and at
   * least the legacy grid or pool. */
  private hostSlots(container: InventoryContainerId): ItemSlot[] {
    if (container === 'equipment') return EQUIPMENT_SLOTS.map(({ index }) => this.itemSlots.slot('equipment', index));
    if (container === 'hotbar' || container === 'crafting') return this.itemSlots.range(container, inventoryContainerSlotCount(container));
    if (container === 'backpack') return this.itemSlots.range('backpack', Math.max(modelBackpackCapacity(this.model), this.layout.backpackSlots.length));
    let cells = container === 'chest' ? this.layout.chestSlots.length : container === 'placeable' ? CHEST_STORAGE_CAPACITY : 0;
    for (const index of this.itemRows[container].keys()) cells = Math.max(cells, index + 1);
    return this.itemSlots.range(container, cells);
  }

  private filteredInventoryBackpackSlots(): ItemSlot[] {
    return this.itemSlots.range('backpack', modelBackpackCapacity(this.model)).filter(slot => this.inventorySlotMatchesSearch(slot));
  }

  private syncInventoryBackpackSlots(): void {
    const scrollable = this.openWindowValue === 'inventory'
      || this.openWindowValue === 'furnace'
      || this.openWindowValue === 'cooking'
      || this.openWindowValue === 'press'
      || this.openWindowValue === 'fermentation';
    if (!scrollable) return;
    const slots = this.openWindowValue === 'inventory'
      ? this.filteredInventoryBackpackSlots()
      : this.itemSlots.range('backpack', modelBackpackCapacity(this.model));
    const columns = this.layout.inventoryBackpackColumns;
    this.inventoryScrollBar.setMetrics(Math.ceil(slots.length / columns), INVENTORY_BACKPACK_VISIBLE_ROWS);
    this.inventoryScrollBar.setBounds(this.layout.inventoryBackpackScroll);
    const first = this.inventoryScrollBar.position * columns;
    for (const slot of this.itemSlots.made('backpack')) slot.visible = false;
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
    for (const slot of this.itemSlots.made('backpack')) slot.visible = false;
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
      if (this.updateReady) return true;
      if (code === 'Escape') {
        this.updatePromptDismissed = true;
        this.updatePromptNode.visible = false;
      } else if (code === 'Enter' || code === 'Space') this.callbacks.applyClientUpdate();
      return true;
    }
    if(this.openWindowValue==='ferry'&&this.ferryMenu.key(code))return true;
    if(this.openWindowValue==='outdoor-rewards'&&this.outdoorRewards.handleKeyDown(code,this.layout.progressionWindow))return true;
    if (!this.systemMenus && this.openWindowValue === 'settings' && (code === 'ArrowUp' || code === 'ArrowDown')) {
      const current = SETTINGS_TABS.indexOf(this.settingsTab);
      const delta = code === 'ArrowUp' ? -1 : 1;
      this.settingsTab = SETTINGS_TABS[(current + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length]!;
      this.syncActiveWindow();
      return true;
    }
    if (!this.systemMenus && this.openWindowValue === 'settings' && this.settingsTab === 'gameplay' && code === 'KeyN') {
      this.nameplatesToggle.toggle();
      return true;
    }
    if (!this.systemMenus && this.openWindowValue === 'developer' && (code === 'ArrowUp' || code === 'ArrowDown')) {
      const current = DEVELOPER_TABS.indexOf(this.developerTab);
      const delta = code === 'ArrowUp' ? -1 : 1;
      this.developerTab = DEVELOPER_TABS[(current + delta + DEVELOPER_TABS.length) % DEVELOPER_TABS.length]!;
      this.syncActiveWindow();
      return true;
    }
    if (!this.delveConfirmation && this.openWindowValue === 'delve-confirmation'
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

  pointerMove(point: UiPoint, _modifiers: { readonly shift?: boolean } = {}): void {
    if ((this.retainedConfirmationActive || this.retainedInventoryActive || this.retainedReadingActive || this.retainedCharacterActive || this.retainedSystemActive) && !this.blockingUpdatePromptVisible) {
      this.systemCursorMove(point);
      return;
    }
    void _modifiers;
    this.systemCursorMove(point);
    if (this.blockingUpdatePromptVisible) return;
    if(this.openWindowValue==='outdoor-rewards')this.outdoorRewards.pointerMove(point,this.layout.progressionWindow);
    if ((this.openWindowValue === 'inventory' || this.openWindowValue === 'furnace'
      || this.openWindowValue === 'cooking' || this.openWindowValue === 'press'
      || this.openWindowValue === 'fermentation')
      && this.inventoryScrollBar.pointerMove(point)) this.syncInventoryBackpackSlots();
    if (this.openWindowValue === 'crafting') this.craftingRecipeScrollBar.pointerMove(point);
    if (this.inventoryTouchStart !== null) {
      const dx = point.x - this.inventoryTouchStart.x;
      const dy = point.y - this.inventoryTouchStart.y;
      // Resolve horizontal intent before the scrollbar sees a diagonal move.
      // Once pickup owns this gesture, later vertical movement cannot steal it.
      if (Math.abs(dx) > Math.abs(dy)
        && dx * dx + dy * dy >= INVENTORY_DRAG_START_DISTANCE * INVENTORY_DRAG_START_DISTANCE) {
        this.inventoryTouchStart = null;
        this.inventoryScrollBar.cancelSwipe();
      }
    }
    const inventorySwiped = this.inventoryScrollBar.swipeMove(point, 31);
    if (inventorySwiped) this.syncInventoryBackpackSlots();
    const recipesSwiped = this.craftingRecipeScrollBar.swipeMove(point, 17);
    if (inventorySwiped || recipesSwiped) {
      this.inventoryTouchStart = null;
      this.pendingTouchRecipeId = null;
      this.slotGestures.cancel();
      return;
    }
    const slotNodes = this.openWindowValue === 'inventory' ? this.hostSlots('hotbar').map((slot) => slot.node) : this.hotbarNodes;
    this.hoveredSlot = slotNodes.findIndex((node) => node.contains(point));
    if (this.hoveredSlot < 0) this.hoveredSlot = null;
    if (this.openWindowValue === null && this.weaponShortcutNode.visible && this.weaponShortcutNode.contains(point)) this.hoveredSlot = MAIN_HAND_SELECTED_SLOT;
    // Pickup starts at 3 logical pixels, before the scrollbar's 4-pixel swipe
    // threshold. Keep vertical/tied touch movement pending until scrolling
    // takes ownership; a release below that threshold remains an ordinary tap.
    if (this.inventoryTouchStart !== null) return;
    this.slotGestures.move(point, this.itemSlotRef(this.inventoryItemSlotAt(point)));
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
    if ((this.retainedConfirmationActive || this.retainedInventoryActive || this.retainedReadingActive || this.retainedCharacterActive || this.retainedSystemActive) && !this.blockingUpdatePromptVisible) {
      this.systemCursorDown(point);
      return true;
    }
    this.inventoryTouchStart = null;
    this.inventoryScrollBar.cancelSwipe();
    const skillPointNotice = this.retainedFeedback ? null : this.skillPointNoticeLayout();
    if (!this.blockingUpdatePromptVisible && button === 0
      && skillPointNotice !== null && containsPoint(skillPointNotice.frame, point)) {
      if (!containsPoint(skillPointNotice.dismiss, point)) this.openSkillTrack(this.model.skillPointNotice!.track);
      this.callbacks.dismissSkillPointNotice?.();
      return true;
    }
    this.systemCursorDown(point);
    if (this.blockingUpdatePromptVisible) {
      if (this.updateReady) return true;
      if (button === 0) this.router.routePointer({ kind: 'pointer_down', point, button });
      return true;
    }
    const clickedCraftingRecipe = this.openWindowValue === 'crafting' && button === 0
      ? this.craftingRecipeEntryAt(point)
      : undefined;
    if (this.openWindowValue === 'crafting' && this.selectedCraftingRecipeId !== null
      && (button === 0 || button === 2) && clickedCraftingRecipe === undefined && !containsPoint(this.layout.craftingResult,point)) {
      this.dismissCraftingRecipe();
    }
    if (button === 0) {
      if (this.openWindowValue === 'inventory' || this.openWindowValue === 'furnace'
        || this.openWindowValue === 'cooking' || this.openWindowValue === 'press'
        || this.openWindowValue === 'fermentation') {
        if (this.inventoryScrollBar.beginSwipe(point, this.layout.inventoryBackpackViewport, modifiers.pointerType)) {
          this.inventoryTouchStart = point;
        }
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
    if (button === 0 && (this.openWindowValue === 'inventory' || this.openWindowValue === 'furnace'
      || this.openWindowValue === 'cooking' || this.openWindowValue === 'press'
      || this.openWindowValue === 'fermentation') && this.inventoryScrollBar.pointerDown(point)) {
      this.syncInventoryBackpackSlots();
      return true;
    }
    if (button === 0 && this.openWindowValue === 'crafting'
      && this.craftingRecipeScrollBar.pointerDown(point)) return true;
    if (!this.gameHud && this.openWindowValue === null && this.model.vitals !== undefined
      && containsPoint(this.layout.vitals, point)) {
      if (button === 0) this.openWindow = 'character';
      return true;
    }
    if (!this.gameHud && this.openWindowValue === null && this.model.targetVitals !== undefined
      && containsPoint(this.layout.targetVitals, point)) return true;
    if(this.openWindowValue==='ferry'&&!containsPoint(this.closeNode.bounds,point)
      &&this.ferryMenu.pointerDown(point,button,this.layout.progressionWindow))return true;
    if(this.openWindowValue==='outdoor-rewards'&&!containsPoint(this.closeNode.bounds,point)
      &&this.outdoorRewards.pointerDown(point,button,this.layout.progressionWindow,modifiers.pointerType))return true;
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
        return this.slotGestures.begin(this.itemSlotRef(slot)!, point, button, { shift: modifiers.shift === true });
      }
      if ((button === 0 || button === 2) && this.heldCursorStack() != null) {
        this.slotGestures.pressOutside(button);
        return true;
      }
    }
    return this.router.routePointer({ kind: 'pointer_down', point, button });
  }

  pointerUp(point: UiPoint, button: number, modifiers: { readonly shift?: boolean } = {}): boolean {
    if ((this.retainedConfirmationActive || this.retainedInventoryActive || this.retainedReadingActive || this.retainedCharacterActive || this.retainedSystemActive) && !this.blockingUpdatePromptVisible) {
      return true;
    }
    this.inventoryTouchStart = null;
    this.pointer = point;
    if (this.blockingUpdatePromptVisible) {
      if (this.updateReady) return true;
      this.router.routePointer({ kind: 'pointer_up', point, button });
      return true;
    }
    const inventorySwipeConsumed = this.inventoryScrollBar.endSwipe();
    const recipeSwipeConsumed = this.craftingRecipeScrollBar.endSwipe();
    const touchSwipeConsumed = inventorySwipeConsumed || recipeSwipeConsumed;
    if (touchSwipeConsumed) {
      this.pendingTouchRecipeId = null;
      this.slotGestures.cancel();
      return true;
    }
    if (this.pendingTouchRecipeId !== null) {
      const recipeId = this.pendingTouchRecipeId;
      this.pendingTouchRecipeId = null;
      this.selectCraftingRecipe(recipeId);
      return true;
    }
    if(this.openWindowValue==='outdoor-rewards'&&this.outdoorRewards.pointerUp())return true;
    if (this.inventoryScrollBar.pointerUp()) return true;
    if (this.craftingRecipeScrollBar.pointerUp()) return true;
    if (this.slotGestures.finish(point, modifiers.shift === true, containsPoint(this.activeWindowRect(), point))) return true;
    const consumed = this.router.routePointer({ kind: 'pointer_up', point, button });
    return this.timeSlider.pointerUp(point)
      || this.touchBottomOffsetSlider.pointerUp(point)
      || this.masterSlider.pointerUp(point)
      || this.musicSlider.pointerUp(point)
      || this.sfxSlider.pointerUp(point)
      || consumed;
  }

  pointerLeave(): void {
    this.inventoryTouchStart = null;
    this.systemCursorLeave();
    this.hoveredSlot = null;
    this.slotGestures.cancel();
    this.timeSlider.pointerLeave();
    this.touchBottomOffsetSlider.pointerLeave();
    this.masterSlider.pointerLeave();
    this.musicSlider.pointerLeave();
    this.sfxSlider.pointerLeave();
    this.outdoorRewards.pointerLeave();
    this.inventoryScrollBar.pointerLeave();
    this.craftingRecipeScrollBar.pointerLeave();
    this.pendingTouchRecipeId = null;
  }

  wheel(point: UiPoint, deltaX: number, deltaY: number): boolean {
    if (this.blockingUpdatePromptVisible) return true;
    if(this.openWindowValue==='outdoor-rewards'&&this.outdoorRewards.wheel(point,deltaY,this.layout.progressionWindow))return true;
    if (this.retainedInventoryActive || this.retainedReadingActive || this.retainedCharacterActive || this.retainedSystemActive) return true;
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
    if (this.gameHud) return false;
    if (button !== 0 || !this.buildNode.visible || !this.buildNode.contains(point)) return false;
    this.callbacks.toggleBuild?.();
    return true;
  }

  drawBuildControl(context: CanvasRenderingContext2D): void {
    if (this.gameHud) return;
    if (this.buildNode.visible) {
      const rect = this.layout.buildButton;
      this.drawHudIconButton(context, rect, this.buildNode.contains(this.pointer), this.itemArt.hammer);
    }
  }

  drawCraftingControl(context: CanvasRenderingContext2D): void {
    if (this.gameHud) return;
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

  drawHud(context: CanvasRenderingContext2D): void {
    if (this.gameHud) this.gameHud.draw(context);
    else {
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
    }
  }

  draw(context: CanvasRenderingContext2D, includeHud = true): void {
    if (includeHud) this.drawHud(context);
    if (this.openWindowValue === 'help') this.helpBook?.draw(context);
    else if (this.openWindowValue) {
      if (!this.delveConfirmation && this.openWindowValue === 'delve-confirmation') {
        context.save();
        context.fillStyle = 'rgba(20, 14, 19, 0.68)';
        context.fillRect(0, 0, this.model.width, this.model.height);
        context.restore();
      }
      this.drawWindow(context, this.openWindowValue);
    }
    if (!this.retainedFeedback) {
      if (this.openWindowValue === null || this.openWindowValue === 'system'
        || this.isInventoryWindow(this.openWindowValue)) this.drawTooltip(context);
      this.drawNotification(context);
      this.drawSkillPointNotice(context);
    }
  }

  /** Final UI pass so an update decision cannot sit behind another modal. */
  drawBlockingOverlay(context: CanvasRenderingContext2D): void {
    if (this.updateReady) { this.updateReady.draw(context); return; }
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

  /** Drawn by the scene after every window and overlay. The system cursor is
   * intentionally the final UI composite and therefore cannot be occluded. */
  drawCursorOverlay(context: CanvasRenderingContext2D): void {
    // The scene restores the native cursor while the blocking update is shown.
    if (this.blockingUpdatePromptVisible) return;
    // The held stack is the kit's uiHeldStack, composited just under the cursor.
    if (this.isInventoryWindow(this.openWindowValue)) this.retainedMenus?.drawHeldStack(context, this.pointer, this.model.width, this.model.height);
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
      if (item.container === 'hotbar' && Number.isInteger(item.index) && item.index >= 0 && item.index < HOTBAR_SLOT_COUNT) this.hudHotbarItems[item.index] = item;
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
    const systemVisible = !this.systemMenus && this.openWindowValue === 'system';
    const settingsVisible = !this.systemMenus && this.openWindowValue === 'settings';
    const developerVisible = !this.systemMenus && this.openWindowValue === 'developer' && this.model.canAdministerWorld;
    this.windowNode.setBounds(activeWindow);
    this.windowNode.visible = this.openWindowValue !== null;
    this.closeNode.setBounds({ x: activeWindow.x + activeWindow.width - 17, y: activeWindow.y + 7, width: 16, height: 16 });
    // The legacy frame-less windows' cells, placed on the legacy layout; every other slot is hidden.
    for (const container of ['hotbar', 'backpack', 'equipment', 'crafting', 'chest'] as const) this.hostSlots(container);
    const hotbarRects = chestVisible ? this.layout.chestHotbarSlots : this.layout.inventoryHotbarSlots;
    const backpackRects = craftingVisible ? this.layout.craftingInventorySlots
      : chestVisible ? this.layout.chestBackpackSlots : this.layout.backpackSlots;
    for (const slot of this.itemSlots.all()) {
      const rect = slot.containerId === 'hotbar' ? hotbarRects[slot.index] : slot.containerId === 'backpack' ? backpackRects[slot.index] : undefined;
      if (rect) slot.setBounds(rect);
      slot.visible = slot.containerId === 'hotbar' ? rect !== undefined && (inventoryVisible || craftingVisible || chestVisible || barrelVisible
          || furnaceVisible || cookingVisible || pressVisible || fermentationVisible)
        : slot.containerId === 'backpack' ? rect !== undefined && (inventoryVisible || craftingVisible || chestVisible || furnaceVisible
          || cookingVisible || pressVisible || fermentationVisible)
          : slot.containerId === 'equipment' ? inventoryVisible
            : slot.containerId === 'crafting' ? craftingVisible
              : slot.containerId === 'chest' && chestVisible;
    }
    this.backpackSortNode.visible = inventoryVisible || craftingVisible || chestVisible;
    this.backpackSortNode.setBounds(chestVisible
      ? this.layout.chestBackpackSortButton
      : craftingVisible ? this.layout.craftingBackpackSortButton : this.layout.inventorySortButton);
    this.chestSortNode.visible = chestVisible;
    this.barrelSortNode.visible = barrelVisible;
    this.delveConfirmButton.node.visible = delveConfirmationVisible;
    this.delveCancelButton.node.visible = delveConfirmationVisible;
    for (const node of [this.resumeNode, this.helpNode, this.settingsNode, this.fullscreenNode, this.signOutNode, this.quitNode]) {
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
    if (this.activeContentFrame() !== null) for (const slot of this.itemSlots.all()) slot.visible = false;
    this.applyContentFrameBindings();
    // Each retained view syncs on its own: one broken view never stops the others (BUG-063).
    this.contained('inventory', () => this.syncRetainedInventory());
    this.contained('reading', () => this.syncRetainedReading());
    this.contained('overlays', () => this.syncRetainedOverlays());
    this.contained('hud', () => this.syncRetainedHud());
    this.contained('character', () => this.syncRetainedCharacter());
    this.contained('system', () => this.syncRetainedSystem());
    if (this.retainedReadingActive || this.retainedCharacterActive || this.retainedSystemActive) { this.windowNode.visible = false; this.closeNode.visible = false; }
    else this.closeNode.visible = true;
    if (this.retainedInventoryActive) {
      if (this.inventoryFilterInput) { this.inventoryFilterInput.hidden = true; this.inventoryFilterInput.blur(); }
      if (this.recipeFilterInput) { this.recipeFilterInput.hidden = true; this.recipeFilterInput.blur(); }
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
    const craftingBackpack = craftingSurface ? this.filteredInventoryBackpackSlots() : [];
    for (const pane of frame.panes) {
      if (!contentFramePaneVisible(pane.definition, state)) continue;
      pane.slots.forEach((binding, visualIndex) => {
        // Bindings name their container by the frame's aliases, so a chest frame's entity cells are the chest's.
        const slot = this.itemSlots.find(binding.containerId, binding.index);
        if (slot === null) return;
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
        // The authority's rules only (BUG-050): equipment rules on equipment, none on other self panes.
        slot.setRestriction(frameSlotAuthorityRestriction(pane.definition, binding));
        slot.visible = true;
      });
    }
    const hotbar = this.hostSlots('hotbar');
    frame.storage.hotbar?.slots.forEach((rect, index) => {
      const slot = hotbar[index];
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
    const item=mainHandRow(this.model.inventory);
    if (item===undefined) return;
    const rect=this.layout.weaponShortcut;
    drawUiInventorySlotBacking(context,this.skin,rect,item.itemKind);
    const asset=overworldItemArtwork(this.itemArt,item.itemKind,this.model.contentRegistry);
    if (asset!==undefined) this.drawItemArtwork(context,rect,item.itemKind,asset);
    if (isMainHandSelectedSlot(this.model.selectedSlot) || (this.hoveredSlot!==null && isMainHandSelectedSlot(this.hoveredSlot))) {
      drawUiSkinAsset(context,isMainHandSelectedSlot(this.model.selectedSlot) ? this.skin.selectorConfirm : this.skin.selectorNeutral,hotbarReticleRect(rect),'idle');
    }
    drawLabel(context,this.fonts,'V',rect.x+3,rect.y+3,{color:'#51351f'});
    this.drawDurabilityBar(context,rect,item.itemKind,item.durability);
  }

  private drawHotbar(context: CanvasRenderingContext2D): void {
    const itemBySlot = new Map(this.model.inventory
      .filter(item => item.container === 'hotbar' && isOccupiedCell(item))
      .map(item => [item.index, item]));
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
    if (this.gameHud && !this.isInventoryWindow(this.openWindowValue)) return;
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

  tooltipText(): string | null {
    if (this.retainedInventoryActive) return this.retainedMenus!.tooltipAt(this.pointer);
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
    if (this.retainedInventoryActive) return this.retainedMenus!.itemAt(this.pointer);
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
    const hovered = selectedCellRow(this.model.inventory, this.hoveredSlot);
    return hovered && isOccupiedCell(hovered) ? hovered : null;
  }

  private readonly viewFailures = new UiFailureLog();
  /** Runs one retained view's sync or paint. A view that throws (a kit invariant such as a duplicate UI id) is
   * reported once and skipped, so it can't abort the frame, the other windows or the HUD (BUG-063, BUG-066). */
  private contained(view: string, run: () => void): void {
    try { run(); } catch (error) {
      // Development, the lab and tests keep the error hard (BUG-066); production skips the view.
      if (uiFailurePolicy() === 'throw') throw error;
      // Containment is per view group: 'character' covers the character, statistics and skills screens' sync.
      if (this.viewFailures.first(view, error)) reportUiFailure(view, error);
    }
  }

  private drawWindow(context: CanvasRenderingContext2D, window: OverworldWindow): void {
    if (window === 'delve-confirmation' && this.delveConfirmation) { this.delveConfirmation.draw(context); return; }
    if (window === 'skills') { this.contained('skills', () => this.skillTree?.draw(context)); return; }
    if (window === 'character') { this.contained('character', () => this.characterScreen?.draw(context)); return; }
    if (window === 'statistics') { this.contained('statistics', () => this.statisticsScreen?.draw(context)); return; }
    if (this.retainedSystemActive) { this.contained('system', () => this.systemMenus!.draw(context)); return; }
    if (window === 'quests') { this.contained('quests', () => this.questLog?.draw(context)); return; }
    if (this.retainedInventoryActive) {
      this.contained('inventory', () => this.retainedMenus!.draw(context));
      // The existing single cursor/tooltip overlay uses the kit's real bounds.
      for (const slot of this.retainedSlots()) slot.visible = false;
      for (const { element } of this.retainedMenus!.root.entries()) {
        const binding = element.props['binding'] as UiInventorySlotRef | undefined;
        const slot = binding ? this.retainedSlot(binding) : null;
        if (slot) { slot.setBounds(element.rect); slot.visible = element.clip.width > 0 && element.clip.height > 0; }
      }
      return;
    }
    // Inventory, crafting, storage and authored entity windows are the kit's (BUG-067, item slot S9): the host never
    // draws the player's inventory or any item slot itself.
    if (this.isInventoryWindow(window)) return;
    const rect = this.activeWindowRect();
    drawUiSkinAsset(context, this.skin.panelWood, rect);
    drawUiSkinAsset(context, this.skin.panelParchment, { x: rect.x + 10, y: rect.y + 13, width: rect.width - 20, height: rect.height - 23 });
    const title = (window === 'inventory' || window === 'pack' ? 'INVENTORY'
      : window === 'crafting' ? 'CRAFTING'
        : window === 'chest' ? 'CHEST'
          : window === 'barrel' ? 'BARREL'
          : window === 'furnace' ? 'FURNACE'
          : window === 'cooking' ? 'COOKING FIRE'
          : window === 'press' ? 'FRUIT PRESS'
          : window === 'fermentation' ? 'FERMENTATION CASK'
          : window === 'ferry' ? 'ISLAND FERRY'
          : window === 'outdoor-rewards' ? 'EXPEDITION REWARDS'
          : window === 'delve-confirmation' ? 'START DELVE'
          : window === 'settings' ? 'SETTINGS'
            : window === 'developer' ? 'DEVELOPER TOOLS' : SYSTEM_MENU_TITLE);
    this.windowRibbon.draw(context, title, rect.x + rect.width / 2, rect.y - 5);
    drawFantasyButton(context, this.skin, this.fonts, this.closeNode.bounds, {
      tone: 'red', shape: 'square', size: 'small', glyph: 'cross',
      hovered: containsPoint(this.closeNode.bounds, this.pointer), hoverOutline: 'white',
    });
    if(window==='outdoor-rewards')this.outdoorRewards.draw(context,rect);
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



  /** The open surface's live, enabled slot for a ref (the retained frame's bindings, or this host's own slots). */
  private itemSlotFor(ref: UiSlotRef): ItemSlot | null {
    // The retained frame looks slots up by container and index (its slots are all enabled).
    const retained = this.retainedSlotIndex();
    if (retained) return retained.byRef.get(ref.container)?.get(ref.index) ?? null;
    const slot = this.itemSlots.find(ref.container, ref.index);
    return slot !== null && slot.enabled && this.visibleItemSlots().includes(slot) ? slot : null;
  }

  private itemSlotRef(slot: ItemSlot | null): UiSlotRef | null {
    return slot === null ? null : { container: slot.containerId, index: slot.index };
  }

  /** The slot press in progress, with its spread targets as this host's slots (legacy windows mark them). */
  private get cursorPress(): { readonly cursorWasHeld: boolean; readonly targets: readonly ItemSlot[] } | null {
    const press = this.slotGestures.press;
    return press === null ? null : {
      cursorWasHeld: press.cursorWasHeld,
      targets: press.targets.flatMap((target) => this.itemSlotFor(target) ?? []),
    };
  }

  private inventoryItemSlotAt(point: UiPoint): ItemSlot | null {
    if (this.retainedInventoryActive) {
      const target = this.retainedMenus!.slotAt(point);
      const slot = target === null ? null : this.retainedSlot(target.ref);
      if (slot && target) slot.setBounds(target.rect);
      return slot;
    }
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

  /** Icon only, fitted to the kit slot's icon well: the kit slot draws the stack count, wear bar and
   * hotkey itself, the same way on every surface. */
  private drawItemIcon(context: CanvasRenderingContext2D, well: UiRect, itemKind: string, lit?: boolean): void {
    const asset = overworldItemArtwork(this.itemArt, itemKind, this.model.contentRegistry) ?? this.itemArt.missing;
    if (asset) this.drawItemArtwork(context, well, itemKind, asset, lit ?? true, well);
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
    well: UiRect = { x: rect.x + 6, y: rect.y + 6, width: 16, height: 16 },
  ): void {
    const frame = uiAssetFrame(asset, itemIconAnimation(itemKind, this.model.contentRegistry));
    if (!frame) return;
    const scale = Math.min(well.width / frame.width, well.height / frame.height);
    const width = Math.max(1, Math.round(frame.width * scale));
    const height = Math.max(1, Math.round(frame.height * scale));
    const x = Math.round(well.x + (well.width - width) / 2);
    const y = Math.round(well.y + (well.height - height) / 2);
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







  private isInventoryWindow(window: OverworldWindow | null): boolean {
    return window === 'inventory' || window === 'pack' || window === 'crafting' || window === 'content' || window === 'chest' || window === 'barrel' || window === 'furnace' || window === 'cooking' || window === 'press' || window === 'fermentation';
  }

  private visibleItemSlots(): ItemSlot[] {
    if (this.retainedFrame() !== null) return this.retainedSlots();
    // An unreviewed authored frame the host still lays out: the cells its bindings placed.
    if (this.activeContentFrame() !== null) return this.itemSlots.all().filter((slot) => slot.visible);
    const window = this.openWindowValue;
    const entity = window === 'inventory' ? 'equipment' : window === 'crafting' ? 'crafting' : window === 'chest' ? 'chest'
      : window === 'content' || window === 'barrel' || window === 'furnace' || window === 'cooking' || window === 'press'
        || window === 'fermentation' ? 'placeable' : null;
    return entity === null ? [] : [...this.hostSlots(entity), ...this.hostSlots('backpack'), ...this.hostSlots('hotbar')];
  }

  private currentRecipeId(): string | null {
    const grid = { id: 'crafting', capacity: 9, slots: this.hostSlots('crafting').map((slot) => slot.item) };
    const registry=this.model.contentRegistry??bootstrapContentRegistry();
    return runtimeMatchingRecipeId(registry,grid,grid.capacity,this.selectedCraftingRecipeId,this.model.knownRecipeIds??[],
      recipe=>(recipe.station===undefined||(this.model.nearbyCraftingStations??[]).includes(recipe.station))
        &&runtimeRecipeSkillSatisfied(registry,recipe.id,this.recipeSkillRanks()));
  }

  private itemDefinition(itemKind: string) {
    return overworldItemDefinition(itemKind, this.model.contentRegistry);
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

  /** Why the crafting result can't be taken: an unlearned recipe, a station out of reach or a missing skill rank. */
  private craftResultRequirement(): string | null {
    if (this.currentRecipeKnowledgeMissing()) return 'LEARN THIS RECIPE FIRST';
    const station = this.recipeDefinition(this.currentRecipeId() ?? '')?.station;
    if (station !== undefined && !(this.model.nearbyCraftingStations ?? []).includes(station)) return this.craftingStationRequirement(station);
    return this.recipeSkillRequirement(this.currentRecipeId() ?? '');
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


  private craftingStationLabel(station: CraftingStation): string {
    return station.replaceAll('_', ' ').toUpperCase();
  }


  private craftingStationRequirement(station: CraftingStation): string {
    return `REQUIRES A ${this.craftingStationLabel(station)} WITHIN 2 TILES`;
  }

  private recipeBookEntries() {
    const entries = craftingRecipeBookEntries(
      this.model.nearbyCraftingStations ?? [],
      this.model.inventory,
      modelBackpackCapacity(this.model),
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

  /** The recipe book's Place: never toggles. Only the latest request may roll back, and it falls back to the
   * pattern the authority last confirmed, so the grid, the ghost pattern and the next press all agree with
   * what the authority holds even when presses overlap (BUG-037). */
  private placeCraftingRecipe(recipeId: string): void {
    const sequence = ++this.craftingPlacementSequence;
    this.selectedCraftingRecipeId = recipeId;
    void Promise.resolve(this.callbacks.ghostFillCraftingRecipe(recipeId)).then(() => {
      if (sequence < this.craftingPlacementFloor) return;
      this.confirmedCraftingRecipeId = recipeId;
    }, () => {
      if (sequence !== this.craftingPlacementSequence || this.selectedCraftingRecipeId !== recipeId) return;
      this.selectedCraftingRecipeId = this.confirmedCraftingRecipeId;
      this.syncRetainedInventory();
    });
  }

  /** The legacy canvas row: a second click on the selected recipe clears it; any other click places it. */
  private selectCraftingRecipe(recipeId: string): void {
    if (this.selectedCraftingRecipeId === recipeId) {
      this.dismissCraftingRecipe();
      return;
    }
    this.placeCraftingRecipe(recipeId);
  }

  /** Clears the ghost pattern and forgets the confirmed one. Bumping the sequence retires every
   * placement still in flight, so neither its success nor its refusal can restore a dismissed ghost. */
  private dismissCraftingRecipe(): void {
    this.selectedCraftingRecipeId = null;
    this.confirmedCraftingRecipeId = null;
    this.craftingPlacementFloor = ++this.craftingPlacementSequence;
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
    if (slotIndex < 0 || this.itemSlots.slot('crafting', slotIndex).item !== null) return null;
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
  private applyQuickCraftPreview(targets: readonly UiSlotRef[], mode: UiSlotSpreadMode): void {
    const cursor = this.heldCursorStack();
    if (targets.length === 0 || cursor == null) return;
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
      const byIndex = new Map(containerSlots.map((slot) => [slot.index, slot]));
      containers[id] = {
        id, capacity,
        slots: Array.from({ length: capacity }, (_, index) => {
          const slot = byIndex.get(index);
          return slot === undefined ? null : this.quickCraftOriginalItems.get(slot) ?? null;
        }),
        ...(Object.keys(restrictions).length === 0 ? {} : { restrictions }),
      };
    }
    const preview = quickCraftCursorStack(containers, cursor, {
      mode, targets: targets.map((target) => ({ container: target.container, index: target.index })),
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
      const byIndex = new Map(slots.map((slot) => [slot.index, slot]));
      return [id, {
        id, capacity,
        slots: Array.from({ length: capacity }, (_, index) => byIndex.get(index)?.item ?? null),
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

  private predictCursorClick(ref: UiSlotRef, button: 'left' | 'right'): boolean {
    const result = clickContainerSlot(this.visibleMenuContainers(), this.heldCursorStack(), {
      container: ref.container, index: ref.index, button,
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

  /** Rolls a predicted move back if the server rejects it; `refused` are the slots the move placed into, which play
   * the kit's refused-drop flash with the callback's error toast. */
  private trackInventoryPrediction(result: void | Promise<void>, refused: readonly UiSlotRef[] = []): void {
    // A refusal only flashes in the window it was made in: a late answer after the window closed, or after another
    // frame opened, must not flash a reopened slot with the same ref.
    const session = this.slotSession, frame = this.model.activeFrameId;
    void Promise.resolve(result).catch(() => {
      this.cancelQuickCraftPreview();
      this.clearOptimisticMenu();
      // Restore the latest subscribed authority snapshot immediately. The
      // callback owns the error toast; this path only rolls presentation back.
      this.update(this.model);
      if (session === this.slotSession && frame === this.model.activeFrameId) this.slotGestures.refused(refused);
    });
  }
  /** Counts inventory window openings and closings, so late refusals can tell whether their window is still open. */
  private slotSession = 0;








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

/** The kit alias of a retained frame's entity pane: a chest, the hearth stash, or a placed station (BUG-067). */
function retainedEntityContainer(definition: import('@orchard/sim').FrameContentDefinition): 'chest' | 'stash' | 'placeable' {
  const container = definition.presentation?.entityContainer;
  return container === 'chest' || container === 'stash' ? container : 'placeable';
}
