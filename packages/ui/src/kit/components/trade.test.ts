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

it('paints authored icon animations and the production missing-art fallback', async () => {
 const [{createCanvas}, {uiTestArt,uiTestAsset}, {bootstrapContentRows,buildContentRegistry}] = await Promise.all([
  import('@napi-rs/canvas'), import('../lab/testing/art.js'), import('@orchard/sim'),
 ]);
 const art=await uiTestArt(),wood=uiTestAsset('item_cf_wood','props'),missing=uiTestAsset('item_cf_stone','props');
 const frame=Object.values(wood.metadata.animations)[0]![0]!;
 const authored={...wood,metadata:{...wood.metadata,animations:{authored:[frame]}}};
 const base=bootstrapContentRegistry();
 const registry=buildContentRegistry(bootstrapContentRows().map(row=>row.id==='item:wood'
  ? {...row,json:{...base.items.get('item:wood')!,icon:{asset:'item_cf_wood',animation:'authored'}}}:row)).registry;
 const self={toHexString:()=> 'self'},peer={toHexString:()=> 'peer'};
 const model:TradeUiModel={contentRegistry:registry,identityHex:'self',requesterName:'Mara',recipientName:'Toby',walletBronze:0n,offers:[],
  inventorySlots:[{slot:0,itemKind:'wood',quantity:1},{slot:1,itemKind:'unknown',quantity:1}],
  session:{id:'trade',requester:self,recipient:peer,state:'active',requesterAccepted:false,recipientAccepted:false,requesterBronze:0n,recipientBronze:0n,revision:0n,createdTick:0n}};
 const root=new UiRoot({scale:1,art});root.resize(800,600);root.mount(uiTrade({model,artwork:{wood:authored,missing},
  callbacks:{acceptRequest:vi.fn(),declineRequest:vi.fn(),cancel:vi.fn(),offerItem:vi.fn(),removeItem:vi.fn(),offerBronze:vi.fn(),setAccepted:vi.fn()}}));
 const canvas=createCanvas(800,600),context=canvas.getContext('2d'),draw=vi.spyOn(context,'drawImage');
 try {
  root.draw(context as unknown as CanvasRenderingContext2D,0);
  expect(draw.mock.calls.filter(args=>(args[0] as unknown)===wood.image)).toHaveLength(1);
  expect(draw.mock.calls.filter(args=>(args[0] as unknown)===missing.image)).toHaveLength(1);
 } finally {root.dispose();draw.mockRestore();vi.unstubAllGlobals();}
});
