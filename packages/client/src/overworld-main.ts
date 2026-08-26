import {
  AUTHORITY_TICK_MS,
  BOW_AIM_SCALE,
  BOW_MAX_CHARGE_MS,
  FIXED_UNITS_PER_PIXEL,
  INPUT_REFRESH_STEPS,
  SIM_STEPS_PER_AUTHORITY_TICK,
  SIM_TICKS_PER_SECOND,
  SURVIVAL_CHUNK_TILES,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
  TILE_SIZE_FIXED,
  TICKS_PER_DAY,
  TOOL_VIGOUR_BALANCE,
  EFFECT_KINDS,
  EFFECT_DEFINITIONS,
  authorityDayProgress,
  authorityTickAtDayProgress,
  avatarActionForEquippedKind,
  calendarAtTick,
  bowHeldAnimationFrame,
  bowOriginHeightPixels,
  directionFromAim,
  isWindDirectionMode,
  isWeatherMode,
  generateSurvivalDecorations,
  generateMarlowCampPathTiles,
  isBreakableRockKind,
  isChoppableTreeKind,
  isGatherableResourceKind,
  isInteractivePoiDecorationKind,
  isMineableOreKind,
  survivalResourceDropAfterHit,
  isHorseWithinMountReach,
  itemModifiers,
  isWildlifeSpecies,
  nextWeatherMode,
  nextWindDirectionMode,
  weatherVisualState,
  shiftAuthorityDay,
  simTickOfDayAtAuthorityTick,
  movePlayer,
  movePlayerAtSpeed,
  modifiersForEffects,
  playerHitboxBounds,
  resourceToolReachFixed,
  survivalBiomeAt,
  resolveStats,
  resolveModifierTarget,
  resolveCreatureStats,
  type CollisionMap,
  type Direction,
  type EffectKind,
  type PlayerState,
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
import { AudioBus } from './audio/audio-bus.js';
import { readOidcSession } from './auth/oidc.js';
import type { ChatMessage, PlayerPosition, WorldChest, WorldItem, WorldNpc, WorldResource } from './net/generated/types.js';
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
  drawOverworldMerchant,
  drawOverworldMountedAction,
  drawPlayerHeadPortrait,
  drawNpcPortrait,
  drawOverworldOreNode,
  drawOverworldPoiDecoration,
  drawOverworldRock,
  drawOverworldStump,
  drawOverworldTree,
  drawOverworldWildlife,
  actionVisualForDirection,
  avatarAnimationForDirection,
  horseJumpPose,
  heldLightAnimationForDirection,
  loadOverworldArt,
  natureDecorationFrame,
} from './overworld-art.js';
import { cameraAxisOffset, visibleWorldBounds, worldPointVisible } from './render/camera.js';
import { createClientCollisionMap } from './render/collision.js';
import { drawAnimatedTerrain } from './render/animated-terrain.js';
import { drawFarmSoil, drawFarmTileReticle, drawInsetGround, farmSoilKey } from './render/farmland.js';
import { GroundChunkCache } from './render/ground-cache.js';
import {
  ambientAtTick,
  CAMPFIRE_LIGHT,
  CAMPFIRE_LIGHT_RADIUS_TILES,
  LANTERN_LIGHT,
  LANTERN_LIGHT_RADIUS_TILES,
  playerLightPosition,
  TileLightmap,
  TORCH_LIGHT,
  TORCH_LIGHT_RADIUS_TILES,
  type PointLight,
} from './render/lighting.js';
import { RenderMetrics } from './render/metrics.js';
import { RainWeather } from './render/particles.js';
import { treeSwayOffset, WeatherEffects, windDirectionLabel, type WindTreeSource } from './render/weather-effects.js';
import { drawPixelPanel, drawPixelText, measurePixelText } from './render/pixel-ui.js';
import {
  MAX_WORLD_ZOOM,
  UnifiedRenderer,
  drawWorldDepthQueue,
  type WorldDepthItem,
} from './render/renderer.js';
import { terrainForWorld, type TerrainArray } from './render/terrain.js';
import { interpolateFixedPosition } from './overworld-prediction.js';
import { isNameplateToggle, OverworldUi, type OverworldUiTargetVitals } from './ui/overworld-ui.js';
import { entityTargetAtWorldPoint, sameEntityTarget, targetKey, type SelectedEntityTarget, type TargetableWorldEntity } from './entity-targeting.js';
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
  equippedItemTracksCursor,
  interactionTileAtWorldPoint,
  facedWorldItem,
  hotbarItemLabel,
  hotbarSlotForCode,
  formatDayTime,
  worldPlacementTileIsBlocked,
} from './survival-ui.js';
import './style.css';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (canvasElement === null) throw new Error('Missing overworld canvas');
const canvas: HTMLCanvasElement = canvasElement;
const renderer = new UnifiedRenderer(canvas);
const chatInputElement = document.querySelector<HTMLInputElement>('#account-name');
if (chatInputElement === null) throw new Error('Missing overworld text input');
const characterNameInputElement = document.querySelector<HTMLInputElement>('#character-name');
if (characterNameInputElement === null) throw new Error('Missing character name input');
const art = await loadOverworldArt();
const groundCache = new GroundChunkCache();
const lightmap = new TileLightmap();
const rain = new RainWeather(art.rainStreak, art.rainSplash);
const weatherEffects = new WeatherEffects(art.cloudShadow, art.windGust, art.oakLeaf, art.birchLeaf, art.spruceLeaf);
const renderMetrics = new RenderMetrics();
const audio = new AudioBus(false);

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
  await network.adminTeleport(command.destination);
  toast = `TELEPORTED TO ${command.destination}`;
  toastTicks = 120;
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

let predicted: PlayerState | null = null;
let previousPredicted: PlayerState | null = null;
let lastDirection: NetworkDirection = 'idle';
let toast = 'CONNECTING TO SHARED ISLAND';
let toastTicks = 180;
let effectPhase = 0;
let worldZoom = DEFAULT_WORLD_ZOOM;
let worldZoomTarget = DEFAULT_WORLD_ZOOM;
let desiredUiScale: UiScale = DEFAULT_UI_SCALE;
let wheelZoomLockedUntil = 0;
let collisionKey = '';
let observedResourceRevision = -1;
const initialTerrain = terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION);
let worldCollision: CollisionMap = createClientCollisionMap(initialTerrain, []);
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
  axe: art.iconAxe,
  pickaxe: art.iconPickaxe,
  hoe: art.iconHoe,
  watering_can: art.iconWateringCan,
  bow: art.iconBow,
  shovel: art.iconShovel,
  hammer: art.iconHammer,
  sword: art.iconSword,
  torch: art.itemTorch,
  lantern: art.itemLantern,
  orchard_tea: art.itemOrchardTea,
  arrow: art.itemArrow,
  wood: art.itemWood,
  plank: art.itemPlank,
  stick: art.itemStick,
  chest: art.chest,
  stone: art.itemStone,
  ...art.fruitItems,
  ...art.oreItems,
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
  closeCrafting: () => { void network.closeCrafting().catch(() => undefined); },
  closeChest: () => { void network.closeChest().catch(() => undefined); },
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
    toast = error instanceof Error ? error.message : String(error);
    toastTicks = 120;
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
  const minimum = renderer.minimumZoom(SURVIVAL_WORLD_SIZE * 16);
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

function refreshCollision(snapshot: OverworldView): void {
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
  const nextKey = `${seed}:${version}:${network.resourceRevision}`;
  if (collisionKey === nextKey) return;
  collisionKey = nextKey;
  worldCollision = createClientCollisionMap(terrainForWorld(seed, version), snapshot.resources, snapshot.chests);
}

function update(): void {
  const previous = predicted;
  effectPhase = (effectPhase + 1) % 4;
  worldZoom = easeWorldZoom(worldZoom, worldZoomTarget);
  network.setViewRadius(viewRadiusForViewport(renderer.cssWidth, renderer.cssHeight, worldZoom));
  latestSnapshot = network.view();
  const snapshot = latestSnapshot;
  if (snapshot.activeChest !== null && overworldUi.openWindow !== 'chest') overworldUi.openWindow = 'chest';
  if (snapshot.activeChest === null && overworldUi.openWindow === 'chest') overworldUi.openWindow = null;
  if (optimisticSelectedSlot !== null && snapshot.survival?.selectedSlot === optimisticSelectedSlot) {
    optimisticSelectedSlot = null;
  }
  const weatherTick = snapshot.environment?.calendarTick ?? snapshot.clock?.authorityTick ?? 0n;
  const calendar = calendarAtTick(Number(weatherTick) * SIM_STEPS_PER_AUTHORITY_TICK);
  audio.setAmbienceContext(calendar.season, authorityDayProgress(weatherTick), 'estate');
  const weather = weatherVisualState(worldWeatherMode(), weatherTick, worldWindDirection());
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
      if (previousHealth !== undefined && resource.health < previousHealth && !resource.depleted) {
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
  if (direction !== lastDirection) {
    lastDirection = direction;
    network.setDirection(direction);
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
    predicted = localMount(snapshot) === null
      ? movePlayer(predicted, direction === 'idle' ? null : direction, worldCollision)
      : movePlayerAtSpeed(predicted, direction === 'idle' ? null : direction, worldCollision, 2);
    network.recordPredictedStep(direction, predicted);
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
      toast = status;
      toastTicks = 120;
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
  const selected = optimisticSelectedSlot ?? snapshot.survival?.selectedSlot ?? 0;
  return snapshot.inventorySlots.find((inventory) => inventory.slot === selected)?.itemKind ?? 'empty';
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
  return {
    health: row.healthCenti, maxHealth: resolved.maxHealthCenti,
    mana: row.manaCenti, maxMana: resolved.maxManaCenti,
    vigour: row.vigourCenti, maxVigour: resolved.maxVigourCenti,
    attributes: resolved.attributes,
  };
}

function performToolAction(
  call: () => Promise<void>,
  success: string,
  itemKind: VitalsToolKind,
  whiff = false,
): void {
  const stats = latestSnapshot.stats;
  const baseCost = TOOL_VIGOUR_BALANCE[itemKind].costCenti;
  const fullCost = resolveModifierTarget('toolVigourCost', baseCost, snapshotPlayerModifiers(latestSnapshot));
  const cost = whiff ? Math.ceil(fullCost / 2) : fullCost;
  const available = optimisticVigourCenti ?? stats?.vigourCenti ?? 0;
  if (stats !== null && available < cost) {
    vigourDenyTicks = 24;
    toast = 'INSUFFICIENT VIGOUR';
    toastTicks = 90;
    return;
  }
  if (stats !== null) optimisticVigourCenti = Math.max(0, available - cost);
  showResult(call().finally(() => { optimisticVigourCenti = null; }), success);
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
  const targetsCursor = itemKind === 'axe' || itemKind === 'pickaxe';
  const eligible = [...snapshot.resources].filter((resource) => itemKind === 'axe'
    ? isChoppableTreeKind(resource.kind)
    : itemKind === 'pickaxe'
      ? isMineableOreKind(resource.kind) || isBreakableRockKind(resource.kind)
      : !isGatherableResourceKind(resource.kind));
  return facedResource(
    predicted.position.x,
    predicted.position.y,
    targetsCursor ? cursorFacing() ?? predicted.facing : predicted.facing,
    eligible,
    resourceToolReachFixed(itemKind),
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
      SURVIVAL_WORLD_SIZE,
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
  return facedWorldItem(predicted.position.x, predicted.position.y, predicted.facing, snapshot.worldItems);
}

function carriedChest(snapshot: OverworldView): WorldChest | null {
  if (snapshot.identityHex === null) return null;
  return snapshot.chests.find((chest) => chest.carriedBy?.toHexString() === snapshot.identityHex) ?? null;
}

function targetChest(snapshot: OverworldView): WorldChest | null {
  if (predicted === null) return null;
  let tileX = Math.floor(predicted.position.x / TILE_SIZE_FIXED);
  let tileY = Math.floor(predicted.position.y / TILE_SIZE_FIXED);
  if (predicted.facing.includes('Left') || predicted.facing === 'left') tileX -= 1;
  if (predicted.facing.includes('Right') || predicted.facing === 'right') tileX += 1;
  if (predicted.facing.includes('up') || predicted.facing === 'up') tileY -= 1;
  if (predicted.facing.includes('down') || predicted.facing === 'down') tileY += 1;
  return snapshot.chests.find((chest) => chest.carriedBy === undefined && chest.tileX === tileX && chest.tileY === tileY) ?? null;
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

function targetCampfire(snapshot: OverworldView): { readonly tileX: number; readonly tileY: number } | null {
  if (predicted === null || localMount(snapshot) !== null) return null;
  const campfire = generateSurvivalDecorations(snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED)
    .find((decoration) => decoration.kind === 'camp_campfire');
  if (campfire === undefined) return null;
  const x = campfire.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const y = campfire.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const dx = x - predicted.position.x;
  const dy = y - predicted.position.y;
  return dx * dx + dy * dy <= (2 * TILE_SIZE_FIXED) ** 2
    ? { tileX: campfire.tileX, tileY: campfire.tileY }
    : null;
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
  const maxX = Math.min(SURVIVAL_WORLD_SIZE - 1, Math.ceil((cameraX + viewportWidth / scale) / 16));
  const maxY = Math.min(SURVIVAL_WORLD_SIZE - 1, Math.ceil((cameraY + viewportHeight / scale) / 16));
  for (let tileY = minY; tileY <= maxY; tileY += 1) for (let tileX = minX; tileX <= maxX; tileX += 1) {
    const index = tileY * SURVIVAL_WORLD_SIZE + tileX;
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
  const frame = renderer.beginWorld(worldZoom);
  const context = frame.world;
  const scale = frame.layout.integerScale;
  const viewportWidth = frame.layout.width / scale;
  const viewportHeight = frame.layout.height / scale;
  const worldPixels = SURVIVAL_WORLD_SIZE * 16;
  const cameraX = cameraAxisOffset(localX, viewportWidth, worldPixels);
  const cameraY = cameraAxisOffset(localY, viewportHeight, worldPixels);
  latestCameraX = cameraX;
  latestCameraY = cameraY;
  latestRenderedZoom = worldZoom;
  refreshHoveredInteractionTile();
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
  const terrain = terrainForWorld(seed, version);
  const renderWeatherTick = snapshot.environment?.calendarTick ?? snapshot.clock?.authorityTick ?? 0n;
  const renderWeather = weatherVisualState(worldWeatherMode(), renderWeatherTick, worldWindDirection());
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
    generateMarlowCampPathTiles(),
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

  const visible = visibleWorldBounds(cameraX, cameraY, frame.layout.width, frame.layout.height, scale, 64);
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
  const nameplates: Array<{ x: number; y: number; name: string }> = [];
  const renderedPlayerAnchors = new Map<string, { readonly x: number; readonly y: number }>();
  const targetableEntities: TargetableWorldEntity[] = [];
  const pointLights: PointLight[] = [];
  const windTrees: WindTreeSource[] = [];
  if (!debugEntitiesHidden) for (const decoration of generateSurvivalDecorations(seed)) {
    if (isInteractivePoiDecorationKind(decoration.kind)) continue;
    const decorationX = decoration.tileX * 16 + 8;
    const decorationY = (decoration.tileY + 1) * 16;
    if (decoration.kind === 'camp_campfire') {
      if (worldPointVisible(decorationX, decorationY, lightVisible)) {
        pointLights.push({
          worldX: decorationX,
          worldY: decorationY - 12,
          radiusTiles: CAMPFIRE_LIGHT_RADIUS_TILES,
          color: CAMPFIRE_LIGHT,
        });
      }
    }
    if (!worldPointVisible(decorationX, decorationY, visible)) continue;
    worldDepthItems.push({
      footY: decoration.kind === 'camp_pond' ? decorationY - 48 : decorationY,
      tie: `decoration:${decoration.id}`,
      draw: () => drawOverworldPoiDecoration(
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
      ),
    });
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
    worldDepthItems.push({
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
          drawOverworldPoiDecoration(
            context, art, 'poi_rock_small', resourceX + shakeX, resourceY, cameraX, cameraY, scale,
          );
          return;
        }
        if (isMineableOreKind(resource.kind)) {
          if (resource.depleted) return;
          const shaking = (treeShakeRemaining.get(resource.id) ?? 0) > 0;
          const shakeX = shaking ? (effectPhase < 2 ? -1 : 1) : 0;
          drawOverworldOreNode(context, art, resource.kind, resourceX + shakeX, resourceY, cameraX, cameraY, scale);
          return;
        }
        if (resource.depleted) {
          drawOverworldStump(context, art, resourceX, resourceY, cameraX, cameraY, scale, resource.kind);
          return;
        }
        const shaking = (treeShakeRemaining.get(resource.id) ?? 0) > 0;
        const shakeX = shaking ? (effectPhase < 2 ? -1 : 1) : 0;
        drawOverworldTree(
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
      },
    });
  }
  if (!debugEntitiesHidden) for (const item of snapshot.worldItems) {
    const x = item.x / FIXED_UNITS_PER_PIXEL;
    const y = item.y / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const age = Number((snapshot.clock?.authorityTick ?? item.droppedAtTick) - item.droppedAtTick);
    const arcHeight = age >= 0 && age < 8 ? Math.round(Math.sin(age / 8 * Math.PI) * 8) : 0;
    worldDepthItems.push({
      footY: y,
      tie: `item:${item.id}`,
      draw: () => drawOverworldItem(context, art, item.itemKind, x, y, arcHeight, cameraX, cameraY, scale),
    });
  }
  if (!debugEntitiesHidden) for (const projectile of snapshot.projectiles) {
    const display = projectileDisplay.get(projectile.id);
    const x = (display?.x ?? projectile.x) / FIXED_UNITS_PER_PIXEL;
    const y = (display?.y ?? projectile.y) / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    worldDepthItems.push({
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
    worldDepthItems.push({
      footY: y, tie: `chest:${chest.id}`,
      draw: () => {
        const elapsedFrame = Math.min(5, Math.floor((performance.now() - chestAnimationStartedAtMs) / (1_000 / 6)));
        const frameIndex = chest.id === activeChestId ? elapsedFrame
          : chest.id === closingChestId ? 5 - elapsedFrame : 0;
        drawOverworldChest(context, art, x, y, cameraX, cameraY, scale, frameIndex);
      },
    });
  }
  if (!debugEntitiesHidden) for (const hive of snapshot.hives) {
    const x = hive.tileX * 16 + 8;
    const y = (hive.tileY + 1) * 16;
    if (!worldPointVisible(x, y, visible)) continue;
    worldDepthItems.push({
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
      targetableEntities.push({
        target: { kind: 'npc', id: npc.id }, x, y, halfWidth: 9, height: 24,
      });
      if (npc.displayName.trim()) nameplates.push({ x, y, name: npc.displayName });
      worldDepthItems.push({
        footY: y,
        tie: `merchant:${npc.id}`,
        draw: () => drawOverworldMerchant(
          context, art, x, y, facing, sleeping ? false : npc.moving,
          horseAnimationFrame + Number(npc.id % 19n), cameraX, cameraY, scale,
        ),
      });
      continue;
    }
    const profile = wildlifeProfile(snapshot, npc.id);
    const species = profile?.species ?? (npc.kind === 'horse' ? 'horse' : null);
    if (species === null) continue;
    if (species === 'bee' && npc.wanderDirection === 'inside_hive') continue;
    targetableEntities.push({ target: { kind: 'npc', id: npc.id }, x, y, ...npcTargetDimensions(species) });
    if (npc.displayName.trim()) nameplates.push({ x, y, name: npc.displayName });
    const animationFrame = horseAnimationFrame + Number(npc.id % 19n);
    const biome = survivalBiomeAt(
      snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED,
      Math.floor(x / 16),
      Math.floor(y / 16),
    );
    const inWater = biome === 'freshwater' || biome === 'oasis_water';
    worldDepthItems.push({
      footY: y,
      tie: `npc:${npc.id}`,
      draw: () => species === 'horse'
        ? drawOverworldHorse(
          context, art, x, y, facing, sleeping ? false : npc.moving, animationFrame,
          cameraX, cameraY, scale, false, undefined, profile?.variant ?? 0, npc.wanderDirection,
        )
        : drawOverworldWildlife(
          context, art, species, profile?.variant ?? 0, npc.wanderDirection,
          x, y, facing, sleeping ? false : npc.moving, animationFrame, cameraX, cameraY, scale, inWater,
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
    renderedPlayerAnchors.set(id, { x, y });
    const equipped = local ? lightPreviewKind ?? selectedItem(snapshot) : display?.equippedKind ?? player.equippedKind;
    if ((equipped === 'lantern' || equipped === 'torch') && worldPointVisible(x, y, lightVisible)) {
      const [lightX, lightY] = playerLightPosition(x, y);
      pointLights.push({
        worldX: lightX,
        worldY: lightY,
        radiusTiles: equipped === 'lantern' ? LANTERN_LIGHT_RADIUS_TILES : TORCH_LIGHT_RADIUS_TILES,
        color: equipped === 'lantern' ? LANTERN_LIGHT : TORCH_LIGHT,
      });
    }
    if (!worldPointVisible(x, y, visible)) continue;
    if (!local) targetableEntities.push({
      target: { kind: 'player', id }, x, y,
      halfWidth: mount === null ? 8 : 16, height: mount === null ? 24 : 32,
    });
    const authoritativeFacing = (local ? predicted?.facing ?? player.facing : display?.facing ?? player.facing) as Direction;
    const localEquipped = local ? selectedItem(snapshot) : player.equippedKind;
    const facing = local && equippedItemTracksCursor(localEquipped)
      ? cursorFacing() ?? authoritativeFacing
      : authoritativeFacing;
    const horseFacing = mount === null ? facing : mount.facing as Direction;
    const displayedDx = local
      ? (renderedLocal?.x ?? player.x) - (previousPredicted?.position.x ?? renderedLocal?.x ?? player.x)
      : (display?.x ?? player.x) - (previousDisplay?.x ?? display?.x ?? player.x);
    const displayedDy = local
      ? (renderedLocal?.y ?? player.y) - (previousPredicted?.position.y ?? renderedLocal?.y ?? player.y)
      : (display?.y ?? player.y) - (previousDisplay?.y ?? display?.y ?? player.y);
    const moving = jumpPresentation !== null || Math.abs(displayedDx) + Math.abs(displayedDy) > 0.01;
    const appearance = snapshot.appearances.get(id);
    nameplates.push({ x, y, name: profileName(snapshot.profiles, id) });
    worldDepthItems.push({
      footY: footYFixed / FIXED_UNITS_PER_PIXEL,
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
        );
        if (snapshot.chests.find((chest) => chest.carriedBy?.toHexString() === id)) {
          drawOverworldChest(context, art, x, y - 17, cameraX, cameraY, scale);
        }
      },
    });
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
    ambientAtTick(renderWeatherTick, renderWeather.raining ? 0.12 : 0),
    pointLights,
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
  const farmTarget = farmItem === 'hoe' || farmItem === 'watering_can' ? targetFarmTile() : null;
  if (!debugEntitiesHidden && farmTarget !== null && localMount(snapshot) === null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    drawFarmTileReticle(context, farmTarget.tileX, farmTarget.tileY, cameraX, cameraY, scale);
    drawCalls += 1;
  }
  const chestPlacementTarget = carriedChest(snapshot) !== null || selectedItem(snapshot) === 'chest'
    ? targetInteractionTile() : null;
  if (!debugEntitiesHidden && chestPlacementTarget !== null && localMount(snapshot) === null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    drawFarmTileReticle(
      context,
      chestPlacementTarget.tileX,
      chestPlacementTarget.tileY,
      cameraX,
      cameraY,
      scale,
      !placementTileBlocked(snapshot, chestPlacementTarget),
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
  }
  renderer.compositeWorld();
  drawCalls += 1;

  const uiWidth = renderer.cssWidth / uiScale;
  const uiHeight = renderer.cssHeight / uiScale;
  const uiContext = renderer.beginUi(uiScale);
  const merchant = targetMerchant(snapshot);
  const campfire = targetCampfire(snapshot);
  const horse = targetHorse(snapshot);
  const riding = localMount(snapshot);
  const pickup = targetWorldItem(snapshot);
  const gatherable = targetGatherableResource(snapshot);
  const chest = targetChest(snapshot);
  const handsChest = carriedChest(snapshot);
  const farmSoil = farmTarget === null ? undefined : snapshot.soil.get(farmSoilKey(farmTarget.tileX, farmTarget.tileY));
  const farmPrompt = farmTarget === null ? null
    : farmItem === 'hoe' ? (farmSoil === undefined ? '[F] TILL SOIL' : '[RIGHT CLICK] RESTORE GRASS')
      : farmSoil === undefined ? 'TILL SOIL BEFORE WATERING'
        : farmSoil.watered ? 'SOIL ALREADY WATERED' : '[F] WATER SOIL';
  const prompt = debugEntitiesHidden || npcInteractionUi.active ? null : handsChest !== null
    ? '[F] PLACE CHEST'
    : selectedItem(snapshot) === 'chest'
      ? '[F] PLACE CHEST'
      : campfire !== null
        ? '[E] COOK AT CAMPFIRE'
      : merchant !== null
        ? `[E] TALK TO ${merchant.displayName.toUpperCase()}`
      : riding !== null
    ? `[E] DISMOUNT ${horseLabel(riding).toUpperCase()}`
    : horse !== null
      ? `[E] RIDE ${horseLabel(horse).toUpperCase()}`
      : chest !== null ? selectedItem(snapshot) === 'axe'
        ? '[E] OPEN CHEST  [F] BREAK WITH AXE'
        : '[E] OPEN CHEST  [F] PICK UP'
        : gatherable !== null
          ? `[E] PICK UP ${gatherable.kind === 'loose_stone' ? 'STONE' : 'FALLEN BRANCH'}`
          : pickup === null ? farmPrompt : `[E] PICK UP ${hotbarItemLabel(pickup.itemKind)} x${pickup.quantity}`;
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
    hasBackpack: [...snapshot.inventorySlots].some((slot) => slot.itemKind === 'backpack'),
    audioVolumes: audio.getSettings(),
    canAdministerWorld: snapshot.membership?.role === 'owner',
    dateLabel: `${calendar.season.toUpperCase()} ${calendar.dayOfSeason} Y${calendar.year}`,
    timeLabel: formatDayTime(simTickOfDayAtAuthorityTick(authorityTick), TICKS_PER_DAY),
    timeFraction: authorityDayProgress(authorityTick),
    raining: rain.enabled,
    weatherMode,
    windDirectionMode: worldWindDirection(),
    windDirectionLabel: windDirectionLabel(renderWeather.windDirectionX, renderWeather.windDirectionY),
    prompt,
    toast: toastTicks > 0 ? toast.slice(0, 42) : null,
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
      ...[...snapshot.chatMessages].map((message) => ({
        id: message.id,
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
      `ZOOM ${worldZoom.toFixed(2)} K ${frame.layout.integerScale} DPR ${renderer.dpr.toFixed(2)}`,
      `NET RTT ${net.rttMs.toFixed(0)}ms LAG ${net.lagMs}+/-${net.jitterMs}`,
      `REPLAY ${net.replayDepth} ERROR ${net.reconciliationErrorFixed.toFixed(1)} FIXED`,
      `REMOTE BUFFER ${remoteMin}-${remoteMax} REFRESH ${net.inputRefreshAgeSteps}/${INPUT_REFRESH_STEPS}`,
      `HANDOVERS ${net.handoverCount}${net.persistentInputError === null ? '' : ` INPUT ${net.persistentInputError}`}`,
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
    toast = success;
    toastTicks = 120;
  }).catch((error: unknown) => {
    toast = error instanceof Error ? error.message : String(error);
    toastTicks = 120;
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
    toast = error instanceof Error ? error.message : String(error);
    toastTicks = 120;
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
  startPredictedAction('ranged_weapon', 450);
  void audio.unlock().then(async () => await audio.playSfx('tool_swing')).catch(() => undefined);
  performToolAction(
    () => network.fireBow(aimX, aimY, chargeMs),
    'ARROW LOOSED',
    'bow',
  );
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
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
    toast = nameplatesVisible ? 'NAMEPLATES ON' : 'NAMEPLATES OFF';
    toastTicks = 90;
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
      renderer.minimumZoom(SURVIVAL_WORLD_SIZE * 16),
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
      renderer.minimumZoom(SURVIVAL_WORLD_SIZE * 16),
      MAX_WORLD_ZOOM,
    );
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyG' && !event.repeat) {
    debugCollision = !debugCollision;
    toast = debugCollision ? 'COLLISION: CYAN PLAYER / RED TERRAIN / AMBER RESOURCE' : 'COLLISION OVERLAY OFF';
    toastTicks = 180;
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyH' && !event.repeat) {
    debugEntitiesHidden = !debugEntitiesHidden;
    toast = debugEntitiesHidden
      ? 'ENTITY ART HIDDEN: TERRAIN-ONLY DEBUG'
      : 'ENTITY ART VISIBLE';
    toastTicks = 180;
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
    const chest = targetChest(snapshot);
    if (chest !== null && selectedItem(snapshot) === 'axe') {
      startPredictedAction('swing_axe');
      void audio.unlock().then(async () => await audio.playSfx('tool_swing')).catch(() => undefined);
      performToolAction(() => network.harvestChest(chest.id), 'CHEST STRUCK', 'axe');
      event.preventDefault();
      return;
    }
    if (carriedChest(snapshot) !== null || targetChest(snapshot) !== null || selectedItem(snapshot) === 'chest') {
      const placing = carriedChest(snapshot) !== null || selectedItem(snapshot) === 'chest';
      const tile = placing ? targetInteractionTile() : facedInteractionTile(
        predicted?.position.x ?? 0,
        predicted?.position.y ?? 0,
        predicted?.facing ?? 'down',
      );
      if (tile === null) {
        toast = 'NO PLACEMENT TILE TARGETED';
        toastTicks = 90;
      } else if (placing && placementTileBlocked(snapshot, tile)) {
        toast = 'CHEST CANNOT BE PLACED THERE';
        toastTicks = 90;
      } else {
        showResult(network.useHands(tile.tileX, tile.tileY), placing ? 'CHEST PLACED' : 'CHEST PICKED UP');
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
      toast = 'HOLD LEFT MOUSE TO DRAW THE BOW';
      toastTicks = 120;
      event.preventDefault();
      return;
    }
    if (localMount(snapshot) !== null) {
      toast = 'TOOLS CANNOT BE USED WHILE RIDING';
      toastTicks = 120;
      event.preventDefault();
      return;
    }
    const actionKind = avatarActionForEquippedKind(item);
    if (actionKind === null) {
      toast = `NO ${hotbarItemLabel(item)} USE ACTION YET`;
      toastTicks = 120;
    } else {
      startPredictedAction(actionKind);
      void audio.unlock().then(async () => await audio.playSfx('tool_swing')).catch(() => undefined);
      if (item === 'hoe' || item === 'watering_can') {
        const tile = targetFarmTile();
        if (tile === null) {
          toast = 'NO FARM TILE TARGETED';
          toastTicks = 90;
        } else {
          performToolAction(
            () => network.useFarmTool(tile.tileX, tile.tileY),
            item === 'hoe' ? 'SOIL TILLED' : 'SOIL WATERED',
            item,
          );
        }
        event.preventDefault();
        return;
      }
      const resource = targetResource(snapshot);
      if (!isVitalsTool(item)) {
        toast = 'THIS TOOL IS NOT READY FOR WORLD USE';
        toastTicks = 90;
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
    if (targetCampfire(latestSnapshot) !== null) {
      overworldUi.openWindow = 'cooking';
      event.preventDefault();
      return;
    }
    const merchant = targetMerchant(latestSnapshot);
    if (merchant !== null) {
      overworldUi.openWindow = null;
      showResult(network.interactNpc(merchant.id), `TALKING TO ${merchant.displayName.toUpperCase()}`);
      event.preventDefault();
      return;
    }
    const horse = targetHorse(latestSnapshot);
    if (horse !== null) {
      const dismounting = localMount(latestSnapshot) !== null;
      showResult(
        network.interactHorse(horse.id),
        dismounting ? `DISMOUNTED ${horseLabel(horse).toUpperCase()}` : `RIDING ${horseLabel(horse).toUpperCase()}`,
      );
      event.preventDefault();
      return;
    }
    if (targetChest(latestSnapshot) !== null) {
      showResult(network.interactChest(), 'CHEST OPENED');
      event.preventDefault();
      return;
    }
    const gatherable = targetGatherableResource(latestSnapshot);
    if (gatherable !== null) {
      startPredictedAction('pickup');
      showResult(
        network.gatherWorldResource(gatherable.id),
        gatherable.kind === 'loose_stone' ? 'PICKED UP STONE' : 'PICKED UP WOOD',
      );
      event.preventDefault();
      return;
    }
    startPredictedAction('pickup');
    const item = targetWorldItem(latestSnapshot);
    if (item === null) {
      toast = 'NOTHING TO PICK UP';
      toastTicks = 90;
    } else {
      showResult(network.pickupWorldItem(item.id), `PICKED UP ${hotbarItemLabel(item.itemKind)} x${item.quantity}`);
    }
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyQ' && !event.repeat) {
    if (localMount(latestSnapshot) !== null) {
      toast = 'ITEMS CANNOT BE DROPPED WHILE RIDING';
      toastTicks = 120;
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
    startPredictedAction('swing_hoe');
    void audio.unlock().then(async () => await audio.playSfx('tool_swing')).catch(() => undefined);
    performToolAction(
      () => network.restoreFarmTile(farmTarget.tileX, farmTarget.tileY),
      'GRASS RESTORED',
      'hoe',
    );
    event.preventDefault();
    return;
  }
  if (event.button === 0 && (farmItem === 'hoe' || farmItem === 'watering_can')
    && farmTarget !== null && localMount(latestSnapshot) === null
    && overworldUi.openWindow === null && !chatOverlay.isOpen) {
    startPredictedAction(avatarActionForEquippedKind(farmItem) ?? 'none');
    void audio.unlock().then(async () => await audio.playSfx('tool_swing')).catch(() => undefined);
    performToolAction(
      () => network.useFarmTool(farmTarget.tileX, farmTarget.tileY),
      farmItem === 'hoe' ? 'SOIL TILLED' : 'SOIL WATERED',
      farmItem,
    );
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
    renderer.minimumZoom(SURVIVAL_WORLD_SIZE * 16),
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
    netcodeMetrics: () => network.metrics(),
    audioStatus: () => audio.getStatus(),
    predictedPosition: () => predicted === null ? null : { ...predicted.position },
    remoteBufferDepths: () => [...remoteBuffers.entries()].map(([identity, buffer]) => ({ identity, depth: buffer.depth })),
    setWorldZoom: (zoom: number) => {
      worldZoom = Math.max(renderer.minimumZoom(SURVIVAL_WORLD_SIZE * 16), Math.min(MAX_WORLD_ZOOM, zoom));
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
