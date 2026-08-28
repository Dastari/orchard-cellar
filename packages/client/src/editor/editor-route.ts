export interface OfflineEditorRoute {
  readonly kind: 'offline_editor';
  readonly mapId: string;
}

export interface OfflineDesignEditorRoute {
  readonly kind: 'offline_design_editor';
  readonly stampId: string;
}

export interface StandardClientRoute {
  readonly kind: 'standard';
}

export interface UiLabRoute {
  readonly kind: 'ui_lab';
}

export type ClientEntryRoute = OfflineEditorRoute | OfflineDesignEditorRoute | UiLabRoute | StandardClientRoute;

export const DEFAULT_OFFLINE_EDITOR_MAP_ID = 'procedural-world';
export const UI_LAB_PATH = '/ui-lab';

const EDITOR_MAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

function validMapId(requestedMap: string | null, fallback: string): string {
  return requestedMap !== null && EDITOR_MAP_ID.test(requestedMap) ? requestedMap : fallback;
}

/** Canonical public URL for a map in the authentication-free editor. */
export function offlineEditorPath(mapId: string): string {
  const safeMapId = validMapId(mapId, DEFAULT_OFFLINE_EDITOR_MAP_ID);
  return safeMapId === DEFAULT_OFFLINE_EDITOR_MAP_ID
    ? '/editor'
    : `/editor/offline/${safeMapId}`;
}

/** Canonical public URL for a reusable scenery-layout draft. */
export function offlineDesignEditorPath(stampId = 'untitled-layout'): string {
  const safeStampId = validMapId(stampId, 'untitled-layout');
  return safeStampId === 'untitled-layout'
    ? '/editor/design'
    : `/editor/design/${safeStampId}`;
}

/**
 * Resolve the application entry from the pathname. Query parameters may hold
 * editor state such as `seed`, but no longer decide which application starts.
 *
 * The old query-only entry remains a compatibility alias and is immediately
 * canonicalized by `main.ts`. A future `/editor/live` route deliberately falls
 * through to the authenticated client rather than inheriting this bypass.
 */
export function clientEntryRoute(pathname: string, search = ''): ClientEntryRoute {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname;
  if (normalizedPath === UI_LAB_PATH || normalizedPath === '/ui') return { kind: 'ui_lab' };
  if (normalizedPath === '/editor/design') {
    return { kind: 'offline_design_editor', stampId: 'untitled-layout' };
  }
  const designMatch = /^\/editor\/design\/([^/]+)$/u.exec(normalizedPath);
  if (designMatch !== null) {
    return {
      kind: 'offline_design_editor',
      stampId: validMapId(designMatch[1] ?? null, 'untitled-layout'),
    };
  }
  if (normalizedPath === '/editor' || normalizedPath === '/editor/offline') {
    return { kind: 'offline_editor', mapId: DEFAULT_OFFLINE_EDITOR_MAP_ID };
  }

  const offlineMapMatch = /^\/editor\/offline\/([^/]+)$/u.exec(normalizedPath);
  if (offlineMapMatch !== null) {
    return {
      kind: 'offline_editor',
      mapId: validMapId(offlineMapMatch[1] ?? null, DEFAULT_OFFLINE_EDITOR_MAP_ID),
    };
  }

  if (normalizedPath !== '/' && normalizedPath !== '/editor.html') return { kind: 'standard' };

  const parameters = new URLSearchParams(search);
  if (parameters.get('mode') !== 'editor' || parameters.get('source') !== 'offline') {
    return { kind: 'standard' };
  }
  const mapId = validMapId(parameters.get('map'), 'terrain-lab');
  return { kind: 'offline_editor', mapId };
}
