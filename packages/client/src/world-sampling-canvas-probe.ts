import { countWorldSampling, isWorldSamplingContext, worldSamplingProbe } from '@orchard/ui';
interface TransformState { a: number; b: number; c: number; d: number; width: number; height: number; depth: number; stack: Float64Array }
/** Tracks only the linear transform: translations cannot change draw ratios.
 * The initial native matrix is read once per world context, never per sprite. */
export function installWorldSamplingCanvasProbe(): () => void {
  const proto = CanvasRenderingContext2D.prototype;
  const original = { drawImage: proto.drawImage, save: proto.save, restore: proto.restore,
    setTransform: proto.setTransform, resetTransform: proto.resetTransform,
    transform: proto.transform, scale: proto.scale, rotate: proto.rotate };
  const states = new WeakMap<CanvasRenderingContext2D, TransformState>();
  function state(context: CanvasRenderingContext2D): TransformState | undefined {
    if (!isWorldSamplingContext(context)) return undefined;
    let value = states.get(context);
    const width = context.canvas.width, height = context.canvas.height;
    if (!value) {
      const { a, b, c, d } = context.getTransform();
      value = { a, b, c, d, width, height, depth: 0, stack: new Float64Array(256) };
      states.set(context, value);
    } else if (value.width !== width || value.height !== height) {
      value.a = value.d = 1; value.b = value.c = 0; value.depth = 0;
      value.width = width; value.height = height;
    }
    return value;
  }
  proto.drawImage = function (source: CanvasImageSource, a: number, b: number,
    c?: number, d?: number, e?: number, f?: number, g?: number, h?: number): void {
    const value = state(this);
    if (value) {
      const image = source as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
      const sw = arguments.length === 9 ? c! : image.naturalWidth ?? image.width ?? 0;
      const sh = arguments.length === 9 ? d! : image.naturalHeight ?? image.height ?? 0;
      const dw = arguments.length === 9 ? g! : arguments.length === 5 ? c! : sw;
      const dh = arguments.length === 9 ? h! : arguments.length === 5 ? d! : sh;
      countWorldSampling(this, sw, sh, dw, dh, value.a, value.b, value.c, value.d, this.imageSmoothingEnabled);
    }
    if (arguments.length === 3) (original.drawImage as (source: CanvasImageSource, x: number, y: number) => void).call(this, source, a, b);
    else if (arguments.length === 5) (original.drawImage as (source: CanvasImageSource, x: number, y: number, width: number, height: number) => void).call(this, source, a, b, c!, d!);
    else original.drawImage.call(this, source, a, b, c!, d!, e!, f!, g!, h!);
  };
  proto.save = function (): void {
    const value = state(this); original.save.call(this);
    if (!value) return;
    if (value.depth >= 64) { worldSamplingProbe.overflow = true; return; }
    const offset = value.depth++ * 4;
    value.stack[offset] = value.a; value.stack[offset + 1] = value.b;
    value.stack[offset + 2] = value.c; value.stack[offset + 3] = value.d;
  };
  proto.restore = function (): void {
    const value = state(this); original.restore.call(this);
    if (!value || !value.depth) return;
    const offset = --value.depth * 4;
    value.a = value.stack[offset]!; value.b = value.stack[offset + 1]!;
    value.c = value.stack[offset + 2]!; value.d = value.stack[offset + 3]!;
  };
  proto.setTransform = function (a?: number | DOMMatrix2DInit, b?: number, c?: number, d?: number, e?: number, f?: number): void {
    const value = state(this);
    if (typeof a === 'number') (original.setTransform as (a: number, b: number, c: number, d: number, e: number, f: number) => void).call(this, a, b!, c!, d!, e!, f!);
    else original.setTransform.call(this, a);
    if (!value) return;
    if (typeof a === 'number') { value.a = a; value.b = b!; value.c = c!; value.d = d!; }
    else { const matrix = this.getTransform(); value.a = matrix.a; value.b = matrix.b; value.c = matrix.c; value.d = matrix.d; }
  };
  proto.resetTransform = function (): void {
    const value = state(this); original.resetTransform.call(this);
    if (value) { value.a = value.d = 1; value.b = value.c = 0; }
  };
  proto.transform = function (a: number, b: number, c: number, d: number, e: number, f: number): void {
    const value = state(this); original.transform.call(this, a, b, c, d, e, f);
    if (!value) return;
    const { a: x, b: y, c: z, d: w } = value;
    value.a = x * a + z * b; value.b = y * a + w * b;
    value.c = x * c + z * d; value.d = y * c + w * d;
  };
  proto.scale = function (x: number, y: number): void {
    const value = state(this); original.scale.call(this, x, y);
    if (value) { value.a *= x; value.b *= x; value.c *= y; value.d *= y; }
  };
  proto.rotate = function (angle: number): void {
    const value = state(this); original.rotate.call(this, angle);
    if (!value) return;
    const { a, b, c, d } = value, cosine = Math.cos(angle), sine = Math.sin(angle);
    value.a = a * cosine + c * sine; value.b = b * cosine + d * sine;
    value.c = c * cosine - a * sine; value.d = d * cosine - b * sine;
  };
  return () => { Object.assign(proto, original); };
}
