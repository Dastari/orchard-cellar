import type { WorldPassBackend, WorldPassImage, WorldPassSprite } from './world-pass-backend.js';
import type { WorldPassLayout } from './renderer.js';
import { CanvasWorldPresent } from './world-pass-present.js';

/** The reference world pass, extracted without changing its draw/composite
 * sequence. The HUD continues to belong to UnifiedRenderer's display context. */
export class CanvasWorldPassBackend implements WorldPassBackend {
  readonly kind = 'canvas2d';
  private readonly present: CanvasWorldPresent;
  private readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  private layout: WorldPassLayout | null = null;
  private disposed = false;
  constructor() {
    this.present = new CanvasWorldPresent();
    let canvas: HTMLCanvasElement | undefined;
    try {
      canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Offscreen Canvas 2D unavailable');
      this.canvas = canvas; this.context = context;
      context.imageSmoothingEnabled = false;
    } catch (error) {
      if (canvas !== undefined) canvas.width = canvas.height = 0;
      this.present.dispose(); throw error;
    }
  }
  get width(): number { return this.canvas.width; }
  get height(): number { return this.canvas.height; }
  get bytes(): number { return this.width * this.height * 4 + this.presentBytes; }
  get presentBytes(): number { return this.present.bytes; }
  reserve(width: number, height: number, presentWidth: number, presentHeight: number): void {
    this.requireActive();
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    if (presentWidth > 0 && presentHeight > 0) this.present.reserve(presentWidth, presentHeight);
  }
  begin(layout: WorldPassLayout): void {
    this.requireActive();
    if (layout.width > this.width || layout.height > this.height) throw new Error('world_pass_capacity_not_reserved');
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.imageSmoothingEnabled = false;
    this.context.globalCompositeOperation = 'source-over';
    this.context.globalAlpha = 1;
    this.context.clearRect(0, 0, layout.width, layout.height);
    this.context.fillStyle = '#000000';
    this.context.fillRect(0, 0, layout.width, layout.height);
    this.layout = layout;
  }
  composite(target: CanvasRenderingContext2D, width: number, height: number): void {
    this.requireActive();
    if (this.layout === null) throw new Error('beginWorld must precede compositeWorld');
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalCompositeOperation = 'source-over'; target.globalAlpha = 1;
    target.clearRect(0, 0, width, height);
    this.present.draw(target, this.canvas, this.layout.width, this.layout.height, width, height);
    target.imageSmoothingEnabled = false;
  }
  sprite(draw: WorldPassSprite): void {
    this.image(draw.canvasSource, draw);
  }
  capRun(draw: WorldPassImage): void { this.image(draw.source, draw); }
  chunk(draw: WorldPassImage): void { this.image(draw.source, draw); }
  multiplyPlane(draw: WorldPassImage): void {
    this.requireFrame();
    this.context.save();
    try {
      this.context.globalCompositeOperation = 'multiply';
      this.context.imageSmoothingEnabled = true;
      this.image(draw.source, draw);
    }
    finally { this.context.restore(); }
  }
  weather(draw: (context: CanvasRenderingContext2D) => void): void { this.requireFrame(); draw(this.context); }
  particles(draw: (context: CanvasRenderingContext2D) => void): void { this.requireFrame(); draw(this.context); }
  private image(source: WorldPassImage['source'], draw: WorldPassImage): void {
    this.requireFrame();
    const { x, y, width, height } = draw.destination;
    if (draw.flipX) {
      this.context.save();
      try {
        this.context.translate(x + width, y); this.context.scale(-1, 1);
        this.context.drawImage(source.image, source.x, source.y, source.width, source.height, 0, 0, width, height);
      } finally { this.context.restore(); }
    } else this.context.drawImage(source.image, source.x, source.y, source.width, source.height, x, y, width, height);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.layout = null;
    this.canvas.width = this.canvas.height = 0;
    this.present.dispose();
  }
  private requireActive(): void { if (this.disposed) throw new Error('world_pass_disposed'); }
  private requireFrame(): void {
    this.requireActive();
    if (this.layout === null) throw new Error('beginWorld must precede world submission');
  }
}
