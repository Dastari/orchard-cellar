import {
  FIXED_UNITS_PER_PIXEL,
  TILE_SIZE_FIXED,
  createPlaceholderCollisionMap,
  movePlayer,
  type Direction,
  type PlayerState,
} from '@orchard/sim';
import { FixedStepLoop } from './loop.js';
import { OverworldConnection, type NetworkDirection } from './net/overworld-connection.js';
import type { PlayerPosition, PlayerPublic } from './net/generated/types.js';
import './style.css';

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (canvasElement === null) throw new Error('Missing overworld canvas');
const canvas: HTMLCanvasElement = canvasElement;
const canvasContext = canvas.getContext('2d');
if (canvasContext === null) throw new Error('Canvas 2D unavailable');
const context: CanvasRenderingContext2D = canvasContext;
context.imageSmoothingEnabled = false;

const WORLD_COLLISION = createPlaceholderCollisionMap(48, 32);
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

function drawGround(cameraX: number, cameraY: number): void {
  context.fillStyle = '#6f9a55';
  context.fillRect(0, 0, 480, 270);
  context.fillStyle = '#c9a56a';
  context.fillRect(-cameraX, 176 - cameraY, 768, 48);
  context.fillRect(240 - cameraX, -cameraY, 48, 512);
  context.fillStyle = '#5f8749';
  for (let y = 24; y < 500; y += 47) {
    for (let x = 18 + (y % 3) * 11; x < 750; x += 73) {
      context.fillRect(Math.round(x - cameraX), Math.round(y - cameraY), 2, 3);
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

function render(): void {
  const snapshot = network.snapshot();
  const localX = (predicted?.position.x ?? 8 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const localY = (predicted?.position.y ?? 12 * TILE_SIZE_FIXED) / FIXED_UNITS_PER_PIXEL;
  const cameraX = Math.max(0, Math.min(768 - 480, localX - 240));
  const cameraY = Math.max(0, Math.min(512 - 270, localY - 135));
  drawGround(cameraX, cameraY);

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
  context.fillRect(5, 5, 225, 35);
  context.fillStyle = '#f7e7b2';
  context.font = '8px monospace';
  context.fillText(`WORLD ${snapshot.connected ? 'ONLINE' : 'CONNECTING'}  PLAYERS ${snapshot.players.length}`, 10, 16);
  context.fillText(`REGION ${snapshot.region[0]},${snapshot.region[1]}  TICK ${snapshot.clock?.authorityTick ?? 0n}`, 10, 27);
  context.fillText('WASD MOVE  E TEND SHARED TREE', 10, 37);
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
    const tree = network.snapshot().trees[0];
    if (tree !== undefined) {
      void network.tendTree(tree.id).then(() => {
        toast = 'TREE TENDED ATOMICALLY';
        toastTicks = 120;
      }).catch((error: unknown) => {
        toast = error instanceof Error ? error.message : String(error);
        toastTicks = 120;
      });
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
  },
});
loop.start();
