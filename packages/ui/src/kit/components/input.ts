import { CanvasTextEditor } from '../runtime/text-editor.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_SIZE_METRICS, type UiControlSize, type UiTone } from '../tokens.js';
import { drawPixelText } from '../../pixel-ui.js';
import { UI_TONE_FACES } from '../skin/contrast.js';
import { paintUiSkin, uiElementTextContrast } from './art.js';
import { uiIcon } from './media.js';
import { uiGlyphButton } from './window.js';
export interface UiInputOptions {
  readonly id?: string; readonly label: string; readonly value?: string; readonly placeholder?: string;
  /** Retained host model. When supplied it owns value, limits and selection. */
  readonly editor?: CanvasTextEditor;
  /** Native keyboard hint only; the host still owns validation and sanitization. */
  readonly inputMode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
  readonly tone?: UiTone; readonly size?: UiControlSize; readonly disabled?: boolean; readonly readOnly?: boolean;
  readonly error?: string; readonly maxLength?: number; readonly layout?: UiStyle;
  readonly leading?: UiElement; readonly trailing?: UiElement; readonly clearable?: boolean;
  readonly onChange?: (value: string) => void; readonly onSubmit?: (value: string) => void;
}
export interface UiTextAreaOptions extends UiInputOptions { readonly rows?: number; readonly lineCount?: boolean; readonly resizable?: boolean }
interface UiTextLine { readonly text: string; readonly start: number }
/** Keeps UTF-16 editor offsets while wrapping by bitmap cells, including surrogate pairs. */
export function uiEditLines(value: string, columns: number, multiline: boolean): UiTextLine[] {
  if (!multiline) return [{ text: value, start: 0 }];
  const lines: UiTextLine[] = []; let text = '', start = 0, offset = 0, cells = 0;
  for (const char of value) {
    if (char === '\n') { lines.push({ text, start }); start = offset + 1; text = ''; cells = 0; }
    else { if (cells >= columns) { lines.push({ text, start }); start = offset; text = ''; cells = 0; } text += char; cells++; }
    offset += char.length;
  }
  lines.push({ text, start }); return lines;
}
function field(options: UiTextAreaOptions, multiline: boolean): UiElement {
  const tone = options.error ? 'danger' : options.tone ?? 'neutral', size = options.size ?? 'md', metrics = UI_SIZE_METRICS[size];
  if (options.editor && (options.value !== undefined || options.maxLength !== undefined)) throw new Error('An external UI editor owns its initial value and length limit');
  const editor = options.editor ?? new CanvasTextEditor({ value: options.value, maxLength: options.maxLength, multiline });
  let offsetY = 0, offsetX = 0, dragging = false, focused = false;
  const gutter = multiline && options.lineCount ? 24 : 0;
  const reveal = (element: UiElement) => {
    if (!multiline) return; const state = editor.snapshot();
    const lines = uiEditLines(state.value, Math.max(1, Math.floor((element.contentRect.width - gutter) / 6)), true);
    const line = Math.max(0, lines.findLastIndex(line => line.start <= state.focus)), rows = Math.max(1, Math.floor(element.contentRect.height / 10));
    offsetY = Math.max(0, Math.min(line, Math.max(offsetY, line - rows + 1)));
  };
  const notify = (element: UiElement) => { reveal(element); const value = editor.snapshot().value;
    if (element.props['value'] !== value) { element.setProps({ value }, false); options.onChange?.(value); }
    element.invalidateRoot?.(false);
  };
  const sync = (element: UiElement) => {
    if (options.editor) { const value = editor.snapshot().value; if (element.props['value'] !== value) element.setProps({ value }, false); return; }
    const value = String(element.props['value'] ?? ''); if (value !== editor.snapshot().value) editor.setValue(value);
  };
  const pointIndex = (element: UiElement, x: number, y: number) => {
    const columns = Math.max(1, Math.floor((element.contentRect.width - gutter) / 6));
    const lines = uiEditLines(editor.snapshot().value, columns, multiline);
    const line = lines[Math.max(0, Math.min(lines.length - 1, Math.floor((y - element.contentRect.y) / 10) + offsetY))]!;
    const count = Math.max(0, Math.floor((x - element.contentRect.x - gutter) / 6) + offsetX);
    return line.start + [...line.text].slice(0, count).join('').length;
  };
  const edit = new UiElement({ id: options.id, kind: multiline ? 'text-area' : 'input', label: options.label, focusable: true, disabled: options.disabled,
    pointerMode: 'capture', props: { value: editor.snapshot().value, tone, editable: !options.readOnly, editor, inputMode: options.inputMode ?? 'text' },
    get animated() { return focused; }, style: { width: 'grow', height: uiFixed(multiline ? Math.max(2, options.rows ?? 4) * 10 + 12 : metrics.controlHeight), padding: 4, ...options.layout },
    onFocus(value, element) { focused = value; if (value) { editor.focus(); reveal(element); } else editor.blur(); element.invalidateRoot?.(false); },
    onPointer(event, element) {
      sync(element);
      if (event.type === 'down' && event.button === 0) { dragging = true; event.capture(); const index = pointIndex(element, event.point.x, event.point.y); editor.setSelection(event.shiftKey ? editor.snapshot().anchor : index, index); notify(element); return true; }
      if (event.type === 'move' && dragging) { editor.setSelection(editor.snapshot().anchor, pointIndex(element, event.point.x, event.point.y)); notify(element); return true; }
      if (dragging && (event.type === 'up' || event.type === 'cancel')) { dragging = false; event.release(); return true; } return false;
    },
    onKey(event, element) {
      sync(element);
      if (event.key === 'Tab' || event.key === 'Escape') return false;
      if (!multiline && event.key === 'Enter') { options.onSubmit?.(editor.snapshot().value); return true; }
      if ((event.ctrlKey || event.metaKey) && ['c', 'x', 'v'].includes(event.key.toLowerCase())) return false;
      if (options.readOnly && !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key) && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) return false;
      if ((event.ctrlKey || event.metaKey) && (event.key === 'Home' || event.key === 'End')) { const caret = event.key === 'Home' ? 0 : editor.snapshot().value.length; editor.setSelection(event.shiftKey ? editor.snapshot().anchor : caret, caret); notify(element); return true; }
      if (multiline && ['ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.key)) {
        const state = editor.snapshot(), lines = uiEditLines(state.value, Math.max(1, Math.floor((element.contentRect.width - gutter) / 6)), true);
        const index = Math.max(0, lines.findLastIndex(line => line.start <= state.focus)), column = [...lines[index]!.text.slice(0, state.focus - lines[index]!.start)].length;
        const delta = (event.key.includes('Down') ? 1 : -1) * (event.key.startsWith('Page') ? Math.max(1, Math.floor(element.contentRect.height / 10)) : 1);
        const target = lines[Math.max(0, Math.min(lines.length - 1, index + delta))]!, caret = target.start + [...target.text].slice(0, column).join('').length;
        editor.setSelection(event.shiftKey ? state.anchor : caret, caret); notify(element); return true;
      }
      const handled = editor.handleKeyDown(event); notify(element); return handled || ['ArrowLeft','ArrowRight','Home','End','Backspace','Delete'].includes(event.key) || !event.ctrlKey && !event.metaKey && [...event.key].length === 1;
    },
    onText(text, element) { if (options.readOnly) return false; sync(element); const handled = editor.handleBeforeInput({ inputType: 'insertText', data: text }); notify(element); return handled; },
    onBeforeInput(event, element) { if (options.readOnly) return false; const handled = editor.handleBeforeInput(event); notify(element); return handled || /^(?:insert|delete)/u.test(event.inputType); },
    onComposition(type, data, element) { if (options.readOnly) return false; const handled = type === 'start' ? editor.handleCompositionStart({ data }) : type === 'update' ? editor.handleCompositionUpdate({ data }) : editor.handleCompositionEnd({ data }); notify(element); return handled; },
    onClipboard(type, data, element) {
      const state = editor.snapshot(), selected = state.value.slice(state.caretStart, state.caretEnd);
      if (type === 'paste' && !options.readOnly) editor.handlePaste(data);
      if (type === 'cut' && !options.readOnly) editor.handleBeforeInput({ inputType: 'deleteByCut' });
      notify(element); return type === 'paste' ? '' : selected;
    },
    onWheel(event, element) {
      if (!multiline) return false;
      const lines = uiEditLines(editor.snapshot().value, Math.max(1, Math.floor((element.contentRect.width - gutter) / 6)), true);
      const max = Math.max(0, lines.length - Math.floor(element.contentRect.height / 10));
      const next = Math.max(0, Math.min(max, offsetY + Math.sign(event.deltaY) * 3));
      if (next === offsetY) return false; offsetY = next; element.invalidateRoot?.(false); return true;
    },
    paint(element, { context, art, now, reducedMotion }) {
      if (!art) return; sync(element);
      if (!element.props['chromeless']) paintUiSkin(context, art.skin.frame, 'thin', element.rect);
      const r = element.contentRect, state = editor.snapshot(), columns = Math.max(1, Math.floor((r.width - gutter) / 6));
      const lines = uiEditLines(state.value || options.placeholder || '', columns, multiline), rows = Math.max(1, Math.floor(r.height / 10));
      const caretLine = Math.max(0, lines.findLastIndex(line => line.start <= state.focus));
      if (focused && dragging) offsetY = Math.max(0, Math.min(offsetY, lines.length - rows));
      if (!multiline) offsetX = focused ? Math.max(0, [...state.value.slice(0, state.focus)].length - columns + 1) : 0;
      const ink = uiElementTextContrast(element.parent ?? element).color;
      context.save(); context.beginPath(); context.rect(r.x, r.y, r.width, r.height); context.clip();
      for (let index = offsetY; index < Math.min(lines.length, offsetY + rows); index++) {
        const line = lines[index]!, shown = [...line.text].slice(offsetX, offsetX + columns).join(''), y = r.y + (multiline ? (index - offsetY) * 10 : Math.floor((r.height - 7) / 2));
        const before = line.start + [...line.text].slice(0, offsetX).join('').length;
        const selectionStart = [...line.text.slice(0, Math.max(0, state.caretStart - line.start))].length - offsetX;
        const selectionEnd = [...line.text.slice(0, Math.max(0, state.caretEnd - line.start))].length - offsetX;
        if (focused && state.caretEnd > before && state.caretStart < line.start + line.text.length) {
          context.fillStyle = UI_TONE_FACES.info.frame.face; context.fillRect(r.x + gutter + Math.max(0, selectionStart) * 6, y, Math.max(0, Math.min(columns, selectionEnd) - Math.max(0, selectionStart)) * 6, 10);
        }
        if (gutter) drawPixelText(context, art.pixel, String(index + 1), r.x, y, { color: ink });
        drawPixelText(context, art.pixel, shown, r.x + gutter, y, { color: state.value ? ink : '#9e5f45' });
        if (focused && caretLine === index && (reducedMotion || Math.floor(now / 530) % 2 === 0)) {
          const caret = [...line.text.slice(0, state.focus - line.start)].length - offsetX;
          context.fillStyle = ink; context.fillRect(r.x + gutter + Math.min(columns - 1, Math.max(0, caret)) * 6, y, 1, 8);
        }
      }
      context.restore();
    },
  });
  edit.setProps({ setValue: (value: string) => { editor.setValue(value); notify(edit); } }, false);
  if (!options.leading && !options.trailing && !options.clearable && !(multiline && options.resizable)) return edit;
  // Inline clear sits inside the field chrome and only appears once there is text to clear.
  const clear = uiGlyphButton({ glyph: 'glyph.cross.primary', chrome: 'none', hideWhenDisabled: true, label: `Clear ${options.label}`, onPress: () => { editor.setValue(''); notify(edit); } });
  const single = !multiline;
  if (single) edit.setProps({ chromeless: true }, false);
  // Single-line fields draw one shared chrome around the leading glyph, text and inline clear.
  const wrapper = new UiElement({ kind: 'input-field', style: { display: 'flex', direction: 'row', gap: 2, align: 'center', width: 'grow',
    ...(single ? { height: uiFixed(metrics.controlHeight), padding: { left: 4, right: 4 } } : {}), ...options.layout }, children: [
    ...(options.leading ? [options.leading] : []), edit.setStyle(single ? { padding: { left: 0, right: 0, top: 4, bottom: 4 } } : {}),
    ...(options.clearable ? [clear] : []),
    ...(options.trailing ? [options.trailing] : []),
  ], paint(element, { context, art }) {
    const empty = !editor.snapshot().value; if (clear.disabled !== empty) clear.setDisabled(empty);
    if (art && single && !art.missingArt) paintUiSkin(context, art.skin.frame, 'thin', element.rect);
  } });
  if (multiline && options.resizable) {
    let start: { y: number; height: number } | null = null;
    wrapper.append(new UiElement({ kind: 'textarea-resize', label: `Resize ${options.label}`, focusable: true, pointerMode: 'capture', style: { width: uiFixed(16), height: uiFixed(16) }, children: [uiIcon({ lucide: 'scale' })],
      onKey(event) { if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false; edit.setStyle({ height: uiFixed(Math.max(32, edit.rect.height + (event.key === 'ArrowDown' ? 10 : -10))) }); return true; },
      onPointer(event) { if (event.type === 'down') { start = { y: event.point.y, height: edit.rect.height }; event.capture(); return true; } if (event.type === 'move' && start) { edit.setStyle({ height: uiFixed(Math.max(32, start.height + event.point.y - start.y)) }); return true; } if (start && (event.type === 'up' || event.type === 'cancel')) { start = null; event.release(); return true; } return false; },
    }));
  }
  return wrapper;
}
export function uiInput(options: UiInputOptions): UiElement { return field(options, false); }
export function uiTextArea(options: UiTextAreaOptions): UiElement { return field(options, true); }
