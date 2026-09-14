import {
  barrelCellarBatchCapacity,
  barrelCellarCureTicks,
  estateVintageTier,
  processTopologyForObject,
  runtimeProcessorCompletionRewards,
  settleProcess,
  runtimeItemEconomy,
  runtimeObjectProcessor,
  type HomesteadUpgradeMechanic,
  type CellarProcessorInterface,
  type ItemStack,
  type ProcessAdapter,
  type ProcessContentDefinition,
  type ProcessTopology,
  type ObjectContentDefinition,
  type PlayerStatisticKind,
  type SkillTrack,
  type ContentRegistry,
} from '@orchard/sim';

import type { WorldPlaceableRow, WorldReducerContext } from '../index.js';

type WorldIdentity = WorldReducerContext['sender'];

interface PlaceableSlotRow {
  readonly id: string;
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
  readonly placeableId: bigint;
}

export interface ProcessorBehaviourDependencies {
  /** Active authority content snapshot. */
  readonly contentRegistry: (ctx: WorldReducerContext) => ContentRegistry;
  readonly loadOpenPlaceableRows: (
    ctx: WorldReducerContext,
    placeable: WorldPlaceableRow,
  ) => PlaceableSlotRow[];
  readonly storedStack: (
    ctx: WorldReducerContext,
    itemKind: string,
    quantity: number,
    durability: number,
    lit: boolean,
  ) => ItemStack | null;
  readonly sameStoredStack: (left: ItemStack | null, right: ItemStack | null) => boolean;
  readonly storedDurability: (ctx: WorldReducerContext, itemKind: string, durability?: number) => number;
  readonly storedLit: (itemKind: string, lit?: boolean) => boolean;
  readonly maxStackForItem: (ctx: WorldReducerContext, itemKind: string) => number | null;
  readonly grantSkillExperience: (
    ctx: WorldReducerContext,
    identity: WorldIdentity,
    track: SkillTrack,
    experience: bigint,
  ) => void;
  readonly recordPlayerStatistic: (
    ctx: WorldReducerContext,
    identity: WorldIdentity,
    statisticId: PlayerStatisticKind,
    delta: bigint,
    authorityTick: bigint,
    context?: string,
  ) => void;
  readonly homesteadUpgradeRank: (
    ctx: WorldReducerContext,
    spaceId: number,
    mechanic: HomesteadUpgradeMechanic,
  ) => number;
  /** Raised only after a positive settlement has durably written its slots and
   * processor ownership metadata. The callback must not settle the processor
   * again; processComplete is a post-settlement lifecycle notification. */
  readonly processCompleted?: (
    ctx: WorldReducerContext,
    placeable: WorldPlaceableRow,
    unitsSettled: number,
  ) => void;
}

export function processorAdapterForPlaceableBehaviour(
  registry: ContentRegistry,
  placeable: Pick<WorldPlaceableRow, 'kind' | 'definitionId'>,
): ProcessAdapter | null {
  return processorRuntimeForPlaceableBehaviour(registry, placeable)?.adapter ?? null;
}

export interface PlaceableProcessorRuntime {
  readonly object: ObjectContentDefinition;
  readonly processor: NonNullable<ObjectContentDefinition['components']['processor']>;
  readonly adapter: ProcessAdapter;
  readonly topology: ProcessTopology;
  readonly definitions: readonly ProcessContentDefinition[];
}

export function processorRuntimeForPlaceableBehaviour(
  registry: ContentRegistry,
  placeable: Pick<WorldPlaceableRow, 'kind' | 'definitionId'>,
): PlaceableProcessorRuntime | null {
  const runtime = runtimeObjectProcessor(registry, placeable);
  if (runtime === null) return null;
  const topology = processTopologyForObject(runtime.object);
  return topology === null ? null : { ...runtime, topology };
}

export function cellarInterfaceForPlaceableBehaviour(
  registry: ContentRegistry,
  placeable: WorldPlaceableRow,
): CellarProcessorInterface | null {
  const adapter = processorAdapterForPlaceableBehaviour(registry, placeable);
  if (adapter === 'press') return 'press';
  return adapter === 'fermentation' ? 'fermentation' : null;
}

function processDefinitionForInput(
  definitions: readonly ProcessContentDefinition[],
  adapter: ProcessAdapter,
  inputKind: string,
): ProcessContentDefinition | undefined {
  return definitions.find((definition) => definition.adapter === adapter
    && definition.input.item === `item:${inputKind}`);
}

function startTickFor(placeable: WorldPlaceableRow, adapter: ProcessAdapter): bigint | undefined {
  if (adapter === 'smelting') return placeable.smeltStartTick;
  if (adapter === 'campfire_cooking') return placeable.cookStartTick;
  if (adapter === 'barrel') return placeable.barrelSealedTick;
  return placeable.processStartTick;
}

function processorOptions(
  ctx: WorldReducerContext,
  placeable: WorldPlaceableRow,
  adapter: ProcessAdapter,
  inputKind: string | undefined,
  topology: ProcessTopology,
  component: NonNullable<ObjectContentDefinition['components']['processor']>,
  definitions: readonly ProcessContentDefinition[],
  dependencies: ProcessorBehaviourDependencies,
) {
  const maxStackForItem = (kind: string) => dependencies.maxStackForItem(ctx, kind);
  const authoredTicks = inputKind === undefined
    ? component.ticksPerUnit
    : processDefinitionForInput(definitions, adapter, inputKind)?.ticksPerUnit
      ?? component.ticksPerUnit;
  const shared = { topology, catchUpCap: component.catchUpCap, maxStackForItem };
  if (adapter === 'barrel') {
    const rank = dependencies.homesteadUpgradeRank(ctx, placeable.spaceId, 'barrel');
    return {
      ...shared,
      ticksPerUnit: barrelCellarCureTicks(BigInt(authoredTicks), rank),
      ...(component.minimumBatch === undefined ? {} : { minimumBatch: component.minimumBatch }),
      maximumBatch: barrelCellarBatchCapacity(component.maximumBatch ?? component.catchUpCap, rank),
    };
  }
  if (adapter === 'fermentation') {
    const definition = inputKind === undefined
      ? definitions.find((candidate) => candidate.adapter === adapter)
      : processDefinitionForInput(definitions, adapter, inputKind);
    const outputKind = definition?.outputs[0]?.item.slice('item:'.length);
    const bottleEconomy = outputKind === undefined
      ? null : runtimeItemEconomy(dependencies.contentRegistry(ctx), outputKind);
    return {
      ...shared,
      ticksPerUnit: estateVintageTier(
        dependencies.homesteadUpgradeRank(ctx, placeable.spaceId, 'vintage'),
        BigInt(authoredTicks),
        bottleEconomy?.sellPriceBronze ?? 0,
      ).agingTicks,
    };
  }
  return shared;
}

function writeSettledSlots(
  ctx: WorldReducerContext,
  rows: readonly PlaceableSlotRow[],
  before: readonly (ItemStack | null)[],
  after: readonly (ItemStack | null)[],
  dependencies: ProcessorBehaviourDependencies,
): void {
  const rowsBySlot = new Map(rows.map((row) => [row.slot, row]));
  for (let slot = 0; slot < after.length; slot += 1) {
    const row = rowsBySlot.get(slot);
    const next = after[slot] ?? null;
    if (row === undefined || dependencies.sameStoredStack(before[slot] ?? null, next)) continue;
    ctx.db.world_placeable_slot.id.update({
      ...row,
      itemKind: next?.itemKind ?? 'empty',
      quantity: next?.quantity ?? 0,
      durability: dependencies.storedDurability(ctx, next?.itemKind ?? 'empty', next?.durability),
      lit: dependencies.storedLit(next?.itemKind ?? 'empty', next?.lit),
    });
  }
}

/**
 * The sole authority settlement adapter. It projects the active content
 * registry onto migration-safe tick columns, retaining exact slot,
 * attribution, statistic and upgrade semantics while definitions take over.
 */
export function settleProcessorPlaceableBehaviour(
  ctx: WorldReducerContext,
  placeable: WorldPlaceableRow,
  dependencies: ProcessorBehaviourDependencies,
): WorldPlaceableRow {
  const registry = dependencies.contentRegistry(ctx);
  const runtime = processorRuntimeForPlaceableBehaviour(
    registry, placeable,
  );
  if (runtime === null || (runtime.adapter === 'barrel' && placeable.barrelSealedTick === undefined)) {
    return placeable;
  }
  const { adapter, topology } = runtime;
  const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick;
  if (authorityTick === undefined) return placeable;
  const definitions = runtime.definitions;
  const rows = dependencies.loadOpenPlaceableRows(ctx, placeable);
  const rowsBySlot = new Map(rows.map((row) => [row.slot, row]));
  const before = Array.from({ length: topology.slotCount }, (_, slot) => {
    const row = rowsBySlot.get(slot);
    return row === undefined
      ? null
      : dependencies.storedStack(ctx, row.itemKind, row.quantity, row.durability, row.lit);
  });
  const inputKind = before[topology.inputSlots[0]!]?.itemKind;
  const settled = settleProcess(definitions, adapter, {
    slots: before,
    startTick: startTickFor(placeable, adapter),
    lit: placeable.lit,
  }, authorityTick, processorOptions(
    ctx, placeable, adapter, inputKind, topology,
    runtime.object.components.processor!, definitions, dependencies,
  ));

  // A matured invalid barrel was deliberately left sealed by the legacy world
  // adapter. It must not partially write slots or clear ownership metadata.
  if (adapter === 'barrel' && settled.completedInputKind === null) return placeable;
  let completionRewards: ReturnType<typeof runtimeProcessorCompletionRewards> | undefined;
  if (settled.completed > 0) {
    const completedDefinition = settled.completedInputKind === null
      ? undefined : processDefinitionForInput(definitions, adapter, settled.completedInputKind);
    if (completedDefinition === undefined) {
      throw new Error(`settled processor input has no active definition: ${settled.completedInputKind ?? 'unknown'}`);
    }
    completionRewards = runtimeProcessorCompletionRewards(
      registry, runtime, completedDefinition, settled.completed,
    );
    if (completionRewards === null) {
      throw new Error(`invalid_processor_completion_rewards:${completedDefinition.id}`);
    }
  }
  writeSettledSlots(ctx, rows, before, settled.slots, dependencies);

  const producer = adapter === 'campfire_cooking'
    ? placeable.cookStartedBy
    : adapter === 'barrel'
      ? placeable.barrelSealedBy ?? placeable.placedBy
      : placeable.processStartedBy ?? placeable.placedBy;
  if (producer !== undefined && completionRewards !== null && completionRewards !== undefined) {
    if (completionRewards.experience !== undefined) dependencies.grantSkillExperience(
      ctx, producer, completionRewards.experience.skill,
      completionRewards.experience.amount,
    );
    for (const statistic of completionRewards.statistics) dependencies.recordPlayerStatistic(
      ctx, producer, statistic.kind, statistic.delta, authorityTick, statistic.subject,
    );
  }

  if (adapter === 'smelting') {
    if (settled.startTick !== placeable.smeltStartTick) {
      ctx.db.world_placeable.id.update({ ...placeable, smeltStartTick: settled.startTick });
    }
  } else if (adapter === 'campfire_cooking') {
    const cookStartedBy = settled.startTick === undefined ? undefined : placeable.cookStartedBy;
    const cookInputKind = settled.startTick === undefined
      ? undefined : before[topology.inputSlots[0]!]?.itemKind;
    if (settled.startTick !== placeable.cookStartTick
      || cookStartedBy !== placeable.cookStartedBy
      || cookInputKind !== placeable.cookInputKind) {
      ctx.db.world_placeable.id.update({
        ...placeable,
        cookStartTick: settled.startTick,
        cookStartedBy,
        cookInputKind,
      });
    }
  } else if (adapter === 'barrel') {
    ctx.db.world_placeable.id.update({
      ...placeable,
      barrelSealedTick: undefined,
      barrelSealedBy: undefined,
    });
  } else {
    const processStartedBy = settled.startTick === undefined
      ? undefined
      : placeable.processStartedBy ?? placeable.placedBy;
    const processInputKind = settled.startTick === undefined
      ? undefined
      : settled.slots[topology.inputSlots[0]!]?.itemKind;
    if (settled.startTick !== placeable.processStartTick
      || processStartedBy !== placeable.processStartedBy
      || processInputKind !== placeable.processInputKind) {
      ctx.db.world_placeable.id.update({
        ...placeable,
        processStartTick: settled.startTick,
        processStartedBy,
        processInputKind,
      });
    }
  }
  const latest = ctx.db.world_placeable.id.find(placeable.id) ?? placeable;
  if (settled.completed > 0) {
    dependencies.processCompleted?.(ctx, latest, settled.completed);
  }
  return latest;
}
