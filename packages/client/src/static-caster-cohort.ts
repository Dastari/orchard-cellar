import type { DirectionalCaster } from '@orchard/engine/directional-shadows';

function sameCaster(a: DirectionalCaster, b: DirectionalCaster): boolean {
  if (a === b) return true;
  if (a.owner !== b.owner || a.worldX !== b.worldX || a.worldY !== b.worldY
    || a.baseHeightSubunits !== b.baseHeightSubunits || a.heightSubunits !== b.heightSubunits
    || a.contact !== b.contact) return false;
  const x = a.footprint, y = b.footprint;
  if (x.left !== y.left || x.right !== y.right || x.top !== y.top || x.bottom !== y.bottom) return false;
  const left = a.silhouette, right = b.silhouette;
  if (left === right) return true;
  if (left === undefined || right === undefined || left.width !== right.width || left.height !== right.height
    || left.anchorX !== right.anchorX || left.anchorY !== right.anchorY) return false;
  if (left.opaque === right.opaque) return true;
  if (left.opaque.length !== right.opaque.length) return false;
  for (let i = 0; i < left.opaque.length; i++) if (left.opaque[i] !== right.opaque[i]) return false;
  return true;
}

/** Caster inputs and silhouettes are immutable. Static coverage and receiver
 * sampling combine contributions with max, so permutations are equivalent.
 * Duplicate owners still represent separate contributions: match a multiset,
 * never just a set of owners or a hash without equality verification. */
export function sameStaticCasterCohort(previous: readonly DirectionalCaster[], next: readonly DirectionalCaster[]): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  if (previous.every((caster, i) => sameCaster(caster, next[i]!))) return true;
  const remaining = new Map<string | number, DirectionalCaster[]>();
  for (const caster of previous) {
    const bucket = remaining.get(caster.owner);
    if (bucket === undefined) remaining.set(caster.owner, [caster]);
    else bucket.push(caster);
  }
  for (const caster of next) {
    const bucket = remaining.get(caster.owner);
    if (bucket === undefined) return false;
    const index = bucket.findIndex(candidate => sameCaster(candidate, caster));
    if (index === -1) return false;
    bucket.splice(index, 1);
    if (bucket.length === 0) remaining.delete(caster.owner);
  }
  return true;
}
