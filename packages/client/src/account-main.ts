import {
  localProfileWorldUrl,
  readLocalProfiles,
  rememberLocalProfile,
  validLocalProfileName,
} from './account-profile.js';
import {
  beginOidcLogin,
  completeOidcCallback,
  ensureOidcSession,
  hasOidcCallback,
  localProfilesEnabled,
  oidcConfigured,
  signOutOidc,
  type OidcEntryIntent,
  type OidcSession,
} from '@orchard/auth';
import {
  canvasHostViewport,
  canvasSafeAreaInsets,
  insetCanvasViewport,
} from '@orchard/engine/display';
import { loadGeneratedAsset } from '@orchard/ui';
import { GameGateway, GameUiRuntime, UiTextBridge, loadUiKitArt, gameGatewayLayout } from '@orchard/ui/game';
import { RetainedUiPointers } from './retained-ui-input.js';
import { drawOrchardBackdrop, loadOrchardBackdrop } from '@orchard/ui';
import { AudioBus } from '@orchard/engine/audio/audio-bus';
import { dismissLoadingScreen, setLoadingScreenStage, upgradeLoadingScreen } from '@orchard/engine/loading-screen';

// Remove authorization codes and provider errors from the address bar before
// loading assets or making the token request. NPM is separately configured to
// log only $uri (never $request_uri) on this host.
const initialSearch = location.search;
const oidcCallback = hasOidcCallback(initialSearch);
const loggingOut = new URLSearchParams(initialSearch).has('logout');
if (oidcCallback || loggingOut) history.replaceState(null, '', '/');

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (canvasElement === null) throw new Error('Missing account canvas');
const canvas: HTMLCanvasElement = canvasElement;
canvas.classList.add('account-screen');
void loadOrchardBackdrop();
const canvasContext = canvas.getContext('2d');
if (canvasContext === null) throw new Error('Canvas 2D unavailable');
const context: CanvasRenderingContext2D = canvasContext;
context.imageSmoothingEnabled = false;
const audio = new AudioBus(false);
audio.setMusicContext({ scene: 'title' });
void audio.unlock().catch(() => undefined);
setLoadingScreenStage({
  title: 'OPENING THE ORCHARD', detail: 'LAYING OUT THE ACCOUNT DESK', progress: 55,
});
const [kitArt, orchardEmblem, cellarCask] = await Promise.all([
  loadUiKitArt(), loadGeneratedAsset('icon_resource_fruit', 'summer'), loadGeneratedAsset('prop_cf_barrel', 'summer').catch(() => undefined),
]);
upgradeLoadingScreen(kitArt, orchardEmblem, cellarCask);
const clientVersion = import.meta.env.VITE_CLIENT_VERSION;

let authSession: OidcSession | null = null;
let authBusy = false;
let authError: string | null = null;
if (loggingOut) {
  authBusy = true;
  await signOutOidc();
} else if (oidcCallback) {
  authBusy = true;
  try {
    authSession = await completeOidcCallback(initialSearch);
  } catch (error: unknown) {
    authError = error instanceof Error ? error.message : 'Login failed. Please try again.';
  } finally {
    authBusy = false;
  }
} else {
  authSession = await ensureOidcSession();
}

let profiles = readLocalProfiles(localStorage);
let selected = Math.max(0, profiles.names.findIndex((name) => name === profiles.lastUsed));
let localPreview = localProfilesEnabled && !oidcConfigured;
let message = oidcConfigured
  ? authSession === null ? 'CREATE AN ACCOUNT OR SIGN IN TO CONTINUE' : `WELCOME BACK, ${authSession.displayName.toUpperCase()}`
  : localProfilesEnabled ? 'ACCOUNT LOGIN OFF - LOCAL DEV PREVIEW' : 'ACCOUNT LOGIN IS NOT CONFIGURED';
let viewport = canvasHostViewport(canvas);
let safeArea = canvasSafeAreaInsets(canvas);
let scene = gameGatewayLayout(viewport.width, viewport.height);
let displayPixelRatio = Math.max(1, devicePixelRatio);
let navigationPending = false;
let animationFrameId: number | null = null;
const accountEvents = new AbortController();
const gateway = new GameGateway(kitArt, {
  onAction(action) {
    if (authBusy || navigationPending) return;
    if (action === 'toggle-preview') { localPreview = !localPreview; resize(); }
    else if (action === 'continue-local') submitLocal();
    else if (action === 'enter-world') launchAccount();
    else if (action === 'sign-out') {
      authSession = null; authBusy = true; message = 'SIGNING OUT';
      navigateWithMusic(() => { void signOutOidc(); });
    } else void submitAccount(action === 'register' ? 'register' : action === 'recover' ? 'recover' : 'login');
    updateGateway();
  },
  onSelectProfile(index) { if (profiles.names[index] !== undefined) { selected = index; updateGateway(); } },
  onNameChange(name) { message = validLocalProfileName(name.trim()) ? 'PRESS ENTER TO CREATE OR CONTINUE' : 'TYPE A NEW FARMER NAME'; },
  onDismissName() { message = 'CHOOSE A FARMER OR TYPE A NEW NAME'; },
}, { emblem: orchardEmblem, cask: cellarCask, version: clientVersion });
const runtime = new GameUiRuntime();
runtime.register({ id: 'gateway', root: gateway.root, priority: 1, active: () => gateway.active, blocking: () => true });
const text = new UiTextBridge(canvas, () => runtime.focusedElement, event => gateway.root.key(event), element => {
  const bounds = canvas.getBoundingClientRect(), sx = bounds.width / Math.max(1, viewport.width), sy = bounds.height / Math.max(1, viewport.height);
  return { x: bounds.left + (safeArea.left + element.rect.x * scene.scale) * sx,
    y: bounds.top + (safeArea.top + element.rect.y * scene.scale) * sy,
    width: element.rect.width * scene.scale * sx, height: element.rect.height * scene.scale * sy };
}, () => {});
text.input.setAttribute('autocomplete', 'nickname');
const syncText = () => { if (!pointers.hasCapture) text.sync(); };
const pointers = new RetainedUiPointers(canvas, window, runtime, event => {
  const bounds = canvas.getBoundingClientRect();
  return { x: ((event.clientX - bounds.left) * viewport.width / Math.max(1, bounds.width) - safeArea.left) / scene.scale,
    y: ((event.clientY - bounds.top) * viewport.height / Math.max(1, bounds.height) - safeArea.top) / scene.scale };
}, syncText, () => {});
function updateGateway(): void {
  gateway.update({ scopeKey: authSession?.subject ?? 'signed-out', localPreview, signedIn: authSession !== null,
    displayName: authSession?.displayName, profiles: profiles.names, selected, message, error: authError ?? undefined,
    busy: authBusy || navigationPending, allowLocalPreview: localProfilesEnabled, allowPreviewToggle: oidcConfigured && localProfilesEnabled });
  runtime.reconcile();
}


function navigateWithMusic(action: () => void): void {
  if (navigationPending) return;
  navigationPending = true;
  updateGateway();
  void audio.fadeOutForNavigation().finally(action);
}

function resize(): void {
  viewport = canvasHostViewport(canvas);
  safeArea = canvasSafeAreaInsets(canvas);
  const safeViewport = insetCanvasViewport(viewport.width, viewport.height, safeArea);
  const visibleHeight = Math.min(safeViewport.height, Math.max(1, (window.visualViewport?.height ?? viewport.height) - safeArea.top - safeArea.bottom));
  scene = gameGatewayLayout(safeViewport.width, visibleHeight);
  gateway.setBounds(scene.frame, scene.width, scene.height);
  displayPixelRatio = Math.max(1, devicePixelRatio);
  canvas.width = Math.round(viewport.width * displayPixelRatio);
  canvas.height = Math.round(viewport.height * displayPixelRatio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  context.imageSmoothingEnabled = false;
  updateGateway(); syncText();
}

function launchLocal(name: string): void {
  profiles = rememberLocalProfile(localStorage, name);
  navigateWithMusic(() => location.assign(localProfileWorldUrl(profiles.lastUsed ?? name, location.origin)));
}

function launchAccount(): void {
  if (authSession === null) return;
  navigateWithMusic(() => {
    if (location.pathname === '/' && location.search === '' && location.hash === '') location.reload();
    else location.assign('/');
  });
}

function render(): void {
  animationFrameId = null;
  if (displayPixelRatio !== Math.max(1, devicePixelRatio)) resize();
  context.setTransform(displayPixelRatio, 0, 0, displayPixelRatio, 0, 0);
  context.imageSmoothingEnabled = false;
  drawOrchardBackdrop(context, viewport.width, viewport.height);
  context.save();
  context.translate(safeArea.left, safeArea.top);
  context.scale(scene.scale, scene.scale);
  updateGateway(); gateway.draw(context); syncText();
  context.restore();
  animationFrameId = requestAnimationFrame(render);
}

function startRendering(): void {
  if (animationFrameId === null) animationFrameId = requestAnimationFrame(render);
}

function stopRendering(): void {
  if (animationFrameId === null) return;
  cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
}

function submitLocal(): void {
  const name = gateway.editor.snapshot().value.trim();
  if (name.length > 0) {
    if (!validLocalProfileName(name)) {
      message = 'USE 3-20 LETTERS, NUMBERS, SPACES, - OR APOSTROPHE';
      return;
    }
    launchLocal(name);
    return;
  }
  const chosen = profiles.names[selected];
  if (chosen === undefined) {
    gateway.focusName();
    message = 'TYPE A FARMER NAME FIRST';
    return;
  }
  launchLocal(chosen);
}

async function submitAccount(intent: OidcEntryIntent = 'login'): Promise<void> {
  if (authBusy) return;
  authError = null;
  if (authSession !== null) {
    launchAccount();
    return;
  }
  authBusy = true;
  message = intent === 'login' ? 'OPENING SIGN IN' : 'OPENING ACCOUNT SERVICE';
  updateGateway();
  try {
    await beginOidcLogin(intent);
  } catch (error: unknown) {
    authBusy = false;
    authError = error instanceof Error ? error.message : 'Unable to start login.';
    updateGateway();
  }
}

window.addEventListener('resize', resize, { signal: accountEvents.signal });
window.visualViewport?.addEventListener('resize', resize, { signal: accountEvents.signal });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopRendering(); pointers.cancel(); }
  else {
    resize();
    startRendering();
  }
}, { signal: accountEvents.signal });
window.addEventListener('keydown', event => {
  if (event.target === text.input) return;
  void audio.unlock().catch(() => undefined);
  if (gateway.handleGlobalKeyDown(event) || gateway.root.key(event)) { event.preventDefault(); updateGateway(); syncText(); }
}, { signal: accountEvents.signal });
canvas.addEventListener('pointerdown', event => {
  void audio.unlock().catch(() => undefined);
  if (pointers.dispatch('down', event, 'gateway')) event.preventDefault();
}, { signal: accountEvents.signal });
canvas.addEventListener('pointermove', event => { pointers.dispatch('move', event, 'gateway'); }, { signal: accountEvents.signal });
canvas.addEventListener('pointerleave', () => runtime.clearHover(), { signal: accountEvents.signal });
canvas.addEventListener('wheel', event => {
  const bounds = canvas.getBoundingClientRect(), unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
  if (runtime.wheel({ point: { x: ((event.clientX - bounds.left) * viewport.width / Math.max(1,bounds.width) - safeArea.left) / scene.scale,
    y: ((event.clientY - bounds.top) * viewport.height / Math.max(1,bounds.height) - safeArea.top) / scene.scale },
    deltaX:event.deltaX * unit / scene.scale,deltaY:event.deltaY * unit / scene.scale },'gateway')) event.preventDefault();
}, {passive:false, signal: accountEvents.signal});
window.addEventListener('blur', () => pointers.cancel(), { signal: accountEvents.signal });
import.meta.hot?.dispose(() => { stopRendering(); accountEvents.abort(); pointers.dispose(); text.dispose(); runtime.dispose(); gateway.dispose(); });

resize();
dismissLoadingScreen();
startRendering();
