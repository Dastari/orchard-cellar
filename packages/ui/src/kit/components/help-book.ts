import { HELP_TOPICS } from '../../help-topics.js';
import { parseGameMarkdown, type GameMarkdownInline } from '../../design-system/game-markdown.js';
import type { UiTextLinkTarget } from '../../design-system/rich-text.js';
import { uiBookWindow, type UiBookWindowElement } from './book-window.js';
import { uiPageHeading } from './character-book.js';
import type { UiKitArt } from './art.js';
import type { UiStyle } from '../layout/box.js';
import { scrollUiElement } from '../layout/scroll.js';
import { UiElement } from '../runtime/element.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiPageScroll, uiSelectablePageRow, uiWrappedPageHeading } from './quest-log.js';

/** A guide topic in reading case, with a stable anchor for `[text](#anchor)` page links. */
export interface UiHelpTopic { readonly id: string; readonly title: string; readonly entries: readonly string[] }
export interface UiHelpChapter { readonly id: string; readonly label: string; readonly icon: string; readonly topics: readonly UiHelpTopic[] }

const readingCase = (title: string) => title.charAt(0) + title.slice(1).toLowerCase();
const anchorOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
/** The guide's chapters: each existing help topic sits in exactly one; anything unassigned joins the last chapter. */
const CHAPTER_TOPICS: readonly { readonly id: string; readonly label: string; readonly icon: string; readonly titles: readonly string[] }[] = [
  { id: 'basics', label: 'Basics', icon: 'chapter.quests', titles: ['MOVEMENT', 'ACTIONS', 'WINDOWS', 'CHAT AND COMMANDS', 'HELP BOOK'] },
  { id: 'crafting', label: 'Crafting', icon: 'chapter.skills', titles: ['INVENTORY', 'CRAFTING', 'ITEMS AND TOOLS', 'HOMESTEAD DEEDS'] },
  { id: 'world', label: 'World', icon: 'chapter.statistics', titles: ['DIALOGUE AND TRADE', 'SHARED WORLD', 'HORSES'] },
];
export const UI_HELP_CHAPTERS: readonly UiHelpChapter[] = CHAPTER_TOPICS.map((chapter, index) => ({ id: chapter.id, label: chapter.label, icon: chapter.icon,
  topics: HELP_TOPICS.filter(topic => chapter.titles.includes(topic.title) || index === CHAPTER_TOPICS.length - 1 && !CHAPTER_TOPICS.some(entry => entry.titles.includes(topic.title)))
    .map(topic => ({ id: anchorOf(topic.title), title: readingCase(topic.title), entries: topic.entries })) }));
/** Every topic as one authored markdown source, in chapter order (kept for content checks and the migration lab). */
export const UI_HELP_BOOK_SOURCE = UI_HELP_CHAPTERS.flatMap(chapter => chapter.topics).map(topic => `## ${topic.title}\n\n${topic.entries.map(entry => `- ${entry}`).join('\n')}`).join('\n\n');

export interface UiHelpBookOptions {
  readonly art?: UiKitArt; readonly onClose?: () => void; readonly onLink?: (target: UiTextLinkTarget) => void; readonly layout?: UiStyle;
  /** Leaf size; defaults to the approved desktop spread. */
  readonly page?: { readonly width: number; readonly height: number };
}
export interface UiHelpBookElement extends UiElement {
  handleHelpKey(code: string): boolean; reset(): void; focusBook(): void;
  /** Open a topic by its anchor (for example `crafting`). */
  openTopic(anchor: string): boolean;
  setBookPage(page: { readonly width: number; readonly height: number }): void;
  readonly chapter: string; readonly topic: string;
}

/** A link word: focusable, activates on Enter/Space or release. Plain paragraphs stay a single wrapped text. */
function linkWord(text: string, link: UiTextLinkTarget, action: (target: UiTextLinkTarget) => void): UiElement {
  const base = uiText(text, { overflow: 'clip' });
  return new UiElement({ ...base.hooks, kind: 'book-link', label: text.trim(), focusable: true, pointerMode: 'capture', props: base.props,
    onKey(event) { if (event.key !== 'Enter' && event.key !== ' ') return false; action(link); return true; },
    onPointer(event) { if (event.type === 'up') { action(link); return true; } return event.type === 'down'; } });
}
const MARKDOWN_LINK = /\[[^\]]+\]\([^)\s]+\)/u;
function paragraph(source: string, action: (target: UiTextLinkTarget) => void): UiElement[] {
  // Entries are plain sentences (some begin with "- / +"); only an entry carrying a link is read as markdown.
  if (!MARKDOWN_LINK.test(source)) return [uiText(source, { wrap: true, layout: { alignSelf: 'stretch' } })];
  return parseGameMarkdown(source).blocks.flatMap(block => {
    if (!('inlines' in block)) return [];
    const inlines = block.inlines as readonly GameMarkdownInline[];
    if (!inlines.some(part => part.link)) return [uiText(inlines.map(part => part.text).join(''), { wrap: true, layout: { alignSelf: 'stretch' } })];
    return [uiFlex({ direction: 'row', wrap: true, gap: 0, alignSelf: 'stretch' }, inlines.flatMap(part => part.text.split(/(?<=\s)/u)
      .map(word => part.link ? linkWord(word, part.link, action) : uiText(word, { overflow: 'clip' }))))];
  });
}

/** The Orchard guide: its own book, chapters as tabs, topics on the left leaf and the chosen topic on the right. */
export function uiHelpBook(options: UiHelpBookOptions): UiHelpBookElement {
  const chapters = UI_HELP_CHAPTERS.filter(chapter => chapter.topics.length);
  const topics = chapters.flatMap(chapter => chapter.topics.map(topic => ({ chapter, topic })));
  let chapter = chapters[0]!, topic = chapter.topics[0]!, page = options.page ?? { width: 200, height: 248 };
  let book: UiBookWindowElement | undefined, focusedRow: string | null = null;
  const rows = new Map<string, UiElement>();
  const headingHost = uiFlex({ direction: 'column', alignSelf: 'stretch', shrink: 0 });
  const body = uiFlex({ direction: 'column', gap: 6, alignSelf: 'stretch' });
  const bodyScroll = uiPageScroll({ id: 'game.help.page', label: 'Guide page' }, body);
  const right = uiFlex({ direction: 'column', gap: 4, width: 'grow', height: 'grow' }, [headingHost, bodyScroll]);

  const link = (target: UiTextLinkTarget) => {
    if (target.kind === 'page' && openTopic(target.anchor)) rows.get(topic.id)?.requestFocus();
    options.onLink?.(target);
  };
  const renderTopic = () => {
    for (const child of [...headingHost.children, ...body.children]) child.dispose();
    headingHost.append(uiWrappedPageHeading(topic.title));
    for (const entry of topic.entries) for (const node of paragraph(entry, link)) body.append(node);
    scrollUiElement(bodyScroll, 0, 0);
    for (const row of rows.values()) row.invalidateRoot?.(false);
  };
  const build = (focusTab = false) => {
    // Chapter tabs are fixed when a book window is built, so a chapter change binds a fresh spread.
    rows.clear(); focusedRow = null;
    const list = uiFlex({ direction: 'column', gap: 2, alignSelf: 'stretch' }, chapter.topics.map(entry => {
      const row = uiSelectablePageRow({ id: `game.help.topic.${entry.id}`, label: entry.title, selected: () => topic === entry, onPress: () => show(chapter, entry),
        onFocus: focused => { if (focused) focusedRow = entry.id; else if (focusedRow === entry.id) focusedRow = null; } });
      rows.set(entry.id, row); return row;
    }));
    const left = uiFlex({ direction: 'column', gap: 2, width: 'grow', height: 'grow' }, [uiPageHeading(chapter.label), uiPageScroll({ id: 'game.help.topics', label: 'Topics' }, list)]);
    right.parent?.remove(right);
    const current = chapter;
    const next = uiBookWindow({ id: 'game.help.book', chapters: chapters.map(entry => ({ id: entry.id, label: entry.label, icon: entry.icon,
      left: () => entry === current ? left : uiFlex({}, []), right: () => entry === current ? right : uiFlex({}, []) })),
    active: chapter.id, page, onClose: options.onClose,
    onChapter: id => { const target = chapters.find(entry => entry.id === id); if (target && target !== chapter) { show(target, target.topics[0]!, true); } } });
    book?.dispose(); book = next; frame.append(next);
    if (focusTab) for (const node of descendants(next)) if (node.id === `book.tab.${chapter.id}`) node.requestFocus();
  };
  const show = (nextChapter: UiHelpChapter, nextTopic: UiHelpTopic, focusTab = false) => {
    const rowFocused = focusedRow !== null;
    const changed = nextChapter !== chapter; chapter = nextChapter; topic = nextTopic;
    if (changed) build(focusTab);
    renderTopic();
    if (changed && rowFocused) rows.get(topic.id)?.requestFocus();
  };
  const openTopic = (anchor: string) => {
    const found = topics.find(entry => entry.topic.id === anchor); if (!found) return false;
    show(found.chapter, found.topic); return true;
  };
  const step = (delta: number | 'first' | 'last', focus: boolean) => {
    const index = topics.findIndex(entry => entry.topic === topic);
    const next = topics[delta === 'first' ? 0 : delta === 'last' ? topics.length - 1 : Math.max(0, Math.min(topics.length - 1, index + delta))]!;
    if (next.topic === topic) return true;
    show(next.chapter, next.topic); if (focus) rows.get(topic.id)?.requestFocus(); return true;
  };
  // Q / E and Left / Right turn to the previous or next topic, across chapters; Home / End jump to either end;
  // Page Up / Down scroll the open page.
  const handleHelpKey = (code: string) => {
    const key = code === 'KeyQ' || code.toLowerCase() === 'q' ? 'ArrowLeft' : code === 'KeyE' || code.toLowerCase() === 'e' ? 'ArrowRight' : code;
    if (key === 'ArrowLeft') return step(-1, true);
    if (key === 'ArrowRight') return step(1, true);
    if (key === 'PageUp' || key === 'PageDown') { scrollUiElement(bodyScroll, 0, bodyScroll.scroll.y + (key === 'PageUp' ? -1 : 1) * Math.max(16, bodyScroll.contentRect.height - 16)); return true; }
    if (key === 'Home') return step('first', true);
    if (key === 'End') return step('last', true);
    return false;
  };
  const frame = new UiElement({ id: 'game.help.frame', kind: 'flex', label: 'ORCHARD GUIDE', style: { display: 'flex', direction: 'column', justify: 'center', align: 'center', width: 'grow', height: 'grow' },
    pointerMode: 'capture', onPointer: () => true, onWheel: () => true });
  const host = new UiElement({ id: 'game.help', kind: 'help-book', label: 'ORCHARD GUIDE',
    style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout }, children: [frame],
    onKeyCapture(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return false;
      if (event.key.toLowerCase() === 'x') { options.onClose?.(); return true; }
      // Arrow keys stay with a focused link paragraph or tab; letters and paging always turn topics.
      if (['ArrowLeft', 'ArrowRight'].includes(event.key)) return false;
      if (['ArrowUp', 'ArrowDown'].includes(event.key)) return focusedRow !== null && step(event.key === 'ArrowUp' ? -1 : 1, true);
      return handleHelpKey(event.key);
    },
    onKey(event) { return ['ArrowLeft', 'ArrowRight'].includes(event.key) && !event.ctrlKey && handleHelpKey(event.key); },
    onDismiss: () => options.onClose?.() });
  build(); renderTopic();
  const focusBook = () => { frame.setStyle({ visible: true }); rows.get(topic.id)?.requestFocus(); };
  const setBookPage = (next: { readonly width: number; readonly height: number }) => { page = next; book?.setBookPage(next); };
  return Object.defineProperties(Object.assign(host, { handleHelpKey, reset: () => { show(chapters[0]!, chapters[0]!.topics[0]!); }, focusBook, openTopic, setBookPage }), {
    chapter: { get: () => chapter.id }, topic: { get: () => topic.id },
  }) as UiHelpBookElement;
}

function descendants(node: UiElement): UiElement[] { return node.children.flatMap(child => [child, ...descendants(child)]); }
