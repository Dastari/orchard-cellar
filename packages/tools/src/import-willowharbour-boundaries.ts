/** Reproducible complete native boundary families for authoring and Studio. */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {BOUNDARY_SHEETS,boundaryAsset,boundaryCrop,type BoundaryFamily} from '@orchard/sim';
for(const family of Object.keys(BOUNDARY_SHEETS) as BoundaryFamily[])for(let mask=0;mask<16;mask++){
 const crop=boundaryCrop(family,mask);if(!crop)continue;
 const name=boundaryAsset(family,mask),path=`packages/assets/props/${name}.sprite.json`;
 const previous=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
 execFileSync('node_modules/.bin/tsx',['packages/tools/src/import-image.ts',`references/art/kenmi/cute-fantasy/core/${BOUNDARY_SHEETS[family]}`,'--size','16x16','--source-size','16x16','--crop',crop.join(','),'--category','props','--name',name],{stdio:'pipe'});
 const next=JSON.parse(readFileSync(path,'utf8'));next.approved=previous?.approved===true&&JSON.stringify({...previous,approved:false})===JSON.stringify({...next,approved:false});writeFileSync(path,JSON.stringify(next,null,2)+'\n');
}
// The existing player fence renderer already requests frameIndex=neighbour mask.
// Supply that exact grammar as one sprite as well as the authoring tile family.
const connected='prop_cf_willow_boundary_wood_large_connected';
const order=Array.from({length:16},(_,mask)=>{const [x,y]=boundaryCrop('wood-large',mask)!;return y/16*4+x/16;});
const connectedPath=`packages/assets/props/${connected}.sprite.json`;
const previous=existsSync(connectedPath)?JSON.parse(readFileSync(connectedPath,'utf8')):null;
execFileSync('node_modules/.bin/tsx',['packages/tools/src/import-image.ts',`references/art/kenmi/cute-fantasy/core/${BOUNDARY_SHEETS['wood-large']}`,'--size','16x16','--source-size','16x16','--crop','0,0','--frame-grid','4x4','--animation-names','base','--frame-order',order.join(','),'--category','props','--name',connected],{stdio:'pipe'});
const next=JSON.parse(readFileSync(connectedPath,'utf8'));next.approved=previous?.approved===true&&JSON.stringify({...previous,approved:false})===JSON.stringify({...next,approved:false});writeFileSync(connectedPath,JSON.stringify(next,null,2)+'\n');
