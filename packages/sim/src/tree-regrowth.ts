import { AUTHORITY_TICKS_PER_DAY } from './time.js';
import {
  advanceGrowthProgressAtSweep,
  growthStageIndexForProgress,
  type GrowthProfile,
} from './growth.js';

/** Tree phase and regrowth progress are persisted separately from hit points so
 * every live phase can be chopped without losing its growth schedule. */
export const TREE_REGROWTH_PROGRESS_MAX = 24;
export const TREE_REGROWTH_SWEEP_TICKS = AUTHORITY_TICKS_PER_DAY / TREE_REGROWTH_PROGRESS_MAX;
export const TREE_REGROWTH_SMALL_PROGRESS = 6;
export const TREE_REGROWTH_MEDIUM_PROGRESS = 15;
export const TREE_REGROWTH_RAIN_BONUS_BPS = 1_000;

export const TREE_GROWTH_STAGE_SMALL = 1;
export const TREE_GROWTH_STAGE_MEDIUM = 2;
export const TREE_GROWTH_STAGE_BIG = 3;
export type TreeGrowthStageValue = 1 | 2 | 3;
export type TreeGrowthStage = 'small' | 'medium' | 'big';

export const TREE_GROWTH_PROFILE: GrowthProfile = {
  maxProgress: TREE_REGROWTH_PROGRESS_MAX,
  stageThresholds: [
    TREE_REGROWTH_SMALL_PROGRESS,
    TREE_REGROWTH_MEDIUM_PROGRESS,
    TREE_REGROWTH_PROGRESS_MAX,
  ],
};

export function normalizeTreeGrowthStage(value: number): TreeGrowthStageValue {
  if (value === TREE_GROWTH_STAGE_SMALL || value === TREE_GROWTH_STAGE_MEDIUM) return value;
  return TREE_GROWTH_STAGE_BIG;
}

export function treeGrowthStageName(value: number): TreeGrowthStage {
  const stage = normalizeTreeGrowthStage(value);
  return stage === TREE_GROWTH_STAGE_SMALL ? 'small'
    : stage === TREE_GROWTH_STAGE_MEDIUM ? 'medium'
      : 'big';
}

export function treeGrowthStageForProgress(progress: number): TreeGrowthStageValue | null {
  const stage = growthStageIndexForProgress(TREE_GROWTH_PROFILE, progress);
  return stage === null ? null : normalizeTreeGrowthStage(stage + 1);
}

export function treeHealthForGrowthStage(value: number): number {
  return normalizeTreeGrowthStage(value);
}

/** Rain supplies one extra interval out of ten (about a 9% shorter full grow
 * under uninterrupted rain), deliberately useful but not strategically large. */
export function treeRegrowthProgressAtSweep(
  progress: number,
  authorityTick: bigint,
  raining: boolean,
  phaseSeed = 0,
): number {
  return advanceGrowthProgressAtSweep(
    progress,
    TREE_GROWTH_PROFILE,
    authorityTick,
    TREE_REGROWTH_SWEEP_TICKS,
    { waterBps: raining ? TREE_REGROWTH_RAIN_BONUS_BPS : 0 },
    phaseSeed,
  );
}
