import type { UiPoint, UiRect } from '@orchard/ui/studio';
import { clampStudioCanvasLayoutRatio } from './canvas-layout-state.js';
import type { StudioToolRoute } from './tool-registry.js';

export type StudioCanvasSplitDirection = 'row' | 'column';

export interface StudioCanvasSplitLayout {
  readonly primary: UiRect;
  /** Invisible hit band overlapping the shared pane edge. It consumes no
   * layout pixels and must not be drawn as an inserted separator. */
  readonly handle: UiRect;
  readonly secondary: UiRect;
}

export const STUDIO_CANVAS_SPLIT_MINIMUM_PANE_SIZE = 240;
export const STUDIO_CANVAS_SPLIT_HIT_WIDTH = 12;

function splitExtent(bounds: UiRect, direction: StudioCanvasSplitDirection): number {
  return Math.max(2, direction === 'row' ? bounds.width : bounds.height);
}

function boundedPrimarySize(
  extent: number,
  ratio: number,
  minimumPaneSize: number,
): number {
  const minimum = Math.max(1, Math.min(Math.floor(extent / 2), Math.round(minimumPaneSize)));
  return Math.max(minimum, Math.min(extent - minimum,
    Math.round(extent * clampStudioCanvasLayoutRatio(ratio))));
}

export function layoutStudioCanvasSplit(
  bounds: UiRect,
  direction: StudioCanvasSplitDirection,
  ratio = 0.5,
  minimumPaneSize = STUDIO_CANVAS_SPLIT_MINIMUM_PANE_SIZE,
): StudioCanvasSplitLayout {
  const extent = splitExtent(bounds, direction);
  const primarySize = boundedPrimarySize(extent, ratio, minimumPaneSize);
  if (direction === 'row') {
    const boundary = bounds.x + primarySize;
    return Object.freeze({
      primary: Object.freeze({ ...bounds, width: primarySize }),
      handle: Object.freeze({ x: boundary - STUDIO_CANVAS_SPLIT_HIT_WIDTH / 2, y: bounds.y,
        width: STUDIO_CANVAS_SPLIT_HIT_WIDTH, height: bounds.height }),
      secondary: Object.freeze({ x: boundary, y: bounds.y,
        width: Math.max(1, bounds.width - primarySize), height: bounds.height }),
    });
  }
  const boundary = bounds.y + primarySize;
  return Object.freeze({
    primary: Object.freeze({ ...bounds, height: primarySize }),
    handle: Object.freeze({ x: bounds.x, y: boundary - STUDIO_CANVAS_SPLIT_HIT_WIDTH / 2,
      width: bounds.width, height: STUDIO_CANVAS_SPLIT_HIT_WIDTH }),
    secondary: Object.freeze({ x: bounds.x, y: boundary,
      width: bounds.width, height: Math.max(1, bounds.height - primarySize) }),
  });
}

export function studioCanvasSplitRatioAtPoint(
  bounds: UiRect,
  direction: StudioCanvasSplitDirection,
  point: UiPoint,
  minimumPaneSize = STUDIO_CANVAS_SPLIT_MINIMUM_PANE_SIZE,
): number {
  const extent = splitExtent(bounds, direction);
  const offset = direction === 'row' ? point.x - bounds.x : point.y - bounds.y;
  return boundedPrimarySize(extent, offset / extent, minimumPaneSize) / extent;
}

export function nextStudioSecondaryRoute(
  routes: readonly StudioToolRoute[],
  primaryToolId: string,
  currentPath: string | null,
): StudioToolRoute | null {
  const candidates = routes.filter((candidate, index, all) => candidate.tool.id !== primaryToolId
    && all.findIndex(({ tool }) => tool.id === candidate.tool.id) === index);
  if (candidates.length === 0) return null;
  const current = candidates.findIndex(({ path }) => path === currentPath);
  return candidates[(current + 1) % candidates.length]!;
}
