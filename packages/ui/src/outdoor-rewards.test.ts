import {describe,it,expect,vi} from 'vitest';
import {OutdoorRewards,outdoorRewardsLayout,type OutdoorRewardEntry} from './outdoor-rewards.js';
import type {UiSkin} from './skin.js';
import type {PixelUi} from './pixel-ui.js';

const frame={x:10,y:10,width:340,height:250};
const receipt:OutdoorRewardEntry={id:'camp:1:player',title:'Ash shore',experience:24,valid:true,items:[{itemKind:'basalt',label:'Basalt',quantity:2}]};
const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function component(claim:(id:string)=>Promise<void>){return new OutdoorRewards({} as UiSkin,{} as PixelUi,claim,()=>{});}

describe('expedition reward collection',()=>{
  it.each([340,680])('keeps collection and paging targets within a %i pixel frame',width=>{
    const layout=outdoorRewardsLayout({...frame,width});
    expect(layout.previous.x+layout.previous.width).toBeLessThan(layout.collect.x);
    expect(layout.collect.x+layout.collect.width).toBeLessThan(layout.next.x);
    expect(layout.next.x+layout.next.width).toBeLessThan(frame.x+width);
    expect(layout.list.y+layout.list.height).toBeLessThan(layout.collect.y-15);
    expect(layout.collect.height).toBeGreaterThanOrEqual(28);
  });
  it('prevents duplicate requests and allows retry after full inventory without removing the receipt',async()=>{
    const claim=vi.fn<(id:string)=>Promise<void>>().mockRejectedValueOnce(new Error('reward_inventory_full')).mockResolvedValue(undefined);
    const ui=component(claim);ui.update([receipt]);
    ui.handleKeyDown('Enter',frame);ui.handleKeyDown('Enter',frame);await settle();
    expect(claim).toHaveBeenCalledTimes(1);
    ui.handleKeyDown('Enter',frame);await settle();expect(claim).toHaveBeenCalledTimes(2);
    ui.update([receipt]);ui.handleKeyDown('Enter',frame);await settle();expect(claim).toHaveBeenCalledTimes(2);
  });
  it('ignores a late response for an authoritative receipt that has already disappeared',async()=>{
    let reject!:(reason:Error)=>void;
    const claim=vi.fn<(id:string)=>Promise<void>>().mockImplementationOnce(()=>new Promise<void>((_,fail)=>{reject=fail;})).mockResolvedValue(undefined);
    const ui=component(claim);ui.update([receipt]);ui.handleKeyDown('Enter',frame);await settle();
    const next={...receipt,id:'next'};ui.update([next]);ui.handleKeyDown('Enter',frame);await settle();
    reject(new Error('reward_inventory_full'));await settle();
    ui.handleKeyDown('Enter',frame);await settle();expect(claim.mock.calls).toEqual([[receipt.id],['next']]);
  });
  it('blocks collection inside the Delve and of malformed receipts',async()=>{
    const claim=vi.fn().mockResolvedValue(undefined),ui=component(claim);
    ui.update([receipt],true);ui.handleKeyDown('Enter',frame);
    ui.update([{...receipt,valid:false}]);ui.handleKeyDown('Enter',frame);await settle();
    expect(claim).not.toHaveBeenCalled();
  });
  it('handles synchronous connection failures and allows retry',async()=>{
    const claim=vi.fn().mockImplementationOnce(()=>{throw new Error('disconnected');}).mockResolvedValue(undefined),ui=component(claim);
    ui.update([receipt]);ui.handleKeyDown('Enter',frame);await settle();ui.handleKeyDown('Enter',frame);await settle();
    expect(claim).toHaveBeenCalledTimes(2);
  });
});
