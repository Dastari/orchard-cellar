import { containsPoint } from '../../geometry.js';
import type { UiRichTextLayout } from '../../design-system/rich-text.js';
import { drawPixelText, drawOutlinedPixelText, measurePixelText } from '../../pixel-ui.js';
import { parseUiRichText, layoutUiRichText, drawUiRichText, type UiTextLinkTarget } from '../../design-system/rich-text.js';
import { UiElement } from '../runtime/element.js';
import type { UiStyle } from '../layout/box.js';
import { UI_TEXT_METRICS, type UiTextRole } from '../tokens.js';
import { UI_TONE_FACES, resolveUiTextContrast } from '../skin/contrast.js';
import { uiElementTone, uiElementTextContrast, uiElementUpperCase } from './art.js';
export interface UiTextOptions {
  readonly id?: string; readonly role?: UiTextRole; readonly layout?: UiStyle;
  readonly overflow?: 'wrap' | 'ellipsis' | 'clip'; readonly outline?: boolean; readonly wrap?: boolean; readonly maxLines?: number; readonly align?: 'left' | 'center' | 'right';
  /** Inside caps surfaces (game windows and books) short labels paint in caps. Wrapped text is a paragraph
   * (a hint, a status sentence, an error) and keeps its authored case unless this asks for 'upper'. */
  readonly textCase?: 'upper' | 'as-authored';
}
export function uiTextLines(value: string, width: number, role: UiTextRole, wrap = true, maxLines = Infinity): string[] {
  const cell = UI_TEXT_METRICS[role].glyphWidth + 1;
  const columns = Math.max(0, Math.floor((width + 1) / cell));
  if (columns === 0) return [''];
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    if (!wrap) { lines.push(paragraph.length > columns ? `${paragraph.slice(0, Math.max(0, columns - 3))}${'.'.repeat(Math.min(3, columns))}` : paragraph); continue; }
    let remaining = paragraph;
    while (remaining.length > columns) {
      const space = remaining.lastIndexOf(' ', columns);
      const end = space > 0 ? space : columns;
      lines.push(remaining.slice(0, end)); remaining = remaining.slice(end).trimStart();
    }
    lines.push(remaining);
  }
  return lines.slice(0, maxLines);
}
export function uiText(value: string, options: UiTextOptions = {}): UiElement {
  const role = options.role ?? 'body', metrics = UI_TEXT_METRICS[role];
  const linesFor = (text: string, width: number) => options.overflow === 'clip' ? text.split('\n').slice(0, options.maxLines)
    : uiTextLines(text, width, role, options.overflow ? options.overflow === 'wrap' : options.wrap, options.maxLines);
  // Owner item 10: paragraphs (wrapped text) stay as authored inside caps windows; labels follow the surface.
  const wrapped = options.overflow ? options.overflow === 'wrap' : options.wrap === true;
  const textCase = options.textCase ?? (wrapped ? 'as-authored' : undefined);
  let source = '', upper = '';
  const shown = (element: UiElement) => {
    const text = String(element.props['text']);
    if (!uiElementUpperCase(element)) return text;
    if (text !== source) { source = text; upper = text.toUpperCase(); }
    return upper;
  };
  return new UiElement({ id: options.id, kind: 'text', label: value, props: { text: value, role, ...(textCase ? { textCase } : {}) }, style: { shrink: 0, ...options.layout },
    measure(element, available) {
      const text = shown(element);
      const natural = Math.max(0, ...text.split('\n').map(line => line.length * (metrics.glyphWidth + 1) - 1));
      const width = Math.min(available.width, natural);
      const height = linesFor(text, width).length * metrics.lineHeight;
      return { min: { width: 0, height: metrics.lineHeight }, preferred: { width, height } };
    },
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect, lines = linesFor(shown(element), r.width);
      const asset = metrics.font === 'header' ? art.pixel.headerFont : art.pixel.font;
      // An explicit ink is reserved for fixed dark surfaces such as tooltips; everything else follows its tone.
      const color = typeof element.props['ink'] === 'string' ? element.props['ink'] : uiElementTextContrast(element).color;
      lines.forEach((line, index) => {
        const width = measurePixelText(line, 1, asset);
        const x = r.x + (options.align === 'center' ? Math.floor((r.width - width) / 2) : options.align === 'right' ? r.width - width : 0);
        (options.outline ? drawOutlinedPixelText : drawPixelText)(context, art.pixel, line, x, r.y + index * metrics.lineHeight,
          { font: metrics.font, color, outlineColor: typeof element.props['outlineInk'] === 'string' ? element.props['outlineInk'] : UI_TONE_FACES[uiElementTone(element)].frame.face });
      });
    },
  });
}
export function uiRichText(value: string, options: UiTextOptions & { readonly onLink?: (target: UiTextLinkTarget) => void } = {}): UiElement {
  const metrics = UI_TEXT_METRICS[options.role ?? 'body'];
  const runs = parseUiRichText(value).map(run => ({ ...run, font: metrics.font })), links = runs.flatMap(run => run.link ? [run.link] : []);
  let selected = 0; let painted: UiRichTextLayout | undefined;
  const plain = uiText(runs.map(run => run.text).join(''), options);
  return new UiElement({ id: options.id, kind: 'rich-text', label: plain.label, style: options.layout,
    focusable: links.length > 0, pointerMode: links.length ? 'capture' : 'passthrough', measure: plain.hooks.measure,
    props: plain.props,
    paint(element, { context, art }) {
      if (!art) return;
      const color = resolveUiTextContrast(uiElementTone(element)).color;
      const layout = layoutUiRichText(art.pixel, runs, element.rect, { color, linkColor: color, lineHeight: metrics.lineHeight, maxLines: options.maxLines });
      painted = layout; drawUiRichText(context, art.pixel, layout);
    },
    onPointer(event) {
      if (event.type !== 'up') return false;
      const fragment = painted?.fragments.find(part => part.link && containsPoint(part.rect, event.point));
      if (!fragment?.link) return false; options.onLink?.(fragment.link); return true;
    },
    onKey(event) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { selected = (selected + (event.key === 'ArrowRight' ? 1 : links.length - 1)) % links.length; return true; }
      if (event.key === 'Enter' && links[selected]) { options.onLink?.(links[selected]!); return true; }
      return false;
    },
  });
}
