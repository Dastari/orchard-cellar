import {
  ensureOidcSession,
  hasOidcCallback,
  oidcConfigured,
} from './auth/oidc.js';

const parameters = new URLSearchParams(location.search);
const loggingOut = parameters.has('logout');
const oidcCallback = hasOidcCallback();
const localDevelopmentSession = import.meta.env.DEV && parameters.has('slot');
const authenticatedSession = !loggingOut
  && !oidcCallback
  && oidcConfigured
  && await ensureOidcSession() !== null;

if (localDevelopmentSession || authenticatedSession) {
  document.title = 'Orchard & Cellar — Shared Overworld';
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  canvas?.classList.add('custom-cursor');
  canvas?.setAttribute('aria-label', 'Orchard and Cellar shared overworld');
  document.querySelector<HTMLInputElement>('#account-name')?.remove();
  await import('./overworld-main.js');
} else {
  document.title = 'Orchard & Cellar — Account';
  await import('./account-main.js');
}
