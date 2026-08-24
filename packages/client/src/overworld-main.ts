import {
  FIXED_UNITS_PER_PIXEL,
  SURVIVAL_CHUNK_TILES,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
  TILE_SIZE_FIXED,
  TICKS_PER_DAY,
  movePlayer,
  playerHitboxBounds,
  type CollisionMap,
  type Direction,
  type PlayerState,
} from '@orchard/sim';
import {
  DEFAULT_UI_SCALE,
  DEFAULT_WORLD_ZOOM,
  easeWorldZoom,
  fittedUiScale,
  stepUiScale,
  stepWorldZoom,
  toggleFullscreen,
  type UiScale,
} from './display.js';
import { FixedStepLoop } from './loop.js';
import { AudioBus } from './audio/audio-bus.js';
import type { PlayerPosition, WorldItem, WorldResource } from './net/generated/types.js';
import {
  OverworldConnection,
  viewRadiusForViewport,
  type NetworkDirection,
  type OverworldView,
} from './net/overworld-connection.js';
import { AvatarAnimationController, PresentationCorrection, RemoteSnapshotBuffer, RenderTickClock, type SampledRemote } from './net/netcode.js';
import {
  drawOverworldAvatar,
  drawOverworldItem,
  drawOverworldNameplate,
  drawOverworldStump,
  drawOverworldTree,
  drawUiAsset,
  actionAnimationForDirection,
  avatarAnimationForDirection,
  loadOverworldArt,
} from './overworld-art.js';
import { cameraAxisOffset, visibleWorldBounds, worldPointVisible } from './render/camera.js';
import { createClientCollisionMap } from './render/collision.js';
import { GroundChunkCache } from './render/ground-cache.js';
import {
  ambientAtTick,
  LANTERN_LIGHT,
  playerLightPosition,
  TileLightmap,
  TORCH_LIGHT,
  type PointLight,
} from './render/lighting.js';
import { RenderMetrics } from './render/metrics.js';
import { RainWeather, rainActiveAtTick } from './render/particles.js';
import { drawPixelPanel, drawPixelText, measurePixelText } from './render/pixel-ui.js';
import {
  MAX_WORLD_ZOOM,
  UnifiedRenderer,
  drawWorldDepthQueue,
  type WorldDepthItem,
} from './render/renderer.js';
import { terrainForWorld, type TerrainArray } from './render/terrain.js';
import { interpolateFixedPosition } from './overworld-prediction.js';
import {
  HOTBAR_HEIGHT,
  HOTBAR_SLOT_COUNT,
  HOTBAR_SLOT_WIDTH,
  facedResource,
  facedWorldItem,
  hotbarItemLabel,
  hotbarItemName,
  hotbarLayout,
  hotbarSlotAtPoint,
  hotbarSlotForCode,
  formatDayTime,
  weatherControlAtPoint,
  weatherPanelLayout,
  weatherTimeFractionAtPoint,
} from './survival-ui.js';
import './style.css';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (canvasElement === null) throw new Error('Missing overworld canvas');
const canvas: HTMLCanvasElement = canvasElement;
const renderer = new UnifiedRenderer(canvas);
const shellElement = document.querySelector<HTMLElement>('#game-shell');
if (shellElement === null) throw new Error('Missing overworld shell');
const art = await loadOverworldArt();
const groundCache = new GroundChunkCache();
const lightmap = new TileLightmap();
const rain = new RainWeather(art.rainStreak, art.rainSplash);
const renderMetrics = new RenderMetrics();
const audio = new AudioBus(false);

const keys = new Set<string>();
const accountSlot = new URLSearchParams(location.search).get('slot') ?? 'Farmer One';
let networkDirty = true;
const network = new OverworldConnection(accountSlot, () => { networkDirty = true; });
let latestSnapshot = network.view();
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
const initialTerrain = terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION);
let worldCollision: CollisionMap = createClientCollisionMap(initialTerrain, []);
let lastNetworkStatus = '';
let debugCollision = false;
let debugMetrics = false;
const unknownActionKinds = new Set<string>();
const remoteBuffers = new Map<string, RemoteSnapshotBuffer>();
const remoteDisplay = new Map<string, SampledRemote>();
const previousRemoteDisplay = new Map<string, SampledRemote>();
const renderTickClock = new RenderTickClock();
const presentationCorrection = new PresentationCorrection();
const avatarAnimations = new Map<string, AvatarAnimationController>();
const resourceHealth = new Map<bigint, number>();
const treeShakeRemaining = new Map<bigint, number>();
let localActionStartedAtMs: number | null = null;
let localPredictedActionKind = 'none';
let latestPositionAuthorityTick = 0n;
let hoveredHotbarSlot: number | null = null;
let lightingTickOverride: bigint | null = null;
let lightPreviewKind: 'lantern' | 'torch' | null = null;
let rainOverride: boolean | null = null;
let draggingTimeSlider = false;

function resize(): void {
  renderer.resize();
  const minimum = renderer.minimumZoom(SURVIVAL_WORLD_SIZE * 16);
  worldZoomTarget = Math.max(minimum, Math.min(MAX_WORLD_ZOOM, worldZoomTarget));
  worldZoom = Math.max(minimum, Math.min(MAX_WORLD_ZOOM, worldZoom));
}

function directionFromKeys(): NetworkDirection {
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
  worldCollision = createClientCollisionMap(terrainForWorld(seed, version), snapshot.resources);
}

function update(): void {
  const previous = predicted;
  effectPhase = (effectPhase + 1) % 4;
  worldZoom = easeWorldZoom(worldZoom, worldZoomTarget);
  network.setViewRadius(viewRadiusForViewport(renderer.cssWidth, renderer.cssHeight, worldZoom));
  latestSnapshot = network.view();
  const snapshot = latestSnapshot;
  if (optimisticSelectedSlot !== null && snapshot.survival?.selectedSlot === optimisticSelectedSlot) {
    optimisticSelectedSlot = null;
  }
  const weatherTick = lightingTickOverride ?? snapshot.clock?.authorityTick ?? 0n;
  rain.update(
    rainOverride ?? rainActiveAtTick(weatherTick),
    renderer.cssWidth,
    renderer.cssHeight,
    worldZoom,
  );
  for (const resource of snapshot.resources) {
    const previous = resourceHealth.get(resource.id);
    if (previous !== undefined && resource.health < previous && !resource.depleted) {
      treeShakeRemaining.set(resource.id, 16);
    }
    resourceHealth.set(resource.id, resource.health);
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
    predicted = movePlayer(predicted, direction === 'idle' ? null : direction, worldCollision);
    network.recordPredictedStep(direction, predicted);
  }
  previousPredicted = previous ?? predicted;
  presentationCorrection.advance(1 / 60);

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
  const renderTick = renderTickClock.advance(1 / 60, latestPositionAuthorityTick);
  for (const [id, buffer] of remoteBuffers) {
    const sample = buffer.sample(renderTick, worldCollision);
    if (sample !== null) {
      const current = remoteDisplay.get(id);
      if (current !== undefined) previousRemoteDisplay.set(id, current);
      remoteDisplay.set(id, sample);
    }
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
}

function profileName(profiles: OverworldView['profiles'], identity: string): string {
  return profiles.find((profile) => profile.identity.toHexString() === identity)?.displayName ?? 'FARMER';
}

let optimisticSelectedSlot: number | null = null;

function selectedItem(snapshot: OverworldView): string {
  const selected = optimisticSelectedSlot ?? snapshot.survival?.selectedSlot ?? 0;
  return snapshot.inventorySlots.find((inventory) => inventory.slot === selected)?.itemKind ?? 'empty';
}

function targetResource(snapshot: OverworldView): WorldResource | null {
  if (predicted === null) return null;
  return facedResource(predicted.position.x, predicted.position.y, predicted.facing, snapshot.resources);
}

function targetWorldItem(snapshot: OverworldView): WorldItem | null {
  if (predicted === null) return null;
  return facedWorldItem(predicted.position.x, predicted.position.y, predicted.facing, snapshot.worldItems);
}

function drawHotbar(
  context: CanvasRenderingContext2D,
  snapshot: OverworldView,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const layout = hotbarLayout(viewportWidth, viewportHeight);
  const selected = optimisticSelectedSlot ?? snapshot.survival?.selectedSlot ?? 0;
  const icons = {
    axe: art.iconAxe,
    pickaxe: art.iconPickaxe,
    hoe: art.iconHoe,
    watering_can: art.iconWateringCan,
    wood: art.itemWood,
  };
  for (let index = 0; index < HOTBAR_SLOT_COUNT; index += 1) {
    const inventory = snapshot.inventorySlots.find((candidate) => candidate.slot === index);
    const slotX = layout.startX + index * HOTBAR_SLOT_WIDTH;
    drawPixelPanel(context, art.ui, slotX, layout.y, HOTBAR_HEIGHT, HOTBAR_HEIGHT);
    if (index === selected) {
      context.strokeStyle = '#ffe98a';
      context.lineWidth = 2;
      context.strokeRect(slotX + 1, layout.y + 1, HOTBAR_HEIGHT - 3, HOTBAR_HEIGHT - 3);
    }
    const icon = icons[inventory?.itemKind as keyof typeof icons];
    if (icon) drawUiAsset(context, icon, slotX + 9, layout.y + 9);
    drawPixelText(context, art.ui, String(index + 1), slotX + 4, layout.y + 4);
    if ((inventory?.quantity ?? 0) > 1) {
      drawPixelText(context, art.ui, String(inventory?.quantity ?? 0), slotX + 30, layout.y + 23, { align: 'right' });
    }
  }
}

function drawWeatherPanel(
  context: CanvasRenderingContext2D,
  viewportWidth: number,
  authorityTick: bigint,
): void {
  const layout = weatherPanelLayout(viewportWidth);
  const dayTick = Number(authorityTick % BigInt(TICKS_PER_DAY));
  const fraction = dayTick / TICKS_PER_DAY;
  drawPixelPanel(context, art.ui, layout.x, layout.y, layout.width, layout.height);
  drawPixelText(context, art.ui, `TIME ${formatDayTime(dayTick, TICKS_PER_DAY)}`, layout.x + 8, layout.y + 6);
  context.fillStyle = '#2b1d0e';
  context.fillRect(layout.sliderX, layout.sliderY, layout.sliderWidth, 3);
  context.fillStyle = '#e0a51f';
  context.fillRect(layout.sliderX, layout.sliderY, Math.round(layout.sliderWidth * fraction), 3);
  const handleX = Math.round(layout.sliderX + layout.sliderWidth * fraction);
  context.fillStyle = '#f2e3c2';
  context.fillRect(handleX - 2, layout.sliderY - 2, 5, 7);
  context.fillStyle = '#2b1d0e';
  context.fillRect(handleX - 1, layout.sliderY - 1, 3, 5);
  drawPixelPanel(context, art.ui, layout.rainX, layout.rainY, layout.rainWidth, layout.rainHeight);
  drawPixelText(context, art.ui, `RAIN ${rain.enabled ? 'ON' : 'OFF'}`, layout.rainX + layout.rainWidth / 2, layout.rainY + 4, { align: 'center' });
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
  for (const obstacle of worldCollision.obstacles ?? []) {
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
  const localX = (renderedLocal?.x ?? 96 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const localY = (renderedLocal?.y ?? 96 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const frame = renderer.beginWorld(worldZoom);
  const context = frame.world;
  const scale = frame.layout.integerScale;
  const viewportWidth = frame.layout.width / scale;
  const viewportHeight = frame.layout.height / scale;
  const worldPixels = SURVIVAL_WORLD_SIZE * 16;
  const cameraX = cameraAxisOffset(localX, viewportWidth, worldPixels);
  const cameraY = cameraAxisOffset(localY, viewportHeight, worldPixels);
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const version = snapshot.worldSeed?.version ?? SURVIVAL_WORLD_VERSION;
  const terrain = terrainForWorld(seed, version);
  const uiScale = fittedUiScale(desiredUiScale, renderer.cssWidth, renderer.cssHeight);
  drawCalls += groundCache.draw(context, art, terrain, cameraX, cameraY, scale, frame.layout.width, frame.layout.height);
  rain.followViewport(
    cameraX + viewportWidth / 2,
    cameraY + viewportHeight / 2,
    worldZoom,
  );

  const visible = visibleWorldBounds(cameraX, cameraY, frame.layout.width, frame.layout.height, scale, 64);
  // All non-ground world art (players, trees, items, future buildings/props/NPCs)
  // must enter this queue so weather and later depth layers cannot bypass it.
  const worldDepthItems: WorldDepthItem[] = [];
  const nameplates: Array<{ x: number; y: number; name: string }> = [];
  const pointLights: PointLight[] = [];
  for (const resource of snapshot.resources) {
    const resourceX = resource.tileX * 16 + 8;
    const resourceY = (resource.tileY + 1) * 16;
    if (!worldPointVisible(resourceX, resourceY, visible)) continue;
    worldDepthItems.push({
      footY: resourceY,
      tie: `resource:${resource.id}`,
      draw: () => {
        if (resource.depleted) {
          drawOverworldStump(context, art, resourceX, resourceY, cameraX, cameraY, scale);
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
        );
      },
    });
  }
  for (const item of snapshot.worldItems) {
    const x = item.x / FIXED_UNITS_PER_PIXEL;
    const y = item.y / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const age = Number((snapshot.clock?.authorityTick ?? item.droppedAtTick) - item.droppedAtTick);
    const arcHeight = age >= 0 && age < 8 ? Math.round(Math.sin(age / 8 * Math.PI) * 8) : 0;
    worldDepthItems.push({
      footY: y,
      tie: `item:${item.id}`,
      draw: () => drawOverworldItem(context, art, x, y, arcHeight, cameraX, cameraY, scale),
    });
  }
  for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    const display = local ? null : remoteDisplay.get(id) ?? null;
    const previousDisplay = local || display === null ? null : previousRemoteDisplay.get(id) ?? display;
    const renderedRemote = display === null || previousDisplay === null
      ? null
      : interpolateFixedPosition(previousDisplay, display, alpha);
    const xFixed = local ? renderedLocal?.x ?? player.x : renderedRemote?.x ?? player.x;
    const yFixed = local ? renderedLocal?.y ?? player.y : renderedRemote?.y ?? player.y;
    const x = xFixed / FIXED_UNITS_PER_PIXEL;
    const y = yFixed / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const facing = (local ? predicted?.facing ?? player.facing : display?.facing ?? player.facing) as Direction;
    const displayedDx = local
      ? (renderedLocal?.x ?? player.x) - (previousPredicted?.position.x ?? renderedLocal?.x ?? player.x)
      : (display?.x ?? player.x) - (previousDisplay?.x ?? display?.x ?? player.x);
    const displayedDy = local
      ? (renderedLocal?.y ?? player.y) - (previousPredicted?.position.y ?? renderedLocal?.y ?? player.y)
      : (display?.y ?? player.y) - (previousDisplay?.y ?? display?.y ?? player.y);
    const moving = Math.abs(displayedDx) + Math.abs(displayedDy) > 0.01;
    nameplates.push({ x, y, name: profileName(snapshot.profiles, id) });
    const equipped = local ? lightPreviewKind ?? selectedItem(snapshot) : display?.equippedKind ?? player.equippedKind;
    if (equipped === 'lantern' || equipped === 'torch') {
      const [lightX, lightY] = playerLightPosition(x, y);
      pointLights.push({
        worldX: lightX,
        worldY: lightY,
        radiusTiles: equipped === 'lantern' ? 5 : 3,
        color: equipped === 'lantern' ? LANTERN_LIGHT : TORCH_LIGHT,
      });
    }
    worldDepthItems.push({
      footY: y,
      tie: `player:${id}`,
      draw: () => {
        const controller = avatarAnimations.get(id) ?? new AvatarAnimationController();
        avatarAnimations.set(id, controller);
        const renderTick = renderTickClock.renderTick;
        const localPreviewActive = local && localActionStartedAtMs !== null && performance.now() - localActionStartedAtMs < 500;
        const actionKind = localPreviewActive ? localPredictedActionKind : display?.actionKind ?? player.actionKind;
        const actionStartedTick = localPreviewActive
          ? BigInt(Math.floor(renderTick - (performance.now() - (localActionStartedAtMs ?? performance.now())) / 50))
          : display?.actionStartedTick ?? player.actionStartedTick;
        const walkAnimation = avatarAnimationForDirection(facing);
        const actionAnimation = actionAnimationForDirection(art, actionKind, facing);
        const actionFrames = actionAnimation === null
          ? 4
          : art.avatarAxe.metadata.animations[actionAnimation]?.length ?? 4;
        const actionFps = actionAnimation === null
          ? 10
          : art.avatarAxe.metadata.animationMeta?.[actionAnimation]?.fps ?? 10;
        const animation = controller.update(
          xFixed, yFixed, actionKind, actionStartedTick, renderTick,
          art.avatar.metadata.animations[walkAnimation]?.length ?? 4,
          art.avatar.metadata.animationMeta?.[walkAnimation]?.fps ?? 8,
          actionFrames,
          actionFps,
          actionAnimation !== null,
        );
        if (animation.fallback) unknownActionKinds.add(actionKind);
        const actionFrame = animation.channel === 'action' && !animation.fallback ? animation.frame : null;
        drawOverworldAvatar(
          context, art, x, y, facing, moving, animation.frame,
          cameraX, cameraY, scale, actionFrame, actionAnimation,
        );
      },
    });
  }
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
  drawCalls += worldDepthItems.length;
  lightmap.draw(
    context,
    terrain,
    cameraX,
    cameraY,
    scale,
    frame.layout.width,
    frame.layout.height,
    ambientAtTick(lightingTickOverride ?? snapshot.clock?.authorityTick ?? 0n, rain.enabled ? 0.12 : 0),
    pointLights,
  );
  drawCalls += 1;
  if (debugCollision) {
    drawCollisionOverlay(context, cameraX, cameraY, scale, frame.layout.width, frame.layout.height, terrain);
    drawPlayerCollisionOverlay(context, cameraX, cameraY, scale, snapshot);
  }
  for (const nameplate of nameplates) {
    drawOverworldNameplate(
      context,
      art,
      nameplate.x,
      nameplate.y,
      cameraX,
      cameraY,
      scale,
      nameplate.name,
    );
  }
  drawCalls += nameplates.reduce((total, nameplate) => total + 2 + nameplate.name.slice(0, 20).length, 0);
  renderer.compositeWorld();
  drawCalls += 1;

  const uiWidth = renderer.cssWidth / uiScale;
  const uiHeight = renderer.cssHeight / uiScale;
  const uiContext = renderer.beginUi(uiScale);
  const islandStatus = `ISLAND ${snapshot.connected ? 'ONLINE' : 'CONNECTING'} PLAYERS ${snapshot.players.length}`;
  drawPixelPanel(uiContext, art.ui, 4, 4, measurePixelText(islandStatus) + 14, 19);
  drawPixelText(uiContext, art.ui, islandStatus, 11, 11);
  const pickup = targetWorldItem(snapshot);
  const prompt = pickup === null ? null : `[E] PICK UP ${hotbarItemLabel(pickup.itemKind)} x${pickup.quantity}`;
  const hoveredInventory = hoveredHotbarSlot === null
    ? undefined
    : snapshot.inventorySlots.find((candidate) => candidate.slot === hoveredHotbarSlot);
  const hoverName = hotbarItemName(hoveredInventory?.itemKind ?? 'empty');
  const tooltip = hoverName ?? prompt ?? (toastTicks > 0 ? toast.slice(0, 42) : null);
  if (tooltip !== null) {
    const width = Math.max(104, measurePixelText(tooltip) + 14);
    drawPixelPanel(uiContext, art.ui, uiWidth / 2 - width / 2, uiHeight - 62, width, 19);
    drawPixelText(uiContext, art.ui, tooltip, uiWidth / 2, uiHeight - 56, { align: 'center' });
  }
  drawHotbar(uiContext, snapshot, uiWidth, uiHeight);
  drawWeatherPanel(
    uiContext,
    uiWidth,
    lightingTickOverride ?? snapshot.clock?.authorityTick ?? 0n,
  );
  if (debugMetrics) {
    const metrics = renderMetrics.snapshot();
    const net = network.metrics();
    const remoteDepths = [...remoteBuffers.values()].map((buffer) => buffer.depth);
    const remoteMin = remoteDepths.length === 0 ? 0 : Math.min(...remoteDepths);
    const remoteMax = remoteDepths.length === 0 ? 0 : Math.max(...remoteDepths);
    const lines = [
      `FRAME ${metrics.averageFrameMs.toFixed(2)} AVG ${metrics.worstFrameMs.toFixed(2)} WORST`,
      `DRAWS ${metrics.drawCalls} CHUNKS ${groundCache.residentCount} PARTICLES ${rain.activeCount}`,
      `ZOOM ${worldZoom.toFixed(2)} K ${frame.layout.integerScale} DPR ${renderer.dpr.toFixed(2)}`,
      `NET RTT ${net.rttMs.toFixed(0)}ms LAG ${net.lagMs}+/-${net.jitterMs}`,
      `REPLAY ${net.replayDepth} ERROR ${net.reconciliationErrorFixed.toFixed(1)} FIXED`,
      `REMOTE BUFFER ${remoteMin}-${remoteMax} REFRESH ${net.inputRefreshAgeSteps}/20`,
      `HANDOVERS ${net.handoverCount}${net.persistentInputError === null ? '' : ` INPUT ${net.persistentInputError}`}`,
      `UNKNOWN ACTIONS ${[...unknownActionKinds].join(',') || 'NONE'}`,
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
  const rect = canvas.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left) * renderer.cssWidth / rect.width;
  const canvasY = (event.clientY - rect.top) * renderer.cssHeight / rect.height;
  const uiScale = fittedUiScale(desiredUiScale, renderer.cssWidth, renderer.cssHeight);
  return [canvasX / uiScale, canvasY / uiScale];
}

function hotbarSlotForPointer(event: PointerEvent): number | null {
  const [x, y] = pointerUiPosition(event);
  const uiScale = fittedUiScale(desiredUiScale, renderer.cssWidth, renderer.cssHeight);
  return hotbarSlotAtPoint(x, y, renderer.cssWidth / uiScale, renderer.cssHeight / uiScale);
}

function weatherPointer(event: MouseEvent): readonly [number, number, number] {
  const [x, y] = pointerUiPosition(event);
  const uiScale = fittedUiScale(desiredUiScale, renderer.cssWidth, renderer.cssHeight);
  return [x, y, renderer.cssWidth / uiScale];
}

function setTimeFromPointer(event: PointerEvent): void {
  const [x, , uiWidth] = weatherPointer(event);
  const fraction = weatherTimeFractionAtPoint(x, uiWidth);
  lightingTickOverride = BigInt(Math.min(TICKS_PER_DAY - 1, Math.round(fraction * (TICKS_PER_DAY - 1))));
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
  optimisticSelectedSlot = slot;
  void network.selectHotbar(slot).then(() => {
    if (latestSnapshot.survival?.selectedSlot === slot) optimisticSelectedSlot = null;
  }).catch((error: unknown) => {
    optimisticSelectedSlot = null;
    toast = error instanceof Error ? error.message : String(error);
    toastTicks = 120;
  });
}

function startPredictedAction(kind: string): void {
  localPredictedActionKind = kind;
  localActionStartedAtMs = performance.now();
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
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
  if (event.code === 'F3' && !event.repeat) {
    debugMetrics = !debugMetrics;
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyF' && !event.repeat) {
    const snapshot = latestSnapshot;
    const item = selectedItem(snapshot);
    if (item !== 'axe') {
      toast = `NO ${hotbarItemLabel(item)} USE ACTION YET`;
      toastTicks = 120;
    } else {
      startPredictedAction('swing_axe');
      void audio.unlock().then(async () => await audio.playSfx('tool_swing')).catch(() => undefined);
      const resource = targetResource(snapshot);
      if (resource === null) {
        toast = 'SWING';
        toastTicks = 60;
      } else {
        showResult(network.harvestResource(resource.id), resource.health > 1 ? 'CHOP!' : 'TREE FELLED');
      }
    }
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyE' && !event.repeat) {
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
    startPredictedAction('drop');
    showResult(network.dropSelected(), 'DROPPED SELECTED SLOT');
    event.preventDefault();
    return;
  }
  if (event.code.startsWith('Arrow')) event.preventDefault();
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
canvas.addEventListener('dblclick', () => { void toggleFullscreen(shellElement).catch(() => undefined); });
canvas.addEventListener('pointermove', (event) => {
  if (draggingTimeSlider) {
    setTimeFromPointer(event);
    event.preventDefault();
    return;
  }
  hoveredHotbarSlot = hotbarSlotForPointer(event);
});
canvas.addEventListener('pointerleave', () => { if (!draggingTimeSlider) hoveredHotbarSlot = null; });
canvas.addEventListener('pointerdown', (event) => {
  const [x, y, uiWidth] = weatherPointer(event);
  const weatherControl = weatherControlAtPoint(x, y, uiWidth);
  if (weatherControl === 'time') {
    draggingTimeSlider = true;
    canvas.setPointerCapture(event.pointerId);
    setTimeFromPointer(event);
    event.preventDefault();
    return;
  }
  if (weatherControl === 'rain') {
    rainOverride = !rain.enabled;
    event.preventDefault();
    return;
  }
  const slot = hotbarSlotForPointer(event);
  if (slot === null) return;
  hoveredHotbarSlot = slot;
  selectSlotOptimistically(slot);
  event.preventDefault();
});
canvas.addEventListener('pointerup', (event) => {
  if (!draggingTimeSlider) return;
  setTimeFromPointer(event);
  draggingTimeSlider = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  event.preventDefault();
});
canvas.addEventListener('pointercancel', () => { draggingTimeSlider = false; });
canvas.addEventListener('wheel', (event) => {
  const [x, y, uiWidth] = weatherPointer(event);
  if (weatherControlAtPoint(x, y, uiWidth) !== null) {
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
    pickupWorldItem: (itemId: bigint) => network.pickupWorldItem(itemId),
    dropSelected: () => network.dropSelected(),
    selectHotbar: (selectedSlot: number) => network.selectHotbar(selectedSlot),
    setCollisionDebug: (enabled: boolean) => { debugCollision = enabled; },
    setMetricsDebug: (enabled: boolean) => { debugMetrics = enabled; },
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
    setLightingTick: (tick: bigint | null) => { lightingTickOverride = tick; },
    setLightPreview: (kind: 'lantern' | 'torch' | null) => { lightPreviewKind = kind; },
    setRain: (enabled: boolean | null) => { rainOverride = enabled; },
  },
});
loop.start();
