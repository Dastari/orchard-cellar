const DEFAULT_ISSUER = 'https://auth.spacetimedb.com/oidc';
const SESSION_KEY = 'orchard:oidc:session:v1';
const PENDING_KEY = 'orchard:oidc:pending:v1';
const EXPIRY_SKEW_MS = 30_000;

export interface OidcSession {
  readonly idToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: number;
  readonly subject: string;
  readonly displayName: string;
  readonly issuer: string;
}

interface OidcPending {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly redirectUri: string;
}

interface TokenResponse {
  readonly id_token?: unknown;
  readonly refresh_token?: unknown;
  readonly expires_in?: unknown;
  readonly error?: unknown;
  readonly error_description?: unknown;
}

interface JwtClaims {
  readonly iss?: unknown;
  readonly aud?: unknown;
  readonly sub?: unknown;
  readonly exp?: unknown;
  readonly nonce?: unknown;
  readonly preferred_username?: unknown;
  readonly name?: unknown;
  readonly email?: unknown;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const oidcIssuer = (import.meta.env['VITE_OIDC_ISSUER'] as string | undefined)?.replace(/\/$/, '') ?? DEFAULT_ISSUER;
export const oidcClientId = (import.meta.env['VITE_OIDC_CLIENT_ID'] as string | undefined)?.trim() ?? '';
export const oidcConfigured = oidcClientId.length > 0;

function browserSessionStorage(): StorageLike | null {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage;
}

function redirectUri(): string {
  const configured = (import.meta.env['VITE_OIDC_REDIRECT_URI'] as string | undefined)?.trim();
  return configured || new URL('/', location.origin).toString();
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomValue(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return encodeBase64Url(value);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return encodeBase64Url(new Uint8Array(digest));
}

export function decodeJwtClaims(token: string): JwtClaims | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const padded = payload.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as JwtClaims : null;
  } catch {
    return null;
  }
}

function audiences(claim: unknown): readonly string[] {
  if (typeof claim === 'string') return [claim];
  return Array.isArray(claim) ? claim.filter((entry): entry is string => typeof entry === 'string') : [];
}

function displayNameFor(claims: JwtClaims): string {
  for (const candidate of [claims.preferred_username, claims.name, claims.email]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim().slice(0, 20);
  }
  return 'Farmer';
}

function sessionForToken(idToken: string, refreshToken: string | null, expectedNonce?: string): OidcSession {
  const claims = decodeJwtClaims(idToken);
  if (!claims || typeof claims.iss !== 'string' || typeof claims.sub !== 'string' || typeof claims.exp !== 'number') {
    throw new Error('The identity provider returned an invalid identity token.');
  }
  if (claims.iss.replace(/\/$/, '') !== oidcIssuer) throw new Error('The identity token came from an unexpected issuer.');
  if (!audiences(claims.aud).includes(oidcClientId)) throw new Error('The identity token was not issued for this game.');
  if (expectedNonce !== undefined && claims.nonce !== expectedNonce) throw new Error('The login response nonce did not match.');
  if (claims.exp * 1000 <= Date.now()) throw new Error('The identity token has already expired.');
  return {
    idToken,
    refreshToken,
    expiresAt: claims.exp * 1000,
    subject: claims.sub,
    displayName: displayNameFor(claims),
    issuer: claims.iss,
  };
}

function readRawSession(storage = browserSessionStorage()): OidcSession | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(SESSION_KEY) ?? 'null') as Partial<OidcSession> | null;
    if (!parsed || typeof parsed.idToken !== 'string' || typeof parsed.expiresAt !== 'number'
      || typeof parsed.subject !== 'string' || typeof parsed.displayName !== 'string' || typeof parsed.issuer !== 'string') return null;
    return { ...parsed, refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null } as OidcSession;
  } catch {
    return null;
  }
}

function writeSession(session: OidcSession, storage = browserSessionStorage()): void {
  storage?.setItem(SESSION_KEY, JSON.stringify(session));
}

export function readOidcSession(storage = browserSessionStorage(), now = Date.now()): OidcSession | null {
  const session = readRawSession(storage);
  return session !== null && session.expiresAt > now + EXPIRY_SKEW_MS ? session : null;
}

export function clearOidcSession(storage = browserSessionStorage()): void {
  storage?.removeItem(SESSION_KEY);
  storage?.removeItem(PENDING_KEY);
}

async function requestTokens(parameters: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(`${oidcIssuer}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: parameters,
  });
  const result = await response.json() as TokenResponse;
  if (!response.ok || typeof result.error === 'string') {
    throw new Error(typeof result.error_description === 'string' ? result.error_description : 'The identity provider rejected the login request.');
  }
  return result;
}

export async function beginOidcLogin(storage = browserSessionStorage()): Promise<void> {
  if (!oidcConfigured) throw new Error('Set VITE_OIDC_CLIENT_ID before using account login.');
  if (!storage) throw new Error('Browser session storage is unavailable.');
  const pending: OidcPending = {
    state: randomValue(),
    nonce: randomValue(),
    verifier: randomValue(48),
    redirectUri: redirectUri(),
  };
  storage.setItem(PENDING_KEY, JSON.stringify(pending));
  const url = new URL(`${oidcIssuer}/auth`);
  url.search = new URLSearchParams({
    client_id: oidcClientId,
    redirect_uri: pending.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: await challengeFor(pending.verifier),
    code_challenge_method: 'S256',
  }).toString();
  location.assign(url.toString());
}

export function hasOidcCallback(search = location.search): boolean {
  const parameters = new URLSearchParams(search);
  return parameters.has('code') || parameters.has('error');
}

export async function completeOidcCallback(search = location.search, storage = browserSessionStorage()): Promise<OidcSession> {
  if (!oidcConfigured || !storage) throw new Error('Account login is not configured.');
  const parameters = new URLSearchParams(search);
  const providerError = parameters.get('error');
  if (providerError !== null) throw new Error(parameters.get('error_description') ?? 'Login was cancelled.');
  const code = parameters.get('code');
  const state = parameters.get('state');
  let pending: OidcPending | null;
  try { pending = JSON.parse(storage.getItem(PENDING_KEY) ?? 'null') as OidcPending | null; } catch { pending = null; }
  storage.removeItem(PENDING_KEY);
  if (!code || !state || !pending || state !== pending.state || !pending.verifier || !pending.nonce) {
    throw new Error('The login response did not match the request. Please try again.');
  }
  const result = await requestTokens(new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: oidcClientId,
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier,
  }));
  if (typeof result.id_token !== 'string') throw new Error('The identity provider did not return an identity token.');
  const session = sessionForToken(result.id_token, typeof result.refresh_token === 'string' ? result.refresh_token : null, pending.nonce);
  writeSession(session, storage);
  return session;
}

export async function ensureOidcSession(storage = browserSessionStorage()): Promise<OidcSession | null> {
  const valid = readOidcSession(storage);
  if (valid) return valid;
  const expired = readRawSession(storage);
  if (!oidcConfigured || !storage || !expired?.refreshToken) {
    clearOidcSession(storage);
    return null;
  }
  try {
    const result = await requestTokens(new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: oidcClientId,
      refresh_token: expired.refreshToken,
    }));
    const idToken = typeof result.id_token === 'string' ? result.id_token : expired.idToken;
    const session = sessionForToken(idToken, typeof result.refresh_token === 'string' ? result.refresh_token : expired.refreshToken);
    writeSession(session, storage);
    return session;
  } catch {
    clearOidcSession(storage);
    return null;
  }
}
