import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const root=resolve(import.meta.dirname,'../../..');
const runtimeRoots=['packages/sim/src','packages/engine/src','packages/client/src','packages/world/src'];
const sources=runtimeRoots.flatMap(directory=>readdirSync(resolve(root,directory),{recursive:true})
  .filter(path=>typeof path==='string'&&path.endsWith('.ts'))
  .map(path=>`${directory}/${path}`));

describe('Hearth map authoring boundary',()=>{
  it('keeps Cinder scenery and whole-map composition out of recursive runtime source',()=>{
    expect(existsSync(resolve(root,'packages/sim/src/hearth-cinder-scenery.ts'))).toBe(false);
    expect(existsSync(resolve(root,'packages/sim/src/hearth-map-composition.ts'))).toBe(false);
    for(const path of sources){
      const source=readFileSync(resolve(root,path),'utf8');
      expect(source,`${path} imports the authoring-only Cinder catalog`).not.toMatch(/hearth-cinder-scenery|HEARTH_CINDER_/u);
      expect(source,`${path} imports the authoring-only map composer`).not.toMatch(/hearth-map-composition|composeHearthContentMap/u);
    }
  });
  it('keeps the village facade/scenery authoring catalog out of recursive runtime source',()=>{
    expect(existsSync(resolve(root,'packages/sim/src/hearth-village.ts'))).toBe(false);
    for(const path of sources){
      const source=readFileSync(resolve(root,path),'utf8');
      expect(source,`${path} imports the village authoring catalog`).not.toMatch(
        /hearth-village(?:\.js|\.ts)|buildHearthVillage(?:Facades|Scenery)|HEARTH_SCENERY_ASSETS/u,
      );
    }
  });
  it('keeps legacy landmark authoring bounds out of runtime and presentation names out of sim/client/world',()=>{
    expect(existsSync(resolve(root,'packages/sim/src/legacy-landmark-assets.ts'))).toBe(false);
    expect(existsSync(resolve(root,'packages/sim/src/legacy-landmark-bounds.ts'))).toBe(false);
    expect(existsSync(resolve(root,'packages/engine/src/legacy-landmark-assets.ts'))).toBe(true);
    expect(existsSync(resolve(root,'packages/tools/src/legacy-landmark-bounds.ts'))).toBe(true);
    for(const path of sources){
      const source=readFileSync(resolve(root,path),'utf8');
      expect(source,`${path} imports authoring-only legacy landmark bounds`).not.toMatch(
        /legacy-landmark-bounds|legacyLandmarkBounds/u,
      );
      if(!path.startsWith('packages/engine/src/')){
        expect(source,`${path} imports the engine landmark presentation catalog`).not.toMatch(
          /legacy-landmark-assets|LEGACY_LANDMARK_ASSET_NAMES/u,
        );
      }
    }
  });
  it('keeps Hearth terrain generation and pinned-map composition out of recursive runtime source',()=>{
    expect(existsSync(resolve(root,'packages/tools/src/hearth-archipelago-authoring.ts'))).toBe(true);
    const runtimePolicy=readFileSync(resolve(root,'packages/sim/src/hearth-archipelago.ts'),'utf8');
    expect(runtimePolicy).not.toMatch(/CINDER_TERRACES|insideCoast|MapDocumentV3CellOverride|hearth_requires_pinned_live_island|\bcoast:|WILLOWHARBOUR_PLOTS/u);
    for(const path of sources){
      const source=readFileSync(resolve(root,path),'utf8');
      expect(source,`${path} imports the authoring-only archipelago generator`).not.toMatch(
        /hearth-archipelago-authoring|buildHearthArchipelagoContribution|composeHearthArchipelago|WILLOWHARBOUR_PLOTS/u,
      );
    }
  });
  it('records the relocated compiler paths in export and rendering provenance',()=>{
    for(const path of ['packages/tools/src/export-hearth-map.ts','packages/tools/src/render-hearth-study.ts']){
      const source=readFileSync(resolve(root,path),'utf8');
      expect(source).toContain('packages/tools/src/hearth-cinder-scenery.ts');
      expect(source).toContain('packages/tools/src/hearth-map-composition.ts');
      expect(source).toContain('packages/tools/src/hearth-village.ts');
      expect(source).not.toContain('packages/sim/src/hearth-cinder-scenery.ts');
      expect(source).not.toContain('packages/sim/src/hearth-map-composition.ts');
      expect(source).not.toContain('packages/sim/src/hearth-village.ts');
    }
    const exportSource=readFileSync(resolve(root,'packages/tools/src/export-hearth-map.ts'),'utf8');
    expect(exportSource).toContain('packages/engine/src/legacy-landmark-assets.ts');
    expect(exportSource).toContain('packages/tools/src/legacy-landmark-bounds.ts');
    expect(exportSource).not.toContain('packages/sim/src/legacy-landmark-assets.ts');
    expect(exportSource).not.toContain('packages/sim/src/legacy-landmark-bounds.ts');
    expect(exportSource).toContain('packages/tools/src/hearth-archipelago-authoring.ts');
    for(const path of ['packages/tools/src/render-hearth-study.ts','packages/tools/src/render-hearth-gathering-study.ts']){
      expect(readFileSync(resolve(root,path),'utf8')).toContain('packages/tools/src/hearth-archipelago-authoring.ts');
    }
  });
});
