import { runtimeObjectProcessor, processTopologyForObject, projectTiming,
  processDurationTicks, barrelCellarCureTicks, barrelCellarBatchCapacity, estateVintageTier, farmingBarrelTicks,
  runtimeItemEconomy, runtimeItemDefinition,
  type ContentRegistry, type ObjectContentReference, type ItemStack,
} from '@orchard/sim';
import type { WorldPlaceable } from '@orchard/world-bindings/types';

const cache = new WeakMap<ContentRegistry, Map<string, ReturnType<typeof runtimeObjectProcessor>>>();
/** Registry instances are immutable per content revision and discarded on reconnect. */
export function cachedProcessorRuntime(registry: ContentRegistry, reference: ObjectContentReference) {
  let entries = cache.get(registry);
  if (!entries) { entries = new Map(); cache.set(registry, entries); }
  const key = `${reference.definitionId ?? ''}:${reference.kind}`;
  if (!entries.has(key)) entries.set(key, runtimeObjectProcessor(registry, reference));
  return entries.get(key) ?? null;
}

export interface ProcessorTimingContext {
  readonly registry: ContentRegistry;
  readonly slots?: { readonly get: (slot: number) => ItemStack | undefined };
  readonly barrelRank: number;
  readonly vintageRank: number;
  readonly barrelingRank: number;
}

function computeProcessorTiming(placeable: WorldPlaceable, authorityTick: bigint, context: ProcessorTimingContext) {
  const runtime = cachedProcessorRuntime(context.registry, placeable);
  if (runtime === null) return null;
  const topology = processTopologyForObject(runtime.object);
  if (topology === null) return null;
  const { adapter, processor, definitions } = runtime;
  const slots = context.slots === undefined ? undefined : Array.from({ length: topology.slotCount }, (_, index) => {
    const row = context.slots!.get(index);
    return row === undefined || row.itemKind === 'empty' || row.quantity <= 0 ? null : row;
  });
  const inputKind = (adapter === 'barrel'
    ? topology.inputSlots.map(slot => slots?.[slot]).find(Boolean)
    : slots?.[topology.inputSlots[0]!])?.itemKind
    ?? (adapter === 'campfire_cooking' ? placeable.cookInputKind : placeable.processInputKind);
  let durationTicks = processDurationTicks(definitions, inputKind, processor.ticksPerUnit);
  if (adapter === 'barrel') durationTicks = barrelCellarCureTicks(durationTicks, context.barrelRank);
  if (adapter === 'fermentation') {
    const definition = definitions.find(def => def.input.item === `item:${inputKind}`) ?? definitions[0];
    const outputKind = definition?.outputs[0]?.item.slice(5);
    const price = outputKind === undefined ? 0 : runtimeItemEconomy(context.registry, outputKind)?.sellPriceBronze ?? 0;
    durationTicks = estateVintageTier(context.vintageRank, durationTicks, price).agingTicks;
  }
  if (adapter === 'barrel' || adapter === 'fermentation') durationTicks = farmingBarrelTicks(durationTicks, context.barrelingRank);
  const startTick = adapter === 'smelting' ? placeable.smeltStartTick
    : adapter === 'campfire_cooking' ? placeable.cookStartTick
      : adapter === 'barrel' ? placeable.barrelSealedTick : placeable.processStartTick;
  const timing = projectTiming({ kind: 'process', definitions, adapter, durationTicks, startTick, lit: placeable.lit,
    ...(slots === undefined ? {} : { state: { slots, startTick, lit: placeable.lit } }),
    options: { topology, ticksPerUnit: durationTicks, catchUpCap: processor.catchUpCap,
      maxStackForItem: kind => runtimeItemDefinition(context.registry, kind)?.maxStack ?? null,
      ...(adapter === 'barrel' ? { minimumBatch: processor.minimumBatch,
        maximumBatch: barrelCellarBatchCapacity(processor.maximumBatch ?? processor.catchUpCap, context.barrelRank) } : {}),
    },
  }, authorityTick);
  return { ...runtime, inputKind, durationTicks, timing, progress: timing.progress, remaining: timing.remainingActiveTicks };
}

interface ProjectionCacheEntry {
  readonly tick: bigint;
  readonly context: ProcessorTimingContext;
  readonly slots: readonly (ItemStack | undefined)[] | undefined;
  readonly result: ReturnType<typeof computeProcessorTiming>;
}
const projections = new WeakMap<WorldPlaceable, ProjectionCacheEntry>();
/** At most one projection per authority tick and immutable row/slot snapshot.
 * Weak keys release removed/reconnected entities without an eviction loop. */
export function projectProcessorTiming(placeable: WorldPlaceable, authorityTick: bigint, context: ProcessorTimingContext) {
  const runtime = cachedProcessorRuntime(context.registry, placeable);
  const topology = runtime === null ? null : processTopologyForObject(runtime.object);
  const slots = context.slots === undefined || topology === null ? undefined
    : Array.from({ length: topology.slotCount }, (_, slot) => context.slots!.get(slot));
  const previous = projections.get(placeable);
  if (previous && previous.tick === authorityTick && previous.context.registry === context.registry
    && previous.context.barrelRank === context.barrelRank && previous.context.vintageRank === context.vintageRank
    && previous.context.barrelingRank === context.barrelingRank
    && (slots === undefined ? previous.slots === undefined
      : previous.slots?.length === slots.length && slots.every((row, i) => row === previous.slots![i]))) return previous.result;
  const result = computeProcessorTiming(placeable, authorityTick, context);
  projections.set(placeable, { tick: authorityTick, context, slots, result });
  return result;
}
