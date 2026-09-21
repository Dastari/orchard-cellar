import { idleAvatarAnimationForDirection, type Direction, type PlayerAppearanceSelection } from '@orchard/sim';
import type { LoadedAsset } from '../../assets.js';
import type { UiRect } from '../../geometry.js';
import { selectAtlasFrame } from '../../sprite.js';
import { PLAYER_RIG_CORE_ASSETS, PLAYER_RIG_HAIR_ASSETS, PLAYER_RIG_PANTS_ASSETS, PLAYER_RIG_SHIRT_ASSETS, PLAYER_RIG_SHOE_ASSETS, playerRigAssetEntry } from '../../player-rig-assets.js';
export const UI_CHARACTER_PORTRAIT_ASSETS = [PLAYER_RIG_CORE_ASSETS.base[0],PLAYER_RIG_CORE_ASSETS.hands[0],...[...PLAYER_RIG_HAIR_ASSETS,...PLAYER_RIG_PANTS_ASSETS,...PLAYER_RIG_SHIRT_ASSETS,...PLAYER_RIG_SHOE_ASSETS].map(entry=>entry[1])] as const;
export function uiCharacterPortraitAssets(appearance: PlayerAppearanceSelection): readonly string[] {
  return [PLAYER_RIG_CORE_ASSETS.base[0],playerRigAssetEntry(PLAYER_RIG_PANTS_ASSETS,appearance.pantsKind)[1],playerRigAssetEntry(PLAYER_RIG_SHIRT_ASSETS,appearance.shirtKind)[1],playerRigAssetEntry(PLAYER_RIG_SHOE_ASSETS,appearance.shoesKind)[1],PLAYER_RIG_CORE_ASSETS.hands[0],playerRigAssetEntry(PLAYER_RIG_HAIR_ASSETS,appearance.hairKind)[1]];
}
/** Actor pixels only. The parent kit viewport owns clipping and all controls. */
export function paintUiCharacterPortrait(context:CanvasRenderingContext2D,appearance:PlayerAppearanceSelection,facing:Direction,bounds:UiRect,asset:(name:string)=>LoadedAsset|undefined):void {
 const layers=uiCharacterPortraitAssets(appearance).map(asset),animation=idleAvatarAnimationForDirection(facing),base=layers[0];
 if(!base)return;const reference=selectAtlasFrame(base.metadata,animation,0);if(!reference)return;
 const scale=Math.max(1,Math.floor(Math.min(bounds.width/reference.width,bounds.height/reference.height))),width=reference.width*scale,height=reference.height*scale;
 const x=Math.round(bounds.x+(bounds.width-width)/2),y=Math.round(bounds.y+bounds.height-height),flip=facing==='left';
 context.save();context.imageSmoothingEnabled=false;if(flip){context.translate(x+width,0);context.scale(-1,1);}
 for(const layer of layers){if(!layer)continue;const source=selectAtlasFrame(layer.metadata,animation,0);if(source)context.drawImage(layer.image,source.x,source.y,source.width,source.height,flip?0:x,y,width,height);}
 context.restore();
}
