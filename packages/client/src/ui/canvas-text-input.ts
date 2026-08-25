import { drawPixelText, fontMetrics, type PixelUi } from '../render/pixel-ui.js';

export interface CanvasTextInputPresentation {
  readonly text: string;
  readonly visibleStart: number;
  readonly caret: number;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly placeholder: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Maps a native input's editing state onto the clipped bitmap text drawn on
 * the canvas. Browser-native editing remains responsible for word movement,
 * Home/End, Shift selection, clipboard shortcuts, and IME composition. */
export function canvasTextInputPresentation(
  value: string,
  prefix: string,
  placeholder: string,
  maximumCharacters: number,
  selectionStart: number | null,
  selectionEnd: number | null,
): CanvasTextInputPresentation {
  const maximum = Math.max(1, Math.floor(maximumCharacters));
  const start = prefix.length + clamp(selectionStart ?? value.length, 0, value.length);
  const end = prefix.length + clamp(selectionEnd ?? value.length, 0, value.length);
  const selectionMinimum = Math.min(start, end);
  const selectionMaximum = Math.max(start, end);
  const actualText = `${prefix}${value}`;
  const shownText = value.length === 0 ? `${prefix}${placeholder}` : actualText;
  const caret = end;
  const visibleStart = clamp(caret - maximum + 1, 0, Math.max(0, actualText.length - maximum));
  return {
    text: shownText.slice(visibleStart, visibleStart + maximum),
    visibleStart,
    caret: caret - visibleStart,
    selectionStart: clamp(selectionMinimum - visibleStart, 0, maximum),
    selectionEnd: clamp(selectionMaximum - visibleStart, 0, maximum),
    placeholder: value.length === 0,
  };
}

export function drawCanvasTextInput(
  context: CanvasRenderingContext2D,
  fonts: PixelUi,
  input: HTMLInputElement,
  options: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly prefix?: string;
    readonly placeholder?: string;
    readonly color?: string;
    readonly placeholderColor?: string;
    readonly selectionColor?: string;
    readonly displayValue?: string;
    readonly now?: number;
  },
): void {
  const metrics = fontMetrics(fonts.font);
  const maximumCharacters = Math.max(1, Math.floor(options.width / metrics.cellWidth));
  const presentation = canvasTextInputPresentation(
    options.displayValue ?? input.value,
    options.prefix ?? '',
    options.placeholder ?? '',
    maximumCharacters,
    input.selectionStart,
    input.selectionEnd,
  );
  const focused = document.activeElement === input;
  if (focused && presentation.selectionEnd > presentation.selectionStart) {
    context.fillStyle = options.selectionColor ?? '#8ba7b8';
    context.fillRect(
      Math.round(options.x + presentation.selectionStart * metrics.cellWidth),
      Math.round(options.y - 1),
      Math.max(1, (presentation.selectionEnd - presentation.selectionStart) * metrics.cellWidth),
      metrics.glyphHeight + 2,
    );
  }
  drawPixelText(context, fonts, presentation.text, options.x, options.y, {
    color: presentation.placeholder ? options.placeholderColor ?? '#916f4d' : options.color ?? '#3f2d25',
  });
  if (focused && presentation.selectionStart === presentation.selectionEnd
    && Math.floor((options.now ?? performance.now()) / 530) % 2 === 0) {
    const caretX = Math.min(options.x + options.width, options.x + presentation.caret * metrics.cellWidth);
    context.fillStyle = options.color ?? '#3f2d25';
    context.fillRect(Math.round(caretX), Math.round(options.y - 1), 1, metrics.glyphHeight + 2);
  }
}
