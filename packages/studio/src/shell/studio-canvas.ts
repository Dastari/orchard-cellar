export interface StudioCanvasPoint { readonly x: number; readonly y: number }
export interface StudioCanvasCamera { readonly x: number; readonly y: number; readonly zoom: number }
export interface StudioCanvasLayer {
  readonly id: string;
  draw(context: CanvasRenderingContext2D, camera: StudioCanvasCamera, viewport: StudioCanvasPoint): void;
  pick?(world: StudioCanvasPoint): { readonly kind: string; readonly id: string } | null;
}

/** Raw immediate-mode interactive tool kernel. It redraws on demand: editors
 * own document timing, so the shell does not create an idle RAF loop. */
export class StudioCanvas {
  #camera: StudioCanvasCamera = Object.freeze({ x: 0, y: 0, zoom: 1 });
  #layers: readonly StudioCanvasLayer[] = [];
  #cssSize: StudioCanvasPoint = Object.freeze({ x: 1, y: 1 });

  constructor(private readonly canvas: HTMLCanvasElement) {}

  setLayers(layers: readonly StudioCanvasLayer[]): void { this.#layers = Object.freeze([...layers]); }
  camera(): StudioCanvasCamera { return this.#camera; }

  resize(cssWidth: number, cssHeight: number, deviceScale = devicePixelRatio): void {
    const width = Math.max(1, Math.floor(cssWidth));
    const height = Math.max(1, Math.floor(cssHeight));
    const dpr = Math.max(1, Math.min(3, deviceScale));
    this.#cssSize = Object.freeze({ x: width, y: height });
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.draw(dpr);
  }

  pan(screenDeltaX: number, screenDeltaY: number): void {
    this.#camera = Object.freeze({ ...this.#camera, x: this.#camera.x - screenDeltaX / this.#camera.zoom, y: this.#camera.y - screenDeltaY / this.#camera.zoom });
  }

  zoomAt(screen: StudioCanvasPoint, factor: number): void {
    const before = this.screenToWorld(screen);
    const zoom = Math.max(1 / 32, Math.min(8, this.#camera.zoom * factor));
    this.#camera = Object.freeze({ x: before.x - screen.x / zoom, y: before.y - screen.y / zoom, zoom });
  }

  screenPoint(clientX: number, clientY: number): StudioCanvasPoint {
    const bounds = this.canvas.getBoundingClientRect();
    return Object.freeze({ x: (clientX - bounds.left) * this.#cssSize.x / Math.max(1, bounds.width), y: (clientY - bounds.top) * this.#cssSize.y / Math.max(1, bounds.height) });
  }

  screenToWorld(point: StudioCanvasPoint): StudioCanvasPoint {
    return Object.freeze({ x: this.#camera.x + point.x / this.#camera.zoom, y: this.#camera.y + point.y / this.#camera.zoom });
  }

  pick(screen: StudioCanvasPoint): { readonly layerId: string; readonly kind: string; readonly id: string } | null {
    const world = this.screenToWorld(screen);
    for (const layer of [...this.#layers].reverse()) {
      const hit = layer.pick?.(world) ?? null;
      if (hit !== null) return { layerId: layer.id, ...hit };
    }
    return null;
  }

  draw(dpr = Math.max(1, this.canvas.width / this.#cssSize.x)): void {
    const context = this.canvas.getContext('2d', { alpha: false });
    if (context === null) throw new Error('studio_canvas_context_unavailable');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, this.#cssSize.x, this.#cssSize.y);
    context.fillStyle = '#1d2824';
    context.fillRect(0, 0, this.#cssSize.x, this.#cssSize.y);
    for (const layer of this.#layers) layer.draw(context, this.#camera, this.#cssSize);
  }
}
