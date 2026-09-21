/** Native bridge understructure and complete animated waterfall, without scaling. */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const previous=new Map<string,string>();
function save(name:string,asset:Record<string,unknown>){
 const before=previous.get(name);
 if(before&&JSON.stringify({...JSON.parse(before),approved:false})===JSON.stringify({...asset,approved:false}))asset.approved=JSON.parse(before).approved===true;
 writeFileSync(`packages/assets/props/${name}.sprite.json`,JSON.stringify(asset,null,2)+'\n');
}
function imported(name:string,source:string,width:number,height:number,x:number,y:number,extra:string[]=[]){
 const path=`packages/assets/props/${name}.sprite.json`;if(existsSync(path))previous.set(name,readFileSync(path,'utf8'));
 execFileSync('node_modules/.bin/tsx',['packages/tools/src/import-image.ts',`references/art/kenmi/cute-fantasy/core/${source}`,'--size',`${width}x${height}`,'--source-size',`${width}x${height}`,'--crop',`${x},${y}`,'--category','props','--name',name,...extra],{stdio:'pipe'});
 return JSON.parse(readFileSync(`packages/assets/props/${name}.sprite.json`,'utf8'));
}
for(let column=0;column<4;column++){
 const name=`prop_cf_hearth_bridge_arch_${column}`,asset=imported(name,'Tiles/Bridge/Bridge_Stone_Horizontal.png',16,20,32+column*16,60);
 // The source's flat blue backdrop is not structural art: expose animated river water.
 const water=new Set(Object.entries(asset.sourcePalette).filter(([,color])=>color==='#0095e9').map(([symbol])=>symbol));
 asset.frames.base=asset.frames.base.map((frame:string[])=>frame.map(row=>[...row].map(c=>water.has(c)?'.':c).join('')));
 for(const symbol of water)delete asset.sourcePalette[symbol];
 asset.anchor=[8,19];asset.sourceRegions={base:[[32+column*16,60,16,20]]};
 save(name,asset);
}
const name='prop_cf_willow_waterfall';
const waterfall=imported(name,'Tiles/Waterfall/Waterfall_1.png',48,80,0,0,['--frame-grid','6x1','--animation-names','flow','--fps','8']);
// Anchor on the upper plane; the splash projects below its foot across the cliff.
waterfall.anchor=[24,47];save(name,waterfall);
