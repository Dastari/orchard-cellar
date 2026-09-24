import { expect, it, vi } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import { NpcInteractionUi } from './npc-interaction-ui.js';
import type { UiKitArt } from './kit/components/art.js';
function fixture() {
    const registry = bootstrapContentRegistry(), send = vi.fn(async () => { });
    const ui = new NpcInteractionUi({} as UiKitArt, {} as never, {
        chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(), buy: vi.fn(), sell: vi.fn(), unlockHearthLegendaryRecipe: send,
    });
    const model = { interactionSessionKey: 'alice:1:true', width: 320, height: 180, npcId: BigInt(registry.npcs.get('npc:willow_archivist')!.runtimeId),
        dialogueId: 'willow_archivist', nodeId: 'shop', balanceBronze: 0n, inventory: [], contentRegistry: registry,
        sealSessionKey: 'alice:1', knownRecipeIds: [] as string[] };
    ui.update(model);
    ui.focus();
    const open = () => press(ui, 'merchant.seals');
    return { ui, model, send, open };
}
it('opens from the visible shop button, pages through all eight recipes and requires a separate confirmation', async () => {
    const f = fixture();
    f.open();
    press(f.ui, 'merchant.panel.next');
    key(f.ui, '2');
    expect(f.ui.sealFlow.review?.recipeId).toBe('hearth_legendary_sword');
    expect(f.send).not.toHaveBeenCalled();
    press(f.ui, 'merchant.panel.confirm');
    await Promise.resolve();
    expect(f.send).toHaveBeenCalledOnce();
    expect(f.ui.sealFlow.pending).toBe(true);
    key(f.ui, 'Escape');
    f.open();
    key(f.ui, 'Enter');
    expect(f.send).toHaveBeenCalledOnce();
    f.ui.update({ ...f.model, knownRecipeIds: ['hearth_legendary_sword'] });
    expect(f.ui.sealFlow.pending).toBe(false);
    expect(f.ui.sealFlow.notice).toContain('Recipe learned');
});
it('requires ready owner knowledge and clears the interaction when the admitted shop session ends', () => {
    const f = fixture();
    const notReady: Omit<typeof f.model, 'sealSessionKey'> & {
        sealSessionKey?: string;
    } = { ...f.model };
    delete notReady.sealSessionKey;
    f.ui.update(notReady);
    key(f.ui, 'l');
    key(f.ui, '1');
    expect(f.ui.sealFlow.review).toBeNull();
    f.ui.update(f.model);
    f.open();
    key(f.ui, '1');
    expect(f.ui.sealFlow.review).not.toBeNull();
    f.ui.update({ ...f.model, nodeId: 'greeting' });
    expect(f.ui.sealFlow.review).toBeNull();
    expect(f.send).not.toHaveBeenCalled();
});
it('keeps compact retained controls separate inside a scrollable frame', () => {
    for (const width of [266, 320, 640]) {
        const f = fixture();
        f.ui.update({ ...f.model, width });
        const back = control(f.ui, 'merchant.back'), seals = control(f.ui, 'merchant.seals'), commit = control(f.ui, 'merchant.commit');
        expect(back.rect.x + back.rect.width).toBeLessThanOrEqual(seals.rect.x);
        expect(seals.rect.x + seals.rect.width).toBeLessThanOrEqual(commit.rect.x);
        f.open();
        const frame = control(f.ui, 'game.merchant.panel');
        expect(frame.rect.x).toBeGreaterThanOrEqual(0);
        expect(frame.rect.x + frame.rect.width).toBeLessThanOrEqual(width);
        expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(180);
    }
});
function control(ui: NpcInteractionUi, id: string) { ui.root.arrange(); const element = ui.root.entries().find(entry => entry.element.id === id)?.element; expect(element, id).toBeDefined(); ui.root.focus.set(element!, 'keyboard'); ui.root.arrange(); return element!; }
function press(ui: NpcInteractionUi, id: string) { control(ui, id); ui.root.key({ key: 'Enter' }); ui.root.arrange(); }
function key(ui: NpcInteractionUi, key: string) { ui.focus(); ui.root.key({ key }); ui.root.arrange(); }
