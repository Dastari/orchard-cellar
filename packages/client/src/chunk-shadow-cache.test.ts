import {IDBFactory,IDBIndex,IDBObjectStore} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {CHUNK_CACHE_MAX_BYTES,CHUNK_CACHE_MAX_ENTRIES,IndexedDbChunkCache,browserChunkBlobCache} from './chunk-shadow-cache.js';
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
it('defaults to the 256 entry / 64 MiB budget',()=>{
 const cache=new IndexedDbChunkCache(new IDBFactory());
 expect([cache.maxEntries,cache.maxBytes]).toEqual([256,64*1024*1024]);expect([CHUNK_CACHE_MAX_ENTRIES,CHUNK_CACHE_MAX_BYTES]).toEqual([256,64*1024*1024]);
 cache.close();
});
it('owns stored bytes and serializes concurrent writes under its hard budget',async()=>{
 const cache=new IndexedDbChunkCache(new IDBFactory(),4,2),bytes=new Uint8Array([7,8]);
 await cache.put('a',bytes);bytes[0]=0;expect(await cache.get('a')).toEqual(new Uint8Array([7,8]));
 await Promise.all([cache.put('b',new Uint8Array(2)),cache.put('c',new Uint8Array(2)),cache.put('d',new Uint8Array(2))]);
 const values=await Promise.all(['a','b','c','d'].map(key=>cache.get(key)));expect(values.filter(Boolean)).toHaveLength(2);
});
it('evicts by walking metadata only: no getAll and no blob value reads',async()=>{
 const cache=new IndexedDbChunkCache(new IDBFactory(),1024,3);
 for(const key of ['a','b','c'])await cache.put(key,new Uint8Array(100));
 const getAll=vi.spyOn(IDBObjectStore.prototype,'getAll'),indexGetAll=vi.spyOn(IDBIndex.prototype,'getAll');
 const storeCursor=vi.spyOn(IDBObjectStore.prototype,'openCursor'),storeGet=vi.spyOn(IDBObjectStore.prototype,'get');
 const indexCursor=vi.spyOn(IDBIndex.prototype,'openCursor');
 try{
  await cache.put('d',new Uint8Array(100));await cache.put('e',new Uint8Array(900));
  expect(getAll).not.toHaveBeenCalled();expect(indexGetAll).not.toHaveBeenCalled();
  expect(storeGet).not.toHaveBeenCalled();expect(storeCursor).not.toHaveBeenCalled();
  expect(indexCursor).toHaveBeenCalledTimes(2);expect(indexCursor.mock.contexts.every(index=>(index as IDBIndex).objectStore.name==='meta')).toBe(true);
 }finally{vi.restoreAllMocks();}
 // 'e' (900) needs 800 bytes freed: a, b ... evicted oldest first until within budget.
 expect(await Promise.all(['a','b','c','d','e'].map(async key=>(await cache.get(key))!==undefined))).toEqual([false,false,false,true,true]);
});
it('prunes entries outside the current and previous manifest for that space only',async()=>{
 const cache=new IndexedDbChunkCache(new IDBFactory());
 for(const key of ['cur','prev','old'])await cache.put(key,new Uint8Array([1]),0);
 await cache.put('cellar',new Uint8Array([2]),7);
 const getAll=vi.spyOn(IDBObjectStore.prototype,'getAll'),storeGet=vi.spyOn(IDBObjectStore.prototype,'get');
 try{await cache.prune(0,new Set(['cur','prev']));expect(getAll).not.toHaveBeenCalled();expect(storeGet).not.toHaveBeenCalled();}
 finally{vi.restoreAllMocks();}
 expect(await cache.get('old')).toBeUndefined();
 expect(await cache.get('cur')).toEqual(new Uint8Array([1]));expect(await cache.get('prev')).toEqual(new Uint8Array([1]));
 expect(await cache.get('cellar')).toEqual(new Uint8Array([2]));
});
describe('failure tolerance',()=>{
 it('closes the database handle at connection teardown and then acts as a miss',async()=>{
  const cache=new IndexedDbChunkCache(new IDBFactory());await cache.put('a',new Uint8Array([1]));cache.close();
  await expect(cache.get('a')).resolves.toBeUndefined();await expect(cache.put('b',new Uint8Array([1]))).resolves.toBeUndefined();
 });
 it('runs memory-only when IndexedDB cannot open',async()=>{
  const throwing={open:()=>{throw new Error('SecurityError');},deleteDatabase:()=>{throw new Error('SecurityError');}} as unknown as IDBFactory;
  const cache=new IndexedDbChunkCache(throwing);
  await expect(cache.put('a',new Uint8Array([1]))).resolves.toBeUndefined();await expect(cache.get('a')).resolves.toBeUndefined();
  await expect(cache.prune(0,new Set())).resolves.toBeUndefined();await expect(cache.delete('a')).resolves.toBeUndefined();
  expect(cache.failures).toBe(1);
  const failing={open:()=>{const request={} as IDBOpenDBRequest;queueMicrotask(()=>request.onerror?.(new Event('error')));return request;},
   deleteDatabase:()=>({})} as unknown as IDBFactory;
  const denied=new IndexedDbChunkCache(failing);await expect(denied.get('a')).resolves.toBeUndefined();expect(denied.failures).toBe(1);
 });
 it('has no browser cache without IndexedDB',()=>{
  expect(typeof indexedDB).toBe('undefined');expect(browserChunkBlobCache()).toBeUndefined();
 });
 it('drops an entry whose metadata and blob disagree',async()=>{
  const factory=new IDBFactory(),cache=new IndexedDbChunkCache(factory);await cache.put('a',new Uint8Array([1,2]));
  const db=await new Promise<IDBDatabase>(resolve=>{const request=factory.open('orchard-world-chunks-v2',1);request.onsuccess=()=>resolve(request.result);});
  await new Promise<void>(resolve=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('a');tx.oncomplete=()=>resolve();});db.close();
  expect(await cache.get('a')).toBeUndefined();
 });
});
