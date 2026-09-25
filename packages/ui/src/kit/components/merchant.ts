import type { LoadedAsset } from '../../assets.js';
import { boundedStepperValue } from '../../bounded-stepper.js';
import { itemDefinition } from '@orchard/sim/item-containers';
import { drawPixelText, fitPixelText, measurePixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea, uiStack } from './layout.js';
import { uiText } from './text.js';
import { uiInput } from './input.js';
import { uiButton, type UiButtonModifiers } from './button.js';
import type { UiSurfaceStyle } from '../tokens.js';
import { uiTooltip } from './tooltip.js';
import { uiPurseLabel } from './purse.js';
import { uiCurrency, uiCurrencyLabel } from './currency.js';
import { uiItemFrame } from './inventory.js';
import { paintUiSkin } from './art.js';
import { uiFolderTabs } from './social.js';
import { uiGlyph, uiWindow } from './window.js';
export interface UiMerchantRow {
    readonly itemKind: string;
    readonly name: string;
    readonly unitPrice: number;
    readonly maximumQuantity: number;
    readonly quantity: number;
    readonly ownedQuantity?: number;
}
export interface UiMerchantModel {
    readonly speaker: string;
    readonly tab: 'buy' | 'sell';
    readonly rows: readonly UiMerchantRow[];
    readonly balanceBronze: bigint;
    readonly totalBronze: bigint;
    readonly pending: boolean;
    readonly canCommit: boolean;
    readonly filter: string;
    readonly title?: string;
    readonly compact?: boolean;
    readonly sealsAvailable?: boolean;
    readonly notice?: string;
}
export interface UiMerchantOptions {
    readonly model: UiMerchantModel;
    readonly artwork?: Readonly<Record<string, LoadedAsset>>;
    readonly style?: UiSurfaceStyle;
    readonly onInspect?: (itemKind: string) => void;
    readonly canInspect?: (itemKind: string) => boolean;
    readonly onSeals?: () => void;
    readonly onTab: (tab: 'buy' | 'sell') => void;
    readonly onFilter: (query: string) => void;
    readonly onQuantity: (itemKind: string, quantity: number) => void;
    readonly onCommit: () => void;
    readonly onBack: () => void;
    readonly onClose: () => void;
    readonly layout?: UiStyle;
}
export interface UiMerchantElement extends UiElement {
    updateMerchant(model: UiMerchantModel): void;
    readonly filterEditor: CanvasTextEditor;
}
const INK = '#3f2832', MUTED = '#9e5f45', LIST_WIDTH = 300, ROW_HEIGHT = 22, VISIBLE_ROWS = 7;
/** A bare glyph stepper button: minus or plus ink, faded when it cannot step; keeps shift/ctrl modifiers. */
function stepButton(id: string, glyph: string, label: string, onPress: (event: UiButtonModifiers) => void): UiElement {
    return uiButton({ id, label: '', ariaLabel: label, onPress, layout: { width: uiFixed(16), height: uiFixed(16), padding: 0, shrink: 0 },
        face: (element, { context, art, hovered, focused, pressed, disabled }) => {
            const r = element.rect; context.save(); if (disabled) context.globalAlpha *= .35;
            paintUiSkin(context, art.skin.icon, glyph, { ...r, y: r.y + (pressed ? 1 : 0) });
            context.restore();
            if ((hovered || focused) && !disabled) { context.fillStyle = focused ? '#fff6e0' : '#feae34'; context.fillRect(r.x + 3, r.y + r.height - 1, r.width - 6, 1); }
        } });
}
/** Approved merchant window: Buy and Sell folder tabs open into a scrolling list of shop rows, with a search
 * field on the right; the cart total and purse sit above Back and the commit button. Row controls are
 * retained while quantities change so focus and captures survive ordinary snapshots. */
export function uiMerchant(options: UiMerchantOptions): UiMerchantElement {
    let model = options.model, key = '';
    const editor = new CanvasTextEditor({ value: model.filter, maxLength: 32 });
    const controls = new Map<string, { row: UiElement; minus: UiElement; plus: UiElement; name?: UiElement }>();
    // Up and Down move between wares, keeping the column (name, minus or plus) that had focus.
    let focus: { readonly itemKind: string; readonly column: 'name' | 'minus' | 'plus' } | null = null;
    const track = (element: UiElement, itemKind: string, column: 'name' | 'minus' | 'plus') => { Object.assign(element.hooks, { onFocus: (focused: boolean) => { if (focused) focus = { itemKind, column }; else if (focus?.itemKind === itemKind && focus.column === column) focus = null; } }); return element; };
    const current = (itemKind: string) => model.rows.find(row => row.itemKind === itemKind);
    const adjust = (id: string, direction: -1 | 1, event: UiButtonModifiers) => { const row = current(id); if (!row || model.pending)
        return; options.onQuantity(id, boundedStepperValue(row.quantity, direction, 0, row.maximumQuantity, { shift: event.shiftKey, control: event.ctrlKey })); };
    const input = uiInput({ id: 'merchant.filter', label: 'Search wares', placeholder: 'Search', editor, clearable: true, size: 'sm', leading: uiGlyph('glyph.search'), onChange: query => options.onFilter(query), layout: { width: uiFixed(116) } });
    const list = uiScrollArea({ id: 'merchant.stock', label: 'Merchant stock', scrollStyle: 'wood', width: 'grow', height: uiFixed(VISIBLE_ROWS * ROW_HEIGHT), padding: { right: 24 } });
    list.setProps({ touchScroll: true });
    Object.assign(list.hooks, { onKey: (event: { readonly key: string }) => {
        if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || !focus) return false;
        const index = model.rows.findIndex(row => row.itemKind === focus!.itemKind), next = model.rows[index + (event.key === 'ArrowUp' ? -1 : 1)];
        if (index < 0 || !next) return true;
        const target = controls.get(next.itemKind); if (!target) return true;
        (focus.column === 'name' ? target.name ?? target.plus : focus.column === 'minus' ? target.minus : target.plus).requestFocus(); return true;
    } });
    const fit = { mode: 'percent', fraction: 1 } as const;
    const panel = uiFrame({ style: 'parchment_plain', padding: 4, layout: { direction: 'column', gap: 0, width: uiFixed(LIST_WIDTH), maxWidth: fit, padding: { top: 8, left: 4, right: 4, bottom: 4 } }, children: [list] });
    const tabsHost = uiFlex({ direction: 'row', align: 'end' });
    // The panel art keeps a 5px transparent margin: tab feet land on its top border and the first tab starts
    // just inside its left edge, so the tabs open into the panel like folder tabs.
    const header = uiFlex({ direction: 'row', align: 'end', gap: 4, height: uiFixed(21), position: 'absolute', inset: { left: 8, right: 0, top: 0 } }, [
        tabsHost, uiFlex({ grow: 1 }, []), uiFlex({ padding: { bottom: 6, right: 16 } }, [input])]);
    const total = uiCurrency({ bronze: 0 }), purse = uiCurrency({ bronze: 0 });
    const totalLabel = uiText('TOTAL', { role: 'label' });
    const notice = uiText('', { wrap: true, layout: { width: uiFixed(LIST_WIDTH), maxWidth: fit } });
    const commit = uiButton({ id: 'merchant.commit', label: 'Buy', ariaLabel: 'Commit merchant cart', tone: 'success', onPress: () => { if (model.canCommit && !model.pending)
            options.onCommit(); } });
    const seals = uiButton({ id: 'merchant.seals', label: 'Seals', tone: 'primary', onPress: () => { if (model.sealsAvailable)
            options.onSeals?.(); } });
    const back = uiButton({ id: 'merchant.back', label: 'Back', tone: 'primary', onPress: options.onBack });
    const frame = uiWindow({ id: 'game.merchant', title: (model.title ?? `${model.speaker}'s wares`).toUpperCase(), onClose: options.onClose, layout: { direction: 'column', gap: 4, ...options.layout }, children: [
            uiStack({}, [uiFlex({ direction: 'column', padding: { top: 16 } }, [panel]), header]), notice,
            uiFlex({ direction: 'row', align: 'center', gap: 6, width: uiFixed(LIST_WIDTH), maxWidth: fit }, [totalLabel, total, uiFlex({ grow: 1 }, []), uiText('PURSE', { role: 'label' }), purse]),
            uiFlex({ direction: 'row', gap: 4, justify: 'end', wrap: true, width: uiFixed(LIST_WIDTH), maxWidth: fit }, [back, seals, commit]),
        ] });
    const shopRow = (row: UiMerchantRow): UiElement => {
        const art = new UiElement({ kind: 'item-image', label: row.name, style: { width: uiFixed(20), height: uiFixed(20), shrink: 0 },
            paint(element, { context }) {
                const asset = options.artwork?.[row.itemKind], source = asset && uiItemFrame(asset, itemDefinition(row.itemKind)?.iconAnimation); if (!asset || !source) return;
                const f = Math.min(1, 16 / source.width, 16 / source.height), w = Math.round(source.width * f), h = Math.round(source.height * f);
                context.drawImage(asset.image, source.x, source.y, source.width, source.height, element.rect.x + Math.floor((20 - w) / 2), element.rect.y + Math.floor((20 - h) / 2), w, h);
            } });
        const inspectable = model.tab === 'buy' && options.onInspect !== undefined && options.canInspect?.(row.itemKind) === true;
        const paintName = (element: UiElement, context: CanvasRenderingContext2D, pixel: Parameters<typeof drawPixelText>[1], lit: boolean) => {
            const r = element.rect, live = current(row.itemKind) ?? row;
            drawPixelText(context, pixel, fitPixelText(row.name, r.width, 1, pixel.font), r.x, r.y + (live.ownedQuantity !== undefined ? 2 : 6), { color: lit ? '#9e2835' : INK });
            if (live.ownedQuantity !== undefined) drawPixelText(context, pixel, `You have ${live.ownedQuantity}`, r.x, r.y + 11, { color: MUTED });
            if (inspectable) { context.fillStyle = lit ? '#9e2835' : '#e4a672'; context.fillRect(r.x, r.y + (live.ownedQuantity !== undefined ? 10 : 14), Math.min(r.width, measurePixelText(row.name, 1, pixel.font)), 1); }
        };
        const name = inspectable
            ? uiButton({ id: `merchant.inspect:${row.itemKind}`, label: row.name, ariaLabel: `Inspect ${row.name}`, onPress: () => options.onInspect?.(row.itemKind), layout: { width: 'grow', height: uiFixed(20), padding: 0 },
                face: (element, { context, art: kit, hovered, focused }) => paintName(element, context, kit.pixel, hovered || focused) })
            : new UiElement({ kind: 'text', label: row.name, style: { width: 'grow', height: uiFixed(20) }, paint(element, { context, art: kit }) { if (kit) paintName(element, context, kit.pixel, false); } });
        const minus = stepButton(`merchant.minus:${row.itemKind}`, 'glyph.minus', `Decrease ${row.name}`, event => adjust(row.itemKind, -1, event));
        const plus = stepButton(`merchant.plus:${row.itemKind}`, 'glyph.plus', `Increase ${row.name}`, event => adjust(row.itemKind, 1, event));
        const count = new UiElement({ kind: 'quantity', label: 'Quantity', style: { width: uiFixed(20), height: uiFixed(16), shrink: 0 },
            paint(element, { context, art: kit }) {
                if (!kit) return; const quantity = current(row.itemKind)?.quantity ?? 0, text = String(quantity), w = measurePixelText(text, 1, kit.pixel.font);
                drawPixelText(context, kit.pixel, text, element.rect.x + Math.floor((20 - w) / 2), element.rect.y + 5, { color: quantity ? INK : MUTED });
            } });
        const line = new UiElement({ kind: 'shop-row', label: `${row.name}, ${uiPurseLabel(BigInt(row.unitPrice))}`,
            style: { display: 'flex', direction: 'row', gap: 4, align: 'center', height: uiFixed(ROW_HEIGHT), alignSelf: 'stretch', shrink: 0, padding: { left: 2, right: 2 } },
            children: [art, uiTooltip(`${row.name}${row.ownedQuantity === undefined ? '' : ` / OWNED ${row.ownedQuantity}`}`, name, { grow: 1, height: uiFixed(20) }), uiCurrency({ bronze: row.unitPrice }),
                uiFlex({ direction: 'row', align: 'center', shrink: 0 }, [minus, count, plus])],
            paint(element, { context, hovered }) {
                const r = element.rect, quantity = current(row.itemKind)?.quantity ?? 0;
                if (quantity > 0 || hovered) { context.fillStyle = quantity > 0 ? '#e4a672' : 'rgba(228, 166, 114, 0.45)'; context.fillRect(r.x, r.y, r.width, r.height); }
                context.fillStyle = '#e4a672'; context.fillRect(r.x, r.y + r.height - 1, r.width, 1);
            } });
        track(minus, row.itemKind, 'minus'); track(plus, row.itemKind, 'plus'); if (inspectable) track(name, row.itemKind, 'name');
        controls.set(row.itemKind, { row: line, minus, plus, ...(inspectable ? { name } : {}) });
        return line;
    };
    const updateMerchant = (next: UiMerchantModel) => {
        const reset = next.tab !== model.tab || next.filter !== model.filter;
        model = next;
        if (editor.snapshot().value !== next.filter)
            editor.setValue(next.filter);
        frame.setWindowTitle((next.title ?? `${next.speaker}'s wares`).toUpperCase());
        // Folder tabs carry ids merchant.buy and merchant.sell; they rebuild only when the open tab changes.
        if (tabsHost.props['tab'] !== next.tab) {
            const focused = tabsHost.children.flatMap(child => child.children).some(tab => tab.props['focused']);
            for (const child of [...tabsHost.children]) child.dispose();
            const tabs = uiFolderTabs({ id: 'merchant', tabs: [{ id: 'buy', label: 'Buy' }, { id: 'sell', label: 'Sell' }], active: next.tab, onSelect: id => options.onTab(id as 'buy' | 'sell') });
            tabsHost.append(tabs); tabsHost.setProps({ tab: next.tab });
            if (focused) tabs.children.find(tab => tab.props['selected'])?.requestFocus();
        }
        notice.setProps({ text: next.notice ?? '' }).setStyle({ visible: !!next.notice });
        seals.setStyle({ visible: next.sealsAvailable === true });
        for (const [node, bronze] of [[total, next.totalBronze], [purse, next.balanceBronze]] as const) { node.setProps({ bronze }); node.label = uiCurrencyLabel(bronze); }
        const items = next.rows.reduce((sum, row) => sum + row.quantity, 0), verb = next.tab === 'buy' ? 'Buy' : 'Sell';
        commit.setProps({ label: next.pending ? 'Processing' : items > 0 ? `${verb} ${items} item${items === 1 ? '' : 's'}` : verb }).setDisabled(!next.canCommit || next.pending);
        // Owned counts and quantities paint live, so only the set of wares rebuilds the list (keeping focus and held steppers).
        const nextKey = JSON.stringify([next.tab, next.filter, next.compact, next.rows.map(row => [row.itemKind, row.name, row.unitPrice, row.maximumQuantity, row.ownedQuantity !== undefined])]);
        if (nextKey !== key) {
            key = nextKey;
            if (reset) { list.scroll.y = 0; list.scroll.x = 0; }
            for (const child of [...list.children])
                child.dispose();
            controls.clear();
            list.replaceChildren(next.rows.length ? next.rows.map(shopRow)
                : [uiText(next.filter ? `Nothing matches "${next.filter}".` : next.tab === 'buy' ? 'Nothing for sale.' : 'Nothing to sell.', { align: 'center', layout: { width: 'grow' } })]);
        }
        for (const row of next.rows) {
            const control = controls.get(row.itemKind);
            if (!control)
                continue;
            control.row.invalidate();
            control.minus.setDisabled(next.pending || row.quantity <= 0);
            control.plus.setDisabled(next.pending || row.quantity >= row.maximumQuantity);
        }
    };
    updateMerchant(model);
    return Object.assign(frame, { updateMerchant, filterEditor: editor });
}
