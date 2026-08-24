export const OIDC_ISSUER = 'https://auth.spacetimedb.com/oidc';

/**
 * Add the public SpacetimeAuth client ID used by the deployed browser build,
 * then republish the module. An empty list is the intentional local-development
 * mode and continues to allow host-issued identities.
 */
export const OIDC_CLIENT_IDS: readonly string[] = [];

export interface JwtIdentityClaims {
  readonly issuer: string;
  readonly audience: readonly string[];
}

export function authenticationRejection(
  jwt: JwtIdentityClaims | null,
  clientIds = OIDC_CLIENT_IDS,
  issuer = OIDC_ISSUER,
): string | null {
  if (clientIds.length === 0) return null;
  if (jwt === null) return 'authentication_required';
  if (jwt.issuer !== issuer) return 'authentication_invalid_issuer';
  if (!jwt.audience.some((audience) => clientIds.includes(audience))) return 'authentication_invalid_audience';
  return null;
}
