import {IDBFactory} from 'fake-indexeddb';
import {expect,it,vi} from 'vitest';
import {IndexedDbChunkCache} from './chunk-shadow-cache.js';
it('persists across cache instances, refreshes LRU on read and enforces byte/count limits',async()=>{
 const factory=new IDBFactory();let now=0;const clock=vi.spyOn(Date,'now').mockImplementation(()=>++now);
 try{
  const cache=new IndexedDbChunkCache(factory,6,2);
  await cache.put('a',new Uint8Array([1,2]));await cache.put('b',new Uint8Array([3,4]));
  expect(await cache.get('a')).toEqual(new Uint8Array([1,2]));
  await cache.put('c',new Uint8Array([5,6]));expect(await cache.get('b')).toBeUndefined();
  const reloaded=new IndexedDbChunkCache(factory,6,2);expect(await reloaded.get('a')).toEqual(new Uint8Array([1,2]));
  await reloaded.put('d',new Uint8Array(5));expect(await reloaded.get('a')).toBeUndefined();expect(await reloaded.get('c')).toBeUndefined();
  await reloaded.put('oversized',new Uint8Array(7));expect(await reloaded.get('oversized')).toBeUndefined();
  await reloaded.delete('d');expect(await reloaded.get('d')).toBeUndefined();
 }finally{clock.mockRestore();}
});
it('owns stored bytes and serializes concurrent writes under its hard budget',async()=>{
 const cache=new IndexedDbChunkCache(new IDBFactory(),4,2),bytes=new Uint8Array([7,8]);
 await cache.put('a',bytes);bytes[0]=0;expect(await cache.get('a')).toEqual(new Uint8Array([7,8]));
 await Promise.all([cache.put('b',new Uint8Array(2)),cache.put('c',new Uint8Array(2)),cache.put('d',new Uint8Array(2))]);
 const values=await Promise.all(['a','b','c','d'].map(key=>cache.get(key)));expect(values.filter(Boolean)).toHaveLength(2);
});
