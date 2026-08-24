import { describe, expect, it } from 'vitest';
import { authenticationRejection } from './auth-policy.js';

describe('SpaceTimeDB OIDC admission policy', () => {
  const clientIds = ['client_orchard'];
  const issuer = 'https://auth.spacetimedb.com/oidc';

  it('allows host-issued identities only in explicit development mode', () => {
    expect(authenticationRejection(null, [])).toBeNull();
    expect(authenticationRejection(null, clientIds, issuer)).toBe('authentication_required');
  });

  it('pins both issuer and audience', () => {
    expect(authenticationRejection({ issuer: 'https://wrong.example', audience: clientIds }, clientIds, issuer)).toBe('authentication_invalid_issuer');
    expect(authenticationRejection({ issuer, audience: ['client_other'] }, clientIds, issuer)).toBe('authentication_invalid_audience');
    expect(authenticationRejection({ issuer, audience: ['client_other', 'client_orchard'] }, clientIds, issuer)).toBeNull();
  });
});
