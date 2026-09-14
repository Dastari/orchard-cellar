import {
  bootstrapContentDefinitions,
  buildContentRegistry,
  contentDefinitionsHash,
  definitionSlug,
  parseContentDefinition,
  type ContentValidationReport,
  type DialogueContentDefinition,
  type NpcContentDefinition,
  type QuestContentDefinition,
  type ShopContentDefinition,
  type SupportedContentDefinition,
} from '@orchard/sim';
import type {
  ContentRevisionPreview,
  ContentRevisionRecord,
  ItemsContentHeadSnapshot,
  ItemsPublishAdapter,
  PublishContentChangeSetRequest,
  RestoreContentRevisionRequest,
} from '../items/contracts.js';
import { applyDefinitionChangeSet, diffContentDefinitions } from '../items/diff.js';

export const NARRATIVE_ENGINE_VERSION = 1 as const;
export const NARRATIVE_KINDS = ['npc', 'dialogue', 'quest'] as const;
export type NarrativeKind = typeof NARRATIVE_KINDS[number];
export type NarrativeAccess = 'anonymous' | 'read_only' | 'write';
export type NarrativeDefinition = Extract<SupportedContentDefinition, { readonly kind: NarrativeKind }>;
export type NarrativeUpsertDefinition = NarrativeDefinition | ShopContentDefinition;

export interface NarrativePublishAdapterFactory { (): ItemsPublishAdapter }

export interface NarrativeBrowserEntry {
  readonly id: string;
  readonly kind: SupportedContentDefinition['kind'];
  readonly label: string;
  readonly retired: boolean;
  readonly referencedBy: number;
  readonly referencesTo: readonly string[];
}

export interface NpcPreview {
  readonly definition: NpcContentDefinition;
  readonly portraitAsset: string;
  readonly dialogue: DialogueContentDefinition | null;
  readonly shop: ShopContentDefinition | null;
  readonly quests: readonly QuestContentDefinition[];
}

export interface DialogueGraphNode {
  readonly id: string;
  readonly speaker: string;
  readonly body: string;
  readonly mode: 'dialogue' | 'shop';
  readonly x: number;
  readonly y: number;
  readonly choices: DialogueContentDefinition['nodes'][number]['choices'];
}

export interface DialogueGraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly choiceId: string;
}

export interface DialogueGraphPreview {
  readonly definition: DialogueContentDefinition;
  readonly nodes: readonly DialogueGraphNode[];
  readonly edges: readonly DialogueGraphEdge[];
  readonly speakerPortraits: Readonly<Record<string, string>>;
}

export type PreviewQuestState = 'available' | 'active' | 'complete' | 'turned_in';

export interface DialoguePlayState {
  readonly dialogueId: string;
  readonly currentNodeId: string | null;
  readonly visitedNodeIds: readonly string[];
  readonly questStates: Readonly<Record<string, PreviewQuestState>>;
  readonly openedShop: string | null;
}

export interface QuestProgressFixture {
  readonly questStates?: Readonly<Record<string, PreviewQuestState>>;
  readonly items?: Readonly<Record<string, number>>;
  readonly statistics?: Readonly<Record<string, number>>;
  readonly actions?: Readonly<Record<string, number>>;
  readonly locations?: readonly { readonly spaceId: number; readonly x: number; readonly y: number }[];
  readonly talkedTo?: Readonly<Record<string, number>>;
}

export interface QuestPreview {
  readonly definition: QuestContentDefinition;
  readonly available: boolean;
  readonly objectives: readonly { readonly id: string; readonly label: string; readonly current: number; readonly required: number; readonly complete: boolean }[];
  readonly complete: boolean;
  readonly rewards: QuestContentDefinition['rewards'];
}

export interface NarrativeWorkspaceSnapshot {
  readonly access: NarrativeAccess;
  readonly baseRevision: bigint;
  readonly headRevision: bigint;
  readonly engineGate: 'compatible' | 'requires_update';
  readonly definitions: readonly SupportedContentDefinition[];
  readonly validation: ContentValidationReport;
  readonly diffs: ReturnType<typeof diffContentDefinitions>;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canPublish: boolean;
  readonly conflict: boolean;
}

export interface CreateNarrativeWorkspaceOptions {
  readonly access: NarrativeAccess;
  readonly head?: ItemsContentHeadSnapshot;
  readonly history?: readonly ContentRevisionRecord[];
  readonly createPublishAdapter?: NarrativePublishAdapterFactory;
}

const MUTATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/u;

function rows(definitions: readonly SupportedContentDefinition[]) {
  return definitions.map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    slug: definitionSlug(definition.id) ?? undefined,
    json: definition,
  }));
}

function canonical(definitions: readonly SupportedContentDefinition[]) {
  const built = buildContentRegistry(rows(definitions));
  return {
    definitions: Object.freeze([...built.registry.definitions.values()]),
    validation: built.report,
    contentHash: built.registry.contentHash,
  };
}

function defaultHead(): ItemsContentHeadSnapshot {
  const result = canonical(bootstrapContentDefinitions());
  return Object.freeze({
    packId: 'live', revision: 0n, engineVersion: NARRATIVE_ENGINE_VERSION,
    contentHash: result.contentHash, definitions: result.definitions,
  });
}

function parseNarrativeUpsert(value: unknown): NarrativeUpsertDefinition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid_narrative_definition');
  const kind = (value as { readonly kind?: unknown }).kind;
  if (kind !== 'npc' && kind !== 'dialogue' && kind !== 'quest' && kind !== 'shop') {
    throw new Error('unsupported_narrative_definition_kind');
  }
  return parseContentDefinition(kind, value) as NarrativeUpsertDefinition;
}

function label(definition: SupportedContentDefinition): string {
  if ('displayName' in definition && typeof definition.displayName === 'string') return definition.displayName;
  if ('title' in definition && typeof definition.title === 'string') return definition.title;
  return definitionSlug(definition.id) ?? definition.id;
}

function references(value: unknown, path = '$'): readonly { readonly id: string; readonly path: string }[] {
  if (typeof value === 'string' && /^(?:npc|dialogue|quest|shop|item):/u.test(value)) return [{ id: value, path }];
  if (Array.isArray(value)) return value.flatMap((entry, index) => references(entry, `${path}[${index}]`));
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => references(entry, `${path}.${key}`));
}

function parseRevisionChangeSet(value: string): { readonly upserts: readonly SupportedContentDefinition[]; readonly deletes: readonly string[] } {
  const decoded = JSON.parse(value) as { readonly upserts?: unknown; readonly deletes?: unknown };
  if (!Array.isArray(decoded.upserts) || !Array.isArray(decoded.deletes)
    || !decoded.deletes.every((id) => typeof id === 'string')) throw new Error('invalid_content_revision_change_set');
  return {
    upserts: decoded.upserts.map((entry) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error('invalid_content_revision_change_set');
      const row = entry as { readonly kind?: unknown; readonly json?: unknown };
      if (typeof row.kind !== 'string' || typeof row.json !== 'string') throw new Error('invalid_content_revision_change_set');
      return parseContentDefinition(row.kind, row.json);
    }),
    deletes: decoded.deletes,
  };
}

function cloneQuestStates(source: Readonly<Record<string, PreviewQuestState>>): Readonly<Record<string, PreviewQuestState>> {
  return Object.freeze({ ...source });
}

export class NarrativeWorkspaceModel {
  readonly #access: NarrativeAccess;
  readonly #adapter: ItemsPublishAdapter | null;
  #head: ItemsContentHeadSnapshot;
  #baseDefinitions: readonly SupportedContentDefinition[];
  #present: readonly SupportedContentDefinition[];
  #baseRevision: bigint;
  #history: readonly ContentRevisionRecord[];
  readonly #undo: Array<readonly SupportedContentDefinition[]> = [];
  readonly #redo: Array<readonly SupportedContentDefinition[]> = [];
  readonly #nodePositions = new Map<string, Readonly<{ x: number; y: number }>>();

  constructor(options: CreateNarrativeWorkspaceOptions) {
    this.#access = options.access;
    this.#head = options.head ?? defaultHead();
    this.#baseDefinitions = canonical(this.#head.definitions).definitions;
    this.#present = this.#baseDefinitions;
    this.#baseRevision = this.#head.revision;
    this.#history = Object.freeze([...(options.history ?? [])].sort((a, b) => a.revision > b.revision ? -1 : a.revision < b.revision ? 1 : 0));
    this.#adapter = options.access === 'write' && options.createPublishAdapter !== undefined
      ? options.createPublishAdapter() : null;
  }

  #assertEditable(): void {
    if (this.#access === 'read_only') throw new Error('narrative_workspace_read_only');
  }

  #commit(next: readonly SupportedContentDefinition[]): NarrativeWorkspaceSnapshot {
    this.#assertEditable();
    const normalized = canonical(next).definitions;
    if (contentDefinitionsHash(normalized) === contentDefinitionsHash(this.#present)) return this.snapshot();
    this.#undo.push(this.#present);
    this.#redo.splice(0);
    this.#present = normalized;
    return this.snapshot();
  }

  snapshot(): NarrativeWorkspaceSnapshot {
    const state = canonical(this.#present);
    const diffs = diffContentDefinitions(this.#baseDefinitions, state.definitions);
    const conflict = this.#head.revision !== this.#baseRevision;
    const compatible = this.#head.engineVersion === NARRATIVE_ENGINE_VERSION;
    return Object.freeze({
      access: this.#access,
      baseRevision: this.#baseRevision,
      headRevision: this.#head.revision,
      engineGate: compatible ? 'compatible' : 'requires_update',
      definitions: state.definitions,
      validation: state.validation,
      diffs,
      dirty: diffs.length > 0,
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
      canPublish: this.#access === 'write' && this.#adapter !== null && compatible
        && !conflict && state.validation.valid && diffs.length > 0,
      conflict,
    });
  }

  definitions(kind?: NarrativeKind | 'shop', query = '', includeRetired = false): readonly NarrativeUpsertDefinition[] {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    return this.snapshot().definitions
      .filter((definition): definition is NarrativeUpsertDefinition => (
        definition.kind === 'npc' || definition.kind === 'dialogue' || definition.kind === 'quest' || definition.kind === 'shop'
      ))
      .filter((definition) => kind === undefined || definition.kind === kind)
      .filter((definition) => includeRetired || definition.retired !== true)
      .filter((definition) => terms.every((term) => `${definition.id} ${label(definition)} ${JSON.stringify(definition)}`.toLocaleLowerCase().includes(term)));
  }

  browser(kind?: NarrativeKind | 'shop', query = '', includeRetired = false): readonly NarrativeBrowserEntry[] {
    const all = this.snapshot().definitions;
    return this.definitions(kind, query, includeRetired).map((definition) => ({
      id: definition.id,
      kind: definition.kind,
      label: label(definition),
      retired: definition.retired === true,
      referencedBy: all.filter((candidate) => candidate.id !== definition.id
        && references(candidate).some((reference) => reference.id === definition.id)).length,
      referencesTo: Object.freeze([...new Set(references(definition).map(({ id }) => id))].sort()),
    }));
  }

  upsertDefinitions(values: readonly unknown[]): NarrativeWorkspaceSnapshot {
    const parsed = values.map(parseNarrativeUpsert);
    const byId = new Map(this.#present.map((definition) => [definition.id, definition]));
    parsed.forEach((definition) => byId.set(definition.id, definition));
    return this.#commit([...byId.values()]);
  }

  upsertDefinition(value: unknown): NarrativeWorkspaceSnapshot { return this.upsertDefinitions([value]); }

  deleteDefinition(id: string): NarrativeWorkspaceSnapshot {
    if (!this.#present.some((definition) => definition.id === id)) throw new Error(`narrative_definition_not_found:${id}`);
    return this.#commit(this.#present.filter((definition) => definition.id !== id));
  }

  undo(): NarrativeWorkspaceSnapshot {
    this.#assertEditable();
    const previous = this.#undo.pop();
    if (previous === undefined) return this.snapshot();
    this.#redo.push(this.#present);
    this.#present = previous;
    return this.snapshot();
  }

  redo(): NarrativeWorkspaceSnapshot {
    this.#assertEditable();
    const next = this.#redo.pop();
    if (next === undefined) return this.snapshot();
    this.#undo.push(this.#present);
    this.#present = next;
    return this.snapshot();
  }

  receiveHead(head: ItemsContentHeadSnapshot): NarrativeWorkspaceSnapshot {
    this.#head = head;
    if (!this.snapshot().dirty || contentDefinitionsHash(this.#present) === canonical(head.definitions).contentHash) {
      this.#baseDefinitions = canonical(head.definitions).definitions;
      this.#present = this.#baseDefinitions;
      this.#baseRevision = head.revision;
      this.#undo.splice(0);
      this.#redo.splice(0);
    }
    return this.snapshot();
  }

  rebase(): NarrativeWorkspaceSnapshot {
    this.#assertEditable();
    const changes = diffContentDefinitions(this.#baseDefinitions, this.#present);
    const remoteChanges = new Set(diffContentDefinitions(this.#baseDefinitions, this.#head.definitions).map(({ id }) => id));
    const overlap = changes.map(({ id }) => id).filter((id) => remoteChanges.has(id));
    if (overlap.length > 0) throw new Error(`content_rebase_conflict:${overlap.join(',')}`);
    const next = applyDefinitionChangeSet(this.#head.definitions, {
      upserts: changes.flatMap((change) => change.after === undefined ? [] : [change.after]),
      deletes: changes.filter(({ kind }) => kind === 'delete').map(({ id }) => id),
    });
    this.#baseDefinitions = canonical(this.#head.definitions).definitions;
    this.#baseRevision = this.#head.revision;
    this.#present = canonical(next).definitions;
    return this.snapshot();
  }

  npcPreview(id: string): NpcPreview {
    const definition = this.#present.find((candidate): candidate is NpcContentDefinition => candidate.id === id && candidate.kind === 'npc');
    if (definition === undefined) throw new Error(`npc_definition_not_found:${id}`);
    const dialogue = this.#present.find((candidate): candidate is DialogueContentDefinition => candidate.id === definition.dialogue && candidate.kind === 'dialogue') ?? null;
    const shop = definition.shop === undefined ? null
      : this.#present.find((candidate): candidate is ShopContentDefinition => candidate.id === definition.shop && candidate.kind === 'shop') ?? null;
    const quests = definition.questGiver.flatMap((questId) => {
      const quest = this.#present.find((candidate): candidate is QuestContentDefinition => candidate.id === questId && candidate.kind === 'quest');
      return quest === undefined ? [] : [quest];
    });
    return Object.freeze({ definition, portraitAsset: definition.actorAsset, dialogue, shop, quests: Object.freeze(quests) });
  }

  moveDialogueNode(dialogueId: string, nodeId: string, x: number, y: number): DialogueGraphPreview {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('dialogue_node_position_invalid');
    this.#nodePositions.set(`${dialogueId}:${nodeId}`, Object.freeze({ x: Math.round(x), y: Math.round(y) }));
    return this.dialoguePreview(dialogueId);
  }

  dialoguePreview(id: string): DialogueGraphPreview {
    const definition = this.#present.find((candidate): candidate is DialogueContentDefinition => candidate.id === id && candidate.kind === 'dialogue');
    if (definition === undefined) throw new Error(`dialogue_definition_not_found:${id}`);
    const portraits: Record<string, string> = {};
    for (const npc of this.#present.filter((candidate): candidate is NpcContentDefinition => candidate.kind === 'npc')) {
      portraits[npc.displayName] = npc.actorAsset;
      portraits[npc.id] = npc.actorAsset;
    }
    const nodes = definition.nodes.map((node, index) => {
      const stored = this.#nodePositions.get(`${id}:${node.id}`);
      return Object.freeze({
        ...node,
        x: stored?.x ?? 24 + (index % 3) * 250,
        y: stored?.y ?? 24 + Math.floor(index / 3) * 180,
      });
    });
    const nodeIds = new Set(nodes.map(({ id: nodeId }) => nodeId));
    const edges = nodes.flatMap((node) => node.choices.flatMap((choice) => (
      choice.nextNodeId !== null && nodeIds.has(choice.nextNodeId)
        ? [{ id: `${node.id}:${choice.id}`, from: node.id, to: choice.nextNodeId, choiceId: choice.id }]
        : []
    )));
    return Object.freeze({ definition, nodes: Object.freeze(nodes), edges: Object.freeze(edges), speakerPortraits: Object.freeze(portraits) });
  }

  startDialogue(dialogueId: string, questStates: Readonly<Record<string, PreviewQuestState>> = {}): DialoguePlayState {
    const dialogue = this.dialoguePreview(dialogueId).definition;
    return Object.freeze({ dialogueId, currentNodeId: dialogue.initialNodeId, visitedNodeIds: Object.freeze([dialogue.initialNodeId]), questStates: cloneQuestStates(questStates), openedShop: null });
  }

  availableChoices(play: DialoguePlayState): DialogueContentDefinition['nodes'][number]['choices'] {
    if (play.currentNodeId === null) return [];
    const dialogue = this.dialoguePreview(play.dialogueId).definition;
    const node = dialogue.nodes.find(({ id }) => id === play.currentNodeId);
    return node?.choices.filter((choice) => choice.quest === undefined
      || (play.questStates[choice.quest.quest] ?? 'available') === choice.quest.requires) ?? [];
  }

  chooseDialogue(play: DialoguePlayState, choiceId: string): DialoguePlayState {
    if (play.currentNodeId === null) throw new Error('dialogue_play_complete');
    const dialogue = this.dialoguePreview(play.dialogueId).definition;
    const node = dialogue.nodes.find(({ id }) => id === play.currentNodeId)!;
    const choice = this.availableChoices(play).find(({ id }) => id === choiceId);
    if (choice === undefined) throw new Error(`dialogue_choice_unavailable:${choiceId}`);
    const questStates: Record<string, PreviewQuestState> = { ...play.questStates };
    if (choice.quest?.action === 'accept') questStates[choice.quest.quest] = 'active';
    if (choice.quest?.action === 'turn_in') questStates[choice.quest.quest] = 'turned_in';
    const next = choice.nextNodeId;
    const nextNode = next === null ? undefined : dialogue.nodes.find(({ id }) => id === next);
    return Object.freeze({
      ...play,
      currentNodeId: next,
      visitedNodeIds: Object.freeze(next === null ? [...play.visitedNodeIds] : [...play.visitedNodeIds, next]),
      questStates: Object.freeze(questStates),
      openedShop: node.mode === 'shop' || nextNode?.mode === 'shop' ? dialogue.shop ?? null : play.openedShop,
    });
  }

  questPreview(id: string, fixture: QuestProgressFixture = {}): QuestPreview {
    const definition = this.#present.find((candidate): candidate is QuestContentDefinition => candidate.id === id && candidate.kind === 'quest');
    if (definition === undefined) throw new Error(`quest_definition_not_found:${id}`);
    const objectives = definition.objectives.map((objective) => {
      let current: number;
      const required = objective.kind === 'collect'
        ? objective.items.reduce((sum, item) => sum + item.count, 0)
        : objective.kind === 'location' ? 1 : objective.count;
      if (objective.kind === 'collect') current = objective.items.reduce((sum, item) => sum + Math.min(item.count, fixture.items?.[item.item] ?? 0), 0);
      else if (objective.kind === 'statistic') current = fixture.statistics?.[`${objective.statisticKind}:${objective.subjectKind}`] ?? 0;
      else if (objective.kind === 'action') current = fixture.actions?.[objective.actionKind] ?? 0;
      else if (objective.kind === 'talk') current = objective.npcs.reduce((sum, npc) => sum + (fixture.talkedTo?.[npc] ?? 0), 0);
      else current = fixture.locations?.some((point) => point.spaceId === objective.spaceId
        && Math.hypot(point.x - objective.x, point.y - objective.y) <= objective.radiusFixed) ? 1 : 0;
      current = Math.min(current, required);
      return Object.freeze({ id: objective.id, label: objective.label, current, required, complete: current >= required });
    });
    const available = (definition.prerequisites ?? []).every((quest) => fixture.questStates?.[quest] === 'turned_in');
    return Object.freeze({ definition, available, objectives: Object.freeze(objectives), complete: available && objectives.every(({ complete }) => complete), rewards: definition.rewards });
  }

  history(): readonly ContentRevisionRecord[] { return this.#history; }

  receiveHistory(history: readonly ContentRevisionRecord[]): readonly ContentRevisionRecord[] {
    this.#history = Object.freeze([...history].sort((a, b) => a.revision > b.revision ? -1 : a.revision < b.revision ? 1 : 0));
    return this.#history;
  }

  previewRevision(revision: bigint, mode: ContentRevisionPreview['mode']): ContentRevisionPreview {
    const entry = this.#history.find((candidate) => candidate.revision === revision);
    if (entry === undefined) throw new Error(`content_revision_not_found:${revision}`);
    const change = parseRevisionChangeSet(mode === 'published_change' ? entry.changeSetJson : entry.inverseChangeSetJson);
    const after = applyDefinitionChangeSet(this.#head.definitions, change);
    return Object.freeze({ revision, mode, diffs: diffContentDefinitions(this.#head.definitions, after) });
  }

  buildPublishRequest(clientMutationId: string, note: string): PublishContentChangeSetRequest {
    if (!MUTATION_ID_PATTERN.test(clientMutationId)) throw new Error('invalid_content_mutation_id');
    if (note.trim().length > 500) throw new Error('invalid_content_note');
    const state = this.snapshot();
    if (state.engineGate !== 'compatible') throw new Error('content_engine_update_required');
    if (state.conflict) throw new Error('content_revision_conflict');
    if (!state.dirty) throw new Error('content_change_set_empty');
    if (!state.validation.valid) throw new Error(`content_validation_failed:${state.validation.errors[0]?.code ?? 'unknown'}`);
    const upserts = state.diffs.flatMap((diff) => diff.after === undefined ? [] : [{ id: diff.after.id, kind: diff.after.kind, json: JSON.stringify(diff.after) }]);
    const deletes = state.diffs.filter(({ kind }) => kind === 'delete').map(({ id }) => id);
    return Object.freeze({ packId: 'live', expectedRevision: this.#baseRevision, clientMutationId, upserts: JSON.stringify(upserts), deletes: JSON.stringify(deletes), note: note.trim() });
  }

  async publish(clientMutationId: string, note: string): Promise<PublishContentChangeSetRequest> {
    if (this.#access !== 'write' || this.#adapter === null) throw new Error('narrative_publish_unavailable');
    const request = this.buildPublishRequest(clientMutationId, note);
    await this.#adapter.publishContentChangeSet(request);
    return request;
  }

  async restoreRevision(revision: bigint, clientMutationId: string, note: string): Promise<RestoreContentRevisionRequest> {
    if (this.#access !== 'write' || this.#adapter === null) throw new Error('narrative_restore_unavailable');
    if (this.snapshot().dirty) throw new Error('content_draft_not_empty');
    if (!this.#history.some((entry) => entry.revision === revision)) throw new Error(`content_revision_not_found:${revision}`);
    if (!MUTATION_ID_PATTERN.test(clientMutationId)) throw new Error('invalid_content_mutation_id');
    const request = Object.freeze({ revision, expectedRevision: this.#head.revision, clientMutationId, note: note.trim() });
    await this.#adapter.restoreContentRevision(request);
    return request;
  }
}

export function createNarrativeWorkspace(options: CreateNarrativeWorkspaceOptions): NarrativeWorkspaceModel {
  return new NarrativeWorkspaceModel(options);
}
