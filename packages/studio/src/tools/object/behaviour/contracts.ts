import type {
  Condition,
  ContentValidationReport,
  Effect,
  ObjectContentDefinition,
} from '@orchard/sim';

export type ObjectBehaviourAccess = 'anonymous' | 'read_only' | 'write';

export interface ObjectBehaviourPublishRequest {
  readonly packId: 'live';
  readonly expectedRevision: bigint;
  readonly clientMutationId: string;
  readonly upserts: string;
  readonly deletes: string;
  readonly note: string;
}

export interface ObjectBehaviourPublishAdapter {
  publishContentChangeSet(request: ObjectBehaviourPublishRequest): Promise<void>;
}

export type ObjectBehaviourPublishAdapterFactory = () => ObjectBehaviourPublishAdapter;

export type BehaviourGraphNode =
  | {
    readonly id: string;
    readonly interactionId: string;
    readonly kind: 'trigger';
    readonly label: string;
    readonly order: 0;
  }
  | {
    readonly id: string;
    readonly interactionId: string;
    readonly kind: 'condition';
    readonly label: string;
    readonly order: number;
    readonly payload: Condition;
  }
  | {
    readonly id: string;
    readonly interactionId: string;
    readonly kind: 'effect';
    readonly label: string;
    readonly order: number;
    readonly payload: Effect;
  };

export interface ObjectBehaviourPreview {
  readonly interactionId: string;
  readonly available: boolean;
  readonly prompt: string | null;
  readonly effects: readonly Effect[];
  readonly blocked?: string;
}

export interface ObjectBehaviourSnapshot {
  readonly access: ObjectBehaviourAccess;
  readonly definition: ObjectContentDefinition;
  readonly nodes: readonly BehaviourGraphNode[];
  readonly validation: ContentValidationReport;
  readonly dirty: boolean;
  readonly engineGate: 'compatible' | 'requires_update';
  readonly canPublish: boolean;
}

/** S2 can attach this contribution to its Object Studio without importing a
 * shell contract into the isolated graph model. */
export const OBJECT_BEHAVIOUR_REGISTRATION = Object.freeze({
  id: 'object.behaviour',
  parentToolId: 'object',
  tab: Object.freeze({ id: 'behaviour', label: 'Behaviour' }),
  docks: Object.freeze(['behaviour', 'inspector', 'preview', 'validation'] as const),
  commands: Object.freeze([
    { id: 'object.behaviour.add-interaction', label: 'Add interaction' },
    { id: 'object.behaviour.add-condition', label: 'Add condition node' },
    { id: 'object.behaviour.add-effect', label: 'Add effect node' },
    { id: 'object.behaviour.preview', label: 'Preview interaction effects' },
  ] as const),
});
