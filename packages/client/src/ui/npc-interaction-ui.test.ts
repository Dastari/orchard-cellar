import { describe, expect, it, vi } from 'vitest';
import type { PixelUi } from '../render/pixel-ui.js';
import type { UiSkin } from './skin.js';
import { NpcInteractionUi, npcInteractionLayout } from './npc-interaction-ui.js';

describe('NPC interaction layout', () => {
  it('keeps the shop frame inside a compact 320x240 game UI', () => {
    const layout = npcInteractionLayout(320, 240, true);
    expect(layout.frame.x).toBeGreaterThanOrEqual(0);
    expect(layout.frame.y).toBeGreaterThanOrEqual(0);
    expect(layout.frame.x + layout.frame.width).toBeLessThanOrEqual(320);
    expect(layout.frame.y + layout.frame.height).toBeLessThanOrEqual(240);
    expect(layout.buyTab.y).toBeLessThan(layout.list.y);
    expect(layout.action.y).toBeGreaterThan(layout.list.y);
    expect(layout.list.x - layout.frame.x).toBeGreaterThanOrEqual(28);
    expect(layout.frame.x + layout.frame.width - (layout.scroll.x + layout.scroll.width)).toBeGreaterThanOrEqual(28);
    expect(layout.frame.y + layout.frame.height - (layout.action.y + layout.action.height)).toBeGreaterThanOrEqual(28);
  });

  it('centres a smaller reusable dialogue frame', () => {
    const layout = npcInteractionLayout(480, 270, false);
    expect(layout.frame.x + layout.frame.width / 2).toBe(240);
    expect(layout.frame.y + layout.frame.height / 2).toBe(135);
  });

  it('selects dialogue choices with number keys', () => {
    const chooseDialogueOption = vi.fn();
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption,
      closeDialogue: vi.fn(),
      buy: vi.fn(),
      sell: vi.fn(),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'greeting',
      balanceBronze: 10_000n, inventory: [],
    });
    expect(ui.handleKeyDown('Digit1', false)).toBe(true);
    expect(chooseDialogueOption).toHaveBeenCalledWith('offer');
  });

  it('emits an explicit quantity purchase from the shop action', () => {
    const buy = vi.fn();
    const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
      chooseDialogueOption: vi.fn(),
      closeDialogue: vi.fn(),
      buy,
      sell: vi.fn(),
    });
    ui.update({
      width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', nodeId: 'shop',
      balanceBronze: 10_000n, inventory: [],
    });
    const layout = npcInteractionLayout(480, 270, true);
    ui.pointerDown({ x: layout.action.x + 2, y: layout.action.y + 2 }, 0);
    expect(buy).toHaveBeenCalledWith('axe', 1);
  });
});
