import type { RawReceiverField } from './receiver-raw-field.js';
import type { WorldPassLayout } from './renderer.js';
import type { AssetFrameSource } from '@orchard/ui';
import type { RgbColor } from './lighting.js';

export interface WorldPassRectangle {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}
export interface WorldPassImage {
  readonly source: AssetFrameSource;
  readonly destination: WorldPassRectangle;
  readonly flipX?: boolean;
}
export type WorldSpriteVariant = 'normal' | 'dim' | 'enemy-hit' | 'wildlife-hit';
export interface WorldPassSprite extends WorldPassImage {
  /** Canvas consumes the existing exact prepared source. GPU submission uses
   * immutable artwork for normal draws and the prepared CPU page for effects. */
  readonly canvasSource: AssetFrameSource;
  readonly receiverRgb: RgbColor;
  readonly variant: WorldSpriteVariant;
}

/** World surface lifetime and presentation boundary. The compatibility context
 * keeps the existing Canvas painter unchanged while explicit submission
 * capabilities are introduced before the experimental implementation. */
export interface WorldPassBackend {
  readonly kind: 'canvas2d' | 'webgl2';
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly presentBytes: number;
  reserve(width: number, height: number, presentWidth: number, presentHeight: number): void;
  begin(layout: WorldPassLayout): void;
  sprite(draw: WorldPassSprite): void;
  capRun(draw: WorldPassImage): void;
  chunk(draw: WorldPassImage): void;
  /** Quarter/tile-resolution light planes use smooth sampling, unlike artwork. */
  multiplyPlane(draw: WorldPassImage): void;
  /** Optional raw-field capability; Canvas keeps its existing resolved-image path. */
  multiplyRawLightPlane?(field: RawReceiverField, destination: WorldPassRectangle): void;
  weather(draw: (context: CanvasRenderingContext2D) => void): void;
  particles(draw: (context: CanvasRenderingContext2D) => void): void;
  composite(target: CanvasRenderingContext2D, width: number, height: number): void;
  dispose(): void;
}
