import {describe,it,expect} from 'vitest';
import {AUTHORITY_HZ,bootstrapContentRegistry,FIXED_UNITS_PER_PIXEL as P} from '@orchard/sim';
import {facedHearthSeat,hearthSeatedFrame,seatedFurnitureForPlayer} from './hearth-seating.js';
const registry=bootstrapContentRegistry();
const row={id:1n,kind:'furniture_townhouse_loveseat',definitionId:'object:furniture_townhouse_loveseat',tileX:7,tileY:7,spaceId:2,stateJson:'{}'};
const player={actionKind:'sitting',spaceId:2,x:128*P,y:134*P};
describe('authoritative seated presentation',()=>{
  it('matches the even-width seat anchor, never predicted nearby positions',()=>{
    expect(seatedFurnitureForPlayer(player,[row],registry)?.row.id).toBe(1n);
    expect(seatedFurnitureForPlayer({...player,x:player.x+1},[row],registry)).toBeNull();
    expect(seatedFurnitureForPlayer({...player,actionKind:'none'},[row],registry)).toBeNull();
    expect(seatedFurnitureForPlayer({...player,spaceId:3},[row],registry)).toBeNull();
  });
  it('does not render through missing, carried, malformed or redefined parents',()=>{
    expect(seatedFurnitureForPlayer(player,[],registry)).toBeNull();
    for(const changed of [{...row,carriedBy:'other'},{...row,stateJson:'{'},{...row,definitionId:'object:missing'}])
      expect(seatedFurnitureForPlayer(player,[changed],registry)).toBeNull();
  });
  it('targets both seat columns even when a floor rug precedes the seat',()=>{
    const rug={...row,id:2n,kind:'furniture_rustic_woven_rug',definitionId:'object:furniture_rustic_woven_rug'};
    for(const tileX of [7,8])expect(facedHearthSeat([rug,row],registry,2,{tileX,tileY:7})?.id).toBe(1n);
    expect(facedHearthSeat([rug,row],registry,3,{tileX:7,tileY:7})).toBeNull();
    expect(facedHearthSeat([rug,row],registry,2,{tileX:6,tileY:7})).toBeNull();
  });
  it('uses the reviewed two-frame two-fps cadence and respects reduced motion',()=>{
    expect(hearthSeatedFrame(100,100n)).toBe(0);
    expect(hearthSeatedFrame(100+AUTHORITY_HZ/2,100n)).toBe(1);
    expect(hearthSeatedFrame(100+AUTHORITY_HZ,100n)).toBe(0);
    expect(hearthSeatedFrame(90,100n)).toBe(0);
    expect(hearthSeatedFrame(100+AUTHORITY_HZ/2,100n,true)).toBe(0);
  });
});
