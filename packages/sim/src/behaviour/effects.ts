export const CURRENT_BEHAVIOUR_ENGINE_VERSION = 1 as const;

export type StateValue = boolean | number | string;

export interface ItemMatch {
  readonly kind?: string;
  readonly tag?: string;
  readonly durabilityAtLeast?: number;
  readonly durabilityAtMost?: number;
}

export interface ItemAmount extends ItemMatch {
  readonly count: number;
}

export interface TilePosition {
  readonly spaceId?: string;
  readonly x: number;
  readonly y: number;
}

export interface ValueThreshold {
  readonly atLeast?: number;
  readonly atMost?: number;
}

export type Condition =
  | { readonly reach: 'object' | 'tile' | 'npc' }
  | { readonly state: string; readonly equals: StateValue }
  | { readonly selectedItem: ItemMatch }
  | { readonly hasItem: ItemAmount }
  | { readonly role: { readonly scope: 'world' | 'homestead'; readonly name: string } }
  | { readonly space: { readonly kind?: string; readonly id?: string } }
  | { readonly questState: { readonly questId: string; readonly state: string } }
  | { readonly statisticAtLeast: { readonly kind: string; readonly value: bigint | number } }
  | { readonly skillRank: { readonly skillId: string; readonly atLeast: number } }
  | { readonly timeOfDay: { readonly fromMinute: number; readonly toMinute: number } }
  | { readonly season: string | readonly string[] }
  | { readonly mounted: boolean }
  | { readonly vitals: { readonly hunger?: ValueThreshold; readonly vigour?: ValueThreshold } }
  | {
    readonly random: {
      readonly numerator: number;
      readonly denominator: number;
      readonly salt?: string;
    };
  }
  | { readonly slotEmpty: { readonly containerId?: string; readonly slot: number } }
  | { readonly slotHas: { readonly containerId?: string; readonly slot: number; readonly item: ItemMatch } }
  | { readonly containerHasSpace: { readonly containerId?: string; readonly item?: ItemMatch } }
  | { readonly nearbyObject: { readonly tag: string; readonly withinTiles: number } }
  | { readonly notCarrying: true };

export const CONDITION_OPCODES = [
  { kind: 'reach', engineVersion: 1 },
  { kind: 'state', engineVersion: 1 },
  { kind: 'selectedItem', engineVersion: 1 },
  { kind: 'hasItem', engineVersion: 1 },
  { kind: 'role', engineVersion: 1 },
  { kind: 'space', engineVersion: 1 },
  { kind: 'questState', engineVersion: 1 },
  { kind: 'statisticAtLeast', engineVersion: 1 },
  { kind: 'skillRank', engineVersion: 1 },
  { kind: 'timeOfDay', engineVersion: 1 },
  { kind: 'season', engineVersion: 1 },
  { kind: 'mounted', engineVersion: 1 },
  { kind: 'vitals', engineVersion: 1 },
  { kind: 'random', engineVersion: 1 },
  { kind: 'slotEmpty', engineVersion: 1 },
  { kind: 'slotHas', engineVersion: 1 },
  { kind: 'containerHasSpace', engineVersion: 1 },
  { kind: 'nearbyObject', engineVersion: 1 },
  { kind: 'notCarrying', engineVersion: 1 },
] as const;

export type ConditionKind = typeof CONDITION_OPCODES[number]['kind'];

/** State-name to value map; authored JSON commonly changes one key at a time. */
export type StateChange = Readonly<Record<string, StateValue>>;

export interface StateIncrement {
  readonly state: string;
  readonly amount: number;
}

export interface WorldItemSpawn extends ItemAmount {
  readonly at?: TilePosition;
}

export interface ObjectSpawn {
  readonly definitionId: string;
  readonly at?: TilePosition;
  readonly state?: Readonly<Record<string, StateValue>>;
}

export interface NpcSpawn {
  readonly definitionId: string;
  readonly at?: TilePosition;
}

export interface TeleportDestination {
  readonly spaceId: string;
  readonly x?: number;
  readonly y?: number;
  readonly portalId?: string;
}

export interface QuestAction {
  readonly questId: string;
  readonly action: 'accept' | 'progress' | 'turn_in';
  readonly amount?: number;
  readonly objectiveId?: string;
}

export interface LightChange {
  readonly enabled: boolean;
  readonly color?: readonly [number, number, number];
  readonly radiusTiles?: number;
}

export interface TimerSchedule {
  readonly timerId: string;
  readonly afterTicks: number;
}

export type Effect =
  | { readonly setState: StateChange }
  | { readonly toggleState: string }
  | { readonly incrementState: StateIncrement }
  | { readonly giveItem: ItemAmount }
  | { readonly consumeSelected: number }
  | { readonly consumeItem: ItemAmount }
  | { readonly damageSelected: number }
  | { readonly spawnWorldItem: WorldItemSpawn }
  | { readonly pickupAsItem: string }
  | { readonly openFrame: string }
  | { readonly closeFrame: true }
  | { readonly startProcess: string }
  | { readonly settleProcess: true }
  | { readonly claimProcessJob: { readonly action: 'collect' | 'cancel' } }
  | { readonly sealContainer: true }
  | { readonly spawnObject: ObjectSpawn }
  | { readonly despawnObject: { readonly objectId?: string } }
  | { readonly spawnNpc: NpcSpawn }
  | { readonly teleport: TeleportDestination }
  | { readonly usePortal: string }
  | { readonly grantBronze: number }
  | { readonly chargeBronze: number }
  | { readonly grantExperience: { readonly skillId?: string; readonly amount: number } }
  | { readonly applyEffect: { readonly effectId: string; readonly stacks?: number } }
  | { readonly learnRecipes: readonly string[] }
  | {
    readonly statistic:
      | string
      | { readonly kind: string; readonly subject?: string; readonly delta?: bigint | number };
  }
  | { readonly questAction: QuestAction }
  | { readonly say: string }
  | { readonly bark: string }
  | { readonly sfx: string }
  | { readonly animation: string }
  | { readonly setCollision: boolean }
  | { readonly setLight: LightChange }
  | { readonly scheduleTimer: TimerSchedule }
  | { readonly carry: { readonly objectId?: string } }
  | { readonly placeCarried: { readonly at?: TilePosition } }
  | { readonly plantSeed: TilePosition }
  | {
    readonly farmTool: {
      readonly action: 'use' | 'restore';
      readonly at: TilePosition;
    };
  }
  | {
    readonly worldTool: {
      readonly action: 'whiff' | 'target' | 'digCellar';
      readonly at?: TilePosition;
    };
  }
  | { readonly meleeAttack: { readonly weapon: string } }
  | {
    readonly fishing:
      | { readonly action: 'cast'; readonly poolId: string; readonly at: TilePosition }
      | { readonly action: 'reel' };
  }
  | {
    readonly bowAction:
      | { readonly phase: 'begin' }
      | { readonly phase: 'cancel'; readonly chargeMs: number }
      | {
        readonly phase: 'fire';
        readonly aimX: number;
        readonly aimY: number;
        readonly chargeMs: number;
      };
  }
  | { readonly mount: { readonly npcId?: string } }
  | { readonly dismount: true }
  | { readonly foundHomestead: { readonly name?: string; readonly at?: TilePosition } }
  | { readonly rollLoot: { readonly lootId: string; readonly rolls?: number } }
  | { readonly fail: string };

export const EFFECT_OPCODES = [
  { kind: 'setState', engineVersion: 1 },
  { kind: 'toggleState', engineVersion: 1 },
  { kind: 'incrementState', engineVersion: 1 },
  { kind: 'giveItem', engineVersion: 1 },
  { kind: 'consumeSelected', engineVersion: 1 },
  { kind: 'consumeItem', engineVersion: 1 },
  { kind: 'damageSelected', engineVersion: 1 },
  { kind: 'spawnWorldItem', engineVersion: 1 },
  { kind: 'pickupAsItem', engineVersion: 1 },
  { kind: 'openFrame', engineVersion: 1 },
  { kind: 'closeFrame', engineVersion: 1 },
  { kind: 'startProcess', engineVersion: 1 },
  { kind: 'settleProcess', engineVersion: 1 },
  { kind: 'claimProcessJob', engineVersion: 1 },
  { kind: 'sealContainer', engineVersion: 1 },
  { kind: 'spawnObject', engineVersion: 1 },
  { kind: 'despawnObject', engineVersion: 1 },
  { kind: 'spawnNpc', engineVersion: 1 },
  { kind: 'teleport', engineVersion: 1 },
  { kind: 'usePortal', engineVersion: 1 },
  { kind: 'grantBronze', engineVersion: 1 },
  { kind: 'chargeBronze', engineVersion: 1 },
  { kind: 'grantExperience', engineVersion: 1 },
  { kind: 'applyEffect', engineVersion: 1 },
  { kind: 'learnRecipes', engineVersion: 1 },
  { kind: 'statistic', engineVersion: 1 },
  { kind: 'questAction', engineVersion: 1 },
  { kind: 'say', engineVersion: 1 },
  { kind: 'bark', engineVersion: 1 },
  { kind: 'sfx', engineVersion: 1 },
  { kind: 'animation', engineVersion: 1 },
  { kind: 'setCollision', engineVersion: 1 },
  { kind: 'setLight', engineVersion: 1 },
  { kind: 'scheduleTimer', engineVersion: 1 },
  { kind: 'carry', engineVersion: 1 },
  { kind: 'placeCarried', engineVersion: 1 },
  { kind: 'plantSeed', engineVersion: 1 },
  { kind: 'farmTool', engineVersion: 1 },
  { kind: 'worldTool', engineVersion: 1 },
  { kind: 'meleeAttack', engineVersion: 1 },
  { kind: 'fishing', engineVersion: 1 },
  { kind: 'bowAction', engineVersion: 1 },
  { kind: 'mount', engineVersion: 1 },
  { kind: 'dismount', engineVersion: 1 },
  { kind: 'foundHomestead', engineVersion: 1 },
  { kind: 'rollLoot', engineVersion: 1 },
  { kind: 'fail', engineVersion: 1 },
] as const;

export type BehaviourEffectKind = typeof EFFECT_OPCODES[number]['kind'];

function opcodeKind<TKind extends string>(
  value: unknown,
  opcodes: readonly { readonly kind: TKind; readonly engineVersion: number }[],
): TKind | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, unknown>>;
  const matches = opcodes.filter(({ kind }) => Object.prototype.hasOwnProperty.call(record, kind));
  return matches.length === 1 ? matches[0]?.kind ?? null : null;
}

export function conditionKind(value: unknown): ConditionKind | null {
  return opcodeKind(value, CONDITION_OPCODES);
}

export function effectKind(value: unknown): BehaviourEffectKind | null {
  return opcodeKind(value, EFFECT_OPCODES);
}

export function conditionEngineVersion(kind: ConditionKind): number {
  return CONDITION_OPCODES.find((opcode) => opcode.kind === kind)?.engineVersion
    ?? CURRENT_BEHAVIOUR_ENGINE_VERSION;
}

export function effectEngineVersion(kind: BehaviourEffectKind): number {
  return EFFECT_OPCODES.find((opcode) => opcode.kind === kind)?.engineVersion
    ?? CURRENT_BEHAVIOUR_ENGINE_VERSION;
}

export function conditionSupportedByEngine(value: unknown, engineVersion: number): boolean {
  const kind = conditionKind(value);
  return kind !== null && conditionEngineVersion(kind) <= engineVersion;
}

export function effectSupportedByEngine(value: unknown, engineVersion: number): boolean {
  const kind = effectKind(value);
  return kind !== null && effectEngineVersion(kind) <= engineVersion;
}
