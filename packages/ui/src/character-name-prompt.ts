import { normalizeCharacterName } from '@orchard/sim';
import type { UiPoint, UiRect } from './geometry.js';
import { UiRoot } from './kit/runtime/root.js';
import { UiTextBridge } from './kit/runtime/text-bridge.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import type { UiElement, UiElementKey } from './kit/runtime/element.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiCharacterName, type UiCharacterNameElement } from './kit/components/character-name.js';

export function characterNameErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('display_name_taken')) return 'THAT CHARACTER NAME IS ALREADY TAKEN';
  if (message.includes('invalid_display_name')) return "3-20 LETTERS, NUMBERS, SPACES, - OR '";
  if (message.includes('character_name_already_set')) return 'THIS CHARACTER ALREADY HAS A NAME';
  return 'COULD NOT SAVE THE CHARACTER NAME';
}

/** Gameplay adapter for the required shared-kit naming gate. */
export class CharacterNamePrompt {
  private frame?: UiCharacterNameElement;
  private bridge?: UiTextBridge;
  private busy = false;
  private error: string | null = null;
  private generation = 0;
  private pointer: UiPoint = { x: -100, y: -100 };
  private button = 0;
  private swipe?: { node: UiElement; startY: number; offset: number; active: boolean };
  readonly kitRoot: UiRoot;
  private readonly ownsRoot: boolean;
  constructor(art: UiKitArt, private readonly submitName: (name: string) => Promise<void>,
    private readonly onActiveChanged: (active: boolean) => void, root?: UiRoot) {
    this.ownsRoot = !root; this.kitRoot = root ?? new UiRoot({ art, scale: 1 });
  }
  get isActive(): boolean { return this.frame !== undefined; }
  update(width: number, height: number, required: boolean): void {
    if (this.ownsRoot) this.kitRoot.resize(width, height);
    if (required && !this.frame) {
      this.generation++; this.busy = false; this.error = null;
      this.frame = uiCharacterName({ onSubmit: name => this.submit(name), onChange: () => { this.error = null; this.refresh(); },
        layout: { position: 'fixed' } });
      this.kitRoot.mount(this.frame); this.kitRoot.arrange(); this.frame.focusName(); this.onActiveChanged(true);
    } else if (!required && this.frame) {
      this.generation++; this.frame.dispose(); this.frame = undefined; this.busy = false; this.error = null;
      this.onActiveChanged(false);
    }
    this.refresh();
  }
  private refresh(): void { this.frame?.updateCharacterName({ busy: this.busy, error: this.error }); this.kitRoot.arrange(); this.bridge?.sync(); }
  handleGlobalKeyDown(event?: UiElementKey): boolean {
    if (!this.frame) return false;
    if (event) this.kitRoot.key(event);
    else this.frame.focusName();
    this.refresh(); return true;
  }
  pointerMove(point: UiPoint): void {
    this.pointer = point; if (!this.frame) return;
    if (this.swipe && (this.swipe.active || Math.abs(point.y - this.swipe.startY) >= 4)) {
      if (!this.swipe.active) { this.kitRoot.pointer({ type: 'cancel', point, button: this.button, pointerId: 1 }); this.swipe.active = true; }
      scrollUiElement(this.swipe.node, this.swipe.node.scroll.x, this.swipe.offset + this.swipe.startY - point.y);
    } else this.kitRoot.pointer({ type: 'move', point, button: this.button, pointerId: 1 });
  }
  pointerLeave(): void { if (this.frame) this.kitRoot.pointer({ type: 'cancel', point: this.pointer, button: this.button, pointerId: 1 }); this.pointer = { x: -100, y: -100 }; this.swipe = undefined; }
  pointerDown(point: UiPoint, button: number, pointerType?: string): boolean {
    if (!this.frame) return false;
    const node = pointerType === 'touch' ? this.kitRoot.input.hits(point).find(node => node.scroll.maxY > 0) : undefined;
    this.swipe = node ? { node, startY: point.y, offset: node.scroll.y, active: false } : undefined;
    this.pointer = point; this.button = button; this.kitRoot.pointer({ type: 'down', point, button, pointerId: 1 }); this.refresh(); return true;
  }
  pointerUp(point: UiPoint, button: number): void { if (this.frame) { this.kitRoot.pointer({ type: this.swipe?.active ? 'cancel' : 'up', point, button, pointerId: 1 }); this.swipe = undefined; this.refresh(); } }
  wheel(point: UiPoint, deltaY: number): void { if (this.frame) this.kitRoot.wheel({ point, deltaX: 0, deltaY }); }
  blur(): void { this.bridge?.input.blur(); }
  draw(context: CanvasRenderingContext2D): void { if (!this.frame) return; if (this.ownsRoot) this.kitRoot.drawInContext(context); this.bridge?.sync(); }
  bindTextInput(canvas: HTMLCanvasElement, clientRect: (rect: UiRect) => UiRect): void {
    this.bridge?.dispose(); this.bridge = new UiTextBridge(canvas, () => this.frame && this.kitRoot.focus.current?.isDescendantOf(this.frame) ? this.kitRoot.focus.current : null,
      event => this.handleGlobalKeyDown(event), node => clientRect(node.rect), () => this.kitRoot.invalidate());
    for (const type of ['keydown', 'keyup'] as const) this.bridge.input.addEventListener(type, event => event.stopPropagation());
  }
  dispose(): void { this.generation++; this.frame?.dispose(); this.frame = undefined; this.bridge?.dispose(); if (this.ownsRoot) this.kitRoot.dispose(); }
  private submit(raw: string): void {
    if (this.busy || !this.frame) return;
    const name = normalizeCharacterName(raw);
    if (name === null) { this.error = "3-20 LETTERS, NUMBERS, SPACES, - OR '"; this.refresh(); return; }
    this.busy = true; this.error = null; const generation = this.generation; this.refresh();
    void this.submitName(name).catch((error: unknown) => {
      if (generation !== this.generation || !this.frame) return;
      this.busy = false; this.error = characterNameErrorText(error); this.frame.updateCharacterName({ busy: false, error: this.error }); this.frame.focusName(); this.refresh();
    });
  }
}
