import type { UiRect } from './geometry.js';
import type { UiTextLinkTarget } from './design-system/rich-text.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiGameBookPage } from './kit/components/character-book.js';
import { uiHelpBook, type UiHelpBookElement } from './kit/components/help-book.js';
import { uiFixed } from './kit/layout/box.js';
import { UiRoot } from './kit/runtime/root.js';
import { centreGameBook, gameBookSize } from './quest-log.js';
export { HELP_TOPICS } from './help-topics.js';

/** The Orchard guide: its own chaptered book, centred in the host's bounds. */
export class HelpBook {
  readonly root: UiRoot;
  private placed: UiRect | undefined;
  private page: { readonly width: number; readonly height: number } | undefined;
  private readonly view: UiHelpBookElement;

  constructor(art: UiKitArt, onClose: () => void, onLink?: (target: UiTextLinkTarget) => void) {
    this.root = new UiRoot({ art, scale: 1, label: 'Orchard guide' });
    this.view = uiHelpBook({ art, onClose, onLink });
    this.root.mount(this.view);
  }

  get chapter(): string { return this.view.chapter; }
  get topic(): string { return this.view.topic; }
  reset(): void { this.view.reset(); }
  setBounds(frame: UiRect, viewportWidth: number, viewportHeight: number): void {
    const previousFocus = this.root.focus.current;
    this.root.resize(viewportWidth, viewportHeight);
    const page = uiGameBookPage(viewportWidth, viewportHeight);
    if (!this.page || this.page.width !== page.width || this.page.height !== page.height) { this.page = page; this.view.setBookPage(page); }
    const placed = centreGameBook(frame, gameBookSize(page), viewportWidth, viewportHeight);
    if (!this.placed || this.placed.x !== placed.x || this.placed.y !== placed.y || this.placed.width !== placed.width || this.placed.height !== placed.height) {
      this.placed = placed;
      this.view.setStyle({ position: 'absolute', inset: { left: uiFixed(placed.x), top: uiFixed(placed.y) },
        width: uiFixed(placed.width), height: uiFixed(placed.height) });
    }
    this.root.arrange();
    if (previousFocus && !this.root.focus.current) {
      const replacement = this.root.entries().find(entry => entry.element.id === previousFocus.id && !entry.element.disabled)?.element;
      if (replacement) this.root.focus.set(replacement); else this.view.focusBook();
      this.root.arrange();
    }
  }

  focus(): void { this.view.setStyle({ visible: true }); this.view.focusBook(); this.root.arrange(); }
  draw(context: CanvasRenderingContext2D): void { this.root.drawInContext(context); }
  dispose(): void { this.root.dispose(); }
}
