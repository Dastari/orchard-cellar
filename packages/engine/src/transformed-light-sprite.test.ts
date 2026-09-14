import {expect,it} from 'vitest';
import {transformedLightSprite} from './transformed-light-sprite.js';
import type {GroundSpriteBasis} from './ground-light-source.js';
const source={left:-2,top:-3,width:4,height:3,opaque:new Uint8Array([1,0,0,0,0,1,1,0,0,0,0,1]),elevationLayer:2};
const at=(mask:ReturnType<typeof transformedLightSprite>,x:number,y:number)=>mask.opaque[(Math.floor(y)-mask.top)*mask.width+Math.floor(x)-mask.left];
it('retains transparent holes and native occupied pixel centres for every quarter-turn, reflection and scale2',()=>{
  for(const scale of [1,2])for(const flip of [1,-1])for(const turn of [0,1,2,3]){
    const rotation=[[1,0,0,1],[0,1,-1,0],[-1,0,0,-1],[0,-1,1,0]][turn]!;
    const basis:GroundSpriteBasis={a:rotation[0]!*scale*flip,b:rotation[1]!*scale*flip,c:rotation[2]!*scale,d:rotation[3]!*scale};
    const result=transformedLightSprite(source,basis,20,30);
    expect(result.elevationLayer).toBe(2);expect(result.opaque.reduce((sum,n)=>sum+n,0)).toBe(4*scale*scale);
    for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
      for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++){
        const nx=source.left+x+(sx+.5)/scale,ny=source.top+y+(sy+.5)/scale;
        expect(at(result,20+basis.a*nx+basis.c*ny,30+basis.b*nx+basis.d*ny),`turn${turn} flip${flip} scale${scale} ${x},${y}/${sx},${sy}`).toBe(source.opaque[y*source.width+x]);
      }
    }
  }
});
it('shares identity mask storage and retains exact fractional world placement',()=>{
  const result=transformedLightSprite(source,{a:1,b:0,c:0,d:1},20.25,30.5);
  expect(result.opaque).toBe(source.opaque);expect([result.left,result.top]).toEqual([18.25,27.5]);
  expect(source.left).toBe(-2);expect(source.top).toBe(-3);
});
it('rejects invalid or excessive transforms before allocating a receiver',()=>{
  for(const basis of [{a:0,b:0,c:0,d:0},{a:Infinity,b:0,c:0,d:1},{a:10000,b:0,c:0,d:10000}])expect(()=>transformedLightSprite(source,basis,0,0)).toThrow();
});
