import { expect, it, vi } from 'vitest';
import { UiRoot } from '@orchard/ui/studio';
import { StudioShellController } from './controller.js';
import { studioInventoryPreview } from './inventory-preview.js';
import { kitElements, pressKit } from '../tools/kit-test-driver.js';

it('keeps inventory slots compact in both axes and selects the actual custody index',()=>{
  const controller=new StudioShellController(async()=>{throw new Error('offline');});controller.navigate('/operate/players');
  const bounds={x:0,y:0,width:800,height:600};const selected=vi.fn();
  const surface=studioInventoryPreview({controller,route:controller.activeRoute(),bounds,controlsBounds:bounds,workspaceBounds:bounds,invalidate:vi.fn()},[
    {name:'backpack',slots:Array.from({length:8},(_,index)=>({index:index+10,stack:{itemKind:'apple',quantity:2}}))},
  ],selected);
  const root=new UiRoot({scale:1});root.resize(800,600);root.mount(surface.kit!.workspace!);root.arrange();
  const slots=kitElements(surface).filter(node=>node.kind==='slot');expect(slots).toHaveLength(8);
  expect(slots[1]!.rect.x-slots[0]!.rect.x-slots[0]!.rect.width).toBe(2);
  expect(slots[6]!.rect.y-slots[0]!.rect.y-slots[0]!.rect.height).toBe(2);
  expect(slots[0]!.rect.width).toBe(28);expect(slots[0]!.rect.height).toBe(31);
  root.unmount(surface.kit!.workspace!);root.dispose();
  pressKit(surface,'inventory-preview:backpack.slot.10');expect(selected).toHaveBeenCalledWith('backpack',10);
  surface.lifecycle?.dispose();
});
