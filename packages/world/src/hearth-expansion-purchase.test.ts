import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import * as sim from '@orchard/sim';
import {createAuthoritySpaceCollisionMap} from './world-rules.js';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const declaration=source.statements.filter(ts.isVariableStatement).flatMap(node=>node.declarationList.declarations)
  .find(node=>node.name.getText(source)==='purchaseResidenceExpansion')!;
const call=declaration.initializer as ts.CallExpression;
const callback=call.arguments.find(ts.isArrowFunction)!.getText(source);
function fixture() {
  const baseRegistry=sim.bootstrapContentRegistry();
  const template=[...baseRegistry.spaces.values()][0]!;
  const testSurfaces=[8,9,10].map((tileY,index)=>({
    id:String(index+1),kind:'fixed_test',tileX:14,tileY,capacity:1,footprint:[0,0,0,0] as const,
  }));
  const spaces=new Map(baseRegistry.spaces);
  spaces.set('space:test_residence_surfaces' as typeof template.id,{
    ...template,id:'space:test_residence_surfaces' as typeof template.id,spaceId:30000,surfaces:testSurfaces,
  });
  const registry={...baseRegistry,spaces};
  let home={spaceId:60000,residenceSpaceId:30000,residenceExpansionRank:0};
  let wallet={balanceBronze:300000n};
  const player={identity:'owner',spaceId:30000,x:8.5*sim.TILE_SIZE_FIXED,y:11.5*sim.TILE_SIZE_FIXED,actionKind:'none'};
  let occupants=[player];
  let furniture: sim.HearthFurniturePlacement[]=[];
  let owner=true;
  let seatCustody: {spaceId:number;seatedX:number;seatedY:number;placeableId:bigint}|null=null;
  const writes:string[]=[];
  let surfaces: {id:bigint;kind:string;tileX:number;tileY:number;capacity:number;spaceId:number}[]=[];
  const empty={by_chunk:{filter:()=>[]}};
  const ctx={sender:'owner',senderAuth:{jwt:{}},db:{
    world_resource:empty,world_chest:empty,world_combat_target:empty,world_placeable:empty,
    world_surface:{by_chunk:{filter:()=>surfaces}},cellar_excavation:{by_space:{filter:()=>[]}},
    membership:{identity:{find:()=>({})}},
    player_position:{identity:{find:()=>player},by_chunk:{filter:()=>occupants}},
    player_wallet:{identity:{find:()=>wallet,update:(next:typeof wallet)=>{writes.push('wallet');wallet=next;}}},
    world_clock:{id:{find:()=>({authorityTick:10n})}},
    player_seat:{identity:{find:(identity:string)=>identity==='guest'?seatCustody:null}},
    homestead:{spaceId:{find:()=>null,update:(next:typeof home)=>{writes.push('home');home=next;}}},
  }};
  const collisionDependencies={...sim,createAuthoritySpaceCollisionMap,
    chestMigrationReadsUsePlaceables:()=>true,
    instanceForSpace:()=>home,contentRegistry:()=>registry,
    liveMapCollisionForSpace:(_ctx:unknown,_space:number,_medium:string,collision:unknown)=>collision,
    liveMapRuntimeGeneratedResourceSuppressed:()=>false,
    activeSpaceDefinition:(_ctx:unknown,space:number,row:typeof home)=>sim.runtimeSpaceDefinition(registry,space,row),
    collisionWithinChunkScope:(collision:unknown)=>collision,
  };
  const collisionSource=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='collisionForSpace')!.getText(source);
  const actualCollision=new Function(...Object.keys(collisionDependencies),ts.transpile(collisionSource+'; return collisionForSpace;', {target:ts.ScriptTarget.ES2022}))(...Object.values(collisionDependencies));
  const dependencies={...sim,SenderError:Error,requireAuthorizedSender:()=>{},homesteadForOwner:()=>owner?home:null,
    collisionForSpace:actualCollision,furnitureInResidence:()=>furniture,recordPlayerStatistic:()=>{}};
  const run=new Function(...Object.keys(dependencies),ts.transpile(`return (${callback});`,{target:ts.ScriptTarget.ES2022}))( ...Object.values(dependencies));
  return {run:(expectedRank:number)=>run(ctx,{expectedRank}),home:()=>home,wallet:()=>wallet,writes,
    setSurfaces:(value:typeof surfaces)=>{surfaces=value;},
    collision:(rank:number)=>actualCollision(ctx,30000,undefined,undefined,undefined,true,rank) as sim.CollisionMap,
    setFurniture:(items:typeof furniture)=>{furniture=items;},setBalance:(balanceBronze:bigint)=>{wallet={balanceBronze};},
    setCustody:(value:typeof seatCustody)=>{seatCustody=value;},
    setOwner:(value:boolean)=>{owner=value;},setOccupants:(value:typeof occupants)=>{occupants=value;},player};
}
describe('actual residence expansion purchase reducer',()=>{
  it('buys both rooms at the quoted prices without rewriting furniture or occupants',()=>{
    const f=fixture();f.run(0);
    expect(f.home().residenceExpansionRank).toBe(1);expect(f.wallet().balanceBronze).toBe(240000n);
    f.run(1);expect(f.home().residenceExpansionRank).toBe(2);expect(f.wallet().balanceBronze).toBe(60000n);
    expect(f.writes).toEqual(['wallet','home','wallet','home']);
    expect(f.player.spaceId).toBe(30000);
  });
  it('rejects repeat/stale clicks and maximum rank before debit',()=>{
    const f=fixture();f.run(0);
    expect(()=>f.run(0)).toThrow('stale');expect(f.wallet().balanceBronze).toBe(240000n);
    f.run(1);expect(()=>f.run(2)).toThrow('maximum');expect(f.writes).toHaveLength(4);
  });
  it('rejects insufficient funds and nonowners without writes',()=>{
    const f=fixture();f.setBalance(59999n);expect(()=>f.run(0)).toThrow('insufficient_funds');
    f.setBalance(300000n);f.setOwner(false);expect(()=>f.run(0)).toThrow('not_ready');expect(f.writes).toEqual([]);
  });
  it('preserves an offline seated guest and rejects mismatched custody before writes',()=>{
    const f=fixture();
    const guest={identity:'guest',spaceId:30000,x:6.5*sim.TILE_SIZE_FIXED,
      y:8*sim.TILE_SIZE_FIXED+sim.PLAYER_HITBOX_FOOT_OFFSET,actionKind:'sitting'};
    const custody={spaceId:30000,seatedX:guest.x,seatedY:guest.y,placeableId:7n};
    f.setFurniture([{id:'7',shape:sim.HEARTH_FURNITURE_SHAPES.furniture_rustic_chair!,tileX:6,tileY:7}]);
    f.setOccupants([f.player,guest]);f.setCustody({...custody,seatedX:guest.x+1});
    expect(()=>f.run(0)).toThrow('invalid_seat_custody');expect(f.writes).toEqual([]);
    f.setCustody(custody);const before=JSON.stringify(guest);f.run(0);
    expect(JSON.stringify(guest)).toBe(before);expect(f.wallet().balanceBronze).toBe(240000n);
  });
  it('builds the proposed collision without changing persisted rank or dropping fixed obstacles',()=>{
    const f=fixture();f.setSurfaces([8,9,10].map((tileY,index)=>({
      id:BigInt(index+1),kind:'fixed_test',tileX:14,tileY,capacity:1,spaceId:30000,
    })));
    const next=f.collision(1);
    expect(f.home().residenceExpansionRank).toBe(0);expect(next.width).toBe(32);
    expect(next.blocked[9*32+14]).toBe(false);
    expect(next.obstacles?.some(obstacle=>obstacle.left===14*sim.TILE_SIZE_FIXED)).toBe(true);
    expect(()=>f.run(0)).toThrow('escape_blocked');expect(f.writes).toEqual([]);
  });
  it('rejects a doorway obstruction before money or rank changes',()=>{
    const f=fixture();f.setFurniture([{id:'chair',shape:sim.HEARTH_FURNITURE_SHAPES.furniture_rustic_chair!,tileX:12,tileY:9}]);
    expect(()=>f.run(0)).toThrow('reserved_approach');expect(f.writes).toEqual([]);
    expect(f.home().residenceExpansionRank).toBe(0);
  });
});
