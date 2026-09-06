import {
  TILE_SIZE_FIXED,
  stepFishermanCycle,
  type Effect,
  type NpcContentDefinition,
} from '@orchard/sim';

export interface AuthoredNpcRow {
  readonly id: bigint;
  readonly kind: string;
  readonly displayName: string;
  readonly x: number;
  readonly y: number;
  readonly homeX: number;
  readonly homeY: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly facing: string;
  readonly moving: boolean;
  readonly wanderDirection: string;
  readonly nextDecisionTick: bigint;
  readonly authorityTick: bigint;
  readonly health: number;
  readonly spaceId: number;
}

export interface AuthoredNpcProfilePlan {
  readonly npcId: bigint;
  readonly dialogueId: string;
  readonly shopId: string;
}

function runtimeKind(definition: NpcContentDefinition): string {
  return definition.runtimeKind ?? definition.id.slice('npc:'.length);
}

/** Creates missing NPC rows from content while an existing living row keeps
 * its position, activity, health and deadlines across a head advance. */
export function authoredNpcRowPlan(
  definition: NpcContentDefinition,
  authorityTick: bigint,
  existing?: AuthoredNpcRow,
): AuthoredNpcRow {
  if (existing !== undefined) return {
    ...existing,
    kind: runtimeKind(definition),
    displayName: definition.displayName,
  };
  const x = definition.home.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const y = definition.home.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const initialFishing = definition.ai.kind === 'fishing_cycle'
    ? stepFishermanCycle(BigInt(definition.runtimeId), 'idle', authorityTick, authorityTick)
    : undefined;
  return {
    id: BigInt(definition.runtimeId),
    kind: runtimeKind(definition),
    displayName: definition.displayName,
    x, y, homeX: x, homeY: y,
    chunkX: Math.floor(definition.home.tileX / 16),
    chunkY: Math.floor(definition.home.tileY / 16),
    facing: definition.facing,
    moving: false,
    wanderDirection: initialFishing?.activity ?? 'idle',
    nextDecisionTick: initialFishing?.nextDecisionTick
      ?? authorityTick + BigInt(definition.initialDecisionDelayTicks ?? 45),
    authorityTick,
    health: definition.health,
    spaceId: definition.home.spaceId,
  };
}

export function authoredNpcProfilePlan(definition: NpcContentDefinition): AuthoredNpcProfilePlan | null {
  if (definition.dialogue === undefined) return null;
  return {
    npcId: BigInt(definition.runtimeId),
    dialogueId: definition.dialogue.slice('dialogue:'.length),
    shopId: definition.shop?.slice('shop:'.length) ?? 'general_tools',
  };
}

export interface AuthoredNpcTickPlan {
  readonly activity: string;
  readonly nextDecisionTick: bigint;
  readonly speech?: string;
}

/** Validates the immutable spawn-handler result before the authority projects
 * it onto persistent NPC and profile rows. Existing rows deliberately retain
 * their position, health, activity, and deadlines. */
export function authoredNpcSpawnLifecyclePlan(
  definition: NpcContentDefinition,
  effects: readonly Effect[],
  authorityTick: bigint,
  existing?: AuthoredNpcRow,
): { readonly row: AuthoredNpcRow; readonly profile: AuthoredNpcProfilePlan | null } {
  const effect = effects[0];
  const expectedAt = {
    spaceId: definition.home.spaceId.toString(),
    x: definition.home.tileX,
    y: definition.home.tileY,
  };
  if (effects.length !== 1 || effect === undefined || !('spawnNpc' in effect)
    || effect.spawnNpc.definitionId !== definition.id
    || effect.spawnNpc.at === undefined
    || effect.spawnNpc.at.spaceId !== expectedAt.spaceId
    || effect.spawnNpc.at.x !== expectedAt.x
    || effect.spawnNpc.at.y !== expectedAt.y) {
    throw new Error(`npc spawn lifecycle mismatch: ${definition.id}`);
  }
  return {
    row: authoredNpcRowPlan(definition, authorityTick, existing),
    profile: authoredNpcProfilePlan(definition),
  };
}

/** Converts the narrow authored tick effect vocabulary into the existing
 * deterministic worker update. Movement/pathfinding and listener visibility
 * remain engine-owned because they are not represented in the snapshot. */
export function authoredNpcTickLifecyclePlan(
  definition: NpcContentDefinition,
  effects: readonly Effect[],
): AuthoredNpcTickPlan | null {
  if (effects.length === 0) return null;
  const stateEffect = effects[0];
  const animationEffect = effects[1];
  const speechEffect = effects[2];
  if (effects.length < 2 || effects.length > 3
    || stateEffect === undefined || !('setState' in stateEffect)
    || animationEffect === undefined || !('animation' in animationEffect)) {
    throw new Error(`npc tick lifecycle mismatch: ${definition.id}`);
  }
  const keys = Object.keys(stateEffect.setState).sort();
  const activity = stateEffect.setState.activity;
  const nextDecisionTick = stateEffect.setState.nextDecisionTick;
  if (keys.length !== 2 || keys[0] !== 'activity' || keys[1] !== 'nextDecisionTick'
    || typeof activity !== 'string' || activity.length === 0
    || typeof nextDecisionTick !== 'number' || !Number.isSafeInteger(nextDecisionTick)
    || nextDecisionTick < 0 || animationEffect.animation !== activity
    || (speechEffect !== undefined
      && (!('say' in speechEffect) || speechEffect.say.length === 0))) {
    throw new Error(`npc tick lifecycle mismatch: ${definition.id}`);
  }
  return {
    activity,
    nextDecisionTick: BigInt(nextDecisionTick),
    ...(speechEffect === undefined ? {} : { speech: speechEffect.say }),
  };
}
