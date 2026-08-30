import {
  drawPixelText,
  drawPixelTextInRect,
  fontMetrics,
  measurePixelText,
  type PixelUi,
} from '../../render/pixel-ui.js';
import { insetRect, type UiRect } from '../geometry.js';
import {
  drawUiFrame,
  drawUiFrameControls,
  uiFrameControlLayout,
  type UiFrameControlLayout,
} from './frame.js';
import type {
  GameMarkdownBlock,
  GameMarkdownBookmark,
  GameMarkdownBookmarkColor,
  GameMarkdownDocument,
  GameMarkdownInline,
  GameMarkdownInlineStyle,
} from './game-markdown.js';
import type { UiSkin } from '../skin.js';
import type { UiTextLinkTarget } from './rich-text.js';

const BOOK_SOURCE_SIZE = { width: 224, height: 133 } as const;
const BOOK_SOURCE_LEFT_PAGE: UiRect = { x: 16, y: 16, width: 80, height: 101 };
const BOOK_SOURCE_RIGHT_PAGE: UiRect = { x: 128, y: 16, width: 80, height: 101 };

export interface GameBookTextFragment {
  readonly text: string;
  readonly x: number;
  readonly width: number;
  readonly font: 'body' | 'header';
  readonly scale: number;
  readonly color: string;
  readonly link?: UiTextLinkTarget;
}

export interface GameBookLineEntry {
  readonly kind: 'line';
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly fragments: readonly GameBookTextFragment[];
  readonly tone: 'normal' | 'heading' | 'quote' | 'code';
  readonly blockIndex: number;
}

export interface GameBookRuleEntry {
  readonly kind: 'rule';
  readonly y: number;
  readonly height: number;
  readonly blockIndex: number;
}

export interface GameBookEmbedEntry {
  readonly kind: 'embed';
  readonly rect: UiRect;
  readonly embedKind: 'item' | 'player' | 'coordinate' | 'chart' | 'custom';
  readonly reference: string;
  readonly label?: string;
  readonly blockIndex: number;
}

export type GameBookPageEntry = GameBookLineEntry | GameBookRuleEntry | GameBookEmbedEntry;

export interface GameBookPage {
  readonly index: number;
  readonly number: number;
  readonly entries: readonly GameBookPageEntry[];
}

export interface GameBookBookmarkLayout extends GameMarkdownBookmark {
  readonly pageIndex: number;
  readonly spreadIndex: number;
}

export interface GameBookLayout {
  readonly frame: UiRect;
  readonly pageRects: readonly [UiRect, UiRect];
  readonly pageContentRects: readonly [UiRect, UiRect];
  readonly pageNumberRects: readonly [UiRect, UiRect];
  readonly pages: readonly GameBookPage[];
  readonly pageCount: number;
  readonly spreadCount: number;
  readonly textScale: number;
  readonly anchorPages: ReadonlyMap<string, number>;
  readonly blockPages: ReadonlyMap<number, number>;
  readonly bookmarks: readonly GameBookBookmarkLayout[];
}

export interface GameBookLinkHit {
  readonly rect: UiRect;
  readonly target: UiTextLinkTarget;
}

export interface GameBookBookmarkHit {
  readonly rect: UiRect;
  readonly bookmark: GameBookBookmarkLayout;
}

export interface GameBookRenderResult {
  readonly controls: UiFrameControlLayout;
  readonly links: readonly GameBookLinkHit[];
  readonly bookmarks: readonly GameBookBookmarkHit[];
  readonly spreadIndex: number;
  readonly spreadCount: number;
}

/** Return true when the application has drawn the embed. Returning false (or
 * omitting a renderer) keeps the safe diagnostic placeholder. */
export type GameBookEmbedRenderer = (
  context: CanvasRenderingContext2D,
  entry: GameBookEmbedEntry,
  rect: UiRect,
) => boolean;

export interface GameBookLayoutOptions {
  readonly textScale?: number;
}

interface FlowRun {
  readonly text: string;
  readonly font: 'body' | 'header';
  readonly scale: number;
  readonly color: string;
  readonly link?: UiTextLinkTarget;
}

interface FlowLine {
  readonly fragments: readonly GameBookTextFragment[];
  readonly height: number;
}

type FlowUnit =
  | { readonly kind: 'line'; readonly line: FlowLine; readonly tone: GameBookLineEntry['tone'] }
  | { readonly kind: 'spacer'; readonly height: number }
  | { readonly kind: 'rule'; readonly height: number }
  | {
    readonly kind: 'embed';
    readonly height: number;
    readonly embedKind: GameBookEmbedEntry['embedKind'];
    readonly reference: string;
    readonly label?: string;
  };

const BOOKMARK_PALETTE: Readonly<Record<GameMarkdownBookmarkColor, {
  readonly face: string;
  readonly edge: string;
  readonly text: string;
}>> = {
  gold: { face: '#e3a84b', edge: '#8b5a3c', text: '#3f2832' },
  green: { face: '#63c74d', edge: '#2f6f3e', text: '#182b23' },
  red: { face: '#e43b44', edge: '#8a2635', text: '#fff2d0' },
  blue: { face: '#4aa4cc', edge: '#25658b', text: '#182b3a' },
  purple: { face: '#8d5aa7', edge: '#593a72', text: '#fff2d0' },
};

function scaleRect(frame: UiRect, source: UiRect): UiRect {
  const scaleX = frame.width / BOOK_SOURCE_SIZE.width;
  const scaleY = frame.height / BOOK_SOURCE_SIZE.height;
  return {
    x: Math.round(frame.x + source.x * scaleX),
    y: Math.round(frame.y + source.y * scaleY),
    width: Math.max(1, Math.round(source.width * scaleX)),
    height: Math.max(1, Math.round(source.height * scaleY)),
  };
}

/** Page faces are scaled from the authored 224×133 sprite coordinates. This
 * keeps the protected spine gutter proportional at every specimen size. */
export function uiScaledBookPageRects(frame: UiRect): readonly [UiRect, UiRect] {
  return [scaleRect(frame, BOOK_SOURCE_LEFT_PAGE), scaleRect(frame, BOOK_SOURCE_RIGHT_PAGE)];
}

export function gameBookSpreadPageIndices(
  spreadIndex: number,
  pageCount: number,
): readonly [number | null, number | null] {
  const safePageCount = Math.max(0, Math.floor(pageCount));
  const safeSpread = Math.max(0, Math.floor(spreadIndex));
  if (safeSpread === 0) return [null, safePageCount > 0 ? 0 : null];
  const left = safeSpread * 2 - 1;
  const right = safeSpread * 2;
  return [left < safePageCount ? left : null, right < safePageCount ? right : null];
}

export function gameBookSpreadForPage(pageIndex: number): number {
  const safePage = Math.max(0, Math.floor(pageIndex));
  return safePage === 0 ? 0 : Math.floor((safePage + 1) / 2);
}

function styleColor(style: GameMarkdownInlineStyle): string {
  if (style === 'strong') return '#3f2832';
  if (style === 'emphasis') return '#8b5a3c';
  if (style === 'code') return '#593a72';
  return '#51351f';
}

function inlineRuns(
  inlines: readonly GameMarkdownInline[],
  textScale: number,
  options: { readonly font?: 'body' | 'header'; readonly color?: string } = {},
): FlowRun[] {
  return inlines.map((inline) => ({
    text: inline.text,
    font: options.font ?? 'body',
    scale: textScale,
    color: inline.link === undefined ? options.color ?? styleColor(inline.style) : '#216b91',
    ...(inline.link === undefined ? {} : { link: inline.link }),
  }));
}

function runWidth(fonts: PixelUi, run: FlowRun): number {
  return measurePixelText(run.text, run.scale, run.font === 'header' ? fonts.headerFont : fonts.font);
}

function tokeniseRun(run: FlowRun): FlowRun[] {
  return run.text.split(/(\s+)/u).filter((text) => text.length > 0).map((text) => ({ ...run, text }));
}

function splitFlowRun(fonts: PixelUi, run: FlowRun, maximumWidth: number): FlowRun[] {
  if (/^\s+$/u.test(run.text) || runWidth(fonts, run) <= maximumWidth) return [run];
  const chunks: FlowRun[] = [];
  let chunk = '';
  for (const character of run.text) {
    const next = `${chunk}${character}`;
    if (chunk.length > 0 && runWidth(fonts, { ...run, text: next }) > maximumWidth) {
      chunks.push({ ...run, text: chunk });
      chunk = character;
    } else chunk = next;
  }
  if (chunk.length > 0) chunks.push({ ...run, text: chunk });
  return chunks;
}

function wrapFlowRuns(fonts: PixelUi, runs: readonly FlowRun[], maximumWidth: number): FlowLine[] {
  const tokens = runs.flatMap(tokeniseRun).flatMap((run) => splitFlowRun(fonts, run, maximumWidth));
  const lines: FlowLine[] = [];
  let fragments: GameBookTextFragment[] = [];
  let cursor = 0;
  let height = 0;

  const finish = (): void => {
    while (fragments.length > 0 && /^\s+$/u.test(fragments.at(-1)!.text)) {
      const removed = fragments.pop()!;
      cursor -= removed.width;
    }
    if (fragments.length > 0) lines.push({ fragments, height: Math.max(1, height + 1) });
    fragments = [];
    cursor = 0;
    height = 0;
  };

  for (const token of tokens) {
    const whitespace = /^\s+$/u.test(token.text);
    if (whitespace && fragments.length === 0) continue;
    const width = runWidth(fonts, token);
    if (!whitespace && fragments.length > 0 && cursor + width > maximumWidth) finish();
    if (whitespace && cursor + width > maximumWidth) { finish(); continue; }
    const glyphHeight = fontMetrics(token.font === 'header' ? fonts.headerFont : fonts.font).glyphHeight * token.scale;
    fragments.push({
      text: token.text,
      x: cursor,
      width,
      font: token.font,
      scale: token.scale,
      color: token.color,
      ...(token.link === undefined ? {} : { link: token.link }),
    });
    cursor += width;
    height = Math.max(height, glyphHeight);
  }
  finish();
  return lines;
}

function blockUnits(
  fonts: PixelUi,
  block: Exclude<GameMarkdownBlock, { readonly kind: 'page_break' }>,
  width: number,
  scale: number,
): FlowUnit[] {
  const smallGap = Math.max(1, scale * 2);
  if (block.kind === 'rule') return [
    { kind: 'spacer', height: smallGap },
    { kind: 'rule', height: Math.max(3, scale * 3) },
    { kind: 'spacer', height: smallGap },
  ];
  if (block.kind === 'embed') return [
    { kind: 'spacer', height: smallGap },
    {
      kind: 'embed', height: Math.max(24, 28 * scale), embedKind: block.embedKind,
      reference: block.reference, ...(block.label === undefined ? {} : { label: block.label }),
    },
    { kind: 'spacer', height: smallGap },
  ];

  let runs: FlowRun[];
  let tone: GameBookLineEntry['tone'] = 'normal';
  if (block.kind === 'heading') {
    const headingScale = block.level === 1 ? scale : Math.max(1, scale - 1);
    runs = inlineRuns(block.inlines, headingScale, { font: 'header', color: '#3f2832' });
    tone = 'heading';
  } else if (block.kind === 'list_item') {
    const prefix = block.ordered ? `${block.index}. ` : '- ';
    runs = [{ text: prefix, font: 'body', scale, color: '#8b5a3c' }, ...inlineRuns(block.inlines, scale)];
  } else if (block.kind === 'quote') {
    runs = [{ text: '> ', font: 'body', scale, color: '#8b5a3c' },
      ...inlineRuns(block.inlines, scale, { color: '#795548' })];
    tone = 'quote';
  } else if (block.kind === 'code_block') {
    const sourceLines = block.text.length === 0 ? [' '] : block.text.split('\n');
    const codeLines = sourceLines.flatMap((line) => wrapFlowRuns(fonts, [{
      text: line.length === 0 ? ' ' : line,
      font: 'body', scale, color: '#593a72',
    }], Math.max(1, width - scale * 4)));
    return [
      { kind: 'spacer', height: smallGap },
      ...codeLines.map((line): FlowUnit => ({ kind: 'line', line, tone: 'code' })),
      { kind: 'spacer', height: smallGap },
    ];
  } else runs = inlineRuns(block.inlines, scale);

  const lines = wrapFlowRuns(fonts, runs, width);
  const before = block.kind === 'heading' ? Math.max(2, scale * 3) : 0;
  const after = block.kind === 'heading' ? Math.max(2, scale * 3) : smallGap;
  return [
    ...(before === 0 ? [] : [{ kind: 'spacer', height: before } as const]),
    ...lines.map((line): FlowUnit => ({ kind: 'line', line, tone })),
    { kind: 'spacer', height: after },
  ];
}

function resolveBookmarkPage(
  bookmark: GameMarkdownBookmark,
  anchorPages: ReadonlyMap<string, number>,
  blockPages: ReadonlyMap<number, number>,
  blockCount: number,
): number {
  const anchorPage = bookmark.targetAnchor === undefined ? undefined : anchorPages.get(bookmark.targetAnchor);
  if (anchorPage !== undefined) return anchorPage;
  for (let blockIndex = bookmark.blockIndex; blockIndex < blockCount; blockIndex += 1) {
    const page = blockPages.get(blockIndex);
    if (page !== undefined) return page;
  }
  return Math.max(0, [...blockPages.values()].at(-1) ?? 0);
}

/** Lays out the document once for a concrete book frame. Automatic overflow,
 * explicit page directives, anchors, bookmark targets, and hit geometry all
 * share this pagination result. */
export function layoutGameBook(
  fonts: PixelUi,
  document: GameMarkdownDocument,
  frame: UiRect,
  options: GameBookLayoutOptions = {},
): GameBookLayout {
  const pageRects = uiScaledBookPageRects(frame);
  const naturalScale = Math.max(1, Math.min(2, Math.floor(Math.min(
    frame.width / BOOK_SOURCE_SIZE.width,
    frame.height / BOOK_SOURCE_SIZE.height,
  ))));
  const textScale = Math.max(1, Math.floor(options.textScale ?? naturalScale));
  const footerHeight = Math.max(10, 10 * textScale);
  const inner = Math.max(1, textScale * 2);
  const spineProtection = Math.max(3, textScale * 5);
  // The shared close glyph lives inside the upper-left safe area. Reserve only
  // the portion that actually intersects a scaled page face, then give both
  // pages the same top inset so their first baselines remain aligned.
  const close = uiFrameControlLayout(frame, 'book', false).close;
  const pageTop = Math.min(pageRects[0].y, pageRects[1].y);
  const pageContentTop = Math.max(pageTop + inner, close.y + close.height + 4);
  const topInset = Math.max(inner, pageContentTop - pageTop);
  const leftContent = insetRect(pageRects[0], {
    left: inner, top: topInset, right: spineProtection, bottom: footerHeight,
  });
  const rightContent = insetRect(pageRects[1], {
    left: spineProtection, top: topInset, right: inner, bottom: footerHeight,
  });
  const contentWidth = Math.max(1, Math.min(leftContent.width, rightContent.width));
  const contentHeight = Math.max(1, Math.min(leftContent.height, rightContent.height));
  const pages: Array<{ index: number; number: number; entries: GameBookPageEntry[] }> = [];
  const anchorPages = new Map<string, number>();
  const blockPages = new Map<number, number>();
  let pageIndex = 0;
  let cursorY = 0;

  const ensurePage = (index: number): void => {
    while (pages.length <= index) pages.push({
      index: pages.length,
      number: pages.length + 1,
      entries: [],
    });
  };
  const nextPage = (target?: number): void => {
    if (target === undefined) pageIndex += 1;
    else {
      const currentHasContent = cursorY > 0 || (pages[pageIndex]?.entries.length ?? 0) > 0;
      if (target > pageIndex) pageIndex = target;
      else if (target < pageIndex || currentHasContent) pageIndex += 1;
    }
    cursorY = 0;
    ensurePage(pageIndex);
  };
  ensurePage(0);

  document.blocks.forEach((block, blockIndex) => {
    if (block.kind === 'page_break') {
      nextPage(block.page === undefined ? undefined : block.page - 1);
      return;
    }
    const units = blockUnits(fonts, block, contentWidth, textScale);
    if (block.kind === 'heading' && cursorY > 0) {
      const headingHeight = units.reduce((height, unit) => (
        unit.kind === 'line' ? height + unit.line.height : height
      ), 0);
      const followingLine = fontMetrics(fonts.font).cellHeight * textScale + 1;
      if (cursorY + headingHeight + followingLine > contentHeight) nextPage();
    }
    let blockPlaced = false;
    for (const unit of units) {
      if (unit.kind === 'spacer') {
        if (cursorY > 0 && cursorY + unit.height <= contentHeight) cursorY += unit.height;
        continue;
      }
      const unitHeight = Math.min(contentHeight, unit.kind === 'line' ? unit.line.height : unit.height);
      if (cursorY > 0 && cursorY + unitHeight > contentHeight) nextPage();
      if (!blockPlaced) {
        blockPages.set(blockIndex, pageIndex);
        if (block.kind === 'heading') anchorPages.set(block.anchor, pageIndex);
        blockPlaced = true;
      }
      const page = pages[pageIndex]!;
      if (unit.kind === 'line') {
        page.entries.push({
          kind: 'line', x: 0, y: cursorY, height: unitHeight,
          fragments: unit.line.fragments, tone: unit.tone, blockIndex,
        });
      } else if (unit.kind === 'rule') {
        page.entries.push({ kind: 'rule', y: cursorY, height: unitHeight, blockIndex });
      } else {
        page.entries.push({
          kind: 'embed', rect: { x: 0, y: cursorY, width: contentWidth, height: unitHeight },
          embedKind: unit.embedKind, reference: unit.reference,
          ...(unit.label === undefined ? {} : { label: unit.label }), blockIndex,
        });
      }
      cursorY += unitHeight;
    }
  });

  const frozenPages: GameBookPage[] = pages.map((page) => ({ ...page, entries: page.entries }));
  const pageCount = Math.max(1, frozenPages.length);
  const spreadCount = Math.max(1, Math.ceil((pageCount + 1) / 2));
  const bookmarks = document.bookmarks.map((bookmark): GameBookBookmarkLayout => {
    const targetPage = Math.min(pageCount - 1, resolveBookmarkPage(
      bookmark, anchorPages, blockPages, document.blocks.length,
    ));
    return { ...bookmark, pageIndex: targetPage, spreadIndex: gameBookSpreadForPage(targetPage) };
  });
  const numberHeight = Math.max(8, 8 * textScale);
  const numberWidth = Math.max(22, 22 * textScale);
  const pageNumberRects: readonly [UiRect, UiRect] = [
    {
      x: pageRects[0].x + inner,
      y: pageRects[0].y + pageRects[0].height - footerHeight + Math.max(0, footerHeight - numberHeight),
      width: numberWidth,
      height: numberHeight,
    },
    {
      x: pageRects[1].x + pageRects[1].width - inner - numberWidth,
      y: pageRects[1].y + pageRects[1].height - footerHeight + Math.max(0, footerHeight - numberHeight),
      width: numberWidth,
      height: numberHeight,
    },
  ];
  return {
    frame, pageRects, pageContentRects: [leftContent, rightContent], pageNumberRects,
    pages: frozenPages, pageCount, spreadCount, textScale, anchorPages, blockPages, bookmarks,
  };
}

function bookmarkRects(layout: GameBookLayout): Array<{
  readonly rect: UiRect;
  readonly bookmark: GameBookBookmarkLayout;
}> {
  const result: Array<{ rect: UiRect; bookmark: GameBookBookmarkLayout }> = [];
  const scale = Math.max(1, layout.textScale);
  const tabWidth = Math.max(54, 42 * scale);
  const tabHeight = Math.max(18, 12 * scale);
  const overlap = Math.max(4, 4 * scale);
  const margin = Math.max(12, 12 * scale);
  const availableHeight = Math.max(tabHeight, layout.frame.height - margin * 2);
  const totals = layout.bookmarks.reduce((counts, bookmark) => ({
    ...counts,
    [bookmark.side]: counts[bookmark.side] + 1,
  }), { left: 0, right: 0 });
  const sideCounts = { left: 0, right: 0 };
  for (const bookmark of layout.bookmarks) {
    const sideIndex = sideCounts[bookmark.side];
    sideCounts[bookmark.side] += 1;
    const count = totals[bookmark.side];
    const step = count <= 1
      ? 0
      : Math.min(tabHeight + Math.max(3, scale * 2), (availableHeight - tabHeight) / (count - 1));
    const y = Math.round(layout.frame.y + margin + sideIndex * step);
    const x = bookmark.side === 'left'
      ? layout.frame.x - tabWidth + overlap
      : layout.frame.x + layout.frame.width - overlap;
    result.push({ rect: { x, y, width: tabWidth, height: tabHeight }, bookmark });
  }
  return result;
}

function drawBookmark(
  context: CanvasRenderingContext2D,
  fonts: PixelUi,
  rect: UiRect,
  bookmark: GameBookBookmarkLayout,
  active: boolean,
): void {
  const palette = BOOKMARK_PALETTE[bookmark.color];
  const notch = Math.min(6, Math.floor(rect.height / 3));
  context.save();
  context.fillStyle = palette.edge;
  context.beginPath();
  if (bookmark.side === 'right') {
    context.moveTo(rect.x, rect.y);
    context.lineTo(rect.x + rect.width - notch, rect.y);
    context.lineTo(rect.x + rect.width, rect.y + rect.height / 2);
    context.lineTo(rect.x + rect.width - notch, rect.y + rect.height);
    context.lineTo(rect.x, rect.y + rect.height);
  } else {
    context.moveTo(rect.x + notch, rect.y);
    context.lineTo(rect.x + rect.width, rect.y);
    context.lineTo(rect.x + rect.width, rect.y + rect.height);
    context.lineTo(rect.x + notch, rect.y + rect.height);
    context.lineTo(rect.x, rect.y + rect.height / 2);
  }
  context.closePath();
  context.fill();
  context.translate(0, active ? -1 : 0);
  context.fillStyle = palette.face;
  const face = insetRect(rect, { left: 2, top: 2, right: 2, bottom: active ? 3 : 2 });
  context.fillRect(face.x, face.y, face.width, face.height);
  drawPixelTextInRect(context, fonts, bookmark.label.toUpperCase(), {
    x: rect.x + 5,
    y: rect.y,
    width: Math.max(0, rect.width - 10),
    height: rect.height,
  }, { align: 'center', verticalAlign: 'center', color: palette.text, overflow: 'ellipsis' });
  context.restore();
}

function drawPage(
  context: CanvasRenderingContext2D,
  fonts: PixelUi,
  page: GameBookPage | null,
  contentRect: UiRect,
  numberRect: UiRect,
  numberAlign: 'left' | 'right',
  links: GameBookLinkHit[],
  numberScale: number,
  embedRenderer?: GameBookEmbedRenderer,
): void {
  if (page === null) return;
  context.save();
  context.beginPath();
  context.rect(contentRect.x, contentRect.y, contentRect.width, contentRect.height);
  context.clip();
  for (const entry of page.entries) {
    if (entry.kind === 'rule') {
      context.fillStyle = '#b87955';
      context.fillRect(contentRect.x, contentRect.y + entry.y + Math.floor(entry.height / 2), contentRect.width, 1);
      continue;
    }
    if (entry.kind === 'embed') {
      const rect = {
        x: contentRect.x + entry.rect.x,
        y: contentRect.y + entry.rect.y,
        width: Math.min(contentRect.width, entry.rect.width),
        height: entry.rect.height,
      };
      if (embedRenderer?.(context, entry, rect) !== true) {
        context.fillStyle = entry.embedKind === 'chart' ? '#4aa4cc22' : '#e3a84b22';
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
        context.strokeStyle = entry.embedKind === 'chart' ? '#2d6f98' : '#8b5a3c';
        context.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
        drawPixelTextInRect(context, fonts,
          (entry.label ?? `${entry.embedKind}: ${entry.reference}`).toUpperCase(), rect, {
            color: '#51351f', verticalAlign: 'center', overflow: 'ellipsis', paddingX: 4,
          });
      }
      continue;
    }
    const lineY = contentRect.y + entry.y;
    if (entry.tone === 'code') {
      context.fillStyle = '#8d5aa71a';
      context.fillRect(contentRect.x, lineY, contentRect.width, entry.height);
    } else if (entry.tone === 'quote') {
      context.fillStyle = '#b87955';
      context.fillRect(contentRect.x, lineY, 1, entry.height);
    }
    for (const fragment of entry.fragments) {
      const x = contentRect.x + entry.x + fragment.x;
      drawPixelText(context, fonts, fragment.text, x, lineY, {
        color: fragment.color, font: fragment.font, scale: fragment.scale,
      });
      if (fragment.link !== undefined && !/^\s+$/u.test(fragment.text)) {
        const rect = {
          x, y: lineY, width: fragment.width,
          height: fontMetrics(fragment.font === 'header' ? fonts.headerFont : fonts.font).glyphHeight * fragment.scale + 2,
        };
        links.push({ rect, target: fragment.link });
        context.fillStyle = fragment.color;
        context.fillRect(rect.x, rect.y + rect.height - 1, Math.max(1, rect.width), 1);
      }
    }
  }
  context.restore();
  drawPixelText(context, fonts, String(page.number),
    numberAlign === 'left' ? numberRect.x : numberRect.x + numberRect.width,
    numberRect.y, { align: numberAlign, color: '#8b5a3c', scale: numberScale });
}

/** Draws one spread and returns the exact interactive geometry for navigation,
 * typed links, and bookmark jumps. */
export function drawGameBook(
  context: CanvasRenderingContext2D,
  skin: UiSkin,
  fonts: PixelUi,
  layout: GameBookLayout,
  requestedSpread: number,
  embedRenderer?: GameBookEmbedRenderer,
): GameBookRenderResult {
  const spreadIndex = Math.max(0, Math.min(layout.spreadCount - 1, Math.floor(requestedSpread)));
  const bookmarkGeometry = bookmarkRects(layout);
  for (const item of bookmarkGeometry) {
    drawBookmark(context, fonts, item.rect, item.bookmark, item.bookmark.spreadIndex === spreadIndex);
  }
  drawUiFrame(context, skin, layout.frame, 'book');
  const [leftIndex, rightIndex] = gameBookSpreadPageIndices(spreadIndex, layout.pageCount);
  const links: GameBookLinkHit[] = [];
  drawPage(context, fonts, leftIndex === null ? null : layout.pages[leftIndex] ?? null,
    layout.pageContentRects[0], layout.pageNumberRects[0], 'left', links, layout.textScale, embedRenderer);
  drawPage(context, fonts, rightIndex === null ? null : layout.pages[rightIndex] ?? null,
    layout.pageContentRects[1], layout.pageNumberRects[1], 'right', links, layout.textScale, embedRenderer);
  const controls = drawUiFrameControls(context, skin, fonts, layout.frame, 'book', {
    bookNavigation: true, spreadIndex, spreadCount: layout.spreadCount,
  });
  return {
    controls,
    links,
    bookmarks: bookmarkGeometry.map((item) => ({ rect: item.rect, bookmark: item.bookmark })),
    spreadIndex,
    spreadCount: layout.spreadCount,
  };
}
