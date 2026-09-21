import { describe, expect, it, vi } from 'vitest';
import type { OidcSession } from '@orchard/auth';
import {
  completeStudioOidcCallback,
  prepareStudioOidcConnection,
  resumeStudioOidcSession,
  type StudioAuthBrowser,
  type StudioAuthDependencies,
} from './auth.js';

const SESSION: OidcSession = Object.freeze({
  idToken: 'studio-token', refreshToken: null, expiresAt: 10_000,
  subject: 'studio-user', displayName: 'Studio User', emailVerified: true,
  issuer: 'https://auth.orchard.dastari.net/realms/orchard',
});

function harness(patch: Partial<StudioAuthBrowser> = {}, dependencyPatch: Partial<StudioAuthDependencies> = {}) {
  const replaceHistory = vi.fn();
  const completeCallback = vi.fn(async () => SESSION);
  const ensureSession = vi.fn(async (): Promise<OidcSession | null> => SESSION);
  const beginLogin = vi.fn(async () => undefined);
  const auth: StudioAuthBrowser = {
    origin: 'https://cellar.dastari.net', pathname: '/', search: '', hash: '', replaceHistory,
    ...patch,
  };
  const deps: StudioAuthDependencies = {
    configured: true,
    localProfilesEnabled: false,
    redirectUri: () => 'https://cellar.dastari.net/',
    hasCallback: (search) => new URLSearchParams(search).has('code') || new URLSearchParams(search).has('error'),
    completeCallback, ensureSession, beginLogin,
    ...dependencyPatch,
  };
  return { auth, deps, replaceHistory, completeCallback, ensureSession, beginLogin };
}

describe('Studio exact-origin OIDC lifecycle', () => {
  it('completes and scrubs a callback before a live connection can resume', async () => {
    const value = harness({ search: '?code=accepted&state=studio-state', hash: '#route' });
    await expect(completeStudioOidcCallback(value.auth, value.deps)).resolves.toBe(true);
    expect(value.completeCallback).toHaveBeenCalledWith('?code=accepted&state=studio-state');
    expect(value.replaceHistory).toHaveBeenCalledWith('/#route');
    expect(value.ensureSession).not.toHaveBeenCalled();
    expect(value.beginLogin).not.toHaveBeenCalled();
  });

  it('scrubs rejected callback parameters and never accepts a cross-origin redirect', async () => {
    const rejected = harness({ search: '?error=access_denied&state=studio-state' }, {
      completeCallback: vi.fn(async () => { throw new Error('cancelled'); }),
    });
    await expect(completeStudioOidcCallback(rejected.auth, rejected.deps)).rejects.toThrow('cancelled');
    expect(rejected.replaceHistory).toHaveBeenCalledWith('/');

    const wrongOrigin = harness({ origin: 'https://orchard.dastari.net', search: '?code=nope&state=studio-state' });
    await expect(completeStudioOidcCallback(wrongOrigin.auth, wrongOrigin.deps))
      .rejects.toThrow('studio_oidc_exact_origin_required');
    expect(wrongOrigin.completeCallback).not.toHaveBeenCalled();
  });

  it('checks the Studio-origin session before beginning login and leaves local profiles alone', async () => {
    const active = harness();
    await expect(prepareStudioOidcConnection('production', active.auth, active.deps)).resolves.toBe('ready');
    expect(active.ensureSession).toHaveBeenCalledOnce();
    expect(active.beginLogin).not.toHaveBeenCalled();

    const missing = harness({}, { ensureSession: vi.fn(async () => null) });
    await expect(prepareStudioOidcConnection('production', missing.auth, missing.deps)).resolves.toBe('redirecting');
    expect(missing.beginLogin).toHaveBeenCalledOnce();

    const local = harness({}, { configured: false, localProfilesEnabled: true });
    await expect(prepareStudioOidcConnection('local', local.auth, local.deps)).resolves.toBe('ready');
    expect(local.ensureSession).not.toHaveBeenCalled();
    expect(local.beginLogin).not.toHaveBeenCalled();

    const authenticatedLocal = harness();
    await expect(prepareStudioOidcConnection('local', authenticatedLocal.auth, authenticatedLocal.deps))
      .resolves.toBe('ready');
    expect(authenticatedLocal.ensureSession).toHaveBeenCalledOnce();
  });
});

describe('Studio reload connection restoration', () => {
  it('resumes an existing Studio session without redirecting', async () => {
    const value = harness();
    await expect(resumeStudioOidcSession(value.auth, value.deps)).resolves.toBe(true);
    expect(value.beginLogin).not.toHaveBeenCalled();
  });
  it('keeps a fresh visit offline with an explicit Connect action', async () => {
    const value = harness({}, { ensureSession: vi.fn(async () => null) });
    await expect(resumeStudioOidcSession(value.auth, value.deps)).resolves.toBe(false);
    expect(value.beginLogin).not.toHaveBeenCalled();
  });
  it('does not accept a session through a different application origin', async () => {
    const value = harness({ origin: 'https://orchard.dastari.net' });
    await expect(resumeStudioOidcSession(value.auth, value.deps)).rejects.toThrow('studio_oidc_exact_origin_required');
    expect(value.ensureSession).not.toHaveBeenCalled();
  });
});
