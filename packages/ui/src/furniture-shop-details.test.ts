import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import { furnitureShopDetails } from './furniture-shop-details.js';
import { NpcInteractionUi, npcInteractionLayout } from './npc-interaction-ui.js';
import type { UiSkin } from './skin.js';
import type { PixelUi } from './pixel-ui.js';
const registry = bootstrapContentRegistry();
function fixture() {
  const callbacks = { chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(), buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined) };
  const ui = new NpcInteractionUi({} as UiSkin, {} as PixelUi, {} as never, callbacks);
  const model = { width: 320, height: 240, npcId: 1n, dialogueId: 'willow_furnisher', shopId: 'willow_furnisher', nodeId: 'shop',
    balanceBronze: 10000n, inventory: [], contentRegistry: registry };
  ui.update(model);
  const layout = npcInteractionLayout(320, 240, true);
  return { ui, callbacks, model, layout, rowPoint: { x: layout.list.x + 5, y: layout.list.y + 5 } };
}
describe('furniture purchase inspection', () => {
  it('previews a plan through its recipe edge with actual footprint and all materials', () => {
    const details = furnitureShopDetails(registry, 'furniture_rustic_dining_table_plan');
    expect(details).toMatchObject({ itemKind: 'furniture_rustic_dining_table', isPlan: true });
    expect(details?.name).toMatch(/Plan/);
    expect(details?.lines).toEqual(expect.arrayContaining(['RECIPE PLAN', '3 X 2 TILES', 'WORKBENCH REQUIRED', '28 Wood']));
    expect(furnitureShopDetails(registry, 'furniture_rustic_chair')?.lines).toContain('FINISHED FURNITURE');
    expect(furnitureShopDetails(registry, 'wood')).toBeNull();
  });
  it('inspects without changing the cart; Enter adds one but never purchases', () => {
    const f = fixture(); f.ui.pointerDown(f.rowPoint, 0);
    expect(f.ui.shopState.lines).toEqual([]);
    f.ui.handleKeyDown('Enter', false);
    expect(f.ui.shopState.lines).toEqual([{ itemKind: 'furniture_rustic_chair', quantity: 1 }]);
    expect(f.callbacks.buy).not.toHaveBeenCalled();
  });
  it('defers touch inspection and cancels it after a catalogue swipe', () => {
    const f = fixture();
    f.ui.pointerDown(f.rowPoint, 0, { pointerType: 'touch' });
    f.ui.pointerMove({ x: f.rowPoint.x, y: f.rowPoint.y - 60 }); f.ui.pointerUp();
    const state = f.ui as unknown as { inspectingItemKind: string | null };
    expect(state.inspectingItemKind).toBeNull();
    const tapped = fixture(); tapped.ui.pointerDown(tapped.rowPoint, 0, { pointerType: 'touch' }); tapped.ui.pointerUp();
    expect((tapped.ui as unknown as { inspectingItemKind: string | null }).inspectingItemKind).toBe('furniture_rustic_chair');
  });
  it('clears inspection when its offer disappears and Escape returns to the catalogue', () => {
    const f = fixture(); f.ui.pointerDown(f.rowPoint, 0); f.ui.handleKeyDown('Escape', false);
    expect(f.callbacks.chooseDialogueOption).not.toHaveBeenCalled();
    f.ui.pointerDown(f.rowPoint, 0);
    const shop = registry.shops.get('shop:willow_furnisher')!;
    f.ui.update({ ...f.model, contentRegistry: { ...registry, shops: new Map([...registry.shops, [shop.id, { ...shop, offers: [] }]]) } });
    expect((f.ui as unknown as { inspectingItemKind: string | null }).inspectingItemKind).toBeNull();
  });
});
