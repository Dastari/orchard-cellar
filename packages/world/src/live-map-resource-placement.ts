import type {MapDocumentV3,MapResourcePlacement} from '@orchard/sim';

export interface ResourcePlacementRow {
  readonly id: bigint;
  readonly tileX: number;
  readonly tileY: number;
  readonly spaceId: number;
}
export interface ResourcePlacementMove {readonly id:bigint;readonly tileX:number;readonly tileY:number}

/** Validate every changed resource before the transaction writes any position.
 * Origins are authority-checked once and immutable across subsequent edits. */
export function planLiveMapResourceMoves(
  previous:MapDocumentV3|null,next:MapDocumentV3,
  find:(id:bigint)=>ResourcePlacementRow|null,
  movable:(row:ResourcePlacementRow)=>boolean,
):readonly ResourcePlacementMove[] {
  const before=new Map((previous?.resourcePlacements??[]).map(value=>[value.id,value]));
  const after=new Map((next.resourcePlacements??[]).map(value=>[value.id,value]));
  const moves:ResourcePlacementMove[]=[];
  for(const id of new Set([...before.keys(),...after.keys()])) {
    const prior=before.get(id),placement=after.get(id);
    if(JSON.stringify(prior)===JSON.stringify(placement))continue;
    const row=find(BigInt(id));
    if(!row||row.spaceId!==0||!movable(row))throw new Error('map_resource_not_movable');
    if(placement) {
      const origin:Pick<MapResourcePlacement,'originTileX'|'originTileY'>=prior??{originTileX:row.tileX,originTileY:row.tileY};
      if(placement.originTileX!==origin.originTileX||placement.originTileY!==origin.originTileY)throw new Error('map_resource_origin_conflict');
    }
    if(prior&&(row.tileX!==prior.tileX||row.tileY!==prior.tileY))throw new Error('map_resource_position_conflict');
    moves.push({id:row.id,tileX:placement?.tileX??prior!.originTileX,tileY:placement?.tileY??prior!.originTileY});
  }
  if(moves.length&&next.id!=='live-island')throw new Error('map_resource_wrong_space');
  return moves;
}
