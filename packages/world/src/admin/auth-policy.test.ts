import { describe, expect, it } from 'vitest';
import { ADMIN_ERROR_CODES, type AdminOperation } from './contracts.js';
import {
  SUPPORT_CAP_BALANCE_IDS,
  adminRoleCanMutate,
  adminRoleCanRead,
  resolveAdminEffectiveRole,
  type AdminEffectiveRole,
  type AdminReadCapability,
} from './auth-policy.js';

const active = (role: string) => ({ role, blocked: false, revokedAt: undefined });
const grant = { revokedAt: undefined };

describe('Studio administration role policy', () => {
  it('never lets a capability grant bypass membership blocks or revocation', () => {
    expect(resolveAdminEffectiveRole(null, grant, grant)).toBeNull();
    expect(resolveAdminEffectiveRole({ role: 'friend', blocked: true, revokedAt: undefined }, grant, grant)).toBeNull();
    expect(resolveAdminEffectiveRole({ role: 'friend', blocked: false, revokedAt: 1 }, grant, grant)).toBeNull();
    expect(resolveAdminEffectiveRole(active('friend'), grant, null)).toBe('content_editor');
    expect(resolveAdminEffectiveRole(active('friend'), grant, grant)).toBe('support');
    expect(resolveAdminEffectiveRole(active('owner'), grant, grant)).toBe('owner');
  });

  it('applies the exact read matrix', () => {
    const capabilities: readonly AdminReadCapability[] = [
      'players', 'player_private', 'entities', 'audit', 'connections', 'telemetry', 'world_validation',
    ];
    for (const role of ['owner', 'admin', 'content_editor', 'support'] as const) {
      expect(capabilities.map((capability) => adminRoleCanRead(role, capability))).toEqual(capabilities.map(() => true));
    }
    expect(capabilities.filter((capability) => adminRoleCanRead('moderator', capability)))
      .toEqual(['audit', 'connections']);
    expect(capabilities.some((capability) => adminRoleCanRead('friend', capability))).toBe(false);
  });

  it('keeps support remedies and moderator actions narrower than administrator authority', () => {
    const operations: readonly AdminOperation[] = [
      'set_wallet', 'set_stats', 'set_vitals', 'grant_skill_points', 'reset_skill_tree',
      'set_quest_state', 'reset_quests', 'give_items', 'remove_items', 'clear_cursor',
      'drain_overflow', 'set_slot', 'set_spawn', 'respawn', 'unstick', 'teleport_player',
      'set_display_name', 'kick', 'notify', 'spawn_entity', 'despawn_entity', 'move_entity',
      'set_entity_state', 'set_container_slot', 'repair_entity', 'replace_entity',
      'relocate_npc', 'respawn_resources', 'set_space_flags', 'repair_portal_pair',
      'run_world_repair', 'restore_missing_container', 'undo',
    ];
    for (const role of ['owner', 'admin'] as const) {
      expect(operations.every((operation) => adminRoleCanMutate(role, operation))).toBe(true);
    }
    expect(adminRoleCanMutate('support', 'give_items')).toBe(true);
    expect(adminRoleCanMutate('support', 'set_wallet')).toBe(true);
    expect(adminRoleCanMutate('support', 'set_stats')).toBe(true);
    expect(adminRoleCanMutate('support', 'grant_skill_points')).toBe(true);
    expect(adminRoleCanMutate('support', 'teleport_player')).toBe(true);
    expect(adminRoleCanMutate('support', 'restore_missing_container')).toBe(true);
    expect(adminRoleCanMutate('support', 'reset_skill_tree')).toBe(false);
    expect(adminRoleCanMutate('support', 'kick')).toBe(false);
    expect(adminRoleCanMutate('support', 'spawn_entity')).toBe(false);
    expect(operations.filter((operation) => adminRoleCanMutate('moderator', operation)))
      .toEqual(['kick', 'notify']);
    expect(adminRoleCanMutate('moderator', 'restore_missing_container')).toBe(false);
    expect(adminRoleCanMutate('content_editor', 'restore_missing_container')).toBe(false);
    expect(operations.some((operation) => adminRoleCanMutate('content_editor', operation))).toBe(false);
  });

  it('pins all support cap sources to balance definition ids', () => {
    expect(Object.values(SUPPORT_CAP_BALANCE_IDS)).toHaveLength(6);
    expect(Object.values(SUPPORT_CAP_BALANCE_IDS).every((id) => id.startsWith('balance:admin_support_'))).toBe(true);
    expect(ADMIN_ERROR_CODES).toContain('admin_support_cap_exceeded');
    const roles: readonly AdminEffectiveRole[] = ['owner', 'admin', 'content_editor', 'support', 'moderator', 'friend'];
    expect(roles).toHaveLength(6);
  });
});
