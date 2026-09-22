import {describe,expect,it} from 'vitest';
import {planLocalTerrainInsets} from './local-terrain-insets.js';
import {raisedTerrainInsetRolesAt} from './raised-terrain-autotile.js';
import type {MapPoint} from './map-editing.js';

const key=({tileX,tileY}:MapPoint):string=>`${tileX},${tileY}`;
const shape=['##..','###.','.###','..##'];
const points=shape.flatMap((row,tileY)=>[...row].flatMap((cell,tileX)=>cell==='#'?[{tileX,tileY}]:[]));
const setOf=(list:readonly MapPoint[]):Set<string>=>new Set(list.map(key));
const occupied=(set:Set<string>)=>(tileX:number,tileY:number):boolean=>set.has(key({tileX,tileY}));

describe('bounded one-inset placement assistance',()=>{
  it('widens a diagonal staircase without assigning two inset blocks to a cell',()=>{
    const before=setOf(points);
    expect(points.some(p=>raisedTerrainInsetRolesAt({raisedAt:occupied(before)},p.tileX,p.tileY).length>1)).toBe(true);
    const plan=planLocalTerrainInsets({points,occupiedAt:occupied(before)});
    expect(plan.unresolved).toEqual([]);expect(plan.added.length).toBeGreaterThan(0);
    const after=setOf([...points,...plan.added]);
    for(const p of [...points,...plan.added])expect(raisedTerrainInsetRolesAt({raisedAt:occupied(after)},p.tileX,p.tileY).length).toBeLessThanOrEqual(1);
    expect(planLocalTerrainInsets({points,occupiedAt:occupied(after)})).toEqual({added:[],unresolved:[]});
  });

  it('has identical geometry under all rotations and reflections',()=>{
    const baseline=planLocalTerrainInsets({points,occupiedAt:occupied(setOf(points))});
    for(const mirror of [1,-1])for(let turns=0;turns<4;turns++){
      const transform=(p:MapPoint):MapPoint=>{let x=p.tileX*mirror,y=p.tileY;for(let i=0;i<turns;i++){const nextX=-y;y=x;x=nextX;}return {tileX:x+17,tileY:y+29};};
      const rotated=points.map(transform);
      const plan=planLocalTerrainInsets({points:rotated,occupiedAt:occupied(setOf(rotated))});
      expect(setOf(plan.added)).toEqual(setOf(baseline.added.map(transform)));expect(plan.unresolved).toEqual([]);
    }
  });

  it('keeps a single concave inset and distant invalid geometry unchanged',()=>{
    const concave=[{tileX:0,tileY:0},{tileX:1,tileY:0},{tileX:0,tileY:1}];
    const distant=points.map(p=>({tileX:p.tileX+8000,tileY:p.tileY+8000}));
    const visited:MapPoint[]=[];
    const set=setOf([...concave,...distant]);
    const plan=planLocalTerrainInsets({points:concave,occupiedAt:(tileX,tileY)=>{visited.push({tileX,tileY});return occupied(set)(tileX,tileY);}});
    expect(plan).toEqual({added:[],unresolved:[]});
    expect(visited.every(p=>Math.abs(p.tileX)<5&&Math.abs(p.tileY)<5)).toBe(true);
  });

  it('reports a protected diagonal rather than widening the writable halo',()=>{
    const plan=planLocalTerrainInsets({points,occupiedAt:occupied(setOf(points)),canFillAt:()=>false});
    expect(plan.added).toEqual([]);expect(plan.unresolved.length).toBeGreaterThan(0);
  });

  it('resolves all 256 isolated neighbor configurations within the original halo',()=>{
    const offsets=[[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]] as const;
    for(let mask=0;mask<256;mask++){
      const seed=[{tileX:0,tileY:0},...offsets.flatMap(([tileX,tileY],i)=>mask&(1<<i)?[{tileX,tileY}]:[])];
      const plan=planLocalTerrainInsets({points:seed,occupiedAt:occupied(setOf(seed))});
      expect(plan.unresolved,`mask ${mask}`).toEqual([]);
      expect(plan.added.every(p=>seed.some(q=>Math.abs(p.tileX-q.tileX)<=1&&Math.abs(p.tileY-q.tileY)<=1))).toBe(true);
    }
  });
});
