export const STUDIO_MAP_PATH = '/build/map';
export const STUDIO_TERRAIN_LAB_PATH = '/build/map/terrain-lab';
export const STUDIO_PROCEDURAL_MAP_PATH = '/build/map/procedural-world';

const MAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

export type StudioSpaceRef = { readonly kind: 'document'; readonly mapId: string }
  | { readonly kind: 'space'; readonly spaceId: number; readonly readOnly: true };

/** Runtime space routes never resolve to the editable live-island document. */
export function studioSpaceRef(pathname: string): StudioSpaceRef | null {
  const match = /^\/build\/map\/space\/(0|[1-9][0-9]{0,4})\/?$/u.exec(pathname);
  if (match !== null) {
    const spaceId = Number(match[1]);
    return spaceId <= 65_535 ? { kind: 'space', spaceId, readOnly: true } : null;
  }
  if (pathname === `${STUDIO_MAP_PATH}/space` || pathname.startsWith(`${STUDIO_MAP_PATH}/space/`)) return null;
  if (pathname === STUDIO_MAP_PATH || pathname === `${STUDIO_MAP_PATH}/`) return { kind: 'document', mapId: 'live-island' };
  const document = /^\/build\/map\/([^/]+)\/?$/u.exec(pathname);
  return document !== null && MAP_ID.test(document[1] ?? '') ? { kind: 'document', mapId: document[1]! } : null;
}

export function studioSpacePath(spaceId: number): string {
  if (!Number.isInteger(spaceId) || spaceId < 0 || spaceId > 65_535) throw new Error('invalid_space_id');
  return `${STUDIO_MAP_PATH}/space/${spaceId}`;
}

export function studioMapId(pathname: string): string {
  if (pathname.startsWith(`${STUDIO_MAP_PATH}/space/`)) throw new Error('runtime_space_is_not_a_map_document');
  if (pathname === STUDIO_MAP_PATH || pathname === `${STUDIO_MAP_PATH}/`) return 'live-island';
  const match = /^\/build\/map\/([^/]+)\/?$/u.exec(pathname);
  return match !== null && MAP_ID.test(match[1] ?? '') ? match[1]! : 'live-island';
}

export function studioObjectId(pathname: string): string {
  const match = /^\/build\/object\/([^/]+)\/?$/u.exec(pathname);
  return match !== null && MAP_ID.test(match[1] ?? '') ? match[1]! : 'untitled-layout';
}
