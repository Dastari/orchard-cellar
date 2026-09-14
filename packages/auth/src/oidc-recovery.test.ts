import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOidcJson, OIDC_REQUEST_TIMEOUT_MS } from './oidc-fetch.js';

vi.mock('./oidc-token.js', async (original) => ({
  ...await original<typeof import('./oidc-token.js')>(),
  verifyIdTokenSignature: vi.fn(async () => undefined),
}));

const key = 'orchard:oidc:session:v1';
const issuer = 'https://auth.orchard.dastari.net/realms/orchard';
class MemoryStorage {
  private values = new Map<string, string>();
  getItem(name: string): string | null { return this.values.get(name) ?? null; }
  setItem(name: string, value: string): void { this.values.set(name, value); }
  removeItem(name: string): void { this.values.delete(name); }
}
const expired = {
  idToken: 'expired-original', refreshToken: 'original-refresh', expiresAt: 90_000,
  subject: 'original-player', issuer, displayName: 'Farmer', emailVerified: true,
};
function token(subject = expired.subject, tokenIssuer = issuer): string {
  return `${btoa(JSON.stringify({ alg: 'RS256', kid: 'test' }))}.${btoa(JSON.stringify({
    iss: tokenIssuer, sub: subject, aud: 'orchard-web', exp: 1_000,
  }))}.test`;
}
function stored(): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem(key, JSON.stringify(expired));
  return storage;
}
function fetchWithTokenResponse(response: () => Promise<Response>) {
  return vi.fn(async (url: string) => url.endsWith('/.well-known/openid-configuration')
    ? Response.json({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/keys` })
    : response());
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_OIDC_CLIENT_ID', 'orchard-web');
  vi.spyOn(Date, 'now').mockReturnValue(100_000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('account refresh recovery', () => {
  for (const failure of ['offline', 'unavailable'] as const) {
    it(`retains saved identity and refresh credential after ${failure}`, async () => {
      const auth = await import('./oidc.js');
      const storage = stored();
      const before = storage.getItem(key);
      vi.stubGlobal('fetch', fetchWithTokenResponse(async () => {
        if (failure === 'offline') throw new TypeError('network unavailable');
        return new Response('unavailable', { status: 503 });
      }));
      await expect(auth.ensureOidcSession(storage)).rejects.toBeInstanceOf(auth.OidcSessionRecoveryError);
      expect(storage.getItem(key)).toBe(before);
      vi.stubGlobal('fetch', fetchWithTokenResponse(async () => Response.json({ id_token: token(), refresh_token: 'rotated' })));
      await expect(auth.ensureOidcSession(storage)).resolves.toMatchObject({ subject: expired.subject, refreshToken: 'rotated' });
    });
  }

  it('shares one rotating refresh request between concurrent callers', async () => {
    const auth = await import('./oidc.js');
    const storage = stored();
    const fetch = fetchWithTokenResponse(async () => Response.json({ id_token: token(), refresh_token: 'rotated' }));
    vi.stubGlobal('fetch', fetch);
    const first = auth.ensureOidcSession(storage);
    const second = auth.ensureOidcSession(storage);
    expect(second).toBe(first);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/token'))).toHaveLength(1);
  });

  it('retains a rotated refresh credential if signing-key retrieval fails after token issuance', async () => {
    const auth = await import('./oidc.js');
    const { verifyIdTokenSignature } = await import('./oidc-token.js');
    vi.mocked(verifyIdTokenSignature).mockRejectedValueOnce(new auth.OidcSessionRecoveryError());
    const storage = stored();
    vi.stubGlobal('fetch', fetchWithTokenResponse(async () => Response.json({ id_token: token(), refresh_token: 'rotated' })));
    await expect(auth.ensureOidcSession(storage)).rejects.toBeInstanceOf(auth.OidcSessionRecoveryError);
    expect(JSON.parse(storage.getItem(key)!)).toEqual({ ...expired, refreshToken: 'rotated' });
    expect(auth.readOidcSession(storage)).toBeNull();
    await expect(auth.ensureOidcSession(storage)).resolves.toMatchObject({ subject: expired.subject, refreshToken: 'rotated' });
  });

  it('clears a terminal invalid_grant and requires the existing account sign-in flow', async () => {
    const auth = await import('./oidc.js');
    const storage = stored();
    vi.stubGlobal('fetch', fetchWithTokenResponse(async () => Response.json({ error: 'invalid_grant' }, { status: 400 })));
    await expect(auth.ensureOidcSession(storage)).resolves.toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  for (const mismatch of ['subject', 'issuer'] as const) {
    it(`rejects a refreshed ${mismatch} change`, async () => {
      const auth = await import('./oidc.js');
      const storage = stored();
      vi.stubGlobal('fetch', fetchWithTokenResponse(async () => Response.json({
        id_token: token(mismatch === 'subject' ? 'different-player' : expired.subject,
          mismatch === 'issuer' ? 'https://wrong.example' : issuer),
      })));
      await expect(auth.ensureOidcSession(storage)).resolves.toBeNull();
      expect(storage.getItem(key)).toBeNull();
    });
  }

  it('does not restore a session cleared while refresh was in flight', async () => {
    const auth = await import('./oidc.js');
    const storage = stored();
    vi.stubGlobal('fetch', fetchWithTokenResponse(async () => {
      auth.clearOidcSession(storage);
      return Response.json({ id_token: token(), refresh_token: 'rotated' });
    }));
    await expect(auth.ensureOidcSession(storage)).resolves.toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it('bounds stalled response bodies and aborts the request', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      signal = init.signal;
      return { ok: true, status: 200, json: () => new Promise(() => undefined) };
    }));
    const request = fetchOidcJson(`${issuer}/keys`, {});
    const rejected = expect(request).rejects.toMatchObject({ name: 'OidcSessionRecoveryError' });
    await vi.advanceTimersByTimeAsync(OIDC_REQUEST_TIMEOUT_MS);
    await rejected;
    expect(signal?.aborted).toBe(true);
  });

  it('restores the peer responder after each BFCache pageshow without duplicating it', async () => {
    const channels: { close: ReturnType<typeof vi.fn> }[] = [];
    class FakeChannel extends EventTarget {
      close = vi.fn();
      postMessage = vi.fn();
      constructor() { super(); channels.push(this); }
    }
    const window = new EventTarget();
    vi.stubGlobal('window', window);
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    await import('./oidc.js');
    expect(channels).toHaveLength(1);
    window.dispatchEvent(new Event('pagehide'));
    expect(channels[0]?.close).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('pageshow'));
    expect(channels).toHaveLength(2);
    window.dispatchEvent(new Event('pagehide'));
    expect(channels[1]?.close).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('pageshow'));
    expect(channels).toHaveLength(3);
  });
});
