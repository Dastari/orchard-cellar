import { ContentParseError } from './parse-contract.js';

export type ProgressionDefinitionId = `progression:${string}`;
export const EXPERIENCE_ACTIVITIES = [
  'plant_seed',
  'plant_fruit_seed',
  'homestead_upgrade',
  'orchard_harvest',
  'mine_rock',
  'mine_mixed_stone',
  'mine_mixed_ore',
  'mine_ore',
  'mine_depletion',
  'resource_fruit_harvest',
  'fish_catch',
  'fish_depletion',
  'cultivate',
  'water',
  'crop_harvest',
  'seal_barrel'
] as const;
export type ExperienceActivity = typeof EXPERIENCE_ACTIVITIES[number];
export interface ExperienceAward {
  /** XP per completed activity, integer 0..1,000,000. */
  readonly base: number;
  /** Additional XP per quantity/rank/richness, integer 0..1,000,000. */
  readonly perUnit: number;
}
export interface ProgressionContentDefinition {
  readonly id: ProgressionDefinitionId;
  readonly kind: 'progression';
  readonly schemaVersion: 1;
  readonly description: string;
  readonly retired?: boolean;
  readonly replacement?: ProgressionDefinitionId;
  /** Maximum skill level, integer 1..1,000. Does not rewrite stored XP. */
  readonly levelCap: number;
  readonly xpCurve: {
    /** Total threshold = floor(scale * level ** exponent); scale 1..1,000,000 XP. */
    readonly scale: number;
    /** Power exponent, 1..5. All thresholds must remain safe integers. */
    readonly exponent: number;
  };
  /** Bronze cost by prior respec count; 1..64 entries, last cost repeats. */
  readonly respecCostsBronze: readonly number[];
  readonly awards: Readonly<Record<ExperienceActivity, ExperienceAward>>;
}

function fail(path: string, message: string): never {
  throw new ContentParseError('invalid_type', path, message);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected object');
  return value as Record<string, unknown>;
}
function number(value: unknown, path: string, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (integer && !Number.isSafeInteger(value))) fail(path, `expected ${integer ? 'integer' : 'number'} in ${min}..${max}`);
  return value;
}
function id(value: unknown, path: string): ProgressionDefinitionId {
  if (typeof value !== 'string' || !/^progression:[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(value)) fail(path, 'invalid progression id');
  return value as ProgressionDefinitionId;
}
export function parseProgressionDefinition(input: unknown): ProgressionContentDefinition {
  let value = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input) as unknown; }
    catch { throw new ContentParseError('invalid_json', '$', 'invalid JSON'); }
  }
  const source = record(value, '$');
  if (source.kind !== 'progression') throw new ContentParseError('kind_mismatch', '$.kind', 'expected progression');
  if (source.schemaVersion !== 1) throw new ContentParseError('unsupported_schema_version', '$.schemaVersion', 'expected 1');
  if (typeof source.description !== 'string' || source.description.trim().length === 0) fail('$.description', 'description required');
  if (source.retired !== undefined && typeof source.retired !== 'boolean') fail('$.retired', 'expected boolean');
  const levelCap = number(source.levelCap, '$.levelCap', 1, 1000);
  const curve = record(source.xpCurve, '$.xpCurve');
  const scale = number(curve.scale, '$.xpCurve.scale', 1, 1000000);
  const exponent = number(curve.exponent, '$.xpCurve.exponent', 1, 5, false);
  if (!Number.isSafeInteger(Math.floor(scale * levelCap ** exponent))) fail('$.xpCurve', 'maximum threshold exceeds safe integer');
  if (!Array.isArray(source.respecCostsBronze) || source.respecCostsBronze.length < 1 || source.respecCostsBronze.length > 64) fail('$.respecCostsBronze', 'expected 1..64 costs');
  const costs = source.respecCostsBronze.map((cost, index) => number(cost, `$.respecCostsBronze[${index}]`, 0, 1000000000));
  const rawAwards = record(source.awards, '$.awards');
  if (Object.keys(rawAwards).some(key => !EXPERIENCE_ACTIVITIES.includes(key as ExperienceActivity))) fail('$.awards', 'unknown activity');
  const awards = Object.fromEntries(EXPERIENCE_ACTIVITIES.map(activity => {
    const award = record(rawAwards[activity], `$.awards.${activity}`);
    return [activity, Object.freeze({
      base: number(award.base, `$.awards.${activity}.base`, 0, 1000000),
      perUnit: number(award.perUnit, `$.awards.${activity}.perUnit`, 0, 1000000),
    })];
  })) as Record<ExperienceActivity, ExperienceAward>;
  return Object.freeze({ id: id(source.id, '$.id'), kind: 'progression', schemaVersion: 1,
    description: source.description, levelCap, xpCurve: Object.freeze({ scale, exponent }),
    respecCostsBronze: Object.freeze(costs), awards: Object.freeze(awards),
    ...(source.retired === undefined ? {} : { retired: source.retired as boolean }),
    ...(source.replacement === undefined ? {} : { replacement: id(source.replacement, '$.replacement') }),
  });
}
