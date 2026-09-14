import {
  MAX_EFFECTS_PER_HANDLER_RESULT,
  rollLoot,
  type Effect,
  type LootContentDefinition,
  type LootDrop,
  type LootRollContext,
  type LootRollRequest,
} from '@orchard/sim';

import type { WorldReducerContext } from '../index.js';

type WorldIdentity = WorldReducerContext['sender'];

export interface AuthorityLootDrop extends LootDrop {
  readonly x: number;
  readonly y: number;
  readonly droppedAtTick: bigint;
  readonly durability: number;
  readonly spaceId: number;
  readonly reservedFor?: WorldIdentity;
  readonly reservedUntilTick?: bigint;
}

export interface LootAuthorityDependencies {
  readonly insertPlayerCarriedItem: (
    ctx: WorldReducerContext,
    itemKind: string,
    quantity: number,
  ) => boolean;
  readonly dropWorldItemStack: (ctx: WorldReducerContext, drop: AuthorityLootDrop) => void;
  readonly recordPlayerStatistic: (
    ctx: WorldReducerContext,
    identity: WorldIdentity,
    statisticId: 'items_obtained',
    delta: bigint,
    authorityTick: bigint,
    context: string,
  ) => void;
}

export interface LootDeliveryPlan {
  readonly x: number;
  readonly y: number;
  readonly spaceId: number;
  readonly authorityTick: bigint;
  readonly recipient?: WorldIdentity;
  readonly inventoryFirst?: boolean;
  readonly reservedUntilTick?: bigint;
  readonly horizontalSpacing?: number;
  readonly recordItemsObtained?: boolean;
}

export const MAX_LIFECYCLE_LOOT_ROLLS = 32 as const;

export interface LifecycleLootRollPlan {
  readonly seedParts: LootRollRequest['seedParts'];
  readonly context?: LootRollContext;
}

export interface LifecycleLootResolution {
  readonly drops: readonly LootDrop[];
  readonly flags: readonly string[];
  /** Effects outside this adapter's deliberately narrow ownership remain
   * explicit so callers cannot silently discard authored authority work. */
  readonly remainingEffects: readonly Effect[];
}

/** Bounded authority adapter for authored `rollLoot` effects. Handler
 * selection remains in the lifecycle bus; this interpreter only resolves the
 * selected tables and never writes rows. The existing row adapter below owns
 * delivery, preserving transactional validation before mutation. */
export function resolveLifecycleLootEffects(
  definitions: ReadonlyMap<string, LootContentDefinition>,
  effects: readonly Effect[],
  plan: LifecycleLootRollPlan,
): LifecycleLootResolution {
  if (effects.length > MAX_EFFECTS_PER_HANDLER_RESULT) {
    throw new Error('behaviour_effect_cap_exceeded');
  }
  const drops: LootDrop[] = [];
  const flags = new Set<string>();
  const remainingEffects: Effect[] = [];
  let totalRolls = 0;
  let lootOrdinal = 0;
  for (const effect of effects) {
    if (!('rollLoot' in effect)) {
      remainingEffects.push(effect);
      continue;
    }
    const rolls = effect.rollLoot.rolls ?? 1;
    if (!Number.isSafeInteger(rolls) || rolls < 1) throw new Error('loot_roll_count_invalid');
    totalRolls += rolls;
    if (totalRolls > MAX_LIFECYCLE_LOOT_ROLLS) {
      throw new Error('lifecycle_loot_roll_cap_exceeded');
    }
    if (!effect.rollLoot.lootId.startsWith('loot:')) throw new Error('loot_definition_missing');
    const result = rollLoot(definitions, {
      lootId: effect.rollLoot.lootId as `loot:${string}`,
      rolls,
      seedParts: lootOrdinal === 0
        ? plan.seedParts
        : [...plan.seedParts, 'lifecycle.rollLoot', lootOrdinal],
      ...(plan.context === undefined ? {} : { context: plan.context }),
    });
    lootOrdinal += 1;
    drops.push(...result.drops);
    for (const flag of result.flags) flags.add(flag);
  }
  return Object.freeze({
    drops: Object.freeze(drops),
    flags: Object.freeze([...flags].sort()),
    remainingEffects: Object.freeze(remainingEffects),
  });
}

/** Sole row-writing adapter for authored drops. It preserves the legacy
 * inventory-first/fallback distinction, reservation, spatial fan-out, and
 * item statistic order while keeping loot selection in the sim interpreter. */
export function applyLootDropsBehaviour(
  ctx: WorldReducerContext,
  drops: readonly LootDrop[],
  plan: LootDeliveryPlan,
  dependencies: LootAuthorityDependencies,
): void {
  for (const [index, drop] of drops.entries()) {
    if (!Number.isSafeInteger(drop.quantity) || drop.quantity <= 0) {
      throw new Error('invalid_loot_quantity');
    }
    const carried = plan.inventoryFirst === true && plan.recipient !== undefined
      && dependencies.insertPlayerCarriedItem(ctx, drop.itemKind, drop.quantity);
    if (!carried) dependencies.dropWorldItemStack(ctx, {
      itemKind: drop.itemKind,
      quantity: drop.quantity,
      x: plan.x + index * (plan.horizontalSpacing ?? 0),
      y: plan.y,
      droppedAtTick: plan.authorityTick,
      durability: 0,
      spaceId: plan.spaceId,
      ...(plan.recipient === undefined ? {} : { reservedFor: plan.recipient }),
      ...(plan.reservedUntilTick === undefined ? {} : {
        reservedUntilTick: plan.reservedUntilTick,
      }),
    });
    if (plan.recordItemsObtained === true && plan.recipient !== undefined) {
      dependencies.recordPlayerStatistic(
        ctx,
        plan.recipient,
        'items_obtained',
        BigInt(drop.quantity),
        plan.authorityTick,
        drop.itemKind,
      );
    }
  }
}
