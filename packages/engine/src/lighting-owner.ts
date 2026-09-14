/** Collision-free numeric identity for the rounded feet used by legacy owner
 * exclusion. Two signed 26-bit coordinates fit exactly in a JS integer. */
export function lightingOwner(x: number, y: number): number {
  const left = Math.round(x) + 33_554_432, top = Math.round(y) + 33_554_432;
  if (!Number.isInteger(left) || !Number.isInteger(top) || left < 0 || top < 0
    || left >= 67_108_864 || top >= 67_108_864) throw new Error('directional_owner_coordinates_out_of_range');
  return left * 67_108_864 + top;
}
const terrainOwners = new WeakMap<object, number>();
let terrainSequence = 0;
/** Terrain bodies have their own namespace, as the previous terrain: prefix did. */
export function terrainLightingOwner(mask: object): number {
  let identity = terrainOwners.get(mask);
  if (identity === undefined) { identity = --terrainSequence; terrainOwners.set(mask, identity); }
  return identity;
}
