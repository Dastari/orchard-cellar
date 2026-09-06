import {
  bootstrapContentDefinitions,
  contentDefinitionsHash,
  parseFrameDefinition,
  validateContentDefinitions,
  type ContentValidationReport,
  type FrameContentDefinition,
  type SupportedContentDefinition,
} from '@orchard/sim';
import {
  inspectWidgetLayout,
  layoutContentFrame,
  widget,
  type ContentFrameLayout,
  type UiSize,
  type WidgetLayoutEntry,
  type WidgetNode,
} from '@orchard/ui';

export type FrameDesignerAccess = 'anonymous' | 'read_only' | 'write';

export interface FrameDesignerPublishRequest {
  readonly packId: 'live';
  readonly expectedRevision: bigint;
  readonly clientMutationId: string;
  readonly upserts: string;
  readonly deletes: '[]';
  readonly note: string;
}

export interface FrameDesignerPublishAdapter {
  publishContentChangeSet(request: FrameDesignerPublishRequest): Promise<void>;
}

export interface FrameDesignerSnapshot {
  readonly access: FrameDesignerAccess;
  readonly definition: FrameContentDefinition;
  readonly validation: ContentValidationReport;
  readonly layout: ContentFrameLayout;
  readonly hitTargets: readonly WidgetLayoutEntry[];
  readonly dirty: boolean;
  readonly canPublish: boolean;
}

export interface CreateFrameDesignerOptions {
  readonly definition: string | unknown;
  readonly access: FrameDesignerAccess;
  readonly definitions?: readonly SupportedContentDefinition[];
  readonly baseRevision?: bigint;
  readonly createPublishAdapter?: () => FrameDesignerPublishAdapter;
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

function previewWidgets(layout: ContentFrameLayout): WidgetNode {
  const root = widget('window', `preview.${layout.definition.id}`, { capturePointer: true })
    .setBounds(layout.storage.frame);
  for (const pane of layout.panes) {
    const paneNode = widget(
      pane.definition.kind === 'bar' ? 'bar' : 'panel',
      `preview.${layout.definition.id}.pane.${pane.definition.id}`,
      { capturePointer: true },
    ).setBounds(pane.layout.region);
    for (const [index, rect] of pane.layout.slots.entries()) {
      if (pane.slots[index] === undefined) continue;
      paneNode.add(widget('slot', `${paneNode.id}.slot.${pane.slots[index]!.index}`, { capturePointer: true }).setBounds(rect));
    }
    root.add(paneNode);
  }
  for (const [index, button] of layout.buttons.entries()) {
    root.add(widget('button', `preview.${layout.definition.id}.button.${index}`, { capturePointer: true }).setBounds(button.rect));
  }
  return root;
}

export class FrameDesignerModel {
  readonly #access: FrameDesignerAccess;
  readonly #definitions: readonly SupportedContentDefinition[];
  readonly #baseRevision: bigint;
  readonly #adapter: FrameDesignerPublishAdapter | null;
  readonly #initialHash: string;
  #definition: FrameContentDefinition;
  #viewport: UiSize;

  constructor(options: CreateFrameDesignerOptions) {
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

  #set(value: unknown): FrameDesignerSnapshot {
    this.#definition = parseFrameDefinition(value);
    return this.snapshot();
  }

  snapshot(): FrameDesignerSnapshot {
    const definitions = replaceFrame(this.#definitions, this.#definition);
    const validation = validateContentDefinitions(definitions);
    const layout = layoutContentFrame(
      this.#viewport,
      this.#definition,
      { entity: 'fixture:entity', backpack: 'fixture:backpack', hotbar: 'fixture:hotbar', equipment: 'fixture:equipment', crafting: 'fixture:crafting', merchant: 'fixture:merchant' },
      registryView(definitions),
    );
    const dirty = contentDefinitionsHash([this.#definition]) !== this.#initialHash;
    return Object.freeze({
      access: this.#access,
      definition: this.#definition,
      validation,
      layout,
      hitTargets: Object.freeze(inspectWidgetLayout(previewWidgets(layout))),
      dirty,
      canPublish: this.#access === 'write' && this.#adapter !== null && dirty && validation.valid,
    });
  }

  replaceDefinition(value: string | unknown): FrameDesignerSnapshot {
    this.#assertEditable();
    const next = parseFrameDefinition(value);
    if (next.id !== this.#definition.id) throw new Error('frame_definition_identity_change');
    return this.#set(next);
  }

  setViewport(viewport: UiSize): FrameDesignerSnapshot {
    if (viewport.width < 1 || viewport.height < 1) throw new Error('frame_preview_viewport_invalid');
    this.#viewport = { width: Math.round(viewport.width), height: Math.round(viewport.height) };
    return this.snapshot();
  }

  movePane(paneId: string, nextIndex: number): FrameDesignerSnapshot {
    this.#assertEditable();
    const panes = [...this.#definition.panes];
    const index = panes.findIndex(({ id }) => id === paneId);
    if (index < 0) throw new Error(`frame_pane_not_found:${paneId}`);
    if (!Number.isSafeInteger(nextIndex) || nextIndex < 0 || nextIndex >= panes.length) throw new Error('frame_pane_index_invalid');
    const [moved] = panes.splice(index, 1);
    panes.splice(nextIndex, 0, moved!);
    return this.#set({ ...this.#definition, panes });
  }

  updatePaneGrid(paneId: string, columns: number, rows: number): FrameDesignerSnapshot {
    this.#assertEditable();
    return this.#set({
      ...this.#definition,
      panes: this.#definition.panes.map((pane) => pane.id === paneId
        ? { ...pane, columns, rows } : pane),
    });
  }

  updatePaneBinding(paneId: string, binding: FrameContentDefinition['panes'][number]['bind']): FrameDesignerSnapshot {
    this.#assertEditable();
    return this.#set({
      ...this.#definition,
      panes: this.#definition.panes.map((pane) => pane.id === paneId ? { ...pane, bind: binding } : pane),
    });
  }

  updatePaneRestriction(
    paneId: string,
    restriction: FrameContentDefinition['panes'][number]['restriction'],
  ): FrameDesignerSnapshot {
    this.#assertEditable();
    return this.#set({
      ...this.#definition,
      panes: this.#definition.panes.map((pane) => {
        if (pane.id !== paneId) return pane;
        return { ...pane, restriction };
      }),
    });
  }

  buildPublishRequest(clientMutationId: string, note: string): FrameDesignerPublishRequest {
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

  async publish(clientMutationId: string, note: string): Promise<FrameDesignerPublishRequest> {
    if (this.#access !== 'write' || this.#adapter === null) throw new Error('frame_designer_publish_unavailable');
    const request = this.buildPublishRequest(clientMutationId, note);
    await this.#adapter.publishContentChangeSet(request);
    return request;
  }
}

export function createFrameDesignerModel(options: CreateFrameDesignerOptions): FrameDesignerModel {
  return new FrameDesignerModel(options);
}
