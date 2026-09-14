import {
  CURRENT_BEHAVIOUR_ENGINE_VERSION,
  bootstrapContentDefinitions,
  buildContentRegistry,
  compileDataGraphInteraction,
  conditionKind,
  contentDefinitionsHash,
  effectKind,
  interactionPrompt,
  parseDataGraphCondition,
  parseDataGraphEffect,
  parseObjectDefinition,
  type ContentValidationReport,
  type InteractionDefinition,
  type LifecycleEvent,
  type ObjectContentDefinition,
  type ReadOnlySnapshot,
  type SupportedContentDefinition,
} from '@orchard/sim';
import type {
  BehaviourGraphNode,
  ObjectBehaviourAccess,
  ObjectBehaviourPreview,
  ObjectBehaviourPublishAdapter,
  ObjectBehaviourPublishAdapterFactory,
  ObjectBehaviourPublishRequest,
  ObjectBehaviourSnapshot,
} from './contracts.js';

const MUTATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/u;
const MAX_NOTE_CHARACTERS = 500;

export interface CreateObjectBehaviourModelOptions {
  readonly definition: string | unknown;
  readonly access: ObjectBehaviourAccess;
  readonly baseRevision?: bigint;
  readonly headEngineVersion?: number;
  readonly registryDefinitions?: readonly SupportedContentDefinition[];
  readonly createPublishAdapter?: ObjectBehaviourPublishAdapterFactory;
}

function replaceDefinition(
  definitions: readonly SupportedContentDefinition[],
  object: ObjectContentDefinition,
): readonly SupportedContentDefinition[] {
  return [
    ...definitions.filter((definition) => definition.id !== object.id),
    object,
  ];
}

function rows(definitions: readonly SupportedContentDefinition[]) {
  return definitions.map((definition) => ({ id: definition.id, kind: definition.kind, json: definition }));
}

function interactionLabel(interaction: InteractionDefinition): string {
  return `${interaction.verb} · ${interaction.id}`;
}

function graphNodes(definition: ObjectContentDefinition): readonly BehaviourGraphNode[] {
  return Object.freeze((definition.components.interactions ?? []).flatMap((interaction) => [
    {
      id: `${interaction.id}/trigger`, interactionId: interaction.id,
      kind: 'trigger' as const, label: interactionLabel(interaction), order: 0 as const,
    },
    ...interaction.conditions.map((condition, index) => ({
      id: `${interaction.id}/condition/${index}`, interactionId: interaction.id,
      kind: 'condition' as const, label: conditionKind(condition) ?? 'invalid', order: index + 1, payload: condition,
    })),
    ...interaction.effects.map((effect, index) => ({
      id: `${interaction.id}/effect/${index}`, interactionId: interaction.id,
      kind: 'effect' as const, label: effectKind(effect) ?? 'invalid',
      order: interaction.conditions.length + index + 1, payload: effect,
    })),
  ]));
}

function validationFor(
  definitions: readonly SupportedContentDefinition[],
  object: ObjectContentDefinition,
): ContentValidationReport {
  return buildContentRegistry(rows(replaceDefinition(definitions, object))).report;
}

function parsedInteractions(definition: ObjectContentDefinition): readonly InteractionDefinition[] {
  return definition.components.interactions ?? [];
}

export class ObjectBehaviourModel {
  readonly #access: ObjectBehaviourAccess;
  readonly #adapter: ObjectBehaviourPublishAdapter | null;
  readonly #baseRevision: bigint;
  readonly #headEngineVersion: number;
  readonly #registryDefinitions: readonly SupportedContentDefinition[];
  readonly #initialHash: string;
  #definition: ObjectContentDefinition;

  constructor(options: CreateObjectBehaviourModelOptions) {
    this.#definition = parseObjectDefinition(options.definition);
    this.#access = options.access;
    this.#baseRevision = options.baseRevision ?? 0n;
    this.#headEngineVersion = options.headEngineVersion ?? CURRENT_BEHAVIOUR_ENGINE_VERSION;
    this.#registryDefinitions = options.registryDefinitions ?? bootstrapContentDefinitions();
    this.#initialHash = contentDefinitionsHash([this.#definition]);
    this.#adapter = options.access === 'write' && options.createPublishAdapter !== undefined
      ? options.createPublishAdapter()
      : null;
  }

  #assertEditable(): void {
    if (this.#access === 'read_only') throw new Error('object_behaviour_read_only');
  }

  #setInteractions(interactions: readonly InteractionDefinition[]): ObjectBehaviourSnapshot {
    this.#definition = parseObjectDefinition({
      ...this.#definition,
      components: { ...this.#definition.components, interactions },
    });
    return this.snapshot();
  }

  #interactionIndex(id: string): number {
    const index = parsedInteractions(this.#definition).findIndex((interaction) => interaction.id === id);
    if (index < 0) throw new Error(`object_interaction_not_found:${id}`);
    return index;
  }

  snapshot(): ObjectBehaviourSnapshot {
    const validation = validationFor(this.#registryDefinitions, this.#definition);
    const dirty = contentDefinitionsHash([this.#definition]) !== this.#initialHash;
    const engineGate = this.#headEngineVersion === CURRENT_BEHAVIOUR_ENGINE_VERSION
      ? 'compatible' : 'requires_update';
    return Object.freeze({
      access: this.#access,
      definition: this.#definition,
      nodes: graphNodes(this.#definition),
      validation,
      dirty,
      engineGate,
      canPublish: this.#access === 'write' && this.#adapter !== null && dirty
        && validation.valid && engineGate === 'compatible',
    });
  }

  replaceDefinition(value: string | unknown): ObjectBehaviourSnapshot {
    this.#assertEditable();
    const next = parseObjectDefinition(value);
    if (next.id !== this.#definition.id) throw new Error('object_definition_identity_change');
    this.#definition = next;
    return this.snapshot();
  }

  addInteraction(value: unknown): ObjectBehaviourSnapshot {
    this.#assertEditable();
    const probe = parseObjectDefinition({
      ...this.#definition,
      components: { ...this.#definition.components, interactions: [value] },
    });
    return this.#setInteractions([
      ...parsedInteractions(this.#definition),
      ...parsedInteractions(probe),
    ]);
  }

  updateInteraction(
    id: string,
    patch: Partial<Pick<InteractionDefinition, 'id' | 'verb' | 'with' | 'prompt' | 'priority'>>,
  ): ObjectBehaviourSnapshot {
    this.#assertEditable();
    const interactions = [...parsedInteractions(this.#definition)];
    const index = this.#interactionIndex(id);
    interactions[index] = { ...interactions[index]!, ...patch };
    return this.#setInteractions(interactions);
  }

  removeInteraction(id: string): ObjectBehaviourSnapshot {
    this.#assertEditable();
    const index = this.#interactionIndex(id);
    return this.#setInteractions(parsedInteractions(this.#definition).filter((_, candidate) => candidate !== index));
  }

  insertNode(
    interactionId: string,
    kind: 'condition' | 'effect',
    index: number,
    payload: unknown,
  ): ObjectBehaviourSnapshot {
    this.#assertEditable();
    const interactions = [...parsedInteractions(this.#definition)];
    const interactionIndex = this.#interactionIndex(interactionId);
    const interaction = interactions[interactionIndex]!;
    if (kind === 'condition') {
      const values = [...interaction.conditions];
      if (!Number.isSafeInteger(index) || index < 0 || index > values.length) throw new Error('invalid_graph_node_index');
      values.splice(index, 0, parseDataGraphCondition(payload));
      interactions[interactionIndex] = { ...interaction, conditions: values };
    } else {
      const values = [...interaction.effects];
      if (!Number.isSafeInteger(index) || index < 0 || index > values.length) throw new Error('invalid_graph_node_index');
      values.splice(index, 0, parseDataGraphEffect(payload));
      interactions[interactionIndex] = { ...interaction, effects: values };
    }
    return this.#setInteractions(interactions);
  }

  updateNode(nodeId: string, payload: unknown): ObjectBehaviourSnapshot {
    this.#assertEditable();
    const node = graphNodes(this.#definition).find((candidate) => candidate.id === nodeId);
    if (node === undefined || node.kind === 'trigger') throw new Error(`object_graph_node_not_found:${nodeId}`);
    const interactions = [...parsedInteractions(this.#definition)];
    const interactionIndex = this.#interactionIndex(node.interactionId);
    const interaction = interactions[interactionIndex]!;
    if (node.kind === 'condition') {
      const conditions = [...interaction.conditions];
      conditions[node.order - 1] = parseDataGraphCondition(payload);
      interactions[interactionIndex] = { ...interaction, conditions };
    } else {
      const effects = [...interaction.effects];
      effects[node.order - interaction.conditions.length - 1] = parseDataGraphEffect(payload);
      interactions[interactionIndex] = { ...interaction, effects };
    }
    return this.#setInteractions(interactions);
  }

  removeNode(nodeId: string): ObjectBehaviourSnapshot {
    this.#assertEditable();
    const node = graphNodes(this.#definition).find((candidate) => candidate.id === nodeId);
    if (node === undefined || node.kind === 'trigger') throw new Error(`object_graph_node_not_found:${nodeId}`);
    const interactions = [...parsedInteractions(this.#definition)];
    const interactionIndex = this.#interactionIndex(node.interactionId);
    const interaction = interactions[interactionIndex]!;
    if (node.kind === 'condition') {
      interactions[interactionIndex] = {
        ...interaction, conditions: interaction.conditions.filter((_, index) => index !== node.order - 1),
      };
    } else {
      const effectIndex = node.order - interaction.conditions.length - 1;
      interactions[interactionIndex] = {
        ...interaction, effects: interaction.effects.filter((_, index) => index !== effectIndex),
      };
    }
    return this.#setInteractions(interactions);
  }

  moveNode(nodeId: string, nextIndex: number): ObjectBehaviourSnapshot {
    this.#assertEditable();
    const node = graphNodes(this.#definition).find((candidate) => candidate.id === nodeId);
    if (node === undefined || node.kind === 'trigger') throw new Error(`object_graph_node_not_found:${nodeId}`);
    const interactions = [...parsedInteractions(this.#definition)];
    const interactionIndex = this.#interactionIndex(node.interactionId);
    const interaction = interactions[interactionIndex]!;
    if (node.kind === 'condition') {
      const values = [...interaction.conditions];
      if (!Number.isSafeInteger(nextIndex) || nextIndex < 0 || nextIndex >= values.length) {
        throw new Error('invalid_graph_node_index');
      }
      const [moved] = values.splice(node.order - 1, 1);
      values.splice(nextIndex, 0, moved!);
      interactions[interactionIndex] = { ...interaction, conditions: values };
    } else {
      const values = [...interaction.effects];
      if (!Number.isSafeInteger(nextIndex) || nextIndex < 0 || nextIndex >= values.length) {
        throw new Error('invalid_graph_node_index');
      }
      const currentIndex = node.order - interaction.conditions.length - 1;
      const [moved] = values.splice(currentIndex, 1);
      values.splice(nextIndex, 0, moved!);
      interactions[interactionIndex] = { ...interaction, effects: values };
    }
    return this.#setInteractions(interactions);
  }

  preview(
    interactionId: string,
    event: LifecycleEvent,
    view: ReadOnlySnapshot,
  ): ObjectBehaviourPreview {
    const interaction = parsedInteractions(this.#definition)[this.#interactionIndex(interactionId)]!;
    const registration = compileDataGraphInteraction(this.#definition.id, interaction, this.#headEngineVersion);
    if (registration.eventType !== event.type) throw new Error('object_preview_event_mismatch');
    const result = registration.handler(event as never, view);
    if ('blocked' in result) return Object.freeze({
      interactionId, available: false, prompt: interactionPrompt(interaction, view), effects: [], blocked: result.blocked,
    });
    return Object.freeze({
      interactionId,
      available: result.effects.length > 0,
      prompt: interactionPrompt(interaction, view),
      effects: result.effects,
    });
  }

  buildPublishRequest(clientMutationId: string, note: string): ObjectBehaviourPublishRequest {
    if (!MUTATION_ID_PATTERN.test(clientMutationId)) throw new Error('invalid_content_mutation_id');
    if (note.trim().length > MAX_NOTE_CHARACTERS) throw new Error('invalid_content_note');
    const state = this.snapshot();
    if (state.engineGate !== 'compatible') throw new Error('content_engine_update_required');
    if (!state.dirty) throw new Error('content_change_set_empty');
    if (!state.validation.valid) throw new Error(`content_validation_failed:${state.validation.errors[0]?.code ?? 'unknown'}`);
    return Object.freeze({
      packId: 'live', expectedRevision: this.#baseRevision, clientMutationId,
      upserts: JSON.stringify([{
        id: this.#definition.id, kind: this.#definition.kind, json: JSON.stringify(this.#definition),
      }]),
      deletes: '[]',
      note: note.trim(),
    });
  }

  async publish(clientMutationId: string, note: string): Promise<ObjectBehaviourPublishRequest> {
    if (this.#access !== 'write' || this.#adapter === null) throw new Error('object_behaviour_publish_unavailable');
    const request = this.buildPublishRequest(clientMutationId, note);
    await this.#adapter.publishContentChangeSet(request);
    return request;
  }
}

export function createObjectBehaviourModel(
  options: CreateObjectBehaviourModelOptions,
): ObjectBehaviourModel {
  return new ObjectBehaviourModel(options);
}
