import {
  beginOidcLogin,
  completeOidcCallback,
  ensureOidcSession,
  hasOidcCallback,
  localProfilesEnabled,
  oidcConfigured,
  oidcRedirectUri,
  type OidcSession,
} from '@orchard/auth';
import type { StudioEnvironment } from './session.js';

export type StudioAuthenticationResult = 'ready' | 'redirecting';

export interface StudioAuthBrowser {
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  replaceHistory(url: string): void;
}

export interface StudioAuthDependencies {
  readonly configured: boolean;
  readonly localProfilesEnabled: boolean;
  redirectUri(): string;
  hasCallback(search: string): boolean;
  completeCallback(search: string): Promise<OidcSession>;
  ensureSession(): Promise<OidcSession | null>;
  beginLogin(): Promise<void>;
}

const browser = (): StudioAuthBrowser => ({
  origin: location.origin,
  pathname: location.pathname,
  search: location.search,
  hash: location.hash,
  replaceHistory: (url) => history.replaceState(null, '', url),
});

const dependencies = (): StudioAuthDependencies => ({
  configured: oidcConfigured,
  localProfilesEnabled,
  redirectUri: oidcRedirectUri,
  hasCallback: hasOidcCallback,
  completeCallback: (search) => completeOidcCallback(search),
  ensureSession: () => ensureOidcSession(),
  beginLogin: () => beginOidcLogin(),
});

function assertExactStudioOrigin(auth: StudioAuthBrowser, deps: StudioAuthDependencies): void {
  if (!deps.configured) throw new Error('account_login_not_configured');
  let redirect: URL;
  try { redirect = new URL(deps.redirectUri()); }
  catch { throw new Error('studio_oidc_redirect_invalid'); }
  if (redirect.origin !== auth.origin || redirect.pathname !== '/' || redirect.search !== '' || redirect.hash !== '') {
    throw new Error('studio_oidc_exact_origin_required');
  }
}

/** Completes the callback before any live connection is constructed and removes
 * all provider parameters from browser history, whether exchange succeeds or
 * fails. A callback can only consume pending state from this Studio origin. */
export async function completeStudioOidcCallback(
  auth: StudioAuthBrowser = browser(),
  deps: StudioAuthDependencies = dependencies(),
): Promise<boolean> {
  if (!deps.hasCallback(auth.search)) return false;
  assertExactStudioOrigin(auth, deps);
  try {
    await deps.completeCallback(auth.search);
    return true;
  } finally {
    auth.replaceHistory(`${auth.pathname}${auth.hash}`);
  }
}

/** Called by the canvas Connect action. Local development retains its existing
 * profile/session policy; production uses only an exact-origin Studio OIDC
 * session. Redirecting deliberately leaves the controller in `connecting` until
 * the callback reload resumes the connection. */
export async function prepareStudioOidcConnection(
  environment: Exclude<StudioEnvironment, 'sandbox'>,
  auth: StudioAuthBrowser = browser(),
  deps: StudioAuthDependencies = dependencies(),
): Promise<StudioAuthenticationResult> {
  if (environment === 'local' && deps.localProfilesEnabled) return 'ready';
  assertExactStudioOrigin(auth, deps);
  if (await deps.ensureSession() !== null) return 'ready';
  await deps.beginLogin();
  return 'redirecting';
}

/** Resume only an existing same-origin session; an ordinary visit never starts
 * an unsolicited provider redirect. Connect remains available for a new login. */
export async function resumeStudioOidcSession(
  auth: StudioAuthBrowser = browser(),
  deps: StudioAuthDependencies = dependencies(),
): Promise<boolean> {
  if (!deps.configured) return false;
  assertExactStudioOrigin(auth, deps);
  return await deps.ensureSession() !== null;
}
