import {
  AUTHORITY_TICK_MS,
  CRAFTING_STATION_REACH_TILES,
  BOW_AIM_SCALE,
  BOW_MAX_CHARGE_MS,
  CHEST_INTERACTION_REACH_FIXED,
  FIXED_UNITS_PER_PIXEL,
  INPUT_REFRESH_STEPS,
  SIM_STEPS_PER_AUTHORITY_TICK,
  SIM_TICKS_PER_SECOND,
  SURVIVAL_CHUNK_TILES,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_VERSION,
  TILE_SIZE_FIXED,
  TILE_INTERACTION_REACH_FIXED,
  TICKS_PER_DAY,
  TOOL_VIGOUR_BALANCE,
  EFFECT_KINDS,
  EFFECT_DEFINITIONS,
  TOPSIDE_SPACE_ID,
  authorityDayProgress,
  authorityTickAtDayProgress,
  avatarActionForEquippedKind,
  calendarAtTick,
  craftingStationWithinReach,
  bowHeldAnimationFrame,
  bowOriginHeightPixels,
  directionFromAim,
  directionUnitVector,
  isWindDirectionMode,
  isWeatherMode,
  lunarIlluminationAtAuthorityTick,
  lunarPhaseAtAuthorityTick,
  generateSurvivalDecorations,
  generateMarlowCampPathTiles,
  isBreakableRockKind,
  isChoppableTreeKind,
  isAxeHarvestableResourceKind,
  isGatherableResourceKind,
  isInteractivePoiDecorationKind,
  isMineableOreKind,
  isForwardSwingToolKind,
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
  placeableDefinition,
  fenceJoinMask,
  nextWeatherMode,
  nextWindDirectionMode,
  weatherVisualState,
  shiftAuthorityDay,
  simTickOfDayAtAuthorityTick,
  movePlayer,
  movePlayerAtSpeed,
  movePlayerAtSpeedPermille,
  modifiersForEffects,
  nearestTileTarget,
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
  type PlayerState,
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
import { AudioBus } from './audio/audio-bus.js';
import { readOidcSession } from './auth/oidc.js';
import type { ChatMessage, PlayerPosition, SpacePortal, WorldChest, WorldItem, WorldNpc, WorldPlaceable, WorldResource } from './net/generated/types.js';
import {
  OverworldConnection,
  viewRadiusForViewport,
  type NetworkDirection,
  type OverworldView,
} from './net/overworld-connection.js';
import { AvatarAnimationController, PresentationCorrection, ProjectileSnapshotBuffer, RemoteSnapshotBuffer, RenderTickClock, VisualTickClock, type SampledProjectile, type SampledRemote } from './net/netcode.js';
import {
  DEFAULT_PLAYER_APPEARANCE,
  drawOverworldAvatar,
  drawOverworldArrow,
  drawOverworldChest,
  drawOverworldHorse,
  drawOverworldHive,
  drawOverworldItem,
  drawOverworldPlaceable,
  drawOverworldMerchant,
  drawOverworldMountedAction,
  drawPlayerHeadPortrait,
  drawNpcPortrait,
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
import { treeSwayOffset, WeatherEffects, windDirectionLabel, type WindTreeSource } from './render/weather-effects.js';
import { drawPixelPanel, drawPixelText, measurePixelText } from './render/pixel-ui.js';
import {
  MAX_WORLD_ZOOM,
  UnifiedRenderer,
  drawWorldDepthQueue,
  type WorldDepthItem,
} from './render/renderer.js';
import {
  terrainContourBoundaryBetween,
  terrainContactWorldYForPlayer,
  terrainForSpace,
  terrainForWorld,
  terrainMaximumElevation,
  terrainProjectedDepthAtFoot,
  terrainProjectedElevationAtFoot,
  terrainProjectedSortOffset,
  terrainProjectedWorldYAtFoot,
  type TerrainArray,
} from './render/terrain.js';
import { interpolateFixedPosition, presentationMoving } from './overworld-prediction.js';
import {
  nearestInteractionCandidate,
  type InteractionCandidate,
} from './interaction-targeting.js';
import { isNameplateToggle, OverworldUi, type OverworldUiTargetVitals } from './ui/overworld-ui.js';
import { entityTargetAtWorldPoint, sameEntityTarget, targetKey, type SelectedEntityTarget, type TargetableWorldEntity } from './entity-targeting.js';
import { ghostFillRecipeMoves } from './ui/recipe-book.js';
import { ChatOverlay } from './ui/chat-overlay.js';
import { parseChatSubmission } from './ui/chat-command.js';
import {
  drawSpeechBubble,
  edgeSpeechAnchor,
  speechBubbleLayout,
  speechBubbleRect,
  type EdgeSpeechAnchor,
} from './ui/speech-bubble.js';
import { CharacterNamePrompt } from './ui/character-name-prompt.js';
import { NpcInteractionUi } from './ui/npc-interaction-ui.js';
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
let observedResourceRevision = -1;
const initialTerrain = terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION);
let worldCollision: CollisionMap = createClientCollisionMap(initialTerrain, []);
let lightOcclusion: LightOcclusionMap = createLightOcclusionMap(initialTerrain);
let activeSpaceDefinition: SpaceDefinition = spaceDefinitionFor(TOPSIDE_SPACE_ID)!;
let observedSpaceId = TOPSIDE_SPACE_ID;
let portalTransitionStartedAtMs = -1;
let lastNetworkStatus = '';
let debugCollision = false;
let debugMetrics = false;
let debugEntitiesHidden = false;
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
const renderTickClock = new RenderTickClock();
const visualTickClock = new VisualTickClock();
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
const itemArt = {
  missing: art.missingItem,
  avatar: art.avatar,
  ...art.itemIcons,
};
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
  setAudioVolume: (bus, value) => audio.setVolume(bus, value),
  setAudioBackground: (bus, enabled) => audio.setBackgroundPlayback(bus, enabled),
  signOut: () => { location.assign('/?logout=1'); },
  quitToTitle: () => { location.assign('/?menu=1'); },
  moveInventoryItem: (request) => showResult(network.moveInventoryItem(request), 'ITEM MOVED'),
  quickMoveInventoryItem: (fromContainer, fromIndex, toContainers) => showResult(
    network.quickMoveInventoryItem(fromContainer, fromIndex, toContainers), 'ITEMS MOVED',
  ),
  quickMoveAllInventoryItems: (itemKind, fromContainers, toContainers) => showResult(
    network.quickMoveAllInventoryItems(itemKind, fromContainers, toContainers), 'ALL MATCHING ITEMS MOVED',
  ),
  distributeInventoryItem: (fromContainer, fromIndex, targets, quantity) => showResult(
    network.distributeInventoryItem(fromContainer, fromIndex, targets, quantity), 'STACK DISTRIBUTED',
  ),
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
  drawNpcPortrait(context, art, target.portrait, rect);
});
const npcInteractionUi = new NpcInteractionUi(art.uiSkin, art.ui, itemArt, {
  chooseDialogueOption: (choiceId) => showResult(network.chooseDialogueOption(choiceId), 'DIALOGUE UPDATED'),
  closeDialogue: () => { void network.closeNpcDialogue().catch(() => undefined); },
  buy: (itemKind, quantity) => showResult(network.buyMerchantItem(itemKind, quantity), 'PURCHASE COMPLETE'),
  sell: (itemKind, quantity) => showResult(network.sellMerchantItem(itemKind, quantity), 'SALE COMPLETE'),
});

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

function directionFromKeys(): NetworkDirection {
  if (overworldUi.openWindow !== null || characterNamePrompt.isActive || npcInteractionUi.active) return 'idle';
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

function elevatedLightOccluders(snapshot: OverworldView, seed: number): LightTrunkOccluder[] {
  const result: LightTrunkOccluder[] = [];
  const add = (
    asset: (typeof art)['chest'] | undefined,
    animation: string,
    worldX: number,
    worldY: number,
    obstacle: CollisionObstacle | null,
  ): void => {
    if (asset === undefined || obstacle === null) return;
    result.push({
      obstacle,
      receiver: createSpriteLightOccluder(asset, animation, 0, worldX, worldY),
      footX: worldX,
      footY: worldY,
      receiverFacing: 'south',
      shadowMode: 'silhouette',
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

function treeLightOccluders(snapshot: OverworldView): LightTrunkOccluder[] {
  const result: LightTrunkOccluder[] = [];
  for (const resource of snapshot.resources) {
    const growthStage = (resource as WorldResource & { readonly growthStage?: number }).growthStage;
    if (resource.depleted || !isChoppableTreeKind(resource.kind)
      || (growthStage !== undefined && growthStage !== MATURE_TREE_GROWTH_STAGE)) continue;
    const worldX = resource.tileX * 16 + 8;
    const footY = (resource.tileY + 1) * 16;
    result.push({
      obstacle: survivalResourceObstacle(resource.kind, resource.tileX, resource.tileY),
      receiver: createSpriteLightOccluder(
        matureTreeLightAsset(resource.kind), 'base', 0, worldX, footY,
      ),
      footX: worldX,
      footY,
      receiverFacing: 'south',
      shadowMode: 'column',
    });
  }
  return result;
}

function refreshCollision(snapshot: OverworldView): void {
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
  const nextKey = `${activeSpaceDefinition.spaceId}:${seed}:${version}:${network.resourceRevision}`;
  if (collisionKey === nextKey) return;
  collisionKey = nextKey;
  const terrain = terrainForSpace(activeSpaceDefinition, seed, version);
  worldCollision = createClientCollisionMap(
    terrain,
    snapshot.resources,
    snapshot.chests,
    'ground',
    snapshot.placeables,
  );
  lightOcclusion = createLightOcclusionMap(
    terrain,
    [],
    [],
    [...elevatedLightOccluders(snapshot, seed), ...treeLightOccluders(snapshot)],
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
    activeSpaceDefinition = spaceDefinitionFor(observedSpaceId) ?? spaceDefinitionFor(TOPSIDE_SPACE_ID)!;
    portalTransitionStartedAtMs = performance.now();
    collisionKey = '';
    groundCache.invalidateResource(0, 0);
    remoteBuffers.clear(); remoteDisplay.clear(); previousRemoteDisplay.clear();
    npcBuffers.clear(); npcDisplay.clear(); projectileBuffers.clear(); projectileDisplay.clear();
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
  const weather = activeSpaceDefinition.weather ? activeWeather : { ...activeWeather, raining: false };
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
      && (optimisticVigourCenti ?? playerVitals.vigour) >= sprintCost;
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
  });
  const renderTick = renderTickClock.advance(1 / SIM_TICKS_PER_SECOND, latestPositionAuthorityTick);
  visualTickClock.advance(
    1 / SIM_TICKS_PER_SECOND,
    snapshot.clock?.authorityTick ?? latestPositionAuthorityTick,
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

function toolActionHasEnoughVigour(itemKind: VitalsToolKind, whiff = false): boolean {
  const stats = latestSnapshot.stats;
  if (stats === null) return true;
  const baseCost = TOOL_VIGOUR_BALANCE[itemKind].costCenti;
  const fullCost = resolveModifierTarget('toolVigourCost', baseCost, snapshotPlayerModifiers(latestSnapshot));
  const cost = whiff ? Math.ceil(fullCost / 2) : fullCost;
  const available = optimisticVigourCenti ?? stats.vigourCenti;
  if (available >= cost) return true;
  vigourDenyTicks = 24;
  setToast('INSUFFICIENT VIGOUR', 'failure', 90);
  return false;
}

function isVitalsTool(value: string): value is VitalsToolKind {
  return Object.prototype.hasOwnProperty.call(TOOL_VIGOUR_BALANCE, value);
}

function bowOriginWorld(): { readonly x: number; readonly y: number } | null {
  if (predicted === null) return null;
  const mounted = localMount(latestSnapshot) !== null;
  return {
    x: predicted.position.x / FIXED_UNITS_PER_PIXEL,
    y: predicted.position.y / FIXED_UNITS_PER_PIXEL - bowOriginHeightPixels(mounted),
  };
}

function cursorAimVector(): { readonly x: number; readonly y: number } | null {
  const origin = bowOriginWorld();
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
): boolean {
  const aim = cursorAimVector();
  const origin = bowOriginWorld();
  if (origin === null || aim === null) return false;
  const cursorDistance = Math.hypot(aim.x, aim.y);
  if (cursorDistance < 0.001) return false;
  const guideDistance = Math.min(cursorDistance, 112);
  const travelX = aim.x / cursorDistance * guideDistance;
  const travelY = aim.y / cursorDistance * guideDistance;
  const range = Math.max(1, guideDistance);
  const dots = Math.max(2, Math.floor(range / 12));
  context.save();
  context.translate(Math.round((origin.x - cameraX) * zoom), Math.round((origin.y - cameraY) * zoom));
  context.scale(zoom, zoom);
  context.fillStyle = '#f1dfb4cc';
  for (let dot = 1; dot <= dots; dot += 1) {
    const progress = dot / dots;
    context.fillRect(Math.round(travelX * progress), Math.round(travelY * progress), 1, 1);
  }
  context.translate(Math.round(travelX), Math.round(travelY));
  context.fillRect(-2, 0, 5, 1);
  context.fillRect(0, -2, 1, 5);
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
  return targetInteractionTile();
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
): boolean {
  const players = [...snapshot.players].map((player) => {
    const local = player.identity.toHexString() === snapshot.identityHex;
    return local && predicted !== null ? predicted.position : { x: player.x, y: player.y };
  });
  return worldPlacementTileIsBlocked(worldCollision, tile, players);
}

function targetWorldItem(snapshot: OverworldView): WorldItem | null {
  if (predicted === null) return null;
  return nearbyWorldItem(predicted.position.x, predicted.position.y, snapshot.worldItems);
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
  return snapshot.placeables.find((row) => row.tileX === target.tileX && row.tileY === target.tileY) ?? null;
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
    if (target.id === snapshot.identityHex || snapshot.players.get(target.id) === undefined) return undefined;
    const displayName = profileName(snapshot.profiles, target.id);
    return {
      targetId: targetKey(target), displayName,
      // Exact remote player vitals remain private until the combat-era public
      // percentage projection can be added through the world migration gate.
      health: 100, maxHealth: 100,
      portrait: { kind: 'player', playerId: target.id },
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

type EInteractionTarget =
  | (InteractionCandidate & { readonly kind: 'portal'; readonly portal: SpacePortal })
  | (InteractionCandidate & { readonly kind: 'placeable'; readonly placeable: WorldPlaceable })
  | (InteractionCandidate & { readonly kind: 'chest'; readonly chest: WorldChest })
  | (InteractionCandidate & { readonly kind: 'campfire'; readonly campfire: TargetCampfire })
  | (InteractionCandidate & { readonly kind: 'merchant'; readonly npc: WorldNpc })
  | (InteractionCandidate & { readonly kind: 'horse'; readonly npc: WorldNpc })
  | (InteractionCandidate & { readonly kind: 'gatherable'; readonly resource: WorldResource })
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
  if (placeable?.kind === 'fence_gate' || placeable?.kind === 'barrel') candidates.push({
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
  const item = targetWorldItem(snapshot);
  if (item !== null) candidates.push({
    kind: 'world_item', x: item.x, y: item.y,
    stableId: `item:${item.id}`, item,
  });
  return nearestInteractionCandidate(predicted.position.x, predicted.position.y, candidates);
}

function interactionPrompt(target: EInteractionTarget, snapshot: OverworldView): string {
  switch (target.kind) {
    case 'portal': return '[E] USE PORTAL';
    case 'placeable': return target.placeable.kind === 'barrel'
      ? '[E] OPEN BARREL'
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
): void {
  for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    const display = local ? null : remoteDisplay.get(id) ?? null;
    const position = {
      x: local ? predicted?.position.x ?? player.x : display?.x ?? player.x,
      y: local ? predicted?.position.y ?? player.y : display?.y ?? player.y,
    };
    const bounds = playerHitboxBounds(position);
    const left = (bounds.left / FIXED_UNITS_PER_PIXEL - cameraX) * scale;
    const top = (bounds.top / FIXED_UNITS_PER_PIXEL - cameraY) * scale;
    const width = (bounds.right - bounds.left + 1) / FIXED_UNITS_PER_PIXEL * scale;
    const height = (bounds.bottom - bounds.top + 1) / FIXED_UNITS_PER_PIXEL * scale;
    context.fillStyle = local ? '#33e6ff55' : '#d36dff44';
    context.strokeStyle = local ? '#33e6ff' : '#d36dff';
    context.lineWidth = 1;
    context.fillRect(Math.round(left), Math.round(top), Math.ceil(width), Math.ceil(height));
    context.strokeRect(Math.round(left), Math.round(top), Math.ceil(width), Math.ceil(height));
    const footX = Math.round((position.x / FIXED_UNITS_PER_PIXEL - cameraX) * scale);
    const footY = Math.round((position.y / FIXED_UNITS_PER_PIXEL - cameraY) * scale);
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
  const x = (centerX / FIXED_UNITS_PER_PIXEL - cameraX) * scale;
  const y = (centerY / FIXED_UNITS_PER_PIXEL - cameraY) * scale;
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
    const top = (bounds.top / FIXED_UNITS_PER_PIXEL - cameraY) * scale;
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
  showEntityObstacles: boolean,
): void {
  const minX = Math.max(0, Math.floor(cameraX / 16));
  const minY = Math.max(0, Math.floor(cameraY / 16));
  const maxX = Math.min(terrain.width - 1, Math.ceil((cameraX + viewportWidth / scale) / 16));
  const maxY = Math.min(terrain.height - 1, Math.ceil((cameraY + viewportHeight / scale) / 16));
  for (let tileY = minY; tileY <= maxY; tileY += 1) for (let tileX = minX; tileX <= maxX; tileX += 1) {
    const index = tileY * terrain.width + tileX;
    const blocked = worldCollision.blocked[index] ?? true;
    const terrainBlocked = terrain.blocked[index] ?? true;
    context.fillStyle = blocked ? terrainBlocked ? '#ff335577' : '#ff9d2377' : '#55ff8850';
    context.fillRect(
      Math.round((tileX * 16 - cameraX) * scale),
      Math.round((tileY * 16 - cameraY) * scale),
      16 * scale,
      16 * scale,
    );
    context.strokeStyle = '#fff3';
    context.lineWidth = 1;
    context.strokeRect(
      Math.round((tileX * 16 - cameraX) * scale),
      Math.round((tileY * 16 - cameraY) * scale),
      16 * scale,
      16 * scale,
    );
    for (const [deltaX, deltaY] of [[1, 0], [0, 1]] as const) {
      const neighborX = tileX + deltaX;
      const neighborY = tileY + deltaY;
      if (neighborX >= terrain.width || neighborY >= terrain.height) continue;
      const boundary = terrainContourBoundaryBetween(
        terrain,
        tileX,
        tileY,
        neighborX,
        neighborY,
      );
      if (boundary === 'none') continue;
      const edgeX = (tileX + (deltaX === 1 ? 1 : 0)) * 16;
      const edgeY = (tileY + (deltaY === 1 ? 1 : 0)) * 16;
      context.beginPath();
      context.strokeStyle = boundary === 'transition' ? '#38f6ffff' : '#ff36dfff';
      context.lineWidth = Math.max(2, scale);
      context.moveTo(
        Math.round((edgeX - cameraX) * scale),
        Math.round((edgeY - cameraY) * scale),
      );
      context.lineTo(
        Math.round((edgeX + (deltaY === 1 ? 16 : 0) - cameraX) * scale),
        Math.round((edgeY + (deltaX === 1 ? 16 : 0) - cameraY) * scale),
      );
      context.stroke();
    }
  }
  for (const obstacle of showEntityObstacles ? worldCollision.obstacles ?? [] : []) {
    const left = obstacle.left / FIXED_UNITS_PER_PIXEL;
    const top = obstacle.top / FIXED_UNITS_PER_PIXEL;
    const width = (obstacle.right - obstacle.left + 1) / FIXED_UNITS_PER_PIXEL;
    const height = (obstacle.bottom - obstacle.top + 1) / FIXED_UNITS_PER_PIXEL;
    context.fillStyle = '#ff9d2377';
    context.strokeStyle = '#ffbf57';
    context.fillRect(
      Math.round((left - cameraX) * scale),
      Math.round((top - cameraY) * scale),
      Math.ceil(width * scale),
      Math.ceil(height * scale),
    );
    context.strokeRect(
      Math.round((left - cameraX) * scale),
      Math.round((top - cameraY) * scale),
      Math.ceil(width * scale),
      Math.ceil(height * scale),
    );
  }
  const chunkPixels = SURVIVAL_CHUNK_TILES * 16;
  const residentKeys = groundCache.residentKeys;
  const minChunkX = Math.max(0, Math.floor(cameraX / chunkPixels));
  const minChunkY = Math.max(0, Math.floor(cameraY / chunkPixels));
  const lastChunkX = Math.ceil(terrain.width / SURVIVAL_CHUNK_TILES) - 1;
  const lastChunkY = Math.ceil(terrain.height / SURVIVAL_CHUNK_TILES) - 1;
  const maxChunkX = Math.min(lastChunkX, Math.floor((cameraX + viewportWidth / scale) / chunkPixels));
  const maxChunkY = Math.min(lastChunkY, Math.floor((cameraY + viewportHeight / scale) / chunkPixels));
  context.lineWidth = Math.max(1, scale);
  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      context.strokeStyle = residentKeys.includes(`${chunkX},${chunkY}`) ? '#44ffe0cc' : '#ffffff66';
      context.strokeRect(
        Math.round((chunkX * chunkPixels - cameraX) * scale),
        Math.round((chunkY * chunkPixels - cameraY) * scale),
        chunkPixels * scale,
        chunkPixels * scale,
      );
    }
  }
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
  const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
  const terrain = terrainForSpace(activeSpaceDefinition, seed, version);
  const localTerrainContactY = terrainContactWorldYForPlayer(localY);
  const projectedLocalY = terrainProjectedWorldYAtFoot(terrain, localX, localTerrainContactY)
    + (localY - localTerrainContactY);
  const frame = renderer.beginWorld(worldZoom);
  const context = frame.world;
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
  const activeWeather = weatherVisualState(worldWeatherMode(), renderWeatherTick, worldWindDirection());
  const renderWeather = activeSpaceDefinition.weather ? activeWeather : { ...activeWeather, raining: false };
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
    visualTickClock.renderTick * AUTHORITY_TICK_MS,
    renderWeather.wind,
    renderWeather.windDirectionX,
  );
  drawCalls += drawInsetGround(
    context,
    art.dirtTerrace,
    art.farmlandGrassInset,
    activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID ? generateMarlowCampPathTiles() : [],
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
    snapshot.soil,
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
  const nameplates: Array<{ x: number; y: number; name: string }> = [];
  const renderedPlayerAnchors = new Map<string, { readonly x: number; readonly y: number }>();
  const targetableEntities: TargetableWorldEntity[] = [];
  const pointLights: PointLight[] = [];
  const projectedLight = (light: PointLight, terrainSampleY?: number): PointLight => {
    const receiverY = light.receiverDirectionWorldY ?? light.worldY;
    const projection = projectionAt(light.worldX, terrainSampleY ?? receiverY);
    return {
      ...light,
      worldY: light.worldY - projection,
      ...(light.receiverDirectionWorldY === undefined
        ? {}
        : { receiverDirectionWorldY: light.receiverDirectionWorldY - projection }),
    };
  };
  const frameAmbient = activeSpaceDefinition.ambient === 'clock'
    ? ambientAtTick(renderWeatherTick, renderWeather.raining ? 0.12 : 0)
    : activeSpaceDefinition.ambient;
  const drawSouthFacingReceiver = (
    footX: number,
    footY: number,
    draw: () => void,
  ): void => {
    const brightness = southFacingReceiverBrightness(footX, footY, frameAmbient, pointLights);
    context.save();
    if (brightness < 0.995) context.filter = `brightness(${Math.round(brightness * 1000) / 10}%)`;
    draw();
    context.restore();
  };
  const windTrees: WindTreeSource[] = [];
  for (const placeable of snapshot.placeables) {
    const light = placeablePointLight(placeable, snapshot.clock?.authorityTick ?? 0n);
    if (light !== null && worldPointVisible(light.worldX, light.worldY, lightVisible)) {
      pointLights.push(projectedLight(light));
    }
  }
  if (!debugEntitiesHidden && activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID) {
    for (const decoration of generateSurvivalDecorations(seed)) {
    if (isInteractivePoiDecorationKind(decoration.kind)) continue;
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
  if (!debugEntitiesHidden) for (const resource of snapshot.resources) {
    const resourceX = resource.tileX * 16 + 8;
    const resourceY = (resource.tileY + 1) * 16;
    if (!worldPointVisible(resourceX, resourceY, visible)) continue;
    if (!resource.depleted && isChoppableTreeKind(resource.kind)) {
      windTrees.push({
        id: Number(resource.id & 0x7fffffffn),
        x: resourceX,
        y: resourceY,
        kind: resource.kind,
      });
    }
    const sway = treeSwayOffset(
      renderWeather,
      visualTickClock.renderTick,
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
        drawSouthFacingReceiver(resourceX, resourceY, () => drawOverworldTree(
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
        ));
      },
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
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `item:${item.id}`,
      draw: () => drawOverworldItem(
        context, art, item.itemKind, x, y, arcHeight, cameraX, cameraY, scale, item.lit,
      ),
    });
  }
  if (!debugEntitiesHidden) for (const projectile of snapshot.projectiles) {
    const display = projectileDisplay.get(projectile.id);
    const x = (display?.x ?? projectile.x) / FIXED_UNITS_PER_PIXEL;
    const y = (display?.y ?? projectile.y) / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    enqueueWorldDepth(x, y, {
      footY: y,
      tie: `projectile:${projectile.id}`,
      draw: () => drawOverworldArrow(
        context,
        art,
        x,
        y,
        display?.velocityX ?? projectile.velocityX,
        display?.velocityY ?? projectile.velocityY,
        cameraX,
        cameraY,
        scale,
        (display?.state ?? projectile.state) === 'hit',
      ),
    });
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
  const fenceTiles = new Set([...snapshot.placeables]
    .filter((row) => row.kind === 'fence' || row.kind === 'fence_gate')
    .map((row) => `${row.tileX}:${row.tileY}`));
  if (!debugEntitiesHidden) for (const placeable of snapshot.placeables) {
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
  if (!debugEntitiesHidden) for (const npc of snapshot.npcs) {
    if (npc.rider !== undefined) continue;
    const display = npcDisplay.get(npc.id);
    const sleeping = npc.wanderDirection === 'sleep';
    const x = (sleeping ? npc.x : display?.x ?? npc.x) / FIXED_UNITS_PER_PIXEL;
    const y = (sleeping ? npc.y : display?.y ?? npc.y) / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const facing = (display?.facing ?? npc.facing) as Direction;
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
    const display = local ? null : remoteDisplay.get(id) ?? null;
    const previousDisplay = local || display === null ? null : previousRemoteDisplay.get(id) ?? display;
    const renderedRemote = display === null || previousDisplay === null
      ? null
      : interpolateFixedPosition(previousDisplay, display, alpha);
    const mount = snapshot.npcs.find((npc) => npc.rider?.toHexString() === id) ?? null;
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
    if ((equipped === 'lantern' || equipped === 'torch') && equippedLit
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
    if (!local) targetableEntities.push({
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
    const moving = presentationMoving(
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
        const actionKind = localBowCharging
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
            performance.now() - (bowChargeStartedAtMs ?? performance.now()),
            actionFrames,
          )
          : null;
        const actionFrame = chargedBowFrame
          ?? (animation.channel === 'action' && !animation.fallback ? animation.frame : null);
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
  if (markedTarget !== undefined) drawSelectedEntityMarker(context, markedTarget, cameraX, cameraY, scale);
  drawCalls += worldDepthItems.length;
  drawCalls += weatherEffects.drawCloudShadows(
    context,
    renderWeather,
    visualTickClock.renderTick,
    cameraX,
    cameraY,
    scale,
    viewportWidth,
    viewportHeight,
  );
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
  drawCalls += weatherEffects.drawWind(
    context,
    renderWeather,
    visualTickClock.renderTick,
    cameraX,
    cameraY,
    scale,
    viewportWidth,
    viewportHeight,
    windTrees,
  );
  const farmItem = selectedItem(snapshot);
  const tileToolSelected = farmItem === 'hoe' || farmItem === 'watering_can';
  const placeableSelected = carriedChest(snapshot) !== null
    || itemDefinition(farmItem)?.tags.includes('item.placeable') === true;
  const interactionTarget = tileToolSelected || placeableSelected ? targetInteractionTile() : null;
  const farmTarget = tileToolSelected ? interactionTarget : null;
  if (!debugEntitiesHidden && interactionTarget !== null && localMount(snapshot) === null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    drawInteractionTileReticle(
      context,
      placeableSelected && placementTileBlocked(snapshot, interactionTarget)
        ? art.uiSkin.selectorDeny
        : art.uiSkin.selectorNeutral,
      interactionTarget.tileX,
      interactionTarget.tileY,
      cameraX,
      cameraY,
      scale,
    );
    drawCalls += 1;
  }
  if (!debugEntitiesHidden && farmItem === 'bow'
    && overworldUi.openWindow === null && !chatOverlay.isOpen
    && drawBowAimGuide(context, cameraX, cameraY, scale)) drawCalls += 1;
  if (debugCollision) {
    drawCollisionOverlay(
      context,
      cameraX,
      cameraY,
      scale,
      frame.layout.width,
      frame.layout.height,
      terrain,
      !debugEntitiesHidden,
    );
    if (!debugEntitiesHidden) drawPlayerCollisionOverlay(context, cameraX, cameraY, scale, snapshot);
    drawToolInteractionOverlay(context, cameraX, cameraY, scale, snapshot);
  }
  renderer.compositeWorld();
  drawCalls += 1;

  const uiWidth = renderer.cssWidth / uiScale;
  const uiHeight = renderer.cssHeight / uiScale;
  const uiContext = renderer.beginUi(uiScale);
  const interaction = targetInteraction(snapshot);
  const handsChest = carriedChest(snapshot);
  const groundLantern = targetGroundLantern(snapshot);
  const selectedLantern = selectedItemRow(snapshot);
  const farmSoil = farmTarget === null ? undefined
    : snapshot.soil.get(farmSoilKey(farmTarget.tileX, farmTarget.tileY));
  const farmPrompt = farmTarget === null ? null
    : farmItem === 'hoe' ? (farmSoil === undefined ? '[F] TILL SOIL' : '[RIGHT CLICK] RESTORE GRASS')
      : farmSoil === undefined ? 'TILL SOIL BEFORE WATERING'
        : farmSoil.watered ? 'SOIL ALREADY WATERED' : '[F] WATER SOIL';
  const basePrompt = debugEntitiesHidden || npcInteractionUi.active ? null : handsChest !== null
    ? '[F] PLACE CHEST'
    : selectedItem(snapshot) === 'chest'
      ? '[F] PLACE CHEST'
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
  overworldUi.update({
    width: uiWidth,
    height: uiHeight,
    connected: snapshot.connected,
    playerCount: onlinePlayers.length,
    zoneName: activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
      ? 'Overworld'
      : activeSpaceDefinition.name
        .split('_')
        .map((part) => part.length > 0 ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part)
        .join(' '),
    selectedSlot: optimisticSelectedSlot ?? snapshot.survival?.selectedSlot ?? 0,
    balanceBronze: snapshot.wallet?.balanceBronze ?? 0n,
    inventory: [...snapshot.inventorySlots],
    ...(playerVitals === null ? {} : { vitals: {
      playerId: snapshot.identityHex ?? 'local',
      ...playerVitals,
      vigour: optimisticVigourCenti ?? playerVitals.vigour,
    } }),
    ...(targetVitals === undefined ? {} : { targetVitals }),
    vigourDenied: vigourDenyTicks > 0,
    effects: visibleEffects,
    openChestInventory: [...snapshot.openChestSlots],
    openPlaceableInventory: [...snapshot.openPlaceableSlots],
    hasBackpack: [...snapshot.inventorySlots].some((slot) => slot.itemKind === 'backpack'),
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
    prompt,
    toast: toastTicks > 0 ? toast.slice(0, 42) : null,
    toastKind,
    nearbyCraftingStations: nearbyCraftingStations(snapshot),
  });
  npcInteractionUi.update(snapshot.activeDialogue === null ? null : {
    width: uiWidth,
    height: uiHeight,
    npcId: snapshot.activeDialogue.npcId,
    dialogueId: snapshot.activeDialogue.dialogueId,
    nodeId: snapshot.activeDialogue.nodeId,
    balanceBronze: snapshot.wallet?.balanceBronze ?? 0n,
    inventory: [...snapshot.inventorySlots],
  });
  const channelNames = new Map([...snapshot.chatChannels].map((channel) => [channel.id, channel.displayName]));
  chatOverlay.update({
    width: uiWidth,
    height: uiHeight,
    connected: snapshot.connected,
    canAdministerWorld: snapshot.membership?.role === 'owner',
    onlinePlayerNames: onlinePlayers.map((player) => player.displayName),
    replyPlayerName: latestIncomingWhisper(snapshot)?.senderDisplayName ?? null,
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
        channelName: 'World',
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
  );
  if (nameplatesVisible) {
    overworldUi.drawNameplates(uiContext, nameplates.map((nameplate) => ({
      x: (nameplate.x - cameraX) * worldZoom / uiScale,
      y: (nameplate.y - cameraY - 42) * worldZoom / uiScale,
      text: nameplate.name,
    })));
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
          y: screenY - Math.max(34, 48 * worldZoom / uiScale),
          direction: 'down',
        }
      : edgeSpeechAnchor(screenX, screenY, uiWidth, uiHeight);
    const rect = speechBubbleRect(anchor, layout, uiWidth, uiHeight);
    drawSpeechBubble(uiContext, art.ui, art.uiSkin, rect, layout, kind, anchor.direction);
  }
  chatOverlay.draw(uiContext);
  overworldUi.draw(uiContext);
  if (onlinePlayersVisible) overworldUi.drawOnlinePlayers(uiContext, onlinePlayers);
  npcInteractionUi.draw(uiContext);
  characterNamePrompt.draw(uiContext);
  if (debugMetrics) {
    const metrics = renderMetrics.snapshot();
    const net = network.metrics();
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
  if (loadingStage.ready === true) dismissLoadingScreen();
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

function selectSlotOptimistically(slot: number): void {
  if (bowChargeStartedAtMs !== null) {
    bowChargeStartedAtMs = null;
    bowChargePointerId = null;
  }
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

function releaseBowShot(): void {
  if (bowChargeStartedAtMs === null) return;
  const aim = cursorAimVector();
  const chargeMs = Math.min(BOW_MAX_CHARGE_MS, Math.max(0, Math.round(performance.now() - bowChargeStartedAtMs)));
  bowChargeStartedAtMs = null;
  bowChargePointerId = null;
  if (aim === null) return;
  const length = Math.hypot(aim.x, aim.y);
  if (length < 0.001) return;
  const aimX = Math.round(aim.x / length * BOW_AIM_SCALE);
  const aimY = Math.round(aim.y / length * BOW_AIM_SCALE);
  performToolAction(
    () => network.fireBow(aimX, aimY, chargeMs),
    'ARROW LOOSED',
    'bow',
    false,
    450,
  );
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  void audio.unlock().catch(() => undefined);
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
  if (overworldUi.handleKeyDown(event.code, event.repeat)) {
    event.preventDefault();
    return;
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
    setToast(debugCollision
      ? 'COLLISION: MAGENTA CONTOUR / CYAN RAMP / RED TERRAIN / AMBER RESOURCE'
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
  if (event.code === 'KeyR' && !event.repeat) {
    showResult(network.repairSelectedTool(), 'TOOL REPAIRED');
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyF' && !event.repeat) {
    const snapshot = latestSnapshot;
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
    if (selectedDefinition?.tags.includes('item.placeable') === true || facedPlaceable !== null) {
      const placing = selectedDefinition?.tags.includes('item.placeable') === true;
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
          placing ? `${selectedDefinition?.displayName.toUpperCase()} PLACED` : 'PLACEABLE PICKED UP',
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
    const actionKind = avatarActionForEquippedKind(item);
    if (actionKind === null) {
      setToast(`NO ${hotbarItemLabel(item)} USE ACTION YET`, 'failure');
    } else {
      if (item === 'hoe' || item === 'watering_can') {
        const tile = targetFarmTile();
        if (tile === null) {
          setToast('NO FARM TILE TARGETED', 'failure', 90);
        } else {
          performFarmToolAction(tile, item);
        }
        event.preventDefault();
        return;
      }
      const resource = targetResource(snapshot);
      if (!isVitalsTool(item)) {
        setToast('THIS TOOL IS NOT READY FOR WORLD USE', 'failure', 90);
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
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => {
  keys.clear();
  bowChargeStartedAtMs = null;
  bowChargePointerId = null;
});
canvas.addEventListener('pointermove', (event) => {
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  worldPointer = { x: canvasX, y: canvasY };
  refreshHoveredInteractionTile();
  const [x, y] = pointerUiPosition(event);
  characterNamePrompt.pointerMove({ x, y });
  if (characterNamePrompt.isActive) return;
  if (npcInteractionUi.pointerMove({ x, y })) return;
  chatOverlay.pointerMove({ x, y });
  overworldUi.pointerMove({ x, y }, { shift: event.shiftKey });
});
canvas.addEventListener('pointerleave', () => {
  worldPointer = null;
  hoveredInteractionTile = null;
  characterNamePrompt.pointerLeave();
  npcInteractionUi.pointerLeave();
  chatOverlay.pointerLeave();
  overworldUi.pointerLeave();
});
canvas.addEventListener('pointerdown', (event) => {
  void audio.unlock().catch(() => undefined);
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  worldPointer = { x: canvasX, y: canvasY };
  refreshHoveredInteractionTile();
  const [x, y] = pointerUiPosition(event);
  if (characterNamePrompt.pointerDown({ x, y }, event.button)) {
    event.preventDefault();
    return;
  }
  if (npcInteractionUi.pointerDown({ x, y }, event.button)) {
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  if (chatOverlay.pointerDown({ x, y }, event.button)) {
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  if (overworldUi.pointerDown({ x, y }, event.button, { shift: event.shiftKey })) {
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  if (event.button === 0 && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    const nextTarget = entityTargetAtWorldPoint(
      latestCameraX + canvasX / latestRenderedZoom,
      latestCameraY + canvasY / latestRenderedZoom,
      latestTargetableEntities,
    );
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
  if (event.button === 0 && selectedItem(latestSnapshot) === 'bow'
    && carriedChest(latestSnapshot) === null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    if (!toolActionHasEnoughVigour('bow')) {
      event.preventDefault();
      return;
    }
    bowChargeStartedAtMs = performance.now();
    bowChargePointerId = event.pointerId;
    startPredictedAction('ranged_weapon');
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const farmItem = selectedItem(latestSnapshot);
  const farmTarget = targetFarmTile();
  const restoringFarmTile = event.button === 2 && farmItem === 'hoe' && farmTarget !== null
    && latestSnapshot.soil.get(farmSoilKey(farmTarget.tileX, farmTarget.tileY)) !== undefined;
  if (restoringFarmTile && localMount(latestSnapshot) === null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    performFarmToolAction(farmTarget, 'hoe', true);
    event.preventDefault();
    return;
  }
  if (event.button === 0 && (farmItem === 'hoe' || farmItem === 'watering_can')
    && farmTarget !== null && localMount(latestSnapshot) === null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    performFarmToolAction(farmTarget, farmItem);
    event.preventDefault();
  }
});
canvas.addEventListener('pointerup', (event) => {
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  worldPointer = { x: canvasX, y: canvasY };
  const [x, y] = pointerUiPosition(event);
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
  if (event.button === 0 && bowChargePointerId === event.pointerId && bowChargeStartedAtMs !== null) {
    releaseBowShot();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const chatConsumed = chatOverlay.pointerUp();
  const consumed = overworldUi.pointerUp({ x, y }, event.button, { shift: event.shiftKey });
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (chatConsumed || consumed) event.preventDefault();
});
canvas.addEventListener('pointercancel', () => {
  bowChargeStartedAtMs = null;
  bowChargePointerId = null;
  worldPointer = null;
  hoveredInteractionTile = null;
  chatOverlay.pointerLeave();
  npcInteractionUi.pointerLeave();
  overworldUi.pointerLeave();
});
canvas.addEventListener('wheel', (event) => {
  const [x, y] = pointerUiPosition(event);
  if (characterNamePrompt.isActive) {
    event.preventDefault();
    return;
  }
  if (npcInteractionUi.wheel({ x, y }, event.deltaY) || npcInteractionUi.active) {
    event.preventDefault();
    return;
  }
  if (chatOverlay.wheel({ x, y }, event.deltaY)) {
    event.preventDefault();
    return;
  }
  if (overworldUi.wheel({ x, y }, event.deltaX, event.deltaY)) {
    event.preventDefault();
    return;
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
    pickupWorldItem: (itemId: bigint) => network.pickupWorldItem(itemId),
    interactNpc: (npcId: bigint) => network.interactNpc(npcId),
    chooseDialogueOption: (choiceId: string) => network.chooseDialogueOption(choiceId),
    closeNpcDialogue: () => network.closeNpcDialogue(),
    buyMerchantItem: (itemKind: string, quantity: number) => network.buyMerchantItem(itemKind, quantity),
    sellMerchantItem: (itemKind: string, quantity: number) => network.sellMerchantItem(itemKind, quantity),
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
    openChat: () => chatOverlay.handleGlobalKeyDown(new KeyboardEvent('keydown', { key: 'Enter' })),
    openWindow: (window: 'inventory' | 'pack' | 'crafting' | 'barrel' | 'system' | 'settings' | null) => { overworldUi.openWindow = window; },
    uiWindow: () => overworldUi.openWindow,
  },
});
loop.start();
