import { drawPixelTextInRect, measurePixelText, type PixelUi } from './pixel-ui.js';
import type { UiRect } from './geometry.js';

/** Keep the operation/property name: it is the useful part of a fallback reason. */
export function worldBackendReason(reason: string): string {
  return reason.replace(/^webgl_/, '').replaceAll('_', ' ').replaceAll(':', ': ').toUpperCase();
}

export function wrapBackendReason(text: string, maximumWidth: number,
  measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && measure(`${line} ${word}`) <= maximumWidth) { line += ` ${word}`; continue; }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (line && measure(line + character) > maximumWidth) { lines.push(line); line = ''; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function backendReasonLayout(ui: PixelUi, reason: string, bounds: UiRect) {
  const text = `CANVAS: ${worldBackendReason(reason)}`;
  const glyphHeight = ui.font.font?.glyphSize[1] ?? 7;
  // Compact game windows can have only two normal text rows below their controls.
  // Half-size glyphs retain the complete property name instead of an ellipsis.
  for (const scale of [1, 0.5]) {
    const lineHeight = (glyphHeight + 2) * scale;
    const lines = wrapBackendReason(text, bounds.width, (line) => measurePixelText(line, scale, ui.font));
    if (lines.length * lineHeight <= bounds.height) return { lines, scale, lineHeight, complete: true };
  }
  // Unexpectedly long driver messages remain available in the protocol JSON.
  const scale = 0.5, lineHeight = (glyphHeight + 2) * scale;
  const lines = wrapBackendReason('CANVAS FALLBACK. FULL ERROR IN PROTOCOL JSON.', bounds.width,
    (line) => measurePixelText(line, scale, ui.font));
  return { lines, scale, lineHeight, complete: false };
}

export function drawBackendReason(context: CanvasRenderingContext2D, ui: PixelUi,
  reason: string, bounds: UiRect): void {
  const { lines, scale, lineHeight } = backendReasonLayout(ui, reason, bounds);
  const top = bounds.y + Math.max(0, bounds.height - lines.length * lineHeight);
  lines.forEach((line, index) => drawPixelTextInRect(context, ui, line,
    { ...bounds, y: top + index * lineHeight, height: lineHeight },
    { align: 'center', scale, color: '#8c6c54', overflow: 'clip' }));
}
