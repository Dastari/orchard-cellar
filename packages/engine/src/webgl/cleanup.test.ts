import {describe,expect,it,vi} from 'vitest';
import {WorldGeometry} from './geometry.js';
import {createWorldProgram} from './shaders.js';
function mockGL(){
  const calls={createProgram:vi.fn(()=>({})),createShader:vi.fn(()=>({})),getShaderParameter:vi.fn(()=>true),getProgramParameter:vi.fn(()=>true),getUniformLocation:vi.fn(()=>({})),
    bufferData:vi.fn(),bufferSubData:vi.fn(),drawArrays:vi.fn(),createBuffer:vi.fn(()=>({})),createVertexArray:vi.fn(()=>({})),deleteBuffer:vi.fn(),deleteVertexArray:vi.fn(),deleteProgram:vi.fn(),deleteShader:vi.fn(),detachShader:vi.fn()};
  const fallback=vi.fn();const gl=new Proxy(calls,{get(target,key){return key in target?target[key as keyof typeof target]:fallback;}}) as unknown as WebGL2RenderingContext;
  return {gl,calls};
}
describe('individual GPU resource deletion failures',()=>{
  it('accounts CPU staging separately from GPU allocation and drops staging ownership when disposed',()=>{
    const {gl,calls}=mockGL(),geometry=new WorldGeometry(gl),staging=Reflect.get(geometry,'vertices') as Float32Array;
    expect(staging.byteLength).toBe(540672);expect(geometry.cpuBytes).toBe(staging.byteLength);
    expect(calls.bufferData.mock.calls[0]![1]).toBe(staging.byteLength);expect(geometry.gpuBytes).toBe(staging.byteLength);expect(geometry.bytes).toBe(1081344);
    Reflect.set(geometry,'count',6);geometry.dispose();
    expect(Reflect.get(geometry,'vertices')).not.toBe(staging);expect(Reflect.get(geometry,'vertices').byteLength).toBe(0);
    expect(geometry.cpuBytes).toBe(0);expect(geometry.gpuBytes).toBe(0);expect(geometry.bytes).toBe(0);
    geometry.flush();expect(calls.bufferSubData).not.toHaveBeenCalled();expect(calls.drawArrays).not.toHaveBeenCalled();
    geometry.dispose();expect(calls.deleteBuffer).toHaveBeenCalledOnce();expect(calls.deleteVertexArray).toHaveBeenCalledOnce();expect(calls.deleteProgram).toHaveBeenCalledOnce();
  });
  it('attempts VAO and program release after buffer deletion throws',()=>{
    const {gl,calls}=mockGL(),geometry=new WorldGeometry(gl);calls.deleteBuffer.mockImplementationOnce(()=>{throw new Error('buffer deletion failed');});
    expect(()=>geometry.dispose()).toThrow(AggregateError);expect(calls.deleteVertexArray).toHaveBeenCalledOnce();expect(calls.deleteProgram).toHaveBeenCalledOnce();
    expect(geometry.cpuBytes).toBe(0);expect(geometry.gpuBytes).toBe(0);expect(geometry.bytes).toBe(0);
    expect(Reflect.get(geometry,'vertices').byteLength).toBe(0);expect(()=>geometry.dispose()).not.toThrow();expect(calls.deleteBuffer).toHaveBeenCalledOnce();
  });
  it('cleans the acquired program when buffer acquisition and program deletion fail',()=>{
    const {gl,calls}=mockGL();calls.createBuffer.mockImplementationOnce(()=>{throw new Error('buffer acquisition failed');});calls.deleteProgram.mockImplementationOnce(()=>{throw new Error('program deletion failed');});
    expect(()=>new WorldGeometry(gl)).toThrow(AggregateError);expect(calls.deleteProgram).toHaveBeenCalledOnce();expect(calls.deleteShader).toHaveBeenCalledTimes(2);
  });
  it('attempts both shader releases and program release when detach throws after linking',()=>{
    const {gl,calls}=mockGL();calls.detachShader.mockImplementationOnce(()=>{throw new Error('detach failed');});
    expect(()=>createWorldProgram(gl)).toThrow(AggregateError);expect(calls.detachShader).toHaveBeenCalledTimes(2);expect(calls.deleteShader).toHaveBeenCalledTimes(2);expect(calls.deleteProgram).toHaveBeenCalledOnce();
  });
  it('preserves a compile failure while attempting every acquired shader/program cleanup',()=>{
    const {gl,calls}=mockGL();calls.getShaderParameter.mockReturnValue(false);calls.deleteShader.mockImplementationOnce(()=>{throw new Error('shader deletion failed');});
    expect(()=>createWorldProgram(gl)).toThrow(AggregateError);expect(calls.deleteShader).toHaveBeenCalledOnce();expect(calls.deleteProgram).toHaveBeenCalledOnce();
  });
});
