import {LEGACY_LANDMARK_ASSET_NAMES} from '@orchard/engine/legacy-landmark-assets';
import {mapLandmarkCollisionObstacle,TILE_SIZE_FIXED,type HearthBuildingAsset,type MapLandmarkInstance} from '@orchard/sim';
export interface LegacyLandmarkBounds {readonly left:number;readonly top:number;readonly right:number;readonly bottom:number}
/** Conservative logical-tile envelope of a renderer-supported single sprite
 * and its physical collision. Native animations use the same authored frame size. */
export function legacyLandmarkBounds(row:MapLandmarkInstance,assetFor:(name:string)=>HearthBuildingAsset):LegacyLandmarkBounds|null {
  // Pond shimmer is a separate rendering branch, requiring its own envelope proof.
  if(row.kind==='camp_pond'||!Object.prototype.hasOwnProperty.call(LEGACY_LANDMARK_ASSET_NAMES,row.kind)) return null;
  const name=LEGACY_LANDMARK_ASSET_NAMES[row.kind as keyof typeof LEGACY_LANDMARK_ASSET_NAMES];
  const asset=assetFor(name),scale=row.scale??1;
  const transform=(x:number,y:number):readonly [number,number]=>{
    if(row.flipX) x=-x;
    const [dx,dy]=row.quarterTurns===0?[x,y]:row.quarterTurns===1?[-y,x]:row.quarterTurns===2?[-x,-y]:[y,-x];
    return [row.tileX+.5+dx!*scale/16,row.tileY+1+dy!*scale/16];
  };
  const left=-asset.anchor[0],right=asset.width-asset.anchor[0],top=-asset.anchor[1],bottom=asset.height-asset.anchor[1];
  const corners=[transform(left,top),transform(right,top),transform(left,bottom),transform(right,bottom)];
  const xs=corners.map(([x])=>x),ys=corners.map(([,y])=>y);
  const collision=mapLandmarkCollisionObstacle({...row,enabled:true},'ground');
  if(collision) {
    xs.push(collision.left/TILE_SIZE_FIXED,(collision.right+1)/TILE_SIZE_FIXED);
    ys.push(collision.top/TILE_SIZE_FIXED,(collision.bottom+1)/TILE_SIZE_FIXED);
  }
  return {left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};
}
