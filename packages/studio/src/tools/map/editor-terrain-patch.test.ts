import {describe,it,expect} from 'vitest';
import {createEmptyMapDocument,migrateMapDocumentV2,type MapCellOverride,type MapDocumentV3} from '@orchard/sim';
import {buildMapEditorTerrain} from './editor-terrain-build.js';
import {createStudioLiveIslandBootstrapDocument} from './editor-live-island-bootstrap.js';
import {patchMapEditorTerrain} from './editor-terrain-patch.js';

describe('incremental visual terrain',()=>{
  const before=migrateMapDocumentV2(createEmptyMapDocument({id:'patch',title:'Patch',width:12,height:12}));
  it.each([
    {elevation:2,surface:'grass',surfaceFamily:'grass_2'},
    {elevation:-1,surface:'water',collision:'inherit'},
    {surface:'cave_floor',elevation:1,cliffFamily:'stone_2'},
    {surface:'dirt',feature:'farmland',ledge:true},
  ] as MapCellOverride[])('matches full compilation and restores inherited cells: %j',cell=>{
    const source=buildMapEditorTerrain(before),after={...before,revision:1,cells:{'4,5':cell}} as MapDocumentV3;
    const patch=patchMapEditorTerrain(source,before,after)!;const full=buildMapEditorTerrain(after);
    expect(patch.changed).toEqual([{tileX:4,tileY:5}]);
    for(const channel of ['elevations','biomes','blocked','horseJumpableTerrain','authoredSurfaces','dirtTerraces','dirtCliffRoles','surfaceFamilies','terrainOverrides','ledges'] as const)
      expect(patch.terrain[channel],channel).toEqual(full[channel]);
    expect(source.elevations[64]).toBe(0);
    const undo=patchMapEditorTerrain(patch.terrain,after,before)!;
    expect(undo.terrain.elevations).toEqual(source.elevations);expect(undo.terrain.authoredSurfaces).toEqual(source.authoredSurfaces);
    expect(patch.terrain.cliffFamilyIds![patch.terrain.cliffFamilies![64]!-1]).toBe(full.cliffFamilyIds![full.cliffFamilies![64]!-1]);
  });
  it('initializes interior surfaces and matches full terrain when editing the generated island',()=>{
    const before=createStudioLiveIslandBootstrapDocument(),source=buildMapEditorTerrain(before);
    const after={...before,revision:before.revision+1,cells:{'410,410':{surface:'cave_floor' as const,elevation:2}}};
    const patch=patchMapEditorTerrain(source,before,after)!;const full=buildMapEditorTerrain(after);
    expect(source.authoredSurfaces).toBeUndefined();expect(patch.terrain.authoredSurfaces).toEqual(full.authoredSurfaces);
    expect(patch.terrain.biomes).toEqual(full.biomes);expect(patch.terrain.elevations).toEqual(full.elevations);
    const undo=patchMapEditorTerrain(patch.terrain,after,before)!;
    expect(undo.terrain.biomes).toEqual(source.biomes);expect(undo.terrain.elevations).toEqual(source.elevations);
  });

  it('falls back for resize and global defaults',()=>{
    const terrain=buildMapEditorTerrain(before);
    expect(patchMapEditorTerrain(terrain,before,{...before,width:20})).toBeNull();
    expect(patchMapEditorTerrain(terrain,before,{...before,baseElevation:2})).toBeNull();
  });
});


it('patches a four-cell island height stamp without rebuilding island-wide cliff channels',()=>{
 const before=createStudioLiveIslandBootstrapDocument(),source=buildMapEditorTerrain(before);
 const after={...before,revision:before.revision+1,cells:{...before.cells,
  '410,410':{elevation:1},'411,410':{elevation:1},'410,411':{elevation:1},'411,411':{elevation:1}}};
 const start=performance.now(),patch=patchMapEditorTerrain(source,before,after)!;
 const elapsed=performance.now()-start;
 console.info(`Four-cell 832x832 terrain patch: ${elapsed.toFixed(1)}ms`);
 expect(elapsed).toBeLessThan(1000);
 expect(patch.changed).toHaveLength(4);
 const full=buildMapEditorTerrain(after);
 expect(patch.terrain.elevations).toEqual(full.elevations);
 expect(patch.terrain.dirtCliffRoles).toEqual(full.dirtCliffRoles);
});

it('continues the straight river bank in the painted grass cell and patches the same frames as full compilation',async()=>{
 const {applyMapDocumentV3Edit}=await import('@orchard/sim');
 const {freshwaterFrameIndexAt,freshwaterInsetFrameIndicesAt}=await import('@orchard/engine/terrain');
 const base=migrateMapDocumentV2(createEmptyMapDocument({id:'shore-patch',title:'Shore',width:10,height:10}));
 const cells:MapDocumentV3['cells']={};
 const writable=cells as Record<string,{surface:'water';biome:'water'|'freshwater'}>;
 for(let y=0;y<10;y++)for(let x=4;x<10;x++)writable[`${x},${y}`]={surface:'water',biome:y<4?'freshwater':'water'};
 const before={...base,cells};
 const after=applyMapDocumentV3Edit(before,{kind:'terrain',command:{kind:'paint',points:[{tileX:4,tileY:4}],patch:{surface:'grass'}},biome:'plains',automaticSurround:true}).document;
 const source=buildMapEditorTerrain(before),full=buildMapEditorTerrain(after);
 const patch=patchMapEditorTerrain(source,before,after)!;
 expect(freshwaterFrameIndexAt(full,4,4)).toBe(3);
 expect(freshwaterFrameIndexAt(full,4,4)).toBe(freshwaterFrameIndexAt(full,4,3));
 expect(freshwaterInsetFrameIndicesAt(full,4,4)).toEqual([]);
 expect(patch.terrain.biomes).toEqual(full.biomes);
 expect(patch.terrain.elevations).toEqual(source.elevations);
});
