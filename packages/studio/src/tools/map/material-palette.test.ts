import {readFileSync,existsSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {mapMaterialChoices,mapPaletteColumns} from './material-palette.js';
import {OFFLINE_TERRAIN_AUTHORING_PALETTE} from './terrain-authoring-palette.js';
import {MAP_BIOME_IDS} from '@orchard/sim';

describe('semantic material palette',()=>{
 it('covers every biome with reproducible previews and safe collision defaults',()=>{
  const choices=mapMaterialChoices(OFFLINE_TERRAIN_AUTHORING_PALETTE);
  for(const biome of MAP_BIOME_IDS)expect(choices.some(c=>c.id===`biome-${biome}`)).toBe(true);
  for(const choice of choices){
   const path=new URL(`../../../../assets/tiles/${choice.preview.assetId}.tile.json`,import.meta.url);
   expect(existsSync(path),choice.id).toBe(true);
   const asset=JSON.parse(readFileSync(path,'utf8'));expect(asset.frames.base[choice.preview.frameIndex]).toBeDefined();
   expect(choice.patch.collision).toBe(choice.id==='biome-lava'?'force_block':'inherit');
  }
  expect(choices.find(c=>c.id==='biome-paving')?.patch.surface).toBe('stone');
 });
 it('keeps medium icons fixed while growing column count',()=>{
  expect(mapPaletteColumns(95)).toBe(3);expect(mapPaletteColumns(180)).toBe(3);expect(mapPaletteColumns(290)).toBe(6);
 });
});
