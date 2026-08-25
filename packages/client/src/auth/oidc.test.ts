import { describe, expect, it } from 'vitest';
import {
  decodeJwtClaims,
  readOidcSession,
  validateIdTokenClaims,
  type OidcSession,
} from './oidc.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function jwt(claims: object): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return `${encode({ alg: 'none' })}.${encode(claims)}.`;
}

describe('OIDC browser session', () => {
  it('decodes identity claims without treating them as verified authorization', () => {
    expect(decodeJwtClaims(jwt({ sub: 'user_1', preferred_username: 'Farmer' }))).toMatchObject({
      sub: 'user_1', preferred_username: 'Farmer',
    });
    expect(decodeJwtClaims('not-a-jwt')).toBeNull();
  });

  it('returns only unexpired session-scoped credentials', () => {
    const storage = new MemoryStorage();
    const session: OidcSession = {
      idToken: jwt({ sub: 'user_1' }), refreshToken: null, expiresAt: 200_000,
      subject: 'user_1', displayName: 'Farmer', emailVerified: false, issuer: 'https://issuer.example',
    };
    storage.setItem('orchard:oidc:session:v1', JSON.stringify(session));
    expect(readOidcSession(storage, 100_000)).toEqual(session);
    expect(readOidcSession(storage, 180_000)).toBeNull();
  });

  it('pins Keycloak issuer, audience, authorized party, nonce, and expiry', () => {
    const issuer = 'https://auth.orchard.dastari.net/realms/orchard';
    const valid = { iss: issuer, sub: 'user_1', exp: 200, nonce: 'nonce_1', aud: 'orchard-web' };
    expect(() => validateIdTokenClaims(valid, 'nonce_1', 100_000, issuer, 'orchard-web')).not.toThrow();
    expect(() => validateIdTokenClaims({ ...valid, iss: 'https://wrong.example' }, 'nonce_1', 100_000, issuer, 'orchard-web'))
      .toThrow('unexpected issuer');
    expect(() => validateIdTokenClaims({ ...valid, aud: 'other' }, 'nonce_1', 100_000, issuer, 'orchard-web'))
      .toThrow('not issued for this game');
    expect(() => validateIdTokenClaims({ ...valid, exp: 99 }, 'nonce_1', 100_000, issuer, 'orchard-web'))
      .toThrow('already expired');
  });

  it('accepts multiple audiences only when azp names the browser client', () => {
    const issuer = 'https://auth.orchard.dastari.net/realms/orchard';
    const claims = { iss: issuer, sub: 'user_1', exp: 200, aud: ['account', 'orchard-web'] };
    expect(() => validateIdTokenClaims({ ...claims, azp: 'orchard-web' }, undefined, 100_000, issuer, 'orchard-web'))
      .not.toThrow();
    expect(() => validateIdTokenClaims({ ...claims, azp: 'other' }, undefined, 100_000, issuer, 'orchard-web'))
      .toThrow('different browser client');
  });
});
