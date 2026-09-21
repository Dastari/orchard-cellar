import { studioActionBar, studioIconAction, studioLibraryDrawer } from '../../shell/workspace-controls.js';
import { studioSelectionEditor } from '../../shell/selection-editor.js';
import { studioDefinitionPreview, studioDefinitionPreviewLifecycle } from '../../shell/definition-preview.js';
import { studioDefinitionFields } from '../../shell/definition-fields.js';
import type { SupportedContentDefinition } from '@orchard/sim';
import { CanvasTextEditor, ui as kit, type UiElement, type UiTone, type UiTableState } from '@orchard/ui/studio';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { studioLiveContentSnapshot, studioLiveContentStatusSurface } from '../../shell/live-content-readiness.js';
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
  browserTable?: UiTableState;
  tab: string;
  mutationSequence: number;
  batchSummary: string;
}

function labelFor(definition: SupportedContentDefinition): string {
  if ('displayName' in definition && typeof definition.displayName === 'string') return definition.displayName;
  if ('name' in definition && typeof definition.name === 'string') return definition.name;
  if ('title' in definition && typeof definition.title === 'string') return definition.title;
  return definition.id;
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
    tab: 'fields',
    mutationSequence: 0,
    batchSummary: '',
  };
}

export function buildWorldAuthoringCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const live = context.controller.liveAdapter();
  const content = studioLiveContentSnapshot(live);
  if (content.mode === 'loading' || content.mode === 'unavailable') {
    return studioLiveContentStatusSurface(content);
  }
  const view = live?.view();
  const access = itemsAccessForConnection(context.route.access, live);
  const identity = view?.identity ?? 'anonymous';
  const state = context.controller.toolState(
    `world-authoring-canvas:${identity}:${access}:${content.contentKey}`,
    () => createState(context),
  );
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

  const id=(name:string)=>`${context.route.tool.id}-world:${name}`;
  const text=(name:string,value:string)=>kit.text(value,{id:id(name),layout:{width:'grow'}});
  const button=(name:string,label:string,onPress:()=>void,disabled=false,tone:UiTone='primary')=>kit.button({id:id(name),label,disabled,tone,layout:{width:'grow',shrink:0},onPress:()=>{
    try{onPress();}catch(error){report(context,`${label} failed`,error);}
  }});
  const input=(name:string,label:string,editor:CanvasTextEditor)=>kit.input({id:id(name),label,placeholder:label,editor,onChange:()=>context.invalidate()});
  const packMode=context.route.tool.id==='pack-studio';
  const kinds=packMode?([undefined,...WORLD_TABLE_KINDS] as const):WORLD_TABLE_KINDS;
  const controls=kit.flex({width:'grow',gap:4},[
    kit.select({id:id('kind'),label:'Definition kind',value:state.kind??'all',options:kinds.map(kind=>({value:kind??'all',label:(kind??'all').replaceAll('_',' ').replace(/^./u,value=>value.toUpperCase())})),onChange:kind=>{
      state.kind=kind==='all'?undefined:kind as WorldTableKind;state.selectedId=state.model.browser(state.kind,state.query.snapshot().value)[0]?.id??null;
      state.syncedId=null;state.browserTable=undefined;context.invalidate();
    }}),input('query','Search definitions',state.query),input('note','Publish / playtest reason',state.note),
    button('undo','Undo',()=>{state.model.undo();context.invalidate();},!snapshot.canUndo),
    button('redo','Redo',()=>{state.model.redo();context.invalidate();},!snapshot.canRedo),
    button('rebase','Rebase',()=>{
    try { state.model.rebase(); context.invalidate(); } catch (error) { report(context, 'World rebase blocked', error); }
    },!snapshot.conflict,'primary'),
    button('publish','Publish',()=>{
    state.mutationSequence += 1;
    void state.model.publish(`world.canvas.${state.mutationSequence}`, state.note.snapshot().value)
      .then(() => context.controller.notifications.push('success', 'World content published', 'Waiting for verified live head.'))
      .catch((error: unknown) => report(context, 'World publish failed', error)).finally(context.invalidate);
    },!snapshot.canPublish,'success'),
  ]);
  const browser=kit.table({id:id('browser-table'),label:state.kind?.toUpperCase()??'PACK',rows:entries,key:entry=>entry.id,
    columns:[{id:'name',label:'Name',value:entry=>entry.label}],
    selected:state.selectedId?[state.selectedId]:[],state:state.browserTable,onStateChange:next=>{state.browserTable=next;},onSelect:keys=>{
      const entry=entries.find(entry=>entry.id===keys[0]);if(!entry)return;state.selectedId=entry.id;state.syncedId=null;
      context.controller.selection.select({kind:'definition',definitionKind:entry.kind,id:entry.id});context.invalidate();
    },layout:{width:'grow',height:'grow'},
  });
  const editor=kit.scrollArea({width:'grow',height:'grow',gap:4},[
    text('editor-title',selected?labelFor(selected):'NO SELECTION'),
    ...(selected?[
      kit.textArea({id:id('definition-json'),label:'Definition JSON',editor:state.definition,readOnly:access==='read_only',rows:20,lineCount:true,resizable:true}),
      button('apply-json','Apply JSON',()=>{state.model.upsert(JSON.parse(state.definition.snapshot().value));context.invalidate();},access==='read_only','success'),
      button('delete','Delete definition',()=>{state.model.delete(selected.id);state.syncedId=null;context.invalidate();},access==='read_only','danger'),
    ]:[]),
  ]);
  const packControls:UiElement[]=[kit.textArea({id:id('pack-json'),label:'Pack JSON',editor:state.pack,readOnly:access==='read_only',rows:20,lineCount:true,resizable:true}),
    button('stage-pack','Stage pack',()=>{
      const batches=planBoundedPackImport(state.pack.snapshot().value,50);state.model.replaceWithPack(state.pack.snapshot().value);
      state.batchSummary=`${batches.length} BATCHES · ≤50 DEFINITIONS`;context.invalidate();
    },access==='read_only','success'),
    button('export-pack','Export pack',()=>{state.pack.setValue(serializeWorldPack(state.model.snapshot().definitions));state.batchSummary='CURRENT DRAFT SERIALIZED';context.invalidate();}),
  ];
  const manifest=worldPackManifest(snapshot.definitions),fixture=diffWorldPackManifest(snapshot.definitions,bootstrapManifest);
  const preview:UiElement[]=[
    ...[`PACK ${manifest.contentHash}`,state.batchSummary,`${manifest.definitionCount} DEFINITIONS · ${Object.keys(manifest.kindCounts).length} KINDS`,
      `ENGINE ${snapshot.engineGate.toUpperCase()}`,fixture.matches?'GIT FIXTURE: EXACT HASH MATCH':`FIXTURE DRIFT ${fixture.expectedHash} → ${fixture.actualHash}`,
      `${snapshot.validation.errors.length} ERRORS · ${snapshot.validation.warnings.length} WARNINGS`,`${snapshot.diffs.length} DRAFT CHANGES`]
      .filter(Boolean).map((line,index)=>text(`preview:${index}`,line)),
    ...snapshot.diffs.map((diff,index)=>text(`diff:${index}`,`${diff.kind.toUpperCase()} ${diff.id} · ${diff.changedPaths.join(', ')}`)),
    ...state.model.history().map((revision,index)=>text(`history:${index}`,`R${revision.revision} · ${revision.note||'UNTITLED'} · ${revision.actor}`)),
  ];
  const playtestKind=selected?.kind==='creature'||selected?.kind==='spawn'?'spawn':selected?.kind==='effect'?'apply_effect':selected?.kind==='upgrade'?'grant_upgrade':null;
  const playtestControls:UiElement[]=[];
  if(playtestKind==='spawn')playtestControls.push(input('playtest-space','Space',state.spaceId),input('playtest-x','Tile X',state.tileX),input('playtest-y','Tile Y',state.tileY),text('playtest-help','SPAWN USES EXACT SPACE + TILE'));
  else if(playtestKind==='apply_effect'||playtestKind==='grant_upgrade'){
    playtestControls.push(input('playtest-target','Player identity',state.targetPlayer));
    if(playtestKind==='grant_upgrade')playtestControls.push(input('playtest-rank','Rank',state.rank));
    playtestControls.push(text('playtest-help',playtestKind==='apply_effect'?'TARGET IDENTITY REQUIRED':'TARGET IDENTITY + EXACT RANK'));
  }else playtestControls.push(text('playtest-help','SELECT CREATURE, SPAWN, EFFECT OR UPGRADE'));
  const playtestReason = state.note.snapshot().value.trim();
  const integer = (editor: CanvasTextEditor): number => Number(editor.snapshot().value.trim());
  const target = state.targetPlayer.snapshot().value.trim();
  const playtestInputValid = playtestKind === 'spawn'
    ? [state.spaceId, state.tileX, state.tileY].every((editor) => Number.isSafeInteger(integer(editor)))
    : playtestKind === 'apply_effect' ? target.length > 0
      : playtestKind === 'grant_upgrade' ? target.length > 0 && Number.isSafeInteger(integer(state.rank)) && integer(state.rank) > 0
        : false;
  playtestControls.push(button('playtest','Playtest',()=>{
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
  },!snapshot.playtestAvailable||selected===null||!playtestInputValid||playtestReason.length<8,'success'));
  context.controller.validation.setIssues([
    ...snapshot.validation.errors.map((issue, index) => ({ id: `world:error:${index}`, severity: 'error' as const, message: issue.message })),
    ...snapshot.validation.warnings.map((issue, index) => ({ id: `world:warning:${index}`, severity: 'warning' as const, message: issue.message })),
  ]);
  const inspector=studioSelectionEditor({id:id('tabs'),label:'World content editor',value:state.tab,onChange:tab=>{state.tab=tab;context.invalidate();},tabs:[
    {id:'fields',label:'Details',content:studioDefinitionFields(context,{id:id('field'),draft:state.definition,readOnly:access==='read_only',apply:()=>{state.model.upsert(JSON.parse(state.definition.snapshot().value));}})},
    {id:'editor',label:'JSON',content:editor},
    ...(packMode?[{id:'pack',label:'Pack',content:kit.text('Import or export the content pack in the workspace.',{wrap:true})}]:[]),
    {id:'preview',label:'Changes',content:kit.text('Review draft changes in the workspace.',{wrap:true})},
    {id:'playtest',label:'Playtest',content:kit.scrollArea({width:'grow',height:'grow',gap:4},playtestControls)},
  ]});
  const [kindPicker, queryInput, noteInput, undo, redo, rebase, publish] = controls.children;
  const drawer = studioLibraryDrawer([kindPicker!, queryInput!], browser, [
    studioActionBar([studioIconAction(undo!, {lucide:'undo'}), studioIconAction(redo!, {lucide:'redo'}), studioIconAction(rebase!, {lucide:'cloudConnect'})]),
    noteInput!, publish!,
  ]);
  return {lifecycle:studioDefinitionPreviewLifecycle(context),kit:{controls:drawer,workspace:state.tab === 'pack' ? kit.scrollArea({width:'grow',height:'grow',gap:8,padding:8},packControls) : state.tab === 'preview' ? kit.scrollArea({width:'grow',height:'grow',gap:8,padding:8},preview) : studioDefinitionPreview(context,selected),inspector}};
}
