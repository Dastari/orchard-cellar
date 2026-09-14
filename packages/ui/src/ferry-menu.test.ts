import {describe,it,expect,vi} from 'vitest';
import {bootstrapContentRegistry,type SpaceContentDefinition} from '@orchard/sim';
import {FerryMenu,ferryMenuButtons} from './ferry-menu.js';
import type {UiSkin} from './skin.js';
import type {PixelUi} from './pixel-ui.js';
const frame={x:6,y:6,width:348,height:258};
const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const registry=bootstrapContentRegistry();
describe('ferry destination menu',()=>{
  it('departs only after an explicit destination and suppresses duplicate pending requests',async()=>{
    let finish!:()=>void;
    const travel=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})),arrived=vi.fn();
    const menu=new FerryMenu({} as UiSkin,{} as PixelUi,travel,arrived,()=>registry);menu.open('orchard');
    expect(travel).not.toHaveBeenCalled();expect(menu.key('Enter')).toBe(false);
    menu.key('Digit2');menu.key('Digit1');await settle();expect(travel.mock.calls).toEqual([['orchard','cinderwake']]);
    finish();await settle();expect(arrived).toHaveBeenCalledOnce();
  });
  it('offers a homeward touch target and retains the menu after a failed departure',async()=>{
    const travel=vi.fn().mockRejectedValueOnce(new Error('ferry_landing_blocked')).mockResolvedValue(undefined),arrived=vi.fn();
    const menu=new FerryMenu({} as UiSkin,{} as PixelUi,travel,arrived,()=>registry);menu.open('cinderwake');
    const button=ferryMenuButtons(frame)[0]!;
    expect(button.height).toBeGreaterThanOrEqual(32);
    menu.pointerDown({x:button.x+5,y:button.y+5},0,frame);await settle();
    expect(travel).toHaveBeenCalledWith('cinderwake','orchard');expect(arrived).not.toHaveBeenCalled();
    menu.pointerDown({x:button.x+5,y:button.y+5},0,frame);await settle();expect(arrived).toHaveBeenCalledOnce();
  });
  it('uses renamed authored destination ids and fails closed for retired live content',async()=>{
    const provider=[...registry.spaces.values()].find(({ferry})=>ferry!==undefined)!;
    const renamed:SpaceContentDefinition={...provider,id:'space:renamed_ferry_ui',ferry:provider.ferry!.map(([
      ,name,thresholdX,thresholdY,arrivalX,arrivalY,availabilityRegion,flags,
    ],index)=>[`route_${index}`,name,thresholdX,thresholdY,arrivalX,arrivalY,availabilityRegion,flags] as const)};
    const spaces=new Map(registry.spaces);spaces.delete(provider.id);spaces.set(renamed.id,renamed);
    const travel=vi.fn().mockResolvedValue(undefined),arrived=vi.fn();
    const menu=new FerryMenu({} as UiSkin,{} as PixelUi,travel,arrived,()=>({spaces}));menu.open('route_0');
    expect(menu.key('Digit2')).toBe(true);await settle();
    expect(travel).toHaveBeenCalledWith('route_0','route_2');

    const retiredSpaces=new Map(registry.spaces);retiredSpaces.set(provider.id,{...provider,retired:true});
    const unavailable=new FerryMenu({} as UiSkin,{} as PixelUi,travel,arrived,()=>({spaces:retiredSpaces}));
    unavailable.open('orchard');expect(unavailable.key('Digit1')).toBe(true);await settle();
    expect(travel).toHaveBeenCalledTimes(1);
  });
});
