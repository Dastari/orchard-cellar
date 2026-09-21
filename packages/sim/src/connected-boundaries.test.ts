import {expect,it} from 'vitest';
import {BOUNDARY_SHEETS,resolveBoundaryCells,type BoundaryCell,type BoundaryFamily} from './connected-boundaries.js';
it.each(Object.keys(BOUNDARY_SHEETS) as BoundaryFamily[])('connects every corner of an 8x8 %s outline',family=>{
  const cells:BoundaryCell[]=[];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(x===0||x===7||y===0||y===7)cells.push({tileX:x,tileY:y,family});
  const rows=resolveBoundaryCells(cells);
  expect(rows).toHaveLength(28);
  const at=(x:number,y:number)=>rows.find(r=>r.tileX===x&&r.tileY===y)!;
  expect([at(0,0).mask,at(7,0).mask,at(0,7).mask,at(7,7).mask]).toEqual([6,12,3,9]);
  expect(at(3,0).mask).toBe(10);expect(at(0,3).mask).toBe(5);
  expect(resolveBoundaryCells([...cells].reverse())).toEqual(rows);
  const gate=resolveBoundaryCells(cells.filter(c=>!(c.tileY===7&&[3,4].includes(c.tileX))));
  expect(gate.find(c=>c.tileX===2&&c.tileY===7)?.mask).toBe(8);
  expect(gate.find(c=>c.tileX===5&&c.tileY===7)?.mask).toBe(2);
});
it('does not join different families and diagnoses unsupported hedge crossings',()=>{
  expect(resolveBoundaryCells([{tileX:0,tileY:0,family:'wood'},{tileX:1,tileY:0,family:'picket'}]).map(c=>c.mask)).toEqual([0,0]);
  expect(()=>resolveBoundaryCells([[0,0],[0,1],[0,-1],[1,0]].map(([tileX,tileY])=>({tileX:tileX!,tileY:tileY!,family:'hedge'})))).toThrow('Unsupported hedge');
});
