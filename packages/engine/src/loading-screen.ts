import { loadGeneratedAsset, loadUiKitArt, UiRoot, ui, uiFixed, type LoadedAsset, type UiKitArt } from '@orchard/ui';

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
let resizeListener: (() => void) | null = null;
let disposePresentation: (() => void) | null = null;
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
  initializationPromise ??= Promise.all([
    loadUiKitArt({ families: ['frame', 'meter', 'feedback'], icons: [] }),
    loadGeneratedAsset('icon_resource_fruit', 'summer'),
  ]).then(([art, apple]) => {
    upgradeLoadingScreen(art, apple);
  });
  return initializationPromise;
}

/** Render loading directly into the permanent game canvas. */
export function upgradeLoadingScreen(art: UiKitArt, emblem: LoadedAsset): void {
  if (dismissed || disposePresentation !== null) return;
  const status = document.querySelector<HTMLElement>('#loading-screen');
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (status === null || canvas === null) return;
  const context = canvas.getContext('2d');
  if (context === null) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = new UiRoot({ art, scale: 1, reducedMotion: motion.matches });
  root.mount(ui.orchardBackdrop());
  const frame = ui.loadingGateway({ model: currentStage, emblem, version: clientVersion, layout: { position: 'fixed' } });
  root.mount(frame);
  const resize = (): void => {
    const width = Math.max(1, Math.floor(innerWidth));
    const height = Math.max(1, Math.floor(innerHeight));
    const dpr = Math.max(1, devicePixelRatio);
    const scale = Math.max(1, Math.min(3, Math.floor(Math.min(width / 480, height / 270)))) as 1 | 2 | 3;
    root.setScale(scale); root.resize(width, height, dpr);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const frameWidth = Math.max(0, Math.min(420, root.viewport.width - 16));
    const frameHeight = Math.max(0, Math.min(220, root.viewport.height - 16));
    frame.setStyle({ width: uiFixed(frameWidth), height: uiFixed(frameHeight), inset: {
      left: uiFixed((root.viewport.width - frameWidth) / 2), top: uiFixed((root.viewport.height - frameHeight) / 2),
    } });
  };
  const draw = (time: number): void => {
    pixelFrameRequest = null;
    if (dismissed || document.hidden) return;
    frame.updateLoading(currentStage); root.draw(context, time);
    pixelFrameRequest = requestAnimationFrame(draw);
  };
  const resume = (): void => {
    if (pixelFrameRequest !== null) cancelAnimationFrame(pixelFrameRequest);
    pixelFrameRequest = null;
    if (!document.hidden && !dismissed) { resize(); pixelFrameRequest = requestAnimationFrame(draw); }
  };
  const updateMotion = (): void => { root.reducedMotion = motion.matches; };
  const wheel = (event: WheelEvent): void => {
    const bounds = canvas.getBoundingClientRect();
    if (root.wheel({ point: { x: (event.clientX - bounds.left) / root.scale, y: (event.clientY - bounds.top) / root.scale },
      deltaX: event.deltaX / root.scale, deltaY: event.deltaY / root.scale })) event.preventDefault();
  };
  resizeListener = resize;
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', resume);
  motion.addEventListener('change', updateMotion);
  canvas.addEventListener('wheel', wheel, { passive: false });
  disposePresentation = () => {
    document.removeEventListener('visibilitychange', resume);
    motion.removeEventListener('change', updateMotion);
    canvas.removeEventListener('wheel', wheel);
    root.dispose();
  };
  resize(); resume();
}

export function dismissLoadingScreen(): void {
  if (dismissed) return;
  dismissed = true;
  if (pixelFrameRequest !== null) cancelAnimationFrame(pixelFrameRequest);
  pixelFrameRequest = null;
  if (resizeListener !== null) window.removeEventListener('resize', resizeListener);
  resizeListener = null;
  disposePresentation?.();
  disposePresentation = null;
  const root = document.querySelector<HTMLElement>('#loading-screen');
  document.querySelector<HTMLElement>('#game-shell')?.setAttribute('aria-busy', 'false');
  if (root === null) return;
  root.hidden = true;
}
