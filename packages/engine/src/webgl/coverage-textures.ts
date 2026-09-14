import { cleanupWebGL,collectWebGLCleanup } from './cleanup.js';
import type { RgbColor } from '../lighting.js';
import { requireWebGL, WebGLWorldPassError } from './failure.js';
export interface WebGLCoverageField {
  readonly coverage: { readonly sun: Uint8Array; readonly moon: Uint8Array; readonly contact: Uint8Array };
  readonly localPixels: Uint8ClampedArray<ArrayBuffer>;
  readonly width:number; readonly height:number; readonly left:number; readonly top:number; readonly step:number; readonly revision:number;
  readonly diffuse:RgbColor; readonly sunLight:RgbColor; readonly moonLight:RgbColor;
}
interface Entry { readonly textures:WebGLTexture[]; readonly width:number; readonly height:number; revision:number }
/** Four raw fields let the fragment shader resolve corner maxima before smooth sampling. */
export class CoverageTextures {
  private readonly entries=new Map<Uint8Array,Entry>();
  bytes=0; uploads=0;
  constructor(private readonly gl:WebGL2RenderingContext) {}
  get count():number { return this.entries.size*4; }
  bind(field:WebGLCoverageField):void {
    const {gl}=this,size=field.width*field.height;
    if (size<=0 || size*4>4*1024*1024 || field.coverage.sun.length!==size || field.coverage.moon.length!==size || field.coverage.contact.length!==size || field.localPixels.length!==size*4) throw new WebGLWorldPassError('webgl_coverage_size');
    let entry=this.entries.get(field.coverage.sun);
    if (entry && (entry.width!==field.width || entry.height!==field.height)) { this.remove(entry); this.entries.delete(field.coverage.sun); entry=undefined; }
    if (!entry) {
      if (this.entries.size>=8) { const key=this.entries.keys().next().value!; this.remove(this.entries.get(key)!); this.entries.delete(key); }
      const textures:WebGLTexture[]=[];
      try { for (let i=0;i<4;i++) textures.push(requireWebGL(gl.createTexture(),'webgl_coverage_texture_unavailable')); }
      catch(error){const failures=collectWebGLCleanup(textures.map(texture=>()=>gl.deleteTexture(texture)));if(failures.length)throw new AggregateError([error,...failures],'webgl_coverage_constructor_cleanup_failed',{cause:error});throw error;}
      entry={textures,width:field.width,height:field.height,revision:Number.NaN}; this.entries.set(field.coverage.sun,entry); this.bytes+=size*7;
    }
    const channels=[field.localPixels,field.coverage.sun,field.coverage.moon,field.coverage.contact];
    if(channels.some(channel=>!(channel.buffer instanceof ArrayBuffer)))throw new WebGLWorldPassError('webgl_shared_field_buffer');
    for (let index=0;index<4;index++) {
      gl.activeTexture(gl.TEXTURE1+index); gl.bindTexture(gl.TEXTURE_2D,entry.textures[index]!);
      if (entry.revision===field.revision) continue;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,1); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,index===0?gl.RGBA8:gl.R8,field.width,field.height,0,index===0?gl.RGBA:gl.RED,gl.UNSIGNED_BYTE,channels[index]! as Uint8Array<ArrayBuffer>); this.uploads++;
    }
    entry.revision=field.revision;
    const error=gl.getError(); if (error!==gl.NO_ERROR) throw new WebGLWorldPassError(`webgl_coverage_upload_error:${error}`);
  }
  invalidate():void {
    for (const entry of this.entries.values()) { for (let i=0;i<4;i++) entry.textures[i]=requireWebGL(this.gl.createTexture(),'webgl_restore_coverage_unavailable'); entry.revision=Number.NaN; }
  }
  private remove(entry:Entry):void { for (const texture of entry.textures) this.gl.deleteTexture(texture); this.bytes-=entry.width*entry.height*7; }
  dispose():void {const textures=[...this.entries.values()].flatMap(entry=>entry.textures);this.entries.clear();this.bytes=0;cleanupWebGL(textures.map(texture=>()=>this.gl.deleteTexture(texture)),'webgl_coverage_dispose_failed');}
}
