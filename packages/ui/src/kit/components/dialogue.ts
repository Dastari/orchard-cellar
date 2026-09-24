import type { LoadedAsset } from '../../assets.js';
import type { UiRect } from '../../geometry.js';
import type { UiTextLinkTarget } from '../../design-system/rich-text.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { uiWindow } from './window.js';
import { uiChoiceButton, uiPortraitWell } from './social.js';
import { uiFlex, uiStack } from './layout.js';
import { uiRichText } from './text.js';
import { uiSprite } from './media.js';
import { uiTooltip } from './tooltip.js';
export interface UiDialogueChoice {
    readonly id: string;
    readonly label: string;
    readonly tone?: UiTone;
    readonly marker?: LoadedAsset;
    readonly tooltip?: string | null;
}
export interface UiDialogueModel {
    readonly id: string;
    readonly speaker: string;
    readonly body: string;
    readonly choices: readonly UiDialogueChoice[];
}
export interface UiDialogueOptions {
    readonly model: UiDialogueModel;
    readonly choose: (id: string) => void;
    readonly onClose: () => void;
    readonly onLink?: (target: UiTextLinkTarget) => void;
    readonly portrait?: (context: CanvasRenderingContext2D, bounds: UiRect) => void;
    readonly layout?: UiStyle;
}
export interface UiDialogueElement extends UiElement {
    updateDialogue(model: UiDialogueModel): void;
    handleDialogueKey(code: string): boolean;
}
const CHOICE_TONES: Partial<Record<UiTone, 'primary' | 'success' | 'danger'>> = { success: 'success', danger: 'danger' };
/** Approved dialogue window: the speaker's name on the ribbon, their portrait in a framed well beside the
 * speech, and numbered choice buttons below. The current node owns choice identity; ordinary snapshots
 * retain the window's scroll and controls. */
export function uiDialogue(options: UiDialogueOptions): UiDialogueElement {
    let model = options.model, choiceKey = '', speechKey = '';
    const speech = uiFlex({ width: 'grow', grow: 1, basis: uiFixed(160) });
    const choices = uiFlex({ width: 'grow', gap: 2 });
    const body = uiFlex({ direction: 'column', gap: 8, width: uiFixed(320), maxWidth: { mode: 'percent', fraction: 1 } }, [
        uiFlex({ direction: 'row', width: 'grow', gap: 8, align: 'start', shrink: 0 }, [
            ...(options.portrait ? [uiPortraitWell({ label: model.speaker, paint: options.portrait })] : []), speech,
        ]), choices,
    ]);
    const frame = uiWindow({ id: 'game.dialogue', title: model.speaker.toUpperCase(), onClose: options.onClose, layout: { direction: 'column', ...options.layout }, children: [body] });
    const scroll = frame.children[0]!;
    const choose = (id: string) => { if (model.choices.some(choice => choice.id === id))
        options.choose(id); };
    const updateDialogue = (next: UiDialogueModel) => {
        const scopeChanged = next.id !== model.id;
        model = next;
        frame.setWindowTitle(model.speaker.toUpperCase());
        if (scopeChanged) {
            scroll.scroll.y = 0; scroll.scroll.x = 0;
        }
        if (speechKey !== next.body) {
            speechKey = next.body;
            for (const child of [...speech.children])
                child.dispose();
            speech.append(uiRichText(next.body, { wrap: true, onLink: options.onLink, layout: { width: 'grow' } }));
        }
        const nextKey = JSON.stringify([next.id, next.choices.map(choice => [choice.id, choice.label, choice.tone, choice.marker?.name, choice.tooltip])]);
        if (nextKey === choiceKey)
            return;
        choiceKey = nextKey;
        // Retire old choice captures together with their old identity/conditions.
        for (const child of [...choices.children])
            child.dispose();
        for (const [index, choice] of next.choices.entries()) {
            const button = uiChoiceButton({ id: `dialogue:${choice.id}`, index: index + 1, label: choice.label, tone: CHOICE_TONES[choice.tone ?? 'primary'] ?? 'primary', onPress: () => choose(choice.id), layout: { width: 'grow' } });
            button.label = choice.label;
            // A quest marker stands at the choice's right end.
            const marker = choice.marker ? uiSprite(choice.marker, { label: 'Quest marker', animation: Object.keys(choice.marker.metadata.animations)[0] ?? 'base', playing: true,
                layout: { position: 'absolute', inset: { right: 4, top: 2 }, width: uiFixed(16), height: uiFixed(16) } }) : null;
            const row = marker ? uiStack({ width: 'grow', height: uiFixed(20), shrink: 0 }, [button, marker]) : button;
            choices.append(uiTooltip([choice.label, choice.tooltip].filter(Boolean).join('\n'), row, { width: 'grow', height: uiFixed(20), shrink: 0 }));
        }
    };
    const handleDialogueKey = (code: string) => { if (code === 'Escape') {
        options.onClose();
        return true;
    } const match = /^(?:Digit)?([1-9])$/.exec(code); if (!match)
        return false; const choice = model.choices[Number(match[1]) - 1]; if (choice)
        choose(choice.id); return true; };
    updateDialogue(model);
    return Object.assign(frame, { updateDialogue, handleDialogueKey });
}
