import { StudioAssetPreview } from '../../shell/asset-preview.js';
import {
  bootstrapContentDefinitions,
  type SupportedContentDefinition,
  type TilesetContentDefinition,
} from '@orchard/sim';
import { CanvasTextEditor, ui, uiFixed, type UiTone } from '@orchard/ui';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { studioLiveContentSnapshot, studioLiveContentStatusSurface } from '../../shell/live-content-readiness.js';

import { createTileEditorModel, type TileEditorAccess, type TileEditorModel } from './model.js';

interface TilesCanvasState {
  model: TileEditorModel;
  readonly definitions: readonly SupportedContentDefinition[];
  readonly tilesets: readonly TilesetContentDefinition[];
  readonly json: CanvasTextEditor;
  selectedAudition: string | null;
  selectedFixture: string | null;
  mutationSequence: number;
  tab: string;
  readonly art: StudioAssetPreview;
}

function definitionsFrom(context: StudioCanvasToolContext): readonly SupportedContentDefinition[] {
  const snapshot = studioLiveContentSnapshot(context.controller.liveAdapter());
  return snapshot.mode === 'offline' ? bootstrapContentDefinitions() : snapshot.definitions ?? [];
}

function accessFrom(context: StudioCanvasToolContext): TileEditorAccess {
  const live = context.controller.liveAdapter();
  if (live === null || !live.view().connected) return 'anonymous';
  return context.route.access === 'write' ? 'write' : 'read_only';
}

function modelFor(
  context: StudioCanvasToolContext,
  definition: TilesetContentDefinition,
  definitions: readonly SupportedContentDefinition[],
): TileEditorModel {
  const live = context.controller.liveAdapter();
  const access = accessFrom(context);
  return createTileEditorModel({ definition, definitions, access,
    baseRevision: live?.view().contentHead?.revision ?? 0n,
    ...(access === 'write' && live?.publishContentChangeSet !== undefined ? {
      createPublishAdapter: () => ({ publishContentChangeSet: (request) => live.publishContentChangeSet!(request) }),
    } : {}),
  });
}

function createState(context: StudioCanvasToolContext): TilesCanvasState {
  const definitions = definitionsFrom(context);
  const tilesets = definitions.filter((entry): entry is TilesetContentDefinition => entry.kind === 'tileset');
  if (tilesets.length === 0) throw new Error('tile_editor_no_tilesets');
  const model = modelFor(context, tilesets[0]!, definitions);
  return { model, definitions, tilesets, json: new CanvasTextEditor({ maxLength: 32_000, multiline: true }),
    selectedAudition: null, selectedFixture: null, mutationSequence: 0, tab: 'fixtures', art:new StudioAssetPreview(context.invalidate) };
}

export function buildTilesCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const content = studioLiveContentSnapshot(context.controller.liveAdapter());
  if (content.mode === 'loading' || content.mode === 'unavailable') {
    return studioLiveContentStatusSurface(content);
  }
  const state = context.controller.toolState(`tiles-canvas:${content.contentKey}`, () => createState(context));
  const snapshot = state.model.snapshot();
  if (state.json.snapshot().value.length === 0) state.json.setValue(JSON.stringify(snapshot.definition, null, 2));
  const report=(title:string,error:unknown)=>{context.controller.notifications.push('error',title,error instanceof Error?error.message:String(error));context.invalidate();};
  const button=(id:string,label:string,onPress:()=>void,disabled=false,tone:UiTone='primary')=>ui.button({id:`tiles-${id}`,label,disabled,tone,layout:{width:'grow'},onPress:()=>{try{onPress();}catch(error){report(label,error);}}});
  const choose=(offset:number)=>{
    const index=state.tilesets.findIndex(({id})=>id===state.model.snapshot().definition.id),next=state.tilesets[(index+offset+state.tilesets.length)%state.tilesets.length]!;
    state.model=modelFor(context,next,state.definitions);state.json.setValue(JSON.stringify(next,null,2));state.selectedAudition=null;context.invalidate();
  };
  const readOnly=snapshot.access==='read_only';
  const controls=ui.flex({width:'grow',gap:8},[
    ui.text('Tile family'),
    ui.select({id:'tiles-family',label:'Tile family',value:snapshot.definition.id,
      options:state.tilesets.map(entry=>({value:entry.id,label:entry.familyId.replaceAll('_',' ').replace(/^./u,char=>char.toUpperCase())})),
      onChange:value=>choose(state.tilesets.findIndex(entry=>entry.id===value)-state.tilesets.findIndex(entry=>entry.id===snapshot.definition.id))}),
    button('publish','Publish',()=>{
      state.mutationSequence++;void state.model.publish(`tiles.canvas.${state.mutationSequence}`,'Tileset edit')
        .then(()=>context.controller.notifications.push('success','Tileset published',snapshot.definition.id))
        .catch((error:unknown)=>report('Tileset publish failed',error)).finally(context.invalidate);
    },!snapshot.canPublish,'success'),
    ui.tooltip(`${snapshot.validation.errors.length} errors · ${snapshot.validation.warnings.length} warnings`,
      ui.text(snapshot.validation.errors.length ? `${snapshot.validation.errors.length} errors` : snapshot.validation.warnings.length ? `${snapshot.validation.warnings.length} warnings` : 'Ready',{id:'tiles-validation'})),
  ]);
  const audition=ui.list({id:'tiles-auditions',label:'Frame auditions',items:snapshot.auditions,key:entry=>entry.key,rowHeight:uiFixed(48),layout:{width:'grow',height:'grow'},
    render:entry=>ui.flex({direction:'row',width:'grow',height:'grow',gap:8},[
      ui.flex({width:uiFixed(48),height:'grow',shrink:0},[state.art.image(entry.assetId,entry.frames[0]??0)]),
      button(`audition-${entry.key}`,entry.key.replaceAll('_',' '),()=>{state.selectedAudition=entry.key;context.invalidate();},false,state.selectedAudition===entry.key?'success':'primary'),
    ]),
  });
  const fixtureColumns=Math.max(1,Math.min(4,Math.floor((context.workspaceBounds?.width??context.bounds.width)/2/160)));
  const fixtures=ui.scrollArea({id:'tiles-fixtures',width:'grow',height:'grow',padding:8},[
    ui.grid({columns:fixtureColumns,gap:8,rowHeight:uiFixed(104),width:'grow'},snapshot.fixtures.map(fixture=>{
      const card=button(`fixture-${fixture.id}`,fixture.id.replaceAll('_',' '),()=>{state.selectedFixture=fixture.id;state.selectedAudition=null;context.invalidate();},false,state.selectedFixture===fixture.id?'success':'neutral');
      card.setStyle({width:'grow',height:'grow'});
      const label=card.label;card.setProps({label:''});card.label=label;
      card.replaceChildren([ui.flex({width:'grow',height:'grow',gap:4},[
        ui.stack({width:'grow',height:'grow'},fixture.layers.filter(layer=>layer.assetId).map(layer=>state.art.image(layer.assetId!,layer.frame??0,2))),
        ui.text(fixture.id.replaceAll('_',' '),{wrap:false,align:'center',layout:{width:'grow',shrink:0}}),
      ])]);
      return ui.tooltip(`${fixture.id.replaceAll('_',' ')} · ${fixture.layers.length} layers · ${fixture.tileX}, ${fixture.tileY}`,card,{width:'grow',height:'grow'});
    })),
  ]);
  const workspace=ui.tabs({id:'tiles-tabs',label:'Tileset editor',value:state.tab,onChange:tab=>{state.tab=tab;context.invalidate();},tabs:[
    {id:'fixtures',label:'Topology',content:fixtures},
    {id:'auditions',label:'Frames',content:audition},
    {id:'json',label:'JSON',content:ui.scrollArea({width:'grow',height:'grow',gap:4},[
      ui.textArea({id:'tiles-json',label:'Tileset JSON',editor:state.json,rows:24,lineCount:true,resizable:true,readOnly}),
      button('apply','Apply JSON',()=>{state.model.replaceDefinition(state.json.snapshot().value);context.invalidate();},readOnly,'success'),
    ])},
  ]});
  context.controller.validation.setIssues([
    ...snapshot.validation.errors.map((issue,index)=>({id:`tiles:error:${index}`,severity:'error' as const,message:issue.message})),
    ...snapshot.validation.warnings.map((issue,index)=>({id:`tiles:warning:${index}`,severity:'warning' as const,message:issue.message})),
  ]);
  const selected=snapshot.auditions.find(entry=>entry.key===state.selectedAudition);
  const fixture=snapshot.fixtures.find(entry=>entry.id===state.selectedFixture);
  const inspector=ui.flex({width:'grow',gap:8},[
    ui.text('Projection'),
    ui.select({id:'tiles-projection',label:'Projection',value:snapshot.definition.projectionStyle,options:['raised','interior'].map(value=>({value,label:value.replace(/^./u,char=>char.toUpperCase())})),onChange:value=>{if(!readOnly){state.model.setProjection(value as 'raised'|'interior',snapshot.definition.baseDatum,snapshot.definition.faceClearanceRows);context.invalidate();}}}),
    ui.text(`Datum ${snapshot.definition.baseDatum}`),
    ui.flex({direction:'row',width:'grow',gap:4},[
      button('datum-down','-',()=>{state.model.setProjection(snapshot.definition.projectionStyle,snapshot.definition.baseDatum-1,snapshot.definition.faceClearanceRows);context.invalidate();},readOnly),
      button('datum-up','+',()=>{state.model.setProjection(snapshot.definition.projectionStyle,snapshot.definition.baseDatum+1,snapshot.definition.faceClearanceRows);context.invalidate();},readOnly),
    ]),
    ...(selected?[ui.text(selected.key.replaceAll('_',' ')),ui.flex({width:'grow',height:uiFixed(96)},[state.art.image(selected.assetId,selected.frames[0]??0,4)]),ui.tooltip(selected.assetId,ui.text(`${selected.frames.length} frames`))]:[]),
    ...(fixture?[ui.separator(),ui.text(fixture.id.replaceAll('_',' ')),...fixture.layers.filter(layer=>layer.assetId).map(layer=>ui.tooltip(layer.assetId!,ui.flex({width:'grow',gap:4},[
      ui.text(layer.semanticRole,{wrap:true}),ui.flex({width:'grow',height:uiFixed(48)},[state.art.image(layer.assetId!,layer.frame??0,2)]),
    ])))]:[]),
  ]);

  return {kit:{controls,workspace,inspector},lifecycle:{key:'tiles-canvas',dispose:()=>{state.art.dispose();context.controller.releaseToolState('tiles-canvas',state);}}};
}
