import {
  localProfileWorldUrl,
  readLocalProfiles,
  rememberLocalProfile,
  validLocalProfileName,
} from './account-profile.js';
import { accountButtonRects, accountPointerAction } from './account-actions.js';
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
} from './auth/oidc.js';
import { canvasViewport, centeredFixedSceneLayout } from './display.js';
import { loadGeneratedAsset } from './render/assets.js';
import { drawPixelText, loadPixelUi } from './render/pixel-ui.js';
import { drawUiSkinAsset, loadUiSkin, uiAssetFrame } from './ui/skin.js';
import { drawCanvasTextInput } from './ui/canvas-text-input.js';
import { drawOrchardBackdrop } from './ui/orchard-backdrop.js';
import { Ribbon } from './ui/ribbon.js';
import { AudioBus } from './audio/audio-bus.js';
import { dismissLoadingScreen, setLoadingScreenStage, upgradeLoadingScreen } from './loading-screen.js';

// Remove authorization codes and provider errors from the address bar before
// loading assets or making the token request. NPM is separately configured to
// log only $uri (never $request_uri) on this host.
const initialSearch = location.search;
const oidcCallback = hasOidcCallback(initialSearch);
const loggingOut = new URLSearchParams(initialSearch).has('logout');
if (oidcCallback || loggingOut) history.replaceState(null, '', '/');

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
const inputElement = document.querySelector<HTMLInputElement>('#account-name');
if (canvasElement === null || inputElement === null) throw new Error('Missing account canvas controls');
const canvas: HTMLCanvasElement = canvasElement;
const input: HTMLInputElement = inputElement;
canvas.classList.add('account-screen');
const canvasContext = canvas.getContext('2d');
if (canvasContext === null) throw new Error('Canvas 2D unavailable');
const context: CanvasRenderingContext2D = canvasContext;
context.imageSmoothingEnabled = false;
const audio = new AudioBus(false);
void audio.playSong('theme_title');
void audio.unlock().catch(() => undefined);
setLoadingScreenStage({
  title: 'OPENING THE ORCHARD', detail: 'LAYING OUT THE ACCOUNT DESK', progress: 55,
});
const [ui, skin, orchardEmblem] = await Promise.all([
  loadPixelUi(), loadUiSkin(), loadGeneratedAsset('icon_resource_fruit', 'summer'),
]);
upgradeLoadingScreen(ui, skin, orchardEmblem);
const accountRibbon = new Ribbon(skin.banner, ui);
const orchardEmblemFrame = uiAssetFrame(orchardEmblem);
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
let viewport = canvasViewport(innerWidth, innerHeight);
let scene = centeredFixedSceneLayout(viewport.width, viewport.height);
let displayPixelRatio = Math.max(1, devicePixelRatio);
let navigationPending = false;

function navigateWithMusic(action: () => void): void {
  if (navigationPending) return;
  navigationPending = true;
  void audio.fadeOutForNavigation().finally(action);
}

function resize(): void {
  viewport = canvasViewport(innerWidth, innerHeight);
  scene = centeredFixedSceneLayout(viewport.width, viewport.height);
  displayPixelRatio = Math.max(1, devicePixelRatio);
  canvas.width = Math.round(viewport.width * displayPixelRatio);
  canvas.height = Math.round(viewport.height * displayPixelRatio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  context.imageSmoothingEnabled = false;
  const rect = canvas.getBoundingClientRect();
  input.style.left = `${rect.left + scene.x + 102 * scene.scale}px`;
  input.style.top = `${rect.top + scene.y + 187 * scene.scale}px`;
  input.style.width = `${276 * scene.scale}px`;
  input.style.height = `${23 * scene.scale}px`;
  input.hidden = !localPreview;
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

function drawText(text: string, x: number, y: number, color = '#f7e7b2', align: CanvasTextAlign = 'left'): void {
  drawPixelText(context, ui, text, x, y - 7, { align, color });
}

function drawAccountLogin(): void {
  drawUiSkinAsset(context, skin.panelParchment, { x: 82, y: 87, width: 316, height: 118 });
  if (authSession !== null) {
    drawText('SIGNED IN AS', 240, 111, '#91672e', 'center');
    drawText(authSession.displayName.toUpperCase(), 240, 129, '#6f451f', 'center');
    drawUiSkinAsset(context, skin.buttonConfirm, accountButtonRects.enterWorld, 'idle');
    drawText('ENTER THE ORCHARD', 240, 162, '#fff2d0', 'center');
    drawUiSkinAsset(context, skin.buttonDeny, accountButtonRects.signOut, 'idle');
    drawText('SIGN OUT', 240, 190, '#fff2d0', 'center');
    return;
  }
  drawText('VERIFIED EMAIL AND ACCOUNT RECOVERY', 240, 119, '#6f451f', 'center');
  drawUiSkinAsset(context, skin.buttonConfirm, accountButtonRects.signIn, 'idle');
  drawText(authBusy ? 'OPENING...' : 'SIGN IN', 167, 157, '#fff2d0', 'center');
  drawUiSkinAsset(context, skin.buttonConfirm, accountButtonRects.register, 'idle');
  drawText(authBusy ? 'OPENING...' : 'CREATE ACCOUNT', 313, 157, '#fff2d0', 'center');
  drawUiSkinAsset(context, skin.button, accountButtonRects.recover, 'idle');
  drawText('RECOVER ACCOUNT', 240, 188, '#5b3d22', 'center');
}

function drawLocalPreview(): void {
  const visibleStart = Math.max(0, Math.min(selected - 2, profiles.names.length - 5));
  const visible = profiles.names.slice(visibleStart, visibleStart + 5);
  if (visible.length === 0) drawText('NO SAVED FARMERS YET', 240, 116, '#91672e', 'center');
  for (const [index, name] of visible.entries()) {
    const absolute = visibleStart + index;
    const y = 96 + index * 20;
    drawUiSkinAsset(context, absolute === selected ? skin.buttonConfirm : skin.button, { x: 102, y: y - 13, width: 276, height: 18 }, 'idle');
    drawText(`${absolute === selected ? '> ' : '  '}${name.toUpperCase()}`, 111, y, absolute === selected ? '#fff2d0' : '#5b3d22');
  }
  drawText('NEW DEVELOPMENT FARMER', 102, 183, '#6f451f');
  drawUiSkinAsset(context, skin.frameThin, { x: 102, y: 187, width: 276, height: 23 });
  drawCanvasTextInput(context, ui, input, {
    x: 110,
    y: 193,
    width: 256,
    placeholder: 'TYPE 3-20 CHARACTERS',
    displayValue: input.value.toUpperCase(),
  });
}

function render(timeMs = performance.now()): void {
  context.setTransform(displayPixelRatio, 0, 0, displayPixelRatio, 0, 0);
  context.imageSmoothingEnabled = false;
  drawOrchardBackdrop(context, viewport.width, viewport.height, timeMs);
  context.save();
  context.translate(scene.x, scene.y);
  context.scale(scene.scale, scene.scale);
  const accountHeight = localPreview ? 222 : 200;
  drawUiSkinAsset(context, skin.panelWood, { x: 58, y: 25, width: 364, height: accountHeight });
  drawUiSkinAsset(context, skin.panelParchment, { x: 68, y: 35, width: 344, height: accountHeight - 20 });
  accountRibbon.draw(context, 'ORCHARD & CELLAR', 240, 21);
  drawPixelText(context, ui, `V${clientVersion}`, 402, 41, { align: 'right', color: '#91672e' });
  if (orchardEmblemFrame !== null) context.drawImage(
    orchardEmblem.image,
    orchardEmblemFrame.x, orchardEmblemFrame.y, orchardEmblemFrame.width, orchardEmblemFrame.height,
    232, 49, 16, 16,
  );
  if (localPreview) drawText('LOCAL DEVELOPMENT PREVIEW', 240, 73, '#91672e', 'center');
  drawText((authError ?? message).slice(0, 58).toUpperCase(), 240, 83, authError ? '#a43b2f' : '#6f451f', 'center');

  if (localPreview) drawLocalPreview();
  else drawAccountLogin();

  if (localPreview) drawText('ARROWS SELECT  ENTER CONTINUE  N NEW', 240, 218, '#6f451f', 'center');
  context.restore();
  requestAnimationFrame(render);
}

function submitLocal(): void {
  const name = input.value.trim();
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
    input.focus();
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
  message = 'OPENING SECURE LOGIN';
  try {
    await audio.fadeOutForNavigation();
    await beginOidcLogin(intent);
  } catch (error: unknown) {
    authBusy = false;
    authError = error instanceof Error ? error.message : 'Unable to start login.';
  }
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  void audio.unlock().catch(() => undefined);
  if (oidcConfigured && localProfilesEnabled && event.key.toLowerCase() === 'd' && document.activeElement !== input && !event.repeat) {
    localPreview = !localPreview;
    input.blur();
    resize();
    event.preventDefault();
    return;
  }
  if (!localPreview) {
    if (event.key === 'Enter' && !event.repeat) void submitAccount();
    else if (event.key.toLowerCase() === 'l' && authSession !== null && !event.repeat) {
      authSession = null;
      authBusy = true;
      message = 'SIGNING OUT';
      navigateWithMusic(() => { void signOutOidc(); });
    }
    return;
  }
  if (document.activeElement === input && event.key !== 'Escape') {
    if (event.key === 'Enter') submitLocal();
    return;
  }
  if (event.key === 'ArrowUp' && profiles.names.length > 0) {
    selected = (selected - 1 + profiles.names.length) % profiles.names.length;
    event.preventDefault();
  } else if (event.key === 'ArrowDown' && profiles.names.length > 0) {
    selected = (selected + 1) % profiles.names.length;
    event.preventDefault();
  } else if (event.key.toLowerCase() === 'n') {
    input.focus();
  } else if (event.key === 'Enter') {
    submitLocal();
  } else if (event.key === 'Escape') {
    input.value = '';
    input.blur();
    message = 'CHOOSE A FARMER OR TYPE A NEW NAME';
  }
});
canvas.addEventListener('pointerdown', (event) => {
  void audio.unlock().catch(() => undefined);
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left - scene.x) / scene.scale;
  const y = (event.clientY - rect.top - scene.y) / scene.scale;
  if (!localPreview) {
    const action = accountPointerAction(authSession !== null, x, y);
    if (action === 'enter-world') launchAccount();
    else if (action === 'sign-out') {
      authSession = null;
      authBusy = true;
      message = 'SIGNING OUT';
      navigateWithMusic(() => { void signOutOidc(); });
    } else if (action === 'sign-in') void submitAccount();
    else if (action === 'register') void submitAccount('register');
    else if (action === 'recover') void submitAccount('recover');
    return;
  }
  if (x >= 102 && x <= 378 && y >= 187 && y <= 207) {
    input.focus();
    return;
  }
  if (x < 102 || x > 378 || y < 85 || y > 190) return;
  const visibleStart = Math.max(0, Math.min(selected - 2, profiles.names.length - 5));
  const row = Math.floor((y - 85) / 20);
  const next = visibleStart + row;
  if (profiles.names[next] !== undefined) {
    selected = next;
    input.value = '';
    input.blur();
  }
});
input.addEventListener('input', () => {
  message = validLocalProfileName(input.value.trim()) ? 'PRESS ENTER TO CREATE OR CONTINUE' : 'TYPE A NEW FARMER NAME';
});

resize();
render();
requestAnimationFrame(() => dismissLoadingScreen());
