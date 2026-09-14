import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({calls:[] as string[],failConstructor:'',failDispose:new Set<string>()}));
function resource(name:string){return class {
  bytes=0;count=0;uploads=0;draws=0;diagnostics={};
  constructor(){state.calls.push(`create:${name}`);if(state.failConstructor===name)throw new Error(`create:${name}`);}
  flush(){state.calls.push(`flush:${name}`);if(state.failDispose.has(`flush:${name}`))throw new Error(`flush:${name}`);}
  dispose(){state.calls.push(`dispose:${name}`);if(state.failDispose.has(name))throw new Error(`dispose:${name}`);}
};}
vi.mock('../world-pass-present.js',()=>({CanvasWorldPresent:resource('present')}));
vi.mock('./geometry.js',()=>({WorldGeometry:resource('geometry')}));
vi.mock('./textures.js',()=>({WorldTextures:resource('textures')}));
vi.mock('./coverage-textures.js',()=>({CoverageTextures:resource('coverage')}));
vi.mock('./gpu-timer.js',()=>({WebGLGpuTimer:resource('timer')}));
import {WebGLWorldPassBackend} from './world-pass-webgl.js';
import * as hooks from './hooks.js';
interface FakeCanvas {
  width:number;height:number;getContext:ReturnType<typeof vi.fn>;
  addEventListener:ReturnType<typeof vi.fn>;removeEventListener:ReturnType<typeof vi.fn>;
  listeners:Map<string,EventListener>;
}
const canvases:FakeCanvas[]=[];
function canvas():FakeCanvas {
  const listeners=new Map<string,EventListener>();
  const result={width:300,height:150,listeners,getContext:vi.fn((kind:string)=>kind==='webgl2'?{isContextLost:()=>false}:{fillRect:vi.fn()}),
    addEventListener:vi.fn((name:string,listener:EventListener)=>{listeners.set(name,listener);}),removeEventListener:vi.fn((name:string)=>{listeners.delete(name);})};
  canvases.push(result);return result;
}
beforeEach(()=>{canvases.length=0;state.calls.length=0;state.failConstructor='';state.failDispose.clear();vi.stubGlobal('document',{createElement:vi.fn(()=>canvas())});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('WebGL backend partial ownership',()=>{
  it.each(['missing','throws'])('clears both backings when WebGL is %s',mode=>{
    const world=canvas();world.getContext.mockImplementation(()=>{if(mode==='throws')throw new Error('getContext failed');return null;});
    expect(()=>new WebGLWorldPassBackend({canvas:world as unknown as HTMLCanvasElement})).toThrow(mode==='throws'?'getContext failed':'webgl2_unavailable');
    expect(canvases.every(c=>c.width===0&&c.height===0)).toBe(true);expect(state.calls).toEqual([]);
  });
  it('cleans every earlier acquisition when a later constructor and a disposer both throw',()=>{
    state.failConstructor='timer';state.failDispose.add('geometry');
    let failure:unknown;try{new WebGLWorldPassBackend();}catch(error){failure=error;}
    expect(failure).toBeInstanceOf(AggregateError);expect((failure as AggregateError).cause).toEqual(new Error('create:timer'));
    expect(state.calls.filter(call=>call.startsWith('dispose:'))).toEqual(['dispose:geometry','dispose:coverage','dispose:textures','dispose:present']);
    expect(canvases.every(c=>c.width===0&&c.height===0)).toBe(true);
  });
  it('removes a published hook and both listeners after partial event registration',()=>{
    const register=vi.spyOn(hooks,'registerWebGLWorldBackend'),world=canvas();
    world.addEventListener.mockImplementation((name:string,listener:EventListener)=>{world.listeners.set(name,listener);if(name==='webglcontextrestored')throw new Error('listener registration failed');});
    expect(()=>new WebGLWorldPassBackend({canvas:world as unknown as HTMLCanvasElement})).toThrow('listener registration failed');
    const context=register.mock.calls[0]![0];expect(hooks.webglWorldBackend(context)).toBeUndefined();expect(world.listeners.size).toBe(0);
    expect(state.calls.filter(call=>call.startsWith('dispose:'))).toHaveLength(5);expect(canvases.every(c=>c.width===0&&c.height===0)).toBe(true);
  });
  it('attempts every disposer, both backing axes and both deregistrations before aggregating errors',()=>{
    const world=canvas(),onFailure=vi.fn(),backend=new WebGLWorldPassBackend({canvas:world as unknown as HTMLCanvasElement,onFailure});
    backend.context.globalAlpha=0.4;backend.context.save();backend.context.globalAlpha=0.7;backend.context.save();
    const lost=world.listeners.get('webglcontextlost')!;state.failDispose.add('timer');state.failDispose.add('geometry');state.failDispose.add('textures');
    world.removeEventListener.mockImplementation((name:string)=>{if(name==='webglcontextlost')throw new Error('remove failed');world.listeners.delete(name);});
    expect(()=>backend.dispose()).toThrow(AggregateError);
    expect(state.calls.filter(call=>call.startsWith('dispose:'))).toEqual(['dispose:timer','dispose:geometry','dispose:textures','dispose:coverage','dispose:present']);
    expect(hooks.webglWorldBackend(backend.context)).toBeUndefined();expect(world.removeEventListener).toHaveBeenCalledTimes(2);
    backend.context.restore();backend.context.restore();expect(backend.context.globalAlpha).toBe(1);
    expect(canvases.every(c=>c.width===0&&c.height===0)).toBe(true);expect(backend.bytes).toBe(0);
    lost(new Event('webglcontextlost'));expect(onFailure).not.toHaveBeenCalled();expect(()=>backend.dispose()).not.toThrow();
  });
  it('still clears the other Canvas axis and all other resources when one backing setter throws',()=>{
    const world=canvas(),backend=new WebGLWorldPassBackend({canvas:world as unknown as HTMLCanvasElement});
    Object.defineProperty(world,'width',{get:()=>32,set:()=>{throw new Error('width reset failed');}});world.height=64;
    expect(()=>backend.dispose()).toThrow(AggregateError);expect(world.height).toBe(0);
    expect(canvases.filter(c=>c!==world).every(c=>c.width===0&&c.height===0)).toBe(true);
    expect(state.calls.filter(call=>call.startsWith('dispose:'))).toHaveLength(5);expect(hooks.webglWorldBackend(backend.context)).toBeUndefined();
  });

  it.each(['textures','flush:geometry'])('clears presentation ownership and attempts both managers when %s fails',failure=>{
    const backend=new WebGLWorldPassBackend(),oldRevision={},nextRevision={};backend.releasePresentation(oldRevision);
    const source={image:{} as HTMLCanvasElement,x:0,y:0,width:16,height:16};backend.associateSource(source,{});
    // Seed borrowed selection identities without requiring a real GPU in this ownership test.
    for(const key of ['selectedImage','selectedField','selectedTexture','selectedState'])Reflect.set(backend,key,source.image);
    state.calls.length=0;state.failDispose.add(failure);
    expect(()=>backend.releasePresentation(nextRevision)).toThrow(AggregateError);
    expect(state.calls).toEqual(['flush:geometry','dispose:textures','dispose:coverage']);
    expect(Reflect.get(backend,'presentation')).toBeUndefined();expect(Reflect.get(backend,'pending')).toBeNull();
    for(const key of ['selectedImage','selectedTexture','selectedState'])expect(Reflect.get(backend,key)).toBeNull();
    expect(Reflect.get(backend,'selectedField')).toBeUndefined();
    state.failDispose.clear();state.calls.length=0;backend.releasePresentation(nextRevision);
    expect(state.calls).toEqual(['flush:geometry','dispose:textures','dispose:coverage']);
    state.calls.length=0;backend.releasePresentation(nextRevision);expect(state.calls).toEqual([]);backend.dispose();
  });

});
