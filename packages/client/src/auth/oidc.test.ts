import { describe, expect, it } from 'vitest';
import { decodeJwtClaims, readOidcSession, type OidcSession } from './oidc.js';

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
      subject: 'user_1', displayName: 'Farmer', issuer: 'https://issuer.example',
    };
    storage.setItem('orchard:oidc:session:v1', JSON.stringify(session));
    expect(readOidcSession(storage, 100_000)).toEqual(session);
    expect(readOidcSession(storage, 180_000)).toBeNull();
  });
});
