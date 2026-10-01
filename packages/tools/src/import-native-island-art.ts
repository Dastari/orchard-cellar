/** v1.0.0 — Exact native manual-placement banks and missing volcanic scenery. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './assets/png.js';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const directory = 'references/art/kenmi/cute-fantasy/volcano/';
const tokens = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const islandArtImports = [
  { name: 'tile_cf_volcano_design_sheet', sheet: 'Tiles/Volcano_Tiles.png', category: 'tiles', size: [16,16], bank: true },
  { name: 'tile_cf_volcano_design_bridge', sheet: 'Tiles/Volcano_Bridge.png', category: 'tiles', size: [16,16], bank: true },
  { name: 'tile_cf_volcano_design_bubbles', sheet: 'Tiles/Volcano_lava_buble.png', category: 'tiles', size: [16,16], bank: true },
  { name: 'tile_cf_volcano_design_plants', sheet: 'Volcano_Props/Volcano_Plants.png', category: 'tiles', size: [16,16], bank: true },
  { name: 'tile_cf_volcano_design_rocks', sheet: 'Volcano_Props/Volcano_Rocks.png', category: 'tiles', size: [16,16], bank: true },
  ...Array.from({length:5}, (_,i) => ({name:`prop_cf_cinder_detail_ember_${i+1}`,sheet:'Volcano_Props/Volcano_Plants.png',category:'props',size:[16,16],rect:[i*16,48,16,16]})),
  ...Array.from({length:3}, (_,i) => ({name:`prop_cf_cinder_detail_blue_crystal_${i+1}`,sheet:'Volcano_Props/Volcano_Plants.png',category:'props',size:[16,16],rect:[i*16,64,16,16]})),
  ...Array.from({length:2}, (_,i) => ({name:`prop_cf_cinder_detail_violet_crystal_${i+1}`,sheet:'Volcano_Props/Volcano_Plants.png',category:'props',size:[16,16],rect:[i*16,80,16,16]})),
  ...Array.from({length:4}, (_,i) => ({name:`prop_cf_cinder_detail_dead_shrub_${i+1}`,sheet:'Volcano_Props/Volcano_Rocks.png',category:'props',size:[16,32],rect:[i*32,32,16,32]})),
  ...Array.from({length:4}, (_,i) => ({name:`prop_cf_cinder_detail_hot_shrub_${i+1}`,sheet:'Volcano_Props/Volcano_Rocks.png',category:'props',size:[16,32],rect:[i*32+16,32,16,32]})),
  ...[0,32,96].map((x,i)=>({name:`prop_cf_cinder_detail_broad_pillar_${i+1}`,sheet:'Volcano_Props/Volcano_Rocks.png',category:'props',size:[32,32],rect:[x,112,32,32]})),
  {name:'prop_cf_cinder_detail_hot_columns',sheet:'Volcano_Props/Volcano_Rocks.png',category:'props',size:[32,32],rect:[80,80,32,32]},
] as const;

export function importNativeIslandArt(): void {
  for (const specification of islandArtImports) {
    const sourcePath = directory + specification.sheet;
    const png = decodePng(readFileSync(resolve(root, sourcePath)));
    const regions: number[][] = [];
    if ('bank' in specification) {
      if (png.width % 16 || png.height % 16) throw new Error(`Non-native bank: ${sourcePath}`);
      for (let y=0;y<png.height;y+=16) for(let x=0;x<png.width;x+=16) regions.push([x,y,16,16]);
    } else regions.push([...specification.rect]);
    const palette: Record<string,string> = {}, colors = new Map<string,string>();
    const frames = regions.map(([sx,sy,w,h]) => Array.from({length:h!},(_,y) => Array.from({length:w!},(_,x) => {
      const at=((sy!+y)*png.width+sx!+x)*4, rgba=[...png.rgba.slice(at,at+4)];
      if (rgba[3]===0) return '.';
      const color='#'+rgba.map(v=>v.toString(16).padStart(2,'0')).join('');
      let token=colors.get(color);
      if(token===undefined) {token=tokens[colors.size];if(!token)throw new Error('Palette token capacity exceeded');colors.set(color,token);palette[token]=color;}
      return token;
    }).join('')));
    const shadows=[...colors.keys()].filter(color=>!color.endsWith('ff'));
    // Full manual tile banks preserve all painted alpha. Dedicated scenery
    // crops retain the engine's single-color removable-shadow convention.
    if(shadows.length>1 && !('bank' in specification))throw new Error(`Multiple shadow colors require review: ${specification.name}`);
    const [width,height]=specification.size;
    const asset={name:specification.name,category:specification.category,size:[width,height],anchor:[Math.floor(width/2),height-1],
      frames:{base:frames},sourcePalette:palette,sourcePath,importedFrom:specification.sheet.split('/').at(-1),sourceRegions:{base:regions},
      frameKinds:{base:'variant'},sourcePaletteMode:'exact',
      ...('bank' in specification ? {emissiveColors:['#fb6b1d']} : {}),
      tags:['source.cute_fantasy','scenery.cinderwake','native.manual-placement'],
      ...(shadows.length===1?{bakedShadowColor:shadows[0]}:{}),
      placement:{layer:specification.category==='tiles'?'ground':'object',footprint:[1,1],blocksMovement:false,builderAvailable:false},approved:true};
    writeFileSync(resolve(root,`packages/assets/${specification.category}/${specification.name}.${specification.category==='tiles'?'tile':'sprite'}.json`),JSON.stringify(asset,null,2)+'\n');
    console.log(`${specification.name}: ${frames.length} exact native frames`);
  }
  const fall = resolve(root,'packages/assets/tiles/tile_cf_volcanic_lavafall.tile.json');
  const existing = JSON.parse(readFileSync(fall,'utf8')) as Record<string, unknown>;
  existing['emissiveColors']=['#fb6b1d'];
  writeFileSync(fall,JSON.stringify(existing,null,2)+'\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) importNativeIslandArt();
