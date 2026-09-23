import { projectGrowthTiming, type GrowthTimingSource } from './timing-growth.js';
export type { CropTimingSource, TreeTimingSource, FruitTimingSource, StatefulTimingSource } from './timing-growth.js';
import { processProgressAt, processRemainingTicksAt, settleProcess,
  type ProcessAdapter, type ProcessSettlementOptions, type ProcessSettlementState,
} from './behaviour/handlers/processors.js';
import type { ProcessContentDefinition } from './content/definitions.js';

export type TimingStatus = 'idle' | 'running' | 'paused' | 'blocked' | 'ready' | 'awaiting-settlement';
export interface TimingProjection {
  readonly status: TimingStatus;
  readonly reason: string | null;
  readonly stage: number | null;
  readonly progress: number;
  readonly remainingActiveTicks: bigint | null;
  readonly nextTransitionTick: bigint | null;
  readonly confidence: 'exact' | 'estimated';
}

export interface ProcessTimingSource {
  readonly kind: 'process';
  readonly definitions: readonly ProcessContentDefinition[];
  readonly adapter: ProcessAdapter;
  readonly durationTicks: bigint;
  readonly startTick: bigint | undefined;
  /** Missing slots mean public hover cannot prove input/fuel/output custody. */
  readonly state?: ProcessSettlementState;
  readonly options: ProcessSettlementOptions;
}

function inactiveReason(source: ProcessTimingSource): string {
  const state = source.state!;
  if (source.adapter === 'campfire_cooking' && state.lit !== true) return 'fire-out';
  if (source.adapter === 'barrel' && source.startTick === undefined) return 'unsealed';
  const input = source.options.topology.inputSlots.map(slot => state.slots[slot]).find(Boolean);
  const recipe = source.definitions.find(def => def.input.item === `item:${input?.itemKind}`);
  if (!input || !recipe || input.quantity < recipe.input.count) return 'needs-input';
  if (recipe.fuelPolicy) {
    const fuel = state.slots[source.options.topology.fuelSlots[0]!];
    if (!fuel || fuel.quantity <= 0 || !recipe.fuelPolicy.acceptedItems.includes(`item:${fuel.itemKind}`)) return 'no-fuel';
  }
  return source.adapter === 'barrel' ? 'invalid-batch' : 'output-full';
}

/** Read-only projection; settlement remains the sole producer of output.
 * The same settlement function determines catch-up and next-unit progress.
 * Public anchors never imply confirmed output or reveal private slots. */
export function projectTiming(source: ProcessTimingSource | GrowthTimingSource, authorityTick: bigint): TimingProjection {
  if (source.kind !== 'process') return projectGrowthTiming(source, authorityTick);
  let startTick = source.startTick;
  let status: TimingStatus = startTick === undefined ? 'idle' : 'running';
  let reason: string | null = source.state === undefined ? 'contents-unknown' : null;
  let confidence: TimingProjection['confidence'] = source.state === undefined ? 'estimated' : 'exact';
  if (source.durationTicks <= 0n) return { status: 'blocked', reason: 'invalid-duration', stage: null,
    progress: 0, remainingActiveTicks: null, nextTransitionTick: null, confidence: 'estimated' };
  if (source.state !== undefined) {
    const settled = settleProcess(source.definitions, source.adapter, source.state, authorityTick, source.options);
    const confirmedOutput = source.options.topology.outputSlots.some(slot => {
      const stack = source.state!.slots[slot];
      return stack !== null && stack !== undefined && stack.quantity > 0
        && source.definitions.some(def => def.outputs.some(output => output.item === `item:${stack.itemKind}`));
    });
    if (settled.completed > 0) {
      status = 'awaiting-settlement'; reason = 'collect-to-confirm'; confidence = 'estimated';
      // Preserve complete progress for the final unit, otherwise show the
      // next unit exactly as settlement will, without claiming its output.
      startTick = settled.startTick ?? source.startTick;
    } else if (source.adapter === 'barrel' && startTick !== undefined
      && authorityTick >= startTick + source.durationTicks) {
      status = 'blocked'; reason = 'invalid-batch'; startTick = undefined;
    } else if (settled.startTick === undefined) {
      reason = inactiveReason(source);
      status = confirmedOutput ? 'ready' : reason === 'needs-input' || reason === 'unsealed' ? 'idle' : 'blocked';
      if (confirmedOutput) reason = null;
      startTick = undefined;
    } else if (source.startTick === undefined) {
      status = 'awaiting-settlement'; reason = 'start-pending'; confidence = 'estimated';
      startTick = undefined;
    }
  }
  const remaining = processRemainingTicksAt(startTick, authorityTick, source.durationTicks);
  if (source.state === undefined && remaining === 0n) {
    status = 'awaiting-settlement'; reason = 'collect-to-confirm';
  }
  return { status, reason, stage: null,
    progress: status === 'ready' ? 1 : processProgressAt(startTick, authorityTick, source.durationTicks),
    remainingActiveTicks: remaining,
    nextTransitionTick: startTick === undefined || remaining === 0n ? null : startTick + source.durationTicks,
    confidence };
}
