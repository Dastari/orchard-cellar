import type { RogueBoonRegistry } from '@orchard/sim';
import { rogueUpgradeDefinition } from '@orchard/sim/roguelike';
import type { PwaUpdateStatus } from '../pwa-update.js';
import type { UiKitArt } from '../kit/components/art.js';
import { uiDelveConfirmation } from '../kit/components/delve-confirmation.js';
import { uiDelveHud, uiDelveRewards, type UiDelveRun, type UiDelveOffer } from '../kit/components/delve.js';
import { uiUpdateReady } from '../kit/components/update-ready.js';
import { UiElement } from '../kit/runtime/element.js';
import { UiRoot } from '../kit/runtime/root.js';
import { uiFixed } from '../kit/layout/box.js';
import { UI_TONE_FACES } from '../kit/skin/contrast.js';

interface Viewport { readonly width: number; readonly height: number }
/** Blocking dialogs centre at their fitted size over a light veil. */
const CENTRED_MODAL = { display: 'flex', justify: 'center', align: 'center', width: 'grow', height: 'grow', zLayer: 'modal' } as const;
function dimBackdrop(element: UiElement, { context }: { readonly context: CanvasRenderingContext2D }): void {
  const r = element.rect; context.save(); context.globalAlpha = .35; context.fillStyle = UI_TONE_FACES.muted.button_disabled.face;
  context.fillRect(r.x, r.y, r.width, r.height); context.restore();
}
/** The fitted window never exceeds the viewport; its body scrolls inside the chrome instead. */
function capToViewport(view: UiElement, viewport: Viewport): void {
  view.setStyle({ maxWidth: uiFixed(Math.max(0, viewport.width - 8)), maxHeight: uiFixed(Math.max(0, viewport.height - 8)) });
}
export interface DelveConfirmationModel extends Viewport {
  /** Identity, connection generation and current entry interaction. */
  readonly sessionKey: string; readonly visible: boolean; readonly canBegin: boolean;
}
export interface DelveConfirmationCommands { readonly begin: () => void; readonly cancel: () => void }

/** Uses the game's root/clock/input loop; it neither starts a loop nor binds DOM. */
export class DelveConfirmationUi {
  readonly root: UiRoot;
  private model: DelveConfirmationModel | null = null;
  private view: ReturnType<typeof uiDelveConfirmation> | null = null;
  private consumed = false;
  constructor(art: UiKitArt, private readonly commands: DelveConfirmationCommands) {
    this.root = new UiRoot({ art, scale: 1, label: 'Delve confirmation' });
  }
  get active(): boolean { return !!this.model?.visible && !this.consumed; }
  update(model: DelveConfirmationModel): void {
    const previous = this.model;
    if (previous?.sessionKey !== model.sessionKey || previous.visible !== model.visible) {
      this.root.input.cancelPointers(); this.root.focus.set(null);
      this.consumed = false;
      for (const child of [...this.root.tree.children]) child.dispose();
      this.view = null;
    } else if (previous.canBegin !== model.canBegin) this.root.input.cancelPointers();
    this.model = model; this.root.resize(model.width, model.height);
    if (!this.active) return;
    if (!this.view) {
      this.view = uiDelveConfirmation({ canBegin: model.canBegin, onBegin: () => this.finish(true), onCancel: () => this.finish(false) });
      this.root.mount(new UiElement({ id: 'game.delve-confirmation.host', style: CENTRED_MODAL,
        props: { singlePointer: true, touchScroll: true }, children: [this.view], paint: dimBackdrop,
        onKeyCapture: event => {
          if (event.repeat && ['Enter', ' ', 'Escape', 'e', 'E'].includes(event.key)) return true;
          if (event.key.toLowerCase() === 'e') { this.finish(true); return true; }
          return false;
        },
      }));
      this.view.focusBegin();
    }
    this.view.updateCanBegin(model.canBegin); capToViewport(this.view, model); this.root.arrange();
  }
  private finish(begin: boolean): void {
    if (!this.active || (begin && !this.model?.canBegin)) return;
    this.consumed = true; this.root.input.cancelPointers();
    this.view?.setStyle({ visible: false });
    (begin ? this.commands.begin : this.commands.cancel)();
  }
  draw(context: CanvasRenderingContext2D): void { if (this.active) this.root.drawInContext(context); }
  dispose(): void { this.root.dispose(); this.model = null; this.view = null; }
}

export interface UpdateReadyModel extends Viewport { readonly status: PwaUpdateStatus }
export interface UpdateReadyCommands { readonly refresh: () => void; readonly later?: () => void }
/** Availability is an uninterrupted status interval, not a render-frame event. */
export class UpdateReadyUi {
  readonly root: UiRoot;
  private status: PwaUpdateStatus = 'unsupported';
  private dismissed = false;
  private refreshing = false;
  private view: ReturnType<typeof uiUpdateReady> | null = null;
  constructor(art: UiKitArt, private readonly commands: UpdateReadyCommands) {
    this.root = new UiRoot({ art, scale: 1, label: 'Client update' });
  }
  get active(): boolean { return this.status === 'available' && !this.dismissed; }
  /** Synchronous: service-worker events can make the decision usable while RAF is paused. */
  update(model: UpdateReadyModel): void {
    if (model.status !== this.status) {
      this.root.input.cancelPointers(); this.root.focus.set(null);
      this.dismissed = false; this.refreshing = false;
      for (const child of [...this.root.tree.children]) child.dispose();
      this.view = null;
    }
    this.status = model.status; this.root.resize(model.width, model.height);
    if (!this.active) return;
    if (!this.view) {
      this.view = uiUpdateReady({ onRefresh: () => this.refresh(), onLater: () => this.later() });
      this.root.mount(new UiElement({ id: 'game.update-ready.host', style: CENTRED_MODAL,
        props: { singlePointer: true, touchScroll: true }, children: [this.view], paint: dimBackdrop,
        onKeyCapture: event => event.repeat && ['Enter', ' ', 'Escape'].includes(event.key) ? true : false,
      }));
      capToViewport(this.view, model); this.root.arrange();
      this.root.entries().find(({ element }) => element.id === 'update-ready.refresh')?.element.requestFocus();
    }
    capToViewport(this.view, model); this.root.arrange();
  }
  private refresh(): void {
    if (!this.active || this.refreshing) return;
    this.refreshing = true; this.root.input.cancelPointers(); this.commands.refresh();
  }
  private later(): void {
    if (!this.active) return;
    this.dismissed = true; this.root.input.cancelPointers(); this.commands.later?.();
  }
  draw(context: CanvasRenderingContext2D): void { if (this.active) this.root.drawInContext(context); }
  dispose(): void { this.root.dispose(); this.view = null; this.status = 'unsupported'; }
}

export interface DelveRewardsModel extends Viewport {
  /** Identity + connection generation + run id + room. No client-generated authority. */
  readonly sessionKey: string; readonly visible: boolean;
  readonly run: UiDelveRun; readonly offers: readonly UiDelveOffer[]; readonly registry: RogueBoonRegistry;
}
export interface DelveRewardsCommands {
  readonly choose: (slot: number) => Promise<void>;
  readonly leaveShop: () => Promise<void>;
}
/** Reward submission acknowledgment never advances the run or its frozen timers. */
export class DelveRewardsUi {
  readonly rewardsRoot: UiRoot;
  readonly hudRoot: UiRoot;
  private model: DelveRewardsModel | null = null;
  private view: ReturnType<typeof uiDelveRewards> | null = null;
  private hud: ReturnType<typeof uiDelveHud> | null = null;
  private authorityKey = '';
  private gestureKey = '';
  private request = 0;
  private pending = false;
  private notice = '';
  constructor(art: UiKitArt, private readonly commands: DelveRewardsCommands) {
    this.rewardsRoot = new UiRoot({ art, scale: 1, label: 'Delve rewards' });
    this.hudRoot = new UiRoot({ art, scale: 1, label: 'Delve status' });
  }
  get active(): boolean { return !!this.model?.visible && this.model.run.phase === 'reward'; }
  get hudActive(): boolean { return !!this.model?.visible; }
  get submissionPending(): boolean { return this.pending; }
  update(model: DelveRewardsModel | null): void {
    const scopeChanged = model?.sessionKey !== this.model?.sessionKey;
    const key = model ? JSON.stringify([model.sessionKey, model.run.phase, model.run.roomKind, model.offers]) : '';
    if (key !== this.authorityKey) {
      this.authorityKey = key; this.request++; this.pending = false; this.notice = '';
    }
    const gestureKey = model ? JSON.stringify([key, model.visible, model.run.currency,
      model.offers.map(offer => rogueUpgradeDefinition(model.registry, offer.upgradeId))]) : '';
    if (gestureKey !== this.gestureKey) { this.rewardsRoot.input.cancelPointers(); this.gestureKey = gestureKey; }
    if (scopeChanged || model === null) {
      this.rewardsRoot.focus.set(null);
      for (const child of [...this.rewardsRoot.tree.children]) child.dispose();
      for (const child of [...this.hudRoot.tree.children]) child.dispose();
      this.view = null; this.hud = null;
    }
    this.model = model;
    if (!model) return;
    this.rewardsRoot.resize(model.width, model.height); this.hudRoot.resize(model.width, model.height);
    this.project();
  }
  private project(): void {
    const model = this.model; if (!model) return;
    if (!this.hud) { this.hud = uiDelveHud(model.run); this.hudRoot.mount(this.hud); }
    this.hud.updateDelveHud(model.run);
    const hudWidth = Math.max(0, Math.min(500, model.width - 16));
    this.hud.setStyle({ position: 'absolute', inset: { top: uiFixed(4), left: uiFixed((model.width - hudWidth) / 2) }, width: uiFixed(hudWidth), height: 'fit', visible: this.hudActive });
    this.hudRoot.arrange();
    const presentation = { topInset: this.hud.rect.y + this.hud.rect.height, run: model.run, offers: model.offers, registry: model.registry, pending: this.pending, notice: this.notice };
    const focusId = this.rewardsRoot.focus.current?.id;
    if (!this.view) {
      this.view = uiDelveRewards({ model: presentation, onChoose: slot => this.submit(slot), onLeaveShop: () => this.submit(null) });
      this.rewardsRoot.mount(this.view);
    } else this.view.updateDelveRewards(presentation);
    this.view.setStyle({ visible: this.active }); this.rewardsRoot.arrange(); this.hudRoot.arrange();
    if (this.active) {
      const target = this.rewardsRoot.entries().find(({ element }) => element.id === focusId && !element.disabled)?.element;
      if (target) this.rewardsRoot.focus.set(target);
      else if (!this.rewardsRoot.focus.current || this.rewardsRoot.focus.current.disposed || this.rewardsRoot.focus.current.disabled) this.rewardsRoot.focus.set(this.view);
    }
  }
  private submit(slot: number | null): void {
    const model = this.model;
    if (!model || !this.active || this.pending) return;
    if (slot === null) { if (model.run.roomKind !== 'shop') return; }
    else { const offer = model.offers.find(value => value.slot === slot); if (!offer || offer.cost > model.run.currency) return; }
    const request = ++this.request, key = this.authorityKey;
    this.pending = true; this.notice = ''; this.rewardsRoot.input.cancelPointers(); this.project();
    const rejected = (error: unknown): void => {
      if (request !== this.request || key !== this.authorityKey) return;
      this.pending = false; this.notice = error instanceof Error ? error.message : 'The Delve action was rejected.'; this.project();
    };
    try { void (slot === null ? this.commands.leaveShop() : this.commands.choose(slot)).catch(rejected); }
    catch (error) { rejected(error); }
  }
  drawRewards(context: CanvasRenderingContext2D): void { if (this.active) this.rewardsRoot.drawInContext(context); }
  drawHud(context: CanvasRenderingContext2D): void { if (this.hudActive) this.hudRoot.drawInContext(context); }
  dispose(): void { this.request++; this.model = null; this.rewardsRoot.dispose(); this.hudRoot.dispose(); }
}
