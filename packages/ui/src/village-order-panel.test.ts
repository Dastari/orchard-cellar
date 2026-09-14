import {it,expect,vi} from 'vitest';
import {bootstrapContentRegistry,villageOrderQuote} from '@orchard/sim';
import {NpcInteractionUi} from './npc-interaction-ui.js';
import {villageOrderLayout} from './village-order-panel.js';
import type {UiSkin} from './skin.js';
import type {PixelUi} from './pixel-ui.js';
function fixture(){
  const registry=bootstrapContentRegistry(),quote=villageOrderQuote(registry,'market_carrots',0)!;
  const offer={...quote,npcId:BigInt(registry.npcs.get(quote.npc)!.runtimeId),revision:0n,contentHash:registry.contentHash};
  const send=vi.fn(async()=>{}),choose=vi.fn();
  const ui=new NpcInteractionUi({} as UiSkin,{} as PixelUi,{} as never,{chooseDialogueOption:choose,closeDialogue:vi.fn(),buy:vi.fn(),sell:vi.fn(),fulfillVillageOrder:send});
  const model={width:320,height:180,npcId:offer.npcId,dialogueId:'willow_storekeeper',nodeId:'greeting',balanceBronze:0n,inventory:[],contentRegistry:registry,villageOrders:[offer],orderSessionKey:'a'};
  ui.update(model);return {ui,model,send,choose,offer};
}
it('opens orders from dialogue, requires a separate review and guards pending delivery across close/reopen',async()=>{
  const f=fixture();f.ui.handleKeyDown('Digit1',false);expect(f.choose).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();
  f.ui.handleKeyDown('Digit1',false);expect(f.ui.orderFlow.review?.id).toBe(f.offer.id);expect(f.send).not.toHaveBeenCalled();
  f.ui.handleKeyDown('Enter',false);await Promise.resolve();expect(f.send).toHaveBeenCalledOnce();
  f.ui.handleKeyDown('Escape',false);f.ui.handleKeyDown('Digit1',false);f.ui.handleKeyDown('Enter',false);expect(f.send).toHaveBeenCalledOnce();
  f.ui.update({...f.model,villageOrders:[{...f.offer,revision:1n}]});expect(f.ui.orderFlow.review).toBeNull();
});
it('places compact list/review controls within the frame and uses separate pointer targets',()=>{
  const f=fixture(),layout=villageOrderLayout(320,180);f.ui.handleKeyDown('Digit1',false);
  const row=layout.rows[0]!;f.ui.pointerDown({x:row.x+4,y:row.y+4},0);expect(f.ui.orderFlow.review).not.toBeNull();expect(f.send).not.toHaveBeenCalled();
  expect(layout.rows[2]!.y+layout.rows[2]!.height).toBeLessThan(layout.back.y);
  for(const rect of [...layout.rows,layout.close,layout.back,layout.deliver]){
    expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(320);expect(rect.y+rect.height).toBeLessThanOrEqual(180);
  }
  f.ui.pointerDown({x:layout.deliver.x+4,y:layout.deliver.y+4},0);expect(f.send).toHaveBeenCalledOnce();
});
