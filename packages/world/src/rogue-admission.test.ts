import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function admission(dependencies:Record<string,unknown>){
  const declaration=source.statements.flatMap(node=>ts.isVariableStatement(node)?[...node.declarationList.declarations]:[])
    .find(row=>row.name.getText(source)==='startRogueRun')!;
  if(!declaration.initializer||!ts.isCallExpression(declaration.initializer))throw new Error('missing reducer');
  const callback=declaration.initializer.arguments.find(ts.isArrowFunction)!;
  const helpers=['clearBowCharge','authorityBowChargeMs','spendPlayerHunger'].map(name=>{
    const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
    if(!fn)throw new Error(`missing ${name}`);return fn.getText(source);
  }).join('\n');
  return new Function(...Object.keys(dependencies),ts.transpileModule(`${helpers}\nreturn (${callback.getText(source)});`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText)(...Object.values(dependencies));
}
function fixture(){
  type Row=Record<string,unknown>;
  const unit=sim.TILE_SIZE_FIXED,width=24;
  const position={spaceId:42,x:12.5*unit,y:6.5*unit,facing:'up'};
  const collision:sim.CollisionMap={width,height:width,blocked:Array<boolean>(width*width).fill(false),elevations:new Int16Array(width*width)};
  let stats={healthCenti:10000,manaCenti:9000,vigourCenti:8000,healthRemainder:1,manaRemainder:2,vigourRemainder:3};
  let survival={hungerCenti:7500,hungerUpdatedTick:0n};
  let charge:Row|null={itemKind:'bow',startedTick:0n,fullChargeCostCenti:2200,minimumSwingTicks:8};
  let member:Row|null=null,created=0,teleported=false,advances=0;
  let entrances:sim.SpaceRunEntrance[]=[{id:'descent',kind:'roguelike',tileX:12,tileY:4,reachTiles:2}];
  const ctx={sender:{toHexString:()=> 'player'},senderAuth:{jwt:{}},db:{
    membership:{identity:{find:()=>null}},player_position:{identity:{find:()=>position}},
    player_survival:{identity:{find:()=>survival,update:(row:Row)=>{survival=row as typeof survival;}}},
    player_stats:{identity:{update:(row:Row)=>{stats=row as typeof stats;return row;}}},
    world_clock:{id:{find:()=>({authorityTick:20n})}},world_seed:{id:{find:()=>({seed:1})}},
    bow_charge:{identity:{find:()=>charge,delete:()=>{charge=null;}}},
    rogue_run:{insert:(row:Row)=>{created++;return {...row,id:1n};}},
    rogue_run_member:{insert:(row:Row)=>{member=row;}},
  }};
  const start=admission({...sim,SenderError:Error,requireAuthorizedSender:()=>{},rogueRunForIdentity:()=>null,
    activeSpaceDefinition:()=>({runEntrances:entrances}),collisionForSpace:()=>collision,
    combatElevationAt:(_c:unknown,x:number,y:number)=>collision.elevations![Math.floor(y/unit)*width+Math.floor(x/unit)],
    handsOccupiedFor:()=>false,mountedNpcFor:()=>null,advancePlayerStats:()=>{advances++;return stats;},
    contentRegistry:()=>sim.bootstrapContentRegistry(),combatRecovery:()=>{},updateEquippedForIdentity:()=>{},
    nextRogueSpaceId:()=>50000,playerPartyId:()=>null,initializeRogueRoom:(_ctx:unknown,run:Row)=>run,
    teleportPlayer:()=>{teleported=true;},
  });
  return {start:()=>start(ctx),position,collision,unit,removeEntrance:()=>{entrances=[];},kill:()=>{stats.healthCenti=0;},
    state:()=>({stats,survival,charge,member,created,teleported,advances})};
}
describe('Delve admission resource boundary',()=>{
  it('settles bow costs before freezing return resources and never carries its charge into a run',()=>{
    const f=fixture();f.start();const s=f.state();
    expect(s.created).toBe(1);expect(s.teleported).toBe(true);expect(s.charge).toBeNull();
    expect(s.stats.vigourCenti).toBeLessThan(8000);
    expect(s.member).toMatchObject({returnSpaceId:42,returnX:f.position.x,returnY:f.position.y,returnFacing:'up',
      savedHealthCenti:10000,savedManaCenti:9000,savedVigourCenti:s.stats.vigourCenti,
      savedHealthRemainder:1,savedManaRemainder:2,savedVigourRemainder:3,
      savedHungerCenti:7500-sim.HUNGER_WEAPON_USE_CENTI});
    expect(s.survival.hungerCenti).toBe(sim.HUNGER_MAX_CENTI);
  });
  it.each(['removed','remote','plane','wall','threshold'] as const)('rejects %s admission before resource settlement or run creation',kind=>{
    const f=fixture();
    if(kind==='removed')f.removeEntrance();
    if(kind==='remote')f.position.x=2.5*f.unit;
    if(kind==='plane')(f.collision.elevations as Int16Array)[6*24+12]=1;
    if(kind==='wall')(f.collision.blocked as boolean[])[5*24+12]=true;
    if(kind==='threshold')(f.collision.blocked as boolean[])[4*24+12]=true;
    expect(f.start).toThrow('descent_entrance_unavailable');
    expect(f.state()).toMatchObject({created:0,teleported:false,advances:0});expect(f.state().charge).not.toBeNull();
  });
  it('rejects a dead player without creating a run',()=>{
    const f=fixture();f.kill();expect(f.start).toThrow('player_not_ready');expect(f.state().created).toBe(0);
  });
});
