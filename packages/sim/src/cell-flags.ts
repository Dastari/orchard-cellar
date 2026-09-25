/** Per-cell flag planes (static world, S4f follow-up): `CollisionMap.blocked`,
 * `CollisionMap.horseJumpableTerrain`, `TerrainArray.blocked` and their siblings
 * are `Uint8Array`s holding one byte per cell, non-zero where set. A leaf module
 * so generator-free code (chunk collision, the chunk terrain store) can use it. */

/** A 0/1 copy of a per-cell plane (`CollisionMap.blocked`, `horseJumpableTerrain`,
 * `TerrainArray.blocked` and their siblings): truthy cells become 1, the rest 0.
 * Use it to copy a plane out of a shared buffer, or to build one from booleans. */
export function cellFlags(values: ArrayLike<number | boolean>): Uint8Array {
  const result = new Uint8Array(values.length);
  for (let index = 0; index < values.length; index++) if (values[index]) result[index] = 1;
  return result;
}
