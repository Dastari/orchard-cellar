import type { LoadedAsset } from '../../assets.js';
import { boundedStepperValue } from '../../bounded-stepper.js';
import type { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiTable, type UiTableState } from './collections.js';
import { uiText } from './text.js';
import { uiInput } from './input.js';
import { uiButton, type UiButtonModifiers } from './button.js';
import { uiSprite } from './media.js';
import type { UiSurfaceStyle } from '../tokens.js';
import { uiTooltip } from './tooltip.js';
import { uiPurseLabel } from './purse.js';
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
export function uiMerchant(options: UiMerchantOptions): UiMerchantElement {
    let model = options.model, key = '', tableState: UiTableState | undefined;
    const editor = new CanvasTextEditor({ value: model.filter, maxLength: 32 });
    const controls = new Map<string, {
        value: UiElement;
        minus: UiElement;
        plus: UiElement;
    }>();
    const balance = uiText(''), total = uiText(''), notice = uiText('', { wrap: true, layout: { width: 'grow' } }), title = uiText('', { role: 'header', layout: { width: 'grow' } });
    const adjust = (id: string, direction: -1 | 1, event: UiButtonModifiers) => { const row = model.rows.find(row => row.itemKind === id); if (!row || model.pending)
        return; options.onQuantity(id, boundedStepperValue(row.quantity, direction, 0, row.maximumQuantity, { shift: event.shiftKey, control: event.ctrlKey })); };
    const input = uiInput({ id: 'merchant.filter', label: 'Filter merchant items', placeholder: 'FILTER ITEMS', editor, clearable: true, onChange: query => options.onFilter(query), layout: { width: 'grow', shrink: 0 } });
    const tableHost = uiFlex({ width: 'grow', height: uiFixed(220), shrink: 0 });
    const commit = uiButton({ id: 'merchant.commit', label: 'PURCHASE', ariaLabel: 'Commit merchant cart', tone: 'success', size: 'sm', onPress: () => { if (model.canCommit && !model.pending)
            options.onCommit(); } });
    const buy = uiButton({ id: 'merchant.buy', label: 'BUY', size: 'sm', onPress: () => options.onTab('buy') }), sell = uiButton({ id: 'merchant.sell', label: 'SELL', size: 'sm', onPress: () => options.onTab('sell') });
    const tabs = uiFlex({ direction: 'row', gap: 4, shrink: 0 }, [buy, sell]);
    const seals = uiButton({ id: 'merchant.seals', label: 'SEALS', size: 'sm', onPress: () => { if (model.sealsAvailable)
            options.onSeals?.(); } });
    const frame = uiFrame({ id: 'game.merchant', style: options.style, padding: 16, header: { title: `${model.speaker}'S SHOP`, content: title, closable: true, onClose: options.onClose }, layout: { width: 'grow', height: 'grow', ...options.layout }, children: [uiScrollArea({ width: 'grow', height: 'grow', gap: 4 }, [tabs, input, balance, tableHost, total, notice, uiFlex({ direction: 'row', gap: 4, shrink: 0 }, [uiButton({ id: 'merchant.back', label: 'BACK', size: 'sm', onPress: options.onBack }), seals, commit])])] });
    const updateMerchant = (next: UiMerchantModel) => {
        const reset = next.tab !== model.tab || next.filter !== model.filter;
        model = next;
        if (editor.snapshot().value !== next.filter)
            editor.setValue(next.filter);
        buy.setProps({ tone: next.tab === 'buy' ? 'primary' : 'neutral' });
        sell.setProps({ tone: next.tab === 'sell' ? 'primary' : 'neutral' });
        title.setProps({ text: next.title ?? `${next.speaker}'S SHOP` });
        notice.setProps({ text: next.notice ?? '' }).setStyle({ visible: !!next.notice });
        seals.setStyle({ visible: next.sealsAvailable === true });
        balance.setProps({ text: `BALANCE ${uiPurseLabel(next.balanceBronze)}` });
        total.setProps({ text: `${next.tab.toUpperCase()} TOTAL ${uiPurseLabel(next.totalBronze)}` });
        commit.setProps({ label: next.pending ? 'PROCESSING' : next.tab === 'buy' ? 'PURCHASE' : 'SELL' }).setDisabled(!next.canCommit || next.pending);
        const nextKey = JSON.stringify([next.tab, next.filter, next.compact, next.rows.map(row => [row.itemKind, row.name, row.unitPrice, row.maximumQuantity, row.ownedQuantity])]);
        if (nextKey !== key) {
            key = nextKey;
            if (reset)
                tableState = undefined;
            for (const child of [...tableHost.children])
                child.dispose();
            controls.clear();
            tableHost.append(uiTable({ id: 'merchant.stock', label: 'Merchant stock', surface: 'game', pageSize: 6, rows: next.rows, key: row => row.itemKind, state: tableState, onStateChange: state => { tableState = state; }, columns: [
                    { id: 'item', label: 'Item', value: row => row.name, render: row => { const asset = options.artwork?.[row.itemKind]; return uiFlex({ direction: 'row', gap: 4, width: 'grow' }, [...(asset ? [uiSprite(asset, { label: row.name, animation: Object.keys(asset.metadata.animations)[0] ?? 'base', playing: false, layout: { width: uiFixed(16), height: uiFixed(16), shrink: 0 } })] : []), uiTooltip(`${row.name}${row.ownedQuantity === undefined ? '' : ` / OWNED ${row.ownedQuantity}`}`, model.tab === 'buy' && options.onInspect && options.canInspect?.(row.itemKind) ? uiButton({ id: `merchant.inspect:${row.itemKind}`, label: row.name, ariaLabel: `Inspect ${row.name}`, size: 'sm', onPress: () => options.onInspect?.(row.itemKind), layout: { width: 'grow' } }) : uiText(row.name, { overflow: 'ellipsis', layout: { width: 'grow' } }), { width: 'grow' })]); } },
                    { id: 'price', label: 'Price', width: uiFixed(next.compact ? 64 : 108), value: (row: UiMerchantRow) => row.unitPrice, render: (row: UiMerchantRow) => uiText(uiPurseLabel(BigInt(row.unitPrice))) },
                    ...(!next.compact ? [{ id: 'owned', label: 'Owned', width: uiFixed(52), value: (row: UiMerchantRow) => row.ownedQuantity ?? 0, render: (row: UiMerchantRow) => uiText(row.ownedQuantity === undefined ? '-' : String(row.ownedQuantity)) }] : []),
                    { id: 'quantity', label: 'Quantity', width: uiFixed(84), sortable: false, value: row => row.quantity, render: row => { const current = () => model.rows.find(entry => entry.itemKind === row.itemKind) ?? row; const value = uiText(model.compact && row.ownedQuantity !== undefined ? `${current().quantity}/${current().ownedQuantity}` : String(current().quantity), { align: 'center', layout: { width: 'grow' } }); const minus = uiButton({ id: `merchant.minus:${row.itemKind}`, label: '-', ariaLabel: `Decrease ${row.name}`, size: 'sm', disabled: model.pending || current().quantity === 0, onPress: event => adjust(row.itemKind, -1, event) }), plus = uiButton({ id: `merchant.plus:${row.itemKind}`, label: '+', ariaLabel: `Increase ${row.name}`, size: 'sm', disabled: model.pending || current().quantity >= current().maximumQuantity, onPress: event => adjust(row.itemKind, 1, event) }); controls.set(row.itemKind, { value, minus, plus }); return uiFlex({ direction: 'row', width: 'grow', gap: 2 }, [minus, value, plus]); } },
                ] }));
        }
        for (const row of next.rows) {
            const control = controls.get(row.itemKind);
            if (!control)
                continue;
            control.value.setProps({ text: next.compact && row.ownedQuantity !== undefined ? `${row.quantity}/${row.ownedQuantity}` : String(row.quantity) });
            control.minus.setDisabled(next.pending || row.quantity <= 0);
            control.plus.setDisabled(next.pending || row.quantity >= row.maximumQuantity);
        }
    };
    updateMerchant(model);
    return Object.assign(frame, { updateMerchant, filterEditor: editor });
}
