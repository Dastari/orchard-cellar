/** Snap once at the world-pass resolution, after camera interpolation/clamping.
 * Otherwise fractional NPC positions and tile-aligned terrain cross their
 * rounding boundaries on different frames and appear to slide past each other.
 * Keep this out of simulation: higher-resolution passes retain sub-world-pixel
 * motion, and every world layer/target uses the same presentation offset. */
export function snapGameplayCamera(offset: number, integerScale: number): number {
  return Math.round(offset * integerScale) / integerScale;
}
