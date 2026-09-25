import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';
import {cellarLadderApproachClear,cellarLadderPortal,hearthLobbyPortalApproachClear,TILE_SIZE_FIXED,
  type CollisionMap} from '@orchard/sim';

const source=ts.createSourceFile('overworld-main.ts',readFileSync(new URL('./overworld-main.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const declaration=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='targetPortal');
if(!declaration)throw new Error('targetPortal missing');
function fixture(){
  const unit=TILE_SIZE_FIXED;
  const position={spaceId:0,x:12*unit,y:10.5*unit,facing:'up'};
  const portal={kind:'hearth_lobby_exit',fromSpace:0,fromTileX:10,fromTileY:10,toSpace:65532};
  const collision={width:32,height:32,blocked:new Uint8Array(1024),elevations:new Int16Array(1024)} satisfies CollisionMap;
  const active={generator:'island'};
  const dependencies={network:{ownPosition:()=>position},TILE_SIZE_FIXED,hearthLobbyPortalApproachClear,
    cellarLadderApproachClear,cellarLadderPortal,
    authoredSpacePortalPrompt:()=>({authored:false,prompt:null}),
    activeSpaceDefinition:active,
    runtimeHearthLobbyDefinition:(_registry:unknown,id:number)=>id===65532
      ||(id===0&&active.generator==='delve_lobby')?{}:null,
    runtimeSpaceDefinition:(_registry:unknown,id:number)=>({spaceId:id,
      generator:id===65532?'delve_lobby':'island'}),
    worldCollision:collision};
  const target=new Function(...Object.keys(dependencies),ts.transpileModule(`${declaration!.getText(source)}\nreturn targetPortal;`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText)(...Object.values(dependencies));
  return {position,portal,collision,active,unit,target:()=>target({portals:[portal],content:{registry:null}})};
}
describe('lobby portal prompt parity',()=>{
  it('shows the exact positive radial boundary and hides a square corner and upper cliff',()=>{
    const f=fixture();expect(f.target()).toBe(f.portal);
    f.position.x=11.9*f.unit;f.position.y=11.9*f.unit;expect(f.target()).toBeNull();
    f.position.x=11.5*f.unit;f.position.y=10.5*f.unit;f.collision.elevations[10*32+11]=1;
    expect(f.target()).toBeNull();
  });
  it('prompts the cellar ladder only at the foot tile with the ladder faced',()=>{
    const f=fixture();f.portal.toSpace=1;f.portal.kind='cellar_exit:toby';
    f.position.x=10.5*f.unit;f.position.y=11.5*f.unit;expect(f.target()).toBe(f.portal);
    for(const facing of ['down','left','right','upLeft','upRight','idle']){
      f.position.facing=facing;expect(f.target()).toBeNull();
    }
    f.position.facing='up';
    f.position.y=10.5*f.unit;expect(f.target()).toBeNull();
    f.position.y=12.5*f.unit;expect(f.target()).toBeNull();
    f.position.y=11.5*f.unit;f.position.x=11.5*f.unit;expect(f.target()).toBeNull();
    f.position.x=9.5*f.unit;expect(f.target()).toBeNull();
  });
  it('checks geometry on lobby exits and preserves generic square targeting',()=>{
    const f=fixture();f.portal.toSpace=1;expect(f.target()).toBeNull();
    f.position.x=11.9*f.unit;f.position.y=11.9*f.unit;expect(f.target()).toBe(f.portal);
    f.active.generator='delve_lobby';expect(f.target()).toBeNull();
    f.position.x=10.5*f.unit;f.position.y=10.5*f.unit;expect(f.target()).toBe(f.portal);
    f.collision.blocked[10*32+10] = 1;expect(f.target()).toBeNull();
  });
});
