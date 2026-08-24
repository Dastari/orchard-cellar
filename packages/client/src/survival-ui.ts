import { TILE_SIZE_FIXED, type Direction } from '@orchard/sim';

export interface TargetableResource {
  readonly id: bigint;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly depleted: boolean;
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
  resources: readonly T[],
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

export function hotbarSlotForCode(code: string): number | null {
  if (/^Digit[1-9]$/.test(code) || /^Numpad[1-9]$/.test(code)) return Number(code.at(-1)) - 1;
  return null;
}

const HOTBAR_LABELS: Readonly<Record<string, string>> = {
  axe: 'AXE',
  pickaxe: 'PICK',
  hoe: 'HOE',
  watering_can: 'WATER',
};

export function hotbarItemLabel(itemKind: string): string {
  return HOTBAR_LABELS[itemKind] ?? '--';
}

export function cycleHotbarSlot(current: number, direction: -1 | 1): number {
  return (Math.max(0, Math.min(8, current)) + direction + 9) % 9;
}

export function harvestPrompt(resource: TargetableResource | null, selectedItem: string): string | null {
  if (resource === null) return null;
  if (resource.kind === 'tree' && selectedItem === 'axe') return '[E] CHOP TREE';
  if (resource.kind === 'tree') return 'SELECT AXE TO CHOP';
  return 'NO TOOL FOR THIS RESOURCE';
}
