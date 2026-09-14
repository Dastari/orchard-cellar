import type { UiPoint } from './geometry.js';
import { UiRoot } from './kit/runtime/root.js';
import type { UiElementKey } from './kit/runtime/element.js';
import { uiFixed } from './kit/layout/box.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiDelveHud, uiDelveRewards, type UiDelveRun, type UiDelveOffer } from './kit/components/delve.js';

export interface DelveUiModel {
  readonly width: number; readonly height: number;
  readonly run: UiDelveRun | null; readonly offers: readonly UiDelveOffer[];
  readonly blocked: boolean;
}
/** Gameplay boundary for the shared Delve compositions; owns no painting or hit rectangles. */
export class DelveUi {
  readonly root: UiRoot;
  private model: DelveUiModel = { width: 0, height: 0, run: null, offers: [], blocked: true };
  private readonly hud: ReturnType<typeof uiDelveHud>;
  readonly rewards: ReturnType<typeof uiDelveRewards>;
  private signature = '';
  private touch: { point: UiPoint; previous: UiPoint; moved: boolean } | null = null;
  constructor(art: UiKitArt, onChoose: (slot: number) => void, onLeaveShop: () => void) {
    this.root = new UiRoot({ art, scale: 1 });
    const run: UiDelveRun = { roomNumber: 0, roomKind: '', theme: '', phase: '', wave: 0, maximumWaves: 0, currency: 0 };
    this.hud = uiDelveHud(run, { position: 'absolute', inset: { top: uiFixed(4) } });
    this.root.mount(this.hud);
    this.rewards = uiDelveRewards({ model: { run, offers: [] }, onChoose: slot => {
      const offer = this.model.offers.find(candidate => candidate.slot === slot);
      if (this.active && offer && offer.cost <= this.model.run!.currency) onChoose(slot);
    }, onLeaveShop: () => { if (this.active && this.model.run?.roomKind === 'shop') onLeaveShop(); } });
    this.root.mount(this.rewards);
  }
  get active(): boolean { return !this.model.blocked && this.model.run?.phase === 'reward'; }
  update(model: DelveUiModel): void {
    this.model = model; this.root.resize(model.width, model.height);
    this.hud.setStyle({ visible: !model.blocked && model.run !== null && !this.active });
    this.rewards.setStyle({ visible: this.active });
    if (!this.active) this.pointerCancel();
    if (model.run) {
      this.hud.updateDelveHud(model.run);
      const width = Math.max(0, Math.min(400, model.width - 16));
      this.hud.setStyle({ width: uiFixed(width), inset: { top: uiFixed(4), left: uiFixed((model.width - width) / 2) } });
      const signature = JSON.stringify([model.run.roomNumber, model.run.roomKind, model.run.theme, model.run.phase, model.run.wave, model.run.maximumWaves, model.run.currency, model.offers.map(offer => [offer.slot, offer.upgradeId, offer.rarity, offer.magnitudePermille, offer.cost])]);
      if (signature !== this.signature) {
        this.signature = signature;
        const focusId = this.root.focus.current?.id;
        this.root.pointer({ type: 'cancel', point: { x: 0, y: 0 }, button: 0, pointerId: 1 });
        this.rewards.updateDelveRewards({ run: model.run, offers: model.offers });
        this.root.arrange();
        const focus = this.root.entries().find(entry => entry.element.id === focusId)?.element;
        if (focus && !focus.disabled) this.root.focus.set(focus);
      }
    }
    this.root.arrange();
  }
  draw(context: CanvasRenderingContext2D): void { this.root.drawInContext(context); }
  key(event: UiElementKey): boolean { if (!this.active) return false; this.root.key(event); return true; }
  pointerDown(point: UiPoint, button: number, pointerType = 'mouse'): boolean {
    if (!this.active) return false;
    this.touch = pointerType === 'touch' ? { point, previous: point, moved: false } : null;
    this.root.pointer({ type: 'down', point, button, pointerId: 1 }); return true;
  }
  pointerMove(point: UiPoint): boolean {
    if (!this.active) return false;
    if (this.touch) {
      if (Math.hypot(point.x - this.touch.point.x, point.y - this.touch.point.y) > 4) this.touch.moved = true;
      if (this.touch.moved) {
        this.root.pointer({ type: 'cancel', point: { x: 0, y: 0 }, button: 0, pointerId: 1 });
        scrollUiElement(this.rewards.scrollArea, 0, this.rewards.scrollArea.scroll.y + this.touch.previous.y - point.y);
      }
      this.touch.previous = point;
    }
    this.root.pointer({ type: 'move', point, button: 0, pointerId: 1 }); return true;
  }
  pointerUp(point: UiPoint, button: number): boolean {
    if (!this.active) { this.pointerCancel(); return false; }
    if (!this.touch?.moved) this.root.pointer({ type: 'up', point, button, pointerId: 1 });
    this.touch = null; return true;
  }
  pointerCancel(): void { this.touch = null; this.root.pointer({ type: 'cancel', point: { x: 0, y: 0 }, button: 0, pointerId: 1 }); this.root.input.clearHover(); }
  wheel(point: UiPoint, deltaX: number, deltaY: number): boolean {
    if (!this.active) return false; this.root.wheel({ point, deltaX, deltaY }); return true;
  }
  dispose(): void { this.root.dispose(); }
}
