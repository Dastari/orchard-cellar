import {
  CanvasTextEditor,
  layoutStudioCanvasTable,
  layoutUiFlex,
  type FantasyButtonGlyph,
  type StudioCanvasShellNode,
  type StudioCanvasTableColumn,
  type StudioCanvasTableHit,
  type StudioCanvasTableRow,
  type StudioCanvasTableScrollCommand,
  type UiRect,
} from '@orchard/ui';
import { createMockAdminApi } from '../admin/api.js';
import { studioAdminServiceKey } from '../admin/service-key.js';
import { isStudioRole, type StudioRole } from '../shell/access.js';
import type {
  StudioCanvasToolAction,
  StudioCanvasToolContext,
  StudioCanvasToolSurface,
  StudioCanvasToolTable,
  StudioCanvasToolTextEditor,
} from '../shell/canvas-tool.js';
import { ContainerManagerModel } from './containers/model.js';
import { MembershipManagerModel, MockMembershipApi } from './membership/model.js';
import { NpcManagerModel } from './npcs/model.js';
import { ObjectManagerModel } from './objects/model.js';
import { objectsApiFor } from './objects/runtime.js';
import { MockObserveApi, OBSERVE_TABS, ObserveModel, type ObserveTab } from './observe/model.js';
import {
  PlayerManagerModel,
  PLAYER_MANAGER_TABS,
  type PlayerManagerTab,
  type PlayerMutationDraft,
} from './players/model.js';
import {
  MockMissingContainerRemedyApi,
  REMEDY_PLAYBOOK_IDS,
  RemedyPlaybookModel,
  type RemedyInput,
  type RemedyPlaybookId,
} from './playbooks/model.js';
import { WorldControlModel } from './world/model.js';
import { worldApiFor } from './world/runtime.js';

type ToolNode = StudioCanvasShellNode;

interface EditorState {
  readonly editor: CanvasTextEditor;
}

interface StartedModel<T> {
  readonly model: T;
  started: boolean;
}

interface TableState {
  scrollRow: number;
}

const trim = (value: unknown, maximum = 92): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length <= maximum ? text : `${text.slice(0, Math.max(0, maximum - 1))}…`;
};

class SurfaceComposer {
  readonly nodes: ToolNode[] = [];
  readonly actions: StudioCanvasToolAction[] = [];
  readonly textEditors: StudioCanvasToolTextEditor[] = [];
  readonly #clip: UiRect;
  readonly #slots: Array<{ readonly id: string; readonly minSize: { readonly width: number; readonly height: number }; readonly main: { readonly mode: 'fixed'; readonly size: number } }> = [];
  #slotSequence = 0;

  constructor(readonly context: StudioCanvasToolContext, bounds: UiRect = controlBounds(context)) {
    // The shell hands tools the exact safe rectangles produced by
    // layoutUiFrameSlots. Children use the companion flex container directly;
    // they must not apply a second guessed or decorative-frame inset.
    this.#clip = bounds;
  }

  heading(id: string, label: string): void {
    this.nodes.push({ id, kind: 'heading', bounds: this.take(38), clip: this.#clip, label: trim(label) });
  }

  label(id: string, label: string, height = 36): void {
    this.nodes.push({ id, kind: 'label', bounds: this.take(height), clip: this.#clip, label: trim(label) });
  }

  field(id: string, label: string, editor: CanvasTextEditor): void {
    const bounds = this.take(46);
    const state = editor.snapshot();
    const start = Math.min(state.anchor, state.focus);
    const end = Math.max(state.anchor, state.focus);
    const visibleValue = state.focused
      ? `${state.value.slice(0, start)}${start === end ? '|' : `[${state.value.slice(start, end)}]`}${state.value.slice(end)}`
      : state.value;
    this.nodes.push({ id, kind: 'field', bounds, clip: this.#clip,
      label: `${label}: ${visibleValue || '—'}`, state: state.focused ? 'active' : 'idle' });
    this.actions.push({ id, label, role: 'textbox', bounds, activate: () => { editor.focus(); this.context.invalidate(); } });
    this.textEditors.push({ id, editor });
  }

  button(id: string, label: string, activate: () => void, options: {
    readonly disabled?: boolean;
    readonly active?: boolean;
    readonly tone?: ToolNode['tone'];
    readonly tab?: boolean;
    readonly glyph?: FantasyButtonGlyph;
    readonly iconOnly?: boolean;
  } = {}): void {
    const row = this.take(44);
    const width = options.iconOnly === true ? 44 : Math.min(row.width, Math.max(116, Math.min(300, label.length * 7 + 44)));
    const bounds = { ...row, width };
    this.nodes.push({ id, kind: options.tab === true ? 'tab' : 'button', bounds, clip: this.#clip,
      ...(options.iconOnly === true ? {} : { label: trim(label) }), glyph: options.glyph,
      state: options.disabled === true ? 'disabled' : options.active === true ? 'active' : 'idle', tone: options.tone });
    this.actions.push({ id, label, role: options.tab === true ? 'tab' : 'button', bounds,
      disabled: options.disabled, activate });
  }

  tabs(prefix: string, values: readonly string[], active: string, choose: (value: string) => void): void {
    const columns = Math.min(4, Math.max(1, values.length));
    const gap = 5;
    for (let offset = 0; offset < values.length; offset += columns) {
      const group = values.slice(offset, offset + columns);
      const row = this.take(44);
      const width = Math.floor((row.width - gap * (columns - 1)) / columns);
      group.forEach((value, index) => {
        const bounds = { x: row.x + index * (width + gap), y: row.y, width, height: row.height };
        const id = `${prefix}-${value}`; const label = value.replaceAll('_', ' ').toUpperCase();
        this.nodes.push({ id, kind: 'tab', bounds, clip: this.#clip, label, state: value === active ? 'active' : 'idle' });
        this.actions.push({ id, label, role: 'tab', bounds, activate: () => choose(value) });
      });
    }
  }

  surface(): StudioCanvasToolSurface {
    return Object.freeze({ nodes: Object.freeze(this.nodes), actions: Object.freeze(this.actions),
      textEditors: Object.freeze(this.textEditors) });
  }

  private take(height: number): UiRect {
    const id = `surface-slot-${this.#slotSequence++}`;
    this.#slots.push({ id, minSize: { width: 44, height }, main: { mode: 'fixed', size: height } });
    // Every frame child is placed by the same flex/slot implementation used by
    // UI Lab. Fixed rows intentionally overflow the content face and are then
    // clipped by #clip; callers expose bounded paging rather than compressing
    // controls below the 40px interaction target.
    return layoutUiFlex(this.#clip, this.#slots, {
      direction: 'column', gap: 5, align: 'stretch',
    }).at(-1)!;
  }
}

function controlBounds(context: StudioCanvasToolContext): UiRect {
  return context.controlsBounds ?? context.bounds;
}

function workspaceBounds(context: StudioCanvasToolContext): UiRect {
  return context.workspaceBounds ?? context.bounds;
}

function mergeSurfaces(...surfaces: readonly StudioCanvasToolSurface[]): StudioCanvasToolSurface {
  return Object.freeze({
    nodes: Object.freeze(surfaces.flatMap(({ nodes }) => nodes)),
    actions: Object.freeze(surfaces.flatMap(({ actions }) => actions)),
    textEditors: Object.freeze(surfaces.flatMap(({ textEditors }) => textEditors ?? [])),
    tables: Object.freeze(surfaces.flatMap(({ tables }) => tables ?? [])),
  });
}

function columnRegions(bounds: UiRect, sizes: readonly ({ readonly fixed: number } | { readonly grow: number })[]): readonly UiRect[] {
  return layoutUiFlex(bounds, sizes.map((size) => ({ minSize: { width: 44, height: 'fixed' in size ? size.fixed : 80 },
    main: 'fixed' in size ? { mode: 'fixed' as const, size: size.fixed }
      : { mode: 'grow' as const, min: 80, weight: size.grow } })), {
    direction: 'column', gap: 6, align: 'stretch', padding: 4,
  });
}

function retainedTable(
  context: StudioCanvasToolContext,
  id: string,
  bounds: UiRect,
  columns: readonly StudioCanvasTableColumn[],
  rows: readonly StudioCanvasTableRow[],
  selectRow?: (rowId: string, rowIndex: number) => void,
  emptyLabel = 'No rows',
): StudioCanvasToolSurface {
  const state = context.controller.toolState<TableState>(`operate-table:${id}`, () => ({ scrollRow: 0 }));
  const layout = layoutStudioCanvasTable({ columns, rows, scrollRow: state.scrollRow,
    rowHeight: 42, headerHeight: 42, emptyLabel, frameStyle: 'thin' }, bounds);
  state.scrollRow = layout.firstRow;
  const activate = (rowId: string, rowIndex: number): void => {
    selectRow?.(rowId, rowIndex);
    context.invalidate();
  };
  const table: StudioCanvasToolTable = Object.freeze({
    id,
    layout,
    onHit: (hit: StudioCanvasTableHit) => { if (hit.kind !== 'header') activate(hit.rowId, hit.rowIndex); },
    onScroll: (_command: StudioCanvasTableScrollCommand, nextScrollRow: number) => {
      state.scrollRow = nextScrollRow; context.invalidate();
    },
  });
  const actions: readonly StudioCanvasToolAction[] = selectRow === undefined ? [] : layout.rows
    .filter(({ disabled }) => !disabled)
    .map((row) => Object.freeze({ id: `${id}-row-${row.id}`, label: row.cells.join(' · '),
      role: 'option' as const, bounds: row.bounds, activate: () => activate(row.id, row.rowIndex) }));
  return Object.freeze({ nodes: Object.freeze([]), actions: Object.freeze(actions),
    textEditors: Object.freeze([]), tables: Object.freeze([table]) });
}

function roleFor(context: StudioCanvasToolContext): StudioRole | null {
  const role = context.controller.session.snapshot().role;
  return isStudioRole(role) ? role : null;
}

function editor(context: StudioCanvasToolContext, key: string, value = '', maxLength = 500): CanvasTextEditor {
  return context.controller.toolState<EditorState>(`canvas-editor:${key}`, () => ({
    editor: new CanvasTextEditor({ value, maxLength, onChange: () => context.invalidate() }),
  })).editor;
}

function run(context: StudioCanvasToolContext, title: string, task: () => Promise<unknown>): void {
  void task().then(() => context.invalidate()).catch((error: unknown) => {
    context.controller.notifications.push('error', title, error instanceof Error ? error.message : String(error));
    context.invalidate();
  });
}

function unavailable(context: StudioCanvasToolContext, message: string): StudioCanvasToolSurface {
  const ui = new SurfaceComposer(context);
  ui.heading(`${context.route.tool.id}-unavailable-title`, context.route.tool.label);
  ui.label(`${context.route.tool.id}-unavailable-message`, message, 44);
  return ui.surface();
}

function players(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const role = roleFor(context);
  const sandbox = context.controller.session.snapshot().environment === 'sandbox';
  const api = sandbox ? context.controller.toolState('players:mock-api', createMockAdminApi)
    : context.controller.liveAdapter()?.adminApi ?? null;
  if (api === null) return unavailable(context, 'Connect the authenticated live admin service to manage players.');
  const model = context.controller.toolState(`players:${studioAdminServiceKey(api)}:${role ?? 'anonymous'}`,
    () => new PlayerManagerModel({ api, role }));
  const query = editor(context, 'players-query');
  const reason = editor(context, 'players-reason', model.snapshot().reason);
  const notice = editor(context, 'players-notice');
  const ui = new SurfaceComposer(context, controlBounds(context));
  const state = model.snapshot();
  ui.heading('players-title', 'PLAYER SEARCH & GUARDED REMEDIES');
  ui.field('players-query', 'Name or identity', query);
  ui.button('players-find', state.loading ? 'Searching' : 'Find players', () => run(context, 'Player search failed', () => model.search(query.snapshot().value)), { disabled: state.loading, glyph: 'pointer', iconOnly: true });
  if (state.nextCursor !== null) ui.button('players-more', 'MORE PLAYERS', () => run(context, 'Player page failed', () => model.loadMore()));
  const playerRegions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { grow: 1 }, { fixed: state.player === null ? 52 : 278 }]);
  const playerHeader = new SurfaceComposer(context, playerRegions[0]!);
  playerHeader.heading('players-results-title', `PLAYERS · ${state.results.length} RESULT(S)`);
  const playerTable = retainedTable(context, 'players-results-table', playerRegions[1]!, [
    { id: 'status', label: 'STATUS', width: 84 },
    { id: 'name', label: 'PLAYER', minWidth: 120 },
    { id: 'identity', label: 'IDENTITY', minWidth: 180 },
  ], state.results.map((row) => ({ id: row.identity,
    cells: [row.online ? 'ONLINE' : 'OFFLINE', row.displayName, row.identity],
    selected: row.identity === state.selectedIdentity,
  })), (identity) => run(context, 'Player snapshot failed', () => model.select(identity)),
  state.loading ? 'Loading players…' : 'No matching players');
  const playerDetail = new SurfaceComposer(context, playerRegions[2]!);
  if (state.player === null) {
    playerDetail.label('players-empty', state.loading ? 'Loading exact player snapshot…' : 'Select a player to inspect inventory, position, progression, and custody.', 40);
    return mergeSurfaces(ui.surface(), playerHeader.surface(), playerTable, playerDetail.surface());
  }
  playerDetail.heading('players-profile', `${state.player.displayName} · ${state.player.online ? 'ONLINE' : 'OFFLINE'} · V${state.player.version}`);
  playerDetail.tabs('players-tab', PLAYER_MANAGER_TABS, state.tab, (tab) => { model.selectTab(tab as PlayerManagerTab); context.invalidate(); });
  playerDetail.label('players-tab-detail', playerTabSummary(state.tab, state), 52);
  ui.field('players-reason', 'Audited reason', reason);
  if (state.tab === 'notices') ui.field('players-notice', 'Notice', notice);
  const write = context.route.access === 'write';
  for (const action of playerActionsForTab(state.tab, state, notice.snapshot().value)) {
    const access = model.operationState(action.draft.operation);
    ui.button(`players-preview-${action.draft.operation}`, action.label, () => {
      model.setReason(reason.snapshot().value);
      run(context, `${action.label} failed`, () => model.preview(action.draft));
    }, { disabled: !write || !access.enabled, glyph: 'flask',
      tone: action.draft.operation === 'kick' ? 'danger' : 'normal' });
  }
  playerDetail.label('players-preview', state.pendingPreview === null ? 'No immutable preview. Every write requires a fresh dry run.'
    : `PREVIEW · ${state.pendingPreview.preview.changes.length} exact change(s) · BASE ${state.pendingPreview.baseVersion}`, 36);
  ui.button('players-commit', 'COMMIT EXACT PREVIEW', () => run(context, 'Player commit failed', () => model.commit()),
    { disabled: !write || state.pendingPreview === null, tone: 'danger' });
  ui.button('players-undo', 'UNDO LAST AUDITED CHANGE', () => run(context, 'Player undo failed', () => model.undoLast()),
    { disabled: !write || state.undoAuditId === null });
  return mergeSurfaces(ui.surface(), playerHeader.surface(), playerTable, playerDetail.surface());
}

function playerActionsForTab(
  tab: PlayerManagerTab,
  state: ReturnType<PlayerManagerModel['snapshot']>,
  notice: string,
): readonly { readonly label: string; readonly draft: PlayerMutationDraft }[] {
  const player = state.player;
  const position = player?.position ?? {};
  const spaceId = String(position['spaceId'] ?? '0');
  const tileX = Number(position['tileX'] ?? 0);
  const tileY = Number(position['tileY'] ?? 0);
  switch (tab) {
    case 'position': return [
      { label: 'Preview teleport', draft: { operation: 'teleport_player', spaceId, tileX, tileY } },
      { label: 'Preview unstick', draft: { operation: 'unstick' } },
      { label: 'Preview respawn', draft: { operation: 'respawn' } },
      { label: 'Preview set spawn', draft: { operation: 'set_spawn', spaceId, tileX, tileY } },
    ];
    case 'inventory': return [
      { label: 'Preview give apple', draft: { operation: 'give_items', stacks: [{ itemKind: 'apple', quantity: 1 }] } },
      { label: 'Preview remove apple', draft: { operation: 'remove_items', stacks: [{ itemKind: 'apple', quantity: 1 }] } },
      { label: 'Preview set backpack slot', draft: { operation: 'set_slot', slot: { area: 'backpack', index: 0 }, stack: { itemKind: 'apple', quantity: 1 } } },
      { label: 'Preview clear cursor', draft: { operation: 'clear_cursor' } },
      { label: 'Preview drain overflow', draft: { operation: 'drain_overflow' } },
    ];
    case 'wallet_stats': return [
      { label: 'Preview +1 bronze', draft: { operation: 'set_wallet', deltaBronze: '1' } },
      { label: 'Preview reviewed stat', draft: { operation: 'set_stats', patch: { studioReviewed: true } } },
    ];
    case 'vitals_effects': return [
      { label: 'Preview restore stamina', draft: { operation: 'set_vitals', patch: { stamina: 100 } } },
    ];
    case 'skills': return [
      { label: 'Preview +1 farming point', draft: { operation: 'grant_skill_points', track: 'farming', points: 1 } },
      { label: 'Preview reset farming tree', draft: { operation: 'reset_skill_tree', track: 'farming' } },
    ];
    case 'quests': return [
      { label: 'Preview complete welcome quest', draft: { operation: 'set_quest_state', questId: 'orchard_welcome', state: 'complete' } },
      { label: 'Preview reset quests', draft: { operation: 'reset_quests' } },
    ];
    case 'statistics': return [];
    case 'membership_connections': return [
      { label: 'Preview display name', draft: { operation: 'set_display_name', displayName: player?.displayName ?? 'Player' } },
    ];
    case 'notices': return [
      { label: 'Preview notice', draft: { operation: 'notify', body: notice || 'A game moderator reviewed your account.' } },
      { label: 'Preview kick', draft: { operation: 'kick', notice: notice || 'Disconnected by a moderator.' } },
    ];
  }
}

function playerTabSummary(tab: PlayerManagerTab, state: ReturnType<PlayerManagerModel['snapshot']>): string {
  const player = state.player;
  if (player === null) return 'No player selected.';
  switch (tab) {
    case 'position': return `POSITION ${trim(player.position, 55)} · SPAWN ${trim(player.spawn, 55)}`;
    case 'inventory': return `${state.inventory?.slots.length ?? 0} SLOTS · ${state.inventory?.slots.filter(({ slot, stack }) => slot.area === 'overflow' && stack !== null).length ?? 0} OVERFLOW`;
    case 'wallet_stats': return `BRONZE ${player.walletBronze} · STATS ${trim(player.stats, 56)}`;
    case 'vitals_effects': return `VITALS ${trim(player.vitals, 46)} · EFFECTS ${player.effects.length}`;
    case 'skills': return `TRACKS ${trim(player.skillTracks, 72)}`;
    case 'quests': return `QUESTS ${trim(player.quests, 72)}`;
    case 'statistics': return `STATISTICS ${trim(player.statistics, 72)}`;
    case 'membership_connections': return `${player.membership.role.toUpperCase()} · ${state.connections.length} CONNECTION EVENT(S)`;
    case 'notices': return state.notice ?? 'Compose a notice or kick message below.';
  }
}

function containers(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const api = objectsApiFor(context.controller);
  if (api === null) return unavailable(context, 'Connect the W4 object authority to inspect container custody.');
  const role = roleFor(context);
  const model = context.controller.toolState(`containers:${studioAdminServiceKey(api)}:${role ?? 'anonymous'}`,
    () => new ContainerManagerModel(api, role));
  const entityId = editor(context, 'containers-entity', '10');
  const reason = editor(context, 'containers-reason', model.snapshot().reason);
  const state = model.snapshot(); const ui = new SurfaceComposer(context, controlBounds(context));
  ui.heading('containers-title', 'CONTAINER CUSTODY INSPECTOR');
  ui.field('containers-entity', 'Entity id', entityId);
  ui.button('containers-inspect', 'Inspect exact custody', () => run(context, 'Container inspection failed', () => model.inspect(entityId.snapshot().value)), { glyph: 'pointer', iconOnly: true });
  ui.field('containers-reason', 'Audited reason', reason);
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { fixed: 42 }, { grow: 1 }, { fixed: 36 }]);
  const summary = new SurfaceComposer(context, regions[0]!);
  const custody = new SurfaceComposer(context, regions[1]!);
  const outcome = new SurfaceComposer(context, regions[3]!);
  const container = state.container;
  summary.heading('containers-profile', container === null ? 'CONTAINER SLOTS' : `${container.definitionId} · ENTITY ${container.entityId} · V${container.version}`);
  custody.label('containers-custody', container === null
    ? 'Enter a chest, station, or barrel entity id. Inspection never writes.'
    : `OWNER ${container.ownerIdentity ?? 'WORLD'} · POSITION ${trim(container.position, 45)} · PROCESSOR ${trim(container.processor, 45)}`, 42);
  const slotTable = retainedTable(context, 'containers-slots-table', regions[2]!, [
    { id: 'slot', label: 'SLOT', width: 68 },
    { id: 'item', label: 'ITEM', minWidth: 160 },
    { id: 'quantity', label: 'QTY', width: 72 },
    { id: 'durability', label: 'DURABILITY', width: 100 },
  ], (container?.slots ?? []).map((stack, index) => ({ id: String(index), cells: [String(index),
    stack?.displayName ?? 'EMPTY', stack === null ? '—' : String(stack.quantity),
    stack?.durability === undefined ? '—' : String(stack.durability)] })), undefined,
  container === null ? 'Inspect a container to load its slots' : 'Container has no slots');
  const writable = context.route.access === 'write' && (role === 'owner' || role === 'admin');
  ui.button('containers-preview-repair', 'PREVIEW REPAIR', () => { model.setReason(reason.snapshot().value); run(context, 'Repair preview failed', () => model.preview({ operation: 'repair_entity' })); }, { disabled: !writable });
  ui.button('containers-preview-despawn', 'PREVIEW SAFE DESPAWN + SPILL', () => { model.setReason(reason.snapshot().value); run(context, 'Despawn preview failed', () => model.preview({ operation: 'despawn_entity', spillContents: true })); }, { disabled: !writable, tone: 'danger' });
  outcome.label('containers-preview', state.pending === null ? 'No immutable preview.' : `PREVIEW ${state.pending.preview.preview.changes.length} CHANGE(S) · BASE ${state.pending.baseVersion}`, 36);
  ui.button('containers-commit', 'COMMIT EXACT PREVIEW', () => run(context, 'Container commit failed', () => model.commit()), { disabled: !writable || state.pending === null, tone: 'danger' });
  return mergeSurfaces(ui.surface(), summary.surface(), custody.surface(), slotTable, outcome.surface());
}

function objects(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const api = objectsApiFor(context.controller);
  if (api === null) return unavailable(context, 'Connect the W4 object authority to query live entities.');
  const role = roleFor(context);
  const model = context.controller.toolState<StartedModel<ObjectManagerModel>>(`objects-canvas:${studioAdminServiceKey(api)}:${role ?? 'anonymous'}`,
    () => ({ model: new ObjectManagerModel(api, role), started: false }));
  const reason = editor(context, 'objects-reason', model.model.snapshot().reason);
  if (!model.started) { model.started = true; run(context, 'Object query failed', () => model.model.load()); }
  const state = model.model.snapshot(); const ui = new SurfaceComposer(context, controlBounds(context));
  ui.heading('objects-title', `LIVE OBJECT QUERY · ${state.rows.length} ROW(S) · SCANNED ${state.rowsScanned}`);
  ui.button('objects-refresh', state.loading ? 'Loading objects' : 'Refresh bounded area', () => run(context, 'Object query failed', () => model.model.load()), { disabled: state.loading, glyph: 'return', iconOnly: true });
  ui.field('objects-reason', 'Audited reason', reason);
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { grow: 1 }, { fixed: 36 }]);
  const header = new SurfaceComposer(context, regions[0]!);
  const outcome = new SurfaceComposer(context, regions[2]!);
  header.heading('objects-results', `ENTITIES · WORLD ${state.worldVersion || 'LOADING'}`);
  const objectRows = new Map(state.rows.map((row) => [row.entityId, row] as const));
  const objectTable = retainedTable(context, 'objects-results-table', regions[1]!, [
    { id: 'kind', label: 'KIND', width: 90 },
    { id: 'definition', label: 'DEFINITION', minWidth: 150 },
    { id: 'entity', label: 'ENTITY', width: 92 },
    { id: 'position', label: 'SPACE · TILE', minWidth: 120 },
  ], state.rows.map((row) => ({ id: row.entityId,
    cells: [row.kind.toUpperCase(), row.definitionId, row.entityId, `${row.spaceId}:${row.tileX},${row.tileY}`],
    selected: state.selected.has(row.entityId),
  })), (entityId) => {
    const row = objectRows.get(entityId);
    if (row === undefined) return;
    model.model.toggle(row.entityId);
    context.controller.selection.select({ kind: 'entity', entityKind: row.kind, id: row.entityId,
      spaceId: Number(row.spaceId) || 0 });
  }, state.loading ? 'Loading live objects…' : 'No objects in the bounded area');
  const writable = context.route.access === 'write' && (role === 'owner' || role === 'admin');
  ui.button('objects-preview-repair', `PREVIEW REPAIR ${state.selected.size} SELECTED`, () => {
    model.model.setReason(reason.snapshot().value); run(context, 'Object repair preview failed', () => model.model.previewSelected('repair_entity'));
  }, { disabled: !writable || state.selected.size === 0 });
  ui.button('objects-preview-despawn', `PREVIEW SAFE DESPAWN ${state.selected.size} SELECTED`, () => {
    model.model.setReason(reason.snapshot().value); run(context, 'Object despawn preview failed', () => model.model.previewSelected('despawn_entity', true));
  }, { disabled: !writable || state.selected.size === 0, tone: 'danger' });
  outcome.label('objects-preview', state.pending.length === 0 ? 'No immutable bulk preview.' : `${state.pending.length} EXACT PREVIEW(S) READY`, 32);
  ui.button('objects-commit', 'COMMIT EXACT PREVIEWS', () => run(context, 'Object commit failed', () => model.model.commit()), { disabled: !writable || state.pending.length === 0, tone: 'danger' });
  return mergeSurfaces(ui.surface(), header.surface(), objectTable, outcome.surface());
}

function npcs(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const api = objectsApiFor(context.controller);
  if (api === null) return unavailable(context, 'Connect the W4 object authority to manage live NPCs.');
  const role = roleFor(context);
  const retained = context.controller.toolState<StartedModel<NpcManagerModel>>(`npcs-canvas:${studioAdminServiceKey(api)}:${role ?? 'anonymous'}`,
    () => ({ model: new NpcManagerModel(api, role), started: false }));
  const filter = editor(context, 'npcs-filter'); const reason = editor(context, 'npcs-reason');
  const x = editor(context, 'npcs-x', '0', 12); const y = editor(context, 'npcs-y', '0', 12);
  if (!retained.started) { retained.started = true; run(context, 'NPC query failed', () => retained.model.load()); }
  const state = retained.model.snapshot(); const ui = new SurfaceComposer(context, controlBounds(context));
  ui.heading('npcs-title', `NPC MANAGER · ${state.rows.length} LIVE ACTOR(S)`);
  ui.field('npcs-filter', 'Definition or id filter', filter);
  ui.button('npcs-refresh', 'Refresh NPCs', () => { retained.model.setFilter(filter.snapshot().value); run(context, 'NPC query failed', () => retained.model.load()); }, { glyph: 'return', iconOnly: true });
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { grow: 1 }, { fixed: 36 }]);
  const header = new SurfaceComposer(context, regions[0]!);
  const outcome = new SurfaceComposer(context, regions[2]!);
  header.heading('npcs-results', 'AUTHORED NPCS & WILDLIFE');
  const npcRows = new Map(state.rows.map((row) => [row.entityId, row] as const));
  const npcTable = retainedTable(context, 'npcs-results-table', regions[1]!, [
    { id: 'definition', label: 'DEFINITION', minWidth: 170 },
    { id: 'entity', label: 'ENTITY', width: 90 },
    { id: 'space', label: 'SPACE', width: 72 },
    { id: 'tile', label: 'TILE', width: 90 },
  ], state.rows.map((row) => ({ id: row.entityId,
    cells: [row.definitionId, row.entityId, row.spaceId, `${row.tileX},${row.tileY}`],
    selected: row.entityId === state.selected?.entityId,
  })), (entityId) => {
    const row = npcRows.get(entityId);
    if (row === undefined) return;
    retained.model.select(row.entityId);
    context.controller.selection.select({ kind: 'entity', entityKind: row.kind, id: row.entityId,
      spaceId: Number(row.spaceId) || 0 });
  }, 'No matching NPCs');
  ui.field('npcs-x', 'Relocate tile X', x); ui.field('npcs-y', 'Relocate tile Y', y); ui.field('npcs-reason', 'Audited reason', reason);
  const writable = context.route.access === 'write' && (role === 'owner' || role === 'admin');
  ui.button('npcs-preview', 'PREVIEW RELOCATION', () => {
    retained.model.setReason(reason.snapshot().value);
    run(context, 'NPC relocation preview failed', () => retained.model.previewRelocate(state.selected?.spaceId ?? '0', Number(x.snapshot().value), Number(y.snapshot().value)));
  }, { disabled: !writable || state.selected === null });
  outcome.label('npcs-preview-state', state.pending === null ? 'No immutable relocation preview.' : `PREVIEW ${state.pending.preview.preview.changes.length} CHANGE(S)`, 32);
  ui.button('npcs-commit', 'COMMIT EXACT PREVIEW', () => run(context, 'NPC relocation failed', () => retained.model.commit()), { disabled: !writable || state.pending === null, tone: 'danger' });
  return mergeSurfaces(ui.surface(), header.surface(), npcTable, outcome.surface());
}

function world(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const api = worldApiFor(context.controller);
  if (api === null) return unavailable(context, 'Connect the W5 world authority to inspect world controls.');
  const role = roleFor(context);
  const retained = context.controller.toolState<StartedModel<WorldControlModel>>(`world-canvas:${studioAdminServiceKey(api)}:${role ?? 'anonymous'}`,
    () => ({ model: new WorldControlModel(api, role), started: false }));
  const reason = editor(context, 'world-reason');
  if (!retained.started) { retained.started = true; run(context, 'World load failed', () => retained.model.load()); }
  const state = retained.model.snapshot(); const ui = new SurfaceComposer(context, controlBounds(context));
  const selectedSpace = context.controller.toolState<{ id: string | null }>('world-canvas-selected-space', () => ({ id: null }));
  ui.heading('world-title', 'WORLD CONTROL · EXACT PREVIEW + AUDIT');
  ui.button('world-refresh', state.loading ? 'Loading world' : 'Refresh world', () => run(context, 'World load failed', () => retained.model.load()), { disabled: state.loading, glyph: 'return', iconOnly: true });
  ui.button('world-validate', 'Validate world', () => run(context, 'World validation failed', () => retained.model.validate()), { glyph: 'alert', iconOnly: true });
  ui.field('world-reason', 'Audited reason', reason);
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 42 }, { grow: 1 }, { grow: 1 }, { fixed: 36 }]);
  const environment = new SurfaceComposer(context, regions[0]!);
  const outcome = new SurfaceComposer(context, regions[3]!);
  environment.label('world-environment', state.world === null ? 'Loading bounded world-control snapshot…'
    : `WORLD ${state.world.worldVersion} · TICK ${state.world.environment.calendarTick} · WEATHER ${state.world.environment.weatherMode} · WIND ${state.world.environment.windDirection}`, 38);
  const spacesTable = retainedTable(context, 'world-spaces-table', regions[1]!, [
    { id: 'label', label: 'SPACES', minWidth: 140 },
    { id: 'space', label: 'ID', width: 72 },
    { id: 'size', label: 'SIZE', width: 82 },
    { id: 'flags', label: 'FLAGS', minWidth: 150 },
  ], (state.world?.spaces ?? []).map((space) => ({ id: space.spaceId,
    cells: [space.label, space.spaceId, `${space.sizeTiles} TILES`, trim(space.flags, 40)],
    selected: selectedSpace.id === space.spaceId,
  })), (spaceId) => { selectedSpace.id = spaceId; }, state.loading ? 'Loading spaces…' : 'No spaces');
  const issueTable = retainedTable(context, 'world-issues-table', regions[2]!, [
    { id: 'severity', label: 'SEVERITY', width: 88 },
    { id: 'code', label: 'VALIDATION ISSUE', minWidth: 150 },
    { id: 'message', label: 'DETAIL', minWidth: 220 },
    { id: 'safe', label: 'SAFE', width: 60 },
  ], (state.report?.issues ?? []).map((issue, index) => ({ id: String(index),
    cells: [issue.severity.toUpperCase(), issue.code, issue.message,
      issue.repairable ? (state.selectedIssues.has(index) ? 'YES ✓' : 'YES') : 'NO'],
    selected: state.activeIssue === index,
  })), (_rowId, index) => {
    retained.model.navigateIssue(index);
    if (state.report?.issues[index]?.repairable === true) retained.model.toggleSafeIssue(index);
  }, state.report === null ? 'Run validation to inspect issues' : 'Validation found no issues');
  const writable = context.route.access === 'write' && state.canMutate;
  ui.button('world-preview-time', 'PREVIEW ADVANCE TIME', () => {
    retained.model.setReason(reason.snapshot().value);
    run(context, 'Time preview failed', () => retained.model.preview({ operation: 'set_time', calendarTick: String(BigInt(state.world!.environment.calendarTick) + 1n) }));
  }, { disabled: !writable || state.world === null });
  if (state.report !== null) {
    ui.button('world-preview-repair', 'PREVIEW ALL SAFE REPAIRS', () => { retained.model.setReason(reason.snapshot().value); run(context, 'Repair preview failed', () => retained.model.previewSelectedRepair()); }, { disabled: !writable || state.report.issues.length === 0 });
  }
  outcome.label('world-preview', state.pending === null ? 'No immutable world preview.' : `PREVIEW ${state.pending.preview.preview.changes.length} CHANGE(S) · ${state.pending.preview.fingerprint}`, 36);
  ui.button('world-commit', 'COMMIT EXACT PREVIEW', () => run(context, 'World commit failed', () => retained.model.commit()), { disabled: !writable || state.pending === null, tone: 'danger' });
  return mergeSurfaces(ui.surface(), environment.surface(), spacesTable, issueTable, outcome.surface());
}

function membership(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const role = roleFor(context); const sandbox = context.controller.session.snapshot().environment === 'sandbox';
  const api = sandbox ? context.controller.toolState('membership:mock-api', () => new MockMembershipApi())
    : context.controller.liveAdapter()?.membershipApi ?? null;
  if (api === null) return unavailable(context, 'Connect the authenticated membership authority to manage access.');
  const retained = context.controller.toolState<StartedModel<MembershipManagerModel>>(`membership-canvas:${studioAdminServiceKey(api)}:${role ?? 'anonymous'}`,
    () => ({ model: new MembershipManagerModel(api, role), started: false }));
  const query = editor(context, 'membership-query'); const reason = editor(context, 'membership-reason');
  if (!retained.started) { retained.started = true; run(context, 'Membership search failed', () => retained.model.search('')); }
  const state = retained.model.snapshot(); const ui = new SurfaceComposer(context, controlBounds(context));
  ui.heading('membership-title', 'MEMBERSHIP & STUDIO GRANTS');
  ui.field('membership-query', 'Name or identity', query);
  ui.button('membership-find', state.loading ? 'Searching members' : 'Find members', () => run(context, 'Membership search failed', () => retained.model.search(query.snapshot().value)), { disabled: state.loading, glyph: 'pointer', iconOnly: true });
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { grow: 1 }, { fixed: 36 }]);
  const header = new SurfaceComposer(context, regions[0]!);
  const outcome = new SurfaceComposer(context, regions[2]!);
  header.heading('membership-results', `MEMBERS · ${state.rows.length} RESULT(S)`);
  const memberTable = retainedTable(context, 'membership-results-table', regions[1]!, [
    { id: 'name', label: 'MEMBER', minWidth: 140 },
    { id: 'role', label: 'ROLE', width: 92 },
    { id: 'grants', label: 'STUDIO GRANTS', minWidth: 150 },
    { id: 'status', label: 'STATUS', width: 90 },
  ], state.rows.map((row) => ({ id: row.identity,
    cells: [row.displayName, row.role.toUpperCase(), row.grants.join(', ') || 'NONE', row.blocked ? 'BLOCKED' : 'ACTIVE'],
    selected: row.identity === state.selectedIdentity,
  })), (identity) => { retained.model.select(identity); }, state.loading ? 'Loading members…' : 'No matching members');
  ui.field('membership-reason', 'Audited reason', reason);
  const writable = context.route.access === 'write' && retained.model.canWrite() && state.selectedIdentity !== null;
  const preview = (operation: 'grant_content_editor' | 'grant_support' | 'set_blocked'): void => {
    retained.model.setReason(reason.snapshot().value);
    const mutation = operation === 'set_blocked' ? { operation, blocked: true } as const : { operation } as const;
    run(context, 'Membership preview failed', () => retained.model.preview(mutation));
  };
  ui.button('membership-grant-content', 'PREVIEW CONTENT EDITOR GRANT', () => preview('grant_content_editor'), { disabled: !writable });
  ui.button('membership-grant-support', 'PREVIEW SUPPORT GRANT', () => preview('grant_support'), { disabled: !writable });
  ui.button('membership-block', 'PREVIEW BLOCK', () => preview('set_blocked'), { disabled: !writable, tone: 'danger' });
  outcome.label('membership-preview', state.pending === null ? 'No immutable membership preview.' : `PREVIEW ${state.pending.preview.changes.length} CHANGE(S) · BASE ${state.pending.baseVersion}`, 36);
  ui.button('membership-commit', 'COMMIT AUDITED MEMBERSHIP CHANGE', () => run(context, 'Membership commit failed', () => retained.model.commit()), { disabled: !writable || state.pending === null, tone: 'danger' });
  return mergeSurfaces(ui.surface(), header.surface(), memberTable, outcome.surface());
}

function observe(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const sandbox = context.controller.session.snapshot().environment === 'sandbox';
  const api = sandbox ? context.controller.toolState('observe:mock-api', () => new MockObserveApi())
    : context.controller.liveAdapter()?.observeApi ?? null;
  if (api === null) return unavailable(context, 'Connect the authenticated observe authority for bounded telemetry.');
  const retained = context.controller.toolState<StartedModel<ObserveModel>>(`observe-canvas:${studioAdminServiceKey(api)}`,
    () => ({ model: new ObserveModel(api), started: false }));
  if (!retained.started) { retained.started = true; run(context, 'Observe refresh failed', () => retained.model.refresh()); }
  const state = retained.model.snapshot(); const ui = new SurfaceComposer(context, controlBounds(context));
  ui.heading('observe-title', 'WORLD OBSERVE · READ ONLY');
  ui.tabs('observe-tab', OBSERVE_TABS, state.tab, (tab) => { retained.model.selectTab(tab as ObserveTab); context.invalidate(); });
  ui.button('observe-refresh', state.loading ? 'Refreshing observations' : 'Refresh all bounded snapshots', () => run(context, 'Observe refresh failed', () => retained.model.refresh()), { disabled: state.loading, glyph: 'return', iconOnly: true });
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { grow: 1 }, { fixed: 36 }]);
  const header = new SurfaceComposer(context, regions[0]!);
  const status = new SurfaceComposer(context, regions[2]!);
  header.heading('observe-results', state.tab.replaceAll('_', ' ').toUpperCase());
  const rows = observeRows(state.tab, state);
  const observeTable = retainedTable(context, `observe-${state.tab}-table`, regions[1]!, [
    { id: 'row', label: '#', width: 52 },
    { id: 'entry', label: 'AUTHORITY-BOUNDED ENTRY', minWidth: 320 },
  ], rows.map((value, index) => ({ id: `${state.tab}-${index}`, cells: [String(index + 1), trim(value, 160)] })),
  undefined, state.loading ? 'Refreshing observations…' : `No ${state.tab.replaceAll('_', ' ')} rows`);
  if (state.tab === 'client_errors' && state.clientErrorCursor !== null) ui.button('observe-more-errors', 'MORE CLIENT ERRORS', () => run(context, 'Client-error page failed', () => retained.model.moreClientErrors()));
  if (state.tab === 'audit' && state.auditCursor !== null) ui.button('observe-more-audit', 'MORE AUDIT EVENTS', () => run(context, 'Audit page failed', () => retained.model.moreAudit()));
  if (state.tab === 'connections' && state.connectionCursor !== null) ui.button('observe-more-connections', 'MORE CONNECTION EVENTS', () => run(context, 'Connection page failed', () => retained.model.moreConnections()));
  status.label('observe-status', state.error ?? 'Authority-bounded read-only snapshot. No observation action mutates the world.', 36);
  return mergeSurfaces(ui.surface(), header.surface(), observeTable, status.surface());
}

function observeRows(tab: ObserveTab, state: ReturnType<ObserveModel['snapshot']>): readonly unknown[] {
  if (tab === 'audit') return state.audit;
  if (tab === 'connections') return state.connections;
  if (tab === 'client_errors') return state.clientErrors;
  if (tab === 'presence') return state.presence;
  if (tab === 'telemetry') return state.telemetry === null ? [] : Object.entries(state.telemetry);
  return state.validation === null ? [] : [state.validation, ...state.validation.issues];
}

function playbooks(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const sandbox = context.controller.session.snapshot().environment === 'sandbox';
  const api = sandbox ? context.controller.toolState('playbooks:mock-api', createMockAdminApi)
    : context.controller.liveAdapter()?.adminApi ?? null;
  if (api === null) return unavailable(context, 'Connect the authenticated admin authority to run guided remedies.');
  const containersApi = sandbox ? context.controller.toolState('playbooks:mock-containers', () => new MockMissingContainerRemedyApi())
    : context.controller.liveAdapter()?.missingContainerRemedyApi ?? null;
  const model = context.controller.toolState(`playbooks:${studioAdminServiceKey(api)}`, () => new RemedyPlaybookModel(api, containersApi));
  const selected = context.controller.toolState<{ value: RemedyPlaybookId }>('playbooks-canvas-kind', () => ({ value: 'player_stuck' }));
  const identity = editor(context, 'playbooks-identity', 'identity-bea');
  const entityId = editor(context, 'playbooks-entity', '10');
  const reason = editor(context, 'playbooks-reason', 'Investigating reported game-state problem');
  const state = model.snapshot(); const ui = new SurfaceComposer(context, controlBounds(context));
  const selectedStep = context.controller.toolState<{ index: number | null }>('playbooks-canvas-selected-step', () => ({ index: null }));
  ui.heading('playbooks-title', 'GUIDED REMEDIES · INSPECT → PREVIEW → COMMIT → VERIFY');
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { fixed: 48 }, { grow: 1 }, { fixed: 36 }]);
  const header = new SurfaceComposer(context, regions[0]!);
  const guidance = new SurfaceComposer(context, regions[1]!);
  const outcome = new SurfaceComposer(context, regions[3]!);
  header.heading('playbooks-workspace', state.title ?? 'PLAYBOOK EXECUTION');
  guidance.label('playbooks-guidance', 'Each remedy is locked to inspect, immutable preview, audited commit, and post-write verification.', 48);
  const stepsTable = retainedTable(context, 'playbooks-steps-table', regions[2]!, [
    { id: 'step', label: 'STEP', width: 62 },
    { id: 'name', label: 'GUARDED ACTION', minWidth: 220 },
    { id: 'status', label: 'STATUS', width: 112 },
    { id: 'detail', label: 'OUTCOME', minWidth: 180 },
  ], state.steps.map((step, index) => ({ id: String(index),
    cells: [String(index + 1), step.label, step.status.toUpperCase(), step.detail ?? '—'],
    selected: selectedStep.index === index || (selectedStep.index === null && state.activeStep === index),
  })), (_rowId, index) => { selectedStep.index = index; },
  state.input === null ? 'Start a guarded playbook to populate its steps' : 'No steps');
  ui.tabs('playbooks-kind', REMEDY_PLAYBOOK_IDS, selected.value, (value) => { selected.value = value as RemedyPlaybookId; context.invalidate(); });
  ui.field('playbooks-identity', 'Target identity', identity);
  if (selected.value === 'chest_disappeared') ui.field('playbooks-entity', 'Missing entity id', entityId);
  ui.field('playbooks-reason', 'Audited reason', reason);
  const writable = context.route.access === 'write';
  ui.button('playbooks-start', 'START GUARDED PLAYBOOK', () => {
    const input: RemedyInput = selected.value === 'player_stuck'
      ? { playbookId: selected.value, targetIdentity: identity.snapshot().value }
      : selected.value === 'lost_items_after_crash'
        ? { playbookId: selected.value, targetIdentity: identity.snapshot().value, stacks: [{ itemKind: 'apple', quantity: 1 }] }
        : { playbookId: selected.value, targetIdentity: identity.snapshot().value, entityId: entityId.snapshot().value };
    try { model.start(input, reason.snapshot().value); context.invalidate(); }
    catch (error: unknown) { context.controller.notifications.push('error', 'Playbook could not start', error instanceof Error ? error.message : String(error)); context.invalidate(); }
  }, { disabled: !writable });
  if (state.input !== null) {
    ui.button('playbooks-next', state.complete ? 'REMEDY VERIFIED' : 'RUN NEXT GUARDED STEP', () => run(context, 'Playbook step failed', () => model.advance()), { disabled: !writable || state.complete, tone: state.complete ? 'success' : 'normal' });
    outcome.label('playbooks-outcome', state.error ?? state.notice ?? (state.auditId === null ? 'No world write has occurred.' : `AUDIT ${state.auditId}`), 36);
  } else {
    outcome.label('playbooks-outcome', 'No world write has occurred.', 36);
  }
  return mergeSurfaces(ui.surface(), header.surface(), guidance.surface(), stepsTable, outcome.surface());
}

/** Canvas-native Operate/Observe dispatcher. It retains the existing audited
 * domain models and transports; only their former DOM projection is replaced. */
export function buildOperateObserveCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  switch (context.route.tool.id) {
    case 'players': return players(context);
    case 'containers': return containers(context);
    case 'objects': return objects(context);
    case 'npcs': return npcs(context);
    case 'world': return world(context);
    case 'membership': return membership(context);
    case 'observe': return observe(context);
    case 'playbooks': return playbooks(context);
    default: return unavailable(context, `No Operate/Observe canvas adapter for ${context.route.tool.id}.`);
  }
}

export const buildPlayersCanvasTool = buildOperateObserveCanvasTool;
export const buildContainersCanvasTool = buildOperateObserveCanvasTool;
export const buildObjectsCanvasTool = buildOperateObserveCanvasTool;
export const buildNpcsCanvasTool = buildOperateObserveCanvasTool;
export const buildWorldCanvasTool = buildOperateObserveCanvasTool;
export const buildMembershipCanvasTool = buildOperateObserveCanvasTool;
export const buildObserveCanvasTool = buildOperateObserveCanvasTool;
export const buildPlaybooksCanvasTool = buildOperateObserveCanvasTool;
