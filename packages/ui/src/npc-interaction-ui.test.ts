import { scrollUiElement } from './kit/layout/scroll.js';
import type { UiElement } from './kit/runtime/element.js';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, buildContentRegistry, bootstrapContentRows, dialogueDefinition, dialogueNode } from '@orchard/sim';
import type { PixelUi } from './pixel-ui.js';
import type { UiSkin } from './skin.js';
import {
  NpcInteractionUi,
  dialogueChoiceIsAvailable,
  dialogueChoiceRewardTooltip,
  npcInteractionLayout,
  npcInteractionFrame,
} from './npc-interaction-ui.js';

function press(ui:NpcInteractionUi,label:string,index=0,modifiers:{shift?:boolean;control?:boolean}={}):void {
 ui.kitRoot.arrange();const walk=(node:UiElement):UiElement[]=>[node,...node.children.flatMap(walk)];const node=walk(ui.kitRoot.tree).filter(node=>node.kind==='button'&&(node.id===label||node.label.startsWith(label)||node.props['label']===label))[index];
 expect(node,`control ${label}/${index}`).toBeDefined();if(node!.disabled)return;for(let parent=node!.parent;parent;parent=parent.parent){scrollUiElement(parent,parent.scroll.x+node!.rect.x-parent.contentRect.x,parent.scroll.y+node!.rect.y-parent.contentRect.y);ui.kitRoot.arrange();}ui.kitRoot.focus.set(node!,'keyboard');ui.kitRoot.key({key:'Enter',shiftKey:modifiers.shift,ctrlKey:modifiers.control});ui.kitRoot.arrange();
}
describe('NPC interaction layout', () => {
  it('keeps the shop frame inside a compact 320x240 game UI', () => {
    const layout = npcInteractionLayout(320, 240, true);
    expect(layout.frame.x).toBeGreaterThanOrEqual(0);
    expect(layout.frame.y).toBeGreaterThanOrEqual(0);
    expect(layout.frame.x + layout.frame.width).toBeLessThanOrEqual(320);
    expect(layout.frame.y + layout.frame.height).toBeLessThanOrEqual(240);
    expect(layout.buyTab.y).toBeLessThan(layout.list.y);
    expect(layout.action.y).toBeGreaterThan(layout.list.y);
    expect(layout.action.y).toBeGreaterThan(layout.list.y + layout.list.height);
    expect(layout.list.x - layout.frame.x).toBeGreaterThanOrEqual(28);
    expect(layout.frame.x + layout.frame.width - (layout.scroll.x + layout.scroll.width)).toBeGreaterThanOrEqual(28);
    expect(layout.buyTab.y - layout.frame.y).toBe(34);
    expect(layout.filter.x).toBeGreaterThanOrEqual(layout.sellTab.x + layout.sellTab.width);
    expect(layout.filter.x + layout.filter.width).toBeLessThan(layout.currency.x);
    expect(layout.currency.y - layout.frame.y).toBe(33);
    expect(layout.action.y).toBe(layout.back.y);
    expect(layout.frame.y + layout.frame.height - (layout.action.y + layout.action.height)).toBe(15);
    expect(layout.frame.x + layout.frame.width - (layout.close.x + layout.close.width)).toBe(12);
  });

  it('centres a smaller reusable dialogue frame', () => {
    const layout = npcInteractionLayout(480, 270, false);
    expect(layout.frame.x + layout.frame.width / 2).toBe(240);
    expect(layout.frame.y + layout.frame.height / 2).toBe(135);
    expect(layout.dialoguePortrait.x - layout.frame.x).toBe(34);
    expect(layout.dialoguePortrait).toMatchObject({ width: 40, height: 46 });
    expect(layout.dialogueBody.x - (layout.dialoguePortrait.x + layout.dialoguePortrait.width)).toBe(12);
    expect(layout.frame.x + layout.frame.width - (layout.dialogueBody.x + layout.dialogueBody.width)).toBe(34);
  });

  it('uses a renamed live dialogue and its exact authored merchant frame', () => {
    const source = bootstrapContentRegistry();
    const merchantFrame = source.frames.get('frame:shop')!;
    const registry = buildContentRegistry([...bootstrapContentRows(),
      { id: 'frame:moon_market', kind: 'frame', json: { ...merchantFrame, id: 'frame:moon_market' } },
      { id: 'dialogue:moon_merchant', kind: 'dialogue', json: {
        id: 'dialogue:moon_merchant', kind: 'dialogue', schemaVersion: 1, initialNodeId: 'moon_shop',
        shop: 'shop:general_tools', nodes: [{ id: 'moon_shop', speaker: 'Moon Merchant', body: 'Welcome to the moon market.',
          mode: 'shop', frameId: 'frame:moon_market', choices: [] }],
      } },
    ]).registry;
    const model = { width: 480, height: 270, npcId: 100n, dialogueId: 'moon_merchant', nodeId: 'moon_shop',
      balanceBronze: 0n, inventory: [], contentRegistry: registry };
    expect(npcInteractionFrame(model)?.id).toBe('frame:moon_market');
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update(model);
    expect(ui.shopOpen).toBe(true);
    expect(npcInteractionFrame({ ...model, nodeId: 'missing' })).toBeNull();
  });

  it('selects dialogue choices with number keys', () => {
    const chooseDialogueOption = vi.fn();
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption,
      closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined),
      sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'greeting',
      balanceBronze: 10_000n, inventory: [],
      quests: [{ questId: 'marlow_important_book', state: 'turned_in' }],
    });
    expect(ui.handleKeyDown('Digit1', false)).toBe(true);
    expect(chooseDialogueOption).toHaveBeenCalledWith('offer');
  });

  it('filters authority-owned quest choices and scrolls overflowing dialogue rows', () => {
    const definition = dialogueDefinition('tool_merchant');
    const greeting = definition === null ? null : dialogueNode(definition, 'greeting');
    const offer = greeting?.choices.find((choice) => choice.id === 'quest_offer');
    const completion = greeting?.choices.find((choice) => choice.id === 'quest_complete');
    if (offer === undefined || completion === undefined) throw new Error('missing quest fixtures');
    expect(dialogueChoiceIsAvailable(offer, [])).toBe(true);
    expect(dialogueChoiceIsAvailable(offer, [{ questId: 'marlow_important_book', state: 'active' }])).toBe(false);
    expect(dialogueChoiceIsAvailable(completion, [{ questId: 'marlow_important_book', state: 'complete' }])).toBe(true);
    expect(dialogueChoiceRewardTooltip(completion)).toBe(
      'REWARDS: 1 GOLD / 100 EXPLORER XP / MARLOW\'S BOOK ×1',
    );
    expect(dialogueChoiceRewardTooltip(offer)).toBeNull();

    const chooseDialogueOption = vi.fn();
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption,
      closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined),
      sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 320, height: 160, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'greeting',
      balanceBronze: 0n, inventory: [], quests: [],
    });
    expect(ui.handleKeyDown('ArrowDown', false)).toBe(true);
    expect(ui.handleKeyDown('Digit2', false)).toBe(true);
    expect(chooseDialogueOption).toHaveBeenCalledWith('offer');
  });

  it('shows turn-in rewards on hover without writing them into the choice button', () => {
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'greeting',
      balanceBronze: 0n, inventory: [],
      quests: [{ questId: 'marlow_important_book', state: 'complete' }],
    });
    const node=ui.kitRoot.entries().find(entry=>entry.element.id==='dialogue:quest_complete')!.element;
    ui.pointerMove({x:node.clip.x+2,y:node.clip.y+2});
    expect(ui.tooltipText).toBe('REWARDS: 1 GOLD / 100 EXPLORER XP / MARLOW\'S BOOK ×1');
  });

  it('starts every row at zero and submits multiple item kinds as one cart', async () => {
    const buy = vi.fn().mockResolvedValue(undefined);
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(),
      closeDialogue: vi.fn(),
      buy,
      sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 100_000n, inventory: [],
    });
    expect(ui.shopState.lines).toEqual([]);
    press(ui,'merchant.commit');
    expect(buy).not.toHaveBeenCalled();
    press(ui,'Increase ');
    press(ui,'Increase ',1);
    expect(ui.shopState).toMatchObject({
      totalBronze: 50_450n,
      affordable: true,
      canCommit: true,
      lines: [
        { itemKind: 'homestead_deed', quantity: 1 },
        { itemKind: 'axe', quantity: 1 },
      ],
    });
    press(ui,'merchant.commit');
    expect(buy).toHaveBeenCalledWith([
      { itemKind: 'homestead_deed', quantity: 1 },
      { itemKind: 'axe', quantity: 1 },
    ]);
    expect(ui.shopState.pending).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(ui.shopState.lines).toEqual([]);
  });

  it('swipe-scrolls Marlow\'s shop rows on touch screens', () => {
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 320, height: 160, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 100_000n, inventory: [], touchControls: true,
    });
    const list=ui.kitRoot.entries().find(entry=>entry.element.kind==='scroll-area'&&entry.element.scroll.maxY>0)!.element;
    const start={x:list.clip.x+5,y:list.clip.y+list.clip.height-5};
    ui.pointerDown(start, 0, { pointerType: 'touch' });
    ui.pointerMove({ x: start.x, y: start.y - 60 });
    expect(ui.pointerUp()).toBe(true);
    expect(list.scroll.y).toBeGreaterThan(0);
  });

  it('disables an unaffordable buy cart without sending it', () => {
    const buy = vi.fn().mockResolvedValue(undefined);
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(), buy,
      sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 10_000n, inventory: [],
    });
    press(ui,'Increase ');
    expect(ui.shopState).toMatchObject({ totalBronze: 50_000n, affordable: false, canCommit: false });
    press(ui,'merchant.commit');
    expect(buy).not.toHaveBeenCalled();
  });

  it('retains a cart when the authoritative transaction rejects it', async () => {
    const buy = vi.fn().mockRejectedValue(new Error('inventory_full'));
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(), buy,
      sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 100_000n, inventory: [],
    });
    press(ui,'Increase ');
    press(ui,'merchant.commit');
    await vi.waitFor(() => expect(ui.shopState.pending).toBe(false));
    expect(ui.shopState.lines).toEqual([{ itemKind: 'homestead_deed', quantity: 1 }]);
  });

  it('caps a sell cart at current inventory ownership and reclamps stale UI state', async () => {
    const sell = vi.fn().mockResolvedValue(undefined);
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(), sell,
      buy: vi.fn().mockResolvedValue(undefined),
    });
    const model = {
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 10_000n, inventory: [{ slot: 10, itemKind: 'wood', quantity: 3 }],
    } as const;
    ui.update(model);
    ui.handleKeyDown('Digit2',false);
    for (let count = 0; count < 4; count += 1) press(ui,'Increase ',0,{});
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 3 }]);
    ui.update({ ...model, inventory: [{ slot: 10, itemKind: 'wood', quantity: 1 }] });
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 1 }]);
    expect(ui.shopState.totalBronze).toBe(2n);
    press(ui,'merchant.commit');
    expect(sell).toHaveBeenCalledWith([{ itemKind: 'wood', quantity: 1 }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(ui.shopState.lines).toEqual([]);
  });

  it('keeps unique quest artifacts out of the merchant sell list', () => {
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 0n,
      inventory: [
        { slot: 0, itemKind: 'marlow_book', quantity: 1 },
        { slot: 1, itemKind: 'wood', quantity: 1 },
      ],
    });
    ui.handleKeyDown('Digit2',false);
    ui.setFilterText('book');
    expect(ui.kitRoot.entries().some(entry=>entry.element.label.startsWith('Increase '))).toBe(false);
    expect(ui.shopState.lines).toEqual([]);
    ui.setFilterText('wood');
    press(ui,'Increase ');
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 1 }]);
  });

  it('includes the final dynamically-offset backpack slot in the sell inventory', () => {
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 0n, contentRegistry: bootstrapContentRegistry(),
      inventory: [
        // Backpack capacity is granted by the real back equipment slot (34),
        // not by merely carrying the item in the hotbar.
        { slot: 34, itemKind: 'backpack', quantity: 1 },
        { slot: 29, itemKind: 'stone', quantity: 2 },
      ],
    });
    ui.handleKeyDown('Digit2',false);
    ui.setFilterText('stone');
    press(ui,'Increase ');
    expect(ui.shopState.lines).toEqual([{ itemKind: 'stone', quantity: 1 }]);
  });

  it('uses the effective unlocked backpack capacity and excludes equipment and crafting custody', async () => {
    const sell = vi.fn().mockResolvedValue(undefined);
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined), sell,
    });
    const model = {
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 0n, contentRegistry: bootstrapContentRegistry(), backpackSlotCapacity: 20,
      inventory: [
        { slot: 29, itemKind: 'stone', quantity: 2 },
        { slot: 30, itemKind: 'stone', quantity: 4 },
        { slot: 39, itemKind: 'stone', quantity: 8 },
      ],
    };
    ui.update(model);
    ui.handleKeyDown('Digit2',false);
    press(ui,'Increase ',0,{ control: true });
    expect(ui.shopState.lines).toEqual([{ itemKind: 'stone', quantity: 2 }]);
    press(ui,'merchant.commit');
    expect(sell).toHaveBeenCalledWith([{ itemKind: 'stone', quantity: 2 }]);
    await vi.waitFor(() => expect(ui.shopState.pending).toBe(false));
    ui.update({ ...model, backpackSlotCapacity: 8 });
    expect(ui.kitRoot.entries().some(entry=>entry.element.label.startsWith('Increase '))).toBe(false);
    expect(ui.shopState.lines).toEqual([]);
  });

  it('honours a live registry quest-custody tag when showing sellable inventory', () => {
    const rows = bootstrapContentRows().map((row) => {
      if (row.id !== 'item:stone') return row;
      const item = bootstrapContentRegistry().items.get('item:stone')!;
      return { ...row, json: { ...item, tags: [...item.tags, 'item.quest_unique'] } };
    });
    const registry = buildContentRegistry(rows).registry;
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 0n, contentRegistry: registry,
      inventory: [{ slot: 0, itemKind: 'stone', quantity: 2 }],
    });
    ui.handleKeyDown('Digit2',false);
    expect(ui.kitRoot.entries().some(entry=>entry.element.label.startsWith('Increase '))).toBe(false);
    expect(ui.shopState.lines).toEqual([]);
  });

  it('uses shared Shift and Control quantity-stepper modifiers', () => {
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 10_000n, inventory: [{ slot: 10, itemKind: 'wood', quantity: 25 }],
    });
    ui.handleKeyDown('Digit2',false);

    press(ui,'Increase ',0,{ shift: true });
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 10 }]);
    press(ui,'Increase ',0,{ control: true });
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 25 }]);
    press(ui,'Decrease ',0,{ shift: true });
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 15 }]);
    press(ui,'Decrease ',0,{ control: true });
    expect(ui.shopState.lines).toEqual([]);
  });

  it('filters both tabs without discarding cart lines hidden by the filter', () => {
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 100_000n,
      inventory: [
        { slot: 10, itemKind: 'wood', quantity: 3 },
        { slot: 11, itemKind: 'stone', quantity: 2 },
      ],
    });
    ui.setFilterText('anvil');
    expect(ui.filterValue).toBe('anvil');
    press(ui,'Increase ',0,{});
    expect(ui.shopState.lines).toEqual([{ itemKind: 'anvil', quantity: 1 }]);
    ui.setFilterText('no matches');
    expect(ui.shopState.lines).toEqual([{ itemKind: 'anvil', quantity: 1 }]);

    ui.handleKeyDown('Digit2',false);
    ui.setFilterText('stone');
    press(ui,'Increase ',0,{});
    expect(ui.shopState.lines).toEqual([{ itemKind: 'stone', quantity: 1 }]);
  });
  it('ignores a completed purchase from a closed interaction when a new cart is pending',async()=>{
    let finishOld!:()=>void,finishNew!:()=>void;
    const buy=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{finishOld=resolve;})).mockImplementationOnce(()=>new Promise<void>(resolve=>{finishNew=resolve;}));
    const ui=new NpcInteractionUi({}as UiSkin,{}as PixelUi,{}as never,{chooseDialogueOption:vi.fn(),closeDialogue:vi.fn(),buy,sell:vi.fn()});
    const model={width:640,height:400,npcId:2n,dialogueId:'tool_merchant',nodeId:'shop',balanceBronze:100000n,inventory:[]};ui.update(model);ui.setFilterText('arrow');press(ui,'Increase ');press(ui,'merchant.commit');expect(ui.shopState.pending).toBe(true);
    ui.update(null);ui.update(model);ui.setFilterText('arrow');press(ui,'Increase ',0,{shift:true});press(ui,'merchant.commit');expect(ui.shopState.lines).toEqual([{itemKind:'arrow',quantity:10}]);
    finishOld();await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(ui.shopState.pending).toBe(true);expect(ui.shopState.lines).toEqual([{itemKind:'arrow',quantity:10}]);finishNew();await vi.waitFor(()=>expect(ui.shopState.pending).toBe(false));expect(ui.shopState.lines).toEqual([]);
  });

});
