import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { uiTestArt, uiTestAsset } from './kit/lab/testing/art.js';
import { drawPixelText } from './pixel-ui.js';
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, buildContentRegistry, bootstrapContentRows, dialogueDefinition, dialogueNode, villageOrderQuote, itemDefinition } from '@orchard/sim';
import type { OverworldUiItemArt } from './overworld-ui.js';
import type { LoadedAsset } from './assets.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiElementKey } from './kit/runtime/element.js';
import { NpcInteractionUi, dialogueChoiceIsAvailable, dialogueChoiceRewardTooltip, npcInteractionFrame, type NpcInteractionModel, type NpcInteractionCallbacks } from './npc-interaction-ui.js';
const registry = bootstrapContentRegistry();
let art: UiKitArt;
const itemArt: Record<string, LoadedAsset> = {};
const hosts: NpcInteractionUi[] = [];
const fonts = new WeakMap<object, string>();
let glyphs: string[] = [];
function canvas(width: number, height: number) { const image = createCanvas(width, height), context = image.getContext('2d'), draw = context.drawImage.bind(context); context.drawImage = ((...args: Parameters<typeof context.drawImage>) => { const font = fonts.get(args[0]); if (font && args.length === 9) {
    if (args[3] === 5 && args[4] === 7 || args[3] === 8 && args[4] === 12)
        glyphs.push(font);
    else if (args[3] === args[0].width && args[4] === args[0].height)
        fonts.set(image, font);
} return draw(...args); }) as typeof context.drawImage; return image; }
beforeAll(async () => { art = await uiTestArt(); for (const kind of ['homestead_deed', 'axe', 'pickaxe', 'hoe', 'wood', 'furniture_rustic_chair']) {
    const name = itemDefinition(kind)?.iconKey;
    if (name)
        itemArt[kind] = uiTestAsset(name, name.startsWith('item_') || name.startsWith('prop_') ? 'props' : 'ui');
} fonts.set(art.pixel.font.image, 'font_5x7'); fonts.set(art.pixel.headerFont.image, 'font_8x12'); vi.stubGlobal('document', { createElement: () => canvas(1, 1) }); });
afterEach(() => hosts.splice(0).forEach(host => host.dispose()));
afterAll(() => vi.unstubAllGlobals());
function fixture(overrides: Partial<NpcInteractionModel> = {}, calls: Partial<NpcInteractionCallbacks> = {}) {
    const callbacks = { chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(), buy: vi.fn().mockResolvedValue(undefined), sell: vi.fn().mockResolvedValue(undefined), ...calls };
    const model: NpcInteractionModel = { interactionSessionKey: 'player:1:true', width: 480, height: 270, npcId: 2n, dialogueId: 'tool_merchant', shopId: 'general_tools', nodeId: 'shop', balanceBronze: 100000n, inventory: [], contentRegistry: registry, ...overrides };
    const ui = new NpcInteractionUi(art, itemArt as OverworldUiItemArt, callbacks);
    hosts.push(ui);
    ui.update(model);
    ui.focus();
    return { ui, model, callbacks };
}
function node(ui: NpcInteractionUi, id: string) { ui.root.arrange(); const found = ui.root.entries().find(entry => entry.element.id === id)?.element; expect(found, `missing ${id}`).toBeDefined(); return found!; }
function press(ui: NpcInteractionUi, id: string, modifiers: Omit<UiElementKey, 'key'> = {}) { const element = node(ui, id); ui.root.focus.set(element, 'keyboard'); ui.root.key({ key: 'Enter', ...modifiers }); ui.root.arrange(); }
function tap(ui: NpcInteractionUi, id: string, pointerType = 'mouse') {
    const element = node(ui, id);
    ui.root.focus.set(element, 'keyboard');
    ui.root.arrange();
    const point = { x: element.rect.x + element.rect.width / 2, y: element.rect.y + element.rect.height / 2 };
    ui.root.pointer({ type: 'down', point, pointerId: 1, button: 0, pointerType });
    ui.root.pointer({ type: 'up', point, pointerId: 1, button: 0, pointerType });
}
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
describe('production retained merchant', () => {
    it.each([[320, 180], [480, 270], [960, 600]])('keeps a stable scale-one root and bounded frame at %sx%s', (width, height) => { const { ui, model } = fixture({ width, height }); const root = ui.root, frame = node(ui, 'game.merchant'); expect(root.scale).toBe(1); expect(frame.rect.x).toBeGreaterThanOrEqual(0); expect(frame.rect.y).toBeGreaterThanOrEqual(0); expect(frame.rect.x + frame.rect.width).toBeLessThanOrEqual(width); expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(height); ui.update({ ...model, width: width + 20 }); expect(ui.root).toBe(root); expect(node(ui, 'game.merchant')).toBe(frame); ui.dispose(); expect(root.disposed).toBe(true); });
    it('starts at zero and submits a multi-kind cart once on retained pointer release', async () => { const { ui, callbacks } = fixture(); expect(ui.shopState.lines).toEqual([]); tap(ui, 'merchant.plus:homestead_deed'); tap(ui, 'merchant.plus:axe', 'touch'); expect(ui.shopState).toMatchObject({ totalBronze: 50450n, canCommit: true }); tap(ui, 'merchant.commit'); expect(callbacks.buy).toHaveBeenCalledExactlyOnceWith([{ itemKind: 'homestead_deed', quantity: 1 }, { itemKind: 'axe', quantity: 1 }]); expect(ui.shopState.pending).toBe(true); await settle(); expect(ui.shopState.lines).toEqual([]); });
    it('blocks empty and unaffordable carts and retains a rejected cart', async () => { const buy = vi.fn().mockRejectedValue(new Error('inventory_full')); const { ui, model } = fixture({ balanceBronze: 10n }, { buy }); press(ui, 'merchant.commit'); expect(buy).not.toHaveBeenCalled(); press(ui, 'merchant.plus:homestead_deed'); expect(ui.shopState.canCommit).toBe(false); press(ui, 'merchant.commit'); expect(buy).not.toHaveBeenCalled(); ui.update({ ...model, balanceBronze: 100000n }); press(ui, 'merchant.commit'); await settle(); expect(ui.shopState.pending).toBe(false); expect(ui.shopState.lines).toEqual([{ itemKind: 'homestead_deed', quantity: 1 }]); expect(ui.root.entries().some(entry => entry.element.label.includes('Transaction rejected'))).toBe(true); });
    it('preserves separate buy/sell carts and filtered-out lines; applies bounded modifiers', () => { const { ui } = fixture({ inventory: [{ slot: 10, itemKind: 'wood', quantity: 25 }] }); press(ui, 'merchant.plus:axe'); press(ui, 'merchant.sell'); press(ui, 'merchant.plus:wood', { shiftKey: true }); expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 10 }]); press(ui, 'merchant.plus:wood', { ctrlKey: true }); expect(ui.shopState.lines[0]?.quantity).toBe(25); press(ui, 'merchant.minus:wood', { shiftKey: true }); expect(ui.shopState.lines[0]?.quantity).toBe(15); ui.setFilterText('nothing'); expect(ui.shopState.lines[0]?.quantity).toBe(15); press(ui, 'merchant.buy'); expect(ui.shopState.lines).toEqual([{ itemKind: 'axe', quantity: 1 }]); });
    it('uses effective backpack custody, sell overrides and reclamps ownership', () => { const { ui, model } = fixture({ backpackSlotCapacity: 20, sellPriceOverrides: { stone: 17 }, inventory: [{ slot: 29, itemKind: 'stone', quantity: 2 }, { slot: 30, itemKind: 'stone', quantity: 4 }, { slot: 39, itemKind: 'stone', quantity: 8 }] }); press(ui, 'merchant.sell'); press(ui, 'merchant.plus:stone', { ctrlKey: true }); expect(ui.shopState).toMatchObject({ lines: [{ itemKind: 'stone', quantity: 2 }], totalBronze: 34n }); ui.update({ ...model, inventory: [{ slot: 29, itemKind: 'stone', quantity: 1 }] }); expect(ui.shopState.lines[0]?.quantity).toBe(1); ui.update({ ...model, backpackSlotCapacity: 8 }); expect(ui.shopState.lines).toEqual([]); });
    it('uses equipped authored capacity and excludes quest and unsellable items', () => { const { ui } = fixture({ inventory: [{ slot: 34, itemKind: 'backpack', quantity: 1 }, { slot: 29, itemKind: 'stone', quantity: 2 }, { slot: 0, itemKind: 'marlow_book', quantity: 1 }] }); press(ui, 'merchant.sell'); press(ui, 'merchant.plus:stone'); expect(ui.shopState.lines).toEqual([{ itemKind: 'stone', quantity: 1 }]); expect(ui.root.entries().some(entry => entry.element.id === 'merchant.plus:marlow_book')).toBe(false); });
    it('fails closed for missing shops, retired offers and live null prices', () => { const rows = bootstrapContentRows().map(row => row.id === 'item:axe' ? { ...row, json: { ...registry.items.get(row.id)!, displayName: 'Moon Axe', maxStack: 2, economy: { buy: 17, sell: 1 } } } : row.id === 'shop:general_tools' ? { ...row, json: { ...registry.shops.get(row.id)!, offers: [{ item: 'item:axe' }] } } : row); const live = buildContentRegistry(rows).registry; const { ui, model } = fixture({ contentRegistry: live }); press(ui, 'merchant.plus:axe', { ctrlKey: true }); expect(ui.shopState).toMatchObject({ totalBronze: 34n, lines: [{ itemKind: 'axe', quantity: 2 }] }); const noPrice = buildContentRegistry(rows.map(row => row.id === 'item:axe' ? { ...row, json: { ...live.items.get(row.id)!, economy: { buy: null, sell: 1 } } } : row)).registry; ui.update({ ...model, contentRegistry: noPrice }); expect(ui.shopState.lines).toEqual([]); ui.update({ ...model, shopId: undefined }); expect(ui.shopState.lines).toEqual([]); ui.update({ ...model, contentRegistry: { ...live, shops: new Map() } }); expect(ui.root.entries().some(entry => entry.element.id === 'merchant.plus:axe')).toBe(false); });
    it('honours live quest-custody tags', () => { const contentRegistry = buildContentRegistry(bootstrapContentRows().map(row => row.id === 'item:stone' ? { ...row, json: { ...registry.items.get(row.id)!, tags: ['item.quest_unique'] } } : row)).registry; const { ui } = fixture({ contentRegistry, inventory: [{ slot: 0, itemKind: 'stone', quantity: 3 }] }); press(ui, 'merchant.sell'); expect(ui.root.entries().some(entry => entry.element.id === 'merchant.plus:stone')).toBe(false); });
    it('retains filter selection and routes editor digits and L without host shortcuts', () => { const { ui, model, callbacks } = fixture(); const input = node(ui, 'merchant.filter'); ui.root.focus.set(input, 'keyboard'); ui.root.text('1l'); expect(ui.filterValue).toBe('1l'); expect(ui.shopState.tab).toBe('buy'); expect(callbacks.chooseDialogueOption).not.toHaveBeenCalled(); const editor = input.props['editor'] as {
        setSelection: (a: number, b: number) => void;
        snapshot: () => {
            anchor: number;
            focus: number;
        };
    }; editor.setSelection(0, 1); ui.update({ ...model, balanceBronze: 99000n }); expect(ui.root.focus.current).toBe(input); expect(editor.snapshot()).toMatchObject({ anchor: 0, focus: 1 }); ui.root.key({ key: 'Escape' }); expect(ui.filterValue).toBe(''); expect(ui.root.focus.current).toBe(input); ui.root.key({ key: 'Escape' }); expect(ui.root.focus.current?.id).toBe('game.npc.host'); ui.root.key({ key: 'Escape' }); expect(callbacks.chooseDialogueOption).toHaveBeenCalledWith('back'); });
    it.each(['success', 'failure'])('BUG-020 ignores old %s completion across close/reopen and a newer request', async (result) => { let resolveOld!: () => void, rejectOld!: (error: Error) => void, resolveNew!: () => void; const buy = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve, reject) => { resolveOld = resolve; rejectOld = reject; })).mockImplementationOnce(() => new Promise<void>(resolve => { resolveNew = resolve; })); const { ui, model } = fixture({}, { buy }); press(ui, 'merchant.plus:axe'); press(ui, 'merchant.commit'); ui.update(null); ui.update(model); expect(ui.shopState.pending).toBe(false); press(ui, 'merchant.plus:axe'); press(ui, 'merchant.commit'); if (result === 'success')
        resolveOld();
    else
        rejectOld(new Error('old')); await settle(); expect(ui.shopState).toMatchObject({ pending: true, lines: [{ itemKind: 'axe', quantity: 1 }] }); resolveNew(); await settle(); expect(ui.shopState).toMatchObject({ pending: false, lines: [] }); });
    it('resets local state on connection/NPC/node scope and consumes a retired gesture tail', () => { const { ui, model } = fixture(); const element = node(ui, 'merchant.plus:axe'); ui.root.focus.set(element, 'keyboard'); ui.root.arrange(); const point = { x: element.rect.x + 2, y: element.rect.y + 2 }; ui.root.pointer({ type: 'down', point, pointerId: 1, button: 0 }); ui.update({ ...model, interactionSessionKey: 'player:2:true' }); ui.root.pointer({ type: 'up', point, pointerId: 1, button: 0 }); expect(ui.shopState.lines).toEqual([]); press(ui, 'merchant.plus:axe'); ui.update({ ...model, npcId: 3n }); expect(ui.shopState.lines).toEqual([]); });
});
describe('production retained dialogue', () => {
    it('uses the exact live authored frame and rejects missing live nodes', () => { const source = registry.frames.get('frame:shop')!; const contentRegistry = buildContentRegistry([...bootstrapContentRows(), { id: 'frame:moon', kind: 'frame', json: { ...source, id: 'frame:moon', title: 'Moon goods' } }, { id: 'dialogue:moon', kind: 'dialogue', json: { id: 'dialogue:moon', kind: 'dialogue', schemaVersion: 1, initialNodeId: 'market', shop: 'shop:general_tools', nodes: [{ id: 'market', speaker: 'Moon', body: 'Welcome', mode: 'shop', frameId: 'frame:moon', choices: [] }] } }]).registry; const { ui, model } = fixture({ contentRegistry, dialogueId: 'moon', nodeId: 'market' }); expect(npcInteractionFrame(model)?.id).toBe('frame:moon'); expect(ui.shopOpen).toBe(true); expect(ui.root.entries().some(entry => entry.element.label === 'MOON GOODS')).toBe(true); ui.update({ ...model, nodeId: 'missing' }); expect(ui.root.entries().some(entry => entry.element.id === 'game.merchant')).toBe(false); });
    it('keeps dialogue buttons through ordinary snapshots and dispatches one current choice', () => { const { ui, model, callbacks } = fixture({ nodeId: 'greeting' }); const choices = dialogueNode(dialogueDefinition('tool_merchant')!, 'greeting')!.choices.filter(choice => dialogueChoiceIsAvailable(choice, [], registry)); expect(choices.length).toBeGreaterThan(0); const id = `dialogue:${choices[0]!.id}`, button = node(ui, id); ui.update({ ...model, balanceBronze: 3n }); expect(node(ui, id)).toBe(button); tap(ui, id, 'touch'); expect(callbacks.chooseDialogueOption).toHaveBeenCalledExactlyOnceWith(choices[0]!.id); ui.focus(); ui.root.key({ key: '1' }); expect(callbacks.chooseDialogueOption).toHaveBeenCalledTimes(2); ui.root.key({ key: 'Escape' }); expect(callbacks.closeDialogue).toHaveBeenCalledOnce(); });
    it('drops changed quest choices and cancels their old pointer capture', () => { const { ui, model, callbacks } = fixture({ nodeId: 'greeting' }); const button = ui.root.entries().find(entry => entry.element.id.startsWith('dialogue:'))!.element; ui.root.focus.set(button, 'keyboard'); ui.root.arrange(); const point = { x: button.rect.x + 5, y: button.rect.y + 5 }; ui.root.pointer({ type: 'down', point, pointerId: 1, button: 0 }); ui.update({ ...model, nodeId: 'shop' }); ui.root.pointer({ type: 'up', point, pointerId: 1, button: 0 }); expect(callbacks.chooseDialogueOption).not.toHaveBeenCalled(); expect(ui.shopState.lines).toEqual([]); });
});
it('fails closed for missing or retired live quests in every quest state', () => {
    const source = bootstrapContentRegistry();
    const registry = buildContentRegistry(bootstrapContentRows().map((row) => {
        if (row.id === 'quest:marlow_important_book') {
            return { ...row, json: { ...source.quests.get(row.id)!, retired: true } };
        }
        if (row.id === 'item:marlow_book') {
            return { ...row, json: { ...source.items.get(row.id)!, retired: true } };
        }
        return row;
    })).registry;
    const retired = {
        id: 'retired', label: 'Retired', nextNodeId: null,
        quest: { questId: 'marlow_important_book', requires: 'active' as const, action: 'accept' as const },
    };
    const missing = {
        id: 'missing', label: 'Missing', nextNodeId: null,
        quest: { questId: 'absent_quest', requires: 'complete' as const, action: 'turn_in' as const },
    };
    expect(dialogueChoiceIsAvailable(retired, [{ questId: 'marlow_important_book', state: 'active' }], registry)).toBe(false);
    expect(dialogueChoiceIsAvailable(missing, [{ questId: 'absent_quest', state: 'complete' }], registry)).toBe(false);
    expect(dialogueChoiceRewardTooltip(missing, registry)).toBeNull();
    const activeQuestRegistry = buildContentRegistry(bootstrapContentRows().map((row) => {
        if (row.id !== 'item:marlow_book')
            return row;
        return { ...row, json: { ...source.items.get(row.id)!, retired: true } };
    })).registry;
    const turnIn = {
        id: 'turn_in', label: 'Turn in', nextNodeId: null,
        quest: { questId: 'marlow_important_book', requires: 'complete' as const, action: 'turn_in' as const },
    };
    expect(dialogueChoiceRewardTooltip(turnIn, activeQuestRegistry)).toBe('REWARDS: 1 GOLD / 100 EXPLORER XP / MARLOW BOOK ×1');
});
it('preserves authoritative quest prerequisites, states and complete reward tooltips', () => {
    const definition = dialogueDefinition('tool_merchant')!;
    const all = Object.values(definition.nodes).flatMap(node => node.choices);
    const conditional = all.find(choice => choice.quest);
    if (conditional) {
        expect(dialogueChoiceIsAvailable(conditional, [], registry)).toBe(conditional.quest?.requires === 'available');
    }
    const choice = { id: 'complete', label: 'Deliver', nextNodeId: null, quest: { questId: 'marlow_important_book', requires: 'complete' as const, action: 'turn_in' as const } };
    expect(dialogueChoiceIsAvailable(choice, [{ questId: 'marlow_important_book', state: 'active' }], registry)).toBe(false);
    expect(dialogueChoiceIsAvailable(choice, [{ questId: 'marlow_important_book', state: 'complete' }], registry)).toBe(true);
    expect(dialogueChoiceRewardTooltip(choice, registry)).toBe("REWARDS: 1 GOLD / 100 EXPLORER XP / MARLOW'S BOOK ×1");
});
it.each(['dialogue', 'buy', 'sell', 'empty', 'furniture', 'seals', 'orders'] as const)('draws %s with actual5x7 at compact/wide scales1/2/3 and DPR1/1.25', state => {
    for (const width of [320, 640])
        for (const scale of [1, 2, 3])
            for (const dpr of [1, 1.25]) {
                const height = width === 320 ? 240 : 400;
                let model: Partial<NpcInteractionModel> = { width, height };
                if (state === 'dialogue')
                    model = { ...model, nodeId: 'greeting' };
                if (state === 'sell')
                    model = { ...model, inventory: [{ slot: 0, itemKind: 'wood', quantity: 25 }] };
                if (state === 'furniture')
                    model = { ...model, npcId: 1n, dialogueId: 'willow_furnisher', shopId: 'willow_furnisher' };
                if (state === 'seals')
                    model = { ...model, npcId: BigInt(registry.npcs.get('npc:willow_archivist')!.runtimeId), dialogueId: 'willow_archivist', sealSessionKey: 'owner:1', knownRecipeIds: [] };
                if (state === 'orders') {
                    const quote = villageOrderQuote(registry, 'market_carrots', 0)!;
                    const offer = { ...quote, npcId: BigInt(registry.npcs.get(quote.npc)!.runtimeId), revision: 0n, contentHash: registry.contentHash };
                    model = { ...model, npcId: offer.npcId, dialogueId: 'willow_storekeeper', nodeId: 'greeting', orderSessionKey: 'owner:1', villageOrders: [offer] };
                }
                const { ui } = fixture(model, { unlockHearthLegendaryRecipe: vi.fn().mockResolvedValue(undefined), fulfillVillageOrder: vi.fn().mockResolvedValue(undefined) });
                if (state === 'sell')
                    press(ui, 'merchant.sell');
                if (state === 'empty')
                    ui.setFilterText('absent stock');
                if (state === 'furniture')
                    press(ui, 'merchant.inspect:furniture_rustic_chair');
                if (state === 'seals')
                    press(ui, 'merchant.seals');
                if (state === 'orders') {
                    ui.root.key({ key: '1' });
                }
                const image = canvas(Math.round(width * scale * dpr), Math.round(height * scale * dpr)), ctx = image.getContext('2d');
                ctx.scale(scale * dpr, scale * dpr);
                glyphs = [];
                drawPixelText(ctx as unknown as CanvasRenderingContext2D, art.pixel, 'CALIBRATION', 0, 0, { font: 'header' });
                expect(glyphs).toContain('font_8x12');
                ctx.clearRect(0, 0, width, height);
                glyphs = [];
                ui.draw(ctx as unknown as CanvasRenderingContext2D);
                expect(new Set(glyphs)).toEqual(new Set(['font_5x7']));
                expect(ui.root.scale).toBe(1);
                const close = ui.root.entries().find(entry => entry.element.kind === 'button' && (entry.element.props['label'] === 'X' || entry.element.label.startsWith('Close')))!.element;
                expect(close.rect.width, `${state} close width`).toBeGreaterThan(0);
                expect(close.rect.x + close.rect.width, `${state} close right`).toBeLessThanOrEqual(width);
                expect(close.rect.y + close.rect.height, `${state} close bottom`).toBeLessThanOrEqual(height);
                expect(close.rect.height, `${state} close height`).toBeGreaterThan(0);
                expect(close.clip.width, `${state} close ${JSON.stringify(close.rect)}`).toBe(close.rect.width);
                expect(close.clip.height).toBe(close.rect.height);
                const directory = process.env['ORCHARD_NPC_EVIDENCE'];
                if (directory && dpr === 1.25) {
                    mkdirSync(directory, { recursive: true });
                    writeFileSync(`${directory}/${state}-${width}-scale${scale}.png`, image.toBuffer('image/png'));
                }
            }
});
it('owns one touch pointer across the blocking merchant and does not accept a secondary commit', () => { const { ui, callbacks } = fixture(); press(ui, 'merchant.plus:axe'); const commit = node(ui, 'merchant.commit'); ui.root.focus.set(commit, 'keyboard'); ui.root.arrange(); const point = { x: commit.rect.x + 3, y: commit.rect.y + 3 }; ui.root.pointer({ type: 'down', point, pointerId: 7, button: 0, pointerType: 'touch', isPrimary: true }); ui.root.pointer({ type: 'down', point, pointerId: 8, button: 0, pointerType: 'touch', isPrimary: false }); ui.root.pointer({ type: 'up', point, pointerId: 8, button: 0, pointerType: 'touch', isPrimary: false }); expect(callbacks.buy).not.toHaveBeenCalled(); ui.root.pointer({ type: 'up', point, pointerId: 7, button: 0, pointerType: 'touch', isPrimary: true }); expect(callbacks.buy).toHaveBeenCalledOnce(); });
it('forwards actual NPC identity and a bounded portrait viewport into retained dialogue paint', () => { const portrait = vi.fn(), ui = new NpcInteractionUi(art, itemArt as OverworldUiItemArt, { chooseDialogueOption: vi.fn(), closeDialogue: vi.fn(), buy: vi.fn(), sell: vi.fn() }, portrait); hosts.push(ui); ui.update({ interactionSessionKey: 'portrait:1', width: 320, height: 240, npcId: 42n, dialogueId: 'tool_merchant', nodeId: 'greeting', balanceBronze: 0n, inventory: [], contentRegistry: registry }); const context = canvas(320, 240).getContext('2d'); ui.draw(context as unknown as CanvasRenderingContext2D); expect(portrait).toHaveBeenCalledOnce(); expect(portrait.mock.calls[0]![1]).toBe(42n); const bounds = portrait.mock.calls[0]![2]; expect(bounds.width).toBe(44); expect(bounds.height).toBe(44); expect(bounds.x).toBeGreaterThan(0); expect(bounds.x + bounds.width).toBeLessThan(320); });
it('does not retarget a held purchase into a prepared sell cart when the tab changes', () => {
    const { ui, callbacks } = fixture({ inventory: [{ slot: 10, itemKind: 'wood', quantity: 3 }] });
    press(ui, 'merchant.plus:axe');
    press(ui, 'merchant.sell'); press(ui, 'merchant.plus:wood'); press(ui, 'merchant.buy');
    const commit = node(ui, 'merchant.commit'); ui.root.focus.set(commit, 'keyboard'); ui.root.arrange();
    const point = { x: commit.rect.x + 2, y: commit.rect.y + 2 };
    ui.root.pointer({ type: 'down', point, pointerId: 41, button: 0 });
    ui.root.key({ key: '2' }); expect(ui.shopState.tab).toBe('sell');
    ui.root.pointer({ type: 'up', point, pointerId: 41, button: 0 });
    expect(callbacks.buy).not.toHaveBeenCalled(); expect(callbacks.sell).not.toHaveBeenCalled();
    press(ui, 'merchant.commit'); expect(callbacks.sell).toHaveBeenCalledExactlyOnceWith([{ itemKind: 'wood', quantity: 1 }]);
});
it('cancels a held commit when its live price changes, preserving harmless updates', () => {
    const { ui, model, callbacks } = fixture(); press(ui, 'merchant.plus:axe');
    const commit = node(ui, 'merchant.commit'); ui.root.focus.set(commit, 'keyboard'); ui.root.arrange();
    const point = { x: commit.rect.x + 2, y: commit.rect.y + 2 };
    ui.root.pointer({ type: 'down', point, pointerId: 42, button: 0 });
    const axe = registry.items.get('item:axe')!;
    const contentRegistry = buildContentRegistry(bootstrapContentRows().map(row => row.id === 'item:axe' ? { ...row, json: { ...axe, economy: { ...axe.economy, buy: 900 } } } : row)).registry;
    ui.update({ ...model, contentRegistry });
    ui.root.pointer({ type: 'up', point, pointerId: 42, button: 0 });
    expect(callbacks.buy).not.toHaveBeenCalled(); expect(ui.shopState.totalBronze).toBe(900n);
    const refreshed = node(ui, 'merchant.commit'); expect(refreshed).toBe(commit);
    ui.root.focus.set(refreshed, 'keyboard'); ui.root.arrange();
    const freshPoint = { x: refreshed.rect.x + 2, y: refreshed.rect.y + 2 };
    ui.root.pointer({ type: 'down', point: freshPoint, pointerId: 43, button: 0 });
    ui.update({ ...model, contentRegistry, balanceBronze: 99000n });
    expect(ui.root.focus.current).toBe(refreshed);
    ui.root.pointer({ type: 'up', point: freshPoint, pointerId: 43, button: 0 });
    expect(callbacks.buy).toHaveBeenCalledExactlyOnceWith([{ itemKind: 'axe', quantity: 1 }]);
});

it('cancels a held sell after authoritative ownership reclamps its quantities', () => {
    const { ui, model, callbacks } = fixture({ inventory: [{ slot: 10, itemKind: 'wood', quantity: 3 }] });
    press(ui, 'merchant.sell'); press(ui, 'merchant.plus:wood', { ctrlKey: true });
    const commit = node(ui, 'merchant.commit'); ui.root.focus.set(commit, 'keyboard'); ui.root.arrange();
    const point = { x: commit.rect.x + 2, y: commit.rect.y + 2 };
    ui.root.pointer({ type: 'down', point, pointerId: 44, button: 0 });
    ui.update({ ...model, inventory: [{ slot: 10, itemKind: 'wood', quantity: 2 }] });
    ui.root.pointer({ type: 'up', point, pointerId: 44, button: 0 });
    expect(callbacks.sell).not.toHaveBeenCalled(); expect(ui.shopState.lines).toEqual([{ itemKind: 'wood', quantity: 2 }]);
    press(ui, 'merchant.commit'); expect(callbacks.sell).toHaveBeenCalledExactlyOnceWith([{ itemKind: 'wood', quantity: 2 }]);
});
