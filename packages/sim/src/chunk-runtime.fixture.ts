import { encodeWorldChunk, decodeWorldChunk, WORLD_CHUNK_STRIDE, type WorldChunkManifest } from './world-chunk.js';
export function runtimeChunkFixture(coords: readonly (readonly [number,number])[] = [[0,0]]) {
  const blobs = coords.map(([cx,cy]) => encodeWorldChunk({ schema: 1, mediumSchema: 1, spaceId: 0,cx,cy,assetRevision: 'assets-1',
    arrays: {medium: new Uint8Array(WORLD_CHUNK_STRIDE ** 2),solidBlocked: new Uint8Array(WORLD_CHUNK_STRIDE ** 2),
      'clientGround.blocked': new Uint8Array(WORLD_CHUNK_STRIDE ** 2), 'clientWater.blocked': new Uint8Array(WORLD_CHUNK_STRIDE ** 2).fill(1)},
    records: [],assetIds: [],atlasPackIds: ['terrain-core'] }));
  const manifest: WorldChunkManifest = {schema:1,chunkSize:64,spaceId:0,width:832,height:832,assetRevision:'assets-1',sourceRevision:3,sourceHash:'map-3',metadata:{},
    chunks:blobs.map(bytes => {const chunk = decodeWorldChunk(bytes);return {cx:chunk.cx,cy:chunk.cy,contentHash:chunk.contentHash,byteLength:bytes.length};})};
  return {blobs,manifest};
}
