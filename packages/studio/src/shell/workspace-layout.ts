import type { StudioCanvasLayoutStorage } from './canvas-layout-state.js';
import type { StudioDockLayoutItem } from './layouts.js';

export const STUDIO_WORKSPACE_VIEWS = ['both', 'controls', 'inspector', 'none'] as const;
export type StudioWorkspaceView = typeof STUDIO_WORKSPACE_VIEWS[number];

export function normalizeStudioWorkspaceView(value: unknown): StudioWorkspaceView {
  return STUDIO_WORKSPACE_VIEWS.includes(value as StudioWorkspaceView) ? value as StudioWorkspaceView : 'both';
}

const viewKey = (route: string) => `orchard-studio:workspace-view:v1:${encodeURIComponent(route)}`;

export function restoreStudioWorkspaceView(storage: StudioCanvasLayoutStorage | null, route: string): StudioWorkspaceView {
  try { return normalizeStudioWorkspaceView(storage?.getItem(viewKey(route))); }
  catch { return 'both'; }
}

export function persistStudioWorkspaceView(storage: StudioCanvasLayoutStorage | null, route: string, view: StudioWorkspaceView): void {
  try { storage?.setItem(viewKey(route), view); } catch { /* Optional session storage. */ }
}

/** Widths are physical pixels; the retained kit receives half of this value. */
export function clampStudioDrawerWidth(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(236, Math.min(960, Math.round(value))) : fallback;
}

/** Store panel visibility using the existing versioned dock collapsed fields. */
export function studioWorkspaceLayoutDocks(docks: readonly StudioDockLayoutItem[], widths: { readonly left: number; readonly right: number }, view: StudioWorkspaceView): readonly StudioDockLayoutItem[] {
  const withInspector = docks.some(dock => dock.placement === 'right') ? docks
    : [...docks, { id: 'inspector' as const, placement: 'right' as const, order: 0, size: widths.right, collapsed: false }];
  return withInspector.map(dock => Object.freeze({ ...dock,
    size: dock.placement === 'left' ? widths.left : dock.placement === 'right' ? widths.right : dock.size,
    collapsed: dock.placement === 'left' ? view === 'inspector' || view === 'none'
      : dock.placement === 'right' ? view === 'controls' || view === 'none' : dock.collapsed,
  }));
}

export function studioWorkspaceViewFromDocks(docks: readonly StudioDockLayoutItem[]): StudioWorkspaceView {
  const controls = docks.some(dock => dock.placement === 'left' && !dock.collapsed);
  const inspector = docks.some(dock => dock.placement === 'right' && !dock.collapsed);
  return controls && inspector ? 'both' : controls ? 'controls' : inspector ? 'inspector' : 'none';
}
