import { cropGrowthAt, CROP_STAGE_COUNT, type CropDefinition } from './crops.js';
import { treeRegrowthProgressAtSweep, treeGrowthStageForProgress, TREE_REGROWTH_PROGRESS_MAX,
  TREE_REGROWTH_SWEEP_TICKS } from './tree-regrowth.js';
import { orchardFruitStatus, type OrchardHarvestResource } from './orchard-harvest.js';
import { statefulTimingMilestones, type StatefulComponentSet, type StatefulLifecycle,
  type GrowthEnvironment } from './content/stateful-components.js';
import type { TimingProjection } from './timing.js';

export interface CropTimingSource {
  readonly kind: 'crop'; readonly definition: CropDefinition;
  readonly storedGrowthTicks: bigint; readonly growthUpdatedAtTick: bigint;
  readonly wateredAtTick: bigint; readonly watered: boolean;
  readonly automaticallyWatered: boolean; readonly calendarOffsetTicks: bigint;
  readonly greenhouseProtected: boolean;
}
export interface TreeTimingSource {
  readonly kind: 'tree'; readonly progress: number; readonly depleted: boolean;
  readonly health: number; readonly raining: boolean; readonly phaseSeed: number;
}
export interface FruitTimingSource {
  readonly kind: 'fruit'; readonly resource: OrchardHarvestResource; readonly durationTicks: bigint;
}
export interface StatefulTimingSource {
  readonly kind: 'stateful'; readonly components: StatefulComponentSet;
  readonly lifecycle?: StatefulLifecycle;
  /** Environment must belong to the lifecycle's already-settled epoch. */
  readonly environment?: GrowthEnvironment;
}
export type GrowthTimingSource = CropTimingSource | TreeTimingSource | FruitTimingSource | StatefulTimingSource;

function cropAt(source: CropTimingSource, tick: bigint) {
  return cropGrowthAt(source.definition, source.storedGrowthTicks, source.growthUpdatedAtTick,
    source.wateredAtTick, tick, source.watered, source.automaticallyWatered,
    source.calendarOffsetTicks, source.greenhouseProtected);
}

export function projectGrowthTiming(source: GrowthTimingSource, now: bigint): TimingProjection {
  if (source.kind === 'crop') {
    const growth = cropAt(source, now);
    const paused = !growth.inSeason || !growth.watered;
    const finish = now + growth.remainingTicks;
    // A remaining active-growth budget is an ETA only if existing water and
    // seasonal conditions cover it. Future rain/player watering is not assumed.
    const exact = growth.mature || (!paused && cropAt(source, finish).mature);
    const threshold = (source.definition.growthTicks * BigInt(growth.stage + 1)
      + BigInt(CROP_STAGE_COUNT - 1)) / BigInt(CROP_STAGE_COUNT);
    const stageTick = now + (threshold > growth.growthTicks ? threshold - growth.growthTicks : 0n);
    const stageCovered = !paused && cropAt(source, stageTick).growthTicks >= threshold;
    return { status: growth.mature ? 'ready' : paused ? 'paused' : 'running',
      reason: growth.mature ? 'harvest' : !growth.inSeason ? 'dormant' : !growth.watered ? 'dry' : 'active-growth',
      stage: growth.stage, progress: growth.progress, remainingActiveTicks: growth.remainingTicks,
      nextTransitionTick: growth.mature || !stageCovered ? null : stageTick,
      confidence: exact ? 'exact' : 'estimated' };
  }
  if (source.kind === 'tree') {
    const current = source.depleted && source.health === 0 && source.progress >= TREE_REGROWTH_PROGRESS_MAX
      ? 0 : Math.max(0, Math.min(TREE_REGROWTH_PROGRESS_MAX, source.progress));
    if (current >= TREE_REGROWTH_PROGRESS_MAX) return { status: 'ready', reason: 'fully-grown', stage: 2,
      progress: 1, remainingActiveTicks: 0n, nextTransitionTick: null, confidence: 'exact' };
    const sweep = BigInt(TREE_REGROWTH_SWEEP_TICKS);
    let progress = current, tick = (now / sweep + 1n) * sweep, next: bigint | null = null;
    const stage = treeGrowthStageForProgress(current);
    // Legacy authority writes at global sweeps. At most 24 calls to its exact
    // increment helper for a hovered tree; never extrapolate a per-frame sweep.
    for (let step = 0; step < TREE_REGROWTH_PROGRESS_MAX; step++, tick += sweep) {
      progress = treeRegrowthProgressAtSweep(progress, tick, source.raining, source.phaseSeed);
      if (next === null && treeGrowthStageForProgress(progress) !== stage) next = tick;
      if (progress >= TREE_REGROWTH_PROGRESS_MAX) break;
    }
    return { status: 'running', reason: 'regrowing', stage: stage === null ? null : stage - 1, progress: current / TREE_REGROWTH_PROGRESS_MAX,
      remainingActiveTicks: tick - now, nextTransitionTick: next, confidence: 'estimated' };
  }
  if (source.kind === 'fruit') {
    const status = orchardFruitStatus(source.resource, now);
    const ready = status === 'ok';
    const remaining = (source.resource.fruitReadyAtTick ?? 0n) - now;
    return { status: ready ? 'ready' : status === 'fruit_ripening' ? 'running' : 'blocked',
      reason: ready ? 'harvest' : status === 'fruit_ripening' ? 'ripening' : status,
      stage: Math.max(0, source.resource.growthStage - 1),
      progress: ready ? 1 : status !== 'fruit_ripening' || source.durationTicks <= 0n ? 0
        : Math.max(0, Math.min(1, 1 - Number(remaining) / Number(source.durationTicks))),
      remainingActiveTicks: ready ? 0n : status === 'fruit_ripening' ? remaining : null,
      nextTransitionTick: status === 'fruit_ripening' ? source.resource.fruitReadyAtTick ?? null : null,
      confidence: 'exact' };
  }
  if (source.lifecycle === undefined) return { status: 'blocked', reason: 'anchor-unavailable', stage: null,
    progress: 0, remainingActiveTicks: null, nextTransitionTick: null, confidence: 'estimated' };
  const milestones = statefulTimingMilestones(source.components, source.lifecycle, { nowTick: now,
    ...(source.environment === undefined ? {} : { environment: source.environment }) });
  const { settled, paused, growthFinish, nextTransitionTick } = milestones;
  const maximum = source.components.growth?.maxProgress;
  const ready = maximum !== undefined && settled.growthProgress >= maximum;
  const pending = settled.fired.length > 0 || settled.truncated;
  return { status: pending ? 'awaiting-settlement' : ready ? 'ready' : paused ? 'paused'
    : growthFinish !== null || nextTransitionTick !== null ? 'running' : 'idle',
    reason: pending ? 'transition-pending' : ready ? 'fully-grown' : paused ? 'growth-paused' : maximum !== undefined ? 'active-growth' : null,
    stage: settled.growthStage, progress: maximum === undefined ? 0 : settled.growthProgress / maximum,
    remainingActiveTicks: growthFinish === null ? nextTransitionTick === null ? null : nextTransitionTick - now
      : growthFinish > now ? growthFinish - now : 0n,
    nextTransitionTick, confidence: pending || source.components.growth?.modifiers !== undefined ? 'estimated' : 'exact' };
}
