import type { ItemDefinitionId, SupportedContentDefinition } from '@orchard/sim';
import lifecycleSourceBundle from '@orchard/lifecycle-authoring/source' with { type: 'json' };
import {
  CanvasTextEditor,
  layoutStudioCanvasTable,
  layoutUiFlex,
  layoutUiFrameSlots,
  scrollStudioCanvasTable,
  studioCanvasFrameContentRect,
  type FantasyButtonGlyph,
  type StudioCanvasShellNode,
  type StudioCanvasTableLayout,
  type UiFlexItem,
  type UiRect,
} from '@orchard/ui';
import {
  STUDIO_LIFECYCLE_TRIGGER_ORDER,
  type LifecycleDraftStorage,
  type StudioLifecycleSourceBundle,
} from '../../lifecycle/model.js';
import type {
  StudioCanvasToolAction,
  StudioCanvasToolContext,
  StudioCanvasToolSurface,
  StudioCanvasToolTable,
} from '../../shell/canvas-tool.js';
import {
  itemsAccessForConnection,
  itemsHeadFromConnection,
  itemsHistoryFromConnection,
  itemsPublishAdapterFromConnection,
} from './connection.js';
import { ITEMS_TOOL_CONTENT_KINDS, type ItemsToolContentKind } from './contracts.js';
import { requestStudioFileDownload } from '../../shell/file-download.js';
import { ItemsLifecycleDraft } from './lifecycle.js';
import { createItemsTool, type ItemsToolModel } from './model.js';

interface ItemsCanvasState {
  readonly model: ItemsToolModel;
  readonly query: CanvasTextEditor;
  readonly note: CanvasTextEditor;
  readonly definition: CanvasTextEditor;
  readonly lifecycle: ItemsLifecycleDraft;
  readonly lifecyclePrompt: CanvasTextEditor;
  readonly lifecycleSource: CanvasTextEditor;
  readonly lifecycleBundle: CanvasTextEditor;
  kind: ItemsToolContentKind;
  selectedId: string | null;
  syncedId: string | null;
  browserScroll: number;
  mutationSequence: number;
  lifecycleItemId: ItemDefinitionId | null;
  lifecycleHandlerId: string | null;
  lifecycleSyncedHandlerId: string | null;
  lifecycleEditorMode: 'source' | 'bundle';
  lifecycleSyncing: boolean;
}

type Node = StudioCanvasShellNode;
const BUTTON_HEIGHT = 42;
const LAYOUT_GAP = 6;

function flexItem(width: number, height: number, options: Partial<UiFlexItem> = {}): UiFlexItem {
  return { minSize: { width, height }, ...options };
}

function labelFor(definition: SupportedContentDefinition): string {
  return 'displayName' in definition && typeof definition.displayName === 'string'
    ? definition.displayName : definition.id;
}

function scalarFields(value: unknown, path = '$', result: string[] = []): readonly string[] {
  if (result.length >= 48) return result;
  if (value === null || typeof value !== 'object') {
    result.push(`${path}: ${String(value)}`);
    return result;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) result.push(`${path}: []`);
    value.forEach((entry, index) => scalarFields(entry, `${path}[${index}]`, result));
    return result;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    scalarFields(entry, path === '$' ? key : `${path}.${key}`, result);
  }
  return result;
}

function report(context: StudioCanvasToolContext, title: string, error: unknown): void {
  context.controller.notifications.push('error', title, error instanceof Error ? error.message : String(error));
  context.invalidate();
}

function browserLifecycleStorage(): LifecycleDraftStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}

function updateLifecycleFromEditors(state: ItemsCanvasState, context: StudioCanvasToolContext): void {
  if (state.lifecycleSyncing || state.lifecycleHandlerId === null) return;
  state.lifecycle.update(state.lifecycleHandlerId, {
    prompt: state.lifecyclePrompt.snapshot().value,
    source: state.lifecycleSource.snapshot().value,
  });
  context.invalidate();
}

function createState(context: StudioCanvasToolContext): ItemsCanvasState {
  const live = context.controller.liveAdapter();
  const view = live?.view();
  const access = itemsAccessForConnection(context.route.access, live);
  const head = view === undefined ? null : itemsHeadFromConnection(view);
  const history = view === undefined ? [] : itemsHistoryFromConnection(view);
  const model = createItemsTool({
    access,
    ...(head === null ? {} : { head }),
    history,
    ...(access === 'write' && live !== null ? {
      createPublishAdapter: () => {
        const adapter = itemsPublishAdapterFromConnection(live);
        if (adapter === null) throw new Error('items_publish_unavailable');
        return adapter;
      },
    } : {}),
  });
  const stateRef: { current: ItemsCanvasState | null } = { current: null };
  const lifecycle = new ItemsLifecycleDraft({
    baseline: lifecycleSourceBundle as StudioLifecycleSourceBundle,
    storage: browserLifecycleStorage(),
  });
  const lifecyclePrompt = new CanvasTextEditor({ maxLength: 96,
    onChange: () => {
      if (stateRef.current !== null) updateLifecycleFromEditors(stateRef.current, context);
    } });
  const lifecycleSource = new CanvasTextEditor({ maxLength: 16_384, multiline: true,
    onChange: () => {
      if (stateRef.current !== null) updateLifecycleFromEditors(stateRef.current, context);
    } });
  const state: ItemsCanvasState = {
    model,
    query: new CanvasTextEditor({ maxLength: 120 }),
    note: new CanvasTextEditor({ maxLength: 500 }),
    definition: new CanvasTextEditor({ maxLength: 32_000, multiline: true }),
    lifecycle,
    lifecyclePrompt,
    lifecycleSource,
    lifecycleBundle: new CanvasTextEditor({ maxLength: 256_000, multiline: true }),
    kind: 'item',
    selectedId: model.definitions('item')[0]?.id ?? null,
    syncedId: null,
    browserScroll: 0,
    mutationSequence: 0,
    lifecycleItemId: null,
    lifecycleHandlerId: null,
    lifecycleSyncedHandlerId: null,
    lifecycleEditorMode: 'source',
    lifecycleSyncing: false,
  };
  stateRef.current = state;
  return state;
}

function syncLifecycleSelection(state: ItemsCanvasState, selected: SupportedContentDefinition | null): void {
  const itemId = selected?.kind === 'item' ? selected.id : null;
  const handlers = itemId === null ? [] : state.lifecycle.handlers(itemId);
  if (state.lifecycleItemId !== itemId
    || !handlers.some(({ id }) => id === state.lifecycleHandlerId)) {
    state.lifecycleItemId = itemId;
    state.lifecycleHandlerId = handlers[0]?.id ?? null;
    state.lifecycleSyncedHandlerId = null;
  }
  if (state.lifecycleSyncedHandlerId === state.lifecycleHandlerId) return;
  const handler = handlers.find(({ id }) => id === state.lifecycleHandlerId);
  state.lifecycleSyncing = true;
  state.lifecyclePrompt.setValue(handler?.prompt ?? '');
  state.lifecycleSource.setValue(handler?.source ?? '');
  state.lifecycleSyncing = false;
  state.lifecycleSyncedHandlerId = handler?.id ?? null;
}

function addAction(
  nodes: Node[], actions: StudioCanvasToolAction[], id: string, label: string,
  bounds: UiRect, activate: () => void,
  options: {
    readonly disabled?: boolean;
    readonly role?: StudioCanvasToolAction['role'];
    readonly active?: boolean;
    readonly tone?: Node['tone'];
    readonly glyph?: FantasyButtonGlyph;
    readonly visibleLabel?: string;
    readonly multiline?: boolean;
    readonly textScale?: Node['textScale'];
  } = {},
): void {
  const disabled = options.disabled === true;
  nodes.push({
    id,
    kind: options.role === 'textbox' ? 'field' : options.role === 'tab' ? 'tab' : 'button',
    bounds,
    label: options.visibleLabel ?? label,
    glyph: options.glyph,
    multiline: options.multiline,
    textScale: options.textScale,
    state: disabled ? 'disabled' : options.active ? 'active' : 'idle',
    tone: options.tone,
  });
  actions.push({ id, label, role: options.role ?? 'button', bounds, disabled, activate });
}

function fieldNodes(nodes: Node[], id: string, values: readonly string[], bounds: UiRect): void {
  const count = Math.min(values.length, Math.max(0, Math.floor(bounds.height / BUTTON_HEIGHT)));
  const rows = layoutUiFlex(
    bounds,
    values.slice(0, count).map(() => flexItem(1, 36, { basis: 36, grow: 0, shrink: 0 })),
    { direction: 'column', gap: 4 },
  );
  rows.forEach((row, index) => nodes.push({
    id: `${id}:${index}`,
    kind: 'field',
    bounds: row,
    clip: bounds,
    label: values[index]!,
  }));
}

function prefixSurface(
  context: StudioCanvasToolContext,
  nodes: readonly Node[],
  actions: readonly StudioCanvasToolAction[],
  tables: readonly StudioCanvasToolTable[],
  state: ItemsCanvasState,
): StudioCanvasToolSurface {
  const prefix = `${context.route.tool.id}-`;
  return Object.freeze({
    nodes: Object.freeze(nodes.map((node) => Object.freeze({ ...node, id: `${prefix}${node.id}` }))),
    actions: Object.freeze(actions.map((entry) => Object.freeze({ ...entry, id: `${prefix}${entry.id}` }))),
    tables: Object.freeze(tables.map((entry) => Object.freeze({ ...entry, id: `${prefix}${entry.id}` }))),
    textEditors: Object.freeze([
      { id: 'items:query', editor: state.query },
      { id: 'items:note', editor: state.note },
      { id: 'items:definition-json', editor: state.definition },
      { id: 'items:lifecycle-prompt', editor: state.lifecyclePrompt },
      { id: 'items:lifecycle-source', editor: state.lifecycleSource },
      { id: 'items:lifecycle-bundle', editor: state.lifecycleBundle },
    ].map((entry) => Object.freeze({ ...entry, id: `${prefix}${entry.id}` }))),
  });
}

export function buildItemsCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const live = context.controller.liveAdapter();
  const view = live?.view();
  const access = itemsAccessForConnection(context.route.access, live);
  const identity = view?.identity ?? 'anonymous';
  const state = context.controller.toolState(`items-canvas:${identity}:${access}`, () => createState(context));
  const head = view === undefined ? null : itemsHeadFromConnection(view);
  if (head !== null) state.model.receiveHead(head);
  state.model.receiveHistory(view === undefined ? [] : itemsHistoryFromConnection(view));

  const snapshot = state.model.snapshot();
  const query = state.query.snapshot().value;
  const definitions = state.model.definitions(state.kind, query);
  if (state.selectedId === null || !definitions.some(({ id }) => id === state.selectedId)) {
    state.selectedId = definitions[0]?.id ?? null;
  }
  const selected = snapshot.definitions.find(({ id }) => id === state.selectedId) ?? null;
  if (state.syncedId !== selected?.id) {
    state.definition.setValue(selected === null ? '' : JSON.stringify(selected, null, 2));
    state.syncedId = selected?.id ?? null;
  }
  syncLifecycleSelection(state, selected);

  const controlsBounds = context.controlsBounds ?? context.bounds;
  const workspaceBounds = context.workspaceBounds ?? context.bounds;
  const nodes: Node[] = [
    { id: 'items:controls-panel', kind: 'parchment_panel', bounds: controlsBounds },
    { id: 'items:surface', kind: 'parchment_panel', bounds: workspaceBounds },
  ];
  const actions: StudioCanvasToolAction[] = [];
  const tables: StudioCanvasToolTable[] = [];
  const controlLayout = layoutUiFrameSlots(controlsBounds, 'wood_parchment', [
    { id: 'kindToolbar', ...flexItem(1, 88, { basis: 88, shrink: 0 }) },
    { id: 'fields', ...flexItem(1, 88, { basis: 88, shrink: 0 }) },
    { id: 'commandToolbar', ...flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }) },
    { id: 'spacer', ...flexItem(1, 1, { grow: 1 }) },
  ], { direction: 'column', gap: LAYOUT_GAP });

  const kindRects = layoutUiFlex(
    controlLayout.slots.kindToolbar!,
    ITEMS_TOOL_CONTENT_KINDS.map(() => flexItem(74, BUTTON_HEIGHT, { basis: 74, grow: 1 })),
    { gap: 4, wrap: true },
  );
  ITEMS_TOOL_CONTENT_KINDS.forEach((kind, index) => addAction(
    nodes, actions, `items:kind:${kind}`, kind.toUpperCase(), kindRects[index]!, () => {
      state.kind = kind;
      state.selectedId = state.model.definitions(kind, state.query.snapshot().value)[0]?.id ?? null;
      state.syncedId = null;
      state.browserScroll = 0;
      context.invalidate();
    }, { role: 'tab', active: state.kind === kind },
  ));

  const fieldRects = layoutUiFlex(controlLayout.slots.fields!, [
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
  ], { direction: 'column', gap: 4 });
  addAction(nodes, actions, 'items:query', `SEARCH ${query || '…'}`, fieldRects[0]!, () => state.query.focus(), { role: 'textbox' });
  addAction(nodes, actions, 'items:note', `NOTE ${state.note.snapshot().value || '…'}`, fieldRects[1]!, () => state.note.focus(), { role: 'textbox' });
  const commandRects = layoutUiFlex(controlLayout.slots.commandToolbar!, [
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(80, BUTTON_HEIGHT, { basis: 80, shrink: 0 }),
  ], { gap: 4, wrap: true });
  addAction(nodes, actions, 'items:rebase', 'Rebase content', commandRects[0]!, () => {
    try { state.model.rebase('safe'); context.invalidate(); } catch (error) { report(context, 'Content rebase blocked', error); }
  }, { disabled: snapshot.conflict === null, glyph: 'return', visibleLabel: '' });
  addAction(nodes, actions, 'items:clear', 'Clear draft', commandRects[1]!, () => {
    try { state.model.clearDraft(); state.syncedId = null; context.invalidate(); } catch (error) { report(context, 'Clear draft failed', error); }
  }, { disabled: !snapshot.dirty, glyph: 'cross', visibleLabel: '' });
  addAction(nodes, actions, 'items:publish', 'PUBLISH', commandRects[2]!, () => {
    state.mutationSequence += 1;
    void state.model.publish(`items.canvas.${state.mutationSequence}`, state.note.snapshot().value)
      .then(() => context.controller.notifications.push('success', 'Content published', 'Waiting for the verified live head.'))
      .catch((error: unknown) => report(context, 'Content publish failed', error)).finally(context.invalidate);
  }, { disabled: !snapshot.canPublish, tone: 'success' });

  const workspaceContent = studioCanvasFrameContentRect(workspaceBounds, 'parchment_panel');
  const workspaceRects = layoutUiFlex(workspaceContent, [
    flexItem(190, 240, { basis: 250, grow: 1 }),
    flexItem(280, 240, { basis: 410, grow: 2 }),
    flexItem(220, 240, { basis: 300, grow: 1 }),
  ], { gap: LAYOUT_GAP });
  const [browser, details, output] = workspaceRects as [UiRect, UiRect, UiRect];

  const browserSlots = layoutUiFlex(browser, [
    flexItem(1, 120, { grow: 1 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
  ], { direction: 'column', gap: 4 });
  const browserTable: StudioCanvasTableLayout = layoutStudioCanvasTable({
    columns: [
      { id: 'name', label: `${state.kind.toUpperCase()} (${definitions.length})`, minWidth: 120 },
      { id: 'id', label: 'ID', minWidth: 70 },
    ],
    rows: definitions.map((definition) => ({
      id: definition.id,
      cells: [labelFor(definition), definition.id],
      selected: definition.id === state.selectedId,
    })),
    scrollRow: state.browserScroll,
    rowHeight: BUTTON_HEIGHT,
    headerHeight: BUTTON_HEIGHT,
    frameStyle: 'thin',
    emptyLabel: `No ${state.kind} definitions`,
  }, browserSlots[0]!);
  state.browserScroll = browserTable.firstRow;
  const selectDefinition = (definitionId: string): void => {
    const definition = definitions.find(({ id }) => id === definitionId);
    if (definition === undefined) return;
    state.selectedId = definition.id;
    state.syncedId = null;
    context.controller.selection.select({ kind: 'definition', definitionKind: definition.kind, id: definition.id });
    context.invalidate();
  };
  tables.push({
    id: 'items:browser-table',
    layout: browserTable,
    onHit: (hit) => { if (hit.kind !== 'header') selectDefinition(hit.rowId); },
    onScroll: (_command, nextScrollRow) => { state.browserScroll = nextScrollRow; context.invalidate(); },
  });
  browserTable.rows.forEach((row) => {
    const definition = definitions[row.rowIndex]!;
    actions.push({
      id: `items:definition:${definition.id}`,
      label: labelFor(definition),
      role: 'option',
      bounds: row.bounds,
      activate: () => selectDefinition(definition.id),
    });
  });
  const scrollButtons = layoutUiFlex(browserSlots[1]!, [
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
  ], { gap: 4 });
  addAction(nodes, actions, 'items:browser-up', 'Previous definitions', scrollButtons[0]!, () => {
    state.browserScroll = scrollStudioCanvasTable(browserTable, 'page_up'); context.invalidate();
  }, { disabled: browserTable.firstRow === 0, glyph: 'up', visibleLabel: '' });
  addAction(nodes, actions, 'items:browser-down', 'Next definitions', scrollButtons[1]!, () => {
    state.browserScroll = scrollStudioCanvasTable(browserTable, 'page_down'); context.invalidate();
  }, { disabled: browserTable.firstRow === browserTable.maximumScrollRow, glyph: 'down', visibleLabel: '' });

  nodes.push(
    { id: 'items:details-panel', kind: 'thin_panel', bounds: details },
    { id: 'items:lifecycle-panel', kind: 'thin_panel', bounds: output },
  );
  const detailsLayout = layoutUiFrameSlots(details, 'thin', [
    { id: 'ribbon', ...flexItem(1, 30, { basis: 30, shrink: 0 }) },
    { id: 'title', ...flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }) },
    { id: 'fields', ...flexItem(1, 80, { grow: 1 }) },
    { id: 'json', ...flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }) },
    { id: 'apply', ...flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }) },
    { id: 'status', ...flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }) },
  ], { direction: 'column', gap: 4 });
  const detailsContent = detailsLayout.content;
  nodes.push({ id: 'items:details-ribbon', kind: 'ribbon', bounds: detailsLayout.slots.ribbon!, label: 'DEFINITION' });
  const detailsSlots = [
    detailsLayout.slots.title!, detailsLayout.slots.fields!, detailsLayout.slots.json!,
    detailsLayout.slots.apply!, detailsLayout.slots.status!,
  ];
  nodes.push({ id: 'items:details-title', kind: 'heading', bounds: detailsSlots[0]!,
    label: selected === null ? 'NO SELECTION' : labelFor(selected), clip: detailsContent });
  if (selected !== null) {
    fieldNodes(nodes, 'items:field', scalarFields(selected), detailsSlots[1]!);
    addAction(nodes, actions, 'items:definition-json', `JSON ${state.definition.snapshot().value.slice(0, 38)}`,
      detailsSlots[2]!, () => state.definition.focus(), { role: 'textbox', disabled: access === 'read_only' });
    const applyRect = layoutUiFlex(detailsSlots[3]!, [flexItem(116, BUTTON_HEIGHT, { basis: 116, shrink: 0 })], { align: 'stretch' })[0]!;
    addAction(nodes, actions, 'items:apply-json', 'APPLY JSON', applyRect, () => {
      try {
        state.model.upsertDefinition(JSON.parse(state.definition.snapshot().value));
        state.model.persistDraft();
        context.invalidate();
      } catch (error) { report(context, 'Definition validation failed', error); }
    }, { disabled: access === 'read_only', tone: 'success' });
  }
  const status = `${access.toUpperCase()} · HEAD ${snapshot.headRevision} · ${snapshot.diffs.length} CHANGES · ${snapshot.validation.errors.length} ERRORS`;
  nodes.push({ id: 'items:status', kind: 'label', bounds: detailsSlots[4]!, label: status, clip: detailsContent });

  const lifecycleState = state.lifecycle.snapshot();
  const selectedItemId = selected?.kind === 'item' ? selected.id : null;
  const itemHandlers = selectedItemId === null ? [] : state.lifecycle.handlers(selectedItemId);
  const selectedHandler = itemHandlers.find(({ id }) => id === state.lifecycleHandlerId) ?? null;
  const globalHandlerIndex = selectedHandler === null ? -1
    : lifecycleState.bundle.handlers.findIndex(({ id }) => id === selectedHandler.id);
  const handlerDiagnostics = lifecycleState.diagnostics.filter(({ path }) => (
    globalHandlerIndex < 0 || path === '' || path.startsWith(`handlers[${globalHandlerIndex}]`)
  ));
  const lifecycleLayout = layoutUiFrameSlots(output, 'thin', [
    { id: 'ribbon', ...flexItem(1, 30, { basis: 30, shrink: 0 }) },
    { id: 'mode', ...flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }) },
    { id: 'prompt', ...flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }) },
    { id: 'triggers', ...flexItem(1, 84, { basis: 84, shrink: 0 }) },
    { id: 'editor', ...flexItem(1, 60, { grow: 1 }) },
    { id: 'diagnostics', ...flexItem(1, 42, { basis: 42, shrink: 0 }) },
    { id: 'commands', ...flexItem(1, 84, { basis: 84, shrink: 0 }) },
    { id: 'warmStatus', ...flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }) },
  ], { direction: 'column', gap: 4 });
  nodes.push({ id: 'items:lifecycle-ribbon', kind: 'ribbon', bounds: lifecycleLayout.slots.ribbon!,
    label: selectedItemId === null ? 'ITEM LIFECYCLE' : 'ON USE' });

  const modeButtons = layoutUiFlex(lifecycleLayout.slots.mode!, [
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
  ], { gap: 4 });
  addAction(nodes, actions, 'items:lifecycle-mode-source', 'Edit callback source', modeButtons[0]!, () => {
    state.lifecycleEditorMode = 'source'; context.invalidate();
  }, { active: state.lifecycleEditorMode === 'source', glyph: 'wrench', visibleLabel: '' });
  addAction(nodes, actions, 'items:lifecycle-mode-bundle', 'Edit import/export bundle', modeButtons[1]!, () => {
    state.lifecycleEditorMode = 'bundle'; context.invalidate();
  }, { active: state.lifecycleEditorMode === 'bundle', glyph: 'square', visibleLabel: '' });
  addAction(nodes, actions, 'items:lifecycle-prompt',
    state.lifecyclePrompt.snapshot().value || 'CALLBACK PROMPT', lifecycleLayout.slots.prompt!,
    () => state.lifecyclePrompt.focus(), {
      role: 'textbox', disabled: selectedHandler === null || access === 'read_only',
    });
  const triggerLabels = ['2ND', 'EQ', 'WORLD', 'WITH', 'AT', 'AIM', 'PLACE'] as const;
  const triggerButtons = layoutUiFlex(lifecycleLayout.slots.triggers!,
    STUDIO_LIFECYCLE_TRIGGER_ORDER.map(() => flexItem(44, BUTTON_HEIGHT, { basis: 44, grow: 1, shrink: 0 })),
    { gap: 4, wrap: true });
  STUDIO_LIFECYCLE_TRIGGER_ORDER.forEach((trigger, index) => addAction(
    nodes, actions, `items:lifecycle-trigger:${trigger}`, `Toggle ${trigger} trigger`, triggerButtons[index]!, () => {
      if (state.lifecycleHandlerId === null) return;
      state.lifecycle.toggleTrigger(state.lifecycleHandlerId, trigger);
      context.invalidate();
    }, {
      disabled: selectedHandler === null || access === 'read_only',
      active: selectedHandler?.triggers.includes(trigger) === true,
      visibleLabel: triggerLabels[index],
    },
  ));

  const activeLifecycleEditor = state.lifecycleEditorMode === 'source' ? state.lifecycleSource : state.lifecycleBundle;
  const activeLifecycleEditorId = state.lifecycleEditorMode === 'source' ? 'items:lifecycle-source' : 'items:lifecycle-bundle';
  addAction(nodes, actions, activeLifecycleEditorId,
    activeLifecycleEditor.snapshot().value || (state.lifecycleEditorMode === 'source'
      ? 'CREATE OR SELECT AN ON USE CALLBACK' : 'EXPORT A BUNDLE OR PASTE ONE TO IMPORT'),
    lifecycleLayout.slots.editor!, () => activeLifecycleEditor.focus(), {
      role: 'textbox', multiline: true, textScale: 1,
      disabled: access === 'read_only' || (state.lifecycleEditorMode === 'source' && selectedHandler === null),
    });
  const diagnosticLines = handlerDiagnostics.length === 0
    ? [selectedHandler === null ? 'NO CALLBACK SELECTED' : 'AST VALID']
    : handlerDiagnostics.slice(0, 2).map(({ code, message }) => `${code.toUpperCase()}: ${message}`);
  fieldNodes(nodes, 'items:lifecycle-diagnostic', diagnosticLines, lifecycleLayout.slots.diagnostics!);

  const lifecycleCommands = layoutUiFlex(lifecycleLayout.slots.commands!, Array.from({
    length: 5,
  }, () => flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 })), { gap: 4, wrap: true });
  addAction(nodes, actions, 'items:lifecycle-create', 'Create onUse callback', lifecycleCommands[0]!, () => {
    if (selectedItemId === null) return;
    const created = state.lifecycle.create(selectedItemId);
    state.lifecycleHandlerId = created.id;
    state.lifecycleSyncedHandlerId = null;
    state.lifecycleEditorMode = 'source';
    context.invalidate();
  }, { disabled: selectedItemId === null || itemHandlers.length > 0 || access === 'read_only',
    glyph: 'star', visibleLabel: '' });
  addAction(nodes, actions, 'items:lifecycle-remove', 'Remove selected onUse callback', lifecycleCommands[1]!, () => {
    if (state.lifecycleHandlerId === null) return;
    state.lifecycle.remove(state.lifecycleHandlerId);
    state.lifecycleHandlerId = null;
    state.lifecycleSyncedHandlerId = null;
    context.invalidate();
  }, { disabled: selectedHandler === null || access === 'read_only', glyph: 'cross', visibleLabel: '', tone: 'danger' });
  addAction(nodes, actions, 'items:lifecycle-import', 'Import lifecycle source bundle', lifecycleCommands[2]!, () => {
    const imported = state.lifecycle.import(state.lifecycleBundle.snapshot().value);
    if (!imported.ok) {
      report(context, 'Lifecycle import failed', imported.diagnostics[0]?.message ?? 'Invalid lifecycle bundle.');
      return;
    }
    state.lifecycleHandlerId = null;
    state.lifecycleSyncedHandlerId = null;
    context.controller.notifications.push('success', 'Lifecycle bundle imported', 'Saved as a local warm-release draft; game code is unchanged.');
    context.invalidate();
  }, { disabled: access === 'read_only' || state.lifecycleEditorMode !== 'bundle'
    || state.lifecycleBundle.snapshot().value.trim().length === 0, glyph: 'down', visibleLabel: '' });
  addAction(nodes, actions, 'items:lifecycle-export', 'Export deterministic lifecycle source bundle', lifecycleCommands[3]!, () => {
    const exported = state.lifecycle.export();
    if (!exported.ok) {
      report(context, 'Lifecycle export blocked', exported.diagnostics[0]?.message ?? 'Fix lifecycle diagnostics first.');
      return;
    }
    state.lifecycleBundle.setValue(exported.value);
    state.lifecycleEditorMode = 'bundle';
    context.controller.notifications.push('success', 'Lifecycle bundle prepared', 'Compiler-valid warm-release source; it is not live.');
    context.invalidate();
  }, { disabled: !lifecycleState.valid, glyph: 'up', visibleLabel: '' });
  addAction(nodes, actions, 'items:lifecycle-download', 'Download lifecycle source bundle', lifecycleCommands[4]!, () => {
    const download = state.lifecycle.download();
    if (!download.ok) {
      report(context, 'Lifecycle download blocked', download.diagnostics[0]?.message ?? 'Fix lifecycle diagnostics first.');
      return;
    }
    const requested = requestStudioFileDownload({ filename: download.value.filename, blob: download.value.blob });
    if (!requested.ok) report(context, 'Lifecycle download unavailable', requested.message);
    else context.controller.notifications.push('success', 'Lifecycle download requested', `${download.value.filename} · NOT LIVE`);
    context.invalidate();
  }, { disabled: !lifecycleState.valid, glyph: 'down_1', visibleLabel: '' });
  nodes.push({
    id: 'items:lifecycle-status', kind: 'label', bounds: lifecycleLayout.slots.warmStatus!,
    label: `WARM DRAFT · R${lifecycleState.bundle.revision} · ${lifecycleState.valid ? 'VALID' : `${lifecycleState.diagnostics.length} ERRORS`} · NOT LIVE`,
    clip: lifecycleLayout.content,
  });

  context.controller.validation.setIssues([
    ...snapshot.validation.errors.map((issue, index) => ({ id: `items:error:${index}`, severity: 'error' as const, message: issue.message })),
    ...snapshot.validation.warnings.map((issue, index) => ({ id: `items:warning:${index}`, severity: 'warning' as const, message: issue.message })),
    ...lifecycleState.diagnostics.map((issue, index) => ({ id: `items:lifecycle-error:${index}`,
      severity: 'error' as const, message: issue.message })),
  ]);
  return prefixSurface(context, nodes, actions, tables, state);
}
