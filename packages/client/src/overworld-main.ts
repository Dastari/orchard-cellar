import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  movePlayer,
  type CollisionMap,
  type Direction,
  type PlayerState,
} from '@orchard/sim';
import { FixedStepLoop } from './loop.js';
import { resizePixelCanvas, stepWorldZoom, toggleFullscreen, type WorldZoom } from './display.js';
import { OverworldConnection, type NetworkDirection } from './net/overworld-connection.js';
import type { CropPatch, FarmParcel, PlayerPosition, PlayerPublic } from './net/generated/types.js';
import {
  drawOverworldAvatar,
  drawOverworldCrop,
  drawOverworldGround,
  drawOverworldParcel,
  drawOverworldTree,
  loadOverworldArt,
} from './overworld-art.js';
import { drawPixelPanel, drawPixelText, measurePixelText } from './render/pixel-ui.js';
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

const WORLD_WIDTH = 80;
const WORLD_HEIGHT = 80;
const CROP_GROWTH_TICKS = 200n;
const WORLD_COLLISION: CollisionMap = {
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  blocked: Array.from({ length: WORLD_WIDTH * WORLD_HEIGHT }, (_, index) => {
    const x = index % WORLD_WIDTH;
    const y = Math.floor(index / WORLD_WIDTH);
    return x === 0 || y === 0 || x === WORLD_WIDTH - 1 || y === WORLD_HEIGHT - 1;
  }),
};
const keys = new Set<string>();
const slot = new URLSearchParams(location.search).get('slot') ?? 'Farmer One';
let networkDirty = true;
const network = new OverworldConnection(slot, () => { networkDirty = true; });
let predicted: PlayerState | null = null;
let lastDirection: NetworkDirection = 'idle';
let toast = 'CONNECTING TO SHARED WORLD';
let toastTicks = 180;
let animationTick = 0;
let worldZoom: WorldZoom = 2;
const remoteDisplay = new Map<string, { x: number; y: number }>();

function resize(): void {
  resizePixelCanvas(canvas);
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
  const facing = row.facing as Direction;
  return {
    position: { x: row.x, y: row.y },
    facing,
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
  const errorSquared = dx * dx + dy * dy;
  if (errorSquared > (TILE_SIZE_FIXED * 2) ** 2) {
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

function update(): void {
  animationTick = (animationTick + 1) % 1_000_000;
  const direction = directionFromKeys();
  if (direction !== lastDirection) {
    lastDirection = direction;
    network.setDirection(direction);
  }
  const authoritative = network.ownPosition();
  if (authoritative !== null) reconcile(authoritative);
  if (predicted !== null) {
    predicted = movePlayer(predicted, direction === 'idle' ? null : direction, WORLD_COLLISION);
  }
  const snapshot = network.snapshot();
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
    toast = snapshot.error === null
      ? snapshot.connected ? 'SHARED WORLD ONLINE' : 'CONNECTING TO SHARED WORLD'
      : `NETWORK ${snapshot.error}`;
    toastTicks = 120;
  }
  if (toastTicks > 0) toastTicks -= 1;
}

function profileName(profiles: readonly PlayerPublic[], identity: string): string {
  return profiles.find((profile) => profile.identity.toHexString() === identity)?.displayName ?? 'FARMER';
}

function isFarmBedTile(parcel: FarmParcel, tileX: number, tileY: number): boolean {
  return tileX >= parcel.originX + 2
    && tileX <= parcel.originX + 11
    && tileY >= parcel.originY + 5
    && tileY <= parcel.originY + 11;
}

function targetFarmTile(): { readonly x: number; readonly y: number } | null {
  if (predicted === null) return null;
  const vectors: Record<Direction, readonly [number, number]> = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    upLeft: [-1, -1], upRight: [1, -1], downLeft: [-1, 1], downRight: [1, 1],
  };
  const [dx, dy] = vectors[predicted.facing];
  return {
    x: Math.round(predicted.position.x / TILE_SIZE_FIXED + dx),
    y: Math.round(predicted.position.y / TILE_SIZE_FIXED + dy),
  };
}

function cropStage(crop: CropPatch, authorityTick: bigint): 0 | 1 | 2 | 3 {
  if (!crop.watered) return 0;
  const elapsed = authorityTick - crop.wateredAtTick;
  if (elapsed >= CROP_GROWTH_TICKS) return 3;
  if (elapsed >= CROP_GROWTH_TICKS * 2n / 3n) return 2;
  if (elapsed >= CROP_GROWTH_TICKS / 3n) return 1;
  return 0;
}

function farmPrompt(
  target: { readonly x: number; readonly y: number } | null,
  snapshot: ReturnType<OverworldConnection['snapshot']>,
): string | null {
  if (target === null) return null;
  const parcel = snapshot.parcels.find((candidate) => isFarmBedTile(candidate, target.x, target.y));
  if (parcel === undefined) return null;
  const crop = snapshot.crops.find((candidate) => candidate.tileX === target.x && candidate.tileY === target.y);
  const ownFarm = parcel.owner.toHexString() === snapshot.identityHex;
  if (crop === undefined) return ownFarm ? '[E] PLANT SEED' : 'OWNER PLANTS HERE';
  if (!crop.watered) return '[E] WATER CROP';
  if (cropStage(crop, snapshot.clock?.authorityTick ?? 0n) < 3) return 'CROP GROWING';
  return ownFarm ? '[E] HARVEST' : 'READY FOR OWNER';
}

function render(): void {
  const snapshot = network.snapshot();
  const localX = (predicted?.position.x ?? 8 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const localY = (predicted?.position.y ?? 12 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const viewportWidth = 480 / worldZoom;
  const viewportHeight = 270 / worldZoom;
  const cameraX = Math.max(0, Math.min(WORLD_WIDTH * 16 - viewportWidth, localX - viewportWidth / 2));
  const cameraY = Math.max(0, Math.min(WORLD_HEIGHT * 16 - viewportHeight, localY - viewportHeight / 2));
  drawOverworldGround(context, art, cameraX, cameraY, worldZoom);

  for (const parcel of snapshot.parcels) drawOverworldParcel(context, art, parcel, snapshot.crops, cameraX, cameraY, worldZoom);

  const authorityTick = snapshot.clock?.authorityTick ?? 0n;
  for (const crop of snapshot.crops) {
    drawOverworldCrop(context, art, crop, cropStage(crop, authorityTick), cameraX, cameraY, worldZoom);
  }

  for (const tree of snapshot.trees) {
    drawOverworldTree(
      context,
      art,
      tree.x / FIXED_UNITS_PER_PIXEL,
      tree.y / FIXED_UNITS_PER_PIXEL,
      tree.care > 0,
      cameraX,
      cameraY,
      worldZoom,
    );
  }

  const target = targetFarmTile();
  const targetParcel = target === null
    ? undefined
    : snapshot.parcels.find((parcel) => isFarmBedTile(parcel, target.x, target.y));
  if (target !== null && targetParcel !== undefined) {
    context.strokeStyle = '#ffe98a';
    context.lineWidth = 2;
    context.strokeRect(
      Math.round((target.x * 16 - cameraX + 1) * worldZoom),
      Math.round((target.y * 16 - cameraY + 1) * worldZoom),
      14 * worldZoom,
      14 * worldZoom,
    );
  }

  for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    const display = local ? null : remoteDisplay.get(id);
    const x = (local ? predicted?.position.x ?? player.x : display?.x ?? player.x) / FIXED_UNITS_PER_PIXEL;
    const y = (local ? predicted?.position.y ?? player.y : display?.y ?? player.y) / FIXED_UNITS_PER_PIXEL;
    const facing = (local ? predicted?.facing ?? player.facing : player.facing) as Direction;
    const moving = local ? lastDirection !== 'idle' : player.moving;
    drawOverworldAvatar(context, art, x, y, facing, moving, animationTick, cameraX, cameraY, worldZoom, profileName(snapshot.profiles, id));
  }

  drawPixelPanel(context, art.ui, 4, 4, 278, 58);
  drawPixelText(context, art.ui, `WORLD ${snapshot.connected ? 'ONLINE' : 'CONNECTING'}  PLAYERS ${snapshot.players.length}`, 11, 11);
  drawPixelText(context, art.ui, `FARMS ${snapshot.parcels.length}  CROPS ${snapshot.crops.length}  TICK ${authorityTick}`, 11, 22);
  const ownActivity = snapshot.activity.find((row) => row.identity.toHexString() === snapshot.identityHex);
  drawPixelText(context, art.ui, `PLANTED ${ownActivity?.planted ?? 0}  WATERED ${ownActivity?.watered ?? 0}  HARVESTED ${ownActivity?.harvested ?? 0}`, 11, 33);
  drawPixelText(context, art.ui, 'WASD WALK  -/+ ZOOM  F FULLSCREEN', 11, 44);
  drawPixelText(context, art.ui, `VIEW ${worldZoom}X`, 272, 53, { align: 'right' });
  const prompt = farmPrompt(target, snapshot);
  if (prompt !== null) {
    const promptWidth = Math.max(104, measurePixelText(prompt) + 14);
    drawPixelPanel(context, art.ui, 240 - promptWidth / 2, 216, promptWidth, 19);
    drawPixelText(context, art.ui, prompt, 240, 222, { align: 'center' });
  }
  if (toastTicks > 0) {
    drawPixelPanel(context, art.ui, 105, 244, 270, 19);
    drawPixelText(context, art.ui, toast.slice(0, 42), 240, 250, { align: 'center' });
  }
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  if ((event.code === 'Minus' || event.code === 'NumpadSubtract') && !event.repeat) {
    worldZoom = stepWorldZoom(worldZoom, -1);
    event.preventDefault();
    return;
  }
  if ((event.code === 'Equal' || event.code === 'NumpadAdd') && !event.repeat) {
    worldZoom = stepWorldZoom(worldZoom, 1);
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyF' && !event.repeat) {
    void toggleFullscreen(shellElement).catch(() => undefined);
    event.preventDefault();
    return;
  }
  if (event.code.startsWith('Arrow')) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'KeyE' && !event.repeat) {
    const target = targetFarmTile();
    const before = network.snapshot();
    const parcel = target === null
      ? undefined
      : before.parcels.find((candidate) => isFarmBedTile(candidate, target.x, target.y));
    if (target !== null && parcel !== undefined) {
      const crop = before.crops.find((candidate) => candidate.tileX === target.x && candidate.tileY === target.y);
      const result = crop === undefined ? 'SEED PLANTED' : !crop.watered ? 'CROP WATERED' : 'CROP HARVESTED';
      void network.useFarmTile(target.x, target.y).then(() => {
        toast = result;
        toastTicks = 120;
      }).catch((error: unknown) => {
        toast = error instanceof Error ? error.message : String(error);
        toastTicks = 120;
      });
    } else {
      toast = 'FACE A FARM BED TO WORK IT';
      toastTicks = 120;
    }
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
canvas.addEventListener('dblclick', () => { void toggleFullscreen(shellElement).catch(() => undefined); });

resize();
const loop = new FixedStepLoop({ update, render });
Object.assign(window, {
  __orchardOverworld: {
    snapshot: () => network.snapshot(),
    update,
    render,
    setDirection: (direction: NetworkDirection) => network.setDirection(direction),
    tendTree: (treeId = 1n) => network.tendTree(treeId),
    useFarmTile: (tileX: number, tileY: number) => network.useFarmTile(tileX, tileY),
  },
});
loop.start();
