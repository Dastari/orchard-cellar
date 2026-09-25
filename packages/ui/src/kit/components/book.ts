import { parseGameMarkdown, type GameMarkdownBlock, type GameMarkdownInline } from '../../design-system/game-markdown.js';
import { layoutGameBook, gameBookSpreadPageIndices, type GameBookLayout, type GameBookEmbedEntry } from '../../design-system/book.js';
import type { UiTextLinkTarget } from '../../design-system/rich-text.js';
import type { UiRect } from '../../geometry.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTextRole, UiTone } from '../tokens.js';
import type { UiKitArt } from './art.js';
import { uiFrame } from './frame.js';
import { uiText } from './text.js';
import { uiFlex, uiScrollArea, uiSeparator } from './layout.js';
import { uiButton } from './button.js';
export interface UiMarkdownOptions {
  readonly id?: string; readonly source: string; readonly layout?: UiStyle; readonly onLink?: (target: UiTextLinkTarget) => void;
  readonly renderEmbed?: (entry: Pick<GameBookEmbedEntry, 'embedKind' | 'reference' | 'label'>) => UiElement | undefined;
}
function linkedText(text: string, role: UiTextRole, link?: UiTextLinkTarget, action?: (target: UiTextLinkTarget) => void, style?: UiStyle): UiElement {
  const base = uiText(text, { role, overflow: 'clip', layout: style });
  if (!link) return base;
  return new UiElement({ ...base.hooks, kind: 'book-link', focusable: true, pointerMode: 'capture',
    onKey(event) { if (event.key !== 'Enter' && event.key !== ' ') return false; action?.(link); return true; },
    onPointer(event) { if (event.type === 'up') { action?.(link); return true; } return event.type === 'down'; },
  });
}
function inlines(parts: readonly GameMarkdownInline[], role: 'body' | 'header', action?: UiMarkdownOptions['onLink']): UiElement {
  return uiFlex({ direction: 'row', wrap: true, width: 'grow', gap: 0 }, parts.flatMap(part => part.text.split(/(?<=\s)/u).map(text => linkedText(text, role, part.link, action))));
}
function markdownBlock(block: GameMarkdownBlock, options: UiMarkdownOptions): UiElement | null {
  if (block.kind === 'page_break') return uiSeparator();
  if (block.kind === 'rule') return uiSeparator();
  if (block.kind === 'code_block') return uiFrame({ style: 'parchment_plain', children: [uiText(block.text)], layout: { width: 'grow', height: 'fit' } });
  if (block.kind === 'embed') return options.renderEmbed?.(block) ?? uiFrame({ style: 'thin', children: [uiText(block.label ?? `${block.embedKind}: ${block.reference}`)] });
  const body = inlines(block.inlines, block.kind === 'heading' ? 'header' : 'body', options.onLink);
  return block.kind === 'list_item' ? uiFlex({ direction: 'row', gap: 4 }, [uiText(block.ordered ? `${block.index}.` : '-'), body]) : body;
}
export function uiMarkdown(options: UiMarkdownOptions): UiElement {
  const document = parseGameMarkdown(options.source);
  return uiScrollArea({ id: options.id, gap: 8, ...options.layout }, document.blocks.flatMap(block => { const node = markdownBlock(block, options); return node ? [node] : []; }));
}
export interface UiBookOptions extends UiMarkdownOptions { readonly art?: UiKitArt; readonly spread?: number; readonly onPageChange?: (spread: number) => void }
export function uiBook(options: UiBookOptions): UiElement {
  let document = parseGameMarkdown(options.source), source = options.source, spread = options.spread ?? 0, key = '', layout: GameBookLayout | undefined, requestedFocus = '';
  const chrome = uiFrame({ style: 'book' });
  const place = (node: UiElement, rect: UiRect, origin: UiRect) => node.setStyle({ position: 'absolute', inset: { left: uiFixed(Math.max(0, rect.x - origin.x)), top: uiFixed(Math.max(0, rect.y - origin.y)) }, width: uiFixed(rect.width), height: uiFixed(rect.height) });
  const change = (next: number, focusId?: string) => { spread = Math.max(0, Math.min((layout?.spreadCount ?? 1) - 1, next)); key = ''; requestedFocus = focusId ?? ''; book.setProps({ spread }); options.onPageChange?.(spread); };
  const link = (target: UiTextLinkTarget) => { if (target.kind === 'page') { const page = layout?.anchorPages.get(target.anchor); if (page !== undefined) change(Math.floor(page / 2)); } options.onLink?.(target); };
  const book = new UiElement({ id: options.id, kind: 'book', label: 'Book', focusable: true, props: { source, spread, tone: 'primary', textCase: 'upper' },
    style: { display: 'stack', width: 'grow', height: 'grow', minHeight: uiFixed(140), ...options.layout }, paint: chrome.hooks.paint,
    onKey(event) { const next = event.key === 'ArrowRight' || event.key === 'PageDown' ? spread + 1 : event.key === 'ArrowLeft' || event.key === 'PageUp' ? spread - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? (layout?.spreadCount ?? 1) - 1 : undefined;
      if (next === undefined) return false; change(next); return true; },
    onArrange(element) {
      let root = element; while (root.parent) root = root.parent;
      const art = options.art ?? root.props['art'] as UiKitArt | undefined; if (!art) return;
      const current = String(element.props['source']); if (current !== source) { source = current; document = parseGameMarkdown(source); key = ''; }
      const r = element.rect, nextKey = `${r.x}:${r.y}:${r.width}:${r.height}:${spread}:${source}`; if (key === nextKey) return; key = nextKey;
      layout = layoutGameBook(art.pixel, document, r, { textScale: 1 }); spread = Math.max(0, Math.min(layout.spreadCount - 1, spread));
      for (const child of [...element.children]) child.dispose();
      for (const [side, pageIndex] of gameBookSpreadPageIndices(spread, layout.pageCount).entries()) {
        if (pageIndex === null) continue; const page = layout.pages[pageIndex]!, area = layout.pageContentRects[side]!;
        const panel = place(new UiElement({ kind: 'book-page', props: { page: pageIndex }, style: { display: 'stack' } }), area, r); element.append(panel);
        // Long-form headings retain the font that layoutGameBook measured for their page and link rectangles.
        for (const entry of page.entries) {
          if (entry.kind === 'line') for (const fragment of entry.fragments) panel.append(place(linkedText(fragment.text, fragment.font === 'header' ? 'special-heading' : 'body', fragment.link, link), { x: area.x + entry.x + fragment.x, y: area.y + entry.y, width: fragment.width, height: entry.height }, area));
          else if (entry.kind === 'rule') panel.append(place(uiSeparator(), { x: area.x, y: area.y + entry.y, width: area.width, height: 1 }, area));
          else panel.append(place(options.renderEmbed?.(entry) ?? uiFrame({ style: 'thin', children: [uiText(entry.label ?? `${entry.embedKind}: ${entry.reference}`)] }), { x: area.x + entry.rect.x, y: area.y + entry.rect.y, width: Math.min(area.width, entry.rect.width), height: entry.rect.height }, area));
        }
        element.append(place(uiText(String(page.number), { align: side ? 'right' : 'left' }), layout.pageNumberRects[side]!, r));
      }
      const tones: Record<string, UiTone> = { gold: 'warning', green: 'success', red: 'danger', blue: 'info', purple: 'neutral' };
      for (const [index, bookmark] of layout.bookmarks.entries()) element.append(place(uiButton({ id: `${book.id}:bookmark:${bookmark.id}`, label: bookmark.label, tone: tones[bookmark.color], size: 'sm', onPress: () => change(bookmark.spreadIndex, `${book.id}:bookmark:${bookmark.id}`) }),
        { x: bookmark.side === 'left' ? r.x : Math.max(r.x, r.x + r.width - 48), y: r.y + Math.min(r.height - 20, 20 + index * 20), width: Math.min(48, r.width), height: 16 }, r));
      const nav = uiFlex({ direction: 'row', gap: 2, justify: 'center' });
      for (const [label, next] of [['First',0],['Previous',spread - 1],['Next',spread + 1],['Last',layout.spreadCount - 1]] as const) nav.append(uiButton({ id: `${book.id}:${label}`, label, size: 'sm', disabled: next < 0 || next >= layout.spreadCount || next === spread, onPress: () => change(next, `${book.id}:${label}`) }));
      element.append(place(nav, { x: r.x, y: Math.max(r.y, r.y + r.height - 18), width: r.width, height: 16 }, r));
      element.setProps({ spread, pageCount: layout.pageCount, spreadCount: layout.spreadCount, pageRects: layout.pageContentRects }, false);
      const descendants = (node: UiElement): UiElement[] => node.children.flatMap(child => [child, ...descendants(child)]);
      const requested = descendants(book).find(node => node.id === requestedFocus && !node.disabled); if (requested) requested.requestFocus(); else if (requestedFocus) book.requestFocus(); requestedFocus = '';
    },
  }); return book;
}
