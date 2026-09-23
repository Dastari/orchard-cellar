import type { RgbColor } from './lighting.js';

/** Shared fixed-height lighting contract (wiki: Systems/Lighting & Seasons). Terrain levels may be signed. */
export const LIGHT_HEIGHT_SUBUNITS_PER_LEVEL = 4;
export type LightingReceiverClass = 'flat' | 'south' | 'omni';
export interface LightingReceiver {
  readonly worldX: number;
  readonly worldY: number;
  readonly heightSubunits: number;
  readonly receiver: LightingReceiverClass;
  readonly owner?: string | number;
}
export interface ReceiverLightContributions {
  readonly diffuse: RgbColor;
  readonly sun: RgbColor;
  readonly moon: RgbColor;
  readonly local: RgbColor;
  readonly combined: RgbColor;
}
