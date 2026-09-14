import {expect,it} from 'vitest';
import {TransformedLightSpriteCache,transformedLightSprite} from './transformed-light-sprite.js';
const mask={left:-1,top:-2,width:2,height:2,opaque:new Uint8Array([1,0,1,1])};
const rotation={a:0,b:1,c:-1,d:0};
it('shares transformed pixels across world positions and planes, but isolates alpha identity, anchors and transforms',()=>{
  const cache=new TransformedLightSpriteCache();
  const first=cache.transform(mask,rotation,20,30);
  const moved=cache.transform({...mask,elevationLayer:2},rotation,-20,-30);
  expect(moved).toEqual({...transformedLightSprite(mask,rotation,-20,-30),elevationLayer:2});
  expect(moved.opaque).toBe(first.opaque);
  expect(cache.transform({...mask,opaque:mask.opaque.slice()},rotation,20,30).opaque).not.toBe(first.opaque);
  expect(cache.transform({...mask,left:0},rotation,20,30).opaque).not.toBe(first.opaque);
  expect(cache.transform(mask,{a:-1,b:0,c:0,d:1},20,30).opaque).not.toBe(first.opaque);
  cache.clear();expect(cache.transform(mask,rotation,20,30).opaque).not.toBe(first.opaque);
});
it('preserves exact fractional sampling and identity sharing without caching them',()=>{
  const cache=new TransformedLightSpriteCache();
  for(const [x,y] of [[.25,.75],[-.25,-.75]]){
    expect(cache.transform(mask,rotation,x!,y!)).toEqual(transformedLightSprite(mask,rotation,x!,y!));
  }
  expect(cache.transform(mask,{a:1,b:0,c:0,d:1},.25,.75).opaque).toBe(mask.opaque);
  expect(()=>cache.transform(mask,rotation,Infinity,0)).toThrow('invalid_light_sprite_transform');
});
it('evicts least recently used alpha within its byte budget and does not retain oversized entries',()=>{
  const cache=new TransformedLightSpriteCache(8);
  const second={...mask,left:-2},third={...mask,left:-3};
  const a=cache.transform(mask,rotation,0,0),b=cache.transform(second,rotation,0,0);
  expect(cache.transform(mask,rotation,0,0).opaque).toBe(a.opaque);
  cache.transform(third,rotation,0,0);
  expect(cache.transform(mask,rotation,0,0).opaque).toBe(a.opaque);
  expect(cache.transform(second,rotation,0,0).opaque).not.toBe(b.opaque);
  const tiny=new TransformedLightSpriteCache(3);
  expect(tiny.transform(mask,rotation,0,0).opaque).not.toBe(tiny.transform(mask,rotation,0,0).opaque);
  expect(()=>new TransformedLightSpriteCache(-1)).toThrow('invalid_light_sprite_cache_budget');
});
