import { bootstrapContentRegistry, rogueUpgradeDefinition } from '@orchard/sim';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_TONE_FACES } from '../skin/contrast.js';
import type { UiTone } from '../tokens.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';

export interface UiDelveRun {
  readonly roomNumber: number; readonly roomKind: string; readonly theme: string;
  readonly phase: string; readonly wave: number; readonly maximumWaves: number; readonly currency: number;
}
export interface UiDelveOffer {
  readonly slot: number; readonly upgradeId: string; readonly rarity: string;
  readonly magnitudePermille: number; readonly cost: number;
}
export interface UiDelveRewardsModel { readonly run: UiDelveRun; readonly offers: readonly UiDelveOffer[] }
export interface UiDelveRewardsOptions {
  readonly model: UiDelveRewardsModel; readonly layout?: UiStyle;
  readonly onChoose: (slot: number) => void; readonly onLeaveShop: () => void;
}
const rarityTones: Readonly<Record<string, UiTone>> = {
  common: 'neutral', uncommon: 'success', rare: 'info', epic: 'primary', legendary: 'warning',
};
export function uiDelveHud(run: UiDelveRun, layout?: UiStyle) {
  const title = uiText('', { wrap: true, align: 'center' });
  const detail = uiText('', { wrap: true, align: 'center' });
  const frame = uiFrame({ id: 'delve.hud', style: 'thin', layout: { width: 'grow', gap: 4, ...layout }, children: [title, detail] });
  const updateDelveHud = (next: UiDelveRun): void => {
    const status = next.phase === 'combat'
      ? `WAVE ${Math.min(next.maximumWaves, next.wave + 1)}/${next.maximumWaves}`
      : next.phase === 'doors' ? 'CHOOSE A DOOR' : 'CHOOSE ONE BOON';
    title.setProps({ text: `DELVE ${next.roomNumber + 1}/12  ${next.theme} ${next.roomKind}` });
    detail.setProps({ text: `${status}   EMBERS ${next.currency}` });
  };
  updateDelveHud(run);
  return Object.assign(frame, { updateDelveHud });
}

/** Required reward choice. Only shops may be dismissed, and all activation paths
 * consult the current offer and wallet rather than a captured render model. */
export function uiDelveRewards(options: UiDelveRewardsOptions) {
  let model = options.model;
  const cards = uiFlex({ id: 'delve.cards', direction: 'row', wrap: true, width: 'grow', gap: 4 });
  const currency = uiText('', { id: 'delve.currency', wrap: true });
  const choose = (slot: number): void => {
    const offer = model.offers.find(candidate => candidate.slot === slot);
    if (model.run.phase === 'reward' && offer && offer.cost <= model.run.currency) options.onChoose(slot);
  };
  const leave = (): void => { if (model.run.phase === 'reward' && model.run.roomKind === 'shop') options.onLeaveShop(); };
  const skip = uiButton({ id: 'delve.leave', label: 'LEAVE SHOP', onPress: leave, layout: { width: 'grow' } });
  const heading = uiText('', { id: 'delve.heading', role: 'header', wrap: true });
  const scroll = uiScrollArea({ id: 'delve.scroll', gap: 8 }, [heading, currency, cards, skip]);
  const frame = uiFrame({ id: 'delve.rewards.frame', layout: { position: 'absolute' }, children: [scroll] });
  const gate = new UiElement({ id: 'game.delve-rewards', kind: 'delve-rewards', label: 'Delve rewards',
    style: { display: 'stack', width: 'grow', height: 'grow', zLayer: 'modal', ...options.layout }, children: [frame],
    pointerMode: 'capture', onPointer: () => true, onDismiss: leave,
    onKeyCapture(event) {
      if (event.key === 'Escape') { leave(); return true; }
      const index = ['1', '2', '3'].indexOf(event.key);
      if (index < 0) return false;
      const offer = model.offers[index]; if (offer) choose(offer.slot); return true;
    },
    measure(_element, available) {
      const width = Math.max(0, Math.min(540, available.width - 16));
      const height = Math.max(0, Math.min(width >= 390 ? 220 : 470, available.height - 16));
      frame.setStyle({ width: uiFixed(width), height: uiFixed(height), inset: {
        left: uiFixed((available.width - width) / 2), top: uiFixed((available.height - height) / 2),
      } });
      return { min: { width: 0, height: 0 }, preferred: available };
    },
    paint(element, { context }) {
      context.globalAlpha = .65; context.fillStyle = UI_TONE_FACES.muted.button_disabled.face;
      const rect = element.rect; context.fillRect(rect.x, rect.y, rect.width, rect.height);
    },
  });
  const updateDelveRewards = (next: UiDelveRewardsModel): void => {
    model = next;
    heading.setProps({ text: model.run.roomKind === 'shop' ? 'THE CELLAR TRADER' : 'CHOOSE A BOON' });
    currency.setProps({ text: `DELVE ${model.run.roomNumber + 1}/12  ${model.run.theme}  EMBERS ${model.run.currency}` });
    skip.setStyle({ visible: model.run.roomKind === 'shop' }).setDisabled(model.run.phase !== 'reward');
    cards.replaceChildren(model.offers.map((offer, index) => {
      const definition = rogueUpgradeDefinition(bootstrapContentRegistry(), offer.upgradeId);
      const rarity = Object.hasOwn(rarityTones, offer.rarity) ? offer.rarity : 'common';
      const unavailable = offer.cost > model.run.currency;
      const magnitude = `${Math.round(offer.magnitudePermille / 10)}%`;
      return uiFrame({ id: `delve.offer.${offer.slot}`, style: 'thin', tone: rarityTones[rarity],
        layout: { basis: uiFixed(150), grow: 1, minWidth: uiFixed(120), gap: 4 }, children: [
          uiText(`[${index + 1}] ${rarity.toUpperCase()}`, { wrap: true }),
          uiText(definition?.name ?? offer.upgradeId, { wrap: true }),
          uiText(definition?.modifierKind === 'healing' ? `HEAL ${magnitude}`
            : `+${magnitude} ${definition?.modifierKind.replaceAll('_', ' ') ?? ''}`, { wrap: true }),
          uiText(definition?.description ?? 'A strange cellar blessing.', { wrap: true }),
          uiButton({ id: `delve.choose.${offer.slot}`, label: unavailable ? `NEEDS ${offer.cost} EMBERS`
            : offer.cost > 0 ? `BUY: ${offer.cost} EMBERS` : 'CHOOSE', tone: rarityTones[rarity],
          disabled: unavailable || model.run.phase !== 'reward', layout: { width: 'grow' }, onPress: () => choose(offer.slot) }),
        ] });
    }));
  };
  updateDelveRewards(model);
  return Object.assign(gate, { updateDelveRewards, scrollArea: scroll });
}
