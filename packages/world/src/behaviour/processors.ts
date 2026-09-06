import {
  barrelCellarBatchCapacity,
  barrelCellarCureTicks,
  estateVintageTier,
  processTopologyForObject,
  settleProcess,
  runtimeItemEconomy,
  type CellarProcessorInterface,
  type ItemStack,
  type ProcessAdapter,
  type ProcessContentDefinition,
  type ProcessTopology,
  type ObjectContentDefinition,
  type PlayerStatisticKind,
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
    track: 'farming',
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
    upgradeKind: 'barrel_cellar' | 'estate_vintage',
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
  readonly adapter: ProcessAdapter;
  readonly topology: ProcessTopology;
  readonly definitions: readonly ProcessContentDefinition[];
}

export function processorRuntimeForPlaceableBehaviour(
  registry: ContentRegistry,
  placeable: Pick<WorldPlaceableRow, 'kind' | 'definitionId'>,
): PlaceableProcessorRuntime | null {
  const definitionId = placeable.definitionId?.trim() || `object:${placeable.kind}`;
  const object = registry.objects.get(definitionId);
  if (object === undefined) return null;
  const processTag = object.components.processor?.processTag;
  const topology = processTopologyForObject(object);
  if (processTag === undefined || topology === null) return null;
  const definitions = [...registry.processes.values()]
    .filter((definition) => definition.stationTag === processTag);
  const adapters = new Set([...registry.processes.values()]
    .filter((definition) => definition.stationTag === processTag)
    .map((definition) => definition.adapter));
  const adapter = adapters.size === 1 ? [...adapters][0] : undefined;
  return adapter === undefined ? null : { object, adapter, topology, definitions };
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
    const rank = dependencies.homesteadUpgradeRank(ctx, placeable.spaceId, 'barrel_cellar');
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
        dependencies.homesteadUpgradeRank(ctx, placeable.spaceId, 'estate_vintage'),
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
  const runtime = processorRuntimeForPlaceableBehaviour(
    dependencies.contentRegistry(ctx), placeable,
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
  writeSettledSlots(ctx, rows, before, settled.slots, dependencies);

  if (adapter === 'smelting') {
    if (settled.startTick !== placeable.smeltStartTick) {
      ctx.db.world_placeable.id.update({ ...placeable, smeltStartTick: settled.startTick });
    }
  } else if (adapter === 'campfire_cooking') {
    if (settled.completed > 0 && settled.completedInputKind !== null
      && placeable.cookStartedBy !== undefined) {
      const definition = processDefinitionForInput(definitions, adapter, settled.completedInputKind);
      dependencies.grantSkillExperience(
        ctx,
        placeable.cookStartedBy,
        'farming',
        BigInt((definition?.experience?.amount ?? 5) * settled.completed),
      );
      dependencies.recordPlayerStatistic(
        ctx,
        placeable.cookStartedBy,
        'food_cooked',
        BigInt(settled.completed),
        authorityTick,
        definition?.outputs[0]?.item.slice('item:'.length) ?? '',
      );
    }
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
    const producer = placeable.barrelSealedBy ?? placeable.placedBy;
    dependencies.grantSkillExperience(ctx, producer, 'farming', BigInt(15 + settled.completed));
    dependencies.recordPlayerStatistic(
      ctx, producer, 'barrels_cured', 1n, authorityTick, settled.completedInputKind ?? '',
    );
    ctx.db.world_placeable.id.update({
      ...placeable,
      barrelSealedTick: undefined,
      barrelSealedBy: undefined,
    });
  } else {
    const producer = placeable.processStartedBy ?? placeable.placedBy;
    if (settled.completed > 0) {
      if (adapter === 'press') {
        dependencies.grantSkillExperience(ctx, producer, 'farming', BigInt(settled.completed * 4));
        dependencies.recordPlayerStatistic(
          ctx, producer, 'fruit_pressed', BigInt(settled.completed), authorityTick,
          settled.completedInputKind ?? '',
        );
        dependencies.recordPlayerStatistic(
          ctx, producer, 'press_cycles_completed', BigInt(settled.completed), authorityTick,
        );
        for (const itemKind of ['must', 'pomace']) dependencies.recordPlayerStatistic(
          ctx, producer, 'items_obtained', BigInt(settled.completed), authorityTick, itemKind,
        );
      } else {
        dependencies.grantSkillExperience(ctx, producer, 'farming', BigInt(settled.completed * 25));
        dependencies.recordPlayerStatistic(
          ctx, producer, 'bottles_produced', BigInt(settled.completed), authorityTick,
        );
        dependencies.recordPlayerStatistic(
          ctx, producer, 'items_obtained', BigInt(settled.completed), authorityTick, 'bottles',
        );
      }
    }
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
