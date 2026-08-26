import {
  CAMPFIRE_LIGHT,
  CAMPFIRE_LIGHT_RADIUS_TILES,
  TORCH_LIGHT,
  TORCH_LIGHT_RADIUS_TILES,
  type PointLight,
  type RgbColor,
} from './lighting.js';

export interface LightEmitterDefinition {
  readonly color: RgbColor;
  readonly radiusTiles: number;
  readonly offsetY: number;
  readonly flicker: boolean;
}

/** Central emitter registry: held lights, placed crafting lights, and future
 * build-mode props all resolve through the same point-light shape. */
export const PLACEABLE_LIGHT_EMITTERS: Readonly<Record<string, LightEmitterDefinition>> = {
  campfire: { color: CAMPFIRE_LIGHT, radiusTiles: CAMPFIRE_LIGHT_RADIUS_TILES, offsetY: -12, flicker: true },
  standing_torch: { color: TORCH_LIGHT, radiusTiles: TORCH_LIGHT_RADIUS_TILES, offsetY: -20, flicker: true },
};

function deterministicFlicker(id: bigint, authorityTick: bigint): number {
  const mixed = Number((id * 1_103_515_245n + authorityTick * 12_345n) & 0xffffn);
  return 0.94 + (mixed / 0xffff) * 0.1;
}

export function placeablePointLight(
  placeable: { readonly id: bigint; readonly kind: string; readonly tileX: number; readonly tileY: number },
  authorityTick: bigint,
): PointLight | null {
  const emitter = PLACEABLE_LIGHT_EMITTERS[placeable.kind];
  if (emitter === undefined) return null;
  return {
    worldX: placeable.tileX * 16 + 8,
    worldY: (placeable.tileY + 1) * 16 + emitter.offsetY,
    radiusTiles: emitter.radiusTiles * (emitter.flicker ? deterministicFlicker(placeable.id, authorityTick) : 1),
    color: emitter.color,
  };
}
