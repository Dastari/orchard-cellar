import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry,bootstrapContentRows} from './content/bootstrap-registry.js';
import {buildContentRegistry} from './content/registry.js';
import {HEARTH_LOBBY_POINTS,activeHearthLobbyDefinition,generateHearthLobbyLayout,
  hearthLobbyCollision,runtimeHearthLobbyDefinition} from './hearth-lobby.js';
import {positionCollides} from './movement.js';
import {TILE_SIZE_FIXED} from './state.js';

describe('authored Delve lobby',()=>{
  it('keeps every interaction and the return arrival reachable with a full body',()=>{
    const collision=hearthLobbyCollision(),unit=TILE_SIZE_FIXED;
    const center=(x:number,y:number)=>({x:(x+.5)*unit,y:(y+.5)*unit});
    const {arrival}=HEARTH_LOBBY_POINTS;
    const queue=[arrival as {tileX:number;tileY:number}],seen=new Set([`${arrival.tileX},${arrival.tileY}`]);
    expect(positionCollides(center(arrival.tileX,arrival.tileY),collision)).toBe(false);
    for(let i=0;i<queue.length;i++){
      const current=queue[i]!;
      for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]){
        const x=current.tileX+dx!,y=current.tileY+dy!,key=`${x},${y}`;
        if(seen.has(key)||x<0||y<0||x>=24||y>=24)continue;
        // Sample every fixed unit so a one-pixel throat cannot pass this proof.
        let clear=true;
        for(let step=0;step<=unit;step++){
          const p=center(current.tileX,current.tileY);
          if(positionCollides({x:p.x+dx!*step,y:p.y+dy!*step},collision)){clear=false;break;}
        }
        if(clear){seen.add(key);queue.push({tileX:x,tileY:y});}
      }
    }
    for(const point of Object.values(HEARTH_LOBBY_POINTS))expect(seen.has(`${point.tileX},${point.tileY}`),JSON.stringify(point)).toBe(true);
  });
  it('projects north wall collision onto its visible rows instead of two rows into the floor',()=>{
    const c=hearthLobbyCollision(),unit=TILE_SIZE_FIXED;
    expect(c.terrainPlaneBlocked![0*24+12]).toBe(1);
    expect(c.terrainPlaneBlocked![1*24+12]).toBe(1);
    expect(c.terrainPlaneBlocked![2*24+12]).toBe(0);
    expect(c.terrainPlaneBlocked![3*24+12]).toBe(0);
    // At row2 the physical feet still overlap the wall. One row south is clear.
    expect(positionCollides({x:12.5*unit,y:2.5*unit},c)).toBe(true);
    expect(positionCollides({x:12.5*unit,y:3.5*unit},c)).toBe(false);
  });
  it('has an enclosed 24-square boundary with no random hazards',()=>{
    const a=generateHearthLobbyLayout(),b=generateHearthLobbyLayout();expect(a).toEqual(b);
    expect(a.width).toBe(24);expect(a.height).toBe(24);
    for(let i=0;i<24;i++)for(const index of [i,23*24+i,i*24,i*24+23])expect(a.blocked[index]).toBe(true);
  });
  it('keeps stable runtime layout when space and object definitions are arbitrarily renamed',()=>{
    const rows=bootstrapContentRows();
    const lobbyRow=rows.find(row=>row.id==='space:delve_lobby')!;
    const torchRow=rows.find(row=>row.id==='object:standing_torch')!;
    const lobby=JSON.parse(String(lobbyRow.json)) as {id:string;hearthLobby:{torches:string[][]}};
    const torch=JSON.parse(String(torchRow.json)) as {id:string};
    lobby.id='space:moon_hall';
    torch.id='object:moon_flame';
    for(const entry of lobby.hearthLobby.torches)entry[1]=torch.id;
    const built=buildContentRegistry(rows.filter(row=>row.id!==lobbyRow.id&&row.id!==torchRow.id).concat([
      {id:lobby.id,kind:'space',slug:'moon_hall',json:lobby},
      {id:torch.id,kind:'object',slug:'moon_flame',json:torch},
    ]));
    expect(built.report.errors).toEqual([]);
    const resolved=activeHearthLobbyDefinition(built.registry);
    expect(resolved).toMatchObject({definitionId:'space:moon_hall',spaceId:65532,
      practiceTarget:{id:4_294_966_903n}});
    expect(resolved?.torches).toHaveLength(6);
    expect(resolved?.torches.every(torch=>torch.definitionId==='object:moon_flame'
      &&torch.kind==='standing_torch')).toBe(true);
    expect(hearthLobbyCollision(built.registry,65532)?.obstacles).toHaveLength(8);
  });
  it('fails neutral for missing or retired authored edges',()=>{
    const base=bootstrapContentRegistry();
    const objects=new Map(base.objects);objects.delete('object:standing_torch');
    const missing={...base,objects};
    expect(runtimeHearthLobbyDefinition(missing,65532)).toBeNull();
    expect(generateHearthLobbyLayout(missing,65532)).toBeNull();
    expect(hearthLobbyCollision(missing,65532)).toBeNull();
    const spaces=new Map(base.spaces),lobby=spaces.get('space:delve_lobby')!;
    spaces.set(lobby.id,{...lobby,retired:true});
    expect(activeHearthLobbyDefinition({...base,spaces})).toBeNull();
  });
});
