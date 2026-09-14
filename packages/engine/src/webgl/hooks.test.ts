import { expect,it,vi } from 'vitest';
import { registerWebGLWorldBackend,unregisterWebGLWorldBackend,webglFrameSource,webglWorldBackend } from './hooks.js';
import type { WebGLWorldPassBackend } from './world-pass-webgl.js';
it('keeps the Canvas default inert and unregisters backend source routing on disposal',()=>{
  const context={} as CanvasRenderingContext2D,source={image:{} as HTMLCanvasElement,x:8,y:16,width:16,height:16};
  expect(webglFrameSource(context,source,{})).toBeUndefined();
  const backend={associateSource:vi.fn(()=>source)} as unknown as WebGLWorldPassBackend;registerWebGLWorldBackend(context,backend);
  expect(webglWorldBackend(context)).toBe(backend);const options={receiverRgb:{r:1,g:2,b:3}};
  expect(webglFrameSource(context,source,options)).toBe(source);expect(backend.associateSource).toHaveBeenCalledWith(source,options);
  unregisterWebGLWorldBackend(context);expect(webglWorldBackend(context)).toBeUndefined();expect(webglFrameSource(context,source,options)).toBeUndefined();
});
