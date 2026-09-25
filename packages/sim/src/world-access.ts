export const WORLD_MEMBERSHIP_ROLES = [
  'owner',
  'admin',
  'moderator',
  'friend',
] as const;

export type WorldMembershipRole = (typeof WORLD_MEMBERSHIP_ROLES)[number];

/** Shared presentation and authority policy for world-level administration. */
export function canAdministerWorld(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** Strict world-owner policy for switches that admins must not flip, such as
 * the static-world chunkAuthority mode. Unlike canAdministerWorld, an admin
 * role is rejected. */
export function isWorldOwnerRole(role: string | null | undefined): boolean {
  return role === 'owner';
}
