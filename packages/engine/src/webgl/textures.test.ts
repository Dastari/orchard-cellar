import { describe, expect, it, vi } from 'vitest';
import { WorldTextures } from './textures.js';
import { CoverageTextures } from './coverage-textures.js';
function mockGL() {
  const gl={TEXTURE0:10,TEXTURE1:11,TEXTURE_2D:1,RGBA:2,UNSIGNED_BYTE:3,MAX_TEXTURE_SIZE:4,NO_ERROR:0,
    createTexture:vi.fn(()=>({})),deleteTexture:vi.fn(),activeTexture:vi.fn(),bindTexture:vi.fn(),pixelStorei:vi.fn(),texImage2D:vi.fn(),texParameteri:vi.fn(),getError:vi.fn(()=>0),getParameter:vi.fn(()=>4096)};
  return {gl:gl as unknown as WebGL2RenderingContext,calls:gl};
}
describe('WebGL texture input ownership',()=>{
  it('uploads each immutable page once, revises explicitly and disposes all bytes',()=>{
    const {gl,calls}=mockGL(),textures=new WorldTextures(gl),page={width:512,height:2048} as HTMLCanvasElement;
    const a=textures.page(page,1);expect(textures.page(page,1)).toBe(a);expect(calls.texImage2D).toHaveBeenCalledTimes(1);
    textures.page(page,2);expect(calls.texImage2D).toHaveBeenCalledTimes(2);expect(textures.bytes).toBe(4*1024*1024);
    textures.dispose();expect(textures.count).toBe(0);expect(textures.bytes).toBe(0);expect(calls.deleteTexture).toHaveBeenCalledTimes(1);
  });
  it('recreates identities after context restoration and forces a fresh upload',()=>{
    const {gl,calls}=mockGL(),textures=new WorldTextures(gl),page={width:8,height:8} as HTMLCanvasElement;
    const entry=textures.page(page,7),old=entry.texture;textures.invalidate();expect(entry.texture).not.toBe(old);
    textures.page(page,7);expect(textures.uploads).toBe(2);expect(textures.bytes).toBe(256);expect(calls.createTexture).toHaveBeenCalledTimes(2);
  });
  it('rejects over-budget/oversized pages before allocation',()=>{
    const {gl,calls}=mockGL(),textures=new WorldTextures(gl,32);
    expect(()=>textures.page({width:8,height:8} as HTMLCanvasElement)).toThrow('webgl_texture_budget');
    expect(()=>textures.page({width:513,height:2048} as HTMLCanvasElement)).toThrow('webgl_texture_size');
    expect(calls.createTexture).not.toHaveBeenCalled();expect(textures.bytes).toBe(0);
  });
  it('updates a mutable image whose dimensions changed without retaining the old allocation',()=>{
    const {gl,calls}=mockGL(),textures=new WorldTextures(gl),page={width:8,height:8} as HTMLCanvasElement;
    textures.page(page);page.width=16;textures.page(page);expect(textures.bytes).toBe(512);expect(textures.count).toBe(1);expect(calls.deleteTexture).toHaveBeenCalledTimes(1);
  });
  it('bounds retained coverage windows and releases every raw channel',()=>{
    const {gl,calls}=mockGL(),textures=new CoverageTextures(gl);
    const make=()=>({coverage:{sun:new Uint8Array(4),moon:new Uint8Array(4),contact:new Uint8Array(4)},localPixels:new Uint8ClampedArray(16),width:2,height:2,left:0,top:0,step:4,revision:1,diffuse:{r:1,g:2,b:3},sunLight:{r:4,g:5,b:6},moonLight:{r:7,g:8,b:9}});
    const first=make();textures.bind(first);textures.bind(first);expect(textures.uploads).toBe(4);
    for(let i=0;i<9;i++)textures.bind(make());expect(textures.count).toBe(32);expect(textures.bytes).toBe(8*4*7);expect(calls.deleteTexture).toHaveBeenCalledTimes(8);
    textures.dispose();expect(textures.count).toBe(0);expect(textures.bytes).toBe(0);expect(calls.deleteTexture).toHaveBeenCalledTimes(40);
  });
});

describe('texture disposal failures',()=>{
  it('releases retained identities and attempts every page deletion after one throws',()=>{
    const {gl,calls}=mockGL(),textures=new WorldTextures(gl);
    textures.page({width:8,height:8} as HTMLCanvasElement);textures.page({width:8,height:8} as HTMLCanvasElement);
    calls.deleteTexture.mockImplementationOnce(()=>{throw new Error('first deletion failed');});
    expect(()=>textures.dispose()).toThrow(AggregateError);expect(calls.deleteTexture).toHaveBeenCalledTimes(2);expect(textures.count).toBe(0);expect(textures.bytes).toBe(0);
  });
  it('attempts all four coverage channels and releases CPU ownership despite a deletion failure',()=>{
    const {gl,calls}=mockGL(),textures=new CoverageTextures(gl);
    textures.bind({coverage:{sun:new Uint8Array(4),moon:new Uint8Array(4),contact:new Uint8Array(4)},localPixels:new Uint8ClampedArray(16),width:2,height:2,left:0,top:0,step:4,revision:1,diffuse:{r:1,g:2,b:3},sunLight:{r:4,g:5,b:6},moonLight:{r:7,g:8,b:9}});
    calls.deleteTexture.mockImplementationOnce(()=>{throw new Error('first channel deletion failed');});
    expect(()=>textures.dispose()).toThrow(AggregateError);expect(calls.deleteTexture).toHaveBeenCalledTimes(4);expect(textures.count).toBe(0);expect(textures.bytes).toBe(0);
  });
});
