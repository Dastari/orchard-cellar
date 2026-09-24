import type { UiKitArt } from './kit/components/art.js';
import { uiTrade, type UiTradeElement } from './kit/components/trade.js';
import { UiElement } from './kit/runtime/element.js';
import { UiRoot } from './kit/runtime/root.js';
import { uiFixed } from './kit/layout/box.js';
import type { OverworldUiItemArt } from './overworld-ui.js';
import type { TradeUiCallbacks, TradeUiModel } from './trade-model.js';
export { tradeItemDisplayName, tradeItemIsOfferable } from './trade-model.js';
export type { TradeUiCallbacks, TradeUiModel } from './trade-model.js';

/** Subscribed trade projection only: the server owns inventory, escrow and acceptance.
 * The client owns canvas dispatch, native editing, scale and the frame loop. */
export class TradeUi {
  readonly root: UiRoot;
  private trade: UiTradeElement | null = null;
  private sessionKey: string | null = null;
  private model: TradeUiModel | null = null;
  private readonly modal: UiElement;

  constructor(art: UiKitArt, private readonly itemArt: OverworldUiItemArt,
    private readonly callbacks: TradeUiCallbacks) {
    this.root = new UiRoot({ art, scale: 1, label: 'Player trade' });
    this.modal = new UiElement({ id: 'game.player-trade', kind: 'trade-modal',
      props: { touchScroll: true, singlePointer: true },
      style: { display: 'stack', width: 'grow', height: 'grow', zLayer: 'modal', visible: false },
      pointerMode: 'capture', onPointer: () => true,
      measure: (_element, available) => {
        const requested = this.model?.session.state === 'requested';
        const width = Math.max(0, Math.min(requested ? 360 : 560, available.width - 12));
        const height = Math.max(0, Math.min(requested ? 180 : 460, available.height - 12));
        this.trade?.setStyle({ position: 'absolute', width: uiFixed(width), height: uiFixed(height),
          inset: { left: uiFixed((available.width - width) / 2), top: uiFixed((available.height - height) / 2) } });
        return { min: { width: 0, height: 0 }, preferred: available };
      },
      paint: (element, { context }) => { context.fillStyle = 'rgba(12, 20, 17, 0.5)';
        const r = element.rect; context.fillRect(r.x, r.y, r.width, r.height); },
    });
    this.root.mount(this.modal);
  }

  get active(): boolean { return this.model !== null; }

  update(model: TradeUiModel | null): void {
    if (this.root.disposed) return;
    // A stale or unrelated session is never an actionable trade.
    if (model && (!['requested', 'active'].includes(model.session.state)
      || ![model.session.requester.toHexString(), model.session.recipient.toHexString()].includes(model.identityHex))) model = null;
    const key = model ? `${model.connectionScope ?? ''}:${model.session.id}:${model.identityHex}:${model.session.state}` : null;
    if (key !== this.sessionKey) {
      // Deactivate before clearing focus so teardown cannot publish an unfinished draft.
      this.trade?.deactivateTrade();
      this.root.input.cancelPointers();
      this.root.focus.set(null);
      this.trade?.dispose(); this.trade = null;
      this.root.input.clearHover();
      this.sessionKey = key;
    }
    this.model = model;
    this.modal.setStyle({ visible: model !== null });
    if (model) {
      if (this.trade) this.trade.updateTrade(model);
      else { this.trade = uiTrade({ model, callbacks: this.callbacks, artwork: this.itemArt,
        layout: { position: 'absolute', width: 'grow', height: 'grow' } }); this.modal.append(this.trade); }
    }
  }

  resize(width: number, height: number): void { this.root.resize(width, height, 1); }

  draw(context: CanvasRenderingContext2D, width: number, height: number): void {
    this.resize(width, height);
    if (this.active) this.root.drawInContext(context);
  }

  dispose(): void {
    this.trade?.deactivateTrade(); this.model = null; this.sessionKey = null;
    this.root.dispose(); this.trade = null;
  }
}
