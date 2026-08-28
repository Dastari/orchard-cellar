import {
  decodeJwtClaims,
  encodeBase64Url,
  validateIdTokenClaims,
  verifyIdTokenSignature,
  type JwtClaims,
} from './oidc-token.js';

export { decodeJwtClaims, validateIdTokenClaims } from './oidc-token.js';

const DEFAULT_ISSUER = 'https://auth.orchard.dastari.net/realms/orchard';
const SESSION_KEY = 'orchard:oidc:session:v1';
const PENDING_KEY = 'orchard:oidc:pending:v1';
const POPUP_STATE_PREFIX = 'popup.';
const POPUP_CHANNEL = 'orchard:oidc:popup:v1';
const POPUP_MESSAGE_TYPE = 'orchard:oidc:callback';
const EXPIRY_SKEW_MS = 30_000;

export interface OidcSession {
  readonly idToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: number;
  readonly subject: string;
  readonly displayName: string;
  readonly emailVerified: boolean;
  readonly issuer: string;
}

interface OidcPending {
  readonly state: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly redirectUri: string;
}

interface OidcPopupCallbackMessage {
  readonly type: typeof POPUP_MESSAGE_TYPE;
  readonly search: string;
}

interface OidcDiscovery {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
  readonly end_session_endpoint?: string;
  readonly revocation_endpoint?: string;
}

interface TokenResponse {
  readonly id_token?: unknown;
  readonly refresh_token?: unknown;
  readonly expires_in?: unknown;
  readonly error?: unknown;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type OidcEntryIntent = 'login' | 'register' | 'recover';

export const oidcIssuer = (import.meta.env['VITE_OIDC_ISSUER'] as string | undefined)?.replace(/\/$/, '') ?? DEFAULT_ISSUER;
export const oidcClientId = (import.meta.env['VITE_OIDC_CLIENT_ID'] as string | undefined)?.trim() ?? '';
export const oidcConfigured = oidcClientId.length > 0;
export const localProfilesEnabled = import.meta.env.DEV
  && (import.meta.env['VITE_ENABLE_LOCAL_PROFILES'] as string | undefined) === 'true';

let discoveryPromise: Promise<OidcDiscovery> | null = null;

function browserSessionStorage(): StorageLike | null {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage;
}

function redirectUri(): string {
  const configured = (import.meta.env['VITE_OIDC_REDIRECT_URI'] as string | undefined)?.trim();
  return configured || new URL('/', location.origin).toString();
}

function allowedEndpoint(endpoint: string): boolean {
  const url = new URL(endpoint);
  const issuer = new URL(oidcIssuer);
  if (url.origin !== issuer.origin) return false;
  return url.protocol === 'https:' || (import.meta.env.DEV && url.hostname === 'localhost');
}

function randomValue(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return encodeBase64Url(value);
}

function createPending(storage: StorageLike, popup: boolean): OidcPending {
  const pending: OidcPending = {
    state: `${popup ? POPUP_STATE_PREFIX : ''}${randomValue()}`,
    nonce: randomValue(),
    verifier: randomValue(48),
    redirectUri: redirectUri(),
  };
  storage.setItem(PENDING_KEY, JSON.stringify(pending));
  return pending;
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return encodeBase64Url(new Uint8Array(digest));
}

function displayNameFor(claims: JwtClaims): string {
  for (const candidate of [claims.preferred_username, claims.name, claims.email]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim().slice(0, 20);
  }
  return 'Farmer';
}

function validateDiscovery(value: unknown): OidcDiscovery {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The account service is unavailable.');
  }
  const candidate = value as Partial<OidcDiscovery>;
  const endpoints = [candidate.authorization_endpoint, candidate.token_endpoint, candidate.jwks_uri];
  if (candidate.issuer !== oidcIssuer || endpoints.some((endpoint) => typeof endpoint !== 'string' || !allowedEndpoint(endpoint))) {
    throw new Error('The account service configuration is invalid.');
  }
  if (candidate.end_session_endpoint !== undefined && !allowedEndpoint(candidate.end_session_endpoint)) {
    throw new Error('The account service configuration is invalid.');
  }
  if (candidate.revocation_endpoint !== undefined && !allowedEndpoint(candidate.revocation_endpoint)) {
    throw new Error('The account service configuration is invalid.');
  }
  return candidate as OidcDiscovery;
}

export async function oidcDiscovery(): Promise<OidcDiscovery> {
  discoveryPromise ??= fetch(`${oidcIssuer}/.well-known/openid-configuration`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  }).then(async (response) => {
    if (!response.ok) throw new Error('The account service is unavailable.');
    return validateDiscovery(await response.json() as unknown);
  }).catch((error: unknown) => {
    discoveryPromise = null;
    throw error;
  });
  return discoveryPromise;
}

async function sessionForToken(
  idToken: string,
  refreshToken: string | null,
  expectedNonce?: string,
): Promise<OidcSession> {
  const discovery = await oidcDiscovery();
  await verifyIdTokenSignature(idToken, discovery.jwks_uri);
  const claims = decodeJwtClaims(idToken);
  validateIdTokenClaims(claims, expectedNonce, Date.now(), oidcIssuer, oidcClientId);
  if (claims === null || typeof claims.sub !== 'string' || typeof claims.exp !== 'number' || typeof claims.iss !== 'string') {
    throw new Error('The account service returned an invalid identity token.');
  }
  return {
    idToken,
    refreshToken,
    expiresAt: claims.exp * 1000,
    subject: claims.sub,
    displayName: displayNameFor(claims),
    emailVerified: claims.email_verified === true,
    issuer: claims.iss,
  };
}

function readRawSession(storage = browserSessionStorage()): OidcSession | null {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(SESSION_KEY) ?? 'null') as Partial<OidcSession> | null;
    if (!parsed || typeof parsed.idToken !== 'string' || typeof parsed.expiresAt !== 'number'
      || typeof parsed.subject !== 'string' || typeof parsed.displayName !== 'string' || typeof parsed.issuer !== 'string') return null;
    return {
      ...parsed,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
      emailVerified: parsed.emailVerified === true,
    } as OidcSession;
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

async function requestTokens(endpoint: string, parameters: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: parameters,
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  const result = await response.json() as TokenResponse;
  if (!response.ok || typeof result.error === 'string') {
    throw new Error(result.error === 'invalid_grant'
      ? 'The login session expired or was already used. Please sign in again.'
      : 'The account service rejected the login request.');
  }
  return result;
}

export function oidcEntryEndpoint(authorizationEndpoint: string, intent: OidcEntryIntent): URL {
  const url = new URL(authorizationEndpoint);
  if (intent === 'register') url.searchParams.set('prompt', 'create');
  if (intent === 'recover') {
    const path = url.pathname.split('/');
    if (path.at(-1) !== 'auth') throw new Error('The account service recovery endpoint is invalid.');
    path[path.length - 1] = 'forgot-credentials';
    url.pathname = path.join('/');
  }
  return url;
}

async function authorizationUrl(pending: OidcPending, intent: OidcEntryIntent): Promise<URL> {
  const discovery = await oidcDiscovery();
  const url = oidcEntryEndpoint(discovery.authorization_endpoint, intent);
  const parameters = new URLSearchParams({
    client_id: oidcClientId,
    redirect_uri: pending.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: await challengeFor(pending.verifier),
    code_challenge_method: 'S256',
  });
  if (intent === 'register') parameters.set('prompt', 'create');
  url.search = parameters.toString();
  return url;
}

export async function beginOidcLogin(
  intent: OidcEntryIntent = 'login',
  storage = browserSessionStorage(),
): Promise<void> {
  if (!oidcConfigured) throw new Error('Account login is not configured.');
  if (!storage) throw new Error('Browser session storage is unavailable.');
  const pending = createPending(storage, false);
  const url = await authorizationUrl(pending, intent);
  location.assign(url.toString());
}

export function isOidcPopupCallback(search = location.search): boolean {
  const parameters = new URLSearchParams(search);
  return parameters.get('state')?.startsWith(POPUP_STATE_PREFIX) === true;
}

function popupCallbackMessage(value: unknown): OidcPopupCallbackMessage | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<OidcPopupCallbackMessage>;
  return candidate.type === POPUP_MESSAGE_TYPE && typeof candidate.search === 'string'
    ? { type: POPUP_MESSAGE_TYPE, search: candidate.search }
    : null;
}

function popupCallbackMatchesPending(search: string, storage: StorageLike): boolean {
  const state = new URLSearchParams(search).get('state');
  if (state === null) return false;
  try {
    const pending = JSON.parse(storage.getItem(PENDING_KEY) ?? 'null') as Partial<OidcPending> | null;
    return pending?.state === state && state.startsWith(POPUP_STATE_PREFIX);
  } catch {
    return false;
  }
}

/** Relay only the authorization response. The opener retains the verifier and
 * exchanges the code itself, so tokens never have to cross a window boundary. */
export function relayOidcPopupCallback(search = location.search): boolean {
  if (!isOidcPopupCallback(search)) return false;
  const message: OidcPopupCallbackMessage = { type: POPUP_MESSAGE_TYPE, search };
  if (window.opener !== null) window.opener.postMessage(message, location.origin);
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(POPUP_CHANNEL);
    channel.postMessage(message);
    channel.close();
  }
  window.setTimeout(() => window.close(), 0);
  return true;
}

export async function beginOidcPopupLogin(
  intent: OidcEntryIntent = 'login',
  storage = browserSessionStorage(),
): Promise<OidcSession> {
  if (!oidcConfigured) throw new Error('Account login is not configured.');
  if (!storage) throw new Error('Browser session storage is unavailable.');

  // Store pending state before opening so the new top-level context receives
  // the browser's initial sessionStorage copy as an additional recovery path.
  const pending = createPending(storage, true);
  const popup = window.open('', `orchard-oidc-${pending.state.slice(-12)}`, 'popup=yes,width=720,height=820');
  if (popup === null) {
    const redirectPending = createPending(storage, false);
    location.assign((await authorizationUrl(redirectPending, intent)).toString());
    return await new Promise<OidcSession>(() => undefined);
  }

  let callbackReceived = false;
  let settled = false;
  let channel: BroadcastChannel | null = null;
  let closePoll = 0;
  let timeout = 0;
  let popupClosedAt = 0;

  return await new Promise<OidcSession>((resolve, reject) => {
    const cleanup = (): void => {
      window.removeEventListener('message', onWindowMessage);
      if (closePoll !== 0) window.clearInterval(closePoll);
      if (timeout !== 0) window.clearTimeout(timeout);
      channel?.close();
      channel = null;
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const complete = (search: string): void => {
      if (settled || callbackReceived) return;
      if (!popupCallbackMatchesPending(search, storage)) return;
      callbackReceived = true;
      void completeOidcCallback(search, storage).then((session) => {
        if (settled) return;
        settled = true;
        cleanup();
        try { popup.close(); } catch { /* already closed */ }
        resolve(session);
      }).catch((error: unknown) => {
        fail(error instanceof Error ? error : new Error('Login failed. Please try again.'));
      });
    };
    const onWindowMessage = (event: MessageEvent<unknown>): void => {
      if (event.origin !== location.origin || event.source !== popup) return;
      const message = popupCallbackMessage(event.data);
      if (message !== null) complete(message.search);
    };

    window.addEventListener('message', onWindowMessage);
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(POPUP_CHANNEL);
      channel.addEventListener('message', (event: MessageEvent<unknown>) => {
        const message = popupCallbackMessage(event.data);
        if (message !== null) complete(message.search);
      });
    }
    closePoll = window.setInterval(() => {
      if (callbackReceived || !popup.closed) return;
      if (popupClosedAt === 0) popupClosedAt = Date.now();
      else if (Date.now() - popupClosedAt >= 1_000) fail(new Error('The sign-in window was closed.'));
    }, 250);
    timeout = window.setTimeout(() => fail(new Error('The sign-in window timed out. Please try again.')), 5 * 60_000);

    void authorizationUrl(pending, intent).then((url) => {
      if (!settled) popup.location.replace(url.toString());
    }).catch((error: unknown) => {
      try { popup.close(); } catch { /* already closed */ }
      fail(error instanceof Error ? error : new Error('Unable to start login.'));
    });
  });
}

export function hasOidcCallback(search = location.search): boolean {
  const parameters = new URLSearchParams(search);
  return parameters.has('code') || parameters.has('error');
}

export async function completeOidcCallback(
  search = location.search,
  storage = browserSessionStorage(),
): Promise<OidcSession> {
  if (!oidcConfigured || !storage) throw new Error('Account login is not configured.');
  const parameters = new URLSearchParams(search);
  if (parameters.has('error')) throw new Error('Login was cancelled or rejected.');
  const code = parameters.get('code');
  const state = parameters.get('state');
  let pending: OidcPending | null;
  try { pending = JSON.parse(storage.getItem(PENDING_KEY) ?? 'null') as OidcPending | null; } catch { pending = null; }
  storage.removeItem(PENDING_KEY);
  if (!code || !state || !pending || state !== pending.state || !pending.verifier || !pending.nonce) {
    throw new Error('The login response did not match the request. Please try again.');
  }
  const discovery = await oidcDiscovery();
  const result = await requestTokens(discovery.token_endpoint, new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: oidcClientId,
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier,
  }));
  if (typeof result.id_token !== 'string') throw new Error('The account service did not return an identity token.');
  const session = await sessionForToken(
    result.id_token,
    typeof result.refresh_token === 'string' ? result.refresh_token : null,
    pending.nonce,
  );
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
    const discovery = await oidcDiscovery();
    const result = await requestTokens(discovery.token_endpoint, new URLSearchParams({
      grant_type: 'refresh_token', client_id: oidcClientId, refresh_token: expired.refreshToken,
    }));
    if (typeof result.id_token !== 'string') throw new Error('The account service did not refresh the identity token.');
    const session = await sessionForToken(
      result.id_token,
      typeof result.refresh_token === 'string' ? result.refresh_token : expired.refreshToken,
    );
    writeSession(session, storage);
    return session;
  } catch {
    clearOidcSession(storage);
    return null;
  }
}

export async function signOutOidc(storage = browserSessionStorage()): Promise<void> {
  const session = readRawSession(storage);
  clearOidcSession(storage);
  if (!oidcConfigured) {
    location.assign('/');
    return;
  }
  try {
    const discovery = await oidcDiscovery();
    if (session?.refreshToken && discovery.revocation_endpoint) {
      await fetch(discovery.revocation_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: oidcClientId, token: session.refreshToken, token_type_hint: 'refresh_token' }),
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      }).catch(() => undefined);
    }
    if (discovery.end_session_endpoint) {
      const logout = new URL(discovery.end_session_endpoint);
      logout.search = new URLSearchParams({
        client_id: oidcClientId,
        post_logout_redirect_uri: redirectUri(),
      }).toString();
      location.assign(logout.toString());
      return;
    }
  } catch {
    // Browser credentials are already cleared. A provider outage must not trap
    // the player in a locally authenticated state.
  }
  location.assign('/');
}
