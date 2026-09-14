import {
  barrelCanSeal,
  barrelCellarBatchCapacity,
  type ContentRegistry,
  type ItemStack,
  type PlayerStatisticKind,
} from '@orchard/sim';
import { SenderError } from 'spacetimedb/server';

import type { WorldPlaceableRow, WorldReducerContext } from '../index.js';
import { processorRuntimeForPlaceableBehaviour } from './processors.js';

type WorldIdentity = WorldReducerContext['sender'];

export interface CookingBehaviourDependencies {
  readonly contentRegistry: (ctx: WorldReducerContext) => ContentRegistry;
  readonly authorize: (ctx: WorldReducerContext) => void;
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
  readonly loadOpenBarrel: (ctx: WorldReducerContext) => {
    readonly placeable: WorldPlaceableRow | undefined;
    readonly slots: readonly (ItemStack | null)[];
  };
  readonly homesteadUpgradeRank: (
    ctx: WorldReducerContext,
    spaceId: number,
    upgradeKind: 'barrel_cellar',
  ) => number;
  readonly clearActivePlaceable: (ctx: WorldReducerContext, identity: WorldIdentity) => void;
}

export function sealBarrelBehaviour(
  ctx: WorldReducerContext,
  dependencies: CookingBehaviourDependencies,
): void {
  dependencies.authorize(ctx);
  const menu = dependencies.loadOpenBarrel(ctx);
  const placeable = menu.placeable;
  const clock = ctx.db.world_clock.id.find(0);
  const runtime = placeable === undefined ? null
    : processorRuntimeForPlaceableBehaviour(dependencies.contentRegistry(ctx), placeable);
  if (placeable === undefined || runtime?.adapter !== 'barrel' || clock === null) {
    throw new SenderError('barrel_not_open');
  }
  if (placeable.barrelSealedTick !== undefined) {
    throw new SenderError('barrel_already_sealed');
  }
  const barrelRank = dependencies.homesteadUpgradeRank(
    ctx,
    placeable.spaceId,
    'barrel_cellar',
  );
  if (!barrelCanSeal(
    menu.slots,
    barrelCellarBatchCapacity(
      runtime.object.components.processor!.maximumBatch
        ?? runtime.object.components.processor!.catchUpCap,
      barrelRank,
    ),
    runtime.object.components.processor!.minimumBatch,
  )) {
    throw new SenderError('barrel_batch_invalid');
  }
  const cropKind = menu.slots.find((stack) => stack !== null)?.itemKind ?? '';
  ctx.db.world_placeable.id.update({
    ...placeable,
    open: false,
    barrelSealedTick: clock.authorityTick,
    barrelSealedBy: ctx.sender,
  });
  dependencies.clearActivePlaceable(ctx, ctx.sender);
  dependencies.grantSkillExperience(ctx, ctx.sender, 'farming', 5n);
  dependencies.recordPlayerStatistic(
    ctx,
    ctx.sender,
    'barrels_sealed',
    1n,
    clock.authorityTick,
    cropKind,
  );
}
