import { consumeStudioDefinition } from '../../shell/content-navigation.js';
import { studioActionBar, studioIconAction, studioLibraryDrawer } from '../../shell/workspace-controls.js';
import { studioSelectionEditor } from '../../shell/selection-editor.js';
import { studioDefinitionFields } from '../../shell/definition-fields.js';
import { studioDefinitionPreview, studioDefinitionPreviewLifecycle } from '../../shell/definition-preview.js';
import type { ItemDefinitionId, SupportedContentDefinition } from '@orchard/sim';
import lifecycleSourceBundle from '@orchard/lifecycle-authoring/source' with { type: 'json' };
import { CanvasTextEditor, ui as kit, type UiElement, type UiTone, type UiTableState } from '@orchard/ui/studio';
import {
  STUDIO_LIFECYCLE_TRIGGER_ORDER,
  type LifecycleDraftStorage,
  type StudioLifecycleSourceBundle,
} from '../../lifecycle/model.js';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { studioLiveContentSnapshot, studioLiveContentStatusSurface } from '../../shell/live-content-readiness.js';
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
  browserTable?: UiTableState;
  tab: string;
  mutationSequence: number;
  lifecycleItemId: ItemDefinitionId | null;
  lifecycleHandlerId: string | null;
  lifecycleSyncedHandlerId: string | null;
  lifecycleEditorMode: 'source' | 'bundle';
  lifecycleSyncing: boolean;
}

function labelFor(definition: SupportedContentDefinition): string {
  return 'displayName' in definition && typeof definition.displayName === 'string'
    ? definition.displayName : definition.id;
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
    tab: 'fields',
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

export function buildItemsCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const live = context.controller.liveAdapter();
  const content = studioLiveContentSnapshot(live);
  if (content.mode === 'loading' || content.mode === 'unavailable') {
    return studioLiveContentStatusSurface(content);
  }
  const view = live?.view();
  const access = itemsAccessForConnection(context.route.access, live);
  const identity = view?.identity ?? 'anonymous';
  const state = context.controller.toolState(
    `items-canvas:${identity}:${access}:${content.contentKey}`,
    () => createState(context),
  );
  const head = view === undefined ? null : itemsHeadFromConnection(view);
  if (head !== null) state.model.receiveHead(head);
  state.model.receiveHistory(view === undefined ? [] : itemsHistoryFromConnection(view));

  const requested = consumeStudioDefinition(context.controller, kind => (ITEMS_TOOL_CONTENT_KINDS as readonly string[]).includes(kind));
  if (requested) { state.kind = requested.split(':')[0] as ItemsToolContentKind; state.selectedId = requested; state.syncedId = null; state.query.setValue(''); }
  const createDefinition = (kind: 'item' | 'recipe') => {
    const definition = state.model.createDefinition(kind);
    state.kind = kind; state.selectedId = definition.id; state.syncedId = null; state.query.setValue(''); state.tab = 'fields'; state.model.persistDraft();
  };
  const command = context.controller.consumeAuthorCommand();
  if (command) { try { createDefinition(command === 'item.new' ? 'item' : 'recipe'); } catch (error) { report(context, 'Create definition failed', error); } }
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

  const id=(name:string)=>`${context.route.tool.id}-items:${name}`;
  const text=(name:string,value:string)=>kit.text(value,{id:id(name),layout:{width:'grow'}});
  const button=(name:string,label:string,onPress:()=>void,disabled=false,tone:UiTone='primary')=>kit.button({id:id(name),label,disabled,tone,layout:{width:'grow',shrink:0},onPress:()=>{
    try { onPress(); } catch(error) { report(context,`${label} failed`,error); }
  }});
  const selectDefinition=(definitionId:string)=>{
    const definition=definitions.find(entry=>entry.id===definitionId);if(!definition)return;
    state.selectedId=definition.id;state.syncedId=null;
    context.controller.selection.select({kind:'definition',definitionKind:definition.kind,id:definition.id});context.invalidate();
  };
  const controls=kit.flex({width:'grow',gap:4},[
    kit.select({id:id('kind'),label:'Definition kind',value:state.kind,options:ITEMS_TOOL_CONTENT_KINDS.map(kind=>({value:kind,label:kind.replaceAll('_',' ').replace(/^./u, value=>value.toUpperCase())})),onChange:kind=>{
      state.kind=kind as ItemsToolContentKind;state.selectedId=state.model.definitions(state.kind,state.query.snapshot().value)[0]?.id??null;
      state.syncedId=null;state.browserTable=undefined;context.invalidate();
    }}),
    kit.input({id:id('query'),label:'Search definitions',placeholder:'Search definitions',editor:state.query,onChange:()=>context.invalidate()}),
    kit.input({id:id('note'),label:'Publish note',placeholder:'Publish note',editor:state.note}),
    button('rebase','Rebase content',()=>{
    try { state.model.rebase('safe'); context.invalidate(); } catch (error) { report(context, 'Content rebase blocked', error); }
    },snapshot.conflict === null,'primary'),
    button('clear','Clear draft',()=>{
    try { state.model.clearDraft(); state.syncedId = null; context.invalidate(); } catch (error) { report(context, 'Clear draft failed', error); }
    },!snapshot.dirty,'danger'),
    button('publish','Publish',()=>{
    state.mutationSequence += 1;
    void state.model.publish(`items.canvas.${state.mutationSequence}`, state.note.snapshot().value)
      .then(() => context.controller.notifications.push('success', 'Content published', 'Waiting for the verified live head.'))
      .catch((error: unknown) => report(context, 'Content publish failed', error)).finally(context.invalidate);
    },!snapshot.canPublish,'success'),
    text('status',`${access.toUpperCase()} · HEAD ${snapshot.headRevision} · ${snapshot.diffs.length} CHANGES · ${snapshot.validation.errors.length} ERRORS`),
  ]);
  const browser=kit.table({id:id('browser-table'),label:`${state.kind.toUpperCase()} (${definitions.length})`,rows:definitions,key:definition=>definition.id,
    columns:[{id:'name',label:'Name',value:labelFor}],
    selected:state.selectedId?[state.selectedId]:[],state:state.browserTable,onStateChange:next=>{state.browserTable=next;},onSelect:keys=>{if(keys[0])selectDefinition(keys[0]);},layout:{width:'grow',height:'grow'},
  });
  const editor=kit.scrollArea({width:'grow',height:'grow',gap:4},[
    text('details-title',selected?labelFor(selected):'NO SELECTION'),
    ...(selected?[
      kit.textArea({id:id('definition-json'),label:'Definition JSON',editor:state.definition,readOnly:access==='read_only',rows:20,lineCount:true,resizable:true}),
      button('apply-json','Apply JSON',()=>{state.model.upsertDefinition(JSON.parse(state.definition.snapshot().value));state.model.persistDraft();context.invalidate();},access==='read_only','success'),
    ]:[]),
  ]);
  const lifecycleState = state.lifecycle.snapshot();
  const selectedItemId = selected?.kind === 'item' ? selected.id : null;
  const itemHandlers = selectedItemId === null ? [] : state.lifecycle.handlers(selectedItemId);
  const selectedHandler = itemHandlers.find(({ id }) => id === state.lifecycleHandlerId) ?? null;
  const globalHandlerIndex = selectedHandler === null ? -1
    : lifecycleState.bundle.handlers.findIndex(({ id }) => id === selectedHandler.id);
  const handlerDiagnostics = lifecycleState.diagnostics.filter(({ path }) => (
    globalHandlerIndex < 0 || path === '' || path.startsWith(`handlers[${globalHandlerIndex}]`)
  ));
  const lifecycleControls:UiElement[]=[
    text('lifecycle-ribbon',selectedItemId===null?'ITEM LIFECYCLE':'ON USE'),
    kit.flex({direction:'row',width:'grow',gap:4},[
      button('lifecycle-mode-source','Source',()=>{state.lifecycleEditorMode='source';context.invalidate();},false,state.lifecycleEditorMode==='source'?'success':'primary'),
      button('lifecycle-mode-bundle','Bundle',()=>{state.lifecycleEditorMode='bundle';context.invalidate();},false,state.lifecycleEditorMode==='bundle'?'success':'primary'),
    ]),
    kit.input({id:id('lifecycle-prompt'),label:'Callback prompt',placeholder:'Callback prompt',editor:state.lifecyclePrompt,disabled:selectedHandler===null||access==='read_only'}),
    kit.flex({direction:'row',width:'grow',wrap:true,gap:4},STUDIO_LIFECYCLE_TRIGGER_ORDER.map(trigger=>kit.checkbox({id:id(`lifecycle-trigger:${trigger}`),label:trigger,
      value:selectedHandler?.triggers.includes(trigger)===true,disabled:selectedHandler===null||access==='read_only',onChange:()=>{
        if(state.lifecycleHandlerId===null)return;state.lifecycle.toggleTrigger(state.lifecycleHandlerId,trigger);context.invalidate();
      }}))),
    kit.textArea({id:id(state.lifecycleEditorMode==='source'?'lifecycle-source':'lifecycle-bundle'),label:state.lifecycleEditorMode==='source'?'Callback source':'Import/export bundle',
      editor:state.lifecycleEditorMode==='source'?state.lifecycleSource:state.lifecycleBundle,rows:16,lineCount:true,resizable:true,
      readOnly:access==='read_only'||(state.lifecycleEditorMode==='source'&&selectedHandler===null)}),
    ...((handlerDiagnostics.length?handlerDiagnostics.map(({code,message})=>`${code.toUpperCase()}: ${message}`):[selectedHandler?'AST VALID':'NO CALLBACK SELECTED'])
      .map((line,index)=>text(`lifecycle-diagnostic:${index}`,line))),
    button('lifecycle-create','Create onUse callback',()=>{
    if (selectedItemId === null) return;
    const created = state.lifecycle.create(selectedItemId);
    state.lifecycleHandlerId = created.id;
    state.lifecycleSyncedHandlerId = null;
    state.lifecycleEditorMode = 'source';
    context.invalidate();
    },selectedItemId===null||itemHandlers.length>0||access==='read_only','success'),
    button('lifecycle-remove','Remove callback',()=>{
    if (state.lifecycleHandlerId === null) return;
    state.lifecycle.remove(state.lifecycleHandlerId);
    state.lifecycleHandlerId = null;
    state.lifecycleSyncedHandlerId = null;
    context.invalidate();
    },selectedHandler===null||access==='read_only','danger'),
    button('lifecycle-import','Import bundle',()=>{
    const imported = state.lifecycle.import(state.lifecycleBundle.snapshot().value);
    if (!imported.ok) {
      report(context, 'Lifecycle import failed', imported.diagnostics[0]?.message ?? 'Invalid lifecycle bundle.');
      return;
    }
    state.lifecycleHandlerId = null;
    state.lifecycleSyncedHandlerId = null;
    context.controller.notifications.push('success', 'Lifecycle bundle imported', 'Saved as a local warm-release draft; game code is unchanged.');
    context.invalidate();
    },access==='read_only'||state.lifecycleEditorMode!=='bundle'||state.lifecycleBundle.snapshot().value.trim().length===0,'primary'),
    button('lifecycle-export','Export bundle',()=>{
    const exported = state.lifecycle.export();
    if (!exported.ok) {
      report(context, 'Lifecycle export blocked', exported.diagnostics[0]?.message ?? 'Fix lifecycle diagnostics first.');
      return;
    }
    state.lifecycleBundle.setValue(exported.value);
    state.lifecycleEditorMode = 'bundle';
    context.controller.notifications.push('success', 'Lifecycle bundle prepared', 'Compiler-valid warm-release source; it is not live.');
    context.invalidate();
    },!lifecycleState.valid,'primary'),
    button('lifecycle-download','Download bundle',()=>{
    const download = state.lifecycle.download();
    if (!download.ok) {
      report(context, 'Lifecycle download blocked', download.diagnostics[0]?.message ?? 'Fix lifecycle diagnostics first.');
      return;
    }
    const requested = requestStudioFileDownload({ filename: download.value.filename, blob: download.value.blob });
    if (!requested.ok) report(context, 'Lifecycle download unavailable', requested.message);
    else context.controller.notifications.push('success', 'Lifecycle download requested', `${download.value.filename} · NOT LIVE`);
    context.invalidate();
    },!lifecycleState.valid,'primary'),
    text('lifecycle-status',`WARM DRAFT · R${lifecycleState.bundle.revision} · ${lifecycleState.valid?'VALID':`${lifecycleState.diagnostics.length} ERRORS`} · NOT LIVE`),
  ];
  context.controller.validation.setIssues([
    ...snapshot.validation.errors.map((issue, index) => ({ id: `items:error:${index}`, severity: 'error' as const, message: issue.message })),
    ...snapshot.validation.warnings.map((issue, index) => ({ id: `items:warning:${index}`, severity: 'warning' as const, message: issue.message })),
    ...lifecycleState.diagnostics.map((issue, index) => ({ id: `items:lifecycle-error:${index}`,
      severity: 'error' as const, message: issue.message })),
  ]);
  const inspector=studioSelectionEditor({id:id('tabs'),label:'Item editor',value:state.tab,onChange:tab=>{state.tab=tab;context.invalidate();},tabs:[
    {id:'fields',label:'Details',content:studioDefinitionFields(context,{id:id('field'),draft:state.definition,definitions:snapshot.definitions,readOnly:access==='read_only',apply:()=>{state.model.upsertDefinition(JSON.parse(state.definition.snapshot().value));state.model.persistDraft();}})},
    {id:'status',label:'Draft status',content:controls.children[6]!},
    {id:'editor',label:'JSON',content:kit.text('Edit the selected definition in the workspace.',{wrap:true})},

    {id:'lifecycle',label:'Lifecycle',content:kit.text('Edit and test callbacks in the workspace.',{wrap:true})},
  ]});
  const [kindPicker, queryInput, noteInput, rebase, clear, publish] = controls.children;
  const drawer = studioLibraryDrawer([kindPicker!, queryInput!, button('new-item','New item',()=>{createDefinition('item');context.invalidate();},access==='read_only'), button('new-recipe','New recipe',()=>{createDefinition('recipe');context.invalidate();},access==='read_only')], browser, [
    studioActionBar([studioIconAction(rebase!, {lucide:'cloudConnect'}), studioIconAction(clear!, {lucide:'trash'})]),
    noteInput!, publish!,
  ]);
  return {lifecycle:studioDefinitionPreviewLifecycle(context),kit:{controls:drawer,workspace:state.tab === 'editor' ? editor : state.tab === 'lifecycle' ? kit.scrollArea({width:'grow',height:'grow',gap:4,padding:8},lifecycleControls) : studioDefinitionPreview(context,selected),inspector}};
}
