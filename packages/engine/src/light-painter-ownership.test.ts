import {expect,it} from 'vitest';
import {type LightTrunkOccluder,createLightOcclusionMap,rasterizeLightOcclusion} from './light-occlusion.js';
import {sortWorldDepthItems} from './renderer.js';
import type {PreparedLightTerrainOcclusion} from './light-occlusion.js';
import type {TerrainArray} from './terrain.js';

const prepared:PreparedLightTerrainOcclusion={width:4,height:4,hardBlocked:new Uint8Array(16),frontFaces:new Uint8Array(16)};
const receiver={left:0,top:0,width:8,height:8,opaque:new Uint8Array(64).fill(1)};
const caster=(tie:string,footY=16,plane=0):LightTrunkOccluder=>({
  obstacle:{left:0,top:0,right:0,bottom:0},receiver,footY:16,shadowMode:'silhouette',
  painterOrder:{footY,tie,elevationLayer:plane,depthPhase:'entity'},
});
it('assigns overlapping alpha to the actual painter winner, including equal-foot lexical ties and higher planes',()=>{
  const entries=[caster('live-map:02:object:z'),caster('live-map:02:object:a'),caster('resource:7')];
  for(const input of [entries,[...entries].reverse(),[entries[1]!,entries[2]!,entries[0]!]]){
    const map=createLightOcclusionMap({} as TerrainArray,[],[],input,undefined,prepared);
    const expected=sortWorldDepthItems(input.map(entry=>entry.painterOrder!));
    expect(map.trunkOccluders.map(entry=>entry.painterOrder)).toEqual(expected);
    const pixels=new Uint8Array(64),owners=new Uint16Array(64);
    rasterizeLightOcclusion(pixels,8,8,0,0,1,map,undefined,owners);
    expect(owners[0]).toBe(3);
    expect(map.trunkOccluders[owners[0]!-1]!.painterOrder!.tie).toBe('resource:7');
  }
  // The physical shadow contact stays fixed while visible sort depth differs.
  const elevated=caster('high',2,1),lower=caster('low',90,0);
  expect(createLightOcclusionMap({} as TerrainArray,[],[],[elevated,lower],undefined,prepared).trunkOccluders).toEqual([lower,elevated]);
});
it('uses a total fallback order for mixed producers and retains stable legacy equal-foot order',()=>{
  const legacy:LightTrunkOccluder={obstacle:{left:0,top:0,right:0,bottom:0},receiver,footY:16};
  const a=caster('a'),b=caster('b');
  for(const input of [[b,legacy,a],[a,b,legacy],[legacy,a,b]]){
    expect(createLightOcclusionMap({} as TerrainArray,[],[],input,undefined,prepared).trunkOccluders).toEqual([legacy,a,b]);
  }
  const second={...legacy};
  expect(createLightOcclusionMap({} as TerrainArray,[],[],[second,legacy],undefined,prepared).trunkOccluders[0]).toBe(second);
});
