import {
  FIXED_UNITS_PER_PIXEL,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  TILE_SIZE_FIXED,
  createSurvivalCollisionMap,
  generateSurvivalResources,
  movePlayer,
  playerHitboxBounds,
  survivalBiomeAt,
  survivalBiomeBlocksMovement,
  type CollisionMap,
  type Direction,
  type PlayerState,
} from '@orchard/sim';
import {
  DEFAULT_UI_SCALE,
  DEFAULT_WORLD_ZOOM,
  fittedUiScale,
  resizePixelCanvas,
  stepUiScale,
  stepWorldZoom,
  toggleFullscreen,
  type UiScale,
  type WorldZoom,
} from './display.js';
import { FixedStepLoop } from './loop.js';
import type { PlayerPosition, PlayerPublic, WorldItem, WorldResource } from './net/generated/types.js';
import {
  OverworldConnection,
  viewRadiusForViewport,
  type NetworkDirection,
  type OverworldSnapshot,
} from './net/overworld-connection.js';
import {
  drawOverworldAvatar,
  drawOverworldGround,
  drawOverworldItem,
  drawOverworldStump,
  drawOverworldTree,
  drawUiAsset,
  loadOverworldArt,
  sortWorldDrawItems,
} from './overworld-art.js';
import { cameraAxisOffset, visibleWorldBounds, worldPointVisible } from './render/camera.js';
import { drawPixelPanel, drawPixelText, measurePixelText } from './render/pixel-ui.js';
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
} from './survival-ui.js';
import './style.css';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (canvasElement === null) throw new Error('Missing overworld canvas');
const canvas: HTMLCanvasElement = canvasElement;
const canvasContext = canvas.getContext('2d');
if (canvasContext === null) throw new Error('Canvas 2D unavailable');
const context: CanvasRenderingContext2D = canvasContext;
context.imageSmoothingEnabled = false;
const shellElement = document.querySelector<HTMLElement>('#game-shell');
if (shellElement === null) throw new Error('Missing overworld shell');
const art = await loadOverworldArt();

const keys = new Set<string>();
const accountSlot = new URLSearchParams(location.search).get('slot') ?? 'Farmer One';
let networkDirty = true;
const network = new OverworldConnection(accountSlot, () => { networkDirty = true; });
let predicted: PlayerState | null = null;
let lastDirection: NetworkDirection = 'idle';
let toast = 'CONNECTING TO SHARED ISLAND';
let toastTicks = 180;
let animationTick = 0;
let worldZoom: WorldZoom = DEFAULT_WORLD_ZOOM;
let desiredUiScale: UiScale = DEFAULT_UI_SCALE;
let wheelZoomLockedUntil = 0;
let collisionKey = '';
let worldCollision: CollisionMap = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED);
let lastNetworkStatus = '';
let debugCollision = false;
const remoteDisplay = new Map<string, { x: number; y: number }>();
const resourceHealth = new Map<bigint, number>();
const treeShakeUntil = new Map<bigint, number>();
let axeActionStartedTick: number | null = null;
let axePreviewFrame: number | null = null;
let hoveredHotbarSlot: number | null = null;

function resize(): void {
  resizePixelCanvas(canvas);
  context.imageSmoothingEnabled = false;
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

function reconcile(row: PlayerPosition): void {
  if (predicted === null) {
    predicted = playerState(row);
    return;
  }
  const dx = row.x - predicted.position.x;
  const dy = row.y - predicted.position.y;
  if (dx * dx + dy * dy > (TILE_SIZE_FIXED * 2) ** 2) {
    predicted = playerState(row);
    return;
  }
  predicted = {
    ...predicted,
    position: {
      x: predicted.position.x + Math.trunc(dx / 8),
      y: predicted.position.y + Math.trunc(dy / 8),
    },
  };
}

function refreshCollision(snapshot: OverworldSnapshot): void {
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const mutableKey = snapshot.resources
    .map((resource) => `${resource.id}:${Number(resource.depleted)}`)
    .sort()
    .join(',');
  const nextKey = `${seed}|${mutableKey}`;
  if (collisionKey === nextKey) return;
  collisionKey = nextKey;
  const subscribed = new Map(snapshot.resources.map((resource) => [resource.id, resource]));
  const resources = generateSurvivalResources(seed).map((resource) => ({
    tileX: resource.tileX,
    tileY: resource.tileY,
    depleted: subscribed.get(BigInt(resource.id))?.depleted ?? false,
  }));
  worldCollision = createSurvivalCollisionMap(seed, resources);
}

function update(): void {
  animationTick = (animationTick + 1) % 1_000_000;
  network.setViewRadius(viewRadiusForViewport(canvas.width, canvas.height, worldZoom));
  const snapshot = network.snapshot();
  for (const resource of snapshot.resources) {
    const previous = resourceHealth.get(resource.id);
    if (previous !== undefined && resource.health < previous && !resource.depleted) {
      treeShakeUntil.set(resource.id, animationTick + 16);
    }
    resourceHealth.set(resource.id, resource.health);
  }
  if (axeActionStartedTick !== null && animationTick - axeActionStartedTick >= 24) axeActionStartedTick = null;
  if (networkDirty) refreshCollision(snapshot);
  const direction = directionFromKeys();
  if (direction !== lastDirection) {
    lastDirection = direction;
    network.setDirection(direction);
  }
  const authoritative = network.ownPosition();
  if (authoritative !== null) reconcile(authoritative);
  if (predicted !== null) predicted = movePlayer(predicted, direction === 'idle' ? null : direction, worldCollision);

  for (const player of snapshot.players) {
    if (player.identity.toHexString() === snapshot.identityHex) continue;
    const id = player.identity.toHexString();
    const display = remoteDisplay.get(id) ?? { x: player.x, y: player.y };
    display.x += Math.trunc((player.x - display.x) / 3);
    display.y += Math.trunc((player.y - display.y) / 3);
    remoteDisplay.set(id, display);
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

function profileName(profiles: readonly PlayerPublic[], identity: string): string {
  return profiles.find((profile) => profile.identity.toHexString() === identity)?.displayName ?? 'FARMER';
}

function selectedItem(snapshot: OverworldSnapshot): string {
  const selected = snapshot.survival?.selectedSlot ?? 0;
  return snapshot.inventorySlots.find((inventory) => inventory.slot === selected)?.itemKind ?? 'empty';
}

function targetResource(snapshot: OverworldSnapshot): WorldResource | null {
  if (predicted === null) return null;
  return facedResource(predicted.position.x, predicted.position.y, predicted.facing, snapshot.resources);
}

function targetWorldItem(snapshot: OverworldSnapshot): WorldItem | null {
  if (predicted === null) return null;
  return facedWorldItem(predicted.position.x, predicted.position.y, predicted.facing, snapshot.worldItems);
}

function drawHotbar(snapshot: OverworldSnapshot, viewportWidth: number, viewportHeight: number): void {
  const layout = hotbarLayout(viewportWidth, viewportHeight);
  const selected = snapshot.survival?.selectedSlot ?? 0;
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

function drawPlayerCollisionOverlay(
  cameraX: number,
  cameraY: number,
  snapshot: OverworldSnapshot,
): void {
  for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    const display = local ? null : remoteDisplay.get(id);
    const position = {
      x: local ? predicted?.position.x ?? player.x : display?.x ?? player.x,
      y: local ? predicted?.position.y ?? player.y : display?.y ?? player.y,
    };
    const bounds = playerHitboxBounds(position);
    const left = (bounds.left / FIXED_UNITS_PER_PIXEL - cameraX) * worldZoom;
    const top = (bounds.top / FIXED_UNITS_PER_PIXEL - cameraY) * worldZoom;
    const width = (bounds.right - bounds.left + 1) / FIXED_UNITS_PER_PIXEL * worldZoom;
    const height = (bounds.bottom - bounds.top + 1) / FIXED_UNITS_PER_PIXEL * worldZoom;
    context.fillStyle = local ? '#33e6ff55' : '#d36dff44';
    context.strokeStyle = local ? '#33e6ff' : '#d36dff';
    context.lineWidth = 1;
    context.fillRect(Math.round(left), Math.round(top), Math.ceil(width), Math.ceil(height));
    context.strokeRect(Math.round(left), Math.round(top), Math.ceil(width), Math.ceil(height));
    const footX = Math.round((position.x / FIXED_UNITS_PER_PIXEL - cameraX) * worldZoom);
    const footY = Math.round((position.y / FIXED_UNITS_PER_PIXEL - cameraY) * worldZoom);
    context.fillRect(footX - 2, footY, 5, 1);
    context.fillRect(footX, footY - 2, 1, 5);
  }
}

function drawCollisionOverlay(cameraX: number, cameraY: number, seed: number): void {
  const minX = Math.max(0, Math.floor(cameraX / 16));
  const minY = Math.max(0, Math.floor(cameraY / 16));
  const maxX = Math.min(SURVIVAL_WORLD_SIZE - 1, Math.ceil((cameraX + canvas.width / worldZoom) / 16));
  const maxY = Math.min(SURVIVAL_WORLD_SIZE - 1, Math.ceil((cameraY + canvas.height / worldZoom) / 16));
  for (let tileY = minY; tileY <= maxY; tileY += 1) for (let tileX = minX; tileX <= maxX; tileX += 1) {
    const index = tileY * SURVIVAL_WORLD_SIZE + tileX;
    const blocked = worldCollision.blocked[index] ?? true;
    const terrainBlocked = survivalBiomeBlocksMovement(survivalBiomeAt(seed, tileX, tileY));
    context.fillStyle = blocked ? terrainBlocked ? '#ff335577' : '#ff9d2377' : '#55ff8850';
    context.fillRect(
      Math.round((tileX * 16 - cameraX) * worldZoom),
      Math.round((tileY * 16 - cameraY) * worldZoom),
      16 * worldZoom,
      16 * worldZoom,
    );
    context.strokeStyle = '#fff3';
    context.lineWidth = 1;
    context.strokeRect(
      Math.round((tileX * 16 - cameraX) * worldZoom),
      Math.round((tileY * 16 - cameraY) * worldZoom),
      16 * worldZoom,
      16 * worldZoom,
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
      Math.round((left - cameraX) * worldZoom),
      Math.round((top - cameraY) * worldZoom),
      Math.ceil(width * worldZoom),
      Math.ceil(height * worldZoom),
    );
    context.strokeRect(
      Math.round((left - cameraX) * worldZoom),
      Math.round((top - cameraY) * worldZoom),
      Math.ceil(width * worldZoom),
      Math.ceil(height * worldZoom),
    );
  }
}

function render(): void {
  const snapshot = network.snapshot();
  const localX = (predicted?.position.x ?? 96 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const localY = (predicted?.position.y ?? 96 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const viewportWidth = canvas.width / worldZoom;
  const viewportHeight = canvas.height / worldZoom;
  const worldPixels = SURVIVAL_WORLD_SIZE * 16;
  const cameraX = cameraAxisOffset(localX, viewportWidth, worldPixels);
  const cameraY = cameraAxisOffset(localY, viewportHeight, worldPixels);
  const seed = snapshot.worldSeed?.seed ?? SURVIVAL_WORLD_SEED;
  const uiScale = fittedUiScale(desiredUiScale, canvas.width, canvas.height);
  drawOverworldGround(context, art, cameraX, cameraY, worldZoom, canvas.width, canvas.height, seed);

  const visible = visibleWorldBounds(cameraX, cameraY, canvas.width, canvas.height, worldZoom, 64);
  const drawItems: Array<{ footY: number; tie: string; draw: () => void }> = [];
  for (const resource of snapshot.resources) {
    const resourceX = resource.tileX * 16 + 8;
    const resourceY = (resource.tileY + 1) * 16;
    if (!worldPointVisible(resourceX, resourceY, visible)) continue;
    drawItems.push({
      footY: resourceY,
      tie: `resource:${resource.id}`,
      draw: () => {
        if (resource.depleted) {
          drawOverworldStump(context, art, resourceX, resourceY, cameraX, cameraY, worldZoom);
          return;
        }
        const shaking = (treeShakeUntil.get(resource.id) ?? -1) > animationTick;
        const shakeX = shaking ? (animationTick % 4 < 2 ? -1 : 1) : 0;
        drawOverworldTree(
          context,
          art,
          resourceX + shakeX,
          resourceY - 4,
          false,
          cameraX,
          cameraY,
          worldZoom,
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
    drawItems.push({
      footY: y,
      tie: `item:${item.id}`,
      draw: () => drawOverworldItem(context, art, x, y, arcHeight, cameraX, cameraY, worldZoom),
    });
  }
  for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    const display = local ? null : remoteDisplay.get(id);
    const xFixed = local ? predicted?.position.x ?? player.x : display?.x ?? player.x;
    const yFixed = local ? predicted?.position.y ?? player.y : display?.y ?? player.y;
    const x = xFixed / FIXED_UNITS_PER_PIXEL;
    const y = yFixed / FIXED_UNITS_PER_PIXEL;
    if (!worldPointVisible(x, y, visible)) continue;
    const facing = (local ? predicted?.facing ?? player.facing : player.facing) as Direction;
    const moving = local ? lastDirection !== 'idle' : player.moving;
    drawItems.push({
      footY: y,
      tie: `player:${id}`,
      draw: () => {
        const axeElapsed = local && axeActionStartedTick !== null ? animationTick - axeActionStartedTick : -1;
        const axeFrame = axePreviewFrame ?? (axeElapsed >= 0 && axeElapsed < 24 ? Math.min(3, Math.floor(axeElapsed / 6)) : null);
        drawOverworldAvatar(context, art, x, y, facing, moving, animationTick, cameraX, cameraY, worldZoom, axeFrame, profileName(snapshot.profiles, id));
      },
    });
  }
  for (const item of sortWorldDrawItems(drawItems)) item.draw();
  if (debugCollision) {
    drawCollisionOverlay(cameraX, cameraY, seed);
    drawPlayerCollisionOverlay(cameraX, cameraY, snapshot);
  }

  const uiWidth = canvas.width / uiScale;
  const uiHeight = canvas.height / uiScale;
  context.save();
  context.scale(uiScale, uiScale);
  const islandStatus = `ISLAND ${snapshot.connected ? 'ONLINE' : 'CONNECTING'} PLAYERS ${snapshot.players.length}`;
  drawPixelPanel(context, art.ui, 4, 4, measurePixelText(islandStatus) + 14, 19);
  drawPixelText(context, art.ui, islandStatus, 11, 11);
  const pickup = targetWorldItem(snapshot);
  const prompt = pickup === null ? null : `[E] PICK UP ${hotbarItemLabel(pickup.itemKind)} x${pickup.quantity}`;
  const hoveredInventory = hoveredHotbarSlot === null
    ? undefined
    : snapshot.inventorySlots.find((candidate) => candidate.slot === hoveredHotbarSlot);
  const hoverName = hotbarItemName(hoveredInventory?.itemKind ?? 'empty');
  const tooltip = hoverName ?? prompt ?? (toastTicks > 0 ? toast.slice(0, 42) : null);
  if (tooltip !== null) {
    const width = Math.max(104, measurePixelText(tooltip) + 14);
    drawPixelPanel(context, art.ui, uiWidth / 2 - width / 2, uiHeight - 62, width, 19);
    drawPixelText(context, art.ui, tooltip, uiWidth / 2, uiHeight - 56, { align: 'center' });
  }
  drawHotbar(snapshot, uiWidth, uiHeight);
  context.restore();
}

function pointerUiPosition(event: PointerEvent): readonly [number, number] {
  const rect = canvas.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left) * canvas.width / rect.width;
  const canvasY = (event.clientY - rect.top) * canvas.height / rect.height;
  const uiScale = fittedUiScale(desiredUiScale, canvas.width, canvas.height);
  return [canvasX / uiScale, canvasY / uiScale];
}

function hotbarSlotForPointer(event: PointerEvent): number | null {
  const [x, y] = pointerUiPosition(event);
  const uiScale = fittedUiScale(desiredUiScale, canvas.width, canvas.height);
  return hotbarSlotAtPoint(x, y, canvas.width / uiScale, canvas.height / uiScale);
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

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  const selectedSlot = hotbarSlotForCode(event.code);
  if (selectedSlot !== null && !event.repeat) {
    showResult(network.selectHotbar(selectedSlot), `SELECTED SLOT ${selectedSlot + 1}`);
    event.preventDefault();
    return;
  }
  if ((event.code === 'Minus' || event.code === 'NumpadSubtract') && !event.repeat) {
    if (event.shiftKey) desiredUiScale = stepUiScale(desiredUiScale, -1);
    else worldZoom = stepWorldZoom(worldZoom, -1);
    event.preventDefault();
    return;
  }
  if ((event.code === 'Equal' || event.code === 'NumpadAdd') && !event.repeat) {
    if (event.shiftKey) desiredUiScale = stepUiScale(desiredUiScale, 1);
    else worldZoom = stepWorldZoom(worldZoom, 1);
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
  if (event.code === 'KeyF' && !event.repeat) {
    const snapshot = network.snapshot();
    const item = selectedItem(snapshot);
    if (item !== 'axe') {
      toast = `NO ${hotbarItemLabel(item)} USE ACTION YET`;
      toastTicks = 120;
    } else {
      axeActionStartedTick = animationTick;
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
    const item = targetWorldItem(network.snapshot());
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
canvas.addEventListener('pointermove', (event) => { hoveredHotbarSlot = hotbarSlotForPointer(event); });
canvas.addEventListener('pointerleave', () => { hoveredHotbarSlot = null; });
canvas.addEventListener('pointerdown', (event) => {
  const slot = hotbarSlotForPointer(event);
  if (slot === null) return;
  hoveredHotbarSlot = slot;
  showResult(network.selectHotbar(slot), `SELECTED SLOT ${slot + 1}`);
  event.preventDefault();
});
canvas.addEventListener('wheel', (event) => {
  if (event.ctrlKey || event.deltaY === 0) return;
  event.preventDefault();
  if (event.timeStamp < wheelZoomLockedUntil) return;
  wheelZoomLockedUntil = event.timeStamp + 120;
  worldZoom = stepWorldZoom(worldZoom, event.deltaY > 0 ? -1 : 1);
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
    setWorldZoom: (zoom: WorldZoom) => { worldZoom = zoom; },
    setUiScale: (scale: UiScale) => { desiredUiScale = scale; },
    setAxePreviewFrame: (frame: number | null) => { axePreviewFrame = frame; },
  },
});
loop.start();
