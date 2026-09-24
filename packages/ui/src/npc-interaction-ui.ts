import { HearthSealFlow, type HearthSealOffer } from './hearth-seal-flow.js';
import { VillageOrderFlow, type VillageOrderOffer } from './village-order-flow.js';
import { BACKPACK_SLOT_COUNT, BACKPACK_SLOT_OFFSET, BASE_BACKPACK_CAPACITY, EQUIPMENT_SLOT_OFFSET, ITEM_ECONOMY, merchantOffers, coinPurseFromBronze, dialogueDefinition, runtimeDialogueDefinition, runtimeQuestDefinition, dialogueNode, itemDefinition, maxStackFor, questDefinition, type DialogueChoice, type FrameContentDefinition, type ContentRegistry, type MerchantCartLine, hearthRecipeExchangeNpcForRuntimeId, } from '@orchard/sim';
import { furnitureShopDetails } from './furniture-shop-details.js';
import type { OverworldUiInventorySlot, OverworldUiItemArt } from './overworld-ui.js';
import type { UiRect } from './geometry.js';
import { boundedStepperValue } from './bounded-stepper.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiDialogue, type UiDialogueElement } from './kit/components/dialogue.js';
import { uiMerchant, type UiMerchantElement } from './kit/components/merchant.js';
import { uiMerchantPanel, type UiMerchantPanelModel, type UiMerchantPanelElement } from './kit/components/merchant-panels.js';
import type { UiButtonModifiers } from './kit/components/button.js';
import { uiPurseLabel } from './kit/components/purse.js';
import { uiFixed } from './kit/layout/box.js';
import { UiElement, type UiElementKey } from './kit/runtime/element.js';
import { UiRoot } from './kit/runtime/root.js';
export interface NpcInteractionModel {
    readonly interactionSessionKey: string;
    readonly knownRecipeIds?: readonly string[];
    readonly sealSessionKey?: string;
    readonly villageOrders?: readonly VillageOrderOffer[];
    readonly orderSessionKey?: string;
    readonly width: number;
    readonly height: number;
    readonly npcId: bigint;
    readonly dialogueId: string;
    readonly shopId?: string;
    readonly nodeId: string;
    readonly balanceBronze: bigint;
    readonly inventory: readonly OverworldUiInventorySlot[];
    /** Effective player capacity already projected from equipment and unlocks. */
    readonly backpackSlotCapacity?: number;
    readonly sellPriceOverrides?: Readonly<Record<string, number>>;
    readonly quests?: readonly {
        readonly questId: string;
        readonly state: string;
    }[];
    readonly touchControls?: boolean;
    readonly contentRegistry?: ContentRegistry;
}
export function npcInteractionFrame(model: NpcInteractionModel): FrameContentDefinition | null {
    const registry = model.contentRegistry;
    const definition = registry === undefined ? null : runtimeDialogueDefinition(registry, model.dialogueId);
    const node = definition === null ? null : dialogueNode(definition, model.nodeId);
    if (node?.mode !== 'shop' || node.frameId === undefined)
        return null;
    const frame = registry?.frames.get(node.frameId);
    return frame?.retired !== true && frame?.presentation?.surface === 'merchant' ? frame : null;
}
export interface NpcInteractionCallbacks {
    readonly unlockHearthLegendaryRecipe?: (offer: HearthSealOffer) => Promise<void>;
    readonly fulfillVillageOrder?: (offer: VillageOrderOffer) => Promise<void>;
    readonly chooseDialogueOption: (choiceId: string) => void;
    readonly closeDialogue: () => void;
    readonly buy: (lines: readonly MerchantCartLine[]) => Promise<void>;
    readonly sell: (lines: readonly MerchantCartLine[]) => Promise<void>;
}
export type NpcInteractionPortraitDrawer = (context: CanvasRenderingContext2D, npcId: bigint, rect: UiRect) => void;
interface ShopRow {
    readonly itemKind: string;
    readonly name: string;
    readonly unitPrice: number;
    readonly maximumQuantity: number;
    readonly ownedQuantity?: number;
}
export interface NpcShopState {
    readonly tab: 'buy' | 'sell';
    readonly lines: readonly MerchantCartLine[];
    readonly totalBronze: bigint;
    readonly affordable: boolean;
    readonly canCommit: boolean;
    readonly pending: boolean;
}
export function dialogueChoiceIsAvailable(choice: DialogueChoice, quests: readonly {
    readonly questId: string;
    readonly state: string;
}[] = [], registry?: ContentRegistry): boolean {
    if (choice.quest === undefined)
        return true;
    const definition = registry === undefined
        ? questDefinition(choice.quest.questId)
        : runtimeQuestDefinition(registry, choice.quest.questId);
    if (definition === null)
        return false;
    const row = quests.find((quest) => quest.questId === choice.quest?.questId);
    if (choice.quest.requires !== 'available')
        return row?.state === choice.quest.requires;
    if (row !== undefined)
        return false;
    return definition.prerequisiteQuestIds?.every((questId) => (quests.some((quest) => quest.questId === questId && quest.state === 'turned_in'))) !== false;
}
export function dialogueChoiceRewardTooltip(choice: DialogueChoice | null | undefined, registry?: ContentRegistry): string | null {
    if (choice?.quest?.action !== 'turn_in')
        return null;
    const definition = registry === undefined
        ? questDefinition(choice.quest.questId)
        : runtimeQuestDefinition(registry, choice.quest.questId);
    if (definition === null)
        return null;
    const rewards: string[] = [];
    const purse = coinPurseFromBronze(definition.rewards.bronze);
    if (purse.gold > 0n)
        rewards.push(`${purse.gold} GOLD`);
    if (purse.silver > 0)
        rewards.push(`${purse.silver} SILVER`);
    if (purse.bronze > 0)
        rewards.push(`${purse.bronze} BRONZE`);
    for (const reward of definition.rewards.experience) {
        rewards.push(`${reward.amount} ${reward.track.toUpperCase()} XP`);
    }
    for (const reward of definition.rewards.items) {
        const name = itemPresentationName(reward.itemKind, registry);
        rewards.push(`${name.toUpperCase()} ×${reward.count}`);
    }
    if (definition.rewards.homesteadSizeTier !== undefined) {
        rewards.push(`HOMESTEAD TIER ${definition.rewards.homesteadSizeTier}`);
    }
    return `REWARDS: ${rewards.length > 0 ? rewards.join(' / ') : 'NONE'}`;
}
function itemPresentationName(itemKind: string, registry?: ContentRegistry): string {
    if (registry === undefined)
        return itemDefinition(itemKind)?.displayName ?? itemKind.replaceAll('_', ' ');
    const definition = registry.items.get(`item:${itemKind}`);
    return definition === undefined || definition.retired === true
        ? itemKind.replaceAll('_', ' ')
        : definition.displayName;
}
/** A stable retained root; the game runtime owns blocking priority and native input. */
export class NpcInteractionUi {
    readonly root: UiRoot;
    readonly sealFlow = new HearthSealFlow();
    readonly orderFlow = new VillageOrderFlow();
    private model: NpcInteractionModel | null = null;
    private scope: string | null = null;
    private epoch = 0;
    private requestToken = 0;
    private cartGestureKey = '';
    private tab: 'buy' | 'sell' = 'buy';
    private readonly buyQuantities = new Map<string, number>();
    private readonly sellQuantities = new Map<string, number>();
    private transactionPending = false;
    private filterText = '';
    private notice = '';
    private sealsOpen = false;
    private sealPage = 0;
    private ordersOpen = false;
    private inspectingItemKind: string | null = null;
    private readonly host: UiElement;
    private viewKey = '';
    private dialogue: UiDialogueElement | null = null;
    private merchant: UiMerchantElement | null = null;
    private panel: UiMerchantPanelElement | null = null;
    constructor(art: UiKitArt, private readonly itemArt: OverworldUiItemArt, private readonly callbacks: NpcInteractionCallbacks, private readonly drawPortrait: NpcInteractionPortraitDrawer = () => undefined) {
        this.root = new UiRoot({ art, scale: 1, label: 'NPC interaction' });
        this.host = new UiElement({ id: 'game.npc.host', focusable: true, props: { touchScroll: true, singlePointer: true, focusChrome: true }, style: { display: 'stack', width: 'grow', height: 'grow', zLayer: 'modal', visible: false }, onKeyCapture: event => this.key(event) });
        this.root.mount(this.host);
    }
    get active(): boolean { return this.model !== null; }
    private get node() { const model = this.model; if (!model)
        return null; const definition = model.contentRegistry === undefined ? dialogueDefinition(model.dialogueId) : runtimeDialogueDefinition(model.contentRegistry, model.dialogueId); return definition === null ? null : dialogueNode(definition, model.nodeId); }
    get shopOpen(): boolean { return this.node?.mode === 'shop'; }
    get filterValue(): string { return this.filterText; }
    focus(): void { if (this.active)
        this.root.focus.set(this.host, 'keyboard'); }
    dispose(): void { this.epoch++; this.root.dispose(); }
    draw(context: CanvasRenderingContext2D): void { if (this.active)
        this.root.drawInContext(context); }
    setFilterText(value: string): void { const next = value.replace(/[\r\n]/g, '').slice(0, 32); if (next === this.filterText)
        return; this.filterText = next; this.refresh(); }
    update(model: NpcInteractionModel | null): void {
        const scope = model === null ? null : JSON.stringify([model.interactionSessionKey, model.npcId.toString(), model.dialogueId, model.nodeId, model.shopId]);
        if (scope !== this.scope) {
            this.scope = scope;
            this.epoch++;
            this.requestToken++;
            this.transactionPending = false;
            this.buyQuantities.clear();
            this.sellQuantities.clear();
            this.tab = 'buy';
            this.filterText = '';
            this.notice = '';
            this.sealsOpen = false;
            this.ordersOpen = false;
            this.sealPage = 0;
            this.inspectingItemKind = null;
            this.retireView();
        }
        this.model = model;
        this.sealFlow.update(model?.knownRecipeIds === undefined ? null : model.sealSessionKey ?? null, model?.npcId ?? null, model?.nodeId ?? null, model?.contentRegistry, new Set(model?.knownRecipeIds ?? []));
        this.orderFlow.update(model?.orderSessionKey ?? null, model?.npcId ?? null, model?.villageOrders ?? []);
        this.sealPage = Math.min(this.sealPage, Math.max(0, Math.ceil(this.sealFlow.offers.length / 6) - 1));
        if (!this.sealExchangeAvailable())
            this.sealsOpen = false;
        if (this.inspectingItemKind && (!furnitureShopDetails(model?.contentRegistry, this.inspectingItemKind) || !this.allShopRows('buy').some(row => row.itemKind === this.inspectingItemKind)))
            this.inspectingItemKind = null;
        this.reconcileCartQuantities();
        this.refresh();
    }
    private retireView(): void { for (const child of [...this.host.children])
        child.dispose(); this.dialogue = null; this.merchant = null; this.panel = null; this.viewKey = ''; }
    private refresh(): void {
        // A held confirmation belongs to the displayed tab, quantities and prices.
        // Retain controls/focus for ordinary snapshots, but never reinterpret its
        // release as a different transaction after a shortcut or authority update.
        const state = this.shopState;
        const rows = this.allShopRows();
        const cartGestureKey = this.shopOpen ? JSON.stringify([
            this.scope, state.tab, state.canCommit, state.pending,
            state.lines.map(line => [line.itemKind, line.quantity,
                rows.find(row => row.itemKind === line.itemKind)?.unitPrice]),
        ]) : '';
        if (cartGestureKey !== this.cartGestureKey) {
            this.root.input.cancelPointers();
            this.cartGestureKey = cartGestureKey;
        }
        const model = this.model, node = this.node;
        this.host.setStyle({ visible: !!model && !!node });
        if (!model || !node) {
            this.retireView();
            this.root.focus.set(null);
            return;
        }
        this.root.resize(model.width, model.height);
        const width = Math.min(this.shopOpen ? 620 : 500, Math.max(0, model.width - 16)), height = Math.min(420, Math.max(0, model.height - 16));
        const bounds = { position: 'absolute' as const, inset: { left: uiFixed(Math.round((model.width - width) / 2)), top: uiFixed(Math.round((model.height - height) / 2)) }, width: uiFixed(width), height: uiFixed(height) };
        const frame = npcInteractionFrame(model);
        const panelModel = this.panelModel();
        const key = panelModel ? 'panel' : this.shopOpen ? `merchant:${frame?.style ?? 'tonal'}` : 'dialogue';
        const focus = this.root.focus.current?.disposed ? undefined : this.root.focus.current?.id;
        if (key !== this.viewKey) {
            this.retireView();
            this.viewKey = key;
            if (panelModel) {
                this.panel = uiMerchantPanel({ model: panelModel, select: id => this.selectPanel(id), confirm: event => this.confirmPanel(event), back: () => this.back(), close: () => this.back(true), page: delta => { this.sealPage = Math.max(0, Math.min(Math.ceil(this.sealFlow.offers.length / 6) - 1, this.sealPage + delta)); this.refresh(); } });
                this.host.append(this.panel);
            }
            else if (this.shopOpen) {
                this.merchant = uiMerchant({ model: this.merchantModel(), style: frame?.style, artwork: this.itemArt, onTab: tab => { this.tab = tab; this.inspectingItemKind = null; this.refresh(); }, onFilter: query => this.setFilterText(query), onQuantity: (id, value) => this.setQuantity(id, value), onCommit: () => this.commitCart(), onBack: () => this.callbacks.chooseDialogueOption('back'), onClose: () => this.callbacks.closeDialogue(), onSeals: () => { this.sealsOpen = true; this.refresh(); }, canInspect: id => !!furnitureShopDetails(this.model?.contentRegistry, id), onInspect: id => { if (this.tab === 'buy' && this.allShopRows().some(row => row.itemKind === id)) {
                        this.inspectingItemKind = id;
                        this.refresh();
                    } } });
                this.host.append(this.merchant);
            }
            else {
                this.dialogue = uiDialogue({ model: this.dialogueModel(), choose: id => this.chooseChoice(id), onClose: () => this.callbacks.closeDialogue(), portrait: (context, rect) => this.drawPortrait(context, this.model?.npcId ?? 0n, rect) });
                this.host.append(this.dialogue);
            }
        }
        this.dialogue?.updateDialogue(this.dialogueModel());
        this.merchant?.updateMerchant(this.merchantModel());
        if (panelModel)
            this.panel?.updatePanel(panelModel);
        (this.panel ?? this.merchant ?? this.dialogue)?.setStyle({ ...bounds, visible: true });
        this.root.arrange();
        if (focus && (!this.root.focus.current || this.root.focus.current === this.host)) {
            const target = this.root.entries().find(entry => entry.element.id === focus)?.element;
            this.root.focus.set(target ?? this.host, 'keyboard');
        }
    }
    private dialogueModel() { const node = this.node; return { id: `${this.epoch}:${this.model?.nodeId}`, speaker: node?.speaker ?? '', body: node?.body ?? '', choices: this.allDialogueChoices().map(choice => ({ id: choice.id, label: choice.label, tone: choice.tone === 'accept' ? 'success' as const : choice.tone === 'decline' ? 'danger' as const : 'neutral' as const, marker: choice.questMarker === 'offer' ? this.itemArt.quest_offer : choice.questMarker === 'complete' ? this.itemArt.quest_complete : undefined, tooltip: dialogueChoiceRewardTooltip(choice, this.model?.contentRegistry) })) }; }
    private merchantModel() { const state = this.shopState; return { speaker: this.node?.speaker ?? '', title: npcInteractionFrame(this.model!)?.title, tab: this.tab, rows: this.shopRows().map(row => ({ ...row, quantity: this.cartQuantities().get(row.itemKind) ?? 0 })), balanceBronze: this.model?.balanceBronze ?? 0n, totalBronze: state.totalBronze, pending: state.pending, canCommit: state.canCommit, filter: this.filterText, compact: (this.model?.width ?? 0) < 600, sealsAvailable: this.sealExchangeAvailable(), notice: this.notice }; }
    private panelModel(): UiMerchantPanelModel | null {
        if (this.sealsOpen) {
            const flow = this.sealFlow, review = flow.review;
            return { id: review ? `seal:${review.recipeId}:${review.expectedContentHash}` : `seals:${this.sealPage}`, title: 'LEGENDARY RECIPE EXCHANGE', lines: review ? [review.title, `UNLOCK RECIPE: ${review.expectedSeals} GUARDIAN SEALS`, 'Seals must be in your hotbar or backpack.', 'Close the shop; press O to claim rewards.', 'Learn once; craft copies at a workbench.'] : flow.offers.length ? [] : ['No legendary recipes available.'], rows: review ? [] : flow.offers.slice(this.sealPage * 6, this.sealPage * 6 + 6).map((offer, index) => ({ id: offer.recipeId, label: `${index + 1}. ${offer.title}`, detail: `${offer.expectedSeals} seals` })), notice: flow.notice, pending: flow.pending, confirmLabel: review ? 'UNLOCK' : undefined, canConfirm: !!review && !flow.pending, backLabel: review && !flow.pending ? 'BACK' : 'CLOSE', page: this.sealPage, pages: Math.max(1, Math.ceil(flow.offers.length / 6)) };
        }
        if (this.ordersOpen) {
            const flow = this.orderFlow, review = flow.review;
            return { id: review ? `order:${review.id}:${review.revision}:${review.contentHash}` : 'orders', title: 'VILLAGE ORDERS', lines: [flow.milestone?.milestoneTitle ?? '', flow.milestone?.milestoneProgress ?? '', ...(review ? ['YOU DELIVER', `${review.quantity} ${itemPresentationName(review.itemKind, this.model?.contentRegistry)}`, `SALE VALUE: ${review.saleValueBronze} BRONZE`, `ORDER BONUS: ${review.bonusBronze} BRONZE`, `YOU RECEIVE: ${review.totalBronze} BRONZE`] : flow.offers.length ? [] : ['No orders available.'])].filter(Boolean), rows: review ? [] : flow.offers.slice(0, 3).map((offer, index) => ({ id: offer.id, label: `${index + 1}. ${offer.quantity} ${itemPresentationName(offer.itemKind, this.model?.contentRegistry)}`, detail: `Receive ${offer.totalBronze} bronze` })), notice: flow.notice, pending: flow.pending, confirmLabel: review ? 'DELIVER' : undefined, canConfirm: !!review && !flow.pending, backLabel: review && !flow.pending ? 'BACK' : 'CLOSE' };
        }
        const detail = this.inspectingItemKind ? furnitureShopDetails(this.model?.contentRegistry, this.inspectingItemKind) : null;
        if (detail) {
            const row = this.allShopRows('buy').find(row => row.itemKind === this.inspectingItemKind);
            return { id: `furniture:${this.inspectingItemKind}`, title: detail.name, lines: [...detail.lines, `PRICE: ${uiPurseLabel(BigInt(row?.unitPrice ?? 0))}`], rows: [], notice: '', pending: this.transactionPending, confirmLabel: 'ADD TO CART', canConfirm: !!row && (this.cartQuantities('buy').get(row.itemKind) ?? 0) < row.maximumQuantity, backLabel: 'CATALOGUE', image: this.itemArt[detail.itemKind] };
        }
        return null;
    }
    private selectPanel(id: string): void { if (this.sealsOpen)
        this.sealFlow.select(id);
    else if (this.ordersOpen)
        this.orderFlow.select(id); this.refresh(); }
    private confirmPanel(event: UiButtonModifiers = {}): void {
        if (this.sealsOpen && this.callbacks.unlockHearthLegendaryRecipe) {
            const epoch = this.epoch;
            void this.sealFlow.unlock(this.callbacks.unlockHearthLegendaryRecipe).finally(() => { if (epoch === this.epoch && !this.root.disposed)
                this.refresh(); });
        }
        else if (this.ordersOpen && this.callbacks.fulfillVillageOrder) {
            const epoch = this.epoch;
            void this.orderFlow.deliver(this.callbacks.fulfillVillageOrder).finally(() => { if (epoch === this.epoch && !this.root.disposed)
                this.refresh(); });
        }
        else if (this.inspectingItemKind && !this.transactionPending) {
            const row = this.allShopRows('buy').find(row => row.itemKind === this.inspectingItemKind);
            if (row)
                this.setQuantity(row.itemKind, boundedStepperValue(this.cartQuantities('buy').get(row.itemKind) ?? 0, 1, 0, row.maximumQuantity, { shift: event.shiftKey, control: event.ctrlKey }));
            this.inspectingItemKind = null;
        }
        this.refresh();
    }
    private back(close = false): void { if (this.sealsOpen) {
        if (!close && this.sealFlow.review && !this.sealFlow.pending)
            this.sealFlow.cancel();
        else
            this.sealsOpen = false;
    }
    else if (this.ordersOpen) {
        if (!close && this.orderFlow.review && !this.orderFlow.pending)
            this.orderFlow.cancel();
        else
            this.ordersOpen = false;
    }
    else if (this.inspectingItemKind)
        this.inspectingItemKind = null;
    else if (this.shopOpen)
        this.callbacks.chooseDialogueOption('back');
    else
        this.callbacks.closeDialogue(); this.refresh(); }
    private key(event: UiElementKey): boolean {
        if (!this.active)
            return false;
        if (this.root.focus.current?.props['editor']) {
            if (event.key === 'Escape') {
                if (this.filterText)
                    this.setFilterText('');
                else
                    this.focus();
                return true;
            }
            if (event.key === 'Enter') {
                this.focus();
                return true;
            }
            return false;
        }
        if (event.repeat && (['Enter', ' ', 'Escape'].includes(event.key) || /^[1-9lL]$/.test(event.key)))
            return true;
        if (event.key === 'Escape') {
            this.back();
            return true;
        }
        if (event.key === 'Enter' && this.root.focus.current?.kind === 'button')
            return false;
        if (this.sealsOpen || this.ordersOpen) {
            if (event.key === 'Enter' && this.panelModel()?.canConfirm) {
                this.confirmPanel();
                return true;
            }
            if (this.ordersOpen && event.key.toLowerCase() === 'x') {
                this.back(true);
                return true;
            }
            const index = Number(event.key) - 1;
            if (/^[1-6]$/.test(event.key)) {
                const row = this.panelModel()?.rows[index];
                if (row)
                    this.selectPanel(row.id);
                return true;
            }
            if (this.sealsOpen && !this.sealFlow.review && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
                this.sealPage = Math.max(0, Math.min(Math.ceil(this.sealFlow.offers.length / 6) - 1, this.sealPage + (event.key === 'ArrowLeft' ? -1 : 1)));
                this.refresh();
                return true;
            }
            return false;
        }
        if (this.inspectingItemKind) {
            if (event.key === 'Enter') {
                this.confirmPanel(event);
                return true;
            }
            return false;
        }
        if (this.shopOpen) {
            if (event.key === '1' || event.key === '2') {
                this.tab = event.key === '1' ? 'buy' : 'sell';
                this.refresh();
                return true;
            }
            if (event.key.toLowerCase() === 'l' && this.sealExchangeAvailable()) {
                this.sealsOpen = true;
                this.refresh();
                return true;
            }
            return false;
        }
        return this.dialogue?.handleDialogueKey(event.key) ?? false;
    }
    private setQuantity(id: string, value: number): void { if (this.transactionPending)
        return; const row = this.allShopRows().find(row => row.itemKind === id); if (!row || !Number.isFinite(value))
        return; this.cartQuantities().set(id, Math.max(0, Math.min(row.maximumQuantity, Math.floor(value)))); this.notice = ''; this.refresh(); }
    private commitCart(): void {
        const state = this.shopState;
        if (!state.canCommit)
            return;
        const epoch = this.epoch, token = ++this.requestToken;
        this.transactionPending = true;
        this.notice = '';
        this.refresh();
        const current = () => epoch === this.epoch && token === this.requestToken && !this.root.disposed;
        let request: Promise<void>;
        try {
            request = state.tab === 'buy' ? this.callbacks.buy(state.lines) : this.callbacks.sell(state.lines);
        }
        catch {
            if (current()) {
                this.transactionPending = false;
                this.notice = 'Transaction rejected. Your cart is unchanged.';
                this.refresh();
            }
            return;
        }
        void request.then(() => { if (!current())
            return; const quantities = this.cartQuantities(state.tab); for (const line of state.lines)
            quantities.set(line.itemKind, 0); }).catch(() => { if (current())
            this.notice = 'Transaction rejected. Your cart is unchanged.'; }).finally(() => { if (current()) {
            this.transactionPending = false;
            this.refresh();
        } });
    }
    private chooseChoice(id: string): void { if (!this.allDialogueChoices().some(choice => choice.id === id))
        return; if (id === '__village_orders') {
        this.ordersOpen = true;
        this.refresh();
    }
    else
        this.callbacks.chooseDialogueOption(id); }
    get shopState(): NpcShopState {
        const quantities = this.cartQuantities();
        const rows = this.allShopRows();
        const lines = rows.flatMap((row): MerchantCartLine[] => {
            const quantity = quantities.get(row.itemKind) ?? 0;
            return quantity > 0 ? [{ itemKind: row.itemKind, quantity }] : [];
        });
        const totalBronze = lines.reduce((total, line) => {
            const row = rows.find((candidate) => candidate.itemKind === line.itemKind);
            return total + BigInt(row?.unitPrice ?? 0) * BigInt(line.quantity);
        }, 0n);
        const affordable = this.tab === 'sell' || totalBronze <= (this.model?.balanceBronze ?? 0n);
        return {
            tab: this.tab,
            lines,
            totalBronze,
            affordable,
            canCommit: !this.transactionPending && lines.length > 0 && affordable,
            pending: this.transactionPending,
        };
    }
    private allShopRows(tab: 'buy' | 'sell' = this.tab): ShopRow[] {
        if (this.model === null)
            return [];
        if (tab === 'buy') {
            const shopId = this.model.shopId;
            if (shopId === undefined || shopId.length === 0)
                return [];
            const registry = this.model.contentRegistry;
            if (registry !== undefined) {
                const shop = registry.shops.get(`shop:${shopId}`);
                if (shop === undefined || shop.retired === true)
                    return [];
                return shop.offers.flatMap(({ item }): ShopRow[] => {
                    const itemKind = item.slice('item:'.length);
                    const definition = registry.items.get(item);
                    if (definition === undefined || definition.retired === true || definition.economy.buy === null)
                        return [];
                    return [{
                            itemKind,
                            name: definition.displayName,
                            unitPrice: definition.economy.buy,
                            maximumQuantity: definition.maxStack,
                        }];
                });
            }
            return merchantOffers(shopId).flatMap((itemKind): ShopRow[] => {
                const economy = ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY];
                if (economy?.buyPriceBronze == null)
                    return [];
                return [{
                        itemKind,
                        name: itemDefinition(itemKind)?.displayName ?? itemKind,
                        unitPrice: economy.buyPriceBronze,
                        maximumQuantity: maxStackFor(itemKind) ?? 1,
                    }];
            });
        }
        const quantityByKind = new Map<string, number>();
        const capacityEquipment = this.model.inventory.find((slot) => slot.slot === EQUIPMENT_SLOT_OFFSET + 4);
        const capacityDefinition = capacityEquipment === undefined || capacityEquipment.quantity <= 0
            || this.model.contentRegistry === undefined
            ? undefined
            : this.model.contentRegistry.items.get(`item:${capacityEquipment.itemKind}`);
        const authoredCapacity = capacityDefinition?.retired === true
            ? null
            : capacityDefinition?.equip?.inventoryCapacity;
        const capacity = this.model.backpackSlotCapacity ?? authoredCapacity ?? BASE_BACKPACK_CAPACITY;
        const sellableSlotLimit = BACKPACK_SLOT_OFFSET + Math.max(0, Math.min(BACKPACK_SLOT_COUNT, capacity));
        for (const slot of this.model.inventory) {
            if (slot.slot >= sellableSlotLimit || slot.itemKind === 'empty' || slot.quantity <= 0)
                continue;
            quantityByKind.set(slot.itemKind, (quantityByKind.get(slot.itemKind) ?? 0) + slot.quantity);
        }
        const registry = this.model.contentRegistry;
        return [...quantityByKind].flatMap(([itemKind, quantity]) => {
            if (registry !== undefined) {
                const definition = registry.items.get(`item:${itemKind}`);
                if (definition === undefined || definition.retired === true
                    || definition.tags.includes('trade.unsellable')
                    || definition.tags.includes('item.quest_unique'))
                    return [];
                return [{
                        itemKind,
                        name: definition.displayName,
                        unitPrice: this.model?.sellPriceOverrides?.[itemKind] ?? definition.economy.sell,
                        maximumQuantity: quantity,
                        ownedQuantity: quantity,
                    }];
            }
            const economy = ITEM_ECONOMY[itemKind as keyof typeof ITEM_ECONOMY];
            const tags = itemDefinition(itemKind)?.tags ?? [];
            return economy !== undefined && !tags.includes('trade.unsellable') && !tags.includes('item.quest_unique') ? [{
                    itemKind,
                    name: itemDefinition(itemKind)?.displayName ?? itemKind,
                    unitPrice: this.model?.sellPriceOverrides?.[itemKind] ?? economy.sellPriceBronze,
                    maximumQuantity: quantity,
                    ownedQuantity: quantity,
                }] : [];
        }).sort((left, right) => left.name.localeCompare(right.name));
    }
    private shopRows(tab: 'buy' | 'sell' = this.tab): ShopRow[] {
        const query = this.filterText.trim().toLocaleLowerCase();
        const rows = this.allShopRows(tab);
        if (query.length === 0)
            return rows;
        return rows.filter((row) => row.name.toLocaleLowerCase().includes(query)
            || row.itemKind.toLocaleLowerCase().includes(query));
    }
    private cartQuantities(tab: 'buy' | 'sell' = this.tab): Map<string, number> {
        return tab === 'buy' ? this.buyQuantities : this.sellQuantities;
    }
    private reconcileCartQuantities(): void {
        for (const tab of ['buy', 'sell'] as const) {
            const maximumByKind = new Map(this.allShopRows(tab).map((row) => [row.itemKind, row.maximumQuantity]));
            const quantities = this.cartQuantities(tab);
            for (const [itemKind, quantity] of quantities) {
                const maximum = maximumByKind.get(itemKind);
                if (maximum === undefined)
                    quantities.delete(itemKind);
                else
                    quantities.set(itemKind, Math.max(0, Math.min(maximum, quantity)));
            }
        }
    }
    private sealExchangeAvailable(): boolean {
        const npc = this.model?.contentRegistry === undefined || this.model.npcId === undefined
            ? null : hearthRecipeExchangeNpcForRuntimeId(this.model.contentRegistry, this.model.npcId.toString());
        return !!this.callbacks.unlockHearthLegendaryRecipe && !!this.model?.sealSessionKey
            && this.model.knownRecipeIds !== undefined && this.model.nodeId === 'shop'
            && npc !== null;
    }
    private allDialogueChoices(): readonly DialogueChoice[] {
        if (this.model === null)
            return [];
        const definition = (this.model.contentRegistry === undefined ? dialogueDefinition(this.model.dialogueId)
            : runtimeDialogueDefinition(this.model.contentRegistry, this.model.dialogueId));
        const node = definition === null ? null : dialogueNode(definition, this.model.nodeId);
        return node?.mode === 'dialogue'
            ? [...(this.callbacks.fulfillVillageOrder && this.orderFlow.offers.length > 0 ? [{ id: '__village_orders', label: 'Village orders', nextNodeId: null }] : []), ...node.choices.filter((choice) => dialogueChoiceIsAvailable(choice, this.model?.quests, this.model?.contentRegistry))]
            : [];
    }
}
