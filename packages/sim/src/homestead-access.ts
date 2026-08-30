export const HOMESTEAD_MEMBER_ROLES = ['guest', 'worker', 'builder'] as const;
export type HomesteadMemberRole = (typeof HOMESTEAD_MEMBER_ROLES)[number];
export type HomesteadEffectiveRole = HomesteadMemberRole | 'owner';

const ROLE_RANK: Readonly<Record<HomesteadEffectiveRole, number>> = {
  guest: 0,
  worker: 1,
  builder: 2,
  owner: 3,
};

export function isHomesteadMemberRole(role: string): role is HomesteadMemberRole {
  return (HOMESTEAD_MEMBER_ROLES as readonly string[]).includes(role);
}

export function homesteadRoleAtLeast(
  role: HomesteadEffectiveRole | null,
  required: HomesteadEffectiveRole,
): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[required];
}
