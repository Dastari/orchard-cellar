import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import { furnitureShopDetails } from './furniture-shop-details.js';
import { NpcInteractionUi } from './npc-interaction-ui.js';
import type { UiKitArt } from './kit/components/art.js';
const registry = bootstrapContentRegistry();
function fixture() {
    const callbacks = { chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(), buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined) };
    const ui = new NpcInteractionUi({} as UiKitArt, {} as never, callbacks);
    const model = { interactionSessionKey: 'alice:1:true', width: 320, height: 240, npcId: 1n, dialogueId: 'willow_furnisher', shopId: 'willow_furnisher', nodeId: 'shop',
        balanceBronze: 10000n, inventory: [], contentRegistry: registry };
    ui.update(model);
    ui.focus();
    return { ui, callbacks, model };
}
describe('furniture purchase inspection', () => {
    it('previews a plan through its recipe edge with actual footprint and all materials', () => {
        const details = furnitureShopDetails(registry, 'furniture_rustic_dining_table_plan');
        expect(details).toMatchObject({ itemKind: 'furniture_rustic_dining_table', isPlan: true });
        expect(details?.name).toMatch(/Plan/);
        expect(details?.lines).toEqual(expect.arrayContaining(['RECIPE PLAN', '3 X 2 TILES', 'WORKBENCH REQUIRED', '6 Wooden Planks', '2 Stick']));
        expect(furnitureShopDetails(registry, 'furniture_rustic_chair')?.lines).toContain('FINISHED FURNITURE');
        expect(furnitureShopDetails(registry, 'wood')).toBeNull();
    });
    it('inspects without changing the cart; Enter adds one but never purchases', () => {
        const f = fixture();
        press(f.ui, 'merchant.inspect:furniture_rustic_chair');
        expect(f.ui.shopState.lines).toEqual([]);
        key(f.ui, 'Enter');
        expect(f.ui.shopState.lines).toEqual([{ itemKind: 'furniture_rustic_chair', quantity: 1 }]);
        expect(f.callbacks.buy).not.toHaveBeenCalled();
    });
    it('defers touch inspection and cancels it after a catalogue swipe', () => {
        const f = fixture();
        const element = control(f.ui, 'merchant.inspect:furniture_rustic_chair');
        const point = { x: element.rect.x + 5, y: element.rect.y + 5 };
        f.ui.root.pointer({ type: 'down', point, pointerId: 1, button: 0, pointerType: 'touch' });
        f.ui.root.pointer({ type: 'move', point: { x: point.x, y: point.y - 60 }, pointerId: 1, button: 0, pointerType: 'touch' });
        f.ui.root.pointer({ type: 'up', point: { x: point.x, y: point.y - 60 }, pointerId: 1, button: 0, pointerType: 'touch' });
        const state = f.ui as unknown as {
            inspectingItemKind: string | null;
        };
        expect(state.inspectingItemKind).toBeNull();
        const tapped = fixture(), target = control(tapped.ui, 'merchant.inspect:furniture_rustic_chair'), tap = { x: target.rect.x + 5, y: target.rect.y + 5 };
        tapped.ui.root.pointer({ type: 'down', point: tap, pointerId: 1, button: 0, pointerType: 'touch' });
        tapped.ui.root.pointer({ type: 'up', point: tap, pointerId: 1, button: 0, pointerType: 'touch' });
        expect((tapped.ui as unknown as {
            inspectingItemKind: string | null;
        }).inspectingItemKind).toBe('furniture_rustic_chair');
    });
    it('clears inspection when its offer disappears and Escape returns to the catalogue', () => {
        const f = fixture();
        press(f.ui, 'merchant.inspect:furniture_rustic_chair');
        key(f.ui, 'Escape');
        expect(f.callbacks.chooseDialogueOption).not.toHaveBeenCalled();
        press(f.ui, 'merchant.inspect:furniture_rustic_chair');
        const shop = registry.shops.get('shop:willow_furnisher')!;
        f.ui.update({ ...f.model, contentRegistry: { ...registry, shops: new Map([...registry.shops, [shop.id, { ...shop, offers: [] }]]) } });
        expect((f.ui as unknown as {
            inspectingItemKind: string | null;
        }).inspectingItemKind).toBeNull();
    });
});
function control(ui: NpcInteractionUi, id: string) { ui.root.arrange(); const element = ui.root.entries().find(entry => entry.element.id === id)?.element; expect(element, id).toBeDefined(); ui.root.focus.set(element!, 'keyboard'); ui.root.arrange(); return element!; }
function press(ui: NpcInteractionUi, id: string) { control(ui, id); ui.root.key({ key: 'Enter' }); ui.root.arrange(); }
function key(ui: NpcInteractionUi, key: string) { ui.focus(); ui.root.key({ key }); ui.root.arrange(); }
