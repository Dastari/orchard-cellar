import { describe, expect, it, vi } from 'vitest';
vi.mock('spacetimedb/server', () => ({ SenderError: class SenderError extends Error {} }));
import type { WorldReducerContext } from '../index.js';
import {
  claimProcessJobBehaviour, planProcessJobClaim, planProcessJobInventoryGrant,
  type ProcessJobClaimDependencies, type ProcessJobEscrow,
} from './process-jobs.js';

const owner = { isEqual: (value: unknown) => value === owner };
const escrow: ProcessJobEscrow = {
  targetKind: 'placeable', targetId: 900n, spaceId: 4,
  recipeId: 'cook_beef', inputKind: 'raw_beef', outputKind: 'cooked_beef',
  quantity: 8, startedTick: 10n, readyTick: 50n,
};

function fixture(overrides: Partial<ProcessJobEscrow> = {}) {
  let job: (ProcessJobEscrow & { identity: typeof owner }) | null = { ...escrow, ...overrides, identity: owner };
  let receipt: unknown = null;
  let tick = 50n;
  let capacity = 8;
  let collectionAvailable = true;
  let authorized = true;
  const grants: Array<{ itemKind: string; quantity: number }> = [];
  const rewards: number[] = [];
  const notifications: ProcessJobEscrow[] = [];
  const writes: string[] = [];
  const ctx = {
    sender: owner,
    db: {
      player_cooking_job: { identity: {
        find: (identity: unknown) => { expect(identity).toBe(owner); return job; },
        delete: (identity: unknown) => { expect(identity).toBe(owner); writes.push('delete'); job = null; },
      } },
      player_process_job_receipt: {
        identity: { find: () => receipt },
        insert: (value: unknown) => { writes.push('receipt'); receipt = value; },
      },
      world_clock: { id: { find: () => ({ authorityTick: tick }) } },
    },
  } as unknown as WorldReducerContext;
  const dependencies: ProcessJobClaimDependencies = {
    authorize: () => { if (!authorized) throw new Error('authentication_required'); },
    assertCollectionTarget: () => { if (!collectionAvailable) throw new Error('cooking_target_unavailable'); },
    prepareInventoryGrant: (_ctx, plan) => {
      if (capacity < plan.quantity) throw new Error('inventory_full');
      return () => { writes.push('grant'); grants.push({ itemKind: plan.itemKind, quantity: plan.quantity }); };
    },
    experiencePerItem: () => 7,
    recordCollection: (_ctx, _job, experience) => { rewards.push(experience); },
    processCompleted: (_ctx, value) => { notifications.push(value); },
  };
  return {
    ctx, dependencies, grants, rewards, notifications, writes,
    get job() { return job; }, get receipt() { return receipt; },
    setTick: (value: bigint) => { tick = value; },
    setCapacity: (value: number) => { capacity = value; },
    removeStation: () => { collectionAvailable = false; },
    revoke: () => { authorized = false; },
    foreignOwner: () => { job = { ...job!, identity: { isEqual: () => false } }; },
  };
}

describe('preserved personal process escrow lifecycle', () => {
  it('uses the real inventory planner atomically across a changed stack cap', () => {
    const containers = {
      hotbar: { id: 'hotbar', capacity: 1, slots: [{ itemKind: 'promised_stew', quantity: 3, lit: true }] },
      backpack: { id: 'backpack', capacity: 1, slots: [null] },
    };
    const content = { maxStackFor: () => 4, hasTag: () => false };
    const plan = { action: 'collect' as const, itemKind: 'promised_stew', quantity: 6 };
    const before = structuredClone(containers);
    expect(() => planProcessJobInventoryGrant(containers, plan, content)).toThrow('inventory_full');
    expect(containers).toEqual(before);
    const after = planProcessJobInventoryGrant(containers, { ...plan, quantity: 5 }, content);
    expect(after.hotbar!.slots).toEqual([{ itemKind: 'promised_stew', quantity: 4, lit: true }]);
    expect(after.backpack!.slots).toEqual([{ itemKind: 'promised_stew', quantity: 4, lit: true }]);
    expect(containers).toEqual(before);
    expect(() => planProcessJobInventoryGrant(containers, plan, {
      ...content, maxStackFor: () => null,
    })).toThrow('process_job_item_unavailable');
  });
  it('collects and refunds into durable stacks without requiring an empty slot', () => {
    const content = { maxStackFor: () => 4, hasTag: () => false };
    for (const action of ['collect', 'cancel'] as const) {
      const plan = planProcessJobClaim({ ...escrow, quantity: 1 }, action, 50n);
      const containers = {
        hotbar: { id: 'hotbar', capacity: 1, slots: [{ itemKind: plan.itemKind, quantity: 3, lit: true }] },
        backpack: { id: 'backpack', capacity: 1, slots: [{ itemKind: 'stone', quantity: 4, lit: true }] },
      };
      const after = planProcessJobInventoryGrant(containers, plan, content);
      expect(after.hotbar!.slots[0]).toEqual({ itemKind: plan.itemKind, quantity: 4, lit: true });
      expect(after.backpack).toEqual(containers.backpack);
      expect(containers.hotbar.slots[0]!.quantity).toBe(3);
    }
  });
  it('honors the exact absolute completion boundary and persisted promise independently of recipe edits', () => {
    const custom = { ...escrow, recipeId: 'retired_recipe', outputKind: 'promised_stew', quantity: 3 };
    expect(() => planProcessJobClaim(custom, 'collect', 49n)).toThrow('cooking_not_ready');
    expect(planProcessJobClaim(custom, 'collect', 50n)).toEqual({
      action: 'collect', itemKind: 'promised_stew', quantity: 3,
    });
    expect(planProcessJobClaim(custom, 'cancel', 0n)).toEqual({
      action: 'cancel', itemKind: 'raw_beef', quantity: 3,
    });
  });

  it('records the complete original obligation and grants progress exactly once after collection', () => {
    const f = fixture();
    claimProcessJobBehaviour(f.ctx, 'collect', f.dependencies, false);
    expect(f.writes).toEqual([]);
    claimProcessJobBehaviour(f.ctx, 'collect', f.dependencies);
    expect(f.grants).toEqual([{ itemKind: 'cooked_beef', quantity: 8 }]);
    expect(f.receipt).toMatchObject({ ...escrow, identity: owner, action: 'collect',
      resolvedTick: 50n, grantedKind: 'cooked_beef', farmingExperience: 56 });
    expect(f.writes).toEqual(['grant', 'receipt', 'delete']);
    expect(f.rewards).toEqual([56]);
    expect(f.notifications).toHaveLength(1);
    expect(f.job).toBeNull();
    expect(() => claimProcessJobBehaviour(f.ctx, 'collect', f.dependencies)).toThrow('cooking_job_missing');
    claimProcessJobBehaviour(f.ctx, 'cancel', f.dependencies);
    expect(f.grants).toHaveLength(1);
  });

  it('preserves the job and every inventory slot when only part of a batch fits', () => {
    const f = fixture();
    const original = f.job;
    f.setCapacity(7);
    for (const action of ['collect', 'cancel'] as const) {
      expect(() => claimProcessJobBehaviour(f.ctx, action, f.dependencies)).toThrow('inventory_full');
      expect(f.job).toBe(original);
      expect(f.receipt).toBeNull();
      expect(f.writes).toEqual([]);
    }
    f.setCapacity(8);
    claimProcessJobBehaviour(f.ctx, 'cancel', f.dependencies);
    expect(f.grants).toEqual([{ itemKind: 'raw_beef', quantity: 8 }]);
    expect(f.rewards).toEqual([]);
    expect(f.notifications).toEqual([]);
  });

  it('keeps cancellation usable after station removal, without a clock-ready or recipe-policy dependency', () => {
    const f = fixture({ targetKind: 'landmark', recipeId: 'no_longer_authored' });
    f.removeStation();
    f.setTick(0n);
    claimProcessJobBehaviour(f.ctx, 'cancel', {
      ...f.dependencies, experiencePerItem: () => { throw new Error('unavailable recipe'); },
    });
    expect(f.grants).toEqual([{ itemKind: 'raw_beef', quantity: 8 }]);
    expect(f.receipt).toMatchObject({ action: 'cancel', recipeId: 'no_longer_authored' });
  });

  it('rejects unauthenticated, foreign, early and unavailable-target collection before any writes', () => {
    for (const [prepare, error] of [
      [(f: ReturnType<typeof fixture>) => f.revoke(), 'authentication_required'],
      [(f: ReturnType<typeof fixture>) => f.foreignOwner(), 'process_job_owner_mismatch'],
      [(f: ReturnType<typeof fixture>) => f.setTick(49n), 'cooking_not_ready'],
      [(f: ReturnType<typeof fixture>) => f.removeStation(), 'cooking_target_unavailable'],
    ] as const) {
      const f = fixture(); prepare(f);
      expect(() => claimProcessJobBehaviour(f.ctx, 'collect', f.dependencies)).toThrow(error);
      expect(f.job).not.toBeNull();
      expect(f.receipt).toBeNull();
      expect(f.writes).toEqual([]);
    }
  });

  it('preserves any valid stored u8 quantity and rejects invalid obligations without coercion', () => {
    for (const quantity of [1, 8, 255]) expect(planProcessJobClaim({ ...escrow, quantity }, 'collect', 50n).quantity).toBe(quantity);
    for (const quantity of [0, -1, 256, 1.5]) expect(() => planProcessJobClaim({ ...escrow, quantity }, 'cancel', 0n)).toThrow('process_job_escrow_invalid');
    expect(() => planProcessJobClaim({ ...escrow, outputKind: 'empty' }, 'collect', 50n)).toThrow('process_job_item_invalid');
  });
});
