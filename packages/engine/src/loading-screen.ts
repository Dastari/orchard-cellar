import { canvasHostViewport, canvasSafeAreaInsets, insetCanvasViewport } from './display.js';
import { GameGatewayLoading, gameGatewayLayout, loadUiKitArt, type UiKitArt } from '@orchard/ui/game';
import { loadGeneratedAsset, type LoadedAsset } from '@orchard/ui';
import { drawOrchardBackdrop, loadOrchardBackdrop } from '@orchard/ui';

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
let initializationPromise: Promise<void> | null = null;
let loadingView: GameGatewayLoading | null = null;
let resizeListener: (() => void) | null = null;
const clientVersion = import.meta.env.VITE_CLIENT_VERSION;

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
  const progress = document.querySelector<HTMLElement>('#loading-progress');
  if (root === null || title === null || detail === null || progress === null) return;
  const stageKey = `${stage.title}\u0000${stage.detail}\u0000${stage.progress}\u0000${stage.error === true}`;
  if (stageKey === lastStageKey) return;
  lastStageKey = stageKey;
  title.textContent = stage.title;
  detail.textContent = stage.detail;
  const progressValue = Math.max(0, Math.min(100, stage.progress));
  progress.textContent = `${progressValue}%`;
  root.setAttribute('aria-label', `${stage.title}. ${progressValue}%`);
}

/** Load only the small shared UI atlases before routing to account or world code.
 * This keeps a hard refresh on the same canvas and frame used by every later
 * gateway state instead of briefly mounting an unrelated HTML card. */
export function initializeLoadingScreen(): Promise<void> {
  void loadOrchardBackdrop();
  initializationPromise ??= Promise.all([
    loadUiKitArt({ families: ['frame', 'meter', 'feedback', 'slider'], icons: [] }),
    loadGeneratedAsset('icon_resource_fruit', 'summer'),
  ]).then(([kitArt, apple]) => { upgradeLoadingScreen(kitArt, apple); });
  return initializationPromise;
}

/** Render loading directly into the permanent game canvas. */
export function upgradeLoadingScreen(
  kitArt: UiKitArt,
  emblem: LoadedAsset,
): void {
  if (dismissed || pixelFrameRequest !== null) return;
  const root = document.querySelector<HTMLElement>('#loading-screen');
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (root === null || canvas === null) return;
  const context = canvas.getContext('2d');
  if (context === null) return;
  loadingView = new GameGatewayLoading(kitArt, { emblem, version: clientVersion });

  const resize = (): void => {
    const { width, height } = canvasHostViewport(canvas);
    const dpr = Math.max(1, devicePixelRatio);
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  };
  resizeListener = resize;
  window.addEventListener('resize', resize);
  resize();

  const draw = (): void => {
    if (dismissed) { pixelFrameRequest = null; return; }
    const width = Math.max(1, Math.floor(canvas.clientWidth));
    const height = Math.max(1, Math.floor(canvas.clientHeight));
    const dpr = Math.max(1, devicePixelRatio);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) resize();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOrchardBackdrop(context, width, height);

    const safe = canvasSafeAreaInsets(canvas), viewport = insetCanvasViewport(width, height, safe);
    const scene = gameGatewayLayout(viewport.width, viewport.height);
    context.save();
    context.translate(safe.left, safe.top); context.scale(scene.scale, scene.scale);
    loadingView!.setBounds(scene.frame, scene.width, scene.height);
    loadingView!.update(currentStage); loadingView!.draw(context);
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
  if (resizeListener !== null) window.removeEventListener('resize', resizeListener);
  resizeListener = null;
  loadingView?.dispose(); loadingView = null;
  const root = document.querySelector<HTMLElement>('#loading-screen');
  document.querySelector<HTMLElement>('#game-shell')?.setAttribute('aria-busy', 'false');
  if (root === null) return;
  root.hidden = true;
}
