import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type Direction } from '@orchard/sim';

export interface TargetableResource {
  readonly id: bigint;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly depleted: boolean;
}

export interface TargetableWorldItem {
  readonly id: bigint;
  readonly x: number;
  readonly y: number;
}

const FACING_VECTOR: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
  upLeft: [-1, -1],
  upRight: [1, -1],
  downLeft: [-1, 1],
  downRight: [1, 1],
};

export function facedResource<T extends TargetableResource>(
  playerX: number,
  playerY: number,
  facing: Direction,
  resources: Iterable<T>,
): T | null {
  const [facingX, facingY] = FACING_VECTOR[facing];
  const reachSquared = (2 * TILE_SIZE_FIXED) ** 2;
  let target: T | null = null;
  let targetDistance = Number.POSITIVE_INFINITY;
  for (const resource of resources) {
    if (resource.depleted) continue;
    const dx = resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - playerX;
    const dy = resource.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - playerY;
    const distance = dx * dx + dy * dy;
    if (distance > reachSquared || dx * facingX + dy * facingY <= 0) continue;
    if (distance < targetDistance || (distance === targetDistance && resource.id < (target?.id ?? resource.id + 1n))) {
      target = resource;
      targetDistance = distance;
    }
  }
  return target;
}

export function facedWorldItem<T extends TargetableWorldItem>(
  playerX: number,
  playerY: number,
  facing: Direction,
  items: Iterable<T>,
): T | null {
  const [facingX, facingY] = FACING_VECTOR[facing];
  const reachSquared = (24 * FIXED_UNITS_PER_PIXEL) ** 2;
  let target: T | null = null;
  let targetDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const dx = item.x - playerX;
    const dy = item.y - playerY;
    const distance = dx * dx + dy * dy;
    if (distance > reachSquared || dx * facingX + dy * facingY <= 0) continue;
    if (distance < targetDistance || (distance === targetDistance && item.id < (target?.id ?? item.id + 1n))) {
      target = item;
      targetDistance = distance;
    }
  }
  return target;
}

export function hotbarSlotForCode(code: string): number | null {
  if (/^Digit[1-9]$/.test(code) || /^Numpad[1-9]$/.test(code)) return Number(code.at(-1)) - 1;
  return null;
}

export const HOTBAR_SLOT_COUNT = 9;
export const HOTBAR_SLOT_WIDTH = 35;
export const HOTBAR_HEIGHT = 34;
export const HOTBAR_BOTTOM_MARGIN = 5;

export interface HotbarLayout {
  readonly startX: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function hotbarLayout(viewportWidth: number, viewportHeight: number): HotbarLayout {
  const width = HOTBAR_SLOT_WIDTH * HOTBAR_SLOT_COUNT;
  return {
    startX: Math.round((viewportWidth - width) / 2),
    y: viewportHeight - HOTBAR_HEIGHT - HOTBAR_BOTTOM_MARGIN,
    width,
    height: HOTBAR_HEIGHT,
  };
}

export function hotbarSlotAtPoint(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): number | null {
  const layout = hotbarLayout(viewportWidth, viewportHeight);
  if (x < layout.startX || x >= layout.startX + layout.width || y < layout.y || y >= layout.y + layout.height) {
    return null;
  }
  const slot = Math.floor((x - layout.startX) / HOTBAR_SLOT_WIDTH);
  const slotX = layout.startX + slot * HOTBAR_SLOT_WIDTH;
  return x < slotX + HOTBAR_HEIGHT ? slot : null;
}

const HOTBAR_LABELS: Readonly<Record<string, string>> = {
  axe: 'AXE',
  pickaxe: 'PICK',
  hoe: 'HOE',
  watering_can: 'WATER',
  wood: 'WOOD',
};

export function hotbarItemLabel(itemKind: string): string {
  return HOTBAR_LABELS[itemKind] ?? '--';
}

const HOTBAR_NAMES: Readonly<Record<string, string>> = {
  axe: 'AXE',
  pickaxe: 'PICKAXE',
  hoe: 'HOE',
  watering_can: 'WATERING CAN',
  wood: 'WOOD',
};

export function hotbarItemName(itemKind: string): string | null {
  return HOTBAR_NAMES[itemKind] ?? null;
}

export const WEATHER_PANEL_WIDTH = 142;
export const WEATHER_PANEL_HEIGHT = 45;

export interface WeatherPanelLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly sliderX: number;
  readonly sliderY: number;
  readonly sliderWidth: number;
  readonly rainX: number;
  readonly rainY: number;
  readonly rainWidth: number;
  readonly rainHeight: number;
}

export type WeatherControl = 'time' | 'rain';

export function weatherPanelLayout(viewportWidth: number): WeatherPanelLayout {
  const x = Math.round(viewportWidth - WEATHER_PANEL_WIDTH - 4);
  const y = 4;
  return {
    x,
    y,
    width: WEATHER_PANEL_WIDTH,
    height: WEATHER_PANEL_HEIGHT,
    sliderX: x + 8,
    sliderY: y + 18,
    sliderWidth: WEATHER_PANEL_WIDTH - 16,
    rainX: x + 8,
    rainY: y + 26,
    rainWidth: 58,
    rainHeight: 14,
  };
}

export function weatherControlAtPoint(x: number, y: number, viewportWidth: number): WeatherControl | null {
  const layout = weatherPanelLayout(viewportWidth);
  if (
    x >= layout.rainX && x < layout.rainX + layout.rainWidth
    && y >= layout.rainY && y < layout.rainY + layout.rainHeight
  ) return 'rain';
  if (
    x >= layout.sliderX - 3 && x <= layout.sliderX + layout.sliderWidth + 3
    && y >= layout.sliderY - 4 && y <= layout.sliderY + 5
  ) return 'time';
  return null;
}

export function weatherTimeFractionAtPoint(x: number, viewportWidth: number): number {
  const layout = weatherPanelLayout(viewportWidth);
  return Math.max(0, Math.min(1, (x - layout.sliderX) / layout.sliderWidth));
}

export function formatDayTime(dayTick: number, ticksPerDay: number): string {
  const normalized = ((dayTick % ticksPerDay) + ticksPerDay) % ticksPerDay;
  const totalMinutes = (6 * 60 + Math.floor(normalized / ticksPerDay * 20 * 60)) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
