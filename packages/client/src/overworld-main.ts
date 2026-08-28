import {
  AUTHORITY_TICK_MS,
  AUTHORITY_HZ,
  BACKPACK_SLOT_COUNT,
  BASE_BACKPACK_CAPACITY,
  CROP_WATERING_TICKS,
  CRAFTING_STATION_REACH_TILES,
  BOW_MAX_CHARGE_MS,
  BOW_MAX_PROJECTILE_FLIGHT_TICKS,
  BOW_MAX_TARGET_RANGE_PIXELS,
  BOW_MIN_TARGET_RANGE_PIXELS,
  CHEST_INTERACTION_REACH_FIXED,
  FIXED_UNITS_PER_PIXEL,
  INPUT_REFRESH_STEPS,
  SIM_STEPS_PER_AUTHORITY_TICK,
  SIM_TICKS_PER_SECOND,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_VERSION,
  TILE_SIZE_FIXED,
  TILE_INTERACTION_REACH_FIXED,
  TICKS_PER_DAY,
  TOOL_VIGOUR_BALANCE,
  EFFECT_KINDS,
  EFFECT_DEFINITIONS,
  SKILL_TRACKS,
  TOPSIDE_SPACE_ID,
  authorityDayProgress,
  authorityTickAtDayProgress,
  avatarActionForEquippedKind,
  calendarAtTick,
  craftingStationWithinReach,
  cropDefinition,
  cropGrowthAt,
  bowHeldAnimationFrame,
  bowChargedRangePixels,
  bowChargeTracerFraction,
  bowChargeVigourCostCenti,
  bowProjectileArcPresentation,
  bowProjectileOrigin,
  bowProjectileRangePixels,
  bowProjectileTargetOrigin,
  bowShotForTarget,
  directionFromAim,
  directionUnitVector,
  encodedBowTargetAim,
  isWindDirectionMode,
  isWeatherMode,
  lunarIlluminationAtAuthorityTick,
  lunarPhaseAtAuthorityTick,
  generateSurvivalDecorations,
  survivalTreeKindAt,
  homesteadBiomeAt,
  generateMarlowCampPathTiles,
  homesteadPathTiles,
  homesteadPortalName,
  HOMESTEAD_TENT_TILE,
  HOMESTEAD_GATE_TILE,
  HOMESTEAD_PLOT_MIN_TILE,
  HOMESTEAD_PLOT_MAX_TILE,
  CELLAR_ENTRY_TILE,
  cellarOreKindAt,
  RESIDENCE_BED_TILE,
  RESIDENCE_BOOKSHELF_TILE,
  MARLOW_TENT_BOOKSHELF_TILE,
  interiorFurnitureBlockingTiles,
  homesteadTentFootprint,
  homesteadMarkerPlacementTiles,
  homesteadBoundaryTiles,
  instanceSpaceRowFor,
  isBreakableRockKind,
  isChoppableTreeKind,
  isAxeHarvestableResourceKind,
  isGatherableResourceKind,
  isInteractivePoiDecorationKind,
  isMineableOreKind,
  isRecoverableArrow,
  recoverableArrowDirection,
  isForwardSwingToolKind,
  firstProjectileTerrainHit,
  survivalResourceDropAfterHit,
  survivalResourceInitialHealth,
  survivalResourceObstacle,
  survivalDecorationBlocksTraversal,
  survivalDecorationObstacle,
  treeGrowthStageName,
  isHorseWithinMountReach,
  itemModifiers,
  isWildlifeSpecies,
  itemDefinition,
  coinPurseFromBronze,
  itemActionRejection,
  isPlayerAppearanceSelection,
  isSkillTrack,
  placeableDefinition,
  questDefinition,
  questObjectiveProgress,
  QUEST_DEFINITIONS,
  fenceJoinMask,
  nextWeatherMode,
  nextWindDirectionMode,
  weatherVisualState,
  collisionTileIsBlockedAtPlane,
  shiftAuthorityDay,
  simTickOfDayAtAuthorityTick,
  movePlayer,
  movePlayerAtSpeed,
  movePlayerAtSpeedPermille,
  modifiersForEffects,
  nearestTileTarget,
  normalizedBowAim,
  playerHitboxBounds,
  playerInteractionOrigin,
  resourceToolReachFixed,
  resourceToolForwardOffsetFixed,
  survivalBiomeAt,
  spaceDefinitionFor,
  resolveStats,
  resolveSprintAbility,
  resolveModifierTarget,
  sprintVigourCostForSteps,
  resolveCreatureStats,
  type CollisionMap,
  type CollisionObstacle,
  type CraftingStation,
  type Direction,
  type EffectKind,
  type MerchantCartLine,
  type PlayerState,
  type PlayerAppearanceSelection,
  type SpaceDefinition,
  type WeatherMode,
  type WindDirectionMode,
  type WildlifeSpecies,
  type VitalsToolKind,
} from '@orchard/sim';
import {
  DEFAULT_UI_SCALE,
  DEFAULT_WORLD_ZOOM,
  easeWorldZoom,
  fittedUiScale,
  stepUiScale,
  stepWorldZoom,
  type UiScale,
} from './display.js';
import { FixedStepLoop } from './loop.js';
import { dismissLoadingScreen, setLoadingScreenStage, upgradeLoadingScreen, worldLoadingStage } from './loading-screen.js';
import { pwaClient } from './pwa.js';
import { AudioBus } from './audio/audio-bus.js';
import { readOidcSession } from './auth/oidc.js';
import type { ChatMessage, PlayerPosition, QuestWorldItem, SpacePortal, WorldChest, WorldCombatTarget, WorldCrop, WorldItem, WorldNpc, WorldPlaceable, WorldProjectile, WorldResource } from './net/generated/types.js';
import {
  OverworldConnection,
  viewRadiusForViewport,
  type NetworkDirection,
  type OverworldView,
} from './net/overworld-connection.js';
import { AvatarAnimationController, FrameVisualTickClock, PresentationCorrection, ProjectileSnapshotBuffer, RemoteSnapshotBuffer, RenderTickClock, VisualTickClock, presentationAuthorityTick, type SampledProjectile, type SampledRemote } from './net/netcode.js';
import {
  DEFAULT_PLAYER_APPEARANCE,
  drawOverworldArcheryTarget,
  drawOverworldAvatar,
  drawOverworldArrow,
  drawOverworldChest,
  drawOverworldCrop,
  drawOverworldHorse,
  drawOverworldHive,
  drawOverworldItem,
  drawOverworldPlaceable,
  drawOverworldMerchant,
  drawOverworldMountedAction,
  drawPlayerHeadPortrait,
  drawPlayerPaperDoll,
  drawNpcPortrait,
  drawUiAsset,
  drawUiAssetFrame,
  drawOverworldOreNode,
  drawOverworldPoiDecoration,
  drawOverworldRock,
  drawOverworldStump,
  drawOverworldTree,
  drawOverworldTreeRegrowth,
  drawOverworldWildlife,
  actionVisualForDirection,
  avatarAnimationForDirection,
  horseJumpPose,
  horseWorldBounds,
  heldLightAnimationForDirection,
  loadOverworldArt,
  merchantWorldBounds,
  natureDecorationFrame,
  overworldPoiDecorationDepthY,
  wildlifeWorldBounds,
  type WorldVisualBounds,
} from './overworld-art.js';
import { cameraAxisOffset, visibleWorldBounds, worldPointVisible } from './render/camera.js';
import { createClientCollisionMap } from './render/collision.js';
import { drawAnimatedTerrain } from './render/animated-terrain.js';
import { drawFarmSoil, drawInteractionTileReticle, drawInsetGround, farmSoilKey } from './render/farmland.js';
import { GroundChunkCache } from './render/ground-cache.js';
import {
  createLightOcclusionMap,
  createSpriteLightOccluder,
  type LightOcclusionMap,
  type LightTrunkOccluder,
} from './render/light-occlusion.js';
import {
  ambientAtTick,
  CAMPFIRE_LIGHT,
  CAMPFIRE_LIGHT_RADIUS_TILES,
  LANTERN_LIGHT,
  LANTERN_LIGHT_RADIUS_TILES,
  playerLightPosition,
  southFacingReceiverBrightness,
  TileLightmap,
  TORCH_LIGHT,
  TORCH_LIGHT_RADIUS_TILES,
  type PointLight,
} from './render/lighting.js';
import { deterministicFlameFlicker, isLightEmitterKind, placeablePointLight } from './render/light-sources.js';
import { RenderMetrics } from './render/metrics.js';
import { RainWeather } from './render/particles.js';
import { enqueueRaisedTerrainDepth } from './render/raised-terrain-depth.js';
import {
  drawTerrainInspectionVisuals,
  inspectTerrainAtProjectedPoint,
  terrainInspectionLines,
  terrainInspectionVisualLayout,
} from './render/terrain-inspector.js';
import { treeSwayOffset, WeatherEffects, windDirectionLabel, type WindTreeSource } from './render/weather-effects.js';
import { drawPixelPanel, drawPixelText, measurePixelText } from './render/pixel-ui.js';
import {
  MAX_WORLD_ZOOM,
  UnifiedRenderer,
  drawWorldDepthQueue,
  type WorldDepthItem,
} from './render/renderer.js';
import {
  cellarWallSourceAtProjectedTile,
  terrainContactWorldYForPlayer,
  terrainElevationAtWorldFoot,
  terrainForSpace,
  terrainForWorld,
  terrainColorAt,
  terrainWithCellarExcavations,
  terrainMaximumElevation,
  terrainPlaneCollisionCellAt,
  terrainProjectedDepthAtFoot,
  terrainProjectedElevationAtFoot,
  terrainProjectedSortOffset,
  terrainProjectedWorldYAtFoot,
  terrainVisualProjectionRowsPerLevel,
  type TerrainArray,
} from './render/terrain.js';
import {
  interpolateFixedPosition,
  presentationMoving,
  sampleLocalProjectilePrediction,
  type LocalProjectilePrediction,
} from './overworld-prediction.js';
import {
  nearestInteractionCandidate,
  type InteractionCandidate,
} from './interaction-targeting.js';
import {
  OFFLINE_AVATAR_FILTER,
  worldPlayerIsOffline,
  worldPlayerParticipatesInCollision,
} from './player-presence.js';
import {
  isInterfaceVisibilityToggle,
  isNameplateToggle,
  OverworldUi,
  type OverworldUiTargetVitals,
} from './ui/overworld-ui.js';
import { entityTargetAtWorldPoint, sameEntityTarget, targetKey, type SelectedEntityTarget, type TargetableWorldEntity } from './entity-targeting.js';
import { ghostFillRecipeMoves } from './ui/recipe-book.js';
import { ChatOverlay } from './ui/chat-overlay.js';
import { parseChatSubmission } from './ui/chat-command.js';
import {
  drawSpeechBubble,
  edgeSpeechAnchor,
  speechBubbleHeadOffset,
  speechBubbleIsRecent,
  speechBubbleLayout,
  speechBubbleRect,
  type EdgeSpeechAnchor,
} from './ui/speech-bubble.js';
import { CharacterNamePrompt } from './ui/character-name-prompt.js';
import { NpcInteractionUi } from './ui/npc-interaction-ui.js';
import { QuestTracker, type QuestTrackerEntry } from './ui/quest-tracker.js';
import type { QuestLogEntry } from './ui/quest-log.js';
import { TouchControls, type TouchControlAction } from './ui/touch-controls.js';
import {
  facedResource,
  facedInteractionTile,
  equippedItemFacing,
  interactionTileAtWorldPoint,
  nearbyWorldItem,
  hotbarItemLabel,
  hotbarSlotForCode,
  formatDayTime,
  worldPlacementTileIsBlocked,
} from './survival-ui.js';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (canvasElement === null) throw new Error('Missing overworld canvas');
const canvas: HTMLCanvasElement = canvasElement;
const renderer = new UnifiedRenderer(canvas);
const chatInputElement = document.querySelector<HTMLInputElement>('#account-name');
if (chatInputElement === null) throw new Error('Missing overworld text input');
const characterNameInputElement = document.querySelector<HTMLInputElement>('#character-name');
if (characterNameInputElement === null) throw new Error('Missing character name input');
const shopFilterInputElement = document.querySelector<HTMLInputElement>('#shop-filter');
if (shopFilterInputElement === null) throw new Error('Missing shop filter input');
const inventoryFilterInputElement = document.querySelector<HTMLInputElement>('#inventory-filter');
if (inventoryFilterInputElement === null) throw new Error('Missing inventory filter input');
setLoadingScreenStage({
  title: 'PACKING YOUR WAGON', detail: 'LOADING ART, TILESETS, AND UI', progress: 38,
});
const art = await loadOverworldArt();
upgradeLoadingScreen(art.ui, art.uiSkin, art.fruitItems['apple'] ?? art.missingItem);
setLoadingScreenStage({
  title: 'SAILING TO YOUR ISLAND', detail: 'CONNECTING TO THE SHARED WORLD', progress: 58,
});
const groundCache = new GroundChunkCache();
const lightmap = new TileLightmap();
const rain = new RainWeather(art.rainStreak, art.rainSplash);
const weatherEffects = new WeatherEffects(art.cloudShadow, art.windGust, art.oakLeaf, art.birchLeaf, art.spruceLeaf);
const renderMetrics = new RenderMetrics();
const audio = new AudioBus(false);
void audio.unlock().catch(() => undefined);

const keys = new Set<string>();
const touchControls = new TouchControls();
const NAMEPLATES_VISIBLE_SESSION_KEY = 'orchard.ui.nameplates-visible';
const accountSlot = new URLSearchParams(location.search).get('slot') ?? readOidcSession()?.subject ?? 'Farmer';
let networkDirty = true;
const network = new OverworldConnection(accountSlot, () => { networkDirty = true; });
const GENERAL_CHAT_CHANNEL_ID = 1n;
const chatOverlay = new ChatOverlay(
  art.uiSkin,
  art.ui,
  chatInputElement,
  (body) => submitChatInput(body),
  (open) => {
    if (!open) return;
    keys.clear();
    network.setDirection('idle');
  },
);

async function submitChatInput(body: string): Promise<void> {
  const onlineProfiles = [...latestSnapshot.profiles].filter((profile) => profile.online);
  const command = parseChatSubmission(
    body,
    latestSnapshot.membership?.role === 'owner',
    onlineProfiles.map((profile) => profile.displayName),
  );
  if (command.kind === 'error') throw new Error(command.message);
  if (command.kind === 'chat') return await network.sendChatMessage(GENERAL_CHAT_CHANNEL_ID, command.body);
  if (command.kind === 'whisper') {
    const recipient = onlineProfiles.find((profile) => (
      profile.displayName.toLocaleLowerCase('en-US') === command.playerName.toLocaleLowerCase('en-US')
    ));
    if (recipient === undefined) throw new Error('PLAYER NOT FOUND OR OFFLINE');
    return await network.sendWhisper(recipient.identity, command.body);
  }
  if (command.kind === 'reply') {
    const recipient = latestIncomingWhisper(latestSnapshot);
    if (recipient === null) throw new Error('NO INCOMING WHISPER TO REPLY TO');
    return await network.sendWhisper(recipient.sender, command.body);
  }
  if (command.kind === 'speech') return await network.sendWorldSpeech(command.speechKind, command.body);
  if (command.kind === 'last_connections') return await network.requestLastConnections();
  if (command.kind === 'debug_space') {
    portalTransitionStartedAtMs = performance.now();
    await network.debugUsePortal();
    setToast('DEBUG SPACE TRANSIT', 'success');
    return;
  }
  await network.adminTeleport(command.destination);
  setToast(`TELEPORTED TO ${command.destination}`, 'success');
}
const characterNamePrompt = new CharacterNamePrompt(
  art.uiSkin,
  art.ui,
  characterNameInputElement,
  (name) => network.setCharacterName(name),
  (active) => {
    if (!active) return;
    chatOverlay.dismiss();
    keys.clear();
    network.setDirection('idle');
  },
);
let latestSnapshot = network.view();

function latestIncomingWhisper(snapshot: OverworldView): ChatMessage | null {
  if (snapshot.identityHex === null) return null;
  let latest: ChatMessage | null = null;
  for (const message of snapshot.chatMessages) {
    if (message.kind !== 'whisper'
      || message.recipient?.toHexString() !== snapshot.identityHex
      || message.sender.toHexString() === snapshot.identityHex) continue;
    if (latest === null || message.id > latest.id) latest = message;
  }
  return latest;
}

function chatTimelineId(issuedAtMicros: bigint, rowId: bigint, lane: 0n | 1n): bigint {
  return (issuedAtMicros << 65n) + (rowId << 1n) + lane;
}

let predicted: PlayerState | null = null;
let previousPredicted: PlayerState | null = null;
let lastDirection: NetworkDirection = 'idle';
let lastSprinting = false;
let toast = 'CONNECTING TO SHARED ISLAND';
let toastTicks = 180;
let toastKind: 'info' | 'success' | 'failure' = 'info';

function setToast(message: string, kind: 'info' | 'success' | 'failure' = 'info', ticks = 120): void {
  toast = message;
  toastKind = kind;
  toastTicks = ticks;
}

function failureToastText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const knownFailures = [
    ['inventory_full', 'NOT ENOUGH INVENTORY SPACE'],
    ['container_full', 'NOT ENOUGH INVENTORY SPACE'],
    ['insufficient_vigour', 'INSUFFICIENT VIGOUR'],
    ['swing_too_soon', 'TOOL IS NOT READY'],
    ['anvil_copper_missing', 'ANVIL REPAIR NEEDS 5 COPPER'],
    ['anvil_not_in_reach', 'FACE A NEARBY ANVIL'],
    ['tool_not_damaged', 'TOOL IS ALREADY FULLY REPAIRED'],
    ['wrong_tool', 'SELECT A DAMAGED TOOL'],
  ] as const;
  const known = knownFailures.find(([code]) => raw.toLowerCase().includes(code));
  return known?.[1] ?? raw.replaceAll('_', ' ').toUpperCase();
}

function setFailureToast(error: unknown, ticks = 120): void {
  setToast(failureToastText(error), 'failure', ticks);
}
let effectPhase = 0;
let worldZoom = DEFAULT_WORLD_ZOOM;
let worldZoomTarget = DEFAULT_WORLD_ZOOM;
let desiredUiScale: UiScale = DEFAULT_UI_SCALE;
let wheelZoomLockedUntil = 0;
let collisionKey = '';
let cellarTerrainCacheKey = '';
let cellarTerrainCache: TerrainArray | null = null;
let observedResourceRevision = -1;
const initialTerrain = terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION);
let worldCollision: CollisionMap = createClientCollisionMap(initialTerrain, []);
let lightOcclusion: LightOcclusionMap = createLightOcclusionMap(
  initialTerrain, [], [], [], art.cliff,
);
let activeSpaceDefinition: SpaceDefinition = spaceDefinitionFor(TOPSIDE_SPACE_ID)!;
let observedSpaceId = TOPSIDE_SPACE_ID;
let portalTransitionStartedAtMs = -1;
let lastNetworkStatus = '';
let debugCollision = false;
let debugMetrics = false;
let debugEntitiesHidden = false;
const LIGHTING_EFFECTS_DISABLED_KEY = 'orchard.developer.lighting-effects-disabled';
let lightingEffectsDisabled = localStorage.getItem(LIGHTING_EFFECTS_DISABLED_KEY) === 'true';
const CELLAR_ORE_PREVIEW_KEY = 'orchard.developer.cellar-ore-preview';
let cellarOrePreview = localStorage.getItem(CELLAR_ORE_PREVIEW_KEY) === 'true';
let debugTerrainPoint: { readonly worldX: number; readonly worldY: number } | null = null;
let interfaceHidden = false;
let nameplatesVisible = readNameplatesVisible();
let onlinePlayersVisible = false;
const unknownActionKinds = new Set<string>();
const remoteBuffers = new Map<string, RemoteSnapshotBuffer>();
const remoteDisplay = new Map<string, SampledRemote>();
const previousRemoteDisplay = new Map<string, SampledRemote>();
const npcBuffers = new Map<bigint, RemoteSnapshotBuffer>();
const npcDisplay = new Map<bigint, SampledRemote>();
const projectileBuffers = new Map<bigint, ProjectileSnapshotBuffer>();
const projectileDisplay = new Map<bigint, SampledProjectile>();
const projectileFlightTicks = new Map<bigint, number>();
const projectileHitProgress = new Map<bigint, number>();
interface FloatingCombatText {
  readonly targetId: bigint;
  readonly amountCenti: number;
  readonly critical: boolean;
  readonly x: number;
  readonly y: number;
  readonly startedAtMs: number;
}
const floatingCombatTexts: FloatingCombatText[] = [];
interface PendingBowProjectile extends LocalProjectilePrediction {
  readonly token: number;
  readonly mounted: boolean;
  readonly ownerProjectileIdsAtRelease: ReadonlySet<bigint>;
  readonly releasedAtAuthorityTick: bigint;
}
let pendingBowProjectile: PendingBowProjectile | null = null;
let nextPendingBowProjectileToken = 1;
const renderTickClock = new RenderTickClock();
const visualTickClock = new VisualTickClock();
const weatherTickClock = new FrameVisualTickClock();
const presentationCorrection = new PresentationCorrection();
const avatarAnimations = new Map<string, AvatarAnimationController>();
const resourceHealth = new Map<bigint, number>();
const treeShakeRemaining = new Map<bigint, number>();
let localActionStartedAtMs: number | null = null;
let localPredictedActionKind = 'none';
let latestPositionAuthorityTick = 0n;
let lightPreviewKind: 'lantern' | 'torch' | null = null;
let worldPointer: { readonly x: number; readonly y: number } | null = null;
let bowChargeStartedAtMs: number | null = null;
let bowChargeStartingVigourCenti: number | null = null;
let bowChargeAuthorityPromise: Promise<void> | null = null;
let bowChargePointerId: number | null = null;
let hoveredInteractionTile: { readonly tileX: number; readonly tileY: number } | null = null;
let animatedOpenChestId: bigint | null = null;
let chestAnimationStartedAtMs = 0;
let closingChestId: bigint | null = null;
let latestCameraX = 0;
let latestCameraY = 0;
let latestRenderedZoom = worldZoom;
let selectedEntityTarget: SelectedEntityTarget | null = null;
let latestTargetableEntities: readonly TargetableWorldEntity[] = [];
let minimapTerrainCache: {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
} | null = null;
const itemArt = {
  missing: art.missingItem,
  avatar: art.avatar,
  ...art.itemIcons,
};

function ownAppearanceSelection(snapshot: OverworldView): PlayerAppearanceSelection {
  const row = snapshot.identityHex === null ? undefined : snapshot.appearances.get(snapshot.identityHex);
  if (row !== undefined && isPlayerAppearanceSelection(row)) return row;
  return {
    hairKind: 'hair_1_brown',
    shirtKind: 'farmer_green',
    pantsKind: 'farmer_white_brown',
    shoesKind: 'brown',
  };
}

interface WebkitFullscreenDocument extends Document {
  readonly webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void | Promise<void>;
}

interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => void | Promise<void>;
}

function documentIsFullscreen(): boolean {
  const fullscreenDocument = document as WebkitFullscreenDocument;
  return document.fullscreenElement !== null || fullscreenDocument.webkitFullscreenElement != null;
}

function toggleFullscreen(): void {
  const fullscreenDocument = document as WebkitFullscreenDocument;
  const root = document.documentElement as WebkitFullscreenElement;
  try {
    let invoked = false;
    let result: void | Promise<void>;
    if (documentIsFullscreen()) {
      if (document.exitFullscreen !== undefined) {
        invoked = true;
        result = document.exitFullscreen();
      } else if (fullscreenDocument.webkitExitFullscreen !== undefined) {
        invoked = true;
        result = fullscreenDocument.webkitExitFullscreen();
      }
    } else if (root.requestFullscreen !== undefined) {
      invoked = true;
      result = root.requestFullscreen();
    } else if (root.webkitRequestFullscreen !== undefined) {
      invoked = true;
      result = root.webkitRequestFullscreen();
    }
    if (!invoked) {
      setToast('FULL SCREEN IS NOT AVAILABLE ON THIS DEVICE', 'failure', 120);
      return;
    }
    void Promise.resolve(result!).catch(setFailureToast);
  } catch (error) {
    setFailureToast(error);
  }
}

const overworldUi = new OverworldUi(art.uiSkin, art.ui, itemArt, {
  selectHotbar: (slot) => selectSlotOptimistically(slot),
  setTimeFraction: (fraction) => sendOwnerWorldUpdate(
    network.setWorldTime(authorityTickAtDayProgress(worldCalendarTick(), fraction)),
  ),
  shiftDay: (days) => sendOwnerWorldUpdate(
    network.setWorldTime(shiftAuthorityDay(worldCalendarTick(), days)),
  ),
  cycleWeather: () => sendOwnerWorldUpdate(
    network.setWorldWeather(nextWeatherMode(worldWeatherMode())),
  ),
  cycleWindDirection: () => sendOwnerWorldUpdate(
    network.setWorldWindDirection(nextWindDirectionMode(worldWindDirection())),
  ),
  toggleLightingEffects: () => {
    lightingEffectsDisabled = !lightingEffectsDisabled;
    localStorage.setItem(LIGHTING_EFFECTS_DISABLED_KEY, String(lightingEffectsDisabled));
    setToast(`LIGHTING EFFECTS ${lightingEffectsDisabled ? 'DISABLED' : 'ENABLED'}`);
  },
  toggleCellarOrePreview: () => {
    cellarOrePreview = !cellarOrePreview;
    localStorage.setItem(CELLAR_ORE_PREVIEW_KEY, String(cellarOrePreview));
    setToast(`CELLAR ORE VEINS ${cellarOrePreview ? 'SHOWN' : 'HIDDEN'}`);
  },
  resetMyQuestProgress: () => showResult(network.resetMyQuestProgress(), 'QUEST PROGRESS RESET'),
  setQuestPinned: (questId, pinned) => showResult(
    network.setQuestPinned(questId, pinned), pinned ? 'QUEST TRACKED' : 'QUEST UNTRACKED',
  ),
  abandonQuest: (questId) => showResult(network.abandonQuest(questId), 'QUEST DROPPED'),
  setAppearance: (appearance) => showResult(network.setAppearance(appearance), 'APPEARANCE UPDATED'),
  purchaseSkillNode: (nodeId) => showResult(network.purchaseSkillNode(nodeId), 'SKILL RANK LEARNED'),
  resetSkillTree: (track) => showResult(network.resetSkillTree(track), `${track.toUpperCase()} TREE RESET`),
  grantDebugSkillPoints: (track, points) => showResult(
    network.grantDebugSkillPoints(track, points),
    `${points} ${track.toUpperCase()} POINT${points === 1 ? '' : 'S'} GRANTED`,
  ),
  adjustDebugBackpackSlots: (increase) => showResult(
    network.adjustDebugBackpackSlots(increase),
    `BACKPACK CAPACITY ${increase ? 'INCREASED' : 'DECREASED'}`,
  ),
  setAudioVolume: (bus, value) => audio.setVolume(bus, value),
  setAudioBackground: (bus, enabled) => audio.setBackgroundPlayback(bus, enabled),
  signOut: () => { location.assign('/?logout=1'); },
  quitToTitle: () => { location.assign('/?menu=1'); },
  toggleFullscreen,
  checkForClientUpdate: () => { void pwaClient.checkForUpdate(); },
  applyClientUpdate: () => pwaClient.applyUpdate(),
  toggleOnlinePlayers: () => { onlinePlayersVisible = !onlinePlayersVisible; },
  moveInventoryItem: (request) => showResult(network.moveInventoryItem(request), 'ITEM MOVED'),
  quickMoveInventoryItem: (fromContainer, fromIndex, toContainers) => showResult(
    network.quickMoveInventoryItem(fromContainer, fromIndex, toContainers), 'ITEMS MOVED',
  ),
  quickMoveAllInventoryItems: (itemKind, fromContainers, toContainers) => showPredictedInventoryResult(
    network.quickMoveAllInventoryItems(itemKind, fromContainers, toContainers), 'ALL MATCHING ITEMS MOVED',
  ),
  distributeInventoryItem: (fromContainer, fromIndex, targets, quantity) => showResult(
    network.distributeInventoryItem(fromContainer, fromIndex, targets, quantity), 'STACK DISTRIBUTED',
  ),
  inventoryCursorClick: (container, index, button) => showPredictedInventoryResult(
    network.inventoryCursorClick(container, index, button), null,
  ),
  sortInventoryContainer: (container) => showPredictedInventoryResult(
    network.sortMenuContainer(container), 'STORAGE SORTED',
  ),
  inventoryCursorQuickCraft: (targets, mode) => showPredictedInventoryResult(
    network.inventoryCursorQuickCraft(targets, mode), 'STACK DISTRIBUTED',
  ),
  inventoryCursorPickupAll: (containerOrder) => showPredictedInventoryResult(
    network.inventoryCursorPickupAll(containerOrder), 'MATCHING STACKS COLLECTED',
  ),
  inventoryCursorSwapHotbar: (container, index, hotbarIndex) => showResult(
    network.inventoryCursorSwapHotbar(container, index, hotbarIndex), 'HOTBAR SWAPPED',
  ),
  dropInventoryCursor: (button) => showPredictedInventoryResult(network.dropInventoryCursor(button), 'ITEM DROPPED'),
  throwMenuItem: (container, index, wholeStack) => showResult(
    network.throwMenuItem(container, index, wholeStack), 'ITEM DROPPED',
  ),
  returnInventoryCursor: () => { void network.returnInventoryCursor().catch(() => undefined); },
  craftInventoryRecipe: (recipeId, craftAll) => showResult(network.craftInventoryRecipe(recipeId, craftAll), craftAll ? 'STACK CRAFTED' : 'ITEM CRAFTED'),
  ghostFillCraftingRecipe: (recipeId) => {
    const rows = [...latestSnapshot.inventorySlots];
    const moves = ghostFillRecipeMoves(recipeId, rows, rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0));
    if (moves === null) {
      setToast('RECIPE INGREDIENTS OR EMPTY GRID REQUIRED', 'failure');
      return;
    }
    showResult(moves.reduce(
      (pending, move) => pending.then(async () => await network.moveInventoryItem(move)),
      Promise.resolve(),
    ), 'RECIPE GHOST-FILLED');
  },
  closeCrafting: () => { void network.closeCrafting().catch(() => undefined); },
  closeChest: () => { void network.closeChest().catch(() => undefined); },
  closePlaceable: () => { void network.closePlaceable().catch(() => undefined); },
}, (context, playerId, rect) => {
  const appearance = latestSnapshot.appearances.get(playerId) ?? undefined;
  drawPlayerHeadPortrait(context, art, appearance ?? DEFAULT_PLAYER_APPEARANCE, rect);
}, (context, target, rect) => {
  if (target.portrait.kind === 'player') {
    const appearance = latestSnapshot.appearances.get(target.portrait.playerId) ?? undefined;
    drawPlayerHeadPortrait(context, art, appearance ?? DEFAULT_PLAYER_APPEARANCE, rect);
    return;
  }
  if (target.portrait.kind === 'combat_target') {
    const scale = Math.min(rect.width, rect.height) / 32;
    drawUiAsset(
      context,
      art.archeryTarget,
      rect.x + (rect.width - 32 * scale) / 2,
      rect.y + (rect.height - 32 * scale) / 2,
      scale,
    );
    return;
  }
  drawNpcPortrait(context, art, target.portrait, rect);
}, (context, appearance, facing, rect) => {
  drawPlayerPaperDoll(context, art, appearance, facing, rect);
}, (context, rect, pixelsPerTile, trackingEnabled) => {
  const snapshot = latestSnapshot;
  const identityHex = snapshot.identityHex;
  const local = identityHex === null ? undefined : snapshot.players.get(identityHex);
  const centerWorldX = (local?.x ?? 0) / FIXED_UNITS_PER_PIXEL;
  const centerWorldY = (local?.y ?? 0) / FIXED_UNITS_PER_PIXEL;
  const centerTileX = Math.floor(centerWorldX / 16);
  const centerTileY = Math.floor(centerWorldY / 16);
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
  const terrain = terrainForSpace(
    activeSpaceDefinition,
    seed,
    version,
  );
  const columns = Math.ceil(rect.width / pixelsPerTile) + 2;
  const rows = Math.ceil(rect.height / pixelsPerTile) + 2;
  const firstTileX = Math.floor(centerTileX - columns / 2);
  const firstTileY = Math.floor(centerTileY - rows / 2);
  const cacheKey = [
    activeSpaceDefinition.spaceId,
    seed,
    version,
    centerTileX,
    centerTileY,
    pixelsPerTile,
    Math.ceil(rect.width),
    Math.ceil(rect.height),
  ].join(':');
  if (minimapTerrainCache?.key !== cacheKey) {
    const cacheCanvas = document.createElement('canvas');
    cacheCanvas.width = Math.ceil(rect.width);
    cacheCanvas.height = Math.ceil(rect.height);
    const cacheContext = cacheCanvas.getContext('2d');
    if (cacheContext !== null) {
      cacheContext.imageSmoothingEnabled = false;
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          cacheContext.fillStyle = terrainColorAt(terrain, firstTileX + column, firstTileY + row);
          cacheContext.fillRect(
            Math.floor(column * pixelsPerTile),
            Math.floor(row * pixelsPerTile),
            Math.ceil(pixelsPerTile),
            Math.ceil(pixelsPerTile),
          );
        }
      }
    }
    minimapTerrainCache = { key: cacheKey, canvas: cacheCanvas };
  }
  context.drawImage(minimapTerrainCache.canvas, Math.floor(rect.x), Math.floor(rect.y));
  const marker = (worldX: number, worldY: number, color: string, size: number): void => {
    const x = rect.x + rect.width / 2 + (worldX / 16 - centerTileX) * pixelsPerTile;
    const y = rect.y + rect.height / 2 + (worldY / 16 - centerTileY) * pixelsPerTile;
    if (x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height) return;
    context.fillStyle = '#2b1914';
    context.fillRect(Math.round(x - size / 2 - 1), Math.round(y - size / 2 - 1), size + 2, size + 2);
    context.fillStyle = color;
    context.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  };
  if (trackingEnabled) {
    for (const npc of snapshot.npcs) {
      if (npc.spaceId !== activeSpaceDefinition.spaceId) continue;
      marker(npc.x / FIXED_UNITS_PER_PIXEL, npc.y / FIXED_UNITS_PER_PIXEL, '#f1b34b', 3);
    }
    for (const player of snapshot.players) {
      const id = player.identity.toHexString();
      if (player.spaceId !== activeSpaceDefinition.spaceId || id === identityHex
        || snapshot.profiles.get(id)?.online !== true) continue;
      marker(player.x / FIXED_UNITS_PER_PIXEL, player.y / FIXED_UNITS_PER_PIXEL, '#64b7e8', 3);
    }
  }
  marker(centerWorldX, centerWorldY, '#fff3be', 4);
});
const npcInteractionUi = new NpcInteractionUi(art.uiSkin, art.ui, itemArt, {
  chooseDialogueOption: (choiceId) => showResult(network.chooseDialogueOption(choiceId), 'DIALOGUE UPDATED'),
  closeDialogue: () => { void network.closeNpcDialogue().catch(() => undefined); },
  buy: (lines) => showMerchantResult(network.buyMerchantCart(lines), 'PURCHASE COMPLETE'),
  sell: (lines) => showMerchantResult(network.sellMerchantCart(lines), 'SALE COMPLETE'),
}, (context, npcId, rect) => {
  const npc = latestSnapshot.npcs.get(npcId);
  if (npc === undefined) return;
  const profile = latestSnapshot.wildlifeProfiles.get(npcId);
  drawNpcPortrait(context, art, {
    npcKind: latestSnapshot.merchants.get(npcId) === undefined ? npc.kind : 'merchant',
    ...(profile === undefined ? {} : { species: profile.species }),
    variant: profile?.variant ?? 0,
  }, rect);
}, shopFilterInputElement);
const questTracker = new QuestTracker(
  art.ui,
  art.uiSkin.questTrackerChevron,
  (questId) => { overworldUi.openQuest(questId); },
);

function questLogEntries(snapshot: OverworldView): QuestLogEntry[] {
  const statistics = new Map([...snapshot.playerStatistics].map((row) => [
    `${row.statisticKind}:${row.subjectKind}`,
    row.value,
  ]));
  const itemCounts = new Map<string, number>();
  for (const slot of snapshot.inventorySlots) {
    if (slot.itemKind === 'empty' || slot.quantity === 0) continue;
    itemCounts.set(slot.itemKind, (itemCounts.get(slot.itemKind) ?? 0) + slot.quantity);
  }
  if (snapshot.inventoryCursor !== null && snapshot.inventoryCursor.itemKind !== 'empty'
    && snapshot.inventoryCursor.quantity > 0) {
    itemCounts.set(
      snapshot.inventoryCursor.itemKind,
      (itemCounts.get(snapshot.inventoryCursor.itemKind) ?? 0) + snapshot.inventoryCursor.quantity,
    );
  }
  const source = {
    statistic: (kind: string, subject: string) => statistics.get(`${kind}:${subject}`) ?? 0n,
    itemCount: (itemKind: string) => itemCounts.get(itemKind) ?? 0,
  };
  return [...snapshot.quests].filter((row) => row.state !== 'turned_in').flatMap((row) => {
    const definition = questDefinition(row.questId);
    if (definition === null) return [];
    const baselines = Object.fromEntries([...snapshot.questBaselines]
      .filter((baseline) => baseline.questId === row.questId)
      .map((baseline) => [baseline.objectiveId, baseline.value]));
    const objectives = definition.objectives.map((objective) => {
      const progress = questObjectiveProgress(definition, objective, baselines[objective.id] ?? 0n, source);
      const progressLabel = progress.components.length === 1
        ? `${progress.components[0]!.current}/${progress.components[0]!.target}`
        : progress.components.map((component) => {
        const name = itemDefinition(component.label)?.displayName ?? component.label.replaceAll('_', ' ');
        return `${component.current}/${component.target} ${name}`;
      }).join(', ');
      return {
        label: objective.label,
        complete: progress.complete,
        ...(progressLabel.length === 0 ? {} : { progress: progressLabel }),
      };
    });
    const purse = coinPurseFromBronze(definition.rewards.bronze);
    const rewards = [
      ...(purse.gold > 0n ? [`${purse.gold} GOLD`] : []),
      ...(purse.silver > 0 ? [`${purse.silver} SILVER`] : []),
      ...(purse.bronze > 0 ? [`${purse.bronze} BRONZE`] : []),
      ...definition.rewards.experience.map((reward) => `${reward.amount} ${reward.track.toUpperCase()} XP`),
      ...definition.rewards.items.map((reward) => {
        const name = itemDefinition(reward.itemKind)?.displayName ?? reward.itemKind.replaceAll('_', ' ');
        return `${reward.count} ${name.toUpperCase()}`;
      }),
    ];
    return [{
      id: row.questId,
      title: definition.title,
      summary: definition.summary,
      state: row.state === 'complete' ? 'complete' : 'active',
      pinned: row.pinned,
      objectives,
      rewards,
    }];
  });
}

function questTrackerEntries(entries: readonly QuestLogEntry[]): QuestTrackerEntry[] {
  return entries.filter((entry) => entry.pinned).map((entry) => ({
    id: entry.id,
    title: entry.title,
    complete: entry.state === 'complete',
    objectives: entry.objectives.map((objective) => objective.complete
      ? `[DONE] ${objective.label}`
      : `${objective.progress === undefined ? '' : `${objective.progress} `}${objective.label}`),
  }));
}

function questMarkerForNpc(snapshot: OverworldView, npcId: bigint): 'offer' | 'complete' | null {
  const definitions = Object.values(QUEST_DEFINITIONS).filter((definition) => definition.giverNpcId === npcId);
  for (const definition of definitions) {
    if ([...snapshot.quests].some((row) => row.questId === definition.id && row.state === 'complete')) return 'complete';
  }
  for (const definition of definitions) {
    if (![...snapshot.quests].some((row) => row.questId === definition.id)) return 'offer';
  }
  return null;
}

function worldCalendarTick(): bigint {
  return latestSnapshot.environment?.calendarTick ?? latestSnapshot.clock?.authorityTick ?? 0n;
}

function worldWeatherMode(): WeatherMode {
  const mode = latestSnapshot.environment?.weatherMode ?? 'auto';
  return isWeatherMode(mode) ? mode : 'auto';
}

function worldWindDirection(): WindDirectionMode {
  const direction = latestSnapshot.wind?.direction ?? 'auto';
  return isWindDirectionMode(direction) ? direction : 'auto';
}

function sendOwnerWorldUpdate(request: Promise<void>): void {
  void request.catch((error: unknown) => {
    setFailureToast(error);
  });
}

function readNameplatesVisible(): boolean {
  try {
    return sessionStorage.getItem(NAMEPLATES_VISIBLE_SESSION_KEY) !== 'false';
  } catch {
    return true;
  }
}

function setNameplatesVisible(visible: boolean): void {
  nameplatesVisible = visible;
  try {
    sessionStorage.setItem(NAMEPLATES_VISIBLE_SESSION_KEY, String(visible));
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory toggle still works.
  }
}

function resize(): void {
  renderer.resize();
  const minimum = renderer.minimumZoom(activeSpaceDefinition.sizeTiles * 16);
  worldZoomTarget = Math.max(minimum, Math.min(MAX_WORLD_ZOOM, worldZoomTarget));
  worldZoom = Math.max(minimum, Math.min(MAX_WORLD_ZOOM, worldZoom));
}

function softwareKeyboardInset(uiScale: number): number {
  if (!chatOverlay.isOpen || window.visualViewport === null) return 0;
  const visualBottom = window.visualViewport.offsetTop + window.visualViewport.height;
  const obscuredCssPixels = Math.max(0, window.innerHeight - visualBottom);
  // Small differences are browser chrome, not the software keyboard.
  return obscuredCssPixels < 80 ? 0 : obscuredCssPixels / uiScale;
}

function directionFromKeys(): NetworkDirection {
  if (overworldUi.openWindow !== null || characterNamePrompt.isActive || npcInteractionUi.active) return 'idle';
  if (touchControls.direction !== 'idle') return touchControls.direction;
  const up = keys.has('ArrowUp') || keys.has('KeyW');
  const down = keys.has('ArrowDown') || keys.has('KeyS');
  const left = keys.has('ArrowLeft') || keys.has('KeyA');
  const right = keys.has('ArrowRight') || keys.has('KeyD');
  if (up && left) return 'upLeft';
  if (up && right) return 'upRight';
  if (down && left) return 'downLeft';
  if (down && right) return 'downRight';
  if (up) return 'up';
  if (down) return 'down';
  if (left) return 'left';
  if (right) return 'right';
  return 'idle';
}

function playerState(row: PlayerPosition): PlayerState {
  return {
    position: { x: row.x, y: row.y },
    facing: row.facing as Direction,
    moving: row.moving,
    location: 'estate',
  };
}

function projectedLightObstacle(
  obstacle: CollisionObstacle,
  projection: number,
): CollisionObstacle {
  const offset = Math.round(projection * FIXED_UNITS_PER_PIXEL);
  return {
    ...obstacle,
    top: obstacle.top - offset,
    bottom: obstacle.bottom - offset,
  };
}

function elevatedLightOccluders(
  snapshot: OverworldView,
  seed: number,
  terrain: TerrainArray,
): LightTrunkOccluder[] {
  const result: LightTrunkOccluder[] = [];
  const add = (
    asset: (typeof art)['chest'] | undefined,
    animation: string,
    worldX: number,
    worldY: number,
    obstacle: CollisionObstacle | null,
  ): void => {
    if (asset === undefined || obstacle === null) return;
    const projection = terrainProjectedDepthAtFoot(terrain, worldX, worldY);
    const elevationLayer = terrainElevationAtWorldFoot(terrain, worldX, worldY);
    const projectedWorldY = worldY - projection;
    result.push({
      obstacle: projectedLightObstacle(obstacle, projection),
      receiver: createSpriteLightOccluder(asset, animation, 0, worldX, projectedWorldY),
      footX: worldX,
      footY: projectedWorldY,
      receiverFacing: 'south',
      shadowMode: 'silhouette',
      elevationLayer,
    });
  };
  if (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID) {
    for (const decoration of generateSurvivalDecorations(seed)) {
      if (!survivalDecorationBlocksTraversal(decoration.kind, 'ground')) continue;
      // A pond reserves traversal space, but is below the light plane. Collision
      // is not optical height: water and other floor-level art cast no shadow.
      if (decoration.kind === 'camp_pond') continue;
      // The emitter is the luminous body: do not let its own alpha silhouette
      // terminate its seed. Non-emissive solid props remain occluders.
      if (isLightEmitterKind(decoration.kind)) continue;
      add(
        art.poiDecorations[decoration.kind],
        decoration.kind === 'camp_campfire' ? 'burn' : 'base',
        decoration.tileX * 16 + 8,
        (decoration.tileY + 1) * 16,
        survivalDecorationObstacle(decoration, 'ground'),
      );
    }
  }
  for (const resource of snapshot.resources) {
    if (resource.depleted) continue;
    if (isChoppableTreeKind(resource.kind)) continue;
    const asset = isBreakableRockKind(resource.kind)
      ? art.poiDecorations.poi_rock_small
      : isMineableOreKind(resource.kind) ? art.oreNodes[resource.kind] : undefined;
    add(
      asset, 'base', resource.tileX * 16 + 8, (resource.tileY + 1) * 16,
      survivalResourceObstacle(resource.kind, resource.tileX, resource.tileY),
    );
  }
  for (const chest of snapshot.chests) {
    if (chest.carriedBy !== undefined) continue;
    add(
      art.chest, 'chest', chest.tileX * 16 + 8, (chest.tileY + 1) * 16,
      tileLightObstacle(chest.tileX, chest.tileY),
    );
  }
  for (const placeable of snapshot.placeables) {
    if (placeable.carriedBy !== undefined) continue;
    const definition = placeableDefinition(placeable.kind);
    if (definition?.blocksMovement !== true || placeable.open) continue;
    if (isLightEmitterKind(placeable.kind)) continue;
    add(
      art.itemIcons[placeable.kind],
      itemDefinition(placeable.kind)?.iconAnimation ?? 'base',
      placeable.tileX * 16 + 8,
      (placeable.tileY + 1) * 16,
      tileLightObstacle(placeable.tileX, placeable.tileY),
    );
  }
  return result;
}

function tileLightObstacle(tileX: number, tileY: number): CollisionObstacle {
  return {
    left: tileX * TILE_SIZE_FIXED,
    top: tileY * TILE_SIZE_FIXED,
    right: (tileX + 1) * TILE_SIZE_FIXED - 1,
    bottom: (tileY + 1) * TILE_SIZE_FIXED - 1,
  };
}

function matureTreeLightAsset(kind: string): (typeof art)['treeMature'] {
  return art.fruitTrees[kind]
    ?? (kind === 'tree_oak' ? art.treeOak
      : kind === 'tree_birch' ? art.treeBirch
        : kind === 'tree_spruce' ? art.treeSpruce
          : kind === 'tree_acacia' ? art.treeAcacia
            : kind === 'tree_palm' ? art.treePalm
              : kind === 'cactus' ? art.cactus
                : art.treeMature);
}

// The additive growth column is absent on pre-growth bindings; those rows are
// mature by definition. Stage 3 is the shared mature-tree wire value.
const MATURE_TREE_GROWTH_STAGE = 3;
type RenderWorldResource = WorldResource & { readonly ambientOnly?: boolean };
let homesteadSurroundingsKey = '';
let cachedHomesteadResources: readonly RenderWorldResource[] = [];
let cachedHomesteadDecorations: ReturnType<typeof generateSurvivalDecorations> = [];

function ensureHomesteadSurroundings(seed: number): void {
  const site = activeSpaceDefinition.homesteadSite;
  const key = site === undefined ? ''
    : `${activeSpaceDefinition.spaceId}:${activeSpaceDefinition.sizeTiles}:${site.worldTileX}:${site.worldTileY}:${seed}`;
  if (key === homesteadSurroundingsKey) return;
  homesteadSurroundingsKey = key;
  cachedHomesteadResources = buildHomesteadSurroundingResources(seed);
  cachedHomesteadDecorations = buildHomesteadSurroundingDecorations(seed);
}

function buildHomesteadSurroundingResources(seed: number): readonly RenderWorldResource[] {
  const site = activeSpaceDefinition.homesteadSite;
  if (activeSpaceDefinition.generator !== 'homestead' || site === undefined) return [];
  const result: RenderWorldResource[] = [];
  const occupied = new Set<string>();
  const terrainCenter = Math.floor(activeSpaceDefinition.sizeTiles / 2);
  for (let tileY = 1; tileY < activeSpaceDefinition.sizeTiles - 1; tileY += 1) {
    for (let tileX = 1; tileX < activeSpaceDefinition.sizeTiles - 1; tileX += 1) {
      if (tileX >= HOMESTEAD_PLOT_MIN_TILE - 2 && tileX <= HOMESTEAD_PLOT_MAX_TILE + 2
        && tileY >= HOMESTEAD_PLOT_MIN_TILE - 2 && tileY <= HOMESTEAD_PLOT_MAX_TILE + 2) continue;
      const biome = homesteadBiomeAt(seed, site, tileX, tileY, activeSpaceDefinition.sizeTiles);
      const distanceWest = HOMESTEAD_PLOT_MIN_TILE - tileX;
      const distanceEast = tileX - HOMESTEAD_PLOT_MAX_TILE;
      const distanceNorth = HOMESTEAD_PLOT_MIN_TILE - tileY;
      const distanceSouth = tileY - HOMESTEAD_PLOT_MAX_TILE;
      const outsideSide = Math.max(distanceWest, distanceEast);
      const inSouthernApproach = distanceSouth > 0;
      const approachCorridor = inSouthernApproach && Math.abs(tileX - terrainCenter) < 18;
      // A homestead is a clearing within a grove, not a square hedge. Woodland
      // wraps densely around the north, feathers broadly down both sides, and
      // opens into a sparse southern approach around the gate.
      const density = approachCorridor ? 1
        : inSouthernApproach ? (outsideSide > 0 ? 14 : 5)
        : distanceNorth > 0 ? (distanceNorth < 18 ? 82 : 58)
        : outsideSide > 0 ? (outsideSide < 18 ? 68 : 42)
        : biome === 'forest' ? 64 : biome === 'meadow' || biome === 'plains' ? 22
        : biome === 'valley' || biome === 'highland' ? 16 : 6;
      const score = Math.abs(Math.imul(tileX ^ seed, 73_856_093) ^ Math.imul(tileY, 19_349_663));
      if (score % 100 >= density) continue;
      const sourceX = site.worldTileX + Math.floor((tileX - terrainCenter) / 4);
      const sourceY = site.worldTileY + Math.floor((tileY - terrainCenter) / 4);
      const kind = survivalTreeKindAt(seed, sourceX, sourceY);
      const key = `${tileX}:${tileY}`;
      if (occupied.has(key)) continue;
      occupied.add(key);
      result.push({
        id: 8_000_000_000n + BigInt(tileY * activeSpaceDefinition.sizeTiles + tileX), kind,
        tileX, tileY,
        chunkX: Math.floor(tileX / 16), chunkY: Math.floor(tileY / 16),
        health: survivalResourceInitialHealth(kind), depleted: false,
        spaceId: activeSpaceDefinition.spaceId, growthStage: MATURE_TREE_GROWTH_STAGE,
        regrowthProgress: 24, ambientOnly: true,
      });
    }
  }
  const trees = result.filter((resource) => isChoppableTreeKind(resource.kind));
  const other = result.filter((resource) => !isChoppableTreeKind(resource.kind));
  // Thin independently at each coordinate. Sorting by a resource id—even
  // after xor—retained enough row ordering to spend the entire budget in
  // distant terrain rows, leaving the visible farm apron empty.
  const distributedTrees = trees.filter((resource) => {
    const selectionHash = Math.imul(resource.tileX + seed, 0x45d9f3b)
      ^ Math.imul(resource.tileY - seed, 0x27d4eb2d);
    return Math.abs(selectionHash % 5) === 0;
  });
  return [...other, ...distributedTrees.slice(0, 1_200)];
}

function buildHomesteadSurroundingDecorations(seed: number): ReturnType<typeof generateSurvivalDecorations> {
  const site = activeSpaceDefinition.homesteadSite;
  if (activeSpaceDefinition.generator !== 'homestead' || site === undefined) return [];
  const result: Array<ReturnType<typeof generateSurvivalDecorations>[number]> = [];
  let id = 6_000_000_000;
  const add = (kind: typeof result[number]['kind'], tileX: number, tileY: number, variant: number): void => {
    if (tileX >= HOMESTEAD_PLOT_MIN_TILE - 2 && tileX <= HOMESTEAD_PLOT_MAX_TILE + 2
      && tileY >= HOMESTEAD_PLOT_MIN_TILE - 2 && tileY <= HOMESTEAD_PLOT_MAX_TILE + 2) return;
    result.push({ id: id++, kind, tileX, tileY, variant, animationOffset: id % 96 });
  };
  // Forest-floor details follow tree silhouettes, so mushrooms and deadwood
  // read as undergrowth rather than an unrelated uniform decal pass.
  for (const tree of cachedHomesteadResources.filter((resource) => isChoppableTreeKind(resource.kind))) {
    const hash = Math.abs(Math.imul(tree.tileX + seed, 0x45d9f3b) ^ tree.tileY);
    if (hash % 3 === 0) add('nature_mushroom', tree.tileX + hash % 3 - 1, tree.tileY + 1, hash % 8);
    if (hash % 19 === 0) add('poi_stump', tree.tileX + 2, tree.tileY, 0);
    if (hash % 29 === 0) add('poi_fallen_log', tree.tileX - 2, tree.tileY + 1, 0);
    if (hash % 11 === 0) add('nature_rock', tree.tileX + 1, tree.tileY + 2, hash % 14);
  }
  for (let tileY = 2; tileY < activeSpaceDefinition.sizeTiles - 2; tileY += 1) {
    for (let tileX = 2; tileX < activeSpaceDefinition.sizeTiles - 2; tileX += 1) {
      const roll = Math.abs(Math.imul(tileX ^ seed, 0x27d4eb2d) ^ Math.imul(tileY, 0x165667b1)) % 1_000;
      if (roll < 8) add('nature_flower', tileX, tileY, roll % 5);
      else if (roll < 16) add('nature_flower_grass', tileX, tileY, roll % 15);
      else if (roll < 28) add('nature_grass', tileX, tileY, roll % 3);
    }
  }
  // One authored pond sits in the blocked woodland apron. Its animated fish,
  // lilies, flowers, cattails and rocks use the normal weather/light pass.
  const center = Math.floor(activeSpaceDefinition.sizeTiles / 2);
  const pondX = center + ((site.worldTileX + seed) % 2 === 0 ? 38 : -38);
  const pondY = center + ((site.worldTileY + seed) % 2 === 0 ? 30 : -30);
  add('camp_pond', pondX, pondY, 0);
  add('nature_fish_shadow', pondX, pondY, 0);
  add('nature_lily_pad', pondX - 1, pondY, Math.abs(seed) % 12);
  add('nature_water_flower', pondX + 1, pondY, Math.abs(seed + 3) % 12);
  add('nature_cattail', pondX - 1, pondY + 1, Math.abs(seed + 5) % 5);
  add('nature_water_rock', pondX + 1, pondY + 1, Math.abs(seed + 7) % 10);
  return result;
}

function homesteadSurroundingResources(seed: number): readonly RenderWorldResource[] {
  ensureHomesteadSurroundings(seed);
  return cachedHomesteadResources;
}

function homesteadSurroundingDecorations(seed: number): ReturnType<typeof generateSurvivalDecorations> {
  ensureHomesteadSurroundings(seed);
  return cachedHomesteadDecorations;
}

function treeLightOccluders(snapshot: OverworldView, terrain: TerrainArray): LightTrunkOccluder[] {
  const result: LightTrunkOccluder[] = [];
  for (const resource of snapshot.resources) {
    const growthStage = (resource as WorldResource & { readonly growthStage?: number }).growthStage;
    if (resource.depleted || !isChoppableTreeKind(resource.kind)
      || (growthStage !== undefined && growthStage !== MATURE_TREE_GROWTH_STAGE)) continue;
    const worldX = resource.tileX * 16 + 8;
    const footY = (resource.tileY + 1) * 16;
    const projection = terrainProjectedDepthAtFoot(terrain, worldX, footY);
    const projectedFootY = footY - projection;
    result.push({
      obstacle: projectedLightObstacle(
        survivalResourceObstacle(resource.kind, resource.tileX, resource.tileY),
        projection,
      ),
      receiver: createSpriteLightOccluder(
        matureTreeLightAsset(resource.kind), 'base', 0, worldX, projectedFootY,
      ),
      footX: worldX,
      footY: projectedFootY,
      receiverFacing: 'south',
      shadowMode: 'column',
      elevationLayer: terrainElevationAtWorldFoot(terrain, worldX, footY),
    });
  }
  return result;
}

function terrainForSnapshot(snapshot: OverworldView): TerrainArray {
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
  const base = terrainForSpace(activeSpaceDefinition, seed, version);
  if (activeSpaceDefinition.generator !== 'cellar') return base;
  const key = `${activeSpaceDefinition.spaceId}:${seed}:${version}:${network.cellarExcavationRevision}`;
  if (cellarTerrainCache !== null && cellarTerrainCacheKey === key) return cellarTerrainCache;
  cellarTerrainCacheKey = key;
  cellarTerrainCache = terrainWithCellarExcavations(
    base,
    snapshot.cellarExcavations,
    network.cellarExcavationRevision,
  );
  return cellarTerrainCache;
}

function refreshCollision(snapshot: OverworldView): void {
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
  const nextKey = `${activeSpaceDefinition.spaceId}:${seed}:${version}:${network.resourceRevision}:${network.cellarExcavationRevision}`;
  if (collisionKey === nextKey) return;
  collisionKey = nextKey;
  const terrain = terrainForSnapshot(snapshot);
  const baseCollision = createClientCollisionMap(
    terrain,
    snapshot.resources,
    snapshot.chests,
    'ground',
    snapshot.placeables,
  );
  const obstacles = [...(baseCollision.obstacles ?? [])];
  for (const target of snapshot.combatTargets) {
    if (target.carriedBy !== undefined) continue;
    const tileX = Math.floor(target.x / TILE_SIZE_FIXED);
    const tileY = Math.floor((target.y - 1) / TILE_SIZE_FIXED);
    obstacles.push({
      left: tileX * TILE_SIZE_FIXED,
      top: tileY * TILE_SIZE_FIXED,
      right: (tileX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  for (const surface of snapshot.surfaces) {
    const halfWidth = surface.kind === 'wooden_table' ? 1 : 0;
    obstacles.push({
      left: (surface.tileX - halfWidth) * TILE_SIZE_FIXED,
      top: surface.tileY * TILE_SIZE_FIXED,
      right: (surface.tileX + halfWidth + 1) * TILE_SIZE_FIXED - 1,
      bottom: (surface.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  for (const tile of interiorFurnitureBlockingTiles(activeSpaceDefinition.generator)) {
    obstacles.push({
      left: tile.tileX * TILE_SIZE_FIXED,
      top: tile.tileY * TILE_SIZE_FIXED,
      right: (tile.tileX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (tile.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  const homes = activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    ? [...snapshot.homesteads]
    : [...snapshot.homesteads].filter((home) => home.spaceId === activeSpaceDefinition.spaceId);
  for (const home of homes) {
    const interior = activeSpaceDefinition.generator === 'homestead';
    const footprint = homesteadTentFootprint(
      interior ? HOMESTEAD_TENT_TILE.tileX : home.overworldTileX,
      interior ? HOMESTEAD_TENT_TILE.tileY : home.overworldTileY,
      interior,
    );
    obstacles.push({
      left: footprint.minX * TILE_SIZE_FIXED, top: footprint.minY * TILE_SIZE_FIXED,
      right: (footprint.maxX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (footprint.maxY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  if (activeSpaceDefinition.generator === 'homestead' && homes.length > 0) {
    for (const tile of homesteadBoundaryTiles(activeSpaceDefinition.sizeTiles)) {
      if (tile.kind === 'gate' && homes[0]?.gateOpen) continue;
      obstacles.push({
        left: tile.tileX * TILE_SIZE_FIXED, top: tile.tileY * TILE_SIZE_FIXED,
        right: (tile.tileX + 1) * TILE_SIZE_FIXED - 1,
        bottom: (tile.tileY + 1) * TILE_SIZE_FIXED - 1,
      });
    }
  }
  worldCollision = { ...baseCollision, obstacles };
  lightOcclusion = createLightOcclusionMap(
    terrain,
    [],
    [],
    [...elevatedLightOccluders(snapshot, seed, terrain), ...treeLightOccluders(snapshot, terrain)],
    art.cliff,
  );
}

function update(): void {
  const previous = predicted;
  effectPhase = (effectPhase + 1) % 4;
  worldZoom = easeWorldZoom(worldZoom, worldZoomTarget);
  network.setViewRadius(viewRadiusForViewport(renderer.cssWidth, renderer.cssHeight, worldZoom));
  latestSnapshot = network.view();
  const snapshot = latestSnapshot;
  const authoritativePosition = network.ownPosition();
  if (authoritativePosition !== null && authoritativePosition.spaceId !== observedSpaceId) {
    observedSpaceId = authoritativePosition.spaceId;
    activeSpaceDefinition = spaceDefinitionFor(
      observedSpaceId,
      instanceSpaceRowFor(observedSpaceId, snapshot.homesteads),
    )
      ?? spaceDefinitionFor(TOPSIDE_SPACE_ID)!;
    portalTransitionStartedAtMs = performance.now();
    collisionKey = '';
    groundCache.invalidateResource(0, 0);
    remoteBuffers.clear(); remoteDisplay.clear(); previousRemoteDisplay.clear();
    npcBuffers.clear(); npcDisplay.clear(); projectileBuffers.clear(); projectileDisplay.clear();
    projectileFlightTicks.clear(); projectileHitProgress.clear();
    pendingBowProjectile = null;
    predicted = playerState(authoritativePosition);
    previousPredicted = predicted;
    presentationCorrection.clear();
    const minimum = renderer.minimumZoom(activeSpaceDefinition.sizeTiles * 16);
    worldZoomTarget = Math.max(minimum, Math.min(MAX_WORLD_ZOOM, worldZoomTarget));
    worldZoom = Math.max(minimum, Math.min(MAX_WORLD_ZOOM, worldZoom));
  }
  if (snapshot.activeChest !== null && overworldUi.openWindow !== 'chest') overworldUi.openWindow = 'chest';
  if (snapshot.activeChest === null && overworldUi.openWindow === 'chest') overworldUi.openWindow = null;
  if (snapshot.activePlaceable?.kind === 'barrel' && overworldUi.openWindow !== 'barrel') overworldUi.openWindow = 'barrel';
  if (snapshot.activePlaceable === null && overworldUi.openWindow === 'barrel') overworldUi.openWindow = null;
  if (optimisticSelectedSlot !== null && snapshot.survival?.selectedSlot === optimisticSelectedSlot) {
    optimisticSelectedSlot = null;
  }
  const weatherTick = snapshot.environment?.calendarTick ?? snapshot.clock?.authorityTick ?? 0n;
  const calendar = calendarAtTick(Number(weatherTick) * SIM_STEPS_PER_AUTHORITY_TICK);
  audio.setAmbienceContext(
    calendar.season,
    authorityDayProgress(weatherTick),
    activeSpaceDefinition.audioBed === 'cave' || activeSpaceDefinition.audioBed === 'debug' ? 'cellar' : 'estate',
  );
  const activeWeather = weatherVisualState(worldWeatherMode(), weatherTick, worldWindDirection());
  const weather = activeSpaceDefinition.environment === 'outdoor' && activeSpaceDefinition.weather
    ? activeWeather
    : { ...activeWeather, raining: false, cloudShadow: 0, wind: 0 };
  rain.update(
    weather.raining,
    renderer.cssWidth,
    renderer.cssHeight,
    worldZoom,
  );
  if (observedResourceRevision !== network.resourceRevision) {
    observedResourceRevision = network.resourceRevision;
    const visibleResourceIds = new Set<bigint>();
    for (const resource of snapshot.resources) {
      visibleResourceIds.add(resource.id);
      const previousHealth = resourceHealth.get(resource.id);
      if (previousHealth !== undefined
        && previousHealth <= survivalResourceInitialHealth(resource.kind)
        && resource.health < previousHealth
        && !resource.depleted) {
        treeShakeRemaining.set(resource.id, 16);
      }
      resourceHealth.set(resource.id, resource.health);
    }
    for (const id of resourceHealth.keys()) {
      if (!visibleResourceIds.has(id)) resourceHealth.delete(id);
    }
    for (const id of treeShakeRemaining.keys()) {
      if (!visibleResourceIds.has(id)) treeShakeRemaining.delete(id);
    }
  }
  for (const [id, remaining] of treeShakeRemaining) {
    if (remaining <= 1) treeShakeRemaining.delete(id);
    else treeShakeRemaining.set(id, remaining - 1);
  }
  if (networkDirty) refreshCollision(snapshot);
  touchControls.setBlocked(
    interfaceHidden
    || overworldUi.openWindow !== null
    || characterNamePrompt.isActive
    || npcInteractionUi.active
    || chatOverlay.isOpen,
  );
  const direction = directionFromKeys();
  const mounted = localMount(snapshot) !== null;
  const sprintRequested = direction !== 'idle'
    && !mounted
    && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  if (direction !== lastDirection || sprintRequested !== lastSprinting) {
    lastDirection = direction;
    lastSprinting = sprintRequested;
    network.setMovementIntent(direction, sprintRequested);
  }
  const authoritative = network.ownPosition();
  if (authoritative !== null) {
    const reconciliation = network.reconcile(predicted, playerState(authoritative), worldCollision);
    if (reconciliation !== null) {
      if (predicted !== null && reconciliation.errorFixed > 0 && !reconciliation.hardSnap) {
        presentationCorrection.begin(predicted.position, reconciliation.player.position);
      } else if (reconciliation.hardSnap) presentationCorrection.clear();
      predicted = reconciliation.player;
    }
  }
  if (predicted !== null) {
    const playerVitals = resolvedPlayerVitals(snapshot);
    const sprintCost = playerVitals === null
      ? 1
      : sprintVigourCostForSteps(playerVitals.sprint.vigourDrainCentiPerSecond, 1);
    const sprinting = sprintRequested
      && playerVitals !== null
      && displayedVigourCenti(playerVitals.vigour) >= sprintCost;
    predicted = mounted
      ? movePlayerAtSpeed(predicted, direction === 'idle' ? null : direction, worldCollision, 2)
      : sprinting
        ? movePlayerAtSpeedPermille(
          predicted, direction, worldCollision,
          playerVitals.sprint.speedPermille,
        )
        : movePlayer(predicted, direction === 'idle' ? null : direction, worldCollision);
    network.recordPredictedStep(
      direction,
      predicted,
      sprinting ? playerVitals.sprint.speedPermille : 1_000,
    );
  }
  previousPredicted = previous ?? predicted;
  presentationCorrection.advance(1 / SIM_TICKS_PER_SECOND);

  network.drainPositionCommits((player) => {
    const id = player.identity.toHexString();
    if (player.authorityTick > latestPositionAuthorityTick) latestPositionAuthorityTick = player.authorityTick;
    if (id === snapshot.identityHex) return;
    const buffer = remoteBuffers.get(id) ?? new RemoteSnapshotBuffer();
    buffer.push(player);
    remoteBuffers.set(id, buffer);
  });
  network.drainDeletedPositionIds((id) => {
    remoteBuffers.delete(id);
    remoteDisplay.delete(id);
    previousRemoteDisplay.delete(id);
    avatarAnimations.delete(id);
  });
  network.drainNpcCommits((npc) => {
    const buffer = npcBuffers.get(npc.id) ?? new RemoteSnapshotBuffer();
    buffer.push({
      authorityTick: npc.authorityTick,
      x: npc.x,
      y: npc.y,
      facing: npc.facing,
      actionKind: 'none',
      actionStartedTick: 0n,
      equippedKind: 'empty',
      equippedLit: true,
    });
    npcBuffers.set(npc.id, buffer);
  });
  network.drainDeletedNpcIds((id) => {
    npcBuffers.delete(id);
    npcDisplay.delete(id);
  });
  network.drainProjectileCommits(({ row, authorityTick }) => {
    const buffer = projectileBuffers.get(row.id) ?? new ProjectileSnapshotBuffer();
    const flightTicks = projectileFlightTicks.get(row.id)
      ?? (row.state === 'flying'
        ? Math.max(1, Number(row.expiresTick - row.spawnedTick) - 1)
        : BOW_MAX_PROJECTILE_FLIGHT_TICKS);
    projectileFlightTicks.set(row.id, flightTicks);
    if (row.state === 'hit' && !projectileHitProgress.has(row.id)) {
      projectileHitProgress.set(row.id, Math.max(
        0,
        Math.min(1, Number(authorityTick - row.spawnedTick) / flightTicks),
      ));
    }
    buffer.push({
      authorityTick,
      spawnedTick: row.spawnedTick,
      x: row.x,
      y: row.y,
      velocityX: row.velocityX,
      velocityY: row.velocityY,
      state: row.state,
    });
    projectileBuffers.set(row.id, buffer);
  });
  network.drainDeletedProjectileIds((id) => {
    projectileBuffers.delete(id);
    projectileDisplay.delete(id);
    projectileFlightTicks.delete(id);
    projectileHitProgress.delete(id);
  });
  const combatTextNow = performance.now();
  network.drainCombatTextCommits((commit) => {
    floatingCombatTexts.push({ ...commit, startedAtMs: combatTextNow });
    if (floatingCombatTexts.length > 32) floatingCombatTexts.shift();
  });
  for (let index = floatingCombatTexts.length - 1; index >= 0; index -= 1) {
    if (combatTextNow - floatingCombatTexts[index]!.startedAtMs >= 1_100) {
      floatingCombatTexts.splice(index, 1);
    }
  }
  const authorityTick = presentationAuthorityTick(
    snapshot.clock?.authorityTick,
    latestPositionAuthorityTick,
  );
  const renderTick = renderTickClock.advance(1 / SIM_TICKS_PER_SECOND, authorityTick);
  visualTickClock.advance(
    1 / SIM_TICKS_PER_SECOND,
    authorityTick,
  );
  for (const [id, buffer] of remoteBuffers) {
    const sample = buffer.sample(renderTick, worldCollision);
    if (sample !== null) {
      const current = remoteDisplay.get(id);
      if (current !== undefined) previousRemoteDisplay.set(id, current);
      remoteDisplay.set(id, sample);
    }
  }
  for (const [id, buffer] of npcBuffers) {
    // Water and flying wildlife intentionally occupy terrain that blocks
    // players, so NPC presentation must not use player collision extrapolation.
    const sample = buffer.sample(renderTick);
    if (sample !== null) npcDisplay.set(id, sample);
  }
  for (const [id, buffer] of projectileBuffers) {
    const sample = buffer.sample(renderTick);
    if (sample !== null) projectileDisplay.set(id, sample);
  }
  if (pendingBowProjectile !== null) {
    const pending = pendingBowProjectile;
    const authoritativeShotArrived = [...snapshot.projectiles].some((projectile) => (
      projectile.owner.toHexString() === snapshot.identityHex
      && !pending.ownerProjectileIdsAtRelease.has(projectile.id)
      && projectile.spawnedTick >= pending.releasedAtAuthorityTick
    ));
    if (authoritativeShotArrived
      || sampleLocalProjectilePrediction(pending, performance.now()) === null) {
      pendingBowProjectile = null;
    }
  }
  if (networkDirty) {
    networkDirty = false;
    const status = snapshot.error === null
      ? snapshot.connected ? 'SHARED ISLAND ONLINE' : 'CONNECTING TO SHARED ISLAND'
      : `NETWORK ${snapshot.error}`;
    if (status !== lastNetworkStatus) {
      lastNetworkStatus = status;
      setToast(status, snapshot.error === null ? 'info' : 'failure');
    }
  }
  if (toastTicks > 0) toastTicks -= 1;
  if (vigourDenyTicks > 0) vigourDenyTicks -= 1;
}

function profileName(profiles: OverworldView['profiles'], identity: string): string {
  return profiles.find((profile) => profile.identity.toHexString() === identity)?.displayName ?? 'FARMER';
}

let optimisticSelectedSlot: number | null = null;
let optimisticVigourCenti: number | null = null;
let vigourDenyTicks = 0;
const EQUIPMENT_SLOT_FIRST = 29;
const EQUIPMENT_SLOT_END_EXCLUSIVE = 38;

function selectedItem(snapshot: OverworldView): string {
  return selectedItemRow(snapshot)?.itemKind ?? 'empty';
}

function selectedItemRow(snapshot: OverworldView) {
  const selected = optimisticSelectedSlot ?? snapshot.survival?.selectedSlot ?? 0;
  return snapshot.inventorySlots.find((inventory) => inventory.slot === selected);
}

function snapshotEffectModifiers(snapshot: OverworldView) {
  const authorityTick = snapshot.clock?.authorityTick ?? 0n;
  return modifiersForEffects([...snapshot.effects]
    .filter((effect) => (EFFECT_KINDS as readonly string[]).includes(effect.effectKind))
    .map((effect) => ({
      id: effect.id,
      effectKind: effect.effectKind as EffectKind,
      stacks: effect.stacks,
      appliedTick: effect.appliedTick,
      expiresTick: effect.expiresTick,
    })), authorityTick);
}

function snapshotPlayerModifiers(snapshot: OverworldView) {
  const equipment = [...snapshot.inventorySlots]
    .filter((slot) => slot.slot >= EQUIPMENT_SLOT_FIRST && slot.slot < EQUIPMENT_SLOT_END_EXCLUSIVE
      && slot.itemKind !== 'empty' && slot.quantity > 0)
    .flatMap((slot) => itemModifiers(slot.itemKind).map((modifier) => ({
      ...modifier,
      id: `equipment.${slot.slot}.${modifier.id}`,
      source: 'equipment' as const,
    })));
  return [...equipment, ...snapshotEffectModifiers(snapshot)];
}

function resolvedPlayerVitals(snapshot: OverworldView) {
  const row = snapshot.stats;
  if (row === null) return null;
  const resolved = resolveStats({
    str: row.str, dex: row.dex, con: row.con, int: row.int, wis: row.wis, cha: row.cha,
  }, snapshotPlayerModifiers(snapshot));
  const sprint = resolveSprintAbility(resolved.attributes, snapshotPlayerModifiers(snapshot));
  return {
    health: row.healthCenti, maxHealth: resolved.maxHealthCenti,
    mana: row.manaCenti, maxMana: resolved.maxManaCenti,
    vigour: row.vigourCenti, maxVigour: resolved.maxVigourCenti,
    attributes: resolved.attributes,
    sprint,
  };
}

function performToolAction(
  call: () => Promise<void>,
  success: string,
  itemKind: VitalsToolKind,
  whiff = false,
  presentationElapsedMs = 0,
): boolean {
  const rejection = itemActionRejection(selectedItemRow(latestSnapshot), latestSnapshot.inventorySlots);
  if (rejection !== null) {
    setFailureToast(new Error(rejection));
    return false;
  }
  const stats = latestSnapshot.stats;
  const baseCost = TOOL_VIGOUR_BALANCE[itemKind].costCenti;
  const fullCost = resolveModifierTarget('toolVigourCost', baseCost, snapshotPlayerModifiers(latestSnapshot));
  const cost = whiff ? Math.ceil(fullCost / 2) : fullCost;
  const available = optimisticVigourCenti ?? stats?.vigourCenti ?? 0;
  if (stats !== null && available < cost) {
    vigourDenyTicks = 24;
    setToast('INSUFFICIENT VIGOUR', 'failure', 90);
    return false;
  }
  if (stats !== null) optimisticVigourCenti = Math.max(0, available - cost);
  const actionKind = avatarActionForEquippedKind(itemKind);
  if (actionKind !== null) startPredictedAction(actionKind, presentationElapsedMs);
  void audio.unlock().then(async () => await audio.playSfx('tool_swing')).catch(() => undefined);
  showResult(call().finally(() => { optimisticVigourCenti = null; }), success);
  return true;
}

interface FarmToolTarget {
  readonly tileX: number;
  readonly tileY: number;
}

function facePredictedTowardTile(target: FarmToolTarget): void {
  if (predicted === null) return;
  const facing = directionFromAim(
    target.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - predicted.position.x,
    target.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - predicted.position.y,
  );
  if (facing !== null) predicted = { ...predicted, facing };
}

function performFarmToolAction(
  target: FarmToolTarget,
  itemKind: 'hoe' | 'watering_can',
  restoring = false,
): boolean {
  const performed = performToolAction(
    () => (restoring
      ? network.restoreFarmTile(target.tileX, target.tileY)
      : network.useFarmTool(target.tileX, target.tileY)
    ).then(() => {
      if (itemKind !== 'watering_can') return;
      rain.spawnWorldSplash(
        target.tileX * 16 + 8,
        target.tileY * 16 + 12,
      );
    }),
    restoring ? 'GRASS RESTORED' : itemKind === 'hoe' ? 'SOIL TILLED' : 'SOIL WATERED',
    itemKind,
  );
  if (performed) facePredictedTowardTile(target);
  return performed;
}

function resolvedBowChargeCostCenti(chargeMs: number): number {
  return resolveModifierTarget(
    'toolVigourCost',
    bowChargeVigourCostCenti(chargeMs),
    snapshotPlayerModifiers(latestSnapshot),
  );
}

function affordableBowChargeMs(availableVigourCenti: number): number {
  if (availableVigourCenti < resolvedBowChargeCostCenti(0)) return 0;
  let low = 0;
  let high = BOW_MAX_CHARGE_MS;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (resolvedBowChargeCostCenti(middle) <= availableVigourCenti) low = middle;
    else high = middle - 1;
  }
  return low;
}

function currentBowChargeMs(nowMs = performance.now()): number {
  if (bowChargeStartedAtMs === null) return 0;
  const available = bowChargeStartingVigourCenti
    ?? latestSnapshot.stats?.vigourCenti
    ?? 0;
  return Math.min(
    BOW_MAX_CHARGE_MS,
    affordableBowChargeMs(available),
    Math.max(0, Math.round(nowMs - bowChargeStartedAtMs)),
  );
}

function displayedVigourCenti(authoritativeVigourCenti: number): number {
  if (bowChargeStartedAtMs === null || bowChargeStartingVigourCenti === null) {
    return optimisticVigourCenti ?? authoritativeVigourCenti;
  }
  return Math.max(
    0,
    bowChargeStartingVigourCenti - resolvedBowChargeCostCenti(currentBowChargeMs()),
  );
}

function isVitalsTool(value: string): value is VitalsToolKind {
  return Object.prototype.hasOwnProperty.call(TOOL_VIGOUR_BALANCE, value);
}

function bowTargetOriginWorld(): { readonly x: number; readonly y: number } | null {
  if (predicted === null) return null;
  const origin = bowProjectileTargetOrigin(predicted.position);
  return {
    x: origin.x / FIXED_UNITS_PER_PIXEL,
    y: origin.y / FIXED_UNITS_PER_PIXEL,
  };
}

function cursorAimVector(): { readonly x: number; readonly y: number } | null {
  const origin = bowTargetOriginWorld();
  if (origin === null || worldPointer === null) return null;
  return {
    x: latestCameraX + worldPointer.x / latestRenderedZoom - origin.x,
    y: latestCameraY + worldPointer.y / latestRenderedZoom - origin.y,
  };
}

function cursorFacing(): Direction | null {
  const aim = cursorAimVector();
  return aim === null ? null : directionFromAim(aim.x, aim.y);
}

function drawBowAimGuide(
  context: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  zoom: number,
  terrainProjectionAt: (worldX: number, worldY: number) => number,
): boolean {
  if (predicted === null) return false;
  const aim = cursorAimVector();
  if (aim === null) return false;
  const chargeMs = currentBowChargeMs();
  const encodedAim = encodedBowTargetAim(aim.x, aim.y, BOW_MAX_TARGET_RANGE_PIXELS);
  if (encodedAim === null) return false;
  const normalizedAim = normalizedBowAim(encodedAim.x, encodedAim.y);
  const shot = bowShotForTarget(encodedAim.x, encodedAim.y, BOW_MAX_TARGET_RANGE_PIXELS);
  if (normalizedAim === null || shot === null) return false;
  const mounted = localMount(latestSnapshot) !== null;
  const origin = bowProjectileOrigin(predicted.position, normalizedAim, mounted);
  const range = bowProjectileRangePixels(
    { x: shot.velocityX, y: shot.velocityY },
    shot.lifetimeTicks,
  );
  const targetDistance = Math.max(
    BOW_MIN_TARGET_RANGE_PIXELS,
    shot.rangeFraction * BOW_MAX_TARGET_RANGE_PIXELS,
  );
  const chargedTracerFraction = bowChargeTracerFraction(
    chargeMs,
    targetDistance,
    BOW_MAX_TARGET_RANGE_PIXELS,
  );
  const dots = Math.max(2, Math.floor(range / 12));
  const pixel = Math.max(1, Math.round(zoom));
  let landingX = 0;
  let landingY = 0;
  context.save();
  for (let dot = 1; dot <= dots; dot += 1) {
    const progress = dot / dots;
    const physical = {
      x: origin.x + shot.velocityX * shot.lifetimeTicks * progress,
      y: origin.y + shot.velocityY * shot.lifetimeTicks * progress,
    };
    const arc = bowProjectileArcPresentation(
      physical,
      { x: shot.velocityX, y: shot.velocityY },
      mounted,
      progress,
      shot.lifetimeTicks,
    );
    const physicalX = physical.x / FIXED_UNITS_PER_PIXEL;
    const physicalY = physical.y / FIXED_UNITS_PER_PIXEL;
    const screenX = Math.round((arc.point.x / FIXED_UNITS_PER_PIXEL - cameraX) * zoom);
    const screenY = Math.round((
      arc.point.y / FIXED_UNITS_PER_PIXEL
      - terrainProjectionAt(physicalX, physicalY)
      - cameraY
    ) * zoom);
    context.fillStyle = progress <= chargedTracerFraction ? '#e34b43' : '#f1dfb4cc';
    context.fillRect(screenX, screenY, pixel, pixel);
    landingX = screenX;
    landingY = screenY;
  }
  context.fillStyle = '#f1dfb4cc';
  context.fillRect(landingX - 2 * pixel, landingY, 5 * pixel, pixel);
  context.fillRect(landingX, landingY - 2 * pixel, pixel, 5 * pixel);
  context.restore();
  return true;
}

function targetResource(snapshot: OverworldView): WorldResource | null {
  if (predicted === null) return null;
  const itemKind = selectedItem(snapshot);
  const eligible = [...snapshot.resources].filter((resource) => itemKind === 'axe'
    ? isAxeHarvestableResourceKind(resource.kind)
    : itemKind === 'pickaxe'
      ? isMineableOreKind(resource.kind) || isBreakableRockKind(resource.kind)
      : !isGatherableResourceKind(resource.kind));
  return facedResource(
    predicted.position.x,
    predicted.position.y,
    equippedItemFacing(itemKind, predicted.facing, cursorFacing()),
    eligible,
    resourceToolReachFixed(itemKind),
    resourceToolForwardOffsetFixed(itemKind),
  );
}

function targetCellarWall(snapshot: OverworldView): { readonly tileX: number; readonly tileY: number } | null {
  if (predicted === null || activeSpaceDefinition.generator !== 'cellar' || selectedItem(snapshot) !== 'pickaxe') {
    return null;
  }
  const target = targetInteractionTile();
  if (target === null) return null;
  const terrain = terrainForSnapshot(snapshot);
  const wall = cellarWallSourceAtProjectedTile(terrain, target.tileX, target.tileY);
  if (wall === null) return null;
  const targetX = wall.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const targetY = wall.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const reach = 2 * TILE_SIZE_FIXED;
  const dx = targetX - predicted.position.x;
  const dy = targetY - predicted.position.y;
  if (dx * dx + dy * dy > reach * reach) return null;
  return wall;
}

function targetGatherableResource(snapshot: OverworldView): WorldResource | null {
  if (predicted === null) return null;
  return facedResource(
    predicted.position.x,
    predicted.position.y,
    predicted.facing,
    [...snapshot.resources].filter((resource) => isGatherableResourceKind(resource.kind)),
    24 * FIXED_UNITS_PER_PIXEL,
  );
}

function targetInteractionTile(): { readonly tileX: number; readonly tileY: number } | null {
  if (predicted === null) return null;
  if (worldPointer !== null) return hoveredInteractionTile;
  return facedInteractionTile(predicted.position.x, predicted.position.y, predicted.facing);
}

function targetFarmTile(): { readonly tileX: number; readonly tileY: number } | null {
  if (activeSpaceDefinition.spaceId !== TOPSIDE_SPACE_ID) {
    const home = latestSnapshot.homesteads.get(activeSpaceDefinition.spaceId);
    if (home === undefined || home.spaceId !== activeSpaceDefinition.spaceId
      || latestSnapshot.identityHex === null
      || home.owner.toHexString() !== latestSnapshot.identityHex) return null;
  }
  return targetInteractionTile();
}

function targetCrop(snapshot: OverworldView): WorldCrop | null {
  const tile = targetFarmTile();
  if (tile === null) return null;
  return snapshot.crops.get(farmSoilKey(
    tile.tileX,
    tile.tileY,
    activeSpaceDefinition.spaceId,
  )) ?? null;
}

function cropTimeLabel(remainingTicks: bigint): string {
  const totalMinutes = Math.max(1, Math.ceil(Number(remainingTicks) / AUTHORITY_HZ / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}H ${String(minutes).padStart(2, '0')}M` : `${minutes}M`;
}

function refreshHoveredInteractionTile(): void {
  hoveredInteractionTile = predicted === null || worldPointer === null
    ? null
    : interactionTileAtWorldPoint(
      predicted.position.x,
      predicted.position.y,
      latestCameraX + worldPointer.x / latestRenderedZoom,
      latestCameraY + worldPointer.y / latestRenderedZoom,
      activeSpaceDefinition.sizeTiles,
    );
}

function placementTileBlocked(
  snapshot: OverworldView,
  tile: { readonly tileX: number; readonly tileY: number },
  excludeLocalPlayer = false,
): boolean {
  const players = [...snapshot.players].filter((player) => {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    return (!excludeLocalPlayer || !local)
      && worldPlayerParticipatesInCollision(local, snapshot.profiles.get(id)?.online);
  }).map((player) => {
    const local = player.identity.toHexString() === snapshot.identityHex;
    return local && predicted !== null ? predicted.position : { x: player.x, y: player.y };
  });
  return worldPlacementTileIsBlocked(worldCollision, tile, players);
}

function homesteadPlacementBlocked(
  snapshot: OverworldView,
  anchor: { readonly tileX: number; readonly tileY: number },
): boolean {
  const tiles = homesteadMarkerPlacementTiles(anchor.tileX, anchor.tileY);
  if (tiles.some((tile) => placementTileBlocked(snapshot, tile, true))) return true;
  return [...snapshot.homesteads].some((home) => (
    Math.abs(home.overworldTileX - anchor.tileX) <= 4
    && Math.abs(home.overworldTileY - anchor.tileY) <= 4
  ));
}

function targetWorldItem(snapshot: OverworldView): WorldItem | null {
  if (predicted === null) return null;
  return nearbyWorldItem(predicted.position.x, predicted.position.y, snapshot.worldItems);
}

function targetEmbeddedArrow(snapshot: OverworldView): WorldProjectile | null {
  if (predicted === null) return null;
  return nearbyWorldItem(
    predicted.position.x,
    predicted.position.y,
    [...snapshot.projectiles].filter((projectile) => (
      projectile.state === 'hit' && projectile.hitKind === 'combat_target'
    )),
  );
}

function targetGroundLantern(snapshot: OverworldView): WorldItem | null {
  if (predicted === null) return null;
  return nearbyWorldItem(
    predicted.position.x,
    predicted.position.y,
    [...snapshot.worldItems].filter((item) => item.itemKind === 'lantern'),
  );
}

function carriedChest(snapshot: OverworldView): WorldChest | null {
  if (snapshot.identityHex === null) return null;
  return snapshot.chests.find((chest) => chest.carriedBy?.toHexString() === snapshot.identityHex) ?? null;
}

function combatTargetTile(target: WorldCombatTarget): { readonly tileX: number; readonly tileY: number } {
  return {
    tileX: Math.floor(target.x / TILE_SIZE_FIXED),
    tileY: Math.floor((target.y - 1) / TILE_SIZE_FIXED),
  };
}

function carriedCombatTarget(snapshot: OverworldView): WorldCombatTarget | null {
  if (snapshot.identityHex === null) return null;
  return snapshot.combatTargets.find(
    (target) => target.carriedBy?.toHexString() === snapshot.identityHex,
  ) ?? null;
}

function carriedPlaceable(snapshot: OverworldView): WorldPlaceable | null {
  if (snapshot.identityHex === null) return null;
  return snapshot.placeables.find(
    (placeable) => placeable.carriedBy?.toHexString() === snapshot.identityHex,
  ) ?? null;
}

function targetFacedCombatTarget(snapshot: OverworldView): WorldCombatTarget | null {
  if (predicted === null) return null;
  const tile = facedInteractionTile(predicted.position.x, predicted.position.y, predicted.facing);
  return snapshot.combatTargets.find((target) => {
    if (target.carriedBy !== undefined) return false;
    const targetTile = combatTargetTile(target);
    return targetTile.tileX === tile.tileX && targetTile.tileY === tile.tileY;
  }) ?? null;
}

function targetChest(snapshot: OverworldView): WorldChest | null {
  if (predicted === null) return null;
  return nearestTileTarget(
    predicted.position.x,
    predicted.position.y,
    [...snapshot.chests].filter((chest) => chest.carriedBy === undefined),
    CHEST_INTERACTION_REACH_FIXED,
  );
}

function targetFacedChest(snapshot: OverworldView): WorldChest | null {
  if (predicted === null) return null;
  let tileX = Math.floor(predicted.position.x / TILE_SIZE_FIXED);
  let tileY = Math.floor(predicted.position.y / TILE_SIZE_FIXED);
  if (predicted.facing.includes('Left') || predicted.facing === 'left') tileX -= 1;
  if (predicted.facing.includes('Right') || predicted.facing === 'right') tileX += 1;
  if (predicted.facing.includes('up') || predicted.facing === 'up') tileY -= 1;
  if (predicted.facing.includes('down') || predicted.facing === 'down') tileY += 1;
  return snapshot.chests.find((chest) => chest.carriedBy === undefined && chest.tileX === tileX && chest.tileY === tileY) ?? null;
}

function targetPlaceable(snapshot: OverworldView): WorldPlaceable | null {
  if (predicted === null) return null;
  const target = facedInteractionTile(predicted.position.x, predicted.position.y, predicted.facing);
  return snapshot.placeables.find((row) => row.carriedBy === undefined
    && row.tileX === target.tileX && row.tileY === target.tileY) ?? null;
}

function nearbyCraftingStations(snapshot: OverworldView): readonly CraftingStation[] {
  const player = network.ownPosition();
  if (player === null) return [];
  const playerTile = {
    spaceId: player.spaceId,
    tileX: Math.floor(player.x / TILE_SIZE_FIXED),
    tileY: Math.floor(player.y / TILE_SIZE_FIXED),
  };
  const stations = new Set<CraftingStation>();
  for (const row of snapshot.placeables) {
    if (row.carriedBy !== undefined) continue;
    const station = placeableDefinition(row.kind)?.station;
    if (station !== null && station !== undefined
      && craftingStationWithinReach(playerTile, row, CRAFTING_STATION_REACH_TILES)) stations.add(station);
  }
  return [...stations];
}

function localMount(snapshot: OverworldView): WorldNpc | null {
  if (snapshot.identityHex === null) return null;
  return snapshot.npcs.find((npc) => npc.rider?.toHexString() === snapshot.identityHex) ?? null;
}

function wildlifeProfile(snapshot: OverworldView, npcId: bigint): { readonly species: WildlifeSpecies; readonly variant: number } | null {
  const profile = snapshot.wildlifeProfiles.get(npcId);
  if (profile === undefined || !isWildlifeSpecies(profile.species)) return null;
  return { species: profile.species, variant: profile.variant };
}

function npcTargetDimensions(species: WildlifeSpecies | null): { readonly halfWidth: number; readonly height: number } {
  if (species === 'horse' || species === 'cow' || species === 'camel') return { halfWidth: 16, height: 26 };
  if (species === 'sheep' || species === 'pig' || species === 'swan' || species === 'goose') return { halfWidth: 12, height: 20 };
  if (species === 'bee' || species === 'butterfly' || species === 'scarab') return { halfWidth: 7, height: 14 };
  return { halfWidth: 10, height: 18 };
}

function targetableFromVisualBounds(
  target: SelectedEntityTarget,
  bounds: WorldVisualBounds | null,
  fallbackX: number,
  fallbackY: number,
  fallback: { readonly halfWidth: number; readonly height: number },
): TargetableWorldEntity {
  if (bounds === null) return { target, x: fallbackX, y: fallbackY, ...fallback };
  const padding = 2;
  const left = bounds.left - padding;
  const right = bounds.right + padding;
  const top = bounds.top - padding;
  const bottom = bounds.bottom + padding;
  const y = bottom - 3;
  return {
    target,
    x: (left + right) / 2,
    y,
    halfWidth: Math.max(2, (right - left) / 2),
    height: Math.max(1, y - top),
  };
}

function selectedTargetVitals(snapshot: OverworldView): OverworldUiTargetVitals | undefined {
  const target = selectedEntityTarget;
  if (target === null) return undefined;
  if (target.kind === 'player') {
    if (target.id === snapshot.identityHex || snapshot.players.get(target.id) === undefined
      || snapshot.profiles.get(target.id)?.online !== true) return undefined;
    const displayName = profileName(snapshot.profiles, target.id);
    return {
      targetId: targetKey(target), displayName,
      // Exact remote player vitals remain private until the combat-era public
      // percentage projection can be added through the world migration gate.
      health: 100, maxHealth: 100,
      portrait: { kind: 'player', playerId: target.id },
    };
  }
  if (target.kind === 'combat_target') {
    const combatTarget = snapshot.combatTargets.get(target.id);
    if (combatTarget === undefined || combatTarget.carriedBy !== undefined) return undefined;
    return {
      targetId: targetKey(target),
      displayName: 'Archery Target',
      health: Math.ceil(combatTarget.healthCenti / 100),
      maxHealth: Math.max(1, Math.ceil(combatTarget.maxHealthCenti / 100)),
      portrait: { kind: 'combat_target' },
    };
  }
  const npc = snapshot.npcs.get(target.id);
  if (npc === undefined || npc.rider !== undefined || npc.wanderDirection === 'inside_hive') return undefined;
  const profile = wildlifeProfile(snapshot, npc.id);
  const merchant = snapshot.merchants.get(npc.id) !== undefined;
  const maximumHealth = profile === null
    ? Math.max(1, npc.health, 100)
    : Math.ceil(resolveCreatureStats(profile.species).maxHealthCenti / 100);
  return {
    targetId: targetKey(target),
    displayName: npc.displayName.trim() || profile?.species.replaceAll('_', ' ') || npc.kind.replaceAll('_', ' '),
    health: npc.health,
    maxHealth: maximumHealth,
    portrait: {
      kind: 'npc', npcKind: merchant ? 'merchant' : npc.kind,
      ...(profile === null ? {} : { species: profile.species }),
      variant: profile?.variant ?? 0,
    },
  };
}

function drawSelectedEntityMarker(
  context: CanvasRenderingContext2D,
  entity: TargetableWorldEntity,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  const left = Math.round((entity.x - entity.halfWidth - cameraX) * zoom);
  const right = Math.round((entity.x + entity.halfWidth - cameraX) * zoom);
  const top = Math.round((entity.y - entity.height - cameraY) * zoom);
  const bottom = Math.round((entity.y + 3 - cameraY) * zoom);
  const arm = Math.max(3, Math.round(4 * zoom));
  const thickness = Math.max(1, Math.round(zoom));
  context.save();
  context.fillStyle = '#3f2832';
  for (const offset of [-thickness, thickness] as const) {
    context.fillRect(left + offset, top + offset, arm, thickness);
    context.fillRect(left + offset, top + offset, thickness, arm);
    context.fillRect(right - arm + offset, top + offset, arm, thickness);
    context.fillRect(right - thickness + offset, top + offset, thickness, arm);
    context.fillRect(left + offset, bottom - thickness + offset, arm, thickness);
    context.fillRect(left + offset, bottom - arm + offset, thickness, arm);
    context.fillRect(right - arm + offset, bottom - thickness + offset, arm, thickness);
    context.fillRect(right - thickness + offset, bottom - arm + offset, thickness, arm);
  }
  context.fillStyle = '#fee761';
  context.fillRect(left, top, arm, thickness); context.fillRect(left, top, thickness, arm);
  context.fillRect(right - arm, top, arm, thickness); context.fillRect(right - thickness, top, thickness, arm);
  context.fillRect(left, bottom - thickness, arm, thickness); context.fillRect(left, bottom - arm, thickness, arm);
  context.fillRect(right - arm, bottom - thickness, arm, thickness);
  context.fillRect(right - thickness, bottom - arm, thickness, arm);
  context.restore();
}

function horseLabel(horse: WorldNpc): string {
  return horse.displayName.trim() || 'HORSE';
}

function targetHorse(snapshot: OverworldView): WorldNpc | null {
  const mounted = localMount(snapshot);
  if (mounted !== null) return mounted;
  if (predicted === null) return null;
  let nearest: WorldNpc | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const npc of snapshot.npcs) {
    if (npc.kind !== 'horse' || npc.rider !== undefined) continue;
    if (!isHorseWithinMountReach(predicted.position, { x: npc.x, y: npc.y })) continue;
    const dx = npc.x - predicted.position.x;
    const dy = npc.y - predicted.position.y;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = npc;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function targetMerchant(snapshot: OverworldView): WorldNpc | null {
  if (predicted === null || localMount(snapshot) !== null) return null;
  const maximumDistanceSquared = (3 * TILE_SIZE_FIXED) ** 2;
  let nearest: WorldNpc | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const npc of snapshot.npcs) {
    if (snapshot.merchants.get(npc.id) === undefined) continue;
    const dx = npc.x - predicted.position.x;
    const dy = npc.y - predicted.position.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > maximumDistanceSquared || distanceSquared >= nearestDistanceSquared) continue;
    nearest = npc;
    nearestDistanceSquared = distanceSquared;
  }
  return nearest;
}

type TargetCampfire =
  | { readonly targetKind: 'landmark'; readonly id: bigint; readonly tileX: number; readonly tileY: number; readonly lit: boolean }
  | { readonly targetKind: 'placeable'; readonly id: bigint; readonly tileX: number; readonly tileY: number; readonly lit: boolean };

function targetCampfire(snapshot: OverworldView): TargetCampfire | null {
  if (predicted === null || localMount(snapshot) !== null) return null;
  const placed = targetPlaceable(snapshot);
  if (placed?.kind === 'campfire') return {
    targetKind: 'placeable', id: placed.id, tileX: placed.tileX, tileY: placed.tileY, lit: placed.lit,
  };
  if (activeSpaceDefinition.spaceId !== TOPSIDE_SPACE_ID) return null;
  const campfire = generateSurvivalDecorations(snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED)
    .find((decoration) => decoration.kind === 'camp_campfire');
  if (campfire === undefined) return null;
  const x = campfire.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const y = campfire.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const dx = x - predicted.position.x;
  const dy = y - predicted.position.y;
  const state = snapshot.campfires?.get(BigInt(campfire.id));
  return dx * dx + dy * dy <= (2 * TILE_SIZE_FIXED) ** 2
    ? { targetKind: 'landmark', id: BigInt(campfire.id), tileX: campfire.tileX, tileY: campfire.tileY, lit: state?.lit ?? true }
    : null;
}

function targetPortal(snapshot: OverworldView): SpacePortal | null {
  const position = network.ownPosition();
  if (position === null) return null;
  const tileX = Math.floor(position.x / TILE_SIZE_FIXED);
  const tileY = Math.floor(position.y / TILE_SIZE_FIXED);
  return [...snapshot.portals].find((portal) => portal.fromSpace === position.spaceId
    && Math.abs(portal.fromTileX - tileX) <= 1
    && Math.abs(portal.fromTileY - tileY) <= 1) ?? null;
}

function targetOwnedHomesteadGate(snapshot: OverworldView): { readonly open: boolean } | null {
  if (predicted === null || snapshot.identityHex === null) return null;
  const home = snapshot.homesteads.get(activeSpaceDefinition.spaceId);
  if (home === undefined || home.spaceId !== activeSpaceDefinition.spaceId
    || home.owner.toHexString() !== snapshot.identityHex) return null;
  const point = tileInteractionPoint(HOMESTEAD_GATE_TILE.tileX, HOMESTEAD_GATE_TILE.tileY);
  const dx = point.x - predicted.position.x;
  const dy = point.y - predicted.position.y;
  return dx * dx + dy * dy <= (2 * TILE_SIZE_FIXED) ** 2 ? { open: home.gateOpen } : null;
}

type EInteractionTarget =
  | (InteractionCandidate & { readonly kind: 'portal'; readonly portal: SpacePortal })
  | (InteractionCandidate & { readonly kind: 'placeable'; readonly placeable: WorldPlaceable })
  | (InteractionCandidate & { readonly kind: 'chest'; readonly chest: WorldChest })
  | (InteractionCandidate & { readonly kind: 'campfire'; readonly campfire: TargetCampfire })
  | (InteractionCandidate & { readonly kind: 'merchant'; readonly npc: WorldNpc })
  | (InteractionCandidate & { readonly kind: 'horse'; readonly npc: WorldNpc })
  | (InteractionCandidate & { readonly kind: 'gatherable'; readonly resource: WorldResource })
  | (InteractionCandidate & { readonly kind: 'quest_item'; readonly item: QuestWorldItem })
  | (InteractionCandidate & { readonly kind: 'embedded_arrow'; readonly projectile: WorldProjectile })
  | (InteractionCandidate & { readonly kind: 'world_item'; readonly item: WorldItem });

function tileInteractionPoint(tileX: number, tileY: number): { readonly x: number; readonly y: number } {
  return {
    x: tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  };
}

function targetInteraction(snapshot: OverworldView): EInteractionTarget | null {
  if (predicted === null) return null;
  const candidates: EInteractionTarget[] = [];
  const portal = targetPortal(snapshot);
  if (portal !== null) candidates.push({
    kind: 'portal', ...tileInteractionPoint(portal.fromTileX, portal.fromTileY),
    stableId: `portal:${portal.id}`, portal,
  });
  const placeable = targetPlaceable(snapshot);
  if (placeable?.kind === 'fence_gate' || placeable?.kind === 'barrel' || placeable?.kind === 'anvil') candidates.push({
    kind: 'placeable', ...tileInteractionPoint(placeable.tileX, placeable.tileY),
    stableId: `placeable:${placeable.id}`, placeable,
  });
  const chest = targetChest(snapshot);
  if (chest !== null) candidates.push({
    kind: 'chest', ...tileInteractionPoint(chest.tileX, chest.tileY),
    stableId: `chest:${chest.id}`, chest,
  });
  const campfire = targetCampfire(snapshot);
  if (campfire !== null) candidates.push({
    kind: 'campfire', ...tileInteractionPoint(campfire.tileX, campfire.tileY),
    stableId: `campfire:${campfire.targetKind}:${campfire.id}`,
    campfire,
  });
  const merchant = targetMerchant(snapshot);
  if (merchant !== null) candidates.push({
    kind: 'merchant', x: merchant.x, y: merchant.y,
    stableId: `merchant:${merchant.id}`, npc: merchant,
  });
  const horse = targetHorse(snapshot);
  if (horse !== null) candidates.push({
    kind: 'horse', x: horse.x, y: horse.y,
    stableId: `horse:${horse.id}`, npc: horse,
  });
  const gatherable = targetGatherableResource(snapshot);
  if (gatherable !== null) candidates.push({
    kind: 'gatherable', ...tileInteractionPoint(gatherable.tileX, gatherable.tileY),
    stableId: `resource:${gatherable.id}`, resource: gatherable,
  });
  for (const questItem of snapshot.questWorldItems) {
    const surface = snapshot.surfaces.get(questItem.surfaceId);
    if (surface === undefined || surface.spaceId !== activeSpaceDefinition.spaceId) continue;
    const point = tileInteractionPoint(surface.tileX, surface.tileY);
    const dx = point.x - predicted.position.x;
    const dy = point.y - predicted.position.y;
    if (dx * dx + dy * dy > (2 * TILE_SIZE_FIXED) ** 2) continue;
    candidates.push({
      kind: 'quest_item', ...point,
      stableId: `quest-item:${questItem.id}`,
      item: questItem,
    });
  }
  const embeddedArrow = targetEmbeddedArrow(snapshot);
  if (embeddedArrow !== null) candidates.push({
    kind: 'embedded_arrow', x: embeddedArrow.x, y: embeddedArrow.y,
    stableId: `embedded-arrow:${embeddedArrow.id}`, projectile: embeddedArrow,
  });
  const item = targetWorldItem(snapshot);
  if (item !== null) candidates.push({
    kind: 'world_item', x: item.x, y: item.y,
    stableId: `item:${item.id}`, item,
  });
  return nearestInteractionCandidate(predicted.position.x, predicted.position.y, candidates);
}

function interactionPrompt(target: EInteractionTarget, snapshot: OverworldView): string {
  switch (target.kind) {
    case 'portal': {
      const ownerName = homesteadPortalName(target.portal.kind);
      if (ownerName !== null) return `[E] ENTER ${ownerName.toUpperCase()}'S FARM`;
      if (target.portal.kind.startsWith('residence_enter:')) return '[E] ENTER HOME';
      if (target.portal.kind.startsWith('residence_exit:')) return '[E] LEAVE HOME';
      if (target.portal.kind.startsWith('cellar_enter:')) return '[E] CLIMB DOWN';
      if (target.portal.kind.startsWith('cellar_exit:')) return '[E] CLIMB UP';
      if (target.portal.kind === 'marlow_tent_enter') return '[E] ENTER MARLOW\'S TENT';
      if (target.portal.kind === 'marlow_tent_exit') return '[E] LEAVE MARLOW\'S TENT';
      return target.portal.kind.startsWith('homestead_exit:') ? '[E] LEAVE FARM' : '[E] USE PORTAL';
    }
    case 'placeable': return target.placeable.kind === 'barrel'
      ? '[E] OPEN BARREL'
      : target.placeable.kind === 'anvil'
        ? '[E] REPAIR SELECTED TOOL (5 COPPER)'
        : target.placeable.open ? '[E] CLOSE GATE' : '[E] OPEN GATE';
    case 'chest': return selectedItem(snapshot) === 'axe'
      ? '[E] OPEN CHEST  [F] BREAK WITH AXE'
      : targetFacedChest(snapshot)?.id === target.chest.id
        ? '[E] OPEN CHEST  [F] PICK UP'
        : '[E] OPEN CHEST';
    case 'campfire': return `[E] COOK  [F] ${target.campfire.lit ? 'EXTINGUISH' : 'LIGHT'} CAMPFIRE`;
    case 'merchant': return `[E] TALK TO ${target.npc.displayName.toUpperCase()}`;
    case 'horse': return localMount(snapshot) !== null
      ? `[E] DISMOUNT ${horseLabel(target.npc).toUpperCase()}`
      : `[E] RIDE ${horseLabel(target.npc).toUpperCase()}`;
    case 'gatherable': return `[E] PICK UP ${target.resource.kind === 'loose_stone' ? 'STONE' : 'FALLEN BRANCH'}`;
    case 'quest_item': return `[E] PICK UP ${hotbarItemLabel(target.item.itemKind)}`;
    case 'embedded_arrow': return '[E] RECOVER ARROW';
    case 'world_item': return target.item.itemKind === 'lantern'
      ? `[E] PICK UP LANTERN  [F] TURN ${target.item.lit ? 'OFF' : 'ON'}`
      : `[E] PICK UP ${hotbarItemLabel(target.item.itemKind)} x${target.item.quantity}`;
  }
}

function activateInteraction(target: EInteractionTarget, snapshot: OverworldView): void {
  switch (target.kind) {
    case 'portal':
      portalTransitionStartedAtMs = performance.now();
      showResult(network.usePortal(target.portal.id), 'PORTAL TRANSIT');
      return;
    case 'placeable':
      showResult(
        network.interactPlaceable(),
        target.placeable.kind === 'barrel'
          ? 'BARREL OPENED'
          : target.placeable.kind === 'anvil'
            ? 'TOOL REPAIRED'
          : target.placeable.open ? 'GATE CLOSED' : 'GATE OPENED',
      );
      return;
    case 'chest':
      showResult(network.interactChest(), 'CHEST OPENED');
      return;
    case 'campfire':
      overworldUi.openWindow = 'cooking';
      return;
    case 'merchant':
      overworldUi.openWindow = null;
      showResult(network.interactNpc(target.npc.id), `TALKING TO ${target.npc.displayName.toUpperCase()}`);
      return;
    case 'horse': {
      const dismounting = localMount(snapshot) !== null;
      showResult(
        network.interactHorse(target.npc.id),
        dismounting
          ? `DISMOUNTED ${horseLabel(target.npc).toUpperCase()}`
          : `RIDING ${horseLabel(target.npc).toUpperCase()}`,
      );
      return;
    }
    case 'gatherable':
      startPredictedAction('pickup');
      showResult(
        network.gatherWorldResource(target.resource.id),
        target.resource.kind === 'loose_stone' ? 'PICKED UP STONE' : 'PICKED UP WOOD',
      );
      return;
    case 'quest_item':
      startPredictedAction('pickup');
      showResult(network.pickupQuestWorldItem(target.item.id), 'QUEST OBJECTIVE COMPLETE');
      return;
    case 'embedded_arrow':
      startPredictedAction('pickup');
      showResult(network.pickupEmbeddedArrow(target.projectile.id), 'RECOVERED ARROW');
      return;
    case 'world_item':
      startPredictedAction('pickup');
      showResult(
        network.pickupWorldItem(target.item.id),
        `PICKED UP ${hotbarItemLabel(target.item.itemKind)} x${target.item.quantity}`,
      );
  }
}

function drawPlayerCollisionOverlay(
  context: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  scale: number,
  snapshot: OverworldView,
  terrain: TerrainArray,
): void {
  for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    if (!worldPlayerParticipatesInCollision(local, snapshot.profiles.get(id)?.online)) continue;
    const display = local ? null : remoteDisplay.get(id) ?? null;
    const position = {
      x: local ? predicted?.position.x ?? player.x : display?.x ?? player.x,
      y: local ? predicted?.position.y ?? player.y : display?.y ?? player.y,
    };
    const bounds = playerHitboxBounds(position);
    const projection = terrainProjectedDepthAtFoot(
      terrain,
      position.x / FIXED_UNITS_PER_PIXEL,
      terrainContactWorldYForPlayer(position.y / FIXED_UNITS_PER_PIXEL),
    );
    const left = (bounds.left / FIXED_UNITS_PER_PIXEL - cameraX) * scale;
    const top = (bounds.top / FIXED_UNITS_PER_PIXEL - projection - cameraY) * scale;
    const width = (bounds.right - bounds.left + 1) / FIXED_UNITS_PER_PIXEL * scale;
    const height = (bounds.bottom - bounds.top + 1) / FIXED_UNITS_PER_PIXEL * scale;
    context.fillStyle = local ? '#33e6ff55' : '#d36dff44';
    context.strokeStyle = local ? '#33e6ff' : '#d36dff';
    context.lineWidth = 1;
    context.fillRect(Math.round(left), Math.round(top), Math.ceil(width), Math.ceil(height));
    context.strokeRect(Math.round(left), Math.round(top), Math.ceil(width), Math.ceil(height));
    const footX = Math.round((position.x / FIXED_UNITS_PER_PIXEL - cameraX) * scale);
    const footY = Math.round((position.y / FIXED_UNITS_PER_PIXEL - projection - cameraY) * scale);
    context.fillRect(footX - 2, footY, 5, 1);
    context.fillRect(footX, footY - 2, 1, 5);
  }
}

function drawToolInteractionOverlay(
  context: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  scale: number,
  snapshot: OverworldView,
  terrain: TerrainArray,
): void {
  if (predicted === null) return;
  const itemKind = selectedItem(snapshot);
  const swingTool = isForwardSwingToolKind(itemKind);
  const reachFixed = swingTool
    ? resourceToolReachFixed(itemKind)
    : itemKind === 'hoe' || itemKind === 'watering_can'
      ? TILE_INTERACTION_REACH_FIXED
      : null;
  if (reachFixed === null) return;
  const origin = swingTool ? playerInteractionOrigin(predicted.position) : predicted.position;
  const facing = equippedItemFacing(itemKind, predicted.facing, cursorFacing());
  const vector = directionUnitVector(facing);
  const forwardOffset = resourceToolForwardOffsetFixed(itemKind);
  const centerX = origin.x + vector[0] * forwardOffset;
  const centerY = origin.y + vector[1] * forwardOffset;
  const projection = terrainProjectedDepthAtFoot(
    terrain,
    centerX / FIXED_UNITS_PER_PIXEL,
    centerY / FIXED_UNITS_PER_PIXEL,
  );
  const x = (centerX / FIXED_UNITS_PER_PIXEL - cameraX) * scale;
  const y = (centerY / FIXED_UNITS_PER_PIXEL - projection - cameraY) * scale;
  const radius = reachFixed / FIXED_UNITS_PER_PIXEL * scale;
  context.save();
  context.fillStyle = '#d77bff18';
  context.strokeStyle = '#e6a3ffdd';
  context.lineWidth = Math.max(1, scale);
  context.setLineDash([Math.max(2, 3 * scale), Math.max(1, 2 * scale)]);
  context.beginPath();
  context.arc(Math.round(x), Math.round(y), radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = '#f3c5ff';
  context.fillRect(Math.round(x) - 2, Math.round(y), 5, 1);
  context.fillRect(Math.round(x), Math.round(y) - 2, 1, 5);
  const target = swingTool ? targetResource(snapshot) : null;
  if (target !== null) {
    const bounds = survivalResourceObstacle(target.kind, target.tileX, target.tileY);
    const left = (bounds.left / FIXED_UNITS_PER_PIXEL - cameraX) * scale;
    const targetProjection = terrainProjectedDepthAtFoot(
      terrain,
      (bounds.left + bounds.right + 1) / 2 / FIXED_UNITS_PER_PIXEL,
      bounds.bottom / FIXED_UNITS_PER_PIXEL,
    );
    const top = (bounds.top / FIXED_UNITS_PER_PIXEL - targetProjection - cameraY) * scale;
    const width = (bounds.right - bounds.left + 1) / FIXED_UNITS_PER_PIXEL * scale;
    const height = (bounds.bottom - bounds.top + 1) / FIXED_UNITS_PER_PIXEL * scale;
    context.fillStyle = '#fff36a55';
    context.strokeStyle = '#fff36a';
    context.lineWidth = Math.max(1, scale);
    context.fillRect(Math.round(left), Math.round(top), Math.ceil(width), Math.ceil(height));
    context.strokeRect(Math.round(left), Math.round(top), Math.ceil(width), Math.ceil(height));
  }
  context.restore();
}

function drawCollisionOverlay(
  context: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
  terrain: TerrainArray,
  activeElevation: number,
  showEntityObstacles: boolean,
): void {
  const planeProjection = activeElevation * terrainVisualProjectionRowsPerLevel(terrain) * 16;
  const minX = Math.max(0, Math.floor(cameraX / 16));
  const minY = Math.max(0, Math.floor((cameraY + planeProjection) / 16));
  const maxX = Math.min(terrain.width - 1, Math.ceil((cameraX + viewportWidth / scale) / 16));
  const maxY = Math.min(
    terrain.height - 1,
    Math.ceil((cameraY + viewportHeight / scale + planeProjection) / 16),
  );
  for (let tileY = minY; tileY <= maxY; tileY += 1) for (let tileX = minX; tileX <= maxX; tileX += 1) {
    const cell = terrainPlaneCollisionCellAt(terrain, tileX, tileY, activeElevation);
    // Projected terrain intentionally lets a lower-plane actor occupy some
    // logical coordinates owned by the plateau above (the walk-behind band).
    // Show the mask consumed by movement, not every different-height cell.
    const blocked = collisionTileIsBlockedAtPlane(worldCollision, tileX, tileY, activeElevation);
    const screenX = Math.round((tileX * 16 - cameraX) * scale);
    const screenY = Math.round((tileY * 16 - planeProjection - cameraY) * scale);
    if (blocked || cell === 'transition') {
      context.fillStyle = blocked ? '#ff335588' : '#38f6ff77';
      context.fillRect(screenX, screenY, 16 * scale, 16 * scale);
    }
    context.strokeStyle = blocked ? '#ff7588cc' : cell === 'transition' ? '#76fbffff' : '#ffffff24';
    context.lineWidth = 1;
    context.strokeRect(screenX, screenY, 16 * scale, 16 * scale);
  }
  for (const obstacle of showEntityObstacles ? worldCollision.obstacles ?? [] : []) {
    const left = obstacle.left / FIXED_UNITS_PER_PIXEL;
    const top = obstacle.top / FIXED_UNITS_PER_PIXEL;
    const width = (obstacle.right - obstacle.left + 1) / FIXED_UNITS_PER_PIXEL;
    const height = (obstacle.bottom - obstacle.top + 1) / FIXED_UNITS_PER_PIXEL;
    if (terrainElevationAtWorldFoot(terrain, left + width / 2, top + height) !== activeElevation) continue;
    const projection = terrainProjectedDepthAtFoot(
      terrain,
      left + width / 2,
      top + height,
    );
    context.fillStyle = '#ff9d2377';
    context.strokeStyle = '#ffbf57';
    context.fillRect(
      Math.round((left - cameraX) * scale),
      Math.round((top - projection - cameraY) * scale),
      Math.ceil(width * scale),
      Math.ceil(height * scale),
    );
    context.strokeRect(
      Math.round((left - cameraX) * scale),
      Math.round((top - projection - cameraY) * scale),
      Math.ceil(width * scale),
      Math.ceil(height * scale),
    );
  }
  context.save();
  context.font = `${Math.max(8, Math.round(8 * scale))}px monospace`;
  context.textBaseline = 'top';
  context.fillStyle = '#07120ddd';
  context.fillRect(4, 4, Math.max(96, 58 * scale), Math.max(14, 11 * scale));
  context.fillStyle = '#f6f0d8';
  context.fillText(`HEIGHT ${activeElevation}`, 8, 6);
  context.restore();
}

const CELLAR_ORE_PREVIEW_COLORS: Readonly<Record<string, string>> = {
  ore_iron: '#b9c1c8aa',
  ore_copper: '#e58b55aa',
  ore_gold: '#ffd35cbb',
  ore_emerald: '#55d889bb',
  ore_sapphire: '#5999f0bb',
  ore_topaz: '#e8a94fbb',
  ore_ruby: '#e4525fbb',
  ore_amethyst: '#b576e8bb',
};

function drawCellarOreVeinPreview(
  context: CanvasRenderingContext2D,
  terrain: TerrainArray,
  seed: number,
  cameraX: number,
  cameraY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (!cellarOrePreview || latestSnapshot.membership?.role !== 'owner'
    || activeSpaceDefinition.generator !== 'cellar') return 0;
  const minimumX = Math.max(1, Math.floor(cameraX / 16) - 1);
  const minimumY = Math.max(1, Math.floor(cameraY / 16) - 1);
  const maximumX = Math.min(terrain.width - 2, Math.ceil((cameraX + viewportWidth / scale) / 16) + 1);
  const maximumY = Math.min(terrain.height - 2, Math.ceil((cameraY + viewportHeight / scale) / 16) + 1);
  let count = 0;
  context.save();
  for (let tileY = minimumY; tileY <= maximumY; tileY += 1) {
    for (let tileX = minimumX; tileX <= maximumX; tileX += 1) {
      if (terrain.blocked[tileY * terrain.width + tileX] !== true) continue;
      const kind = cellarOreKindAt(seed, activeSpaceDefinition.spaceId, tileX, tileY);
      if (kind === null) continue;
      context.fillStyle = CELLAR_ORE_PREVIEW_COLORS[kind] ?? '#ffffff99';
      context.fillRect(
        Math.round((tileX * 16 - cameraX) * scale),
        Math.round((tileY * 16 - cameraY) * scale),
        Math.max(1, Math.round(16 * scale)),
        Math.max(1, Math.round(16 * scale)),
      );
      count += 1;
    }
  }
  context.restore();
  return count > 0 ? 1 : 0;
}

function render(alpha = 1): void {
  const renderStarted = performance.now();
  let drawCalls = 0;
  const snapshot = latestSnapshot;
  const predictedPosition = predicted?.position;
  const renderedLocalBase = predictedPosition === undefined
    ? null
    : interpolateFixedPosition(previousPredicted?.position ?? predictedPosition, predictedPosition, alpha);
  const renderedLocal = renderedLocalBase === null ? null : presentationCorrection.apply(renderedLocalBase);
  const localAuthority = snapshot.identityHex === null ? undefined : snapshot.players.get(snapshot.identityHex);
  const loadingStage = worldLoadingStage({
    connected: snapshot.connected,
    error: snapshot.error,
    identityReady: snapshot.identityHex !== null,
    worldReady: snapshot.worldSeed !== null && snapshot.clock !== null && snapshot.environment !== null,
    playerReady: localAuthority !== undefined,
    profileReady: snapshot.characterProfile !== null && snapshot.membership !== null && snapshot.survival !== null,
  });
  setLoadingScreenStage(loadingStage);
  if (loadingStage.ready !== true) return;
  dismissLoadingScreen();
  const cameraJump = localAuthority === undefined ? null : horseJumpPose(
    localAuthority.jumpFromX,
    localAuthority.jumpFromY,
    localAuthority.x,
    localAuthority.y,
    localAuthority.jumpUntilTick,
    renderTickClock.renderTick,
  );
  const localX = (cameraJump?.x ?? renderedLocal?.x ?? 96 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const localY = (cameraJump?.footY ?? renderedLocal?.y ?? 96 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const terrain = terrainForSnapshot(snapshot);
  const localTerrainContactY = terrainContactWorldYForPlayer(localY);
  const projectedLocalY = terrainProjectedWorldYAtFoot(terrain, localX, localTerrainContactY)
    + (localY - localTerrainContactY);
  const frame = renderer.beginWorld(worldZoom);
  const context = frame.world;
  if (activeSpaceDefinition.generator === 'cellar') {
    // Cave_Walls is authored against this rock-shadow colour. Painting the
    // viewport first lets projected transparent pixels blend into solid cave
    // instead of exposing a disconnected black void.
    context.fillStyle = '#3f2023';
    context.fillRect(0, 0, frame.layout.width, frame.layout.height);
  }
  const scale = frame.layout.integerScale;
  const viewportWidth = frame.layout.width / scale;
  const viewportHeight = frame.layout.height / scale;
  const worldPixels = activeSpaceDefinition.sizeTiles * 16;
  const cameraX = cameraAxisOffset(localX, viewportWidth, worldPixels);
  const cameraY = cameraAxisOffset(projectedLocalY, viewportHeight, worldPixels);
  latestCameraX = cameraX;
  latestCameraY = cameraY;
  latestRenderedZoom = worldZoom;
  refreshHoveredInteractionTile();
  const renderWeatherTick = snapshot.environment?.calendarTick ?? snapshot.clock?.authorityTick ?? 0n;
  const weatherVisualTick = weatherTickClock.advance(renderStarted, renderWeatherTick);
  const activeWeather = weatherVisualState(worldWeatherMode(), renderWeatherTick, worldWindDirection());
  const renderWeather = activeSpaceDefinition.environment === 'outdoor' && activeSpaceDefinition.weather
    ? activeWeather
    : { ...activeWeather, raining: false, cloudShadow: 0, wind: 0 };
  const uiScale = fittedUiScale(desiredUiScale, renderer.cssWidth, renderer.cssHeight);
  drawCalls += groundCache.draw(context, art, terrain, cameraX, cameraY, scale, frame.layout.width, frame.layout.height);
  drawCalls += drawAnimatedTerrain(
    context,
    art,
    terrain,
    cameraX,
    cameraY,
    scale,
    viewportWidth,
    viewportHeight,
    weatherVisualTick * AUTHORITY_TICK_MS,
    renderWeather.wind,
    renderWeather.windDirectionX,
  );
  drawCalls += drawInsetGround(
    context,
    art.dirtTerrace,
    art.farmlandGrassInset,
    activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
      ? [...generateMarlowCampPathTiles(), ...[...snapshot.homesteads].map((home) => ({ tileX: home.overworldTileX, tileY: home.overworldTileY + 1 }))]
      : activeSpaceDefinition.generator === 'homestead' ? homesteadPathTiles(activeSpaceDefinition.sizeTiles) : [],
    cameraX,
    cameraY,
    scale,
    frame.layout.width,
    frame.layout.height,
  );
  drawCalls += drawFarmSoil(
    context,
    art.farmland,
    art.farmlandWet,
    art.farmlandGrassInset,
    [...snapshot.soil].map((soil) => ({
      ...soil,
      watered: soil.watered && renderWeatherTick < soil.wateredAtTick + CROP_WATERING_TICKS,
    })),
    cameraX,
    cameraY,
    scale,
    frame.layout.width,
    frame.layout.height,
  );
  rain.followViewport(
    cameraX + viewportWidth / 2,
    cameraY + viewportHeight / 2,
    worldZoom,
  );

  const terrainProjectionMargin = terrainMaximumElevation(terrain) * 3 * 16;
  const visible = visibleWorldBounds(
    cameraX,
    cameraY,
    frame.layout.width,
    frame.layout.height,
    scale,
    Math.max(64, terrainProjectionMargin),
  );
  const lightVisible = visibleWorldBounds(
    cameraX,
    cameraY,
    frame.layout.width,
    frame.layout.height,
    scale,
    (CAMPFIRE_LIGHT_RADIUS_TILES + 1) * 16,
  );
  // All non-ground world art (players, trees, items, future buildings/props/NPCs)
  // must enter this queue so weather and later depth layers cannot bypass it.
  const worldDepthItems: WorldDepthItem[] = [];
  const projectionAt = (worldX: number, worldFootY: number): number => (
    terrainProjectedDepthAtFoot(terrain, worldX, worldFootY)
  );
  const projectedWorldY = (worldX: number, worldFootY: number): number => (
    worldFootY - projectionAt(worldX, worldFootY)
  );
  const projectTargetable = (
    entity: TargetableWorldEntity,
    worldX: number,
    worldFootY: number,
  ): TargetableWorldEntity => ({
    ...entity,
    y: entity.y - projectionAt(worldX, worldFootY),
  });
  const enqueueWorldDepth = (
    worldX: number,
    worldFootY: number,
    item: WorldDepthItem,
    terrainSampleY = worldFootY,
  ): void => {
    const elevation = terrainProjectedElevationAtFoot(terrain, worldX, terrainSampleY);
    const projection = projectionAt(worldX, terrainSampleY);
    worldDepthItems.push({
      ...item,
      footY: item.footY - projection,
      depthOffset: terrainProjectedSortOffset(elevation),
      elevationLayer: Math.ceil(Math.max(0, elevation - 0.001)),
      depthPhase: 'entity',
      draw: () => {
        context.save();
        context.translate(0, -projection * scale);
        item.draw();
        context.restore();
      },
    });
  };
  enqueueRaisedTerrainDepth(
    worldDepthItems,
    context,
    art,
    terrain,
    groundCache,
    cameraX,
    cameraY,
    scale,
    viewportWidth,
    viewportHeight,
  );
  const nameplates: Array<{ x: number; y: number; name: string; offline?: boolean }> = [];
  const questMarkerAnchors: Array<{ x: number; y: number; kind: 'offer' | 'complete' }> = [];
  const renderedPlayerAnchors = new Map<string, { readonly x: number; readonly y: number }>();
  const targetableEntities: TargetableWorldEntity[] = [];
  const pointLights: PointLight[] = [];
  const projectedLight = (light: PointLight, terrainSampleY?: number): PointLight => {
    const receiverY = light.receiverDirectionWorldY ?? light.worldY;
    const sampleY = terrainSampleY ?? receiverY;
    const projection = projectionAt(light.worldX, sampleY);
    return {
      ...light,
      worldY: light.worldY - projection,
      elevationLayer: terrainElevationAtWorldFoot(terrain, light.worldX, sampleY),
      ...(light.receiverDirectionWorldY === undefined
        ? {}
        : { receiverDirectionWorldY: light.receiverDirectionWorldY - projection }),
    };
  };
  const frameAmbient = lightingEffectsDisabled
    ? { r: 255, g: 255, b: 255 }
    : activeSpaceDefinition.environment === 'outdoor' && activeSpaceDefinition.ambient === 'clock'
      ? ambientAtTick(renderWeatherTick, renderWeather.raining ? 0.12 : 0)
      : activeSpaceDefinition.ambient === 'clock' ? { r: 255, g: 255, b: 255 } : activeSpaceDefinition.ambient;
  const drawSouthFacingReceiver = (
    footX: number,
    footY: number,
    draw: () => void,
  ): void => {
    const projection = projectionAt(footX, footY);
    const elevationLayer = terrainElevationAtWorldFoot(terrain, footX, footY);
    const brightness = southFacingReceiverBrightness(
      footX,
      footY - projection,
      frameAmbient,
      pointLights,
      elevationLayer,
    );
    context.save();
    if (brightness < 0.995) context.filter = `brightness(${Math.round(brightness * 1000) / 10}%)`;
    draw();
    context.restore();
  };
  const windTrees: WindTreeSource[] = [];
  for (const placeable of snapshot.placeables) {
    if (placeable.carriedBy !== undefined) continue;
    const light = placeablePointLight(placeable, snapshot.clock?.authorityTick ?? 0n);
    if (light !== null && worldPointVisible(light.worldX, light.worldY, lightVisible)) {
      pointLights.push(projectedLight(light));
    }
  }
  if (!debugEntitiesHidden && (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    || activeSpaceDefinition.generator === 'homestead')) {
    const decorations = activeSpaceDefinition.generator === 'homestead'
      ? homesteadSurroundingDecorations(seed) : generateSurvivalDecorations(seed);
    for (const decoration of decorations) {
    if (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
      && isInteractivePoiDecorationKind(decoration.kind)) continue;
    const decorationX = decoration.tileX * 16 + 8;
    const decorationY = (decoration.tileY + 1) * 16;
    const campfireLit = decoration.kind !== 'camp_campfire'
      || (snapshot.campfires?.get(BigInt(decoration.id))?.lit ?? true);
    if (decoration.kind === 'camp_campfire' && campfireLit) {
      if (worldPointVisible(decorationX, decorationY, lightVisible)) {
        const flicker = deterministicFlameFlicker(
          BigInt(decoration.id),
          snapshot.clock?.authorityTick ?? 0n,
        );
        pointLights.push(projectedLight({
          worldX: decorationX,
          worldY: decorationY - 12,
          receiverDirectionWorldY: decorationY,
          radiusTiles: CAMPFIRE_LIGHT_RADIUS_TILES + flicker.radiusOffset,
          color: CAMPFIRE_LIGHT,
          strengthPerMille: flicker.strengthPerMille,
          profile: 'flame',
        }));
      }
    }
    if (!worldPointVisible(decorationX, decorationY, visible)) continue;
    enqueueWorldDepth(decorationX, decorationY, {
      footY: overworldPoiDecorationDepthY(decoration.kind, decorationY),
      tie: `decoration:${decoration.id}`,
      draw: () => {
        const drawDecoration = (): void => drawOverworldPoiDecoration(
          context,
          art,
          decoration.kind,
          decorationX,
          decorationY,
          cameraX,
          cameraY,
          scale,
          decoration.variant,
          natureDecorationFrame(
            decoration.kind,
            visualTickClock.renderTick,
            decoration.animationOffset,
            renderWeather.wind,
          ),
          campfireLit,
        );
        if (survivalDecorationBlocksTraversal(decoration.kind, 'ground')
          && decoration.kind !== 'camp_pond' && !isLightEmitterKind(decoration.kind)) {
          drawSouthFacingReceiver(decorationX, decorationY, drawDecoration);
        } else {
          drawDecoration();
        }
      },
    });
    }
  }
  if (!debugEntitiesHidden) {
    const homes = activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
      ? [...snapshot.homesteads]
      : [...snapshot.homesteads].filter((home) => home.spaceId === activeSpaceDefinition.spaceId);
    for (const home of homes) {
      const interior = activeSpaceDefinition.generator === 'homestead';
      const tileX = interior ? HOMESTEAD_TENT_TILE.tileX : home.overworldTileX;
      const tileY = interior ? HOMESTEAD_TENT_TILE.tileY : home.overworldTileY;
      const x = tileX * 16 + 8;
      const y = (tileY + 1) * 16;
      if (!worldPointVisible(x, y, visible)) continue;
      enqueueWorldDepth(x, y, {
        footY: overworldPoiDecorationDepthY(
          interior ? 'homestead_tent_large' : 'homestead_tent_marker',
          y,
        ),
        tie: `homestead:${home.spaceId}`,
        draw: () => drawOverworldPoiDecoration(
          context, art, interior ? 'homestead_tent_large' : 'homestead_tent_marker',
          x, y, cameraX, cameraY, scale,
        ),
      });
    }
  }
  if (!debugEntitiesHidden && activeSpaceDefinition.generator === 'homestead') {
    const boundary = homesteadBoundaryTiles(activeSpaceDefinition.sizeTiles);
    const activeHome = snapshot.homesteads.get(activeSpaceDefinition.spaceId);
    const boundaryKeys = new Set(boundary.map((tile) => `${tile.tileX}:${tile.tileY}`));
    for (const tile of boundary) {
      const x = tile.tileX * 16 + 8;
      const y = (tile.tileY + 1) * 16;
      if (!worldPointVisible(x, y, visible)) continue;
      const fenceMask = tile.kind === 'fence'
        ? fenceJoinMask(tile.tileX, tile.tileY, (tileX, tileY) => boundaryKeys.has(`${tileX}:${tileY}`))
        : 0;
      enqueueWorldDepth(x, y, {
        footY: y,
        tie: `homestead-boundary:${tile.tileY}:${tile.tileX}`,
        draw: () => drawOverworldPlaceable(
          context, art, tile.kind === 'gate' ? 'fence_gate' : 'fence',
          tile.kind === 'gate' && activeHome?.gateOpen === true,
          fenceMask, 0, x, y, cameraX, cameraY, scale,
        ),
      });
    }
  }
  if (!debugEntitiesHidden && (activeSpaceDefinition.generator === 'residence'
    || activeSpaceDefinition.generator === 'marlow_tent'
    || activeSpaceDefinition.generator === 'cellar')) {
    const decorations = activeSpaceDefinition.generator === 'residence'
      ? [
        { kind: 'residence_door', tileX: 8, tileY: 13 },
        { kind: 'residence_trapdoor', tileX: 11, tileY: 8 },
        { kind: 'residence_bed', ...RESIDENCE_BED_TILE },
        { kind: 'residence_bookshelf', ...RESIDENCE_BOOKSHELF_TILE },
      ]
      : activeSpaceDefinition.generator === 'marlow_tent'
        ? [
          { kind: 'residence_door', tileX: 8, tileY: 13 },
          { kind: 'residence_bed', ...RESIDENCE_BED_TILE },
          { kind: 'residence_bookshelf', ...MARLOW_TENT_BOOKSHELF_TILE },
        ]
        : [
        { kind: 'cellar_ladder', tileX: CELLAR_ENTRY_TILE.tileX, tileY: CELLAR_ENTRY_TILE.tileY + 1 },
        { kind: 'poi_rock_small', tileX: CELLAR_ENTRY_TILE.tileX - 4, tileY: CELLAR_ENTRY_TILE.tileY + 5 },
        { kind: 'poi_rock_small', tileX: CELLAR_ENTRY_TILE.tileX + 5, tileY: CELLAR_ENTRY_TILE.tileY + 17 },
      ];
    for (const decoration of decorations) {
      const x = decoration.tileX * 16 + 8;
      const y = decoration.tileY * 16;
      if (!worldPointVisible(x, y, visible)) continue;
      enqueueWorldDepth(x, y, {
        footY: y,
        tie: `instance-decoration:${decoration.kind}:${decoration.tileX}:${decoration.tileY}`,
        draw: () => drawOverworldPoiDecoration(
          context, art, decoration.kind, x, y, cameraX, cameraY, scale,
        ),
      });
    }
  }
  if (!debugEntitiesHidden) for (const resource of [
    ...snapshot.resources, ...homesteadSurroundingResources(seed),
  ]) {
    const resourceX = resource.tileX * 16 + 8;
    const resourceY = (resource.tileY + 1) * 16;
    if (!worldPointVisible(resourceX, resourceY, visible)) continue;
    if (!resource.depleted && isChoppableTreeKind(resource.kind)
      && (resource as RenderWorldResource).ambientOnly !== true) {
      windTrees.push({
        id: Number(resource.id & 0x7fffffffn),
        x: resourceX,
        y: resourceY,
        kind: resource.kind,
      });
    }
    const sway = treeSwayOffset(
      renderWeather,
      weatherVisualTick,
      Math.imul(resource.tileX, 73_856_093) ^ Math.imul(resource.tileY, 19_349_663),
    );
    enqueueWorldDepth(resourceX, resourceY, {
      footY: resourceY,
      tie: `resource:${resource.id}`,
      draw: () => {
        if (isGatherableResourceKind(resource.kind)) {
          if (resource.depleted) return;
          if (resource.kind === 'loose_stone') {
            drawOverworldRock(context, art, resourceX, resourceY, cameraX, cameraY, scale);
          } else {
            drawOverworldPoiDecoration(
              context, art, 'poi_fallen_log', resourceX, resourceY, cameraX, cameraY, scale,
            );
          }
          return;
        }
        if (isBreakableRockKind(resource.kind)) {
          if (resource.depleted) return;
          const shaking = (treeShakeRemaining.get(resource.id) ?? 0) > 0;
          const shakeX = shaking ? (effectPhase < 2 ? -1 : 1) : 0;
          drawSouthFacingReceiver(resourceX, resourceY, () => drawOverworldPoiDecoration(
            context, art, 'poi_rock_small', resourceX + shakeX, resourceY, cameraX, cameraY, scale,
          ));
          return;
        }
        if (isMineableOreKind(resource.kind)) {
          if (resource.depleted) return;
          const shaking = (treeShakeRemaining.get(resource.id) ?? 0) > 0;
          const shakeX = shaking ? (effectPhase < 2 ? -1 : 1) : 0;
          drawSouthFacingReceiver(resourceX, resourceY, () => drawOverworldOreNode(
            context, art, resource.kind, resourceX + shakeX, resourceY, cameraX, cameraY, scale,
          ));
          return;
        }
        if (resource.depleted) {
          drawOverworldStump(
            context, art, resourceX, resourceY, cameraX, cameraY, scale,
            resource.kind, treeGrowthStageName(resource.growthStage),
          );
          return;
        }
        const growthStage = treeGrowthStageName(resource.growthStage);
        if (growthStage !== 'big') {
          drawOverworldTreeRegrowth(
            context, art, resourceX, resourceY, cameraX, cameraY, scale, resource.kind, growthStage,
          );
          return;
        }
        const shaking = (treeShakeRemaining.get(resource.id) ?? 0) > 0;
        const shakeX = shaking ? (effectPhase < 2 ? -1 : 1) : 0;
        const drawTree = (): void => drawOverworldTree(
          context,
          art,
          resourceX + shakeX,
          resourceY - 4,
          false,
          cameraX,
          cameraY,
          scale,
          resource.kind,
          sway[0],
          sway[1],
        );
        if ((resource as RenderWorldResource).ambientOnly === true) drawTree();
        else drawSouthFacingReceiver(resourceX, resourceY, drawTree);
      },
    });
  }
  if (!debugEntitiesHidden) for (const crop of snapshot.crops) {
    const definition = cropDefinition(crop.cropKind);
    const soil = snapshot.soil.get(crop.id);
    if (definition === null || soil === undefined) continue;
    const x = crop.tileX * 16 + 8;
    const y = (crop.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    const growth = cropGrowthAt(
      definition,
      crop.growthTicks,
      crop.growthUpdatedAtTick,
      soil.wateredAtTick,
      renderWeatherTick,
      soil.watered,
    );
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `crop:${crop.id}`,
      draw: () => drawOverworldCrop(
        context, art, crop.cropKind, growth.stage, x, y, cameraX, cameraY, scale,
      ),
    });
  }
  if (!debugEntitiesHidden) for (const item of snapshot.worldItems) {
    const x = item.x / FIXED_UNITS_PER_PIXEL;
    const y = item.y / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const age = Number((snapshot.clock?.authorityTick ?? item.droppedAtTick) - item.droppedAtTick);
    const arcHeight = age >= 0 && age < 8 ? Math.round(Math.sin(age / 8 * Math.PI) * 8) : 0;
    if (item.itemKind === 'lantern' && item.lit && worldPointVisible(x, y, lightVisible)) {
      pointLights.push(projectedLight({
        worldX: x,
        worldY: y - 7,
        receiverDirectionWorldY: y,
        radiusTiles: LANTERN_LIGHT_RADIUS_TILES,
        color: LANTERN_LIGHT,
        strengthPerMille: 1000,
        profile: 'steady',
      }));
    }
    const landedArrowDirection = isRecoverableArrow(item.itemKind, item.durability)
      ? recoverableArrowDirection(item.durability)
      : null;
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `item:${item.id}`,
      draw: () => {
        if (landedArrowDirection !== null) {
          drawOverworldArrow(
            context,
            art,
            x,
            y,
            landedArrowDirection.x,
            landedArrowDirection.y,
            cameraX,
            cameraY,
            scale,
            false,
          );
          return;
        }
        drawOverworldItem(
          context, art, item.itemKind, x, y, arcHeight, cameraX, cameraY, scale, item.lit,
        );
      },
    });
  }
  const enqueueProjectileVisual = (
    tie: string,
    physicalXFixed: number,
    physicalYFixed: number,
    velocityX: number,
    velocityY: number,
    mounted: boolean,
    progress: number,
    flightTicks: number,
    hit: boolean,
    foregroundDepthY?: number,
  ): void => {
    const arc = bowProjectileArcPresentation(
      { x: physicalXFixed, y: physicalYFixed },
      { x: velocityX, y: velocityY },
      mounted,
      progress,
      flightTicks,
    );
    const physicalX = physicalXFixed / FIXED_UNITS_PER_PIXEL;
    const physicalY = physicalYFixed / FIXED_UNITS_PER_PIXEL;
    const renderX = arc.point.x / FIXED_UNITS_PER_PIXEL;
    const renderY = arc.point.y / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(physicalX, physicalY, visible)) return;
    enqueueWorldDepth(physicalX, physicalY, {
      footY: foregroundDepthY ?? physicalY,
      tie,
      draw: () => drawOverworldArrow(
        context,
        art,
        renderX,
        renderY,
        arc.velocity.x,
        arc.velocity.y,
        cameraX,
        cameraY,
        scale,
        hit,
      ),
    });
  };
  if (!debugEntitiesHidden) for (const projectile of snapshot.projectiles) {
    const display = projectileDisplay.get(projectile.id);
    const ownerHex = projectile.owner.toHexString();
    const state = display?.state ?? projectile.state;
    const velocity = {
      x: display?.velocityX ?? projectile.velocityX,
      y: display?.velocityY ?? projectile.velocityY,
    };
    const flightTicks = projectileFlightTicks.get(projectile.id)
      ?? BOW_MAX_PROJECTILE_FLIGHT_TICKS;
    const progress = state === 'hit'
      ? projectileHitProgress.get(projectile.id) ?? 1
      : Math.max(0, Math.min(
          1,
          (renderTickClock.renderTick - Number(projectile.spawnedTick)) / flightTicks,
        ));
    const embeddedTarget = state === 'hit' && projectile.hitKind === 'combat_target'
      ? snapshot.combatTargets.get(BigInt(projectile.hitId))
      : undefined;
    // A target hit changes painter depth only. Preserve the projectile's exact
    // reconciled collision point; never snap embedded art to the target anchor.
    const embeddedTargetDepthY = embeddedTarget === undefined
      ? undefined
      : embeddedTarget.y / FIXED_UNITS_PER_PIXEL + 1;
    enqueueProjectileVisual(
      `projectile:${projectile.id}`,
      display?.x ?? projectile.x,
      display?.y ?? projectile.y,
      velocity.x,
      velocity.y,
      snapshot.npcs.find((npc) => npc.rider?.toHexString() === ownerHex) !== undefined,
      progress,
      flightTicks,
      state === 'hit',
      embeddedTargetDepthY,
    );
  }
  if (!debugEntitiesHidden && pendingBowProjectile !== null) {
    const projectileNowMs = performance.now();
    const sample = sampleLocalProjectilePrediction(pendingBowProjectile, projectileNowMs);
    if (sample !== null) {
      const progress = Math.max(0, Math.min(
        1,
        (projectileNowMs - pendingBowProjectile.startedAtMs)
          / AUTHORITY_TICK_MS / pendingBowProjectile.lifetimeTicks,
      ));
      const terrainHit = firstProjectileTerrainHit(
        pendingBowProjectile.origin,
        sample,
        worldCollision,
      );
      const point = terrainHit ?? sample;
      const displayedProgress = terrainHit === null ? progress : progress * terrainHit.fraction;
      enqueueProjectileVisual(
        `projectile:predicted:${pendingBowProjectile.token}`,
        point.x,
        point.y,
        pendingBowProjectile.velocity.x,
        pendingBowProjectile.velocity.y,
        pendingBowProjectile.mounted,
        displayedProgress,
        pendingBowProjectile.lifetimeTicks,
        terrainHit !== null,
      );
    }
  }
  const nowMs = performance.now();
  const activeChestId = snapshot.activeChest?.id ?? null;
  if (activeChestId !== animatedOpenChestId) {
    if (animatedOpenChestId !== null) closingChestId = animatedOpenChestId;
    animatedOpenChestId = activeChestId;
    chestAnimationStartedAtMs = nowMs;
  }
  if (closingChestId !== null && nowMs - chestAnimationStartedAtMs >= 1_000) closingChestId = null;
  if (!debugEntitiesHidden) for (const chest of snapshot.chests) {
    if (chest.carriedBy !== undefined) continue;
    const x = chest.tileX * 16 + 8; const y = (chest.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    enqueueWorldDepth(x, y, {
      footY: y, tie: `chest:${chest.id}`,
      draw: () => {
        const elapsedFrame = Math.min(5, Math.floor((performance.now() - chestAnimationStartedAtMs) / (1_000 / 6)));
        const frameIndex = chest.id === activeChestId ? elapsedFrame
          : chest.id === closingChestId ? 5 - elapsedFrame : 0;
        drawSouthFacingReceiver(x, y, () => {
          drawOverworldChest(context, art, x, y, cameraX, cameraY, scale, frameIndex);
        });
      },
    });
  }
  if (!debugEntitiesHidden) for (const target of snapshot.combatTargets) {
    if (target.carriedBy !== undefined) continue;
    const x = target.x / FIXED_UNITS_PER_PIXEL;
    const y = target.y / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const projectedY = y - projectionAt(x, y);
    targetableEntities.push({
      target: { kind: 'combat_target', id: target.id },
      x,
      y: projectedY,
      halfWidth: 16,
      height: 31,
    });
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `combat-target:${target.id}`,
      draw: () => drawSouthFacingReceiver(x, y, () => {
        drawOverworldArcheryTarget(context, art, x, y, cameraX, cameraY, scale);
      }),
    });
  }
  const fenceTiles = new Set([...snapshot.placeables]
    .filter((row) => row.carriedBy === undefined && (row.kind === 'fence' || row.kind === 'fence_gate'))
    .map((row) => `${row.tileX}:${row.tileY}`));
  if (!debugEntitiesHidden) for (const placeable of snapshot.placeables) {
    if (placeable.carriedBy !== undefined) continue;
    const x = placeable.tileX * 16 + 8;
    const y = (placeable.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    const definition = placeableDefinition(placeable.kind);
    const fenceMask = placeable.kind === 'fence'
      ? fenceJoinMask(placeable.tileX, placeable.tileY, (tileX, tileY) => fenceTiles.has(`${tileX}:${tileY}`))
      : 0;
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `placeable:${placeable.id}`,
      draw: () => {
        const drawPlaceable = (): void => drawOverworldPlaceable(
          context, art, placeable.kind, placeable.open, fenceMask,
          Math.floor(performance.now() / 125), x, y, cameraX, cameraY, scale,
          placeable.lit,
        );
        if (definition?.blocksMovement === true && !isLightEmitterKind(placeable.kind)) {
          drawSouthFacingReceiver(x, y, drawPlaceable);
        } else {
          drawPlaceable();
        }
      },
    });
  }
  if (!debugEntitiesHidden) for (const surface of snapshot.surfaces) {
    const x = surface.tileX * 16 + 8;
    const y = (surface.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `surface:${surface.id}`,
      draw: () => drawOverworldPoiDecoration(
        context, art, 'marlow_tent_table', x, y, cameraX, cameraY, scale,
      ),
    });
    for (const item of snapshot.questWorldItems) {
      if (item.surfaceId !== surface.id) continue;
      enqueueWorldDepth(x, y, {
        footY: y + 1,
        tie: `surface-item:${item.id}`,
        draw: () => drawOverworldItem(
          context, art, item.itemKind, x, y - 17, 0, cameraX, cameraY, scale,
        ),
      });
    }
  }
  if (!debugEntitiesHidden) for (const hive of snapshot.hives) {
    const x = hive.tileX * 16 + 8;
    const y = (hive.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `hive:${hive.id}`,
      draw: () => drawOverworldHive(context, art, hive.kind, hive.variant, x, y, cameraX, cameraY, scale),
    });
  }
  const horseAnimationFrame = Math.floor(performance.now() / 125);
  // Dynamic actors are intentionally absent from both collision maps and the
  // light-occluder set: NPCs can overlap players and never cast world shadows.
  if (!debugEntitiesHidden) for (const npc of snapshot.npcs) {
    if (npc.rider !== undefined) continue;
    const display = npcDisplay.get(npc.id);
    const sleeping = npc.wanderDirection === 'sleep';
    const x = (sleeping ? npc.x : display?.x ?? npc.x) / FIXED_UNITS_PER_PIXEL;
    const y = (sleeping ? npc.y : display?.y ?? npc.y) / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const facing = (display?.facing ?? npc.facing) as Direction;
    const questMarker = questMarkerForNpc(snapshot, npc.id);
    if (questMarker !== null) {
      questMarkerAnchors.push({ x, y: projectedWorldY(x, y), kind: questMarker });
    }
    if (snapshot.merchants.get(npc.id) !== undefined) {
      const moving = sleeping ? false : npc.moving;
      targetableEntities.push(projectTargetable(targetableFromVisualBounds(
        { kind: 'npc', id: npc.id },
        merchantWorldBounds(
          art, x, y, facing, moving, horseAnimationFrame + Number(npc.id % 19n),
        ),
        x, y, { halfWidth: 9, height: 24 },
      ), x, y));
      if (npc.displayName.trim()) nameplates.push({ x, y: projectedWorldY(x, y), name: npc.displayName });
      enqueueWorldDepth(x, y, {
        footY: y,
        tie: `merchant:${npc.id}`,
        draw: () => drawOverworldMerchant(
          context, art, x, y, facing, moving,
          horseAnimationFrame + Number(npc.id % 19n), cameraX, cameraY, scale,
        ),
      });
      continue;
    }
    const profile = wildlifeProfile(snapshot, npc.id);
    const species = profile?.species ?? (npc.kind === 'horse' ? 'horse' : null);
    if (species === null) continue;
    if (species === 'bee' && npc.wanderDirection === 'inside_hive') continue;
    if (npc.displayName.trim()) nameplates.push({ x, y: projectedWorldY(x, y), name: npc.displayName });
    const animationFrame = horseAnimationFrame + Number(npc.id % 19n);
    const biome = survivalBiomeAt(
      snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED,
      Math.floor(x / 16),
      Math.floor(y / 16),
    );
    const inWater = biome === 'freshwater' || biome === 'oasis_water';
    const moving = sleeping ? false : npc.moving;
    const visualBounds = species === 'horse'
      ? horseWorldBounds(
        art, x, y, facing, moving, animationFrame, profile?.variant ?? 0, npc.wanderDirection,
      )
      : wildlifeWorldBounds(
        art, species, profile?.variant ?? 0, npc.wanderDirection,
        x, y, facing, moving, animationFrame, inWater,
      );
    targetableEntities.push(projectTargetable(targetableFromVisualBounds(
      { kind: 'npc', id: npc.id }, visualBounds, x, y, npcTargetDimensions(species),
    ), x, y));
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `npc:${npc.id}`,
      draw: () => species === 'horse'
        ? drawOverworldHorse(
          context, art, x, y, facing, moving, animationFrame,
          cameraX, cameraY, scale, false, undefined, profile?.variant ?? 0, npc.wanderDirection,
        )
        : drawOverworldWildlife(
          context, art, species, profile?.variant ?? 0, npc.wanderDirection,
          x, y, facing, moving, animationFrame, cameraX, cameraY, scale, inWater,
        ),
    });
  }
  if (!debugEntitiesHidden) for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    const offline = worldPlayerIsOffline(local, snapshot.profiles.get(id)?.online);
    const display = local ? null : remoteDisplay.get(id) ?? null;
    const previousDisplay = local || display === null ? null : previousRemoteDisplay.get(id) ?? display;
    const renderedRemote = display === null || previousDisplay === null
      ? null
      : interpolateFixedPosition(previousDisplay, display, alpha);
    const mount = offline ? null : snapshot.npcs.find((npc) => npc.rider?.toHexString() === id) ?? null;
    const mountVariant = mount === null ? 0 : wildlifeProfile(snapshot, mount.id)?.variant ?? 0;
    const jumpPresentation = mount === null ? null : horseJumpPose(
      player.jumpFromX,
      player.jumpFromY,
      player.x,
      player.y,
      player.jumpUntilTick,
      renderTickClock.renderTick,
    );
    const xFixed = jumpPresentation?.x
      ?? (local ? renderedLocal?.x ?? player.x : renderedRemote?.x ?? player.x);
    const yFixed = jumpPresentation?.y
      ?? (local ? renderedLocal?.y ?? player.y : renderedRemote?.y ?? player.y);
    const footYFixed = jumpPresentation?.footY ?? yFixed;
    const x = xFixed / FIXED_UNITS_PER_PIXEL;
    const y = yFixed / FIXED_UNITS_PER_PIXEL;
    const footY = footYFixed / FIXED_UNITS_PER_PIXEL;
    const terrainContactY = terrainContactWorldYForPlayer(footY);
    const playerProjection = projectionAt(x, terrainContactY);
    renderedPlayerAnchors.set(id, { x, y: y - playerProjection });
    const equipped = local ? lightPreviewKind ?? selectedItem(snapshot) : display?.equippedKind ?? player.equippedKind;
    const equippedLit = equipped !== 'lantern' || (local
      ? lightPreviewKind === 'lantern' || (selectedItemRow(snapshot)?.lit ?? true)
      : display?.equippedLit ?? player.equippedLit);
    if (!offline && (equipped === 'lantern' || equipped === 'torch') && equippedLit
      && worldPointVisible(x, y, lightVisible)) {
      const [lightX, lightY] = playerLightPosition(x, y);
      const baseRadius = equipped === 'lantern' ? LANTERN_LIGHT_RADIUS_TILES : TORCH_LIGHT_RADIUS_TILES;
      const flicker = equipped === 'torch'
        ? deterministicFlameFlicker(
            BigInt(`0x${id.slice(0, 16)}`),
            visualTickClock.renderTick,
          )
        : { radiusOffset: 0, strengthPerMille: 1000 };
      pointLights.push(projectedLight({
        worldX: lightX,
        worldY: lightY,
        receiverDirectionWorldY: y,
        radiusTiles: baseRadius + flicker.radiusOffset,
        color: equipped === 'lantern' ? LANTERN_LIGHT : TORCH_LIGHT,
        strengthPerMille: flicker.strengthPerMille,
        profile: equipped === 'torch' ? 'flame' : 'steady',
      }, terrainContactY));
    }
    if (!worldPointVisible(x, y, visible)) continue;
    if (!local && !offline) targetableEntities.push({
      target: { kind: 'player', id }, x, y: y - playerProjection,
      halfWidth: mount === null ? 8 : 16, height: mount === null ? 24 : 32,
    });
    const authoritativeFacing = (local ? predicted?.facing ?? player.facing : display?.facing ?? player.facing) as Direction;
    const localEquipped = local ? selectedItem(snapshot) : player.equippedKind;
    const facing = local
      ? equippedItemFacing(localEquipped, authoritativeFacing, cursorFacing())
      : authoritativeFacing;
    const horseFacing = mount === null ? facing : mount.facing as Direction;
    const displayedDx = local
      ? (renderedLocal?.x ?? player.x) - (previousPredicted?.position.x ?? renderedLocal?.x ?? player.x)
      : (display?.x ?? player.x) - (previousDisplay?.x ?? display?.x ?? player.x);
    const displayedDy = local
      ? (renderedLocal?.y ?? player.y) - (previousPredicted?.position.y ?? renderedLocal?.y ?? player.y)
      : (display?.y ?? player.y) - (previousDisplay?.y ?? display?.y ?? player.y);
    const moving = !offline && presentationMoving(
      local,
      predicted?.moving,
      displayedDx,
      displayedDy,
      jumpPresentation !== null,
    );
    const appearance = snapshot.appearances.get(id);
    nameplates.push({
      x,
      y: y - playerProjection,
      name: profileName(snapshot.profiles, id),
      ...(offline ? { offline: true } : {}),
    });
    enqueueWorldDepth(x, footY, {
      footY,
      tie: `player:${id}`,
      draw: () => {
        const controller = avatarAnimations.get(id) ?? new AvatarAnimationController();
        avatarAnimations.set(id, controller);
        const renderTick = renderTickClock.renderTick;
        const localBowCharging = local && bowChargeStartedAtMs !== null;
        const localPreviewActive = local && (localBowCharging
          || (localActionStartedAtMs !== null && performance.now() - localActionStartedAtMs < 650));
        const actionKind = offline
          ? 'none'
          : localBowCharging
            ? 'ranged_weapon'
            : localPreviewActive ? localPredictedActionKind : display?.actionKind ?? player.actionKind;
        const actionStartedTick = localPreviewActive
          ? BigInt(Math.floor(renderTick - (performance.now() - (localActionStartedAtMs ?? performance.now())) / AUTHORITY_TICK_MS))
          : display?.actionStartedTick ?? player.actionStartedTick;
        const heldLightEquipped = equipped === 'torch' || equipped === 'lantern';
        const walkAnimation = heldLightEquipped
          ? heldLightAnimationForDirection(facing, true)
          : avatarAnimationForDirection(facing);
        const actionVisual = actionVisualForDirection(art, actionKind, facing);
        const actionFrames = actionVisual === null
          ? 4
          : actionVisual.asset.metadata.animations[actionVisual.toolAnimation]?.length ?? 4;
        const actionFps = actionVisual === null
          ? 10
          : actionVisual.asset.metadata.animationMeta?.[actionVisual.toolAnimation]?.fps ?? 10;
        const locomotionAsset = heldLightEquipped ? art.playerRig.base.action : art.playerRig.base.standing;
        const animation = controller.update(
          xFixed, yFixed, actionKind, actionStartedTick, renderTick,
          locomotionAsset.metadata.animations[walkAnimation]?.length ?? 6,
          locomotionAsset.metadata.animationMeta?.[walkAnimation]?.fps ?? 8,
          actionFrames,
          actionFps,
          actionVisual !== null,
        );
        if (animation.fallback) unknownActionKinds.add(actionKind);
        const chargedBowFrame = localBowCharging && actionVisual !== null
          ? bowHeldAnimationFrame(
            currentBowChargeMs(),
            actionFrames,
          )
          : null;
        const actionFrame = chargedBowFrame
          ?? (animation.channel === 'action' && !animation.fallback ? animation.frame : null);
        const drawPlayer = (): void => {
          if (mount !== null) {
            if (actionKind === 'ranged_weapon' && actionFrame !== null && actionVisual !== null) {
              drawOverworldMountedAction(
                context, art, x, y, horseFacing, facing, moving, horseAnimationFrame,
                cameraX, cameraY, scale, actionFrame, actionVisual, appearance, mountVariant,
              );
            } else {
              drawOverworldHorse(
                context, art, x, y, horseFacing, moving, horseAnimationFrame,
                cameraX, cameraY, scale, true, appearance, mountVariant,
              );
            }
            return;
          }
          drawOverworldAvatar(
            context, art, x, y, facing, moving, animation.locomotionFrame,
            cameraX, cameraY, scale, actionFrame, actionVisual, appearance, equipped, horseAnimationFrame,
            equippedLit,
          );
          if (snapshot.chests.find((chest) => chest.carriedBy?.toHexString() === id)) {
            drawOverworldChest(context, art, x, y - 17, cameraX, cameraY, scale);
          }
          if (snapshot.combatTargets.find((target) => target.carriedBy?.toHexString() === id)) {
            drawOverworldArcheryTarget(context, art, x, y - 25, cameraX, cameraY, scale);
          }
          const handsPlaceable = snapshot.placeables.find(
            (placeable) => placeable.carriedBy?.toHexString() === id,
          );
          if (handsPlaceable !== undefined) {
            drawOverworldPlaceable(
              context, art, handsPlaceable.kind, false, 0,
              Math.floor(performance.now() / 125), x, y - 17,
              cameraX, cameraY, scale, handsPlaceable.lit,
            );
          }
        };
        if (!offline) {
          drawPlayer();
          return;
        }
        context.save();
        context.filter = OFFLINE_AVATAR_FILTER;
        context.globalAlpha *= 0.92;
        drawPlayer();
        context.restore();
      },
    }, terrainContactY);
  }
  latestTargetableEntities = targetableEntities;
  drawCalls += drawWorldDepthQueue(
    worldDepthItems,
    cameraY,
    scale,
    (minimumDepth, maximumDepth) => rain.drawDepthRange(
      context,
      cameraX,
      cameraY,
      scale,
      worldZoom,
      minimumDepth,
      maximumDepth,
    ),
  );
  const markerTarget = selectedEntityTarget;
  const markedTarget = markerTarget === null ? undefined
    : targetableEntities.find((entity) => sameEntityTarget(entity.target, markerTarget));
  if (!interfaceHidden && markedTarget !== undefined) {
    drawSelectedEntityMarker(context, markedTarget, cameraX, cameraY, scale);
  }
  drawCalls += worldDepthItems.length;
  drawCalls += weatherEffects.drawCloudShadows(
    context,
    renderWeather,
    weatherVisualTick,
    cameraX,
    cameraY,
    scale,
    viewportWidth,
    viewportHeight,
  );
  if (!lightingEffectsDisabled) {
    lightmap.draw(
      context,
      terrain,
      cameraX,
      cameraY,
      scale,
      frame.layout.width,
      frame.layout.height,
      frameAmbient,
      pointLights,
      lightOcclusion,
    );
    drawCalls += 1;
  }
  drawCalls += drawCellarOreVeinPreview(
    context,
    terrain,
    seed,
    cameraX,
    cameraY,
    scale,
    frame.layout.width,
    frame.layout.height,
  );
  drawCalls += weatherEffects.drawWind(
    context,
    renderWeather,
    weatherVisualTick,
    cameraX,
    cameraY,
    scale,
    viewportWidth,
    viewportHeight,
    windTrees,
  );
  const farmItem = selectedItem(snapshot);
  const tileToolSelected = farmItem === 'hoe' || farmItem === 'watering_can'
    || itemDefinition(farmItem)?.tags.includes('item.seed') === true;
  const placeableSelected = carriedChest(snapshot) !== null
    || carriedCombatTarget(snapshot) !== null
    || carriedPlaceable(snapshot) !== null
    || itemDefinition(farmItem)?.tags.includes('item.placeable') === true
    || farmItem === 'homestead_deed';
  const interactionTarget = tileToolSelected || placeableSelected ? targetInteractionTile() : null;
  const farmTarget = tileToolSelected ? interactionTarget : null;
  if (!interfaceHidden && !debugEntitiesHidden && interactionTarget !== null && localMount(snapshot) === null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    const deedSelected = farmItem === 'homestead_deed';
    const blocked = deedSelected
      ? homesteadPlacementBlocked(snapshot, interactionTarget)
      : placeableSelected && placementTileBlocked(snapshot, interactionTarget);
    const previewTiles = deedSelected
      ? homesteadMarkerPlacementTiles(interactionTarget.tileX, interactionTarget.tileY)
      : [interactionTarget];
    for (const tile of previewTiles) {
      drawInteractionTileReticle(
        context,
        blocked ? art.uiSkin.selectorDeny : art.uiSkin.selectorNeutral,
        tile.tileX,
        tile.tileY,
        cameraX,
        cameraY,
        scale,
      );
      drawCalls += 1;
    }
  }
  const cellarWallTarget = farmItem === 'pickaxe' ? targetCellarWall(snapshot) : null;
  if (!interfaceHidden && !debugEntitiesHidden && cellarWallTarget !== null && localMount(snapshot) === null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    drawInteractionTileReticle(
      context,
      art.uiSkin.selectorNeutral,
      cellarWallTarget.tileX,
      cellarWallTarget.tileY,
      cameraX,
      cameraY,
      scale,
    );
    drawCalls += 1;
  }
  if (!interfaceHidden && !debugEntitiesHidden && farmItem === 'bow'
    && overworldUi.openWindow === null && !chatOverlay.isOpen
    && drawBowAimGuide(
      context,
      cameraX,
      cameraY,
      scale,
      projectionAt,
    )) drawCalls += 1;
  if (!interfaceHidden && debugCollision) {
    const activeElevation = terrainElevationAtWorldFoot(terrain, localX, localTerrainContactY);
    drawCollisionOverlay(
      context,
      cameraX,
      cameraY,
      scale,
      frame.layout.width,
      frame.layout.height,
      terrain,
      activeElevation,
      !debugEntitiesHidden,
    );
    if (!debugEntitiesHidden) drawPlayerCollisionOverlay(context, cameraX, cameraY, scale, snapshot, terrain);
    drawToolInteractionOverlay(context, cameraX, cameraY, scale, snapshot, terrain);
    if (debugTerrainPoint !== null) {
      const draft = inspectTerrainAtProjectedPoint(
        terrain,
        debugTerrainPoint.worldX,
        debugTerrainPoint.worldY,
        activeElevation,
        false,
      );
      const selectedScreenX = Math.round((draft.tileX * 16 - cameraX) * scale);
      const selectedScreenY = Math.round((draft.tileY * 16
        - activeElevation * terrainVisualProjectionRowsPerLevel(terrain) * 16 - cameraY) * scale);
      context.save();
      context.strokeStyle = '#fff36a';
      context.lineWidth = Math.max(1, scale);
      context.strokeRect(selectedScreenX, selectedScreenY, 16 * scale, 16 * scale);
      context.restore();
    }
  }
  renderer.compositeWorld();
  drawCalls += 1;

  const uiWidth = renderer.cssWidth / uiScale;
  const uiHeight = renderer.cssHeight / uiScale;
  const uiContext = renderer.beginUi(uiScale);
  const interaction = targetInteraction(snapshot);
  const handsChest = carriedChest(snapshot);
  const handsCombatTarget = carriedCombatTarget(snapshot);
  const handsPlaceable = carriedPlaceable(snapshot);
  const facedCombatTarget = targetFacedCombatTarget(snapshot);
  const groundLantern = targetGroundLantern(snapshot);
  const selectedLantern = selectedItemRow(snapshot);
  const farmSoil = farmTarget === null ? undefined
    : snapshot.soil.get(farmSoilKey(
      farmTarget.tileX, farmTarget.tileY, activeSpaceDefinition.spaceId,
    ));
  const farmCrop = farmTarget === null ? undefined
    : snapshot.crops.get(farmSoilKey(
      farmTarget.tileX, farmTarget.tileY, activeSpaceDefinition.spaceId,
    ));
  const farmCropDefinition = cropDefinition(farmCrop?.cropKind ?? '');
  const farmCropGrowth = farmCrop === undefined || farmSoil === undefined || farmCropDefinition === null
    ? null
    : cropGrowthAt(
      farmCropDefinition,
      farmCrop.growthTicks,
      farmCrop.growthUpdatedAtTick,
      farmSoil.wateredAtTick,
      renderWeatherTick,
      farmSoil.watered,
    );
  const farmPrompt = farmTarget === null ? null
    : farmCropDefinition !== null
      ? farmCropGrowth?.mature === true
        ? `[F] HARVEST ${farmCropDefinition.displayName.toUpperCase()}`
        : `${farmCropDefinition.displayName.toUpperCase()} ${farmCropGrowth?.watered === true ? 'GROWING' : 'NEEDS WATER'}`
    : itemDefinition(farmItem)?.tags.includes('item.seed') === true
      ? farmSoil === undefined ? 'TILL SOIL BEFORE PLANTING' : '[F] PLANT SEEDS'
    : farmItem === 'hoe' ? (farmSoil === undefined ? '[F] TILL SOIL' : '[F] RESTORE GRASS')
      : farmSoil === undefined ? 'TILL SOIL BEFORE WATERING'
        : farmSoil.watered && renderWeatherTick < farmSoil.wateredAtTick + CROP_WATERING_TICKS
          ? 'SOIL ALREADY WATERED' : '[F] WATER SOIL';
  const farmGate = targetOwnedHomesteadGate(snapshot);
  const basePrompt = debugEntitiesHidden || npcInteractionUi.active ? null
    : farmGate !== null ? `[F] ${farmGate.open ? 'CLOSE' : 'OPEN'} FARM GATE`
    : handsCombatTarget !== null ? '[F] PLACE ARCHERY TARGET'
      : facedCombatTarget !== null ? '[F] PICK UP ARCHERY TARGET'
        : handsPlaceable !== null ? `[F] PLACE ${hotbarItemLabel(handsPlaceable.kind)}`
        : handsChest !== null ? '[F] PLACE CHEST'
          : selectedItem(snapshot) === 'chest' ? '[F] PLACE CHEST'
            : interaction === null ? farmPrompt : interactionPrompt(interaction, snapshot);
  const lanternPrompt = groundLantern !== null
    ? `[F] TURN ${groundLantern.lit ? 'OFF' : 'ON'} LANTERN`
    : selectedLantern?.itemKind === 'lantern'
      ? `[F] TURN ${selectedLantern.lit ? 'OFF' : 'ON'} LANTERN`
      : null;
  const prompt = lanternPrompt === null
    || (interaction?.kind === 'world_item' && interaction.item.itemKind === 'lantern')
    ? basePrompt
    : basePrompt === null ? lanternPrompt : `${basePrompt}  ${lanternPrompt}`;
  const authorityTick = snapshot.environment?.calendarTick ?? snapshot.clock?.authorityTick ?? 0n;
  const calendar = calendarAtTick(Number(authorityTick) * SIM_STEPS_PER_AUTHORITY_TICK);
  const weatherMode = worldWeatherMode();
  const onlinePlayers = [...snapshot.profiles]
    .filter((profile) => profile.online)
    .map((profile) => ({
      displayName: profile.displayName,
      self: profile.identity.toHexString() === snapshot.identityHex,
    }))
    .sort((left, right) => Number(right.self) - Number(left.self)
      || left.displayName.localeCompare(right.displayName));
  const playerVitals = resolvedPlayerVitals(snapshot);
  const ownProfile = [...snapshot.profiles].find((profile) => profile.identity.toHexString() === snapshot.identityHex);
  const appearance = ownAppearanceSelection(snapshot);
  const skillTracks = SKILL_TRACKS.map((track) => {
    const row = [...snapshot.skillTracks].find((candidate) => candidate.track === track);
    return {
      track,
      experience: row?.experience ?? 0n,
      spentPoints: row?.spentPoints ?? 0,
      bonusPoints: row?.bonusPoints ?? 0,
      respecCount: row?.respecCount ?? 0,
    };
  });
  const skillRanks = [...snapshot.skillNodes]
    .filter((row) => isSkillTrack(row.track))
    .map((row) => ({ nodeId: row.nodeId, rank: row.rank }));
  const targetVitals = selectedTargetVitals(snapshot);
  if (selectedEntityTarget !== null && targetVitals === undefined) selectedEntityTarget = null;
  const effectAuthorityTick = snapshot.clock?.authorityTick ?? 0n;
  const visibleEffects = [...snapshot.effects]
    .filter((effect) => (EFFECT_KINDS as readonly string[]).includes(effect.effectKind)
      && effect.expiresTick > effectAuthorityTick)
    .sort((left, right) => left.appliedTick > right.appliedTick ? -1 : left.appliedTick < right.appliedTick ? 1 : 0)
    .map((effect) => {
      const definition = EFFECT_DEFINITIONS[effect.effectKind as EffectKind];
      const remainingTicks = Number(effect.expiresTick - effectAuthorityTick);
      return {
        effectKind: effect.effectKind,
        name: definition.name,
        stacks: effect.stacks,
        remainingTicks,
        durationTicks: definition.durationTicks,
      };
    });
  const quests = questLogEntries(snapshot);
  overworldUi.update({
    width: uiWidth,
    height: uiHeight,
    connected: snapshot.connected,
    touchControls: touchControls.available,
    playerCount: onlinePlayers.length,
    onlinePlayersVisible,
    zoneName: activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
      ? 'Overworld'
      : activeSpaceDefinition.name
        .split('_')
        .map((part) => part.length > 0 ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part)
        .join(' '),
    selectedSlot: optimisticSelectedSlot ?? snapshot.survival?.selectedSlot ?? 0,
    balanceBronze: snapshot.wallet?.balanceBronze ?? 0n,
    inventory: [...snapshot.inventorySlots],
    cursorStack: snapshot.inventoryCursor,
    ...(playerVitals === null ? {} : { vitals: {
      playerId: snapshot.identityHex ?? 'local',
      ...playerVitals,
      vigour: displayedVigourCenti(playerVitals.vigour),
    } }),
    ...(targetVitals === undefined ? {} : { targetVitals }),
    vigourDenied: vigourDenyTicks > 0,
    effects: visibleEffects,
    openChestInventory: [...snapshot.openChestSlots],
    openPlaceableInventory: [...snapshot.openPlaceableSlots],
    hasBackpack: [...snapshot.inventorySlots].some((slot) => slot.itemKind === 'backpack'),
    backpackSlotCapacity: Math.max(
      [...snapshot.inventorySlots].some((slot) => slot.itemKind === 'backpack') ? BACKPACK_SLOT_COUNT : BASE_BACKPACK_CAPACITY,
      snapshot.survival?.debugBackpackSlots ?? 0,
    ),
    audioVolumes: audio.getSettings(),
    audioBackground: {
      music: audio.getSettings().musicInBackground,
      sounds: audio.getSettings().soundsInBackground,
    },
    canAdministerWorld: snapshot.membership?.role === 'owner',
    dateLabel: `${calendar.season.toUpperCase()} ${calendar.dayOfSeason}`,
    timeLabel: formatDayTime(simTickOfDayAtAuthorityTick(authorityTick), TICKS_PER_DAY),
    timeFraction: authorityDayProgress(authorityTick),
    moonPhase: lunarPhaseAtAuthorityTick(authorityTick),
    moonIlluminationPerMille: lunarIlluminationAtAuthorityTick(authorityTick),
    raining: rain.enabled,
    weatherMode,
    windDirectionMode: worldWindDirection(),
    windDirectionLabel: windDirectionLabel(renderWeather.windDirectionX, renderWeather.windDirectionY),
    lightingEffectsDisabled,
    cellarOrePreview,
    fullscreen: documentIsFullscreen(),
    pwaUpdateStatus: pwaClient.status,
    prompt,
    toast: toastTicks > 0 ? toast.slice(0, 42) : null,
    toastKind,
    nearbyCraftingStations: nearbyCraftingStations(snapshot),
    minimapTrackingEnabled: skillRanks.some((row) => row.nodeId === 'cartographer' && row.rank > 0),
    skills: {
      tracks: skillTracks,
      ranks: skillRanks,
      balanceBronze: snapshot.wallet?.balanceBronze ?? 0n,
    },
    quests,
    ...(playerVitals === null || snapshot.stats === null ? {} : { character: {
      playerId: snapshot.identityHex ?? 'local',
      displayName: ownProfile?.displayName ?? 'Farmer',
      appearance,
      baseAttributes: {
        str: snapshot.stats.str, dex: snapshot.stats.dex, con: snapshot.stats.con,
        int: snapshot.stats.int, wis: snapshot.stats.wis, cha: snapshot.stats.cha,
      },
      resolvedAttributes: playerVitals.attributes,
      health: playerVitals.health,
      maxHealth: playerVitals.maxHealth,
      mana: playerVitals.mana,
      maxMana: playerVitals.maxMana,
      vigour: displayedVigourCenti(playerVitals.vigour),
      maxVigour: playerVitals.maxVigour,
      tracks: skillTracks.map(({ track, experience }) => ({ track, experience })),
      effects: visibleEffects.map((effect) => effect.name),
      equipment: [...snapshot.inventorySlots]
        .filter((row) => row.slot >= EQUIPMENT_SLOT_FIRST && row.slot < EQUIPMENT_SLOT_END_EXCLUSIVE
          && row.itemKind !== 'empty' && row.quantity > 0)
        .map((row) => ({
          slot: row.slot - EQUIPMENT_SLOT_FIRST,
          itemKind: row.itemKind,
          quantity: row.quantity,
          durability: row.durability,
          lit: row.lit,
        })),
    } }),
  });
  npcInteractionUi.update(snapshot.activeDialogue === null ? null : {
    width: uiWidth,
    height: uiHeight,
    npcId: snapshot.activeDialogue.npcId,
    dialogueId: snapshot.activeDialogue.dialogueId,
    nodeId: snapshot.activeDialogue.nodeId,
    balanceBronze: snapshot.wallet?.balanceBronze ?? 0n,
    inventory: [...snapshot.inventorySlots],
    quests: [...snapshot.quests],
    touchControls: touchControls.available,
  });
  questTracker.update({
    width: uiWidth,
    height: uiHeight,
    anchorRect: overworldUi.minimapBounds,
    entries: questTrackerEntries(quests),
  });
  const channelNames = new Map([...snapshot.chatChannels].map((channel) => [channel.id, channel.displayName]));
  chatOverlay.update({
    width: uiWidth,
    height: uiHeight,
    connected: snapshot.connected,
    canAdministerWorld: snapshot.membership?.role === 'owner',
    onlinePlayerNames: onlinePlayers.map((player) => player.displayName),
    replyPlayerName: latestIncomingWhisper(snapshot)?.senderDisplayName ?? null,
    touchControls: touchControls.available,
    keyboardInset: softwareKeyboardInset(uiScale),
    messages: [
      ...(snapshot.motd === null ? [] : [{
        id: -2n,
        channelName: 'MOTD',
        senderDisplayName: 'World',
        kind: 'motd',
        body: snapshot.motd,
        itemLinksJson: '[]',
      }]),
      ...[...snapshot.sessionChatNotices].map((notice) => ({
        id: chatTimelineId(notice.issuedAt.microsSinceUnixEpoch, notice.id, 1n),
        channelName: notice.kind === 'last' ? 'Last' : 'World',
        senderDisplayName: 'World',
        kind: 'system',
        body: notice.body,
        itemLinksJson: '[]',
      })),
      ...[...snapshot.chatMessages].map((message) => ({
        id: chatTimelineId(message.sentAt.microsSinceUnixEpoch, message.id, 0n),
        channelName: channelNames.get(message.channelId) ?? (message.kind === 'whisper' ? 'Whisper' : 'Channel'),
        senderDisplayName: message.kind === 'whisper'
          && message.sender.toHexString() === snapshot.identityHex
          && message.recipient !== undefined
          ? profileName(snapshot.profiles, message.recipient.toHexString())
          : message.senderDisplayName,
        kind: message.kind === 'whisper' && message.sender.toHexString() === snapshot.identityHex
          ? 'whisper_outgoing'
          : message.kind,
        body: message.body,
        itemLinksJson: message.itemLinksJson,
      })),
    ],
  });
  characterNamePrompt.update(
    uiWidth,
    uiHeight,
    snapshot.connected && snapshot.characterProfile?.nameChosen === false,
    touchControls.available,
  );
  if (!interfaceHidden && nameplatesVisible) {
    overworldUi.drawNameplates(uiContext, nameplates.map((nameplate) => ({
      x: (nameplate.x - cameraX) * worldZoom / uiScale,
      y: (nameplate.y - cameraY - 42) * worldZoom / uiScale,
      text: nameplate.name,
      ...(nameplate.offline === true ? { offline: true } : {}),
    })));
  }
  if (!interfaceHidden) {
    const bob = Math.round(Math.sin(performance.now() / 260));
    for (const marker of questMarkerAnchors) {
      const asset = art.itemIcons[`quest_${marker.kind}`];
      if (asset === undefined) continue;
      const x = (marker.x - cameraX) * worldZoom / uiScale - 8;
      const y = (marker.y - cameraY - 40) * worldZoom / uiScale - 8 + bob;
      drawUiAsset(uiContext, asset, x, y, 1);
    }
  }
  if (!interfaceHidden && hoveredInteractionTile !== null && worldPointer !== null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    const hoveredCrop = snapshot.crops.get(farmSoilKey(
      hoveredInteractionTile.tileX,
      hoveredInteractionTile.tileY,
      activeSpaceDefinition.spaceId,
    ));
    const hoveredSoil = hoveredCrop === undefined ? undefined : snapshot.soil.get(hoveredCrop.id);
    const definition = cropDefinition(hoveredCrop?.cropKind ?? '');
    if (hoveredCrop !== undefined && hoveredSoil !== undefined && definition !== null) {
      const growth = cropGrowthAt(
        definition,
        hoveredCrop.growthTicks,
        hoveredCrop.growthUpdatedAtTick,
        hoveredSoil.wateredAtTick,
        renderWeatherTick,
        hoveredSoil.watered,
      );
      const timerFrame = Math.min(15, Math.floor(growth.progress * 15));
      const status = growth.mature
        ? 'READY TO HARVEST'
        : `${growth.watered ? 'WATERED' : 'NEEDS WATER'} - ${cropTimeLabel(growth.remainingTicks)} LEFT`;
      const width = Math.max(
        104,
        measurePixelText(definition.displayName.toUpperCase(), 1, art.ui.font) + 31,
        measurePixelText(status, 1, art.ui.font) + 12,
      );
      const worldX = hoveredCrop.tileX * 16 + 8;
      const worldY = (hoveredCrop.tileY + 1) * 16;
      const anchorX = (worldX - cameraX) * worldZoom / uiScale;
      const anchorY = (worldY - projectionAt(worldX, worldY) - cameraY - 22) * worldZoom / uiScale;
      const panelX = Math.max(2, Math.min(uiWidth - width - 2, Math.round(anchorX - width / 2)));
      const panelY = Math.max(2, Math.round(anchorY - 32));
      drawPixelPanel(uiContext, art.ui, panelX, panelY, width, 30);
      drawUiAssetFrame(uiContext, art.cropTimer, timerFrame, panelX + 7, panelY + 7, 1);
      drawPixelText(uiContext, art.ui, definition.displayName.toUpperCase(), panelX + 28, panelY + 6);
      drawPixelText(uiContext, art.ui, status, panelX + 7, panelY + 18, {
        color: growth.watered || growth.mature ? '#f8ead0' : '#ffb05b',
      });
    }
  }
  if (!interfaceHidden) {
    const combatTextNow = performance.now();
    for (const combatText of floatingCombatTexts) {
      const age = combatTextNow - combatText.startedAtMs;
      const progress = Math.max(0, Math.min(1, age / 1_100));
      const target = snapshot.combatTargets.get(combatText.targetId);
      const worldX = (target?.x ?? combatText.x) / FIXED_UNITS_PER_PIXEL;
      const worldY = (target?.y ?? combatText.y) / FIXED_UNITS_PER_PIXEL;
      const projection = projectionAt(worldX, worldY);
      const screenX = (worldX - cameraX) * worldZoom / uiScale;
      const screenY = (worldY - projection - cameraY - 35 - progress * 13) * worldZoom / uiScale;
      const label = `-${Math.max(1, Math.round(combatText.amountCenti / 100))}`;
      const textColor = combatText.critical ? '#ffd34e' : '#fff1cf';
      uiContext.save();
      uiContext.globalAlpha = progress < 0.6 ? 1 : Math.max(0, (1 - progress) / 0.4);
      drawPixelText(uiContext, art.ui, label, screenX + 1, screenY + 1, {
        align: 'center', color: '#3f2832',
      });
      drawPixelText(uiContext, art.ui, label, screenX, screenY, {
        align: 'center', color: textColor,
      });
      if (combatText.critical) drawPixelText(uiContext, art.ui, label, screenX + 1, screenY, {
        align: 'center', color: textColor,
      });
      uiContext.restore();
    }
  }
  if (!interfaceHidden) {
    const mountedRiderIds = new Set<string>();
    for (const npc of snapshot.npcs) {
      if (npc.rider !== undefined) mountedRiderIds.add(npc.rider.toHexString());
    }
    for (const speech of snapshot.worldSpeech) {
      const speakerId = speech.speaker.toHexString();
      const renderedPosition = renderedPlayerAnchors.get(speakerId);
      const livePosition = renderedPosition === undefined ? snapshot.players.get(speakerId) : undefined;
      const worldX = renderedPosition?.x ?? (livePosition?.x ?? speech.x) / FIXED_UNITS_PER_PIXEL;
      const worldY = renderedPosition?.y ?? (livePosition?.y ?? speech.y) / FIXED_UNITS_PER_PIXEL;
      const screenX = (worldX - cameraX) * worldZoom / uiScale;
      const screenY = (worldY - cameraY) * worldZoom / uiScale;
      const onScreen = screenX >= 0 && screenX <= uiWidth && screenY >= 0 && screenY <= uiHeight;
      if (!onScreen && speech.kind !== 'shout') continue;
      const kind = speech.kind === 'shout' ? 'shout' : 'say';
      const layout = speechBubbleLayout(speech.body);
      const anchor: EdgeSpeechAnchor = onScreen
        ? {
            x: screenX,
            y: screenY - speechBubbleHeadOffset(worldZoom, uiScale, mountedRiderIds.has(speakerId)),
            direction: 'down',
          }
        : edgeSpeechAnchor(screenX, screenY, uiWidth, uiHeight);
      const rect = speechBubbleRect(anchor, layout, uiWidth, uiHeight);
      drawSpeechBubble(uiContext, art.ui, art.uiSkin, rect, layout, kind, anchor.direction);
    }
    // Whispers never enter public world-speech storage. Render the latest
    // recent message per sender from the recipient-filtered chat view so the
    // purple tell bubble remains private to its two participants.
    const recentTellBySpeaker = new Map<string, ChatMessage>();
    const nowMicros = BigInt(Date.now()) * 1_000n;
    for (const message of snapshot.chatMessages) {
      if (message.kind !== 'whisper'
        || !speechBubbleIsRecent(message.sentAt.microsSinceUnixEpoch, nowMicros)) continue;
      const speakerId = message.sender.toHexString();
      const previous = recentTellBySpeaker.get(speakerId);
      if (previous === undefined || message.id > previous.id) recentTellBySpeaker.set(speakerId, message);
    }
    for (const [speakerId, message] of recentTellBySpeaker) {
      const renderedPosition = renderedPlayerAnchors.get(speakerId);
      const livePosition = renderedPosition === undefined ? snapshot.players.get(speakerId) : undefined;
      if (renderedPosition === undefined && livePosition === undefined) continue;
      const worldX = renderedPosition?.x ?? livePosition!.x / FIXED_UNITS_PER_PIXEL;
      const worldY = renderedPosition?.y ?? livePosition!.y / FIXED_UNITS_PER_PIXEL;
      const screenX = (worldX - cameraX) * worldZoom / uiScale;
      const screenY = (worldY - cameraY) * worldZoom / uiScale;
      if (screenX < 0 || screenX > uiWidth || screenY < 0 || screenY > uiHeight) continue;
      const layout = speechBubbleLayout(message.body);
      const anchor: EdgeSpeechAnchor = {
        x: screenX,
        y: screenY - speechBubbleHeadOffset(worldZoom, uiScale, mountedRiderIds.has(speakerId)),
        direction: 'down',
      };
      const rect = speechBubbleRect(anchor, layout, uiWidth, uiHeight);
      drawSpeechBubble(uiContext, art.ui, art.uiSkin, rect, layout, 'tell', 'down');
    }
    const thought = snapshot.thought;
    const ownAnchor = snapshot.identityHex === null ? undefined : renderedPlayerAnchors.get(snapshot.identityHex);
    if (thought !== null && ownAnchor !== undefined
      && (snapshot.clock?.authorityTick ?? 0n) <= thought.expiresTick) {
      const screenX = (ownAnchor.x - cameraX) * worldZoom / uiScale;
      const screenY = (ownAnchor.y - cameraY) * worldZoom / uiScale;
      const layout = speechBubbleLayout(thought.body);
      const anchor: EdgeSpeechAnchor = {
        x: screenX,
        y: screenY - speechBubbleHeadOffset(worldZoom, uiScale, localMount(snapshot) !== null),
        direction: 'down',
      };
      const rect = speechBubbleRect(anchor, layout, uiWidth, uiHeight);
      drawSpeechBubble(uiContext, art.ui, art.uiSkin, rect, layout, 'thought', 'down');
    }
    questTracker.draw(uiContext);
    chatOverlay.draw(uiContext);
    overworldUi.draw(uiContext);
    if (onlinePlayersVisible) overworldUi.drawOnlinePlayers(uiContext, onlinePlayers);
    npcInteractionUi.draw(uiContext);
    characterNamePrompt.draw(uiContext);
    touchControls.draw(uiContext, art.ui, art.uiSkin, uiWidth, uiHeight);
  }
  if (!interfaceHidden && debugCollision && debugTerrainPoint !== null) {
    const activeElevation = terrainElevationAtWorldFoot(terrain, localX, localTerrainContactY);
    const draft = inspectTerrainAtProjectedPoint(
      terrain,
      debugTerrainPoint.worldX,
      debugTerrainPoint.worldY,
      activeElevation,
      false,
    );
    const inspection = inspectTerrainAtProjectedPoint(
      terrain,
      debugTerrainPoint.worldX,
      debugTerrainPoint.worldY,
      activeElevation,
      collisionTileIsBlockedAtPlane(worldCollision, draft.tileX, draft.tileY, activeElevation),
    );
    const allLines = terrainInspectionLines(inspection);
    const maximumLines = Math.max(6, Math.floor((uiHeight - 12) / 9));
    const lines = allLines.length <= maximumLines
      ? allLines
      : [...allLines.slice(0, maximumLines - 1), `... ${allLines.length - maximumLines + 1} MORE LINES`];
    const width = Math.max(...lines.map((line) => measurePixelText(line))) + 14;
    const visualLayout = terrainInspectionVisualLayout(inspection);
    const visualX = Math.max(4, uiWidth - visualLayout.width - 4);
    const panelX = Math.max(4, visualX - width - 4);
    drawPixelPanel(uiContext, art.ui, panelX, 4, width, lines.length * 9 + 8);
    for (let index = 0; index < lines.length; index += 1) {
      drawPixelText(uiContext, art.ui, lines[index] ?? '', panelX + 7, 9 + index * 9);
    }
    drawPixelPanel(
      uiContext,
      art.ui,
      visualX,
      4,
      visualLayout.width,
      visualLayout.height + 13,
    );
    drawPixelText(uiContext, art.ui, 'COMPOSED / NUMBERED LAYERS', visualX + 6, 9);
    drawTerrainInspectionVisuals(uiContext, art, terrain, groundCache, inspection, visualX, 17);
  }
  if (!interfaceHidden && debugMetrics) {
    const metrics = renderMetrics.snapshot();
    const net = network.metrics();
    const ownPosition = network.ownPosition();
    const remoteDepths = [...remoteBuffers.values()].map((buffer) => buffer.depth);
    const remoteMin = remoteDepths.length === 0 ? 0 : Math.min(...remoteDepths);
    const remoteMax = remoteDepths.length === 0 ? 0 : Math.max(...remoteDepths);
    const activeModifiers = snapshotPlayerModifiers(snapshot);
    const lines = [
      `FRAME ${metrics.averageFrameMs.toFixed(2)} AVG ${metrics.worstFrameMs.toFixed(2)} WORST`,
      `DRAWS ${metrics.drawCalls} CHUNKS ${groundCache.residentCount} PARTICLES ${rain.activeCount}`,
      `LIGHT ${lightmap.averageMs.toFixed(2)}ms AVG ${lightmap.floodMs.toFixed(2)}ms REBUILD #${lightmap.fieldRebuilds}`,
      `LIGHTS ${pointLights.length} VISITED ${lightmap.floodTexelsVisited}`,
      `MOON ${lunarPhaseAtAuthorityTick(authorityTick).replaceAll('_', ' ').toUpperCase()} ${lunarIlluminationAtAuthorityTick(authorityTick)}/1000`,
      `ZOOM ${worldZoom.toFixed(2)} K ${frame.layout.integerScale} DPR ${renderer.dpr.toFixed(2)}`,
      `NET RTT ${net.rttMs.toFixed(0)}ms LAG ${net.lagMs}+/-${net.jitterMs}`,
      `REPLAY ${net.replayDepth} ERROR ${net.reconciliationErrorFixed.toFixed(1)} FIXED`,
      `REMOTE BUFFER ${remoteMin}-${remoteMax} REFRESH ${net.inputRefreshAgeSteps}/${INPUT_REFRESH_STEPS}`,
      `HANDOVERS ${net.handoverCount}${net.persistentInputError === null ? '' : ` INPUT ${net.persistentInputError}`}`,
      `SPACE ${net.spaceId} SUB/SPACE ${Object.entries(net.perSpaceSubscriptionCounts).map(([spaceId, count]) => `${spaceId}:${count}`).join(' ') || 'NONE'}`,
      ownPosition === null
        ? 'COORDINATES NOT READY'
        : `COORD TILE X ${(ownPosition.x / TILE_SIZE_FIXED).toFixed(2)} Y ${(ownPosition.y / TILE_SIZE_FIXED).toFixed(2)}`,
      `SUB QUERIES ${net.subscriptionQueryCount} CACHE POS ${net.cacheSizes['playerPosition']} RES ${net.cacheSizes['worldResource']} NPC ${net.cacheSizes['worldNpc']} HIVE ${net.cacheSizes['worldHive']}`,
      `CACHE ITEM ${net.cacheSizes['worldItem']} CHEST ${net.cacheSizes['worldChest']} PROJ ${net.cacheSizes['worldProjectile']} CHAT ${net.cacheSizes['chat']}`,
      `UNKNOWN ACTIONS ${[...unknownActionKinds].join(',') || 'NONE'}`,
      `ENTITY ART ${debugEntitiesHidden ? 'HIDDEN' : 'VISIBLE'} [H]`,
      ...(playerVitals === null || snapshot.stats === null ? ['STATS NOT READY'] : [
        `ATTR STR ${snapshot.stats.str}->${playerVitals.attributes.str} DEX ${snapshot.stats.dex}->${playerVitals.attributes.dex} CON ${snapshot.stats.con}->${playerVitals.attributes.con}`,
        `ATTR INT ${snapshot.stats.int}->${playerVitals.attributes.int} WIS ${snapshot.stats.wis}->${playerVitals.attributes.wis} CHA ${snapshot.stats.cha}->${playerVitals.attributes.cha}`,
        `VITAL H ${playerVitals.health}/${playerVitals.maxHealth} M ${playerVitals.mana}/${playerVitals.maxMana} V ${playerVitals.vigour}/${playerVitals.maxVigour}`,
        `EFFECTS ${[...snapshot.effects].map((effect) => effect.effectKind).join(',') || 'NONE'}`,
        ...activeModifiers.map((modifier) => `MOD ${modifier.source} ${modifier.id} ${modifier.target} ${modifier.value}`),
      ]),
    ];
    const width = Math.max(...lines.map((line) => measurePixelText(line))) + 14;
    drawPixelPanel(uiContext, art.ui, 4, 27, width, lines.length * 9 + 8);
    for (let index = 0; index < lines.length; index += 1) {
      drawPixelText(uiContext, art.ui, lines[index] ?? '', 11, 32 + index * 9);
    }
  }
  const portalTransitionElapsed = performance.now() - portalTransitionStartedAtMs;
  if (portalTransitionStartedAtMs >= 0 && portalTransitionElapsed < 250) {
    uiContext.save();
    uiContext.globalAlpha = Math.max(0, 1 - portalTransitionElapsed / 250);
    uiContext.fillStyle = '#0b1020';
    uiContext.fillRect(0, 0, renderer.cssWidth / uiScale, renderer.cssHeight / uiScale);
    uiContext.restore();
  }
  renderer.endUi();
  renderMetrics.record(performance.now() - renderStarted, drawCalls);
}

function pointerUiPosition(event: MouseEvent): readonly [number, number] {
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  const uiScale = fittedUiScale(desiredUiScale, renderer.cssWidth, renderer.cssHeight);
  return [canvasX / uiScale, canvasY / uiScale];
}

function pointerCanvasPosition(event: MouseEvent): readonly [number, number] {
  const rect = canvas.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left) * renderer.cssWidth / rect.width;
  const canvasY = (event.clientY - rect.top) * renderer.cssHeight / rect.height;
  return [canvasX, canvasY];
}

function showResult(promise: Promise<void>, success: string): void {
  void promise.then(() => {
    setToast(success, 'success');
  }).catch((error: unknown) => {
    setFailureToast(error);
  });
}

function showPredictedInventoryResult(promise: Promise<void>, success: string | null): Promise<void> {
  return promise.then(() => {
    if (success !== null) setToast(success, 'success');
  }).catch((error: unknown) => {
    setFailureToast(error);
    throw error;
  });
}

function showMerchantResult(promise: Promise<void>, success: string): Promise<void> {
  return promise.then(() => {
    setToast(success, 'success');
  }).catch((error: unknown) => {
    setFailureToast(error);
    throw error;
  });
}

function selectSlotOptimistically(slot: number): void {
  if (bowChargeStartedAtMs !== null) cancelBowChargePresentation();
  optimisticSelectedSlot = slot;
  void network.selectHotbar(slot).then(() => {
    if (latestSnapshot.survival?.selectedSlot === slot) optimisticSelectedSlot = null;
  }).catch((error: unknown) => {
    optimisticSelectedSlot = null;
    setFailureToast(error);
  });
}

function startPredictedAction(kind: string, elapsedMs = 0): void {
  localPredictedActionKind = kind;
  localActionStartedAtMs = performance.now() - Math.max(0, elapsedMs);
}

function clearBowChargePresentation(): void {
  bowChargeStartedAtMs = null;
  bowChargeStartingVigourCenti = null;
  bowChargeAuthorityPromise = null;
  bowChargePointerId = null;
}

function settleCanceledBowCharge(startPromise: Promise<void> | null, chargeMs: number): void {
  if (startPromise === null) return;
  void startPromise
    .then(async () => await network.cancelBowCharge(chargeMs))
    .catch(() => undefined);
}

function cancelBowChargePresentation(): void {
  if (bowChargeStartedAtMs === null) return;
  const chargeMs = currentBowChargeMs();
  const startPromise = bowChargeAuthorityPromise;
  clearBowChargePresentation();
  settleCanceledBowCharge(startPromise, chargeMs);
}

function releaseBowShot(): void {
  if (bowChargeStartedAtMs === null) return;
  const aim = cursorAimVector();
  const chargeMs = currentBowChargeMs();
  const startingVigour = bowChargeStartingVigourCenti
    ?? latestSnapshot.stats?.vigourCenti
    ?? 0;
  const startPromise = bowChargeAuthorityPromise;
  clearBowChargePresentation();
  const rejection = itemActionRejection(selectedItemRow(latestSnapshot), latestSnapshot.inventorySlots);
  if (rejection !== null) {
    settleCanceledBowCharge(startPromise, chargeMs);
    setFailureToast(new Error(rejection));
    return;
  }
  if (aim === null) {
    settleCanceledBowCharge(startPromise, chargeMs);
    return;
  }
  const chargedRangePixels = bowChargedRangePixels(chargeMs, BOW_MAX_TARGET_RANGE_PIXELS);
  const encodedAim = encodedBowTargetAim(aim.x, aim.y, chargedRangePixels);
  if (encodedAim === null) {
    settleCanceledBowCharge(startPromise, chargeMs);
    return;
  }
  const { x: aimX, y: aimY } = encodedAim;
  const normalizedAim = normalizedBowAim(aimX, aimY);
  const shot = bowShotForTarget(aimX, aimY, chargedRangePixels);
  const token = nextPendingBowProjectileToken;
  nextPendingBowProjectileToken += 1;
  const mounted = localMount(latestSnapshot) !== null;
  const candidate = predicted === null || normalizedAim === null || shot === null
    ? null
    : {
        token,
        origin: bowProjectileOrigin(predicted.position, normalizedAim, mounted),
        velocity: { x: shot.velocityX, y: shot.velocityY },
        lifetimeTicks: shot.lifetimeTicks,
        startedAtMs: performance.now(),
        mounted,
        ownerProjectileIdsAtRelease: new Set(
          [...latestSnapshot.projectiles]
            .filter((projectile) => projectile.owner.toHexString() === latestSnapshot.identityHex)
            .map((projectile) => projectile.id),
        ),
        releasedAtAuthorityTick: latestSnapshot.clock?.authorityTick ?? 0n,
      } satisfies PendingBowProjectile;
  pendingBowProjectile = candidate;
  if (startPromise === null) {
    pendingBowProjectile = null;
    setToast('BOW DRAW WAS NOT READY', 'failure', 90);
    return;
  }
  optimisticVigourCenti = Math.max(0, startingVigour - resolvedBowChargeCostCenti(chargeMs));
  startPredictedAction('ranged_weapon', 450);
  void audio.unlock().then(async () => await audio.playSfx('tool_swing')).catch(() => undefined);
  showResult(
    startPromise.then(async () => await network.fireBow(aimX, aimY, chargeMs)).catch((error: unknown) => {
      if (pendingBowProjectile?.token === token) pendingBowProjectile = null;
      throw error;
    }).finally(() => { optimisticVigourCenti = null; }),
    'ARROW LOOSED',
  );
}

function setInterfaceHidden(hidden: boolean): void {
  if (interfaceHidden === hidden) return;
  interfaceHidden = hidden;
  onlinePlayersVisible = false;
  characterNamePrompt.pointerLeave();
  npcInteractionUi.pointerLeave();
  chatOverlay.pointerLeave();
  overworldUi.pointerLeave();
  touchControls.setBlocked(hidden);
  if (!hidden) return;
  chatOverlay.dismiss();
  characterNameInputElement?.blur();
  shopFilterInputElement?.blur();
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  if (!isInterfaceVisibilityToggle(
    event.code,
    event.repeat,
  )) return;
  setInterfaceHidden(!interfaceHidden);
  event.preventDefault();
  event.stopPropagation();
}, { capture: true });
window.addEventListener('keydown', (event) => {
  void audio.unlock().catch(() => undefined);
  if (!interfaceHidden) {
    if (characterNamePrompt.handleGlobalKeyDown()) {
      event.preventDefault();
      return;
    }
    if (chatOverlay.handleGlobalKeyDown(event)) {
      event.preventDefault();
      return;
    }
    if (npcInteractionUi.handleKeyDown(event.code, event.repeat)) {
      event.preventDefault();
      return;
    }
    if (event.code === 'Tab') {
      onlinePlayersVisible = true;
      event.preventDefault();
      return;
    }
    if (onlinePlayersVisible && overworldUi.handleOnlinePlayersKeyDown(event.code)) {
      event.preventDefault();
      return;
    }
    if (overworldUi.handleKeyDown(event.code, event.repeat, { ctrl: event.ctrlKey })) {
      event.preventDefault();
      return;
    }
  }
  if (isNameplateToggle(event.code, event.repeat)) {
    setNameplatesVisible(!nameplatesVisible);
    setToast(nameplatesVisible ? 'NAMEPLATES ON' : 'NAMEPLATES OFF', 'info', 90);
    event.preventDefault();
    return;
  }
  const selectedSlot = hotbarSlotForCode(event.code);
  if (selectedSlot !== null && !event.repeat) {
    selectSlotOptimistically(selectedSlot);
    event.preventDefault();
    return;
  }
  if ((event.code === 'Minus' || event.code === 'NumpadSubtract') && !event.repeat) {
    if (event.shiftKey) desiredUiScale = stepUiScale(desiredUiScale, -1);
    else worldZoomTarget = stepWorldZoom(
      worldZoomTarget,
      -1,
      renderer.minimumZoom(activeSpaceDefinition.sizeTiles * 16),
      MAX_WORLD_ZOOM,
    );
    event.preventDefault();
    return;
  }
  if ((event.code === 'Equal' || event.code === 'NumpadAdd') && !event.repeat) {
    if (event.shiftKey) desiredUiScale = stepUiScale(desiredUiScale, 1);
    else worldZoomTarget = stepWorldZoom(
      worldZoomTarget,
      1,
      renderer.minimumZoom(activeSpaceDefinition.sizeTiles * 16),
      MAX_WORLD_ZOOM,
    );
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyG' && !event.repeat) {
    debugCollision = !debugCollision;
    if (!debugCollision) debugTerrainPoint = null;
    setToast(debugCollision
      ? 'COLLISION: RED BLOCKED / CYAN TRANSITION / CLICK TO INSPECT TERRAIN'
      : 'COLLISION OVERLAY OFF', 'info', 180);
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyH' && !event.repeat) {
    debugEntitiesHidden = !debugEntitiesHidden;
    setToast(debugEntitiesHidden
      ? 'ENTITY ART HIDDEN: TERRAIN-ONLY DEBUG'
      : 'ENTITY ART VISIBLE', 'info', 180);
    event.preventDefault();
    return;
  }
  if (event.code === 'F3' && !event.repeat) {
    debugMetrics = !debugMetrics;
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyF' && !event.repeat) {
    const snapshot = latestSnapshot;
    const farmGate = targetOwnedHomesteadGate(snapshot);
    if (farmGate !== null) {
      showResult(network.toggleHomesteadGate(), farmGate.open ? 'FARM GATE CLOSED' : 'FARM GATE OPENED');
      event.preventDefault();
      return;
    }
    const groundLantern = targetGroundLantern(snapshot);
    if (groundLantern !== null) {
      showResult(
        network.toggleWorldLantern(groundLantern.id),
        groundLantern.lit ? 'LANTERN TURNED OFF' : 'LANTERN TURNED ON',
      );
      event.preventDefault();
      return;
    }
    const campfire = targetCampfire(snapshot);
    if (campfire !== null) {
      showResult(
        network.toggleCampfire(campfire.targetKind, campfire.id),
        campfire.lit ? 'CAMPFIRE EXTINGUISHED' : 'CAMPFIRE LIT',
      );
      event.preventDefault();
      return;
    }
    if (selectedItem(snapshot) === 'lantern') {
      const selectedLantern = selectedItemRow(snapshot);
      showResult(
        network.toggleHeldLantern(),
        selectedLantern?.lit === false ? 'LANTERN TURNED ON' : 'LANTERN TURNED OFF',
      );
      event.preventDefault();
      return;
    }
    const chest = targetChest(snapshot);
    if (chest !== null && selectedItem(snapshot) === 'axe') {
      performToolAction(() => network.harvestChest(chest.id), 'CHEST STRUCK', 'axe');
      event.preventDefault();
      return;
    }
    if (selectedItem(snapshot) === 'homestead_deed') {
      const tile = targetInteractionTile();
      if (tile === null) setToast('NO HOMESTEAD SITE TARGETED', 'failure', 90);
      else if (homesteadPlacementBlocked(snapshot, tile)) setToast('HOMESTEAD CANNOT BE PLACED THERE', 'failure', 90);
      else showResult(network.useHands(tile.tileX, tile.tileY), 'HOMESTEAD ESTABLISHED');
      event.preventDefault();
      return;
    }
    const carriedTarget = carriedCombatTarget(snapshot);
    if (carriedTarget !== null || targetFacedCombatTarget(snapshot) !== null) {
      const placing = carriedTarget !== null;
      const tile = placing ? targetInteractionTile() : facedInteractionTile(
        predicted?.position.x ?? 0,
        predicted?.position.y ?? 0,
        predicted?.facing ?? 'down',
      );
      if (tile === null) {
        setToast('NO PLACEMENT TILE TARGETED', 'failure', 90);
      } else if (placing && placementTileBlocked(snapshot, tile)) {
        setToast('ARCHERY TARGET CANNOT BE PLACED THERE', 'failure', 90);
      } else {
        showResult(
          network.useHands(tile.tileX, tile.tileY),
          placing ? 'ARCHERY TARGET PLACED' : 'ARCHERY TARGET PICKED UP',
        );
      }
      event.preventDefault();
      return;
    }
    if (carriedChest(snapshot) !== null || targetFacedChest(snapshot) !== null || selectedItem(snapshot) === 'chest') {
      const placing = carriedChest(snapshot) !== null || selectedItem(snapshot) === 'chest';
      const tile = placing ? targetInteractionTile() : facedInteractionTile(
        predicted?.position.x ?? 0,
        predicted?.position.y ?? 0,
        predicted?.facing ?? 'down',
      );
      if (tile === null) {
        setToast('NO PLACEMENT TILE TARGETED', 'failure', 90);
      } else if (placing && placementTileBlocked(snapshot, tile)) {
        setToast('CHEST CANNOT BE PLACED THERE', 'failure', 90);
      } else {
        showResult(network.useHands(tile.tileX, tile.tileY), placing ? 'CHEST PLACED' : 'CHEST PICKED UP');
      }
      event.preventDefault();
      return;
    }
    const selectedDefinition = itemDefinition(selectedItem(snapshot));
    const facedPlaceable = targetPlaceable(snapshot);
    const handsPlaceable = carriedPlaceable(snapshot);
    if (handsPlaceable !== null || selectedDefinition?.tags.includes('item.placeable') === true || facedPlaceable !== null) {
      const placing = handsPlaceable !== null || selectedDefinition?.tags.includes('item.placeable') === true;
      const tile = placing ? targetInteractionTile() : facedInteractionTile(
        predicted?.position.x ?? 0,
        predicted?.position.y ?? 0,
        predicted?.facing ?? 'down',
      );
      if (tile === null) {
        setToast('NO PLACEMENT TILE TARGETED', 'failure', 90);
      } else if (placing && placementTileBlocked(snapshot, tile)) {
        setToast('PLACEMENT BLOCKED', 'failure', 90);
      } else {
        showResult(
          network.useHands(tile.tileX, tile.tileY),
          placing
            ? `${hotbarItemLabel(handsPlaceable?.kind ?? selectedDefinition?.displayName ?? 'placeable').toUpperCase()} PLACED`
            : 'PLACEABLE PICKED UP',
        );
      }
      event.preventDefault();
      return;
    }
    const item = selectedItem(snapshot);
    if (item === 'orchard_tea') {
      showResult(network.consumeOrchardTea(), 'ORCHARD TEA DRUNK');
      event.preventDefault();
      return;
    }
    if (item === 'bow') {
      setToast('HOLD LEFT MOUSE TO DRAW THE BOW');
      event.preventDefault();
      return;
    }
    if (localMount(snapshot) !== null) {
      setToast('TOOLS CANNOT BE USED WHILE RIDING', 'failure');
      event.preventDefault();
      return;
    }
    const cropTile = targetFarmTile();
    const selectedCropItem = selectedItem(snapshot);
    const cropAtTarget = targetCrop(snapshot);
    if (cropTile !== null && (
      itemDefinition(selectedCropItem)?.tags.includes('item.seed') === true
      || (cropAtTarget !== null && selectedCropItem !== 'hoe' && selectedCropItem !== 'watering_can')
    )) {
      showResult(
        network.useCropTile(cropTile.tileX, cropTile.tileY),
        cropAtTarget === null ? 'SEEDS PLANTED' : 'CROP HARVESTED',
      );
      event.preventDefault();
      return;
    }
    const actionKind = avatarActionForEquippedKind(item);
    if (actionKind === null) {
      setToast(`NO ${hotbarItemLabel(item)} USE ACTION YET`, 'failure');
    } else {
      if (item === 'hoe' || item === 'watering_can') {
        const tile = targetFarmTile();
        if (tile === null) {
          setToast('NO FARM TILE TARGETED', 'failure', 90);
        } else {
          const restoring = item === 'hoe' && latestSnapshot.soil.get(farmSoilKey(
            tile.tileX,
            tile.tileY,
            activeSpaceDefinition.spaceId,
          )) !== undefined;
          performFarmToolAction(tile, item, restoring);
        }
        event.preventDefault();
        return;
      }
      const resource = targetResource(snapshot);
      const cellarWall = resource === null ? targetCellarWall(snapshot) : null;
      if (!isVitalsTool(item)) {
        setToast('THIS TOOL IS NOT READY FOR WORLD USE', 'failure', 90);
      } else if (cellarWall !== null && item === 'pickaxe') {
        const performed = performToolAction(
          () => network.digCellarTile(cellarWall.tileX, cellarWall.tileY),
          'CELLAR WALL STRUCK',
          item,
        );
        if (performed) facePredictedTowardTile(cellarWall);
      } else if (resource === null) {
        performToolAction(() => network.harvestResource(0n), 'SWING', item, true);
      } else {
        const result = isBreakableRockKind(resource.kind)
          ? resource.health <= 1 ? 'ROCK DEPLETED'
            : survivalResourceDropAfterHit(resource.kind, resource.health - 1) === null
              ? 'ROCK STRUCK' : 'STONE CHIPPED'
          : isMineableOreKind(resource.kind)
          ? resource.health > 1 ? 'ORE STRUCK' : 'VEIN DEPLETED'
          : resource.health > 1 ? 'CHOP!' : 'TREE FELLED';
        performToolAction(() => network.harvestResource(resource.id), result, item);
      }
    }
    event.preventDefault();
    return;
  }
  if (event.code === 'Space' && !event.repeat && localMount(latestSnapshot) !== null) {
    showResult(network.jumpHorse(), 'HORSE JUMP!');
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyE' && !event.repeat) {
    const interaction = targetInteraction(latestSnapshot);
    if (interaction !== null) activateInteraction(interaction, latestSnapshot);
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyQ' && !event.repeat) {
    if (localMount(latestSnapshot) !== null) {
      setToast('ITEMS CANNOT BE DROPPED WHILE RIDING', 'failure');
      event.preventDefault();
      return;
    }
    startPredictedAction('drop');
    showResult(network.dropSelected(), 'DROPPED SELECTED SLOT');
    event.preventDefault();
    return;
  }
  if (event.code.startsWith('Arrow')) event.preventDefault();
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => {
  if (event.code !== 'Tab') return;
  onlinePlayersVisible = false;
  event.preventDefault();
});
window.addEventListener('blur', () => { onlinePlayersVisible = false; });
document.addEventListener('visibilitychange', () => {
  weatherTickClock.reset();
  weatherEffects.resetTimeline();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => {
  keys.clear();
  touchControls.reset();
  cancelBowChargePresentation();
});
function dispatchTouchControlAction(action: TouchControlAction): void {
  if (action === 'movement') return;
  // Control touches are intercepted before world-pointer handling, preserving
  // the last deliberately selected tile without replacing it with this button.
  const code = action === 'interact' ? 'KeyE' : 'KeyF';
  window.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code,
    key: action === 'interact' ? 'e' : 'f',
  }));
}

function touchControlViewport(): readonly [number, number] {
  const uiScale = fittedUiScale(desiredUiScale, renderer.cssWidth, renderer.cssHeight);
  return [renderer.cssWidth / uiScale, renderer.cssHeight / uiScale];
}

// Keep tracking an active thumb at the window capture phase. In particular,
// mobile Safari can retarget a downward drag once it crosses the canvas edge;
// relying only on canvas listeners would make the joystick appear to let go.
window.addEventListener('pointermove', (event) => {
  if (!touchControls.ownsPointer(event.pointerId)) return;
  const [x, y] = pointerUiPosition(event);
  const [uiWidth, uiHeight] = touchControlViewport();
  touchControls.pointerMove({ x, y }, event.pointerId, uiWidth, uiHeight);
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
}, { capture: true });
window.addEventListener('pointerup', (event) => {
  if (!touchControls.pointerUp(event.pointerId)) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
}, { capture: true });
window.addEventListener('pointercancel', (event) => {
  if (!touchControls.pointerCancel(event.pointerId)) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (event.cancelable) event.preventDefault();
  event.stopPropagation();
}, { capture: true });
canvas.addEventListener('pointermove', (event) => {
  const [x, y] = pointerUiPosition(event);
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  worldPointer = { x: canvasX, y: canvasY };
  refreshHoveredInteractionTile();
  if (interfaceHidden) return;
  characterNamePrompt.pointerMove({ x, y });
  if (characterNamePrompt.isActive) return;
  if (npcInteractionUi.pointerMove({ x, y })) return;
  chatOverlay.pointerMove({ x, y });
  overworldUi.pointerMove({ x, y }, { shift: event.shiftKey });
  if (overworldUi.openWindow === null) questTracker.pointerMove({ x, y });
  else questTracker.pointerLeave();
});
canvas.addEventListener('pointerleave', () => {
  worldPointer = null;
  hoveredInteractionTile = null;
  characterNamePrompt.pointerLeave();
  npcInteractionUi.pointerLeave();
  questTracker.pointerLeave();
  chatOverlay.pointerLeave();
  overworldUi.pointerLeave();
});
canvas.addEventListener('pointerdown', (event) => {
  void audio.unlock().catch(() => undefined);
  const [x, y] = pointerUiPosition(event);
  const uiScale = fittedUiScale(desiredUiScale, renderer.cssWidth, renderer.cssHeight);
  const touchAction = touchControls.pointerDown(
    { x, y },
    event.pointerId,
    event.pointerType,
    renderer.cssWidth / uiScale,
    renderer.cssHeight / uiScale,
  );
  if (touchAction !== null) {
    canvas.setPointerCapture(event.pointerId);
    dispatchTouchControlAction(touchAction);
    event.preventDefault();
    return;
  }
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  worldPointer = { x: canvasX, y: canvasY };
  refreshHoveredInteractionTile();
  if (debugCollision) {
    if (event.button === 0) {
      debugTerrainPoint = {
        worldX: latestCameraX + canvasX / latestRenderedZoom,
        worldY: latestCameraY + canvasY / latestRenderedZoom,
      };
    } else if (event.button === 2) {
      debugTerrainPoint = null;
    }
    event.preventDefault();
    return;
  }
  if (!interfaceHidden) {
    if (characterNamePrompt.pointerDown({ x, y }, event.button)) {
      event.preventDefault();
      return;
    }
    if (npcInteractionUi.pointerDown({ x, y }, event.button, {
      shift: event.shiftKey,
      control: event.ctrlKey,
    })) {
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    // The retained window tree is visually above chat and therefore receives
    // the first opportunity to capture input as well. Previously chat could
    // activate through a modal that was correctly painted over it.
    if (overworldUi.pointerDown({ x, y }, event.button, { shift: event.shiftKey })) {
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (chatOverlay.pointerDown({ x, y }, event.button)) {
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (overworldUi.openWindow === null && questTracker.pointerDown({ x, y }, event.button)) {
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
  }
  const worldPointerAvailable = interfaceHidden
    || (overworldUi.openWindow === null && !chatOverlay.isOpen);
  if ((event.button === 0 || event.button === 2) && worldPointerAvailable) {
    const nextTarget = entityTargetAtWorldPoint(
      latestCameraX + canvasX / latestRenderedZoom,
      latestCameraY + canvasY / latestRenderedZoom,
      latestTargetableEntities,
    );
    if (event.button === 2) {
      if (nextTarget === null) selectedEntityTarget = null;
    } else {
      const equipped = selectedItem(latestSnapshot);
      if (nextTarget !== null) {
        selectedEntityTarget = nextTarget;
        if (equipped !== 'bow') {
          event.preventDefault();
          return;
        }
      } else if (equipped !== 'bow' && equipped !== 'hoe' && equipped !== 'watering_can') {
        selectedEntityTarget = null;
      }
    }
  }
  if (event.button === 0 && selectedItem(latestSnapshot) === 'bow'
    && carriedChest(latestSnapshot) === null
    && carriedCombatTarget(latestSnapshot) === null
    && carriedPlaceable(latestSnapshot) === null
    && worldPointerAvailable) {
    const rejection = itemActionRejection(
      selectedItemRow(latestSnapshot),
      latestSnapshot.inventorySlots,
    );
    if (rejection !== null) {
      setFailureToast(new Error(rejection));
      event.preventDefault();
      return;
    }
    const availableVigour = optimisticVigourCenti
      ?? latestSnapshot.stats?.vigourCenti
      ?? 0;
    if (latestSnapshot.stats !== null && availableVigour < resolvedBowChargeCostCenti(0)) {
      vigourDenyTicks = 24;
      setToast('INSUFFICIENT VIGOUR', 'failure', 90);
      event.preventDefault();
      return;
    }
    bowChargeStartedAtMs = performance.now();
    bowChargeStartingVigourCenti = availableVigour;
    bowChargePointerId = event.pointerId;
    const authorityPromise = network.beginBowCharge();
    bowChargeAuthorityPromise = authorityPromise;
    void authorityPromise.catch((error: unknown) => {
      if (bowChargeAuthorityPromise !== authorityPromise) return;
      clearBowChargePresentation();
      setFailureToast(error);
    });
    startPredictedAction('ranged_weapon');
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const farmItem = selectedItem(latestSnapshot);
  const farmTarget = targetFarmTile();
  const pointerCrop = targetCrop(latestSnapshot);
  const restoringFarmTile = event.button === 2 && farmItem === 'hoe' && farmTarget !== null
    && latestSnapshot.soil.get(farmSoilKey(
      farmTarget.tileX, farmTarget.tileY, activeSpaceDefinition.spaceId,
    )) !== undefined;
  if (restoringFarmTile && localMount(latestSnapshot) === null
    && worldPointerAvailable) {
    performFarmToolAction(farmTarget, 'hoe', true);
    event.preventDefault();
    return;
  }
  if (event.button === 0 && (farmItem === 'hoe' || farmItem === 'watering_can')
    && farmTarget !== null && localMount(latestSnapshot) === null
    && worldPointerAvailable) {
    performFarmToolAction(farmTarget, farmItem);
    event.preventDefault();
    return;
  }
  if (event.button === 0 && farmTarget !== null && localMount(latestSnapshot) === null
    && worldPointerAvailable && (
      itemDefinition(farmItem)?.tags.includes('item.seed') === true
      || pointerCrop !== null
    )) {
    showResult(
      network.useCropTile(farmTarget.tileX, farmTarget.tileY),
      pointerCrop === null ? 'SEEDS PLANTED' : 'CROP HARVESTED',
    );
    event.preventDefault();
  }
});
canvas.addEventListener('pointerup', (event) => {
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  worldPointer = { x: canvasX, y: canvasY };
  const [x, y] = pointerUiPosition(event);
  if (!interfaceHidden) {
    if (characterNamePrompt.isActive) {
      event.preventDefault();
      return;
    }
    if (npcInteractionUi.active) {
      npcInteractionUi.pointerUp();
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
  }
  if (event.button === 0 && bowChargePointerId === event.pointerId && bowChargeStartedAtMs !== null) {
    releaseBowShot();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  if (interfaceHidden) {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    return;
  }
  const questTrackerConsumed = questTracker.pointerUp({ x, y });
  const chatConsumed = chatOverlay.pointerUp();
  const consumed = overworldUi.pointerUp({ x, y }, event.button, { shift: event.shiftKey });
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (questTrackerConsumed || chatConsumed || consumed) event.preventDefault();
});
canvas.addEventListener('pointercancel', () => {
  cancelBowChargePresentation();
  worldPointer = null;
  hoveredInteractionTile = null;
  questTracker.pointerCancel();
  chatOverlay.pointerCancel();
  npcInteractionUi.pointerLeave();
  overworldUi.pointerLeave();
});
canvas.addEventListener('wheel', (event) => {
  const [x, y] = pointerUiPosition(event);
  if (!interfaceHidden) {
    if (characterNamePrompt.isActive) {
      event.preventDefault();
      return;
    }
    if (npcInteractionUi.wheel({ x, y }, event.deltaY) || npcInteractionUi.active) {
      event.preventDefault();
      return;
    }
    if (overworldUi.wheel({ x, y }, event.deltaX, event.deltaY)) {
      event.preventDefault();
      return;
    }
    if (chatOverlay.wheel({ x, y }, event.deltaY)) {
      event.preventDefault();
      return;
    }
  }
  if (event.ctrlKey || event.deltaY === 0) return;
  event.preventDefault();
  if (event.timeStamp < wheelZoomLockedUntil) return;
  wheelZoomLockedUntil = event.timeStamp + 120;
  worldZoomTarget = stepWorldZoom(
    worldZoomTarget,
    event.deltaY > 0 ? -1 : 1,
    renderer.minimumZoom(activeSpaceDefinition.sizeTiles * 16),
    MAX_WORLD_ZOOM,
  );
}, { passive: false });

resize();
const loop = new FixedStepLoop({ update, render });
Object.assign(window, {
  __orchardOverworld: {
    snapshot: () => network.snapshot(),
    update,
    render,
    setDirection: (direction: NetworkDirection) => network.setDirection(direction),
    harvestResource: (resourceId: bigint) => network.harvestResource(resourceId),
    useFarmTool: (tileX: number, tileY: number) => network.useFarmTool(tileX, tileY),
    useCropTile: (tileX: number, tileY: number) => network.useCropTile(tileX, tileY),
    pickupWorldItem: (itemId: bigint) => network.pickupWorldItem(itemId),
    interactNpc: (npcId: bigint) => network.interactNpc(npcId),
    chooseDialogueOption: (choiceId: string) => network.chooseDialogueOption(choiceId),
    closeNpcDialogue: () => network.closeNpcDialogue(),
    buyMerchantItem: (itemKind: string, quantity: number) => network.buyMerchantItem(itemKind, quantity),
    buyMerchantCart: (lines: readonly MerchantCartLine[]) => network.buyMerchantCart(lines),
    sellMerchantItem: (itemKind: string, quantity: number) => network.sellMerchantItem(itemKind, quantity),
    sellMerchantCart: (lines: readonly MerchantCartLine[]) => network.sellMerchantCart(lines),
    interactHorse: (horseId: bigint) => network.interactHorse(horseId),
    jumpHorse: () => network.jumpHorse(),
    dropSelected: () => network.dropSelected(),
    selectHotbar: (selectedSlot: number) => network.selectHotbar(selectedSlot),
    setCollisionDebug: (enabled: boolean) => { debugCollision = enabled; },
    setMetricsDebug: (enabled: boolean) => { debugMetrics = enabled; },
    setEntitiesHidden: (hidden: boolean) => { debugEntitiesHidden = hidden; },
    renderMetrics: () => renderMetrics.snapshot(),
    lightmapMetrics: () => ({
      averageMs: lightmap.averageMs,
      floodMs: lightmap.floodMs,
      fieldRebuilds: lightmap.fieldRebuilds,
      floodTexelsVisited: lightmap.floodTexelsVisited,
    }),
    netcodeMetrics: () => network.metrics(),
    audioStatus: () => audio.getStatus(),
    predictedPosition: () => predicted === null ? null : { ...predicted.position },
    remoteBufferDepths: () => [...remoteBuffers.entries()].map(([identity, buffer]) => ({ identity, depth: buffer.depth })),
    setWorldZoom: (zoom: number) => {
      worldZoom = Math.max(renderer.minimumZoom(activeSpaceDefinition.sizeTiles * 16), Math.min(MAX_WORLD_ZOOM, zoom));
      worldZoomTarget = worldZoom;
    },
    setUiScale: (scale: UiScale) => { desiredUiScale = scale; },
    setWorldTime: (tick: bigint) => network.setWorldTime(tick),
    adminTeleport: (destination: string) => network.adminTeleport(destination),
    setLightPreview: (kind: 'lantern' | 'torch' | null) => { lightPreviewKind = kind; },
    setWorldWeather: (mode: WeatherMode) => network.setWorldWeather(mode),
    setWorldWindDirection: (direction: WindDirectionMode) => network.setWorldWindDirection(direction),
    setNameplatesVisible,
    setInterfaceHidden,
    interfaceHidden: () => interfaceHidden,
    openChat: () => chatOverlay.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Enter' })),
    openWindow: (window: 'inventory' | 'pack' | 'crafting' | 'barrel' | 'system' | 'settings' | null) => { overworldUi.openWindow = window; },
    uiWindow: () => overworldUi.openWindow,
  },
});
loop.start();
