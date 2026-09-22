import { studioInventoryPreview } from '../shell/inventory-preview.js';
import { ui as kit, uiFixed, CanvasTextEditor, type UiElement, type UiTableState, type UiRect } from '@orchard/ui/studio';
import { createMockAdminApi } from '../admin/api.js';
import { studioAdminServiceKey } from '../admin/service-key.js';
import { isStudioRole, type StudioRole } from '../shell/access.js';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../shell/canvas-tool.js';
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

interface OperateColumn { readonly id: string; readonly label: string; readonly width?: number; readonly minWidth?: number }
interface OperateRow { readonly id: string; readonly cells: readonly string[]; readonly selected?: boolean; readonly disabled?: boolean }

interface EditorState {
  readonly editor: CanvasTextEditor;
}

interface StartedModel<T> {
  readonly model: T;
  started: boolean;
}


const trim = (value: unknown, maximum = 92): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length <= maximum ? text : `${text.slice(0, Math.max(0, maximum - 1))}…`;
};

const ACTION_CAPTIONS: Readonly<Record<string,string>> = {
  'MORE PLAYERS':'More players',
  'COMMIT EXACT PREVIEW':'Commit preview',
  'COMMIT EXACT PREVIEWS':'Commit previews',
  'Refresh bounded area':'Refresh area',
  'Refresh all bounded snapshots':'Refresh data',
  'PREVIEW REPAIR':'Preview repair',
  'PREVIEW BLOCK':'Preview block',
  'Inspect exact custody':'Inspect slots',
  'COMMIT AUDITED MEMBERSHIP CHANGE':'Commit preview',
  'UNDO LAST AUDITED CHANGE':'Undo last change',
  'PREVIEW CONTENT EDITOR GRANT':'Preview editor',
  'PREVIEW SUPPORT GRANT':'Preview support',
  'PREVIEW RELOCATION':'Preview move',
  'PREVIEW SAFE DESPAWN + SPILL':'Preview despawn',
  'PREVIEW ADVANCE TIME':'Preview time',
  'PREVIEW ALL SAFE REPAIRS':'Preview repairs',
  'START GUARDED PLAYBOOK':'Start remedy',
  'RUN NEXT GUARDED STEP':'Run next step',
  'REMEDY VERIFIED':'Remedy verified',
  'Preview give items':'Preview give',
  'Preview remove items':'Preview remove',
  'Preview set backpack slot':'Preview slot',
  'Preview wallet adjustment':'Preview wallet',
  'Preview skill points':'Preview points',
  'Preview reset skill tree':'Preview reset',
  'Preview complete quest':'Preview complete',
  'Preview display name':'Preview name',
};

class StudioToolForm {
  readonly primaryChildren: UiElement[] = [];
  readonly selectionChildren: UiElement[] = [];
  selection = false;
  get children(): UiElement[] { return this.selection ? this.selectionChildren : this.primaryChildren; }
  /** A null region places the form in the controls drawer. */
  constructor(readonly context: StudioCanvasToolContext, readonly region: OperateRegion | null = null) {}
  heading(id: string, label: string): void {
    if (this.region === null) return;
    const [title, ...summary] = label.split(' · ');
    this.children.push(kit.text(title ?? label, { id, role: 'header', wrap: false, layout: { width: 'grow' } }));
    if (summary.length) this.children.push(kit.text(summary.join(' · '), { layout: { width: 'grow' } }));
  }
  label(id: string, label: string, minimumHeight = 24): void { if (!label) return; this.children.push(kit.text(label, { id, layout: { width: 'grow', minHeight: uiFixed(minimumHeight / 2) } })); }
  field(id: string, label: string, editor: CanvasTextEditor): void {
    if (id.endsWith('-reason')) this.selection = true;
    this.children.push(kit.flex({ gap: 2, width: 'grow' }, [kit.text(label), kit.input({ id, label, editor })]));
  }
  button(id: string, label: string, activate: () => void, options: {
    readonly disabled?: boolean; readonly active?: boolean; readonly tone?: 'normal' | 'danger' | 'success';
    readonly tab?: boolean; readonly iconOnly?: boolean;
  } = {}): void {
    this.children.push(kit.tooltip(label, kit.button({ id, label:ACTION_CAPTIONS[label]??(/^PREVIEW REPAIR \d+ SELECTED$/u.test(label)?'Preview repair':/^PREVIEW SAFE DESPAWN \d+ SELECTED$/u.test(label)?'Preview despawn':label), disabled: options.disabled,
      tone: options.tone === 'danger' ? 'danger' : options.tone === 'success' || options.active ? 'success' : 'primary',
      layout: { width: 'grow', shrink: 0 }, onPress: activate }), { width: 'grow', height: uiFixed(24), shrink: 0 }));
  }
  tabs(prefix: string, values: readonly string[], active: string, choose: (value: string) => void): void {
    this.children.push(kit.select({ id: prefix, label: prefix.replaceAll('-', ' '), value: active,
      options: values.map(value => ({ value, label: value.replaceAll('_', ' ').replace(/^./u,char=>char.toUpperCase()) })), onChange: choose }));
  }
  surface(): StudioCanvasToolSurface {
    const controls = this.region === null;
    const content = kit.flex({ width: 'grow', gap: 4, ...(controls ? {} : { shrink: 0 }) }, this.primaryChildren);
    return { kit: { ...(controls ? { controls: content } : { workspace: content }),
      ...(this.selectionChildren.length ? { inspector: kit.flex({width:'grow',gap:4},this.selectionChildren) } : {}),
    } };
  }
}

function workspaceBounds(context: StudioCanvasToolContext): UiRect {
  return context.workspaceBounds ?? context.bounds;
}

function mergeSurfaces(...surfaces: readonly StudioCanvasToolSurface[]): StudioCanvasToolSurface {
  const controls = surfaces.flatMap(surface => surface.kit?.controls ? [surface.kit.controls] : []);
  const workspace = surfaces.flatMap(surface => surface.kit?.workspace ? [surface.kit.workspace] : []);
  const inspector = surfaces.flatMap(surface => surface.kit?.inspector ? [surface.kit.inspector] : []);
  const lifecycles = surfaces.flatMap(surface=>surface.lifecycle?[surface.lifecycle]:[]);
  return { ...(lifecycles.length ? {lifecycle:{key:lifecycles.map(entry=>entry.key).join('|'),dispose:()=>{for(const entry of lifecycles)entry.dispose();}}} : {}), kit: {
    controls: kit.flex({ width: 'grow', gap: 4 }, controls),
    workspace: kit.scrollArea({ width: 'grow', height: 'grow', gap: 8, padding: 8 }, workspace),
    ...(inspector.length ? { inspector: kit.flex({width:'grow',gap:8},inspector) } : {}),
  } };
}

/** Operate workspaces stack fixed header/outcome rows around growing table
 * rows inside a kit scroll area. The kit arranges them; this only budgets the
 * logical height each virtual table may claim (4px padding, 6px gaps). */
interface OperateRegion { readonly height: number }
function columnRegions(bounds: UiRect, sizes: readonly ({ readonly fixed: number } | { readonly grow: number })[]): readonly OperateRegion[] {
  const fixed = sizes.reduce((sum, size) => sum + ('fixed' in size ? size.fixed : 0), 0);
  const weight = sizes.reduce((sum, size) => sum + ('grow' in size ? size.grow : 0), 0);
  const free = Math.max(0, bounds.height - 8 - 6 * Math.max(0, sizes.length - 1) - fixed);
  return sizes.map(size => ({ height: 'fixed' in size ? size.fixed : Math.max(80, free * size.grow / Math.max(1, weight)) }));
}

function retainedTable(
  context: StudioCanvasToolContext, id: string, region: OperateRegion,
  columns: readonly OperateColumn[], rows: readonly OperateRow[],
  selectRow?: (rowId: string, rowIndex: number) => void, emptyLabel = 'No rows',
): StudioCanvasToolSurface {
  if (rows.length === 0) return { kit: { workspace: kit.text(emptyLabel, { id: `${id}:empty`, layout: { width: 'grow', shrink: 0 } }) } };
  const retained = context.controller.toolState<{ value?: UiTableState }>(`operate-table:${id}`, () => ({}));
  const table = kit.table<OperateRow>({ state: retained.value, onStateChange: value => { retained.value = value; }, id, label: id, rows, key: row => row.id, surface: 'studio',
    columns: columns.map((column, index) => {
      const label = ({SEVERITY:'Level',STATE:'State',STATUS:'State',STEP:'#','VALIDATION ISSUE':'Issue','STUDIO GRANTS':'Grants','SPACE · TILE':'Position',DEFINITION:'Definition',ENTITY:'ID'} as Record<string,string>)[column.label] ?? column.label.charAt(0)+column.label.slice(1).toLowerCase();
      return { id: column.id, label, ...(column.width ? { width: uiFixed(Math.max(column.width / 2, label.length * 6 + 16)) } : {}),
        value: row => row.cells[index] ?? '', render: row => kit.tooltip(row.cells[index]??'',kit.text(row.cells[index]??'',{wrap:false,layout:{width:'grow'}}),{width:'grow',height:'grow'}) };
    }),
    selected: rows.filter(row => row.selected).map(row => row.id),
    layout: { width: 'grow', height: uiFixed(Math.max(64, Math.min(region.height / 2, 32 + rows.length * 24))), shrink: 0 },
    onSelect: keys => { const key = keys.at(-1), index = rows.findIndex(row => row.id === key), row = rows[index];
      if (row && !row.disabled) { selectRow?.(row.id,index); context.invalidate(); }
    },
  });
  return { kit: { workspace: kit.flex({ width: 'grow', gap: 4, shrink: 0 }, [table, ...(rows.length ? [] : [kit.text(emptyLabel)])]) } };
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
  const ui = new StudioToolForm(context);
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
  const ui = new StudioToolForm(context);
  const state = model.snapshot();
  ui.heading('players-title', 'PLAYER SEARCH & GUARDED REMEDIES');
  ui.field('players-query', 'Name or identity', query);
  ui.button('players-find', state.loading ? 'Searching' : 'Find players', () => run(context, 'Player search failed', () => model.search(query.snapshot().value)), { disabled: state.loading, iconOnly: true });
  if (state.nextCursor !== null) ui.button('players-more', 'MORE PLAYERS', () => run(context, 'Player page failed', () => model.loadMore()));
  const playerRegions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { grow: 1 }, { fixed: state.player === null ? 52 : 278 }]);
  const playerHeader = new StudioToolForm(context, playerRegions[0]!);

  const playerTable = retainedTable(context, 'players-results-table', playerRegions[1]!, [
    { id: 'status', label: 'STATUS', width: 84 },
    { id: 'name', label: 'PLAYER', minWidth: 120 },
    { id: 'identity', label: 'IDENTITY', minWidth: 180 },
  ], state.results.map((row) => ({ id: row.identity,
    cells: [row.online ? 'ONLINE' : 'OFFLINE', row.displayName, row.identity],
    selected: row.identity === state.selectedIdentity,
  })), (identity) => run(context, 'Player snapshot failed', () => model.select(identity)),
  state.loading ? 'Loading players…' : 'No matching players');
  const playerDetail = new StudioToolForm(context, playerRegions[2]!);
  if (state.player === null) {
    if (state.loading || state.results.length) playerDetail.label('players-empty', state.loading ? 'Loading player…' : 'Choose a player to inspect.', 40);
    return mergeSurfaces(ui.surface(), playerHeader.surface(), playerTable, playerDetail.surface());
  }
  playerDetail.heading('players-profile', `${state.player.displayName} · ${state.player.online ? 'ONLINE' : 'OFFLINE'}`);
  playerDetail.tabs('players-tab', PLAYER_MANAGER_TABS, state.tab, (tab) => { model.selectTab(tab as PlayerManagerTab); context.invalidate(); });
  playerDetail.label('players-tab-detail', playerTabSummary(state.tab, state), 52);
  ui.field('players-reason', 'Audited reason', reason);
  const actionInputs = playerActionEditors(context, state.tab, state);
  for (const [key, field] of Object.entries(actionInputs)) ui.field(`players-action-${key}`, field.label, field.editor);
  if (state.tab === 'notices') ui.field('players-notice', 'Notice', notice);
  const write = context.route.access === 'write';
  for (const action of playerActionsForTab(state.tab, state, notice.snapshot().value)) {
    const access = model.operationState(action.draft.operation);
    ui.button(`players-preview-${action.draft.operation}`, action.label, () => {
      model.setReason(reason.snapshot().value);
      run(context, `${action.label} failed`, async () => {
        const draft = playerActionDraft(action.draft, Object.fromEntries(Object.entries(actionInputs).map(([key, field]) => [key, field.editor.snapshot().value])));
        return model.preview(draft);
      });
    }, { disabled: !write || !access.enabled,
      tone: action.draft.operation === 'kick' ? 'danger' : 'normal' });
  }
  playerDetail.label('players-preview', state.pendingPreview === null ? ''
    : `PREVIEW · ${state.pendingPreview.preview.changes.length} exact change(s) · BASE ${state.pendingPreview.baseVersion}`, 36);
  ui.button('players-commit', 'COMMIT EXACT PREVIEW', () => run(context, 'Player commit failed', () => model.commit()),
    { disabled: !write || state.pendingPreview === null, tone: 'danger' });
  ui.button('players-undo', 'UNDO LAST AUDITED CHANGE', () => run(context, 'Player undo failed', () => model.undoLast()),
    { disabled: !write || state.undoAuditId === null });
  const inventory = state.tab === 'inventory' && state.inventory ? studioInventoryPreview(context,
    [...new Set(state.inventory.slots.map(entry=>entry.slot.area))].map(area=>({name:area,
      slots:state.inventory!.slots.filter(entry=>entry.slot.area===area).map(entry=>({index:entry.slot.index,stack:entry.stack}))})),
    (area,index)=>{if(area==='backpack'){actionInputs['slotIndex']?.editor.setValue(String(index));context.invalidate();}}) : {};
  return mergeSurfaces(ui.surface(), playerHeader.surface(), playerTable, playerDetail.surface(), inventory);
}

function playerActionEditors(context: StudioCanvasToolContext, tab: PlayerManagerTab, state: ReturnType<PlayerManagerModel['snapshot']>): Record<string, {label:string;editor:CanvasTextEditor}> {
  const position = state.player?.position ?? {};
  const definitions: readonly [string,string,string][] = tab==='position'
    ? [['spaceId','Space',String(position['spaceId']??'0')],['tileX','Tile X',String(position['tileX']??0)],['tileY','Tile Y',String(position['tileY']??0)]]
    : tab==='inventory' ? [['itemKind','Item','apple'],['quantity','Quantity','1'],['slotIndex','Backpack slot','0']]
    : tab==='wallet_stats' ? [['deltaBronze','Bronze adjustment','1']]
    : tab==='skills' ? [['track','Skill track','farming'],['points','Points','1']]
    : tab==='quests' ? [['questId','Quest','orchard_welcome']]
    : tab==='membership_connections' ? [['displayName','Display name',state.player?.displayName??'']]
    : [];
  return Object.fromEntries(definitions.map(([key,label,value])=>[key,{label,editor:editor(context,`player-action:${state.selectedIdentity}:${key}`,value)}]));
}

function playerActionDraft(draft: PlayerMutationDraft, values: Readonly<Record<string,string>>): PlayerMutationDraft {
  const integer = (key:string,minimum=-Number.MAX_SAFE_INTEGER) => {
    const raw=values[key]??'',value=Number(raw);
    if(!raw.trim()||!Number.isSafeInteger(value)||value<minimum)throw new Error(`${key} requires a whole number${minimum>=0?` of at least ${minimum}`:''}.`);
    return value;
  };
  const required = (key:string) => {const value=values[key]?.trim();if(!value)throw new Error(`${key} is required.`);return value;};
  switch(draft.operation){
    case 'teleport_player':case 'set_spawn':return {...draft,spaceId:required('spaceId'),tileX:integer('tileX'),tileY:integer('tileY')};
    case 'give_items':case 'remove_items':return {...draft,stacks:[{itemKind:required('itemKind'),quantity:integer('quantity',1)}]};
    case 'set_slot':return {...draft,slot:{area:'backpack',index:integer('slotIndex',0)},stack:{itemKind:required('itemKind'),quantity:integer('quantity',1)}};
    case 'set_wallet':return {...draft,deltaBronze:required('deltaBronze')};
    case 'grant_skill_points':return {...draft,track:required('track'),points:integer('points',1)};
    case 'reset_skill_tree':return {...draft,track:required('track')};
    case 'set_quest_state':return {...draft,questId:required('questId')};
    case 'set_display_name':return {...draft,displayName:required('displayName')};
    default:return draft;
  }
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
      { label: 'Preview give items', draft: { operation: 'give_items', stacks: [{ itemKind: 'apple', quantity: 1 }] } },
      { label: 'Preview remove items', draft: { operation: 'remove_items', stacks: [{ itemKind: 'apple', quantity: 1 }] } },
      { label: 'Preview set backpack slot', draft: { operation: 'set_slot', slot: { area: 'backpack', index: 0 }, stack: { itemKind: 'apple', quantity: 1 } } },
      { label: 'Preview clear cursor', draft: { operation: 'clear_cursor' } },
      { label: 'Preview drain overflow', draft: { operation: 'drain_overflow' } },
    ];
    case 'wallet_stats': return [
      { label: 'Preview wallet adjustment', draft: { operation: 'set_wallet', deltaBronze: '1' } },
      { label: 'Preview reviewed stat', draft: { operation: 'set_stats', patch: { studioReviewed: true } } },
    ];
    case 'vitals_effects': return [
      { label: 'Preview restore stamina', draft: { operation: 'set_vitals', patch: { stamina: 100 } } },
    ];
    case 'skills': return [
      { label: 'Preview skill points', draft: { operation: 'grant_skill_points', track: 'farming', points: 1 } },
      { label: 'Preview reset skill tree', draft: { operation: 'reset_skill_tree', track: 'farming' } },
    ];
    case 'quests': return [
      { label: 'Preview complete quest', draft: { operation: 'set_quest_state', questId: 'orchard_welcome', state: 'complete' } },
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
    case 'position': return `Position: ${String(player.position?.['spaceId'] ?? '?')} · ${String(player.position?.['tileX'] ?? '?')}, ${String(player.position?.['tileY'] ?? '?')}\nSpawn: ${String(player.spawn?.['spaceId'] ?? '?')} · ${String(player.spawn?.['tileX'] ?? '?')}, ${String(player.spawn?.['tileY'] ?? '?')}`;
    case 'inventory': return `${state.inventory?.slots.length ?? 0} SLOTS · ${state.inventory?.slots.filter(({ slot, stack }) => slot.area === 'overflow' && stack !== null).length ?? 0} OVERFLOW`;
    case 'wallet_stats': return `BRONZE ${player.walletBronze} · STATS ${trim(player.stats, 56)}`;
    case 'vitals_effects': return `VITALS ${trim(player.vitals, 46)} · EFFECTS ${player.effects.length}`;
    case 'skills': return `TRACKS ${trim(player.skillTracks, 72)}`;
    case 'quests': return `QUESTS ${trim(player.quests, 72)}`;
    case 'statistics': return `STATISTICS ${trim(player.statistics, 72)}`;
    case 'membership_connections': return `${player.membership.role.toUpperCase()} · ${state.connections.length} CONNECTION EVENT(S)`;
    case 'notices': return state.notice ?? 'Compose a message in the selection drawer.';
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
  const state = model.snapshot(); const ui = new StudioToolForm(context);
  ui.heading('containers-title', 'CONTAINER CUSTODY INSPECTOR');
  ui.field('containers-entity', 'Entity id', entityId);
  ui.button('containers-inspect', 'Inspect exact custody', () => run(context, 'Container inspection failed', () => model.inspect(entityId.snapshot().value)), { iconOnly: true });
  ui.field('containers-reason', 'Audited reason', reason);
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { fixed: 42 }, { grow: 1 }, { fixed: 36 }]);
  const summary = new StudioToolForm(context, regions[0]!);
  const custody = new StudioToolForm(context, regions[1]!);
  const outcome = new StudioToolForm(context, regions[3]!);
  const container = state.container;
  if (container !== null) summary.heading('containers-profile', `${container.definitionId} · ENTITY ${container.entityId}`);
  custody.label('containers-custody', container === null
    ? ''
    : `Owner ${container.ownerIdentity ?? 'World'} · Space ${container.position['spaceId'] ?? '—'} · Tile ${container.position['tileX'] ?? '—'}, ${container.position['tileY'] ?? '—'}`, 42);
  const slotTable = container === null ? {kit:{workspace:kit.text('Inspect a container to load its slots')}}
    : studioInventoryPreview(context,[{name:'Container',slots:container.slots.map((stack,index)=>({index,stack}))}]);
  const writable = context.route.access === 'write' && (role === 'owner' || role === 'admin');
  ui.button('containers-preview-repair', 'PREVIEW REPAIR', () => { model.setReason(reason.snapshot().value); run(context, 'Repair preview failed', () => model.preview({ operation: 'repair_entity' })); }, { disabled: !writable });
  ui.button('containers-preview-despawn', 'PREVIEW SAFE DESPAWN + SPILL', () => { model.setReason(reason.snapshot().value); run(context, 'Despawn preview failed', () => model.preview({ operation: 'despawn_entity', spillContents: true })); }, { disabled: !writable, tone: 'danger' });
  outcome.label('containers-preview', state.pending === null ? '' : `PREVIEW ${state.pending.preview.preview.changes.length} CHANGE(S) · BASE ${state.pending.baseVersion}`, 36);
  ui.button('containers-commit', 'COMMIT EXACT PREVIEW', () => run(context, 'Container commit failed', () => model.commit()), { disabled: !writable || state.pending === null, tone: 'danger' });
  if(container===null)ui.selectionChildren.length=0;
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
  const state = model.model.snapshot(); const ui = new StudioToolForm(context);
  ui.heading('objects-title', `LIVE OBJECT QUERY · ${state.rows.length} ROW(S) · SCANNED ${state.rowsScanned}`);
  ui.button('objects-refresh', state.loading ? 'Loading objects' : 'Refresh bounded area', () => run(context, 'Object query failed', () => model.model.load()), { disabled: state.loading, iconOnly: true });
  ui.field('objects-reason', 'Audited reason', reason);
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { grow: 1 }, { fixed: 36 }]);
  const header = new StudioToolForm(context, regions[0]!);
  const outcome = new StudioToolForm(context, regions[2]!);

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
  outcome.label('objects-preview', state.pending.length === 0 ? '' : `${state.pending.length} EXACT PREVIEW(S) READY`, 32);
  ui.button('objects-commit', 'COMMIT EXACT PREVIEWS', () => run(context, 'Object commit failed', () => model.model.commit()), { disabled: !writable || state.pending.length === 0, tone: 'danger' });
  if(state.selected.size===0)ui.selectionChildren.length=0;
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
  const state = retained.model.snapshot(); const ui = new StudioToolForm(context);
  ui.heading('npcs-title', `NPC MANAGER · ${state.rows.length} LIVE ACTOR(S)`);
  ui.field('npcs-filter', 'Definition or id filter', filter);
  ui.button('npcs-refresh', 'Refresh NPCs', () => { retained.model.setFilter(filter.snapshot().value); run(context, 'NPC query failed', () => retained.model.load()); }, { iconOnly: true });
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { grow: 1 }, { fixed: 36 }]);
  const header = new StudioToolForm(context, regions[0]!);
  const outcome = new StudioToolForm(context, regions[2]!);

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
  ui.selection = true;
  ui.field('npcs-x', 'Relocate tile X', x); ui.field('npcs-y', 'Relocate tile Y', y); ui.field('npcs-reason', 'Audited reason', reason);
  const writable = context.route.access === 'write' && (role === 'owner' || role === 'admin');
  ui.button('npcs-preview', 'PREVIEW RELOCATION', () => {
    retained.model.setReason(reason.snapshot().value);
    run(context, 'NPC relocation preview failed', () => retained.model.previewRelocate(state.selected?.spaceId ?? '0', Number(x.snapshot().value), Number(y.snapshot().value)));
  }, { disabled: !writable || state.selected === null });
  outcome.label('npcs-preview-state', state.pending === null ? '' : `PREVIEW ${state.pending.preview.preview.changes.length} CHANGE(S)`, 32);
  ui.button('npcs-commit', 'COMMIT EXACT PREVIEW', () => run(context, 'NPC relocation failed', () => retained.model.commit()), { disabled: !writable || state.pending === null, tone: 'danger' });
  if(state.selected===null)ui.selectionChildren.length=0;
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
  const state = retained.model.snapshot(); const ui = new StudioToolForm(context);
  const selectedSpace = context.controller.toolState<{ id: string | null }>('world-canvas-selected-space', () => ({ id: null }));
  ui.heading('world-title', 'WORLD CONTROL · EXACT PREVIEW + AUDIT');
  ui.button('world-refresh', state.loading ? 'Loading world' : 'Refresh world', () => run(context, 'World load failed', () => retained.model.load()), { disabled: state.loading, iconOnly: true });
  ui.button('world-validate', 'Validate world', () => run(context, 'World validation failed', () => retained.model.validate()), { iconOnly: true });
  ui.field('world-reason', 'Audited reason', reason);
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 42 }, { grow: 1 }, { grow: 1 }, { fixed: 36 }]);
  const environment = new StudioToolForm(context, regions[0]!);
  const outcome = new StudioToolForm(context, regions[3]!);
  environment.label('world-environment', state.world === null ? 'Loading bounded world-control snapshot…'
    : `Weather ${state.world.environment.weatherMode} · Wind ${state.world.environment.windDirection}`, 38);
  const spacesTable = retainedTable(context, 'world-spaces-table', regions[1]!, [
    { id: 'label', label: 'SPACES', minWidth: 140 },
    { id: 'space', label: 'ID', width: 72 },
    { id: 'size', label: 'SIZE', width: 82 },
    { id: 'flags', label: 'FLAGS', minWidth: 150 },
  ], (state.world?.spaces ?? []).map((space) => ({ id: space.spaceId,
    cells: [space.label, space.spaceId, String(space.sizeTiles), Object.entries(space.flags).filter(([,enabled])=>enabled===true).map(([flag])=>flag.replace(/([a-z])([A-Z])/gu,'$1 $2')).join(', ')||'None'],
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
  outcome.label('world-preview', state.pending === null ? '' : `PREVIEW ${state.pending.preview.preview.changes.length} CHANGE(S) · ${state.pending.preview.fingerprint}`, 36);
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
  const state = retained.model.snapshot(); const ui = new StudioToolForm(context);
  ui.heading('membership-title', 'MEMBERSHIP & STUDIO GRANTS');
  ui.field('membership-query', 'Name or identity', query);
  ui.button('membership-find', state.loading ? 'Searching members' : 'Find members', () => run(context, 'Membership search failed', () => retained.model.search(query.snapshot().value)), { disabled: state.loading, iconOnly: true });
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { grow: 1 }, { fixed: 36 }]);
  const header = new StudioToolForm(context, regions[0]!);
  const outcome = new StudioToolForm(context, regions[2]!);

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
  outcome.label('membership-preview', state.pending === null ? '' : `PREVIEW ${state.pending.preview.changes.length} CHANGE(S) · BASE ${state.pending.baseVersion}`, 36);
  ui.button('membership-commit', 'COMMIT AUDITED MEMBERSHIP CHANGE', () => run(context, 'Membership commit failed', () => retained.model.commit()), { disabled: !writable || state.pending === null, tone: 'danger' });
  if(state.selectedIdentity===null)ui.selectionChildren.length=0;
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
  const state = retained.model.snapshot(); const ui = new StudioToolForm(context);
  ui.heading('observe-title', 'WORLD OBSERVE · READ ONLY');
  ui.tabs('observe-tab', OBSERVE_TABS, state.tab, (tab) => { retained.model.selectTab(tab as ObserveTab); context.invalidate(); });
  ui.button('observe-refresh', state.loading ? 'Refreshing observations' : 'Refresh all bounded snapshots', () => run(context, 'Observe refresh failed', () => retained.model.refresh()), { disabled: state.loading, iconOnly: true });
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { grow: 1 }, { fixed: 36 }]);
  const header = new StudioToolForm(context, regions[0]!);
  const status = new StudioToolForm(context, regions[2]!);
  header.heading('observe-results', state.tab.replaceAll('_', ' ').toUpperCase());
  const data = observeTableData(state.tab, state);
  const observeTable = retainedTable(context, `observe-${state.tab}-table`, regions[1]!, data.columns,
  data.rows,
  undefined, state.loading ? 'Refreshing observations…' : `No ${state.tab.replaceAll('_', ' ')} rows`);
  if (state.tab === 'client_errors' && state.clientErrorCursor !== null) ui.button('observe-more-errors', 'MORE CLIENT ERRORS', () => run(context, 'Client-error page failed', () => retained.model.moreClientErrors()));
  if (state.tab === 'audit' && state.auditCursor !== null) ui.button('observe-more-audit', 'MORE AUDIT EVENTS', () => run(context, 'Audit page failed', () => retained.model.moreAudit()));
  if (state.tab === 'connections' && state.connectionCursor !== null) ui.button('observe-more-connections', 'MORE CONNECTION EVENTS', () => run(context, 'Connection page failed', () => retained.model.moreConnections()));
  if(state.error)status.label('observe-status', state.error, 36);
  return mergeSurfaces(ui.surface(), header.surface(), observeTable, status.surface());
}

function observeTableData(tab: ObserveTab, state: ReturnType<ObserveModel['snapshot']>): {columns:OperateColumn[];rows:OperateRow[]} {
  const columns=(labels:readonly string[])=>labels.map(label=>({id:label.toLowerCase().replaceAll(' ','-'),label}));
  switch(tab){
    case 'presence':return {columns:columns(['Player','Status','Space','Chunk']),rows:state.presence.map(row=>({id:row.identity,cells:[row.displayName,row.online?'Online':'Offline',row.spaceId,`${row.chunkX}, ${row.chunkY}`]}))};
    case 'connections':return {columns:columns(['Identity','Status','Connected','Remote address']),rows:state.connections.map(row=>({id:row.connectionId,cells:[row.identity,row.active?'Connected':'Disconnected',row.connectedAtMicros,row.remoteAddress??'—']}))};
    case 'client_errors':return {columns:columns(['Error','Message','Route','Build']),rows:state.clientErrors.map(row=>({id:row.id,cells:[row.kind,row.message,row.route,row.buildId]}))};
    case 'audit':return {columns:columns(['Action','Actor','Target','Time']),rows:state.audit.map(row=>({id:row.id,cells:[row.operation,row.actorIdentity,trim(row.target,100),row.occurredAtMicros]}))};
    case 'validation':return {columns:columns(['Severity','Issue','Detail','Repairable']),rows:(state.validation?.issues??[]).map((row,index)=>({id:String(index),cells:[row.severity,row.code,row.message,row.repairable?'Yes':'No']}))};
    case 'telemetry':return {columns:columns(['Metric','Value']),rows:Object.entries(state.telemetry??{}).flatMap(([group,value])=>
      value!==null&&typeof value==='object'?Object.entries(value).map(([key,metric])=>({id:`${group}.${key}`,cells:[`${group} / ${key}`,String(metric)]})):[{id:group,cells:[group,String(value)]}])};
  }
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
  const state = model.snapshot(); const ui = new StudioToolForm(context);
  const selectedStep = context.controller.toolState<{ index: number | null }>('playbooks-canvas-selected-step', () => ({ index: null }));
  ui.heading('playbooks-title', 'GUIDED REMEDIES · INSPECT → PREVIEW → COMMIT → VERIFY');
  const regions = columnRegions(workspaceBounds(context), [{ fixed: 38 }, { fixed: 48 }, { grow: 1 }, { fixed: 36 }]);
  const header = new StudioToolForm(context, regions[0]!);
  const guidance = new StudioToolForm(context, regions[1]!);
  const outcome = new StudioToolForm(context, regions[3]!);
  header.heading('playbooks-workspace', state.title ?? 'Remedy steps');
  guidance.label('playbooks-guidance', '', 48);
  const stepsTable = retainedTable(context, 'playbooks-steps-table', regions[2]!, [
    { id: 'step', label: 'STEP', width: 62 },
    { id: 'name', label: 'Action', minWidth: 220 },
    { id: 'status', label: 'STATUS', width: 112 },
    { id: 'detail', label: 'OUTCOME', minWidth: 180 },
  ], state.steps.map((step, index) => ({ id: String(index),
    cells: [String(index + 1), step.label, step.status.toUpperCase(), step.detail ?? '—'],
    selected: selectedStep.index === index || (selectedStep.index === null && state.activeStep === index),
  })), (_rowId, index) => { selectedStep.index = index; },
  state.input === null ? 'Choose a remedy and start its preview.' : 'No steps');
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
    outcome.label('playbooks-outcome', state.error ?? state.notice ?? (state.auditId === null ? '' : `AUDIT ${state.auditId}`), 36);
  } else {
    outcome.label('playbooks-outcome', '', 36);
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
