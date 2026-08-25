import { describe, expect, it } from 'vitest';
import {
  OIDC_ISSUER,
  authenticationRejection,
  automaticRegistrationRole,
  canAdministerWorld,
  canManageMembership,
  membershipRejection,
} from './auth-policy.js';

describe('SpaceTimeDB OIDC admission policy (24 §5)', () => {
  const clientIds = ['orchard-web'];

  it('allows host-issued identities only while the deployment gate is explicitly open', () => {
    expect(authenticationRejection(null, [])).toBeNull();
    expect(authenticationRejection(null, clientIds, OIDC_ISSUER)).toBe('authentication_required');
  });

  it('accepts the exact Keycloak issuer and configured audience', () => {
    expect(authenticationRejection({ issuer: OIDC_ISSUER, audience: clientIds }, clientIds, OIDC_ISSUER)).toBeNull();
  });

  it('accepts a multiple-audience ID token containing the browser client', () => {
    expect(authenticationRejection({
      issuer: OIDC_ISSUER,
      audience: ['account', 'orchard-web'],
    }, clientIds, OIDC_ISSUER)).toBeNull();
  });

  it('rejects wrong issuer and wrong audience without reflecting claims', () => {
    expect(authenticationRejection({ issuer: 'https://wrong.example', audience: clientIds }, clientIds, OIDC_ISSUER))
      .toBe('authentication_invalid_issuer');
    expect(authenticationRejection({ issuer: OIDC_ISSUER, audience: ['client_other'] }, clientIds, OIDC_ISSUER))
      .toBe('authentication_invalid_audience');
  });
});

describe('friends-only membership policy (09 §2, 24 §7)', () => {
  it('auto-provisions a valid first-time OIDC identity as a friend', () => {
    const validJwt = { issuer: OIDC_ISSUER, audience: ['orchard-web'] };
    expect(automaticRegistrationRole(validJwt, false, ['orchard-web'])).toBe('friend');
    expect(automaticRegistrationRole(validJwt, true, ['orchard-web'])).toBeNull();
  });

  it('never auto-provisions anonymous, invalid, or local-development identities', () => {
    expect(automaticRegistrationRole(null, false, ['orchard-web'])).toBeNull();
    expect(automaticRegistrationRole({
      issuer: 'https://wrong.example',
      audience: ['orchard-web'],
    }, false, ['orchard-web'])).toBeNull();
    expect(automaticRegistrationRole({
      issuer: OIDC_ISSUER,
      audience: ['orchard-web'],
    }, false, [])).toBeNull();
  });

  it('rejects missing, revoked, and blocked membership at authorization boundaries', () => {
    expect(membershipRejection(null, true)).toBe('membership_required');
    expect(membershipRejection({ role: 'friend', revoked: true, blocked: false }, true)).toBe('membership_revoked');
    expect(membershipRejection({ role: 'friend', revoked: false, blocked: true }, true)).toBe('membership_blocked');
  });

  it('accepts active members and leaves local development permissive', () => {
    expect(membershipRejection({ role: 'friend', revoked: false, blocked: false }, true)).toBeNull();
    expect(membershipRejection(null, false)).toBeNull();
  });

  it('limits moderators to managing friends while owners may manage every valid role', () => {
    expect(canManageMembership('moderator', 'friend')).toBe(true);
    expect(canManageMembership('moderator', 'moderator')).toBe(false);
    expect(canManageMembership('friend', 'friend')).toBe(false);
    expect(canManageMembership('owner', 'moderator')).toBe(true);
  });

  it('reserves world date, time, and weather controls for owners', () => {
    expect(canAdministerWorld('owner')).toBe(true);
    expect(canAdministerWorld('moderator')).toBe(false);
    expect(canAdministerWorld('friend')).toBe(false);
  });
});
