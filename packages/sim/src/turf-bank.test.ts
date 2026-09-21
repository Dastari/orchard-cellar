import {expect,it} from 'vitest';
import {turfBankMask,resolveTurfBank} from './turf-bank.js';
it('resolves outward and inward corners on two-cell stepped shelves',()=>{
 const mask=turfBankMask(10,20,[[1,3],[0,4],[0,4],[1,3]]);
 const edges=resolveTurfBank(mask);
 expect(new Set(edges.map(e=>e.frame)).size).toBe(12);
 expect(edges.every(e=>mask.has(`${e.tileX},${e.tileY}`))).toBe(true);
 for(const e of edges)expect(e.frame).toBeGreaterThanOrEqual(0);
});
it('rejects one-cell teeth and opposite edges instead of inventing a crop',()=>{
 expect(()=>resolveTurfBank(new Set(['0,0','1,0','2,0']))).toThrow('two-cell');
 const mask=new Set(turfBankMask(0,0,[[0,2],[0,2]]));mask.add('2,-1');
 expect(()=>resolveTurfBank(mask)).toThrow(/two-cell|Unsupported turf concavity/);
});
