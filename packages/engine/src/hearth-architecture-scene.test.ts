import {describe,expect,it,vi} from 'vitest';
import type {LoadedAsset} from '@orchard/ui';
import type {OverworldArt} from './overworld-art.js';
import type {WorldDepthItem} from './renderer.js';
import {drawResidencePartitionBand} from './ground-cache.js';
import {enqueueHearthArchitectureFeatures,hearthWindowOpacity,hearthFeatureOpacity} from './hearth-architecture-scene.js';

const asset=(height:number)=>({image:{},anchor:[8,height-1],metadata:{image:'native.png',animations:{base:[{x:104,y:48,width:16,height,durationTicks:1}]}}}) as unknown as LoadedAsset;

describe('native construction cutaway',()=>{
  it('draws only the lower native wall course inside its blocked cell',()=>{
    const wall=asset(48),drawImage=vi.fn();
    drawResidencePartitionBand({drawImage} as unknown as CanvasRenderingContext2D,wall,3,5);
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(wall.image,104,80,16,16,48,80,16,16);
  });
  it('reveals windows for head-only, torso and seated overlap, but not distant actors',()=>{
    expect(hearthWindowOpacity(100,100,[{x:100,y:164}])).toBe(.25);
    expect(hearthWindowOpacity(100,100,[{x:100,y:120}])).toBe(.25);
    expect(hearthWindowOpacity(100,100,[{x:120,y:110}])).toBe(.25);
    expect(hearthWindowOpacity(100,100,[{x:141,y:100}])).toBe(1);
    expect(hearthWindowOpacity(100,100,[{x:100,y:166}])).toBe(1);
  });
  it('includes the full native doorway width when revealing an overlapping avatar',()=>{
    const actor=[{x:144,y:100}];
    expect(hearthWindowOpacity(100,100,actor)).toBe(1);
    expect(hearthFeatureOpacity(100,100,32,26,actor)).toBe(.25);
    expect(hearthFeatureOpacity(100,100,32,26,[{x:149,y:100}])).toBe(1);
  });
  it('reads final actor anchors during drawing and restores incoming alpha',()=>{
    const actors=new Map<string,{x:number;y:number}>(),queued:WorldDepthItem[]=[];
    const alphas:number[]=[];
    let saved=0;
    const context={globalAlpha:.8,save(){saved=this.globalAlpha;},restore(){this.globalAlpha=saved;},drawImage(){alphas.push(this.globalAlpha);}};
    enqueueHearthArchitectureFeatures(context as unknown as CanvasRenderingContext2D,
      {hearthPartitionWindow:asset(32)} as OverworldArt,
      [{tileX:5,tileY:5,partition:'wall',window:true},{tileX:6,tileY:5,partition:'doorway'}],0,0,1,
      ()=>actors.values(),(_x,_y,item)=>queued.push(item));
    expect(queued).toHaveLength(1);
    actors.set('seated',{x:88,y:150});
    queued[0]!.draw();
    expect(alphas).toEqual([.2]);
    expect(context.globalAlpha).toBe(.8);
    actors.clear();queued[0]!.draw();
    expect(alphas).toEqual([.2,.8]);
  });
});
