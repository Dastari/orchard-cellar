import { bootstrapDefinitionsOfKind } from './content/bootstrap-pack-loader.js';

export interface AvatarActionDefinition {
  readonly playback: 'oneShot' | 'loop';
  readonly interruptibleByMovement: boolean;
}

export const AVATAR_ACTIONS = {
  swing_axe: { playback: 'oneShot', interruptibleByMovement: false },
  swing_sword: { playback: 'oneShot', interruptibleByMovement: false },
  swing_pickaxe: { playback: 'oneShot', interruptibleByMovement: false },
  swing_hoe: { playback: 'oneShot', interruptibleByMovement: false },
  water: { playback: 'oneShot', interruptibleByMovement: false },
  ranged_weapon: { playback: 'oneShot', interruptibleByMovement: false },
  fish_cast: { playback: 'oneShot', interruptibleByMovement: true },
  fish_reel: { playback: 'oneShot', interruptibleByMovement: true },
  jump: { playback: 'oneShot', interruptibleByMovement: false },
  pickup: { playback: 'oneShot', interruptibleByMovement: false },
  drop: { playback: 'oneShot', interruptibleByMovement: false },
  fishing_wait: { playback: 'loop', interruptibleByMovement: true },
  sitting: { playback: 'loop', interruptibleByMovement: true },
} as const satisfies Readonly<Record<string, AvatarActionDefinition>>;

export type AvatarActionKind = keyof typeof AVATAR_ACTIONS;

export interface ActionInventoryStack {
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
}

export type ItemActionRejection = 'tool_broken' | 'out_of_arrows';

export type AmmunitionResolver = (itemKind: string) => string | null;
export type DurabilityResolver = (itemKind: string) => boolean;

/** Compatibility presentation resolver. Live clients bind the same lookup to
 * their subscribed registry revision instead. */
function bootstrapRequiredAmmunition(itemKind: string): string | null {
  const ammunition = bootstrapDefinitionsOfKind('item').find(({ id }) => id === `item:${itemKind}`)?.ranged?.ammunition;
  return ammunition?.slice('item:'.length) ?? null;
}

function bootstrapIsDurable(itemKind: string): boolean {
  return bootstrapDefinitionsOfKind('item')
    .some(({ id, durability, retired }) => id === `item:${itemKind}` && durability !== undefined && retired !== true);
}

/** Shared presentation readiness. Authority must still repeat these checks,
 * but clients use this before starting an optimistic animation or sound. */
export function itemActionRejection(
  equipped: ActionInventoryStack | null | undefined,
  inventory: Iterable<ActionInventoryStack>,
  ammunitionFor: AmmunitionResolver = bootstrapRequiredAmmunition,
  isDurable: DurabilityResolver = bootstrapIsDurable,
): ItemActionRejection | null {
  if (equipped === null || equipped === undefined || equipped.quantity < 1) return null;
  if (isDurable(equipped.itemKind) && equipped.durability === 0) return 'tool_broken';
  const ammunition = ammunitionFor(equipped.itemKind);
  if (ammunition !== null) {
    for (const stack of inventory) {
      if (stack.itemKind === ammunition && stack.quantity > 0) return null;
    }
    return 'out_of_arrows';
  }
  return null;
}

export function avatarActionDefinition(kind: string): AvatarActionDefinition | null {
  return Object.prototype.hasOwnProperty.call(AVATAR_ACTIONS, kind)
    ? AVATAR_ACTIONS[kind as AvatarActionKind]
    : null;
}

export function isAvatarActionKind(kind: string): kind is AvatarActionKind {
  return avatarActionDefinition(kind) !== null;
}

export function avatarActionForEquippedKind(equippedKind: string): AvatarActionKind | null {
  const action = bootstrapDefinitionsOfKind('item').find(({ id }) => id === `item:${equippedKind}`)?.equip?.avatarAction;
  return action !== undefined && isAvatarActionKind(action) ? action : null;
}

export function avatarActionAfterMovement(kind: string, moved: boolean): string {
  const definition = avatarActionDefinition(kind);
  return moved && definition?.playback === 'loop' && definition.interruptibleByMovement ? 'none' : kind;
}
