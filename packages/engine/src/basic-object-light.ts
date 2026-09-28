import type { PointLight, RgbColor } from './lighting.js';

/**
 * BUG-061 (owner, 2026-09-28): Basic lighting keeps object light, "non feathered, cheap lighting". PROPOSAL, not
 * shipped until the owner approves the look.
 *
 * One multiply pass, like Basic today, but through a small light buffer instead of a flat colour: the buffer is the
 * night ambient with a hard-edged, two-band pool per light source (see BASIC_LIGHT_BANDS). Pools are stepped on the classic lightmap's texel
 * grid (4 world px per texel, pinned to the world so they never swim), drawn row by row (no anti-aliasing, blur or
 * gradient), and combined per channel with the brighter value, like Classic's max-of-sources. The buffer is upscaled
 * nearest-neighbour onto the world.
 *
 * Cost per frame: one fill of a ~100x70 texel buffer, about 2 x (2 x radius) row fills per visible light, and one
 * upscaled multiply draw. No occlusion, shadows, receivers or flicker.
 */
export const BASIC_LIGHT_WORLD_PIXELS_PER_TEXEL = 4;
/** Two bands per source, cut from Classic's linear falloff (brightness = intensity x (1 - distance / radius), capped at
 * 1): each band covers the distance where Classic's brightness is at least its threshold, and is filled at the band's
 * level. A bright source (a streetlamp at 3.5x) therefore keeps Classic's wide flat pool; a torch keeps a small one. */
export const BASIC_LIGHT_BANDS: readonly { readonly threshold: number; readonly level: number }[] = [
  { threshold: 0.4, level: 0.55 }, { threshold: 0.75, level: 0.9 },
];
/** A band's radius, as a fraction of the light's radius, for a light of this intensity (1 = 1000 per mille). */
export function basicLightBandRadius(threshold: number, intensity: number): number {
  return intensity <= 0 ? 0 : Math.max(0, 1 - threshold / intensity);
}

type BufferCanvas = HTMLCanvasElement | OffscreenCanvas;
type BufferContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class BasicObjectLight {
  private canvas: BufferCanvas | null = null;
  private context: BufferContext | null = null;
  private key = '';
  /** Milliseconds spent in the last composite (buffer fill, pools and the multiply draw). */
  compositeMs = 0;
  constructor(private readonly createCanvas: (width: number, height: number) => BufferCanvas | null = defaultCanvas) {}

  /** Darkens the world to the ambient and lights each source's pool. `width`/`height` are the target's device pixels;
   * `scale` is device pixels per world pixel; `cameraX`/`cameraY` the world pixel at the target's top-left. */
  composite(target: CanvasRenderingContext2D, width: number, height: number, scale: number, cameraX: number, cameraY: number,
    ambient: RgbColor, lights: readonly PointLight[]): void {
    const started = performance.now();
    try {
      if (ambient.r === 255 && ambient.g === 255 && ambient.b === 255) return;
      const texel = BASIC_LIGHT_WORLD_PIXELS_PER_TEXEL;
      const originX = Math.floor(cameraX / texel), originY = Math.floor(cameraY / texel);
      const columns = Math.ceil(width / scale / texel) + 2, rows = Math.ceil(height / scale / texel) + 2;
      const buffer = this.buffer(columns, rows);
      if (buffer === null) { flatMultiply(target, width, height, ambient); return; }
      // The buffer only changes with the texel origin, the ambient or a light: steady frames just draw it again.
      let key = `${originX},${originY},${columns},${rows},${ambient.r},${ambient.g},${ambient.b}`;
      for (const light of lights) key += `|${light.worldX},${light.worldY},${light.radiusTiles},${light.color.r},${light.color.g},${light.color.b},${light.intensityPerMille ?? 1000},${light.strengthPerMille ?? 1000}`;
      if (key !== this.key) { this.key = key; this.paint(buffer, originX, originY, columns, rows, ambient, lights); }
      target.save();
      try {
        // Same coordinate space as the Classic lightmap composite: world pixels times `scale` in the target's transform.
        target.beginPath(); target.rect(0, 0, width, height); target.clip();
        target.globalAlpha = 1; target.filter = 'none'; target.imageSmoothingEnabled = false;
        target.globalCompositeOperation = 'multiply';
        const step = texel * scale;
        target.drawImage(this.canvas as CanvasImageSource, 0, 0, columns, rows,
          Math.round((originX * texel - cameraX) * scale), Math.round((originY * texel - cameraY) * scale), columns * step, rows * step);
      } finally { target.restore(); }
    } finally { this.compositeMs = performance.now() - started; }
  }

  private paint(buffer: BufferContext, originX: number, originY: number, columns: number, rows: number, ambient: RgbColor, lights: readonly PointLight[]): void {
    const texel = BASIC_LIGHT_WORLD_PIXELS_PER_TEXEL;
    buffer.globalCompositeOperation = 'source-over';
    buffer.fillStyle = `rgb(${ambient.r}, ${ambient.g}, ${ambient.b})`;
    buffer.fillRect(0, 0, columns, rows);
    buffer.globalCompositeOperation = 'lighten';
    for (const light of lights) {
      const radius = light.radiusTiles * 16 / texel;
      const cx = light.worldX / texel - originX, cy = light.worldY / texel - originY;
      if (cx + radius < 0 || cy + radius < 0 || cx - radius > columns || cy - radius > rows) continue;
      const intensity = (light.intensityPerMille ?? 1000) / 1000 * (light.strengthPerMille ?? 1000) / 1000;
      for (const band of BASIC_LIGHT_BANDS) {
        const level = Math.min(1, band.level * Math.max(1, intensity));
        buffer.fillStyle = `rgb(${Math.round(light.color.r * level)}, ${Math.round(light.color.g * level)}, ${Math.round(light.color.b * level)})`;
        steppedDisc(buffer, cx, cy, radius * basicLightBandRadius(band.threshold, intensity));
      }
    }
  }

  private buffer(columns: number, rows: number): BufferContext | null {
    if (this.canvas === null || this.canvas.width < columns || this.canvas.height < rows) {
      this.canvas = this.createCanvas(Math.max(columns, this.canvas?.width ?? 0), Math.max(rows, this.canvas?.height ?? 0));
      this.context = (this.canvas?.getContext('2d') ?? null) as BufferContext | null; this.key = '';
      if (this.context) this.context.imageSmoothingEnabled = false;
    }
    return this.context;
  }
}

/** A filled disc on whole texels: one rectangle per texel row, no anti-aliasing. */
function steppedDisc(context: BufferContext, cx: number, cy: number, radius: number): void {
  if (radius < 0.5) return;
  const top = Math.floor(cy - radius), bottom = Math.ceil(cy + radius);
  for (let row = top; row < bottom; row++) {
    const dy = row + 0.5 - cy, half = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    if (half <= 0) continue;
    const left = Math.round(cx - half), right = Math.round(cx + half);
    if (right > left) context.fillRect(left, row, right - left, 1);
  }
}

function flatMultiply(target: CanvasRenderingContext2D, width: number, height: number, color: RgbColor): void {
  target.save();
  try {
    target.setTransform(1, 0, 0, 1, 0, 0); target.globalCompositeOperation = 'multiply';
    target.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`; target.fillRect(0, 0, width, height);
  } finally { target.restore(); }
}

function defaultCanvas(width: number, height: number): BufferCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
}
