import type { AssetFrameSource } from '@orchard/ui';
import type { WebGLWorldPassBackend, WebGLSourceOptions } from './world-pass-webgl.js';
const contexts=new WeakMap<CanvasRenderingContext2D,WebGLWorldPassBackend>();
export function registerWebGLWorldBackend(context:CanvasRenderingContext2D,backend:WebGLWorldPassBackend):void { contexts.set(context,backend); }
export function unregisterWebGLWorldBackend(context:CanvasRenderingContext2D):void { contexts.delete(context); }
export function webglWorldBackend(context:CanvasRenderingContext2D):WebGLWorldPassBackend | undefined { return contexts.get(context); }
/** The Canvas default imports only this small dispatch table, never the backend. */
export function webglFrameSource(context:CanvasRenderingContext2D,source:AssetFrameSource,options:WebGLSourceOptions):AssetFrameSource | undefined {
  return contexts.get(context)?.associateSource(source,options);
}
