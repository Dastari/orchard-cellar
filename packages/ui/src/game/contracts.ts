import { type ContentRegistry, type CraftingStation, type FrameDefinitionId, type ItemStack, type MoonPhase, type MoveItemRequest, type WeatherMode, type WindDirectionMode } from '@orchard/sim';
import type { LoadedAsset } from '../assets.js';
import { type UiRect } from '../geometry.js';
import { type PwaUpdateStatus } from '../pwa-update.js';
import { type CharacterScreenModel } from '../character-screen.js';
import { type SkillTreeModel } from '../skill-tree-ui.js';
import type { SkillPointNotice } from '../skill-point-notice.js';
import { type StatisticsScreenModel } from '../statistics-screen.js';
import { type ProgressionTab } from '../progression-tabs.js';
import { type QuestLogEntry } from '../quest-log.js';
import { type PlayerAppearanceSelection, type SkillTrack } from '@orchard/sim';

export type LightingModel = 'classic' | 'unified';

export type FrameSurface = 'inventory' | 'crafting' | 'entity' | 'merchant';

export type OverworldWindow = 'inventory' | 'pack' | 'crafting' | 'content' | 'chest' | 'barrel' | 'furnace' | 'cooking' | 'press' | 'fermentation' | ProgressionTab | 'quests' | 'delve-confirmation' | 'system' | 'settings' | 'developer' | 'help';

export type ContentFrameWindow = 'pack' | 'crafting' | 'chest' | 'barrel' | 'furnace' | 'cooking' | 'press' | 'fermentation' | 'shop';

export const SETTINGS_TABS = [
  'gameplay', 'controls', 'video', 'audio', 'interface', 'accessibility',
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEVELOPER_TABS = ['world', 'player', 'quests', 'render'] as const;

export type DeveloperTab = (typeof DEVELOPER_TABS)[number];

export type AudioVolumeBus = 'master' | 'music' | 'sfx';

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

export interface OverworldUiModel {
  readonly width: number;
  readonly height: number;
  readonly connected: boolean;
  readonly touchControls?: boolean;
  readonly playerCount: number;
  readonly onlinePlayersVisible?: boolean;
  readonly onlinePlayers?: readonly OnlinePlayerListEntry[];
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
  readonly cellarOrePreview?: boolean;
  readonly fullscreen?: boolean;
  readonly fullscreenAvailable?: boolean;
  readonly pwaUpdateStatus?: PwaUpdateStatus;
  readonly prompt: string | null;
  readonly toast: string | null;
  readonly toastKind?: 'info' | 'success' | 'failure';
  readonly toastId?: number;
  readonly toastDurationMs?: number;
  readonly skillPointNotice?: SkillPointNotice | null;
  readonly nearbyCraftingStations?: readonly CraftingStation[];
  readonly knownRecipeIds?: readonly string[];
  readonly character?: CharacterScreenModel;
  readonly skills?: SkillTreeModel;
  readonly statistics?: StatisticsScreenModel;
  readonly quests?: readonly QuestLogEntry[];
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
  readonly selectHotbar: (slot: number) => void;
  readonly setTimeFraction: (fraction: number) => void;
  readonly shiftDay: (days: number) => void;
  readonly cycleWeather: () => void;
  readonly cycleWindDirection: () => void;
  readonly toggleLightingEffects: () => void;
  readonly setLightingModel?: (model: LightingModel) => void;
  readonly toggleCellarOrePreview?: () => void;
  readonly setQuestPinned: (questId: string, pinned: boolean) => void;
  readonly abandonQuest: (questId: string) => void;
  readonly setAppearance?: (appearance: PlayerAppearanceSelection) => void;
  readonly purchaseSkillNode?: (nodeId: string) => void;
  readonly resetSkillTree?: (track: SkillTrack) => void;
  readonly dismissSkillPointNotice?: () => void;
  readonly setAudioVolume: (bus: 'master' | 'music' | 'sfx', value: number) => void;
  readonly setAudioBackground: (bus: 'music' | 'sounds', enabled: boolean) => void;
  readonly setNameplatesVisible?: (visible: boolean) => void;
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
