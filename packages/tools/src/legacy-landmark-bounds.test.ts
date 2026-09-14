import {expect,it} from 'vitest';
import {createLiveIslandMapDocument,mapLandmarkCollisionObstacle,TILE_SIZE_FIXED} from '@orchard/sim';
import {legacyLandmarkBounds} from './legacy-landmark-bounds.js';
const base=createLiveIslandMapDocument().landmarks.find(row=>row.kind==='camp_tent')!;
it('transforms native overhang around the exact sprite origin even when disabled',()=>{
  const row={...base,kind:'camp_chair' as const,tileX:230,tileY:400,quarterTurns:3 as const,flipX:true,scale:2 as const,enabled:false};
  const collision=mapLandmarkCollisionObstacle({...row,enabled:true},'ground')!;
  expect(collision.left/TILE_SIZE_FIXED).toBeGreaterThan(224);
  const bounds=legacyLandmarkBounds(row,()=>({id:1,width:32,height:96,anchor:[8,95]}))!;
  expect(bounds.left).toBe(218.625);expect(bounds.right).toBeGreaterThanOrEqual(230.625);
  expect(bounds.top).toBeLessThanOrEqual(400);expect(bounds.bottom).toBeGreaterThanOrEqual(404);
});
it('unions collision that extends beyond a small visual',()=>{
  const row={...base,tileX:400,tileY:400,enabled:false};
  const collision=mapLandmarkCollisionObstacle({...row,enabled:true},'ground')!;
  const bounds=legacyLandmarkBounds(row,()=>({id:1,width:1,height:1,anchor:[0,0]}))!;
  expect(bounds.left).toBeLessThanOrEqual(collision.left/TILE_SIZE_FIXED);
  expect(bounds.right).toBeGreaterThanOrEqual((collision.right+1)/TILE_SIZE_FIXED);
  expect(bounds.top).toBeLessThanOrEqual(collision.top/TILE_SIZE_FIXED);
  expect(bounds.bottom).toBeGreaterThanOrEqual((collision.bottom+1)/TILE_SIZE_FIXED);
});
it('keeps multipart and unresolved kinds explicit',()=>{
  for(const kind of ['fisher_fixed_line','farm_fence','farm_tree_oak','camp_pond'] as const) {
    expect(legacyLandmarkBounds({...base,kind},()=>{throw new Error('must not invent a sprite');})).toBeNull();
  }
});
