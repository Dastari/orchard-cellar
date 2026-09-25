import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';
import * as sim from '@orchard/sim';
import * as rules from './world-rules.js';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function implementation(name:string){
  const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  if(fn)return fn.getText(source);
  const declaration=source.statements.filter(ts.isVariableStatement).flatMap(node=>node.declarationList.declarations).find(node=>node.name.getText(source)===name)!;
  const init=declaration.initializer;
  if(!init||!ts.isCallExpression(init))throw new Error(name);
  return `const ${name}=${init.arguments.find(ts.isArrowFunction)!.getText(source)};`;
}
function fixture(){
  const identity={isEqual:(other:unknown)=>other===identity};
  const registry=sim.bootstrapContentRegistry(),chair={id:1n,kind:'furniture_rustic_chair',definitionId:'object:furniture_rustic_chair',spaceId:2,tileX:7,tileY:7,stateJson:'{}'};
  let position={identity,spaceId:2,x:7.5*sim.TILE_SIZE_FIXED,y:9*sim.TILE_SIZE_FIXED,actionKind:'none',authorityTick:1n};
  let custody:Record<string,unknown>|null=null,occupied=false,missing=false,role:string|null='visitor';
  let input={settleSteps:0,direction:'idle',updatedAtMicros:0n,sequence:0n,sprinting:false,runStartClientTick:0n,settleDirection:'idle',
    settledSequence:0n,pendingSequence:0n,appliedSteps:0n,creditStartedAtMicros:0n,creditedSteps:0n,lastProcessedSequence:0n};
  const writes:string[]=[],empty={find:()=>null};
  const collision={width:16,height:16,blocked:new Uint8Array(256),elevations:new Int16Array(256)};
  const ctx={sender:identity,senderAuth:{jwt:null},timestamp:{microsSinceUnixEpoch:0n},db:{membership:{identity:empty},world_clock:{id:{find:()=>({authorityTick:2n})}},
    player_position:{identity:{find:()=>position,update:(row:typeof position)=>{position=row;writes.push('position');}},by_chunk:{filter:()=>[position]}},
    player_seat:{identity:{find:()=>custody,delete:()=>{custody=null;writes.push('release');}},placeableId:{find:()=>occupied?{}:custody},insert:(row:Record<string,unknown>)=>{custody=row;writes.push('reserve');}},
    player_stats:{identity:{find:()=>({healthCenti:100})}},player_jump_state:{identity:empty},bow_charge:{identity:empty},
    player_combat_state:{identity:empty},player_input:{identity:{find:()=>input,update:(row:typeof input)=>{input=row;}}},world_placeable:{id:{find:()=>chair}}}};
  const deps={...sim,...rules,advancePlayerStats:()=>{},SenderError:Error,requireAuthorizedSender:()=>{},requirePersistentInventoryAvailable:()=>{},mountedNpcFor:()=>null,handsOccupiedFor:()=>false,
    homesteadForSpace:()=>({residenceSpaceId:2}),homesteadRoleFor:()=>role,requireCombatActionReady:()=>{},contentRegistry:()=>registry,
    authoredPlaceableDefinition:()=>registry.objects.get(chair.definitionId),furnitureInResidence:()=>missing?[]:[sim.hearthFurniturePlacementFromRow(chair)!],
    collisionForSpace:()=>collision,chunkAt:(value:number)=>Math.floor(value/(16*sim.TILE_SIZE_FIXED)),cancelFishingCastFor:()=>{}};
  const code=ts.transpileModule(`${implementation('parseDirection')}\n${implementation('resetHearthSeatMovement')}\n${implementation('standHearthSeat')}\n${implementation('sitHearthFurniture')}\n${implementation('setInput')}\nreturn {sitHearthFurniture,standHearthSeat,setInput};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const run=new Function(...Object.keys(deps),code)(...Object.values(deps));
  return {writes,collision,sit:()=>run.sitHearthFurniture(ctx,{placeableId:1n}),stand:()=>run.standHearthSeat(ctx,identity),
    position:()=>position,custody:()=>custody,removeSeat:()=>{missing=true;},relocate:()=>{position={...position,x:2*sim.TILE_SIZE_FIXED,y:2*sim.TILE_SIZE_FIXED,actionKind:'none'};},setOccupied:()=>{occupied=true;},setQueued:()=>{input.settleSteps=1;},setRole:()=>{role=null;},input:()=>input,packet:(direction:string,sequence:bigint,clientTick:bigint)=>run.setInput(ctx,{direction,sequence,clientTick,sprinting:false})};
}
describe('production seating reducers and standing helper',()=>{
  it('allows an invited visitor to sit and safely stand without inventory mutation',()=>{
    const f=fixture();f.sit();expect(f.position().actionKind).toBe('sitting');expect(f.custody()?.placeableId).toBe(1n);
    expect(f.writes).toEqual(['reserve','position']);expect(f.stand()).toBe(true);expect(f.custody()).toBeNull();expect(f.position().actionKind).toBe('none');
  });
  it('rejects occupied seats, revoked access and queued movement before writes',()=>{
    for(const [configure,error] of [[(f:ReturnType<typeof fixture>)=>f.setOccupied(),'seat_occupied'],[(f:ReturnType<typeof fixture>)=>f.setRole(),'furniture_requires_residence'],[(f:ReturnType<typeof fixture>)=>f.setQueued(),'stop_before_sitting']] as const){
      const f=fixture();configure(f);expect(()=>f.sit()).toThrow(error);expect(f.writes).toEqual([]);
    }
  });
  it('stands on a fresh held direction without settling the seated interval',()=>{
    const f=fixture();f.sit();f.packet('down',1n,200n);expect(f.custody()).toBeNull();
    expect(f.input().direction).toBe('down');expect(f.input().settleSteps).toBe(0);expect(f.input().runStartClientTick).toBe(200n);
    const before=f.input();f.packet('up',1n,400n);expect(f.input()).toBe(before);
  });
  it('discards a blocked seated interval before the next movement run',()=>{
    const f=fixture();f.sit();f.collision.blocked.fill(1);f.collision.blocked[7*16+7] = 0;
    f.packet('down',1n,200n);expect(f.custody()).not.toBeNull();expect(f.input().direction).toBe('idle');expect(f.input().settleSteps).toBe(0);expect(f.input().lastProcessedSequence).toBe(1n);
    f.collision.blocked.fill(0);f.packet('down',2n,400n);expect(f.custody()).toBeNull();expect(f.input().settleSteps).toBe(0);
    f.packet('idle',3n,401n);expect(f.input().settleSteps).toBeLessThanOrEqual(1);
  });
  it('releases orphaned custody when deletion leaves the current body clear',()=>{
    const f=fixture();f.sit();f.removeSeat();expect(f.stand()).toBe(true);expect(f.custody()).toBeNull();expect(f.position().actionKind).toBe('none');
  });
  it('clears custody after an external same-space relocation without moving the actor back',()=>{
    const f=fixture();f.sit();f.relocate();const moved=f.position();expect(f.stand()).toBe(true);expect(f.custody()).toBeNull();expect(f.position()).toBe(moved);
  });
  it('keeps custody when room changes block every safe standing point',()=>{
    const f=fixture();f.sit();f.writes.length=0;f.collision.blocked.fill(1);f.collision.blocked[7*16+7] = 0;
    expect(f.stand()).toBe(false);expect(f.custody()).not.toBeNull();expect(f.writes).toEqual([]);
  });
});
