import { ui, uiFixed, type UiElement } from '@orchard/ui';
import type { SupportedContentDefinition } from '@orchard/sim';
import type { StudioCanvasToolContext, StudioCanvasToolLifecycle } from './canvas-tool.js';
import { StudioAssetPreview } from './asset-preview.js';

/** Game art on the canvas; authored properties belong in the selection drawer. */
export function studioDefinitionPreview(context: StudioCanvasToolContext, definition: SupportedContentDefinition | null | undefined): UiElement {
  const art = previewArt(context);
  const requestedAsset = definition && ('icon' in definition && typeof definition.icon === 'object' && definition.icon !== null && 'asset' in definition.icon
    ? String(definition.icon.asset) : 'actorAsset' in definition ? String(definition.actorAsset)
      : 'asset' in definition ? String(definition.asset) : null);
  const assetName = requestedAsset === 'boat' ? 'vehicle_cf_boat' : requestedAsset === 'horse' ? 'horse_cf_bramble' : requestedAsset;
  const name = definition && ('displayName' in definition ? String(definition.displayName) : 'title' in definition ? String(definition.title) : definition.id);
  const loaded = assetName ? art.asset(assetName) : undefined;
  const frames = loaded && definition?.kind === 'crop'
    ? Object.values(loaded.metadata.variants ?? loaded.metadata.animations).flatMap(animation => animation) : [];
  return ui.stack({width:'grow',height:'grow'},[
    ui.viewport({label:'Game preview canvas',background:'checkerboard',render:()=>{}}),
    ui.flex({width:'grow',height:'grow',align:'center',justify:'center',gap:8,padding:8},[
      ...(assetName ? [frames.length > 1
        ? ui.flex({direction:'row',wrap:true,align:'center',justify:'center',width:'grow',gap:4},frames.map((frame,index)=>ui.flex({width:uiFixed(48),height:uiFixed(72),gap:4,shrink:0},[art.image(assetName,frame,2),ui.text(String(index+1),{align:'center',layout:{width:'grow'}})])))
        : ui.flex({width:uiFixed(96),height:uiFixed(96),shrink:0},[art.image(assetName,0,3)])] : []),
      ui.text(name ?? 'Select a definition',{wrap:true,layout:{maxWidth:uiFixed(220)}}),
    ]),
  ]);
}

function previewArt(context: StudioCanvasToolContext): StudioAssetPreview {
  return context.controller.toolState(`definition-preview-art:${context.route.path}`, () => new StudioAssetPreview(context.invalidate));
}

export function studioDefinitionPreviewLifecycle(context: StudioCanvasToolContext): StudioCanvasToolLifecycle {
  const key = `definition-preview-art:${context.route.path}`;
  const art = previewArt(context);
  return { key, dispose: () => { art.dispose(); context.controller.releaseToolState(key, art); } };
}
