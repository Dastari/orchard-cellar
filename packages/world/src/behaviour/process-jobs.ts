import { SenderError } from 'spacetimedb/server';
import { quickMoveItemStack, type ContainerSnapshot, type ItemContainerContentResolver } from '@orchard/sim';
import type { WorldReducerContext } from '../index.js';

/** Preserved escrow contract: ingredients have already left the inventory.
 * Recipe edits must never reinterpret the promised output or ready time. */
export interface ProcessJobEscrow {
  readonly targetKind: string;
  readonly targetId: bigint;
  readonly spaceId: number;
  readonly recipeId: string;
  readonly inputKind: string;
  readonly outputKind: string;
  readonly quantity: number;
  readonly startedTick: bigint;
  readonly readyTick: bigint;
}

export type ProcessJobClaimAction = 'collect' | 'cancel';
export interface ProcessJobClaimPlan {
  readonly action: ProcessJobClaimAction;
  readonly itemKind: string;
  readonly quantity: number;
}

/** Plans the entire escrow, including quantities larger than today's stack cap.
 * Intermediate container copies are discarded if even the final item cannot fit. */
export function planProcessJobInventoryGrant(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  plan: ProcessJobClaimPlan,
  content: ItemContainerContentResolver,
): Readonly<Record<string, ContainerSnapshot>> {
  const maximum = content.maxStackFor(plan.itemKind);
  if (maximum === null || !Number.isSafeInteger(maximum) || maximum < 1) {
    throw new SenderError('process_job_item_unavailable');
  }
  if (!Number.isSafeInteger(plan.quantity) || plan.quantity < 1 || plan.quantity > 255) {
    throw new SenderError('process_job_escrow_invalid');
  }
  let remaining = plan.quantity;
  let next = containers;
  while (remaining > 0) {
    const quantity = Math.min(remaining, maximum);
    const sourceId = 'process-job-escrow';
    const moved = quickMoveItemStack({
      // Durable food stacks use the canonical default lit=true even though food
      // has no light state. Match that metadata so existing stacks remain usable.
      ...next, [sourceId]: { id: sourceId, capacity: 1, slots: [{ itemKind: plan.itemKind, quantity, lit: true }] },
    }, { fromContainer: sourceId, fromIndex: 0, toContainers: ['hotbar', 'backpack'] }, content);
    if (!moved.ok || moved.movedQuantity !== quantity) throw new SenderError('inventory_full');
    next = { ...next, hotbar: moved.containers.hotbar!, backpack: moved.containers.backpack! };
    remaining -= quantity;
  }
  return next;
}

export function planProcessJobClaim(
  job: ProcessJobEscrow,
  action: ProcessJobClaimAction,
  authorityTick: bigint,
): ProcessJobClaimPlan {
  if (action !== 'collect' && action !== 'cancel') throw new SenderError('process_job_action_invalid');
  if (!Number.isSafeInteger(job.quantity) || job.quantity < 1 || job.quantity > 255
    || (action === 'collect' && (job.startedTick < 0n || job.readyTick < job.startedTick))) {
    throw new SenderError('process_job_escrow_invalid');
  }
  if (action === 'collect' && authorityTick < job.readyTick) throw new SenderError('cooking_not_ready');
  const itemKind = action === 'collect' ? job.outputKind : job.inputKind;
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(itemKind) || itemKind === 'empty') {
    throw new SenderError('process_job_item_invalid');
  }
  return { action, itemKind, quantity: job.quantity };
}

export interface ProcessJobClaimDependencies {
  readonly authorize: (ctx: WorldReducerContext) => void;
  /** Collection checks the original station, authored capability, light and reach.
   * Cancellation deliberately requires none of those, including after removal. */
  readonly assertCollectionTarget: (ctx: WorldReducerContext, job: ProcessJobEscrow) => void;
  /** Computes a complete inventory insertion without writing; no partial/drop fallback. */
  readonly prepareInventoryGrant: (
    ctx: WorldReducerContext, plan: ProcessJobClaimPlan,
  ) => () => void;
  readonly experiencePerItem: (ctx: WorldReducerContext, job: ProcessJobEscrow) => number;
  readonly recordCollection: (
    ctx: WorldReducerContext, job: ProcessJobEscrow, experience: number, tick: bigint,
  ) => void;
  readonly processCompleted: (ctx: WorldReducerContext, job: ProcessJobEscrow) => void;
}

/** The only writer for pre-migration personal process escrow. Called by a
 * registry-owned frameAction callback through the validated effect writer.
 * No connect/tick migration moves, consumes or reprices a pending obligation. */
export function claimProcessJobBehaviour(
  ctx: WorldReducerContext,
  action: ProcessJobClaimAction,
  dependencies: ProcessJobClaimDependencies,
  mutate = true,
): void {
  dependencies.authorize(ctx);
  const job = ctx.db.player_cooking_job.identity.find(ctx.sender);
  if (job === null) {
    if (action === 'cancel') return;
    throw new SenderError('cooking_job_missing');
  }
  if (!job.identity.isEqual(ctx.sender)) throw new SenderError('process_job_owner_mismatch');
  if (ctx.db.player_process_job_receipt.identity.find(ctx.sender) !== null) {
    throw new SenderError('process_job_already_resolved');
  }
  const tick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
  const plan = planProcessJobClaim(job, action, tick);
  let experience = 0;
  if (action === 'collect') {
    dependencies.assertCollectionTarget(ctx, job);
    experience = dependencies.experiencePerItem(ctx, job) * job.quantity;
    if (!Number.isSafeInteger(experience) || experience < 0) {
      throw new SenderError('process_job_experience_invalid');
    }
  }
  const grant = dependencies.prepareInventoryGrant(ctx, plan);
  if (!mutate) return;
  // All of this is one SpacetimeDB transaction. Receipt/event failures roll back
  // the grant and deletion together; a retry cannot resolve the same escrow twice.
  grant();
  ctx.db.player_process_job_receipt.insert({
    ...job, action, resolvedTick: tick, grantedKind: plan.itemKind, farmingExperience: experience,
  });
  ctx.db.player_cooking_job.identity.delete(ctx.sender);
  if (action === 'collect') {
    dependencies.recordCollection(ctx, job, experience, tick);
    dependencies.processCompleted(ctx, job);
  }
}
