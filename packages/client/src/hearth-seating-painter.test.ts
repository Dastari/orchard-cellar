import {describe,it,expect,vi} from 'vitest';
import {bootstrapContentRegistry,FIXED_UNITS_PER_PIXEL as P} from '@orchard/sim';
import {enqueueGameplayPlayers} from './gameplay-painter-players.js';
import {enqueueGameplayPlaceables} from './gameplay-painter-placeables.js';
import {drawHearthSeatedGroup} from '@orchard/engine/hearth-seating-scene';
import type {WorldDepthItem} from '@orchard/engine/renderer';
vi.mock('@orchard/engine/hearth-seating-scene',()=>({drawHearthSeatedGroup:vi.fn(()=>true)}));
describe('seating in actual gameplay painter producers',()=>{
  it.each([true,false])('keeps local=%s seated actor, label and parent visible despite displaced prediction/interpolation',local=>{
    const identity={toHexString:()=>'abc'},player={identity,spaceId:2,x:128*P,y:134*P,facing:'down',actionKind:'sitting',actionStartedTick:0n,equippedKind:'empty'};
    const seat={id:1n,spaceId:2,tileX:7,tileY:7,kind:'furniture_townhouse_loveseat',definitionId:'object:furniture_townhouse_loveseat',stateJson:'{}'};
    const projection=vi.fn((_x:number,y:number)=>y===128?4:99);
    const queue:WorldDepthItem[]=[],labels:{x:number;y:number}[]=[],anchors=new Map();
    const drift={x:9000*P,y:9000*P,facing:'down'};
    const input={
      snapshot:{identityHex:local?'abc':'other',players:[player],placeables:[seat],npcs:[],profiles:new Map([['abc',{online:true}]]),
        playerJumps:new Map(),appearances:new Map(),content:{registry:bootstrapContentRegistry()},chests:[],combatTargets:[],surfaces:[],hives:[],questWorldItems:[]},
      art:{itemIcons:{furniture_townhouse_loveseat:{}},playerRig:{base:{action:{metadata:{animations:{sitting_down:[{}]}}}}}},
      remoteDisplay:new Map([['abc',drift]]),previousRemoteDisplay:new Map([['abc',drift]]),alpha:1,
      renderedLocal:drift,predicted:{position:drift,facing:'down'},previousPredicted:{position:drift},renderedPlayerAnchors:anchors,
      renderTickClock:{renderTick:10},projectionAt:projection,equippedLightRow:()=>null,selectedItem:()=> 'empty',liveItemContentDefinition:()=>undefined,
      lightPreviewKind:null,dynamicLighting:false,visible:{left:0,top:0,right:256,bottom:256},targetableEntities:[],
      liveEquippedItemFacing:()=> 'down',cursorFacing:()=> 'down',nameplates:labels,profileName:()=> 'Visitor',
      enqueueWorldDepth:(_x:number,_y:number,item:WorldDepthItem)=>queue.push(item),context:{},cameraX:0,cameraY:0,scale:1,
      reducedMotionPreference:{matches:false},frameLightingModel:'unified',animatedOpenChestId:null,closingChestId:null,chestAnimationStartedAtMs:0,
    };
    enqueueGameplayPlaceables(input as unknown as Parameters<typeof enqueueGameplayPlaceables>[0]);
    expect(queue).toHaveLength(0);
    enqueueGameplayPlayers(input as unknown as Parameters<typeof enqueueGameplayPlayers>[0]);
    expect(queue).toHaveLength(1);expect(queue[0]).toMatchObject({tie:'placeable:1',footY:128});
    expect(projection).toHaveBeenCalledWith(128,128);
    expect(labels[0]).toMatchObject({x:128,y:136});expect(anchors.get('abc')).toEqual({x:128,y:136});
    vi.mocked(drawHearthSeatedGroup).mockClear();queue[0]!.draw();expect(drawHearthSeatedGroup).toHaveBeenCalledTimes(1);
  });
});
