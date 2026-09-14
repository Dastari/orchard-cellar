import type { StudioCanvasSplitDirection } from './canvas-split.js';
import type { StudioWorkspaceLayout } from './layouts.js';

export const STUDIO_CANVAS_LAYOUT_SESSION_VERSION = 1;
export const STUDIO_CANVAS_LAYOUT_RATIO_MINIMUM = 0.25;
export const STUDIO_CANVAS_LAYOUT_RATIO_MAXIMUM = 0.75;
const STUDIO_CANVAS_LAYOUT_SESSION_PREFIX = 'orchard-studio:canvas-layout:v1:';

export interface StudioCanvasLayoutState {
  readonly version: typeof STUDIO_CANVAS_LAYOUT_SESSION_VERSION;
  readonly splitOpen: boolean;
  readonly direction: StudioCanvasSplitDirection;
  readonly ratio: number;
  readonly secondaryPath: string | null;
}

export interface StudioCanvasLayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function defaultStudioCanvasLayoutState(): StudioCanvasLayoutState {
  return Object.freeze({
    version: STUDIO_CANVAS_LAYOUT_SESSION_VERSION,
    splitOpen: false,
    direction: 'row',
    ratio: 0.5,
    secondaryPath: null,
  });
}

export function clampStudioCanvasLayoutRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(STUDIO_CANVAS_LAYOUT_RATIO_MINIMUM,
    Math.min(STUDIO_CANVAS_LAYOUT_RATIO_MAXIMUM, value));
}

function routePath(value: unknown): string | null {
  return typeof value === 'string' && /^\/[a-z0-9][a-z0-9/-]*$/u.test(value) ? value : null;
}

export function normalizeStudioCanvasLayoutState(value: unknown): StudioCanvasLayoutState {
  if (typeof value !== 'object' || value === null) return defaultStudioCanvasLayoutState();
  const candidate = value as Partial<StudioCanvasLayoutState>;
  if (candidate.version !== STUDIO_CANVAS_LAYOUT_SESSION_VERSION) {
    return defaultStudioCanvasLayoutState();
  }
  const secondaryPath = routePath(candidate.secondaryPath);
  return Object.freeze({
    version: STUDIO_CANVAS_LAYOUT_SESSION_VERSION,
    splitOpen: candidate.splitOpen === true && secondaryPath !== null,
    direction: candidate.direction === 'column' ? 'column' : 'row',
    ratio: clampStudioCanvasLayoutRatio(typeof candidate.ratio === 'number' ? candidate.ratio : 0.5),
    secondaryPath,
  });
}

/** Route paths identify the retained document for current Studio tools: Map's
 * live island, Terrain Lab, and Procedural World already have distinct paths. */
export function studioCanvasLayoutSessionKey(route: string): string {
  const path = routePath(route) ?? '/build/map';
  return `${STUDIO_CANVAS_LAYOUT_SESSION_PREFIX}${encodeURIComponent(path)}`;
}

export function restoreStudioCanvasLayoutState(
  storage: StudioCanvasLayoutStorage | null,
  route: string,
): StudioCanvasLayoutState {
  if (storage === null) return defaultStudioCanvasLayoutState();
  const key = studioCanvasLayoutSessionKey(route);
  try {
    const source = storage.getItem(key);
    return source === null ? defaultStudioCanvasLayoutState()
      : normalizeStudioCanvasLayoutState(JSON.parse(source));
  } catch {
    try { storage.removeItem?.(key); } catch { /* Non-persistent sandbox. */ }
    return defaultStudioCanvasLayoutState();
  }
}

export function persistStudioCanvasLayoutState(
  storage: StudioCanvasLayoutStorage | null,
  route: string,
  state: StudioCanvasLayoutState,
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(studioCanvasLayoutSessionKey(route), JSON.stringify(normalizeStudioCanvasLayoutState(state)));
    return true;
  } catch { return false; }
}

export function openStudioCanvasSplit(
  state: StudioCanvasLayoutState,
  secondaryPath: string,
): StudioCanvasLayoutState {
  return normalizeStudioCanvasLayoutState({ ...state, splitOpen: true, secondaryPath });
}

/** Closing is reversible: the secondary route, ratio, and direction remain in
 * the session snapshot so reopening deterministically restores the same panes. */
export function closeStudioCanvasSplit(state: StudioCanvasLayoutState): StudioCanvasLayoutState {
  return Object.freeze({ ...state, splitOpen: false });
}

export function resizeStudioCanvasSplit(
  state: StudioCanvasLayoutState,
  ratio: number,
): StudioCanvasLayoutState {
  return Object.freeze({ ...state, ratio: clampStudioCanvasLayoutRatio(ratio) });
}

export function rotateStudioCanvasSplit(state: StudioCanvasLayoutState): StudioCanvasLayoutState {
  return Object.freeze({ ...state, direction: state.direction === 'row' ? 'column' : 'row' });
}

export function selectStudioCanvasSecondary(
  state: StudioCanvasLayoutState,
  secondaryPath: string,
): StudioCanvasLayoutState {
  const normalized = routePath(secondaryPath);
  return normalized === null ? state : Object.freeze({ ...state, secondaryPath: normalized });
}

export function studioCanvasWorkspaceLayout(
  state: StudioCanvasLayoutState,
  primaryRoute: string,
): StudioWorkspaceLayout {
  return Object.freeze({
    direction: state.direction === 'row' ? 'horizontal' : 'vertical',
    primaryRoute: routePath(primaryRoute),
    secondaryRoute: state.splitOpen ? state.secondaryPath : null,
    ratio: state.ratio,
  });
}

export function studioCanvasStateFromWorkspace(
  workspace: StudioWorkspaceLayout,
  primaryRoute: string,
): StudioCanvasLayoutState | null {
  const primary = routePath(primaryRoute);
  if (primary === null || workspace.primaryRoute !== primary) return null;
  return normalizeStudioCanvasLayoutState({
    version: STUDIO_CANVAS_LAYOUT_SESSION_VERSION,
    splitOpen: workspace.secondaryRoute !== null,
    direction: workspace.direction === 'vertical' ? 'column' : 'row',
    ratio: workspace.ratio,
    secondaryPath: workspace.secondaryRoute,
  });
}

export function studioCanvasNamedLayoutName(toolLabel: string, route: string): string {
  const leaf = (routePath(route)?.split('/').filter(Boolean).at(-1) ?? 'workspace').slice(0, 20);
  const label = toolLabel.trim().replace(/\s+/gu, ' ').slice(0, 40) || 'Studio';
  return [...`${label} · ${leaf}`].slice(0, 64).join('');
}
