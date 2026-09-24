import { it, expect, vi } from 'vitest';
import { bootstrapContentRegistry, villageOrderQuote } from '@orchard/sim';
import { NpcInteractionUi } from './npc-interaction-ui.js';
import type { UiKitArt } from './kit/components/art.js';
function fixture() {
    const registry = bootstrapContentRegistry(), quote = villageOrderQuote(registry, 'market_carrots', 0)!;
    const offer = { ...quote, npcId: BigInt(registry.npcs.get(quote.npc)!.runtimeId), revision: 0n, contentHash: registry.contentHash };
    const send = vi.fn(async () => { }), choose = vi.fn();
    const ui = new NpcInteractionUi({} as UiKitArt, {} as never, { chooseDialogueOption: choose, closeDialogue: vi.fn(), buy: vi.fn(), sell: vi.fn(), fulfillVillageOrder: send });
    const model = { interactionSessionKey: 'alice:1:true', width: 320, height: 180, npcId: offer.npcId, dialogueId: 'willow_storekeeper', nodeId: 'greeting', balanceBronze: 0n, inventory: [], contentRegistry: registry, villageOrders: [offer], orderSessionKey: 'a' };
    ui.update(model);
    ui.focus();
    return { ui, model, send, choose, offer };
}
it('opens orders from dialogue, requires a separate review and guards pending delivery across close/reopen', async () => {
    const f = fixture();
    key(f.ui, '1');
    expect(f.choose).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
    key(f.ui, '1');
    expect(f.ui.orderFlow.review?.id).toBe(f.offer.id);
    expect(f.send).not.toHaveBeenCalled();
    key(f.ui, 'Enter');
    await Promise.resolve();
    expect(f.send).toHaveBeenCalledOnce();
    key(f.ui, 'Escape');
    key(f.ui, '1');
    key(f.ui, 'Enter');
    expect(f.send).toHaveBeenCalledOnce();
    f.ui.update({ ...f.model, villageOrders: [{ ...f.offer, revision: 1n }] });
    expect(f.ui.orderFlow.review).toBeNull();
});
it('places compact review controls within the frame and uses separate pointer targets', () => {
    const f = fixture();
    key(f.ui, '1');
    const row = control(f.ui, `merchant.panel.offer:${f.offer.id}`), point = { x: row.rect.x + 4, y: row.rect.y + 4 };
    f.ui.root.pointer({ type: 'down', point, pointerId: 1, button: 0 });
    expect(f.ui.orderFlow.review).toBeNull();
    f.ui.root.pointer({ type: 'up', point, pointerId: 1, button: 0 });
    expect(f.ui.orderFlow.review).not.toBeNull();
    expect(f.send).not.toHaveBeenCalled();
    const frame = control(f.ui, 'game.merchant.panel');
    expect(frame.rect.x).toBeGreaterThanOrEqual(0);
    expect(frame.rect.x + frame.rect.width).toBeLessThanOrEqual(320);
    expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(180);
    press(f.ui, 'merchant.panel.confirm');
    expect(f.send).toHaveBeenCalledOnce();
});
function control(ui: NpcInteractionUi, id: string) { ui.root.arrange(); const element = ui.root.entries().find(entry => entry.element.id === id)?.element; expect(element, id).toBeDefined(); ui.root.focus.set(element!, 'keyboard'); ui.root.arrange(); return element!; }
function press(ui: NpcInteractionUi, id: string) { control(ui, id); ui.root.key({ key: 'Enter' }); ui.root.arrange(); }
function key(ui: NpcInteractionUi, key: string) { ui.focus(); ui.root.key({ key }); ui.root.arrange(); }
