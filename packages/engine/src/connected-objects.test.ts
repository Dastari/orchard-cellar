import {describe,it,expect,vi} from 'vitest';
vi.mock('@orchard/ui',()=>({loadGeneratedAsset:vi.fn(async(name:string)=>({name}))}));
vi.mock('./overworld-art.js',()=>({drawAuthoredOverworldObject:vi.fn(()=>true)}));
import {drawAuthoredOverworldObject} from './overworld-art.js';
import {loadGeneratedAsset} from '@orchard/ui';
import {drawConnectedObject,preloadConnectedObjectArt} from './connected-objects.js';

describe('connected native sprite rendering',()=>{
 it('uses the common topology sheet for a corner instead of cycling a one-frame original',async()=>{
  await preloadConnectedObjectArt('wood_fence');
  const ctx={} as CanvasRenderingContext2D;
  expect(drawConnectedObject(ctx,'wood_fence',6,24,32,0,0,2)).toBe(true);
  expect(loadGeneratedAsset).toHaveBeenCalledWith('prop_cf_join_wood_fence','summer');
  expect(drawAuthoredOverworldObject).toHaveBeenLastCalledWith(ctx,{name:'prop_cf_join_wood_fence'},'base',5,24,32,0,0,2);
  drawConnectedObject(ctx,'wood_fence',10,24,32,0,0,2);
  expect(drawAuthoredOverworldObject).toHaveBeenLastCalledWith(ctx,{name:'prop_cf_join_wood_fence'},'base',2,24,32,0,0,2);
 });
});
