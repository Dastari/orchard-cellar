import { layoutUiAnchoredRect, layoutUiFlex, type UiRect } from '@orchard/ui';

export interface StudioShellRegionLayout {
  readonly viewport: UiRect;
  /** Site-wide icon navigation. This is deliberately independent of the route. */
  readonly globalNav: UiRect;
  /** The route canvas owns all space to the right of global navigation. */
  readonly workingCanvas: UiRect;
  /** Floating route-tool drawer, inset over workingCanvas. */
  readonly toolDrawer: UiRect;
  /** Floating contextual drawer, inset over workingCanvas. */
  readonly inspectorDrawer: UiRect;
  /** Invisible pointer/focus target overlapping the tool drawer's right frame edge. */
  readonly leftResizeHandle: UiRect;
  /** Invisible pointer/focus target overlapping the inspector drawer's left frame edge. */
  readonly rightResizeHandle: UiRect;
  readonly compact: boolean;
}

const VIEWPORT_PADDING = 6;
const DRAWER_INSET = 8;
const RESIZE_HIT_WIDTH = 12;

/**
 * Teams-style global rail plus a route-owned canvas. Drawers are anchored over
 * that canvas rather than participating in its row layout, so map rendering can
 * extend behind them and no divider column steals workspace pixels.
 */
export function layoutStudioShellRegions(
  width: number,
  height: number,
  drawerWidths: Readonly<{ left: number; right: number }> = { left: 270, right: 286 },
): StudioShellRegionLayout {
  const viewport = Object.freeze({
    x: 0,
    y: 0,
    width: Math.max(560, Math.floor(width)),
    height: Math.max(420, Math.floor(height)),
  });
  const compact = viewport.width < 900;
  const railWidth = compact ? 68 : 76;
  const preferredLeft = Math.max(180, Math.min(420,
    compact ? Math.min(220, drawerWidths.left) : drawerWidths.left));
  const preferredRight = Math.max(180, Math.min(420,
    compact ? Math.min(220, drawerWidths.right) : drawerWidths.right));
  const [globalNav, workingCanvas] = layoutUiFlex(viewport, [
    { minSize: { width: railWidth, height: 1 }, main: { mode: 'fixed', size: railWidth } },
    { minSize: { width: 180, height: 1 }, main: { mode: 'grow', min: 180, weight: 1 } },
  ], { direction: 'row', gap: 0, padding: VIEWPORT_PADDING, align: 'stretch' });

  const drawerHeight = Math.max(1, workingCanvas!.height - DRAWER_INSET * 2);
  const toolDrawer = layoutUiAnchoredRect(workingCanvas!, {
    width: preferredLeft,
    height: drawerHeight,
  }, {
    targetAnchor: 'top_left',
    selfAnchor: 'top_left',
    offset: { x: DRAWER_INSET, y: DRAWER_INSET },
    constrainTo: workingCanvas!,
  });
  const inspectorDrawer = layoutUiAnchoredRect(workingCanvas!, {
    width: preferredRight,
    height: drawerHeight,
  }, {
    targetAnchor: 'top_right',
    selfAnchor: 'top_right',
    offset: { x: -DRAWER_INSET, y: DRAWER_INSET },
    constrainTo: workingCanvas!,
  });
  const leftResizeHandle = Object.freeze({
    x: toolDrawer.x + toolDrawer.width - RESIZE_HIT_WIDTH / 2,
    y: toolDrawer.y,
    width: RESIZE_HIT_WIDTH,
    height: toolDrawer.height,
  });
  const rightResizeHandle = Object.freeze({
    x: inspectorDrawer.x - RESIZE_HIT_WIDTH / 2,
    y: inspectorDrawer.y,
    width: RESIZE_HIT_WIDTH,
    height: inspectorDrawer.height,
  });

  return Object.freeze({
    viewport,
    globalNav: globalNav!,
    workingCanvas: workingCanvas!,
    toolDrawer,
    inspectorDrawer,
    leftResizeHandle,
    rightResizeHandle,
    compact,
  });
}
