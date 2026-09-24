import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton, type UiButtonModifiers } from './button.js';
import { uiSprite } from './media.js';
import { uiTooltip } from './tooltip.js';
export interface UiMerchantPanelModel {
    readonly id: string;
    readonly title: string;
    readonly lines: readonly string[];
    readonly rows: readonly {
        readonly id: string;
        readonly label: string;
        readonly detail: string;
    }[];
    readonly notice: string;
    readonly pending: boolean;
    readonly confirmLabel?: string;
    readonly canConfirm?: boolean;
    readonly backLabel: string;
    readonly page?: number;
    readonly pages?: number;
    readonly image?: LoadedAsset;
}
export interface UiMerchantPanelOptions {
    readonly model: UiMerchantPanelModel;
    readonly select: (id: string) => void;
    readonly confirm: (modifiers: UiButtonModifiers) => void;
    readonly back: () => void;
    readonly close: () => void;
    readonly page: (delta: number) => void;
    readonly layout?: UiStyle;
}
export interface UiMerchantPanelElement extends UiElement {
    updatePanel(model: UiMerchantPanelModel): void;
}
/** Presentation only. The production host retains the frozen quotes and authoritative flows. */
export function uiMerchantPanel(options: UiMerchantPanelOptions): UiMerchantPanelElement {
    let model = options.model, key = '';
    const title = uiText(model.title, { role: 'header', layout: { width: 'grow' } });
    const content = uiFlex({ width: 'grow', gap: 6, shrink: 0 });
    const notice = uiText('', { wrap: true, layout: { width: 'grow' } });
    const back = uiButton({ id: 'merchant.panel.back', label: model.backLabel, size: 'sm', onPress: options.back });
    const previous = uiButton({ id: 'merchant.panel.previous', label: '<', ariaLabel: 'Previous offers', size: 'sm', onPress: () => options.page(-1) });
    const next = uiButton({ id: 'merchant.panel.next', label: '>', ariaLabel: 'Next offers', size: 'sm', onPress: () => options.page(1) });
    const page = uiText('');
    const pages = uiFlex({ direction: 'row', gap: 4 }, [previous, page, next]);
    const createConfirm = () => uiButton({ id: 'merchant.panel.confirm', label: 'CONFIRM', size: 'sm', tone: 'success', onPress: event => { if (model.canConfirm && !model.pending)
            options.confirm(event); } });
    let confirm = createConfirm();
    const actions = uiFlex({ direction: 'row', wrap: true, width: 'grow', gap: 4, shrink: 0 }, [back, pages, confirm]);
    const scroll = uiScrollArea({ width: 'grow', height: 'grow', gap: 6 }, [content, notice, actions]);
    const frame = uiFrame({ id: 'game.merchant.panel', padding: 8, header: { title: model.title, content: title, closable: true, onClose: options.close }, layout: { width: 'grow', height: 'grow', ...options.layout }, children: [scroll] });
    const updatePanel = (value: UiMerchantPanelModel) => {
        const changed = model.id !== value.id;
        model = value;
        if (changed) {
            confirm.dispose();
            confirm = createConfirm();
            actions.append(confirm);
        }
        title.setProps({ text: model.title });
        notice.setProps({ text: model.notice }).setStyle({ visible: !!model.notice });
        back.setProps({ label: model.backLabel });
        confirm.setProps({ label: model.pending ? 'PENDING' : model.confirmLabel ?? '' }).setDisabled(!model.canConfirm || model.pending).setStyle({ visible: !!model.confirmLabel });
        pages.setStyle({ visible: (model.pages ?? 1) > 1 });
        previous.setDisabled((model.page ?? 0) <= 0 || model.pending);
        next.setDisabled((model.page ?? 0) + 1 >= (model.pages ?? 1) || model.pending);
        page.setProps({ text: `${(model.page ?? 0) + 1}/${model.pages ?? 1}` });
        const nextKey = JSON.stringify([model.id, model.lines, model.rows, model.image?.name]);
        if (nextKey !== key) {
            key = nextKey;
            if (changed)
                scroll.scroll.y = 0;
            for (const child of [...content.children])
                child.dispose();
            if (model.image)
                content.append(uiSprite(model.image, { label: model.title, animation: Object.keys(model.image.metadata.animations)[0] ?? 'base', playing: false, layout: { width: uiFixed(40), height: uiFixed(48), shrink: 0 } }));
            for (const line of model.lines)
                content.append(uiText(line, { wrap: true, layout: { width: 'grow' } }));
            for (const row of model.rows) {
                const button = uiButton({ id: `merchant.panel.offer:${row.id}`, label: row.label, ariaLabel: row.label, size: 'sm', disabled: model.pending, onPress: () => { if (!model.pending && model.rows.some(current => current.id === row.id))
                        options.select(row.id); }, layout: { width: 'grow' } });
                content.append(uiFlex({ width: 'grow', gap: 2, shrink: 0 }, [uiTooltip(row.label, button, { width: 'grow' }), uiText(row.detail, { wrap: true, layout: { width: 'grow' } })]));
            }
        }
        const disable = (node: UiElement): void => { if (node.id.startsWith('merchant.panel.offer:'))
            node.setDisabled(model.pending); for (const child of node.children)
            disable(child); };
        disable(content);
    };
    updatePanel(model);
    return Object.assign(frame, { updatePanel });
}
