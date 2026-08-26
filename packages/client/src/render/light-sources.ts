import {
  AUTHORITY_HZ,
} from '@orchard/sim';
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
  readonly profile: 'steady' | 'flame' | 'pulse';
  readonly facingSeed: boolean;
}

/** Central emitter registry: held lights, placed crafting lights, and future
 * build-mode props all resolve through the same point-light shape. */
export const PLACEABLE_LIGHT_EMITTERS: Readonly<Record<string, LightEmitterDefinition>> = {
  campfire: {
    color: CAMPFIRE_LIGHT, radiusTiles: CAMPFIRE_LIGHT_RADIUS_TILES, offsetY: -12, profile: 'flame', facingSeed: false,
  },
  standing_torch: {
    color: TORCH_LIGHT, radiusTiles: TORCH_LIGHT_RADIUS_TILES, offsetY: -20, profile: 'flame', facingSeed: false,
  },
};

export function isLightEmitterKind(kind: string): boolean {
  return kind === 'camp_campfire' || PLACEABLE_LIGHT_EMITTERS[kind] !== undefined;
}

export function deterministicFlameFlicker(id: bigint, authorityTick: bigint): {
  readonly radiusOffset: number;
  readonly strengthPerMille: number;
} {
  const valueNoise = (frequency: number, salt: bigint): number => {
    const numerator = authorityTick * BigInt(frequency);
    const slot = numerator / BigInt(AUTHORITY_HZ);
    const fraction = Number(numerator % BigInt(AUTHORITY_HZ)) / AUTHORITY_HZ;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const sample = (sampleSlot: bigint): number => {
      const mixed = (id * 1_103_515_245n + sampleSlot * 12_345n + salt) & 0xffffn;
      return Number(mixed) / 32_767.5 - 1;
    };
    const current = sample(slot);
    return current + (sample(slot + 1n) - current) * smooth;
  };
  const flame = valueNoise(3, 0x464c_414dn) * 0.72 + valueNoise(7, 0x5350_4152n) * 0.28;
  return {
    radiusOffset: Math.round(flame * 18) / 100,
    strengthPerMille: Math.round(1000 + flame * 30),
  };
}

function lightFacing(facing: string | undefined): 'up' | 'right' | 'down' | 'left' | undefined {
  if (facing === 'up' || facing === 'right' || facing === 'down' || facing === 'left') return facing;
  return undefined;
}

export function placeablePointLight(
  placeable: {
    readonly id: bigint;
    readonly kind: string;
    readonly tileX: number;
    readonly tileY: number;
    readonly facing?: string;
  },
  authorityTick: bigint,
): PointLight | null {
  const emitter = PLACEABLE_LIGHT_EMITTERS[placeable.kind];
  if (emitter === undefined) return null;
  const flicker = emitter.profile === 'flame'
    ? deterministicFlameFlicker(placeable.id, authorityTick)
    : { radiusOffset: 0, strengthPerMille: 1000 };
  const facing = emitter.facingSeed ? lightFacing(placeable.facing) : undefined;
  return {
    worldX: placeable.tileX * 16 + 8,
    worldY: (placeable.tileY + 1) * 16 + emitter.offsetY,
    radiusTiles: Math.max(0.25, emitter.radiusTiles + flicker.radiusOffset),
    color: emitter.color,
    strengthPerMille: flicker.strengthPerMille,
    profile: emitter.profile,
    ...(facing === undefined ? {} : { facing }),
  };
}
