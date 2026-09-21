import {
  bootstrapContentDefinitions,
  contentDefinitionsHash,
  parseFrameDefinition,
  validateContentDefinitions,
  type ContentValidationReport,
  type FrameContentDefinition,
  type SupportedContentDefinition,
} from '@orchard/sim';
import type { UiSize } from '../../geometry.js';
import { UiRoot } from './root.js';
import { inspectUiElements, type UiElementInspection } from './element.js';
import { uiContentFrame } from '../components/content-frame.js';

export type UiFrameDesignerAccess = 'anonymous' | 'read_only' | 'write';

export interface UiFrameDesignerPublishRequest {
  readonly packId: 'live';
  readonly expectedRevision: bigint;
  readonly clientMutationId: string;
  readonly upserts: string;
  readonly deletes: '[]';
  readonly note: string;
}

export interface UiFrameDesignerPublishAdapter {
  publishContentChangeSet(request: UiFrameDesignerPublishRequest): Promise<void>;
}

export interface UiFrameDesignerSnapshot {
  readonly access: UiFrameDesignerAccess;
  readonly definition: FrameContentDefinition;
  readonly validation: ContentValidationReport;
  readonly hitTargets: readonly UiElementInspection[];
  readonly dirty: boolean;
  readonly canPublish: boolean;
}

export interface UiFrameDesignerOptions {
  readonly definition: string | unknown;
  readonly access: UiFrameDesignerAccess;
  readonly definitions?: readonly SupportedContentDefinition[];
  readonly baseRevision?: bigint;
  readonly createPublishAdapter?: () => UiFrameDesignerPublishAdapter;
  readonly viewport?: UiSize;
}

function registryView(definitions: readonly SupportedContentDefinition[]) {
  return {
    items: new Map(definitions.filter((definition) => definition.kind === 'item')
      .map((definition) => [definition.id, definition] as const)),
    processes: new Map(definitions.filter((definition) => definition.kind === 'process')
      .map((definition) => [definition.id, definition] as const)),
  };
}

function replaceFrame(
  definitions: readonly SupportedContentDefinition[],
  frame: FrameContentDefinition,
): readonly SupportedContentDefinition[] {
  return [...definitions.filter(({ id }) => id !== frame.id), frame];
}

function previewKit(definition: FrameContentDefinition, viewport: UiSize, definitions: readonly SupportedContentDefinition[]): readonly UiElementInspection[] {
  const root = new UiRoot({ scale: 1 }); root.resize(viewport.width, viewport.height);
  root.mount(uiContentFrame({ definition, aliases: { entity: 'fixture:entity', backpack: 'fixture:backpack', hotbar: 'fixture:hotbar', equipment: 'fixture:equipment', crafting: 'fixture:crafting', merchant: 'fixture:merchant' }, registry: registryView(definitions) }));
  root.arrange(); const entries = inspectUiElements(root.tree); root.dispose(); return entries;
}

export class UiFrameDesignerModel {
  readonly #access: UiFrameDesignerAccess;
  readonly #definitions: readonly SupportedContentDefinition[];
  readonly #baseRevision: bigint;
  readonly #adapter: UiFrameDesignerPublishAdapter | null;
  readonly #initialHash: string;
  #definition: FrameContentDefinition;
  #published = false;
  #viewport: UiSize;

  constructor(options: UiFrameDesignerOptions) {
    this.#definition = parseFrameDefinition(options.definition);
    this.#access = options.access;
    this.#definitions = options.definitions ?? bootstrapContentDefinitions();
    this.#baseRevision = options.baseRevision ?? 0n;
    this.#viewport = options.viewport ?? { width: 480, height: 270 };
    this.#initialHash = contentDefinitionsHash([this.#definition]);
    this.#adapter = options.access === 'write' && options.createPublishAdapter !== undefined
      ? options.createPublishAdapter() : null;
  }

  #assertEditable(): void {
    if (this.#access === 'read_only') throw new Error('frame_designer_read_only');
  }

  #set(value: unknown): UiFrameDesignerSnapshot {
    this.#definition = parseFrameDefinition(value);
    return this.snapshot();
  }

  snapshot(): UiFrameDesignerSnapshot {
    const definitions = replaceFrame(this.#definitions, this.#definition);
    const validation = validateContentDefinitions(definitions);
    const dirty = contentDefinitionsHash([this.#definition]) !== this.#initialHash;
    return Object.freeze({
      access: this.#access,
      definition: this.#definition,
      validation,
      hitTargets: Object.freeze(previewKit(this.#definition, this.#viewport, definitions)),
      dirty,
      canPublish: !this.#published && this.#access === 'write' && this.#adapter !== null && dirty && validation.valid,
    });
  }

  replaceDefinition(value: string | unknown): UiFrameDesignerSnapshot {
    this.#assertEditable();
    const next = parseFrameDefinition(value);
    if (next.id !== this.#definition.id) throw new Error('frame_definition_identity_change');
    return this.#set(next);
  }

  setViewport(viewport: UiSize): UiFrameDesignerSnapshot {
    if (viewport.width < 1 || viewport.height < 1) throw new Error('frame_preview_viewport_invalid');
    this.#viewport = { width: Math.round(viewport.width), height: Math.round(viewport.height) };
    return this.snapshot();
  }

  movePane(paneId: string, nextIndex: number): UiFrameDesignerSnapshot {
    this.#assertEditable();
    const panes = [...this.#definition.panes];
    const index = panes.findIndex(({ id }) => id === paneId);
    if (index < 0) throw new Error(`frame_pane_not_found:${paneId}`);
    if (!Number.isSafeInteger(nextIndex) || nextIndex < 0 || nextIndex >= panes.length) throw new Error('frame_pane_index_invalid');
    const [moved] = panes.splice(index, 1);
    panes.splice(nextIndex, 0, moved!);
    return this.#set({ ...this.#definition, panes });
  }

  updatePaneGrid(paneId: string, columns: number, rows: number): UiFrameDesignerSnapshot {
    this.#assertEditable();
    return this.#set({
      ...this.#definition,
      panes: this.#definition.panes.map((pane) => pane.id === paneId
        ? { ...pane, columns, rows } : pane),
    });
  }

  updatePaneBinding(paneId: string, binding: FrameContentDefinition['panes'][number]['bind']): UiFrameDesignerSnapshot {
    this.#assertEditable();
    return this.#set({
      ...this.#definition,
      panes: this.#definition.panes.map((pane) => pane.id === paneId ? { ...pane, bind: binding } : pane),
    });
  }

  updatePaneRestriction(
    paneId: string,
    restriction: FrameContentDefinition['panes'][number]['restriction'],
  ): UiFrameDesignerSnapshot {
    this.#assertEditable();
    return this.#set({
      ...this.#definition,
      panes: this.#definition.panes.map((pane) => {
        if (pane.id !== paneId) return pane;
        return { ...pane, restriction };
      }),
    });
  }

  buildPublishRequest(clientMutationId: string, note: string): UiFrameDesignerPublishRequest {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/u.test(clientMutationId)) throw new Error('invalid_content_mutation_id');
    if (note.trim().length > 500) throw new Error('invalid_content_note');
    const state = this.snapshot();
    if (!state.dirty) throw new Error('content_change_set_empty');
    if (!state.validation.valid) throw new Error(`content_validation_failed:${state.validation.errors[0]?.code ?? 'unknown'}`);
    return Object.freeze({
      packId: 'live', expectedRevision: this.#baseRevision, clientMutationId,
      upserts: JSON.stringify([{ id: this.#definition.id, kind: 'frame', json: JSON.stringify(this.#definition) }]),
      deletes: '[]', note: note.trim(),
    });
  }

  async publish(clientMutationId: string, note: string): Promise<UiFrameDesignerPublishRequest> {
    if (this.#published) throw new Error('frame_designer_reload_required');
    if (this.#access !== 'write' || this.#adapter === null) throw new Error('frame_designer_publish_unavailable');
    const request = this.buildPublishRequest(clientMutationId, note);
    await this.#adapter.publishContentChangeSet(request);
    this.#published = true;
    return request;
  }
}

export function createUiFrameDesignerModel(options: UiFrameDesignerOptions): UiFrameDesignerModel {
  return new UiFrameDesignerModel(options);
}
