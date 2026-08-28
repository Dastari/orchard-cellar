import { parseUiTextLinkTarget, type UiTextLinkTarget } from './rich-text.js';

export type GameMarkdownInlineStyle = 'body' | 'strong' | 'emphasis' | 'code';
export type GameMarkdownBookmarkColor = 'gold' | 'green' | 'red' | 'blue' | 'purple';
export type GameMarkdownBookmarkSide = 'left' | 'right';
export type GameMarkdownEmbedKind = 'item' | 'player' | 'coordinate' | 'chart' | 'custom';

export interface GameMarkdownInline {
  readonly text: string;
  readonly style: GameMarkdownInlineStyle;
  readonly link?: UiTextLinkTarget;
}

interface GameMarkdownBlockBase {
  readonly sourceLine: number;
}

export type GameMarkdownBlock =
  | (GameMarkdownBlockBase & {
    readonly kind: 'heading';
    readonly level: 1 | 2 | 3;
    readonly anchor: string;
    readonly inlines: readonly GameMarkdownInline[];
  })
  | (GameMarkdownBlockBase & {
    readonly kind: 'paragraph';
    readonly inlines: readonly GameMarkdownInline[];
  })
  | (GameMarkdownBlockBase & {
    readonly kind: 'list_item';
    readonly ordered: boolean;
    readonly index: number;
    readonly inlines: readonly GameMarkdownInline[];
  })
  | (GameMarkdownBlockBase & {
    readonly kind: 'quote';
    readonly inlines: readonly GameMarkdownInline[];
  })
  | (GameMarkdownBlockBase & { readonly kind: 'rule' })
  | (GameMarkdownBlockBase & {
    readonly kind: 'code_block';
    readonly language?: string;
    readonly text: string;
  })
  | (GameMarkdownBlockBase & {
    readonly kind: 'embed';
    readonly embedKind: GameMarkdownEmbedKind;
    readonly reference: string;
    readonly label?: string;
  })
  | (GameMarkdownBlockBase & {
    readonly kind: 'page_break';
    /** One-based authored page. Omitted means the next available page. */
    readonly page?: number;
  });

export interface GameMarkdownBookmark {
  readonly id: string;
  readonly label: string;
  readonly color: GameMarkdownBookmarkColor;
  readonly side: GameMarkdownBookmarkSide;
  /** The block following the directive when no heading target is supplied. */
  readonly blockIndex: number;
  readonly targetAnchor?: string;
}

export interface GameMarkdownDocument {
  readonly blocks: readonly GameMarkdownBlock[];
  readonly bookmarks: readonly GameMarkdownBookmark[];
}

const INLINE_TOKEN = /\[([^\]\n]+)\]\(([^)\s]+)\)|\[((?:item|player|coord|page):[^\]\n]+)\]|\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_/gu;
const SAFE_BOOKMARK_ID = /^[a-z0-9][a-z0-9_-]*$/iu;
const SAFE_EMBED_REFERENCE = /^[a-z0-9][a-z0-9_.:-]*$/iu;
const BOOKMARK_COLORS = new Set<GameMarkdownBookmarkColor>(['gold', 'green', 'red', 'blue', 'purple']);
const BOOKMARK_SIDES = new Set<GameMarkdownBookmarkSide>(['left', 'right']);
const EMBED_KINDS = new Set<GameMarkdownEmbedKind>(['item', 'player', 'coordinate', 'chart', 'custom']);

function plainInline(text: string, style: GameMarkdownInlineStyle = 'body'): GameMarkdownInline {
  return { text, style };
}

function shorthandLabel(target: UiTextLinkTarget): string {
  if (target.kind === 'item') return target.itemKind;
  if (target.kind === 'player') return target.playerId;
  if (target.kind === 'coordinate') return `${target.zone} ${target.x}, ${target.y}`;
  if (target.kind === 'page') return target.anchor.replaceAll('-', ' ');
  return target.href;
}

/** Parses a deliberately bounded inline Markdown subset. Unknown or unsafe
 * syntax remains literal text, including javascript: links and raw HTML. */
export function parseGameMarkdownInline(source: string): GameMarkdownInline[] {
  const inlines: GameMarkdownInline[] = [];
  let cursor = 0;
  for (const match of source.matchAll(INLINE_TOKEN)) {
    const index = match.index;
    if (index > cursor) inlines.push(plainInline(source.slice(cursor, index)));
    const raw = match[0];
    const markdownLabel = match[1];
    const markdownDestination = match[2];
    const shorthandDestination = match[3];
    if (markdownLabel !== undefined && markdownDestination !== undefined) {
      const link = parseUiTextLinkTarget(markdownDestination);
      inlines.push(link === null ? plainInline(raw) : { text: markdownLabel, style: 'body', link });
    } else if (shorthandDestination !== undefined) {
      const link = parseUiTextLinkTarget(shorthandDestination);
      inlines.push(link === null ? plainInline(raw) : { text: shorthandLabel(link), style: 'body', link });
    } else if (match[4] !== undefined) inlines.push(plainInline(match[4], 'strong'));
    else if (match[5] !== undefined) inlines.push(plainInline(match[5], 'code'));
    else inlines.push(plainInline(match[6] ?? match[7] ?? raw, 'emphasis'));
    cursor = index + raw.length;
  }
  if (cursor < source.length) inlines.push(plainInline(source.slice(cursor)));
  return inlines.length > 0 ? inlines : [plainInline('')];
}

export function gameMarkdownSlug(value: string): string {
  const slug = value.toLowerCase()
    .replace(/[^a-z0-9\s_-]/gu, '')
    .trim()
    .replace(/[\s_]+/gu, '-')
    .replace(/-+/gu, '-');
  return slug.length > 0 ? slug : 'section';
}

function inlineText(inlines: readonly GameMarkdownInline[]): string {
  return inlines.map((inline) => inline.text).join('');
}

function uniqueAnchor(candidate: string, used: Map<string, number>): string {
  const base = gameMarkdownSlug(candidate);
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function parseBookmarkDirective(
  source: string,
  blockIndex: number,
): GameMarkdownBookmark | null {
  const parts = source.split('|').map((part) => part.trim());
  const rawId = parts[0] ?? '';
  const label = parts[1] ?? rawId;
  if (!SAFE_BOOKMARK_ID.test(rawId) || label.length === 0) return null;
  const rawColor = (parts[2] ?? 'gold').toLowerCase();
  const rawSide = (parts[3] ?? 'right').toLowerCase();
  if (!BOOKMARK_COLORS.has(rawColor as GameMarkdownBookmarkColor)
    || !BOOKMARK_SIDES.has(rawSide as GameMarkdownBookmarkSide)) return null;
  const target = parts[4];
  return {
    id: rawId.toLowerCase(),
    label,
    color: rawColor as GameMarkdownBookmarkColor,
    side: rawSide as GameMarkdownBookmarkSide,
    blockIndex,
    ...(target === undefined || target.length === 0 ? {} : { targetAnchor: gameMarkdownSlug(target) }),
  };
}

function parseEmbedDirective(source: string, sourceLine: number): GameMarkdownBlock | null {
  const parts = source.split('|').map((part) => part.trim());
  const rawKind = (parts[0] ?? '').toLowerCase();
  const reference = parts[1] ?? '';
  if (!EMBED_KINDS.has(rawKind as GameMarkdownEmbedKind) || reference.length === 0) return null;
  const typedDestination = rawKind === 'item' || rawKind === 'player'
    ? parseUiTextLinkTarget(`${rawKind}:${reference}`)
    : rawKind === 'coordinate' ? parseUiTextLinkTarget(`coord:${reference}`) : null;
  if ((rawKind === 'item' || rawKind === 'player' || rawKind === 'coordinate')
    && typedDestination === null) return null;
  if ((rawKind === 'chart' || rawKind === 'custom') && !SAFE_EMBED_REFERENCE.test(reference)) return null;
  return {
    kind: 'embed',
    embedKind: rawKind as GameMarkdownEmbedKind,
    reference,
    sourceLine,
    ...(parts[2] === undefined || parts[2].length === 0 ? {} : { label: parts[2] }),
  };
}

/**
 * Parses common prose Markdown plus Orchard's safe page/bookmark/embed
 * directives. It produces data for canvas renderers; it never produces HTML.
 *
 * Supported extensions:
 * `<!-- page -->`, `<!-- page: 5 -->`
 * `<!-- bookmark: id | Label | green | right | heading-anchor -->`
 * `<!-- embed: item | apple | Apple -->`
 */
export function parseGameMarkdown(source: string): GameMarkdownDocument {
  const lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const blocks: GameMarkdownBlock[] = [];
  const bookmarks: GameMarkdownBookmark[] = [];
  const usedAnchors = new Map<string, number>();
  const usedBookmarkIds = new Set<string>();
  let paragraphLines: string[] = [];
  let paragraphSourceLine = 1;
  let codeStart = 0;
  let codeLanguage: string | undefined;
  let codeLines: string[] | null = null;

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) return;
    blocks.push({
      kind: 'paragraph',
      sourceLine: paragraphSourceLine,
      inlines: parseGameMarkdownInline(paragraphLines.join(' ')),
    });
    paragraphLines = [];
  };

  lines.forEach((line, lineIndex) => {
    const sourceLine = lineIndex + 1;
    if (codeLines !== null) {
      if (/^```\s*$/u.test(line)) {
        blocks.push({
          kind: 'code_block', sourceLine: codeStart, text: codeLines.join('\n'),
          ...(codeLanguage === undefined ? {} : { language: codeLanguage }),
        });
        codeLines = null;
        codeLanguage = undefined;
      } else codeLines.push(line);
      return;
    }

    const codeFence = line.match(/^```\s*([a-z0-9_-]+)?\s*$/iu);
    if (codeFence !== null) {
      flushParagraph();
      codeStart = sourceLine;
      codeLanguage = codeFence[1]?.toLowerCase();
      codeLines = [];
      return;
    }

    const page = line.match(/^\s*<!--\s*page(?:\s*:\s*(\d+))?\s*-->\s*$/iu);
    if (page !== null) {
      flushParagraph();
      const requested = page[1] === undefined ? undefined : Number(page[1]);
      blocks.push({
        kind: 'page_break', sourceLine,
        ...(requested === undefined || !Number.isSafeInteger(requested) || requested < 1
          ? {} : { page: Math.min(999, requested) }),
      });
      return;
    }

    const bookmark = line.match(/^\s*<!--\s*bookmark\s*:\s*(.*?)\s*-->\s*$/iu);
    if (bookmark !== null) {
      flushParagraph();
      const parsed = parseBookmarkDirective(bookmark[1] ?? '', blocks.length);
      if (parsed !== null && !usedBookmarkIds.has(parsed.id)) {
        bookmarks.push(parsed);
        usedBookmarkIds.add(parsed.id);
      }
      return;
    }

    const embed = line.match(/^\s*<!--\s*embed\s*:\s*(.*?)\s*-->\s*$/iu);
    if (embed !== null) {
      flushParagraph();
      const parsed = parseEmbedDirective(embed[1] ?? '', sourceLine);
      if (parsed !== null) blocks.push(parsed);
      return;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+?)(?:\s+\{#([a-z0-9_-]+)\})?\s*$/iu);
    if (heading !== null) {
      flushParagraph();
      const inlines = parseGameMarkdownInline(heading[2] ?? '');
      blocks.push({
        kind: 'heading',
        sourceLine,
        level: heading[1]!.length as 1 | 2 | 3,
        anchor: uniqueAnchor(heading[3] ?? inlineText(inlines), usedAnchors),
        inlines,
      });
      return;
    }

    if (/^\s*(?:---+|\*\*\*+)\s*$/u.test(line)) {
      flushParagraph();
      blocks.push({ kind: 'rule', sourceLine });
      return;
    }

    const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/u);
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/u);
    if (ordered !== null || unordered !== null) {
      flushParagraph();
      blocks.push({
        kind: 'list_item', sourceLine,
        ordered: ordered !== null,
        index: ordered === null ? 0 : Number(ordered[1]),
        inlines: parseGameMarkdownInline(ordered?.[2] ?? unordered?.[1] ?? ''),
      });
      return;
    }

    const quote = line.match(/^\s*>\s?(.*)$/u);
    if (quote !== null) {
      flushParagraph();
      blocks.push({ kind: 'quote', sourceLine, inlines: parseGameMarkdownInline(quote[1] ?? '') });
      return;
    }

    if (paragraphLines.length === 0) paragraphSourceLine = sourceLine;
    paragraphLines.push(line.trim());
  });

  // Mutations occur inside the line visitor, which TypeScript does not include
  // in its outer control-flow narrowing. Preserve the runtime state explicitly.
  const unfinishedCodeLines = codeLines as string[] | null;
  if (unfinishedCodeLines !== null) {
    blocks.push({
      kind: 'code_block', sourceLine: codeStart, text: unfinishedCodeLines.join('\n'),
      ...(codeLanguage === undefined ? {} : { language: codeLanguage }),
    });
  }
  flushParagraph();
  return { blocks, bookmarks };
}
