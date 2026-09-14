import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as sim from '@orchard/sim';
const source = ts.createSourceFile('main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'furniturePreviewAt');
if (!fn) throw new Error('Missing actual furniture preview adapter');
function fixture() {
  const inventorySlots = [{ slot: 0, itemKind: 'furniture_rustic_chair', quantity: 1 }];
  const players = [{ spaceId: 30000, x: 100, y: 120 }];
  const placeables: { id: bigint; kind: string; spaceId: number; stateJson: string }[] = [];
  const predicted = { position: { x: 100, y: 120 } }, network = { resourceRevision: 1 };
  const calculate = vi.fn((): {candidate:sim.HearthFurniturePlacement|null;failure:string|null} => ({ candidate: null, failure: null }));
  const dependencies = { ...sim, predicted, network, furnishingPreview: calculate,
    latestSnapshot: { content: { registry: sim.bootstrapContentRegistry() }, inventorySlots, players, placeables },
    activeSpaceDefinition: { spaceId: 30000 } as {spaceId:number;residenceExpansionRank?:number;residenceArchitectureJson?:string}, currentFurniture: () => [], canUseHomesteadBuildMode: () => true,
    objectPresentations: { resolve: () => ({ stateJsonValid: false }) },
  };
  const api = new Function(...Object.keys(dependencies), ts.transpileModule(
    `let furniturePreviewCache=null;let furnitureCollision={};${fn!.getText(source)};return {preview:furniturePreviewAt,newCollision:()=>{furnitureCollision={};},setCollision:value=>{furnitureCollision=value;}};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText)(...Object.values(dependencies));
  return { api, calculate, inventorySlots, players, predicted, network, placeables,activeSpaceDefinition:dependencies.activeSpaceDefinition };
}
describe('actual furnishing preview cache', () => {
  it('does not repeat escape validation for a stationary unchanged hover and invalidates every relevant input', () => {
    const f = fixture(), tile = { tileX: 5, tileY: 6 }, item = 'furniture_rustic_chair';
    for (let frame = 0; frame < 120; frame++) f.api.preview(tile, item);
    expect(f.calculate).toHaveBeenCalledTimes(1);
    const changes = [() => f.inventorySlots[0]!.quantity++, () => f.players[0]!.x++, () => f.predicted.position.y++,
      () => f.network.resourceRevision++, () => f.api.newCollision(), () => tile.tileX++];
    for (const [index, change] of changes.entries()) {
      change(); f.api.preview(tile, item); f.api.preview(tile, item);
      expect(f.calculate).toHaveBeenCalledTimes(index + 2);
    }
  });
  it('reports doorway hardware conflicts in the actual client preview after ordinary furniture validation succeeds',()=>{
    const f=fixture();
    const cells:sim.HearthArchitectureCell[]=[{tileX:6,tileY:7,partition:'wall'},
      {tileX:6,tileY:8,partition:'wall'},{tileX:7,tileY:8,partition:'doorway'},{tileX:8,tileY:8,partition:'wall'}];
    f.activeSpaceDefinition.residenceExpansionRank=0;
    f.activeSpaceDefinition.residenceArchitectureJson=sim.serializeHearthArchitectureState({recipeVersion:1,revision:1n,cells});
    const baseline={width:16,height:16,blocked:Array.from({length:256},(_,i)=>!sim.residencePlayableTile(i%16,Math.floor(i/16),0))};
    f.api.setCollision(sim.persistedHearthArchitectureCollision(0,baseline,f.activeSpaceDefinition.residenceArchitectureJson));
    f.calculate.mockReturnValue({candidate:{id:'preview',shape:sim.HEARTH_FURNITURE_SHAPES.furniture_townhouse_wall_mirror!,tileX:6,tileY:8},failure:null});
    expect(f.api.preview({tileX:6,tileY:8},'furniture_townhouse_wall_mirror').failure).toBe('Doorway support needs clear wall space');
  });
  it('reports corrupted existing furniture after a row revision instead of reusing a cached success', () => {
    const f = fixture(), tile = { tileX: 5, tileY: 6 };
    f.api.preview(tile, 'furniture_rustic_chair');
    f.placeables.push({ id: 1n, kind: 'furniture_rustic_chair', spaceId: 30000, stateJson: 'broken' });
    f.network.resourceRevision++;
    expect(f.api.preview(tile, 'furniture_rustic_chair').failure).toBe('Furniture state needs repair');
    expect(f.calculate).toHaveBeenCalledTimes(1);
  });
});
