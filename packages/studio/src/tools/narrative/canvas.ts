import { studioActionBar, studioIconAction, studioLibraryDrawer } from '../../shell/workspace-controls.js';
import { studioSelectionEditor } from '../../shell/selection-editor.js';
import { studioDefinitionPreview, studioDefinitionPreviewLifecycle } from '../../shell/definition-preview.js';
import { studioDefinitionFields } from '../../shell/definition-fields.js';
import type { SupportedContentDefinition } from '@orchard/sim';
import { ui as kit,uiFixed,CanvasTextEditor,type UiElement,type UiTone,type UiTableState } from '@orchard/ui/studio';
import type { StudioCanvasToolContext,StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { studioLiveContentSnapshot, studioLiveContentStatusSurface } from '../../shell/live-content-readiness.js';
import {
  itemsAccessForConnection,
  itemsHeadFromConnection,
  itemsHistoryFromConnection,
  itemsPublishAdapterFromConnection,
} from '../items/connection.js';
import {
  createNarrativeWorkspace,
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
  browserTable?:UiTableState;
  tab:string;
  play: DialoguePlayState | null;
  questFixture: QuestProgressFixture;
  includeRetired: boolean;
  mutationSequence: number;
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
    tab:'fields',
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
  const nextNpcRuntimeId = String(state.model.definitions('npc', '', true).reduce(
    (maximum, definition) => definition.kind === 'npc' && BigInt(definition.runtimeId) > maximum
      ? BigInt(definition.runtimeId) : maximum,
    0n,
  ) + 1n);
  const value = kind === 'npc' ? {
    id: `npc:${slug}`, kind: 'npc', schemaVersion: 1, runtimeId: nextNpcRuntimeId,
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
  state.browserTable = undefined;
}

export function buildNarrativeCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const live = context.controller.liveAdapter();
  const content = studioLiveContentSnapshot(live);
  if (content.mode === 'loading' || content.mode === 'unavailable') {
    return studioLiveContentStatusSurface(content);
  }
  const view = live?.view();
  const access = itemsAccessForConnection(context.route.access, live);
  const identity = view?.identity ?? 'anonymous';
  const state = context.controller.toolState(
    `narrative-canvas:${identity}:${access}:${content.contentKey}`,
    () => createState(context),
  );
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

  const snapshot = state.model.snapshot(), prefix=`${context.route.tool.id}-narrative:`;
  const id=(name:string)=>`${prefix}${name}`;
  const text=(name:string,value:string)=>kit.text(value,{id:id(name),wrap:true,layout:{width:'grow'}});
  const button=(name:string,label:string,onPress:()=>void,disabled=false,tone:UiTone='primary')=>kit.button({id:id(name),label,disabled,tone,layout:{width:'grow',shrink:0},onPress:()=>{
    try{onPress();}catch(error){report(context,`${label} failed`,error);}
  }});
  const fields=(name:string,lines:readonly string[])=>kit.flex({width:'grow',gap:4},lines.map((line,index)=>text(`${name}:${index}`,line)));
  const controls=kit.flex({width:'grow',gap:4},[
    kit.input({id:id('query'),label:'Search definitions',placeholder:'Search definitions',editor:state.query,onChange:()=>context.invalidate()}),
    kit.input({id:id('note'),label:'Publish note',placeholder:'Publish note',editor:state.note}),
    button('new',`New ${kind}`,()=>{createDefinition(state,kind);context.invalidate();},access==='read_only','success'),
    kit.checkbox({id:id('retired'),label:'Retired',value:state.includeRetired,onChange:value=>{state.includeRetired=value;state.browserTable=undefined;context.invalidate();}}),
    button('undo','Undo',()=>{state.model.undo();context.invalidate();},!snapshot.canUndo),
    button('redo','Redo',()=>{state.model.redo();context.invalidate();},!snapshot.canRedo),
    button('rebase','Rebase',()=>{state.model.rebase();context.invalidate();},!snapshot.conflict),
    button('publish','Publish',()=>{
      state.mutationSequence++;
      void state.model.publish(`narrative.canvas.${state.mutationSequence}`,state.note.snapshot().value)
        .then(()=>context.controller.notifications.push('success','Narrative published','Waiting for the verified live head.'))
        .catch((error:unknown)=>report(context,'Narrative publish failed',error)).finally(context.invalidate);
    },!snapshot.canPublish,'success'),
    text('status',`${kind.toUpperCase()} · ${access.toUpperCase()} · HEAD ${snapshot.headRevision} · ${snapshot.diffs.length} CHANGES · ${snapshot.validation.errors.length} ERRORS${snapshot.conflict?' · CONFLICT':''}`),
    kit.list({id:id('history'),label:'Revision history',items:state.model.history(),key:revision=>String(revision.revision),layout:{width:'grow',height:uiFixed(120),shrink:0},
      render:revision=>text(`history:${revision.revision}`,`R${revision.revision} ${revision.note||'UNTITLED'}`),
      onSelect:(_keys,revision)=>{
        try{const preview=state.model.previewRevision(revision.revision,'published_change');context.controller.notifications.push('info',`Revision ${revision.revision}`,`${preview.diffs.length} published changes.`);context.invalidate();}
        catch(error){report(context,'Narrative revision preview failed',error);}
      },
    }),
  ]);
  const selectDefinition=(definitionId:string)=>{
    const entry=entries.find(entry=>entry.id===definitionId);if(!entry)return;
    state.selectedId=entry.id;state.syncedId=null;
    context.controller.selection.select({kind:'definition',definitionKind:entry.kind,id:entry.id});context.invalidate();
  };
  const browser=kit.table({id:id('browser-table'),label:`${kind} definitions`,rows:entries,key:entry=>entry.id,
    columns:[{id:'name',label:'Name',value:entry=>entry.label}],
    selected:state.selectedId?[state.selectedId]:[],state:state.browserTable,onStateChange:next=>{state.browserTable=next;},onSelect:keys=>{if(keys[0])selectDefinition(keys[0]);},layout:{width:'grow',height:'grow'},
  });
  const editor=kit.scrollArea({width:'grow',height:'grow',gap:4},[
    text('editor-title',selected?definitionLabel(selected):'NO SELECTION'),
    ...(selected?[
      kit.textArea({id:id('definition-json'),label:'Definition JSON',editor:state.definition,readOnly:access==='read_only',rows:20,lineCount:true,resizable:true}),
      button('apply-json','Apply JSON',()=>{state.model.upsertDefinition(JSON.parse(state.definition.snapshot().value));context.invalidate();},access==='read_only','success'),
    ]:[]),
  ]);
  const preview:UiElement[]=[];
  const testing:UiElement[]=[];
  let dialoguePreview:UiElement|undefined;
  if(selected?.kind==='npc'){
    const npc=state.model.npcPreview(selected.id);
    preview.push(fields('npc-preview',[
      npc.definition.displayName,`PORTRAIT ${npc.portraitAsset}`,`HOME ${selected.home.spaceId}:${selected.home.tileX},${selected.home.tileY}`,
      `DIALOGUE ${npc.dialogue?.nodes.length??0} NODES`,`QUESTS ${npc.quests.length}`,`SHOP ${npc.shop?.offers.length??0} OFFERS`,...(selected.barks??[]).map(bark=>`BARK “${bark}”`),
    ]));
  }else if(selected?.kind==='dialogue'){
    const graph=state.model.dialoguePreview(selected.id);
    testing.push(kit.list({id:id('graph'),label:'Dialogue graph',items:[...graph.nodes.map(node=>({id:`node:${node.id}`,node,label:`${node.id} · ${node.speaker}: ${node.body}`})),
      ...graph.edges.map(edge=>({id:`edge:${edge.id}`,node:null,label:`EDGE ${edge.from} → ${edge.to} (${edge.choiceId})`}))],key:entry=>entry.id,layout:{width:'grow',height:uiFixed(160),shrink:0},
      render:entry=>entry.node?button(`graph-node:${entry.node.id}`,entry.node.id,()=>{state.play={...state.model.startDialogue(selected.id),currentNodeId:entry.node!.id};context.invalidate();}):
        text(`graph-edge:${entry.id.slice(5)}`,entry.label),
    }));
    const current=graph.nodes.find(node=>node.id===state.play?.currentNodeId);
    if(current && state.play){
      dialoguePreview=kit.dialogue({model:{id:current.id,speaker:current.speaker,body:current.body,choices:state.model.availableChoices(state.play).map(choice=>({id:choice.id,label:choice.label,tone:choice.tone==='accept'?'success':choice.tone==='decline'?'danger':'neutral'}))},
        choose:choiceId=>{state.play=state.model.chooseDialogue(state.play!,choiceId);context.invalidate();},
        onClose:()=>{state.play={...state.play!,currentNodeId:null};context.invalidate();}});
      preview.push(text('dialogue-current',current.speaker));
    }else preview.push(text('dialogue-end','Conversation finished'));
    testing.push(kit.textArea({id:id('fixture'),label:'Playback fixture JSON',editor:state.fixture,rows:5}),
      button('restart-dialogue','Restart preview',()=>{
        const fixture=JSON.parse(state.fixture.snapshot().value) as Readonly<Record<string,'available'|'active'|'complete'|'turned_in'>>;
        state.play=state.model.startDialogue(selected.id,fixture);context.invalidate();
      }));
  }else if(selected?.kind==='quest'){
    const quest=state.model.questPreview(selected.id,state.questFixture);
    preview.push(kit.frame({style:'parchment_plain',layout:{width:'grow',height:'fit',gap:8},children:[
      kit.text(selected.title,{role:'header',wrap:true}),
      text('quest-summary',selected.summary),
      ...quest.objectives.map((objective,index)=>kit.flex({width:'grow',gap:4},[
        text(`quest-objective:${index}`,`${objective.label} · ${objective.current}/${objective.required}`),
        kit.progressBar({label:objective.label,value:objective.required?objective.current/objective.required:0,tone:objective.complete?'success':'info'}),
      ])),
      text('quest-rewards',`${quest.rewards.bronze} bronze · ${quest.rewards.items.reduce((sum,reward)=>sum+reward.count,0)} items · ${quest.rewards.experience.reduce((sum,reward)=>sum+reward.amount,0)} XP`),
    ]}));
    testing.push(text('fixture-label','Preview progress'),
      kit.textArea({id:id('fixture'),label:'Completion fixture JSON',editor:state.fixture,rows:6}),
      button('apply-fixture','Apply completion',()=>{state.questFixture=JSON.parse(state.fixture.snapshot().value) as QuestProgressFixture;context.invalidate();},false,'success'));

  }
  context.controller.validation.setIssues([
    ...snapshot.validation.errors.map((issue,index)=>({id:`narrative:error:${index}`,severity:'error' as const,message:issue.message})),
    ...snapshot.validation.warnings.map((issue,index)=>({id:`narrative:warning:${index}`,severity:'warning' as const,message:issue.message})),
  ]);
  const inspector=studioSelectionEditor({id:id('tabs'),label:'Narrative editor',value:state.tab,onChange:tab=>{state.tab=tab;context.invalidate();},tabs:[
    {id:'fields',label:'Details',content:studioDefinitionFields(context,{id:id('field'),draft:state.definition,readOnly:access==='read_only',apply:()=>{state.model.upsertDefinition(JSON.parse(state.definition.snapshot().value));}})},
    {id:'editor',label:'JSON',content:editor},
    {id:'history',label:'History',content:kit.scrollArea({width:'grow',height:'grow',gap:8},[controls.children[8]!,controls.children[9]!])},
    ...(testing.length ? [{id:'testing',label:kind==='dialogue'?'Nodes & testing':'Testing',content:kit.scrollArea({width:'grow',height:'grow',gap:8},testing)}] : []),
    ...(selected?.kind === 'npc' ? [{id:'links',label:'Connections',content:kit.scrollArea({width:'grow',height:'grow',gap:8},preview)}] : []),

  ]});
  const [queryInput, noteInput, create, retired, undo, redo, rebase, publish] = controls.children;
  const drawer = studioLibraryDrawer([queryInput!, studioActionBar([
    studioIconAction(create!, {lucide:'copy'}), studioIconAction(undo!, {lucide:'undo'}),
    studioIconAction(redo!, {lucide:'redo'}), studioIconAction(rebase!, {lucide:'cloudConnect'}),
  ])], browser, [retired!, noteInput!, publish!]);
  return {lifecycle:studioDefinitionPreviewLifecycle(context),kit:{controls:drawer,workspace:selected?.kind === 'npc' ? studioDefinitionPreview(context,selected) : dialoguePreview ?? kit.scrollArea({width:'grow',height:'grow',gap:8,padding:8},preview),inspector}};
}
