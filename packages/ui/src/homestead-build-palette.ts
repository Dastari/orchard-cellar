import type { HomesteadUpgradeKind } from '@orchard/sim';
import type { LoadedAsset } from './assets.js';
import { containsPoint, type UiPoint } from './geometry.js';
import { UiRoot } from './kit/runtime/root.js';
import type { UiElementKey } from './kit/runtime/element.js';
import { uiFixed } from './kit/layout/box.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiBuildPalette, type UiBuildSelection, type UiBuildPaletteEntry, type UiBuildPaletteModel } from './kit/components/build-palette.js';
export type HomesteadBuildSelection = UiBuildSelection;
export type HomesteadBuildPaletteEntry = UiBuildPaletteEntry;
export interface HomesteadBuildPaletteModel extends Omit<UiBuildPaletteModel, 'selection'> {
  readonly width: number; readonly height: number; readonly blocked?: boolean;
}
/** Selection and authority adapter; the kit owns all geometry, drawing and controls. */
export class HomesteadBuildPalette {
  readonly root: UiRoot;
  readonly palette: ReturnType<typeof uiBuildPalette>;
  private model: HomesteadBuildPaletteModel = { width: 320, height: 180, entries: [], upgrades: [], counts: {}, upgradeRanks: {}, balanceBronze: 0n };
  private selected: HomesteadBuildSelection = { kind: 'remove' };
  private signature = '';
  private pressed = false;
  private swipe: { start: UiPoint; previous: UiPoint; moved: boolean } | null = null;
  constructor(art: UiKitArt, itemArt: Readonly<Record<string, LoadedAsset>>, onPurchase: (kind: HomesteadUpgradeKind) => void) {
    this.root = new UiRoot({ art, scale: 1 });
    this.palette = uiBuildPalette({ model: { ...this.model, selection: this.selected }, artwork: itemArt,
      layout: { position: 'absolute' }, onSelect: selection => { if (!this.model.blocked) { this.selected = selection; this.sync(); } },
      onPurchase: kind => { if (!this.model.blocked) onPurchase(kind); } });
    this.root.mount(this.palette);
  }
  get selection(): HomesteadBuildSelection { return this.selected; }
  setModel(model: HomesteadBuildPaletteModel): void {
    const initial = this.model.entries.length === 0;
    this.model = model;
    if (initial || this.selected.kind === 'place' && !model.entries.some(entry => this.selected.kind === 'place' && entry.itemKind === this.selected.itemKind)) {
      const first = model.entries[0]; this.selected = first ? { kind: 'place', itemKind: first.itemKind } : { kind: 'remove' };
    }
    this.root.resize(model.width, model.height);
    this.palette.setStyle({ visible: !model.blocked });
    const width = Math.max(0, Math.min(304, model.width - 16));
    const top = Math.min(42, Math.max(8, model.height / 8));
    this.palette.setStyle({ width: uiFixed(width), height: uiFixed(Math.max(0, Math.min(300, model.height - top - 40))),
      inset: { left: uiFixed((model.width - width) / 2), top: uiFixed(top) } });
    if (model.blocked) this.pointerLeave();
    this.sync();
  }
  private sync(): void {
    const signature = JSON.stringify([this.model.entries, this.model.upgrades, this.model.counts, this.model.upgradeRanks, String(this.model.balanceBronze), this.selected]);
    if (signature !== this.signature) {
      this.signature = signature;
      const focus = this.root.focus.current?.id;
      this.pointerLeave();
      this.palette.updateBuildPalette({ ...this.model, selection: this.selected }); this.root.arrange();
      const next = this.root.entries().find(entry => entry.element.id === focus)?.element;
      if (next && !next.disabled) this.root.focus.set(next);
    }
    this.root.arrange();
  }
  pointerDown(point: UiPoint, button: number, pointerType = 'mouse'): boolean {
    this.root.arrange();
    if (this.model.blocked || !containsPoint(this.palette.clip, point)) return false;
    this.pressed = true; this.swipe = pointerType === 'touch' ? { start: point, previous: point, moved: false } : null;
    this.root.pointer({ type: 'down', point, button, pointerId: 1 }); return true;
  }
  pointerMove(point: UiPoint): boolean {
    if (this.model.blocked) return false;
    if (this.swipe) {
      if (Math.hypot(point.x - this.swipe.start.x, point.y - this.swipe.start.y) > 4) this.swipe.moved = true;
      if (this.swipe.moved) {
        this.root.pointer({ type: 'cancel', point, button: 0, pointerId: 1 });
        scrollUiElement(this.palette.scrollArea, 0, this.palette.scrollArea.scroll.y + this.swipe.previous.y - point.y);
      }
      this.swipe.previous = point;
    }
    this.root.pointer({ type: 'move', point, button: 0, pointerId: 1 });
    return this.pressed || containsPoint(this.palette.clip, point);
  }
  pointerUp(point: UiPoint, button: number): boolean {
    const pressed = this.pressed;
    if (!this.model.blocked && pressed && !this.swipe?.moved) this.root.pointer({ type: 'up', point, button, pointerId: 1 });
    this.pressed = false; this.swipe = null; return pressed;
  }
  pointerLeave(): void {
    this.root.pointer({ type: 'cancel', point: { x: -1, y: -1 }, button: 0, pointerId: 1 });
    this.root.input.clearHover(); this.pressed = false; this.swipe = null;
  }
  key(event: UiElementKey): boolean {
    if (this.model.blocked || !['Tab', 'Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return false;
    return this.root.key(event);
  }
  wheel(point: UiPoint, deltaX: number, deltaY: number): boolean {
    if (this.model.blocked || !containsPoint(this.palette.clip, point)) return false;
    this.root.wheel({ point, deltaX, deltaY }); return true;
  }
  draw(context: CanvasRenderingContext2D): void { this.root.drawInContext(context); }
  dispose(): void { this.root.dispose(); }
}
