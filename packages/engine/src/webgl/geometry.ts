import { mapping } from './integer-mapping.js';
import { cleanupWebGL,collectWebGLCleanup } from './cleanup.js';
import { createWorldProgram, type WorldProgram } from './shaders.js';
import { requireWebGL, WebGLWorldPassError } from './failure.js';
import type { WebGLCoverageField } from './coverage-textures.js';
import type { CanvasState } from './canvas-adapter.js';
const STRIDE=23, CAPACITY=6*2048;
const CORNERS=[0,1,2,2,1,3] as const;
const EMPTY_VERTICES=new Float32Array(0);
export class WorldGeometry {
  private program: WorldProgram;
  private buffer: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private vertices=new Float32Array(CAPACITY*STRIDE);
  private bufferBytes=0;
  private disposed=false;
  private count=0;
  draws=0;
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program=createWorldProgram(gl);
    let buffer:WebGLBuffer | null=null,vao:WebGLVertexArrayObject | null=null;
    try {
    this.buffer=buffer=requireWebGL(gl.createBuffer(),'webgl_buffer_unavailable');
    this.vao=vao=requireWebGL(gl.createVertexArray(),'webgl_vertex_array_unavailable');
    gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer); gl.bufferData(gl.ARRAY_BUFFER,this.vertices.byteLength,gl.DYNAMIC_DRAW);this.bufferBytes=this.vertices.byteLength;
    for (const [location,size,offset] of [[0,2,0],[1,2,2],[2,4,4],[3,2,8],[4,1,10],[5,4,11],[6,2,15],[7,4,17],[8,2,21]]) {
      gl.enableVertexAttribArray(location!); gl.vertexAttribPointer(location!,size!,gl.FLOAT,false,STRIDE*4,offset!*4);
    }
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.DITHER); gl.enable(gl.BLEND);
    } catch(error) {
      this.vertices=EMPTY_VERTICES;this.bufferBytes=0;this.disposed=true;
      const failures=collectWebGLCleanup([()=>{if(buffer)gl.deleteBuffer(buffer);},()=>{if(vao)gl.deleteVertexArray(vao);},()=>gl.deleteProgram(this.program.program)]);
      if(failures.length)throw new AggregateError([error,...failures],'webgl_geometry_constructor_cleanup_failed',{cause:error});throw error;
    }
  }
  /** CPU staging and GPU buffer are separate allocations of equal active size. */
  get cpuBytes():number { return this.vertices.byteLength; }
  get gpuBytes():number { return this.bufferBytes; }
  get bytes():number { return this.cpuBytes+this.gpuBytes; }
  begin(width:number,height:number):void {
    const gl=this.gl; this.count=0; this.draws=0;
    gl.useProgram(this.program.program); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.uniform2f(this.program.resolution,width,height); gl.viewport(0,0,width,height);
  }
  coverage(field:WebGLCoverageField | undefined,step=1):void {
    const gl=this.gl; gl.uniform1i(this.program.rawCoverage,field?1:0); gl.uniform1f(this.program.fieldStep,step);
    if (field) for (const [location,color] of [[this.program.diffuseLight,field.diffuse],[this.program.sunLight,field.sunLight],[this.program.moonLight,field.moonLight]] as const) gl.uniform3f(location,color.r/255,color.g/255,color.b/255);
  }
  state(state:CanvasState,height:number):void {
    const gl=this.gl;
    if (state.clip) { gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.ceil(state.clip[0]),height-Math.floor(state.clip[3]),Math.max(0,Math.floor(state.clip[2])-Math.ceil(state.clip[0])),Math.max(0,Math.floor(state.clip[3])-Math.ceil(state.clip[1]))); }
    else gl.disable(gl.SCISSOR_TEST);
    gl.uniform1i(this.program.clipEnabled,state.pathClip?1:0);
    if (state.pathClip) {
      const {x,y,width,height}=state.pathClip.rectangle;
      gl.uniform4f(this.program.clipRectangle,x,y,width,height);gl.uniform1f(this.program.clipOutside,state.pathClip.outside);
    }
    gl.blendEquation(gl.FUNC_ADD);
    switch (state.composite) {
      case 'source-over': gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); break;
      case 'multiply': gl.blendFuncSeparate(gl.DST_COLOR,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA); break;
      case 'lighter': gl.blendFunc(gl.ONE,gl.ONE); break;
      case 'copy': gl.blendFunc(gl.ONE,gl.ZERO); break;
      case 'destination-in': gl.blendFunc(gl.ZERO,gl.SRC_ALPHA); break;
      default: throw new WebGLWorldPassError(`webgl_unsupported_composite:${state.composite}`);
    }
  }
  quad(rect:readonly number[],uv:readonly number[],color:readonly number[],light:readonly number[],mode:number,state:CanvasState,source?:readonly number[]):void {
    if (this.count+6>CAPACITY) this.flush();
    const m=state.matrix; const sample=mapping(rect,source,m,state.smooth);
    const aligned=source && !state.smooth && ((Math.abs(m[0])<1e-9 && Math.abs(m[3])<1e-9) || (Math.abs(m[1])<1e-9 && Math.abs(m[2])<1e-9));
    const det=m[0]*m[3]-m[1]*m[2];
    for (const corner of CORNERS) {
      const x=(corner&1)?rect[0]!+rect[2]!:rect[0]!,y=(corner&2)?rect[1]!+rect[3]!:rect[1]!;
      let px=m[0]*x+m[2]*y+m[4],py=m[1]*x+m[3]*y+m[5];
      let tx=(corner&1)?1:0,ty=(corner&2)?1:0;
      if(aligned && det!==0){
        px=Math.round(Math.fround(px));py=Math.round(Math.fround(py));
        const lx=(m[3]*(px-m[4])-m[2]*(py-m[5]))/det,ly=(-m[1]*(px-m[4])+m[0]*(py-m[5]))/det;
        tx=(lx-rect[0]!)/rect[2]!;ty=(ly-rect[1]!)/rect[3]!;
      }
      const u=uv[0]!+(uv[2]!-uv[0]!)*tx,v=uv[1]!+(uv[3]!-uv[1]!)*ty;
      const lu=light[0]!+(light[2]!-light[0]!)*tx,lv=light[1]!+(light[3]!-light[1]!)*ty;
      const offset=this.count++*STRIDE;
      const data=this.vertices;
      data[offset]=px;data[offset+1]=py;data[offset+2]=u;data[offset+3]=v;
      data[offset+4]=color[0]!;data[offset+5]=color[1]!;data[offset+6]=color[2]!;data[offset+7]=color[3]!*state.alpha;
      data[offset+8]=lu;data[offset+9]=lv;data[offset+10]=mode;for(let i=0;i<12;i++)data[offset+11+i]=sample[i]!;
    }
  }
  flush():void {
    if (this.count===0) return;
    const gl=this.gl; gl.bufferSubData(gl.ARRAY_BUFFER,0,this.vertices,0,this.count*STRIDE); gl.drawArrays(gl.TRIANGLES,0,this.count); this.count=0; this.draws++;
  }
  dispose():void {
    if(this.disposed)return;
    this.disposed=true;this.count=0;this.vertices=EMPTY_VERTICES;this.bufferBytes=0;
    cleanupWebGL([()=>this.gl.deleteBuffer(this.buffer),()=>this.gl.deleteVertexArray(this.vao),()=>this.gl.deleteProgram(this.program.program)],'webgl_geometry_dispose_failed');
  }
}
