import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const declaration=source.statements.filter(ts.isVariableStatement).flatMap(node=>node.declarationList.declarations)
  .find(node=>node.name.getText(source)==='editResidenceArchitecture')!;
const callback=(declaration.initializer as ts.CallExpression).arguments.find(ts.isArrowFunction)!.getText(source);
function fixture(){
  let home={spaceId:60000,residenceSpaceId:30000,residenceExpansionRank:0,residenceArchitectureJson:sim.EMPTY_HEARTH_ARCHITECTURE_JSON};
  const identity={isEqual:(other:unknown)=>other===identity},position={identity,spaceId:30000,x:8.5*sim.TILE_SIZE_FIXED,y:11.5*sim.TILE_SIZE_FIXED,actionKind:'none'};
  let containers:Record<string,sim.ContainerSnapshot>={hotbar:{id:'hotbar',capacity:1,slots:[{itemKind:'wood',quantity:2}]},backpack:{id:'backpack',capacity:1,slots:[null]}},registry=sim.bootstrapContentRegistry();
  let builder=true;const writes:string[]=[];
  const ctx={sender:identity,db:{player_position:{by_chunk:{filter:()=>[position]}},player_seat:{identity:{find:()=>null}},
    homestead:{spaceId:{update:(next:typeof home)=>{home=next;writes.push('home');}}}}};
  const dependencies={...sim,SenderError:Error,requireFurnitureBuilder:()=>{if(!builder)throw Error('builder_required');return position;},
    homesteadForSpace:()=>home,requireFurnitureReach:()=>{},requireArchitectureReach:()=>{},furnitureInResidence:()=>[],
    contentRegistry:()=>registry,
    collisionForSpace:(...args:unknown[])=>{
      const baseline={width:16,height:16,blocked:Array.from({length:256},(_,i)=>!sim.residencePlayableTile(i%16,Math.floor(i/16)))};
      return args[7]===true?baseline:sim.persistedHearthArchitectureCollision(0,baseline,home.residenceArchitectureJson);
    },
    loadPlayerInventory:()=>({rowBySlot:new Map(),containers}),activeItemContainerContent:()=>sim.itemContainerContentResolver(sim.bootstrapContentRegistry()),
    writePlayerInventory:(_ctx:unknown,_rows:unknown,_before:unknown,next:typeof containers)=>{containers=next;writes.push('inventory');}};
  const reachSource=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='requireArchitectureReach')!.getText(source);
  const reach=new Function(...Object.keys(dependencies),ts.transpile(reachSource+'; return requireArchitectureReach;',{target:ts.ScriptTarget.ES2022}))(...Object.values(dependencies));
  const destinationSource=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='requireFurnitureDestination')!.getText(source);
  const destination=new Function(...Object.keys(dependencies),ts.transpile(destinationSource+'; return requireFurnitureDestination;',{target:ts.ScriptTarget.ES2022}))(...Object.values(dependencies));
  const run=new Function(...Object.keys(dependencies),ts.transpile(`return (${callback});`,{target:ts.ScriptTarget.ES2022}))(...Object.values(dependencies));
  return {run:(revision:bigint,edits:unknown)=>run(ctx,{expectedRevision:revision,editsJson:JSON.stringify(edits)}),home:()=>home,containers:()=>containers,writes,
    setState:(state:sim.HearthArchitectureState)=>{home={...home,residenceArchitectureJson:sim.serializeHearthArchitectureState(state)};},
    reach:(x:number,y:number)=>reach(ctx,position,x,y),
    setPosition:(x:number,y:number)=>{position.x=x;position.y=y;},
    destination:(candidate:sim.HearthFurniturePlacement)=>destination(ctx,position,candidate),
    setBuilder:(value:boolean)=>{builder=value;},setContainers:(next:typeof containers)=>{containers=next;},
    setRegistry:(next:typeof registry)=>{registry=next;}};
}
describe('construction reducer pre-commit flow',()=>{
  const floor=[{tileX:6,tileY:8,replacement:{tileX:6,tileY:8,floor:'rustic'}}];
  it('commits materials and saved revision together and rejects a stale builder',()=>{
    const f=fixture();f.run(0n,floor);expect(f.writes).toEqual(['inventory','home']);
    expect(sim.parseHearthArchitectureState(f.home().residenceArchitectureJson)?.revision).toBe(1n);
    expect(f.containers().hotbar!.slots[0]).toBeNull();
    expect(()=>f.run(0n,floor)).toThrow('stale');expect(f.writes).toHaveLength(2);
    f.run(1n,[{tileX:6,tileY:8}]);expect(f.containers().hotbar!.slots[0]).toMatchObject({itemKind:'wood',quantity:2});
  });
  it('keeps state and inventory when a refund cannot fit',()=>{
    const f=fixture();f.run(0n,floor);
    f.setContainers(Object.fromEntries(['hotbar','backpack'].map(id=>[id,{id,capacity:1,slots:[{itemKind:'stone',quantity:99}]}])));
    const before=f.home().residenceArchitectureJson;
    expect(()=>f.run(1n,[{tileX:6,tileY:8}])).toThrow('refund_inventory_full');
    expect(f.home().residenceArchitectureJson).toBe(before);expect(f.writes).toHaveLength(2);
  });
  it('rejects visitors and malformed input without any writes',()=>{
    const f=fixture();f.setBuilder(false);expect(()=>f.run(0n,floor)).toThrow('builder_required');
    f.setBuilder(true);expect(()=>f.run(0n,[{tileX:6,tileY:8,replacement:{tileX:7,tileY:8,floor:'rustic'}}])).toThrow('edits_invalid');
    expect(f.writes).toEqual([]);
  });
  it('fails before inventory or home writes when the active v1 recipe is unavailable',()=>{
    const f=fixture(),active=sim.bootstrapContentRegistry();
    f.setRegistry({...active,balances:new Map([...active.balances].filter(([,definition])=>(
      !('profile' in definition)||definition.profile!=='residence_construction')))});
    expect(()=>f.run(0n,floor)).toThrow('construction_material_profile_unavailable');
    expect(f.writes).toEqual([]);expect(f.containers().hotbar!.slots[0]).toEqual({itemKind:'wood',quantity:2});
  });
  it('rejects later furniture that blocks a persisted doorway approach',()=>{
    const f=fixture();f.setState({recipeVersion:1,revision:1n,cells:[{tileX:6,tileY:8,partition:'wall'},
      {tileX:7,tileY:8,partition:'doorway'},{tileX:8,tileY:8,partition:'wall'}]});
    expect(()=>f.destination({id:'new',shape:sim.HEARTH_FURNITURE_SHAPES.furniture_rustic_chest!,tileX:7,tileY:9})).toThrow('doorway_approach_blocked');
    expect(f.writes).toEqual([]);
  });

  it('rejects later wall furniture on doorway hardware supports',()=>{
    const f=fixture();f.setState({recipeVersion:1,revision:1n,cells:[{tileX:6,tileY:7,partition:'wall'},
      {tileX:6,tileY:8,partition:'wall'},{tileX:7,tileY:8,partition:'doorway'},{tileX:8,tileY:8,partition:'wall'}]});
    f.setPosition(4.5*sim.TILE_SIZE_FIXED,10.5*sim.TILE_SIZE_FIXED);
    expect(()=>f.destination({id:'new',shape:sim.HEARTH_FURNITURE_SHAPES.furniture_townhouse_wall_mirror!,tileX:6,tileY:8}))
      .toThrow('doorway_support_occupied');
    expect(f.writes).toEqual([]);
  });
  it('can repair paid conflicting windows through the reducer without losing their refunds',()=>{
    const f=fixture();f.setState({recipeVersion:1,revision:0n,cells:[{tileX:6,tileY:8,partition:'wall',window:true},
      {tileX:7,tileY:8,partition:'doorway'},{tileX:8,tileY:8,partition:'wall',window:true}]});
    f.run(0n,[{tileX:6,tileY:8,replacement:{tileX:6,tileY:8,partition:'wall'}}]);
    const remaining=sim.parseHearthArchitectureState(f.home().residenceArchitectureJson)!;
    expect(sim.hearthDoorwayWindowConflicts(remaining.cells).size).toBe(1);
    expect(f.containers().hotbar!.slots[0]).toMatchObject({itemKind:'wood',quantity:4});
    expect(f.containers().backpack!.slots[0]).toMatchObject({itemKind:'copper_piece',quantity:2});
    f.run(1n,[{tileX:8,tileY:8,replacement:{tileX:8,tileY:8,partition:'wall'}}]);
    expect(f.containers().hotbar!.slots[0]).toMatchObject({quantity:6});
    expect(f.containers().backpack!.slots[0]).toMatchObject({quantity:4});
    expect(f.writes).toEqual(['inventory','home','inventory','home']);
  });
  it('allows reaching a partition from either face while enforcing distance',()=>{
    const f=fixture();f.setState({recipeVersion:1,revision:1n,cells:[{tileX:6,tileY:8,partition:'wall'}]});
    for(const [x,y] of [[6.5,6.5],[6.5,10.5],[4.5,8.5]]) {
      f.setPosition(x!*sim.TILE_SIZE_FIXED,y!*sim.TILE_SIZE_FIXED);expect(()=>f.reach(6,8)).not.toThrow();
    }
    f.setPosition(0,0);expect(()=>f.reach(6,8)).toThrow('architecture_out_of_reach');
  });

});
