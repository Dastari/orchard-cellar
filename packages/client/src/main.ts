import {
  clientEntryRoute,
  offlineDesignEditorPath,
  offlineEditorPath,
} from './editor/editor-route.js';
import { initializeLoadingScreen, setLoadingScreenStage } from './loading-screen.js';
import { pwaClient } from './pwa.js';
import './style.css';

const entryRoute = clientEntryRoute(location.pathname, location.search);
const popupCallbackRelayed = entryRoute.kind === 'standard'
  ? (await import('./auth/oidc.js')).relayOidcPopupCallback()
  : false;
if (!popupCallbackRelayed) {
  setLoadingScreenStage({
    title: 'OPENING THE ORCHARD', detail: 'CHECKING YOUR ACCOUNT', progress: 12,
  });
  await initializeLoadingScreen();
  void pwaClient.start();
}

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

if (entryRoute.kind === 'offline_design_editor') {
  const canonicalLocation = `${offlineDesignEditorPath(entryRoute.stampId)}${location.search}${location.hash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== canonicalLocation) {
    history.replaceState(null, '', canonicalLocation);
  }
} else if (entryRoute.kind === 'offline_editor') {
  const editorParameters = new URLSearchParams(location.search);
  editorParameters.delete('mode');
  editorParameters.delete('source');
  editorParameters.delete('map');
  const editorSearch = editorParameters.size === 0 ? '' : `?${editorParameters.toString()}`;
  const canonicalLocation = `${offlineEditorPath(entryRoute.mapId)}${editorSearch}${location.hash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== canonicalLocation) {
    history.replaceState(null, '', canonicalLocation);
  }
} else if (location.pathname !== '/' && !location.pathname.startsWith('/editor/live')) {
  history.replaceState(null, '', `/${location.search}${location.hash}`);
}

const parameters = new URLSearchParams(location.search);

async function launchClient(): Promise<void> {
  if (popupCallbackRelayed) return;
  if (entryRoute.kind === 'offline_design_editor') {
    document.title = 'Orchard & Cellar — Layout Studio';
    setLoadingScreenStage({
      title: 'OPENING LAYOUT STUDIO', detail: 'INDEXING THE ASSET PALETTE', progress: 24,
    });
    await import('./editor/design-studio.js');
    return;
  }
  if (entryRoute.kind === 'offline_editor') {
    document.title = 'Orchard & Cellar — Offline Creator';
    setLoadingScreenStage({
      title: 'OPENING CREATOR MODE', detail: 'NO ACCOUNT OR LIVE WORLD CONNECTION REQUIRED', progress: 24,
    });
    await import('./editor/offline-editor.js');
    return;
  }

  const {
    ensureOidcSession,
    hasOidcCallback,
    localProfilesEnabled,
    oidcConfigured,
  } = await import('./auth/oidc.js');

  const loggingOut = parameters.has('logout');
  const accountMenuRequested = parameters.has('menu');
  const oidcCallback = hasOidcCallback();
  const localDevelopmentSession = localProfilesEnabled && parameters.has('slot');
  const authenticatedSession = await (async (): Promise<boolean> => {
    try {
      return !loggingOut
        && !accountMenuRequested
        && !oidcCallback
        && oidcConfigured
        && await ensureOidcSession() !== null;
    } catch (error: unknown) {
      setLoadingScreenStage({
        title: 'THE GATE WOULD NOT OPEN',
        detail: 'CHECK YOUR CONNECTION AND REFRESH TO TRY AGAIN',
        progress: 100,
        error: true,
      });
      throw error;
    }
  })();

  if (localDevelopmentSession || authenticatedSession) {
    document.title = 'Orchard & Cellar — Shared Overworld';
    setLoadingScreenStage({
      title: 'PACKING YOUR WAGON', detail: 'PREPARING THE WORLD CLIENT', progress: 24,
    });
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    canvas?.classList.add('custom-cursor');
    canvas?.setAttribute('aria-label', 'Orchard and Cellar shared overworld');
    const textInput = document.querySelector<HTMLInputElement>('#account-name');
    textInput?.setAttribute('aria-label', 'General chat message');
    await import('./overworld-main.js');
  } else {
    document.title = 'Orchard & Cellar — Account';
    setLoadingScreenStage({
      title: 'OPENING THE ORCHARD', detail: 'PREPARING THE ACCOUNT DESK', progress: 32,
    });
    await import('./account-main.js');
  }
}

try {
  await launchClient();
} catch (error: unknown) {
  setLoadingScreenStage({
    title: 'SOMETHING WENT ASTRAY',
    detail: 'REFRESH THE PAGE TO TRY THE JOURNEY AGAIN',
    progress: 100,
    error: true,
  });
  throw error;
}
