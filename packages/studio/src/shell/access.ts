import type { StudioMode } from '@orchard/ui';

export type StudioRole = 'owner' | 'admin' | 'content_editor' | 'support' | 'moderator';
export type StudioAccess = 'hidden' | 'read_only' | 'write';
export type StudioCapability =
  | 'publish_map' | 'publish_content' | 'operate_read' | 'player_remedy'
  | 'economy_edit' | 'moderation' | 'observe' | 'membership';

export interface StudioMembershipAuthority {
  readonly role: string;
  readonly blocked: boolean;
  readonly revokedAt: unknown;
}

export interface StudioGrantAuthority {
  readonly revokedAt: unknown;
}

const ROLE_ACCESS: Readonly<Record<StudioRole, Readonly<Record<StudioMode, StudioAccess>>>> = {
  owner: { build: 'write', author: 'write', operate: 'write', observe: 'write' },
  admin: { build: 'write', author: 'write', operate: 'write', observe: 'write' },
  content_editor: { build: 'write', author: 'write', operate: 'read_only', observe: 'read_only' },
  support: { build: 'hidden', author: 'hidden', operate: 'write', observe: 'read_only' },
  moderator: { build: 'hidden', author: 'hidden', operate: 'write', observe: 'read_only' },
};

const ROLE_CAPABILITIES: Readonly<Record<StudioRole, readonly StudioCapability[]>> = {
  owner: ['publish_map', 'publish_content', 'operate_read', 'player_remedy', 'economy_edit', 'moderation', 'observe', 'membership'],
  admin: ['publish_map', 'publish_content', 'operate_read', 'player_remedy', 'economy_edit', 'moderation', 'observe'],
  content_editor: ['publish_map', 'publish_content', 'operate_read', 'observe'],
  support: ['operate_read', 'player_remedy', 'observe'],
  moderator: ['operate_read', 'moderation', 'observe'],
};

export function isStudioRole(role: string | null): role is StudioRole {
  return role !== null && Object.hasOwn(ROLE_ACCESS, role);
}

/** Mirrors the module's effective admin-role resolution. Membership remains the
 * trust root: grants never revive a blocked, revoked, or missing membership.
 * Owner/admin membership wins; otherwise the independently revocable support
 * and content-editor views supply the Studio authority that is not representable
 * by the raw membership.role column. */
export function resolveStudioEffectiveRole(
  membership: StudioMembershipAuthority | null,
  contentEditorGrant: StudioGrantAuthority | null,
  supportGrant: StudioGrantAuthority | null,
): StudioRole | null {
  if (membership === null || membership.blocked || membership.revokedAt !== undefined) return null;
  if (membership.role === 'owner' || membership.role === 'admin') return membership.role;
  if (supportGrant !== null && supportGrant.revokedAt === undefined) return 'support';
  if (contentEditorGrant !== null && contentEditorGrant.revokedAt === undefined) return 'content_editor';
  return membership.role === 'moderator' ? 'moderator' : null;
}

/** Anonymous work is an isolated local sandbox, never live authority. */
export function studioModeAccess(role: string | null, mode: StudioMode): StudioAccess {
  if (!isStudioRole(role)) return mode === 'build' || mode === 'author' ? 'write' : 'hidden';
  return ROLE_ACCESS[role][mode];
}

export function firstAccessibleStudioMode(role: string | null): StudioMode {
  return (['build', 'author', 'operate', 'observe'] as const)
    .find((mode) => studioModeAccess(role, mode) !== 'hidden') ?? 'build';
}

export function studioRoleCan(role: string | null, capability: StudioCapability): boolean {
  return isStudioRole(role) && ROLE_CAPABILITIES[role].includes(capability);
}
