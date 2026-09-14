export interface CanvasClipboardBoundary {
  readonly readText: () => string;
  readonly writeText: (text: string) => void;
}

export interface CanvasTextEditorOptions {
  readonly value?: string;
  readonly maxLength?: number;
  readonly multiline?: boolean;
  readonly clipboard?: CanvasClipboardBoundary;
  readonly onChange?: (snapshot: CanvasTextEditorSnapshot) => void;
}

export interface CanvasTextEditorSnapshot {
  readonly value: string;
  readonly anchor: number;
  readonly focus: number;
  readonly caretStart: number;
  readonly caretEnd: number;
  readonly composing: boolean;
  readonly compositionText: string;
  readonly focused: boolean;
}

export interface CanvasTextKeyEvent {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
}

export interface CanvasBeforeInputEvent {
  readonly inputType: string;
  readonly data?: string | null;
}

export interface CanvasCompositionEvent {
  readonly data?: string | null;
}

export interface CanvasTextPresentation {
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly caret: number;
  readonly caretVisible: boolean;
}

interface CompositionBase {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

function previousBoundary(value: string, index: number): number {
  if (index <= 0) return 0;
  let next = index - 1;
  const code = value.charCodeAt(next);
  if (code >= 0xdc00 && code <= 0xdfff && next > 0) {
    const before = value.charCodeAt(next - 1);
    if (before >= 0xd800 && before <= 0xdbff) next -= 1;
  }
  return next;
}

function nextBoundary(value: string, index: number): number {
  if (index >= value.length) return value.length;
  const code = value.charCodeAt(index);
  return code >= 0xd800 && code <= 0xdbff
    && index + 1 < value.length
    && value.charCodeAt(index + 1) >= 0xdc00
    && value.charCodeAt(index + 1) <= 0xdfff
    ? index + 2
    : index + 1;
}

function clampedBoundary(value: string, index: number): number {
  const clamped = Number.isFinite(index) ? Math.max(0, Math.min(value.length, Math.trunc(index))) : 0;
  if (clamped > 0 && clamped < value.length) {
    const code = value.charCodeAt(clamped);
    const before = value.charCodeAt(clamped - 1);
    if (code >= 0xdc00 && code <= 0xdfff && before >= 0xd800 && before <= 0xdbff) return clamped - 1;
  }
  return clamped;
}

function countCharacters(value: string): number {
  return [...value].length;
}

function takeCharacters(value: string, maximum: number): string {
  return [...value].slice(0, Math.max(0, maximum)).join('');
}

function allowedCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return character === '\n' || character === '\t'
    || (code >= 0x20 && code !== 0x7f);
}

function normalizedText(value: string, multiline: boolean): string {
  const normalized = [...value.replace(/\r\n?/gu, '\n')].filter(allowedCharacter).join('');
  return multiline ? normalized : normalized.replace(/\n/gu, ' ');
}

/** Bitmap renderers can paint this immutable selection/caret projection using
 * their own glyph metrics. Blink time is injected; the editor owns no timer. */
export function canvasTextPresentation(
  snapshot: CanvasTextEditorSnapshot,
  now: number,
  blinkPeriod = 1_060,
): CanvasTextPresentation {
  const safePeriod = Number.isFinite(blinkPeriod) && blinkPeriod > 0 ? blinkPeriod : 1_060;
  return Object.freeze({
    selectionStart: Math.min(snapshot.anchor, snapshot.focus),
    selectionEnd: Math.max(snapshot.anchor, snapshot.focus),
    caret: snapshot.focus,
    caretVisible: snapshot.focused && Math.floor(Math.max(0, now) / (safePeriod / 2)) % 2 === 0,
  });
}

/** Pure editing state for a canvas-drawn textbox. No hidden DOM input, browser
 * globals, timers, or document-created controls are used. */
export class CanvasTextEditor {
  readonly #maxLength: number;
  readonly #multiline: boolean;
  readonly #clipboard: CanvasClipboardBoundary | undefined;
  readonly #onChange: ((snapshot: CanvasTextEditorSnapshot) => void) | undefined;
  #value: string;
  #anchor = 0;
  #focus = 0;
  #focused = false;
  #composition: CompositionBase | null = null;
  #compositionText = '';

  constructor(options: CanvasTextEditorOptions = {}) {
    const maxLength = options.maxLength ?? 4_096;
    if (!Number.isSafeInteger(maxLength) || maxLength < 0) throw new Error('canvas_text_max_length_invalid');
    this.#maxLength = maxLength;
    this.#multiline = options.multiline === true;
    this.#clipboard = options.clipboard;
    this.#onChange = options.onChange;
    this.#value = takeCharacters(normalizedText(options.value ?? '', this.#multiline), maxLength);
    this.#anchor = this.#value.length;
    this.#focus = this.#value.length;
  }

  snapshot(): CanvasTextEditorSnapshot {
    return Object.freeze({
      value: this.#value,
      anchor: this.#anchor,
      focus: this.#focus,
      caretStart: Math.min(this.#anchor, this.#focus),
      caretEnd: Math.max(this.#anchor, this.#focus),
      composing: this.#composition !== null,
      compositionText: this.#compositionText,
      focused: this.#focused,
    });
  }

  focus(): void { this.#focused = true; }
  blur(): void {
    this.#focused = false;
    if (this.#composition !== null) this.handleCompositionEnd({ data: this.#compositionText });
  }

  setValue(value: string): void {
    if (typeof value !== 'string') throw new Error('canvas_text_value_invalid');
    const next = takeCharacters(normalizedText(value, this.#multiline), this.#maxLength);
    this.#composition = null;
    this.#compositionText = '';
    this.#commit(next, next.length, next.length);
  }

  setSelection(anchor: number, focus = anchor): boolean {
    if (!Number.isFinite(anchor) || !Number.isFinite(focus)) return false;
    this.#anchor = clampedBoundary(this.#value, anchor);
    this.#focus = clampedBoundary(this.#value, focus);
    return true;
  }

  handlePaste(text: string): boolean {
    if (typeof text !== 'string') return false;
    return this.#replaceSelection(text);
  }

  handleCompositionStart(event: CanvasCompositionEvent = {}): boolean {
    if (event.data !== undefined && event.data !== null && typeof event.data !== 'string') return false;
    if (this.#composition !== null) return false;
    this.#composition = {
      value: this.#value,
      start: Math.min(this.#anchor, this.#focus),
      end: Math.max(this.#anchor, this.#focus),
    };
    this.#compositionText = '';
    return true;
  }

  handleCompositionUpdate(event: CanvasCompositionEvent): boolean {
    if (this.#composition === null || typeof event.data !== 'string') return false;
    return this.#applyComposition(event.data, false);
  }

  handleCompositionEnd(event: CanvasCompositionEvent = {}): boolean {
    if (this.#composition === null) return false;
    const text = typeof event.data === 'string' ? event.data : this.#compositionText;
    return this.#applyComposition(text, true);
  }

  handleBeforeInput(event: CanvasBeforeInputEvent): boolean {
    if (typeof event.inputType !== 'string') return false;
    switch (event.inputType) {
      case 'insertText':
        return typeof event.data === 'string' && this.#replaceSelection(event.data);
      case 'insertLineBreak':
      case 'insertParagraph':
        return this.#multiline && this.#replaceSelection('\n');
      case 'insertFromPaste':
        return typeof event.data === 'string' && this.handlePaste(event.data);
      case 'insertCompositionText':
        return this.#composition !== null
          && typeof event.data === 'string'
          && this.handleCompositionUpdate({ data: event.data });
      case 'insertFromComposition':
        return this.#composition !== null
          && this.handleCompositionEnd({ data: event.data });
      case 'deleteContentBackward':
        return this.#deleteBackward();
      case 'deleteContentForward':
        return this.#deleteForward();
      case 'deleteByCut':
        return this.#deleteSelection();
      default:
        return false;
    }
  }

  handleKeyDown(event: CanvasTextKeyEvent): boolean {
    const shortcut = event.ctrlKey === true || event.metaKey === true;
    if (shortcut && event.altKey !== true) {
      const key = event.key.toLowerCase();
      if (key === 'a') {
        this.#anchor = 0;
        this.#focus = this.#value.length;
        return true;
      }
      if (key === 'c') return this.#copySelection();
      if (key === 'x') return this.#cutSelection();
      if (key === 'v') return this.#pasteFromBoundary();
    }
    if (shortcut || event.altKey === true || this.#composition !== null) return false;
    switch (event.key) {
      case 'Backspace': return this.#deleteBackward();
      case 'Delete': return this.#deleteForward();
      case 'ArrowLeft': return this.#moveHorizontal(-1, event.shiftKey === true);
      case 'ArrowRight': return this.#moveHorizontal(1, event.shiftKey === true);
      case 'ArrowUp': return this.#moveVertical(-1, event.shiftKey === true);
      case 'ArrowDown': return this.#moveVertical(1, event.shiftKey === true);
      case 'Home': return this.#moveHome(event.shiftKey === true);
      case 'End': return this.#moveEnd(event.shiftKey === true);
      case 'Enter': return this.#multiline && this.#replaceSelection('\n');
      default:
        return [...event.key].length === 1
          && allowedCharacter(event.key)
          && event.key !== '\n' && event.key !== '\t'
          && this.#replaceSelection(event.key);
    }
  }

  #commit(value: string, anchor: number, focus: number): boolean {
    const changed = value !== this.#value;
    this.#value = value;
    this.#anchor = clampedBoundary(value, anchor);
    this.#focus = clampedBoundary(value, focus);
    if (changed) this.#onChange?.(this.snapshot());
    return changed;
  }

  #replaceSelection(text: string): boolean {
    this.#composition = null;
    this.#compositionText = '';
    const start = Math.min(this.#anchor, this.#focus);
    const end = Math.max(this.#anchor, this.#focus);
    const outside = this.#value.slice(0, start) + this.#value.slice(end);
    const capacity = this.#maxLength - countCharacters(outside);
    const insertion = takeCharacters(normalizedText(text, this.#multiline), capacity);
    if (insertion.length === 0 && start === end) return false;
    const next = this.#value.slice(0, start) + insertion + this.#value.slice(end);
    const caret = start + insertion.length;
    return this.#commit(next, caret, caret);
  }

  #deleteSelection(): boolean {
    if (this.#anchor === this.#focus) return false;
    return this.#replaceSelection('');
  }

  #deleteBackward(): boolean {
    if (this.#deleteSelection()) return true;
    if (this.#focus === 0) return false;
    const start = previousBoundary(this.#value, this.#focus);
    const next = this.#value.slice(0, start) + this.#value.slice(this.#focus);
    return this.#commit(next, start, start);
  }

  #deleteForward(): boolean {
    if (this.#deleteSelection()) return true;
    if (this.#focus === this.#value.length) return false;
    const end = nextBoundary(this.#value, this.#focus);
    const next = this.#value.slice(0, this.#focus) + this.#value.slice(end);
    return this.#commit(next, this.#focus, this.#focus);
  }

  #moveHorizontal(direction: -1 | 1, selecting: boolean): boolean {
    let caret: number;
    if (!selecting && this.#anchor !== this.#focus) {
      caret = direction < 0 ? Math.min(this.#anchor, this.#focus) : Math.max(this.#anchor, this.#focus);
    } else {
      caret = direction < 0
        ? previousBoundary(this.#value, this.#focus)
        : nextBoundary(this.#value, this.#focus);
    }
    if (caret === this.#focus && (selecting || this.#anchor === this.#focus)) return false;
    if (selecting) this.#focus = caret;
    else this.#anchor = this.#focus = caret;
    return true;
  }

  #moveVertical(direction: -1 | 1, selecting: boolean): boolean {
    if (!this.#multiline) return this.#moveHorizontal(direction, selecting);
    const lineStart = this.#value.lastIndexOf('\n', Math.max(0, this.#focus - 1)) + 1;
    const column = this.#focus - lineStart;
    let caret: number;
    if (direction < 0) {
      if (lineStart === 0) caret = 0;
      else {
        const previousEnd = lineStart - 1;
        const previousStart = this.#value.lastIndexOf('\n', Math.max(0, previousEnd - 1)) + 1;
        caret = Math.min(previousStart + column, previousEnd);
      }
    } else {
      const lineEnd = this.#value.indexOf('\n', this.#focus);
      if (lineEnd < 0) caret = this.#value.length;
      else {
        const nextStart = lineEnd + 1;
        const nextEnd = this.#value.indexOf('\n', nextStart);
        caret = Math.min(nextStart + column, nextEnd < 0 ? this.#value.length : nextEnd);
      }
    }
    caret = clampedBoundary(this.#value, caret);
    if (caret === this.#focus) return false;
    if (selecting) this.#focus = caret;
    else this.#anchor = this.#focus = caret;
    return true;
  }

  #moveHome(selecting: boolean): boolean {
    const caret = this.#multiline
      ? this.#value.lastIndexOf('\n', Math.max(0, this.#focus - 1)) + 1
      : 0;
    if (caret === this.#focus) return false;
    if (selecting) this.#focus = caret;
    else this.#anchor = this.#focus = caret;
    return true;
  }

  #moveEnd(selecting: boolean): boolean {
    const newline = this.#multiline ? this.#value.indexOf('\n', this.#focus) : -1;
    const caret = newline < 0 ? this.#value.length : newline;
    if (caret === this.#focus) return false;
    if (selecting) this.#focus = caret;
    else this.#anchor = this.#focus = caret;
    return true;
  }

  #selectedText(): string {
    return this.#value.slice(Math.min(this.#anchor, this.#focus), Math.max(this.#anchor, this.#focus));
  }

  #copySelection(): boolean {
    if (this.#clipboard === undefined) return false;
    try {
      this.#clipboard.writeText(this.#selectedText());
      return true;
    } catch {
      return false;
    }
  }

  #cutSelection(): boolean {
    if (this.#clipboard === undefined || this.#anchor === this.#focus) return false;
    if (!this.#copySelection()) return false;
    return this.#deleteSelection();
  }

  #pasteFromBoundary(): boolean {
    if (this.#clipboard === undefined) return false;
    try {
      const text = this.#clipboard.readText();
      return typeof text === 'string' && this.handlePaste(text);
    } catch {
      return false;
    }
  }

  #applyComposition(text: string, finish: boolean): boolean {
    const base = this.#composition;
    if (base === null) return false;
    const outside = base.value.slice(0, base.start) + base.value.slice(base.end);
    const capacity = this.#maxLength - countCharacters(outside);
    const insertion = takeCharacters(normalizedText(text, this.#multiline), capacity);
    const next = base.value.slice(0, base.start) + insertion + base.value.slice(base.end);
    const caret = base.start + insertion.length;
    this.#compositionText = insertion;
    const changed = this.#commit(next, caret, caret);
    if (finish) {
      this.#composition = null;
      this.#compositionText = '';
    }
    return changed || finish;
  }
}
