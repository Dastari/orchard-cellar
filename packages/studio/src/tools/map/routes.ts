export const STUDIO_MAP_PATH = '/build/map';
export const STUDIO_TERRAIN_LAB_PATH = '/build/map/terrain-lab';
export const STUDIO_PROCEDURAL_MAP_PATH = '/build/map/procedural-world';

const MAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

export function studioMapId(pathname: string): string {
  if (pathname === STUDIO_MAP_PATH || pathname === `${STUDIO_MAP_PATH}/`) return 'live-island';
  const match = /^\/build\/map\/([^/]+)\/?$/u.exec(pathname);
  return match !== null && MAP_ID.test(match[1] ?? '') ? match[1]! : 'live-island';
}

export function studioObjectId(pathname: string): string {
  const match = /^\/build\/object\/([^/]+)\/?$/u.exec(pathname);
  return match !== null && MAP_ID.test(match[1] ?? '') ? match[1]! : 'untitled-layout';
}

