import { describe, expect, it, vi } from 'vitest';
import { dialogueDefinition, dialogueNode } from '@orchard/sim';
import type { PixelUi } from '../render/pixel-ui.js';
import type { UiSkin } from './skin.js';
import {
  NpcInteractionUi,
  dialogueChoiceIsAvailable,
  dialogueChoiceRewardTooltip,
  npcInteractionLayout,
} from './npc-interaction-ui.js';

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
    const layout = npcInteractionLayout(480, 270, false);
    ui.pointerMove({ x: layout.dialogueList.x + 4, y: layout.dialogueList.y + 4 });
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
    const layout = npcInteractionLayout(480, 270, true);
    expect(ui.shopState.lines).toEqual([]);
    ui.pointerDown({ x: layout.action.x + 2, y: layout.action.y + 2 }, 0);
    expect(buy).not.toHaveBeenCalled();
    const plusX = layout.list.x + layout.list.width - 20;
    ui.pointerDown({ x: plusX, y: layout.list.y + 10 }, 0);
    ui.pointerDown({ x: plusX, y: layout.list.y + 34 + 10 }, 0);
    expect(ui.shopState).toMatchObject({
      totalBronze: 50_450n,
      affordable: true,
      canCommit: true,
      lines: [
        { itemKind: 'homestead_deed', quantity: 1 },
        { itemKind: 'axe', quantity: 1 },
      ],
    });
    ui.pointerDown({ x: layout.action.x + 2, y: layout.action.y + 2 }, 0);
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
    const layout = npcInteractionLayout(320, 160, true);
    const start = { x: layout.list.x + 20, y: layout.list.y + layout.list.height - 8 };
    ui.pointerDown(start, 0, { pointerType: 'touch' });
    ui.pointerMove({ x: start.x, y: start.y - 60 });
    expect(ui.pointerUp()).toBe(true);
    const internal = ui as unknown as { scrollBar: { position: number } };
    expect(internal.scrollBar.position).toBeGreaterThan(0);
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
    const layout = npcInteractionLayout(480, 270, true);
    ui.pointerDown({ x: layout.list.x + layout.list.width - 20, y: layout.list.y + 10 }, 0);
    expect(ui.shopState).toMatchObject({ totalBronze: 50_000n, affordable: false, canCommit: false });
    ui.pointerDown({ x: layout.action.x + 2, y: layout.action.y + 2 }, 0);
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
    const layout = npcInteractionLayout(480, 270, true);
    ui.pointerDown({ x: layout.list.x + layout.list.width - 20, y: layout.list.y + 10 }, 0);
    ui.pointerDown({ x: layout.action.x + 2, y: layout.action.y + 2 }, 0);
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
    const layout = npcInteractionLayout(480, 270, true);
    ui.pointerDown({ x: layout.sellTab.x + 2, y: layout.sellTab.y + 2 }, 0);
    const plus = { x: layout.list.x + layout.list.width - 20, y: layout.list.y + 10 };
    for (let count = 0; count < 4; count += 1) ui.pointerDown(plus, 0);
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 3 }]);
    ui.update({ ...model, inventory: [{ slot: 10, itemKind: 'wood', quantity: 1 }] });
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 1 }]);
    expect(ui.shopState.totalBronze).toBe(2n);
    ui.pointerDown({ x: layout.action.x + 2, y: layout.action.y + 2 }, 0);
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
    const layout = npcInteractionLayout(480, 270, true);
    ui.pointerDown({ x: layout.sellTab.x + 2, y: layout.sellTab.y + 2 }, 0);
    ui.setFilterText('book');
    ui.pointerDown({ x: layout.list.x + layout.list.width - 20, y: layout.list.y + 10 }, 0);
    expect(ui.shopState.lines).toEqual([]);
    ui.setFilterText('wood');
    ui.pointerDown({ x: layout.list.x + layout.list.width - 20, y: layout.list.y + 10 }, 0);
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 1 }]);
  });

  it('includes the final dynamically-offset backpack slot in the sell inventory', () => {
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(),
      buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 0n,
      inventory: [
        { slot: 0, itemKind: 'backpack', quantity: 1 },
        { slot: 29, itemKind: 'stone', quantity: 2 },
      ],
    });
    const layout = npcInteractionLayout(480, 270, true);
    ui.pointerDown({ x: layout.sellTab.x + 2, y: layout.sellTab.y + 2 }, 0);
    ui.setFilterText('stone');
    ui.pointerDown({ x: layout.list.x + layout.list.width - 20, y: layout.list.y + 10 }, 0);
    expect(ui.shopState.lines).toEqual([{ itemKind: 'stone', quantity: 1 }]);
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
    const layout = npcInteractionLayout(480, 270, true);
    ui.pointerDown({ x: layout.sellTab.x + 2, y: layout.sellTab.y + 2 }, 0);
    const plus = { x: layout.list.x + layout.list.width - 20, y: layout.list.y + 10 };
    const minus = { x: layout.list.x + layout.list.width - 74, y: layout.list.y + 10 };

    ui.pointerDown(plus, 0, { shift: true });
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 10 }]);
    ui.pointerDown(plus, 0, { control: true });
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 25 }]);
    ui.pointerDown(minus, 0, { shift: true });
    expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 15 }]);
    ui.pointerDown(minus, 0, { control: true });
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
    const layout = npcInteractionLayout(480, 270, true);
    const plus = { x: layout.list.x + layout.list.width - 20, y: layout.list.y + 10 };
    ui.setFilterText('anvil');
    expect(ui.filterValue).toBe('anvil');
    ui.pointerDown(plus, 0);
    expect(ui.shopState.lines).toEqual([{ itemKind: 'anvil', quantity: 1 }]);
    ui.setFilterText('no matches');
    expect(ui.shopState.lines).toEqual([{ itemKind: 'anvil', quantity: 1 }]);

    ui.pointerDown({ x: layout.sellTab.x + 2, y: layout.sellTab.y + 2 }, 0);
    ui.setFilterText('stone');
    ui.pointerDown(plus, 0);
    expect(ui.shopState.lines).toEqual([{ itemKind: 'stone', quantity: 1 }]);
  });
});
