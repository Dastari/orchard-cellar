import { describe, expect, it } from 'vitest';
import { projectTiming, type CropTimingSource } from './timing.js';
import { CROP_DEFINITIONS, cropGrowthAt } from './crops.js';
import { AUTHORITY_TICKS_PER_DAY, DAYS_PER_SEASON } from './time.js';
import { TREE_REGROWTH_SWEEP_TICKS, treeRegrowthProgressAtSweep } from './tree-regrowth.js';
import { createStatefulLifecycle, settleStatefulTransitions, type StatefulComponentSet } from './content/stateful-components.js';

const crop: CropTimingSource = { kind: 'crop', definition: { ...CROP_DEFINITIONS[0]!, growthTicks: 1_200n, wateringTicks: 2_000n },
  storedGrowthTicks: 0n, growthUpdatedAtTick: 100n, wateredAtTick: 100n, watered: true,
  automaticallyWatered: false, calendarOffsetTicks: 0n, greenhouseProtected: false };

describe('shared growth projection', () => {
  it('matches crop authority exactly at stage and finish boundaries across reconnects', () => {
    for (const now of [100n, 120n, 399n, 400n, 1_299n, 1_300n]) {
      const authority = cropGrowthAt(crop.definition, 0n, 100n, 100n, now, true);
      const timing = projectTiming(crop, now);
      expect(timing).toMatchObject({ progress: authority.progress, stage: authority.stage,
        remainingActiveTicks: authority.remainingTicks, status: authority.mature ? 'ready' : 'running', confidence: 'exact' });
    }
    expect(projectTiming(crop, 120n).nextTransitionTick).toBe(400n);
    expect(projectTiming(crop, 120n).remainingActiveTicks).toBe(1_180n);
  });
  it('does not present dry or dormant active-growth budgets as deadlines', () => {
    expect(projectTiming({ ...crop, watered: false }, 120n)).toMatchObject({ status: 'paused', reason: 'dry', nextTransitionTick: null });
    const winter = BigInt(AUTHORITY_TICKS_PER_DAY * DAYS_PER_SEASON * 3);
    expect(projectTiming({ ...crop, calendarOffsetTicks: winter }, 120n)).toMatchObject({ status: 'paused', reason: 'dormant', progress: 0, nextTransitionTick: null });
    expect(projectTiming({ ...crop, calendarOffsetTicks: winter, greenhouseProtected: true }, 120n)).toMatchObject({ status: 'running', confidence: 'exact', progress: 1 / 60 });
    expect(projectTiming({ ...crop, definition: { ...crop.definition, wateringTicks: 50n } }, 120n)).toMatchObject({ status: 'running', confidence: 'estimated', nextTransitionTick: null, remainingActiveTicks: 1_180n });
    expect(projectTiming({ ...crop, definition: { ...crop.definition, wateringTicks: 50n } }, 150n)).toMatchObject({ status: 'paused', reason: 'dry' });
  });
  it('keeps winter-crossing and future watering conditional', () => {
    const winter = BigInt(AUTHORITY_TICKS_PER_DAY * DAYS_PER_SEASON * 3);
    expect(projectTiming({ ...crop, calendarOffsetTicks: winter - 200n }, 120n)).toMatchObject({ confidence: 'estimated', nextTransitionTick: null });
    const resumed = { ...crop, storedGrowthTicks: 20n, growthUpdatedAtTick: 1_000n, wateredAtTick: 1_000n };
    expect(projectTiming(resumed, 1_020n).remainingActiveTicks).toBe(1_160n);
  });
  it.each([false, true])('matches the existing global tree sweep under rain=%s', raining => {
    const sweep = BigInt(TREE_REGROWTH_SWEEP_TICKS), now = sweep * 7n + 1n;
    const source = { kind: 'tree' as const, progress: 3, depleted: true, health: 0, raining, phaseSeed: 17 };
    const timing = projectTiming(source, now);
    let progress = source.progress, tick = sweep * 8n;
    for (; progress < 24; tick += sweep) progress = treeRegrowthProgressAtSweep(progress, tick, raining, 17);
    expect(timing.remainingActiveTicks).toBe(tick - sweep - now);
    expect(timing.confidence).toBe('estimated');
    expect(projectTiming({ ...source, progress: 24 }, now).progress).toBe(0);
    expect(projectTiming({ ...source, progress: 24, depleted: false, health: 3 }, now).status).toBe('ready');
  });
  it('uses authoritative fruit deadlines and refuses immature-tree ETAs', () => {
    const source = { kind: 'fruit' as const, durationTicks: 1_200n,
      resource: { kind: 'apple_tree', tileX: 0, tileY: 0, depleted: false, health: 3, growthStage: 3, fruitReadyAtTick: 1_300n } };
    expect(projectTiming(source, 120n)).toMatchObject({ status: 'running', reason: 'ripening', remainingActiveTicks: 1_180n, nextTransitionTick: 1_300n });
    expect(projectTiming(source, 1_300n)).toMatchObject({ status: 'ready', reason: 'harvest' });
    expect(projectTiming({ ...source, resource: { ...source.resource, growthStage: 1 } }, 120n)).toMatchObject({ status: 'blocked', remainingActiveTicks: null });
  });
  it('shares generic transition mathematics and never invents private anchors', () => {
    const components: StatefulComponentSet = { states: { ripe: { type: 'bool', default: false }, dry: { type: 'bool', default: false } },
      growth: { maxProgress: 10, sweepTicks: 20, stageThresholds: [0, 5, 10], pausedWhen: [{ dry: true }] },
      transitions: [{ id: 'ripen', from: { ripe: false }, to: { ripe: true }, after: { growthProgress: 10 } }] };
    const lifecycle = createStatefulLifecycle(components, 100n);
    expect(projectTiming({ kind: 'stateful', components }, 120n)).toMatchObject({ status: 'blocked', reason: 'anchor-unavailable' });
    expect(projectTiming({ kind: 'stateful', components, lifecycle, checkpoint: { authorityTick: 120n, caughtUp: true } }, 120n)).toMatchObject({ progress: .1, remainingActiveTicks: 180n, nextTransitionTick: 200n });
    expect(projectTiming({ kind: 'stateful', components, lifecycle }, 120n))
      .toMatchObject({ status: 'blocked', reason: 'checkpoint-unavailable', nextTransitionTick: null });
    expect(projectTiming({ kind: 'stateful', components, lifecycle, checkpoint: { authorityTick: 120n, caughtUp: false } }, 120n))
      .toMatchObject({ status: 'awaiting-settlement', reason: 'catch-up-pending', remainingActiveTicks: null });
    expect(projectTiming({ kind: 'stateful', components, lifecycle, checkpoint: { authorityTick: 121n, caughtUp: true } }, 120n))
      .toMatchObject({ status: 'awaiting-settlement', remainingActiveTicks: null });
    expect(projectTiming({ kind: 'stateful', components, lifecycle, checkpoint: { authorityTick: 100n, caughtUp: true } }, 120n).confidence).toBe('estimated');
    const settled = settleStatefulTransitions(components, lifecycle, { nowTick: 300n });
    expect(settled.fired[0]?.atTick).toBe(300n);
    expect(projectTiming({ kind: 'stateful', components, lifecycle, checkpoint: { authorityTick: 300n, caughtUp: true } }, 300n).status).toBe('awaiting-settlement');
    expect(projectTiming({ kind: 'stateful', components, lifecycle: settled.state, checkpoint: { authorityTick: 300n, caughtUp: true } }, 300n).status).toBe('ready');
    expect(projectTiming({ kind: 'stateful', components, lifecycle: createStatefulLifecycle(components, 100n, { dry: true }), checkpoint: { authorityTick: 120n, caughtUp: true } }, 120n))
      .toMatchObject({ status: 'paused', nextTransitionTick: null, remainingActiveTicks: null });
  });
});
