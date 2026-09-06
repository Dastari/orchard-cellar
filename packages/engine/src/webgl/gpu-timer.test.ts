import {describe,expect,it,vi} from 'vitest';
import {WebGLGpuTimer} from './gpu-timer.js';
function setup(available=true){
 const ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};let ready=false,disjoint=false;
 const gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getExtension:vi.fn(()=>available?ext:null),isContextLost:()=>false,
  getParameter:()=>disjoint,createQuery:vi.fn(()=>({})),deleteQuery:vi.fn(),beginQuery:vi.fn(),endQuery:vi.fn(),getQueryParameter:vi.fn((_query:unknown,parameter:number)=>parameter===3?ready:2500000)};
 return {timer:new WebGLGpuTimer(gl as unknown as WebGL2RenderingContext),gl,ready:()=>{ready=true;},disjoint:()=>{disjoint=true;}};
}
describe('optional nonblocking GPU timing',()=>{
 it('never reads a result until available and bounds pending queries',()=>{
  const {timer,gl,ready}=setup();for(let i=0;i<32;i++){timer.begin();timer.end();}
  expect(gl.createQuery).toHaveBeenCalledTimes(8);expect(gl.getQueryParameter.mock.calls.some(([,parameter])=>parameter===4)).toBe(false);
  ready();timer.begin();timer.end();expect(timer.diagnostics.gpuTimeMs).toBe(2.5);expect(timer.diagnostics.gpuCompletedSamples).toBe(8);expect(gl.createQuery).toHaveBeenCalledTimes(8);
  timer.dispose();expect(gl.deleteQuery).toHaveBeenCalledTimes(8);expect(timer.diagnostics.gpuQueries).toBe(0);expect(timer.diagnostics.gpuTimeMs).toBeNull();
 });
 it('discards disjoint results and releases pending queries on loss/reset',()=>{
  const {timer,gl,disjoint}=setup();timer.begin();timer.end();disjoint();timer.begin();expect(timer.diagnostics.gpuDisjointSamples).toBe(1);expect(timer.diagnostics.gpuTimeMs).toBeNull();expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
  timer.reset();expect(timer.diagnostics.gpuPendingQueries).toBe(0);expect(timer.diagnostics.gpuQueries).toBe(0);
 });
 it('treats the absent extension as a normal unavailable diagnostic',()=>{
  const {timer,gl}=setup(false);timer.begin();timer.end();expect(gl.createQuery).not.toHaveBeenCalled();expect(timer.diagnostics.gpuTimingAvailable).toBe(false);timer.dispose();
 });
});

it('deletes every timer query even if ending the active query and deleting the first both throw',()=>{
  const {timer,gl}=setup();for(let i=0;i<7;i++){timer.begin();timer.end();}timer.begin();
  gl.endQuery.mockImplementationOnce(()=>{throw new Error('end failed');});gl.deleteQuery.mockImplementationOnce(()=>{throw new Error('delete failed');});
  expect(()=>timer.dispose()).toThrow(AggregateError);expect(gl.deleteQuery).toHaveBeenCalledTimes(8);
  expect(timer.diagnostics.gpuQueries).toBe(0);expect(timer.diagnostics.gpuPendingQueries).toBe(0);expect(timer.diagnostics.gpuTimingAvailable).toBe(false);
});
