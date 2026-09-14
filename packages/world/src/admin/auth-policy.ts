import { SUPPORT_CAP_BALANCE_IDS } from '@orchard/sim';
import type { AdminOperation } from './contracts.js';

export { SUPPORT_CAP_BALANCE_IDS };

export type AdminEffectiveRole = 'owner' | 'admin' | 'content_editor' | 'support' | 'moderator' | 'friend';
export type AdminReadCapability =
  | 'players'
  | 'player_private'
  | 'entities'
  | 'audit'
  | 'connections'
  | 'telemetry'
  | 'world_validation';

export interface AdminMembershipPolicyRow {
  readonly role: string;
  readonly blocked: boolean;
  readonly revokedAt: unknown;
}

export interface AdminGrantPolicyRow {
  readonly revokedAt: unknown;
}

const SUPPORT_OPERATIONS = new Set<AdminOperation>([
  'set_wallet',
  'set_stats',
  'set_vitals',
  'grant_skill_points',
  'set_quest_state',
  'reset_quests',
  'give_items',
  'remove_items',
  'clear_cursor',
  'drain_overflow',
  'set_slot',
  'set_spawn',
  'respawn',
  'unstick',
  'teleport_player',
  'set_display_name',
  'notify',
  'restore_missing_container',
  'undo',
]);

const MODERATOR_OPERATIONS = new Set<AdminOperation>(['kick', 'notify']);

export function activeAdminMembership(row: AdminMembershipPolicyRow | null): row is AdminMembershipPolicyRow {
  return row !== null && !row.blocked && row.revokedAt === undefined;
}

export function activeAdminGrant(row: AdminGrantPolicyRow | null): row is AdminGrantPolicyRow {
  return row !== null && row.revokedAt === undefined;
}

/** Membership authority wins over capability grants. Grants are useful only
 * for active members and never bypass a block or revocation. */
export function resolveAdminEffectiveRole(
  membership: AdminMembershipPolicyRow | null,
  contentEditorGrant: AdminGrantPolicyRow | null,
  supportGrant: AdminGrantPolicyRow | null,
): AdminEffectiveRole | null {
  if (!activeAdminMembership(membership)) return null;
  if (membership.role === 'owner' || membership.role === 'admin') return membership.role;
  if (activeAdminGrant(supportGrant)) return 'support';
  if (activeAdminGrant(contentEditorGrant)) return 'content_editor';
  if (membership.role === 'moderator') return 'moderator';
  return membership.role === 'friend' ? 'friend' : null;
}

export function adminRoleCanRead(role: AdminEffectiveRole, capability: AdminReadCapability): boolean {
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'content_editor' || role === 'support') return true;
  if (role === 'moderator') return capability === 'audit' || capability === 'connections';
  return false;
}

export function adminRoleCanMutate(role: AdminEffectiveRole, operation: AdminOperation): boolean {
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'support') return SUPPORT_OPERATIONS.has(operation);
  if (role === 'moderator') return MODERATOR_OPERATIONS.has(operation);
  return false;
}
