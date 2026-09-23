import { planLocalTerrainInsets } from '../packages/sim/src/local-terrain-insets.js';

/** Intentionally includes the formerly broken two-cell diagonal neck. The
 * input remains evidence; Smart examples use the same local repair as Studio. */
export const TERRAIN_CATALOGUE_SHAPES = {
  minimum_2x2: ['##', '##'],
  rectangle: ['#####', '#####', '#####', '#####'],
  concave: ['####', '####', '##..', '##..'],
  diagonal: ['##..', '###.', '.###', '..##'],
  T: ['######', '######', '..##..', '..##..'],
  cross: ['..##..', '..##..', '######', '######', '..##..', '..##..'],
} as const;

export function catalogueFormation(shape: readonly string[]) {
  const input = shape.flatMap((row, tileY) => [...row].flatMap((cell, tileX) => (
    cell === '#' ? [{ tileX, tileY }] : []
  )));
  const key = (x: number, y: number) => `${x},${y}`;
  const original = new Set(input.map(p => key(p.tileX, p.tileY)));
  const repair = planLocalTerrainInsets({ points: input, occupiedAt: (x, y) => original.has(key(x, y)) });
  if (repair.unresolved.length) throw new Error('catalogue_formation_has_unresolved_insets');
  const points = [...input, ...repair.added];
  const occupied = new Set(points.map(p => key(p.tileX, p.tileY)));
  return { input, added: repair.added, points,
    occupiedAt: (x: number, y: number) => occupied.has(key(x, y)),
    inputAt: (x: number, y: number) => original.has(key(x, y)),
  };
}
