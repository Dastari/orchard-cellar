/** Authoritative logical-tile policy. Appearance and client flags never enable damage. */
export interface CombatRegion {
  readonly id: string;
  readonly spaceId: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly policy: 'sanctuary' | 'hostile';
  /** A sanctuary may explicitly carve a protected arrival out of one hostile region. */
  readonly parentId?: string;
}

export interface CombatPosition {
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
}

function contains(region: CombatRegion, point: CombatPosition): boolean {
  return region.spaceId === point.spaceId && Number.isFinite(point.tileX) && Number.isFinite(point.tileY)
    && point.tileX >= region.minX && point.tileX < region.maxX + 1
    && point.tileY >= region.minY && point.tileY < region.maxY + 1;
}

function overlaps(a: CombatRegion, b: CombatRegion): boolean {
  return a.spaceId === b.spaceId && a.minX <= b.maxX && b.minX <= a.maxX
    && a.minY <= b.maxY && b.minY <= a.maxY;
}

function validSanctuaryChild(child: CombatRegion, parent: CombatRegion): boolean {
  return child.parentId === parent.id && child.policy === 'sanctuary' && parent.policy === 'hostile'
    && child.spaceId === parent.spaceId && child.minX >= parent.minX && child.maxX <= parent.maxX
    && child.minY >= parent.minY && child.maxY <= parent.maxY;
}

/** Validation is performed once when authored policy is installed, never for each hit. */
export function validateCombatRegions(regions: readonly CombatRegion[]): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const region of regions) {
    if (!region.id.trim() || ids.has(region.id)) errors.push(`duplicate_or_empty_region:${region.id}`);
    ids.add(region.id);
    if (![region.spaceId, region.minX, region.minY, region.maxX, region.maxY].every(Number.isSafeInteger)
      || region.spaceId < 0 || region.spaceId > 65_535 || region.minX > region.maxX || region.minY > region.maxY
      || (region.policy !== 'hostile' && region.policy !== 'sanctuary')) errors.push(`invalid_region:${region.id}`);
    if (region.parentId !== undefined) {
      const parent = regions.find(({ id }) => id === region.parentId);
      if (parent === undefined || !validSanctuaryChild(region, parent)) errors.push(`invalid_sanctuary_parent:${region.id}`);
    }
  }
  for (let i = 0; i < regions.length; i += 1) {
    for (let j = i + 1; j < regions.length; j += 1) {
      const a = regions[i]!; const b = regions[j]!;
      if (overlaps(a, b) && !validSanctuaryChild(a, b) && !validSanctuaryChild(b, a)) {
        errors.push(`ambiguous_region_overlap:${a.id}:${b.id}`);
      }
    }
  }
  return errors;
}

/** Closed segment/rectangle intersection deliberately protects boundary grazes too. */
function segmentTouchesRegion(from: CombatPosition, to: CombatPosition, region: CombatRegion): boolean {
  let entry = 0; let exit = 1;
  for (const [start, delta, minimum, maximum] of [
    [from.tileX, to.tileX - from.tileX, region.minX, region.maxX + 1],
    [from.tileY, to.tileY - from.tileY, region.minY, region.maxY + 1],
  ] as const) {
    if (delta === 0) { if (start < minimum || start > maximum) return false; }
    else {
      const a = (minimum - start) / delta; const b = (maximum - start) / delta;
      entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (entry > exit) return false;
    }
  }
  return true;
}

export class CombatRegionPolicy {
  readonly #regions: readonly CombatRegion[];
  constructor(regions: readonly CombatRegion[]) {
    const errors = validateCombatRegions(regions);
    if (errors.length > 0) throw new Error(errors.join(';'));
    this.#regions = Object.freeze(regions.map((region) => Object.freeze({ ...region })));
  }

  regionAt(point: CombatPosition): CombatRegion | null {
    let hostile: CombatRegion | null = null;
    for (const region of this.#regions) {
      if (!contains(region, point)) continue;
      if (region.policy === 'sanctuary') return region;
      hostile = region;
    }
    return hostile;
  }

  /** Spawn/aggro/impact checks default to peaceful for every unclassified tile. */
  allowsHostileDamage(point: CombatPosition): boolean {
    return this.regionAt(point)?.policy === 'hostile';
  }

  /** Use for melee reach, projectile sweeps and knockback; checking endpoints alone is unsafe. */
  allowsHostileSegment(from: CombatPosition, to: CombatPosition): boolean {
    const source = this.regionAt(from); const target = this.regionAt(to);
    if (source?.policy !== 'hostile' || target?.id !== source.id || from.spaceId !== to.spaceId) return false;
    return !this.#regions.some((region) => region.spaceId === from.spaceId
      && region.policy === 'sanctuary' && segmentTouchesRegion(from, to, region));
  }
}


/** Untrusted map wire data is validated before policy can reach authority. */
export function parseCombatRegions(value: unknown, width: number, height: number): readonly CombatRegion[] {
  if (!Array.isArray(value) || value.length > 64) throw new TypeError('invalid_combat_regions');
  const regions: CombatRegion[] = value.map(entry => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('invalid_combat_region');
    const row = entry as Record<string,unknown>;
    if (typeof row['id'] !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,95}$/.test(row['id'])
      || (row['parentId'] !== undefined && typeof row['parentId'] !== 'string')
      || !['sanctuary','hostile'].includes(String(row['policy']))
      || !['spaceId','minX','minY','maxX','maxY'].every(key=>Number.isSafeInteger(row[key]))
      || Number(row['minX']) < 0 || Number(row['minY']) < 0
      || Number(row['maxX']) >= width || Number(row['maxY']) >= height) throw new TypeError('invalid_combat_region');
    return {id:row['id'],spaceId:row['spaceId'] as number,policy:row['policy'] as CombatRegion['policy'],
      minX:row['minX'] as number,minY:row['minY'] as number,maxX:row['maxX'] as number,maxY:row['maxY'] as number,
      ...(row['parentId'] === undefined ? {} : {parentId:row['parentId'] as string})};
  });
  const errors=validateCombatRegions(regions);
  if(errors.length>0)throw new TypeError(errors.join(';'));
  return regions.sort((left,right)=>left.id<right.id?-1:left.id>right.id?1:0);
}
