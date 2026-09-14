import type { StateValue } from './effects.js';

export type ReadonlyJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ReadonlyJsonValue[]
  | { readonly [key: string]: ReadonlyJsonValue };

export interface BehaviourTileSnapshot {
  readonly spaceId: string;
  readonly x: number;
  readonly y: number;
  readonly tags: readonly string[];
}

export interface BehaviourItemSnapshot {
  readonly kind: string;
  readonly definitionId?: string;
  readonly instanceId?: string;
  readonly tags: readonly string[];
  readonly count: number;
  readonly durability?: number;
  readonly maxDurability?: number;
  readonly containerId?: string;
  readonly slot?: number;
  readonly state?: Readonly<Record<string, StateValue>>;
}

export interface BehaviourContainerSnapshot {
  readonly id: string;
  readonly capacity: number;
  readonly slots: readonly (BehaviourItemSnapshot | null)[];
  readonly ownerEntityId?: string;
  readonly roles?: Readonly<Record<string, readonly number[]>>;
}

export interface BehaviourVitalsSnapshot {
  readonly hunger: number;
  readonly vigour: number;
}

export interface BehaviourActorSnapshot {
  readonly entityType: 'player' | 'npc';
  readonly id: string;
  readonly definitionId?: string;
  readonly tags: readonly string[];
  readonly tile: BehaviourTileSnapshot;
  readonly bronze: bigint;
  readonly vitals: BehaviourVitalsSnapshot;
  readonly inventory: readonly BehaviourItemSnapshot[];
  readonly worldRoles: readonly string[];
  readonly homesteadRoles: Readonly<Record<string, string>>;
  readonly questStates: Readonly<Record<string, string>>;
  readonly statistics: Readonly<Record<string, bigint>>;
  readonly skillRanks: Readonly<Record<string, number>>;
  /** Full content ids (`recipe:*` / `process:*`) already known by this actor. */
  readonly knownRecipeIds?: readonly string[];
  readonly mountedEntityId?: string;
  readonly carriedEntityId?: string;
}

export interface BehaviourObjectSnapshot {
  readonly entityType: 'object';
  readonly id: string;
  readonly definitionId: string;
  readonly tags: readonly string[];
  readonly tile: BehaviourTileSnapshot;
  readonly state: Readonly<Record<string, StateValue>>;
  readonly containerId?: string;
  readonly ownerId?: string;
}

export interface BehaviourNpcSnapshot {
  readonly entityType: 'npc';
  readonly id: string;
  readonly definitionId: string;
  readonly tags: readonly string[];
  readonly tile: BehaviourTileSnapshot;
  readonly state: Readonly<Record<string, StateValue>>;
}

export type BehaviourTargetSnapshot =
  | BehaviourObjectSnapshot
  | BehaviourNpcSnapshot
  | BehaviourTileSnapshot;

export interface BehaviourSpaceSnapshot {
  readonly id: string;
  readonly kind: string;
  readonly tags: readonly string[];
  readonly ownerId?: string;
  readonly homesteadId?: string;
}

export interface BehaviourCalendarSnapshot {
  readonly minuteOfDay: number;
  readonly season: string;
}

export interface BehaviourRegistryDefinitionSnapshot {
  readonly id: string;
  readonly kind: string;
  readonly tags: readonly string[];
  readonly payload?: ReadonlyJsonValue;
}

/** The serialisable subset of the content registry exposed to pure handlers. */
export interface BehaviourRegistrySnapshot {
  readonly engineVersion: number;
  readonly revision: bigint;
  readonly contentHash: string;
  readonly definitions: Readonly<Record<string, BehaviourRegistryDefinitionSnapshot>>;
}

/**
 * Immutable authoritative input to every handler. Event-specific values are
 * optional because system events such as spawn and timers need no player.
 */
export interface ReadOnlySnapshot {
  readonly tick: bigint;
  readonly registry: BehaviourRegistrySnapshot;
  readonly space: BehaviourSpaceSnapshot;
  readonly calendar: BehaviourCalendarSnapshot;
  readonly actor?: BehaviourActorSnapshot;
  readonly target?: BehaviourTargetSnapshot;
  readonly selectedItem?: BehaviourItemSnapshot;
  readonly container?: BehaviourContainerSnapshot;
  readonly nearbyObjects: readonly BehaviourObjectSnapshot[];
}

export type SnapshotTickInput = bigint | number | string;

export type ReadOnlySnapshotInput = Omit<ReadOnlySnapshot, 'tick' | 'registry'> & {
  readonly tick: SnapshotTickInput;
  readonly registry: Omit<BehaviourRegistrySnapshot, 'revision'> & {
    readonly revision: SnapshotTickInput;
  };
};

/** Normalises JSON-safe decimal ticks without allowing lossy number coercion. */
export function normalizeSnapshotTick(value: SnapshotTickInput): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error('behaviour snapshot tick must be non-negative');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('behaviour snapshot tick number must be a non-negative safe integer');
    }
    return BigInt(value);
  }
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error('behaviour snapshot tick string must be an unsigned decimal integer');
  }
  return BigInt(value);
}

/** Creates the canonical runtime snapshot from either runtime or JSON ticks. */
export function createReadOnlySnapshot(input: ReadOnlySnapshotInput): ReadOnlySnapshot {
  return {
    ...input,
    tick: normalizeSnapshotTick(input.tick),
    registry: {
      ...input.registry,
      revision: normalizeSnapshotTick(input.registry.revision),
    },
  };
}
