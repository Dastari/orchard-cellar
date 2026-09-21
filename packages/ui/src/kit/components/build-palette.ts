import { BRONZE_PER_GOLD, type HomesteadBuildLayer, type HomesteadUpgradeDefinition, type HomesteadUpgradeKind } from '@orchard/sim';
import type { LoadedAsset } from '../../assets.js';
import { type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiScrollArea, uiFlex } from './layout.js';
import { uiSlot } from './inventory.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';

export type UiBuildSelection = { readonly kind: 'place'; readonly itemKind: string } | { readonly kind: 'remove' };
export interface UiBuildPaletteEntry {
  readonly itemKind: string; readonly displayName: string; readonly layer: HomesteadBuildLayer; readonly iconAnimation: string;
}
export interface UiBuildPaletteModel {
  readonly entries: readonly UiBuildPaletteEntry[]; readonly upgrades: readonly HomesteadUpgradeDefinition[];
  readonly counts: Readonly<Record<string, number>>;
  readonly upgradeRanks: Readonly<Partial<Record<HomesteadUpgradeKind, number>>>;
  readonly balanceBronze: bigint; readonly selection: UiBuildSelection;
}
export interface UiBuildPaletteOptions {
  readonly model: UiBuildPaletteModel; readonly artwork: Readonly<Record<string, LoadedAsset>>;
  readonly onSelect: (selection: UiBuildSelection) => void; readonly onPurchase: (kind: HomesteadUpgradeKind) => void;
  readonly layout?: UiStyle;
}
export function uiBuildPalette(options: UiBuildPaletteOptions) {
  let model = options.model;
  const grid = uiFlex({ id: 'build.entries', direction: 'row', wrap: true, gap: 2, columnGap: 2, rowGap: 2, width: 'grow' });
  const label = uiText('', { id: 'build.selection', wrap: true });
  const remove = uiButton({ id: 'build.remove', label: 'REMOVE / REFUND', tone: 'danger',
    onPress: () => options.onSelect({ kind: 'remove' }), layout: { width: 'grow' } });
  const upgrades = uiFlex({ id: 'build.upgrades', gap: 4, width: 'grow' });
  const scroll = uiScrollArea({ id: 'build.scroll', gap: 8 }, [grid, label, remove, upgrades]);
  const frame = uiFrame({ id: 'game.build-palette', header: { title: 'BUILD' }, blockInput: true,
    layout: { width: 'grow', height: 'grow', ...options.layout }, children: [scroll] });
  const updateBuildPalette = (next: UiBuildPaletteModel): void => {
    model = next;
    grid.replaceChildren(model.entries.map(entry => {
      const count = model.counts[entry.itemKind] ?? 0;
      return uiSlot({ id: `build.item.${entry.itemKind}`, label: `${entry.displayName}: ${count}`,
        stack: { itemKind: entry.itemKind, quantity: count }, artwork: options.artwork, iconAnimation: () => entry.iconAnimation,
        hotkey: count <= 1 ? String(count) : undefined, tone: count === 0 ? 'muted' : 'primary',
        selected: model.selection.kind === 'place' && model.selection.itemKind === entry.itemKind,
        onPress: () => { if (model.entries.some(current => current.itemKind === entry.itemKind)) options.onSelect({ kind: 'place', itemKind: entry.itemKind }); },
      });
    }));
    label.setProps({ text: model.selection.kind === 'remove' ? 'REMOVE / REFUND'
      : model.entries.find(entry => model.selection.kind === 'place' && entry.itemKind === model.selection.itemKind)?.displayName ?? '' });
    remove.setProps({ tone: model.selection.kind === 'remove' ? 'danger' : 'neutral' });
    upgrades.replaceChildren(model.upgrades.map(definition => {
      const rank = model.upgradeRanks[definition.kind] ?? 0, maximum = rank >= definition.maximumRank;
      const cost = BigInt(Math.round(definition.baseCostGold * definition.costGrowth ** rank)) * BRONZE_PER_GOLD;
      const purchase = () => {
        const current = model.upgrades.find(upgrade => upgrade.kind === definition.kind);
        if (!current) return;
        const currentRank = model.upgradeRanks[current.kind] ?? 0;
        const currentCost = BigInt(Math.round(current.baseCostGold * current.costGrowth ** currentRank)) * BRONZE_PER_GOLD;
        if (currentRank < current.maximumRank && model.balanceBronze >= currentCost) options.onPurchase(current.kind);
      };
      return uiButton({ id: `build.upgrade.${definition.kind}`,
        label: `${definition.displayName} ${rank}/${definition.maximumRank}  ${maximum ? 'MAX' : `${cost / BRONZE_PER_GOLD}G`}`,
        disabled: maximum || model.balanceBronze < cost, tone: 'primary', onPress: purchase, layout: { width: 'grow' } });
    }));
  };
  updateBuildPalette(model);
  return Object.assign(frame, { updateBuildPalette, scrollArea: scroll });
}
