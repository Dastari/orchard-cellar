import {describe,it,expect} from 'vitest';
import {hearthConstructionToolEdits,type HearthArchitectureState} from '@orchard/sim';
import {hearthDoorwayFeatures} from './hearth-doorway.js';
const state:HearthArchitectureState={recipeVersion:1,revision:0n,cells:[]};
describe('native doorway cutaway geometry',()=>{
  it.each(['doorway_ns','doorway_ew'] as const)('keeps every %s low post on solid supports, with no crop on open floor',tool=>{
    const intent=hearthConstructionToolEdits(state,tool,6,8);
    expect(intent.failure).toBeNull();if(intent.failure!==null)return;
    const cells=intent.edits.flatMap(edit=>edit.replacement?[edit.replacement]:[]);
    const features=hearthDoorwayFeatures(cells);
    expect(features.jambs).toHaveLength(2);
    expect(features.frames).toEqual(tool==='doorway_ns'?[{x:104,y:143}]:[]);
    for(const jamb of features.jambs){
      expect(cells.find(cell=>cell.tileX===jamb.tileX&&cell.tileY===jamb.tileY)?.partition).toBe('wall');
      expect(jamb.x).toBeGreaterThanOrEqual(jamb.tileX*16);
      expect(jamb.y).toBeGreaterThanOrEqual(jamb.tileY*16);
      expect(jamb.x+5).toBeLessThanOrEqual((jamb.tileX+1)*16);
      expect(jamb.y+8).toBeLessThanOrEqual((jamb.tileY+1)*16);
    }
  });
  it('renders wider front-facing openings with low jambs instead of overlapping native arches',()=>{
    const features=hearthDoorwayFeatures([{tileX:5,tileY:8,partition:'wall'},
      {tileX:6,tileY:8,partition:'doorway'},{tileX:7,tileY:8,partition:'doorway'},{tileX:8,tileY:8,partition:'wall'}]);
    expect(features.jambs).toHaveLength(2);expect(features.frames).toEqual([]);
    expect(features.jambs.map(jamb=>jamb.tileX)).toEqual([5,8]);
  });
  it('does not fabricate an arch or a jamb for unsupported doorway data',()=>{
    expect(hearthDoorwayFeatures([{tileX:6,tileY:8,partition:'doorway'}])).toEqual({frames:[],jambs:[]});
  });
});
