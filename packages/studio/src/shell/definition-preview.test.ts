import { expect, it, vi } from 'vitest';
import { bootstrapContentDefinitions } from '@orchard/sim';
import { StudioShellController } from './controller.js';
import { StudioAssetPreview } from './asset-preview.js';
import { studioDefinitionPreview, studioDefinitionPreviewLifecycle } from './definition-preview.js';

it('resolves runtime actor aliases to generated art and releases route-owned loads',()=>{
  const controller=new StudioShellController(async()=>{throw new Error('offline');});controller.navigate('/author/npcs');
  const bounds={x:0,y:0,width:800,height:600};
  const context={controller,route:controller.activeRoute(),bounds,controlsBounds:bounds,workspaceBounds:bounds,invalidate:vi.fn()};
  const requested=vi.spyOn(StudioAssetPreview.prototype,'asset').mockReturnValue(undefined);
  const disposed=vi.spyOn(StudioAssetPreview.prototype,'dispose');
  try {
    for(const [id,asset] of [['npc:boat','vehicle_cf_boat'],['npc:horse','horse_cf_bramble']] as const){
      const definition=bootstrapContentDefinitions().find(definition=>definition.id===id);expect(definition).toBeDefined();
      studioDefinitionPreview(context,definition);expect(requested).toHaveBeenCalledWith(asset);
    }
    studioDefinitionPreviewLifecycle(context).dispose();expect(disposed).toHaveBeenCalledOnce();
  }finally{requested.mockRestore();disposed.mockRestore();}
});
