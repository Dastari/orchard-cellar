import type { UiRect } from '../../geometry.js';
import { uiIntersectRect } from '../layout/box.js';

export interface UiPaintRecord { readonly kind: string; readonly rect: UiRect; readonly clip: UiRect }
/** Records effective raster bounds, including nested clips and scaled image/text draws. */
export function createUiRecordingCanvas(width: number, height: number) {
  const viewport = { x: 0, y: 0, width, height };
  let state = { clip: viewport, alpha: 1, lineWidth: 1, a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 };
  const stack: typeof state[] = [];
  let path = viewport;
  let linePoints: {x:number;y:number}[] = [];
  const records: UiPaintRecord[] = [];
  const rect = (x: number, y: number, w: number, h: number): UiRect => {
    const points = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([px,py]) => ({ x: px! * state.a + py! * state.c + state.x, y: px! * state.b + py! * state.d + state.y }));
    const left = Math.min(...points.map(point => point.x)), top = Math.min(...points.map(point => point.y));
    return { x: left, y: top, width: Math.max(...points.map(point => point.x)) - left, height: Math.max(...points.map(point => point.y)) - top };
  };
  const transform = (a: number, b: number, c: number, d: number, x: number, y: number) => {
    const next = { a: state.a*a+state.c*b, b: state.b*a+state.d*b, c: state.a*c+state.c*d, d: state.b*c+state.d*d, x: state.a*x+state.c*y+state.x, y: state.b*x+state.d*y+state.y };
    if (next.a * next.b || next.c * next.d) throw new Error('Recording non-quarter-turn paths needs a bitmap snapshot');
    state = { ...state, ...next };
  };
  const record = (kind: string, box: UiRect) => {
    const clipped = uiIntersectRect(box, state.clip);
    if (clipped.width && clipped.height) records.push({ kind, rect: clipped, clip: state.clip });
  };
  const methods: Record<string, unknown> = {
    canvas: { width, height }, imageSmoothingEnabled: false,
    save: () => { stack.push({ ...state }); },
    restore: () => { const previous = stack.pop(); if (previous) state = previous; },
    setTransform: (a: number, b: number, c: number, d: number, x: number, y: number) => {
      if (a * b || c * d) throw new Error('Recording non-quarter-turn paths needs a bitmap snapshot');
      state = { ...state, a, b, c, d, x, y };
    },
    getTransform: () => ({ a: state.a, b: state.b, c: state.c, d: state.d, e: state.x, f: state.y }),
    transform,
    translate: (x: number, y: number) => transform(1,0,0,1,x,y),
    scale: (x: number, y: number) => transform(x,0,0,y,0,0),
    beginPath: () => { linePoints = []; path = { x: 0, y: 0, width: 0, height: 0 }; },
    setLineDash: () => { /* Dashes share the full stroke bounds. */ },
    moveTo: (x:number,y:number) => { const point=rect(x,y,0,0);linePoints.push(point); },
    lineTo: (x:number,y:number) => { const point=rect(x,y,0,0);linePoints.push(point); },
    stroke: () => { if(!linePoints.length)return; const margin=state.lineWidth*Math.max(Math.hypot(state.a,state.b),Math.hypot(state.c,state.d))/2;const xs=linePoints.map(p=>p.x),ys=linePoints.map(p=>p.y);record('stroke',{x:Math.min(...xs)-margin,y:Math.min(...ys)-margin,width:Math.max(...xs)-Math.min(...xs)+margin*2,height:Math.max(...ys)-Math.min(...ys)+margin*2}); },
    rect: (x: number, y: number, w: number, h: number) => { path = rect(x, y, w, h); },
    clip: () => { state.clip = uiIntersectRect(state.clip, path); },
    fill: () => { record('path', path); },
    clearRect: () => {},
    fillRect: (x: number, y: number, w: number, h: number) => { record('rect', rect(x, y, w, h)); },
    strokeRect: (x: number, y: number, w: number, h: number) => { record('stroke', rect(x - 0.5, y - 0.5, w + 1, h + 1)); },
    drawImage: (...args: unknown[]) => {
      const values = args.slice(1) as number[];
      const image = args[0] as { width: number; height: number };
      const [x, y, w, h] = values.length === 8 ? values.slice(4) : values.length === 4 ? values : [...values, image.width, image.height];
      record('image', rect(x!, y!, w!, h!));
    },
  };
  const context = new Proxy(methods, {
    get(target, name) {
      if (name === 'globalAlpha') return state.alpha;
      if (name === 'lineWidth') return state.lineWidth;
      if (name in target) return target[name as string];
      throw new Error(`Unrecorded canvas operation: ${String(name)}`);
    },
    set(target, name, value) { if(name==='lineWidth'){state.lineWidth=value as number;return true;} if (name === 'globalAlpha') { state.alpha = value as number; return true; } target[name as string] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { context, records, get balanced() { return stack.length === 0; } };
}
