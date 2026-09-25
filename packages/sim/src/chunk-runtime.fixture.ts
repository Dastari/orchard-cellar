import { encodeWorldChunk, decodeWorldChunk, WORLD_CHUNK_STRIDE, type ChunkArray, type WorldChunkManifest, type WorldChunkRecord } from './world-chunk.js';
const CELLS = WORLD_CHUNK_STRIDE ** 2;
/** A complete, valid authority extension payload for one chunk (static-world S1a). */
export function authorityChunkFixture(cx = 0, cy = 0): { arrays: Record<string, ChunkArray>; records: WorldChunkRecord[] } {
  const x = cx * 64, y = cy * 64;
  return {
    arrays: {
      'authority.ground.blocked': new Uint8Array(CELLS).fill(1),
      'authority.ground.elevations': new Int16Array(CELLS).fill(-2),
      'authority.ground.terrainPlaneBlocked': new Uint8Array(CELLS * 2),
      'authority.ground.horseJumpableTerrain': new Uint8Array(CELLS).fill(1),
      'authority.water.blocked': new Uint8Array(CELLS),
      'authority.combatRegion': new Uint8Array(CELLS).fill(2),
    },
    records: [
      { kind: 'authority.ground.obstacle', ordinal: 0, tileX: x, tileY: y, value: { group: 'base', ordinal: 0, left: x * 256, top: y * 256, right: x * 256 + 255, bottom: y * 256 + 127, sourceId: 'decoration:7' } },
      { kind: 'authority.ground.obstacle', ordinal: 1, tileX: x, tileY: y, value: { group: 'authored', ordinal: 0, left: x * 256, top: y * 256, right: x * 256 + 63, bottom: y * 256 + 63, sourceId: 'object:gate-1' } },
      { kind: 'authority.suppressedObstacleKey', ordinal: 0, tileX: x, tileY: y, value: { medium: 'ground', left: x * 256, top: y * 256, right: x * 256 + 255, bottom: y * 256 + 127 } },
      { kind: 'authority.walkable', ordinal: 0, tileX: x + 1, tileY: y, value: { tileX: x + 1, tileY: y } },
      { kind: 'authority.ground.transition', ordinal: 0, tileX: x + 2, tileY: y + 2, value: { kind: 'slope', lowerTileX: x + 2, lowerTileY: y + 2, upperTileX: x + 2, upperTileY: y + 1 } },
      { kind: 'authority.resource', ordinal: 0, tileX: x + 3, tileY: y + 3, value: { id: 1000000042, kind: 'tree', generatedTile: { tileX: x + 3, tileY: y + 3 }, effectiveTile: { tileX: x + 4, tileY: y + 3 }, suppressed: false } },
    ],
  };
}
export function runtimeChunkFixture(coords: readonly (readonly [number,number])[] = [[0,0]], options: { readonly authority?: boolean } = {}) {
  const blobs = coords.map(([cx,cy]) => {
    const authority = options.authority === true ? authorityChunkFixture(cx, cy) : null;
    return encodeWorldChunk({ schema: 1, mediumSchema: 1, ...(authority === null ? {} : { authoritySchema: 1 as const }), spaceId: 0,cx,cy,assetRevision: 'assets-1',
      arrays: {medium: new Uint8Array(CELLS),solidBlocked: new Uint8Array(CELLS),
        'clientGround.blocked': new Uint8Array(CELLS), 'clientWater.blocked': new Uint8Array(CELLS).fill(1), ...authority?.arrays},
      records: authority?.records ?? [],assetIds: [],atlasPackIds: ['terrain-core'] });
  });
  const manifest: WorldChunkManifest = {schema:1,chunkSize:64,spaceId:0,width:832,height:832,assetRevision:'assets-1',sourceRevision:3,sourceHash:'map-3',metadata:{},
    chunks:blobs.map(bytes => {const chunk = decodeWorldChunk(bytes);return {cx:chunk.cx,cy:chunk.cy,contentHash:chunk.contentHash,byteLength:bytes.length};})};
  return {blobs,manifest};
}
