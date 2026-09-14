import { itemDefinition, type ItemStack } from '@orchard/sim';
import { ui, type LoadedAsset } from '@orchard/ui';
import type { StudioCanvasToolContext, StudioCanvasToolSurface } from './canvas-tool.js';
import { StudioAssetPreview } from './asset-preview.js';

export interface StudioInventoryPreviewGroup {
  readonly name: string;
  readonly slots: readonly { readonly index: number; readonly stack: ItemStack | null }[];
}

/** Inspection uses the game's compact slots; mutations still use the audited form. */
export function studioInventoryPreview(context: StudioCanvasToolContext, groups: readonly StudioInventoryPreviewGroup[],
  onSelect?: (group: string, index: number) => void): StudioCanvasToolSurface {
  const key = `inventory-preview:${context.route.path}`;
  const art = context.controller.toolState(key, () => new StudioAssetPreview(context.invalidate));
  const artwork: Record<string, LoadedAsset> = {};
  for (const group of groups) for (const {stack} of group.slots) {
    const definition = stack && itemDefinition(stack.itemKind);
    if (stack && definition) { const asset = art.asset(definition.iconKey); if (asset) artwork[stack.itemKind] = asset; }
  }
  return {kit:{workspace:ui.flex({width:'grow',gap:8,shrink:0},groups.map(group=>ui.flex({width:'grow',gap:4,shrink:0},[
    ui.text(group.name),
    ui.inventoryGrid({id:`inventory-preview:${group.name}`,container:group.name,columns:group.name==='hotbar'?9:6,gap:2,slotSize:'sm',
      cells:group.slots.map(slot=>({id:String(slot.index+1),index:slot.index})),artwork,
      stack:index=>group.slots.find(slot=>slot.index===index)?.stack??null,
      onActivate:index=>onSelect?.(group.name,index),layout:{width:'grow',shrink:0}}),
  ])))},lifecycle:{key,dispose:()=>{art.dispose();context.controller.releaseToolState(key,art);}}};
}
