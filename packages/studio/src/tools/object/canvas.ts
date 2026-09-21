import { studioActionBar, studioIconAction, studioLibraryDrawer } from '../../shell/workspace-controls.js';
import { StudioAssetPreview } from '../../shell/asset-preview.js';
import { buildAssetPalette, filterAssetPalette, type AssetPaletteItem } from './asset-palette.js';
import {
  CURRENT_BEHAVIOUR_ENGINE_VERSION,
  type ObjectContentDefinition,
} from '@orchard/sim';
import { CanvasTextEditor, ui, uiFixed, loadGeneratedAssetCatalog, selectAtlasFrame, type UiTone, type UiElement } from '@orchard/ui/studio';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';

import {
  objectBehaviourAccessForConnection,
  objectBehaviourPublishAdapterFromConnection,
  objectDefinitionsFromConnection,
  registryDefinitionsFromConnection,
} from './behaviour/connection.js';
import { createObjectBehaviourModel, type ObjectBehaviourModel } from './behaviour/model.js';
import { OBJECT_STUDIO_LAYERS, ObjectStudioModel } from './model.js';

const untitledObject = (): ObjectContentDefinition => ({
  id: 'object:untitled', kind: 'object', schemaVersion: 1, displayName: 'Untitled Object',
  components: {
    identity: { tags: [] }, states: { active: { type: 'bool', default: false } }, interactions: [],
  },
});

interface ObjectCanvasState {
  readonly prefab: ObjectStudioModel;
  readonly behaviour: ObjectBehaviourModel;
  readonly json: CanvasTextEditor;
  mode: 'prefab' | 'behaviour';
  graphNodeId: string | null;
  nextPlacement: number;
  mutationSequence: number;
  readonly art: StudioAssetPreview;
  readonly query: CanvasTextEditor;
  palette: readonly AssetPaletteItem[];
  catalogStarted: boolean;
  selectedAsset: string | null;
  prefabTab: string;
  behaviourTab: string;
}

function createState(context: StudioCanvasToolContext): ObjectCanvasState {
  const live = context.controller.liveAdapter();
  const view = live?.view();
  const definitions = view === undefined ? [] : objectDefinitionsFromConnection(view);
  const definition = definitions[0] ?? untitledObject();
  const access = objectBehaviourAccessForConnection(context.route.access, live);
  const behaviour = createObjectBehaviourModel({
    definition, access,
    baseRevision: view?.contentHead?.revision ?? 0n,
    headEngineVersion: view?.contentHead?.engineVersion ?? CURRENT_BEHAVIOUR_ENGINE_VERSION,
    ...(view === undefined ? {} : { registryDefinitions: registryDefinitionsFromConnection(view) }),
    ...(access === 'write' && live !== null ? { createPublishAdapter: () => {
      const adapter = objectBehaviourPublishAdapterFromConnection(live);
      if (adapter === null) throw new Error('object_behaviour_publish_unavailable');
      return adapter;
    } } : {}),
  });
  return {
    prefab: new ObjectStudioModel('untitled-layout', {
      selection: context.controller.selection,
      inspector: context.controller.inspector,
      validation: context.controller.validation,
    }, null),
    behaviour,
    json: new CanvasTextEditor({ maxLength: 32_000, multiline: true }),
    art:new StudioAssetPreview(context.invalidate),query:new CanvasTextEditor({maxLength:120}),palette:[],catalogStarted:false,selectedAsset:null,
    mode: 'prefab', graphNodeId: null, nextPlacement: 1, mutationSequence: 0, prefabTab:'spatial', behaviourTab:'graph',
  };
}

export function buildObjectCanvasTool(context:StudioCanvasToolContext):StudioCanvasToolSurface {
  const state=context.controller.toolState('object-canvas',()=>createState(context));
  if(!state.catalogStarted&&typeof window!=='undefined'){
    state.catalogStarted=true;
    void loadGeneratedAssetCatalog().then(catalog=>{
      if(state.art.disposed)return;
      state.palette=buildAssetPalette(catalog);state.selectedAsset=state.palette[0]?.key??null;context.invalidate();
    }).catch((error:unknown)=>{if(!state.art.disposed){context.controller.notifications.push('error','Asset library unavailable',String(error));context.invalidate();}});
  }
  state.prefab.refreshKernels();context.controller.setWorldDraft('object:untitled-layout',state.prefab.worldOutliner());
  const report=(title:string,error:unknown)=>{context.controller.notifications.push('error',title,error instanceof Error?error.message:String(error));context.invalidate();};
  const button=(id:string,label:string,onPress:()=>void,disabled=false,tone:UiTone='primary')=>ui.button({id:`object-${id}`,label,disabled,tone,layout:{width:'grow',shrink:0},onPress:()=>{try{onPress();}catch(error){report(label,error);}}});
  const controls:UiElement[]=[ui.select({id:'object-mode',label:'Workspace',value:state.mode,options:[{value:'prefab',label:'Prefab'},{value:'behaviour',label:'Behaviour'}],onChange:mode=>{state.mode=mode as ObjectCanvasState['mode'];context.invalidate();}})];
  let workspace:UiElement,inspector:UiElement|undefined;
  if(state.mode==='prefab'){
    const model=state.prefab,prefab=model.workspace(),selected=model.selectedIds()[0];
    const asset=state.palette.find(entry=>entry.key===state.selectedAsset);
    controls.push(
      ui.input({id:'object-asset-query',label:'Find an asset',placeholder:'Find an asset',editor:state.query,onChange:context.invalidate}),
      ui.list({id:'object-assets',label:'Asset library',items:filterAssetPalette(state.palette,{search:state.query.snapshot().value}),key:entry=>entry.key,
        rowHeight:uiFixed(48),layout:{width:'grow',height:uiFixed(144),shrink:0},selected:asset?[asset.key]:[],
        onSelect:(_keys,entry)=>{state.selectedAsset=entry.key;context.invalidate();},
        render:entry=>ui.flex({direction:'row',width:'grow',height:'grow',gap:4},[
          ui.flex({width:uiFixed(32),height:'grow',shrink:0},[state.art.image(entry.assetName,entry.frame,1)]),
          ui.text(entry.assetName.replace(/^(?:building|item|prop|tile)_cf_/u,'').replaceAll('_',' '),{layout:{width:'grow'}}),
        ]),
      }),
      button('prefab-stamp','Place asset',()=>{if(!asset)return;const ordinal=state.nextPlacement++;model.stamp({id:`piece-${ordinal}`,assetId:asset.assetId,assetName:asset.assetName,visual:asset.visual,tileX:3+ordinal,tileY:4,elevation:0,layer:model.activeLayer(),quarterTurns:0,flipX:false});model.select(`piece-${ordinal}`);context.invalidate();},!asset,'success'),
      ui.select({id:'object-prefab-layer',label:'Target layer',value:model.activeLayer(),options:OBJECT_STUDIO_LAYERS.map(layer=>({value:layer,label:layer.replace(/^./u,char=>char.toUpperCase())})),onChange:layer=>{model.selectLayer(layer as typeof OBJECT_STUDIO_LAYERS[number]);context.invalidate();}}),
      ...OBJECT_STUDIO_LAYERS.map(layer=>ui.checkbox({id:`object-prefab-visible-${layer}`,label:layer,value:model.layerVisible(layer),onChange:()=>{model.toggleLayer(layer);context.invalidate();}})),
      ui.text(`${prefab.width}×${prefab.height} · REV ${prefab.revision}`),
    );
    if (selected !== undefined) inspector=ui.flex({width:'grow',gap:4},[
      ui.text('Transform selection'),
      button('prefab-group','Group selection',()=>{model.group(`group_${model.workspace().revision+1}`,'Canvas Group');context.invalidate();}),
      button('prefab-left','Move left',()=>{model.move(selected,-1,0);context.invalidate();}),
      button('prefab-right','Move right',()=>{model.move(selected,1,0);context.invalidate();}),
      button('prefab-up','Move up',()=>{model.move(selected,0,-1);context.invalidate();}),
      button('prefab-down','Move down',()=>{model.move(selected,0,1);context.invalidate();}),
      button('prefab-rotate','Rotate clockwise',()=>{model.transform(selected,'rotate_clockwise');context.invalidate();}),
    ]);
    if(inspector){
      const [heading,group,left,right,up,down,rotate]=inspector.children;
      const direction=(control:UiElement,arrow:string)=>{const label=control.label;control.setProps({label:arrow});control.label=label;control.replaceChildren([]);return ui.tooltip(control.label??'Move',control,{width:'grow',height:uiFixed(24)});};
      inspector.replaceChildren([heading!,ui.grid({columns:2,gap:2,rowHeight:uiFixed(24)},[
        direction(left!,'<'),direction(right!,'>'),direction(up!,'^'),direction(down!,'v'),
      ]),studioActionBar([studioIconAction(rotate!,{lucide:'rotate'}),studioIconAction(group!,{lucide:'layers'})])]);
    }
    const pieces=prefab.placements.filter(piece=>model.layerVisible(piece.layer));
    const scene=ui.stack({width:uiFixed(prefab.width*16),height:uiFixed(prefab.height*16),shrink:0},[
      ui.viewport({id:'object-prefab-grid',label:'Prefab spatial grid',background:context.controller.gridVisible()?'checkerboard':'none',render:()=>{}}),
      ...pieces.map(piece=>{
        const loaded=state.art.asset(piece.assetName),source=loaded?selectAtlasFrame(loaded.metadata,piece.visual.name,piece.visual.frameIndex):null;
        const swapped=piece.quarterTurns%2===1;
        const width=source?(swapped?source.height:source.width):16,height=source?(swapped?source.width:source.height):16;
        const image=loaded&&source?ui.image(loaded.image,source,{label:piece.assetName,integerScale:1,quarterTurns:piece.quarterTurns,flipX:piece.flipX,layout:{width:'grow',height:'grow'}}):ui.text('...');
        const pick=ui.button({id:`object-prefab-piece-${piece.id}`,label:'',tone:model.selectedIds().includes(piece.id)?'success':'primary',layout:{width:'grow',height:'grow',padding:0},onPress:()=>{model.select(piece.id);context.invalidate();}});
        pick.replaceChildren([image]);
        return ui.tooltip(`${piece.assetName} · ${piece.tileX},${piece.tileY}`,pick,
          {position:'absolute',inset:{left:uiFixed(piece.tileX*16),top:uiFixed(piece.tileY*16)},width:uiFixed(width),height:uiFixed(height)});
      }),
    ]);
    workspace=ui.tabs({id:'object-prefab-tabs',label:'Prefab editor',value:state.prefabTab,onChange:tab=>{state.prefabTab=tab;context.invalidate();},tabs:[
      {id:'spatial',label:'Layout',content:ui.scrollArea({width:'grow',height:'grow',overflow:'scroll'},[scene])},
      {id:'pieces',label:`Pieces (${prefab.placements.length})`,content:ui.list({id:'object-prefab-pieces',label:'Prefab pieces',items:prefab.placements,key:piece=>piece.id,rowHeight:uiFixed(32),layout:{width:'grow',height:'grow'},render:piece=>button(`prefab-select-${piece.id}`,`${piece.id} · ${piece.layer} · ${piece.tileX},${piece.tileY}`,()=>{model.select(piece.id);context.invalidate();},false,model.selectedIds().includes(piece.id)?'success':'primary')})},
    ]});
  }else{
    const snapshot=state.behaviour.snapshot();if(state.json.snapshot().value.length===0)state.json.setValue(JSON.stringify(snapshot.definition,null,2));
    controls.push(ui.text(`${snapshot.definition.displayName} · ${snapshot.nodes.length} NODES · ${snapshot.engineGate}`),
      button('behaviour-add','Add interaction',()=>{const ordinal=(state.behaviour.snapshot().definition.components.interactions?.length??0)+1;state.behaviour.addInteraction({id:`interaction_${ordinal}`,verb:'use',prompt:'USE',conditions:[{reach:'object'}],effects:[{toggleState:'active'}]});state.json.setValue(JSON.stringify(state.behaviour.snapshot().definition,null,2));context.invalidate();},snapshot.access==='read_only','success'),
      button('behaviour-publish','Publish behaviour',()=>{state.mutationSequence++;void state.behaviour.publish(`object.canvas.${state.mutationSequence}`,'Canvas object behaviour')
        .then(()=>context.controller.notifications.push('success','Behaviour published',snapshot.definition.id)).catch((error:unknown)=>report('Behaviour publish failed',error)).finally(context.invalidate);},!snapshot.canPublish,'success'));
    const selected=snapshot.nodes.find(node=>node.id===state.graphNodeId);
    inspector=ui.flex({width:'grow',gap:4},[
      ui.text(selected?`${selected.kind.toUpperCase()}\n${selected.label}\nORDER ${selected.order}`:'SELECT A GRAPH NODE',{id:'object-behaviour-details'}),
      button('behaviour-remove','Remove node',()=>{if(!selected||selected.kind==='trigger')return;state.behaviour.removeNode(selected.id);state.graphNodeId=null;context.invalidate();},!selected||selected.kind==='trigger'||snapshot.access==='read_only','danger'),
    ]);
    workspace=ui.tabs({id:'object-behaviour-tabs',label:'Behaviour editor',value:state.behaviourTab,onChange:tab=>{state.behaviourTab=tab;context.invalidate();},tabs:[
      {id:'graph',label:'Graph',content:ui.list({id:'object-behaviour-graph',label:'Trigger, conditions and effects',items:snapshot.nodes,key:node=>node.id,rowHeight:uiFixed(40),layout:{width:'grow',height:'grow'},render:node=>button(`behaviour-node-${node.id}`,`${node.kind.toUpperCase()} · ${node.label}`,()=>{state.graphNodeId=node.id;context.invalidate();},false,node.kind==='trigger'?'primary':node.kind==='condition'?'info':'success')})},
      {id:'json',label:'JSON',content:ui.scrollArea({width:'grow',height:'grow',gap:4},[
        ui.textArea({id:'object-behaviour-json',label:'Object JSON',editor:state.json,rows:24,lineCount:true,resizable:true,readOnly:snapshot.access==='read_only'}),
        button('behaviour-apply','Apply JSON',()=>{state.behaviour.replaceDefinition(state.json.snapshot().value);context.invalidate();},snapshot.access==='read_only','success'),
      ])},
    ]});
    context.controller.validation.setIssues([
      ...snapshot.validation.errors.map((issue,index)=>({id:`object:error:${index}`,severity:'error' as const,message:issue.message})),
      ...snapshot.validation.warnings.map((issue,index)=>({id:`object:warning:${index}`,severity:'warning' as const,message:issue.message})),
    ]);
  }
  return {kit:{controls:state.mode==='prefab'?studioLibraryDrawer(controls.slice(0,2),controls[2]!,[controls[4]!,ui.flex({direction:'row',width:'grow',gap:4},OBJECT_STUDIO_LAYERS.map(layer=>ui.tooltip(`Toggle ${layer} layer`,ui.iconButton({lucide:'layers'},{label:layer,tone:state.prefab.layerVisible(layer)?'success':'neutral',onPress:()=>{state.prefab.toggleLayer(layer);context.invalidate();}}),{width:uiFixed(24),height:uiFixed(24)}))),controls[3]!]):ui.flex({width:'grow',gap:4},controls),workspace,inspector},lifecycle:{key:'object-canvas',dispose:()=>{state.art.dispose();context.controller.releaseToolState('object-canvas',state);}}};
}
