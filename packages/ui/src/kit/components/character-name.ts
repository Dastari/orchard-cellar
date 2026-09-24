import type { LoadedAsset } from '../../assets.js';
import type { UiRect } from '../../geometry.js';
import { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_TONE_FACES } from '../skin/contrast.js';
import { uiFlex, uiStack } from './layout.js';
import { uiInput } from './input.js';
import { uiText } from './text.js';
import { uiViewport } from './viewport.js';
import { uiHeroButton, uiLiveNameplate, uiTitleFrame, uiTitleFrameLayout, uiTitleNotice, uiTitleSentence } from './gateway-game.js';
export interface UiCharacterNameModel { readonly busy: boolean; readonly error?: string | null }
export interface UiCharacterNameOptions {
  readonly model?: UiCharacterNameModel; readonly layout?: UiStyle;
  readonly onSubmit: (name: string) => void; readonly onChange?: () => void;
  /** Paints the player's character, facing the viewer, into the preview beside the field. */
  readonly portrait?: (context: CanvasRenderingContext2D, bounds: UiRect) => void;
  readonly cask?: LoadedAsset;
}
export interface UiCharacterNameElement extends UiElement {
  readonly editor: CanvasTextEditor;
  updateCharacterName(model: UiCharacterNameModel): void;
  focusName(): void;
  clearName(): void;
}
const PORTRAIT = { width: 96, height: 80, gap: 12 } as const, COLUMN = { wide: 150, compact: 130, minimum: 110, alone: 170 };
/** Required naming gate in the title flow's constant frame (logo sign over the fixed wood window):
 * NAME YOUR CHARACTER with the live nameplate over the portrait, the field and Begin. Validation errors
 * replace the question as a dark notice. Escape clears editing but cannot dismiss the gate. */
export function uiCharacterName(options: UiCharacterNameOptions): UiCharacterNameElement {
  let model = options.model ?? { busy: false };
  const editor = new CanvasTextEditor({ maxLength: 20 });
  const submit = () => { if (!model.busy) options.onSubmit(editor.snapshot().value); };
  const input = uiInput({ id: 'character-name.input', label: 'Character name', editor,
    placeholder: '3 to 20 letters', onSubmit: submit, onChange: options.onChange, layout: { width: 'grow', shrink: 0 } });
  const question = uiText('What should the island call you?', { wrap: true, layout: { width: 'grow' } });
  const error = uiTitleNotice({ id: 'character-name.error', layout: { alignSelf: 'stretch' } });
  const confirm = uiHeroButton({ id: 'character-name.begin', label: 'Begin', width: COLUMN.wide, onPress: submit });
  const column = uiFlex({ direction: 'column', gap: 6, width: uiFixed(COLUMN.wide), shrink: 0 }, [question, error, input, confirm]);
  const preview = options.portrait ? uiStack({ width: uiFixed(PORTRAIT.width), height: uiFixed(PORTRAIT.height), shrink: 0 }, [
    uiViewport({ label: 'Character preview', render: options.portrait, layout: { width: uiFixed(64), height: uiFixed(PORTRAIT.height), inset: { left: uiFixed(16), top: uiFixed(0) }, position: 'absolute' } }),
    // The live nameplate floats just above the preview's head, as other players will see it.
    uiFlex({ direction: 'row', justify: 'center', position: 'absolute', inset: { left: 0, right: 0, top: 16 } }, [uiLiveNameplate({ name: () => editor.snapshot().value.trim().replace(/\s+/gu, ' ') })]),
  ]) : null;
  const row = uiFlex({ direction: 'row', gap: PORTRAIT.gap, align: 'center', justify: 'center', width: 'grow', shrink: 0 }, [...(preview ? [preview] : []), column]);
  const frame = uiTitleFrame({ id: 'game.character-name.frame', title: 'NAME YOUR CHARACTER', reserveFooter: false, cask: options.cask, body: [row] });
  const clearName = () => { if (!model.busy) { editor.setValue(''); options.onChange?.(); input.requestFocus(); } };
  let fitted = '';
  const gate = new UiElement({ id: 'game.character-name', kind: 'character-name', label: 'Name your character',
    style: { display: 'stack', width: 'grow', height: 'grow', zLayer: 'modal', ...options.layout }, children: [frame],
    pointerMode: 'capture', onPointer: () => true, onDismiss: clearName,
    onKey(event) { if (event.key === 'Escape') { clearName(); return true; } return false; },
    onArrange(element) {
      // The frame picks its body width per viewport class; fit the field column (and the preview, if room) to it.
      const body = uiTitleFrameLayout(element.contentRect.width, element.contentRect.height, false).body.width - 12;
      const beside = preview ? body - PORTRAIT.width - PORTRAIT.gap : 0, showPreview = preview !== null && beside >= COLUMN.minimum;
      const width = showPreview ? Math.min(body >= 260 ? COLUMN.wide : COLUMN.compact, beside) : Math.max(0, Math.min(COLUMN.alone, body));
      const key = `${width}:${showPreview}`; if (key === fitted) return; fitted = key;
      preview?.setStyle({ visible: showPreview }); column.setStyle({ width: uiFixed(width) }); confirm.setStyle({ width: uiFixed(width) });
    },
    paint(element, { context }) { context.globalAlpha = .35; context.fillStyle = UI_TONE_FACES.muted.button_disabled.face;
      const r = element.rect; context.fillRect(r.x, r.y, r.width, r.height); },
  });
  const updateCharacterName = (next: UiCharacterNameModel): void => {
    model = next; input.setDisabled(model.busy); confirm.setDisabled(model.busy).setProps({ label: model.busy ? 'Saving...' : 'Begin' });
    const text = model.error ? uiTitleSentence(model.error) : '';
    error.setText(text); error.setStyle({ visible: text !== '' }); question.setStyle({ visible: text === '' });
  };
  updateCharacterName(model);
  return Object.assign(gate, { editor, updateCharacterName, clearName, focusName() { if (!model.busy) input.requestFocus(); } });
}
