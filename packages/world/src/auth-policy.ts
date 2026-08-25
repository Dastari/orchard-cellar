export const OIDC_ISSUER = 'https://auth.orchard.dastari.net/realms/orchard';

/**
 * Production deployment gate. Keep this empty until the owner's OIDC-derived
 * SpaceTimeDB identity has been captured, approved, and backed up. The release
 * procedure then sets this to ['orchard-web'] and republishes the module.
 */
export const OIDC_CLIENT_IDS: readonly string[] = ['orchard-web'];

/**
 * Production deployment gate. Add only the owner's captured SpaceTimeDB
 * identity (hex), never an email address, display name, or raw OIDC claim.
 */
export const BOOTSTRAP_OWNER_IDENTITIES: readonly string[] = [
  'c20058849873441b3f59477e064818ce70ab5d3646ba5de1e6231b7278aaa291',
];

export interface JwtIdentityClaims {
  readonly issuer: string;
  readonly audience: readonly string[];
}

export interface MembershipState {
  readonly role: string;
  readonly revoked: boolean;
  readonly blocked: boolean;
}

export type MembershipRole = 'owner' | 'moderator' | 'friend';

export function productionAuthEnabled(clientIds = OIDC_CLIENT_IDS): boolean {
  return clientIds.length > 0;
}

export function authenticationRejection(
  jwt: JwtIdentityClaims | null,
  clientIds = OIDC_CLIENT_IDS,
  issuer = OIDC_ISSUER,
): string | null {
  if (!productionAuthEnabled(clientIds)) return null;
  if (jwt === null) return 'authentication_required';
  if (jwt.issuer !== issuer) return 'authentication_invalid_issuer';
  if (!jwt.audience.some((audience) => clientIds.includes(audience))) return 'authentication_invalid_audience';
  return null;
}

/**
 * A successfully authenticated first connection becomes a regular player. This
 * deliberately never provisions local/anonymous development identities, and it
 * does not replace or restore an existing membership row.
 */
export function automaticRegistrationRole(
  jwt: JwtIdentityClaims | null,
  hasMembership: boolean,
  clientIds = OIDC_CLIENT_IDS,
  issuer = OIDC_ISSUER,
): MembershipRole | null {
  if (!productionAuthEnabled(clientIds) || hasMembership) return null;
  return authenticationRejection(jwt, clientIds, issuer) === null ? 'friend' : null;
}

export function membershipRejection(
  membership: MembershipState | null,
  enforce = productionAuthEnabled(),
): string | null {
  if (!enforce) return null;
  if (membership === null) return 'membership_required';
  if (membership.blocked) return 'membership_blocked';
  if (membership.revoked) return 'membership_revoked';
  if (!membershipRole(membership.role)) return 'membership_invalid_role';
  return null;
}

export function membershipRole(role: string): role is MembershipRole {
  return role === 'owner' || role === 'moderator' || role === 'friend';
}

export function canManageMembership(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'owner') return membershipRole(targetRole);
  return actorRole === 'moderator' && targetRole === 'friend';
}

export function canAdministerWorld(role: string): boolean {
  return role === 'owner';
}
