import { FIBER_TILL_DROP_PERCENT } from './balance.js';

export const PLACEABLE_KINDS = [
  'workbench', 'anvil', 'campfire', 'barrel', 'fence', 'fence_gate', 'sign', 'standing_torch',
] as const;
export type PlaceableKind = typeof PLACEABLE_KINDS[number];

export interface PlaceableDefinition {
  readonly blocksMovement: boolean;
  readonly slotCapacity: number;
  readonly station: 'workbench' | 'campfire' | null;
  readonly light: 'flame' | null;
  readonly connectsFence: boolean;
}

export const PLACEABLE_DEFINITIONS = {
  workbench: { blocksMovement: true, slotCapacity: 0, station: 'workbench', light: null, connectsFence: false },
  anvil: { blocksMovement: true, slotCapacity: 0, station: null, light: null, connectsFence: false },
  campfire: { blocksMovement: true, slotCapacity: 0, station: 'campfire', light: 'flame', connectsFence: false },
  barrel: { blocksMovement: true, slotCapacity: 8, station: null, light: null, connectsFence: false },
  fence: { blocksMovement: true, slotCapacity: 0, station: null, light: null, connectsFence: true },
  fence_gate: { blocksMovement: true, slotCapacity: 0, station: null, light: null, connectsFence: true },
  sign: { blocksMovement: true, slotCapacity: 0, station: null, light: null, connectsFence: false },
  standing_torch: { blocksMovement: false, slotCapacity: 0, station: null, light: 'flame', connectsFence: false },
} as const satisfies Readonly<Record<PlaceableKind, PlaceableDefinition>>;

/** Temporary simple anvil economy: one raw copper repairs the selected durable
 * item completely. Keeping this shared prevents prompts and authority drifting. */
/** Canonical purse units; the UI presents the smallest bronze unit as copper. */
export const ANVIL_REPAIR_COST_BRONZE = 5;

export function placeableDefinition(kind: string): PlaceableDefinition | null {
  return Object.prototype.hasOwnProperty.call(PLACEABLE_DEFINITIONS, kind)
    ? PLACEABLE_DEFINITIONS[kind as PlaceableKind]
    : null;
}

export function craftingStationWithinReach(
  player: { readonly spaceId: number; readonly tileX: number; readonly tileY: number },
  station: { readonly spaceId: number; readonly tileX: number; readonly tileY: number },
  reachTiles: number,
): boolean {
  return player.spaceId === station.spaceId
    && Math.max(Math.abs(player.tileX - station.tileX), Math.abs(player.tileY - station.tileY)) <= reachTiles;
}

/** Stateless tile/tick roll. Replays with the same inputs always agree. */
export function fiberDropsFromTilling(
  worldSeed: number,
  spaceId: number,
  tileX: number,
  tileY: number,
  authorityTick: bigint,
): boolean {
  let hash = (worldSeed ^ 0x46494252) >>> 0;
  for (const part of [spaceId, tileX, tileY, Number(authorityTick & 0xffff_ffffn)]) {
    hash ^= (part + 0x9e3779b9 + (hash << 6) + (hash >>> 2)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
    hash = (hash ^ (hash >>> 16)) >>> 0;
  }
  return hash % 100 < FIBER_TILL_DROP_PERCENT;
}

export const FENCE_JOIN_NORTH = 1;
export const FENCE_JOIN_EAST = 2;
export const FENCE_JOIN_SOUTH = 4;
export const FENCE_JOIN_WEST = 8;

export function fenceJoinMask(
  tileX: number,
  tileY: number,
  connectsAt: (tileX: number, tileY: number) => boolean,
): number {
  return (connectsAt(tileX, tileY - 1) ? FENCE_JOIN_NORTH : 0)
    | (connectsAt(tileX + 1, tileY) ? FENCE_JOIN_EAST : 0)
    | (connectsAt(tileX, tileY + 1) ? FENCE_JOIN_SOUTH : 0)
    | (connectsAt(tileX - 1, tileY) ? FENCE_JOIN_WEST : 0);
}
