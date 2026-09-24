import { uiSpeechBubble } from './anchors.js';
import type { LoadedAsset } from '../../assets.js';
import type { UiRect } from '../../geometry.js';
import type { UiTextLinkTarget } from '../../design-system/rich-text.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiButton } from './button.js';
import { uiRichText, uiText } from './text.js';
import { uiViewport } from './viewport.js';
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
/** The current node owns choice identity. Ordinary snapshots retain its scroll and controls. */
export function uiDialogue(options: UiDialogueOptions): UiDialogueElement {
    let model = options.model, choiceKey = '', speechKey = '';
    const title = uiText(model.speaker, { role: 'header', layout: { width: 'grow' } });
    const speech = uiSpeechBubble({ text: '', tail: 'left', tone: 'primary', layout: { width: 'grow' } });
    for (const child of [...speech.children])
        child.dispose();
    const choices = uiFlex({ width: 'grow', gap: 4 });
    const scroll = uiScrollArea({ width: 'grow', height: 'grow', gap: 8 }, [
        uiFlex({ direction: 'row', width: 'grow', gap: 8, shrink: 0 }, [
            ...(options.portrait ? [uiViewport({ label: 'NPC portrait', render: options.portrait, layout: { width: uiFixed(40), height: uiFixed(48), shrink: 0 } })] : []), speech,
        ]), choices,
    ]);
    const frame = uiFrame({ id: 'game.dialogue', padding: 8, header: { title: model.speaker, content: title, closable: true, onClose: options.onClose }, layout: { width: 'grow', height: 'grow', ...options.layout }, children: [scroll] });
    const choose = (id: string) => { if (model.choices.some(choice => choice.id === id))
        options.choose(id); };
    const updateDialogue = (next: UiDialogueModel) => {
        const scopeChanged = next.id !== model.id;
        model = next;
        title.setProps({ text: model.speaker });
        if (scopeChanged) {
            scroll.scroll.y = 0;
            scroll.scroll.x = 0;
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
            const button = uiButton({ id: `dialogue:${choice.id}`, label: `${index + 1}. ${choice.label}`, ariaLabel: choice.label, tone: choice.tone ?? 'neutral', size: 'sm', leading: choice.marker ? uiSprite(choice.marker, { label: 'Quest marker', animation: Object.keys(choice.marker.metadata.animations)[0] ?? 'base', playing: false, layout: { width: uiFixed(16), height: uiFixed(16) } }) : undefined, onPress: () => choose(choice.id), layout: { width: 'grow', shrink: 0 } });
            choices.append(uiTooltip([choice.label, choice.tooltip].filter(Boolean).join('\n'), button, { width: 'grow', height: uiFixed(choice.marker ? 20 : 16), shrink: 0 }));
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
