import {
  ensureOidcSession,
  hasOidcCallback,
  localProfilesEnabled,
  oidcConfigured,
} from './auth/oidc.js';
import './style.css';

function isCanvasInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement && target.classList.contains('canvas-input');
}

// The rendered canvas owns interaction. Keep the hidden native inputs available
// for keyboard editing, selection, clipboard, and IME without exposing browser
// context menus, DOM selection, dragging, or file-drop navigation over the game.
document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('auxclick', (event) => event.preventDefault());
document.addEventListener('dragstart', (event) => event.preventDefault());
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('drop', (event) => event.preventDefault());
document.addEventListener('selectstart', (event) => {
  if (!isCanvasInput(event.target)) event.preventDefault();
});

if (location.pathname !== '/') {
  history.replaceState(null, '', `/${location.search}${location.hash}`);
}

const parameters = new URLSearchParams(location.search);
const loggingOut = parameters.has('logout');
const accountMenuRequested = parameters.has('menu');
const oidcCallback = hasOidcCallback();
const localDevelopmentSession = localProfilesEnabled && parameters.has('slot');
const authenticatedSession = !loggingOut
  && !accountMenuRequested
  && !oidcCallback
  && oidcConfigured
  && await ensureOidcSession() !== null;

if (localDevelopmentSession || authenticatedSession) {
  document.title = 'Orchard & Cellar — Shared Overworld';
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  canvas?.classList.add('custom-cursor');
  canvas?.setAttribute('aria-label', 'Orchard and Cellar shared overworld');
  const textInput = document.querySelector<HTMLInputElement>('#account-name');
  textInput?.setAttribute('aria-label', 'General chat message');
  await import('./overworld-main.js');
} else {
  document.title = 'Orchard & Cellar — Account';
  await import('./account-main.js');
}
