export interface AvatarActionDefinition {
  readonly playback: 'oneShot' | 'loop';
  readonly interruptibleByMovement: boolean;
  readonly equippedKind?: string;
}

export const AVATAR_ACTIONS = {
  swing_axe: { playback: 'oneShot', interruptibleByMovement: false, equippedKind: 'axe' },
  pickup: { playback: 'oneShot', interruptibleByMovement: false },
  drop: { playback: 'oneShot', interruptibleByMovement: false },
  fishing_wait: { playback: 'loop', interruptibleByMovement: true },
  sitting: { playback: 'loop', interruptibleByMovement: true },
} as const satisfies Readonly<Record<string, AvatarActionDefinition>>;

export type AvatarActionKind = keyof typeof AVATAR_ACTIONS;

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
