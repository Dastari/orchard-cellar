import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  movePlayer,
  type CollisionMap,
  type Direction,
  type PlayerState,
} from '@orchard/sim';
import { FixedStepLoop } from './loop.js';
import { OverworldConnection, type NetworkDirection } from './net/overworld-connection.js';
import type { CropPatch, FarmParcel, PlayerPosition, PlayerPublic } from './net/generated/types.js';
import './style.css';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (canvasElement === null) throw new Error('Missing overworld canvas');
const canvas: HTMLCanvasElement = canvasElement;
const canvasContext = canvas.getContext('2d');
if (canvasContext === null) throw new Error('Canvas 2D unavailable');
const context: CanvasRenderingContext2D = canvasContext;
context.imageSmoothingEnabled = false;

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
const remoteDisplay = new Map<string, { x: number; y: number }>();

function resize(): void {
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / 480, innerHeight / 270)));
  canvas.style.width = `${480 * scale}px`;
  canvas.style.height = `${270 * scale}px`;
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

function drawGround(cameraX: number, cameraY: number): void {
  context.fillStyle = '#739b57';
  context.fillRect(0, 0, 480, 270);
  context.fillStyle = '#c9a56a';
  for (let boundary = 15; boundary < WORLD_WIDTH - 1; boundary += 16) {
    context.fillRect(-cameraX, boundary * 16 - cameraY, WORLD_WIDTH * 16, 32);
    context.fillRect(boundary * 16 - cameraX, -cameraY, 32, WORLD_HEIGHT * 16);
  }
  context.fillStyle = '#5f8749';
  for (let y = 24; y < 500; y += 47) {
    for (let x = 18 + (y % 3) * 11; x < 750; x += 73) {
      context.fillRect(Math.round(x - cameraX), Math.round(y - cameraY), 2, 3);
    }
  }
}

function drawParcel(parcel: FarmParcel, cameraX: number, cameraY: number): void {
  const x = parcel.originX * 16 - cameraX;
  const y = parcel.originY * 16 - cameraY;
  const width = parcel.width * 16;
  const height = parcel.height * 16;
  context.fillStyle = '#82a95f';
  context.fillRect(Math.round(x), Math.round(y), width, height);
  context.fillStyle = '#5a783f';
  context.fillRect(Math.round(x), Math.round(y), width, 2);
  context.fillRect(Math.round(x), Math.round(y + height - 2), width, 2);
  context.fillRect(Math.round(x), Math.round(y), 2, height);
  context.fillRect(Math.round(x + width - 2), Math.round(y), 2, height);

  const bedX = (parcel.originX + 2) * 16 - cameraX;
  const bedY = (parcel.originY + 5) * 16 - cameraY;
  context.fillStyle = '#936342';
  context.fillRect(Math.round(bedX), Math.round(bedY), 10 * 16, 7 * 16);
  context.fillStyle = '#7b5037';
  for (let column = 1; column < 10; column += 1) {
    context.fillRect(Math.round(bedX + column * 16), Math.round(bedY), 1, 7 * 16);
  }
  for (let row = 1; row < 7; row += 1) {
    context.fillRect(Math.round(bedX), Math.round(bedY + row * 16), 10 * 16, 1);
  }

  context.fillStyle = '#4b3528';
  context.fillRect(Math.round(x + 24), Math.round(y + 13), 176, 14);
  context.fillStyle = '#f7e7b2';
  context.font = '8px monospace';
  context.textAlign = 'center';
  context.fillText(parcel.name.slice(0, 25).toUpperCase(), Math.round(x + width / 2), Math.round(y + 23));
}

function drawCrop(crop: CropPatch, authorityTick: bigint, cameraX: number, cameraY: number): void {
  const x = crop.tileX * 16 - cameraX;
  const y = crop.tileY * 16 - cameraY;
  if (crop.watered) {
    context.fillStyle = '#654334';
    context.fillRect(Math.round(x + 1), Math.round(y + 1), 14, 14);
  }
  const stage = crop.watered ? cropStage(crop, authorityTick) : 0;
  context.fillStyle = stage === 3 ? '#d9b33d' : stage === 2 ? '#4f853f' : '#6e9d52';
  if (stage === 0) {
    context.fillRect(Math.round(x + 7), Math.round(y + 9), 2, 3);
  } else if (stage === 1) {
    context.fillRect(Math.round(x + 7), Math.round(y + 6), 2, 6);
    context.fillRect(Math.round(x + 4), Math.round(y + 7), 4, 2);
    context.fillRect(Math.round(x + 9), Math.round(y + 5), 3, 2);
  } else {
    context.fillRect(Math.round(x + 6), Math.round(y + 4), 4, 9);
    context.fillRect(Math.round(x + 3), Math.round(y + 5), 10, 5);
    if (stage === 3) {
      context.fillStyle = '#d95745';
      context.fillRect(Math.round(x + 4), Math.round(y + 4), 3, 3);
      context.fillRect(Math.round(x + 10), Math.round(y + 7), 3, 3);
    }
  }
}

function drawAvatar(x: number, y: number, local: boolean, name: string): void {
  const screenX = Math.round(x - 6);
  const screenY = Math.round(y - 14);
  context.fillStyle = '#3f2d25';
  context.fillRect(screenX + 2, screenY, 8, 4);
  context.fillStyle = local ? '#e7b34f' : '#76a8d8';
  context.fillRect(screenX + 1, screenY + 4, 10, 8);
  context.fillStyle = '#ead0ad';
  context.fillRect(screenX + 3, screenY + 2, 6, 5);
  context.fillStyle = '#2d3540';
  context.fillRect(screenX + 2, screenY + 12, 3, 3);
  context.fillRect(screenX + 7, screenY + 12, 3, 3);
  context.font = '7px monospace';
  context.textAlign = 'center';
  context.fillStyle = '#fff4d0';
  context.fillText(name, screenX + 6, screenY - 3);
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
  const cameraX = Math.max(0, Math.min(WORLD_WIDTH * 16 - 480, localX - 240));
  const cameraY = Math.max(0, Math.min(WORLD_HEIGHT * 16 - 270, localY - 135));
  drawGround(cameraX, cameraY);

  for (const parcel of snapshot.parcels) drawParcel(parcel, cameraX, cameraY);

  const authorityTick = snapshot.clock?.authorityTick ?? 0n;
  for (const crop of snapshot.crops) drawCrop(crop, authorityTick, cameraX, cameraY);

  for (const tree of snapshot.trees) {
    const x = tree.x / FIXED_UNITS_PER_PIXEL - cameraX;
    const y = tree.y / FIXED_UNITS_PER_PIXEL - cameraY;
    context.fillStyle = '#493929';
    context.fillRect(Math.round(x - 2), Math.round(y - 4), 4, 12);
    context.fillStyle = tree.care > 0 ? '#3f7f48' : '#355f3c';
    context.fillRect(Math.round(x - 9), Math.round(y - 16), 18, 13);
    context.fillStyle = '#d85b4a';
    for (let fruit = 0; fruit < Math.min(4, tree.care); fruit += 1) {
      context.fillRect(Math.round(x - 6 + fruit * 4), Math.round(y - 11 + fruit % 2 * 3), 2, 2);
    }
  }

  const target = targetFarmTile();
  const targetParcel = target === null
    ? undefined
    : snapshot.parcels.find((parcel) => isFarmBedTile(parcel, target.x, target.y));
  if (target !== null && targetParcel !== undefined) {
    context.strokeStyle = '#ffe98a';
    context.lineWidth = 2;
    context.strokeRect(
      Math.round(target.x * 16 - cameraX + 1),
      Math.round(target.y * 16 - cameraY + 1),
      14,
      14,
    );
  }

  for (const player of snapshot.players) {
    const id = player.identity.toHexString();
    const local = id === snapshot.identityHex;
    const display = local ? null : remoteDisplay.get(id);
    const x = (local ? predicted?.position.x ?? player.x : display?.x ?? player.x) / FIXED_UNITS_PER_PIXEL - cameraX;
    const y = (local ? predicted?.position.y ?? player.y : display?.y ?? player.y) / FIXED_UNITS_PER_PIXEL - cameraY;
    drawAvatar(x, y, local, profileName(snapshot.profiles, id));
  }

  context.textAlign = 'left';
  context.fillStyle = '#172019dd';
  context.fillRect(5, 5, 264, 46);
  context.fillStyle = '#f7e7b2';
  context.font = '8px monospace';
  context.fillText(`WORLD ${snapshot.connected ? 'ONLINE' : 'CONNECTING'}  PLAYERS ${snapshot.players.length}`, 10, 16);
  context.fillText(`FARMS ${snapshot.parcels.length}  CROPS ${snapshot.crops.length}  TICK ${authorityTick}`, 10, 27);
  const ownActivity = snapshot.activity.find((row) => row.identity.toHexString() === snapshot.identityHex);
  context.fillText(`PLANTED ${ownActivity?.planted ?? 0}  WATERED ${ownActivity?.watered ?? 0}  HARVESTED ${ownActivity?.harvested ?? 0}`, 10, 38);
  context.fillText('WASD WALK BETWEEN FARMS', 10, 48);
  const prompt = farmPrompt(target, snapshot);
  if (prompt !== null) {
    context.fillStyle = '#172019dd';
    const promptWidth = Math.max(104, prompt.length * 6 + 12);
    context.fillRect(240 - promptWidth / 2, 218, promptWidth, 17);
    context.fillStyle = '#ffe98a';
    context.textAlign = 'center';
    context.fillText(prompt, 240, 229);
  }
  if (toastTicks > 0) {
    context.fillStyle = '#172019dd';
    context.fillRect(120, 244, 240, 18);
    context.fillStyle = '#f7e7b2';
    context.textAlign = 'center';
    context.fillText(toast.slice(0, 48), 240, 256);
  }
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
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
