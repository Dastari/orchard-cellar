import { BOOTSTRAP_WORLD_POLICY_BALANCE } from './world-policy-balance.js';
import type { ContentRegistry } from './content/registry.js';
import type { ObjectContentDefinition } from './content/object-definition.js';
import { resolveObjectCollision } from './content/object-collision.js';
import type { StateValue } from './behaviour/effects.js';
import type { CraftingStation } from './recipes.js';

export type PlaceableKind = string;

export interface PlaceableDefinition {
  readonly blocksMovement: boolean;
  readonly slotCapacity: number;
  readonly station: CraftingStation | null;
  readonly light: 'flame' | null;
  readonly connectsFence: boolean;
}

export interface PlaceableContentReference {
  readonly kind: string;
  readonly definitionId?: string;
}

function itemDefinitionId(kind: string): string {
  return kind.startsWith('item:') ? kind : `item:${kind}`;
}

/** Resolves new rows by their durable object id and pre-schema rows by the
 * authored placement item. The fallback deliberately does not assume that
 * object and item ids share a suffix. */
export function placeableObjectDefinition(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: string | PlaceableContentReference,
): ObjectContentDefinition | null {
  const kind = typeof reference === 'string' ? reference : reference.kind;
  const storedId = typeof reference === 'string' ? '' : reference.definitionId?.trim() ?? '';
  if (storedId.length > 0) {
    const exact = registry.objects.get(storedId);
    return exact !== undefined && exact.retired !== true ? exact : null;
  }
  const itemId = itemDefinitionId(kind);
  return [...registry.objects.values()].find((candidate) => candidate.retired !== true
    && candidate.components.placement?.item === itemId) ?? null;
}

function stationFromTags(tags: readonly string[]): PlaceableDefinition['station'] {
  if (tags.includes('station.workbench')) return 'workbench';
  if (tags.includes('station.furnace')) return 'furnace';
  if (tags.includes('station.anvil')) return 'anvil';
  return tags.includes('station.campfire') ? 'campfire' : null;
}

export function runtimePlaceableDefinition(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: string | PlaceableContentReference,
): PlaceableDefinition | null {
  const object = placeableObjectDefinition(registry, reference);
  if (object === null) return null;
  const tags = object.components.identity?.tags ?? [];
  return {
    blocksMovement: object.components.collision?.blocksMovement ?? false,
    slotCapacity: object.components.container?.slotCount ?? 0,
    station: stationFromTags(tags),
    light: object.components.light === undefined ? null : 'flame',
    connectsFence: tags.includes('build.fence'),
  };
}

export function placeableKinds(registry: Pick<ContentRegistry, 'objects'>): readonly string[] {
  return Object.freeze([...registry.objects.values()]
    .filter((definition) => definition.retired !== true && definition.components.placement !== undefined)
    .map((definition) => definition.components.placement!.item.slice('item:'.length))
    .sort((left, right) => left.localeCompare(right)));
}

/** Typed legacy columns seed old rows; authored rows use their declared state.
 * Invalid or unavailable content stays solid rather than opening a passage. */
export function runtimePlaceableBlocksMovement(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: PlaceableContentReference & { readonly open: boolean; readonly lit?: boolean; readonly stateJson?: string },
): boolean {
  const definition = placeableObjectDefinition(registry, reference);
  if (definition === null) return true;
  const collision = definition.components.collision;
  if (!definition.components.overrides?.some(override => override.collision !== undefined)) {
    if (collision?.blocksMovement !== true) return false;
    if (collision.when === undefined) return true;
  }
  const declarations = definition.components.states ?? {};
  const state: Record<string, StateValue> = Object.fromEntries(
    Object.entries(declarations).map(([name, declaration]) => [name, declaration.default]),
  );
  try {
    const decoded: unknown = JSON.parse(reference.stateJson || '{}');
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return true;
    for (const [name, value] of Object.entries(decoded)) {
      const declaration = declarations[name];
      if (declaration === undefined) return true;
      const valid = declaration.type === 'bool' ? typeof value === 'boolean'
        : declaration.type === 'enum' ? typeof value === 'string' && declaration.values.includes(value)
          : typeof value === 'number' && Number.isSafeInteger(value)
            && (declaration.min === undefined || value >= declaration.min)
            && (declaration.max === undefined || value <= declaration.max);
      if (!valid) return true;
      state[name] = value as StateValue;
    }
  } catch { return true; }
  if ((reference.definitionId?.trim() ?? '') === '') {
    if (declarations.open?.type === 'bool') state.open = reference.open;
    if (declarations.lit?.type === 'bool' && reference.lit !== undefined) state.lit = reference.lit;
  }
  return resolveObjectCollision(definition, state).blocksMovement;
}

/** Temporary simple anvil economy: one raw copper repairs the selected durable
 * item completely. Keeping this shared prevents prompts and authority drifting. */
/** Canonical purse units; the UI presents the smallest bronze unit as copper. */
export const ANVIL_REPAIR_COST_BRONZE = 5;

/** Processor capacity follows the interface tag. The fallback supports plain
 * storage/decor placeables, while a newly tagged prop needs no UI branching. */
export function runtimePlaceableSlotCapacity(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: string | PlaceableContentReference,
): number {
  return runtimePlaceableDefinition(registry, reference)?.slotCapacity ?? 0;
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
  dropPercent = BOOTSTRAP_WORLD_POLICY_BALANCE.fiberTillDropPercent,
): boolean {
  let hash = (worldSeed ^ 0x46494252) >>> 0;
  for (const part of [spaceId, tileX, tileY, Number(authorityTick & 0xffff_ffffn)]) {
    hash ^= (part + 0x9e3779b9 + (hash << 6) + (hash >>> 2)) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
    hash = (hash ^ (hash >>> 16)) >>> 0;
  }
  return hash % 100 < dropPercent;
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
