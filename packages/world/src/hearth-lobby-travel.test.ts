import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function fixture(){
  const unit=sim.TILE_SIZE_FIXED,width=32;
  const outside={width,height:width,blocked:new Uint8Array(width*width),elevations:new Int16Array(width*width),obstacles:[] as sim.CollisionObstacle[]} satisfies sim.CollisionMap;
  const inside=sim.hearthLobbyCollision(),events:string[]=[];
  let hands=false,mounted=false,run=false,health=1000;
  const position={identity:'player',spaceId:0,x:10.5*unit,y:10.5*unit,authorityTick:20n};
  const portal={fromSpace:0,fromTileX:10,fromTileY:10,toSpace:sim.HEARTH_LOBBY_SPACE_ID,
    toTileX:Number(sim.HEARTH_LOBBY_POINTS.arrival.tileX),toTileY:Number(sim.HEARTH_LOBBY_POINTS.arrival.tileY)};
  const registry=sim.bootstrapContentRegistry();
  const dependencies={...sim,SenderError:Error,homesteadForSpace:()=>null,
    activeSpaceDefinition:(_ctx:unknown,id:number)=>({spaceId:id,
      generator:id===sim.HEARTH_LOBBY_SPACE_ID?'delve_lobby':'island'}),
    contentRegistry:()=>registry,runtimeNpcMount:()=>null,
    portalUseResult:()=>{events.push('legacy-range');return 'portal_out_of_range';},
    teleportPlayer:()=>events.push('teleport'),collisionForSpace:(_ctx:unknown,id:number)=>id===0?outside:inside,
    rogueRunForIdentity:()=>run?{}:null,handsOccupiedFor:()=>hands,mountedNpcFor:()=>mounted?{}:null,
    advancePlayerStats:()=>{events.push('settle');return {healthCenti:health};},
    ensureArcheryTargets:()=>events.push('target'),clearBowCharge:()=>events.push('bow'),updateEquippedForIdentity:()=>events.push('equipment')};
  const definitions=['prepareHearthLobbyPortal','usePortalRow'].map(name=>{
    const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
    if(!fn)throw new Error(name);return fn.getText(source);
  }).join('\n');
  const handlers=new Function(...Object.keys(dependencies),ts.transpileModule(`${definitions}\nreturn {prepare:prepareHearthLobbyPortal,use:usePortalRow};`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText)(...Object.values(dependencies));
  const ctx={db:{world_clock:{id:{find:()=>({authorityTick:20n})}}}};
  return {...handlers,ctx,position,portal,outside,inside,events,unit,
    hands:()=>{hands=true;},mount:()=>{mounted=true;},run:()=>{run=true;},dead:()=>{health=0;}};
}
describe('safe lobby portal preparation',()=>{
  it('validates the exact authored arrival before provisioning the target and settling bow equipment',()=>{
    const f=fixture();f.prepare(f.ctx,f.position,f.portal);
    expect(f.events).toEqual(['settle','target','bow','equipment']);
    expect(f.portal.toTileX).toBe(sim.HEARTH_LOBBY_POINTS.arrival.tileX);
    expect(f.portal.toTileY).toBe(sim.HEARTH_LOBBY_POINTS.arrival.tileY);
  });
  it.each([-1,1])('accepts the exact radial boundary on side %s',side=>{
    const f=fixture();f.position.x+=side*1.5*f.unit;
    expect(sim.hearthLobbyPortalApproachClear(f.position,f.portal,f.outside)).toBe(true);
    expect(()=>f.prepare(f.ctx,f.position,f.portal)).not.toThrow();
    f.position.x+=side;
    expect(sim.hearthLobbyPortalApproachClear(f.position,f.portal,f.outside)).toBe(false);
    expect(()=>f.prepare(f.ctx,f.position,f.portal)).toThrow('portal_out_of_range');
  });
  it('rejects a legacy square corner outside the radial reach',()=>{
    const f=fixture();f.position.x+=1.4*f.unit;f.position.y+=1.4*f.unit;
    expect(sim.hearthLobbyPortalApproachClear(f.position,f.portal,f.outside)).toBe(false);
    expect(()=>f.prepare(f.ctx,f.position,f.portal)).toThrow('portal_out_of_range');
  });
  it('uses lobby preflight alone at the positive boundary, retaining generic portal validation',()=>{
    const f=fixture();f.position.x+=1.5*f.unit;
    f.use(f.ctx,f.position,f.portal,true);
    expect(f.events).toEqual(['settle','target','bow','equipment','teleport']);
    f.events.length=0;
    expect(()=>f.use(f.ctx,f.position,{...f.portal,toSpace:1},true)).toThrow('portal_out_of_range');
    expect(f.events).toEqual(['legacy-range']);
  });
  it('rejects blocked destination rather than moving the saved landing',()=>{
    const f=fixture();f.portal.toTileX=0;f.portal.toTileY=0;
    expect(()=>f.prepare(f.ctx,f.position,f.portal)).toThrow('portal_landing_blocked');expect(f.events).toEqual([]);
  });
  it('requires a full-body clear source on the threshold plane and within reach',()=>{
    const f=fixture();f.position.x+=2*f.unit;
    expect(()=>f.prepare(f.ctx,f.position,f.portal)).toThrow('portal_out_of_range');
    f.position.x-=f.unit;f.outside.elevations![10*32+11]=1;
    expect(()=>f.prepare(f.ctx,f.position,f.portal)).toThrow('portal_out_of_range');
    f.position.x-=f.unit;f.outside.blocked[10*32+10] = 1;
    expect(()=>f.prepare(f.ctx,f.position,f.portal)).toThrow('portal_out_of_range');expect(f.events).toEqual([]);
  });
  it('rejects a thin obstruction between otherwise clear approach and threshold bodies',()=>{
    const f=fixture();f.position.x-=f.unit;
    f.outside.obstacles.push({left:10*f.unit-1,right:10*f.unit+1,top:9*f.unit,bottom:11*f.unit});
    expect(sim.positionCollides(f.position,f.outside)).toBe(false);
    expect(sim.positionCollides({x:10.5*f.unit,y:10.5*f.unit},f.outside)).toBe(false);
    expect(()=>f.prepare(f.ctx,f.position,f.portal)).toThrow('portal_out_of_range');
    expect(f.events).toEqual([]);
  });
  it.each([['hands','hands_occupied'],['mount','mounted_action_forbidden'],['run','descent_already_active'],['dead','player_not_ready']] as const)(
    'rejects %s without provisioning or settling a bow', (state,code)=>{
      const f=fixture();f[state]();expect(()=>f.prepare(f.ctx,f.position,f.portal)).toThrow(code);
      expect(f.events).not.toContain('target');expect(f.events).not.toContain('bow');
    });
  it('allows the visible outside threshold to leave without creating targets or runs',()=>{
    const f=fixture(),exit=sim.HEARTH_LOBBY_POINTS.exit;
    const position={...f.position,spaceId:sim.HEARTH_LOBBY_SPACE_ID,x:(exit.tileX+.5)*f.unit,y:(exit.tileY+.5)*f.unit};
    f.prepare(f.ctx,position,{fromSpace:position.spaceId,fromTileX:exit.tileX,fromTileY:exit.tileY,toSpace:0,toTileX:10,toTileY:10});
    expect(f.events).toEqual(['settle','bow','equipment']);
  });
});
