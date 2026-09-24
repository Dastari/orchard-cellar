import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiGlyphButton, uiWindow } from './window.js';
import { uiChoiceButton, uiPortraitWell } from './social.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiButton, type UiButtonModifiers } from './button.js';
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
const PANEL_WIDTH = 300;
/** Presentation only. The production host retains the frozen quotes and authoritative flows.
 * Drawn with the approved window kit: the title on the ribbon, an optional item in a portrait well,
 * offers as choice buttons with their detail beneath, and Back, pager and confirm along the foot. */
export function uiMerchantPanel(options: UiMerchantPanelOptions): UiMerchantPanelElement {
    let model = options.model, key = '';
    const content = uiFlex({ direction: 'column', gap: 6, width: uiFixed(PANEL_WIDTH), maxWidth: { mode: 'percent', fraction: 1 }, shrink: 0 });
    const notice = uiText('', { wrap: true, layout: { width: 'grow' } });
    const back = uiButton({ id: 'merchant.panel.back', label: model.backLabel, tone: 'primary', onPress: options.back });
    const previous = uiGlyphButton({ id: 'merchant.panel.previous', glyph: 'glyph.previous', label: 'Previous offers', chrome: 'none', onPress: () => options.page(-1) });
    const next = uiGlyphButton({ id: 'merchant.panel.next', glyph: 'glyph.next', label: 'Next offers', chrome: 'none', onPress: () => options.page(1) });
    const page = uiText('', { align: 'center', layout: { width: uiFixed(32) } });
    const pages = uiFlex({ direction: 'row', gap: 2, align: 'center' }, [previous, page, next]);
    const createConfirm = () => uiButton({ id: 'merchant.panel.confirm', label: 'CONFIRM', tone: 'success', onPress: event => { if (model.canConfirm && !model.pending)
            options.confirm(event); } });
    let confirm = createConfirm();
    const actions = uiFlex({ direction: 'row', wrap: true, align: 'center', gap: 4, shrink: 0, width: uiFixed(PANEL_WIDTH), maxWidth: { mode: 'percent', fraction: 1 } }, [back, pages, uiFlex({ grow: 1 }, []), confirm]);
    const frame = uiWindow({ id: 'game.merchant.panel', title: model.title.toUpperCase(), onClose: options.close, layout: { direction: 'column', gap: 6, ...options.layout }, children: [content, notice, actions] });
    const scroll = frame.children[0]!;
    const updatePanel = (value: UiMerchantPanelModel) => {
        const changed = model.id !== value.id;
        model = value;
        if (changed) {
            confirm.dispose();
            confirm = createConfirm();
            actions.append(confirm);
        }
        frame.setWindowTitle(model.title.toUpperCase());
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
            const lines = model.lines.filter(Boolean).map(line => uiText(line, { wrap: true, layout: { width: 'grow' } }));
            const image = model.image;
            if (image)
                content.append(uiFlex({ direction: 'row', gap: 8, align: 'start', alignSelf: 'stretch' }, [
                    uiPortraitWell({ label: model.title, size: 44, paint: (context, bounds) => {
                        const group = Object.keys(image.metadata.animations)[0] ?? 'base', source = image.metadata.animations[group]?.[0]; if (!source) return;
                        const f = Math.min(2, Math.floor(Math.min(bounds.width / source.width, bounds.height / source.height)) || 1), w = source.width * f, h = source.height * f;
                        context.drawImage(image.image, source.x, source.y, source.width, source.height, bounds.x + Math.floor((bounds.width - w) / 2), bounds.y + Math.floor((bounds.height - h) / 2), w, h);
                    } }),
                    uiFlex({ direction: 'column', gap: 4, grow: 1 }, lines)]));
            else
                for (const line of lines) content.append(line);
            for (const row of model.rows) {
                const button = uiChoiceButton({ id: `merchant.panel.offer:${row.id}`, label: row.label, disabled: model.pending, onPress: () => { if (!model.pending && model.rows.some(current => current.id === row.id))
                        options.select(row.id); }, layout: { width: 'grow' } });
                content.append(uiFlex({ width: 'grow', gap: 2, shrink: 0 }, [uiTooltip(row.label, button, { width: 'grow', height: uiFixed(20) }), uiText(row.detail, { role: 'caption', wrap: true, layout: { width: 'grow' } })]));
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
