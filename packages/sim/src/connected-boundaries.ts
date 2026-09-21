/** Native perspective boundaries use cardinal topology, never sprite rotation. */
export const BOUNDARY_SHEETS = {
  wood: 'Outdoor decoration/Fences.png',
  'wood-large': 'Outdoor decoration/Fence_Big.png',
  picket: 'Outdoor decoration/White_Fence.png',
  stone: 'Outdoor decoration/Stone_Fence_Small.png',
  'stone-large': 'Outdoor decoration/Stone_Fence_Big.png',
  hedge: 'Tiles/Hedge_Tiles.png',
} as const;
export type BoundaryFamily = keyof typeof BOUNDARY_SHEETS;
export interface BoundaryCell { readonly tileX:number; readonly tileY:number; readonly family:BoundaryFamily }
// Bits north/east/south/west. Each entry is an explicitly authored native tile.
const CROPS = [[0,48],[0,32],[16,0],[16,48],[0,0],[0,16],[16,16],[16,32],
  [48,0],[48,48],[32,0],[32,48],[48,16],[48,32],[32,16],[32,32]] as const;
const HEDGE_MASKS = new Set([1,2,3,4,5,6,8,9,10,12]);
export function boundaryCrop(family:BoundaryFamily, mask:number):readonly[number,number]|null {
  if(!Number.isInteger(mask)||mask<0||mask>15||(family==='hedge'&&!HEDGE_MASKS.has(mask)))return null;
  return CROPS[mask]!;
}
export function boundaryAsset(family:BoundaryFamily,mask:number):string {
  return `prop_cf_willow_boundary_${family.replaceAll('-','_')}_${mask}`;
}
export function resolveBoundaryCells(cells:readonly BoundaryCell[]) {
  const lookup=new Map<string,BoundaryCell>();
  for(const cell of cells){
    if(!Number.isInteger(cell.tileX)||!Number.isInteger(cell.tileY))throw new Error('Boundary requires integer cells');
    const key=`${cell.tileX},${cell.tileY}`;
    if(lookup.has(key))throw new Error(`Duplicate boundary cell ${key}`);
    lookup.set(key,cell);
  }
  return [...lookup.values()].sort((a,b)=>a.tileY-b.tileY||a.tileX-b.tileX).map(cell=>{
    let mask=0;
    for(const [dx,dy,bit] of [[0,-1,1],[1,0,2],[0,1,4],[-1,0,8]])
      if(lookup.get(`${cell.tileX+dx!},${cell.tileY+dy!}`)?.family===cell.family)mask|=bit!;
    const crop=boundaryCrop(cell.family,mask);
    if(!crop)throw new Error(`Unsupported ${cell.family} boundary at ${cell.tileX},${cell.tileY}: mask ${mask}`);
    return {...cell,mask,crop,assetName:boundaryAsset(cell.family,mask)};
  });
}
