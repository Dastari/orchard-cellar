import { bootstrapContentRegistry } from '@orchard/sim';
import {expect,it,vi} from 'vitest';
import {uiTrade} from './trade.js';
import {UiRoot} from '../runtime/root.js';
import type {TradeUiModel,TradeUiCallbacks} from '../../trade-ui.js';
it('keeps trade slots tightly grouped and sends current acceptance revisions and single-item offers',()=>{
 const identity={toHexString:()=> 'self'},other={toHexString:()=> 'other'};const callbacks:TradeUiCallbacks={acceptRequest:vi.fn(),declineRequest:vi.fn(),cancel:vi.fn(),offerItem:vi.fn(),removeItem:vi.fn(),offerBronze:vi.fn(),setAccepted:vi.fn()};
 const model:TradeUiModel={contentRegistry:bootstrapContentRegistry(),identityHex:'self',requesterName:'Mara',recipientName:'Toby',walletBronze:100n,offers:[],inventorySlots:[{slot:0,itemKind:'wood',quantity:12}],session:{id:'trade',requester:identity,recipient:other,state:'active',requesterAccepted:false,recipientAccepted:false,requesterBronze:0n,recipientBronze:0n,revision:2n,createdTick:0n}};
 const root=new UiRoot({scale:1});root.resize(800,600);const frame=uiTrade({model,callbacks});root.mount(frame);root.arrange();const nodes=()=>root.entries().map(e=>e.element);const own=nodes().find(n=>n.kind==='inventory-grid'&&n.props['container']==='trade-own')!;expect(own.children[1]!.rect.x-own.children[0]!.rect.x-own.children[0]!.rect.width).toBe(2);expect(own.children[3]!.rect.y-own.children[0]!.rect.y-own.children[0]!.rect.height).toBe(2);
 const slot=nodes().find(n=>n.label==='trade-inventory/0')!;root.focus.set(slot,'keyboard');root.key({key:'ContextMenu'});expect(callbacks.offerItem).toHaveBeenCalledWith('trade',0,0,1);
 frame.updateTrade({...model,session:{...model.session,revision:9n,requesterAccepted:true}});root.arrange();const accept=nodes().find(n=>n.id==='trade.accept')!;root.focus.set(accept,'keyboard');root.key({key:'Enter'});expect(callbacks.setAccepted).toHaveBeenCalledWith('trade',false,9n);
 const gold=nodes().find(n=>n.kind==='input'&&n.label==='Gold')!;root.focus.set(gold,'keyboard');gold.hooks.onBeforeInput?.({inputType:'insertText',data:'9999999999999999'} as InputEvent,gold);root.key({key:'Enter'});expect(callbacks.offerBronze).toHaveBeenLastCalledWith('trade',100n);root.dispose();
});
