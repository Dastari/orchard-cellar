import { expect, it, vi } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import { NpcInteractionUi, npcInteractionLayout } from './npc-interaction-ui.js';
import { hearthSealLayout, hearthSealShopControls } from './hearth-seal-panel.js';
import type { UiSkin } from './skin.js';
import type { PixelUi } from './pixel-ui.js';
function fixture() {
  const registry = bootstrapContentRegistry(), send = vi.fn(async () => {});
  const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, {
    chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(), buy: vi.fn(), sell: vi.fn(), unlockHearthLegendaryRecipe: send,
  });
  const model = { width: 320, height: 180, npcId: BigInt(registry.npcs.get('npc:willow_archivist')!.runtimeId),
    dialogueId: 'willow_archivist', nodeId: 'shop', balanceBronze: 0n, inventory: [], contentRegistry: registry,
    sealSessionKey: 'alice:1', knownRecipeIds: [] as string[] };
  ui.update(model); const shop = npcInteractionLayout(320, 180, true), controls = hearthSealShopControls(shop.back, shop.action);
  const open = () => ui.pointerDown({ x: controls.seals.x + 3, y: controls.seals.y + 3 }, 0);
  return { ui, model, send, open };
}
it('opens from the visible shop button, pages through all eight recipes and requires a separate confirmation', async () => {
  const f = fixture(), l = hearthSealLayout(320, 180); f.open();
  f.ui.pointerDown({ x: l.next.x + 3, y: l.next.y + 3 }, 0);
  f.ui.handleKeyDown('Digit2', false); expect(f.ui.sealFlow.review?.recipeId).toBe('hearth_legendary_sword');
  expect(f.send).not.toHaveBeenCalled();
  f.ui.pointerDown({ x: l.unlock.x + 3, y: l.unlock.y + 3 }, 0); await Promise.resolve();
  expect(f.send).toHaveBeenCalledOnce(); expect(f.ui.sealFlow.pending).toBe(true);
  f.ui.handleKeyDown('Escape', false); f.open(); f.ui.handleKeyDown('Enter', false);
  expect(f.send).toHaveBeenCalledOnce();
  f.ui.update({ ...f.model, knownRecipeIds: ['hearth_legendary_sword'] });
  expect(f.ui.sealFlow.pending).toBe(false); expect(f.ui.sealFlow.notice).toContain('Recipe learned');
});
it('requires ready owner knowledge and clears the interaction when the admitted shop session ends', () => {
  const f = fixture();
  const notReady: Omit<typeof f.model, 'sealSessionKey'> & { sealSessionKey?: string } = { ...f.model };
  delete notReady.sealSessionKey; f.ui.update(notReady);
  f.ui.handleKeyDown('KeyL', false); f.ui.handleKeyDown('Digit1', false); expect(f.ui.sealFlow.review).toBeNull();
  f.ui.update(f.model); f.open(); f.ui.handleKeyDown('Digit1', false); expect(f.ui.sealFlow.review).not.toBeNull();
  f.ui.update({ ...f.model, nodeId: 'greeting' }); expect(f.ui.sealFlow.review).toBeNull();
  expect(f.send).not.toHaveBeenCalled();
});
it('keeps the compact controls separated and inside their frames', () => {
  for (const width of [266, 320, 640]) {
    const shop = npcInteractionLayout(width, 180, true), controls = hearthSealShopControls(shop.back, shop.action);
    expect(shop.list.y + shop.list.height).toBeLessThan(shop.action.y);
    expect(controls.back.x + controls.back.width).toBeLessThan(controls.seals.x);
    expect(controls.seals.width).toBeGreaterThanOrEqual(32);
    expect(controls.seals.x + controls.seals.width).toBeLessThan(shop.action.x);
    const l = hearthSealLayout(width, 180);
    expect(l.rows[5]!.y + l.rows[5]!.height).toBeLessThan(l.noticeY);
    for (const rect of [...l.rows, l.back, l.previous, l.next, l.unlock]) {
      expect(rect.x).toBeGreaterThanOrEqual(l.frame.x); expect(rect.y).toBeGreaterThanOrEqual(l.frame.y);
      expect(rect.x + rect.width).toBeLessThanOrEqual(l.frame.x + l.frame.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(l.frame.y + l.frame.height);
    }
  }
});
