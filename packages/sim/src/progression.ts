import progressionJson from '../../assets/content/progression.json' with { type: 'json' };
import { parseProgressionDefinition, type ExperienceActivity, type ProgressionContentDefinition } from './content/progression-definition.js';
import type { ContentRegistry } from './content/registry.js';

const bootstrapProfiles = progressionJson.map(parseProgressionDefinition).filter(row => row.retired !== true);
if (bootstrapProfiles.length !== 1) throw new Error('bootstrap_progression_unavailable');
export const BOOTSTRAP_PROGRESSION = bootstrapProfiles[0]!;
/** Additive rollout fallback only when no progression rows exist. Retired or
 * ambiguous authored owners fail closed rather than silently restoring defaults. */
export function runtimeProgression(registry: Pick<ContentRegistry, 'progressions'>): ProgressionContentDefinition {
  if (registry.progressions.size === 0) return BOOTSTRAP_PROGRESSION;
  const active = [...registry.progressions.values()].filter(row => row.retired !== true);
  if (active.length !== 1) throw new Error('progression_unavailable');
  return active[0]!;
}
export function activityExperience(progression: ProgressionContentDefinition, activity: ExperienceActivity, units = 0): bigint {
  if (!Number.isSafeInteger(units) || units < 0) throw new Error('invalid_experience_units');
  const award = progression.awards[activity];
  return BigInt(award.base) + BigInt(award.perUnit) * BigInt(units);
}
export function runtimeActivityExperience(registry: Pick<ContentRegistry, 'progressions'>, activity: ExperienceActivity, units = 0): bigint {
  return activityExperience(runtimeProgression(registry), activity, units);
}
