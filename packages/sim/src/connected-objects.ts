import tilesetsJson from '../../assets/content/tilesets.json' with { type: 'json' };
import { parseRuleCatalogue, resolveRuleFrame, type RuleCatalogue, type AvailableRuleFamily } from './rule-catalogue.js';
import type { ObjectContentDefinition } from './content/object-definition.js';
import type { TilesetContentDefinition } from './content/definitions.js';
import { fenceJoinMask } from './crafting.js';
import type { MapDocumentV3, MapObjectInstance } from './map-document-v3.js';
import type { MapPrefabDocumentV2 } from './map-prefab.js';

export type ConnectedObjectFamily = string;
export const MANUAL_OBJECT_CONNECTION_TAG = 'studio.connection.manual';
const bootstrapCatalogue = parseRuleCatalogue({schemaVersion:1,families:tilesetsJson.flatMap(t => t.ruleCatalogue?.families ?? [])});
const catalogueCache = new WeakMap<ReadonlyMap<string, TilesetContentDefinition>, RuleCatalogue>();
/** Legacy content without an envelope uses the committed compatibility catalogue.
 * An explicit empty catalogue is authoritative and disables joins. */
export function connectedObjectCatalogue(tilesets?: ReadonlyMap<string, TilesetContentDefinition>): RuleCatalogue {
  if (!tilesets) return bootstrapCatalogue;
  const cached = catalogueCache.get(tilesets); if (cached) return cached;
  const catalogues = [...tilesets.values()].flatMap(t => t.ruleCatalogue ? [t.ruleCatalogue] : []);
  const catalogue = catalogues.length ? parseRuleCatalogue({schemaVersion:1,families:catalogues.flatMap(c => c.families)}) : bootstrapCatalogue;
  catalogueCache.set(tilesets,catalogue); return catalogue;
}
function availableFamilies(catalogue: RuleCatalogue): readonly AvailableRuleFamily[] {
  return catalogue.families.filter((f): f is AvailableRuleFamily => f.kind === 'connect4' && !('unavailable' in f));
}
export function connectedObjectFamily(assetName: string, catalogue = bootstrapCatalogue): ConnectedObjectFamily | null {
  return availableFamilies(catalogue).find(f => f.members.assetIds.includes(assetName))?.id ?? null;
}
/** Live identities never infer membership from their artwork. */
export function connectedObjectDefinitionFamily(definition: ObjectContentDefinition | null | undefined, catalogue = bootstrapCatalogue): ConnectedObjectFamily | null {
  if (!definition) return null;
  const families = availableFamilies(catalogue);
  return (families.find(f => f.members.definitionIds.includes(definition.id))
    ?? families.find(f => f.members.tags.some(tag => definition.components.identity?.tags.includes(tag))))?.id ?? null;
}
export function connectedObjectIsExact(assetName: string, catalogue = bootstrapCatalogue): boolean {
  return availableFamilies(catalogue).some(f => f.members.exactAssetIds.includes(assetName));
}
export function connectedObjectResolvedFrame(family: ConnectedObjectFamily, mask: number, catalogue = bootstrapCatalogue, entropy = 0, season?: string) {
  const rule = catalogue.families.find(f => f.id === family && f.kind === 'connect4');
  return rule ? resolveRuleFrame(rule,mask,entropy,season) : null;
}
export function connectedObjectAsset(family: ConnectedObjectFamily, catalogue = bootstrapCatalogue): string {
  return connectedObjectResolvedFrame(family,0,catalogue)?.assetId ?? '';
}
export function connectedObjectFrame(family: ConnectedObjectFamily, mask: number, catalogue = bootstrapCatalogue): number {
  return connectedObjectResolvedFrame(family,mask,catalogue)?.frame ?? 0;
}

export interface ConnectedObjectCell {
  readonly tileX: number; readonly tileY: number; readonly elevation: number;
  readonly family: ConnectedObjectFamily; readonly space: string | number;
  readonly definition?: ObjectContentDefinition;
}
export function connectedObjectIndex(cells: readonly ConnectedObjectCell[], catalogue = bootstrapCatalogue): (cell: ConnectedObjectCell) => number {
  const key = (cell: ConnectedObjectCell, x = cell.tileX, y = cell.tileY) => `${cell.space}:${cell.elevation}:${x}:${y}`;
  const occupied = new Map<string, ConnectedObjectCell[]>();
  for (const cell of cells) { const k=key(cell); const at=occupied.get(k) ?? []; at.push(cell); occupied.set(k,at); }
  const families = new Map(availableFamilies(catalogue).map(f => [f.id,f]));
  return cell => fenceJoinMask(cell.tileX,cell.tileY,(x,y) => (occupied.get(key(cell,x,y)) ?? []).some(neighbor => {
    const family = families.get(cell.family); if (!family) return false;
    if (cell.family !== neighbor.family && !family.compatibleFamilies.includes(neighbor.family)) return false;
    if (family.neighbourPredicate === 'same-family') return cell.family === neighbor.family;
    if (family.neighbourPredicate === 'matching-tags') return family.members.tags.some(tag => neighbor.definition?.components.identity?.tags.includes(tag));
    const connectsTo = cell.definition?.components.placement?.connectsTo;
    if (connectsTo === undefined) return true; // legacy map prefab / exact gate
    return connectsTo.some(id => id === neighbor.definition?.id || neighbor.definition?.components.identity?.tags.includes(id));
  }));
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
  const result = new Map(cells.filter(cell=>!cell.prefab.tags.includes(MANUAL_OBJECT_CONNECTION_TAG) && !connectedObjectIsExact(cell.prefab.placements[0]!.assetName))
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
  if(!placement||connectedObjectIsExact(placement.assetName))continue;
  const family=connectedObjectFamily(placement.assetName);if(!family)continue;
  if(!groups.has(family)||placement.assetName===connectedObjectAsset(family))groups.set(family,prefab);
 }
 return [...groups].map(([family,source])=>({
  ...source,id:`smart-${family.replaceAll('_','-')}`,title:CONNECTED_OBJECT_LABELS[family] ?? family,width:1,height:1,pivot:{tileX:0,tileY:0},
  tags:[...source.tags.filter(tag=>tag!==MANUAL_OBJECT_CONNECTION_TAG),'studio.smart-family'],
  placements:[{...source.placements[0]!,tileX:0,tileY:0,elevation:0,quarterTurns:0,flipX:false,
   ...(source.placements[0]!.assetName===connectedObjectAsset(family)?{visual:{kind:'variant' as const,name:'base',frameIndex:connectedObjectFrame(family,0)}}:{})}],
  cells:[{id:'cell-0',tileX:0,tileY:0,elevation:0,collisionMask:source.cells.some(cell=>cell.collisionMask!==0)?65535:0}],
 }));
}
