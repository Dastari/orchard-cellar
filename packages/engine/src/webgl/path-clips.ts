import type { WorldPassRectangle } from '../world-pass-backend.js';
import { cleanupWebGL } from './cleanup.js';
import { WorldTextures } from './textures.js';
import { WebGLWorldPassError } from './failure.js';

export interface WorldPathClip {
  readonly canvas: HTMLCanvasElement;
  rectangle: WorldPassRectangle;
  outside: number;
  revision: number;
}
interface Registration { readonly rectangle: WorldPassRectangle; readonly outside: number }
interface Resolved { readonly rule: CanvasFillRule; readonly clip: WorldPathClip }
/** Three reusable local masks cover the terrain cutaway's existing painter
 * passes. Registration supplies bounded geometry; opaque arbitrary paths fail. */
export class WorldPathClips {
  private registered = new WeakMap<Path2D, Registration>();
  private resolved = new WeakMap<Path2D, Resolved>();
  private readonly slots: WorldPathClip[] = [];
  private used = 0;
  private revision = 0;
  private textures: WorldTextures | null = null;
  constructor(private readonly gl: WebGL2RenderingContext) {}
  get canvasBytes(): number { return this.slots.reduce((sum, slot) => sum + slot.canvas.width * slot.canvas.height * 4, 0); }
  get bytes(): number { return this.canvasBytes + this.textureBytes; }
  get textureBytes(): number { return this.textures?.bytes ?? 0; }
  get count(): number { return this.textures?.count ?? 0; }
  get uploads(): number { return this.textures?.uploads ?? 0; }
  begin(): void { this.resolved = new WeakMap(); this.used = 0; }
  register(path: Path2D, rectangle: WorldPassRectangle, outside: number): void {
    const { x, y, width, height } = rectangle;
    if (![x, y, width, height].every(Number.isSafeInteger) || width < 1 || height < 1
      || width > 512 || height > 2048 || width * height * 4 > 4 * 1024 * 1024
      || (outside !== 0 && outside !== 1)) throw new WebGLWorldPassError('webgl_clip_mask_bounds');
    this.registered.set(path, { rectangle, outside });
  }
  resolve(path: Path2D, rule: CanvasFillRule): WorldPathClip {
    const registration = this.registered.get(path);
    if (registration === undefined) throw new WebGLWorldPassError('webgl_unsupported_clip_path');
    const existing = this.resolved.get(path);
    if (existing?.rule === rule) return existing.clip;
    if (this.used >= 3) throw new WebGLWorldPassError('webgl_clip_mask_budget');
    let slot = this.slots[this.used++];
    if (slot === undefined) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 0;
      slot = { canvas, rectangle: registration.rectangle, outside: registration.outside, revision: 0 };
      this.slots.push(slot);
    }
    const { canvas } = slot, { x, y, width, height } = registration.rectangle;
    if (canvas.width < width) canvas.width = width;
    if (canvas.height < height) canvas.height = height;
    // Width/height maxima from different policies must still share one budget.
    if (canvas.width * canvas.height * 4 > 4 * 1024 * 1024) throw new WebGLWorldPassError('webgl_clip_mask_bounds');
    const context = canvas.getContext('2d');
    if (context === null || context.isContextLost?.()) throw new WebGLWorldPassError('webgl_clip_canvas_unavailable');
    context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1; context.globalCompositeOperation = 'source-over'; context.fillStyle = '#ffffff';
    context.save();
    try {
      context.translate(-x, -y); context.clip(path, rule);
      context.fillRect(x, y, canvas.width, canvas.height);
    } finally { context.restore(); }
    slot.rectangle = registration.rectangle; slot.outside = registration.outside; slot.revision = ++this.revision;
    this.resolved.set(path, { rule, clip: slot }); return slot;
  }
  bind(clip: WorldPathClip): void {
    this.textures ??= new WorldTextures(this.gl, 12 * 1024 * 1024);
    const texture = this.textures.page(clip.canvas, clip.revision, false);
    this.gl.activeTexture(this.gl.TEXTURE5); this.gl.bindTexture(this.gl.TEXTURE_2D, texture.texture);
  }
  invalidate(): void { this.textures?.invalidate(); this.begin(); }
  dispose(): void {
    const textures = this.textures; this.textures = null;
    const slots = this.slots.splice(0);
    this.used = 0; this.registered = new WeakMap(); this.resolved = new WeakMap();
    cleanupWebGL([
      ...slots.flatMap(({ canvas }) => [() => { canvas.width = 0; }, () => { canvas.height = 0; }]),
      () => textures?.dispose(),
    ], 'webgl_clip_dispose_failed');
  }
}
