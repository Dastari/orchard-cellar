import { GameFeedback, type GameFeedbackModel, type GameSkillNoticeScope, DelveRewardsUi, GameOnlinePlayers, type OnlinePlayerManagementRequest, GameUiRuntime, UiTextBridge, loadUiKitArt } from '@orchard/ui/game';
import { RetainedUiPointers, retainedUiClientRect } from './retained-ui-input.js';
import { runtimeProgression } from '@orchard/sim';
import { runtimeActorCollision, runtimeTraversalPolicy, traversalSolidGeometry } from '@orchard/sim';


import { timingLabels } from '@orchard/ui';
import { TOUCH_ACTION_KEY_CODES } from '@orchard/ui';
import { GrowthTimingHoverIndex, projectResourceTiming } from './content/growth-timing.js';
import { projectTiming, rainForWeatherMode } from '@orchard/sim';
import { TimingHoverIndex } from './content/timing-hover.js';
import { cachedProcessorRuntime, projectProcessorTiming } from './content/processor-timing.js';
import { runtimeObjectFootprintTiles, runtimeObjectOccupiesTile } from '@orchard/sim';
import { WorldInteractionRegistry } from './world-interactions.js';
import { worldActionPrompt } from './world-action-prompt.js';
import { orchardHarvestPrompt } from './orchard-presentation.js';
import { glancingSwingNodes, miningToolNeeded, miningWorkAdvanced, MINING_GLANCE_TICKS } from './mining-feedback.js';
import { orchardFruitStatus, ITEM_PICKUP_REACH_FIXED } from '@orchard/sim';
import { drawInitialWorldLoading, disposeInitialWorldLoading } from './initial-world-loading.js';
import { fruitTreeForSeed } from '@orchard/sim';
import { farmingSkillEffects, farmingCropDefinition } from '@orchard/sim';
import { hearthDangerNotice } from '@orchard/sim';
import { runtimeQuestDefinition } from '@orchard/sim';
import { runtimeWorldPolicyBalance } from '@orchard/sim';
import {
  activeSpaceGroundWalkableTiles,
  activeSurvivalLandmarks,
  generateSurvivalLandmarkDecorations,
  generateSurvivalLandmarkPathTiles,
  runtimeDurabilityDefinition,
  runtimeItemAvatarAction,
  survivalLandmarkRoleReservedAt,
} from '@orchard/sim';
import { authoredResourceVisual } from '@orchard/engine/overworld-art';
import { CombatRegionPolicy, hearthGatheringContentReady, runtimeHearthSupplyCache,
  hearthSupplyCacheInstalled, hearthSupplyCacheApproachClear } from '@orchard/sim';
import { hearthResourceTargetAllowed } from './hearth-resource-targeting.js';
import {HearthConstructionRequest} from './hearth-construction-request.js';
import { authoredMapContentPainterTie } from '@orchard/sim';
import { overworldPoiDecorationDepthY } from '@orchard/engine/overworld-art';
import { lightCasterPainterOrder } from './light-caster-painter-order.js';
import {hearthConstructionToolEdits,hearthConstructionToolFootprint,planHearthArchitectureEdits,EMPTY_HEARTH_ARCHITECTURE_JSON} from '@orchard/sim';
import {facedHearthSeat} from './hearth-seating.js';
import {hearthInteriorForSpace,hearthInteriorFurnitureObstacles} from '@orchard/sim';
import { hearthFurnitureShapeForPlaceable, hearthFurniturePlacementFromRow, hearthFurnitureCells, hearthFurniturePresentationAnchor,
  hearthFurnitureDefinition,
  hearthFurnitureRevision,
  composeHearthArchitecture,hearthDoorwayWallAttachmentFailure,parseHearthArchitectureState,residencePlayableTile,hearthFurnitureObstacle,
  residenceReservedTiles, RESIDENCE_EXIT_TILE } from '@orchard/sim';
import { furnishingPreview, furnitureAtTile, furniturePickupFailure } from './hearth-furnishing.js';
import { FurnitureMoveController } from './furniture-move-controller.js';
import { drawAuthoredOverworldObject } from '@orchard/engine/overworld-art';
import {activeHearthLobbyDefinition,cellarLadderApproachClear,cellarLadderPortal,
  hearthLobbyPortalApproachClear,
  runtimeHearthLobbyDefinition,runtimeSpaceDefinition} from '@orchard/sim';
import {loadAuthoredNpcArt} from '@orchard/engine/authored-npc-art';
import {runtimeHearthFerryNetwork,type HearthFerryDock} from '@orchard/sim';
import { OutdoorRewardsModel } from './outdoor-rewards-model.js';
import {outdoorEnemyPresentation,outdoorWardenDisplayName} from './outdoor-enemy-presentation.js';
import { DefenseHoldInput } from './defense-input.js';
import { drawEnemyAttackTelegraph, drawOutdoorSummonMark, drawWardenCrest } from '@orchard/engine/combat-telegraph';
import { type EnemyAttackPattern } from '@orchard/sim';
import { prepareGameplayPainter } from './gameplay-painter-setup.js';
import { enqueueGameplayDecorations } from './gameplay-painter-decorations.js';
import { enqueueGameplayResources } from './gameplay-painter-resources.js';
import { enqueueGameplayProjectiles } from './gameplay-painter-projectiles.js';
import { enqueueGameplayPlaceables } from './gameplay-painter-placeables.js';
import { enqueueGameplayNpcs } from './gameplay-painter-npcs.js';
import { enqueueGameplayPlayers } from './gameplay-painter-players.js';
import type { PendingBowProjectile, RuntimeSurvivalDecoration, RenderWorldResource } from './gameplay-painter-inputs.js';
import { gameplayProtocolLighting } from './gameplay-protocol-lighting.js';
import { createGameplayProtocolWorkload } from './gameplay-protocol-workload.js';
import { protocolPondTies } from './render-protocol-ponds.js';
import { gameplayDiagnostics } from './gameplay-diagnostic-snapshot.js';

import { GameplayCelestialPass } from './gameplay-celestial-pass.js';
import { GameplayLightingPresentation, renderWithGameplayLightingFallback } from './gameplay-lighting-presentation.js';
import { sortGameplayWorldDepthItems } from './gameplay-painter.js';
import { createGameplayRenderer } from './gameplay-renderer.js';
import { selectedLightEquipRequest } from './selected-item-use.js';
import { setWorldAssetPresentation } from '@orchard/engine/world-asset-presentation';
import { setGroundLightSource } from '@orchard/engine/ground-light-source';

import { withWorldReceiverLight } from '@orchard/engine/receiver-frame-source';
import {
  runtimeObjectCarry,
  runtimeObjectDamageable,
  runtimeObjectDefinition,
  runtimeResourceDefinition,
  runtimeResourceObstacle,
  runtimeResourcePickupPresentation,
  runtimeResourceToolAllowed,
  runtimeSpaceSurfaceDefinition,
  runtimeSpaceSurfaceObstacle,
  runtimeSkillCapabilities,
} from '@orchard/sim';

import { compositeBasicLighting, LightingQualityState, readLightingQuality, LIGHTING_QUALITY_KEY, type LightingQuality } from '@orchard/engine/lighting-quality';
import { resetSpriteLightMasks } from '@orchard/engine/light-occlusion';
import { AUTHORITY_TICK_MS, AUTHORITY_HZ, MAIN_HAND_INVENTORY_SLOT, compileEquipmentLoadout, itemContainerContentResolver, BACKPACK_SLOT_COUNT, EQUIPMENT_SLOT_OFFSET, ACTIVE_EQUIPMENT_SLOT_INDEXES, activeEquipmentSlotAccepts, HUNGER_MAX_CENTI, BASE_BACKPACK_CAPACITY, CROP_WATERING_TICKS, BOW_MAX_CHARGE_MS, BOW_MAX_PROJECTILE_FLIGHT_TICKS, BOW_MAX_TARGET_RANGE_PIXELS, BOW_MIN_TARGET_RANGE_PIXELS, CHEST_INTERACTION_REACH_FIXED, CAMPFIRE_INTERACTION_REACH_FIXED, FIXED_UNITS_PER_PIXEL, INPUT_REFRESH_STEPS, SIM_STEPS_PER_AUTHORITY_TICK, SIM_TICKS_PER_SECOND, SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION, TILE_SIZE_FIXED, TICKS_PER_DAY, SKILL_TRACKS, TOPSIDE_SPACE_ID, authorityDayProgress, authorityTickAtDayProgress, calendarAtTick, canAdministerWorld, craftingStationWithinReach, runtimeCropDefinition, runtimeResourcePerception, runtimeNpcMount, runtimeNpcDefinition, runtimeObjectIrrigatesTile, runtimeObjectProtectsCropSeasons, cropGrowthAt, bowChargedRangePixels, bowChargeTracerFraction, bowChargeVigourCostCenti, bowProjectileArcPresentation, bowProjectileOrigin, bowProjectileRangePixels, bowProjectileTargetOrigin, bowShotForTarget, directionFromAim, directionUnitVector, encodedBowTargetAim, isWindDirectionMode, isWeatherMode, lunarIlluminationAtAuthorityTick, lunarPhaseAtAuthorityTick, generateSurvivalDecorations, generateSurvivalProceduralDecorations, mapLandmarkDecoration, survivalTreeKindAt, homesteadBiomeAt, homesteadPathTiles, homesteadPortalName, HOMESTEAD_GATE_TILE, HOMESTEAD_TENT_TILE, cellarOreKindAt, runtimeLandmarkCampfirePlans, ROGUE_RUN_ROOM_COUNT, hearthLobbyFurnitureObstacles, interiorFurnitureBlockingTiles, homesteadTentFootprint, homesteadMarkerPlacementTiles, homesteadBoundaryTiles, homesteadPlotBounds, homesteadPlayableTile, runtimeHomesteadBuildDefinition, homesteadBuildDefinitions, homesteadBuildFootprintTiles, instanceSpaceRowFor, isBreakableRockKind, isChoppableTreeKind, isMineableOreKind, miningHitsUntilYield, miningNodeRichnessLabel, mixedNodeStoneChancePercent, miningWorkPerHit, MINING_YIELD_WORK, FISHING_CAST_TICKS, projectileTraversalCollision, forwardSwingTargetInReach, survivalResourceInitialHealth, survivalResourceObstacle, survivalDecorationBlocksTraversal, survivalDecorationObstacle, treeGrowthStageName, isMountWithinReach, runtimeEffectDefinition, runtimeItemDefinition, runtimeItemInventoryCapacity, runtimeItemSalePremium, runtimeRangedWeaponDefinition, runtimeToolDefinition, runtimeVigourDefinition, runtimeHomesteadUpgradeRank, coinPurseFromBronze, itemActionRejection, isPlayerAppearanceSelection, runtimePlayerAppearanceCatalog, isSkillTrack, runtimePlaceableDefinition, placeableObjectDefinition, questDefinitionFromContent, questObjectiveProgress, richSoilGrowthTicks, homesteadRoleAtLeast, isHomesteadMemberRole, estateVintageTier, runtimeCreatureDefinition, runtimeCreatureIsHuntable, runtimeResolveCreatureStats, nextWeatherMode, nextWindDirectionMode, weatherVisualState, collisionTileIsBlockedAtPlane, shiftAuthorityDay, simTickOfDayAtAuthorityTick, movePlayer, movePlayerAtSpeed, movePlayerAtSpeedPermille, modifiersForEffects, nearestTileTarget, normalizedBowAim, playerHitboxBounds, positionCollides, tileTargetIsBlocked, tileTargetWithinFixedReach, tileToolInteractionOrigin, playerInteractionOrigin, resourceToolReachFixed, resourceToolForwardOffsetFixed, toolUsesForwardSwing, resolveStatsWithProfile, runtimeCharacterCombatBalance, resolveSprintAbility, runtimeSprintAbilityDefinition, resolveModifierTarget, sprintVigourCostForSteps, type CollisionMap, type CollisionObstacle, type CraftingStation, type Direction, type MerchantCartLine, type PlayerState, type PlayerAppearanceSelection, type SpaceDefinition, type WeatherMode, type WindDirectionMode, type HomesteadUpgradeMechanic, type MiningNodeClass, type ProcessAdapter, type Modifier, type MapDocumentV3, rogueUpgradeDefinition, resolvedMapBiomeAt, survivalBiomeAt } from '@orchard/sim';
import {
  clientSpaceDefinition,
  spacePresentationKey,
} from './content/space-authority.js';
import { objectHasAuthoredTag, objectSecondaryTarget, objectUseMetadata,
  objectUseWithinRadialReach } from './content/object-interaction.js';
import { authoredSpacePortalPrompt } from './content/portal-interaction.js';
import { readPlayerNameplates, writePlayerNameplates } from './player-ui-preferences.js';
import { calendarTickForSnapshot, cropCalendarOffsetForSnapshot, snapshotTimingClocks } from './content/timing-clock.js';
import { activeObjectFrameId, activeObjectFrameState, processJobFrameState, processJobMatchesFrame } from './content/frame-presentation.js';
import {
  DEFAULT_UI_SCALE,
  DEFAULT_WORLD_ZOOM,
  canvasSafeAreaInsets,
  easeWorldZoom,
  fittedUiScale,
  insetCanvasViewport,
  stepUiScale,
  stepWorldZoom,
  type CanvasViewportInsets,
  type UiScale,
} from '@orchard/engine/display';
import { createGameplayLoop } from './gameplay-loop.js';
import { WorldUpdateOverlay } from './world-update-overlay.js';
import { ConnectionRecoveryOverlay, type ConnectionRecoveryState } from './connection-recovery-overlay.js';
import { installConnectionLifecycle } from './connection-lifecycle.js';
import { ResourcePerceptionCache, identifiedOreAtWorldPoint } from './resource-perception.js';
import { WorldSource } from './world-source.js';
import type { TileBounds } from '@orchard/engine/chunk-terrain-window';
import { terrainIndexAt, terrainTileBounds } from '@orchard/engine/terrain-index';
import { WorldTouchInput, type WorldTouchPoint } from './world-touch-input.js';
import { readTouchControlPreferences, writeTouchControlPreferences } from './touch-control-preferences.js';
import { dismissLoadingScreen, setLoadingScreenStage, upgradeLoadingScreen, worldLoadingStage } from '@orchard/engine/loading-screen';
import { isStandaloneWebApp, pwaClient } from './pwa.js';
import {
  fullscreenControlAvailable,
  toggleFullscreenWithEscapeLock,
  type FullscreenControl,
} from './fullscreen.js';
import { AudioBus } from '@orchard/engine/audio/audio-bus';
import { CombatMusicSignal, hostileWithin, worldMusicContext } from './music-context.js';
import { localProfilesEnabled, readOidcSession } from '@orchard/auth';
import type { ChatMessage, PlayerPosition, QuestWorldItem, RogueRoomExit, SpacePortal, WorldChest, WorldCombatTarget, WorldCrop, WorldItem, WorldNpc, WorldPlaceable, WorldProjectile, WorldResource } from '@orchard/world-bindings/types';
import {
  OverworldConnection,
  viewRadiusForViewport,
  type NetworkDirection,
  type OverworldView,
} from './net/overworld-connection.js';
import { AvatarAnimationController, LocalActionPresentation, FrameVisualTickClock, PresentationCorrection, ProjectileSnapshotBuffer, RemoteSnapshotBuffer, RenderTickClock, VisualTickClock, presentationAuthorityTick, type SampledProjectile, type SampledRemote } from './net/netcode.js';
import { DEFAULT_PLAYER_APPEARANCE, drawOverworldPlaceable, drawPlayerHeadPortrait, drawPlayerPaperDoll, drawNpcPortrait, drawUiAsset, horseJumpPose, loadOverworldArt, type WorldVisualBounds } from '@orchard/engine/overworld-art';
import { cameraAxisOffset } from '@orchard/engine/camera';
import { snapGameplayCamera } from './gameplay-camera.js';
import { createClientCollisionMap } from '@orchard/engine/collision';
import { drawAnimatedTerrain } from '@orchard/engine/animated-terrain';
import { drawFarmSoil, drawInteractionTileReticle, drawInsetGround, farmSoilKey } from '@orchard/engine/farmland';

import { GroundChunkCache } from '@orchard/engine/ground-cache';
import {
  createLightOcclusionMap,
  createSpriteLightOccluder,
  type LightOcclusionMap,
  type LightTrunkOccluder,
} from '@orchard/engine/light-occlusion';
import { lightingModelFromStoredValue, TileLightmap, type LightingModel } from '@orchard/engine/lighting';
import { isLightEmitterKind } from '@orchard/engine/light-sources';
import { renderMetrics, renderDiagnostics, renderMetricsSnapshot } from './gameplay-render-diagnostics.js';
import { RainWeather } from '@orchard/engine/particles';

import { liveIslandDocument, liveIslandTerrain, liveMapObjectCollisionObstacles, liveMapObjectLightOccluders, liveMapObjectLightFrameKey, clearLiveMapShadowCaches } from '@orchard/engine/live-map-runtime';
import type { RenderBenchmarkScenarioId } from '@orchard/engine/render-benchmark-scenarios';
import { WeatherEffects, windDirectionLabel } from '@orchard/engine/weather-effects';
import { drawPixelPanel, drawPixelText, measurePixelText } from '@orchard/ui';
import {
  MAX_WORLD_ZOOM,
  drawSortedWorldDepthQueue,
  worldPassLayout,
} from '@orchard/engine/renderer';
import { cellarExposedWallAt, cellarWallSourceAtProjectedTile, terrainContactWorldYForPlayer, terrainElevationAtWorldFoot, terrainForSpace, terrainForWorld, terrainColorAt, terrainWithCellarExcavations, terrainBaseDatum, terrainPlaneCollisionCellAt, terrainProjectionStyle, terrainProjectedDepthAtFoot, terrainProjectedWorldYAtFoot, terrainVisualProjectionRowsPerLevel, type TerrainArray } from '@orchard/engine/terrain';
import { interpolateFixedPosition, rebaseInterpolationPosition, sampleLocalProjectilePrediction } from './overworld-prediction.js';
import {
  type InteractionCandidate,
} from './interaction-targeting.js';
import { worldPlayerParticipatesInCollision } from './player-presence.js';
import { farmActionPrompt } from './farm-action-prompt.js';
import {
  fishingCastLifecycleRequest,
  fishingReelLifecycleRequest,
  FishingReelGate,
} from './fishing-lifecycle.js';
import { jumpInputSkillAvailable, tileToolInputOutOfReach } from './action-input-preflight.js';
import {
  selectedCellarToolAction,
  selectedContextualWorldToolAction,
  selectedFarmToolAction,
  selectedFishingToolAction,
  selectedItemLifecycleAction,
  selectedItemLifecyclePrompt,
  selectedItemUseAction,
  selectedItemUsePrompt,
  swingKeyIntent,
  selectedWoodcuttingUseWithAction,
} from './selected-item-use.js';
import { homesteadTentPresentationTargets } from './homestead-presentation.js';

import {
  isInterfaceVisibilityToggle,
  isNameplateToggle,
  onlinePlayerIdleMinutes,
  nextHomesteadMemberRole,
  OverworldUi,
  type OverworldUiTargetVitals,
} from '@orchard/ui';
import { entityTargetAtWorldPoint, sameEntityTarget, targetKey, type SelectedEntityTarget, type TargetableWorldEntity } from './entity-targeting.js';
import { ChatOverlay } from '@orchard/ui';
import { parseChatSubmission } from '@orchard/ui';
import {
  edgeSpeechAnchor,
  speechBubbleHeadOffset,
  speechBubbleIsRecent,
  type EdgeSpeechAnchor,
} from '@orchard/ui';
import { CharacterNamePrompt } from '@orchard/ui';
import { NpcInteractionUi } from '@orchard/ui';
import { TradeUi } from '@orchard/ui';
import { QuestTracker, type QuestTrackerEntry } from '@orchard/ui';
import { HomesteadBuildPalette, type HomesteadBuildPaletteModel } from '@orchard/ui';
import type { QuestLogEntry } from '@orchard/ui';
import {
  SkillPointNoticeTracker,
  type SkillPointNotice,
} from '@orchard/ui';
import { TouchControls, type TouchControlAction } from '@orchard/ui';
import {
  facedResource,
  facedInteractionTile,
  interactionTileAtProjectedWorldPoint,
  nearbyWorldItem,
  hotbarItemLabel,
  hotbarSlotForCode,
  formatDayTime,
  worldPlacementTileIsBlocked,
} from './survival-ui.js';
import { LiveObjectPresentationCache } from './content/object-presentation.js';
import {
  contentArtRevisionKey,
  createClientContentArtSynchronizer,
} from './content/content-art-sync.js';
import { AuthoredActionArt } from './content/action-art.js';
import { collisionBootstrapReady } from './world-startup-readiness.js';
import { WorldStaticProjectionCache } from './world-static-projection.js';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (canvasElement === null) throw new Error('Missing overworld canvas');
const canvas: HTMLCanvasElement = canvasElement;
const renderer = createGameplayRenderer(canvas);
const inventoryFilterInputElement = document.querySelector<HTMLInputElement>('#inventory-filter');
if (inventoryFilterInputElement === null) throw new Error('Missing inventory filter input');
setLoadingScreenStage({
  title: 'PACKING YOUR WAGON', detail: 'LOADING ART, TILESETS, AND UI', progress: 38,
});
const [art, kitArt] = await Promise.all([loadOverworldArt(), loadUiKitArt()]);
const retainedUi = new GameUiRuntime();
upgradeLoadingScreen(kitArt, art.fruitItems['apple'] ?? art.missingItem);
setLoadingScreenStage({
  title: 'SAILING TO YOUR ISLAND', detail: 'CONNECTING TO THE SHARED WORLD', progress: 58,
});
const groundCache = new GroundChunkCache();
const lightmap = new TileLightmap();
const atlasPresentation = new GameplayLightingPresentation();
const celestialPass = new GameplayCelestialPass();
let lightingFailure: string | null = null;
let lightingPreview: { clockHours: number; continuousDay: number; lunarProgress: number; lunarIllumination: number; cloudCover?: number; cameraX?: number; cameraY?: number } | null = null;
function releaseDynamicLighting(): void {
  lightmap.reset(); celestialPass.resetRenderer();
  lightOcclusion = undefined; baseLightOcclusion = undefined; authoredLightFrameKey = ''; celestialPass.clearStatic();
  worldStaticProjection.releaseLighting(); resetSpriteLightMasks(); clearLiveMapShadowCaches();
}
const rain = new RainWeather(art.rainStreak, art.rainSplash);
const weatherEffects = new WeatherEffects(art.cloudShadow, art.windGust, art.oakLeaf, art.birchLeaf, art.spruceLeaf);
const stopLongTaskObserver = import.meta.env.DEV ? renderMetrics.observeLongTasks() : null;
if (import.meta.hot !== undefined && stopLongTaskObserver !== null) {
  import.meta.hot.dispose(stopLongTaskObserver);
}
let latestLightCount = 0;
const worldUpdateOverlay = new WorldUpdateOverlay();
const connectionRecoveryOverlay = new ConnectionRecoveryOverlay(art.ui, art.uiSkin);
let hasRenderedWorldFrame = false;
const audio = new AudioBus(false);
void audio.unlock().catch(() => undefined);

const keys = new Set<string>();
const touchControls = new TouchControls(kitArt, dispatchTouchControlAction);
let touchControlPreferences = readTouchControlPreferences(localStorage);
touchControls.setPreferences(touchControlPreferences);
const worldTouchInput = new WorldTouchInput({
  canAct: () => worldTouchActionAvailable(),
  getZoom: () => worldZoom,
  zoomTo: (zoom) => {
    worldZoom = Math.max(renderer.minimumZoom(activeSpaceDefinition.sizeTiles * 16), Math.min(MAX_WORLD_ZOOM, zoom));
    worldZoomTarget = worldZoom;
  },
  aim: (point) => {
    worldPointer = { x: point.x, y: point.y };
    refreshHoveredInteractionTile();
  },
  tap: (point) => {
    dispatchWorldTouchAction(point, false);
    if (bowChargePointerId === point.pointerId) releaseBowShot();
  },
  hold: (point) => dispatchWorldTouchAction(point, true),
  releaseHold: (cancelled) => {
    if (cancelled) cancelBowChargePresentation();
    else if (bowChargeStartedAtMs !== null) releaseBowShot();
  },
});
const accountSlot = new URLSearchParams(location.search).get('slot') ?? readOidcSession()?.subject ?? 'Farmer';
let networkDirty = true;
let connectionInputCleared = false;
const network = new OverworldConnection(accountSlot, () => { networkDirty = true; });
/** Topside terrain source: the legacy whole map, or the chunk window in chunk mode `on` (S4c). */
const worldSource = new WorldSource({ store: () => network.chunkTerrainStore, pin: (bounds) => network.setChunkPin(bounds) });
const furnitureMoves = new FurnitureMoveController((...args) => network.moveHearthFurniture(...args));
const objectPresentations = new LiveObjectPresentationCache(() => { networkDirty = true; });
const authoredActionArt = new AuthoredActionArt(() => { networkDirty = true; });
const GENERAL_CHAT_CHANNEL_ID = 1n;
const chatOverlay = new ChatOverlay(
  kitArt,
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
    canAdministerWorld(latestSnapshot.membership?.role),
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
  throw new Error('UNKNOWN COMMAND');
}
const characterNamePrompt = new CharacterNamePrompt(
  kitArt,
  (name) => network.setCharacterName(name),
  (active) => {
    if (!active) return;
    chatOverlay.dismiss();
    keys.clear();
    network.setDirection('idle');
  },
  {
    portrait: (context, rect) => drawPlayerPaperDoll(context, art, ownAppearanceSelection(latestSnapshot) ?? DEFAULT_PLAYER_APPEARANCE, 'down', rect),
    cask: art.itemIcons['barrel'],
  },
);
let latestSnapshot = network.view();
const contentArtSynchronizer = createClientContentArtSynchronizer(
  art,
  latestSnapshot.content.registry,
  () => { networkDirty = true; },
);
let requestedContentArtRevision: string | null = null;
function synchronizeContentArt(): void {
  const revision = contentArtRevisionKey(latestSnapshot.content);
  if (revision === null || revision === requestedContentArtRevision) return;
  requestedContentArtRevision = revision;
  void contentArtSynchronizer.synchronize(latestSnapshot.content)
    .catch((error: unknown) => console.warn('Authored content artwork could not be loaded', error));
}
synchronizeContentArt();
let npcArtContentHash = "";
const fishingReelGate = new FishingReelGate();

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
let outdoorRewardNoticeIdentity: string | null = null;
let outdoorRewardNoticeCount = 0;
let toastKind: 'info' | 'success' | 'failure' = 'info';
const SKILL_POINT_NOTICE_TICKS = 360;
const skillPointNoticeTracker = new SkillPointNoticeTracker();
const queuedSkillPointNotices: SkillPointNotice[] = [];
let skillPointNoticeIdentity: string | null = null;
let skillPointNotice: SkillPointNotice | null = null;
let skillPointNoticeTicks = 0;

function setToast(message: string, kind: 'info' | 'success' | 'failure' = 'info', ticks = 120): void {
  toast = message;
  toastKind = kind;
  toastTicks = ticks;
}

function dismissSkillPointNotice(): void {
  skillPointNotice = null;
  skillPointNoticeTicks = 0;
}

function updateSkillPointNotice(snapshot: OverworldView): void {
  if (snapshot.identityHex !== skillPointNoticeIdentity) {
    skillPointNoticeIdentity = snapshot.identityHex;
    skillPointNoticeTracker.reset();
    queuedSkillPointNotices.length = 0;
    dismissSkillPointNotice();
  }
  if (snapshot.identityHex !== null) {
    for (const notice of skillPointNoticeTracker.observe(snapshot.skillTracks, runtimeProgression(snapshot.content.registry))) {
      if (skillPointNotice?.track === notice.track) {
        skillPointNotice = { track: notice.track, points: skillPointNotice.points + notice.points };
        skillPointNoticeTicks = SKILL_POINT_NOTICE_TICKS;
        continue;
      }
      const queuedIndex = queuedSkillPointNotices.findIndex((entry) => entry.track === notice.track);
      if (queuedIndex >= 0) {
        const queued = queuedSkillPointNotices[queuedIndex]!;
        queuedSkillPointNotices[queuedIndex] = {
          track: queued.track,
          points: queued.points + notice.points,
        };
      } else queuedSkillPointNotices.push(notice);
    }
  }
  if (skillPointNotice !== null && skillPointNoticeTicks > 0) skillPointNoticeTicks -= 1;
  if (skillPointNotice !== null && skillPointNoticeTicks <= 0) skillPointNotice = null;
  if (skillPointNotice === null) {
    skillPointNotice = queuedSkillPointNotices.shift() ?? null;
    if (skillPointNotice !== null) skillPointNoticeTicks = SKILL_POINT_NOTICE_TICKS;
  }
}

type FailureWording = readonly (readonly [code: string, text: string])[];
// At the anvil a wrong tool means an undamaged one, so it keeps its specific wording.
const ANVIL_FAILURES: FailureWording = [['wrong_tool', 'SELECT A DAMAGED TOOL']];

function failureToastText(error: unknown, overrides: FailureWording = []): string {
  const raw = error instanceof Error ? error.message : String(error);
  const knownFailures = [
    ...overrides,
    ['inventory_full', 'NOT ENOUGH INVENTORY SPACE'],
    ['container_full', 'NOT ENOUGH INVENTORY SPACE'],
    ['insufficient_vigour', 'INSUFFICIENT VIGOUR'],
    ['anvil_copper_missing', 'ANVIL REPAIR NEEDS 5 COPPER'],
    ['anvil_not_in_reach', 'FACE A NEARBY ANVIL'],
    ['furnace_slot_restricted', 'ORE GOES ABOVE, WOOD OR PLANKS BELOW'],
    ['recipe_inputs_missing', 'CLEAR INCOMPATIBLE ITEMS FROM THE CRAFTING GRID'],
    ['recipe_not_found', 'THAT RECIPE IS NOT AVAILABLE'],
    ['item_reserved', 'THAT DROP IS RESERVED FOR ITS MINER'],
    ['mining_claimed_by_other_party', 'ANOTHER MINER OR PARTY IS WORKING THIS NODE'],
    ['pickaxe_tier_too_low', 'THIS VEIN NEEDS A STRONGER PICKAXE'],
    ['fishing_requires_water', 'FISHING REQUIRES A CLEAR WATER TILE'],
    ['tool_not_damaged', 'TOOL IS ALREADY FULLY REPAIRED'],
    ['wrong_tool', 'THAT NEEDS A DIFFERENT TOOL'],
    ['target_out_of_range', 'TOO FAR AWAY'],
    ['resource_depleted', 'NOTHING LEFT TO GATHER'],
    ['hands_occupied', 'YOUR HANDS ARE FULL'],
    ['tool_broken', 'THIS TOOL IS BROKEN'],
    ['out_of_arrows', 'NO ARROWS LEFT'],
    ['backpack_in_use', 'EMPTY THE EXTRA PACK SLOTS BEFORE UNEQUIPPING IT'],
    ['stable_hand_required', 'LEARN STABLE HAND IN ANIMAL HUSBANDRY'],
    ['steeplechase_required', 'LEARN STEEPLECHASE IN EXPLORER'],
    ['surefooted_required', 'LEARN SUREFOOTED OR CLIFF CLIMBER IN EXPLORER'],
    ['jump_no_safe_landing', 'NO SAFE JUMP LANDING'],
    ['jump_cooldown', 'STILL LANDING'],
    ['tool_skill_required', 'MORE SPECIALIZATION RANKS ARE REQUIRED FOR THIS TOOL'],
    ['equipment_light_required', 'EQUIP A SWITCHABLE LIGHT IN YOUR OFF-HAND SLOT'],
  ] as const satisfies FailureWording;
  const known = knownFailures.find(([code]) => raw.toLowerCase().includes(code));
  return known?.[1] ?? raw.replaceAll('_', ' ').toUpperCase();
}

// Rejections the player can already see (the swing animation simply doesn't repeat) show no toast.
const SILENT_FAILURES = ['swing_too_soon'] as const;

function setFailureToast(error: unknown, ticks = 120, overrides: FailureWording = []): void {
  const raw = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (SILENT_FAILURES.some((code) => raw.includes(code))) return;
  setToast(failureToastText(error, overrides), 'failure', ticks);
}

function rogueRewardClaimedMessage(run: { readonly roomNumber: number }): string {
  return run.roomNumber >= ROGUE_RUN_ROOM_COUNT - 1 ? 'DELVE CONQUERED - CHECK YOUR RECIPE GUIDE' : 'BOON CLAIMED';
}
let effectPhase = 0;
let worldZoom = DEFAULT_WORLD_ZOOM;
let worldZoomTarget = DEFAULT_WORLD_ZOOM;
let desiredUiScale: UiScale = DEFAULT_UI_SCALE;
let safeAreaInsets: CanvasViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let wheelZoomLockedUntil = 0;
let collisionKey = '';
let resourceTargetPolicy = new CombatRegionPolicy([]);
let resourceCollisionObstacles: ReadonlyMap<bigint, CollisionObstacle> = new Map();
const worldStaticProjection = new WorldStaticProjectionCache();
let cellarTerrainCacheKey = '';
let cellarTerrainCache: TerrainArray | null = null;
let observedResourceRevision = -1;
const initialTerrain = terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION);
let worldCollision: CollisionMap = createClientCollisionMap(initialTerrain, []);
let furnitureCollision: CollisionMap = worldCollision;
let furniturePreviewCache: { collision: CollisionMap; key: string; value: ReturnType<typeof furnishingPreview> } | null = null;
let furnishingStatus: string | undefined;
let constructionStatus: HomesteadBuildPaletteModel['constructionStatus'];
const constructionRequests=new HearthConstructionRequest();
let boatCollision: CollisionMap = createClientCollisionMap(initialTerrain, [], [], 'water');
let projectileCollision: CollisionMap = projectileTraversalCollision(worldCollision, boatCollision);
let lightOcclusion: LightOcclusionMap | undefined;
let baseLightOcclusion: LightOcclusionMap | undefined;
let authoredLightFrameKey = '';
const initialSpaceDefinition = clientSpaceDefinition(latestSnapshot.content.registry, TOPSIDE_SPACE_ID);
if (initialSpaceDefinition === undefined) throw new Error('topside_space_definition_missing');
let activeSpaceDefinition: SpaceDefinition = initialSpaceDefinition;
let observedSpacePresentationKey = spacePresentationKey(activeSpaceDefinition);
let observedSpaceId = TOPSIDE_SPACE_ID;
let portalTransitionStartedAtMs = -1;
let lastNetworkStatus = '';
let debugCollision = false;
let debugEntitiesHidden = false;
type TerrainInspectorModule = typeof import('@orchard/engine/terrain-inspector');
let terrainInspector: TerrainInspectorModule | null = null;
let terrainInspectorPromise: Promise<TerrainInspectorModule> | null = null;

function loadTerrainInspector(): Promise<TerrainInspectorModule> {
  terrainInspectorPromise ??= import('@orchard/engine/terrain-inspector').then((module) => {
    terrainInspector = module;
    return module;
  });
  return terrainInspectorPromise;
}
const lightingQuality = new LightingQualityState(readLightingQuality(localStorage));
if (lightingQuality.requested === 'dynamic') lightingQuality.fallback(lightingQuality.generation, 'preparing');
let lightingEffectsDisabled = lightingQuality.effective === 'basic';
function setLightingQuality(quality: LightingQuality): void {
  lightingFailure = null;
  if (atlasPresentation.failure !== null) atlasPresentation.reset();
  lightingQuality.request(quality);
  localStorage.setItem(LIGHTING_QUALITY_KEY, quality);
  setToast(`LIGHTING ${quality === 'basic' ? 'BASIC' : lightingModel === 'classic' ? 'CLASSIC' : 'DYNAMIC'}`);
}
const LIGHTING_MODEL_KEY = 'orchard.video.lighting-model';
const storedLightingModel = localStorage.getItem(LIGHTING_MODEL_KEY);
let lightingModel: LightingModel = lightingModelFromStoredValue(storedLightingModel);

function setLightingModel(model: LightingModel): void {
  if (lightingModel !== model) {
    releaseDynamicLighting(); atlasPresentation.reset(); lightingFailure = null; collisionKey = '';
  }
  lightingModel = model;
  localStorage.setItem(LIGHTING_MODEL_KEY, model);
  setToast(`LIGHTING ${model === 'unified' ? 'DYNAMIC' : 'CLASSIC'}`);
}

const CELLAR_ORE_PREVIEW_KEY = 'orchard.developer.cellar-ore-preview';
let cellarOrePreview = localStorage.getItem(CELLAR_ORE_PREVIEW_KEY) === 'true';
let debugTerrainPoint: { readonly worldX: number; readonly worldY: number } | null = null;
let debugTerrainLayerKey = '';
let debugTerrainLayerVisibility: boolean[] = [];
let debugTerrainSelectedLayerIndex: number | null = null;
let debugTerrainThumbnailRects: ReturnType<
  TerrainInspectorModule['terrainInspectionThumbnailRects']
> = [];

function resetTerrainInspectorLayers(): void {
  debugTerrainLayerKey = '';
  debugTerrainLayerVisibility = [];
  debugTerrainSelectedLayerIndex = null;
  debugTerrainThumbnailRects = [];
}

function terrainInspectorPointerDown(x: number, y: number): boolean {
  if (!debugCollision || terrainInspector === null || debugTerrainPoint === null) return false;
  const hit = terrainInspector.terrainInspectionThumbnailHitAt(
    debugTerrainThumbnailRects,
    x,
    y,
  );
  if (hit === null) return false;
  if (hit.target === 'visibility') {
    debugTerrainLayerVisibility[hit.index] = debugTerrainLayerVisibility[hit.index] === false;
  } else {
    debugTerrainSelectedLayerIndex = hit.index;
  }
  return true;
}

function setCollisionDebug(enabled: boolean): void {
  debugCollision = enabled;
  if (enabled) void loadTerrainInspector();
  else {
    debugTerrainPoint = null;
    resetTerrainInspectorLayers();
  }
}
let interfaceHidden = false;
let nameplatesVisible = true;
let nameplatesPreferenceIdentity: string | null = null;
let onlinePlayersVisible = false;
let rosterOpenedByHeldTab = false;
let homesteadBuildMode = false;
const unknownActionKinds = new Set<string>();
const remoteBuffers = new Map<string, RemoteSnapshotBuffer>();
const remoteDisplay = new Map<string, SampledRemote>();
const previousRemoteDisplay = new Map<string, SampledRemote>();
const npcBuffers = new Map<bigint, RemoteSnapshotBuffer>();
const npcDisplay = new Map<bigint, SampledRemote>();
const previousNpcDisplay = new Map<bigint, SampledRemote>();
const projectileBuffers = new Map<bigint, ProjectileSnapshotBuffer>();
const projectileDisplay = new Map<bigint, SampledProjectile>();
const projectileFlightTicks = new Map<bigint, number>();
const projectileHitProgress = new Map<bigint, number>();
interface FloatingCombatText {
  readonly targetKind: 'combat_target' | 'npc';
  readonly targetId: bigint;
  readonly amountCenti: number;
  readonly critical: boolean;
  readonly x: number;
  readonly y: number;
  readonly startedAtMs: number;
}
const floatingCombatTexts: FloatingCombatText[] = [];
const npcHitFeedback = new Map<bigint, number>();
const reducedMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const NPC_HIT_FLASH_MS = 140;
const NPC_HIT_HOP_MS = 240;
let pendingBowProjectile: PendingBowProjectile | null = null;
let nextPendingBowProjectileToken = 1;
const renderTickClock = new RenderTickClock();
const visualTickClock = new VisualTickClock();
const weatherTickClock = new FrameVisualTickClock();
const presentationCorrection = new PresentationCorrection();
const avatarAnimations = new Map<string, AvatarAnimationController>();
const resourceHealth = new Map<bigint, number>();
const resourceYieldProgress = new Map<bigint, number>();
const treeShakeRemaining = new Map<bigint, number>();
// Veins a swing glanced off (wrong pickaxe): sparks, no shake.
const resourceGlanceRemaining = new Map<bigint, number>();
const localActionPresentation = new LocalActionPresentation();
let localActionIdentity: string | null = null;
let latestPositionAuthorityTick = 0n;
let lightPreviewKind: 'lantern' | 'torch' | null = null;
let worldPointer: { readonly x: number; readonly y: number } | null = null;
let bowChargeStartedAtMs: number | null = null;
let bowChargeStartingVigourCenti: number | null = null;
let bowChargeAuthorityPromise: Promise<void> | null = null;
let bowChargePointerId: number | null = null;
const timingHoverIndex = new TimingHoverIndex();
const growthTimingHoverIndex = new GrowthTimingHoverIndex();
let hoveredInteractionTile: { readonly tileX: number; readonly tileY: number } | null = null;
let animatedOpenChestId: bigint | null = null;
let chestAnimationStartedAtMs = 0;
let closingChestId: bigint | null = null;
let latestCameraX = 0;
let latestCameraY = 0;
let latestRenderedZoom = worldZoom;
let selectedEntityTarget: SelectedEntityTarget | null = null;
let latestTargetableEntities: readonly TargetableWorldEntity[] = [];
const resourcePerceptionCache = new ResourcePerceptionCache();
let minimapTerrainCache: {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
} | null = null;
const itemArt = {
  missing: art.missingItem,
  avatar: art.avatar,
  ...art.itemIcons,
};

function ownAppearanceSelection(snapshot: OverworldView): PlayerAppearanceSelection | null {
  const catalog = runtimePlayerAppearanceCatalog(snapshot.content.registry);
  if (catalog === null) return null;
  const row = snapshot.identityHex === null ? undefined : snapshot.appearances.get(snapshot.identityHex);
  return row !== undefined && isPlayerAppearanceSelection(catalog, row) ? row : null;
}

interface WebkitFullscreenDocument extends Document {
  readonly webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void | Promise<void>;
}

interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => void | Promise<void>;
}

interface KeyboardLockNavigator extends Navigator {
  readonly keyboard?: {
    lock(keyCodes?: string[]): Promise<void>;
    unlock(): void;
  };
}

const standaloneWebApp = isStandaloneWebApp();

function documentIsFullscreen(): boolean {
  const fullscreenDocument = document as WebkitFullscreenDocument;
  return document.fullscreenElement !== null || fullscreenDocument.webkitFullscreenElement != null;
}

function browserFullscreenControl(): FullscreenControl {
  const fullscreenDocument = document as WebkitFullscreenDocument;
  const root = document.documentElement as WebkitFullscreenElement;
  const keyboard = (navigator as KeyboardLockNavigator).keyboard;
  const request = document.fullscreenEnabled !== false && root.requestFullscreen !== undefined
    ? () => root.requestFullscreen()
    : root.webkitRequestFullscreen === undefined ? undefined : () => root.webkitRequestFullscreen!();
  const exit = document.exitFullscreen !== undefined
    ? () => document.exitFullscreen()
    : fullscreenDocument.webkitExitFullscreen === undefined
      ? undefined : () => fullscreenDocument.webkitExitFullscreen!();
  return {
    active: documentIsFullscreen(),
    standalone: standaloneWebApp,
    request,
    exit,
    lockEscape: keyboard?.lock === undefined ? undefined : () => keyboard.lock(['Escape']),
    unlock: keyboard?.unlock === undefined ? undefined : () => keyboard.unlock(),
  };
}

const webFullscreenAvailable = fullscreenControlAvailable(browserFullscreenControl());

function toggleFullscreen(): void {
  try {
    const toggle = toggleFullscreenWithEscapeLock(browserFullscreenControl());
    void toggle.then((result) => {
      if (result === 'unavailable') {
        setToast('FULL SCREEN IS NOT AVAILABLE ON THIS DEVICE', 'failure', 120);
      }
    }).catch(setFailureToast);
  } catch (error) {
    setFailureToast(error);
  }
}

const unlockKeyboardAfterFullscreen = (): void => {
  if (!documentIsFullscreen()) (navigator as KeyboardLockNavigator).keyboard?.unlock();
};
document.addEventListener('fullscreenchange', unlockKeyboardAfterFullscreen);
document.addEventListener('webkitfullscreenchange', unlockKeyboardAfterFullscreen);

const outdoorRewardsModel = new OutdoorRewardsModel();
function toggleHomesteadBuildMode(): void {
  if (homesteadBuildMode) {
    homesteadBuildMode = false;
    setToast('BUILD MODE CLOSED', 'info', 90);
  } else if (!canUseHomesteadBuildMode(latestSnapshot)) {
    setToast('BUILD MODE REQUIRES BUILDER ACCESS TO AN ESTATE OR HOME', 'failure', 120);
  } else if (localMount(latestSnapshot) !== null) {
    setToast('DISMOUNT BEFORE BUILDING', 'failure', 120);
  } else {
    homesteadBuildMode = true;
    homesteadBuildPalette.showCatalogue();
    retainedUi.focus('build-palette');
    setToast(activeSpaceDefinition.generator === 'residence'
      ? 'FURNISH — CHOOSE AN ITEM, THEN CLICK FLOOR, WALL OR TABLETOP'
      : 'BUILD MODE — PICK FROM THE PALETTE, THEN CLICK A TILE', 'info', 150);
  }
}

const overworldUi = new OverworldUi(art.uiSkin, art.ui, itemArt, {
  toggleBuild: () => toggleHomesteadBuildMode(),
  selectHotbar: (slot) => selectSlotOptimistically(slot),
  clearTarget: id => { if (selectedEntityTarget && targetKey(selectedEntityTarget) === id) selectedEntityTarget = null; },
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
    setLightingQuality(lightingQuality.requested === 'basic' ? 'dynamic' : 'basic');
  },
  setLightingModel,
  setLightingQuality,
  toggleCellarOrePreview: () => {
    cellarOrePreview = !cellarOrePreview;
    localStorage.setItem(CELLAR_ORE_PREVIEW_KEY, String(cellarOrePreview));
    setToast(`CELLAR ORE VEINS ${cellarOrePreview ? 'SHOWN' : 'HIDDEN'}`);
  },
  setQuestPinned: (questId, pinned) => showResult(
    network.setQuestPinned(questId, pinned), pinned ? 'QUEST TRACKED' : 'QUEST UNTRACKED',
  ),
  travelHearthFerry:(from,to)=>network.travelHearthFerry(from,to),
  claimOutdoorReward: (id) => network.claimOutdoorReward(id),
  abandonQuest: (questId) => showResult(network.abandonQuest(questId), 'QUEST DROPPED'),
  setAppearance: (appearance) => showPredictedInventoryResult(network.setAppearance(appearance), 'APPEARANCE UPDATED'),
  prioritizeEquipmentSkill:(nodeId)=>showResult(network.prioritizeEquipmentSkill(nodeId),'EQUIPMENT SKILL PRIORITY UPDATED'),
  purchaseSkillNode: (nodeId) => showResult(network.purchaseSkillNode(nodeId), 'SKILL RANK LEARNED'),
  resetSkillTree: (track) => showResult(network.resetSkillTree(track), `${track.toUpperCase()} TREE RESET`),
  dismissSkillPointNotice,
  setAudioVolume: (bus, value) => audio.setVolume(bus, value),
  setAudioBackground: (bus, enabled) => audio.setBackgroundPlayback(bus, enabled),
  setNameplatesVisible: (visible) => {
    setNameplatesVisible(visible);
    setToast(visible ? 'NAMEPLATES ON' : 'NAMEPLATES OFF', 'info', 90);
  },
  setTouchControlPreferences: (preferences) => {
    touchControlPreferences = preferences;
    touchControls.setPreferences(preferences);
    writeTouchControlPreferences(localStorage, preferences);
  },
  signOut: () => { location.assign('/?logout=1'); },
  quitToTitle: () => { location.assign('/?menu=1'); },
  startDelve: () => {
    portalTransitionStartedAtMs = performance.now();
    showResult(network.startRogueRun(), 'THE CELLAR SHIFTS BELOW YOU');
  },
  exitDelve: () => showResult(network.abandonRogueRun(), 'DELVE EXITED'),
  toggleFullscreen,
  checkForClientUpdate: () => { void pwaClient.checkForUpdate(); },
  applyClientUpdate: () => pwaClient.applyUpdate(),
  toggleOnlinePlayers: () => setOnlinePlayersVisible(!onlinePlayersVisible),
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
  ghostFillCraftingRecipe: (recipeId) => showResult(
    network.fillCraftingRecipe(recipeId), 'RECIPE PATTERN LOADED',
  ),
  closeCrafting: () => { void network.closeCrafting().catch(() => undefined); },
  closeChest: () => { void network.closeChest().catch(() => undefined); },
  closePlaceable: () => { void (latestSnapshot.hearthStashOpen?network.closeHearthStash():network.closePlaceable()).catch(() => undefined); },
  frameAction: (actionId) => showResult(network.frameAction(actionId), null),
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
  const legacyMinimap = (): TerrainArray => terrainForSpace(
    activeSpaceDefinition,
    seed,
    version,
    snapshot.content.registry,
  );
  // Off/shadow: the raw generator as before; chunk mode `on`: the authored window (S4c).
  const minimap = activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    ? worldSource.minimapTerrain(legacyMinimap, snapshot.content.registry)
    : { terrain: legacyMinimap(), key: '' };
  const terrain = minimap.terrain;
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
    ...(minimap.key === '' ? [] : [minimap.key]),
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
  const perception = resourcePerceptionForSnapshot(snapshot);
  for (const ore of perception.minimapOre) {
    marker(ore.tileX * 16 + 8, ore.tileY * 16 + 8,
      ore.identified ? (CELLAR_ORE_PREVIEW_COLORS[ore.oreKind] ?? '#969696aa').slice(0, 7) : '#969696', 2);
  }
  for (const pool of perception.fishingPools) {
    marker(pool.tileX * 16 + 8, pool.tileY * 16 + 8, '#64b7e8', 3);
  }
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
const homesteadBuildPalette = new HomesteadBuildPalette(kitArt, itemArt, drainBuildPaletteActions,
  () => { if (homesteadBuildMode) toggleHomesteadBuildMode(); });
function drainBuildPaletteActions(): void {
  if (homesteadBuildPalette.takeConstructionApply()) applyConstructionProposal();
  if (homesteadBuildPalette.takeConstructionCancel()) constructionProposal = null;
  const expansion = homesteadBuildPalette.takeExpansionRequest();
  if (expansion !== null) showResult(network.purchaseResidenceExpansion(expansion.rank).catch(error => {
    homesteadBuildPalette.expansionFailed(expansion.scope, expansion.rank, expansion.token); throw error;
  }), 'ROOM EXPANSION PURCHASED');
  const upgrade = homesteadBuildPalette.takePurchaseRequest();
  furnitureMoves.cancel();
  if (homesteadBuildPalette.takeUndoMoveRequest()) showResult(furnitureMoves.undo(), 'FURNITURE MOVE UNDONE');
  if (upgrade !== null) showResult(network.purchaseHomesteadUpgrade(upgrade),
    `${upgrade.replaceAll('_', ' ').toUpperCase()} UPGRADED`);
}
let homesteadPaletteRegistry: OverworldView['content']['registry'] | null = null;
let homesteadPaletteEntries: HomesteadBuildPaletteModel['entries'] = [];
let furnishingPaletteEntries: HomesteadBuildPaletteModel['entries'] = [];
let homesteadPaletteUpgrades: HomesteadBuildPaletteModel['upgrades'] = [];

function homesteadUpgradeRank(
  snapshot: Pick<OverworldView, 'homesteadUpgrades' | 'activeFarmUpgrades' | 'content'>,
  mechanic: HomesteadUpgradeMechanic,
): number {
  return runtimeHomesteadUpgradeRank(
    snapshot.content.registry, [...(snapshot.activeFarmUpgrades ?? snapshot.homesteadUpgrades)], mechanic,
  );
}

let estateSkillCache: {
  registry: OverworldView['content']['registry'];
  rows: readonly { readonly nodeId: string; readonly rank: number }[];
  skills: ReturnType<typeof farmingSkillEffects>;
} | undefined;
function estateFarmingSkills(snapshot: Pick<OverworldView, 'content' | 'activeFarmSkillNodes'>) {
  const rows = [...(snapshot.activeFarmSkillNodes ?? [])];
  if (estateSkillCache?.registry === snapshot.content.registry
    && rows.length === estateSkillCache.rows.length
    && rows.every((row, index) => row === estateSkillCache!.rows[index])) return estateSkillCache.skills;
  const skills = farmingSkillEffects(snapshot.content.registry,
    Object.fromEntries(rows.map(row => [row.nodeId, row.rank])));
  estateSkillCache = { registry: snapshot.content.registry, rows, skills };
  return skills;
}

function cropDefinitionForSnapshot(
  snapshot: Pick<OverworldView, 'homesteadUpgrades' | 'activeFarmUpgrades' | 'content' | 'activeFarmSkillNodes'>,
  cropKind: string,
) {
  const definition = runtimeCropDefinition(snapshot.content.registry, cropKind);
  if (definition === null) return null;
  const rank = homesteadUpgradeRank(snapshot, 'soil');
  return farmingCropDefinition(rank === 0 ? definition : {
    ...definition,
    growthTicks: richSoilGrowthTicks(definition.growthTicks, rank),
  }, estateFarmingSkills(snapshot));
}

function cropAutomaticallyWateredForSnapshot(
  snapshot: Pick<OverworldView, 'placeables' | 'content'>,
  spaceId: number,
  tileX: number,
  tileY: number,
): boolean {
  return [...snapshot.placeables].some((placeable) => placeable.spaceId === spaceId
    && placeable.carriedBy === undefined
    && runtimeObjectIrrigatesTile(snapshot.content.registry, placeable, tileX, tileY));
}

function cropGreenhouseProtectedForSnapshot(
  snapshot: Pick<OverworldView, 'homesteads' | 'placeables' | 'content'>,
  spaceId: number,
): boolean {
  return snapshot.homesteads.get(spaceId) !== undefined
    && [...snapshot.placeables].some((placeable) => placeable.spaceId === spaceId
      && runtimeObjectProtectsCropSeasons(snapshot.content.registry, placeable)
      && placeable.carriedBy === undefined);
}

const npcInteractionUi = new NpcInteractionUi(kitArt, itemArt, {
  unlockHearthLegendaryRecipe: offer => network.unlockHearthLegendaryRecipe(offer.recipeId, offer.expectedContentHash, offer.expectedSeals),
  fulfillVillageOrder:offer=>network.fulfillVillageOrder(offer.id,offer.revision,offer.contentHash,offer.totalBronze),
  chooseDialogueOption: (choiceId) => showResult(network.chooseDialogueOption(choiceId), 'DIALOGUE UPDATED'),
  closeDialogue: () => { void network.closeNpcDialogue().catch(() => undefined); },
  buy: (lines) => showMerchantResult(network.buyMerchantCart(lines), 'PURCHASE COMPLETE'),
  sell: (lines) => showMerchantResult(network.sellMerchantCart(lines), 'SALE COMPLETE'),
}, (context, npcId, rect) => {
  const npc = latestSnapshot.npcs.get(npcId);
  if (npc === undefined) return;
  const profile = latestSnapshot.wildlifeProfiles.get(npcId);
  drawNpcPortrait(context, art, {
    npcKind: npc.kind,
    ...(profile === undefined ? {} : { species: profile.species }),
    variant: profile?.variant ?? 0,
  }, rect);
});
const tradeUi = new TradeUi(kitArt, itemArt, {
  acceptRequest: (tradeId) => showResult(network.acceptTradeRequest(tradeId), 'TRADE OPENED'),
  declineRequest: (tradeId) => showResult(network.declineTrade(tradeId), 'TRADE DECLINED'),
  cancel: (tradeId) => showResult(network.cancelTrade(tradeId), 'TRADE CANCELLED'),
  offerItem: (tradeId, inventorySlot, tradeSlot, quantity) => showResult(
    network.setTradeOfferItem(tradeId, inventorySlot, tradeSlot, quantity), 'OFFER UPDATED',
  ),
  removeItem: (tradeId, tradeSlot) => showResult(
    network.removeTradeOfferItem(tradeId, tradeSlot), 'ITEM REMOVED FROM OFFER',
  ),
  offerBronze: (tradeId, amount) => showResult(
    network.setTradeOfferBronze(tradeId, amount), 'MONEY OFFER UPDATED',
  ),
  setAccepted: (tradeId, accepted, revision) => showResult(
    network.setTradeAccepted(tradeId, accepted, revision), accepted ? 'TRADE ACCEPTED' : 'ACCEPTANCE CLEARED',
  ),
});
const questTracker = new QuestTracker(
  kitArt,
  (questId) => { overworldUi.openQuest(questId); },
);

const onlineRoster = new GameOnlinePlayers(kitArt, {
  onManage: manageOnlinePlayer,
  onClose: () => setOnlinePlayersVisible(false),
  // The roster's whisper glyph closes it and opens chat with the whisper command for that name.
  onWhisper: name => { setOnlinePlayersVisible(false); openRetainedChatWith(`/w ${name} `); },
});
overworldUi.enableRetainedFeedback();
const gameFeedback = new GameFeedback(kitArt, {
  onOpenSkillNotice: expected => activateFeedbackNotice(expected, true),
  onDismissSkillNotice: expected => activateFeedbackNotice(expected, false),
});
let feedbackNoticeValue: SkillPointNotice | null = null;
let feedbackNoticeRevision = 0;
function currentSkillNoticeId(): string {
  if (feedbackNoticeValue !== skillPointNotice) { feedbackNoticeValue = skillPointNotice; feedbackNoticeRevision++; }
  return String(feedbackNoticeRevision);
}
function feedbackSessionKey(): string {
  return `${latestSnapshot.identityHex}:${network.sessionGeneration}:${latestSnapshot.connected}:${activeSpaceDefinition.spaceId}:${latestSnapshot.rogueRun?.id ?? ''}`;
}
function feedbackNoticeAvailable(): boolean {
  return retainedUiAvailable() && overworldUi.openWindow === null && !chatOverlay.isOpen && !onlinePlayersVisible
    && !characterNamePrompt.isActive && !npcInteractionUi.active && !tradeUi.active;
}
function feedbackHudProjection(now: number, height: number): Omit<GameFeedbackModel['hud'], 'notice'> {
  const hud = overworldUi.feedbackHud(now);
  // At the smallest logical bounds, keep the actionable notice and rejection
  // message readable. The passive interaction prompt returns with the space.
  return { ...hud, prompt: height < 160 && skillPointNotice !== null && feedbackNoticeAvailable() ? null : hud.prompt };
}
function activateFeedbackNotice(expected: GameSkillNoticeScope, open: boolean): void {
  const notice = skillPointNotice;
  if (!feedbackNoticeAvailable() || notice === null || expected.sessionKey !== feedbackSessionKey()
    || expected.noticeId !== currentSkillNoticeId() || expected.track !== notice.track || expected.points !== notice.points) return;
  if (open) overworldUi.openSkillTrack(notice.track);
  dismissSkillPointNotice();
}
function onlinePlayersScope(): string {
  return `${latestSnapshot.identityHex}:${network.sessionGeneration}:${activeSpaceDefinition.spaceId}`;
}
function canManageOnlinePlayers(): boolean {
  return latestSnapshot.connected && latestSnapshot.identityHex !== null
    && latestSnapshot.homesteads.get(activeSpaceDefinition.spaceId)?.owner.toHexString() === latestSnapshot.identityHex;
}
function updateOnlinePlayers(): void {
  const [width, height] = touchControlViewport();
  const frameWidth = Math.min(400, Math.max(0, width - 8));
  const frameHeight = Math.min(330, Math.max(0, height - 8));
  onlineRoster.setBounds({ x: Math.round((width-frameWidth)/2), y: Math.round((height-frameHeight)/2), width: frameWidth, height: frameHeight }, width, height);
  onlineRoster.update({ scopeKey: onlinePlayersScope(), identityHex: latestSnapshot.identityHex,
    visible: onlinePlayersVisible && retainedUiAvailable() && !characterNamePrompt.isActive && !npcInteractionUi.active && !tradeUi.active,
    canManage: canManageOnlinePlayers(), players: onlinePlayerEntries(latestSnapshot) });
}
function setOnlinePlayersVisible(visible: boolean, heldTab = false): void {
  onlinePlayersVisible = visible;
  rosterOpenedByHeldTab = visible && heldTab;
  updateOnlinePlayers(); retainedUi.reconcile(); syncRetainedText();
}
function releaseOnlinePlayersTab(): boolean {
  if (!rosterOpenedByHeldTab) return false;
  setOnlinePlayersVisible(false); return true;
}
function manageOnlinePlayer(request: OnlinePlayerManagementRequest): void {
  if (!onlinePlayersVisible || !retainedUiAvailable() || characterNamePrompt.isActive || npcInteractionUi.active || tradeUi.active || !canManageOnlinePlayers()
    || request.scopeKey !== onlinePlayersScope() || request.expectedIdentityHex === latestSnapshot.identityHex) return;
  const profile = latestSnapshot.profiles.get(request.expectedIdentityHex);
  if (profile === undefined || !profile.online) return;
  const member = [...latestSnapshot.homesteadMembers].find(row => row.guest.toHexString() === request.expectedIdentityHex);
  const currentRole = member !== undefined && isHomesteadMemberRole(member.role) ? member.role : null;
  if (currentRole !== request.expectedRole) return;
  const kick = request.intent === 'remove';
  const role = kick ? null : nextHomesteadMemberRole(currentRole);
  if (role === null) showResult(network.removeHomesteadMember(profile.identity, kick),
    kick ? 'HOMESTEAD MEMBER REMOVED AND KICKED' : 'HOMESTEAD MEMBER REMOVED');
  else showResult(network.setHomesteadMemberRole(profile.identity, role), `HOMESTEAD ROLE: ${role.toUpperCase()}`);
}

function retainedUiAvailable(): boolean {
  return !interfaceHidden && worldClientReady() && !overworldUi.blockingUpdatePromptVisible
    && latestSnapshot.rogueRun?.phase !== 'reward';
}
retainedUi.register({ id: 'character-name', priority: 1000, root: characterNamePrompt.root,
  active: () => retainedUiAvailable() && characterNamePrompt.isActive, blocking: () => true });
const overlayRoots = overworldUi.enableRetainedOverlays(kitArt);
const delveRewards = new DelveRewardsUi(kitArt, {
  choose: slot => showPredictedInventoryResult(network.chooseRogueReward(slot),
    latestSnapshot.rogueRun ? rogueRewardClaimedMessage(latestSnapshot.rogueRun) : 'BOON CHOSEN'),
  leaveShop: () => showPredictedInventoryResult(network.skipRogueReward(), 'THE TRADER FADES INTO THE DARK'),
});
retainedUi.register({ id: 'update-ready', priority: 1200, root: overlayRoots.update,
  active: () => !interfaceHidden && overworldUi.blockingUpdatePromptVisible, blocking: () => true });
retainedUi.register({ id: 'delve-rewards', priority: 1100, root: delveRewards.rewardsRoot,
  active: () => !interfaceHidden && worldClientReady() && !overworldUi.blockingUpdatePromptVisible && delveRewards.active,
  blocking: () => true });
retainedUi.register({ id: 'delve-confirmation', priority: 700, root: overlayRoots.confirmation,
  active: () => retainedUiAvailable() && overworldUi.retainedConfirmationActive
    && !npcInteractionUi.active && !tradeUi.active && !onlinePlayersVisible, blocking: () => true });
const hudRoots = overworldUi.enableRetainedHud(kitArt, surface => { retainedUi.focus(`hud-${surface}`); });
for (const surface of ['zoneMinimap', 'hotbarVitals', 'targetEffects'] as const) retainedUi.register({
  id: `hud-${surface}`, root: hudRoots[surface], priority: 50,
  active: () => retainedUiAvailable() && overworldUi.retainedHudVisible(surface) && overworldUi.openWindow === null
    && !characterNamePrompt.isActive && !npcInteractionUi.active && !tradeUi.active && !onlinePlayersVisible && !chatOverlay.isOpen,
  blocking: () => false,
});
const inventoryMenuRoot = overworldUi.enableRetainedInventory(kitArt);
const readingRoots = overworldUi.enableRetainedReading(kitArt);
const characterRoots = overworldUi.enableRetainedCharacter(kitArt);
for (const window of ['character', 'statistics', 'skills'] as const) retainedUi.register({ id: `character-${window}`, priority: 500,
  root: characterRoots[window], active: () => retainedUiAvailable() && overworldUi.openWindow === window && overworldUi.retainedCharacterActive
    && !tradeUi.active && !npcInteractionUi.active && !onlinePlayersVisible, blocking: () => true });
const systemMenuRoot = overworldUi.enableRetainedSystem(kitArt);
retainedUi.register({ id: 'system-menus', priority: 500, root: systemMenuRoot,
  active: () => retainedUiAvailable() && overworldUi.retainedSystemActive
    && !tradeUi.active && !npcInteractionUi.active && !onlinePlayersVisible, blocking: () => true });
retainedUi.register({ id: 'inventory-menus', priority: 500, root: inventoryMenuRoot,
  active: () => retainedUiAvailable() && overworldUi.retainedInventoryActive
    && !tradeUi.active && !npcInteractionUi.active && !onlinePlayersVisible,
  blocking: () => true });
for (const window of ['quests', 'help'] as const) retainedUi.register({ id: `reading-${window}`, priority: 500,
  root: readingRoots[window], active: () => retainedUiAvailable() && overworldUi.openWindow === window
    && !tradeUi.active && !npcInteractionUi.active && !onlinePlayersVisible, blocking: () => true });
retainedUi.register({ id: 'npc-interaction', priority: 800, root: npcInteractionUi.root,
  active: () => retainedUiAvailable() && npcInteractionUi.active && !tradeUi.active, blocking: () => true });
retainedUi.register({ id: 'player-trade', priority: 900, root: tradeUi.root,
  active: () => retainedUiAvailable() && tradeUi.active, blocking: () => true });
retainedUi.register({ id: 'online-players', priority: 750, root: onlineRoster.root,
  active: () => retainedUiAvailable() && onlineRoster.active && !characterNamePrompt.isActive && !tradeUi.active && !npcInteractionUi.active,
  blocking: () => true });
retainedUi.register({ id: 'build-palette', priority: 200, root: homesteadBuildPalette.root,
  active: () => retainedUiAvailable() && homesteadBuildMode && overworldUi.openWindow === null
    && !tradeUi.active && !npcInteractionUi.active && !onlinePlayersVisible, blocking: () => false });
retainedUi.register({ id: 'quest-tracker', priority: 100, root: questTracker.root,
  active: () => retainedUiAvailable() && questTracker.isActive && overworldUi.questTrackerVisible && !characterNamePrompt.isActive
    && !tradeUi.active && !npcInteractionUi.active && !onlinePlayersVisible && overworldUi.openWindow === null,
  blocking: () => false });
retainedUi.register({ id: 'feedback-notice', priority: 175, root: gameFeedback.roots.notice,
  active: () => feedbackNoticeAvailable() && gameFeedback.noticeActive, blocking: () => false });
retainedUi.register({ id: 'touch-controls', priority: 25, root: touchControls.root,
  active: () => touchControls.visible && !touchControlsBlocked(), blocking: () => false });
retainedUi.register({ id: 'chat', priority: 150, root: chatOverlay.root,
  active: () => retainedUiAvailable() && chatOverlay.active && !chatInteractionBlocked(), blocking: () => false });
const retainedText = new UiTextBridge(canvas, () => retainedUi.focusedElement,
  event => retainedUi.key(event), element => retainedUiClientRect(element.rect, canvas.getBoundingClientRect(),
    { width: renderer.cssWidth, height: renderer.cssHeight }, safeAreaInsets, currentUiScale()), () => {});
let nativeChatOwner = false;
function handleRetainedTextBlur(): void {
  if (nativeChatOwner && !retainedPointers.hasCapture) chatOverlay.blurInput();
  nativeChatOwner = false;
}
retainedText.input.addEventListener('blur', handleRetainedTextBlur);
function syncRetainedText(): void {
  // Both event and frame synchronization obey the Safari capture boundary.
  if (retainedPointers.hasCapture) return;
  retainedText.sync();
  nativeChatOwner = retainedUi.focusedElement?.props['editor'] === chatOverlay.editor;
}
function openRetainedChat(event: Pick<KeyboardEvent, 'key' | 'repeat'> & Partial<Pick<KeyboardEvent, 'isComposing' | 'ctrlKey' | 'metaKey' | 'altKey'>>): boolean {
  if (chatInteractionBlocked() || !chatOverlay.handleGlobalKeyDown(event)) return false;
  retainedUi.focus('chat'); syncRetainedText(); return true;
}
function openRetainedChatWith(initialValue: string): void {
  if (chatInteractionBlocked() || !chatOverlay.active) return;
  chatOverlay.open(initialValue); retainedUi.focus('chat'); syncRetainedText();
}
// Install before recovery and legacy capture listeners so cancelled tails cannot
// become a new command on whichever modal appeared during the gesture.
const retainedPointers = new RetainedUiPointers(canvas, window, retainedUi, event => {
  const [x, y] = pointerUiPosition(event); return { x, y };
}, syncRetainedText, event => {
  const [x, y] = pointerUiPosition(event);
  overworldUi.systemCursorMove({ x, y });
});
import.meta.hot?.dispose(() => {
  disposeInitialWorldLoading(renderer); gameFeedback.dispose(); touchControls.dispose(); onlineRoster.dispose(); overworldUi.disposeRetainedHud(); delveRewards.dispose(); overworldUi.disposeRetainedOverlays();
  retainedText.input.removeEventListener('blur', handleRetainedTextBlur);
  retainedPointers.dispose(); retainedText.dispose(); retainedUi.dispose(); chatOverlay.dispose();
  npcInteractionUi.dispose(); characterNamePrompt.dispose(); questTracker.dispose(); tradeUi.dispose(); homesteadBuildPalette.dispose(); overworldUi.disposeRetainedInventory(); overworldUi.disposeRetainedReading(); overworldUi.disposeRetainedCharacter(); overworldUi.disposeRetainedSystem();
});

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
    const definition = runtimeQuestDefinition(snapshot.content.registry, row.questId);
    if (definition === null) return [];
    const baselines = Object.fromEntries([...snapshot.questBaselines]
      .filter((baseline) => baseline.questId === row.questId)
      .map((baseline) => [baseline.objectiveId, baseline.value]));
    const currentSource={...source,equipmentCount:(category:'weapon'|'body')=>{
      const objective=definition.objectives.find(item=>item.kind==='equipment'&&item.category===category);
      const row=[...snapshot.questBaselines].find(item=>item.questId===definition.id&&item.objectiveId===objective?.id);
      return Number(row?.currentValue??0n);
    },furnishingCount:(category:import('@orchard/sim').HearthFurnishingCategory)=>{
      const objective=definition.objectives.find(item=>item.kind==='furnishing'&&item.category===category);
      const row=[...snapshot.questBaselines].find(item=>item.questId===definition.id&&item.objectiveId===objective?.id);
      return Number(row?.currentValue??0n);
    }};
    const objectives = definition.objectives.map((objective) => {
      const progress = questObjectiveProgress(definition, objective, baselines[objective.id] ?? 0n, currentSource);
      const progressLabel = progress.components.length === 1
        ? `${progress.components[0]!.current}/${progress.components[0]!.target}`
        : progress.components.map((component) => {
        const name = liveItemDefinition(snapshot, component.label)?.displayName ?? component.label.replaceAll('_', ' ');
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
        const name = liveItemDefinition(snapshot, reward.itemKind)?.displayName ?? reward.itemKind.replaceAll('_', ' ');
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

/** A quest-authored private resource is derived from private progress rather
 * than a public world_resource row, so other clients never see or target it. */
function personalQuestResource(snapshot: OverworldView): WorldResource | null {
  for (const quest of snapshot.quests) {
    if (quest.state !== 'active') continue;
    const content = snapshot.content.registry.quests.get(`quest:${quest.questId}`);
    if (content === undefined || content.retired === true) continue;
    const definition = questDefinitionFromContent(snapshot.content.registry, content);
    const authored = definition.world?.personalResource;
    if (authored === undefined) continue;
    const objective = definition.objectives.find(({ id }) => id === authored.objectiveId);
    if (objective?.kind !== 'statistic') continue;
    const resourceDefinition = runtimeResourceDefinition(
      snapshot.content.registry, authored.resourceKind,
    );
    if (resourceDefinition === null) continue;
    const baseline = [...snapshot.questBaselines].find((row) => (
      row.questId === quest.questId && row.objectiveId === objective.id
    ))?.value ?? 0n;
    const lifetime = [...snapshot.playerStatistics].find((row) => (
      row.statisticKind === objective.statisticKind && row.subjectKind === objective.subjectKind
    ))?.value ?? 0n;
    const progressed = lifetime > baseline ? lifetime - baseline : 0n;
    const remainingBig = objective.count > progressed ? objective.count - progressed : 0n;
    const remaining = Number(remainingBig);
    if (remaining <= 0) continue;
    return {
      id: authored.resourceId,
      kind: authored.resourceKind,
      tileX: authored.tileX,
      tileY: authored.tileY,
      chunkX: Math.floor(authored.tileX / 16),
      chunkY: Math.floor(authored.tileY / 16),
      health: remaining,
      depleted: false,
      spaceId: authored.spaceId,
      growthStage: 3,
      regrowthProgress: 24,
      miningClass: '',
      richness: remaining,
      maximumRichness: Number(objective.count),
      yieldProgress: 0,
      yieldsProduced: Number(objective.count) - remaining,
      producedOre: false,
      spawnSiteId: 0n,
      activationOrdinal: 0,
      respawnAtTick: 0n,
      miningClaimedBy: undefined,
      miningPartyId: undefined,
      miningClaimUntilTick: 0n,
      definitionId: resourceDefinition.id,
      fruitReadyAtTick: 0n,
    };
  }
  return null;
}

function worldResourcesIncludingPersonalQuest(snapshot: OverworldView): readonly WorldResource[] {
  const personal = personalQuestResource(snapshot);
  return personal === null ? [...snapshot.resources] : [...snapshot.resources, personal];
}

function questMarkerForNpc(snapshot: OverworldView, npcId: bigint): 'offer' | 'complete' | null {
  const definitions = [...snapshot.content.registry.quests.values()]
    .filter((definition) => definition.retired !== true)
    .map((definition) => questDefinitionFromContent(snapshot.content.registry, definition))
    .filter((definition) => definition.giverNpcId === npcId);
  for (const definition of definitions) {
    if ([...snapshot.quests].some((row) => row.questId === definition.id && row.state === 'complete')) return 'complete';
  }
  for (const definition of definitions) {
    const missing = ![...snapshot.quests].some((row) => row.questId === definition.id);
    const prerequisitesMet = definition.prerequisiteQuestIds?.every((questId) => (
      [...snapshot.quests].some((row) => row.questId === questId && row.state === 'turned_in')
    )) !== false;
    if (missing && prerequisitesMet) return 'offer';
  }
  return null;
}

function worldCalendarTick(): bigint {
  return calendarTickForSnapshot(latestSnapshot);
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

function setNameplatesVisible(visible: boolean): void {
  nameplatesVisible = visible;
  try {
    if (nameplatesPreferenceIdentity !== null) {
      writePlayerNameplates(nameplatesPreferenceIdentity, visible, localStorage);
    }
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory toggle still works.
  }
}

function resize(): void {
  renderer.resize();
  safeAreaInsets = canvasSafeAreaInsets(canvas);
  const minimum = renderer.minimumZoom(activeSpaceDefinition.sizeTiles * 16);
  worldZoomTarget = Math.max(minimum, Math.min(MAX_WORLD_ZOOM, worldZoomTarget));
  worldZoom = Math.max(minimum, Math.min(MAX_WORLD_ZOOM, worldZoom));
}

function hudViewportCss(): { readonly width: number; readonly height: number } {
  return insetCanvasViewport(renderer.cssWidth, renderer.cssHeight, {
    ...safeAreaInsets,
    // Bottom-anchored game HUD belongs on the Canvas edge. The home indicator
    // remains an OS overlay instead of introducing a visible hotbar gutter.
    bottom: 0,
  });
}

function currentUiScale(): number {
  const viewport = hudViewportCss();
  return fittedUiScale(desiredUiScale, viewport.width, viewport.height);
}

function softwareKeyboardInset(uiScale: number): number {
  if (!chatOverlay.isOpen || window.visualViewport === null) return 0;
  const visualBottom = window.visualViewport.offsetTop + window.visualViewport.height;
  const obscuredCssPixels = Math.max(0, window.innerHeight - visualBottom);
  // Small differences are browser chrome, not the software keyboard.
  return obscuredCssPixels < 80 ? 0 : obscuredCssPixels / uiScale;
}

const defenseHoldInput=new DefenseHoldInput(
  (action,aim)=>network.combatDefense(action,aim.x,aim.y),
  error=>setToast(error instanceof Error ? error.message : String(error),'failure'),
);
function defenseAim(): {x: number; y: number} {
  const direction = directionFromKeys();
  const facing = direction === 'idle' ? predicted?.facing ?? 'down' : direction;
  return {x: /left/i.test(facing) ? -1 : /right/i.test(facing) ? 1 : 0,
    y: /up/i.test(facing) ? -1 : /down/i.test(facing) ? 1 : 0};
}
function defenseInputAvailable(): boolean {
  return worldTouchActionAvailable() && !document.hidden && !interfaceHidden && !homesteadBuildMode
    && !overworldUi.blockingUpdatePromptVisible && latestSnapshot.tradeSession === null
    && !characterNamePrompt.isActive && !npcInteractionUi.active;
}
function releaseDefenseHold(): void { defenseHoldInput.release(); }
function updateDefenseHold(): void {
  defenseHoldInput.update(defenseInputAvailable() && (keys.has('KeyX') || touchControls.blockHeld),defenseAim(),performance.now());
}

function directionFromKeys(): NetworkDirection {
  if (overworldUi.openWindow !== null || overworldUi.blockingUpdatePromptVisible
    || characterNamePrompt.isActive || npcInteractionUi.active) return 'idle';
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


const topsideDecorationCache = new WeakMap<
  MapDocumentV3,
  Map<number, readonly RuntimeSurvivalDecoration[]>
>();

function activeTopsideLandmarks(snapshot: OverworldView) {
  return activeSurvivalLandmarks(snapshot.content.registry, TOPSIDE_SPACE_ID);
}

const musicCombat = new CombatMusicSignal();
const MUSIC_COMBAT_RADIUS_FIXED = 6 * TILE_SIZE_FIXED;
let musicStruckEnemy = false;
let musicBiomeTile = '';
let musicBiome: string | null = null;

/** Feed the music director: zone, biome underfoot, rain and combat (wiki: Systems/Audio & Music, Music director). */
function updateMusicContext(snapshot: OverworldView, raining: boolean): void {
  const player = predicted?.position ?? null;
  let biome: string | null = null;
  if (player !== null && activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID) {
    const tileX = Math.floor(player.x / TILE_SIZE_FIXED), tileY = Math.floor(player.y / TILE_SIZE_FIXED);
    const key = `${tileX}:${tileY}`;
    if (key !== musicBiomeTile) {
      musicBiomeTile = key;
      const document = liveIslandDocumentFor(snapshot);
      musicBiome = document === null
        ? survivalBiomeAt(snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED, tileX, tileY)
        : resolvedMapBiomeAt(document, tileX, tileY);
    }
    biome = musicBiome;
  }
  function* enemies() {
    for (const npc of snapshot.npcs) {
      if ((snapshot.rogueEnemyProfiles.get(npc.id) ?? snapshot.outdoorEnemyProfiles?.get(npc.id)) !== undefined) yield npc;
    }
  }
  const combat = musicCombat.observe({
    nowMs: performance.now(),
    hostileNearby: player !== null && hostileWithin(enemies(), player, activeSpaceDefinition.spaceId, MUSIC_COMBAT_RADIUS_FIXED),
    struckEnemy: musicStruckEnemy,
  });
  musicStruckEnemy = false;
  audio.setMusicContext(worldMusicContext({ space: activeSpaceDefinition, biome, raining, combat }));
}

function liveIslandDocumentFor(snapshot: OverworldView): MapDocumentV3 | null {
  return liveIslandDocument(snapshot.liveMapDocument, snapshot.content.registry);
}

function topsideDecorations(
  snapshot: OverworldView,
  seed: number,
): readonly RuntimeSurvivalDecoration[] {
  const document = liveIslandDocumentFor(snapshot);
  if (document === null) return Object.freeze([
    ...generateSurvivalProceduralDecorations(seed, snapshot.content.registry),
    ...generateSurvivalLandmarkDecorations(activeTopsideLandmarks(snapshot)),
  ]);
  const bySeed = topsideDecorationCache.get(document) ?? new Map();
  const cached = bySeed.get(seed);
  if (cached !== undefined) return cached;
  const decorations = Object.freeze([
    ...generateSurvivalProceduralDecorations(seed, snapshot.content.registry),
    ...document.landmarks
      .filter((landmark) => landmark.enabled)
      .map((landmark) => ({ ...mapLandmarkDecoration(landmark), landmark })),
  ]);
  bySeed.set(seed, decorations);
  topsideDecorationCache.set(document, bySeed);
  return decorations;
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
    tie: string | undefined,
    painterFootY = worldY,
    shadowMode: 'column' | 'silhouette' | 'none' = 'silhouette',
    occludesLocalLight = true,
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
      shadowMode,
      occludesLocalLight,
      elevationLayer,
      ...(tie === undefined ? {} : {
        painterOrder: lightCasterPainterOrder(terrain, worldX, worldY, painterFootY, tie),
      }),
    });
  };
  if (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID) {
    const liveDocument = liveIslandDocumentFor(snapshot);
    const suppressions = new Set(liveDocument?.generatedSuppressions ?? []);
    const landmarkCampfires=new Set(runtimeLandmarkCampfirePlans(snapshot.content.registry)
      .filter(plan=>plan.spaceId===activeSpaceDefinition.spaceId).map(plan=>plan.runtimeId));
    for (const decoration of topsideDecorations(snapshot, seed)) {
      if (suppressions.has(`decoration-${decoration.id}`)) continue;
      if(landmarkCampfires.has(BigInt(decoration.id)))continue;
      if (!survivalDecorationBlocksTraversal(
        decoration.kind, 'ground', snapshot.content.registry,
      )) continue;
      // A pond reserves traversal space, but is below the light plane. Collision
      // is not optical height: water and other floor-level art cast no shadow.
      if (decoration.kind === 'camp_pond') continue;
      // The emitter is the luminous body: do not let its own alpha silhouette
      // terminate its seed. Non-emissive solid props remain occluders.
      if (isLightEmitterKind(decoration.kind)) continue;
      add(
        art.poiDecorations[decoration.kind],
        'base',
        decoration.tileX * 16 + 8,
        (decoration.tileY + 1) * 16,
        survivalDecorationObstacle(decoration, 'ground', snapshot.content.registry),
        decoration.landmark === undefined ? `decoration:${decoration.id}`
          : liveDocument === null ? `landmark:${decoration.landmark.id}`
            : authoredMapContentPainterTie(
                liveDocument, decoration.landmark.layer, 'landmark', decoration.landmark.id,
              ),
        overworldPoiDecorationDepthY(decoration.kind, (decoration.tileY + 1) * 16),
      );
    }
  }
  for (const resource of snapshot.resources) {
    if (liveMapSuppressesGeneratedResource(snapshot, resource.id)) continue;
    if (resource.depleted) continue;
    const definition = runtimeResourceDefinition(snapshot.content.registry, resource);
    if (definition === null || definition.visual.kind === 'tree') continue;
    const asset = authoredResourceVisual(
      art, definition.visual, 'mature',
      miningClassFromWire(resource.miningClass, resource.spaceId), resource.richness,
    )?.asset;
    const obstacle = runtimeResourceObstacle(snapshot.content.registry, resource, resource.tileX, resource.tileY);
    if (obstacle === null) continue;
    add(
      asset, 'base', resource.tileX * 16 + 8, (resource.tileY + 1) * 16,
      obstacle,
      `resource:${resource.id}`,
    );
  }
  for (const chest of snapshot.chests) {
    if (chest.carriedBy !== undefined) continue;
    add(
      art.chest, 'chest', chest.tileX * 16 + 8, (chest.tileY + 1) * 16,
      tileLightObstacle(chest.tileX, chest.tileY),
      `chest:${chest.id}`,
    );
  }
  for (const placeable of snapshot.placeables) {
    if (placeable.carriedBy !== undefined) continue;
    const presentation = objectPresentations.resolve(snapshot.content, placeable);
    const definition = runtimePlaceableDefinition(snapshot.content.registry, placeable);
    const blocksMovement = presentation.collision?.blocksMovement
      ?? (definition?.blocksMovement === true);
    const occludesLight = presentation.collision?.occludesLight ?? blocksMovement;
    if (presentation.lightingAuthored === true) {
      if (!occludesLight && presentation.appearance?.lighting.castsShadow === 'none') continue;
    } else if (!occludesLight || presentation.light?.enabled === true
      || (!presentation.authored && isLightEmitterKind(placeable.kind))) continue;
    const authoredSprite = presentation.authored ? presentation.sprite : null;
    add(
      authoredSprite?.asset ?? art.itemIcons[placeable.kind],
      authoredSprite?.animation ?? liveItemDefinition(snapshot, placeable.kind)?.iconAnimation ?? 'base',
      placeable.tileX * 16 + 8,
      (placeable.tileY + 1) * 16,
      tileLightObstacle(placeable.tileX, placeable.tileY),
      // Furniture groups use a separate contact anchor and parent draw tie;
      // keep their legacy ordering until their receiver collector is migrated.
      hearthFurnitureShapeForPlaceable(snapshot.content.registry, placeable) === null
        ? `placeable:${placeable.id}` : undefined,
      (placeable.tileY + 1) * 16,
      presentation.appearance?.lighting.castsShadow ?? 'silhouette',
      occludesLight,
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

const MATURE_TREE_GROWTH_STAGE = 3;

function miningClassFromWire(value: string, spaceId: number): MiningNodeClass {
  return value === 'pure' || value === 'pristine' || value === 'rock' || value === 'mixed'
    ? value
    : spaceId === TOPSIDE_SPACE_ID ? 'mixed' : 'pure';
}
let homesteadSurroundingsKey = '';
let cachedHomesteadResources: readonly RenderWorldResource[] = [];
let cachedHomesteadDecorations: ReturnType<typeof generateSurvivalDecorations> = [];

function ensureHomesteadSurroundings(seed: number): void {
  const site = activeSpaceDefinition.homesteadSite;
  const registry = latestSnapshot.content.registry;
  const key = site === undefined ? ''
    : `${activeSpaceDefinition.spaceId}:${activeSpaceDefinition.sizeTiles}:${site.worldTileX}:${site.worldTileY}:${seed}:${registry.contentHash}`;
  if (key === homesteadSurroundingsKey) return;
  homesteadSurroundingsKey = key;
  cachedHomesteadResources = buildHomesteadSurroundingResources(seed, registry);
  cachedHomesteadDecorations = buildHomesteadSurroundingDecorations(seed, registry);
}

function buildHomesteadSurroundingResources(
  seed: number,
  registry: OverworldView['content']['registry'],
): readonly RenderWorldResource[] {
  const site = activeSpaceDefinition.homesteadSite;
  if (activeSpaceDefinition.generator !== 'homestead' || site === undefined) return [];
  const result: RenderWorldResource[] = [];
  const occupied = new Set<string>();
  const terrainCenter = Math.floor(activeSpaceDefinition.sizeTiles / 2);
  const plotBounds = homesteadPlotBounds(activeSpaceDefinition.sizeTiles);
  for (let tileY = 1; tileY < activeSpaceDefinition.sizeTiles - 1; tileY += 1) {
    for (let tileX = 1; tileX < activeSpaceDefinition.sizeTiles - 1; tileX += 1) {
      if (tileX >= plotBounds.minimumX - 2 && tileX <= plotBounds.maximumX + 2
        && tileY >= plotBounds.minimumY - 2 && tileY <= plotBounds.maximumY + 2) continue;
      const biome = homesteadBiomeAt(seed, site, tileX, tileY, activeSpaceDefinition.sizeTiles);
      const distanceWest = plotBounds.minimumX - tileX;
      const distanceEast = tileX - plotBounds.maximumX;
      const distanceNorth = plotBounds.minimumY - tileY;
      const distanceSouth = tileY - plotBounds.maximumY;
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
      const kind = survivalTreeKindAt(seed, sourceX, sourceY, registry);
      const definition = runtimeResourceDefinition(registry, kind);
      if (definition === null) continue;
      const key = `${tileX}:${tileY}`;
      if (occupied.has(key)) continue;
      occupied.add(key);
      result.push({
        id: 8_000_000_000n + BigInt(tileY * activeSpaceDefinition.sizeTiles + tileX), kind,
        tileX, tileY,
        chunkX: Math.floor(tileX / 16), chunkY: Math.floor(tileY / 16),
        health: survivalResourceInitialHealth(kind, MATURE_TREE_GROWTH_STAGE, registry), depleted: false,
        spaceId: activeSpaceDefinition.spaceId, growthStage: MATURE_TREE_GROWTH_STAGE,
        regrowthProgress: 24,
        miningClass: '', richness: 0, maximumRichness: 0, yieldProgress: 0,
        yieldsProduced: 0, producedOre: false, spawnSiteId: 0n,
        activationOrdinal: 0, respawnAtTick: 0n,
        miningClaimedBy: undefined, miningPartyId: undefined, miningClaimUntilTick: 0n,
        definitionId: definition.id,
        fruitReadyAtTick: 0n,
        ambientOnly: true,
      });
    }
  }
  const trees = result.filter((resource) => isChoppableTreeKind(resource.kind, registry));
  const other = result.filter((resource) => !isChoppableTreeKind(resource.kind, registry));
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

function buildHomesteadSurroundingDecorations(
  seed: number,
  registry: OverworldView['content']['registry'],
): ReturnType<typeof generateSurvivalDecorations> {
  const site = activeSpaceDefinition.homesteadSite;
  if (activeSpaceDefinition.generator !== 'homestead' || site === undefined) return [];
  const result: Array<ReturnType<typeof generateSurvivalDecorations>[number]> = [];
  const plotBounds = homesteadPlotBounds(activeSpaceDefinition.sizeTiles);
  let id = 6_000_000_000;
  const add = (kind: typeof result[number]['kind'], tileX: number, tileY: number, variant: number): void => {
    if (tileX >= plotBounds.minimumX - 2 && tileX <= plotBounds.maximumX + 2
      && tileY >= plotBounds.minimumY - 2 && tileY <= plotBounds.maximumY + 2) return;
    result.push({ id: id++, kind, tileX, tileY, variant, animationOffset: id % 96 });
  };
  // Forest-floor details follow tree silhouettes, so mushrooms and deadwood
  // read as undergrowth rather than an unrelated uniform decal pass.
  for (const tree of cachedHomesteadResources.filter((resource) => isChoppableTreeKind(resource.kind, registry))) {
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
  // One authored pond sits in the blocked woodland apron. Fish pools are
  // topside-authoritative only; decorative homestead shadows would falsely
  // advertise a fishable target.
  const center = Math.floor(activeSpaceDefinition.sizeTiles / 2);
  const pondX = center + ((site.worldTileX + seed) % 2 === 0 ? 38 : -38);
  const pondY = center + ((site.worldTileY + seed) % 2 === 0 ? 30 : -30);
  add('camp_pond', pondX, pondY, 0);
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
    const definition = runtimeResourceDefinition(snapshot.content.registry, resource);
    if (liveMapSuppressesGeneratedResource(snapshot, resource.id) || definition?.visual.kind !== 'tree') continue;
    const stage = treeGrowthStageName(resource.growthStage);
    const state = resource.depleted
      ? stage === 'small' ? 'depleted_small' : stage === 'medium' ? 'depleted_medium' : 'depleted'
      : stage === 'big' ? 'mature' : stage;
    const visual = authoredResourceVisual(art, definition.visual, state);
    if (visual === null) continue;
    const worldX = resource.tileX * 16 + 8;
    const footY = (resource.tileY + 1) * 16;
    const projection = terrainProjectedDepthAtFoot(terrain, worldX, footY);
    const projectedFootY = footY - projection;
    const original = createSpriteLightOccluder(visual.asset, 'base', 0, worldX, projectedFootY);
    let receiver = original;
    if (original !== null && visual.scale !== 1) {
      const width = Math.max(1, Math.round(original.width * visual.scale));
      const height = Math.max(1, Math.round(original.height * visual.scale));
      const opaque = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        opaque[y * width + x] = original.opaque[Math.min(original.height - 1, Math.floor(y / visual.scale)) * original.width
          + Math.min(original.width - 1, Math.floor(x / visual.scale))]!;
      }
      receiver = { left: worldX - visual.asset.anchor[0] * visual.scale,
        top: projectedFootY - visual.asset.anchor[1] * visual.scale, width, height, opaque };
    }
    result.push({
      obstacle: projectedLightObstacle(survivalResourceObstacle(
        resource.kind, resource.tileX, resource.tileY, snapshot.content.registry,
      ), projection),
      receiver, footX: worldX, footY: projectedFootY, receiverFacing: 'south', shadowMode: 'column',
      elevationLayer: terrainElevationAtWorldFoot(terrain, worldX, footY),
      painterOrder: lightCasterPainterOrder(terrain, worldX, footY, footY, `resource:${resource.id}`),
    });
  }
  return result;
}

/** The tiles this frame's camera will show, before the frame's terrain exists:
 * the same layout and clamping as the render camera, with the unprojected foot
 * (the terrain projection is a few tiles, well inside the window margin). */
function estimatedCameraTiles(localX: number, localY: number): TileBounds {
  const layout = worldPassLayout(renderer.cssWidth, renderer.cssHeight, renderer.dpr, worldZoom, renderer.worldScale);
  const viewportWidth = layout.width / layout.integerScale;
  const viewportHeight = layout.height / layout.integerScale;
  const worldPixels = activeSpaceDefinition.sizeTiles * 16;
  const cameraX = lightingPreview?.cameraX ?? cameraAxisOffset(localX, viewportWidth, worldPixels);
  const cameraY = lightingPreview?.cameraY ?? cameraAxisOffset(localY, viewportHeight, worldPixels);
  return { minX: Math.floor(cameraX / 16), minY: Math.floor(cameraY / 16),
    maxX: Math.ceil((cameraX + viewportWidth) / 16), maxY: Math.ceil((cameraY + viewportHeight) / 16) };
}

/** Render terrain: through the world source on topside (chunk window in chunk mode `on`). */
function terrainForSnapshot(snapshot: OverworldView): TerrainArray {
  const legacy = (): TerrainArray => legacyTerrainForSnapshot(snapshot);
  return activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    ? worldSource.topsideTerrain(legacy, snapshot.content.registry)
    : legacy();
}

/** The whole-map terrain. Client collision keeps using it until chunk-native collision (S4d). */
function legacyTerrainForSnapshot(snapshot: OverworldView): TerrainArray {
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
  const base = terrainForSpace(activeSpaceDefinition, seed, version, snapshot.content.registry);
  if (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID) {
    return liveIslandTerrain(snapshot.liveMapDocument, snapshot.content.registry) ?? base;
  }
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

function resourcePerceptionForSnapshot(snapshot: OverworldView) {
  const player = snapshot.identityHex === null ? undefined : snapshot.players.get(snapshot.identityHex);
  const ranks = Object.fromEntries([...snapshot.skillNodes].map(({ nodeId, rank }) => [nodeId, rank]));
  return resourcePerceptionCache.project({
    seed: snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED,
    spaceId: activeSpaceDefinition.spaceId,
    underground: activeSpaceDefinition.generator === 'cellar',
    centerTileX: Math.floor((player?.x ?? 0) / TILE_SIZE_FIXED),
    centerTileY: Math.floor((player?.y ?? 0) / TILE_SIZE_FIXED),
    terrain: terrainForSnapshot(snapshot),
    revision: [snapshot.content.registry.contentHash, network.resourceRevision,
      network.cellarExcavationRevision, snapshot.liveMapDocument?.contentHash ?? '',
      ...Object.entries(ranks).sort(([a], [b]) => a.localeCompare(b)).map(([id, rank]) => `${id}=${rank}`),
    ].join(':'),
    capabilities: runtimeResourcePerception(snapshot.content.registry, player === undefined ? {} : ranks),
    registry: snapshot.content.registry,
    resources: snapshot.resources,
    resourceVisible: (id) => !liveMapSuppressesGeneratedResource(snapshot, id),
  });
}

function liveMapSuppressesGeneratedResource(snapshot: OverworldView, id: bigint): boolean {
  return activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    && (liveIslandDocumentFor(snapshot)?.generatedSuppressions.includes(`resource-${id}`) ?? false);
}

function refreshCollision(snapshot: OverworldView): void {
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
  const rogueRoom = activeSpaceDefinition.rogueRoom;
  const rogueKey = rogueRoom === undefined ? ''
    : `${rogueRoom.seed}:${rogueRoom.roomNumber}:${rogueRoom.roomKind}:${rogueRoom.theme}`;
  const liveRevision = activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    ? snapshot.liveMapDocument?.revision ?? 0
    : 0;
  const nextKey = `${activeSpaceDefinition.spaceId}:${activeSpaceDefinition.sizeTiles}:${seed}:${version}:${rogueKey}:${liveRevision}:${network.resourceRevision}:${network.cellarExcavationRevision}:${snapshot.content.registry.contentHash}:${lightingQuality.effective}`;
  if (collisionKey === nextKey) return;
  collisionKey = nextKey;
  const terrain = legacyTerrainForSnapshot(snapshot);
  const liveDocument = activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    ? liveIslandDocumentFor(snapshot)
    : null;
  resourceTargetPolicy = new CombatRegionPolicy(liveDocument?.combatRegions ?? []);
  const generatedSuppressions = new Set(liveDocument?.generatedSuppressions ?? []);
  const proceduralDecorationIds = new Set(
    generateSurvivalProceduralDecorations(seed, snapshot.content.registry).map(({ id }) => id),
  );
  for (const decoration of generateSurvivalDecorations(seed, snapshot.content.registry)) {
    if (!proceduralDecorationIds.has(decoration.id)) {
      generatedSuppressions.add(`decoration-${decoration.id}`);
    }
  }
  const activeLandmarkDecorations = generateSurvivalLandmarkDecorations(
    activeTopsideLandmarks(snapshot),
  );
  for (const decoration of activeLandmarkDecorations) {
    generatedSuppressions.add(`decoration-${decoration.id}`);
  }
  const authoredGroundWalkableTiles = activeSpaceGroundWalkableTiles(
    snapshot.content.registry, TOPSIDE_SPACE_ID, liveDocument?.landmarks,
  );
  const prepared = worldStaticProjection.prepare(
    terrain,
    `${terrain.version}:${liveRevision}:${snapshot.liveMapDocument?.contentHash ?? ''}:${network.cellarExcavationRevision}:${snapshot.content.registry.contentHash}`,
    authoredGroundWalkableTiles,
    art.cliff,
    !lightingEffectsDisabled,
  );
  const baseCollision = createClientCollisionMap(
    terrain,
    snapshot.resources,
    snapshot.chests,
    'ground',
    snapshot.placeables,
    generatedSuppressions,
    authoredGroundWalkableTiles,
    snapshot.content.registry,
    prepared.ground,
  );
  resourceCollisionObstacles = baseCollision.resourceObstacles;
  const obstacles = [...(baseCollision.obstacles ?? [])];
  if (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID) {
    if (liveDocument !== null) obstacles.push(...liveMapObjectCollisionObstacles(
      liveDocument, 'ground', snapshot.content.registry,
    ));
    else for (const decoration of activeLandmarkDecorations) {
      const obstacle = survivalDecorationObstacle(
        decoration, 'ground', snapshot.content.registry,
      );
      if (obstacle !== null) obstacles.push(obstacle);
    }
  }
  for (const target of snapshot.combatTargets) {
    const definition = combatTargetDefinition(snapshot, target);
    if (target.carriedBy !== undefined || combatTargetHealth(snapshot, target) === null
      || definition?.components.collision?.blocksMovement !== true) continue;
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
    const obstacle = runtimeSpaceSurfaceObstacle(snapshot.content.registry, surface);
    if (obstacle !== null) obstacles.push(obstacle);
  }
  if (activeSpaceDefinition.generator === 'delve_lobby') obstacles.push(
    ...hearthLobbyFurnitureObstacles(snapshot.content.registry,activeSpaceDefinition.spaceId),
  );
  if(activeSpaceDefinition.generator==='village_interior'){
    const interior=hearthInteriorForSpace(snapshot.content.registry,activeSpaceDefinition.spaceId);
    if(interior)obstacles.push(...hearthInteriorFurnitureObstacles(snapshot.content.registry,interior));
  }
  for (const tile of interiorFurnitureBlockingTiles(activeSpaceDefinition.generator)) {
    obstacles.push({
      left: tile.tileX * TILE_SIZE_FIXED,
      top: tile.tileY * TILE_SIZE_FIXED,
      right: (tile.tileX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (tile.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  for (const target of homesteadTentPresentationTargets(activeSpaceDefinition, snapshot.homesteads)) {
    const footprint = homesteadTentFootprint(
      target.tileX,
      target.tileY,
      target.interior,
    );
    obstacles.push({
      left: footprint.minX * TILE_SIZE_FIXED, top: footprint.minY * TILE_SIZE_FIXED,
      right: (footprint.maxX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (footprint.maxY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  if (activeSpaceDefinition.generator === 'homestead') {
    const activeHome = snapshot.homesteads.get(activeSpaceDefinition.spaceId);
    for (const tile of homesteadBoundaryTiles(activeSpaceDefinition.sizeTiles)) {
      if (tile.kind === 'gate' && activeHome?.gateOpen === true) continue;
      obstacles.push({
        left: tile.tileX * TILE_SIZE_FIXED, top: tile.tileY * TILE_SIZE_FIXED,
        right: (tile.tileX + 1) * TILE_SIZE_FIXED - 1,
        bottom: (tile.tileY + 1) * TILE_SIZE_FIXED - 1,
      });
    }
  }
  worldCollision = { ...baseCollision, obstacles };
  if (activeSpaceDefinition.generator === 'residence') {
    const withoutFurniture = createClientCollisionMap(terrain, snapshot.resources, snapshot.chests, 'ground',
      [...snapshot.placeables].filter(row => (
        hearthFurnitureShapeForPlaceable(snapshot.content.registry, row) === null
      )),
      generatedSuppressions, authoredGroundWalkableTiles, snapshot.content.registry, prepared.ground);
    furnitureCollision = { ...withoutFurniture, obstacles: [...(withoutFurniture.obstacles ?? []),
      ...obstacles.slice(baseCollision.obstacles?.length ?? 0)] };
  } else furnitureCollision = worldCollision;
  const baseBoatCollision = createClientCollisionMap(
    terrain, [], [], 'water', [], generatedSuppressions, authoredGroundWalkableTiles,
    snapshot.content.registry,
    prepared.water,
  );
  boatCollision = activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    ? {
        ...baseBoatCollision,
        obstacles: [
          ...(baseBoatCollision.obstacles ?? []),
          ...(liveDocument === null
            ? activeLandmarkDecorations.flatMap((decoration) => {
                const obstacle = survivalDecorationObstacle(
                  decoration, 'water', snapshot.content.registry,
                );
                return obstacle === null ? [] : [obstacle];
              })
            : liveMapObjectCollisionObstacles(
                liveDocument, 'water', snapshot.content.registry,
              )),
        ],
      }
    : baseBoatCollision;
  const solidGeometry = traversalSolidGeometry(worldCollision, boatCollision);
  worldCollision = runtimeActorCollision(snapshot.content.registry, worldCollision, { kind: 'placement', medium: 'ground' }, snapshot.clock?.authorityTick ?? 0n, solidGeometry);
  boatCollision = runtimeActorCollision(snapshot.content.registry, boatCollision, { kind: 'placement', medium: 'water' }, snapshot.clock?.authorityTick ?? 0n, solidGeometry);
  projectileCollision = runtimeActorCollision(snapshot.content.registry, worldStaticProjection.projectile(worldCollision, boatCollision),
    { kind: 'projectile' }, snapshot.clock?.authorityTick ?? 0n, traversalSolidGeometry(worldCollision, boatCollision));
  baseLightOcclusion = lightingEffectsDisabled ? undefined : createLightOcclusionMap(
    terrain,
    [],
    [],
    [...elevatedLightOccluders(snapshot, seed, terrain), ...treeLightOccluders(snapshot, terrain)],
    art.cliff,
    prepared.light,
  );
  lightOcclusion = baseLightOcclusion;
  authoredLightFrameKey = '';
}

function update(): void {
  let previous = predicted;
  effectPhase = (effectPhase + 1) % 4;
  worldZoom = easeWorldZoom(worldZoom, worldZoomTarget);
  network.setViewRadius(viewRadiusForViewport(renderer.cssWidth, renderer.cssHeight, worldZoom));
  latestSnapshot = network.view();
  synchronizeContentArt();
  if (npcArtContentHash !== latestSnapshot.content.registry.contentHash) {
    npcArtContentHash = latestSnapshot.content.registry.contentHash;
    void loadAuthoredNpcArt(art, latestSnapshot.content.registry.npcs.values())
      .catch(error => console.warn('Authored NPC artwork could not be loaded', error));
  }
  const snapshot = latestSnapshot;
  if (!worldClientReady()) {
    clearConnectionInput();
    predicted = null;
    previousPredicted = null;
    presentationCorrection.clear();
    localActionPresentation.reset();
    return;
  }
  connectionInputCleared = false;
  if (!snapshot.connected || snapshot.identityHex !== localActionIdentity) localActionPresentation.reset();
  localActionIdentity = snapshot.identityHex;
  if (snapshot.identityHex !== null && snapshot.identityHex !== nameplatesPreferenceIdentity) {
    nameplatesPreferenceIdentity = snapshot.identityHex;
    try {
      nameplatesVisible = readPlayerNameplates(snapshot.identityHex, localStorage, sessionStorage);
    } catch {
      nameplatesVisible = true;
    }
  }
  updateSkillPointNotice(snapshot);
  if (outdoorRewardNoticeIdentity !== snapshot.identityHex || !snapshot.connected) {
    outdoorRewardNoticeIdentity = snapshot.identityHex; outdoorRewardNoticeCount = 0;
  }
  if (snapshot.connected && snapshot.identityHex !== null) {
    const count = snapshot.outdoorRewards?.size ?? 0;
    if (count > outdoorRewardNoticeCount) setToast('EXPEDITION REWARDS READY [O]', 'success', 240);
    outdoorRewardNoticeCount = count;
  }
  if (snapshot.connected && snapshot.fishingCast !== null
    && (snapshot.clock?.authorityTick ?? 0n) - snapshot.fishingCast.startedTick >= FISHING_CAST_TICKS) {
    const fishingAction = selectedFishingToolAction(liveItemContentDefinition(snapshot, selectedItem(snapshot)));
    if (fishingAction !== null) {
      const key = `${snapshot.identityHex}:${snapshot.fishingCast.poolId}:${snapshot.fishingCast.startedTick}`;
      const request = fishingReelLifecycleRequest(snapshot.fishingCast, fishingAction.reelActionId);
      void fishingReelGate.request(key, performance.now(), () => network.useSelected(request.verb, request.options))
        ?.catch((error: unknown) => setFailureToast(error));
    }
  }
  if (homesteadBuildMode && !canUseHomesteadBuildMode(snapshot)) homesteadBuildMode = false;
  furnitureMoves.setScope(`${snapshot.identityHex}:${network.sessionGeneration}:${snapshot.connected}:${activeSpaceDefinition.spaceId}:${canUseHomesteadBuildMode(snapshot)}`);
  if (!homesteadBuildMode) furnitureMoves.cancel();
  if (snapshot.tradeSession !== null) overworldUi.openWindow = null;
  const authoritativePosition = network.ownPosition();
  const nextSpaceDefinition = authoritativePosition === null ? null : clientSpaceDefinition(
    snapshot.content.registry,
    authoritativePosition.spaceId,
    snapshot.rogueRun?.spaceId === authoritativePosition.spaceId
      ? snapshot.rogueRun
      : instanceSpaceRowFor(authoritativePosition.spaceId, snapshot.homesteads),
  );
  const nextSpacePresentationKey = spacePresentationKey(nextSpaceDefinition ?? undefined);
  if (authoritativePosition !== null
    && (predicted === null || authoritativePosition.spaceId !== observedSpaceId
      || nextSpacePresentationKey !== observedSpacePresentationKey)) {
    releaseDynamicLighting();
    observedSpaceId = authoritativePosition.spaceId;
    observedSpacePresentationKey = nextSpacePresentationKey;
    activeSpaceDefinition = nextSpaceDefinition
      ?? clientSpaceDefinition(snapshot.content.registry, TOPSIDE_SPACE_ID)
      ?? activeSpaceDefinition;
    portalTransitionStartedAtMs = performance.now();
    collisionKey = '';
    groundCache.invalidateResource(0, 0);
    remoteBuffers.clear(); remoteDisplay.clear(); previousRemoteDisplay.clear();
    npcBuffers.clear(); npcDisplay.clear(); previousNpcDisplay.clear(); projectileBuffers.clear(); projectileDisplay.clear();
    projectileFlightTicks.clear(); projectileHitProgress.clear();
    pendingBowProjectile = null;
    predicted = playerState(authoritativePosition);
    previous = predicted;
    previousPredicted = predicted;
    presentationCorrection.clear();
    const minimum = renderer.minimumZoom(activeSpaceDefinition.sizeTiles * 16);
    worldZoomTarget = Math.max(minimum, Math.min(MAX_WORLD_ZOOM, worldZoomTarget));
    worldZoom = Math.max(minimum, Math.min(MAX_WORLD_ZOOM, worldZoom));
  }
  if (snapshot.activeChest !== null && overworldUi.openWindow !== 'chest') overworldUi.openWindow = 'chest';
  if (snapshot.activeChest === null && overworldUi.openWindow === 'chest') overworldUi.openWindow = null;
  const activePlaceableFrameId = activeObjectFrameId(snapshot.content.registry, snapshot.activePlaceable);
  const activePlaceableFrame = activePlaceableFrameId === null
    ? null : snapshot.content.registry.frames.get(activePlaceableFrameId) ?? null;
  const activeAuthoredEntityFrameId = activePlaceableFrame?.presentation?.surface === 'entity'
    ? activePlaceableFrame.id : null;
  const activePlaceableTags = snapshot.activePlaceable === null
    ? [] : placeableObjectDefinition(snapshot.content.registry, snapshot.activePlaceable)
      ?.components.identity?.tags ?? [];
  if (snapshot.hearthStashOpen && overworldUi.openWindow !== 'content') overworldUi.openWindow='content';
  if (snapshot.activeChest === null && activeAuthoredEntityFrameId !== null
    && overworldUi.openWindow !== 'content') overworldUi.openWindow = 'content';
  if (activeAuthoredEntityFrameId === null && activePlaceableTags.includes('container.barrel') && overworldUi.openWindow !== 'barrel') overworldUi.openWindow = 'barrel';
  if (activeAuthoredEntityFrameId === null && activePlaceableTags.includes('station.furnace') && overworldUi.openWindow !== 'furnace') overworldUi.openWindow = 'furnace';
  if (activeAuthoredEntityFrameId === null && activePlaceableTags.includes('station.campfire') && overworldUi.openWindow !== 'cooking') overworldUi.openWindow = 'cooking';
  if (activeAuthoredEntityFrameId === null && activePlaceableTags.includes('station.press') && overworldUi.openWindow !== 'press') overworldUi.openWindow = 'press';
  if (activeAuthoredEntityFrameId === null && activePlaceableTags.includes('station.cellar') && overworldUi.openWindow !== 'fermentation') overworldUi.openWindow = 'fermentation';
  if (!snapshot.hearthStashOpen && snapshot.activePlaceable === null && (overworldUi.openWindow === 'barrel' || overworldUi.openWindow === 'furnace'
    || overworldUi.openWindow === 'cooking' || overworldUi.openWindow === 'press'
    || overworldUi.openWindow === 'fermentation' || overworldUi.openWindow === 'content')) overworldUi.openWindow = null;
  if (optimisticSelectedSlot !== null && snapshot.survival?.selectedSlot === optimisticSelectedSlot) {
    optimisticSelectedSlot = null;
  }
  const weatherTick = calendarTickForSnapshot(snapshot);
  const calendar = calendarAtTick(Number(weatherTick) * SIM_STEPS_PER_AUTHORITY_TICK);
  audio.setAmbienceContext(
    calendar.season,
    authorityDayProgress(weatherTick),
    activeSpaceDefinition.audioBed === 'cave' || activeSpaceDefinition.audioBed === 'debug' ? 'cellar' : 'estate',
  );
  const activeWeather = weatherVisualState(worldWeatherMode(), weatherTick, worldWindDirection());
  const weather = activeSpaceDefinition.environment === 'outdoor' && activeSpaceDefinition.weather
    ? activeWeather
    : { ...activeWeather, raining: false, cloudShadow: 0, cloudCover: 0, wind: 0 };
  rain.update(
    weather.raining,
    renderer.cssWidth,
    renderer.cssHeight,
    worldZoom,
  );
  updateMusicContext(snapshot, weather.raining);
  if (observedResourceRevision !== network.resourceRevision) {
    observedResourceRevision = network.resourceRevision;
    const visibleResourceIds = new Set<bigint>();
    for (const resource of snapshot.resources) {
      visibleResourceIds.add(resource.id);
      const previousHealth = resourceHealth.get(resource.id);
      const previousYield = resourceYieldProgress.get(resource.id);
      if ((previousHealth !== undefined
        && previousHealth <= survivalResourceInitialHealth(
          resource.kind, MATURE_TREE_GROWTH_STAGE, snapshot.content.registry,
        )
        && resource.health < previousHealth
        && !resource.depleted)
        // Mining work between payouts is a landed strike too.
        || (previousYield !== undefined && miningWorkAdvanced(previousYield, resource))) {
        treeShakeRemaining.set(resource.id, 16);
      }
      resourceHealth.set(resource.id, resource.health);
      resourceYieldProgress.set(resource.id, resource.yieldProgress);
    }
    for (const id of resourceHealth.keys()) {
      if (!visibleResourceIds.has(id)) { resourceHealth.delete(id); resourceYieldProgress.delete(id); }
    }
    for (const id of treeShakeRemaining.keys()) {
      if (!visibleResourceIds.has(id)) treeShakeRemaining.delete(id);
    }
  }
  for (const [id, remaining] of treeShakeRemaining) {
    if (remaining <= 1) treeShakeRemaining.delete(id);
    else treeShakeRemaining.set(id, remaining - 1);
  }
  for (const [id, remaining] of resourceGlanceRemaining) {
    if (remaining <= 1) resourceGlanceRemaining.delete(id);
    else resourceGlanceRemaining.set(id, remaining - 1);
  }
  if (networkDirty && collisionBootstrapReady({
    connected: snapshot.connected,
    identityReady: snapshot.identityHex !== null,
    worldSeedReady: snapshot.worldSeed !== null,
    clockReady: snapshot.clock !== null,
    environmentReady: snapshot.environment !== null,
    playerReady: authoritativePosition !== null,
  })) refreshCollision(snapshot);
  syncTouchControls();
  if (!worldTouchActionAvailable()) worldTouchInput.reset();
  updateDefenseHold();
  const defending = snapshot.combatState?.kind === 'dodge' || snapshot.combatState?.kind === 'block';
  const direction = defending || snapshot.rogueRun?.phase === 'reward' ? 'idle' : directionFromKeys();
  const mount = localMount(snapshot);
  const mounted = mount !== null;
  const legacyMovementCollision = runtimeNpcMount(snapshot.content.registry, mount)?.adapter === 'boat' ? boatCollision : worldCollision;
  const movementCollision = runtimeActorCollision(snapshot.content.registry, legacyMovementCollision,
    { kind: 'player', mount, effects: [...snapshot.effects] }, snapshot.clock?.authorityTick ?? 0n, traversalSolidGeometry(worldCollision, boatCollision));
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
    const reconciliation = network.reconcile(predicted, playerState(authoritative), movementCollision);
    if (reconciliation !== null) {
      if (previous !== null && predicted !== null) {
        previous = { ...previous, position: rebaseInterpolationPosition(
          previous.position, predicted.position, reconciliation.player.position,
        ) };
      }
      if (predicted !== null && reconciliation.errorFixed > 0 && !reconciliation.hardSnap) {
        presentationCorrection.begin(predicted.position, reconciliation.player.position);
      } else if (reconciliation.hardSnap) presentationCorrection.clear();
      predicted = reconciliation.player;
    }
  }
  if (predicted !== null) {
    const playerVitals = resolvedPlayerVitals(snapshot);
    const sprintCost = playerVitals?.sprint == null
      ? 1
      : sprintVigourCostForSteps(playerVitals.sprint.vigourDrainCentiPerSecond, 1);
    const sprinting = sprintRequested
      && playerVitals?.sprint != null
      && displayedVigourCenti(playerVitals.vigour) >= sprintCost;
    const rogueMoveSpeed = mounted ? 0 : rogueMoveSpeedBonus(snapshot);
    const movementSpeedPermille = sprinting && playerVitals?.sprint != null
      ? Math.min(4_000, playerVitals.sprint.speedPermille + rogueMoveSpeed)
      : Math.min(2_000, 1_000 + rogueMoveSpeed);
    predicted = authoritative?.actionKind==='sitting' ? playerState(authoritative) : defending ? predicted : mounted
      ? movePlayerAtSpeed(predicted, direction === 'idle' ? null : direction, movementCollision, 2)
      : movementSpeedPermille !== 1_000
        ? movePlayerAtSpeedPermille(
          predicted, direction === 'idle' ? null : direction, worldCollision, movementSpeedPermille,
        )
        : movePlayer(predicted, direction === 'idle' ? null : direction, worldCollision);
    network.recordPredictedStep(
      direction,
      predicted,
      mounted ? 2_000 : movementSpeedPermille,
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
    previousNpcDisplay.delete(id);
    npcHitFeedback.delete(id);
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
    if (commit.targetKind === 'npc') npcHitFeedback.set(commit.targetId, combatTextNow);
    if (commit.targetKind === 'npc' && (snapshot.rogueEnemyProfiles.get(commit.targetId) ?? snapshot.outdoorEnemyProfiles?.get(commit.targetId)) !== undefined) musicStruckEnemy = true;
    if (floatingCombatTexts.length > 32) floatingCombatTexts.shift();
  });
  for (let index = floatingCombatTexts.length - 1; index >= 0; index -= 1) {
    if (combatTextNow - floatingCombatTexts[index]!.startedAtMs >= 1_100) {
      floatingCombatTexts.splice(index, 1);
    }
  }
  for (const [npcId, startedAtMs] of npcHitFeedback) {
    if (combatTextNow - startedAtMs >= NPC_HIT_HOP_MS) npcHitFeedback.delete(npcId);
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
    const remoteMount = snapshot.npcs.find((npc) => npc.rider?.toHexString() === id);
    // Remote effects are private. Active traversal uses authority positions rather
    // than inventing the remote actor's grants during presentation extrapolation.
    const remoteCollision = runtimeTraversalPolicy(snapshot.content.registry)?.mode === 'active' ? undefined
      : runtimeNpcMount(snapshot.content.registry, remoteMount)?.adapter === 'boat' ? boatCollision : worldCollision;
    const sample = buffer.sample(renderTick, remoteCollision);
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
    if (sample !== null) {
      previousNpcDisplay.set(id, npcDisplay.get(id) ?? sample);
      npcDisplay.set(id, sample);
    }
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
  return profiles.get(identity)?.displayName ?? 'FARMER';
}

interface OnlinePlayerListEntry {
  readonly identityHex: string;
  readonly displayName: string;
  readonly self: boolean;
  readonly idleMinutes: number | null;
  readonly homesteadRole: 'guest' | 'worker' | 'builder' | null;
}

let onlinePlayerCacheRevision = -1;
let onlinePlayerCacheMinute = -1;
let onlinePlayerCacheIdentity: string | null = null;
let onlinePlayerCacheMembers = '';
let onlinePlayerCache: readonly OnlinePlayerListEntry[] = [];

function onlinePlayerEntries(snapshot: OverworldView): readonly OnlinePlayerListEntry[] {
  const minute = Math.floor(Date.now() / 60_000);
  const memberSignature = [...snapshot.homesteadMembers]
    .map((row) => `${row.guest.toHexString()}:${row.role}`)
    .sort()
    .join('|');
  if (onlinePlayerCacheRevision === network.presenceRevision
    && onlinePlayerCacheMinute === minute
    && onlinePlayerCacheIdentity === snapshot.identityHex
    && onlinePlayerCacheMembers === memberSignature) return onlinePlayerCache;
  onlinePlayerCacheRevision = network.presenceRevision;
  onlinePlayerCacheMinute = minute;
  onlinePlayerCacheIdentity = snapshot.identityHex;
  onlinePlayerCacheMembers = memberSignature;
  const roles = new Map([...snapshot.homesteadMembers].map((row) => [
    row.guest.toHexString(),
    isHomesteadMemberRole(row.role) ? row.role : null,
  ]));
  onlinePlayerCache = [...snapshot.profiles]
    .filter((profile) => profile.online)
    .map((profile) => ({
      identityHex: profile.identity.toHexString(),
      displayName: profile.displayName,
      self: profile.identity.toHexString() === snapshot.identityHex,
      idleMinutes: onlinePlayerIdleMinutes(profile.lastActiveAtMicros),
      homesteadRole: roles.get(profile.identity.toHexString()) ?? null,
    }))
    .sort((left, right) => Number(right.self) - Number(left.self)
      || left.displayName.localeCompare(right.displayName));
  return onlinePlayerCache;
}

let optimisticSelectedSlot: number | null = null;
let optimisticVigourCenti: number | null = null;
let vigourDenyTicks = 0;
function selectedItem(snapshot: OverworldView): string {
  return selectedItemRow(snapshot)?.itemKind ?? 'empty';
}

function liveItemDefinition(snapshot: OverworldView, itemKind: string) {
  return runtimeItemDefinition(snapshot.content.registry, itemKind);
}

function liveItemContentDefinition(snapshot: OverworldView, itemKind: string) {
  if (runtimeItemDefinition(snapshot.content.registry, itemKind) === null) return null;
  return snapshot.content.registry.items.get(`item:${itemKind}`) ?? null;
}

function clientProcessorRuntime(snapshot: OverworldView, placeable: WorldPlaceable) {
  return cachedProcessorRuntime(snapshot.content.registry, placeable);
}

function processorInterfaceForAdapter(adapter: ProcessAdapter) {
  if (adapter === 'smelting') return 'furnace' as const;
  if (adapter === 'campfire_cooking') return 'cooking' as const;
  if (adapter === 'press') return 'press' as const;
  return adapter === 'fermentation' ? 'fermentation' as const : 'barrel' as const;
}

function processorTiming(
  snapshot: OverworldView,
  placeable: WorldPlaceable,
  authorityTick: bigint,
) {
  return projectProcessorTiming(placeable, authorityTick, {
    registry: snapshot.content.registry,
    slots: snapshot.activePlaceable?.id === placeable.id ? snapshot.openPlaceableSlots : undefined,
    barrelRank: homesteadUpgradeRank(snapshot, 'barrel'),
    vintageRank: homesteadUpgradeRank(snapshot, 'vintage'),
    barrelingRank: estateFarmingSkills(snapshot).barreling,
  });
}

function selectedAimedUseAction(snapshot: OverworldView) {
  const definition = liveItemContentDefinition(snapshot, selectedItem(snapshot));
  if (definition?.tags.includes('item.ranged_weapon') !== true) return null;
  return selectedItemLifecycleAction(definition, 'aimedUse');
}

function liveItemLabel(snapshot: OverworldView, itemKind: string): string {
  return liveItemDefinition(snapshot, itemKind)?.displayName.toUpperCase()
    ?? hotbarItemLabel(itemKind, snapshot.content.registry);
}

function selectedItemRow(snapshot: OverworldView) {
  const selected = optimisticSelectedSlot ?? snapshot.survival?.selectedSlot ?? 0;
  return snapshot.inventorySlots.get(selected);
}

function equippedLightRow(snapshot: OverworldView) {
  if (bowChargeStartedAtMs !== null) return null;
  const row = snapshot.inventorySlots.get(EQUIPMENT_SLOT_OFFSET + 5);
  if (row === undefined || row.quantity <= 0) return null;
  const definition = liveItemContentDefinition(snapshot, row.itemKind);
  return definition?.light !== undefined
    && definition.equip?.slot === 'off_hand'
    && selectedItemLifecycleAction(definition, 'equipmentUse') !== null
    ? row
    : null;
}

function snapshotEffectModifiers(snapshot: OverworldView) {
  const authorityTick = snapshot.clock?.authorityTick ?? 0n;
  return modifiersForEffects([...snapshot.effects], authorityTick, (effectKind) => (
    runtimeEffectDefinition(snapshot.content.registry, effectKind)
  ));
}

function snapshotPlayerModifiers(snapshot: OverworldView) {
  const loadout = compileEquipmentLoadout({
    registry:snapshot.content.registry, inventory:[...snapshot.inventorySlots],
    selectedSlot:optimisticSelectedSlot ?? snapshot.survival?.selectedSlot ?? 0,
    skillPriority:snapshot.equipmentSkillPriority??[],
    trainedRanks:Object.fromEntries([...snapshot.skillNodes].map(({nodeId,rank})=>[nodeId,rank])),
    bowDrawn:bowChargeStartedAtMs !== null,
  });
  const rogue: Modifier[] = [];
  for (const upgrade of snapshot.rogueRunUpgrades) {
    const definition = rogueUpgradeDefinition(snapshot.content.registry,upgrade.upgradeId);
    if (definition === null || definition.modifierKind === 'healing'
      || definition.modifierKind === 'move_speed' || definition.modifierKind === 'knockback') continue;
    const target: Modifier['target'] = definition.modifierKind === 'sword_damage' ? 'attackPower'
      : definition.modifierKind === 'bow_damage' ? 'rangedPower'
        : definition.modifierKind === 'attack_speed' ? 'swingSpeed'
          : definition.modifierKind === 'max_health' ? 'maxHealth'
            : definition.modifierKind === 'critical_chance' ? 'criticalChance' : 'attackPower';
    rogue.push({
      id: `rogue.${upgrade.upgradeId}`,
      target,
      layer: 'pctAdd' as const,
      value: (definition.modifierKind === 'attack_speed' ? -1 : 1) * upgrade.magnitudePermille * 10,
      source: 'environment' as const,
    });
  }
  return [...loadout.modifiers, ...snapshotEffectModifiers(snapshot), ...rogue];
}

function rogueMoveSpeedBonus(snapshot: OverworldView): number {
  return [...snapshot.rogueRunUpgrades].reduce((total, upgrade) => (
    rogueUpgradeDefinition(snapshot.content.registry,upgrade.upgradeId)?.modifierKind === 'move_speed'
      ? total + upgrade.magnitudePermille : total
  ), 0);
}

function resolvedPlayerVitals(snapshot: OverworldView) {
  const row = snapshot.stats;
  const characterBalance = runtimeCharacterCombatBalance(snapshot.content.registry);
  if (row === null || characterBalance === null) return null;
  const resolved = resolveStatsWithProfile(characterBalance, {
    str: row.str, dex: row.dex, con: row.con, int: row.int, wis: row.wis, cha: row.cha,
  }, snapshotPlayerModifiers(snapshot));
  const sprintDefinition = runtimeSprintAbilityDefinition(snapshot.content.registry);
  const sprint = sprintDefinition === null ? null
    : resolveSprintAbility(
      sprintDefinition, resolved.attributes, snapshotPlayerModifiers(snapshot), characterBalance,
    );
  return {
    health: row.healthCenti, maxHealth: resolved.maxHealthCenti,
    mana: row.manaCenti, maxMana: resolved.maxManaCenti,
    vigour: row.vigourCenti, maxVigour: resolved.maxVigourCenti,
    attributes: resolved.attributes,
    sprint,
  };
}

/** A swing that only met veins this pickaxe can't work glances off them: sparks and a dull clink, no text. */
function glanceSwing(snapshot: OverworldView, itemKind: string): void {
  if (predicted === null) return;
  const facing = liveEquippedItemFacing(snapshot, itemKind, predicted.facing, cursorFacing());
  const glancing = glancingSwingNodes(snapshot.content.registry, itemKind, predicted.position, facing,
    worldResourcesIncludingPersonalQuest(snapshot).filter((resource) => !liveMapSuppressesGeneratedResource(snapshot, resource.id)),
    worldCollision);
  if (glancing.length === 0) return;
  for (const resource of glancing) resourceGlanceRemaining.set(resource.id, MINING_GLANCE_TICKS);
  void audio.unlock().then(async () => await audio.playSfx('tool_clink')).catch(() => undefined);
}

function performToolAction(
  call: () => Promise<void>,
  success: string | null,
  itemKind: string,
  whiff = false,
  presentationElapsedMs = 0,
): boolean {
  const rejection = itemActionRejection(
    selectedItemRow(latestSnapshot),
    latestSnapshot.inventorySlots,
    (kind) => runtimeRangedWeaponDefinition(
      latestSnapshot.content.registry, kind,
    )?.ammunitionItemKind ?? null,
    (kind) => runtimeDurabilityDefinition(latestSnapshot.content.registry, kind) !== null,
  );
  if (rejection !== null) {
    setFailureToast(new Error(rejection));
    return false;
  }
  const stats = latestSnapshot.stats;
  const runtimeVigour = runtimeVigourDefinition(latestSnapshot.content.registry, itemKind);
  const baseCost = runtimeToolDefinition(latestSnapshot.content.registry, itemKind) === null
    ? undefined : runtimeVigour?.costCenti;
  if (baseCost === undefined) {
    setToast('THIS TOOL IS NOT READY FOR WORLD USE', 'failure', 90);
    return false;
  }
  const characterBalance = runtimeCharacterCombatBalance(latestSnapshot.content.registry);
  if (characterBalance === null) {
    setToast('CHARACTER BALANCE IS NOT READY', 'failure', 90);
    return false;
  }
  const fullCost = resolveModifierTarget(
    'toolVigourCost', baseCost, snapshotPlayerModifiers(latestSnapshot), characterBalance,
  );
  const cost = whiff ? Math.ceil(fullCost / 2) : fullCost;
  const available = optimisticVigourCenti ?? stats?.vigourCenti ?? 0;
  if (stats !== null && available < cost) {
    vigourDenyTicks = 24;
    setToast('INSUFFICIENT VIGOUR', 'failure', 90);
    return false;
  }
  if (stats !== null) optimisticVigourCenti = Math.max(0, available - cost);
  const actionKind = runtimeItemAvatarAction(latestSnapshot.content.registry, itemKind) ?? undefined;
  const presentationToken = actionKind === undefined ? null : startPredictedAction(actionKind, presentationElapsedMs);
  void audio.unlock().then(async () => await audio.playSfx('tool_swing')).catch(() => undefined);
  showResult(call().catch((error: unknown) => {
    if (presentationToken !== null) localActionPresentation.reject(presentationToken);
    throw error;
  }).finally(() => { optimisticVigourCenti = null; }), success);
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
  itemKind: string,
  mode: 'cultivate' | 'water',
  actionId: 'use' | 'restore',
): boolean {
  if (tileToolInputOutOfReach(
    runtimeToolDefinition(latestSnapshot.content.registry, itemKind), predicted?.position ?? null, target,
    network.ownPosition(),
  )) return false;
  const restoring = actionId === 'restore';
  const uprooting = !restoring && mode === 'cultivate' && latestSnapshot.crops.get(farmSoilKey(
    target.tileX,
    target.tileY,
    activeSpaceDefinition.spaceId,
  )) !== undefined;
  const performed = performToolAction(
    () => network.useSelected('place', {
      tileX: target.tileX,
      tileY: target.tileY,
      actionId,
    }).then(() => {
      if (mode !== 'water') return;
      rain.spawnWorldSplash(
        target.tileX * 16 + 8,
        target.tileY * 16 + 12,
      );
    }),
    restoring ? 'GRASS RESTORED'
      : uprooting ? 'CROP DUG UP'
        : mode === 'cultivate' ? 'SOIL TILLED' : 'SOIL WATERED',
    itemKind,
  );
  if (performed) facePredictedTowardTile(target);
  return performed;
}

function resolvedBowChargeCostCenti(chargeMs: number): number {
  const selectedKind = selectedItem(latestSnapshot);
  const maximumCost = runtimeVigourDefinition(
    latestSnapshot.content.registry,
    selectedKind,
  )?.costCenti;
  const characterBalance = runtimeCharacterCombatBalance(latestSnapshot.content.registry);
  if (characterBalance === null) return Number.MAX_SAFE_INTEGER;
  return resolveModifierTarget(
    'toolVigourCost',
    bowChargeVigourCostCenti(chargeMs, maximumCost),
    snapshotPlayerModifiers(latestSnapshot),
    characterBalance,
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

function isVitalsTool(value: string): boolean {
  return runtimeToolDefinition(latestSnapshot.content.registry, value) !== null
    && runtimeVigourDefinition(latestSnapshot.content.registry, value) !== null;
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

function liveEquippedItemFacing(
  snapshot: OverworldView,
  itemKind: string,
  characterFacing: Direction,
  aimedFacing: Direction | null,
): Direction {
  return runtimeRangedWeaponDefinition(snapshot.content.registry, itemKind) === null
    ? characterFacing
    : aimedFacing ?? characterFacing;
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
  const definition = liveItemContentDefinition(snapshot, itemKind);
  const worldTool = selectedContextualWorldToolAction(definition);
  if (worldTool === null) return null;
  const tool = runtimeToolDefinition(snapshot.content.registry, itemKind);
  const gatheringContentReady = hearthGatheringContentReady(snapshot.content.registry);
  const eligible = worldResourcesIncludingPersonalQuest(snapshot).filter((resource) => !liveMapSuppressesGeneratedResource(snapshot, resource.id)
    && hearthResourceTargetAllowed(resource, predicted!.position, activeSpaceDefinition.spaceId,
      worldCollision, resourceCollisionObstacles, definition?.tool?.mineableResources,
      resourceTargetPolicy, gatheringContentReady, snapshot.content.registry)
    && runtimeResourceToolAllowed(snapshot.content.registry, resource, tool));
  return facedResource(
    predicted.position.x,
    predicted.position.y,
    liveEquippedItemFacing(snapshot, itemKind, predicted.facing, cursorFacing()),
    eligible,
    (definition?.tool?.reachTiles ?? 1) * TILE_SIZE_FIXED,
    TILE_SIZE_FIXED,
    snapshot.content.registry,
  );
}

function targetCellarWall(snapshot: OverworldView): { readonly tileX: number; readonly tileY: number } | null {
  const definition = liveItemContentDefinition(snapshot, selectedItem(snapshot));
  if (predicted === null || activeSpaceDefinition.generator !== 'cellar'
    || selectedCellarToolAction(definition) === null) {
    return null;
  }
  const target = targetInteractionTile();
  if (target === null) return null;
  const terrain = terrainForSnapshot(snapshot);
  // A faced tile is a logical neighbour: strike it directly when it is an
  // exposed wall. A pointer lands on the drawn wall, which is displaced two
  // rows north of the rock that owns it, so pointer picks are mapped back.
  const wall = cellarExposedWallAt(terrain, target.tileX, target.tileY)
    ? target
    : cellarWallSourceAtProjectedTile(terrain, target.tileX, target.tileY);
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
    [...snapshot.resources].filter((resource) => !liveMapSuppressesGeneratedResource(snapshot, resource.id)
      && runtimeResourcePickupPresentation(snapshot.content.registry, resource) !== null),
    24 * FIXED_UNITS_PER_PIXEL,
    0,
    snapshot.content.registry,
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

function fishingTargetBlocked(tile: FarmToolTarget): boolean {
  return tileTargetIsBlocked(boatCollision, tile);
}

function targetFishingTile(): FarmToolTarget | null {
  const tile = targetInteractionTile();
  return tile === null || fishingTargetBlocked(tile) ? null : tile;
}

function ignoreDistantTileToolInput(snapshot: OverworldView): boolean {
  return tileToolInputOutOfReach(
    runtimeToolDefinition(snapshot.content.registry, selectedItem(snapshot)),
    predicted?.position ?? null,
    targetInteractionTile(),
    network.ownPosition(),
  );
}

function fishingPoolAtTile(snapshot: OverworldView, tile: FarmToolTarget): WorldResource | null {
  return worldResourcesIncludingPersonalQuest(snapshot).find((resource) => (
    !resource.depleted
    && !liveMapSuppressesGeneratedResource(snapshot, resource.id)
    && runtimeResourceDefinition(snapshot.content.registry, resource)?.interaction.mode === 'fish'
    && resource.spaceId === activeSpaceDefinition.spaceId
    && resource.tileX === tile.tileX
    && resource.tileY === tile.tileY
  )) ?? null;
}

function performFishingCast(target: FarmToolTarget, itemKind: string, actionId: 'cast'): boolean {
  const pool = fishingPoolAtTile(latestSnapshot, target);
  const request = fishingCastLifecycleRequest(pool?.id ?? 0n, target, actionId);
  const performed = performToolAction(
    () => network.useSelected(request.verb, request.options),
    pool === null ? 'LINE CAST — NO FISH SHADOW' : 'LINE CAST',
    itemKind,
    pool === null,
  );
  if (performed) facePredictedTowardTile(target);
  return performed;
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

function refreshHoveredInteractionTile(): void {
  if (predicted === null || worldPointer === null) {
    hoveredInteractionTile = null;
    return;
  }
  const terrain = terrainForSnapshot(latestSnapshot);
  const playerWorldX = predicted.position.x / FIXED_UNITS_PER_PIXEL;
  const playerWorldY = predicted.position.y / FIXED_UNITS_PER_PIXEL;
  const terrainProjectionPixels = terrainProjectedDepthAtFoot(
    terrain,
    playerWorldX,
    terrainContactWorldYForPlayer(playerWorldY),
  );
  hoveredInteractionTile = interactionTileAtProjectedWorldPoint(
    predicted.position.x,
    predicted.position.y,
    latestCameraX + worldPointer.x / latestRenderedZoom,
    latestCameraY + worldPointer.y / latestRenderedZoom,
    terrainProjectionPixels,
    activeSpaceDefinition.sizeTiles,
  );
}

function placementTileBlocked(
  snapshot: OverworldView,
  tile: { readonly tileX: number; readonly tileY: number },
  excludeLocalPlayer = false,
  footprintReference?: { readonly kind: string; readonly definitionId?: string },
): boolean {
  if (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    && survivalLandmarkRoleReservedAt(
      activeTopsideLandmarks(snapshot), 'wildlife_feed', tile.tileX, tile.tileY,
    )) return true;
  const players = [...snapshot.players].filter((player) => {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    return (!excludeLocalPlayer || !local)
      && worldPlayerParticipatesInCollision(local, snapshot.profiles.get(id)?.online);
  }).map((player) => {
    const local = player.identity.toHexString() === snapshot.identityHex;
    return local && predicted !== null ? predicted.position : { x: player.x, y: player.y };
  });
  const cells = footprintReference === undefined ? [tile]
    : runtimeObjectFootprintTiles(snapshot.content.registry, { ...footprintReference, ...tile }, 'placement');
  return cells.length === 0 || cells.some(cell => worldPlacementTileIsBlocked(worldCollision, cell, players));
}

function boatPlacementTileBlocked(
  snapshot: OverworldView,
  tile: { readonly tileX: number; readonly tileY: number },
): boolean {
  const position = {
    x: tile.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: tile.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  };
  if (positionCollides(position, boatCollision)) return true;
  return [...snapshot.npcs].some((npc) => runtimeNpcMount(snapshot.content.registry, npc)?.adapter === 'boat'
    && Math.floor(npc.x / TILE_SIZE_FIXED) === tile.tileX
    && Math.floor(npc.y / TILE_SIZE_FIXED) === tile.tileY);
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

function targetGroundItemUse(snapshot: OverworldView): WorldItem | null {
  if (predicted === null) return null;
  return nearbyWorldItem(
    predicted.position.x,
    predicted.position.y,
    [...snapshot.worldItems].filter((item) => {
      const definition = liveItemContentDefinition(snapshot, item.itemKind);
      return definition?.light !== undefined
        && definition.equip?.slot === 'off_hand'
        && selectedItemLifecycleAction(definition, 'worldItemUse') !== null;
    }),
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

function combatTargetObjectReference(target: WorldCombatTarget): {
  readonly kind: string;
  readonly definitionId?: string;
} {
  const definitionId = 'definitionId' in target && typeof target.definitionId === 'string'
    ? target.definitionId.trim() : '';
  return definitionId === '' ? { kind: target.kind } : { kind: target.kind, definitionId };
}

function combatTargetDefinition(snapshot: OverworldView, target: WorldCombatTarget) {
  return runtimeObjectDefinition(snapshot.content.registry, combatTargetObjectReference(target));
}

function combatTargetHealth(snapshot: OverworldView, target: WorldCombatTarget) {
  const damageable = runtimeObjectDamageable(
    snapshot.content.registry,
    combatTargetObjectReference(target),
  );
  return damageable?.model === 'health' ? damageable : null;
}

function combatTargetCarry(snapshot: OverworldView, target: WorldCombatTarget) {
  return runtimeObjectCarry(snapshot.content.registry, combatTargetObjectReference(target));
}

function carriedCombatTarget(snapshot: OverworldView): WorldCombatTarget | null {
  if (snapshot.identityHex === null) return null;
  return snapshot.combatTargets.find(
    (target) => target.carriedBy?.toHexString() === snapshot.identityHex,
  ) ?? null;
}

function carriedCarriableCombatTarget(snapshot: OverworldView): WorldCombatTarget | null {
  const target = carriedCombatTarget(snapshot);
  return target !== null && combatTargetCarry(snapshot, target) !== null ? target : null;
}

function carriedPlaceable(snapshot: OverworldView): WorldPlaceable | null {
  if (snapshot.identityHex === null) return null;
  return snapshot.placeables.find(
    (placeable) => placeable.carriedBy?.toHexString() === snapshot.identityHex,
  ) ?? null;
}

function carriedCarriablePlaceable(snapshot: OverworldView): WorldPlaceable | null {
  const placeable = carriedPlaceable(snapshot);
  return placeable !== null
    && runtimeObjectCarry(snapshot.content.registry, placeable) !== null ? placeable : null;
}

function targetFacedCombatTarget(snapshot: OverworldView): WorldCombatTarget | null {
  if (predicted === null) return null;
  const tile = facedInteractionTile(predicted.position.x, predicted.position.y, predicted.facing);
  return snapshot.combatTargets.find((target) => {
    if (target.carriedBy !== undefined || combatTargetCarry(snapshot, target) === null) return false;
    const targetTile = combatTargetTile(target);
    return targetTile.tileX === tile.tileX && targetTile.tileY === tile.tileY;
  }) ?? null;
}

function targetMeleeCombatTarget(
  snapshot: OverworldView,
  itemKind: string,
): WorldCombatTarget | WorldNpc | null {
  if (predicted === null) return null;
  const tool = runtimeToolDefinition(snapshot.content.registry, itemKind);
  if (tool === null) return null;
  let nearest: WorldCombatTarget | WorldNpc | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const target of snapshot.combatTargets) {
    if (target.carriedBy !== undefined || combatTargetHealth(snapshot, target) === null) continue;
    const tile = combatTargetTile(target);
    const targetX = tile.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const targetY = tile.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    if (!forwardSwingTargetInReach(
      predicted.position.x,
      predicted.position.y,
      predicted.facing,
      targetX,
      targetY,
      tool,
    )) continue;
    const dx = targetX - predicted.position.x;
    const dy = targetY - predicted.position.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < nearestDistanceSquared
      || (distanceSquared === nearestDistanceSquared && target.id < (nearest?.id ?? target.id + 1n))) {
      nearest = target;
      nearestDistanceSquared = distanceSquared;
    }
  }
  for (const npc of snapshot.npcs) {
    const profile = wildlifeProfile(snapshot, npc.id);
    const rogueEnemy = snapshot.rogueEnemyProfiles.get(npc.id) ?? snapshot.outdoorEnemyProfiles?.get(npc.id);
    if (npc.health <= 0 || (rogueEnemy === undefined
      && (profile === null || !runtimeCreatureIsHuntable(
        snapshot.content.registry, profile.species,
      )))) continue;
    if (!forwardSwingTargetInReach(
      predicted.position.x, predicted.position.y, predicted.facing, npc.x, npc.y, tool,
    )) continue;
    const dx = npc.x - predicted.position.x;
    const dy = npc.y - predicted.position.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < nearestDistanceSquared
      || (distanceSquared === nearestDistanceSquared && npc.id < (nearest?.id ?? npc.id + 1n))) {
      nearest = npc;
      nearestDistanceSquared = distanceSquared;
    }
  }
  return nearest;
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
    && row.spaceId === activeSpaceDefinition.spaceId
    && runtimeObjectOccupiesTile(snapshot.content.registry, row, target)) ?? null;
}

/** A damaged tool faced at an anvil is repaired by F rather than swung. The
 * authority re-checks the facing tile, durability and repair material. */
function targetAnvilRepairReady(
  snapshot: OverworldView,
  definition: ReturnType<typeof liveItemContentDefinition>,
): boolean {
  const anvil = targetPlaceable(snapshot);
  if (anvil === null || !objectHasAuthoredTag(snapshot.content.registry, anvil, 'station.anvil')) return false;
  if (selectedItemLifecycleAction(definition, 'useWith') === null) return false;
  if (localMount(snapshot) !== null || carriedChest(snapshot) !== null
    || carriedCombatTarget(snapshot) !== null || carriedPlaceable(snapshot) !== null) return false;
  const row = selectedItemRow(snapshot);
  if (row === undefined || row.quantity <= 0) return false;
  const durability = runtimeDurabilityDefinition(snapshot.content.registry, row.itemKind);
  return durability !== null && row.durability < durability.maximum;
}

function nearbyCraftingStations(snapshot: OverworldView): readonly CraftingStation[] {
  const player = network.ownPosition();
  if (player === null) return [];
  const playerTile = {
    spaceId: player.spaceId,
    tileX: Math.floor(player.x / TILE_SIZE_FIXED),
    tileY: Math.floor(player.y / TILE_SIZE_FIXED),
  };
  const policy = runtimeWorldPolicyBalance(snapshot.content.registry);
  const stations = new Set<CraftingStation>();
  for (const row of snapshot.placeables) {
    if (row.carriedBy !== undefined) continue;
    const station = runtimePlaceableDefinition(snapshot.content.registry, row)?.station;
    if (station === null || station === undefined) continue;
    const inReach = station === 'campfire'
      ? tileTargetWithinFixedReach(player.x, player.y, row, CAMPFIRE_INTERACTION_REACH_FIXED)
      : policy !== null
        && craftingStationWithinReach(playerTile, row, policy.craftingStationReachTiles);
    if (inReach) stations.add(station);
  }
  return [...stations];
}

function localMount(snapshot: OverworldView): WorldNpc | null {
  if (snapshot.identityHex === null) return null;
  return snapshot.npcs.find((npc) => npc.rider?.toHexString() === snapshot.identityHex) ?? null;
}

function wildlifeProfile(snapshot: OverworldView, npcId: bigint): { readonly species: string; readonly variant: number } | null {
  const profile = snapshot.wildlifeProfiles.get(npcId);
  if (profile === undefined || runtimeCreatureDefinition(snapshot.content.registry, profile.species) === null) return null;
  return { species: profile.species, variant: profile.variant };
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
    const definition = combatTarget === undefined ? null : combatTargetDefinition(snapshot, combatTarget);
    const damageable = combatTarget === undefined ? null : combatTargetHealth(snapshot, combatTarget);
    if (combatTarget === undefined || combatTarget.carriedBy !== undefined
      || definition === null || damageable === null) return undefined;
    return {
      targetId: targetKey(target),
      displayName: definition.displayName,
      health: Math.ceil(combatTarget.healthCenti / 100),
      maxHealth: Math.max(1, Math.ceil(combatTarget.maxHealthCenti / 100)),
      portrait: { kind: 'combat_target' },
    };
  }
  const npc = snapshot.npcs.get(target.id);
  if (npc === undefined || npc.health === 0 || npc.rider !== undefined || npc.wanderDirection === 'inside_hive') return undefined;
  const profile = wildlifeProfile(snapshot, npc.id);
  const rogueProfile = snapshot.rogueEnemyProfiles.get(npc.id);
  const authoredHealth = runtimeNpcDefinition(snapshot.content.registry, npc)?.health;
  const outdoorProfile = snapshot.outdoorEnemyProfiles?.get(npc.id);
  const outdoorPresentation=outdoorProfile===undefined?null
    :outdoorEnemyPresentation(snapshot.content.registry,outdoorProfile.enemyKind);
  const wildlifeStats = profile === null ? null
    : runtimeResolveCreatureStats(snapshot.content.registry, profile.species);
  if (profile !== null && wildlifeStats === null) return undefined;
  const maximumHealth = outdoorProfile !== undefined
    ? outdoorProfile.maximumHealth
    : authoredHealth !== undefined
    ? authoredHealth
    : rogueProfile !== undefined
    ? rogueProfile.maxHealth
    : profile === null
    ? Math.max(1, npc.health, 100)
    : Math.ceil(wildlifeStats!.maxHealthCenti / 100);
  return {
    targetId: targetKey(target),
    displayName: outdoorProfile!==undefined&&outdoorPresentation?.warden===true
      ? outdoorWardenDisplayName(outdoorPresentation,outdoorProfile.wardenPhase)
      : npc.displayName.trim() || profile?.species.replaceAll('_', ' ') || npc.kind.replaceAll('_', ' '),
    health: npc.health,
    maxHealth: maximumHealth,
    portrait: {
      kind: 'npc', npcKind: npc.kind,
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
  if (runtimeNpcMount(snapshot.content.registry, mounted)?.adapter === 'horse') return mounted;
  if (mounted !== null || predicted === null) return null;
  let nearest: WorldNpc | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const npc of snapshot.npcs) {
    const mount = runtimeNpcMount(snapshot.content.registry, npc);
    if (mount?.adapter !== 'horse' || npc.rider !== undefined) continue;
    if (!isMountWithinReach(predicted.position, npc, mount)) continue;
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

function targetBoat(snapshot: OverworldView): WorldNpc | null {
  const mounted = localMount(snapshot);
  if (runtimeNpcMount(snapshot.content.registry, mounted)?.adapter === 'boat') return mounted;
  if (mounted !== null || predicted === null) return null;
  let nearest: WorldNpc | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const npc of snapshot.npcs) {
    const mount = runtimeNpcMount(snapshot.content.registry, npc);
    if (mount?.adapter !== 'boat' || npc.rider !== undefined || npc.health === 0) continue;
    if (!isMountWithinReach(predicted.position, npc, mount)) continue;
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
  | { readonly targetKind: 'placeable'; readonly id: bigint; readonly kind: string; readonly tileX: number; readonly tileY: number;
      readonly lit: boolean; readonly authoredLandmark: boolean };

function targetCampfire(snapshot: OverworldView): TargetCampfire | null {
  if (predicted === null || localMount(snapshot) !== null) return null;
  const placed = nearestTileTarget(
    predicted.position.x,
    predicted.position.y,
    [...snapshot.placeables].filter((row) => row.carriedBy === undefined
      && runtimePlaceableDefinition(snapshot.content.registry, row)?.station === 'campfire'),
    CAMPFIRE_INTERACTION_REACH_FIXED,
  );
  if (placed !== null) {
    const definition=placeableObjectDefinition(snapshot.content.registry,placed);
    const authoredLandmark=runtimeLandmarkCampfirePlans(snapshot.content.registry).some(plan => plan.runtimeId===placed.id
      &&plan.objectDefinitionId===definition?.id&&plan.spaceId===placed.spaceId
      &&plan.tileX===placed.tileX&&plan.tileY===placed.tileY);
    return {
    targetKind: 'placeable', id: placed.id, kind: placed.kind,
    tileX: placed.tileX, tileY: placed.tileY, lit: placed.lit, authoredLandmark,
    };
  }
  let nearest:TargetCampfire|null=null,nearestDistance=CAMPFIRE_INTERACTION_REACH_FIXED**2;
  for(const plan of runtimeLandmarkCampfirePlans(snapshot.content.registry)){
    if(plan.spaceId!==activeSpaceDefinition.spaceId)continue;
    const state=snapshot.campfires?.get(plan.runtimeId);
    const target=objectSecondaryTarget(state,plan.object,{lit:state?.lit??false});
    if(target===null||target.spaceId!==plan.spaceId||target.tileX!==plan.tileX||target.tileY!==plan.tileY)continue;
    const x=plan.tileX*TILE_SIZE_FIXED+TILE_SIZE_FIXED/2,y=plan.tileY*TILE_SIZE_FIXED+TILE_SIZE_FIXED/2;
    const distance=(x-predicted.position.x)**2+(y-predicted.position.y)**2;
    if(distance>nearestDistance)continue;
    nearestDistance=distance;
    nearest={targetKind:'landmark',id:target.id,tileX:target.tileX,tileY:target.tileY,lit:target.lit};
  }
  return nearest;
}

function targetPortal(snapshot: OverworldView): SpacePortal | null {
  const position = network.ownPosition();
  if (position === null) return null;
  const tileX = Math.floor(position.x / TILE_SIZE_FIXED);
  const tileY = Math.floor(position.y / TILE_SIZE_FIXED);
  const sourceLobby=runtimeHearthLobbyDefinition(snapshot.content.registry,position.spaceId);
  return [...snapshot.portals].find((portal) => {
    if(portal.fromSpace!==position.spaceId)return false;
    const authoredPortal = authoredSpacePortalPrompt(snapshot.content.registry, portal);
    if (authoredPortal.authored && authoredPortal.prompt === null) return false;
    const destination=runtimeSpaceDefinition(snapshot.content.registry,portal.toSpace);
    const destinationLobby=runtimeHearthLobbyDefinition(snapshot.content.registry,portal.toSpace);
    if((activeSpaceDefinition.generator==='delve_lobby'&&sourceLobby===null)
      ||(destination?.generator==='delve_lobby'&&destinationLobby===null))return false;
    if(sourceLobby!==null||destinationLobby!==null)return hearthLobbyPortalApproachClear(position,portal,worldCollision);
    // The cellar ladder is a wall fixture climbed from the tile at its foot.
    // Reading the settled row rather than prediction keeps the prompt and the
    // reducer's own reach test in agreement on the exact tile and facing.
    if(cellarLadderPortal(portal.kind))return cellarLadderApproachClear(position,portal);
    return Math.abs(portal.fromTileX-tileX)<=1&&Math.abs(portal.fromTileY-tileY)<=1;
  })??null;
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

function canUseHomesteadBuildMode(snapshot: OverworldView): boolean {
  if (snapshot.identityHex === null || !['homestead', 'residence', 'cellar'].includes(activeSpaceDefinition.generator)) return false;
  const home = activeSpaceDefinition.generator !== 'homestead'
    ? [...snapshot.homesteads].find(home => home.residenceSpaceId === activeSpaceDefinition.spaceId
      || (home.residenceSpaceId !== undefined && home.residenceSpaceId + 1 === activeSpaceDefinition.spaceId))
    : snapshot.homesteads.get(activeSpaceDefinition.spaceId);
  if (home === undefined) return false;
  if (home.owner.toHexString() === snapshot.identityHex) return true;
  const member = [...snapshot.homesteadMembers].find((row) => row.spaceId === home.spaceId
    && row.guest.toHexString() === snapshot.identityHex);
  return member !== undefined && isHomesteadMemberRole(member.role)
    && homesteadRoleAtLeast(member.role, 'builder');
}

type EInteractionTarget =
  | (InteractionCandidate & {readonly kind:'hearth_stash'})
  | (InteractionCandidate & {readonly kind:'hearth_supply_cache'})
  | (InteractionCandidate & {readonly kind:'ferry';readonly dock:HearthFerryDock})
  | (InteractionCandidate & { readonly kind: 'outdoor_encounter'; readonly encounterId: string })
  | (InteractionCandidate & { readonly kind: 'portal'; readonly portal: SpacePortal })
  | (InteractionCandidate & { readonly kind: 'placeable'; readonly placeable: WorldPlaceable;
      readonly presentation: ReturnType<typeof objectUseMetadata> })
  | (InteractionCandidate & { readonly kind: 'chest'; readonly chest: WorldChest })
  | (InteractionCandidate & { readonly kind: 'merchant'; readonly npc: WorldNpc })
  | (InteractionCandidate & { readonly kind: 'player'; readonly player: PlayerPosition })
  | (InteractionCandidate & { readonly kind: 'horse'; readonly npc: WorldNpc })
  | (InteractionCandidate & { readonly kind: 'boat'; readonly npc: WorldNpc })
  | (InteractionCandidate & { readonly kind: 'gatherable'; readonly resource: WorldResource;
      readonly presentation: NonNullable<ReturnType<typeof runtimeResourcePickupPresentation>> })
  | (InteractionCandidate & { readonly kind: 'quest_item'; readonly item: QuestWorldItem })
  | (InteractionCandidate & { readonly kind: 'embedded_arrow'; readonly projectile: WorldProjectile })
  | (InteractionCandidate & { readonly kind: 'orchard'; readonly resource: WorldResource })
  | (InteractionCandidate & { readonly kind: 'crop'; readonly crop: WorldCrop })
  | (InteractionCandidate & { readonly kind: 'rogue_entrance' })
  | (InteractionCandidate & { readonly kind: 'rogue_door'; readonly exit: RogueRoomExit })
  | (InteractionCandidate & { readonly kind: 'world_item'; readonly item: WorldItem });

function tileInteractionPoint(tileX: number, tileY: number): { readonly x: number; readonly y: number } {
  return {
    x: tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  };
}

function collectLegacyInteractions(snapshot: OverworldView): EInteractionTarget[] {
  if (predicted === null) return [];
  // While riding, E always means dismount, even beside a portal or another NPC.
  const ridden = localMount(snapshot);
  const mount = runtimeNpcMount(snapshot.content.registry, ridden);
  if (ridden !== null && mount !== null) return [{
    kind: mount.adapter, x: ridden.x, y: ridden.y,
    stableId: `${mount.adapter}:${ridden.id}`, npc: ridden,
  }];
  const candidates: EInteractionTarget[] = [];
  if(activeSpaceDefinition.generator==='delve_lobby'&&snapshot.rogueRun===null){
    const lobby=activeHearthLobbyDefinition(snapshot.content.registry);
    const point=lobby===null||lobby.spaceId!==activeSpaceDefinition.spaceId?null
      :tileInteractionPoint(lobby.points.stash.tileX,lobby.points.stash.tileY);
    if(point!==null&&Math.hypot(point.x-predicted.position.x,point.y-predicted.position.y)<=1.5*TILE_SIZE_FIXED)
      candidates.push({kind:'hearth_stash',...point,stableId:'hearth:personal-stash'});
  }
  if(activeSpaceDefinition.spaceId===TOPSIDE_SPACE_ID){
    const supplyCache=runtimeHearthSupplyCache(snapshot.content.registry,undefined,activeSpaceDefinition.spaceId);
    if (snapshot.rogueRun === null && supplyCache!==null
      && hearthSupplyCacheInstalled(supplyCache,liveIslandDocumentFor(snapshot))
      && hearthSupplyCacheApproachClear(supplyCache,predicted.position, worldCollision)) {
      candidates.push({kind:'hearth_supply_cache',
        ...tileInteractionPoint(supplyCache.frontage.tileX, supplyCache.frontage.tileY),
        stableId:`hearth:supply-cache:${supplyCache.endpointId}`});
    }
    const ferry=runtimeHearthFerryNetwork(snapshot.content.registry);
    for(const destination of ferry?.spaceId===activeSpaceDefinition.spaceId?ferry.destinations:[]){
      const installed=liveIslandDocumentFor(snapshot)?.combatRegions
        ?.some(region=>region.id===destination.availabilityRegion)===true;
      if(destination.home&&!installed)continue;
      const dock=destination.id,point=tileInteractionPoint(destination.threshold.tileX,destination.threshold.tileY);
      if((point.x-predicted.position.x)**2+(point.y-predicted.position.y)**2<=(2*TILE_SIZE_FIXED)**2)
        candidates.push({kind:'ferry',dock,...point,stableId:`ferry:${dock}`});
    }
  }
  for(const profile of snapshot.outdoorEnemyProfiles??[]) {
    if(outdoorEnemyPresentation(snapshot.content.registry,profile.enemyKind)?.warden!==true)continue;
    const npc=snapshot.npcs.get(profile.npcId);
    if(npc===undefined||npc.wanderDirection!=='dormant'||npc.spaceId!==activeSpaceDefinition.spaceId)continue;
    if((npc.x-predicted.position.x)**2+(npc.y-predicted.position.y)**2<=(3*TILE_SIZE_FIXED)**2)
      candidates.push({kind:'outdoor_encounter',encounterId:profile.encounterId,x:npc.x,y:npc.y,stableId:`encounter:${profile.encounterId}`});
  }
  if (snapshot.rogueRun === null) {
    for (const entry of activeSpaceDefinition.runEntrances ?? []) {
      const entrance = tileInteractionPoint(entry.tileX, entry.tileY);
      const dx = entrance.x - predicted.position.x;
      const dy = entrance.y - predicted.position.y;
      if (dx * dx + dy * dy <= (entry.reachTiles * TILE_SIZE_FIXED) ** 2) candidates.push({
        kind: 'rogue_entrance', ...entrance, stableId: `run-entrance:${entry.id}`,
      });
    }
  }
  if (snapshot.rogueRun?.phase === 'doors') {
    for (const exit of snapshot.rogueRoomExits) {
      const point = tileInteractionPoint(exit.tileX, exit.tileY);
      const dx = point.x - predicted.position.x;
      const dy = point.y - predicted.position.y;
      if (dx * dx + dy * dy <= (2.5 * TILE_SIZE_FIXED) ** 2) candidates.push({
        kind: 'rogue_door', ...point, stableId: `rogue-door:${exit.slot}`, exit,
      });
    }
  }
  const portal = targetPortal(snapshot);
  if (portal !== null) candidates.push({
    kind: 'portal', ...tileInteractionPoint(portal.fromTileX, portal.fromTileY),
    stableId: `portal:${portal.id}`, portal,
  });
  const placeable = (predicted===null?null:facedHearthSeat(snapshot.placeables,snapshot.content.registry,activeSpaceDefinition.spaceId,
    facedInteractionTile(predicted.position.x,predicted.position.y,predicted.facing)))??targetPlaceable(snapshot);
  if (placeable !== null) {
    const presentation = objectUseMetadata(snapshot.content.registry, placeable,
      objectPresentations.resolve(snapshot.content, placeable).state);
    if (hearthFurnitureShapeForPlaceable(snapshot.content.registry, placeable)?.seatPoseOffsetPixels !== undefined
      || presentation !== null) candidates.push({
      kind: 'placeable', ...tileInteractionPoint(placeable.tileX, placeable.tileY),
      stableId: `placeable:${placeable.id}`, placeable, presentation,
    });
  }
  for (const radial of snapshot.placeables) {
    if (radial.carriedBy !== undefined || radial.spaceId !== activeSpaceDefinition.spaceId
      || radial.id === placeable?.id) continue;
    const point = tileInteractionPoint(radial.tileX, radial.tileY);
    const presentation = objectUseMetadata(snapshot.content.registry, radial,
      objectPresentations.resolve(snapshot.content, radial).state);
    if (!objectUseWithinRadialReach(presentation, predicted.position.x, predicted.position.y,
      point.x, point.y, TILE_SIZE_FIXED)) continue;
    candidates.push({ kind: 'placeable', ...point,
      stableId: `placeable:${radial.id}`, placeable: radial, presentation });
  }
  const chest = targetChest(snapshot);
  if (chest !== null) candidates.push({
    kind: 'chest', ...tileInteractionPoint(chest.tileX, chest.tileY),
    stableId: `chest:${chest.id}`, chest,
  });
  const merchant = targetMerchant(snapshot);
  if (merchant !== null) candidates.push({
    kind: 'merchant', x: merchant.x, y: merchant.y,
    stableId: `merchant:${merchant.id}`, npc: merchant,
  });
  for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    if (id === snapshot.identityHex || player.spaceId !== activeSpaceDefinition.spaceId
      || snapshot.profiles.get(id)?.online !== true) continue;
    const dx = player.x - predicted.position.x;
    const dy = player.y - predicted.position.y;
    if (dx * dx + dy * dy > (3 * TILE_SIZE_FIXED) ** 2) continue;
    candidates.push({ kind: 'player', x: player.x, y: player.y, stableId: `player:${id}`, player });
  }
  const horse = targetHorse(snapshot);
  if (horse !== null) candidates.push({
    kind: 'horse', x: horse.x, y: horse.y,
    stableId: `horse:${horse.id}`, npc: horse,
  });
  const boat = targetBoat(snapshot);
  if (boat !== null) candidates.push({
    kind: 'boat', x: boat.x, y: boat.y,
    stableId: `boat:${boat.id}`, npc: boat,
  });
  for (const resource of snapshot.resources) {
    if (resource.spaceId !== activeSpaceDefinition.spaceId || resource.depleted
      || liveMapSuppressesGeneratedResource(snapshot, resource.id)
      || runtimeResourceDefinition(snapshot.content.registry, resource)?.fruitHarvest === undefined) continue;
    const point = tileInteractionPoint(resource.tileX, resource.tileY);
    const dx = point.x - predicted.position.x;
    const dy = point.y - predicted.position.y;
    if (dx * dx + dy * dy > ITEM_PICKUP_REACH_FIXED ** 2) continue;
    candidates.push({ kind: 'orchard', ...point, stableId: `resource:${resource.id}`, resource });
  }
  const gatherable = targetGatherableResource(snapshot);
  const gatherablePresentation = gatherable === null ? null
    : runtimeResourcePickupPresentation(snapshot.content.registry, gatherable);
  if (gatherable !== null && gatherablePresentation !== null) candidates.push({
    kind: 'gatherable', ...tileInteractionPoint(gatherable.tileX, gatherable.tileY),
    stableId: `resource:${gatherable.id}`, resource: gatherable, presentation: gatherablePresentation,
  });
  for (const questItem of snapshot.questWorldItems) {
    const surface = snapshot.surfaces.get(questItem.surfaceId);
    if (surface === undefined || surface.spaceId !== activeSpaceDefinition.spaceId
      || runtimeSpaceSurfaceDefinition(snapshot.content.registry, surface) === null) continue;
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
  const crop = targetCrop(snapshot);
  const cropSoil = crop === null ? undefined : snapshot.soil.get(crop.id);
  const cropDefinitionValue = cropDefinitionForSnapshot(snapshot, crop?.cropKind ?? '');
  if (crop !== null && cropSoil !== undefined && cropDefinitionValue !== null
    && snapshot.identityHex !== null && crop.owner.toHexString() === snapshot.identityHex
    && cropGrowthAt(
      cropDefinitionValue,
      crop.growthTicks,
      crop.growthUpdatedAtTick,
      cropSoil.wateredAtTick,
      snapshot.clock?.authorityTick ?? 0n,
      cropSoil.watered,
      cropAutomaticallyWateredForSnapshot(snapshot, crop.spaceId, crop.tileX, crop.tileY),
      cropCalendarOffsetForSnapshot(snapshot),
      cropGreenhouseProtectedForSnapshot(snapshot, crop.spaceId),
    ).mature) candidates.push({
    kind: 'crop', ...tileInteractionPoint(crop.tileX, crop.tileY),
    stableId: `crop:${crop.id}`, crop,
  });
  const item = targetWorldItem(snapshot);
  if (item !== null) candidates.push({
    kind: 'world_item', x: item.x, y: item.y,
    stableId: `item:${item.id}`, item,
  });
  return candidates;
}

/** Existing entity adapters register through the same extension point as new
 * UI-opening or action-performing world entities. */
export const worldInteractions = new WorldInteractionRegistry<OverworldView, EInteractionTarget>();
worldInteractions.register('seated-player', () => {
  const position = network.ownPosition();
  return position?.actionKind !== 'sitting' ? [] : [{
    kind: 'player-state', stableId: 'self:stand', x: position.x, y: position.y,
    exclusive: true, priority: -1, prompt: '[E] STAND / MOVE TO STAND',
    activate: () => showResult(network.standHearthFurniture(), null),
  }];
});
worldInteractions.register('existing-world-entities', snapshot => {
  const riding = localMount(snapshot) !== null;
  return collectLegacyInteractions(snapshot).map(target => ({
    ...target,
    exclusive: riding && (target.kind === 'horse' || target.kind === 'boat'),
    prompt: interactionPrompt(target, snapshot),
    activate: () => activateInteraction(target, snapshot),
    payload: target,
  }));
});

function targetInteraction(snapshot: OverworldView) {
  return predicted === null ? null
    : worldInteractions.resolve(snapshot, predicted.position.x, predicted.position.y);
}

function interactionPrompt(target: EInteractionTarget, snapshot: OverworldView): string | null {
  const woodcuttingAction = selectedWoodcuttingUseWithAction(
    liveItemContentDefinition(snapshot, selectedItem(snapshot)),
  );
  switch (target.kind) {
    case 'hearth_stash': return '[E] PERSONAL STASH';
    case 'hearth_supply_cache': return '[E] PERSONAL SUPPLY CACHE';
    case 'ferry': return '[E] CHOOSE FERRY DESTINATION';
    case 'outdoor_encounter': return '[E] AWAKEN CALDERA WARDEN';
    case 'portal': {
      const ownerName = homesteadPortalName(target.portal.kind);
      if (ownerName !== null) return `[E] ENTER ${ownerName.toUpperCase()}'S FARM`;
      if (target.portal.kind.startsWith('residence_enter:')) return '[E] ENTER HOME';
      if (target.portal.kind.startsWith('residence_exit:')) return '[E] LEAVE HOME';
      if (target.portal.kind.startsWith('cellar_enter:')) return '[E] CLIMB DOWN';
      if (target.portal.kind.startsWith('cellar_exit:')) return '[E] CLIMB UP';
      const authoredPrompt = authoredSpacePortalPrompt(snapshot.content.registry, target.portal).prompt;
      if (authoredPrompt !== null) return `[E] ${authoredPrompt}`;
      return target.portal.kind.startsWith('homestead_exit:') ? '[E] LEAVE FARM' : '[E] USE PORTAL';
    }
    case 'placeable': {
      if(hearthFurnitureShapeForPlaceable(
        snapshot.content.registry, target.placeable,
      )?.seatPoseOffsetPixels!==undefined)return '[E] SIT';
      const usePrompt = `[E] ${target.presentation?.prompt ?? 'USE'}`;
      const damageable = runtimeObjectDamageable(snapshot.content.registry, target.placeable);
      if (damageable?.model === 'hits' && damageable.toolSpecialization === 'woodcutting'
        && woodcuttingAction !== null) return `${usePrompt}  [F] BREAK WITH AXE`;
      // Heavy stations are carried in both hands, never pocketed: the hint
      // only appears while the placeable is faced and the hands are free.
      const carriable = targetPlaceable(snapshot)?.id === target.placeable.id
        && runtimeObjectCarry(snapshot.content.registry, target.placeable)?.mode === 'preserve_entity'
        && carriedChest(snapshot) === null && carriedCombatTarget(snapshot) === null
        && carriedPlaceable(snapshot) === null;
      return carriable ? `${usePrompt}  [F] CARRY` : usePrompt;
    }
    case 'chest': return woodcuttingAction !== null
      ? '[E] OPEN CHEST  [F] BREAK WITH AXE'
      : targetFacedChest(snapshot)?.id === target.chest.id
        ? '[E] OPEN CHEST  [F] PICK UP'
        : '[E] OPEN CHEST';
    case 'merchant': return `[E] TALK TO ${target.npc.displayName.toUpperCase()}`;
    case 'player': return `[E] TRADE WITH ${(snapshot.profiles.get(target.player.identity.toHexString())?.displayName ?? 'PLAYER').toUpperCase()}`;
    case 'horse': return localMount(snapshot) !== null
      ? `[E] DISMOUNT ${horseLabel(target.npc).toUpperCase()}`
      : `[E] RIDE ${horseLabel(target.npc).toUpperCase()}`;
    case 'boat': return runtimeNpcMount(snapshot.content.registry, localMount(snapshot))?.adapter === 'boat'
      ? '[E] LEAVE BOAT'
      : '[E] BOARD BOAT';
    case 'orchard': return orchardHarvestPrompt(snapshot.content.registry, target.resource, snapshot.clock?.authorityTick ?? 0n);
    case 'gatherable': return `[E] PICK UP ${target.presentation.promptLabel.toUpperCase()}`;
    case 'quest_item': return `[E] PICK UP ${liveItemLabel(snapshot, target.item.itemKind)}`;
    case 'embedded_arrow': return '[E] RECOVER ARROW';
    case 'crop': return `[E] HARVEST ${(runtimeCropDefinition(snapshot.content.registry, target.crop.cropKind)?.displayName ?? 'CROP').toUpperCase()}`;
    case 'rogue_entrance': return '[E] BEGIN A DELVE';
    case 'rogue_door': return `[E] ENTER ${target.exit.label.toUpperCase()}`;
    case 'world_item': {
      const definition = liveItemContentDefinition(snapshot, target.item.itemKind);
      const worldUse = selectedItemLifecycleAction(definition, 'worldItemUse');
      const pickUp = `[E] PICK UP ${liveItemLabel(snapshot, target.item.itemKind)} x${target.item.quantity}`;
      return worldUse !== null && definition?.light !== undefined
        ? `${pickUp}  [F] TURN ${target.item.lit ? 'OFF' : 'ON'}`
        : pickUp;
    }
  }
}

function activateInteraction(target: EInteractionTarget, snapshot: OverworldView): void {
  switch (target.kind) {
    case 'hearth_stash':
      showResult(network.openHearthStash(),null);return;
    case 'hearth_supply_cache':
      showResult(network.openHearthSupplyCache(), 'PERSONAL STASH: SHARED WITH DELVE LOBBY');return;
    case 'ferry':
      overworldUi.openFerry(target.dock);return;
    case 'outdoor_encounter':
      showResult(network.activateOutdoorEncounter(target.encounterId), 'THE CALDERA WARDEN AWAKENS');
      return;
    case 'portal':
      portalTransitionStartedAtMs = performance.now();
      showResult(network.usePortal(target.portal.id), null);
      return;
    case 'placeable':
      if(hearthFurnitureShapeForPlaceable(
        snapshot.content.registry, target.placeable,
      )?.seatPoseOffsetPixels!==undefined){showResult(network.sitHearthFurniture(target.placeable.id),null);return;}
      showResult(
        network.interactEntity('placeable', target.placeable.id, 'use'),
        target.presentation?.feedback ?? null,
      );
      return;
    case 'chest':
      showResult(network.interactEntity('placeable', target.chest.id, 'use'), 'CHEST OPENED');
      return;
    case 'merchant':
      overworldUi.openWindow = null;
      showResult(network.interactNpc(target.npc.id), `TALKING TO ${target.npc.displayName.toUpperCase()}`);
      return;
    case 'player':
      showResult(network.requestTrade(target.player.identity), 'TRADE REQUEST SENT');
      return;
    case 'horse': {
      const dismounting = localMount(snapshot) !== null;
      showResult(
        network.interactEntity('npc', target.npc.id, 'use'),
        dismounting
          ? `DISMOUNTED ${horseLabel(target.npc).toUpperCase()}`
          : `RIDING ${horseLabel(target.npc).toUpperCase()}`,
      );
      return;
    }
    case 'boat': {
      const dismounting = runtimeNpcMount(snapshot.content.registry, localMount(snapshot))?.adapter === 'boat';
      showResult(network.interactEntity('npc', target.npc.id, 'use'), dismounting ? 'LEFT BOAT' : 'BOARDED BOAT');
      return;
    }
    case 'orchard':
      if (orchardFruitStatus(target.resource, snapshot.clock?.authorityTick ?? 0n) !== 'ok') return;
      showResult(network.gatherWorldResource(target.resource.id), 'FRUIT PICKED', startPredictedAction('pickup'));
      return;
    case 'gatherable':
      showResult(
        network.gatherWorldResource(target.resource.id),
        `PICKED UP ${target.presentation.feedbackLabel.toUpperCase()}`,
        startPredictedAction('pickup'),
      );
      return;
    case 'quest_item':
      showResult(network.pickupQuestWorldItem(target.item.id), 'QUEST OBJECTIVE COMPLETE', startPredictedAction('pickup'));
      return;
    case 'embedded_arrow':
      showResult(network.pickupEmbeddedArrow(target.projectile.id), 'RECOVERED ARROW', startPredictedAction('pickup'));
      return;
    case 'crop':
      showResult(network.harvestCropTile(target.crop.tileX, target.crop.tileY), 'CROP HARVESTED', startPredictedAction('pickup'));
      return;
    case 'rogue_entrance':
      overworldUi.openWindow = 'delve-confirmation';
      return;
    case 'rogue_door':
      portalTransitionStartedAtMs = performance.now();
      showResult(network.chooseRogueDoor(target.exit.slot), `ENTERING ${target.exit.label.toUpperCase()}`);
      return;
    case 'world_item':
      showResult(
        network.pickupWorldItem(target.item.id),
        `PICKED UP ${liveItemLabel(snapshot, target.item.itemKind)} x${target.item.quantity}`,
        startPredictedAction('pickup'),
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
  renderedPosition: { readonly x: number; readonly y: number },
): void {
  if (predicted === null) return;
  const itemKind = selectedItem(snapshot);
  const toolDefinition = runtimeToolDefinition(snapshot.content.registry, itemKind);
  if (toolDefinition === null) return;
  const swingTool = toolUsesForwardSwing(toolDefinition);
  const reachFixed = resourceToolReachFixed(toolDefinition);
  const origin = swingTool ? playerInteractionOrigin(renderedPosition)
    : tileToolInteractionOrigin(toolDefinition, renderedPosition);
  const facing = liveEquippedItemFacing(snapshot, itemKind, predicted.facing, cursorFacing());
  const vector = directionUnitVector(facing);
  const forwardOffset = resourceToolForwardOffsetFixed(toolDefinition);
  const centerX = origin.x + vector[0] * forwardOffset;
  const centerY = origin.y + vector[1] * forwardOffset;
  const projection = terrainProjectedDepthAtFoot(
    terrain,
    centerX / FIXED_UNITS_PER_PIXEL,
    toolDefinition.specialization === 'farming'
      ? terrainContactWorldYForPlayer(renderedPosition.y / FIXED_UNITS_PER_PIXEL)
      : centerY / FIXED_UNITS_PER_PIXEL,
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
    const bounds = survivalResourceObstacle(
      target.kind, target.tileX, target.tileY, snapshot.content.registry,
    );
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
  const planeProjection = (activeElevation - terrainBaseDatum(terrain))
    * terrainVisualProjectionRowsPerLevel(terrain) * 16;
  const bounds = terrainTileBounds(terrain);
  const minX = Math.max(bounds.minX, Math.floor(cameraX / 16));
  const minY = Math.max(bounds.minY, Math.floor((cameraY + planeProjection) / 16));
  const maxX = Math.min(bounds.maxX, Math.ceil((cameraX + viewportWidth / scale) / 16));
  const maxY = Math.min(
    bounds.maxY,
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
  const label = `HEIGHT ${activeElevation}`;
  const labelScale = Math.max(1, Math.round(scale));
  context.fillStyle = '#07120ddd';
  context.fillRect(4, 4, Math.max(96, measurePixelText(label, labelScale, art.ui.font) + 8), 7 * labelScale + 4);
  drawPixelText(context, art.ui, label, 8, 6, { color: '#f6f0d8', scale: labelScale });
  context.restore();
}

function currentFurniture() {
  return [...latestSnapshot.placeables].filter(row => row.spaceId === activeSpaceDefinition.spaceId)
    .flatMap(row => { const item = hearthFurniturePlacementFromRow(
      latestSnapshot.content.registry, row,
    ); return item ? [item] : []; });
}

function furniturePreviewAt(tile: { tileX: number; tileY: number }, itemKind: string, movingId?: string) {
  const quantity = movingId !== undefined ? 1 : [...latestSnapshot.inventorySlots].filter(row => row.slot < EQUIPMENT_SLOT_OFFSET && row.itemKind === itemKind)
    .reduce((sum, row) => sum + row.quantity, 0);
  const position = predicted?.position ?? { x: 0, y: 0 };
  const occupants = [...latestSnapshot.players].filter(row => row.spaceId === activeSpaceDefinition.spaceId);
  const canBuild = canUseHomesteadBuildMode(latestSnapshot);
  const key = `${latestSnapshot.content.registry.contentHash}:${network.resourceRevision}:${canBuild}:${tile.tileX},${tile.tileY}:${itemKind}:${movingId ?? ''}:${quantity}:${position.x},${position.y}:`
    + occupants.map(row => `${row.x},${row.y}`).join(';');
  if (furniturePreviewCache?.collision === furnitureCollision && furniturePreviewCache.key === key) return furniturePreviewCache.value;
  const corrupt = [...latestSnapshot.placeables].some(row => row.spaceId === activeSpaceDefinition.spaceId && row.carriedBy === undefined
    && hearthFurnitureShapeForPlaceable(latestSnapshot.content.registry, row) !== null
    && !objectPresentations.resolve(latestSnapshot.content, row).stateJsonValid);
  let value = corrupt ? { candidate: null, failure: 'Furniture state needs repair' } : furnishingPreview(latestSnapshot.content.registry, {
    canBuild, collision: furnitureCollision, existing: currentFurniture(),
    reserved: residenceReservedTiles(activeSpaceDefinition.residenceExpansionRank),
    exit: RESIDENCE_EXIT_TILE, occupants,
  }, position, itemKind, tile.tileX, tile.tileY, quantity, movingId);
  if(value.candidate!==null && value.failure===null && activeSpaceDefinition.residenceArchitectureJson!==undefined) {
    const state=parseHearthArchitectureState(activeSpaceDefinition.residenceArchitectureJson);
    const rank=activeSpaceDefinition.residenceExpansionRank??0;
    const checked=state===null?null:composeHearthArchitecture(rank,{...furnitureCollision,
      blocked:Array.from({length:furnitureCollision.width*furnitureCollision.height},(_,i)=>
        !residencePlayableTile(i%furnitureCollision.width,Math.floor(i/furnitureCollision.width),rank)),
      obstacles:[...(furnitureCollision.obstacles??[]), ...[...currentFurniture().filter(item=>item.id!==movingId),value.candidate]
        .flatMap(item=>{const obstacle=hearthFurnitureObstacle(item);return obstacle?[obstacle]:[];})],
    },state.cells);
    if(state!==null&&hearthDoorwayWallAttachmentFailure(state.cells,[value.candidate])!==null)value={...value,failure:'Doorway support needs clear wall space'};
    if(checked===null || checked.failure!==null)value={...value,failure:checked===null?'Construction state needs repair':'Keep the doorway and its approach clear'};
  }
  furniturePreviewCache = { collision: furnitureCollision, key, value };
  return value;
}

function computeConstructionPreviewAt(tile:{tileX:number;tileY:number}) {
  const state=parseHearthArchitectureState(activeSpaceDefinition.residenceArchitectureJson??EMPTY_HEARTH_ARCHITECTURE_JSON);
  const tool=homesteadBuildPalette.constructionTool;
  if(state===null||tool===null)return {failure:'Construction state needs repair',footprint:[tile]} as const;
  const footprint=hearthConstructionToolFootprint(state,tool,tile.tileX,tile.tileY);
  const intent=hearthConstructionToolEdits(state,tool,tile.tileX,tile.tileY);
  if(intent.failure!==null)return {...intent,footprint};
  const rank=activeSpaceDefinition.residenceExpansionRank??0;
  const plan=planHearthArchitectureEdits(latestSnapshot.content.registry,{rank,state,expectedRevision:state.revision,edits:intent.edits,
    context:{canBuild:canUseHomesteadBuildMode(latestSnapshot),existing:currentFurniture(),occupants:[],
      collision:{...furnitureCollision,blocked:Array.from({length:furnitureCollision.width*furnitureCollision.height},(_,i)=>
        !residencePlayableTile(i%furnitureCollision.width,Math.floor(i/furnitureCollision.width),rank))}},
  });
  if(plan.failure!==null)return {...plan,failure:plan.failure==='doorway_support_occupied'?'Doorway support needs clear wall space':plan.failure,footprint};
  const materials=Object.entries(plan.materialDelta).map(([item,count])=>`${count>0?'RETURN':'USE'} ${Math.abs(count)} ${item.replaceAll('_',' ').toUpperCase()}`);
  return {failure:null,edits:intent.edits,revision:state.revision,materials,footprint};
}

let constructionProposal:{scope:string;tool:NonNullable<typeof homesteadBuildPalette.constructionTool>;tile:{tileX:number;tileY:number};
  preview:Extract<ReturnType<typeof computeConstructionPreviewAt>,{failure:null}>}|null=null;
function constructionScope():string{return `${latestSnapshot.identityHex}:${network.sessionGeneration}:${activeSpaceDefinition.spaceId}`;}
function applyConstructionProposal():void {
  const proposal=constructionProposal;
  if(proposal===null||constructionRequests.pending)return;
  const preview=computeConstructionPreviewAt(proposal.tile);
  if(proposal.scope!==constructionScope()||proposal.tool!==homesteadBuildPalette.constructionTool||preview.failure!==null
    ||preview.revision!==proposal.preview.revision||JSON.stringify(preview.edits)!==JSON.stringify(proposal.preview.edits)){
    constructionProposal=null;setToast('CONSTRUCTION CHANGED — SELECT THE TILE AGAIN','failure',150);return;
  }
  constructionRequests.sync(proposal.scope,preview.revision);
  const request=constructionRequests.begin();
  if(request!==null)void network.editResidenceArchitecture(request.revision,preview.edits).catch(error=>{
    if(constructionRequests.fail(request.token)){constructionProposal=null;setToast(String(error).toUpperCase(),'failure',180);}
  });
}

let constructionPreviewCache:{collision:CollisionMap;key:string;value:ReturnType<typeof computeConstructionPreviewAt>}|null=null;
function constructionPreviewAt(tile:{tileX:number;tileY:number}) {
  const key=`${activeSpaceDefinition.spaceId}:${activeSpaceDefinition.residenceExpansionRank}:${activeSpaceDefinition.residenceArchitectureJson}:${network.resourceRevision}:${latestSnapshot.content.registry.contentHash}:${canUseHomesteadBuildMode(latestSnapshot)}:${homesteadBuildPalette.constructionTool}:${tile.tileX},${tile.tileY}`;
  if(constructionPreviewCache?.collision===furnitureCollision&&constructionPreviewCache.key===key)return constructionPreviewCache.value;
  const value=computeConstructionPreviewAt(tile);
  constructionPreviewCache={collision:furnitureCollision,key,value};return value;
}

function drawFurniturePreview(context: CanvasRenderingContext2D, cameraX: number, cameraY: number, scale: number): void {
  const tile = constructionProposal?.tile??hoveredInteractionTile;
  if (tile === null) { furnishingStatus = undefined; constructionStatus=undefined; return; }
  if(homesteadBuildPalette.constructionTool!==null){
    const preview=constructionProposal?.preview??constructionPreviewAt(tile);
    constructionStatus={footprint:preview.footprint.length,materials:preview.failure===null?preview.materials:[],
      notice:constructionRequests.pending?'WAITING FOR SERVER':preview.failure!==null?preview.failure.replaceAll('_',' ').toUpperCase():constructionProposal?'REACH, SPACE AND BAGS CHECKED ON APPLY':'CLICK TILE TO REVIEW BEFORE APPLY'};
    furnishingStatus=undefined;
    context.save();
    context.fillStyle=preview.failure===null?'rgba(220,180,70,0.3)':'rgba(190,48,61,0.4)';
    context.strokeStyle=preview.failure===null?'#edcb79':'#ff6671';
    for(const cell of preview.footprint){
      const x=Math.round((cell.tileX*16-cameraX)*scale),y=Math.round((cell.tileY*16-cameraY)*scale);
      context.fillRect(x,y,16*scale,16*scale);context.strokeRect(x,y,16*scale,16*scale);
    }
    context.restore();return;
  }
  const selection = homesteadBuildPalette.selection;
  const moving = selection.kind === 'move' ? furnitureMoves.selected : null;
  const preview = selection.kind === 'place' ? furniturePreviewAt(tile, selection.itemKind)
    : moving ? furniturePreviewAt(tile, moving.kind, moving.id.toString()) : null;
  const picked = selection.kind === 'remove' || (selection.kind === 'move' && !moving)
    ? furnitureAtTile(currentFurniture(), tile.tileX, tile.tileY) : null;
  const item = preview?.candidate ?? picked;
  const pickupFailure = picked ? furniturePickupFailure(picked, currentFurniture(), predicted?.position ?? { x: 0, y: 0 },
    furnitureCollision, latestSnapshot.activePlaceable?.id.toString() === picked.id) : 'Select furniture to pick up';
  furnishingStatus = furnitureMoves.pending ? 'WAITING FOR SERVER' : preview?.failure ?? (preview ? undefined : pickupFailure
    ?? (selection.kind === 'move' ? 'SELECT FURNITURE TO MOVE' : 'PICK UP — BAG AND STORAGE CHECKED ON CLICK'));
  const valid = preview ? preview.failure === null : picked === null || pickupFailure !== null ? false : null;
  context.save();
  for (const cell of item ? hearthFurnitureCells(item) : [tile]) {
    const x = Math.round((cell.tileX * 16 - cameraX) * scale), y = Math.round((cell.tileY * 16 - cameraY) * scale);
    context.fillStyle = valid === null ? 'rgba(220,180,70,0.3)' : valid ? 'rgba(92,199,102,0.3)' : 'rgba(190,48,61,0.4)';
    context.fillRect(x, y, 16 * scale, 16 * scale);
    context.strokeStyle = valid === null ? '#edcb79' : valid ? '#9df38c' : '#ff6671';
    context.strokeRect(x, y, 16 * scale, 16 * scale);
  }
  const previewItemKind = selection.kind === 'place' ? selection.itemKind : moving?.kind;
  if (preview?.candidate && previewItemKind) {
    const definition = placeableObjectDefinition(latestSnapshot.content.registry, previewItemKind);
    const sprite = definition ? objectPresentations.resolve(latestSnapshot.content, { id: 0n, kind: previewItemKind,
      definitionId: definition.id, stateJson: '{}', lit: true, open: false }).sprite : null;
    const anchor = hearthFurniturePresentationAnchor(preview.candidate, currentFurniture());
    if (sprite?.asset && anchor) {
      context.globalAlpha = valid ? .65 : .35;
      drawAuthoredOverworldObject(context, sprite.asset, sprite.animation, 0, anchor.x, anchor.y, cameraX, cameraY, scale, sprite.scale);
    }
  }
  context.restore();
}

function drawHomesteadBuildGrid(
  context: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  if (activeSpaceDefinition.generator === 'residence') {
    drawFurniturePreview(context, cameraX, cameraY, scale);
    return;
  }
  const bounds = homesteadPlotBounds(activeSpaceDefinition.sizeTiles);
  const left = (bounds.minimumX * 16 - cameraX) * scale;
  const top = (bounds.minimumY * 16 - cameraY) * scale;
  const right = ((bounds.maximumX + 1) * 16 - cameraX) * scale;
  const bottom = ((bounds.maximumY + 1) * 16 - cameraY) * scale;
  context.save();
  context.fillStyle = 'rgba(255, 225, 137, 0.055)';
  context.fillRect(left, top, right - left, bottom - top);
  context.strokeStyle = 'rgba(255, 241, 184, 0.22)';
  context.lineWidth = 1;
  context.beginPath();
  for (let tileX = bounds.minimumX; tileX <= bounds.maximumX + 1; tileX += 1) {
    const x = Math.round((tileX * 16 - cameraX) * scale) + 0.5;
    context.moveTo(x, top);
    context.lineTo(x, bottom);
  }
  for (let tileY = bounds.minimumY; tileY <= bounds.maximumY + 1; tileY += 1) {
    const y = Math.round((tileY * 16 - cameraY) * scale) + 0.5;
    context.moveTo(left, y);
    context.lineTo(right, y);
  }
  context.stroke();
  context.strokeStyle = 'rgba(255, 211, 105, 0.9)';
  context.lineWidth = Math.max(1, scale);
  context.strokeRect(left, top, right - left, bottom - top);
  const tile = hoveredInteractionTile;
  if (tile !== null) {
    const selection = homesteadBuildPalette.selection;
    const tent = homesteadTentFootprint(HOMESTEAD_TENT_TILE.tileX, HOMESTEAD_TENT_TILE.tileY, true);
    const selectedBuild = selection.kind === 'place'
      ? runtimeHomesteadBuildDefinition(latestSnapshot.content.registry, selection.itemKind)
      : null;
    const previewTiles = selectedBuild === null
      ? [tile]
      : homesteadBuildFootprintTiles(selectedBuild, tile.tileX, tile.tileY);
    const existing = latestSnapshot.placeables.find((placeable) => {
      if (placeable.carriedBy !== undefined) return false;
      const build = runtimeHomesteadBuildDefinition(latestSnapshot.content.registry, placeable);
      return homesteadBuildFootprintTiles(
        build ?? { footprint: { width: 1, height: 1 } },
        placeable.tileX,
        placeable.tileY,
      ).some((footprintTile) => footprintTile.tileX === tile.tileX && footprintTile.tileY === tile.tileY);
    });
    const valid = selection.kind === 'remove'
      ? existing !== undefined
      : previewTiles.every((previewTile) => {
        const residenceBlocked = previewTile.tileX >= tent.minX && previewTile.tileX <= tent.maxX
          && previewTile.tileY >= tent.minY && previewTile.tileY <= tent.maxY;
        return homesteadPlayableTile(previewTile.tileX, previewTile.tileY, activeSpaceDefinition.sizeTiles)
          && !residenceBlocked
          && latestSnapshot.soil.get(farmSoilKey(
            previewTile.tileX,
            previewTile.tileY,
            activeSpaceDefinition.spaceId,
          )) === undefined
          && !placementTileBlocked(latestSnapshot, previewTile);
      });
    for (const previewTile of previewTiles) {
      const tileLeft = Math.round((previewTile.tileX * 16 - cameraX) * scale);
      const tileTop = Math.round((previewTile.tileY * 16 - cameraY) * scale);
      context.fillStyle = valid ? 'rgba(92, 199, 102, 0.38)' : 'rgba(190, 48, 61, 0.44)';
      context.fillRect(tileLeft, tileTop, 16 * scale, 16 * scale);
      context.strokeStyle = valid ? '#9df38c' : '#ff6671';
      context.lineWidth = Math.max(1, scale);
      context.strokeRect(tileLeft, tileTop, 16 * scale, 16 * scale);
    }
    if (selection.kind === 'place') {
      context.save();
      context.globalAlpha = valid ? 0.62 : 0.42;
      context.filter = valid ? 'brightness(1.15)' : 'grayscale(0.7) sepia(1) hue-rotate(315deg) saturate(3)';
      drawOverworldPlaceable(
        context,
        art,
        selection.itemKind,
        false,
        0,
        0,
        tile.tileX * 16 + 8,
        (tile.tileY + 1) * 16,
        cameraX,
        cameraY,
        scale,
        true,
      );
      context.restore();
    }
  }
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

function developerOrePreviewEnabled(snapshot: OverworldView): boolean {
  return cellarOrePreview && canAdministerWorld(snapshot.membership?.role)
    && activeSpaceDefinition.generator === 'cellar';
}

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
  if (!developerOrePreviewEnabled(latestSnapshot)) return 0;
  const bounds = terrainTileBounds(terrain);
  const minimumX = Math.max(bounds.minX + 1, Math.floor(cameraX / 16) - 1);
  const minimumY = Math.max(bounds.minY + 1, Math.floor(cameraY / 16) - 1);
  const maximumX = Math.min(bounds.maxX - 1, Math.ceil((cameraX + viewportWidth / scale) / 16) + 1);
  const maximumY = Math.min(bounds.maxY - 1, Math.ceil((cameraY + viewportHeight / scale) / 16) + 1);
  let count = 0;
  context.save();
  for (let tileY = minimumY; tileY <= maximumY; tileY += 1) {
    for (let tileX = minimumX; tileX <= maximumX; tileX += 1) {
      if (terrain.blocked[terrainIndexAt(terrain, tileX, tileY)] !== true) continue;
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

function drawDetectedBuriedOre(
  context: CanvasRenderingContext2D,
  snapshot: OverworldView,
  cameraX: number,
  cameraY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (developerOrePreviewEnabled(snapshot)) return 0;
  const ores = resourcePerceptionForSnapshot(snapshot).buriedOre;
  let count = 0;
  context.save();
  for (const ore of ores) {
    const x = (ore.tileX * 16 - cameraX) * scale;
    const y = (ore.tileY * 16 - cameraY) * scale;
    if (x + 16 * scale < 0 || y + 16 * scale < 0 || x >= viewportWidth || y >= viewportHeight) continue;
    context.fillStyle = ore.identified ? CELLAR_ORE_PREVIEW_COLORS[ore.oreKind] ?? '#969696aa' : '#969696aa';
    context.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(16 * scale)), Math.max(1, Math.round(16 * scale)));
    count += 1;
  }
  context.restore();
  return count > 0 ? 1 : 0;
}

function render(alpha = 1): void {
  renderWithGameplayLightingFallback(alpha, renderFrame, () => lightingEffectsDisabled,
    (reason) => { lightingFailure = reason; });
}

function renderFrame(alpha = 1): void {
  const renderStarted = performance.now();
  let renderItems = 0;
  const snapshot = latestSnapshot;
  const previousQuality = lightingQuality.effective;
  atlasPresentation.prepare(lightingQuality, lightingModel, lightingFailure);
  const frameLightingModel = atlasPresentation.model;
  lightingEffectsDisabled = lightingQuality.effective === 'basic';
  if (previousQuality !== lightingQuality.effective || atlasPresentation.modelChanged) {
    if (lightingEffectsDisabled) {
      releaseDynamicLighting();
      for (const stage of ['lightingBoundsResize', 'lightingOcclusionRaster', 'lightingSolve', 'lightingMerge', 'lightingUpload', 'lightingReceiver', 'lightingComposite'] as const) renderMetrics.resetStage(stage);
    }
    collisionKey = '';
    refreshCollision(snapshot);
  }
  const dynamicLighting = !lightingEffectsDisabled;
  const seasonalDynamic = dynamicLighting && frameLightingModel === 'unified';
  const predictedPosition = predicted?.position;
  const renderedLocalBase = predictedPosition === undefined
    ? null
    : interpolateFixedPosition(previousPredicted?.position ?? predictedPosition, predictedPosition, alpha);
  const renderedLocal = renderedLocalBase === null ? null : presentationCorrection.apply(renderedLocalBase, alpha);
  const localAuthority = snapshot.identityHex === null ? undefined : snapshot.players.get(snapshot.identityHex);
  const loadingStage = currentWorldLoadingStage();
  setLoadingScreenStage(loadingStage);
  if (loadingStage.ready !== true || !network.gameplayReady) {
    const viewport = hudViewportCss();
    const uiScale = fittedUiScale(desiredUiScale, viewport.width, viewport.height);
    overworldUi.setPwaUpdateStatus(pwaClient.status, {
      width: viewport.width / uiScale, height: viewport.height / uiScale,
    });
    canvas.classList.add('update-prompt-active');
    dismissLoadingScreen();
    const overlayViewport = {
      scale: uiScale, left: safeAreaInsets.left, top: safeAreaInsets.top,
      width: viewport.width / uiScale, height: viewport.height / uiScale,
    };
    if (overworldUi.blockingUpdatePromptVisible) {
      worldUpdateOverlay.draw(renderer, overworldUi, overlayViewport, hasRenderedWorldFrame);
    } else {
      worldUpdateOverlay.reset();
      const recoveryState = connectionRecoveryState();
      if (recoveryState === null) {
        drawInitialWorldLoading(renderer, {
          kitArt, apple: art.fruitItems['apple'] ?? art.missingItem, cask: art.itemIcons['barrel'],
        }, loadingStage, import.meta.env.VITE_CLIENT_VERSION, safeAreaInsets);
      } else {
        connectionRecoveryOverlay.composite(renderer, overlayViewport, recoveryState, hasRenderedWorldFrame);
      }
    }
    const submittedAt = performance.now();
    renderMetrics.record(submittedAt - renderStarted, 0);
    renderMetrics.recordRenderSubmit(submittedAt);
    return;
  }
  worldUpdateOverlay.reset();
  dismissLoadingScreen();
  const localJumpState = snapshot.identityHex === null ? undefined : snapshot.playerJumps.get(snapshot.identityHex);
  const cameraJump = localAuthority === undefined ? null : horseJumpPose(
    localJumpState?.fromX,
    localJumpState?.fromY,
    localAuthority.x,
    localAuthority.y,
    localJumpState?.untilTick,
    renderTickClock.renderTick,
  );
  const localX = (cameraJump?.x ?? renderedLocal?.x ?? 96 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const localY = (cameraJump?.footY ?? renderedLocal?.y ?? 96 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  // The camera's tiles choose the chunk window (and what the chunk runtime pins)
  // before this frame's terrain is served (S4c), so a teleport, a return to
  // topside or a newly serving store never draws from the previous window.
  if (activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID) worldSource.setView(estimatedCameraTiles(localX, localY));
  const terrain = terrainForSnapshot(snapshot);
  // Chunk window moves (S4c) drop only the ground chunks whose data changed.
  worldSource.drainGroundInvalidations((region) => {
    groundCache.invalidateRegion(region.minX, region.minY, region.maxX, region.maxY);
  });
  const localTerrainContactY = terrainContactWorldYForPlayer(localY);
  const projectedLocalY = terrainProjectedWorldYAtFoot(terrain, localX, localTerrainContactY)
    + (localY - localTerrainContactY);
  const frame = renderer.beginWorld(worldZoom);
  const context = frame.world;
  setWorldAssetPresentation(context, seasonalDynamic ? atlasPresentation.pages : undefined,
    seasonalDynamic ? 'omit-baked-shadow' : 'original');
  setGroundLightSource(context);
  if (terrainProjectionStyle(terrain) === 'interior') {
    // Cave_Walls is authored against this rock-shadow colour. Painting the
    // viewport first lets projected transparent pixels blend into solid cave
    // instead of exposing a disconnected black void.
    const family = terrain.defaultCliffFamily ?? 'stone_1';
    context.fillStyle = family === 'volcanic_interior'
      ? '#211519'
      : family.startsWith('dungeon_') ? '#131827'
        : terrain.rogueTheme === 'cave' ? '#241d25' : '#3f2023';
    context.fillRect(0, 0, frame.layout.width, frame.layout.height);
  }
  const scale = frame.layout.integerScale;
  const viewportWidth = frame.layout.width / scale;
  const viewportHeight = frame.layout.height / scale;
  const worldPixels = activeSpaceDefinition.sizeTiles * 16;
  const cameraX = snapGameplayCamera(
    lightingPreview?.cameraX ?? cameraAxisOffset(localX, viewportWidth, worldPixels), scale,
  );
  const cameraY = snapGameplayCamera(
    lightingPreview?.cameraY ?? cameraAxisOffset(projectedLocalY, viewportHeight, worldPixels), scale,
  );
  latestCameraX = cameraX;
  latestCameraY = cameraY;
  latestRenderedZoom = worldZoom;
  refreshHoveredInteractionTile();
  const renderWeatherTick = calendarTickForSnapshot(snapshot);
  const renderAuthorityTick = snapshot.clock?.authorityTick ?? 0n;
  const weatherVisualTick = weatherTickClock.advance(renderStarted, renderWeatherTick);
  const activeWeather = weatherVisualState(worldWeatherMode(), renderWeatherTick, worldWindDirection());
  const renderWeather = activeSpaceDefinition.environment === 'outdoor' && activeSpaceDefinition.weather
    ? activeWeather
    : { ...activeWeather, raining: false, cloudShadow: 0, cloudCover: 0, wind: 0 };
  const hudViewport = hudViewportCss();
  const uiScale = fittedUiScale(desiredUiScale, hudViewport.width, hudViewport.height);
  renderMetrics.recordStage('snapshotPrepare', performance.now() - renderStarted);
  const drawGround = (): void => {
  const groundStartedAt = performance.now();
  renderItems += groundCache.draw(context, art, terrain, cameraX, cameraY, scale, frame.layout.width, frame.layout.height);
  renderItems += drawAnimatedTerrain(
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
  renderItems += drawInsetGround(
    context,
    art.dirtTerrace,
    art.farmlandGrassInset,
    activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
      ? [
          ...generateSurvivalLandmarkPathTiles(
            activeTopsideLandmarks(snapshot), 'automated_campfire',
          ),
          ...[...snapshot.homesteads].map((home) => ({
            tileX: home.overworldTileX, tileY: home.overworldTileY + 1,
          })),
        ]
      : activeSpaceDefinition.generator === 'homestead' ? homesteadPathTiles(activeSpaceDefinition.sizeTiles) : [],
    cameraX,
    cameraY,
    scale,
    frame.layout.width,
    frame.layout.height,
  );
  const authoredFarmerSoil = activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID
    ? topsideDecorations(snapshot, seed)
      .filter((decoration) => decoration.kind.startsWith('farm_crop_'))
      .map((decoration) => ({
        tileX: decoration.tileX,
        tileY: decoration.tileY,
        watered: decoration.role === 'soil.watered',
      }))
    : [];
  renderItems += drawFarmSoil(
    context,
    art.farmland,
    art.farmlandWet,
    art.farmlandGrassInset,
    [
      ...authoredFarmerSoil,
      ...[...snapshot.soil].map((soil) => ({
        ...soil,
        watered: soil.watered && renderAuthorityTick < soil.wateredAtTick + CROP_WATERING_TICKS * BigInt(4 + Math.min(3, estateFarmingSkills(snapshot).tenderHand)) / 4n,
      })),
    ],
    cameraX,
    cameraY,
    scale,
    frame.layout.width,
    frame.layout.height,
  );
  if (homesteadBuildMode) {
    drawHomesteadBuildGrid(context, cameraX, cameraY, scale);
    renderItems += 1;
  }
  renderMetrics.recordStage('ground', performance.now() - groundStartedAt);
  };
  let weatherStageMs = 0;
  const weatherFollowStartedAt = performance.now();
  rain.followViewport(
    cameraX + viewportWidth / 2,
    cameraY + viewportHeight / 2,
    worldZoom,
  );
  weatherStageMs += performance.now() - weatherFollowStartedAt;

  const painterBuildStartedAt = performance.now();
  const painterInput = {
    terrain, cameraX, cameraY, frame, scale,
    context, seasonalDynamic, localX, localTerrainContactY, art,
    groundCache, viewportWidth, viewportHeight, debugEntitiesHidden, projectedLocalY,
    snapshot, celestialPass, activeSpaceDefinition, renderItems, weatherVisualTick,
    lightingPreview, renderWeatherTick, renderWeather, alpha, dynamicLighting,
    objectPresentations, homesteadSurroundingDecorations, seed, topsideDecorations, visualTickClock,
    frameLightingModel, worldResourcesIncludingPersonalQuest, homesteadSurroundingResources, liveMapSuppressesGeneratedResource, treeShakeRemaining, resourceGlanceRemaining,
    effectPhase, miningClassFromWire, cropDefinitionForSnapshot, renderAuthorityTick, cropAutomaticallyWateredForSnapshot,
    cropCalendarOffsetForSnapshot, cropGreenhouseProtectedForSnapshot, liveItemContentDefinition, projectileDisplay, projectileFlightTicks,
    projectileHitProgress, renderTickClock, pendingBowProjectile, projectileCollision, animatedOpenChestId,
    closingChestId, chestAnimationStartedAtMs, clientProcessorRuntime, npcDisplay, previousNpcDisplay, renderStarted,
    npcHitFeedback, NPC_HIT_HOP_MS, reducedMotionPreference, questMarkerForNpc, targetableFromVisualBounds,
    wildlifeProfile, NPC_HIT_FLASH_MS, remoteDisplay, previousRemoteDisplay,
    renderedLocal, equippedLightRow, selectedItem, lightPreviewKind, predicted,
    liveEquippedItemFacing, cursorFacing, previousPredicted, profileName, avatarAnimations,
    bowChargeStartedAtMs, localActionPresentation, authoredActionArt, unknownActionKinds, currentBowChargeMs,
  };
  const painter = prepareGameplayPainter(painterInput);
  renderItems = painter.renderItems;
  const painterContext = { ...painterInput, ...painter, horseAnimationFrame: 0 };
  enqueueGameplayDecorations(painterContext);
  enqueueGameplayResources(painterContext);
  enqueueGameplayProjectiles(painterContext);
  const painterPlaceables = enqueueGameplayPlaceables(painterContext);
  animatedOpenChestId = painterPlaceables.animatedOpenChestId;
  closingChestId = painterPlaceables.closingChestId;
  chestAnimationStartedAtMs = painterPlaceables.chestAnimationStartedAtMs;
  painterContext.horseAnimationFrame = painterPlaceables.horseAnimationFrame;
  enqueueGameplayNpcs(painterContext);
  enqueueGameplayPlayers(painterContext);
  const {
    terrainProjectionMargin, projectionAt, worldDepthItems, movingCelestialCasters,
    nameplates, questMarkerAnchors, renderedPlayerAnchors, targetableEntities, pointLights,
    frameAmbient, frameSky, windTrees,
  } = painter;
  for(const attack of snapshot.enemyAttacks??[]) {
    if(attack.spaceId!==activeSpaceDefinition.spaceId)continue;
    worldDepthItems.push({
      // All caps on this elevation draw first; floor intent stays beneath actors.
      footY:(terrain.worldHeight??terrain.height)*16+16,elevationLayer:attack.elevation,depthPhase:'surface',
      tie:`combat-intent:${attack.npcId}`,
      draw:()=>drawEnemyAttackTelegraph(context,{...attack,pattern:attack.pattern as EnemyAttackPattern},renderAuthorityTick,
        cameraX,cameraY,scale,(x,y)=>y-projectionAt(x,y)),
    });
  }
  for(const profile of snapshot.outdoorEnemyProfiles??[]) {
    if(profile.spaceId!==activeSpaceDefinition.spaceId)continue;
    const npc=snapshot.npcs.get(profile.npcId);
    const summon=profile.role==='add'&&profile.summonState==='marking';
    const guardian=outdoorEnemyPresentation(snapshot.content.registry,profile.enemyKind)?.warden===true
      &&npc!==undefined&&npc.health>0;
    if(!summon&&!guardian)continue;
    const x=(summon?profile.summonX:npc!.x)/FIXED_UNITS_PER_PIXEL;
    const y=(summon?profile.summonY:npc!.y)/FIXED_UNITS_PER_PIXEL;
    const elevation=terrain.elevations?.[terrainIndexAt(terrain,Math.floor(x/16),Math.floor(y/16))]??0;
    worldDepthItems.push({footY:(terrain.worldHeight??terrain.height)*16+16,elevationLayer:elevation,depthPhase:'surface',tie:`warden-cue:${profile.npcId}`,
      draw:()=>summon?drawOutdoorSummonMark(context,x,y-projectionAt(x,y),renderAuthorityTick,profile.summonTick,cameraX,cameraY,scale)
        :drawWardenCrest(context,x,y-projectionAt(x,y),profile.wardenPhase,profile.phaseCueUntilTick,renderAuthorityTick,cameraX,cameraY,scale)});
  }
  latestTargetableEntities = targetableEntities;
  latestLightCount = pointLights.length;
  renderMetrics.recordStage('painterBuild', performance.now() - painterBuildStartedAt);
  if (!lightingEffectsDisabled) {
    const document=activeSpaceDefinition.spaceId===TOPSIDE_SPACE_ID?liveIslandDocumentFor(snapshot):null;
    const timeMs=weatherVisualTick*AUTHORITY_TICK_MS;
    const key=`${collisionKey}:${liveMapObjectLightFrameKey(document,snapshot.content.registry,timeMs)}`;
    if(baseLightOcclusion&&key!==authoredLightFrameKey){
      const authored=liveMapObjectLightOccluders(document,terrain,snapshot.content.registry,timeMs);
      lightOcclusion=createLightOcclusionMap(terrain,baseLightOcclusion.softObstacles,
        baseLightOcclusion.spriteOccluders,[...baseLightOcclusion.trunkOccluders,...authored],undefined,baseLightOcclusion);
      authoredLightFrameKey=key;
    }
    lightmap.prepare(
      terrain,
      cameraX,
      cameraY,
      scale,
      frame.layout.width,
      frame.layout.height,
      frameAmbient,
      pointLights,
      lightOcclusion,
      frameLightingModel,
      seasonalDynamic,
    );
  }
  if (seasonalDynamic) {
    celestialPass.prepare(terrain, lightOcclusion, movingCelestialCasters, frameSky, lightmap,
      cameraX, cameraY, viewportWidth, viewportHeight, terrainProjectionMargin, `${collisionKey}:${authoredLightFrameKey}`, debugEntitiesHidden);
    setGroundLightSource(context, (source, x, y, level) => celestialPass.renderer!.groundSource(source, x, y, level));
  }
  drawGround();
  if (seasonalDynamic) {
    celestialPass.renderer!.compositeGround(context, scale);
    celestialPass.renderer!.compositeFlameGlows(context, pointLights, scale);
  }
  const painterSortStartedAt = performance.now();
  const sortedWorldDepthItems = sortGameplayWorldDepthItems(worldDepthItems);
  renderMetrics.recordStage('painterSort', performance.now() - painterSortStartedAt);
  const painterDrawStartedAt = performance.now();
  let painterWeatherMs = 0;
  renderItems += drawSortedWorldDepthQueue(
    sortedWorldDepthItems,
    cameraY,
    scale,
    (minimumDepth, maximumDepth) => {
      const weatherStartedAt = performance.now();
      let draws = 0;
      const drawRain = (): void => { draws = rain.drawDepthRange(
        context,
        cameraX,
        cameraY,
        scale,
        worldZoom,
        minimumDepth,
        maximumDepth,
      ); };
      if (seasonalDynamic) withWorldReceiverLight(context, celestialPass.renderer!.frames, frameAmbient, drawRain);
      else drawRain();
      const elapsed = performance.now() - weatherStartedAt;
      painterWeatherMs += elapsed;
      weatherStageMs += elapsed;
      return draws;
    },
  );
  renderMetrics.recordStage(
    'painterDraw',
    Math.max(0, performance.now() - painterDrawStartedAt - painterWeatherMs),
  );
  const markerTarget = selectedEntityTarget;
  const markedTarget = markerTarget === null ? undefined
    : targetableEntities.find((entity) => sameEntityTarget(entity.target, markerTarget));
  if (!interfaceHidden && markedTarget !== undefined) {
    drawSelectedEntityMarker(context, markedTarget, cameraX, cameraY, scale);
  }
  renderItems += worldDepthItems.length;
  if (dynamicLighting) {
    renderMetrics.recordStage('lightingBoundsResize', lightmap.boundsResizeMs);
    renderMetrics.recordStage('lightingOcclusionRaster', lightmap.rasterizeMs);
    renderMetrics.recordStage('lightingSolve', lightmap.floodMs);
    renderMetrics.recordStage('lightingMerge', lightmap.mergeMs + (seasonalDynamic ? celestialPass.renderer!.mergeMs : 0));
    renderMetrics.recordStage('lightingUpload', lightmap.uploadMs + (seasonalDynamic ? celestialPass.renderer!.uploadMs : 0));
    renderMetrics.recordStage('lightingReceiver', lightmap.receiverMs + (seasonalDynamic ? celestialPass.renderer!.receiverMs : 0));
  }
  renderItems += drawCellarOreVeinPreview(
    context,
    terrain,
    seed,
    cameraX,
    cameraY,
    scale,
    frame.layout.width,
    frame.layout.height,
  );
  renderItems += drawDetectedBuriedOre(
    context, snapshot, cameraX, cameraY, scale, frame.layout.width, frame.layout.height,
  );
  const windWeatherStartedAt = performance.now();
  const drawWind = (): void => { renderItems += weatherEffects.drawWind(
    context,
    renderWeather,
    weatherVisualTick,
    cameraX,
    cameraY,
    scale,
    viewportWidth,
    viewportHeight,
    windTrees,
  ); };
  if (seasonalDynamic) withWorldReceiverLight(context, celestialPass.renderer!.frames, frameAmbient, drawWind);
  else drawWind();
  weatherStageMs += performance.now() - windWeatherStartedAt;
  renderMetrics.recordStage('weather', weatherStageMs);
  const farmItem = selectedItem(snapshot);
  const placementItemDefinition = liveItemDefinition(snapshot, farmItem);
  const placementContentDefinition = liveItemContentDefinition(snapshot, farmItem);
  const farmToolAction = selectedFarmToolAction(placementContentDefinition);
  const fishingToolAction = selectedFishingToolAction(placementContentDefinition);
  const farmTileSelected = farmToolAction !== null
    || placementItemDefinition?.tags.includes('item.seed') === true
    || placementItemDefinition?.tags.includes('item.farming.compost') === true;
  const tileToolSelected = farmTileSelected || fishingToolAction !== null;
  const placeableSelected = carriedChest(snapshot) !== null
    || carriedCarriableCombatTarget(snapshot) !== null
    || carriedCarriablePlaceable(snapshot) !== null
    || (!farmTileSelected
      && selectedItemLifecycleAction(placementContentDefinition, 'place') !== null);
  const interactionTarget = tileToolSelected || placeableSelected ? targetInteractionTile() : null;
  const farmTarget = farmTileSelected ? interactionTarget : null;
  if (!interfaceHidden && !debugEntitiesHidden && interactionTarget !== null && localMount(snapshot) === null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    const deedSelected = placementItemDefinition?.tags.includes('item.homestead_deed') === true;
    const boatSelected = placementItemDefinition?.tags.includes('vehicle.boat') === true;
    const outsideToolReach = tileToolSelected && tileToolInputOutOfReach(
      runtimeToolDefinition(snapshot.content.registry, farmItem), predicted?.position ?? null,
      interactionTarget, network.ownPosition(),
    );
    const carriedPlacement = carriedCarriablePlaceable(snapshot);
    const footprintReference = carriedPlacement ?? (carriedChest(snapshot) !== null
      || carriedCarriableCombatTarget(snapshot) !== null ? undefined : { kind: selectedItem(snapshot) });
    const blocked = outsideToolReach || (fishingToolAction !== null
      ? fishingTargetBlocked(interactionTarget)
      : boatSelected
      ? boatPlacementTileBlocked(snapshot, interactionTarget)
      : deedSelected
      ? homesteadPlacementBlocked(snapshot, interactionTarget)
      : placeableSelected && placementTileBlocked(snapshot, interactionTarget, false, footprintReference));
    const previewTiles = deedSelected
      ? homesteadMarkerPlacementTiles(interactionTarget.tileX, interactionTarget.tileY)
      : placeableSelected && !boatSelected && footprintReference !== undefined
        ? runtimeObjectFootprintTiles(snapshot.content.registry, { ...footprintReference, ...interactionTarget }, 'placement')
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
        projectionAt(tile.tileX * 16 + 8, (tile.tileY + 1) * 16 - 0.001),
      );
      renderItems += 1;
    }
  }
  const cellarWallTarget = targetCellarWall(snapshot);
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
      projectionAt(cellarWallTarget.tileX * 16 + 8, (cellarWallTarget.tileY + 1) * 16 - 0.001),
    );
    renderItems += 1;
  }
  if (!interfaceHidden && !debugEntitiesHidden && selectedAimedUseAction(snapshot) !== null
    && overworldUi.openWindow === null && !chatOverlay.isOpen
    && drawBowAimGuide(
      context,
      cameraX,
      cameraY,
      scale,
      projectionAt,
    )) renderItems += 1;
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
    drawToolInteractionOverlay(context, cameraX, cameraY, scale, snapshot, terrain, {
      x: localX * FIXED_UNITS_PER_PIXEL, y: localY * FIXED_UNITS_PER_PIXEL,
    });
    if (debugTerrainPoint !== null && terrainInspector !== null) {
      const draft = terrainInspector.inspectTerrainAtProjectedPoint(
        terrain,
        debugTerrainPoint.worldX,
        debugTerrainPoint.worldY,
        activeElevation,
        false,
      );
      const selectedScreenX = Math.round((draft.tileX * 16 - cameraX) * scale);
      const selectedScreenY = Math.round((draft.tileY * 16
        - (activeElevation - terrainBaseDatum(terrain))
          * terrainVisualProjectionRowsPerLevel(terrain) * 16 - cameraY) * scale);
      context.save();
      context.strokeStyle = '#fff36a';
      context.lineWidth = Math.max(1, scale);
      context.strokeRect(selectedScreenX, selectedScreenY, 16 * scale, 16 * scale);
      context.restore();
    }
  }
  if (!dynamicLighting) {
    const basicStartedAt = performance.now();
    compositeBasicLighting(context, frame.layout.width, frame.layout.height, frameAmbient);
    renderMetrics.recordStage('lightingComposite', performance.now() - basicStartedAt);
  } else if (!seasonalDynamic) {
    // Original one-pass lightmap: baked sprite shadows plus object illumination.
    lightmap.composite(context, cameraX, cameraY, scale);
    renderMetrics.recordStage('lightingComposite', lightmap.compositeMs);
  }
  const finalWorldCompositeStartedAt = performance.now();
  renderer.compositeWorld();
  hasRenderedWorldFrame = true;
  renderMetrics.recordStage(
    'finalWorldComposite',
    performance.now() - finalWorldCompositeStartedAt,
  );
  renderItems += 1;

  const uiModelStartedAt = performance.now();
  const canvasUiWidth = renderer.cssWidth / uiScale;
  const canvasUiHeight = renderer.cssHeight / uiScale;
  const uiWidth = hudViewport.width / uiScale;
  const uiHeight = hudViewport.height / uiScale;
  const uiOriginX = safeAreaInsets.left / uiScale;
  const uiOriginY = safeAreaInsets.top / uiScale;
  const uiContext = renderer.beginUi(uiScale);
  const interaction = targetInteraction(snapshot);
  const handsChest = carriedChest(snapshot);
  const handsCombatTarget = carriedCombatTarget(snapshot);
  const handsPlaceable = carriedPlaceable(snapshot);
  const facedCombatTarget = targetFacedCombatTarget(snapshot);
  const groundLightItem = targetGroundItemUse(snapshot);
  const selectedLight = equippedLightRow(snapshot);
  const equippedLightUseAction = selectedLight === null ? null : selectedItemLifecycleAction(
    liveItemContentDefinition(snapshot, selectedLight.itemKind),
    'equipmentUse',
  );
  const farmSoil = farmTarget === null ? undefined
    : snapshot.soil.get(farmSoilKey(
      farmTarget.tileX, farmTarget.tileY, activeSpaceDefinition.spaceId,
    ));
  const farmCrop = farmTarget === null ? undefined
    : snapshot.crops.get(farmSoilKey(
      farmTarget.tileX, farmTarget.tileY, activeSpaceDefinition.spaceId,
    ));
  const farmCropDefinition = cropDefinitionForSnapshot(snapshot, farmCrop?.cropKind ?? '');
  const farmCropGrowth = farmCrop === undefined || farmSoil === undefined || farmCropDefinition === null
    ? null
    : cropGrowthAt(
      farmCropDefinition,
      farmCrop.growthTicks,
      farmCrop.growthUpdatedAtTick,
      farmSoil.wateredAtTick,
      renderAuthorityTick,
      farmSoil.watered,
      cropAutomaticallyWateredForSnapshot(snapshot, farmCrop.spaceId, farmCrop.tileX, farmCrop.tileY),
      cropCalendarOffsetForSnapshot(snapshot),
      cropGreenhouseProtectedForSnapshot(snapshot, farmCrop.spaceId),
    );
  const farmPrompt = farmActionPrompt({
    targeted: farmTarget !== null,
    selectedTool: farmToolAction?.mode ?? null,
    seedSelected: liveItemDefinition(snapshot, farmItem)?.tags.includes('item.seed') === true,
    compostSelected: liveItemDefinition(snapshot, farmItem)?.tags.includes('item.farming.compost') === true,
    cropComposted: farmCrop?.composted === true,
    treeSeedSelected: fruitTreeForSeed(snapshot.content.registry, farmItem) !== null,
    soilExists: farmSoil !== undefined,
    soilWatered: farmSoil !== undefined && farmSoil.watered
      && renderAuthorityTick < farmSoil.wateredAtTick + CROP_WATERING_TICKS * BigInt(4 + Math.min(3, estateFarmingSkills(snapshot).tenderHand)) / 4n,
    cropName: farmCropDefinition?.displayName ?? null,
    cropMature: farmCropGrowth?.mature === true,
    cropWatered: farmCropGrowth?.watered === true,
  });
  const farmGate = targetOwnedHomesteadGate(snapshot);
  const nearbyCampfire = targetCampfire(snapshot);
  const actionPlaceable = targetPlaceable(snapshot);
  const selectedContentDefinition = liveItemContentDefinition(snapshot, selectedItem(snapshot));
  const selectedDefinition = liveItemDefinition(snapshot, selectedItem(snapshot));
  const selectedPlaceAction = selectedItemLifecycleAction(selectedContentDefinition, 'place');
  const selectedPlaceIsFarmAction = selectedDefinition?.tags.includes('item.seed') === true
      || selectedDefinition?.tags.includes('item.farming.compost') === true
    || selectedFarmToolAction(selectedContentDefinition, selectedPlaceAction) !== null;
  const selectedPlacePrompt = selectedPlaceIsFarmAction ? null
    : selectedItemLifecyclePrompt(selectedContentDefinition, 'place');
  const selectedRepairPrompt = actionPlaceable !== null
    && objectHasAuthoredTag(snapshot.content.registry, actionPlaceable, 'station.anvil')
    ? selectedItemLifecyclePrompt(selectedContentDefinition, 'useWith')
    : null;
  const basePrompt = debugEntitiesHidden || npcInteractionUi.active ? null
    : network.ownPosition()?.actionKind==='sitting' ? '[E] STAND / MOVE TO STAND'
    : farmGate !== null ? `[F] ${farmGate.open ? 'CLOSE' : 'OPEN'} FARM GATE`
    : handsCombatTarget !== null ? '[F] PLACE ARCHERY TARGET'
      : facedCombatTarget !== null ? '[F] CARRY ARCHERY TARGET'
        : handsPlaceable !== null ? `[F] PLACE ${liveItemLabel(snapshot, handsPlaceable.kind)}`
        : handsChest !== null ? '[F] PLACE CHEST'
          : selectedPlacePrompt !== null ? selectedPlacePrompt
            : actionPlaceable !== null
              && objectHasAuthoredTag(snapshot.content.registry, actionPlaceable, 'station.anvil')
              ? selectedRepairPrompt ?? `[F] CARRY ${liveItemLabel(snapshot, actionPlaceable.kind)}`
              : (farmToolAction !== null || selectedDefinition?.tags.includes('item.farming.compost') === true) && farmPrompt !== null
                ? farmPrompt
              : interaction === null ? farmPrompt : interaction.prompt;
  const groundItemUseAction = groundLightItem === null ? null : selectedItemLifecycleAction(
    liveItemContentDefinition(snapshot, groundLightItem.itemKind),
    'worldItemUse',
  );
  const hotbarLightEquip = selectedLightEquipRequest(selectedContentDefinition, selectedItemRow(snapshot)?.slot ?? -1);
  const lightPrompt = groundLightItem !== null && groundItemUseAction !== null
    ? `[F] TURN ${groundLightItem.lit ? 'OFF' : 'ON'} ${liveItemLabel(snapshot, groundLightItem.itemKind)}`
    : hotbarLightEquip !== null ? `[F] EQUIP ${liveItemLabel(snapshot, selectedItem(snapshot))}`
    : selectedLight !== null && equippedLightUseAction !== null
      ? `[F] TURN ${selectedLight.lit ? 'OFF' : 'ON'} ${liveItemLabel(snapshot, selectedLight.itemKind)}`
      : null;
  const selectedWorldTool = selectedContextualWorldToolAction(selectedContentDefinition) !== null;
  const selectedWoodcuttingAction = selectedWoodcuttingUseWithAction(selectedContentDefinition);
  const selectedUsePrompt = selectedWorldTool ? null : selectedItemUsePrompt(
    selectedContentDefinition,
  );
  const promptBase = basePrompt;
  const campfireAlreadyInPrompt = interaction?.payload?.kind === 'placeable'
    && nearbyCampfire?.targetKind === 'placeable'
    && interaction.payload.placeable.id === nearbyCampfire.id;
  const campfirePrompt = nearbyCampfire === null || campfireAlreadyInPrompt
    ? null
    : nearbyCampfire.targetKind === 'placeable'
      && !nearbyCampfire.authoredLandmark
      && selectedWoodcuttingAction !== null
      ? '[F] BREAK CAMPFIRE WITH AXE'
      : `[F] ${nearbyCampfire.lit ? 'EXTINGUISH' : 'LIGHT'} CAMPFIRE`;
  const actionPrompt = promptBase === null ? campfirePrompt
    : campfirePrompt === null ? promptBase : `${promptBase}  ${campfirePrompt}`;
  const targetPrompt = lightPrompt === null
    || (interaction?.payload?.kind === 'world_item'
      && selectedItemLifecycleAction(
        liveItemContentDefinition(snapshot, interaction.payload.item.itemKind),
        'worldItemUse',
      ) !== null)
    ? actionPrompt
    : actionPrompt === null ? lightPrompt : `${actionPrompt}  ${lightPrompt}`;
  // The authority resolves selected-item handlers before target handlers. Show
  // the same single winning F action. E remains independently available and
  // must describe the exact target selected by the E-key handler.
  const nearbyPrompt = debugEntitiesHidden || npcInteractionUi.active
    || interaction === null
    ? null : interaction.prompt;
  const contextualPrompt = worldActionPrompt(nearbyPrompt, selectedUsePrompt ?? targetPrompt);
  const prompt = homesteadBuildMode
    ? activeSpaceDefinition.generator === 'residence'
      ? '[B] EXIT FURNISHING  [CLICK] PLACE / PICK UP / MOVE'
      : contextualPrompt === null
      ? '[B] EXIT BUILD MODE  [CLICK] BUILD  [F] CARRY / PLACE'
      : `[B] EXIT BUILD MODE  ${contextualPrompt}`
    : contextualPrompt;
  const { authorityTick, calendarTick } = snapshotTimingClocks(snapshot);
  const activeProcessorTiming = snapshot.activePlaceable === null
    ? null : processorTiming(snapshot, snapshot.activePlaceable, authorityTick);
  const activeProcessorInterface = activeProcessorTiming === null
    ? null : processorInterfaceForAdapter(activeProcessorTiming.adapter);
  const activeFurnaceRemaining = activeProcessorTiming?.adapter === 'smelting'
    ? activeProcessorTiming.remaining : null;
  const activeCookingRemaining = activeProcessorTiming?.adapter === 'campfire_cooking'
    ? activeProcessorTiming.remaining : null;
  const activeCellarInterface = activeProcessorInterface === 'press'
    || activeProcessorInterface === 'fermentation' ? activeProcessorInterface : null;
  const estateVintageBasePrice = [...snapshot.content.registry.items.values()]
    .find((definition) => definition.economy.salePremium === 'estate_vintage')?.economy.sell ?? 0;
  const vintage = estateVintageTier(
    homesteadUpgradeRank(snapshot, 'vintage'),
    BigInt([...snapshot.content.registry.processes.values()]
      .find(({ adapter }) => adapter === 'fermentation')?.ticksPerUnit ?? 0),
    estateVintageBasePrice,
  );
  const activeCellarRemaining = activeCellarInterface === null
    ? null : activeProcessorTiming?.remaining ?? null;
  const calendar = calendarAtTick(Number(calendarTick) * SIM_STEPS_PER_AUTHORITY_TICK);
  const weatherMode = worldWeatherMode();
  const onlinePlayers = onlinePlayerEntries(snapshot);
  const playerVitals = resolvedPlayerVitals(snapshot);
  const ownProfile = snapshot.identityHex === null ? undefined : snapshot.profiles.get(snapshot.identityHex);
  const appearanceCatalog = runtimePlayerAppearanceCatalog(snapshot.content.registry);
  const appearance = ownAppearanceSelection(snapshot);
  const skillTracksByKind = new Map([...snapshot.skillTracks].map((row) => [row.track, row]));
  const skillTracks = SKILL_TRACKS.map((track) => {
    const row = skillTracksByKind.get(track);
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
  const personalFarmingSkills = farmingSkillEffects(snapshot.content.registry,
    Object.fromEntries(skillRanks.map(row => [row.nodeId, row.rank])));
  const skillCapabilities = runtimeSkillCapabilities(
    snapshot.content.registry,
    Object.fromEntries(skillRanks.map(({ nodeId, rank }) => [nodeId, rank])),
  );
  const targetVitals = selectedTargetVitals(snapshot);
  if (selectedEntityTarget !== null && targetVitals === undefined) selectedEntityTarget = null;
  const effectAuthorityTick = snapshot.clock?.authorityTick ?? 0n;
  const visibleEffects = [...snapshot.effects]
    .filter((effect) => effect.expiresTick > effectAuthorityTick
      && runtimeEffectDefinition(snapshot.content.registry, effect.effectKind) !== null)
    .sort((left, right) => left.appliedTick > right.appliedTick ? -1 : left.appliedTick < right.appliedTick ? 1 : 0)
    .map((effect) => {
      const definition = runtimeEffectDefinition(snapshot.content.registry, effect.effectKind);
      if (definition === null) return null;
      const remainingTicks = Number(effect.expiresTick - effectAuthorityTick);
      return {
        effectKind: effect.effectKind,
        name: definition.name,
        stacks: effect.stacks,
        remainingTicks,
        durationTicks: definition.durationTicks,
      };
    }).filter((effect): effect is NonNullable<typeof effect> => effect !== null);
  const quests = questLogEntries(snapshot);
  const trackedQuests = questTrackerEntries(quests);
  const hunger = snapshot.survival === null
    ? HUNGER_MAX_CENTI
    : Math.max(0, Math.min(HUNGER_MAX_CENTI, snapshot.survival.hungerCenti));
  const capacityEquipment = snapshot.inventorySlots.get(EQUIPMENT_SLOT_OFFSET + 4);
  const authoredInventoryCapacity = capacityEquipment === undefined || capacityEquipment.quantity <= 0
    ? BASE_BACKPACK_CAPACITY
    : runtimeItemInventoryCapacity(snapshot.content.registry, capacityEquipment.itemKind)
      ?? BASE_BACKPACK_CAPACITY;
  const backpackSlotCapacity = Math.max(
    Math.min(BACKPACK_SLOT_COUNT, authoredInventoryCapacity),
    snapshot.survival?.debugBackpackSlots ?? 0,
  );
  const activeChestPlaceable = snapshot.activeChest === null
    ? null : snapshot.placeables.get(snapshot.activeChest.id) ?? null;
  const modelPlaceableFrameId = activeObjectFrameId(snapshot.content.registry, snapshot.activePlaceable);
  const modelPlaceableFrame = modelPlaceableFrameId === null
    ? null : snapshot.content.registry.frames.get(modelPlaceableFrameId) ?? null;
  const activeFrameId = snapshot.hearthStashOpen ? 'frame:hearth_stash' : snapshot.activeChest === null
    ? modelPlaceableFrame?.presentation?.surface === 'entity' ? modelPlaceableFrame.id : null
    : activeObjectFrameId(snapshot.content.registry, activeChestPlaceable ?? {
      kind: 'chest', definitionId: 'object:chest',
    });
  const activeFramePlaceable = snapshot.activeChest === null ? snapshot.activePlaceable : activeChestPlaceable;
  const activeFrameProgress = activeProcessorTiming?.progress ?? 0;
  const inventoryFrameState = processJobFrameState(snapshot.content.registry, snapshot.cookingJob, authorityTick);
  const frameJob = snapshot.activeChest === null && processJobMatchesFrame(
    snapshot.cookingJob, activeFramePlaceable,
    snapshot.cookingJob === null ? undefined : snapshot.campfires?.get(snapshot.cookingJob.targetId),
  ) ? snapshot.cookingJob : null;
  renderMetrics.recordStage('uiModel', performance.now() - uiModelStartedAt);
  const uiLayoutStartedAt = performance.now();
  overworldUi.update({
    trackedQuestCount: trackedQuests.length,
    outdoorRewardCount: snapshot.outdoorRewards?.size ?? 0,
    outdoorRewards: outdoorRewardsModel.entries(snapshot.outdoorRewards, snapshot.outdoorRewardsRevision, snapshot.content.registry),
    width: uiWidth,
    height: uiHeight,
    connected: snapshot.connected,
    touchControls: touchControls.available,
    touchControlPreferences,
    playerCount: onlinePlayers.length,
    onlinePlayersVisible,
    canManageHomestead: snapshot.identityHex !== null
      && snapshot.homesteads.get(activeSpaceDefinition.spaceId)?.owner.toHexString() === snapshot.identityHex,
    dangerNotice: snapshot.rogueRun !== null || localAuthority === undefined ? null : hearthDangerNotice(resourceTargetPolicy, {
      spaceId: localAuthority.spaceId, tileX: localAuthority.x / TILE_SIZE_FIXED, tileY: localAuthority.y / TILE_SIZE_FIXED,
    }),
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
    openStashInventory:[...(snapshot.hearthStashSlots??[])],
    inventoryFrameState,
    ...(activeFrameId === null ? {} : {
      activeFrameId,
      activeFrameProgress,
      activeFrameTiming: activeProcessorTiming?.timing,
      activeFrameState: {
        ...activeObjectFrameState(activeFramePlaceable),
        ...processJobFrameState(snapshot.content.registry, frameJob, authorityTick),
      },
    }),
    furnaceProgress: activeProcessorTiming?.adapter === 'smelting'
      ? activeProcessorTiming.progress : 0,
    furnaceRemainingSeconds: activeFurnaceRemaining === null
      ? null : Number(activeFurnaceRemaining) / AUTHORITY_HZ,
    cookingFireProgress: activeProcessorTiming?.adapter === 'campfire_cooking'
      ? activeProcessorTiming.progress : 0,
    cookingFireRemainingSeconds: activeCookingRemaining === null
      ? null : Number(activeCookingRemaining) / AUTHORITY_HZ,
    cookingFireLit: activeProcessorTiming?.adapter === 'campfire_cooking'
      ? snapshot.activePlaceable?.lit ?? false
      : true,
    cellarProcessorProgress: snapshot.activePlaceable !== null && activeCellarInterface !== null
      ? activeProcessorTiming?.progress ?? 0
      : 0,
    cellarProcessorRemainingSeconds: activeCellarRemaining === null
      ? null : Number(activeCellarRemaining) / AUTHORITY_HZ,
    cellarProductLabel: activeCellarInterface === 'fermentation'
      ? `${vintage.label} Bottles`
      : undefined,
    hunger: { current: hunger, maximum: HUNGER_MAX_CENTI },
    barrelProgress: activeProcessorTiming?.adapter === 'barrel'
      ? activeProcessorTiming.progress : 0,
    barrelSealed: activeProcessorTiming?.adapter === 'barrel'
      && snapshot.activePlaceable?.barrelSealedTick !== undefined,
    hasBackpack: authoredInventoryCapacity > BASE_BACKPACK_CAPACITY,
    backpackSlotCapacity,
    audioVolumes: audio.getSettings(),
    audioBackground: {
      music: audio.getSettings().musicInBackground,
      sounds: audio.getSettings().soundsInBackground,
    },
    nameplatesVisible,
    canAdministerWorld: canAdministerWorld(snapshot.membership?.role),
    delveActive: snapshot.rogueRun !== null,
    dateLabel: `${calendar.season.toUpperCase()} ${calendar.dayOfSeason}`,
    timeLabel: formatDayTime(simTickOfDayAtAuthorityTick(calendarTick), TICKS_PER_DAY),
    timeFraction: authorityDayProgress(calendarTick),
    moonPhase: lunarPhaseAtAuthorityTick(calendarTick),
    moonIlluminationPerMille: lunarIlluminationAtAuthorityTick(calendarTick),
    raining: rain.enabled,
    weatherMode,
    windDirectionMode: worldWindDirection(),
    windDirectionLabel: windDirectionLabel(renderWeather.windDirectionX, renderWeather.windDirectionY),
    lightingEffectsDisabled,
    lightingQuality: lightingQuality.requested,
    lightingFallbackReason: lightingQuality.reason,
    lightingModel,
    cellarOrePreview,
    fullscreen: standaloneWebApp || documentIsFullscreen(),
    fullscreenAvailable: webFullscreenAvailable,
    pwaUpdateStatus: pwaClient.status,
    interactionSessionKey: `${snapshot.identityHex}:${network.sessionGeneration}:${snapshot.connected}`,
    prompt,
    toast: toastTicks > 0 ? toast.slice(0, 42) : null,
    toastKind,
    skillPointNotice,
    nearbyCraftingStations: nearbyCraftingStations(snapshot),
    knownRecipeIds: [...snapshot.knownRecipes].map((row) => row.recipeId),
    minimapTrackingEnabled: skillCapabilities.minimapPlayerTracking,
    contentRegistry: snapshot.content.registry,
    skills: {
      progression: runtimeProgression(snapshot.content.registry),
      skillPriority:snapshot.equipmentSkillPriority??[],
      nodes: snapshot.content.registry.compiled.skillNodes,
      tracks: skillTracks,
      ranks: skillRanks,
      equipmentSkills:compileEquipmentLoadout({registry:snapshot.content.registry,inventory:[...snapshot.inventorySlots],skillPriority:snapshot.equipmentSkillPriority??[],
        selectedSlot:optimisticSelectedSlot??snapshot.survival?.selectedSlot??0,
        trainedRanks:Object.fromEntries(skillRanks.map(({nodeId,rank})=>[nodeId,rank])),bowDrawn:bowChargeStartedAtMs!==null}).skills,
      balanceBronze: snapshot.wallet?.balanceBronze ?? 0n,
    },
    statistics: {
      statistics: [...snapshot.playerStatistics].map((row) => ({
        statisticKind: row.statisticKind,
        subjectKind: row.subjectKind,
        value: row.value,
      })),
    },
    quests,
    ...(playerVitals === null || snapshot.stats === null || appearance === null || appearanceCatalog === null ? {} : { character: {
      progression: runtimeProgression(snapshot.content.registry),
      playerId: snapshot.identityHex ?? 'local',
      displayName: ownProfile?.displayName ?? 'Farmer',
      appearance,
      appearanceCatalog,
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
        .filter((row) => row.slot >= EQUIPMENT_SLOT_OFFSET
          && ACTIVE_EQUIPMENT_SLOT_INDEXES.includes(row.slot - EQUIPMENT_SLOT_OFFSET)
          && activeEquipmentSlotAccepts(row.slot - EQUIPMENT_SLOT_OFFSET, row.itemKind, itemContainerContentResolver(snapshot.content.registry))
          && row.itemKind !== 'empty' && row.quantity > 0)
        .map((row) => ({
          slot: row.slot - EQUIPMENT_SLOT_OFFSET,
          itemKind: row.itemKind,
          quantity: row.quantity,
          durability: row.durability,
          lit: row.lit,
        })),
    } }),
  });
  delveRewards.update(snapshot.rogueRun && network.gameplayReady ? {
    sessionKey: `${snapshot.identityHex}:${network.sessionGeneration}:${snapshot.rogueRun.id}:${snapshot.rogueRun.roomNumber}`,
    visible: overworldUi.openWindow === null, run: snapshot.rogueRun,
    offers: [...snapshot.rogueRewardOffers], registry: snapshot.content.registry, width: uiWidth, height: uiHeight,
  } : null);
  canvas.classList.toggle('update-prompt-active', overworldUi.blockingUpdatePromptVisible);
  if (homesteadPaletteRegistry !== snapshot.content.registry) {
    homesteadPaletteRegistry = snapshot.content.registry;
    homesteadPaletteEntries = [...homesteadBuildDefinitions(snapshot.content.registry).values()].map((definition) => ({
      ...definition,
      iconAnimation: liveItemDefinition(snapshot, definition.itemKind)?.iconAnimation ?? 'base',
    }));
    homesteadPaletteUpgrades = Object.values(snapshot.content.registry.compiled.upgrades);
    furnishingPaletteEntries = [...snapshot.content.registry.objects.values()].filter(definition => definition.retired !== true
      && definition.components.placement !== undefined
      && hearthFurnitureDefinition(snapshot.content.registry, definition.components.placement.item.slice(5))?.definition.id === definition.id)
      .map(definition => ({ itemKind: definition.components.placement!.item.slice(5), displayName: definition.displayName,
        layer: 'prop' as const, iconAnimation: 'base' }));
  }
  const furnishingHome = activeSpaceDefinition.generator === 'residence'
    ? [...snapshot.homesteads].find(home => home.residenceSpaceId === activeSpaceDefinition.spaceId) : undefined;
  if(constructionProposal!==null&&(constructionProposal.scope!==constructionScope()
    ||constructionProposal.tool!==homesteadBuildPalette.constructionTool
    ||constructionProposal.preview.revision!==parseHearthArchitectureState(activeSpaceDefinition.residenceArchitectureJson??EMPTY_HEARTH_ARCHITECTURE_JSON)?.revision))constructionProposal=null;
  constructionRequests.sync(`${snapshot.identityHex}:${network.sessionGeneration}:${activeSpaceDefinition.spaceId}`,
    activeSpaceDefinition.generator==='residence'?parseHearthArchitectureState(activeSpaceDefinition.residenceArchitectureJson??EMPTY_HEARTH_ARCHITECTURE_JSON)?.revision??null:null);
  homesteadBuildPalette.setModel({
    constructionStatus,
    constructionCanApply:constructionProposal!==null,constructionPending:constructionRequests.pending,
    residenceRank: furnishingHome?.residenceExpansionRank,
    residenceOwner: furnishingHome?.owner.toHexString() === snapshot.identityHex,
    scope: `${snapshot.identityHex}:${network.sessionGeneration}:${activeSpaceDefinition.spaceId}`,
    furnishing: activeSpaceDefinition.generator === 'residence',
    canUndoMove: furnitureMoves.canUndo,
    status: activeSpaceDefinition.generator === 'residence' ? furnishingStatus : undefined,
    width: uiWidth,
    height: uiHeight,
    entries: activeSpaceDefinition.generator === 'residence'
      ? furnishingPaletteEntries
      : activeSpaceDefinition.generator === 'cellar' ? [] : homesteadPaletteEntries,
    upgrades: homesteadPaletteUpgrades,
    counts: [...snapshot.inventorySlots]
      .filter((row) => row.slot < EQUIPMENT_SLOT_OFFSET && row.itemKind !== 'empty' && row.quantity > 0)
      .reduce<Record<string, number>>((counts, row) => {
        counts[row.itemKind] = (counts[row.itemKind] ?? 0) + row.quantity;
        return counts;
      }, {}),
    upgradeRanks: Object.fromEntries(
      [...(snapshot.activeFarmUpgrades ?? snapshot.homesteadUpgrades)].map((row) => [row.upgradeKind, row.rank]),
    ),
    balanceBronze: snapshot.wallet?.balanceBronze ?? 0n,
  });
  const tradeSession = snapshot.tradeSession;
  tradeUi.update(!snapshot.connected || tradeSession === null || snapshot.identityHex === null ? null : {
    connectionScope: `${snapshot.identityHex}:${network.sessionGeneration}`,
    backpackSlotCapacity,
    contentRegistry: snapshot.content.registry,
    identityHex: snapshot.identityHex,
    session: tradeSession,
    offers: [...snapshot.tradeOffers],
    inventorySlots: [...snapshot.inventorySlots],
    walletBronze: snapshot.wallet?.balanceBronze ?? 0n,
    requesterName: snapshot.profiles.get(tradeSession.requester.toHexString())?.displayName ?? 'Player',
    recipientName: snapshot.profiles.get(tradeSession.recipient.toHexString())?.displayName ?? 'Player',
  });
  const npcWasActive = npcInteractionUi.active;
  npcInteractionUi.update(snapshot.activeDialogue === null || !network.gameplayReady ? null : {
    interactionSessionKey: `${snapshot.identityHex}:${network.sessionGeneration}:${snapshot.connected}`,
    ...(network.gameplayReady ? { sealSessionKey: `${snapshot.identityHex}:${network.sessionGeneration}`,
      knownRecipeIds: [...snapshot.knownRecipes].map(row => row.recipeId) } : {}),
    orderSessionKey:`${snapshot.identityHex}:${network.sessionGeneration}:${snapshot.connected}`,
    villageOrders:[...(snapshot.villageOrders??[])],
    width: uiWidth,
    height: uiHeight,
    npcId: snapshot.activeDialogue.npcId,
    dialogueId: snapshot.activeDialogue.dialogueId,
    shopId: snapshot.merchants.get(snapshot.activeDialogue.npcId)?.shopId,
    nodeId: snapshot.activeDialogue.nodeId,
    balanceBronze: snapshot.wallet?.balanceBronze ?? 0n,
    inventory: [...snapshot.inventorySlots],
    backpackSlotCapacity,
    sellPriceOverrides: Object.fromEntries([...snapshot.content.registry.items.values()]
      .filter((definition) => runtimeItemSalePremium(
        snapshot.content.registry,
        definition.id.slice('item:'.length),
      ) === 'estate_vintage')
      .map((definition) => {
        const agingTicks = BigInt([...snapshot.content.registry.processes.values()]
          .find((process) => process.adapter === 'fermentation'
            && process.outputs.some(({ item }) => item === definition.id))?.ticksPerUnit ?? 0);
        return [definition.id.slice('item:'.length), estateVintageTier(
          runtimeHomesteadUpgradeRank(snapshot.content.registry, [...snapshot.homesteadUpgrades], 'vintage'), agingTicks, definition.economy.sell,
        ).sellPriceBronze];
      })),
    quests: [...snapshot.quests],
    touchControls: touchControls.available,
    contentRegistry: snapshot.content.registry,
  });
  if (!npcWasActive && npcInteractionUi.active) npcInteractionUi.focus();
  questTracker.update({
    width: uiWidth,
    height: uiHeight,
    anchorRect: overworldUi.minimapBounds,
    entries: trackedQuests,
    layoutRegion: overworldUi.questTrackerRegion,
    visible: overworldUi.questTrackerVisible,
  });
  const channelNames = new Map([...snapshot.chatChannels].map((channel) => [channel.id, channel.displayName]));
  const chatWasActive = chatOverlay.active;
  chatOverlay.update({
    sessionKey: `${snapshot.identityHex}:${network.sessionGeneration}:${snapshot.connected}`,
    width: uiWidth,
    height: uiHeight,
    connected: snapshot.connected,
    canAdministerWorld: canAdministerWorld(snapshot.membership?.role),
    onlinePlayerNames: onlinePlayers.map((player) => player.displayName),
    replyPlayerName: latestIncomingWhisper(snapshot)?.senderDisplayName ?? null,
    touchControls: touchControls.available,
    keyboardInset: softwareKeyboardInset(uiScale),
    interactionBlocked: chatInteractionBlocked(),
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
        channelName: notice.kind === 'last' ? 'Last' : notice.kind === 'baltop' ? 'Balance' : 'World',
        senderDisplayName: 'World',
        kind: 'system',
        body: notice.body,
        itemLinksJson: '[]',
      })),
      ...[...snapshot.operationalChatNotices].map((notice) => ({
        id: chatTimelineId(notice.issuedAtMicros, notice.id, 1n),
        channelName: notice.kind === 'last' ? 'Last' : 'Balance',
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
  if (!chatWasActive && chatOverlay.active && chatOverlay.isOpen) { chatOverlay.open(); retainedUi.focus('chat'); }
  characterNamePrompt.update(
    uiWidth,
    uiHeight,
    snapshot.connected && snapshot.characterProfile?.nameChosen === false,
  );
  updateOnlinePlayers();
  retainedUi.resize(uiWidth, uiHeight);
  retainedUi.reconcile(); syncRetainedText();
  renderMetrics.recordStage('uiLayout', performance.now() - uiLayoutStartedAt);
  const uiDrawStartedAt = performance.now();
  const feedbackNow = performance.now();
  const feedbackEntries: GameFeedbackModel['world']['feedback'][number][] = [];
  const feedbackSpeech: GameFeedbackModel['world']['speech'][number][] = [];
  let feedbackHint: GameFeedbackModel['world']['hint'] = null;
  let feedbackFishing: GameFeedbackModel['world']['fishing'] = null;
  const feedbackNames = !interfaceHidden && nameplatesVisible ? nameplates.map((nameplate) => ({
    x: (nameplate.x - cameraX) * worldZoom / uiScale,
    y: (nameplate.y - cameraY - 42) * worldZoom / uiScale,
    text: nameplate.name, ...(nameplate.offline === true ? { offline: true } : {}),
  })) : [];
  if (!interfaceHidden && snapshot.fishingCast !== null && snapshot.identityHex !== null) {
    const anchor = renderedPlayerAnchors.get(snapshot.identityHex);
    if (anchor !== undefined) feedbackFishing = { id: snapshot.identityHex,
      progress: Math.max(0, Math.min(1, Number(renderAuthorityTick - snapshot.fishingCast.startedTick) / Number(FISHING_CAST_TICKS))),
      x: Math.round((anchor.x - cameraX) * worldZoom / uiScale),
      y: Math.round((anchor.y - cameraY - 34) * worldZoom / uiScale),
    };
  }
  if (!interfaceHidden) for (const marker of questMarkerAnchors) {
    const asset = art.itemIcons[`quest_${marker.kind}`];
    if (asset === undefined) continue;
    feedbackEntries.push({ id: `quest:${marker.kind}:${marker.x}:${marker.y}`, kind: 'quest', artwork: asset,
      x: (marker.x - cameraX) * worldZoom / uiScale,
      y: (marker.y - cameraY - 40) * worldZoom / uiScale });
  }
  const hoveredDetectedOre = !interfaceHidden && worldPointer !== null
    && overworldUi.openWindow === null && !chatOverlay.isOpen
    ? identifiedOreAtWorldPoint(
      resourcePerceptionForSnapshot(snapshot).buriedOre,
      latestCameraX + worldPointer.x / latestRenderedZoom,
      latestCameraY + worldPointer.y / latestRenderedZoom,
    ) : null;
  if (hoveredDetectedOre !== null) {
    const title = `${hoveredDetectedOre.oreKind.replace(/^ore_/, '').toUpperCase()} VEIN`;
    const distance = `${hoveredDetectedOre.distanceTiles.toFixed(1)} TILES AWAY`;
    const worldX = hoveredDetectedOre.tileX * 16 + 8, worldY = hoveredDetectedOre.tileY * 16 + 8;
    feedbackHint = { title, lines: [distance], tone: 'neutral',
      x: (worldX - cameraX) * worldZoom / uiScale,
      y: (worldY - cameraY - 22) * worldZoom / uiScale };
  }
  if (hoveredDetectedOre === null && !interfaceHidden && hoveredInteractionTile !== null && worldPointer !== null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    const hoveredMiningResource = worldResourcesIncludingPersonalQuest(snapshot).find((resource) => (
      !resource.depleted
      && resource.spaceId === activeSpaceDefinition.spaceId
      && resource.tileX === hoveredInteractionTile!.tileX
      && resource.tileY === hoveredInteractionTile!.tileY
      && ['fish', 'mine'].includes(runtimeResourceDefinition(snapshot.content.registry, resource)?.interaction.mode ?? '')
    ));
    if (hoveredMiningResource !== undefined) {
      if (runtimeResourceDefinition(snapshot.content.registry, hoveredMiningResource)?.interaction.mode === 'fish') {
        const catches = hoveredMiningResource.richness;
        const status = `${catches} CATCH${catches === 1 ? '' : 'ES'} LEFT`;
        const worldX = hoveredMiningResource.tileX * 16 + 8, worldY = (hoveredMiningResource.tileY + 1) * 16;
        feedbackHint = { title: 'FISH POOL', lines: [status], tone: 'success', artwork: art.itemIcons.raw_fish ?? art.missingItem,
          x: (worldX - cameraX) * worldZoom / uiScale,
          y: (worldY - projectionAt(worldX, worldY) - cameraY - 22) * worldZoom / uiScale };
      } else {
      const nodeClass = miningClassFromWire(
        hoveredMiningResource.miningClass, hoveredMiningResource.spaceId,
      );
      const richness = hoveredMiningResource.richness || hoveredMiningResource.health;
      const maximumRichness = hoveredMiningResource.maximumRichness || richness;
      const efficientRank = skillCapabilities.efficientStrikesRank;
      const prospectorRank = skillCapabilities.miningYieldInspection ? 1 : 0;
      const oreDressingRank = skillCapabilities.oreDressingRank;
      const rockhoundRank = skillCapabilities.rockhoundRank;
      const material = hoveredMiningResource.kind.replace(/^ore_/, '').replaceAll('_', ' ').toUpperCase();
      const title = isBreakableRockKind(hoveredMiningResource.kind, snapshot.content.registry)
        ? 'ROCK' : `${material} VEIN`;
      const classLabel = nodeClass === 'pristine' ? 'PRISTINE SURFACE NODE'
        : nodeClass === 'pure' ? 'PURE CAVE VEIN'
          : nodeClass === 'rock' ? 'COMMON ROCK' : 'MIXED SURFACE NODE';
      const hits = miningHitsUntilYield(hoveredMiningResource.yieldProgress, efficientRank);
      const status = `${miningNodeRichnessLabel(richness)} ${richness}/${maximumRichness} - ${hits} HIT${hits === 1 ? '' : 'S'} TO YIELD`;
      // Yield odds only for prospectors; a vein the held pickaxe can't work names the one it needs.
      const odds = prospectorRank <= 0 ? null
        : nodeClass === 'rock' ? `PEBBLE + ${1 + Math.min(2, rockhoundRank)}% ORE CHANCE`
          : nodeClass === 'mixed' ? `${mixedNodeStoneChancePercent(oreDressingRank)}% STONE / ${100 - mixedNodeStoneChancePercent(oreDressingRank)}% ORE`
            : 'GUARANTEED FULL ORE CHUNK';
      const needed = miningToolNeeded(snapshot.content.registry, hoveredMiningResource, selectedItem(snapshot) || null);
      const worldX = hoveredMiningResource.tileX * 16 + 8, worldY = (hoveredMiningResource.tileY + 1) * 16;
      feedbackHint = { title, lines: [classLabel, status, ...(needed !== null ? [needed] : odds !== null ? [odds] : [])],
        roles: ['subtitle', 'status', 'muted'], tone: 'neutral',
        progress: Math.max(0, Math.min(1, hoveredMiningResource.yieldProgress / 12)),
        x: (worldX - cameraX) * worldZoom / uiScale,
        y: (worldY - projectionAt(worldX, worldY) - cameraY - 22) * worldZoom / uiScale };
      }
    }
  }
  if (hoveredDetectedOre === null && !interfaceHidden && !debugEntitiesHidden && worldPointer !== null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    const hoveredProcessor = timingHoverIndex.pick({
      registry: snapshot.content.registry,
      revision: `${snapshot.placeables.revision ?? network.resourceRevision}:${snapshot.liveMapDocument?.revision ?? 0}`,
      spaceId: activeSpaceDefinition.spaceId, rows: snapshot.placeables,
      x: cameraX + worldPointer.x / worldZoom, y: cameraY + worldPointer.y / worldZoom,
      projectionAt,
    });
    if (hoveredProcessor !== null) {
      const result = processorTiming(snapshot, hoveredProcessor, authorityTick);
      if (result !== null) {
        const x = hoveredProcessor.tileX * 16 + 8, y = (hoveredProcessor.tileY + 1) * 16;
        const labels = timingLabels(result.timing);
        feedbackHint = { title: result.object.displayName, lines: [labels.status, labels.time].filter(Boolean),
          tone: 'neutral', progress: result.timing.progress,
          x: (x - cameraX) * worldZoom / uiScale,
          y: (y - projectionAt(x, y) - cameraY) * worldZoom / uiScale - 8 };
      }
    } else {
      const target = growthTimingHoverIndex.pick({ registry: snapshot.content.registry,
        revision: `${snapshot.resources.revision ?? network.resourceRevision}:${snapshot.crops.revision ?? snapshot.crops.size}:${snapshot.liveMapDocument?.revision ?? 0}`,
        spaceId: activeSpaceDefinition.spaceId, crops: snapshot.crops, resources: snapshot.resources,
        resourceVisible: row => !liveMapSuppressesGeneratedResource(snapshot, row.id),
        x: cameraX + worldPointer.x / worldZoom, y: cameraY + worldPointer.y / worldZoom, projectionAt });
      if (target !== null) {
        const row = target.row;
        const definition = target.kind === 'crop' ? cropDefinitionForSnapshot(snapshot, target.row.cropKind) : null;
        const soil = target.kind === 'crop' ? snapshot.soil.get(target.row.id) : undefined;
        const timing = target.kind === 'resource'
          ? projectResourceTiming(snapshot.content.registry, target.row, authorityTick, rainForWeatherMode(worldWeatherMode(), calendarTick))
          : definition === null || soil === undefined ? null
            : projectTiming({ kind: 'crop', definition, storedGrowthTicks: target.row.growthTicks,
              growthUpdatedAtTick: target.row.growthUpdatedAtTick, wateredAtTick: soil.wateredAtTick,
              watered: soil.watered, automaticallyWatered: cropAutomaticallyWateredForSnapshot(snapshot, row.spaceId, row.tileX, row.tileY),
              calendarOffsetTicks: cropCalendarOffsetForSnapshot(snapshot),
              greenhouseProtected: cropGreenhouseProtectedForSnapshot(snapshot, row.spaceId) }, authorityTick);
        if (timing !== null) {
          const name = definition?.displayName ?? (target.kind === 'resource'
            ? runtimeResourceDefinition(snapshot.content.registry, target.row)?.displayName : undefined) ?? 'Growth';
          const x = row.tileX * 16 + 8, y = (row.tileY + 1) * 16;
          let detail = timing.stage === null ? '' : `STAGE ${timing.stage + 1}`;
          if (target.kind === 'crop' && definition !== null && soil !== undefined && personalFarmingSkills.soilWhisperer) {
            const growth = cropGrowthAt(definition, target.row.growthTicks, target.row.growthUpdatedAtTick,
              soil.wateredAtTick, authorityTick, soil.watered,
              cropAutomaticallyWateredForSnapshot(snapshot, row.spaceId, row.tileX, row.tileY),
              cropCalendarOffsetForSnapshot(snapshot), cropGreenhouseProtectedForSnapshot(snapshot, row.spaceId));
            const water = growth.watered ? timingLabels({ ...timing, status: 'running', reason: null,
              confidence: 'exact', remainingActiveTicks: growth.wateredUntilTick - authorityTick }).time.replace(' LEFT', ' WATER') : 'DRY';
            detail = `${Math.floor(timing.progress * 100)}% ${water}`;
          }
          const labels = timingLabels(timing);
          feedbackHint = { title: name, lines: [labels.status, labels.time, detail].filter(Boolean),
            tone: 'neutral', progress: timing.progress,
            x: (x - cameraX) * worldZoom / uiScale,
            y: (y - projectionAt(x, y) - cameraY) * worldZoom / uiScale - 8 };
        }
      }
    }
  }
  if (!interfaceHidden) {
    for (const [combatIndex, combatText] of floatingCombatTexts.entries()) {
      const age = feedbackNow - combatText.startedAtMs;
      const progress = Math.max(0, Math.min(1, age / 1_100));
      const target = combatText.targetKind === 'npc'
        ? snapshot.npcs.get(combatText.targetId)
        : snapshot.combatTargets.get(combatText.targetId);
      const worldX = (target?.x ?? combatText.x) / FIXED_UNITS_PER_PIXEL;
      const worldY = (target?.y ?? combatText.y) / FIXED_UNITS_PER_PIXEL;
      const projection = projectionAt(worldX, worldY);
      const screenX = (worldX - cameraX) * worldZoom / uiScale;
      const screenY = (worldY - projection - cameraY - 35 - progress * 13) * worldZoom / uiScale;
      feedbackEntries.push({ id: `combat:${combatText.targetKind}:${combatText.targetId}:${combatText.startedAtMs}:${combatIndex}`,
        kind: 'damage', amount: combatText.amountCenti / 100, critical: combatText.critical, progress,
        presentation: 'combat', x: screenX, y: screenY });
    }
  }
  if (!interfaceHidden) {
    const mountedRiderIds = new Set<string>();
    for (const npc of snapshot.npcs) {
      if (npc.rider !== undefined) mountedRiderIds.add(npc.rider.toHexString());
    }
    for (const speech of snapshot.worldSpeech) {
      const speakerId = speech.speaker.toHexString();
      const npcSpeaker = speech.speakerNpcId === undefined
        ? undefined
        : snapshot.npcs.get(speech.speakerNpcId);
      const renderedPosition = renderedPlayerAnchors.get(speakerId);
      const livePosition = renderedPosition === undefined ? snapshot.players.get(speakerId) : undefined;
      const worldX = npcSpeaker !== undefined
        ? npcSpeaker.x / FIXED_UNITS_PER_PIXEL
        : renderedPosition?.x ?? (livePosition?.x ?? speech.x) / FIXED_UNITS_PER_PIXEL;
      const worldY = npcSpeaker !== undefined
        ? npcSpeaker.y / FIXED_UNITS_PER_PIXEL
        : renderedPosition?.y ?? (livePosition?.y ?? speech.y) / FIXED_UNITS_PER_PIXEL;
      const screenX = (worldX - cameraX) * worldZoom / uiScale;
      const screenY = (worldY - cameraY) * worldZoom / uiScale;
      const onScreen = screenX >= 0 && screenX <= canvasUiWidth
        && screenY >= 0 && screenY <= canvasUiHeight;
      if (!onScreen && speech.kind !== 'shout') continue;
      const kind = speech.kind === 'shout' ? 'shout' : 'say';
      const anchor: EdgeSpeechAnchor = onScreen
        ? {
            x: screenX,
            y: screenY - speechBubbleHeadOffset(
              worldZoom, uiScale, npcSpeaker === undefined && mountedRiderIds.has(speakerId),
            ),
            direction: 'down',
          }
        : edgeSpeechAnchor(screenX, screenY, canvasUiWidth, canvasUiHeight);
      feedbackSpeech.push({ id: `public:${speech.id}`, text: speech.body, kind, ...anchor });
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
      if (screenX < 0 || screenX > canvasUiWidth || screenY < 0 || screenY > canvasUiHeight) continue;
      const anchor: EdgeSpeechAnchor = {
        x: screenX,
        y: screenY - speechBubbleHeadOffset(worldZoom, uiScale, mountedRiderIds.has(speakerId)),
        direction: 'down',
      };
      feedbackSpeech.push({ id: `tell:${message.id}`, text: message.body, kind: 'tell', ...anchor });
    }
    const thought = snapshot.thought;
    const ownAnchor = snapshot.identityHex === null ? undefined : renderedPlayerAnchors.get(snapshot.identityHex);
    if (thought !== null && ownAnchor !== undefined
      && (snapshot.clock?.authorityTick ?? 0n) <= thought.expiresTick) {
      const screenX = (ownAnchor.x - cameraX) * worldZoom / uiScale;
      const screenY = (ownAnchor.y - cameraY) * worldZoom / uiScale;
      const anchor: EdgeSpeechAnchor = {
        x: screenX,
        y: screenY - speechBubbleHeadOffset(worldZoom, uiScale, localMount(snapshot) !== null),
        direction: 'down',
      };
      feedbackSpeech.push({ id: 'own-thought', text: thought.body, kind: 'thought', ...anchor });
    }
    gameFeedback.setBounds({ worldWidth: canvasUiWidth, worldHeight: canvasUiHeight, hudWidth: uiWidth, hudHeight: uiHeight });
    gameFeedback.update({ sessionKey: feedbackSessionKey(), reducedMotion: reducedMotionPreference.matches,
      world: { nameplates: feedbackNames, feedback: feedbackEntries, speech: feedbackSpeech, hint: feedbackHint, fishing: feedbackFishing },
      hud: { ...feedbackHudProjection(feedbackNow, uiHeight), notice: skillPointNotice === null ? null : {
        id: currentSkillNoticeId(), track: skillPointNotice.track, points: skillPointNotice.points,
        y: overworldUi.skillPointNoticeLayout()?.frame.y ?? 4,
      } },
    });
    retainedUi.reconcile();
    gameFeedback.roots.world.drawInContext(uiContext, feedbackNow);
    uiContext.save();
    uiContext.translate(uiOriginX, uiOriginY);
    touchControls.draw(uiContext);
    overworldUi.drawHud(uiContext);
    questTracker.draw(uiContext);
    chatOverlay.draw(uiContext);
    overworldUi.draw(uiContext, false);
    gameFeedback.roots.hud.drawInContext(uiContext, feedbackNow);
    if (feedbackNoticeAvailable() && gameFeedback.noticeVisible) gameFeedback.roots.notice.drawInContext(uiContext, feedbackNow);
    if (homesteadBuildMode && overworldUi.openWindow === null) {
      homesteadBuildPalette.draw(uiContext);
    }
    onlineRoster.draw(uiContext);
    npcInteractionUi.draw(uiContext);
    tradeUi.draw(uiContext, uiWidth, uiHeight);
    characterNamePrompt.draw(uiContext);
    if (!characterNamePrompt.isActive && !npcInteractionUi.active && !chatOverlay.isOpen
      && snapshot.tradeSession === null) overworldUi.drawBuildControl(uiContext);
    delveRewards.drawRewards(uiContext); delveRewards.drawHud(uiContext);
    overworldUi.drawBlockingOverlay(uiContext);
    overworldUi.drawCursorOverlay(uiContext);
    uiContext.restore();
  }
  if (!interfaceHidden && debugCollision && debugTerrainPoint !== null && terrainInspector !== null) {
    uiContext.save();
    uiContext.translate(uiOriginX, uiOriginY);
    const {
      drawTerrainInspectionVisuals,
      inspectTerrainAtProjectedPoint,
      terrainInspectionLines,
      terrainInspectionThumbnailRects,
      terrainInspectionVisualLayout,
    } = terrainInspector;
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
    const layerKey = [
      inspection.tileX,
      inspection.tileY,
      ...inspection.layers.map((layer) => (
        `${layer.asset}:${layer.frame ?? '-'}:${layer.role}:${layer.tileX}:${layer.tileY}`
      )),
    ].join('|');
    if (layerKey !== debugTerrainLayerKey) {
      debugTerrainLayerKey = layerKey;
      debugTerrainLayerVisibility = Array<boolean>(inspection.layers.length).fill(true);
      debugTerrainSelectedLayerIndex = null;
    }
    const allLines = terrainInspectionLines(inspection, debugTerrainSelectedLayerIndex);
    const maximumLines = Math.max(6, Math.floor((uiHeight - 12) / 9));
    const lines = allLines.length <= maximumLines
      ? allLines
      : [...allLines.slice(0, maximumLines - 1), `... ${allLines.length - maximumLines + 1} MORE LINES`];
    const width = Math.max(...lines.map((line) => measurePixelText(line))) + 14;
    const visualLayout = terrainInspectionVisualLayout(inspection);
    const visualX = Math.max(4, uiWidth - visualLayout.width - 4);
    const visualY = 17;
    debugTerrainThumbnailRects = terrainInspectionThumbnailRects(
      inspection,
      visualX,
      visualY,
    );
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
    drawTerrainInspectionVisuals(
      uiContext,
      art,
      terrain,
      groundCache,
      inspection,
      visualX,
      visualY,
      {
        layerVisibility: debugTerrainLayerVisibility,
        selectedLayerIndex: debugTerrainSelectedLayerIndex,
      },
    );
    uiContext.restore();
  }
  if (!interfaceHidden && renderDiagnostics.enabled) {
    uiContext.save();
    uiContext.translate(uiOriginX, uiOriginY);
    const metrics = renderMetricsSnapshot();
    const net = network.metrics();
    const ownPosition = network.ownPosition();
    const remoteDepths = [...remoteBuffers.values()].map((buffer) => buffer.depth);
    const remoteMin = remoteDepths.length === 0 ? 0 : Math.min(...remoteDepths);
    const remoteMax = remoteDepths.length === 0 ? 0 : Math.max(...remoteDepths);
    const activeModifiers = snapshotPlayerModifiers(snapshot);
    const lines = [
      `FRAME ${metrics.averageFrameMs.toFixed(2)} AVG ${metrics.worstFrameMs.toFixed(2)} WORST`,
      `ITEMS ${metrics.renderItems} CHUNKS ${groundCache.residentCount} PARTICLES ${rain.activeCount}`,
      `LIGHT ${dynamicLighting ? frameLightingModel.toUpperCase() : 'BASIC'} ${lightmap.averageMs.toFixed(2)}ms AVG ${lightmap.floodMs.toFixed(2)}ms FLOOD #${lightmap.fieldRebuilds}`,
      `BND ${lightmap.boundsResizeMs.toFixed(2)} OCC ${lightmap.rasterizeMs.toFixed(2)} SOLVE ${lightmap.floodMs.toFixed(2)} MERGE ${lightmap.mergeMs.toFixed(2)}`,
      `UP ${lightmap.uploadMs.toFixed(2)} REC ${lightmap.receiverMs.toFixed(2)} CMP ${lightmap.compositeMs.toFixed(2)} CACHE ${lightmap.occlusionCacheHits}/${lightmap.occlusionRebuilds}`,
      `LIGHTS ${pointLights.length} VISITED ${lightmap.floodTexelsVisited}`,
      `MOON ${lunarPhaseAtAuthorityTick(calendarTick).replaceAll('_', ' ').toUpperCase()} ${lunarIlluminationAtAuthorityTick(calendarTick)}/1000`,
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
    uiContext.restore();
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
  renderMetrics.recordStage('uiDraw', performance.now() - uiDrawStartedAt);
  const renderSubmittedAt = performance.now();
  renderMetrics.record(renderSubmittedAt - renderStarted, renderItems);
  renderMetrics.recordRenderSubmit(renderSubmittedAt);
}

function pointerUiPosition(event: MouseEvent): readonly [number, number] {
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  const uiScale = currentUiScale();
  return [
    (canvasX - safeAreaInsets.left) / uiScale,
    (canvasY - safeAreaInsets.top) / uiScale,
  ];
}

function pointerCanvasPosition(event: MouseEvent): readonly [number, number] {
  const rect = canvas.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left) * renderer.cssWidth / rect.width;
  const canvasY = (event.clientY - rect.top) * renderer.cssHeight / rect.height;
  return [canvasX, canvasY];
}

function showResult(promise: Promise<void>, success: string | null, presentationToken?: number, failures: FailureWording = []): void {
  void promise.then(() => {
    if (success !== null) setToast(success, 'success');
  }).catch((error: unknown) => {
    if (presentationToken !== undefined) localActionPresentation.reject(presentationToken);
    setFailureToast(error, 120, failures);
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
  const cancellation = bowChargeStartedAtMs === null
    ? Promise.resolve()
    : cancelBowChargePresentation();
  optimisticSelectedSlot = slot;
  void cancellation.then(async () => await network.selectHotbar(slot)).then(() => {
    if (latestSnapshot.survival?.selectedSlot === slot) optimisticSelectedSlot = null;
  }).catch((error: unknown) => {
    optimisticSelectedSlot = null;
    setFailureToast(error);
  });
}

function startPredictedAction(kind: string, elapsedMs = 0): number {
  const authority = network.ownPosition();
  return localActionPresentation.start(kind, performance.now() - Math.max(0, elapsedMs), {
    kind: authority?.actionKind ?? 'none', startedTick: authority?.actionStartedTick ?? 0n,
  }, bowChargeStartedAtMs === null);
}

function clearBowChargePresentation(): void {
  bowChargeStartedAtMs = null;
  bowChargeStartingVigourCenti = null;
  bowChargeAuthorityPromise = null;
  bowChargePointerId = null;
}

function settleCanceledBowCharge(startPromise: Promise<void> | null, chargeMs: number): Promise<void> {
  if (startPromise === null) return Promise.resolve();
  return startPromise
    .then(async () => await network.useSelected('aimed_use', { phase: 'cancel', chargeMs }))
    .catch(() => undefined);
}

function cancelBowChargePresentation(): Promise<void> {
  if (bowChargeStartedAtMs === null) return Promise.resolve();
  const chargeMs = currentBowChargeMs();
  const startPromise = bowChargeAuthorityPromise;
  clearBowChargePresentation();
  return settleCanceledBowCharge(startPromise, chargeMs);
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
  const rejection = itemActionRejection(
    selectedItemRow(latestSnapshot),
    latestSnapshot.inventorySlots,
    (kind) => runtimeRangedWeaponDefinition(
      latestSnapshot.content.registry, kind,
    )?.ammunitionItemKind ?? null,
    (kind) => runtimeDurabilityDefinition(latestSnapshot.content.registry, kind) !== null,
  );
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
  const actionPresentationToken = startPredictedAction('ranged_weapon', 450);
  void audio.unlock().then(async () => await audio.playSfx('tool_swing')).catch(() => undefined);
  showResult(
    startPromise.then(async () => await network.useSelected('aimed_use', {
      phase: 'fire', aimX, aimY, chargeMs,
    })).catch((error: unknown) => {
      if (pendingBowProjectile?.token === token) pendingBowProjectile = null;
      throw error;
    }).finally(() => { optimisticVigourCenti = null; }),
    'ARROW LOOSED',
    actionPresentationToken,
  );
}

function setInterfaceHidden(hidden: boolean): void {
  if (interfaceHidden === hidden) return;
  interfaceHidden = hidden;
  retainedPointers.cancel();
  worldTouchInput.reset();
  setOnlinePlayersVisible(false);
  retainedUi.clearHover();
  chatOverlay.root.input.clearHover();
  overworldUi.pointerLeave();
  touchControls.setBlocked(hidden);
  if (!hidden) return;
  chatOverlay.dismiss();
}

function chatInteractionBlocked(): boolean {
  return overworldUi.openWindow !== null
    || overworldUi.blockingUpdatePromptVisible
    || onlinePlayersVisible
    || characterNamePrompt.isActive
    || tradeUi.active
    || npcInteractionUi.active;
}

function connectionRecoveryState(): ConnectionRecoveryState | null {
  if (latestSnapshot.error === 'content_registry_invalid') return 'content-incompatible';
  const state = network.recoveryState;
  if (state === 'offline' || state === 'sign-in-required') return state;
  return hasRenderedWorldFrame && state !== 'ready' ? 'reconnecting' : null;
}

function currentWorldLoadingStage(): ReturnType<typeof worldLoadingStage> {
  const snapshot = latestSnapshot;
  return worldLoadingStage({
    connected: snapshot.connected, error: snapshot.error,
    identityReady: snapshot.identityHex !== null,
    worldReady: snapshot.worldSeed !== null && snapshot.clock !== null && snapshot.environment !== null,
    playerReady: snapshot.identityHex !== null && snapshot.players.get(snapshot.identityHex) !== undefined,
    profileReady: snapshot.characterProfile !== null
      && (localProfilesEnabled || snapshot.membership !== null) && snapshot.survival !== null,
  });
}

function worldClientReady(): boolean {
  return network.gameplayReady && currentWorldLoadingStage().ready === true;
}

function clearConnectionInput(): void {
  if (connectionInputCleared) return;
  connectionInputCleared = true;
  retainedPointers.cancel();
  keys.clear();
  touchControls.reset();
  worldTouchInput.reset();
  // A stale charge must never be replayed against a replacement connection.
  clearBowChargePresentation();
  pendingBowProjectile = null;
  lastDirection = 'idle';
  lastSprinting = false;
  network.setMovementIntent('idle', false);
  clearPointerPresentation();
  chatOverlay.dismiss();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function activateConnectionRecovery(action: 'retry' | 'sign-in'): void {
  if (action === 'sign-in') location.assign('/?menu=1');
  else network.retryConnection();
}

pwaClient.subscribe((status) => {
  overworldUi.setPwaUpdateStatus(status);
  retainedUi.reconcile(); syncRetainedText();
  canvas.classList.toggle('update-prompt-active', overworldUi.blockingUpdatePromptVisible || !worldClientReady());
  if (status !== 'available') return;
  setInterfaceHidden(false);
  canvas.classList.add('update-prompt-active');
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  cancelBowChargePresentation();
  overworldUi.pointerLeave();
  keys.clear();
  touchControls.reset();
  worldTouchInput.reset();
  network.setMovementIntent('idle', false);
});

function resizeForViewportChange(): void {
  // iOS emits visual-viewport resize events while presenting its keyboard.
  // Reallocating the Canvas during that focus transaction can dismiss the
  // transparent native input. The full-bleed layout viewport has not changed;
  // softwareKeyboardInset() already handles the reduced visible area.
  if (document.activeElement instanceof HTMLInputElement
    || document.activeElement instanceof HTMLTextAreaElement) return;
  worldTouchInput.reset();
  resize();
}

window.addEventListener('resize', resizeForViewportChange);
window.visualViewport?.addEventListener('resize', resizeForViewportChange);
// Recovery owns input even when the HUD was hidden. Update decisions retain
// priority and continue through the existing canvas UI event handlers.
let recoveryPointerId: number | null = null;
window.addEventListener('keydown', (event) => {
  if (worldClientReady() || overworldUi.blockingUpdatePromptVisible) return;
  event.stopImmediatePropagation();
  if (event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  if (event.repeat || (event.code !== 'Enter' && event.code !== 'Space')) return;
  const action = connectionRecoveryOverlay.primaryAction(connectionRecoveryState());
  if (action !== null) activateConnectionRecovery(action);
}, { capture: true });
for (const eventName of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
  window.addEventListener(eventName, (event) => {
    const ownsPointer = recoveryPointerId === event.pointerId;
    if (!ownsPointer && (worldClientReady() || overworldUi.blockingUpdatePromptVisible)) return;
    if (event.target !== canvas && !ownsPointer) return;
    event.stopImmediatePropagation();
    if (event.cancelable) event.preventDefault();
    if (eventName === 'pointerdown') {
      recoveryPointerId = event.pointerId;
      if (event.button !== 0) return;
      const [x, y] = pointerUiPosition(event);
      const [width, height] = touchControlViewport();
      connectionRecoveryOverlay.activate({ x, y }, { width, height }, connectionRecoveryState(), activateConnectionRecovery);
    } else if (eventName === 'pointerup' || eventName === 'pointercancel') {
      recoveryPointerId = null;
    }
  }, { capture: true, passive: false });
}
window.addEventListener('wheel', (event) => {
  if (worldClientReady() || overworldUi.blockingUpdatePromptVisible || event.target !== canvas) return;
  event.stopImmediatePropagation();
  if (event.cancelable) event.preventDefault();
}, { capture: true, passive: false });
for (const activityEvent of ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const) {
  window.addEventListener(activityEvent, (event) => {
    network.noteUserActivity();
    if (activityEvent !== 'pointermove' && event.isTrusted) {
      renderMetrics.recordInputTimestamp(event.timeStamp);
    }
  }, { capture: true, passive: true });
}
window.addEventListener('focus', () => network.noteUserActivity());
window.addEventListener('keydown', (event) => {
  const activeElement = document.activeElement;
  const textEntryActive = activeElement instanceof HTMLInputElement
    || activeElement instanceof HTMLTextAreaElement
    || (activeElement instanceof HTMLElement && activeElement.isContentEditable);
  if (!isInterfaceVisibilityToggle(
    event.code,
    event.repeat,
    textEntryActive || event.isComposing,
  )) return;
  setInterfaceHidden(!interfaceHidden);
  event.preventDefault();
  event.stopPropagation();
}, { capture: true });
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && documentIsFullscreen()) event.preventDefault();
}, { capture: true });
window.addEventListener('keydown', (event) => {
  if (event.target === retainedText.input) return;
  void audio.unlock().catch(() => undefined);
  if (!interfaceHidden) {
    if (retainedUi.key(event, 'update-ready') || retainedUi.key(event, 'delve-rewards') || retainedUi.key(event, 'delve-confirmation')) {
      syncRetainedText(); event.preventDefault(); return;
    }
    if (retainedUi.key(event, 'character-name')) {
      syncRetainedText(); event.preventDefault();
      return;
    }
    if (retainedUi.key(event, 'player-trade')) {
      syncRetainedText(); event.preventDefault();
      return;
    }
    if (retainedUi.key(event, 'online-players')) { syncRetainedText(); event.preventDefault(); return; }
    if (!chatOverlay.isOpen && retainedUi.key(event, 'build-palette')) {
      syncRetainedText(); event.preventDefault(); return;
    }
    if (retainedUi.key(event, 'feedback-notice')) { event.preventDefault(); return; }
    if (!chatOverlay.isOpen && retainedUi.key(event, 'quest-tracker')) {
      syncRetainedText(); event.preventDefault();
      return;
    }
    if (retainedUi.key(event, 'chat')) { syncRetainedText(); event.preventDefault(); return; }
    if (openRetainedChat(event)) { event.preventDefault(); return; }
    if (retainedUi.key(event, 'npc-interaction')) {
      syncRetainedText();
      event.preventDefault();
      return;
    }
    if (retainedUi.key(event, 'character-skills') || retainedUi.key(event, 'character-character') || retainedUi.key(event, 'character-statistics') || retainedUi.key(event, 'system-menus') || retainedUi.key(event, 'reading-quests') || retainedUi.key(event, 'reading-help')) {
      syncRetainedText(); event.preventDefault(); return;
    }
    if (retainedUi.key(event, 'inventory-menus')) {
      syncRetainedText(); event.preventDefault(); return;
    }
    if (retainedUi.key(event, 'hud-zoneMinimap') || retainedUi.key(event, 'hud-hotbarVitals') || retainedUi.key(event, 'hud-targetEffects')) {
      syncRetainedText(); event.preventDefault(); return;
    }
    if (event.code === 'Tab') {
      setOnlinePlayersVisible(true, true);
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
  if (event.code === 'KeyB' && !event.repeat) {
    toggleHomesteadBuildMode();
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyG' && !event.repeat) {
    setCollisionDebug(!debugCollision);
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
    renderDiagnostics.enabled = !renderDiagnostics.enabled;
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyF' && !event.repeat) {
    const snapshot = latestSnapshot;
    const selectedUseDefinition = liveItemContentDefinition(snapshot, selectedItem(snapshot));
    const selectedUseAction = selectedItemUseAction(selectedUseDefinition);
    const selectedUseKind = selectedItem(snapshot);
    const cellarToolAction = selectedCellarToolAction(selectedUseDefinition);
    const swingIntent = swingKeyIntent({
      hasAuthoredSwing: runtimeToolDefinition(snapshot.content.registry, selectedUseKind)?.swing !== undefined,
      resourceTargeted: targetResource(snapshot) !== null,
      cellarWallInReach: targetCellarWall(snapshot) !== null,
      cellarToolReady: cellarToolAction !== null && isVitalsTool(selectedUseKind)
        && localMount(snapshot) === null,
      anvilRepairReady: targetAnvilRepairReady(snapshot, selectedUseDefinition),
      farmToolReady: selectedFarmToolAction(selectedUseDefinition) !== null,
    });
    if (swingIntent === 'dig_cellar') {
      const cellarWall = targetCellarWall(snapshot)!;
      const performed = performToolAction(() => network.useSelected('use_at', {
        tileX: cellarWall.tileX, tileY: cellarWall.tileY, actionId: cellarToolAction!.actionId,
      }), 'CELLAR WALL STRUCK', selectedUseKind);
      if (performed) facePredictedTowardTile(cellarWall);
      event.preventDefault();
      return;
    }
    if (swingIntent === 'swing') {
      if (performToolAction(() => network.useSelected('secondary'), null, selectedUseKind)) glanceSwing(snapshot, selectedUseKind);
      event.preventDefault();
      return;
    }
    const selectedWoodcuttingAction = selectedWoodcuttingUseWithAction(selectedUseDefinition);
    const selectedUseIsContextualWorldTool = selectedContextualWorldToolAction(selectedUseDefinition) !== null;
    const selectedUseIsMelee = selectedUseAction !== null
      && selectedUseDefinition?.tags.includes('item.melee_weapon') === true
      && isVitalsTool(selectedUseKind);
    if (selectedUseIsMelee
      && localMount(snapshot) === null
      && carriedCombatTarget(snapshot) === null
      && carriedChest(snapshot) === null
      && carriedPlaceable(snapshot) === null) {
      const target = targetMeleeCombatTarget(snapshot, selectedUseKind);
      const performed = performToolAction(
        () => network.useSelected('secondary', target === null ? {} : {
          targetKind: 'homeX' in target ? 'npc' : 'combat_target',
          entityId: target.id,
        }),
        target === null ? null : 'TARGET STRUCK',
        selectedUseKind,
        target === null,
      );
      if (performed && target !== null) {
        const tile = 'homeX' in target
          ? { tileX: Math.floor(target.x / TILE_SIZE_FIXED), tileY: Math.floor(target.y / TILE_SIZE_FIXED) }
          : combatTargetTile(target);
        facePredictedTowardTile(tile);
      }
      event.preventDefault();
      return;
    }
    if (selectedUseAction !== null && !selectedUseIsMelee && !selectedUseIsContextualWorldTool
      && selectedFarmToolAction(selectedUseDefinition) === null) {
      showResult(network.useSelected('secondary'), null);
      event.preventDefault();
      return;
    }
    const farmGate = targetOwnedHomesteadGate(snapshot);
    if (farmGate !== null) {
      showResult(network.toggleHomesteadGate(), farmGate.open ? 'FARM GATE CLOSED' : 'FARM GATE OPENED');
      event.preventDefault();
      return;
    }
    const groundLightItem = targetGroundItemUse(snapshot);
    const groundItemUseAction = groundLightItem === null ? null : selectedItemLifecycleAction(
      liveItemContentDefinition(snapshot, groundLightItem.itemKind),
      'worldItemUse',
    );
    if (groundLightItem !== null && groundItemUseAction !== null) {
      showResult(
        network.interactEntity('world_item', groundLightItem.id, 'use'),
        `${liveItemLabel(snapshot, groundLightItem.itemKind)} TURNED ${groundLightItem.lit ? 'OFF' : 'ON'}`,
      );
      event.preventDefault();
      return;
    }
    const campfire = targetCampfire(snapshot);
    if (campfire?.targetKind === 'placeable'
      && !campfire.authoredLandmark
      && selectedWoodcuttingAction !== null
      && isVitalsTool(selectedUseKind)) {
      performToolAction(
        () => network.useSelected('use_with', { targetKind: 'placeable', entityId: campfire.id }),
        'CAMPFIRE STRUCK',
        selectedUseKind,
      );
      event.preventDefault();
      return;
    }
    const cookingFire = targetPlaceable(snapshot);
    if (cookingFire !== null
      && objectHasAuthoredTag(snapshot.content.registry, cookingFire, 'station.campfire')
      && objectSecondaryTarget(cookingFire,
        placeableObjectDefinition(snapshot.content.registry, cookingFire),
        objectPresentations.resolve(snapshot.content, cookingFire).state) !== null) {
      showResult(
        network.useSelected('secondary', { targetKind: 'placeable', entityId: cookingFire.id }),
        cookingFire.lit ? 'COOKING FIRE EXTINGUISHED' : 'COOKING FIRE LIT',
      );
      event.preventDefault();
      return;
    }
    const campfirePlaceable = campfire?.targetKind === 'placeable'
      ? snapshot.placeables.get(campfire.id) : undefined;
    if (campfire !== null && (campfire.targetKind === 'landmark'
      || (campfirePlaceable !== undefined && objectSecondaryTarget(campfirePlaceable,
        placeableObjectDefinition(snapshot.content.registry, campfirePlaceable),
        objectPresentations.resolve(snapshot.content, campfirePlaceable).state) !== null))) {
      showResult(
        network.useSelected('secondary', { targetKind: campfire.targetKind, entityId: campfire.id }),
        campfire.lit ? 'CAMPFIRE EXTINGUISHED' : 'CAMPFIRE LIT',
      );
      event.preventDefault();
      return;
    }
    const actionPlaceable = targetPlaceable(snapshot);
    if (actionPlaceable !== null
      && objectHasAuthoredTag(snapshot.content.registry, actionPlaceable, 'station.anvil')
      && selectedItemLifecycleAction(selectedUseDefinition, 'useWith') !== null) {
      showResult(network.useSelected('use_with', { targetKind: 'placeable', entityId: actionPlaceable.id }), 'TOOL REPAIRED', undefined, ANVIL_FAILURES);
      event.preventDefault();
      return;
    }
    const hotbarLight = selectedItemRow(snapshot);
    const equipLight = selectedLightEquipRequest(selectedUseDefinition, hotbarLight?.slot ?? -1);
    if (equipLight !== null && hotbarLight !== undefined) {
      showResult(network.moveInventoryItem(equipLight).then(() => hotbarLight.lit === false
        ? network.useSelected('equipment_use', { equipmentSlot: EQUIPMENT_SLOT_OFFSET + 5 }) : undefined),
        `${liveItemLabel(snapshot, hotbarLight.itemKind)} EQUIPPED AND LIT`);
      event.preventDefault();
      return;
    }
    const selectedLight = equippedLightRow(snapshot);
    const equippedLightUseAction = selectedLight === null ? null : selectedItemLifecycleAction(
      liveItemContentDefinition(snapshot, selectedLight.itemKind),
      'equipmentUse',
    );
    if (selectedLight !== null && equippedLightUseAction !== null) {
      showResult(
        network.useSelected('equipment_use', { equipmentSlot: selectedLight.slot }),
        `${liveItemLabel(snapshot, selectedLight.itemKind)} TURNED ${selectedLight.lit === false ? 'ON' : 'OFF'}`,
      );
      event.preventDefault();
      return;
    }
    const chest = targetChest(snapshot);
    if (chest !== null && selectedWoodcuttingAction !== null
      && isVitalsTool(selectedUseKind)) {
      performToolAction(
        () => network.useSelected('use_with', {
          targetKind: network.chestTargetKind(chest.id), entityId: chest.id,
        }),
        'CHEST STRUCK',
        selectedUseKind,
      );
      event.preventDefault();
      return;
    }
    const selectedDefinition = liveItemDefinition(snapshot, selectedItem(snapshot));
    const selectedPlaceAction = selectedItemLifecycleAction(selectedUseDefinition, 'place');
    const selectedPlaceIsFarmAction = selectedDefinition?.tags.includes('item.seed') === true
      || selectedDefinition?.tags.includes('item.farming.compost') === true
      || selectedFarmToolAction(selectedUseDefinition, selectedPlaceAction) !== null;
    if (selectedPlaceAction !== null && !selectedPlaceIsFarmAction
      && carriedCombatTarget(snapshot) === null
      && carriedChest(snapshot) === null
      && carriedPlaceable(snapshot) === null) {
      const tile = targetInteractionTile();
      const homestead = selectedDefinition?.tags.includes('item.homestead_deed') === true;
      const boat = selectedDefinition?.tags.includes('vehicle.boat') === true;
      if (tile === null) setToast(
        homestead ? 'NO HOMESTEAD SITE TARGETED' : boat ? 'NO WATER TILE TARGETED' : 'NO PLACEMENT TILE TARGETED',
        'failure',
        90,
      );
      else if (homestead && homesteadPlacementBlocked(snapshot, tile)) {
        setToast('HOMESTEAD CANNOT BE PLACED THERE', 'failure', 90);
      } else if (boat && boatPlacementTileBlocked(snapshot, tile)) {
        setToast('BOATS CAN ONLY BE PLACED ON OPEN WATER', 'failure', 90);
      } else if (!homestead && !boat && placementTileBlocked(snapshot, tile, false, { kind: selectedItem(snapshot) })) {
        setToast('PLACEMENT BLOCKED', 'failure', 90);
      } else showResult(
        network.useSelected('place', { tileX: tile.tileX, tileY: tile.tileY }),
        homestead ? 'HOMESTEAD ESTABLISHED' : boat ? 'BOAT LAUNCHED'
          : `${liveItemLabel(snapshot, selectedItem(snapshot))} PLACED`,
      );
      event.preventDefault();
      return;
    }
    const carriedTarget = carriedCarriableCombatTarget(snapshot);
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
        setToast(`${combatTargetDefinition(snapshot, carriedTarget)!.displayName.toUpperCase()} CANNOT BE PLACED THERE`, 'failure', 90);
      } else {
        const namedTarget = carriedTarget ?? targetFacedCombatTarget(snapshot)!;
        const label = combatTargetDefinition(snapshot, namedTarget)!.displayName.toUpperCase();
        showResult(
          placing
            ? network.useSelected('place', { tileX: tile.tileX, tileY: tile.tileY })
            : network.interactEntity('combat_target', targetFacedCombatTarget(snapshot)!.id, 'pickup'),
          placing ? `${label} PLACED` : `${label} CARRIED`,
        );
      }
      event.preventDefault();
      return;
    }
    if (carriedChest(snapshot) !== null || targetFacedChest(snapshot) !== null) {
      const placing = carriedChest(snapshot) !== null;
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
        showResult(
          placing
            ? network.useSelected('place', { tileX: tile.tileX, tileY: tile.tileY })
            : network.interactEntity('placeable', targetFacedChest(snapshot)!.id, 'pickup'),
          placing ? 'CHEST PLACED' : 'CHEST PICKED UP',
        );
      }
      event.preventDefault();
      return;
    }
    const selectedPlaceable = targetPlaceable(snapshot);
    const facedPlaceable = selectedPlaceable !== null
      && runtimeObjectCarry(snapshot.content.registry, selectedPlaceable) !== null
      ? selectedPlaceable : null;
    const handsPlaceable = carriedCarriablePlaceable(snapshot);
    if (handsPlaceable !== null || facedPlaceable !== null) {
      const placing = handsPlaceable !== null;
      const tile = placing ? targetInteractionTile() : facedInteractionTile(
        predicted?.position.x ?? 0,
        predicted?.position.y ?? 0,
        predicted?.facing ?? 'down',
      );
      if (tile === null) {
        setToast('NO PLACEMENT TILE TARGETED', 'failure', 90);
      } else if (placing && placementTileBlocked(snapshot, tile, false, handsPlaceable ?? undefined)) {
        setToast('PLACEMENT BLOCKED', 'failure', 90);
      } else {
        showResult(
          placing
            ? network.useSelected('place', { tileX: tile.tileX, tileY: tile.tileY })
            : network.interactEntity('placeable', facedPlaceable!.id, 'pickup'),
          placing
            ? `${liveItemLabel(snapshot, handsPlaceable.kind)} PLACED`
            : `${liveItemLabel(snapshot, facedPlaceable!.kind)} CARRIED`,
        );
      }
      event.preventDefault();
      return;
    }
    const item = selectedItem(snapshot);
    if (selectedAimedUseAction(snapshot) !== null) {
      setToast('HOLD LEFT MOUSE TO DRAW THE BOW');
      event.preventDefault();
      return;
    }
    if (localMount(snapshot) !== null) {
      setToast('TOOLS CANNOT BE USED WHILE RIDING', 'failure');
      event.preventDefault();
      return;
    }
    const fishingToolAction = selectedFishingToolAction(selectedUseDefinition);
    if (fishingToolAction !== null) {
      if (ignoreDistantTileToolInput(snapshot)) {
        event.preventDefault();
        return;
      }
      const target = targetFishingTile();
      if (target === null) setToast('TARGET A CLEAR WATER TILE', 'failure', 90);
      else performFishingCast(target, item, fishingToolAction.castActionId);
      event.preventDefault();
      return;
    }
    const cropTile = targetFarmTile();
    const selectedCropItem = selectedItem(snapshot);
    const cropAtTarget = targetCrop(snapshot);
    if (liveItemDefinition(snapshot, selectedCropItem)?.tags.includes('item.farming.compost') === true) {
      if (cropTile === null) setToast('TARGET A GROWING CROP', 'failure', 90);
      else showResult(network.useSelected('place', { tileX: cropTile.tileX, tileY: cropTile.tileY }), 'CROP COMPOSTED');
      event.preventDefault();
      return;
    }
    if (cropTile !== null && cropAtTarget === null
      && liveItemDefinition(snapshot, selectedCropItem)?.tags.includes('item.seed') === true) {
      showResult(
        network.useSelected('place', { tileX: cropTile.tileX, tileY: cropTile.tileY }),
        'SEEDS PLANTED',
      );
      event.preventDefault();
      return;
    }
    const farmToolAction = selectedFarmToolAction(selectedUseDefinition);
    if (farmToolAction !== null) {
      if (ignoreDistantTileToolInput(snapshot)) {
        event.preventDefault();
        return;
      }
      const tile = targetFarmTile();
      if (tile === null) {
        setToast('NO FARM TILE TARGETED', 'failure', 90);
      } else {
        const restoring = farmToolAction.restoreActionId !== null && cropAtTarget === null
          && latestSnapshot.soil.get(farmSoilKey(
            tile.tileX,
            tile.tileY,
            activeSpaceDefinition.spaceId,
          )) !== undefined;
        performFarmToolAction(
          tile,
          item,
          farmToolAction.mode,
          restoring ? farmToolAction.restoreActionId! : farmToolAction.useActionId,
        );
      }
      event.preventDefault();
      return;
    }
    const selectedWorldToolAction = selectedContextualWorldToolAction(selectedUseDefinition);
    // Items with no world action simply do nothing on the use key.
    if (selectedWorldToolAction !== null) {
      const resource = targetResource(snapshot);
      const cellarWall = resource === null ? targetCellarWall(snapshot) : null;
      const cellarToolAction = selectedCellarToolAction(selectedUseDefinition);
      if (!isVitalsTool(item)) {
        setToast('THIS TOOL IS NOT READY FOR WORLD USE', 'failure', 90);
      } else if (cellarWall !== null && cellarToolAction !== null) {
        const performed = performToolAction(
          () => network.useSelected('use_at', {
            tileX: cellarWall.tileX,
            tileY: cellarWall.tileY,
            actionId: cellarToolAction.actionId,
          }),
          'CELLAR WALL STRUCK',
          item,
        );
        if (performed) facePredictedTowardTile(cellarWall);
      } else if (resource === null) {
        if (performToolAction(() => network.useSelected('secondary'), null, item, true)) glanceSwing(snapshot, item);
      } else {
        const efficientRank = runtimeSkillCapabilities(
          snapshot.content.registry,
          Object.fromEntries([...snapshot.skillNodes].map(({ nodeId, rank }) => [nodeId, rank])),
        ).efficientStrikesRank;
        const miningPayout = resource.yieldProgress + miningWorkPerHit(efficientRank) >= MINING_YIELD_WORK;
        const resourceDefinition = runtimeResourceDefinition(snapshot.content.registry, resource);
        const result = resourceDefinition?.mining?.nodeClass === 'rock'
          ? miningPayout && resource.richness <= 1 ? 'ROCK DEPLETED'
            : miningPayout ? 'PEBBLE CHIPPED' : 'ROCK STRUCK'
          : resourceDefinition?.interaction.mode === 'mine'
            || (resourceDefinition === null && isMineableOreKind(resource.kind, snapshot.content.registry))
          ? miningPayout && resource.richness <= 1 ? 'VEIN DEPLETED'
            : miningPayout ? 'YIELD PRODUCED' : 'ORE STRUCK'
          : resource.health > 1 ? 'CHOP!' : 'TREE FELLED';
        performToolAction(
          () => network.useSelected('use_with', { targetKind: 'resource', entityId: resource.id }),
          result,
          item,
        );
      }
    }
    event.preventDefault();
    return;
  }
  if (event.code === TOUCH_ACTION_KEY_CODES.dodge && !event.repeat) {
    if (!defenseInputAvailable()) {event.preventDefault();return;}
    const aim=defenseAim();
    showResult(network.combatDefense('dodge',aim.x,aim.y),'DODGE · 18 VIGOUR');
    event.preventDefault();return;
  }
  if (event.code === 'KeyX') { keys.add(event.code); event.preventDefault();return; }
  if (event.code === 'Space' && !event.repeat) {
    const mountedNpc = localMount(latestSnapshot);
    const mount = runtimeNpcMount(latestSnapshot.content.registry, mountedNpc);
    if (jumpInputSkillAvailable(
      latestSnapshot.skillNodes, mount, mountedNpc !== null, latestSnapshot.content.registry,
    )) {
      showResult(network.jumpHorse(), mount?.adapter === 'horse' ? 'HORSE JUMP!' : 'JUMP!');
    }
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyE' && !event.repeat) {
    const interaction = targetInteraction(latestSnapshot);
    if (interaction !== null) interaction.activate();
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyV' && !event.repeat) {
    const weapon=latestSnapshot.inventorySlots.get(MAIN_HAND_INVENTORY_SLOT);
    if (weapon !== undefined && weapon.itemKind !== 'empty' && weapon.quantity > 0) selectSlotOptimistically(MAIN_HAND_INVENTORY_SLOT);
    else setToast('EQUIP A WEAPON IN MAIN HAND FIRST', 'failure');
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyQ' && !event.repeat) {
    if (localMount(latestSnapshot) !== null) {
      setToast('ITEMS CANNOT BE DROPPED WHILE RIDING', 'failure');
      event.preventDefault();
      return;
    }
    showResult(network.dropSelected(), 'DROPPED SELECTED SLOT', startPredictedAction('drop'));
    event.preventDefault();
    return;
  }
  if (event.code.startsWith('Arrow')) event.preventDefault();
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => {
  if (event.code !== 'Tab' || !releaseOnlinePlayersTab()) return;
  event.preventDefault();
});
document.addEventListener('visibilitychange', () => {
  weatherTickClock.pause();
  if (document.hidden) { retainedPointers.cancel(); releaseDefenseHold(); clearPointerPresentation(); }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));

function clearPointerPresentation(): void {
  worldPointer = null;
  hoveredInteractionTile = null;
  retainedUi.clearHover();
  chatOverlay.root.input.clearHover();
  overworldUi.pointerLeave();
}

window.addEventListener('blur', () => {
  retainedPointers.cancel();
  releaseDefenseHold();
  setOnlinePlayersVisible(false);
  keys.clear();
  touchControls.reset();
  worldTouchInput.reset();
  cancelBowChargePresentation();
  clearPointerPresentation();
});
function dispatchTouchControlAction(action: TouchControlAction): void {
  if (action === 'movement' || action === 'block') return;
  if (action === 'dodge') { if(!defenseInputAvailable())return; const aim=defenseAim();showResult(network.combatDefense('dodge',aim.x,aim.y),'DODGE · 18 VIGOUR');return; }
  // Control touches are intercepted before world-pointer handling, preserving
  // the last deliberately selected tile without replacing it with this button.
  const code = action === 'interact' ? 'KeyE' : action === 'secondary' ? 'KeyF' : 'Space';
  window.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code,
    key: action === 'interact' ? 'e' : action === 'secondary' ? 'f' : ' ',
  }));
}

function touchControlsBlocked(): boolean {
  return !retainedUiAvailable() || overworldUi.openWindow !== null || onlinePlayersVisible
    || characterNamePrompt.isActive || npcInteractionUi.active || tradeUi.active || chatOverlay.isOpen
    || overworldUi.retainedConfirmationActive;
}
function syncTouchControls(): void {
  const [width, height] = touchControlViewport();
  touchControls.setBounds(width, height);
  touchControls.setBlocked(touchControlsBlocked());
}

function touchControlViewport(): readonly [number, number] {
  const viewport = hudViewportCss();
  const uiScale = fittedUiScale(desiredUiScale, viewport.width, viewport.height);
  return [viewport.width / uiScale, viewport.height / uiScale];
}

// Unowned world gestures retain their separate pinch/hold authority. Retained
// thumb-control tails are captured earlier by RetainedUiPointers, including
// outside-canvas releases and lost capture.
window.addEventListener('pointermove', (event) => {
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  if (worldTouchInput.pointerMove({ pointerId: event.pointerId, x: canvasX, y: canvasY })) {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    return;
  }
}, { capture: true });
window.addEventListener('pointerup', (event) => {
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  if (worldTouchInput.pointerUp({ pointerId: event.pointerId, x: canvasX, y: canvasY }, false)) {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    return;
  }
}, { capture: true });
window.addEventListener('pointercancel', (event) => {
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  if (worldTouchInput.pointerUp({ pointerId: event.pointerId, x: canvasX, y: canvasY }, true)) {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    return;
  }
}, { capture: true });
canvas.addEventListener('pointermove', (event) => {
  touchControls.notePointerType(event.pointerType);
  syncTouchControls();
  const [x, y] = pointerUiPosition(event);
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  worldPointer = { x: canvasX, y: canvasY };
  refreshHoveredInteractionTile();
  if (interfaceHidden) return;
  overworldUi.systemCursorMove({ x, y });
  if (retainedPointers.dispatch('move', event, 'update-ready') || retainedPointers.dispatch('move', event, 'delve-rewards') || retainedPointers.dispatch('move', event, 'delve-confirmation')) return;
  if (retainedPointers.dispatch('move', event, 'character-name')) return;
  if (retainedPointers.dispatch('move', event, 'player-trade')) return;
  if (retainedPointers.dispatch('move', event, 'npc-interaction')) return;
  if (retainedPointers.dispatch('move', event, 'online-players')) return;
  if (retainedPointers.dispatch('move', event, 'inventory-menus')) return;
  if (retainedPointers.dispatch('move', event, 'character-skills') || retainedPointers.dispatch('move', event, 'character-character') || retainedPointers.dispatch('move', event, 'character-statistics') || retainedPointers.dispatch('move', event, 'system-menus') || retainedPointers.dispatch('move', event, 'reading-quests') || retainedPointers.dispatch('move', event, 'reading-help')) return;
  if (retainedPointers.dispatch('move', event, 'build-palette')) { chatOverlay.root.input.clearHover(); return; }
  if (retainedPointers.dispatch('move', event, 'feedback-notice')) return;
  if (retainedPointers.dispatch('move', event, 'chat')) return;
  overworldUi.pointerMove({ x, y }, { shift: event.shiftKey });
  if (overworldUi.openWindow === null && !chatOverlay.isHovered && retainedPointers.dispatch('move', event, 'quest-tracker')) return;
  if (retainedPointers.dispatch('move', event, 'hud-zoneMinimap') || retainedPointers.dispatch('move', event, 'hud-hotbarVitals') || retainedPointers.dispatch('move', event, 'hud-targetEffects')) return;
  if (retainedPointers.dispatch('move', event, 'touch-controls')) return;
});
canvas.addEventListener('pointerleave', (event) => {
  // A captured retained gesture can finish outside the canvas. Legacy leave
  // cleanup must not clear its inventory preview before the owned release.
  if (retainedUi.tracksPointer(event.pointerId)) { retainedUi.clearHover(); return; }
  clearPointerPresentation();
});
canvas.addEventListener('pointerdown', (event) => {
  // Scoped pointer misses can synchronously blur native editing. Preserve the
  // gesture's original dismissal ownership before any dispatch or text sync.
  const wasChatOpen = chatOverlay.isOpen;
  // Keep an existing chat draft while its own retained controls take capture.
  if (!wasChatOpen) { retainedUi.clearFocus(); syncRetainedText(); }
  void audio.unlock().catch(() => undefined);
  touchControls.notePointerType(event.pointerType);
  syncTouchControls();
  const [x, y] = pointerUiPosition(event);
  if (event.pointerType === 'touch' && worldTouchInput.pinching) {
    const [canvasX, canvasY] = pointerCanvasPosition(event);
    worldTouchInput.pointerDown({ pointerId: event.pointerId, x: canvasX, y: canvasY });
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  if (!interfaceHidden) overworldUi.systemCursorDown({ x, y });
  if (!interfaceHidden && (retainedPointers.dispatch('down', event, 'update-ready') || retainedPointers.dispatch('down', event, 'delve-rewards') || retainedPointers.dispatch('down', event, 'delve-confirmation'))) {
    event.preventDefault(); return;
  }
  if (!interfaceHidden && retainedPointers.dispatch('down', event, 'player-trade')) {
    event.preventDefault();
    return;
  }
  if (!interfaceHidden && retainedPointers.dispatch('down', event, 'online-players')) { event.preventDefault(); return; }
  if (event.button === 0 && terrainInspectorPointerDown(x, y)) {
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  if (!interfaceHidden && !characterNamePrompt.isActive && !npcInteractionUi.active
    && !chatOverlay.isOpen && overworldUi.pointerBuildControl({ x, y }, event.button)) {
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  // Scoped dispatch does not sort passive hosts. Match paint order before a
  // thumb control can claim a compact HUD overlap or mutate the world target.
  if (!interfaceHidden && retainedPointers.dispatch('down', event, 'build-palette')) { event.preventDefault(); return; }
  if (retainedPointers.dispatch('down', event, 'feedback-notice')) { event.preventDefault(); return; }
  const passiveHudRouted = touchControls.visible && !touchControlsBlocked();
  if (passiveHudRouted) {
    if (retainedPointers.dispatch('down', event, 'quest-tracker')
      || retainedPointers.dispatch('down', event, 'hud-zoneMinimap')
      || retainedPointers.dispatch('down', event, 'hud-hotbarVitals')
      || retainedPointers.dispatch('down', event, 'hud-targetEffects')) {
      event.preventDefault(); return;
    }
  }
  if (retainedPointers.dispatch('down', event, 'touch-controls')) {
    event.preventDefault(); return;
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
      resetTerrainInspectorLayers();
    } else if (event.button === 2) {
      debugTerrainPoint = null;
      resetTerrainInspectorLayers();
    }
    event.preventDefault();
    return;
  }
  if (!interfaceHidden) {
    if (retainedPointers.dispatch('down', event, 'character-name')) {
      event.preventDefault();
      return;
    }
    if (retainedPointers.dispatch('down', event, 'npc-interaction')) {
      event.preventDefault(); return;
    }
    if (retainedPointers.dispatch('down', event, 'character-skills') || retainedPointers.dispatch('down', event, 'character-character') || retainedPointers.dispatch('down', event, 'character-statistics') || retainedPointers.dispatch('down', event, 'system-menus') || retainedPointers.dispatch('down', event, 'reading-quests') || retainedPointers.dispatch('down', event, 'reading-help')) {
      event.preventDefault(); return;
    }
    if (retainedPointers.dispatch('down', event, 'inventory-menus')) {
      event.preventDefault(); return;
    }
    // The retained window tree is visually above chat and therefore receives
    // the first opportunity to capture input as well. Previously chat could
    // activate through a modal that was correctly painted over it.
    if (overworldUi.pointerDown({ x, y }, event.button, {
      shift: event.shiftKey,
      pointerType: event.pointerType,
    })) {
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (retainedPointers.dispatch('down', event, 'chat')) {
      event.preventDefault();
      return;
    }
    if (!passiveHudRouted && overworldUi.openWindow === null && retainedPointers.dispatch('down', event, 'quest-tracker')) {
      event.preventDefault();
      return;
    }
    if (!passiveHudRouted && !interfaceHidden && (retainedPointers.dispatch('down', event, 'hud-zoneMinimap') || retainedPointers.dispatch('down', event, 'hud-hotbarVitals') || retainedPointers.dispatch('down', event, 'hud-targetEffects'))) {
      event.preventDefault(); return;
    }
  }
  retainedUi.clearFocus(); syncRetainedText();
  if (wasChatOpen) { chatOverlay.blurInput(); event.preventDefault(); return; }
  const worldPointerAvailable = interfaceHidden
    || (overworldUi.openWindow === null && !chatOverlay.isOpen);
  if (event.pointerType === 'touch' && event.button === 0 && worldPointerAvailable) {
    if (worldTouchActionAvailable()) worldTouchInput.pointerDown({ pointerId: event.pointerId, x: canvasX, y: canvasY });
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  performWorldPointerAction(event, canvasX, canvasY, worldPointerAvailable);
});
function worldTouchActionAvailable(): boolean {
  // Hidden HUD alone allows world gestures; an open window, chat, or blocking
  // dialogue still owns input even if it appeared after this touch started.
  return worldClientReady() && overworldUi.openWindow === null && !chatOverlay.isOpen
    && !chatInteractionBlocked() && latestSnapshot.rogueRun?.phase !== 'reward';
}

function dispatchWorldTouchAction(point: WorldTouchPoint, capturePointer: boolean): void {
  if (!worldTouchActionAvailable()) return;
  worldPointer = { x: point.x, y: point.y };
  refreshHoveredInteractionTile();
  performWorldPointerAction({
    button: 0, pointerId: point.pointerId, preventDefault: () => undefined,
  }, point.x, point.y, true, capturePointer);
}

function performWorldPointerAction(
  event: Pick<PointerEvent, 'button' | 'pointerId' | 'preventDefault'>,
  canvasX: number,
  canvasY: number,
  worldPointerAvailable: boolean,
  capturePointer = true,
): void {
  if (homesteadBuildMode && event.button === 0 && worldPointerAvailable
    && hoveredInteractionTile !== null) {
    const selection = homesteadBuildPalette.selection;
    if (activeSpaceDefinition.generator === 'residence') {
      const tile = hoveredInteractionTile;
      if (furnitureMoves.pending || constructionRequests.pending) { event.preventDefault(); return; }
      if(homesteadBuildPalette.constructionTool!==null){
        const preview=constructionPreviewAt(tile);
        if(preview.failure!==null)setToast(preview.failure.replaceAll('_',' ').toUpperCase(),'failure',120);
        else constructionProposal={scope:constructionScope(),tool:homesteadBuildPalette.constructionTool,tile:{...tile},preview};
        event.preventDefault();return;
      }
      if (selection.kind === 'move') {
        try {
        if (!furnitureMoves.selected) {
          const item = furnitureAtTile(currentFurniture(), tile.tileX, tile.tileY);
          const row = item ? latestSnapshot.placeables.get(BigInt(item.id)) : undefined;
          const failure = item ? furniturePickupFailure(item, currentFurniture(), predicted?.position ?? { x: 0, y: 0 }, furnitureCollision,
            latestSnapshot.activePlaceable?.id.toString() === item.id) : 'Select furniture to move';
          if (failure || !row) setToast(failure?.toUpperCase() ?? 'SELECT FURNITURE', 'failure', 120);
          else {
            const definition = placeableObjectDefinition(latestSnapshot.content.registry, row);
            furnitureMoves.select({ ...row, kind: definition?.components.placement?.item.slice(5) ?? row.kind });
            setToast('CHOOSE A DESTINATION — CLICK MOVE AGAIN TO CANCEL', 'info', 120);
          }
        } else {
          const moving = furnitureMoves.selected, current = latestSnapshot.placeables.get(moving.id);
          if (!current || hearthFurnitureRevision(current.stateJson) !== hearthFurnitureRevision(moving.stateJson)) {
            furnitureMoves.cancel(); setToast('FURNITURE CHANGED — SELECT IT AGAIN', 'failure', 120);
          } else {
            const preview = furniturePreviewAt(tile, moving.kind, moving.id.toString());
            if (preview.failure !== null || !preview.candidate) setToast(preview.failure?.toUpperCase() ?? 'CHOOSE A DESTINATION', 'failure', 120);
            else showResult(furnitureMoves.moveTo(tile.tileX, tile.tileY,
              preview.candidate.supportId === undefined ? undefined : BigInt(preview.candidate.supportId)), 'FURNITURE MOVED');
          }
        }
        } catch {
          furnitureMoves.cancel();
          setToast('FURNITURE STATE NEEDS REPAIR', 'failure', 120);
        }
      } else if (selection.kind === 'remove') {
        const item = furnitureAtTile(currentFurniture(), tile.tileX, tile.tileY);
        if (!item) setToast('SELECT FURNITURE TO PICK UP', 'failure', 90);
        else {
          const failure = furniturePickupFailure(item, currentFurniture(), predicted?.position ?? { x: 0, y: 0 }, furnitureCollision,
            latestSnapshot.activePlaceable?.id.toString() === item.id);
          if (failure) setToast(failure.toUpperCase(), 'failure', 120);
          else showResult(network.pickupHearthFurniture(BigInt(item.id)), 'FURNITURE RETURNED TO YOUR BAG');
        }
      } else if (selection.kind === 'place') {
        const preview = furniturePreviewAt(tile, selection.itemKind);
        if (preview.failure !== null || !preview.candidate) setToast(preview.failure?.toUpperCase() ?? 'CHOOSE FURNITURE', 'failure', 120);
        else showResult(network.placeHearthFurniture(selection.itemKind, tile.tileX, tile.tileY,
          preview.candidate.supportId === undefined ? undefined : BigInt(preview.candidate.supportId)), 'FURNITURE PLACED');
      }
      event.preventDefault();
      return;
    }
    if (selection.kind === 'remove') {
      const target = latestSnapshot.placeables.find((placeable) => {
        if (placeable.carriedBy !== undefined) return false;
        return homesteadBuildFootprintTiles(
          runtimeHomesteadBuildDefinition(latestSnapshot.content.registry, placeable) ?? { footprint: { width: 1, height: 1 } },
          placeable.tileX,
          placeable.tileY,
        ).some((tile) => tile.tileX === hoveredInteractionTile!.tileX
          && tile.tileY === hoveredInteractionTile!.tileY);
      });
      if (target === undefined) setToast('SELECT A BUILT OBJECT TO REMOVE', 'failure', 90);
      else showResult(network.removeHomesteadBuildable(target.id), 'BUILD REMOVED — REFUND DELIVERED');
    } else if (selection.kind === 'place') {
      showResult(
        network.placeHomesteadBuildable(
          selection.itemKind,
          hoveredInteractionTile.tileX,
          hoveredInteractionTile.tileY,
        ),
        `${(liveItemDefinition(latestSnapshot, selection.itemKind)?.displayName ?? selection.itemKind).toUpperCase()} BUILT`,
      );
    }
    event.preventDefault();
    return;
  }
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
      const equippedDefinition = liveItemContentDefinition(latestSnapshot, equipped);
      const aimedUse = selectedAimedUseAction(latestSnapshot) !== null;
      const fishingTool = selectedFishingToolAction(equippedDefinition);
      const farmTool = selectedFarmToolAction(equippedDefinition);
      if (nextTarget !== null && fishingTool === null) {
        selectedEntityTarget = nextTarget;
        if (!aimedUse) {
          event.preventDefault();
          return;
        }
      } else if (!aimedUse && farmTool === null && fishingTool === null) {
        selectedEntityTarget = null;
      }
    }
  }
  if (event.button === 0 && selectedAimedUseAction(latestSnapshot) !== null
    && carriedChest(latestSnapshot) === null
    && carriedCombatTarget(latestSnapshot) === null
    && carriedPlaceable(latestSnapshot) === null
    && worldPointerAvailable) {
    const rejection = itemActionRejection(
      selectedItemRow(latestSnapshot),
      latestSnapshot.inventorySlots,
      (kind) => runtimeRangedWeaponDefinition(
        latestSnapshot.content.registry, kind,
      )?.ammunitionItemKind ?? null,
      (kind) => runtimeDurabilityDefinition(latestSnapshot.content.registry, kind) !== null,
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
    const authorityPromise = network.useSelected('aimed_use', { phase: 'begin' });
    bowChargeAuthorityPromise = authorityPromise;
    const actionPresentationToken = startPredictedAction('ranged_weapon');
    void authorityPromise.catch((error: unknown) => {
      localActionPresentation.reject(actionPresentationToken);
      if (bowChargeAuthorityPromise !== authorityPromise) return;
      clearBowChargePresentation();
      setFailureToast(error);
    });
    if (capturePointer) canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const farmItem = selectedItem(latestSnapshot);
  const farmItemDefinition = liveItemContentDefinition(latestSnapshot, farmItem);
  const cellarAction = selectedCellarToolAction(farmItemDefinition);
  if (event.button === 0 && worldPointerAvailable && cellarAction !== null
    && localMount(latestSnapshot) === null) {
    const wall = targetCellarWall(latestSnapshot);
    if (wall !== null) {
      const performed = performToolAction(() => network.useSelected('use_at', {
        tileX: wall.tileX, tileY: wall.tileY, actionId: cellarAction.actionId,
      }), 'CELLAR WALL STRUCK', farmItem);
      if (performed) facePredictedTowardTile(wall);
      event.preventDefault();
      return;
    }
  }
  const farmToolAction = selectedFarmToolAction(farmItemDefinition);
  const fishingToolAction = selectedFishingToolAction(farmItemDefinition);
  if ((event.button === 0 || event.button === 2) && worldPointerAvailable
    && (farmToolAction !== null || fishingToolAction !== null)
    && ignoreDistantTileToolInput(latestSnapshot)) {
    event.preventDefault();
    return;
  }
  const farmTarget = targetFarmTile();
  const pointerCrop = targetCrop(latestSnapshot);
  if (event.button === 0 && worldPointerAvailable
    && farmItemDefinition?.tags.includes('item.farming.compost') === true) {
    if (farmTarget === null) setToast('TARGET A GROWING CROP', 'failure', 90);
    else showResult(network.useSelected('place', { tileX: farmTarget.tileX, tileY: farmTarget.tileY }), 'CROP COMPOSTED');
    event.preventDefault();
    return;
  }
  const restoringFarmTile = event.button === 2 && farmToolAction !== null
    && farmToolAction.restoreActionId !== null && farmTarget !== null
    && pointerCrop === null
    && latestSnapshot.soil.get(farmSoilKey(
      farmTarget.tileX, farmTarget.tileY, activeSpaceDefinition.spaceId,
    )) !== undefined;
  if (restoringFarmTile && localMount(latestSnapshot) === null
    && worldPointerAvailable) {
    performFarmToolAction(farmTarget, farmItem, farmToolAction.mode, farmToolAction.restoreActionId!);
    event.preventDefault();
    return;
  }
  if (event.button === 0 && farmToolAction !== null
    && farmTarget !== null && localMount(latestSnapshot) === null
    && worldPointerAvailable) {
    performFarmToolAction(farmTarget, farmItem, farmToolAction.mode, farmToolAction.useActionId);
    event.preventDefault();
    return;
  }
  if (event.button === 0 && fishingToolAction !== null
    && localMount(latestSnapshot) === null && worldPointerAvailable) {
    const fishingTarget = targetFishingTile();
    if (fishingTarget === null) setToast('TARGET A CLEAR WATER TILE', 'failure', 90);
    else performFishingCast(fishingTarget, farmItem, fishingToolAction.castActionId);
    event.preventDefault();
    return;
  }
  if (event.button === 0 && farmTarget !== null && localMount(latestSnapshot) === null
    && worldPointerAvailable && (
      liveItemDefinition(latestSnapshot, farmItem)?.tags.includes('item.seed') === true
      || pointerCrop !== null
    )) {
    showResult(
      pointerCrop === null
        ? network.useSelected('place', { tileX: farmTarget.tileX, tileY: farmTarget.tileY })
        : network.harvestCropTile(farmTarget.tileX, farmTarget.tileY),
      pointerCrop === null ? 'SEEDS PLANTED' : 'CROP HARVESTED',
    );
    event.preventDefault();
  }
}

canvas.addEventListener('pointerup', (event) => {
  if (!interfaceHidden && (overworldUi.blockingUpdatePromptVisible || delveRewards.active || overworldUi.retainedConfirmationActive)) {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    event.preventDefault(); return;
  }
  const [canvasX, canvasY] = pointerCanvasPosition(event);
  worldPointer = { x: canvasX, y: canvasY };
  const [x, y] = pointerUiPosition(event);
  if (!interfaceHidden) {
    if (characterNamePrompt.isActive) {
      event.preventDefault();
      return;
    }
    if (tradeUi.active) {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (npcInteractionUi.active) {
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
  // Release Canvas ownership before a Canvas UI control focuses its native
  // text input. Mobile Safari otherwise may discard the just-opened keyboard
  // when it completes this captured pointer gesture.
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  const consumed = overworldUi.pointerUp({ x, y }, event.button, { shift: event.shiftKey });
  if (consumed) event.preventDefault();
});
canvas.addEventListener('lostpointercapture', (event) => {
  worldTouchInput.pointerUp({ pointerId: event.pointerId, x: 0, y: 0 }, true);
});
canvas.addEventListener('pointercancel', () => {
  cancelBowChargePresentation();
  worldPointer = null;
  hoveredInteractionTile = null;
  chatOverlay.root.input.cancelPointers();
  overworldUi.pointerLeave();
});
canvas.addEventListener('wheel', (event) => {
  const [x, y] = pointerUiPosition(event);
  if (!interfaceHidden) {
    const overlayWheel = { point: { x, y },
      deltaX: event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? renderer.cssHeight : 1) / currentUiScale(),
      deltaY: event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? renderer.cssHeight : 1) / currentUiScale() };
    if (retainedUi.wheel(overlayWheel, 'update-ready') || retainedUi.wheel(overlayWheel, 'delve-rewards') || retainedUi.wheel(overlayWheel, 'delve-confirmation')) {
      event.preventDefault(); return;
    }
    if (retainedUi.wheel({ point: { x, y }, deltaX: event.deltaX, deltaY: event.deltaY }, 'character-name')) {
      event.preventDefault(); return;
    }
    if (retainedUi.wheel({ point: { x, y },
      deltaX: event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? renderer.cssHeight : 1) / currentUiScale(),
      deltaY: event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? renderer.cssHeight : 1) / currentUiScale(),
    }, 'player-trade')) {
      event.preventDefault();
      return;
    }
    if (retainedUi.wheel({ point: { x, y },
      deltaX: event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? renderer.cssHeight : 1) / currentUiScale(),
      deltaY: event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? renderer.cssHeight : 1) / currentUiScale(),
    }, 'npc-interaction')) {
      event.preventDefault();
      return;
    }
    const wheelUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? renderer.cssHeight : 1;
    const retainedWheel = { point: { x, y }, deltaX: event.deltaX * wheelUnit / currentUiScale(),
      deltaY: event.deltaY * wheelUnit / currentUiScale() };
    if (retainedUi.wheel(retainedWheel, 'online-players')) { event.preventDefault(); return; }
    if (retainedUi.wheel(retainedWheel, 'build-palette')) {
      event.preventDefault(); return;
    }
    if (retainedUi.wheel(retainedWheel, 'character-skills') || retainedUi.wheel(retainedWheel, 'character-character') || retainedUi.wheel(retainedWheel, 'character-statistics') || retainedUi.wheel(retainedWheel, 'system-menus') || retainedUi.wheel(retainedWheel, 'reading-quests') || retainedUi.wheel(retainedWheel, 'reading-help')) {
      event.preventDefault(); return;
    }
    if (retainedUi.wheel(retainedWheel, 'inventory-menus')) {
      event.preventDefault(); return;
    }
    if (overworldUi.wheel({ x, y }, event.deltaX, event.deltaY)) {
      event.preventDefault();
      return;
    }
    if (retainedUi.wheel(retainedWheel, 'feedback-notice')) { event.preventDefault(); return; }
    if (retainedUi.wheel(retainedWheel, 'chat')) { event.preventDefault(); return; }
    if (retainedUi.wheel(retainedWheel, 'quest-tracker')) {
      event.preventDefault(); return;
    }
    if (retainedUi.wheel(retainedWheel, 'hud-zoneMinimap') || retainedUi.wheel(retainedWheel, 'hud-hotbarVitals') || retainedUi.wheel(retainedWheel, 'hud-targetEffects')) {
      event.preventDefault(); return;
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
const loop = createGameplayLoop({ update, render }, renderMetrics);
const removeConnectionLifecycle = installConnectionLifecycle(window, document, {
  suspend: () => {
    clearConnectionInput();
    network.pause();
    weatherTickClock.pause();
    loop.stop();
  },
  resume: () => {
    network.resume();
    networkDirty = true;
    latestSnapshot = network.view();
    loop.start();
  },
  connectionChanged: () => { network.resume(); networkDirty = true; },
});
import.meta.hot?.dispose(removeConnectionLifecycle);
Object.assign(window, {
  __orchardOverworld: {
    protocolLighting: gameplayProtocolLighting(lightingQuality, atlasPresentation, celestialPass),
    prepareProtocolWorkload: createGameplayProtocolWorkload({
      renderer, pass: celestialPass,
      get cameraX() { return latestCameraX; }, get cameraY() { return latestCameraY; },
      get zoom() { return worldZoom; },
      get seed() { return latestSnapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED; },
      get contentRevision() { return latestSnapshot.content.registry.contentHash; },
      get mapRevision() { return latestSnapshot.liveMapDocument?.revision ?? 0; },
      get mapContentHash() { return latestSnapshot.liveMapDocument?.contentHash ?? ''; },
      get resourceRevision() { return network.resourceRevision; },
      get uiWindow() { return overworldUi.openWindow; }, setUiWindow(value) { overworldUi.openWindow = value; },
      get playerIdentity() { return latestSnapshot.identityHex; },
      get lightingPreview() { return lightingPreview; }, get lightPreview() { return lightPreviewKind; },
      setLightingPreview(value) { lightingPreview = value; }, setLightPreview(value) { lightPreviewKind = value; },
      pondTies: () => protocolPondTies(activeSpaceDefinition.generator === 'homestead'
        ? homesteadSurroundingDecorations(latestSnapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED)
        : topsideDecorations(latestSnapshot, latestSnapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED),
      activeSpaceDefinition.spaceId === TOPSIDE_SPACE_ID ? liveIslandDocumentFor(latestSnapshot) : null),
    }),
    snapshot: () => network.snapshot(),
    update,
    render,
    setDirection: (direction: NetworkDirection) => network.setDirection(direction),
    harvestCropTile: (tileX: number, tileY: number) => network.harvestCropTile(tileX, tileY),
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
    setCollisionDebug,
    setLightingModel,
    setLightingQuality,
    // Presentation-only review seam; never changes the shared clock or player position.
    setLightingPreview: (preview: typeof lightingPreview) => { lightingPreview = preview; },
    setMetricsDebug: (enabled: boolean) => { renderDiagnostics.enabled = enabled; },
    setEntitiesHidden: (hidden: boolean) => { debugEntitiesHidden = hidden; },
    benchmarkScenario: async (id: RenderBenchmarkScenarioId) => {
      const { renderBenchmarkScenario } = await import('@orchard/engine/render-benchmark-scenarios');
      return renderBenchmarkScenario(id);
    },
    renderMetrics: () => renderMetricsSnapshot(),
    diagnostics: () => gameplayDiagnostics({ atlasPresentation, lightingModel, lightingEffectsDisabled,
      lightingQuality, lightmap, celestialPass, renderer, worldZoom, currentUiScale,
      activeSpaceDefinition, latestLightCount, rain, groundCache }),
    lightmapMetrics: () => ({
      averageMs: lightmap.averageMs,
      floodMs: lightmap.floodMs,
      fieldRebuilds: lightmap.fieldRebuilds,
      floodTexelsVisited: lightmap.floodTexelsVisited,
      occlusionRebuilds: lightmap.occlusionRebuilds,
      occlusionCacheHits: lightmap.occlusionCacheHits,
      boundsResizeMs: lightmap.boundsResizeMs,
      rasterizeMs: lightmap.rasterizeMs,
      mergeMs: lightmap.mergeMs,
      uploadMs: lightmap.uploadMs,
      receiverMs: lightmap.receiverMs,
      compositeMs: lightmap.compositeMs,
      model: lightingModel,
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
    setLightPreview: (kind: 'lantern' | 'torch' | null) => { lightPreviewKind = kind; },
    setWorldWeather: (mode: WeatherMode) => network.setWorldWeather(mode),
    setWorldWindDirection: (direction: WindDirectionMode) => network.setWorldWindDirection(direction),
    setNameplatesVisible,
    setInterfaceHidden,
    interfaceHidden: () => interfaceHidden,
    openChat: () => openRetainedChat({ key: 'Enter', repeat: false }),
    openWindow: (window: 'inventory' | 'pack' | 'crafting' | 'barrel' | 'furnace' | 'cooking' | 'delve-confirmation' | 'system' | 'settings' | null) => { overworldUi.openWindow = window; },
    uiWindow: () => overworldUi.openWindow,
  },
});
loop.start();
