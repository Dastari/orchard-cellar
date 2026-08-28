import {
  drawPixelText,
  fontMetrics,
  measurePixelText,
  type PixelTextOptions,
  type PixelUi,
} from '../../render/pixel-ui.js';
import { containsPoint, type UiPoint, type UiRect } from '../geometry.js';

export type UiTextLinkTarget =
  | { readonly kind: 'item'; readonly itemKind: string }
  | { readonly kind: 'player'; readonly playerId: string }
  | { readonly kind: 'coordinate'; readonly zone: string; readonly x: number; readonly y: number }
  | { readonly kind: 'page'; readonly anchor: string }
  | { readonly kind: 'url'; readonly href: string };

export interface UiRichTextRun {
  readonly text: string;
  readonly color?: string;
  readonly font?: 'body' | 'header';
  readonly scale?: number;
  readonly link?: UiTextLinkTarget;
}

export interface UiRichTextOptions {
  readonly align?: 'left' | 'center' | 'right';
  readonly verticalAlign?: 'top' | 'center' | 'bottom';
  readonly lineHeight?: number;
  readonly maxLines?: number;
  readonly color?: string;
  readonly linkColor?: string;
  readonly visitedLinkColor?: string;
  readonly visited?: (target: UiTextLinkTarget) => boolean;
}

export interface UiRichTextFragment {
  readonly text: string;
  readonly rect: UiRect;
  readonly color: string;
  readonly font: 'body' | 'header';
  readonly scale: number;
  readonly line: number;
  readonly link?: UiTextLinkTarget;
}

export interface UiRichTextLayout {
  readonly bounds: UiRect;
  readonly fragments: readonly UiRichTextFragment[];
  readonly lineCount: number;
  readonly contentHeight: number;
  readonly truncated: boolean;
}

const MARKUP = /\[\[((?:item|player|coord|page|url):[^|\]]+|#[^|\]]+)\|([^\]]+)\]\]/gu;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_.:-]*$/iu;
const SAFE_ANCHOR = /^[a-z0-9][a-z0-9_-]*$/iu;

/** Converts an authored link destination into data. It deliberately accepts
 * only known game schemes and HTTP(S); strings are never executed as code. */
export function parseUiTextLinkTarget(destination: string): UiTextLinkTarget | null {
  const authored = destination.trim();
  const trimmed = authored.startsWith('url:') ? authored.slice('url:'.length) : authored;
  if (trimmed.startsWith('item:')) {
    const itemKind = trimmed.slice('item:'.length);
    return SAFE_IDENTIFIER.test(itemKind) ? { kind: 'item', itemKind } : null;
  }
  if (trimmed.startsWith('player:')) {
    const playerId = trimmed.slice('player:'.length).trim();
    return SAFE_IDENTIFIER.test(playerId) ? { kind: 'player', playerId } : null;
  }
  if (trimmed.startsWith('coord:')) {
    const reference = trimmed.slice('coord:'.length);
    const [zone, xText, yText, ...extra] = reference.split(',');
    const x = Number(xText);
    const y = Number(yText);
    if (extra.length === 0 && zone !== undefined && SAFE_IDENTIFIER.test(zone.trim())
      && xText !== undefined && xText.trim().length > 0
      && yText !== undefined && yText.trim().length > 0
      && Number.isSafeInteger(x) && Number.isSafeInteger(y)) {
      return { kind: 'coordinate', zone: zone.trim(), x, y };
    }
  }
  const pageReference = trimmed.startsWith('page:')
    ? trimmed.slice('page:'.length)
    : trimmed.startsWith('#') ? trimmed.slice(1) : null;
  if (pageReference !== null && SAFE_ANCHOR.test(pageReference)) {
    return { kind: 'page', anchor: pageReference.toLowerCase() };
  }
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return { kind: 'url', href: parsed.href };
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Parses deliberately small, non-HTML game markup. Links remain typed values,
 * so UI code never executes strings or guesses what a clicked label means.
 *
 * `[[item:apple|Apple]]`, `[[player:farmer-7|Mira]]`,
 * `[[coord:orchard,42,18|42, 18]]`, `[[page:harvest|Harvest]]`
 */
export function parseUiRichText(markup: string): UiRichTextRun[] {
  const runs: UiRichTextRun[] = [];
  let cursor = 0;
  for (const match of markup.matchAll(MARKUP)) {
    const index = match.index;
    if (index > cursor) runs.push({ text: markup.slice(cursor, index) });
    const raw = match[0];
    const target = parseUiTextLinkTarget(match[1] ?? '');
    if (target === null) runs.push({ text: raw });
    else runs.push({ text: match[2] ?? '', link: target });
    cursor = index + raw.length;
  }
  if (cursor < markup.length) runs.push({ text: markup.slice(cursor) });
  return runs.length > 0 ? runs : [{ text: '' }];
}

interface PendingFragment {
  readonly text: string;
  readonly width: number;
  readonly run: UiRichTextRun;
  readonly line: number;
  readonly x: number;
}

interface PendingLine {
  readonly start: number;
  readonly end: number;
  readonly width: number;
}

function splitRun(run: UiRichTextRun): UiRichTextRun[] {
  return run.text.split(/(\s+)/u).filter((text) => text.length > 0).map((text) => ({ ...run, text }));
}

function runFont(fonts: PixelUi, run: UiRichTextRun) {
  return run.font === 'header' ? fonts.headerFont : fonts.font;
}

function splitOversizedRun(fonts: PixelUi, run: UiRichTextRun, maximumWidth: number): UiRichTextRun[] {
  const asset = runFont(fonts, run);
  const scale = run.scale ?? 1;
  if (/^\s+$/u.test(run.text) || measurePixelText(run.text, scale, asset) <= maximumWidth) return [run];
  const parts: UiRichTextRun[] = [];
  let current = '';
  for (const character of run.text) {
    if (current.length > 0 && measurePixelText(`${current}${character}`, scale, asset) > maximumWidth) {
      parts.push({ ...run, text: current });
      current = '';
    }
    current += character;
  }
  if (current.length > 0) parts.push({ ...run, text: current });
  return parts;
}

function lineOffset(width: number, available: number, align: UiRichTextOptions['align']): number {
  if (align === 'center') return Math.floor((available - width) / 2);
  if (align === 'right') return available - width;
  return 0;
}

function verticalOffset(height: number, available: number, align: UiRichTextOptions['verticalAlign']): number {
  if (align === 'center') return Math.floor((available - height) / 2);
  if (align === 'bottom') return available - height;
  return 0;
}

function resolvedColor(run: UiRichTextRun, options: UiRichTextOptions): string {
  if (run.color !== undefined) return run.color;
  if (run.link !== undefined) {
    return options.visited?.(run.link) === true
      ? options.visitedLinkColor ?? '#8d5aa7'
      : options.linkColor ?? '#2d6f98';
  }
  return options.color ?? '#4d2e22';
}

/** Bitmap-font wrapping, alignment, clipping, and link hit geometry share one layout. */
export function layoutUiRichText(
  fonts: PixelUi,
  runs: readonly UiRichTextRun[],
  bounds: UiRect,
  options: UiRichTextOptions = {},
): UiRichTextLayout {
  const maximumWidth = Math.max(1, bounds.width);
  const defaultLineHeight = fontMetrics(fonts.font).cellHeight + 1;
  const lineHeight = Math.max(1, options.lineHeight ?? defaultLineHeight);
  const maximumLines = Math.max(1, Math.floor(options.maxLines ?? Math.max(1, bounds.height / lineHeight)));
  const tokens = runs.flatMap(splitRun).flatMap((run) => splitOversizedRun(fonts, run, maximumWidth));
  const pending: PendingFragment[] = [];
  const lines: PendingLine[] = [];
  let line = 0;
  let lineStart = 0;
  let cursor = 0;
  let truncated = false;

  const finishLine = (): void => {
    lines.push({ start: lineStart, end: pending.length, width: cursor });
    line += 1;
    lineStart = pending.length;
    cursor = 0;
  };

  for (const token of tokens) {
    if (token.text.includes('\n')) {
      const pieces = token.text.split('\n');
      pieces.forEach((piece, index) => {
        if (piece.length > 0) {
          const width = measurePixelText(piece, token.scale ?? 1, runFont(fonts, token));
          if (cursor > 0 && cursor + width > maximumWidth) finishLine();
          if (line < maximumLines) {
            pending.push({ text: piece, width, run: token, line, x: cursor });
            cursor += width;
          }
        }
        if (index < pieces.length - 1) {
          if (line >= maximumLines - 1) truncated = true;
          else finishLine();
        }
      });
      if (truncated) break;
      continue;
    }
    const whitespace = /^\s+$/u.test(token.text);
    if (whitespace && cursor === 0) continue;
    const width = measurePixelText(token.text, token.scale ?? 1, runFont(fonts, token));
    if (!whitespace && cursor > 0 && cursor + width > maximumWidth) {
      if (line >= maximumLines - 1) { truncated = true; break; }
      finishLine();
    }
    if (line >= maximumLines) { truncated = true; break; }
    pending.push({ text: token.text, width, run: token, line, x: cursor });
    cursor += width;
  }
  if (pending.length > lineStart || lines.length === 0) finishLine();

  if (truncated && pending.length > 0) {
    const suffix = '...';
    const lastLineIndex = Math.min(maximumLines - 1, lines.length - 1);
    let lastLine = lines[lastLineIndex]!;
    const exemplar = pending[Math.max(lastLine.start, lastLine.end - 1)]!;
    const suffixWidth = measurePixelText(suffix, exemplar.run.scale ?? 1, runFont(fonts, exemplar.run));
    while (lastLine.end > lastLine.start && lastLine.width + suffixWidth > maximumWidth) {
      const removed = pending.pop();
      if (removed === undefined) break;
      lastLine = { ...lastLine, end: lastLine.end - 1, width: Math.max(0, lastLine.width - removed.width) };
    }
    pending.push({ text: suffix, width: suffixWidth, run: { text: suffix }, line: lastLineIndex, x: lastLine.width });
    lines[lastLineIndex] = { ...lastLine, end: pending.length, width: lastLine.width + suffixWidth };
  }

  const shownLines = Math.min(maximumLines, lines.length);
  const contentHeight = shownLines * lineHeight;
  const yOffset = Math.max(0, verticalOffset(contentHeight, bounds.height, options.verticalAlign));
  const fragments: UiRichTextFragment[] = pending
    .filter((fragment) => fragment.line < shownLines)
    .map((fragment) => {
      const lineInfo = lines[fragment.line]!;
      const x = bounds.x + lineOffset(lineInfo.width, bounds.width, options.align) + fragment.x;
      const y = bounds.y + yOffset + fragment.line * lineHeight;
      const font = fragment.run.font ?? 'body';
      const scale = fragment.run.scale ?? 1;
      const height = fontMetrics(font === 'header' ? fonts.headerFont : fonts.font).glyphHeight * scale;
      return {
        text: fragment.text,
        rect: { x: Math.round(x), y: Math.round(y), width: fragment.width, height },
        color: resolvedColor(fragment.run, options),
        font,
        scale,
        line: fragment.line,
        ...(fragment.run.link === undefined ? {} : { link: fragment.run.link }),
      };
    });
  return { bounds, fragments, lineCount: shownLines, contentHeight, truncated };
}

export function drawUiRichText(
  context: CanvasRenderingContext2D,
  fonts: PixelUi,
  layout: UiRichTextLayout,
): void {
  context.save();
  context.beginPath();
  context.rect(layout.bounds.x, layout.bounds.y, layout.bounds.width, layout.bounds.height);
  context.clip();
  for (const fragment of layout.fragments) {
    const options: PixelTextOptions = {
      color: fragment.color,
      font: fragment.font,
      scale: fragment.scale,
    };
    drawPixelText(context, fonts, fragment.text, fragment.rect.x, fragment.rect.y, options);
    if (fragment.link !== undefined && !/^\s+$/u.test(fragment.text)) {
      context.fillStyle = fragment.color;
      context.fillRect(
        Math.round(fragment.rect.x),
        Math.round(fragment.rect.y + fragment.rect.height + 1),
        Math.max(1, Math.round(fragment.rect.width)),
        1,
      );
    }
  }
  context.restore();
}

export function uiRichTextLinkAtPoint(
  layout: UiRichTextLayout,
  point: UiPoint,
): UiTextLinkTarget | null {
  for (let index = layout.fragments.length - 1; index >= 0; index -= 1) {
    const fragment = layout.fragments[index]!;
    if (fragment.link !== undefined && containsPoint({
      ...fragment.rect,
      height: fragment.rect.height + 3,
    }, point)) return fragment.link;
  }
  return null;
}

export function uiTextLinkLabel(target: UiTextLinkTarget): string {
  if (target.kind === 'item') return `ITEM:${target.itemKind}`;
  if (target.kind === 'player') return `PLAYER:${target.playerId}`;
  if (target.kind === 'coordinate') return `COORD:${target.zone}@${target.x},${target.y}`;
  if (target.kind === 'page') return `PAGE:${target.anchor}`;
  return `URL:${target.href}`;
}

/** Stable authored form suitable for copying into chat, Markdown, or network
 * payloads. Consumers still parse it back through the same allowlist. */
export function serializeUiTextLinkTarget(target: UiTextLinkTarget): string {
  if (target.kind === 'item') return `item:${target.itemKind}`;
  if (target.kind === 'player') return `player:${target.playerId}`;
  if (target.kind === 'coordinate') return `coord:${target.zone},${target.x},${target.y}`;
  if (target.kind === 'page') return `page:${target.anchor}`;
  return target.href;
}
