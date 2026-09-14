import type { CombatPosition, CombatRegionPolicy } from './combat-regions.js';

export type HearthDangerNotice = 'protected' | 'boundary' | 'hostile';
/** Presentation follows installed policy, never scenery, hardcoded island
 * bounds or the candidate-map definition. Damage remains server-authoritative. */
export function hearthDangerNotice(policy: CombatRegionPolicy, position: CombatPosition): HearthDangerNotice | null {
  const region = policy.regionAt(position);
  if (region === null || (region.id !== 'cinderwake' && region.parentId !== 'cinderwake')) return null;
  if (region.policy === 'hostile') return 'hostile';
  const { tileX: x, tileY: y, spaceId } = position;
  // Inclusive authored maxima have their physical boundary at max+1.
  // Check the other side too: a border with peaceful/unclassified space is
  // not a danger boundary, including sanctuaries touching the island bounds.
  const edges = [
    { distance: x - region.minX, tileX: region.minX - .001, tileY: y },
    { distance: region.maxX + 1 - x, tileX: region.maxX + 1, tileY: y },
    { distance: y - region.minY, tileX: x, tileY: region.minY - .001 },
    { distance: region.maxY + 1 - y, tileX: x, tileY: region.maxY + 1 },
  ];
  return edges.some(edge => edge.distance <= 3 && policy.allowsHostileDamage({ spaceId, ...edge }))
    ? 'boundary' : 'protected';
}
