import { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_TONE_FACES } from '../skin/contrast.js';
import { uiFrame } from './frame.js';
import { uiScrollArea } from './layout.js';
import { uiInput } from './input.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
export interface UiCharacterNameModel { readonly busy: boolean; readonly error?: string | null }
export interface UiCharacterNameOptions {
  readonly model?: UiCharacterNameModel; readonly layout?: UiStyle;
  readonly onSubmit: (name: string) => void; readonly onChange?: () => void;
}
export interface UiCharacterNameElement extends UiElement {
  readonly editor: CanvasTextEditor;
  updateCharacterName(model: UiCharacterNameModel): void;
  focusName(): void;
  clearName(): void;
}
/** Required naming gate: Escape clears editing but cannot dismiss the gate. */
export function uiCharacterName(options: UiCharacterNameOptions): UiCharacterNameElement {
  let model = options.model ?? { busy: false };
  const editor = new CanvasTextEditor({ maxLength: 20 });
  const submit = () => { if (!model.busy) options.onSubmit(editor.snapshot().value); };
  const input = uiInput({ id: 'character-name.input', label: 'Character name', editor,
    placeholder: '3-20 CHARACTERS', onSubmit: submit, onChange: options.onChange, layout: { width: 'grow' } });
  const error = uiText('', { id: 'character-name.error', wrap: true });
  const confirm = uiButton({ id: 'character-name.begin', label: 'BEGIN', tone: 'success', onPress: submit, layout: { width: 'grow' } });
  const frame = uiFrame({ header: { title: 'NAME YOUR CHARACTER' }, layout: { position: 'absolute' },
    children: [uiScrollArea({ gap: 8 }, [uiText('THIS IS SEPARATE FROM YOUR LOGIN EMAIL', { wrap: true }), input, confirm, error])] });
  const clearName = () => { if (!model.busy) { editor.setValue(''); options.onChange?.(); input.requestFocus(); } };
  const gate = new UiElement({ id: 'game.character-name', kind: 'character-name', label: 'Name your character',
    style: { display: 'stack', width: 'grow', height: 'grow', zLayer: 'modal', ...options.layout }, children: [frame],
    pointerMode: 'capture', onPointer: () => true, onDismiss: clearName,
    onKey(event) { if (event.key === 'Escape') { clearName(); return true; } return false; },
    measure(_element, available) {
      const width = Math.max(0, Math.min(360, available.width - 16)), height = Math.max(0, Math.min(210, available.height - 16));
      frame.setStyle({ width: uiFixed(width), height: uiFixed(height), inset: {
        left: uiFixed((available.width - width) / 2), top: uiFixed((available.height - height) / 2),
      } });
      return { min: { width: 0, height: 0 }, preferred: available };
    },
    paint(element, { context }) { context.globalAlpha = .35; context.fillStyle = UI_TONE_FACES.muted.button_disabled.face;
      const r = element.rect; context.fillRect(r.x, r.y, r.width, r.height); },
  });
  const updateCharacterName = (next: UiCharacterNameModel): void => {
    model = next; input.setDisabled(model.busy); confirm.setDisabled(model.busy).setProps({ label: model.busy ? 'SAVING...' : 'BEGIN' });
    error.setProps({ text: model.error ?? '' }).setStyle({ visible: Boolean(model.error) });
  };
  updateCharacterName(model);
  return Object.assign(gate, { editor, updateCharacterName, clearName, focusName() { if (!model.busy) input.requestFocus(); } });
}
