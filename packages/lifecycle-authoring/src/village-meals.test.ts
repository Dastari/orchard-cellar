import {it,expect} from 'vitest';
import {bootstrapContentRegistry,type Handler,type ReadOnlySnapshot} from '@orchard/sim';
import {AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS} from '../generated/item-lifecycles.js';
it('eats each learned meal through one generated callback, refuses full hunger, and applies no buffs',()=>{
  const registry=bootstrapContentRegistry();
  for(const kind of ['pantry_lunch','cellar_supper']){
    const item=registry.items.get(`item:${kind}`)!;
    const handler=AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find(row=>row.id===`item:${kind}.on_use`)!.handler as Handler;
    const snapshot:ReadOnlySnapshot={tick:1n,registry:{engineVersion:1,revision:1n,contentHash:registry.contentHash,definitions:{}},
      space:{id:'0',kind:'overworld',tags:[]},calendar:{minuteOfDay:600,season:'spring'},
      actor:{entityType:'player',id:'alice',tags:[],tile:{spaceId:'0',x:1,y:1,tags:[]},bronze:0n,
        vitals:{hunger:1000,vigour:10000},inventory:[],worldRoles:[],homesteadRoles:{},questStates:{},statistics:{},skillRanks:{}},
      selectedItem:{kind,definitionId:item.id,tags:item.tags,count:1,state:{foodRestoreCenti:item.food!.restoreCenti}},nearbyObjects:[]};
    const event={type:'secondary',actor:{entityType:'player',id:'alice'},selectedItem:{kind}} as const;
    expect(handler(event,snapshot)).toEqual({effects:[{consumeSelected:1},{restoreHunger:item.food!.restoreCenti},{statistic:{kind:'food_eaten',subject:kind}}]});
    expect(handler(event,{...snapshot,actor:{...snapshot.actor!,vitals:{...snapshot.actor!.vitals,hunger:10000}}})).toEqual({blocked:'hunger_full'});
    expect(item.onUse).toEqual([]);
  }
});
