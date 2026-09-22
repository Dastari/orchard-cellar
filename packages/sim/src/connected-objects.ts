import { fenceJoinMask } from './crafting.js';
import type { MapDocumentV3, MapObjectInstance } from './map-document-v3.js';
import type { MapPrefabDocumentV2 } from './map-prefab.js';

export type ConnectedObjectFamily = 'wood_fence' | 'white_fence' | 'hedge' | 'wood_small_fence' | 'stone_fence' | 'stone_large_fence';
export const MANUAL_OBJECT_CONNECTION_TAG = 'studio.connection.manual';

/** Deliberately explicit: unrelated fences and multi-cell prefabs must not join. */
export function connectedObjectFamily(assetName: string): ConnectedObjectFamily | null {
  if (/^prop_cf_(?:join_wood_small_fence|willow_boundary_wood_\d+)$/u.test(assetName)) return 'wood_small_fence';
  if (/^prop_cf_(?:join_stone_fence|willow_boundary_stone_\d+)$/u.test(assetName)) return 'stone_fence';
  if (/^prop_cf_(?:join_stone_large_fence|willow_boundary_stone_large_\d+)$/u.test(assetName)) return 'stone_large_fence';
  if (/^prop_cf_willow_(?:wood_large_connected|boundary_wood_large_(?:\d+|connected))$/u.test(assetName)) return 'wood_fence';
  if (/^prop_cf_willow_boundary_picket_\d+$/u.test(assetName)) return 'white_fence';
  if (/^prop_cf_willow_boundary_hedge_\d+$/u.test(assetName)) return 'hedge';
  if (assetName === 'prop_cf_join_hedge' || /^prop_cf_(?:hearth_hedge_(?:horizontal|vertical)|willow_hedge_.*)$/u.test(assetName)) return 'hedge';
  if (assetName === 'prop_cf_join_white_fence' || assetName === 'prop_cf_fence_white_horizontal' || /^prop_cf_willow_picket(?:_.*)?$/u.test(assetName)) return 'white_fence';
  if (assetName === 'prop_cf_join_wood_fence' || /^prop_cf_fence_(?:horizontal|vertical|corner|left_end|gate)$/u.test(assetName)) return 'wood_fence';
  return null;
}
export function connectedObjectAsset(family: ConnectedObjectFamily): string { return `prop_cf_join_${family}`; }

/** NESW frame layout is generated from reviewed native crops. Every mask has a
 * defined result, including isolated, ends, elbows, tees and four-way joins. */
export function connectedObjectFrame(family: ConnectedObjectFamily, mask: number): number {
  const bits = mask & 15;
  void family;
  return [12,8,1,13,0,4,5,9,3,15,2,14,7,11,6,10][bits]!;
}

export interface ConnectedObjectCell {
  readonly tileX: number; readonly tileY: number; readonly elevation: number;
  readonly family: ConnectedObjectFamily; readonly space: string | number;
}
export function connectedObjectIndex(cells: readonly ConnectedObjectCell[]): (cell: ConnectedObjectCell) => number {
  const key=(cell:ConnectedObjectCell,x=cell.tileX,y=cell.tileY)=>`${cell.space}:${cell.elevation}:${cell.family}:${x}:${y}`;
  const occupied=new Set(cells.map(cell=>key(cell)));
  return cell=>fenceJoinMask(cell.tileX,cell.tileY,(x,y)=>occupied.has(key(cell,x,y)));
}

export function mapObjectConnectionFamily(prefab: MapPrefabDocumentV2, object: MapObjectInstance): ConnectedObjectFamily | null {
  if (prefab.placements.length !== 1 || (object.scale ?? 1) !== 1) return null;
  return connectedObjectFamily(prefab.placements[0]!.assetName);
}
const mapConnections = new WeakMap<MapDocumentV3, ReadonlyMap<string,{family:ConnectedObjectFamily;mask:number}>>();
export function mapObjectConnectionMasks(document: MapDocumentV3): ReadonlyMap<string, {family:ConnectedObjectFamily;mask:number}> {
  const retained = mapConnections.get(document); if(retained)return retained;
  const prefabs=new Map(document.prefabs.map(prefab=>[prefab.id,prefab]));
  const cells=document.objects.flatMap(object=>{
    const prefab=prefabs.get(object.prefabId);
    const family=prefab ? mapObjectConnectionFamily(prefab,object):null;
    return object.enabled && family ? [{object,prefab:prefab!,tileX:object.tileX,tileY:object.tileY,elevation:object.elevation,family,space:`${document.id}:${object.layer}`}] : [];
  });
  const mask=connectedObjectIndex(cells);
  const result = new Map(cells.filter(cell=>!cell.prefab.tags.includes(MANUAL_OBJECT_CONNECTION_TAG) && !cell.prefab.placements[0]!.assetName.endsWith('_gate'))
    .map(cell=>[cell.object.id,{family:cell.family,mask:mask(cell)}]));
  mapConnections.set(document,result); return result;
}

export const CONNECTED_OBJECT_LABELS: Readonly<Record<ConnectedObjectFamily,string>> = {
 wood_fence:'Wooden fence',white_fence:'White picket fence',hedge:'Hedge',
 wood_small_fence:'Small wooden fence',stone_fence:'Stone fence',stone_large_fence:'Large stone fence',
};

/** Canonical palette entries have semantic one-cell geometry, independent of
 * how wide any source atlas crop happened to be. Gates remain separate objects. */
export function smartConnectedObjectPrefabs(prefabs: readonly MapPrefabDocumentV2[]): readonly MapPrefabDocumentV2[] {
 const groups=new Map<ConnectedObjectFamily,MapPrefabDocumentV2>();
 for(const prefab of prefabs) {
  const placement=prefab.placements.length===1?prefab.placements[0]:undefined;
  if(!placement||placement.assetName.endsWith('_gate'))continue;
  const family=connectedObjectFamily(placement.assetName);if(!family)continue;
  if(!groups.has(family)||placement.assetName===connectedObjectAsset(family))groups.set(family,prefab);
 }
 return [...groups].map(([family,source])=>({
  ...source,id:`smart-${family.replaceAll('_','-')}`,title:CONNECTED_OBJECT_LABELS[family],width:1,height:1,pivot:{tileX:0,tileY:0},
  tags:[...source.tags.filter(tag=>tag!==MANUAL_OBJECT_CONNECTION_TAG),'studio.smart-family'],
  placements:[{...source.placements[0]!,tileX:0,tileY:0,elevation:0,quarterTurns:0,flipX:false,
   ...(source.placements[0]!.assetName===connectedObjectAsset(family)?{visual:{kind:'variant' as const,name:'base',frameIndex:connectedObjectFrame(family,0)}}:{})}],
  cells:[{id:'cell-0',tileX:0,tileY:0,elevation:0,collisionMask:source.cells.some(cell=>cell.collisionMask!==0)?65535:0}],
 }));
}
