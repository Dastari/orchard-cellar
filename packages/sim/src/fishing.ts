import { activityExperience, BOOTSTRAP_PROGRESSION } from './progression.js';
export const FISHING_CAST_TICKS = 80n;
export const FISH_POOL_ACTIVE_CAP = 24;
/** The generated island's 5x5-deep pond interiors cannot fit 24 pools at ten
 * tiles apart (the deterministic maximum is below twenty). Six preserves a
 * visible gap while allowing the documented active population in this map. */
export const FISH_POOL_MIN_SPACING_TILES = 6;
export const FISH_POOL_MIN_RICHNESS = 2;
export const FISH_POOL_MAX_RICHNESS = 4;
export const FISHING_CATCH_FARMING_XP = activityExperience(BOOTSTRAP_PROGRESSION, 'fish_catch');
export const FISHING_POOL_DEPLETION_FARMING_XP = activityExperience(BOOTSTRAP_PROGRESSION, 'fish_depletion');
