export interface AvatarActionDefinition {
  readonly playback: 'oneShot' | 'loop';
  readonly interruptibleByMovement: boolean;
}

export const AVATAR_ACTIONS = {
  swing_axe: { playback: 'oneShot', interruptibleByMovement: false },
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

export function avatarActionAfterMovement(kind: string, moved: boolean): string {
  const definition = avatarActionDefinition(kind);
  return moved && definition?.playback === 'loop' && definition.interruptibleByMovement ? 'none' : kind;
}
