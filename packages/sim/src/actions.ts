import { isDurableToolKind } from './durability.js';

export interface AvatarActionDefinition {
  readonly playback: 'oneShot' | 'loop';
  readonly interruptibleByMovement: boolean;
  readonly equippedKind?: string;
}

export const AVATAR_ACTIONS = {
  swing_axe: { playback: 'oneShot', interruptibleByMovement: false, equippedKind: 'axe' },
  swing_pickaxe: { playback: 'oneShot', interruptibleByMovement: false, equippedKind: 'pickaxe' },
  swing_hoe: { playback: 'oneShot', interruptibleByMovement: false, equippedKind: 'hoe' },
  water: { playback: 'oneShot', interruptibleByMovement: false, equippedKind: 'watering_can' },
  ranged_weapon: { playback: 'oneShot', interruptibleByMovement: false, equippedKind: 'bow' },
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

/** Ammunition requirements live beside the equipment-to-action registry so
 * future ranged tools cannot accidentally add animation without the matching
 * inventory gate. */
const REQUIRED_AMMUNITION = {
  bow: 'arrow',
} as const satisfies Readonly<Record<string, string>>;

/** Shared presentation readiness. Authority must still repeat these checks,
 * but clients use this before starting an optimistic animation or sound. */
export function itemActionRejection(
  equipped: ActionInventoryStack | null | undefined,
  inventory: Iterable<ActionInventoryStack>,
): ItemActionRejection | null {
  if (equipped === null || equipped === undefined || equipped.quantity < 1) return null;
  if (isDurableToolKind(equipped.itemKind) && equipped.durability === 0) return 'tool_broken';
  const ammunition = REQUIRED_AMMUNITION[equipped.itemKind as keyof typeof REQUIRED_AMMUNITION];
  if (ammunition !== undefined) {
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
  for (const [kind, definition] of Object.entries(AVATAR_ACTIONS)) {
    if ('equippedKind' in definition && definition.equippedKind === equippedKind) {
      return kind as AvatarActionKind;
    }
  }
  return null;
}

export function avatarActionAfterMovement(kind: string, moved: boolean): string {
  const definition = avatarActionDefinition(kind);
  return moved && definition?.playback === 'loop' && definition.interruptibleByMovement ? 'none' : kind;
}
