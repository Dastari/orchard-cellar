import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function reducer(dependencies:Record<string,unknown>,helpers:readonly string[]=[]){
  const declaration=source.statements.flatMap(node=>ts.isVariableStatement(node)?[...node.declarationList.declarations]:[])
    .find(row=>row.name.getText(source)==='travelHearthFerry')!;
  if(!declaration.initializer||!ts.isCallExpression(declaration.initializer))throw new Error('missing reducer');
  const callback=declaration.initializer.arguments.find(ts.isArrowFunction)!;
  const definitions=helpers.map(name=>{
    const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
    if(fn===undefined)throw new Error(`missing ${name}`);return fn.getText(source);
  }).join('\n');
  return new Function(...Object.keys(dependencies),ts.transpileModule(`${definitions}\nreturn (${callback.getText(source)});`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText)(...Object.values(dependencies));
}
function fixture(registry:sim.ContentRegistry=sim.bootstrapContentRegistry()){
  const width=832,unit=sim.TILE_SIZE_FIXED;
  const collision={width,height:width,blocked:new Uint8Array(width*width),elevations:Array<number>(width*width).fill(0)};
  let policy:sim.CombatRegionPolicy|undefined=new sim.CombatRegionPolicy(sim.HEARTH_COMBAT_REGIONS),ready=true,health=10000;
  const position={spaceId:0,x:408.5*unit,y:317.5*unit,authorityTick:20n};
  const transitions:Record<string,unknown>[]=[];
  const ctx={sender:'player',senderAuth:{jwt:{}},db:{membership:{identity:{find:()=>null}},player_position:{identity:{find:()=>position}},
    world_clock:{id:{find:()=>({authorityTick:20n})}},outdoor_encounter:{id:{find:()=>ready?{}:null}}}};
  const travel=reducer({...sim,SenderError:Error,requireAuthorizedSender:()=>{},advancePlayerStats:()=>({healthCenti:health}),
    contentRegistry:()=>registry,
    clearBowCharge:()=>{},updateEquippedForIdentity:()=>{},
    compiledLiveIslandRuntime:()=>({combatPolicy:policy}),collisionForSpace:()=>collision,
    combatElevationAt:(_collision:unknown,x:number,y:number)=>collision.elevations[Math.floor(y/unit)*width+Math.floor(x/unit)],
    usePortalRow:(_ctx:unknown,_position:unknown,portal:Record<string,unknown>,range:boolean)=>{expect(range).toBe(false);transitions.push(portal);}});
  return {travel,ctx,position,collision,transitions,unit,removePolicy:()=>{policy=undefined;},unready:()=>{ready=false;},dead:()=>{health=0;}};
}
describe('authoritative ferry departure',()=>{
  it('settles a held bow and preserves carried containers, full bags and cursor custody through the real teleport helpers',()=>{
    type Row=Record<string,unknown>;
    const unit=sim.TILE_SIZE_FIXED,width=832,registry=sim.bootstrapContentRegistry();
    const collision={width,height:width,blocked:new Uint8Array(width*width)};
    let position:Row={identity:'player',spaceId:0,x:408.5*unit,y:317.5*unit,authorityTick:20n,actionKind:'bow_charge'};
    let stats:Row={healthCenti:10000,vigourCenti:10000};
    let charge:Row|null={itemKind:'bow',startedTick:0n,fullChargeCostCenti:2200,minimumSwingTicks:8};
    let defense:Row|null=null,hungerSpends=0,equipmentRefreshes=0;
    let chest:Row={id:1n,spaceId:0,tileX:408,tileY:317,carriedBy:'player',itemCount:12};
    let placeable:Row={id:2n,spaceId:0,tileX:408,tileY:317,carriedBy:'player',kind:'barrel',quantity:1};
    const custody={bronze:900n,bags:Array.from({length:20},()=>({itemKind:'wood',quantity:99})),cursor:{itemKind:'guardian_seal',quantity:1}};
    const before=structuredClone(custody),deleted=()=>{};
    const ctx={sender:'player',senderAuth:{jwt:{}},db:{membership:{identity:{find:()=>null}},
      world_clock:{id:{find:()=>({authorityTick:20n})}},player_position:{identity:{find:()=>position,update:(row:Row)=>{position=row;}}},
      player_stats:{identity:{update:(row:Row)=>{stats=row;}}},bow_charge:{identity:{find:()=>charge,delete:()=>{charge=null;}}},
      player_seat:{identity:{delete:deleted}},player_combat_state:{identity:{find:()=>defense}},player_jump_state:{identity:{delete:deleted}},player_input:{identity:{find:()=>null}},
      world_chest:{by_carrier:{filter:()=>[chest]},id:{update:(row:Row)=>{chest=row;}}},world_combat_target:{by_carrier:{filter:()=>[]}},
      world_placeable:{by_carrier:{filter:()=>[placeable]},id:{update:(row:Row)=>{placeable=row;}}},
      active_chest:{identity:{delete:deleted}},active_dialogue:{identity:{delete:deleted}}}};
    const policy=new sim.CombatRegionPolicy(sim.HEARTH_COMBAT_REGIONS);
    const travel=reducer({...sim,SenderError:Error,requireAuthorizedSender:()=>{},advancePlayerStats:()=>stats,
      contentRegistry:()=>registry,compiledLiveIslandRuntime:()=>({combatPolicy:policy}),collisionForSpace:()=>collision,combatElevationAt:()=>0,
      homesteadForSpace:()=>null,activeSpaceDefinition:()=>({generator:'island'}),mountedNpcFor:()=>null,
      combatRecovery:(_ctx:unknown,_id:unknown,_tick:unknown,readyTick:bigint)=>{defense={readyTick};},
      spendPlayerHunger:()=>{hungerSpends++;},updateEquippedForIdentity:()=>{equipmentRefreshes++;},
      cancelFishingCastFor:()=>{},chunkAt:(value:number)=>Math.floor(value/(16*unit)),syncLegacyChestGenericMirror:()=>{},
      clearActivePlaceable:()=>{},refreshPlayerQuestLocations:()=>{},
    },['clearBowCharge','authorityBowChargeMs','usePortalRow','teleportPlayer']);
    travel(ctx,{fromDock:'orchard',toDock:'willowharbour'});
    expect(charge).toBeNull();expect(stats.vigourCenti).toBeLessThan(10000);expect(hungerSpends).toBe(1);expect(equipmentRefreshes).toBe(1);
    expect(position).toMatchObject({spaceId:0,x:204.5*unit,y:400.5*unit,actionKind:'none'});
    expect(chest).toMatchObject({tileX:204,tileY:400,carriedBy:'player',itemCount:12});
    expect(placeable).toMatchObject({tileX:204,tileY:400,carriedBy:'player',quantity:1});expect(custody).toEqual(before);
    position={...position,x:209.5*unit,y:400.5*unit};travel(ctx,{fromDock:'willowharbour',toDock:'orchard'});
    expect(hungerSpends).toBe(1);expect(position).toMatchObject({x:407.5*unit,y:317.5*unit});expect(custody).toEqual(before);
  });
  it('uses the shared portal transition with a fixed destination and no wallet or inventory access',()=>{
    const f=fixture();f.travel(f.ctx,{fromDock:'orchard',toDock:'willowharbour'});
    expect(f.transitions).toEqual([{id:0,kind:'hearth_ferry:orchard:willowharbour',fromSpace:0,fromTileX:408,fromTileY:317,toSpace:0,toTileX:204,toTileY:400}]);
  });
  it('accepts renamed authored network and destination ids without changing coordinates',()=>{
    const registry=sim.bootstrapContentRegistry();
    const provider=[...registry.spaces.values()].find(({ferry})=>ferry!==undefined)!;
    const ferry=provider.ferry!.map(([,name,thresholdX,thresholdY,arrivalX,arrivalY,region,flags],index)=>
      [`route_${index}`,name,thresholdX,thresholdY,arrivalX,arrivalY,region,flags] as const);
    const spaces=new Map(registry.spaces);spaces.delete(provider.id);
    spaces.set('space:renamed_ferry_authority',{...provider,id:'space:renamed_ferry_authority',ferry});
    const f=fixture({...registry,spaces});f.travel(f.ctx,{fromDock:'route_0',toDock:'route_1'});
    expect(f.transitions[0]).toMatchObject({kind:'hearth_ferry:route_0:route_1',
      fromTileX:408,fromTileY:317,toTileX:204,toTileY:400});
  });
  it('rejects arbitrary routes, remote requests and dead travellers',()=>{
    const f=fixture();expect(()=>f.travel(f.ctx,{fromDock:'__proto__',toDock:'orchard'})).toThrow('ferry_route_invalid');
    expect(()=>f.travel(f.ctx,{fromDock:'orchard',toDock:'orchard'})).toThrow('ferry_route_invalid');
    expect(()=>f.travel(f.ctx,{fromDock:'cinderwake',toDock:'orchard'})).toThrow('ferry_out_of_reach');
    f.dead();expect(()=>f.travel(f.ctx,{fromDock:'orchard',toDock:'willowharbour'})).toThrow('ferry_player_unavailable');
    expect(f.transitions).toHaveLength(0);
  });
  it('requires the authored destination and prewarmed camps before the first volcanic arrival',()=>{
    const f=fixture();f.unready();expect(()=>f.travel(f.ctx,{fromDock:'orchard',toDock:'cinderwake'})).toThrow('ferry_destination_preparing');
    f.removePolicy();expect(()=>f.travel(f.ctx,{fromDock:'orchard',toDock:'willowharbour'})).toThrow('ferry_destination_unavailable');
  });
  it('keeps the free homeward route after policy removal',()=>{
    const f=fixture();f.removePolicy();f.unready();f.position.x=644.5*f.unit;f.position.y=207.5*f.unit;
    f.travel(f.ctx,{fromDock:'cinderwake',toDock:'orchard'});
    expect(f.transitions[0]).toMatchObject({toTileX:407,toTileY:317,toSpace:0});
  });
  it('rejects obstructed or mismatched-plane departures and fully blocked landings',()=>{
    const f=fixture();f.position.y=316.5*f.unit;f.collision.elevations[316*832+408]=1;
    expect(()=>f.travel(f.ctx,{fromDock:'orchard',toDock:'willowharbour'})).toThrow('ferry_out_of_reach');
    f.position.y=317.5*f.unit;
    for(let y=397;y<=403;y++)for(let x=201;x<=207;x++)f.collision.blocked[y*832+x] = 1;
    expect(()=>f.travel(f.ctx,{fromDock:'orchard',toDock:'willowharbour'})).toThrow('ferry_landing_blocked');
    expect(f.transitions).toHaveLength(0);
  });
});
