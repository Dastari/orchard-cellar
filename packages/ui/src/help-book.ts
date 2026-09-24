import type { UiRect } from './geometry.js';
import type { UiTextLinkTarget } from './design-system/rich-text.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiHelpBook, type UiHelpBookElement } from './kit/components/help-book.js';
import { uiFixed } from './kit/layout/box.js';
import { UiRoot } from './kit/runtime/root.js';
export { HELP_TOPICS } from './help-topics.js';

/** The guide uses the shared paginated book, including its explicit reading headings. */
export class HelpBook {
  readonly root: UiRoot;
  private bounds: UiRect | undefined;
  private readonly view: UiHelpBookElement;

  constructor(art: UiKitArt, onClose: () => void, onLink?: (target: UiTextLinkTarget) => void) {
    this.root = new UiRoot({ art, scale: 1, label: 'Orchard guide' });
    this.view = uiHelpBook({ art, onClose, onLink });
    this.root.mount(this.view);
  }

  reset(): void { this.view.reset(); }
  setBounds(frame: UiRect, viewportWidth: number, viewportHeight: number): void {
    const previousFocus = this.root.focus.current;
    this.root.resize(viewportWidth, viewportHeight);
    if (!this.bounds || this.bounds.x !== frame.x || this.bounds.y !== frame.y || this.bounds.width !== frame.width || this.bounds.height !== frame.height) {
      this.bounds = { ...frame };
      this.view.setStyle({ position: 'absolute', inset: { left: uiFixed(frame.x), top: uiFixed(frame.y) },
        width: uiFixed(frame.width), height: uiFixed(frame.height) });
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
