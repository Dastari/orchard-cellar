/** The fixed Tier-B lifecycle surface understood by the behaviour engine. */
export const LIFECYCLE_EVENT_TYPES = [
  'use',
  'frameAction',
  'secondary',
  'equipmentUse',
  'worldItemUse',
  'useWith',
  'useAt',
  'aimedUse',
  'place',
  'pickup',
  'break',
  'slotChanged',
  'processComplete',
  'timer',
  'walkOnto',
  'enterSpace',
  'leaveSpace',
  'spawn',
  'despawn',
  'tick',
  'dialogueChoice',
  'questState',
  'statistic',
] as const;

export type LifecycleEventType = typeof LIFECYCLE_EVENT_TYPES[number];

/** Events that may be attached directly to an authored interaction graph. */
export const DATA_GRAPH_EVENT_TYPES = [
  'use',
  'secondary',
  'useWith',
  'place',
  'walkOnto',
  'tick',
  'break',
  'timer',
] as const satisfies readonly LifecycleEventType[];

export type DataGraphEventType = typeof DATA_GRAPH_EVENT_TYPES[number];
export type InteractionVerb =
  | 'use'
  | 'secondary'
  | 'use_with'
  | 'place'
  | 'walk_onto'
  | 'tick'
  | 'break'
  | 'timer';

export interface EntityRef {
  readonly entityType: 'object' | 'npc' | 'player';
  readonly id: string;
  readonly definitionId?: string;
}

export interface ObjectRef extends EntityRef {
  readonly entityType: 'object';
}

export interface NpcRef extends EntityRef {
  readonly entityType: 'npc';
}

export interface ActorRef extends EntityRef {
  readonly entityType: 'player' | 'npc';
}

export interface TileRef {
  readonly spaceId: string;
  readonly x: number;
  readonly y: number;
}

export interface SpaceRef {
  readonly id: string;
  readonly kind?: string;
}

export interface ItemRef {
  readonly kind: string;
  readonly instanceId?: string;
  readonly containerId?: string;
  readonly slot?: number;
}

export interface ContainerRef {
  readonly id: string;
  readonly entityId?: string;
}

export type InteractionTargetRef = ObjectRef | NpcRef | TileRef;
export type SpawnableRef = ObjectRef | NpcRef;
export type PlaceableRef = ItemRef | ObjectRef;

export interface UseEvent {
  readonly type: 'use';
  readonly actor: ActorRef;
  readonly target: ObjectRef | NpcRef;
}

/** A reviewed command on the caller's authoritative active frame. */
export interface FrameActionEvent {
  readonly type: 'frameAction';
  readonly actor: ActorRef;
  readonly frameId: string;
  readonly actionId: string;
  readonly target?: ObjectRef;
}

export interface SecondaryEvent {
  readonly type: 'secondary';
  readonly actor: ActorRef;
  readonly selectedItem: ItemRef;
  readonly target?: InteractionTargetRef;
}

/** Direct invocation of an item in an active equipment slot. This is distinct
 * from the selected hotbar item and lets authority resolve the real slot row. */
export interface EquipmentUseEvent {
  readonly type: 'equipmentUse';
  readonly actor: ActorRef;
  readonly equipmentItem: ItemRef;
  readonly equipmentSlot: number;
}

/** Direct invocation of an item entity lying in the world. The object target
 * identifies the spatial entity whose state authoritative effects may mutate;
 * worldItem identifies the item definition that owns the capability. */
export interface WorldItemUseEvent {
  readonly type: 'worldItemUse';
  readonly actor: ActorRef;
  readonly worldItem: ItemRef;
  readonly target: ObjectRef;
}

export interface UseWithEvent {
  readonly type: 'useWith';
  readonly actor: ActorRef;
  readonly selectedItem: ItemRef;
  readonly target: InteractionTargetRef;
}

/** Selected-item use at a world tile. The opaque target id preserves the
 * caller's observed entity identity while the authority adapter resolves and
 * validates the corresponding row. */
export interface UseAtEvent {
  readonly type: 'useAt';
  readonly actor: ActorRef;
  readonly selectedItem: ItemRef;
  readonly tile: TileRef;
  readonly actionId: string;
  readonly targetId: string;
}

interface AimedUseEventBase {
  readonly type: 'aimedUse';
  readonly actor: ActorRef;
  readonly selectedItem: ItemRef;
}

/** A phased pointer-driven item invocation. Aim and client-held duration are
 * requests only; authority bounds them against the durable charge row. */
export type AimedUseEvent =
  | (AimedUseEventBase & { readonly phase: 'begin' })
  | (AimedUseEventBase & { readonly phase: 'cancel'; readonly chargeMs: number })
  | (AimedUseEventBase & {
    readonly phase: 'fire';
    readonly aimX: number;
    readonly aimY: number;
    readonly chargeMs: number;
  });

export interface PlaceEvent {
  readonly type: 'place';
  readonly actor: ActorRef;
  readonly tile: TileRef;
  readonly subject: PlaceableRef;
  /** Optional authored action variant selected by the client (for example,
   * restoring tilled soil instead of using the selected farm tool normally). */
  readonly actionId?: string;
}

export interface PickupEvent {
  readonly type: 'pickup';
  readonly actor: ActorRef;
  readonly tile: TileRef;
  readonly subject: PlaceableRef;
}

export interface BreakEvent {
  readonly type: 'break';
  readonly actor: ActorRef;
  readonly object: ObjectRef;
  readonly tool: ItemRef;
}

export interface SlotChangedEvent {
  readonly type: 'slotChanged';
  readonly container: ContainerRef;
  readonly slot: number;
  readonly before: ItemRef | null;
  readonly after: ItemRef | null;
  readonly actor?: ActorRef;
}

export interface ProcessCompleteEvent {
  readonly type: 'processComplete';
  readonly object: ObjectRef;
  readonly unitsSettled: number;
}

export interface TimerEvent {
  readonly type: 'timer';
  readonly object: ObjectRef;
  readonly timerId: string;
}

export interface WalkOntoEvent {
  readonly type: 'walkOnto';
  readonly actor: ActorRef;
  readonly tile: TileRef;
}

export interface EnterSpaceEvent {
  readonly type: 'enterSpace';
  readonly actor: ActorRef;
  readonly space: SpaceRef;
}

export interface LeaveSpaceEvent {
  readonly type: 'leaveSpace';
  readonly actor: ActorRef;
  readonly space: SpaceRef;
}

export interface SpawnEvent {
  readonly type: 'spawn';
  readonly subject: SpawnableRef;
}

export interface DespawnEvent {
  readonly type: 'despawn';
  readonly subject: SpawnableRef;
}

export interface TickEvent {
  readonly type: 'tick';
  readonly subject: SpawnableRef;
}

export interface DialogueChoiceEvent {
  readonly type: 'dialogueChoice';
  readonly actor: ActorRef;
  readonly npc: NpcRef;
  readonly nodeId: string;
  readonly choiceId: string;
}

export interface QuestStateEvent {
  readonly type: 'questState';
  readonly actor: ActorRef;
  readonly questId: string;
  readonly from: string;
  readonly to: string;
}

export interface StatisticEvent {
  readonly type: 'statistic';
  readonly actor: ActorRef;
  readonly kind: string;
  readonly subject?: string;
  readonly delta: bigint;
}

export interface LifecycleEventByType {
  readonly use: UseEvent;
  readonly frameAction: FrameActionEvent;
  readonly secondary: SecondaryEvent;
  readonly equipmentUse: EquipmentUseEvent;
  readonly worldItemUse: WorldItemUseEvent;
  readonly useWith: UseWithEvent;
  readonly useAt: UseAtEvent;
  readonly aimedUse: AimedUseEvent;
  readonly place: PlaceEvent;
  readonly pickup: PickupEvent;
  readonly break: BreakEvent;
  readonly slotChanged: SlotChangedEvent;
  readonly processComplete: ProcessCompleteEvent;
  readonly timer: TimerEvent;
  readonly walkOnto: WalkOntoEvent;
  readonly enterSpace: EnterSpaceEvent;
  readonly leaveSpace: LeaveSpaceEvent;
  readonly spawn: SpawnEvent;
  readonly despawn: DespawnEvent;
  readonly tick: TickEvent;
  readonly dialogueChoice: DialogueChoiceEvent;
  readonly questState: QuestStateEvent;
  readonly statistic: StatisticEvent;
}

export type LifecycleEvent = LifecycleEventByType[LifecycleEventType];

const LIFECYCLE_EVENT_TYPE_SET: ReadonlySet<string> = new Set(LIFECYCLE_EVENT_TYPES);
const DATA_GRAPH_EVENT_TYPE_SET: ReadonlySet<string> = new Set(DATA_GRAPH_EVENT_TYPES);

export function isLifecycleEventType(value: unknown): value is LifecycleEventType {
  return typeof value === 'string' && LIFECYCLE_EVENT_TYPE_SET.has(value);
}

export function isDataGraphEventType(value: LifecycleEventType): value is DataGraphEventType {
  return DATA_GRAPH_EVENT_TYPE_SET.has(value);
}

/** Converts the runtime camel-case event names to their authored JSON verbs. */
export function interactionVerbForEventType(type: LifecycleEventType): InteractionVerb | null {
  if (!isDataGraphEventType(type)) return null;
  if (type === 'useWith') return 'use_with';
  if (type === 'walkOnto') return 'walk_onto';
  return type;
}
