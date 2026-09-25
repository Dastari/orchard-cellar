import {describe,it,expect} from 'vitest';
import {hearthFerryDestinations,hearthFerryLanding,isHearthFerryDock,runtimeHearthFerryNetwork} from './hearth-travel.js';
import {bootstrapContentRegistry,bootstrapContentRows} from './content/bootstrap-registry.js';
import {buildContentRegistry} from './content/registry.js';
import type {SpaceContentDefinition} from './content/world-definition.js';
import {FIXED_UNITS_PER_PIXEL,TILE_SIZE_FIXED} from './state.js';
import {positionCollides} from './movement.js';
const registry=bootstrapContentRegistry(),network=runtimeHearthFerryNetwork(registry)!;
const dock=(id:string)=>network.byId.get(id)!;
describe('Hearth ferry routes',()=>{
  it('offers explicit destinations with a homeward option from both new islands',()=>{
    expect(hearthFerryDestinations(network,'orchard').map(({id})=>id)).toEqual(['willowharbour','cinderwake']);
    expect(hearthFerryDestinations(network,'willowharbour').map(({id})=>id)).toContain('orchard');
    expect(hearthFerryDestinations(network,'cinderwake').map(({id})=>id)).toContain('orchard');
    expect(isHearthFerryDock(network,'__proto__')).toBe(false);
  });
  it('selects the authored arrival or a bounded safe tile on its plane',()=>{
    const width=832,blocked=new Uint8Array(width*width),elevations=new Int16Array(width*width);
    const collision={width,height:width,blocked,elevations};
    const cinderwake=dock('cinderwake'),arrival=cinderwake.arrival;
    expect(hearthFerryLanding(cinderwake,collision,()=>true)).toEqual(arrival);
    blocked[arrival.tileY*width+arrival.tileX] = 1;
    const landing=hearthFerryLanding(cinderwake,collision,()=>true);
    expect(landing).not.toBeNull();expect(landing).not.toEqual(arrival);
    expect(Math.abs(landing!.tileX-arrival.tileX)).toBeLessThanOrEqual(2);
    elevations[arrival.tileY*width+arrival.tileX+2]=1;
    expect(hearthFerryLanding(cinderwake,collision,(x,y)=>x===arrival.tileX+2&&y===arrival.tileY)).toBeNull();
    expect(hearthFerryLanding(cinderwake,collision,()=>false)).toBeNull();
  });
  it('rejects thin offset obstacles between clear bodies on the only dock route',()=>{
    const width=832,blocked=new Uint8Array(width*width);
    const unit=TILE_SIZE_FIXED,pixel=FIXED_UNITS_PER_PIXEL,y=400.5*unit;
    // Cut the only allowed route beyond all radius-two arrival candidates.
    const obstacle={left:207*unit-pixel,right:207*unit+pixel,top:y-11*pixel,bottom:y-7*pixel};
    const collision={width,height:width,blocked,obstacles:[obstacle]};
    expect(positionCollides({x:206.5*unit,y},collision)).toBe(false);
    expect(positionCollides({x:207.5*unit,y},collision)).toBe(false);
    expect(positionCollides({x:207*unit,y},collision)).toBe(true);
    const safe=(x:number,tileY:number)=>tileY===400&&x>=204&&x<=209;
    expect(hearthFerryLanding(dock('willowharbour'),{...collision,obstacles:[]},safe)).toEqual(dock('willowharbour').arrival);
    expect(hearthFerryLanding(dock('willowharbour'),collision,safe)).toBeNull();
  });
  it('rejects an isolated free pocket even if it is close to the arrival',()=>{
    const width=832,blocked=new Uint8Array(width*width).fill(1),collision={width,height:width,blocked};
    const {arrival,threshold}=dock('willowharbour');
    // Each pocket is large enough for a body, but no route joins them.
    for(const center of [arrival,threshold])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
      blocked[(center.tileY+dy)*width+center.tileX+dx] = 0;
    expect(hearthFerryLanding(dock('willowharbour'),collision,()=>true)).toBeNull();
  });
  it('resolves renamed space and destination ids and fails closed without one active owner',()=>{
    const provider=[...registry.spaces.values()].find(({ferry})=>ferry!==undefined)!;
    const renamed:SpaceContentDefinition={...provider,id:'space:renamed_ferry_network',ferry:provider.ferry!.map(([
      ,name,thresholdX,thresholdY,arrivalX,arrivalY,availabilityRegion,flags,
    ],index)=>[`route_${index}`,name,thresholdX,thresholdY,arrivalX,arrivalY,availabilityRegion,flags] as const)};
    const renamedSpaces=new Map(registry.spaces);renamedSpaces.delete(provider.id);renamedSpaces.set(renamed.id,renamed);
    const renamedNetwork=runtimeHearthFerryNetwork({spaces:renamedSpaces})!;
    expect(renamedNetwork.destinations.map(({id,name,threshold,arrival})=>({id,name,threshold,arrival}))).toEqual([
      {id:'route_0',name:'Orchard Island',threshold:{tileX:408,tileY:317},arrival:{tileX:407,tileY:317}},
      {id:'route_1',name:'Willowharbour',threshold:{tileX:209,tileY:400},arrival:{tileX:204,tileY:400}},
      {id:'route_2',name:'Cinderwake',threshold:{tileX:644,tileY:207},arrival:{tileX:652,tileY:211}},
    ]);
    const missing=new Map(registry.spaces);missing.delete(provider.id);
    expect(runtimeHearthFerryNetwork({spaces:missing})).toBeNull();
    const retired=new Map(registry.spaces);retired.set(provider.id,{...provider,retired:true});
    expect(runtimeHearthFerryNetwork({spaces:retired})).toBeNull();
    const ambiguous=new Map(registry.spaces);ambiguous.set('space:second_ferry_network',{
      ...provider,id:'space:second_ferry_network',spaceId:60000,
    });
    expect(runtimeHearthFerryNetwork({spaces:ambiguous})).toBeNull();
    expect(buildContentRegistry([...bootstrapContentRows(),{
      id:'space:second_ferry_network',kind:'space',json:{...provider,id:'space:second_ferry_network',spaceId:60000},
    }]).report.errors).toContainEqual(expect.objectContaining({
      code:'ambiguous_interaction',definitionId:'space:second_ferry_network',path:'ferry',
    }));
  });
});
