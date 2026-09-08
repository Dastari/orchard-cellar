import { resetUnlitWorldEffects } from '../receiver-frame-source.js';
import type { RawReceiverField } from '../receiver-raw-field.js';
import type { AssetFrameSource } from '@orchard/ui';
import type { WorldPassBackend, WorldPassImage, WorldPassSprite, WorldSpriteVariant, WorldPassRectangle } from '../world-pass-backend.js';
import type { WorldPassLayout } from '../renderer.js';
import type { RgbColor } from '../lighting.js';
import { CanvasWorldPresent } from '../world-pass-present.js';
import { WebGLCanvasAdapter, type CanvasState } from './canvas-adapter.js';
import { WorldTextures, type WebGLLightField, type TextureEntry } from './textures.js';
import { CoverageTextures, type WebGLCoverageField } from './coverage-textures.js';
import { cleanupWebGL,collectWebGLCleanup } from './cleanup.js';
import { WebGLGpuTimer } from './gpu-timer.js';
import { WorldGeometry } from './geometry.js';
import { registerWebGLWorldBackend, unregisterWebGLWorldBackend } from './hooks.js';
export { webglFrameSource, webglWorldBackend } from './hooks.js';
import { requireWebGL, WebGLWorldPassError } from './failure.js';
export { WebGLWorldPassError } from './failure.js';
export type { WebGLLightField } from './textures.js';
export type { WebGLCoverageField } from './coverage-textures.js';
export type WebGLGroundField=WebGLLightField | WebGLCoverageField;
export interface WebGLSourceOptions {
  readonly receiverRgb?: RgbColor;
  readonly ground?: { readonly field: WebGLGroundField; readonly worldX: number; readonly worldY: number; readonly plane?: boolean };
  readonly variant?: WorldSpriteVariant;
  /** Producer revision for a stable source; mutable unversioned canvases refresh on every draw. */
  readonly revision?: number;
}
export interface WebGLWorldPassOptions {
  readonly canvas?:HTMLCanvasElement;
  readonly present?:'canvas-copy'|'layer';
  /** Internal accuracy fixture only. Production must keep the default false. */
  readonly allowUnverifiedLighting?:boolean;
  readonly onFailure?:(reason:string)=>void;
  readonly onRestored?:()=>void;
}
export class WebGLWorldPassBackend implements WorldPassBackend {
  readonly kind='webgl2';
  readonly canvas:HTMLCanvasElement;
  readonly context:CanvasRenderingContext2D;
  readonly gl:WebGL2RenderingContext;
  private readonly adapter:WebGLCanvasAdapter;
  private readonly present:CanvasWorldPresent;
  private readonly textures:WorldTextures;
  private geometry:WorldGeometry;
  private readonly gpuTimer:WebGLGpuTimer;
  private readonly coverageTextures:CoverageTextures;
  private layout:WorldPassLayout | null=null;
  private disposed=false;
  private lost=false;
  private restoreFailure:string | null=null;
  private presentation:unknown;
  private pending:{ source:AssetFrameSource; options:WebGLSourceOptions } | null=null;
  private selectedImage:CanvasImageSource | null=null;
  private selectedField:WebGLGroundField | undefined;
  private selectedRevision=Number.NaN;
  private selectedState:CanvasState | null=null;
  private selectedTexture:TextureEntry | null=null;
  private selectedFieldRevision:number | undefined;
  private readonly white:HTMLCanvasElement;
  constructor(private readonly options:WebGLWorldPassOptions={}) {
    const cleanup:(()=>void)[]=[];
    try {
      this.white=document.createElement('canvas');
      cleanup.push(()=>{this.white.width=0;},()=>{this.white.height=0;});
      this.white.width=this.white.height=0;
      this.canvas=options.canvas ?? document.createElement('canvas');
      cleanup.push(()=>{this.canvas.width=0;},()=>{this.canvas.height=0;});
      this.canvas.width=this.canvas.height=1;
      this.gl=requireWebGL(this.canvas.getContext('webgl2',{alpha:false,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false}),'webgl2_unavailable');
      this.present=new CanvasWorldPresent();cleanup.push(()=>this.present.dispose());
      this.textures=new WorldTextures(this.gl);cleanup.push(()=>this.textures.dispose());
      this.coverageTextures=new CoverageTextures(this.gl);cleanup.push(()=>this.coverageTextures.dispose());
      this.geometry=new WorldGeometry(this.gl);cleanup.push(()=>this.geometry.dispose());
      this.gpuTimer=new WebGLGpuTimer(this.gl);cleanup.push(()=>this.gpuTimer.dispose());
      this.white.width=this.white.height=1;
      const white=requireWebGL(this.white.getContext('2d'),'webgl_white_source_unavailable');white.fillStyle='#ffffff';white.fillRect(0,0,1,1);
      this.adapter=new WebGLCanvasAdapter({canvas:this.canvas,valid:()=>this.requireActive(),
        image:(image,rect,state)=>this.image(image,rect,state),fill:(rect,color,state)=>this.fill(rect,color,state),clear:(rect,state)=>this.clear(rect,state)});
      this.context=this.adapter.context;cleanup.push(()=>unregisterWebGLWorldBackend(this.context));registerWebGLWorldBackend(this.context,this);
      cleanup.push(()=>this.canvas.removeEventListener('webglcontextlost',this.onLost));this.canvas.addEventListener('webglcontextlost',this.onLost);
      cleanup.push(()=>this.canvas.removeEventListener('webglcontextrestored',this.onRestored));this.canvas.addEventListener('webglcontextrestored',this.onRestored);
    }catch(error){
      this.disposed=true;this.layout=null;this.pending=null;this.presentation=undefined;this.invalidateSelection();
      const failures=collectWebGLCleanup(cleanup.reverse());
      if(failures.length)throw new AggregateError([error,...failures],'webgl_constructor_cleanup_failed',{cause:error});
      throw error;
    }
  }
  get width():number { return this.canvas.width; }
  get height():number { return this.canvas.height; }
  get presentBytes():number { return this.present.bytes; }
  get bytes():number { return this.disposed ? 0 : this.width*this.height*4+this.presentBytes+this.textures.bytes+this.coverageTextures.bytes+this.geometry.bytes+4; }
  get diagnostics() { return { ...this.gpuTimer.diagnostics,textures:this.textures.count+this.coverageTextures.count,textureBytes:this.textures.bytes+this.coverageTextures.bytes,textureUploads:this.textures.uploads+this.coverageTextures.uploads,
    buffers:this.disposed ? 0:1,programs:this.disposed ? 0:1,vertexArrays:this.disposed ? 0:1,framebuffers:0,drawCalls:this.geometry.draws,
    bytes:this.bytes,contextLost:this.lost,restoreFailure:this.restoreFailure }; }
  reserve(width:number,height:number,presentWidth:number,presentHeight:number):void {
    this.requireActive(); this.flush();
    if (this.width!==width) this.canvas.width=width;
    if (this.height!==height) this.canvas.height=height;
    if (this.options.present!=='layer' && presentWidth>0 && presentHeight>0) this.present.reserve(presentWidth,presentHeight);
  }
  begin(layout:WorldPassLayout):void {
    this.requireActive();
    if (layout.width>this.width || layout.height>this.height) throw new WebGLWorldPassError('world_pass_capacity_not_reserved');
    this.layout=layout; this.adapter.reset(); this.pending=null; this.invalidateSelection();
    this.geometry.begin(this.width,this.height);this.gpuTimer.begin();
    this.gl.disable(this.gl.SCISSOR_TEST); this.gl.clearColor(0,0,0,1); this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
  associateSource(source:AssetFrameSource,options:WebGLSourceOptions):AssetFrameSource {
    const previous=this.pending;
    this.pending={source,options:previous?.source===source ? {...previous.options,...options}:options}; return source;
  }
  releasePresentation(revision:unknown):void {
    if (this.presentation===revision) return;
    this.presentation=undefined;this.pending=null;this.invalidateSelection();
    cleanupWebGL([()=>this.flush(),()=>this.textures.dispose(),()=>this.coverageTextures.dispose()],'webgl_presentation_release_failed');
    this.presentation=revision;
  }
  sprite(draw:WorldPassSprite):void {
    if (draw.variant === 'normal') {
      this.associateSource(draw.source, { receiverRgb: draw.receiverRgb }); this.submit(draw);
    } else {
      this.associateSource(draw.canvasSource, { variant: 'normal' }); this.submit({ ...draw, source: draw.canvasSource });
    }
  }
  capRun(draw:WorldPassImage):void { this.submit(draw); }
  chunk(draw:WorldPassImage):void { this.submit(draw); }
  multiplyPlane(draw:WorldPassImage):void {
    this.context.save(); try { this.context.globalCompositeOperation='multiply'; this.context.imageSmoothingEnabled=true; this.submit(draw); }
    finally { this.context.restore(); }
  }
  multiplyRawLightPlane(field: RawReceiverField, destination: WorldPassRectangle): void {
    this.requireFrame();
    const source = { image: this.white, x: 0, y: 0, width: 1, height: 1 };
    this.context.save();
    try {
      this.context.globalCompositeOperation = 'multiply';
      this.context.imageSmoothingEnabled = false;
      this.associateSource(source, { revision: 0, ground: { field, worldX: field.left, worldY: field.top, plane: true } });
      this.context.drawImage(this.white, 0, 0, 1, 1, destination.x, destination.y, destination.width, destination.height);
    } finally { this.context.restore(); }
  }
  weather(draw:(context:CanvasRenderingContext2D)=>void):void { this.requireFrame(); draw(this.context); }
  particles(draw:(context:CanvasRenderingContext2D)=>void):void { this.requireFrame(); draw(this.context); }
  composite(target:CanvasRenderingContext2D,width:number,height:number):void {
    this.requireFrame(); this.flush();this.gpuTimer.end();
    const gl=this.gl; const error=gl.getError(); if (error!==gl.NO_ERROR) throw new WebGLWorldPassError(`webgl_frame_error:${error}`);
    target.setTransform(1,0,0,1,0,0); target.globalCompositeOperation='source-over'; target.globalAlpha=1; target.clearRect(0,0,width,height);
    if (this.options.present==='layer') {
      // The owner supplies an overflow-hidden wrapper beneath its alpha HUD.
      this.canvas.style.width=`${width*this.width/this.layout!.width}px`; this.canvas.style.height=`${height*this.height/this.layout!.height}px`;
      this.canvas.style.imageRendering='pixelated';
    } else this.present.draw(target,this.canvas,this.layout!.width,this.layout!.height,width,height);
    target.imageSmoothingEnabled=false;
  }
  flush():void { if (!this.disposed && !this.lost) this.geometry.flush(); }
  private submit(draw:WorldPassImage):void {
    const source=draw.source,d=draw.destination;
    this.context.save();
    try {
      if (draw.flipX) { this.context.translate(d.x+d.width,d.y); this.context.scale(-1,1); this.context.drawImage(source.image,source.x,source.y,source.width,source.height,0,0,d.width,d.height); }
      else this.context.drawImage(source.image,source.x,source.y,source.width,source.height,d.x,d.y,d.width,d.height);
    } finally { this.context.restore(); }
  }
  private image(image:CanvasImageSource,rect:readonly number[],state:CanvasState):void {
    this.requireFrame();
    if(rect.some(value=>!Number.isFinite(value)) || rect[2]!<0 || rect[3]!<0 || rect[6]!<0 || rect[7]!<0)throw new WebGLWorldPassError('webgl_unsupported_image_rectangle');
    if(rect[2]===0 || rect[3]===0 || rect[6]===0 || rect[7]===0){this.pending=null;return;}
    const m=state.matrix;
    if(!this.options.allowUnverifiedLighting && (rect[6]!*Math.hypot(m[0],m[1])<rect[2]!-1e-6 || rect[7]!*Math.hypot(m[2],m[3])<rect[3]!-1e-6))throw new WebGLWorldPassError('webgl_accuracy_unverified_downsample');
    const pending=this.pending; this.pending=null;
    const matches=pending && pending.source.image===image && pending.source.x===rect[0] && pending.source.y===rect[1]
      && pending.source.width===rect[2] && pending.source.height===rect[3];
    const options=matches ? pending.options:{};
    if (options.variant && options.variant!=='normal') throw new WebGLWorldPassError(`webgl_unverified_variant:${options.variant}`);
    const field=options.ground?.field;
    // A Canvas can change between two draws in one frame. NaN forces a flush
    // and upload without colliding with any producer-supplied revision.
    const revision=options.revision ?? (image instanceof HTMLCanvasElement || (typeof OffscreenCanvas!=='undefined' && image instanceof OffscreenCanvas) ? Number.NaN:0);
    const texture=this.select(image,revision,field,state);
    const rgb=options.receiverRgb;
    const mode=options.ground?.plane ? 5 : field ? 2 : rgb && (rgb.r!==255 || rgb.g!==255 || rgb.b!==255) ? 1:0;
    const color=rgb ? [rgb.r/255,rgb.g/255,rgb.b/255,1]:[1,1,1,1];
    const light=options.ground?.plane ? [0,0,1,1] : field ? [(options.ground!.worldX-field.left)/(field.width*field.step),(options.ground!.worldY-field.top)/(field.height*field.step),
      (options.ground!.worldX+rect[2]!-field.left)/(field.width*field.step),(options.ground!.worldY+rect[3]!-field.top)/(field.height*field.step)]:[0,0,0,0];
    const emission=matches ? pending.source.emissiveSpans:undefined;
    const quad=(left:number,top:number,width:number,height:number,operation:number) => {
      const sx=rect[0]!+left,sy=rect[1]!+top;
      this.geometry.quad([rect[4]!+left*rect[6]!/rect[2]!,rect[5]!+top*rect[7]!/rect[3]!,width*rect[6]!/rect[2]!,height*rect[7]!/rect[3]!],
        [sx/texture.width,sy/texture.height,(sx+width)/texture.width,(sy+height)/texture.height],color,light,operation,state);
    };
    if (mode!==1 || !emission?.length) quad(0,0,rect[2]!,rect[3]!,mode);
    else {
      // Partition the source, rather than overlaying emission after globalAlpha:
      // the reference applies item alpha only after its emissive restoration.
      let top=0,index=0;
      while (index<emission.length) {
        const row=emission[index]!;
        if (row>top) quad(0,top,rect[2]!,row-top,1);
        let left=0;
        while (index<emission.length && emission[index]===row) {
          const start=emission[index+1]!,width=emission[index+2]!;
          if (start>left) quad(left,row,start-left,1,1);
          quad(start,row,width,1,4); left=start+width; index+=3;
        }
        if (left<rect[2]!) quad(left,row,rect[2]!-left,1,1);
        top=row+1;
      }
      if (top<rect[3]!) quad(0,top,rect[2]!,rect[3]!-top,1);
    }
  }
  private select(image:CanvasImageSource,revision:number,field:WebGLGroundField | undefined,state:CanvasState) {
    const old=this.selectedState;
    const changed=image!==this.selectedImage || revision!==this.selectedRevision || field!==this.selectedField || !old
      || old.composite!==state.composite || old.smooth!==state.smooth || old.clip!==state.clip || field?.revision!==this.selectedFieldRevision;
    if(!changed && this.selectedTexture)return this.selectedTexture;
    if (changed) {
      this.flush(); this.selectedImage=image; this.selectedRevision=revision; this.selectedField=field; this.selectedFieldRevision=field?.revision; this.selectedState={...state};
      this.geometry.state(state,this.height);
    }
    // Texture calls only mutate bindings; same-page submissions retain one geometry batch.
    const texture=this.textures.page(image,revision,state.smooth);
    this.geometry.coverage(field && 'coverage' in field ? field:undefined,field?.step);
    if (field) { if ('coverage' in field) this.coverageTextures.bind(field); else this.textures.field(field); }
    else { this.gl.activeTexture(this.gl.TEXTURE1); this.gl.bindTexture(this.gl.TEXTURE_2D,texture.texture); }
    this.gl.activeTexture(this.gl.TEXTURE0); this.gl.bindTexture(this.gl.TEXTURE_2D,texture.texture);
    this.selectedTexture=texture;return texture;
  }
  private fill(rect:readonly number[],color:readonly number[],state:CanvasState):void {
    this.requireFrame(); this.pending=null; this.select(this.white,0,undefined,state);
    this.geometry.quad(rect,[0,0,1,1],color,[0,0,0,0],3,state);
  }
  private clear(rect:readonly number[],state:CanvasState):void {
    this.requireFrame(); this.pending=null;
    // Opaque world backing has black as the Canvas-cleared presentation value.
    this.fill(rect,[0,0,0,1],{...state,alpha:1,composite:'copy'});
  }
  private invalidateSelection():void { this.selectedImage=null; this.selectedField=undefined; this.selectedState=null; this.selectedTexture=null; this.selectedFieldRevision=undefined; this.selectedRevision=Number.NaN; }
  private requireFrame():void { this.requireActive(); if (!this.layout) throw new WebGLWorldPassError('webgl_frame_not_begun'); }
  private requireActive():void {
    if (this.disposed) throw new WebGLWorldPassError('webgl_disposed');
    if (this.restoreFailure) throw new WebGLWorldPassError(this.restoreFailure);
    if (this.lost || this.gl.isContextLost()) throw new WebGLWorldPassError('webgl_context_lost');
  }
  private readonly onLost=(event:Event):void => {
    if(this.disposed)return;
    event.preventDefault(); this.gpuTimer.reset();this.lost=true; this.layout=null; this.pending=null; this.options.onFailure?.('webgl_context_lost');
  };
  private readonly onRestored=():void => {
    if (this.disposed) return;
    try { this.geometry=new WorldGeometry(this.gl); this.gpuTimer.restore();this.textures.invalidate(); this.coverageTextures.invalidate(); this.invalidateSelection(); this.lost=false; this.options.onRestored?.(); }
    catch (error) { this.restoreFailure=error instanceof Error ? error.message:'webgl_restore_failed'; this.options.onFailure?.(this.restoreFailure); }
  };
  dispose():void {
    resetUnlitWorldEffects();
    if (this.disposed) return;
    this.disposed=true;this.layout=null;this.pending=null;this.presentation=undefined;this.invalidateSelection();
    cleanupWebGL([
      ()=>unregisterWebGLWorldBackend(this.context),
      ()=>this.canvas.removeEventListener('webglcontextlost',this.onLost),
      ()=>this.canvas.removeEventListener('webglcontextrestored',this.onRestored),
      ()=>this.adapter.reset(),
      ()=>this.gpuTimer.dispose(),()=>this.geometry.dispose(),()=>this.textures.dispose(),()=>this.coverageTextures.dispose(),()=>this.present.dispose(),
      ()=>{this.white.width=0;},()=>{this.white.height=0;},()=>{this.canvas.width=0;},()=>{this.canvas.height=0;},
    ],'webgl_dispose_failed');
  }
}
