import type { WorldPathClip } from './path-clips.js';
import { WebGLWorldPassError } from './failure.js';
import { imageDimensions } from './textures.js';
export type Matrix = readonly [number, number, number, number, number, number];
export interface CanvasState {
  matrix: Matrix; alpha: number; composite: GlobalCompositeOperation;
  smooth: boolean; fill: string; clip: readonly [number, number, number, number] | null;
  pathClip?: WorldPathClip;
}
export interface CanvasSink {
  readonly canvas: HTMLCanvasElement;
  image(image: CanvasImageSource, rectangle: readonly number[], state: CanvasState): void;
  fill(rectangle: readonly number[], color: readonly number[], state: CanvasState): void;
  clear(rectangle: readonly number[], state: CanvasState): void;
  valid(): void;
  pathClip?(path: Path2D, rule: CanvasFillRule, state: CanvasState): WorldPathClip;
}
export function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function canvasColor(value: string): readonly number[] {
  const hex = /^#([\da-f]{3,8})$/i.exec(value);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((c) => c+c).join('');
    if (digits.length === 6 || digits.length === 8) return [0,2,4,6].map((i) => i < digits.length ? parseInt(digits.slice(i,i+2),16)/255 : 1);
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value);
  if (rgb) return [Number(rgb[1])/255,Number(rgb[2])/255,Number(rgb[3])/255,Number(rgb[4] ?? 1)];
  if (value === 'transparent') return [0,0,0,0];
  if (value === 'black') return [0,0,0,1];
  if (value === 'white') return [1,1,1,1];
  throw new WebGLWorldPassError(`webgl_unsupported_color:${value}`);
}
/** The painter keeps one identity, but no hidden Canvas world backing exists.
 * Unknown operations fail explicitly so the client can redraw with Canvas. */
export class WebGLCanvasAdapter {
  readonly context: CanvasRenderingContext2D;
  private state: CanvasState = this.initial();
  private readonly stack: CanvasState[] = [];
  private path: readonly number[] | null = null;
  constructor(private readonly sink: CanvasSink) {
    const methods: Record<string, (...args: never[]) => unknown> = {
      save: () => { this.stack.push({ ...this.state }); },
      restore: () => { this.state = this.stack.pop() ?? this.state; },
      setTransform: (...args: unknown[]) => { this.state.matrix = this.matrix(args); },
      resetTransform: () => { this.state.matrix = [1,0,0,1,0,0]; },
      getTransform: () => new DOMMatrix([...this.state.matrix]),
      transform: (...args: number[]) => { this.state.matrix = multiplyMatrix(this.state.matrix, this.matrix(args)); },
      translate: (x: number, y: number) => { this.state.matrix = multiplyMatrix(this.state.matrix,[1,0,0,1,x,y]); },
      scale: (x: number, y: number) => { this.state.matrix = multiplyMatrix(this.state.matrix,[x,0,0,y,0,0]); },
      rotate: (angle: number) => { const c=Math.cos(angle),s=Math.sin(angle); this.state.matrix=multiplyMatrix(this.state.matrix,[c,s,-s,c,0,0]); },
      drawImage: (image: CanvasImageSource, ...args: number[]) => {
        const size=imageDimensions(image);
        const rectangle=args.length===2 ? [0,0,size.width,size.height,args[0]!,args[1]!,size.width,size.height]
          : args.length===4 ? [0,0,size.width,size.height,...args] : args;
        if (rectangle.length!==8) throw new WebGLWorldPassError('webgl_draw_image_arguments');
        this.sink.image(image,rectangle,this.state);
      },
      fillRect: (...args: number[]) => this.sink.fill(args,canvasColor(this.state.fill),this.state),
      clearRect: (...args: number[]) => this.sink.clear(args,this.state),
      beginPath: () => { this.path=null; },
      rect: (...args: number[]) => { if (this.path!==null) throw new WebGLWorldPassError('webgl_unsupported_multi_rect_path'); this.path=args; },
      clip: (...args: unknown[]) => {
        if (args.length && typeof args[0] === 'object') {
          if (!this.sink.pathClip || this.state.pathClip !== undefined
            || this.state.matrix.some((value, index) => value !== [1,0,0,1,0,0][index])) throw new WebGLWorldPassError('webgl_unsupported_clip_path');
          const rule = args[1] ?? 'nonzero';
          if (rule !== 'nonzero' && rule !== 'evenodd') throw new WebGLWorldPassError('webgl_unsupported_clip_path');
          this.state.pathClip = this.sink.pathClip(args[0] as Path2D, rule, this.state); return;
        }
        if (this.path===null) throw new WebGLWorldPassError('webgl_unsupported_clip_path');
        const [x,y,w,h]=this.path as readonly [number,number,number,number]; const m=this.state.matrix;
        if (m[1]!==0 || m[2]!==0) throw new WebGLWorldPassError('webgl_unsupported_rotated_clip');
        let left=Math.min(x*m[0]+m[4],(x+w)*m[0]+m[4]),top=Math.min(y*m[3]+m[5],(y+h)*m[3]+m[5]);
        let right=left+Math.abs(w*m[0]),bottom=top+Math.abs(h*m[3]);
        if (this.state.clip) { left=Math.max(left,this.state.clip[0]); top=Math.max(top,this.state.clip[1]); right=Math.min(right,this.state.clip[2]); bottom=Math.min(bottom,this.state.clip[3]); }
        this.state.clip=[left,top,Math.max(left,right),Math.max(top,bottom)];
      },
      isContextLost: () => { try { this.sink.valid(); return false; } catch { return true; } },
    };
    this.context = new Proxy({} as CanvasRenderingContext2D, {
      get: (_target, key) => {
        if (key==='canvas') return sink.canvas;
        if (typeof key==='symbol') return undefined;
        if (key in methods) return methods[key];
        if (key==='globalAlpha') return this.state.alpha;
        if (key==='globalCompositeOperation') return this.state.composite;
        if (key==='imageSmoothingEnabled') return this.state.smooth;
        if (key==='fillStyle') return this.state.fill;
        if (key==='filter') return 'none';
        return () => { throw new WebGLWorldPassError(`webgl_unsupported_canvas:${key}`); };
      },
      set: (_target, key, value: unknown) => {
        if (key==='globalAlpha') { if (typeof value==='number' && value>=0 && value<=1) this.state.alpha=value; }
        else if (key==='globalCompositeOperation') {
          if (!['source-over','multiply','lighter'].includes(String(value))) throw new WebGLWorldPassError(`webgl_unsupported_composite:${String(value)}`);
          this.state.composite=value as GlobalCompositeOperation;
        } else if (key==='imageSmoothingEnabled') this.state.smooth=Boolean(value);
        else if (key==='imageSmoothingQuality') { /* nearest/linear selection is explicit */ }
        else if (key==='fillStyle' && typeof value==='string') this.state.fill=value;
        else if (key==='filter' && value==='none') { /* reset supported */ }
        else throw new WebGLWorldPassError(`webgl_unsupported_canvas_property:${String(key)}`);
        return true;
      },
    });
  }
  reset(): void { this.state=this.initial(); this.stack.length=0; this.path=null; }
  snapshot(): CanvasState { return this.state; }
  private initial(): CanvasState { return { matrix:[1,0,0,1,0,0],alpha:1,composite:'source-over',smooth:false,fill:'#000000',clip:null }; }
  private matrix(args: readonly unknown[]): Matrix {
    if (args.length===1 && typeof args[0]==='object' && args[0]!==null) {
      const m=args[0] as DOMMatrix2DInit; return [m.a ?? 1,m.b ?? 0,m.c ?? 0,m.d ?? 1,m.e ?? 0,m.f ?? 0];
    }
    if (args.length!==6 || !args.every((v)=>typeof v==='number' && Number.isFinite(v))) throw new WebGLWorldPassError('webgl_invalid_transform');
    return args as unknown as Matrix;
  }
}
