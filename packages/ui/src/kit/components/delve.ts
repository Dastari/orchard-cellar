import { bootstrapContentRegistry, rogueUpgradeDefinition, type RogueBoonRegistry } from '@orchard/sim';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_TONE_FACES } from '../skin/contrast.js';
import { uiFrame } from './frame.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiOfferCard } from './social.js';
import { uiWindow, uiWindowClose } from './window.js';

export interface UiDelveRun {
  readonly roomNumber: number; readonly roomKind: string; readonly theme: string;
  readonly phase: string; readonly wave: number; readonly maximumWaves: number; readonly currency: number;
}
export interface UiDelveOffer {
  readonly slot: number; readonly upgradeId: string; readonly rarity: string;
  readonly magnitudePermille: number; readonly cost: number;
}
export interface UiDelveRewardsModel {
  readonly run: UiDelveRun; readonly offers: readonly UiDelveOffer[];
  readonly registry?: RogueBoonRegistry; readonly pending?: boolean; readonly notice?: string;
  /** Reserved space for the production run HUD; the modal still owns the viewport. */
  readonly topInset?: number;
}
export interface UiDelveRewardsOptions {
  readonly model: UiDelveRewardsModel; readonly layout?: UiStyle;
  readonly onChoose: (slot: number) => void; readonly onLeaveShop: () => void;
}
const OFFER_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export function uiDelveHud(run: UiDelveRun, layout?: UiStyle) {
  const title = uiText('', { wrap: true, align: 'center' });
  const detail = uiText('', { wrap: true, align: 'center' });
  const frame = uiFrame({ id: 'delve.hud', style: 'thin', layout: { width: 'grow', gap: 4, ...layout }, children: [title, detail] });
  const updateDelveHud = (next: UiDelveRun): void => {
    const status = next.phase === 'combat'
      ? `WAVE ${Math.min(next.maximumWaves, next.wave + 1)}/${next.maximumWaves}`
      : next.phase === 'doors' ? 'CHOOSE A DOOR' : 'CHOOSE ONE BOON';
    title.setProps({ text: `DELVE ${next.roomNumber + 1}/12  ${next.theme.toUpperCase()} ${next.roomKind.toUpperCase()}` });
    detail.setProps({ text: `${status}   EMBERS ${next.currency}` });
  };
  updateDelveHud(run);
  return Object.assign(frame, { updateDelveHud });
}

/** Required reward choice in the Cellar Trader window: offer cards by rarity with their price, the run's
 * progress and embers, and Leave shop. Only shops may be dismissed (Leave shop, the wooden close or Escape),
 * and all activation paths consult the current offer and wallet rather than a captured render model. */
export function uiDelveRewards(options: UiDelveRewardsOptions) {
  let model = options.model;
  let cardsKey = '';
  const notice = uiText('', { id: 'delve.notice', wrap: true, layout: { alignSelf: 'stretch' } }).setProps({ tone: 'danger' });
  const cards = uiFlex({ id: 'delve.cards', direction: 'row', gap: 6 });
  const progress = uiText('', { id: 'delve.progress', role: 'label', layout: { grow: 1 } });
  const currency = uiText('', { id: 'delve.currency', role: 'label' });
  const choose = (slot: number): void => {
    const offer = model.offers.find(candidate => candidate.slot === slot);
    if (!model.pending && model.run.phase === 'reward' && offer && offer.cost <= model.run.currency) options.onChoose(slot);
  };
  const leave = (): void => { if (!model.pending && model.run.phase === 'reward' && model.run.roomKind === 'shop') options.onLeaveShop(); };
  const skip = uiButton({ id: 'delve.leave', label: 'Leave shop', tone: 'primary', onPress: leave });
  const close = uiWindowClose({ id: 'delve.close', label: 'Leave shop', onPress: leave });
  const frame = uiWindow({ id: 'delve.rewards.frame', title: 'THE CELLAR TRADER', closeControl: close,
    layout: { direction: 'column', gap: 6, align: 'center' }, children: [
      uiFlex({ direction: 'row', gap: 12, alignSelf: 'stretch' }, [progress, currency]), notice, cards, skip,
    ] });
  // The window body scrolls inside its chrome when the viewport is short.
  const scroll = frame.children[0]!;
  // Reserved space for the production run HUD above the centred window.
  const reserve = uiFlex({ height: uiFixed(0), shrink: 0 });
  const stage = uiFlex({ direction: 'column', justify: 'center', align: 'center', width: 'grow', grow: 1, padding: 4 }, [frame]);
  const gate = new UiElement({ id: 'game.delve-rewards', kind: 'delve-rewards', label: 'Delve rewards',
    style: { display: 'flex', direction: 'column', width: 'grow', height: 'grow', zLayer: 'modal', ...options.layout }, children: [reserve, stage],
    props: { singlePointer: true, touchScroll: true, focusChrome: true }, focusable: true,
    pointerMode: 'capture', onPointer: () => true, onDismiss: leave,
    onKeyCapture(event) {
      if (event.repeat && ['Escape', 'Enter', ' ', '1', '2', '3'].includes(event.key)) return true;
      if (event.key === 'Escape') { leave(); return true; }
      const index = ['1', '2', '3'].indexOf(event.key);
      if (index < 0) return false;
      const offer = model.offers[index]; if (offer) choose(offer.slot); return true;
    },
    measure(_element, available) {
      const top = Math.max(0, Math.min(model.topInset ?? 0, available.height - 16));
      const reserved = reserve.style.height;
      if (!(typeof reserved === 'object' && reserved.mode === 'fixed' && reserved.size === top)) reserve.setStyle({ height: uiFixed(top) });
      // Cards sit in a row when three fit beside each other (plus the window's chrome), otherwise they stack.
      const count = Math.max(1, model.offers.length), direction = count * 116 + (count - 1) * 6 + 56 <= available.width ? 'row' : 'column';
      if (cards.style.direction !== direction) cards.setStyle({ direction });
      return { min: { width: 0, height: 0 }, preferred: available };
    },
    paint(element, { context }) {
      context.globalAlpha = .65; context.fillStyle = UI_TONE_FACES.muted.button_disabled.face;
      const rect = element.rect; context.fillRect(rect.x, rect.y, rect.width, rect.height);
    },
  });
  const updateDelveRewards = (next: UiDelveRewardsModel): void => {
    model = next; gate.invalidate();
    const shop = model.run.roomKind === 'shop';
    frame.setWindowTitle(shop ? 'THE CELLAR TRADER' : 'CHOOSE A BOON');
    progress.setProps({ text: `Delve ${model.run.roomNumber + 1} of 12` });
    currency.setProps({ text: `${model.run.currency} ${model.run.currency === 1 ? 'ember' : 'embers'}` });
    notice.setProps({ text: model.pending ? 'Waiting for the Delve...' : model.notice ?? '', tone: model.pending ? 'info' : 'danger' })
      .setStyle({ visible: !!model.notice || !!model.pending });
    skip.setStyle({ visible: shop }).setDisabled(model.run.phase !== 'reward' || !!model.pending);
    close.setStyle({ visible: shop }).setDisabled(model.run.phase !== 'reward' || !!model.pending);
    const registry = model.registry ?? bootstrapContentRegistry();
    const key = JSON.stringify([model.run.phase, !!model.pending, model.offers.map(offer => [offer,
      offer.cost > model.run.currency, rogueUpgradeDefinition(registry, offer.upgradeId)])]);
    if (key === cardsKey) return;
    cardsKey = key;
    for (const child of [...cards.children]) child.dispose();
    cards.replaceChildren(model.offers.map((offer, index) => {
      const definition = rogueUpgradeDefinition(registry, offer.upgradeId);
      const rarity = OFFER_RARITIES.find(value => value === offer.rarity) ?? 'common';
      const magnitude = `${Math.round(offer.magnitudePermille / 10)}%`;
      return uiOfferCard({ id: `delve.offer.${offer.slot}`, buyId: `delve.choose.${offer.slot}`, hotkey: String(index + 1), rarity,
        name: definition?.name ?? offer.upgradeId,
        effect: definition?.modifierKind === 'healing' ? `Restore ${magnitude} of missing health`
          : definition ? `+${magnitude} ${definition.modifierKind.replaceAll('_', ' ')}` : `+${magnitude}`,
        price: `${offer.cost} ${offer.cost === 1 ? 'ember' : 'embers'}`, buyLabel: offer.cost > 0 ? undefined : 'Choose',
        affordable: offer.cost <= model.run.currency, disabled: model.run.phase !== 'reward' || !!model.pending,
        // Long live names grow the card rather than spill past its price.
        layout: { height: 'fit', minHeight: uiFixed(104) },
        onBuy: () => choose(offer.slot) });
    }));
  };
  updateDelveRewards(model);
  return Object.assign(gate, { updateDelveRewards, scrollArea: scroll });
}
