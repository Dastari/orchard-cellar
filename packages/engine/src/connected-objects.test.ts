import {describe,it,expect,vi} from 'vitest';
vi.mock('@orchard/ui',()=>({loadGeneratedAsset:vi.fn(async(name:string)=>({name}))}));
vi.mock('./overworld-art.js',()=>({drawAuthoredOverworldObject:vi.fn(()=>true)}));
import {drawAuthoredOverworldObject} from './overworld-art.js';
import {loadGeneratedAsset} from '@orchard/ui';
import {connectedObjectCatalogue,type AvailableRuleFamily} from '@orchard/sim';
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
 it('draws a published family frame and reloads changed asset identity',async()=>{
  const original=connectedObjectCatalogue().families[0] as AvailableRuleFamily;
  const catalogue={schemaVersion:1 as const,families:[{...original,masks:[{mask:6,roles:['custom']}],fallback:['custom'],roles:{custom:{frame:{assetId:'published_fence',frame:17},blocksMovement:true,blocksLight:false,variants:[],seasonalRemaps:{}}}}]};
  await preloadConnectedObjectArt('wood_fence',catalogue);
  const ctx={} as CanvasRenderingContext2D;
  expect(drawConnectedObject(ctx,'wood_fence',6,24,32,0,0,2,catalogue)).toBe(true);
  expect(loadGeneratedAsset).toHaveBeenCalledWith('published_fence','summer');
  expect(drawAuthoredOverworldObject).toHaveBeenLastCalledWith(ctx,{name:'published_fence'},'base',17,24,32,0,0,2);
  expect(drawConnectedObject(ctx,'wood_fence',6,24,32,0,0,2,{schemaVersion:1,families:[]})).toBe(false);
 });
 it('rotates authored join art around the cell centre',async()=>{
  const original=connectedObjectCatalogue().families[0] as AvailableRuleFamily;
  const catalogue={schemaVersion:1 as const,families:[{...original,transforms:[0,1] as const,masks:[],fallback:['turned'],roles:{turned:{frame:{assetId:'turned_fence',frame:4,transform:1 as const},blocksMovement:true,blocksLight:false,variants:[],seasonalRemaps:{}}}}]};
  await preloadConnectedObjectArt('wood_fence',catalogue);
  const ctx={save:vi.fn(),restore:vi.fn(),translate:vi.fn(),rotate:vi.fn()} as unknown as CanvasRenderingContext2D;
  expect(drawConnectedObject(ctx,'wood_fence',0,24,32,8,8,2,catalogue)).toBe(true);
  expect(ctx.translate).toHaveBeenCalledWith(32,32);
  expect(ctx.rotate).toHaveBeenCalledWith(Math.PI/2);
  expect(drawAuthoredOverworldObject).toHaveBeenLastCalledWith(ctx,{name:'turned_fence'},'base',4,0,8,0,0,2);
  expect(ctx.restore).toHaveBeenCalledOnce();
 });

});
