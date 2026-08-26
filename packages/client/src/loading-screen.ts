import { centeredFixedSceneLayout } from './display.js';
import type { LoadedAsset } from './render/assets.js';
import { drawPixelText, type PixelUi } from './render/pixel-ui.js';
import { drawOrchardBackdrop } from './ui/orchard-backdrop.js';
import { drawProgressBar, GREEN_PROGRESS_PALETTE, RED_PROGRESS_PALETTE } from './ui/progress-bar.js';
import { Ribbon } from './ui/ribbon.js';
import { drawUiSkinAsset, uiAssetFrame, type UiSkin } from './ui/skin.js';

export interface LoadingScreenStage {
  readonly title: string;
  readonly detail: string;
  readonly progress: number;
  readonly ready?: boolean;
  readonly error?: boolean;
}

export interface WorldLoadingState {
  readonly connected: boolean;
  readonly error: string | null;
  readonly identityReady: boolean;
  readonly worldReady: boolean;
  readonly playerReady: boolean;
  readonly profileReady: boolean;
}

let dismissed = false;
let lastStageKey = '';
let currentStage: LoadingScreenStage = {
  title: 'OPENING THE ORCHARD', detail: 'PREPARING YOUR JOURNEY', progress: 8,
};
let pixelFrameRequest: number | null = null;

export function worldLoadingStage(state: WorldLoadingState): LoadingScreenStage {
  if (state.error !== null) return {
    title: 'THE FERRY COULD NOT DOCK',
    detail: 'CHECK YOUR CONNECTION AND REFRESH TO TRY AGAIN',
    progress: 100,
    error: true,
  };
  if (!state.connected) return {
    title: 'SAILING TO YOUR ISLAND', detail: 'CONNECTING TO THE SHARED WORLD', progress: 58,
  };
  if (!state.identityReady) return {
    title: 'CHECKING THE PASSENGER LIST', detail: 'CONFIRMING YOUR FARMER', progress: 68,
  };
  if (!state.worldReady) return {
    title: 'GROWING YOUR ISLAND', detail: 'READING TERRAIN, TIME, AND WEATHER', progress: 78,
  };
  if (!state.playerReady) return {
    title: 'FINDING YOUR FARMER', detail: 'PREPARING YOUR STARTING PLACE', progress: 88,
  };
  if (!state.profileReady) return {
    title: 'UNPACKING YOUR THINGS', detail: 'LOADING YOUR CHARACTER AND INVENTORY', progress: 95,
  };
  return { title: 'WELCOME TO THE ORCHARD', detail: 'YOUR ISLAND IS READY', progress: 100, ready: true };
}

export function setLoadingScreenStage(stage: LoadingScreenStage): void {
  if (dismissed) return;
  currentStage = stage;
  const root = document.querySelector<HTMLElement>('#loading-screen');
  const title = document.querySelector<HTMLElement>('#loading-title');
  const detail = document.querySelector<HTMLElement>('#loading-detail');
  const progress = document.querySelector<HTMLProgressElement>('#loading-progress');
  if (root === null || title === null || detail === null || progress === null) return;
  const stageKey = `${stage.title}\u0000${stage.detail}\u0000${stage.progress}\u0000${stage.error === true}`;
  if (stageKey === lastStageKey) return;
  lastStageKey = stageKey;
  title.textContent = stage.title;
  detail.textContent = stage.detail;
  progress.value = Math.max(0, Math.min(100, stage.progress));
  progress.textContent = `${progress.value}%`;
  root.classList.toggle('is-error', stage.error === true);
}

/** Upgrade the dependency-free bootstrap card to the same atlas-backed canvas
 * language as the account and in-game UI once those assets are available. */
export function upgradeLoadingScreen(ui: PixelUi, skin: UiSkin, emblem: LoadedAsset): void {
  if (dismissed || pixelFrameRequest !== null) return;
  const root = document.querySelector<HTMLElement>('#loading-screen');
  const canvas = document.querySelector<HTMLCanvasElement>('#loading-canvas');
  if (root === null || canvas === null) return;
  const context = canvas.getContext('2d');
  if (context === null) return;
  const ribbon = new Ribbon(skin.banner, ui);
  root.classList.add('is-pixel-ready');

  const draw = (timeMs: number): void => {
    if (dismissed) { pixelFrameRequest = null; return; }
    const width = Math.max(1, Math.floor(root.clientWidth));
    const height = Math.max(1, Math.floor(root.clientHeight));
    const dpr = Math.max(1, devicePixelRatio);
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOrchardBackdrop(context, width, height, timeMs);

    const scene = centeredFixedSceneLayout(width, height);
    context.save();
    context.translate(scene.x, scene.y);
    context.scale(scene.scale, scene.scale);
    const panel = { x: 58, y: 34, width: 364, height: 204 };
    drawUiSkinAsset(context, skin.panelWood, panel);
    drawUiSkinAsset(context, skin.panelParchment, { x: 68, y: 44, width: 344, height: 184 });
    ribbon.draw(context, 'ORCHARD & CELLAR', 240, 26);

    const emblemFrame = uiAssetFrame(emblem);
    if (emblemFrame !== null) context.drawImage(
      emblem.image,
      emblemFrame.x, emblemFrame.y, emblemFrame.width, emblemFrame.height,
      224, 65, 32, 32,
    );
    drawPixelText(context, ui, currentStage.title, 240, 108, {
      align: 'center', color: currentStage.error === true ? '#a43b2f' : '#5c3528', font: 'header',
    });
    drawPixelText(context, ui, currentStage.detail, 240, 132, {
      align: 'center', color: '#8b5b3c',
    });

    drawProgressBar(
      context,
      { x: 112, y: 153, width: 256, height: 10 },
      currentStage.progress / 100,
      currentStage.error === true ? RED_PROGRESS_PALETTE : GREEN_PROGRESS_PALETTE,
    );
    drawPixelText(context, ui, `${Math.round(currentStage.progress)}%`, 240, 173, {
      align: 'center', color: '#6f451f',
    });

    const activeSprout = Math.floor(timeMs / 180) % 5;
    for (let index = 0; index < 5; index += 1) {
      const x = 218 + index * 11;
      const raised = index === activeSprout ? 2 : 0;
      context.fillStyle = index <= activeSprout ? '#4d8b43' : '#7b4b2e';
      context.fillRect(x, 190 - raised, 4, 4);
      if (index === activeSprout) {
        context.fillRect(x - 2, 188 - raised, 2, 2);
        context.fillRect(x + 4, 187 - raised, 2, 3);
      }
    }
    drawPixelText(context, ui, 'PLEASE WAIT WHILE YOUR ISLAND GROWS', 240, 205, {
      align: 'center', color: '#744a35',
    });
    context.restore();
    pixelFrameRequest = requestAnimationFrame(draw);
  };
  pixelFrameRequest = requestAnimationFrame(draw);
}

export function dismissLoadingScreen(): void {
  if (dismissed) return;
  dismissed = true;
  if (pixelFrameRequest !== null) cancelAnimationFrame(pixelFrameRequest);
  pixelFrameRequest = null;
  const root = document.querySelector<HTMLElement>('#loading-screen');
  document.querySelector<HTMLElement>('#game-shell')?.setAttribute('aria-busy', 'false');
  if (root === null) return;
  root.classList.add('is-leaving');
  window.setTimeout(() => { root.hidden = true; }, 360);
}
