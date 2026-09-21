/** Native, reproducible crops for the second Willowharbour composition pass. */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../../../',import.meta.url).pathname;
const crops:[string,string,number,number,number,number][]=[
 ['hedge_nw','Tiles/Hedge_Tiles.png',16,16,16,16],['hedge_ne','Tiles/Hedge_Tiles.png',48,16,16,16],
 ['hedge_sw','Tiles/Hedge_Tiles.png',16,48,16,16],['hedge_se','Tiles/Hedge_Tiles.png',48,48,16,16],
 ['hedge_end_left','Tiles/Hedge_Tiles.png',16,0,16,16],['hedge_end_right','Tiles/Hedge_Tiles.png',48,0,16,16],
 ['hedge_end_top','Tiles/Hedge_Tiles.png',0,0,16,16],['hedge_end_bottom','Tiles/Hedge_Tiles.png',0,32,16,16],
 ['picket','Outdoor decoration/White_Fence.png',32,0,16,16],
 ['picket_left','Outdoor decoration/White_Fence.png',16,0,16,16],
 ['picket_right','Outdoor decoration/White_Fence.png',48,0,16,16],
 ['picket_vertical','Outdoor decoration/White_Fence.png',0,16,16,16],
 ['cobble','Tiles/Cobble_Road/Cobble_Road_1.png',16,16,16,16],
];
for(const [i,[x,y]] of [[48,0],[64,0],[80,0],[48,16],[80,16],[48,32],[64,32],[80,32]].entries())
 crops.push([`bank_${i}`,'Tiles/Grass/Grass_Tiles_1.png',x!,y!,16,16]);
for(const [suffix,sheet,x,y,w,h] of crops){
 const name=`prop_cf_willow_${suffix}`,output=`${root}packages/assets/props/${name}.sprite.json`;
 const previous=existsSync(output)?JSON.parse(readFileSync(output,'utf8')):null;
 execFileSync(`${root}node_modules/.bin/tsx`,['packages/tools/src/import-image.ts',`references/art/kenmi/cute-fantasy/core/${sheet}`,'--size',`${w}x${h}`,'--source-size',`${w}x${h}`,'--crop',`${x},${y}`,'--category','props','--name',name],{cwd:root,stdio:'inherit'});
 const data=JSON.parse(readFileSync(output,'utf8'));data.approved=previous?.approved===true&&JSON.stringify({...previous,approved:false})===JSON.stringify({...data,approved:false});
 writeFileSync(output,JSON.stringify(data,null,2)+'\n');
}
