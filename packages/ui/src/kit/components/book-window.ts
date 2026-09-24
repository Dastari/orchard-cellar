import { containsPoint } from '../../geometry.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { paintUiSkin } from './art.js';
import { uiFrame } from './frame.js';
import { uiFlex } from './layout.js';
import { paintUiBookTab, uiBookTabClose } from './recipe-book.js';

export interface UiBookChapter {
  readonly id: string; readonly label: string;
  /** Skin icon key (for example `chapter.character`) shown on the chapter's page tab. */
  readonly icon: string;
  readonly hotkey?: string;
  readonly left: () => UiElement; readonly right: () => UiElement;
}
export interface UiBookWindowOptions {
  readonly id?: string; readonly chapters: readonly UiBookChapter[]; readonly active: string;
  readonly onChapter: (id: string) => void; readonly onClose?: () => void;
  /** Width and height of one leaf's content area. */
  readonly page: { readonly width: number; readonly height: number };
  readonly layout?: UiStyle;
}

/** An upright chapter tab on the book's top edge: raised when current, lifting on hover or focus. */
function chapterTab(chapter: UiBookChapter, active: () => boolean, onPress: () => void): UiElement {
  let pressed = false;
  return new UiElement({ id: `book.tab.${chapter.id}`, kind: 'tab', label: chapter.hotkey ? `${chapter.label} (${chapter.hotkey})` : chapter.label, focusable: true, pointerMode: 'capture',
    props: { selected: active() }, style: { width: uiFixed(20), height: uiFixed(28), shrink: 0 },
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); return true; }
      if (event.type === 'up' && pressed) { pressed = false; event.release(); if (containsPoint(element.clip, event.point)) onPress(); return true; }
      if (event.type === 'cancel') { pressed = false; event.release(); return true; }
      return pressed;
    },
    onKey(event) { if (event.key === 'Enter' || event.key === ' ') { onPress(); return true; } return false; },
    paint(element, { context, art, hovered, focused }) {
      if (!art) return;
      // Tabs stand 20px above the cover (4px tucked beneath); resting tabs sit 4px lower, hover lifts them halfway.
      const r = element.rect, current = active(), height = current ? r.height : hovered || focused ? r.height - 2 : r.height - 4;
      paintUiBookTab(context, art.skin.book, current ? 'tab.peach_raised' : 'tab.cream', r.x, r.y + r.height, height);
      paintUiSkin(context, art.skin.icon, chapter.icon, { x: r.x + 2, y: r.y + r.height - height + 2, width: 16, height: 16 });
    },
  });
}

/** A book-bound window: chapter tabs stand on the top edge, a close tab at the far right,
 * and each chapter fills the two leaves. Arrow keys on a tab move between chapters. */
export interface UiBookWindowElement extends UiElement {
  /** Resize both leaves in place (for example when the viewport changes), keeping every node and its focus. */
  setBookPage(page: { readonly width: number; readonly height: number }): void;
}
export function uiBookWindow(options: UiBookWindowOptions): UiBookWindowElement {
  const chapter = options.chapters.find(entry => entry.id === options.active) ?? options.chapters[0]!;
  const tabs = options.chapters.map(entry => chapterTab(entry, () => entry.id === options.active, () => options.onChapter(entry.id)));
  // The book art's top edge sits 4px inside its frame, so tabs start 4px lower to tuck under it.
  const tabRow = uiFlex({ direction: 'row', gap: 2, position: 'absolute', inset: { left: 24, top: 0 } }, tabs);
  const close = options.onClose ? uiBookTabClose({ label: 'Close book', onPress: options.onClose }) : null;
  close?.setStyle({ position: 'absolute', inset: { right: 24, top: 0 } });
  const page = (child: UiElement) => uiFlex({ direction: 'column', gap: 6, width: uiFixed(options.page.width), height: uiFixed(options.page.height), shrink: 0 }, [child]);
  // Phones keep both leaves with narrower pages; the spread is always two pages either side of the spine.
  const leaves = [page(chapter.left()), page(chapter.right())];
  const width = options.page.width * 2 + 24 + 32;
  const book = uiFrame({ id: options.id, style: 'book', padding: 16, layout: { direction: 'row', gap: 24, width: uiFixed(width), height: uiFixed(options.page.height + 32) }, children: leaves });
  book.setProps({ label: chapter.label });
  const window = new UiElement({ id: options.id ? `${options.id}.window` : undefined, kind: 'book-window', label: chapter.label, style: { display: 'stack', ...options.layout },
    // Tabs stand behind the cover so their feet tuck under its top edge.
    children: [tabRow, ...(close ? [close] : []), uiFlex({ direction: 'column', padding: { top: 24 } }, [book])],
    onKey(event) {
      const index = options.chapters.findIndex(entry => entry.id === options.active);
      if (event.key === 'ArrowRight' && event.ctrlKey) { options.onChapter(options.chapters[(index + 1) % options.chapters.length]!.id); return true; }
      if (event.key === 'ArrowLeft' && event.ctrlKey) { options.onChapter(options.chapters[(index + options.chapters.length - 1) % options.chapters.length]!.id); return true; }
      return false;
    },
  });
  const setBookPage = (page: { readonly width: number; readonly height: number }) => {
    for (const leaf of leaves) leaf.setStyle({ width: uiFixed(page.width), height: uiFixed(page.height) });
    book.setStyle({ width: uiFixed(page.width * 2 + 24 + 32), height: uiFixed(page.height + 32) });
  };
  return Object.assign(window, { setBookPage });
}
