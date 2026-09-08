import { installWorldSamplingCanvasProbe } from './world-sampling-canvas-probe.js';
import { worldSamplingProbe } from '@orchard/ui';
import { countDrawImageSource, countCanvasSave, countCanvasRestore,
  renderOperationCounters, renderCounterSupport } from '@orchard/ui';

/** Optional whole-client Canvas instrumentation: includes the HUD and offscreen
 * construction. Never inspects pixels, touches filters, or changes draw state. */
export function installRenderCanvasProbe(): () => void {
  if (renderCounterSupport.nativeCanvas) throw new Error('render_canvas_probe_already_installed');
  const proto = CanvasRenderingContext2D.prototype;
  const draw = proto.drawImage, save = proto.save, restore = proto.restore;
  const createImageData = proto.createImageData;
  const NativeImageData = globalThis.ImageData;
  const createElement = document.createElement;
  proto.drawImage = function (source: CanvasImageSource, a: number, b: number,
    c?: number, d?: number, e?: number, f?: number, g?: number, h?: number): void {
    countDrawImageSource(source);
    if (arguments.length === 3) (draw as (image: CanvasImageSource, x: number, y: number) => void).call(this, source, a, b);
    else if (arguments.length === 5) (draw as (image: CanvasImageSource, x: number, y: number, width: number, height: number) => void).call(this, source, a, b, c!, d!);
    else draw.call(this, source, a, b, c!, d!, e!, f!, g!, h!);
  };
  proto.save = function (): void { countCanvasSave(this); save.call(this); };
  proto.restore = function (): void { countCanvasRestore(this); restore.call(this); };
  proto.createImageData = new Proxy(createImageData, { apply(target, receiver, args) {
    const result: ImageData = Reflect.apply(target, receiver, args);
    renderOperationCounters.imageDataAllocations++;
    return result;
  } });
  globalThis.ImageData = new Proxy(NativeImageData, { construct(target, args, newTarget) {
    const result: ImageData = Reflect.construct(target, args, newTarget);
    renderOperationCounters.imageDataAllocations++;
    return result;
  } });
  document.createElement = new Proxy(createElement, { apply(target, receiver, args) {
    const result: HTMLElement = Reflect.apply(target, receiver, args);
    if (result instanceof HTMLCanvasElement) renderOperationCounters.surfaceAllocations++;
    return result;
  } });
  worldSamplingProbe.producers.clear(); worldSamplingProbe.overflow = false;
  worldSamplingProbe.producer = 'direct-world'; worldSamplingProbe.enabled = true;
  const disposeSampling = installWorldSamplingCanvasProbe();
  renderCounterSupport.nativeCanvas = true;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    disposeSampling(); worldSamplingProbe.enabled = false; worldSamplingProbe.producers.clear();
    proto.drawImage = draw; proto.save = save; proto.restore = restore;
    proto.createImageData = createImageData;
    globalThis.ImageData = NativeImageData; document.createElement = createElement;
    renderCounterSupport.nativeCanvas = false;
  };
}
