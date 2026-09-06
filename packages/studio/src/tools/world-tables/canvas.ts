import type { SupportedContentDefinition } from '@orchard/sim';
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
import bootstrapManifest from './fixtures/bootstrap-pack-manifest.json';
import {
  WORLD_TABLE_KINDS,
  createWorldAuthoringModel,
  diffWorldPackManifest,
  planBoundedPackImport,
  serializeWorldPack,
  worldPackManifest,
  type WorldAuthoringModel,
  type WorldPlaytestRequest,
  type WorldTableKind,
} from './model.js';

interface WorldCanvasState {
  readonly model: WorldAuthoringModel;
  readonly query: CanvasTextEditor;
  readonly note: CanvasTextEditor;
  readonly definition: CanvasTextEditor;
  readonly pack: CanvasTextEditor;
  readonly targetPlayer: CanvasTextEditor;
  readonly spaceId: CanvasTextEditor;
  readonly tileX: CanvasTextEditor;
  readonly tileY: CanvasTextEditor;
  readonly rank: CanvasTextEditor;
  kind: WorldTableKind | undefined;
  selectedId: string | null;
  syncedId: string | null;
  browserScroll: number;
  mutationSequence: number;
  batchSummary: string;
}

const BUTTON_HEIGHT = 42;
const LAYOUT_GAP = 6;

function flexItem(width: number, height: number, options: Partial<UiFlexItem> = {}): UiFlexItem {
  return { minSize: { width, height }, ...options };
}

function labelFor(definition: SupportedContentDefinition): string {
  if ('displayName' in definition && typeof definition.displayName === 'string') return definition.displayName;
  if ('name' in definition && typeof definition.name === 'string') return definition.name;
  if ('title' in definition && typeof definition.title === 'string') return definition.title;
  return definition.id;
}

function scalarFields(value: unknown, path = '$', result: string[] = []): readonly string[] {
  if (result.length >= 64) return result;
  if (value === null || typeof value !== 'object') result.push(`${path}: ${String(value)}`);
  else if (Array.isArray(value)) {
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

function createState(context: StudioCanvasToolContext): WorldCanvasState {
  const live = context.controller.liveAdapter();
  const view = live?.view();
  const access = itemsAccessForConnection(context.route.access, live);
  const head = view === undefined ? null : itemsHeadFromConnection(view);
  const model = createWorldAuthoringModel({
    access,
    ...(head === null ? {} : { head }),
    history: view === undefined ? [] : itemsHistoryFromConnection(view),
    ...(access === 'write' && live !== null ? {
      createPublishAdapter: () => {
        const adapter = itemsPublishAdapterFromConnection(live);
        if (adapter === null) throw new Error('world_content_publish_unavailable');
        return adapter;
      },
    } : {}),
    ...(access === 'write' && (view?.role === 'owner' || view?.role === 'admin')
      && live?.worldPlaytest?.source === 'live' ? { createPlaytestAdapter: () => live.worldPlaytest! } : {}),
  });
  const kind = context.route.tool.id === 'pack-studio' ? undefined : 'crop';
  const spaceId = new CanvasTextEditor({ maxLength: 5 }); spaceId.setValue('0');
  const rank = new CanvasTextEditor({ maxLength: 3 }); rank.setValue('1');
  return {
    model,
    query: new CanvasTextEditor({ maxLength: 120 }),
    note: new CanvasTextEditor({ maxLength: 500 }),
    definition: new CanvasTextEditor({ maxLength: 64_000, multiline: true }),
    pack: new CanvasTextEditor({ maxLength: 2_000_000, multiline: true }),
    targetPlayer: new CanvasTextEditor({ maxLength: 128 }),
    spaceId,
    tileX: new CanvasTextEditor({ maxLength: 7 }),
    tileY: new CanvasTextEditor({ maxLength: 7 }),
    rank,
    kind,
    selectedId: model.browser(kind)[0]?.id ?? null,
    syncedId: null,
    browserScroll: 0,
    mutationSequence: 0,
    batchSummary: '',
  };
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
  rows.forEach((row, index) => nodes.push({ id: `${id}:${index}`, kind: 'field', bounds: row, clip: bounds,
    label: values[index]!, tone: tone?.(values[index]!) }));
}

function prefixSurface(
  context: StudioCanvasToolContext,
  nodes: readonly StudioCanvasShellNode[],
  actions: readonly StudioCanvasToolAction[],
  tables: readonly StudioCanvasToolTable[],
  state: WorldCanvasState,
): StudioCanvasToolSurface {
  const prefix = `${context.route.tool.id}-`;
  return Object.freeze({
    nodes: Object.freeze(nodes.map((node) => Object.freeze({ ...node, id: `${prefix}${node.id}` }))),
    actions: Object.freeze(actions.map((entry) => Object.freeze({ ...entry, id: `${prefix}${entry.id}` }))),
    tables: Object.freeze(tables.map((entry) => Object.freeze({ ...entry, id: `${prefix}${entry.id}` }))),
    textEditors: Object.freeze([
      { id: 'world:query', editor: state.query },
      { id: 'world:note', editor: state.note },
      { id: 'world:definition-json', editor: state.definition },
      { id: 'world:pack-json', editor: state.pack },
      { id: 'world:playtest-target', editor: state.targetPlayer },
      { id: 'world:playtest-space', editor: state.spaceId },
      { id: 'world:playtest-x', editor: state.tileX },
      { id: 'world:playtest-y', editor: state.tileY },
      { id: 'world:playtest-rank', editor: state.rank },
    ].map((entry) => Object.freeze({ ...entry, id: `${prefix}${entry.id}` }))),
  });
}

export function buildWorldAuthoringCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const live = context.controller.liveAdapter();
  const view = live?.view();
  const access = itemsAccessForConnection(context.route.access, live);
  const identity = view?.identity ?? 'anonymous';
  const state = context.controller.toolState(`world-authoring-canvas:${identity}:${access}`, () => createState(context));
  const head = view === undefined ? null : itemsHeadFromConnection(view);
  if (head !== null) state.model.receiveHead(head);
  state.model.receiveHistory(view === undefined ? [] : itemsHistoryFromConnection(view));

  const snapshot = state.model.snapshot();
  const entries = state.model.browser(state.kind, state.query.snapshot().value);
  if (state.selectedId === null || !entries.some(({ id }) => id === state.selectedId)) {
    state.selectedId = entries[0]?.id ?? null;
    state.syncedId = null;
  }
  const selected = state.selectedId === null ? null : state.model.definition(state.selectedId);
  if (state.syncedId !== selected?.id) {
    state.definition.setValue(selected === null ? '' : JSON.stringify(selected, null, 2));
    state.syncedId = selected?.id ?? null;
  }

  const controlsBounds = context.controlsBounds ?? context.bounds;
  const workspaceBounds = context.workspaceBounds ?? context.bounds;
  const nodes: StudioCanvasShellNode[] = [
    { id: 'world:controls-panel', kind: 'parchment_panel', bounds: controlsBounds },
    { id: 'world:surface', kind: 'parchment_panel', bounds: workspaceBounds },
  ];
  const actions: StudioCanvasToolAction[] = [];
  const tables: StudioCanvasToolTable[] = [];
  const kinds = context.route.tool.id === 'pack-studio' ? ([undefined, ...WORLD_TABLE_KINDS] as const) : WORLD_TABLE_KINDS;
  const kindSpecs = kinds.map(() => flexItem(44, BUTTON_HEIGHT, { basis: 44, grow: 1, shrink: 1 }));
  const controlsContent = studioCanvasFrameContentRect(controlsBounds, 'parchment_panel');
  const kindMeasure = layoutUiFlex({ ...controlsContent, height: BUTTON_HEIGHT * kinds.length }, kindSpecs,
    { gap: 3, wrap: true });
  const kindToolbarHeight = Math.max(BUTTON_HEIGHT,
    ...kindMeasure.map(({ y, height }) => y + height - controlsContent.y));
  const controlLayout = layoutUiFrameSlots(controlsBounds, 'wood_parchment', [
    { id: 'kindToolbar', ...flexItem(1, kindToolbarHeight, { basis: kindToolbarHeight, shrink: 0 }) },
    { id: 'fields', ...flexItem(1, 88, { basis: 88, shrink: 0 }) },
    { id: 'commandToolbar', ...flexItem(1, 88, { basis: 88, shrink: 0 }) },
    { id: 'spacer', ...flexItem(1, 1, { grow: 1 }) },
  ], { direction: 'column', gap: LAYOUT_GAP });

  const kindRects = layoutUiFlex(controlLayout.slots.kindToolbar!,
    kindSpecs, { gap: 3, wrap: true });
  kinds.forEach((kind, index) => action(nodes, actions, `world:kind:${kind ?? 'all'}`, (kind ?? 'all').toUpperCase(),
    kindRects[index]!, () => {
      state.kind = kind;
      state.selectedId = state.model.browser(kind, state.query.snapshot().value)[0]?.id ?? null;
      state.syncedId = null;
      state.browserScroll = 0;
      context.invalidate();
    }, { role: 'tab', active: state.kind === kind, visibleLabel: (kind ?? 'all').slice(0, 4).toUpperCase() }));

  const fields = layoutUiFlex(controlLayout.slots.fields!, [
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
  ], { direction: 'column', gap: 4 });
  action(nodes, actions, 'world:query', `SEARCH ${state.query.snapshot().value || '…'}`, fields[0]!, () => state.query.focus(), { role: 'textbox' });
  action(nodes, actions, 'world:note', `NOTE ${state.note.snapshot().value || '…'}`, fields[1]!, () => state.note.focus(), { role: 'textbox' });
  const toolbar = layoutUiFlex(controlLayout.slots.commandToolbar!, [
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(80, BUTTON_HEIGHT, { basis: 80, shrink: 0 }),
  ], { gap: 4, wrap: true });
  action(nodes, actions, 'world:undo', 'Undo', toolbar[0]!, () => { state.model.undo(); context.invalidate(); },
    { disabled: !snapshot.canUndo, glyph: 'back', visibleLabel: '' });
  action(nodes, actions, 'world:redo', 'Redo', toolbar[1]!, () => { state.model.redo(); context.invalidate(); },
    { disabled: !snapshot.canRedo, glyph: 'return', visibleLabel: '' });
  action(nodes, actions, 'world:rebase', 'Rebase', toolbar[2]!, () => {
    try { state.model.rebase(); context.invalidate(); } catch (error) { report(context, 'World rebase blocked', error); }
  }, { disabled: !snapshot.conflict, glyph: 'down', visibleLabel: '' });
  action(nodes, actions, 'world:publish', 'PUBLISH', toolbar[3]!, () => {
    state.mutationSequence += 1;
    void state.model.publish(`world.canvas.${state.mutationSequence}`, state.note.snapshot().value)
      .then(() => context.controller.notifications.push('success', 'World content published', 'Waiting for verified live head.'))
      .catch((error: unknown) => report(context, 'World publish failed', error)).finally(context.invalidate);
  }, { disabled: !snapshot.canPublish, tone: 'success' });

  const workspaceContent = studioCanvasFrameContentRect(workspaceBounds, 'parchment_panel');
  const workspace = layoutUiFlex(workspaceContent, [
    flexItem(185, 240, { basis: 250, grow: 1 }),
    flexItem(280, 240, { basis: 420, grow: 2 }),
    flexItem(220, 240, { basis: 320, grow: 1 }),
  ], { gap: LAYOUT_GAP });
  const [browser, editor, preview] = workspace as [UiRect, UiRect, UiRect];
  const browserSlots = layoutUiFlex(browser, [
    flexItem(1, 120, { grow: 1 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
  ], { direction: 'column', gap: 4 });
  const browserTable = layoutStudioCanvasTable({
    columns: [
      { id: 'name', label: `${state.kind?.toUpperCase() ?? 'PACK'} (${entries.length})`, minWidth: 110 },
      { id: 'refs', label: 'REFS', width: 54 },
    ],
    rows: entries.map((entry) => ({ id: entry.id, cells: [entry.label, String(entry.referencedBy)], selected: entry.id === state.selectedId })),
    scrollRow: state.browserScroll,
    rowHeight: BUTTON_HEIGHT,
    headerHeight: BUTTON_HEIGHT,
    frameStyle: 'thin',
    emptyLabel: 'No world definitions',
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
    id: 'world:browser-table',
    layout: browserTable,
    onHit: (hit) => { if (hit.kind !== 'header') selectDefinition(hit.rowId); },
    onScroll: (_command, nextScrollRow) => { state.browserScroll = nextScrollRow; context.invalidate(); },
  });
  browserTable.rows.forEach((row) => {
    const entry = entries[row.rowIndex]!;
    actions.push({ id: `world:definition:${entry.id}`, label: entry.label, role: 'option', bounds: row.bounds,
      activate: () => selectDefinition(entry.id) });
  });
  const scrollButtons = layoutUiFlex(browserSlots[1]!, [
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
    flexItem(44, BUTTON_HEIGHT, { basis: 44, shrink: 0 }),
  ], { gap: 4 });
  action(nodes, actions, 'world:browser-up', 'Previous definitions', scrollButtons[0]!, () => {
    state.browserScroll = scrollStudioCanvasTable(browserTable, 'page_up'); context.invalidate();
  }, { disabled: browserTable.firstRow === 0, glyph: 'up', visibleLabel: '' });
  action(nodes, actions, 'world:browser-down', 'Next definitions', scrollButtons[1]!, () => {
    state.browserScroll = scrollStudioCanvasTable(browserTable, 'page_down'); context.invalidate();
  }, { disabled: browserTable.firstRow === browserTable.maximumScrollRow, glyph: 'down', visibleLabel: '' });

  nodes.push(
    { id: 'world:editor-panel', kind: 'parchment_panel', bounds: editor },
    { id: 'world:preview-panel', kind: 'wood_panel', bounds: preview },
  );
  const packMode = context.route.tool.id === 'pack-studio';
  const editorContent = studioCanvasFrameContentRect(editor, 'parchment_panel');
  const editorSpecs = [
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    flexItem(1, 60, { grow: 1 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    ...(packMode ? [
      flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
      flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
    ] : []),
  ];
  const editorSlots = layoutUiFlex(editorContent, editorSpecs, { direction: 'column', gap: 4 });
  nodes.push({ id: 'world:editor-title', kind: 'heading', bounds: editorSlots[0]!,
    label: selected === null ? 'NO SELECTION' : labelFor(selected), clip: editorContent });
  if (selected !== null) {
    fieldNodes(nodes, 'world:field', scalarFields(selected), editorSlots[1]!);
    action(nodes, actions, 'world:definition-json', `JSON ${state.definition.snapshot().value.slice(0, 38)}`,
      editorSlots[2]!, () => state.definition.focus(), { role: 'textbox', disabled: access === 'read_only' });
    const editButtons = layoutUiFlex(editorSlots[3]!, [
      flexItem(112, BUTTON_HEIGHT, { basis: 112, shrink: 0 }),
      flexItem(96, BUTTON_HEIGHT, { basis: 96, shrink: 0 }),
    ], { gap: 4 });
    action(nodes, actions, 'world:apply-json', 'APPLY JSON', editButtons[0]!, () => {
      try { state.model.upsert(JSON.parse(state.definition.snapshot().value)); context.invalidate(); }
      catch (error) { report(context, 'World definition invalid', error); }
    }, { disabled: access === 'read_only', tone: 'success' });
    action(nodes, actions, 'world:delete', 'DELETE', editButtons[1]!, () => {
      try { state.model.delete(selected.id); state.syncedId = null; context.invalidate(); }
      catch (error) { report(context, 'World definition delete failed', error); }
    }, { disabled: access === 'read_only', tone: 'danger' });
  }
  if (packMode) {
    action(nodes, actions, 'world:pack-json', `PACK ${state.pack.snapshot().value.slice(0, 34) || '…'}`,
      editorSlots[4]!, () => state.pack.focus(), { role: 'textbox', disabled: access === 'read_only' });
    const packButtons = layoutUiFlex(editorSlots[5]!, [
      flexItem(150, BUTTON_HEIGHT, { basis: 150, shrink: 0 }),
      flexItem(130, BUTTON_HEIGHT, { basis: 130, shrink: 0 }),
    ], { gap: 4 });
    action(nodes, actions, 'world:stage-pack', 'STAGE PACK', packButtons[0]!, () => {
      try {
        const batches = planBoundedPackImport(state.pack.snapshot().value, 50);
        state.model.replaceWithPack(state.pack.snapshot().value);
        state.batchSummary = `${batches.length} BATCHES · ≤50 DEFINITIONS`;
        context.invalidate();
      } catch (error) { report(context, 'Pack import failed', error); }
    }, { disabled: access === 'read_only', tone: 'success' });
    action(nodes, actions, 'world:export-pack', 'EXPORT', packButtons[1]!, () => {
      state.pack.setValue(serializeWorldPack(state.model.snapshot().definitions));
      state.batchSummary = 'CURRENT DRAFT SERIALIZED';
      context.invalidate();
    }, { glyph: 'down' });
  }

  const manifest = worldPackManifest(snapshot.definitions);
  const fixture = diffWorldPackManifest(snapshot.definitions, bootstrapManifest);
  const previewContent = studioCanvasFrameContentRect(preview, 'wood_panel');
  const previewSlots = layoutUiFlex(previewContent, [
    flexItem(1, 80, { basis: 150, shrink: 1 }),
    flexItem(1, 20, { grow: 1 }),
    flexItem(1, 30, { basis: 70, shrink: 1 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT * 3 + 8, shrink: 0 }),
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 }),
  ], { direction: 'column', gap: 4 });
  const summary = [
    `PACK ${manifest.contentHash}`,
    state.batchSummary,
    `${manifest.definitionCount} DEFINITIONS · ${Object.keys(manifest.kindCounts).length} KINDS`,
    `ENGINE ${snapshot.engineGate.toUpperCase()}`,
    fixture.matches ? 'GIT FIXTURE: EXACT HASH MATCH' : `FIXTURE DRIFT ${fixture.expectedHash} → ${fixture.actualHash}`,
    `${snapshot.validation.errors.length} ERRORS · ${snapshot.validation.warnings.length} WARNINGS`,
    `${snapshot.diffs.length} DRAFT CHANGES`,
  ].filter(Boolean);
  fieldNodes(nodes, 'world:preview', summary, previewSlots[0]!,
    (line) => line.includes('ERROR') || line.includes('DRIFT') ? 'danger' : line.includes('MATCH') ? 'success' : 'normal');
  fieldNodes(nodes, 'world:diff', snapshot.diffs.slice(0, 5).map((diff) =>
    `${diff.kind.toUpperCase()} ${diff.id} · ${diff.changedPaths.join(', ')}`), previewSlots[1]!);
  fieldNodes(nodes, 'world:history', state.model.history().slice(0, 4).map((revision) =>
    `R${revision.revision} · ${revision.note || 'UNTITLED'} · ${revision.actor}`), previewSlots[2]!);
  const playtestKind = selected?.kind === 'creature' || selected?.kind === 'spawn' ? 'spawn'
    : selected?.kind === 'effect' ? 'apply_effect' : selected?.kind === 'upgrade' ? 'grant_upgrade' : null;
  const inputRows = layoutUiFlex(previewSlots[3]!, Array.from({ length: 3 }, () =>
    flexItem(1, BUTTON_HEIGHT, { basis: BUTTON_HEIGHT, shrink: 0 })), { direction: 'column', gap: 4 });
  if (playtestKind === 'spawn') {
    const coordinateRow = layoutUiFlex(inputRows[1]!, [
      flexItem(60, BUTTON_HEIGHT, { basis: 60, grow: 1 }), flexItem(60, BUTTON_HEIGHT, { basis: 60, grow: 1 }),
    ], { gap: 4 });
    action(nodes, actions, 'world:playtest-space', `SPACE ${state.spaceId.snapshot().value || '…'}`, inputRows[0]!,
      () => state.spaceId.focus(), { role: 'textbox' });
    action(nodes, actions, 'world:playtest-x', `X ${state.tileX.snapshot().value || '…'}`, coordinateRow[0]!,
      () => state.tileX.focus(), { role: 'textbox' });
    action(nodes, actions, 'world:playtest-y', `Y ${state.tileY.snapshot().value || '…'}`, coordinateRow[1]!,
      () => state.tileY.focus(), { role: 'textbox' });
    nodes.push({ id: 'world:playtest-help', kind: 'label', bounds: inputRows[2]!, label: 'SPAWN USES EXACT SPACE + TILE' });
  } else if (playtestKind === 'apply_effect' || playtestKind === 'grant_upgrade') {
    action(nodes, actions, 'world:playtest-target', `PLAYER ${state.targetPlayer.snapshot().value || '…'}`, inputRows[0]!,
      () => state.targetPlayer.focus(), { role: 'textbox' });
    if (playtestKind === 'grant_upgrade') action(nodes, actions, 'world:playtest-rank',
      `RANK ${state.rank.snapshot().value || '…'}`, inputRows[1]!, () => state.rank.focus(), { role: 'textbox' });
    nodes.push({ id: 'world:playtest-help', kind: 'label', bounds: inputRows[2]!,
      label: playtestKind === 'apply_effect' ? 'TARGET IDENTITY REQUIRED' : 'TARGET IDENTITY + EXACT RANK' });
  } else nodes.push({ id: 'world:playtest-help', kind: 'label', bounds: previewSlots[3]!,
    label: 'SELECT CREATURE, SPAWN, EFFECT OR UPGRADE' });
  const playtestReason = state.note.snapshot().value.trim();
  const integer = (editor: CanvasTextEditor): number => Number(editor.snapshot().value.trim());
  const target = state.targetPlayer.snapshot().value.trim();
  const playtestInputValid = playtestKind === 'spawn'
    ? [state.spaceId, state.tileX, state.tileY].every((editor) => Number.isSafeInteger(integer(editor)))
    : playtestKind === 'apply_effect' ? target.length > 0
      : playtestKind === 'grant_upgrade' ? target.length > 0 && Number.isSafeInteger(integer(state.rank)) && integer(state.rank) > 0
        : false;
  const playtest = layoutUiFlex(previewSlots[4]!, [flexItem(152, BUTTON_HEIGHT, { basis: 152, shrink: 0 })])[0]!;
  action(nodes, actions, 'world:playtest', 'PLAYTEST', playtest, () => {
    if (selected === null || playtestKind === null) return;
    state.mutationSequence += 1;
    const base = { definitionId: selected.id, reason: playtestReason,
      clientMutationId: `world.playtest.${state.mutationSequence}` };
    const request: WorldPlaytestRequest = playtestKind === 'spawn'
      ? { ...base, kind: 'spawn', spaceId: integer(state.spaceId), tileX: integer(state.tileX), tileY: integer(state.tileY) }
      : playtestKind === 'apply_effect'
        ? { ...base, kind: 'apply_effect', targetPlayer: target }
        : { ...base, kind: 'grant_upgrade', targetPlayer: target, rank: integer(state.rank) };
    void state.model.playtest(request)
      .then(() => context.controller.notifications.push('success', 'World playtest committed', selected.id))
      .catch((error: unknown) => report(context, 'World playtest failed', error)).finally(context.invalidate);
  }, { disabled: !snapshot.playtestAvailable || selected === null || !playtestInputValid || playtestReason.length < 8,
    glyph: 'play', tone: 'success' });

  context.controller.validation.setIssues([
    ...snapshot.validation.errors.map((issue, index) => ({ id: `world:error:${index}`, severity: 'error' as const, message: issue.message })),
    ...snapshot.validation.warnings.map((issue, index) => ({ id: `world:warning:${index}`, severity: 'warning' as const, message: issue.message })),
  ]);
  return prefixSurface(context, nodes, actions, tables, state);
}
