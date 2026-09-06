import type {
  DialogueContentDefinition,
  NpcContentDefinition,
  QuestContentDefinition,
  SupportedContentDefinition,
} from '@orchard/sim';
import {
  CanvasTextEditor,
  layoutStudioCanvasTable,
  layoutUiFlex,
  layoutUiFrameSlots,
  scrollStudioCanvasTable,
  studioCanvasFrameContentRect,
  type FantasyButtonGlyph,
  type StudioCanvasShellNode,
  type UiFlexItem,
  type UiRect,
} from '@orchard/ui';
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
} from '../items/connection.js';
import {
  createNarrativeWorkspace,
  type DialogueGraphNode,
  type DialoguePlayState,
  type NarrativeKind,
  type NarrativeWorkspaceModel,
  type QuestProgressFixture,
} from './model.js';

interface NarrativeCanvasState {
  readonly model: NarrativeWorkspaceModel;
  readonly query: CanvasTextEditor;
  readonly note: CanvasTextEditor;
  readonly definition: CanvasTextEditor;
  readonly fixture: CanvasTextEditor;
  selectedId: string | null;
  syncedId: string | null;
  browserScroll: number;
  play: DialoguePlayState | null;
  questFixture: QuestProgressFixture;
  includeRetired: boolean;
  mutationSequence: number;
}

const BUTTON_HEIGHT = 42;
const LAYOUT_GAP = 6;

function flexItem(width: number, height: number, options: Partial<UiFlexItem> = {}): UiFlexItem {
  return { minSize: { width, height }, ...options };
}

function routeKind(path: string): NarrativeKind {
  if (path === '/author/dialogue') return 'dialogue';
  if (path === '/author/quests') return 'quest';
  return 'npc';
}

function definitionLabel(definition: SupportedContentDefinition): string {
  if ('displayName' in definition && typeof definition.displayName === 'string') return definition.displayName;
  if ('title' in definition && typeof definition.title === 'string') return definition.title;
  return definition.id;
}

function scalarFields(value: unknown, path = '$', result: string[] = []): readonly string[] {
  if (result.length >= 60) return result;
  if (value === null || typeof value !== 'object') {
    result.push(`${path}: ${String(value)}`);
  } else if (Array.isArray(value)) {
    if (value.length === 0) result.push(`${path}: []`);
    value.forEach((entry, index) => scalarFields(entry, `${path}[${index}]`, result));
  } else {
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) =>
      scalarFields(entry, path === '$' ? key : `${path}.${key}`, result));
  }
  return result;
}

function report(context: StudioCanvasToolContext, title: string, error: unknown): void {
  context.controller.notifications.push('error', title, error instanceof Error ? error.message : String(error));
  context.invalidate();
}

function createState(context: StudioCanvasToolContext): NarrativeCanvasState {
  const live = context.controller.liveAdapter();
  const view = live?.view();
  const access = itemsAccessForConnection(context.route.access, live);
  const head = view === undefined ? null : itemsHeadFromConnection(view);
  const model = createNarrativeWorkspace({
    access,
    ...(head === null ? {} : { head }),
    history: view === undefined ? [] : itemsHistoryFromConnection(view),
    ...(access === 'write' && live !== null ? {
      createPublishAdapter: () => {
        const adapter = itemsPublishAdapterFromConnection(live);
        if (adapter === null) throw new Error('narrative_publish_unavailable');
        return adapter;
      },
    } : {}),
  });
  const kind = routeKind(context.route.path);
  return {
    model,
    query: new CanvasTextEditor({ maxLength: 120 }),
    note: new CanvasTextEditor({ maxLength: 500 }),
    definition: new CanvasTextEditor({ maxLength: 64_000, multiline: true }),
    fixture: new CanvasTextEditor({ value: '{}', maxLength: 16_000, multiline: true }),
    selectedId: model.definitions(kind)[0]?.id ?? null,
    syncedId: null,
    browserScroll: 0,
    play: null,
    questFixture: {},
    includeRetired: false,
    mutationSequence: 0,
  };
}

function createDefinition(state: NarrativeCanvasState, kind: NarrativeKind): void {
  const index = state.model.definitions(kind, '', true).length + 1;
  const slug = `draft_${kind}_${index}`;
  const npc = state.model.definitions('npc')[0];
  const dialogue = state.model.definitions('dialogue')[0];
  const value = kind === 'npc' ? {
    id: `npc:${slug}`, kind: 'npc', schemaVersion: 1, runtimeId: `draft-${index}`,
    actorAsset: npc?.kind === 'npc' ? npc.actorAsset : 'npc_cf_farmer_bob',
    displayName: `New NPC ${index}`, home: { spaceId: 0, tileX: 0, tileY: 0 },
    facing: 'down', ai: { kind: 'stationary' },
    dialogue: dialogue?.kind === 'dialogue' ? dialogue.id : 'dialogue:tool_merchant',
    questGiver: [], health: 100,
  } : kind === 'dialogue' ? {
    id: `dialogue:${slug}`, kind: 'dialogue', schemaVersion: 1, initialNodeId: 'start',
    nodes: [{ id: 'start', speaker: 'Narrator', body: 'New dialogue.', mode: 'dialogue', choices: [] }],
  } : {
    id: `quest:${slug}`, kind: 'quest', schemaVersion: 1, title: `New Quest ${index}`,
    summary: 'Describe the quest.', giver: npc?.kind === 'npc' ? npc.id : 'npc:marlow',
    objectives: [{ id: 'action', kind: 'action', label: 'Complete the action', actionKind: slug, count: 1 }],
    rewards: { bronze: 0, experience: [], items: [] },
  };
  state.model.upsertDefinition(value);
  state.selectedId = `${kind}:${slug}`;
  state.syncedId = null;
  state.browserScroll = 0;
}

function action(
  nodes: StudioCanvasShellNode[], actions: StudioCanvasToolAction[], id: string, label: string,
  bounds: UiRect, activate: () => void,
  options: {
    readonly role?: StudioCanvasToolAction['role'];
    readonly disabled?: boolean;
    readonly active?: boolean;
    readonly tone?: StudioCanvasShellNode['tone'];
    readonly glyph?: FantasyButtonGlyph;
    readonly visibleLabel?: string;
  } = {},
): void {
  const disabled = options.disabled === true;
  nodes.push({
    id,
    kind: options.role === 'textbox' ? 'field' : options.role === 'tab' ? 'tab' : 'button',
    bounds,
    label: options.visibleLabel ?? label,
    glyph: options.glyph,
    state: disabled ? 'disabled' : options.active ? 'active' : 'idle',
    tone: options.tone,
  });
  actions.push({ id, label, role: options.role ?? 'button', bounds, disabled, activate });
}

function fieldNodes(
  nodes: StudioCanvasShellNode[], id: string, values: readonly string[], bounds: UiRect,
  tone?: (value: string) => StudioCanvasShellNode['tone'],
): void {
  const count = Math.min(values.length, Math.max(0, Math.floor(bounds.height / BUTTON_HEIGHT)));
  const rows = layoutUiFlex(bounds, values.slice(0, count).map(() => flexItem(1, 36, { basis: 36, shrink: 0 })),
    { direction: 'column', gap: 4 });
  rows.forEach((row, index) => nodes.push({
    id: `${id}:${index}`,
    kind: 'field',
    bounds: row,
    clip: bounds,
    label: values[index]!,
    tone: tone?.(values[index]!),
  }));
}

function prefixSurface(
  context: StudioCanvasToolContext,
  nodes: readonly StudioCanvasShellNode[],
  actions: readonly StudioCanvasToolAction[],
  tables: readonly StudioCanvasToolTable[],
  state: NarrativeCanvasState,
): StudioCanvasToolSurface {
  const prefix = `${context.route.tool.id}-`;
  return Object.freeze({
    nodes: Object.freeze(nodes.map((node) => Object.freeze({ ...node, id: `${prefix}${node.id}` }))),
    actions: Object.freeze(actions.map((entry) => Object.freeze({ ...entry, id: `${prefix}${entry.id}` }))),
    tables: Object.freeze(tables.map((entry) => Object.freeze({ ...entry, id: `${prefix}${entry.id}` }))),
    textEditors: Object.freeze([
      { id: 'narrative:query', editor: state.query },
      { id: 'narrative:note', editor: state.note },
      { id: 'narrative:definition-json', editor: state.definition },
      { id: 'narrative:fixture', editor: state.fixture },
    ].map((entry) => Object.freeze({ ...entry, id: `${prefix}${entry.id}` }))),
  });
}

export function buildNarrativeCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const live = context.controller.liveAdapter();
  const view = live?.view();
  const access = itemsAccessForConnection(context.route.access, live);
  const identity = view?.identity ?? 'anonymous';
  const state = context.controller.toolState(`narrative-canvas:${identity}:${access}`, () => createState(context));
  const head = view === undefined ? null : itemsHeadFromConnection(view);
  if (head !== null) state.model.receiveHead(head);
  state.model.receiveHistory(view === undefined ? [] : itemsHistoryFromConnection(view));

  const kind = routeKind(context.route.path);
  const entries = state.model.browser(kind, state.query.snapshot().value, state.includeRetired);
  if (state.selectedId === null || !entries.some(({ id }) => id === state.selectedId)) {
    state.selectedId = entries[0]?.id ?? null;
    state.syncedId = null;
    state.play = null;
  }
  const selected = state.model.definitions(kind, '', true).find(({ id }) => id === state.selectedId);
  if (state.syncedId !== selected?.id) {
    state.definition.setValue(selected === undefined ? '' : JSON.stringify(selected, null, 2));
    state.syncedId = selected?.id ?? null;
    state.play = selected?.kind === 'dialogue' ? state.model.startDialogue(selected.id) : null;
  }

  const snapshot = state.model.snapshot();
  const controlsBounds = context.controlsBounds ?? context.bounds;
  const workspaceBounds = context.workspaceBounds ?? context.bounds;
  const nodes: StudioCanvasShellNode[] = [
    { id: 'narrative:controls-panel', kind: 'parchment_panel', bounds: controlsBounds },
    { id: 'narrative:surface', kind: 'parchment_panel', bounds: workspaceBounds },
  ];
  const actions: StudioCanvasToolAction[] = [];
  const tables: StudioCanvasToolTable[] = [];
  const controlLayout = layoutUiFrameSlots(controlsBounds, 'wood_parchment', [
    { id: 'fields', ...flexItem(1, 88, { basis: 88, shrink: 0 }) },
    { id: 'toolbar', ...flexItem(1, 88, { basis: 88, shrink: 0 }) },
    { id: 'status', ...flexItem(1, 64, { basis: 64, shrink: 1 }) },
    { id: 'spacer', ...flexItem(1, 1, { grow: 1 }) },
  ], { direction: 'column', gap: LAYOUT_GAP });
  const fields = layoutUiFlex(controlLayout.slots.fields!, [
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
  ], { direction: 'column', gap: 4 });
  action(nodes, actions, 'narrative:query', `SEARCH ${state.query.snapshot().value || '…'}`, fields[0]!, () => state.query.focus(), { role: 'textbox' });
  action(nodes, actions, 'narrative:note', `NOTE ${state.note.snapshot().value || '…'}`, fields[1]!, () => state.note.focus(), { role: 'textbox' });
  const toolbar = layoutUiFlex(controlLayout.slots.toolbar!, [
    flexItem(80, BUTTON_HEIGHT, { basis: 80, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(80, BUTTON_HEIGHT, { basis: 80, shrink: 0 }),
  ], { gap: 4, wrap: true });
  action(nodes, actions, 'narrative:new', `NEW ${kind.toUpperCase()}`, toolbar[0]!, () => {
    try { createDefinition(state, kind); context.invalidate(); }
    catch (error) { report(context, `New ${kind} failed`, error); }
  }, { disabled: access === 'read_only', tone: 'success', glyph: 'star' });
  action(nodes, actions, 'narrative:retired', 'Include retired definitions', toolbar[1]!, () => {
    state.includeRetired = !state.includeRetired; state.browserScroll = 0; context.invalidate();
  }, { active: state.includeRetired, glyph: 'alert', visibleLabel: '' });
  action(nodes, actions, 'narrative:undo', 'Undo', toolbar[2]!, () => { state.model.undo(); context.invalidate(); },
    { disabled: !snapshot.canUndo, glyph: 'back', visibleLabel: '' });
  action(nodes, actions, 'narrative:redo', 'Redo', toolbar[3]!, () => { state.model.redo(); context.invalidate(); },
    { disabled: !snapshot.canRedo, glyph: 'return', visibleLabel: '' });
  action(nodes, actions, 'narrative:rebase', 'Rebase', toolbar[4]!, () => {
    try { state.model.rebase(); context.invalidate(); } catch (error) { report(context, 'Narrative rebase blocked', error); }
  }, { disabled: !snapshot.conflict, glyph: 'down', visibleLabel: '' });
  action(nodes, actions, 'narrative:publish', 'PUBLISH', toolbar[5]!, () => {
    state.mutationSequence += 1;
    void state.model.publish(`narrative.canvas.${state.mutationSequence}`, state.note.snapshot().value)
      .then(() => context.controller.notifications.push('success', 'Narrative published', 'Waiting for the verified live head.'))
      .catch((error: unknown) => report(context, 'Narrative publish failed', error)).finally(context.invalidate);
  }, { disabled: !snapshot.canPublish, tone: 'success' });
  nodes.push({ id: 'narrative:status', kind: 'label', bounds: controlLayout.slots.status!,
    label: `${kind.toUpperCase()} · ${access.toUpperCase()} · HEAD ${snapshot.headRevision} · ${snapshot.diffs.length} CHANGES · ${snapshot.validation.errors.length} ERRORS${snapshot.conflict ? ' · CONFLICT' : ''}` });
  const history = state.model.history().slice(0, Math.max(0,
    Math.floor(controlLayout.slots.spacer!.height / (BUTTON_HEIGHT + 4))));
  const historyRects = layoutUiFlex(controlLayout.slots.spacer!,
    history.map(() => flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 })),
    { direction: 'column', gap: 4 });
  history.forEach((revision, index) => action(nodes, actions, `narrative:history:${revision.revision}`,
    `R${revision.revision} ${revision.note || 'UNTITLED'}`, historyRects[index]!, () => {
      try {
        const revisionPreview = state.model.previewRevision(revision.revision, 'published_change');
        context.controller.notifications.push('info', `Revision ${revision.revision}`,
          `${revisionPreview.diffs.length} published changes.`);
      } catch (error) { report(context, 'Narrative revision preview failed', error); }
    }, { role: 'option' }));

  const workspaceContent = studioCanvasFrameContentRect(workspaceBounds, 'parchment_panel');
  const workspace = layoutUiFlex(workspaceContent, [
    flexItem(190, 240, { basis: 250, grow: 1 }),
    flexItem(280, 240, { basis: 410, grow: 2 }),
    flexItem(220, 240, { basis: 330, grow: 1 }),
  ], { gap: LAYOUT_GAP });
  const [browser, editor, preview] = workspace as [UiRect, UiRect, UiRect];
  const browserSlots = layoutUiFlex(browser, [
    flexItem(1, 120, { grow: 1 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
  ], { direction: 'column', gap: 4 });
  const browserTable = layoutStudioCanvasTable({
    columns: [
      { id: 'name', label: `${kind.toUpperCase()} (${entries.length})`, minWidth: 110 },
      { id: 'refs', label: 'REFS', width: 54 },
    ],
    rows: entries.map((entry) => ({
      id: entry.id,
      cells: [entry.label, String(entry.referencedBy)],
      selected: entry.id === state.selectedId,
    })),
    scrollRow: state.browserScroll,
    rowHeight: BUTTON_HEIGHT,
    headerHeight: BUTTON_HEIGHT,
    frameStyle: 'thin',
    emptyLabel: `No ${kind} definitions`,
  }, browserSlots[0]!);
  state.browserScroll = browserTable.firstRow;
  const selectDefinition = (definitionId: string): void => {
    const entry = entries.find(({ id }) => id === definitionId);
    if (entry === undefined) return;
    state.selectedId = entry.id;
    state.syncedId = null;
    context.controller.selection.select({ kind: 'definition', definitionKind: entry.kind, id: entry.id });
    context.invalidate();
  };
  tables.push({
    id: 'narrative:browser-table',
    layout: browserTable,
    onHit: (hit) => { if (hit.kind !== 'header') selectDefinition(hit.rowId); },
    onScroll: (_command, nextScrollRow) => { state.browserScroll = nextScrollRow; context.invalidate(); },
  });
  browserTable.rows.forEach((row) => {
    const entry = entries[row.rowIndex]!;
    actions.push({ id: `narrative:definition:${entry.id}`, label: entry.label, role: 'option', bounds: row.bounds,
      activate: () => selectDefinition(entry.id) });
  });
  const scrollButtons = layoutUiFlex(browserSlots[1]!, [
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
  ], { gap: 4 });
  action(nodes, actions, 'narrative:browser-up', 'Previous definitions', scrollButtons[0]!, () => {
    state.browserScroll = scrollStudioCanvasTable(browserTable, 'page_up'); context.invalidate();
  }, { disabled: browserTable.firstRow === 0, glyph: 'up', visibleLabel: '' });
  action(nodes, actions, 'narrative:browser-down', 'Next definitions', scrollButtons[1]!, () => {
    state.browserScroll = scrollStudioCanvasTable(browserTable, 'page_down'); context.invalidate();
  }, { disabled: browserTable.firstRow === browserTable.maximumScrollRow, glyph: 'down', visibleLabel: '' });

  nodes.push(
    { id: 'narrative:editor-panel', kind: 'parchment_panel', bounds: editor },
    { id: 'narrative:preview-panel', kind: 'wood_panel', bounds: preview },
  );
  const editorContent = studioCanvasFrameContentRect(editor, 'parchment_panel');
  const editorSlots = layoutUiFlex(editorContent, [
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    flexItem(1, 80, { grow: 1 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
  ], { direction: 'column', gap: 4 });
  nodes.push({ id: 'narrative:editor-title', kind: 'heading', bounds: editorSlots[0]!,
    label: selected === undefined ? 'NO SELECTION' : definitionLabel(selected), clip: editorContent });
  if (selected !== undefined) {
    fieldNodes(nodes, 'narrative:field', scalarFields(selected), editorSlots[1]!);
    action(nodes, actions, 'narrative:definition-json', `JSON ${state.definition.snapshot().value.slice(0, 42)}`,
      editorSlots[2]!, () => state.definition.focus(), { role: 'textbox', disabled: access === 'read_only' });
    const apply = layoutUiFlex(editorSlots[3]!, [flexItem(116, BUTTON_HEIGHT, { basis: 116, shrink: 0 })])[0]!;
    action(nodes, actions, 'narrative:apply-json', 'APPLY JSON', apply, () => {
      try { state.model.upsertDefinition(JSON.parse(state.definition.snapshot().value)); context.invalidate(); }
      catch (error) { report(context, 'Narrative definition invalid', error); }
    }, { disabled: access === 'read_only', tone: 'success' });
  }

  const previewContent = studioCanvasFrameContentRect(preview, 'wood_panel');
  const previewSlots = layoutUiFlex(previewContent, [
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    flexItem(1, 160, { grow: 1 }),
  ], { direction: 'column', gap: 4 });
  nodes.push({ id: 'narrative:preview-title', kind: 'heading', bounds: previewSlots[0]!, label: `${kind.toUpperCase()} PREVIEW` });
  if (selected?.kind === 'npc') renderNpcPreview(nodes, previewSlots[1]!, state.model, selected);
  else if (selected?.kind === 'dialogue') renderDialoguePreview(nodes, actions, previewSlots[1]!, state, selected, context);
  else if (selected?.kind === 'quest') renderQuestPreview(nodes, actions, previewSlots[1]!, state, selected, context);

  context.controller.validation.setIssues([
    ...snapshot.validation.errors.map((issue, index) => ({ id: `narrative:error:${index}`, severity: 'error' as const, message: issue.message })),
    ...snapshot.validation.warnings.map((issue, index) => ({ id: `narrative:warning:${index}`, severity: 'warning' as const, message: issue.message })),
  ]);
  return prefixSurface(context, nodes, actions, tables, state);
}

function renderNpcPreview(
  nodes: StudioCanvasShellNode[], bounds: UiRect, model: NarrativeWorkspaceModel, definition: NpcContentDefinition,
): void {
  const preview = model.npcPreview(definition.id);
  const lines = [
    preview.definition.displayName,
    `PORTRAIT ${preview.portraitAsset}`,
    `HOME ${definition.home.spaceId}:${definition.home.tileX},${definition.home.tileY}`,
    `DIALOGUE ${preview.dialogue?.nodes.length ?? 0} NODES`,
    `QUESTS ${preview.quests.length}`,
    `SHOP ${preview.shop?.offers.length ?? 0} OFFERS`,
    ...(definition.barks ?? []).map((bark) => `BARK “${bark}”`),
  ];
  fieldNodes(nodes, 'narrative:npc-preview', lines, bounds);
}

function renderDialoguePreview(
  nodes: StudioCanvasShellNode[], actions: StudioCanvasToolAction[], bounds: UiRect,
  state: NarrativeCanvasState, definition: DialogueContentDefinition, context: StudioCanvasToolContext,
): void {
  const graph = state.model.dialoguePreview(definition.id);
  const graphNodes = graph.nodes;
  const regions = layoutUiFlex(bounds, [
    flexItem(1, 150, { basis: 250, grow: 2 }),
    flexItem(1, 100, { grow: 1 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
  ], { direction: 'column', gap: 4 });
  const graphCapacity = Math.max(1, Math.floor(regions[0]!.height / (BUTTON_HEIGHT + 3)));
  const graphNodeCount = Math.min(graphNodes.length, 3, Math.max(1, Math.ceil(graphCapacity * 0.6)));
  const graphEdgeCount = Math.min(graph.edges.length, 2, Math.max(0, graphCapacity - graphNodeCount));
  const graphLines: readonly (
    | { readonly id: string; readonly label: string; readonly node: DialogueGraphNode }
    | { readonly id: string; readonly label: string }
  )[] = [
    ...graphNodes.slice(0, graphNodeCount).map((node) => ({ id: `narrative:graph-node:${node.id}`, label: `${node.id} · ${node.speaker}: ${node.body}`, node })),
    ...graph.edges.slice(0, graphEdgeCount).map((edge) => ({ id: `narrative:graph-edge:${edge.id}`, label: `EDGE ${edge.from} → ${edge.to} (${edge.choiceId})` })),
  ];
  const graphRects = layoutUiFlex(regions[0]!, graphLines.map(() => flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 })),
    { direction: 'column', gap: 3 });
  graphLines.forEach((line, index) => {
    const dialogueNode = 'node' in line ? line.node : null;
    if (dialogueNode !== null) {
      action(nodes, actions, line.id, line.label, graphRects[index]!, () => {
        state.model.moveDialogueNode(definition.id, dialogueNode.id, dialogueNode.x + 16, dialogueNode.y);
        context.invalidate();
      }, { role: 'option' });
    } else {
      nodes.push({ id: line.id, kind: 'label', bounds: graphRects[index]!, label: line.label, clip: regions[0] });
    }
  });
  if (state.play?.currentNodeId !== null && state.play?.currentNodeId !== undefined) {
    const current = graph.nodes.find(({ id }) => id === state.play?.currentNodeId);
    const choiceCapacity = Math.max(0, Math.floor((regions[1]!.height - BUTTON_HEIGHT) / (BUTTON_HEIGHT + 3)));
    const choices = state.model.availableChoices(state.play).slice(0, choiceCapacity);
    const playRects = layoutUiFlex(regions[1]!, [
      flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
      ...choices.map(() => flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 1 })),
    ], { direction: 'column', gap: 3 });
    nodes.push({ id: 'narrative:dialogue-current', kind: 'field', bounds: playRects[0]!,
      label: current === undefined ? 'MISSING PLAYBACK NODE' : `PLAY ${current.speaker}: ${current.body}` });
    choices.forEach((choice, index) => action(nodes, actions, `narrative:choice:${choice.id}`, choice.label,
      playRects[index + 1]!, () => {
        state.play = state.model.chooseDialogue(state.play!, choice.id);
        context.invalidate();
      }));
  } else {
    nodes.push({ id: 'narrative:dialogue-end', kind: 'label', bounds: regions[1]!,
      label: `END${state.play?.openedShop === null || state.play?.openedShop === undefined ? '' : ` · ${state.play.openedShop}`}` });
  }
  const restart = layoutUiFlex(regions[2]!, [flexItem(170, BUTTON_HEIGHT, { basis: 170, shrink: 0 })])[0]!;
  action(nodes, actions, 'narrative:restart-dialogue', 'RESTART PLAY-THROUGH', restart, () => {
    try {
      const fixture = JSON.parse(state.fixture.snapshot().value) as Readonly<Record<string, 'available' | 'active' | 'complete' | 'turned_in'>>;
      state.play = state.model.startDialogue(definition.id, fixture);
      context.invalidate();
    } catch (error) { report(context, 'Dialogue fixture invalid', error); }
  }, { glyph: 'play' });
}

function renderQuestPreview(
  nodes: StudioCanvasShellNode[], actions: StudioCanvasToolAction[], bounds: UiRect,
  state: NarrativeCanvasState, definition: QuestContentDefinition, context: StudioCanvasToolContext,
): void {
  const preview = state.model.questPreview(definition.id, state.questFixture);
  const regions = layoutUiFlex(bounds, [
    flexItem(1, 54, { basis: 54, shrink: 0 }),
    flexItem(1, 80, { grow: 1 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
  ], { direction: 'column', gap: 4 });
  nodes.push({ id: 'narrative:quest-summary', kind: 'field', bounds: regions[0]!,
    label: `${preview.available ? 'AVAILABLE' : 'LOCKED'} · ${preview.complete ? 'COMPLETE' : 'IN PROGRESS'} · ${definition.summary}`,
    tone: preview.complete ? 'success' : 'normal' });
  fieldNodes(nodes, 'narrative:quest-objective', preview.objectives.map((objective) =>
    `${objective.complete ? '✓' : '○'} ${objective.label} ${objective.current}/${objective.required}`), regions[1]!,
  (line) => line.startsWith('✓') ? 'success' : 'normal');
  nodes.push({ id: 'narrative:quest-rewards', kind: 'label', bounds: regions[2]!,
    label: `REWARDS ${preview.rewards.bronze} BRONZE · ${preview.rewards.items.length} ITEMS · ${preview.rewards.experience.length} XP` });
  action(nodes, actions, 'narrative:fixture', `FIXTURE ${state.fixture.snapshot().value.slice(0, 28)}`,
    regions[3]!, () => state.fixture.focus(), { role: 'textbox' });
  const apply = layoutUiFlex(regions[4]!, [flexItem(190, BUTTON_HEIGHT, { basis: 190, shrink: 0 })])[0]!;
  action(nodes, actions, 'narrative:apply-fixture', 'APPLY COMPLETION', apply, () => {
    try { state.questFixture = JSON.parse(state.fixture.snapshot().value) as QuestProgressFixture; context.invalidate(); }
    catch (error) { report(context, 'Quest fixture invalid', error); }
  }, { tone: 'success' });
}
