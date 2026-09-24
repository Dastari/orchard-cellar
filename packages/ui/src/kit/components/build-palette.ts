import { BRONZE_PER_GOLD, HEARTH_CONSTRUCTION_TOOLS, hearthResidenceExpansionQuote, type HearthConstructionTool,
  type HomesteadBuildLayer, type HomesteadUpgradeDefinition, type HomesteadUpgradeKind } from '@orchard/sim';
import type { LoadedAsset } from '../../assets.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
import { uiFrame } from './frame.js';
import { uiScrollArea, uiFlex } from './layout.js';
import { uiSlot } from './inventory.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiTooltip } from './tooltip.js';

export type UiBuildSelection = { readonly kind: 'place'; readonly itemKind: string } | { readonly kind: 'move' | 'remove' };
export type UiBuildPaletteView = 'catalogue' | 'construction' | 'selection' | 'expansion';
export type UiBuildPaletteAction = 'catalogue' | 'construction' | 'undo' | 'expansion' | 'purchase-expansion' | 'apply' | 'cancel';
export interface UiBuildPaletteEntry {
  readonly itemKind: string; readonly displayName: string; readonly layer: HomesteadBuildLayer; readonly iconAnimation: string;
}
export interface UiBuildPaletteModel {
  readonly entries: readonly UiBuildPaletteEntry[]; readonly upgrades: readonly HomesteadUpgradeDefinition[];
  readonly counts: Readonly<Record<string, number>>;
  readonly upgradeRanks: Readonly<Partial<Record<HomesteadUpgradeKind, number>>>;
  readonly balanceBronze: bigint; readonly selection: UiBuildSelection;
  readonly furnishing?: boolean; readonly status?: string; readonly view?: UiBuildPaletteView;
  readonly canUndoMove?: boolean; readonly residenceRank?: number; readonly residenceOwner?: boolean;
  readonly expansionPending?: boolean; readonly constructionTool?: HearthConstructionTool | null;
  readonly constructionCanApply?: boolean; readonly constructionPending?: boolean;
  readonly constructionStatus?: { readonly footprint: number; readonly materials: readonly string[]; readonly notice: string };
}
export interface UiBuildPaletteOptions {
  readonly model: UiBuildPaletteModel; readonly artwork: Readonly<Record<string, LoadedAsset>>;
  readonly onSelect: (selection: UiBuildSelection) => void; readonly onPurchase: (kind: HomesteadUpgradeKind) => void;
  readonly onAction?: (action: UiBuildPaletteAction) => void;
  readonly onConstructionTool?: (tool: HearthConstructionTool) => void;
  readonly layout?: UiStyle;
}
/** All state comes from the caller. Slots are selection previews, never a second inventory authority. */
export function uiBuildPalette(options: UiBuildPaletteOptions) {
  let model = options.model;
  const action = (value: UiBuildPaletteAction) => { if (!model.constructionPending) options.onAction?.(value); };
  const button = (id: string, label: string, onPress: () => void) => uiButton({ id: `build.${id}`, label, onPress,
    layout: { width: 'grow', shrink: 0 } });
  const title = uiText('BUILD', { role: 'header', layout: { width: 'grow' } });
  const toggle = button('construction', 'Construct', () => action('construction'));
  const grid = uiFlex({ id: 'build.entries', direction: 'row', wrap: true, gap: 2, columnGap: 2, rowGap: 2, width: 'grow', shrink: 0 });
  const label = uiText('', { id: 'build.selection', wrap: true, layout: { width: 'grow', shrink: 0 } });
  const empty = uiText('No buildable items available', { id: 'build.empty', wrap: true });
  const remove = button('remove', 'REMOVE / REFUND', () => { if (!model.constructionPending) options.onSelect({ kind: 'remove' }); });
  const move = button('move', 'Move furniture', () => { if (model.furnishing && !model.constructionPending) options.onSelect({ kind: 'move' }); });
  const undo = button('undo', 'Undo last move', () => { if (model.furnishing && model.canUndoMove) action('undo'); });
  const expansion = button('expansion', 'Room expansions', () => action('expansion'));
  const furnishing = uiFlex({ gap: 4, width: 'grow', shrink: 0 }, [move, undo, expansion]);
  const upgrades = uiFlex({ id: 'build.upgrades', gap: 4, width: 'grow', shrink: 0 });
  const catalogue = uiFlex({ gap: 8, width: 'grow', shrink: 0 }, [toggle, grid, empty, label, remove, furnishing, upgrades]);
  const tools = uiFlex({ gap: 4, width: 'grow', shrink: 0 }, HEARTH_CONSTRUCTION_TOOLS.map(tool =>
    button(`tool.${tool.id}`, tool.label, () => { if (model.furnishing && !model.constructionPending) options.onConstructionTool?.(tool.id); })));
  const construction = uiFlex({ gap: 4, width: 'grow', shrink: 0 }, [
    button('construction.back', 'Furniture', () => action('catalogue')), tools,
    uiText('Select a tool, then choose a tile', { wrap: true }),
  ]);
  const selectedLabel = uiText('', { id: 'build.selected-label', wrap: true, layout: { width: 'grow' } });
  const change = button('change', 'Change selection', () => action(model.constructionTool ? 'construction' : 'catalogue'));
  const review = uiText('', { id: 'build.review', wrap: true, layout: { width: 'grow' } });
  const apply = button('apply', 'Apply', () => { if (model.constructionCanApply) action('apply'); });
  const cancel = button('cancel', 'Cancel', () => action('cancel'));
  const reviewActions = uiFlex({ direction: 'row', gap: 4, width: 'grow', shrink: 0 }, [apply, cancel]);
  const selection = uiFlex({ gap: 4, width: 'grow', shrink: 0 }, [change, selectedLabel, review, reviewActions]);
  const expansionLabel = uiText('', { id: 'build.expansion-detail', wrap: true, layout: { width: 'grow' } });
  const buyExpansion = button('purchase-expansion', '', () => {
    const quote = hearthResidenceExpansionQuote(model.residenceRank ?? -1);
    if (quote && model.residenceOwner && !model.expansionPending && model.balanceBronze >= quote.costBronze) action('purchase-expansion');
  });
  const expansionView = uiFlex({ gap: 8, width: 'grow', shrink: 0 }, [
    button('expansion.back', 'Back', () => action('catalogue')), expansionLabel, buyExpansion,
  ]);
  const scroll = uiScrollArea({ id: 'build.scroll', gap: 8 }, [catalogue, construction, selection, expansionView]);
  const frame = uiFrame({ id: 'game.build-palette', header: { title: 'BUILD', content: title }, blockInput: true,
    layout: { width: 'grow', height: 'grow', ...options.layout }, children: [scroll] });
  const slots = new Map<string, { wrapper: UiElement; slot: UiElement; count: UiElement }>();
  const purchaseButtons = new Map<HomesteadUpgradeKind, UiElement>();
  let entryKey = '', upgradeKey = '', previousView = model.view ?? 'catalogue';
  const visible = (element: UiElement, value: boolean) => { if (element.style.visible !== value) element.setStyle({ visible: value }); };
  const updateBuildPalette = (next: UiBuildPaletteModel): void => {
    model = next;
    const view = model.view ?? 'catalogue', pending = model.constructionPending === true;
    title.setProps({ text: view === 'construction' || model.constructionTool ? 'CONSTRUCT' : model.furnishing ? 'FURNISH' : 'BUILD' });
    visible(catalogue, view === 'catalogue'); visible(construction, view === 'construction');
    visible(selection, view === 'selection'); visible(expansionView, view === 'expansion');
    if (view !== previousView) {
      previousView = view; scroll.scroll.y = 0;
      (view === 'selection' ? change : view === 'construction' ? construction.children[0]!
        : view === 'expansion' ? expansionView.children[0]! : model.furnishing ? toggle : remove).requestFocus();
    }
    visible(toggle, model.furnishing === true); visible(furnishing, model.furnishing === true);
    visible(empty, model.entries.length === 0); visible(grid, model.entries.length > 0);
    const nextEntryKey = JSON.stringify(model.entries.map(entry => entry.itemKind));
    if (entryKey !== nextEntryKey) {
      entryKey = nextEntryKey;
      const nextSlots = model.entries.map(entry => {
        let retained = slots.get(entry.itemKind);
        if (!retained) {
          const slot = uiSlot({ id: `build.item.${entry.itemKind}`, artwork: options.artwork,
            stack: () => ({ itemKind: entry.itemKind, quantity: model.counts[entry.itemKind] ?? 0 }),
            iconAnimation: () => model.entries.find(value => value.itemKind === entry.itemKind)?.iconAnimation ?? entry.iconAnimation,
            onPress: () => { if (!model.constructionPending && model.entries.some(value => value.itemKind === entry.itemKind)) options.onSelect({ kind: 'place', itemKind: entry.itemKind }); },
          });
          const count = uiText('', { layout: { position: 'absolute', inset: { left: uiFixed(3), top: uiFixed(3) } } });
          slot.append(count);
          retained = { slot, count, wrapper: uiTooltip(() => slot.label, slot, { width: uiFixed(28), height: uiFixed(31), shrink: 0 }) }; slots.set(entry.itemKind, retained);
        }
        return retained.wrapper;
      });
      for (const [kind, retained] of slots) if (!model.entries.some(entry => entry.itemKind === kind)) { retained.wrapper.dispose(); slots.delete(kind); }
      for (const child of [...grid.children]) grid.remove(child);
      grid.replaceChildren(nextSlots);
    }
    for (const entry of model.entries) {
      const retained = slots.get(entry.itemKind)!; const count = model.counts[entry.itemKind] ?? 0;
      retained.slot.setProps({ label: `${entry.displayName}: ${count}`, tone: count === 0 ? 'muted' : 'primary',
        selected: model.selection.kind === 'place' && model.selection.itemKind === entry.itemKind });
      retained.slot.setDisabled(pending); retained.count.setProps({ text: count <= 1 ? String(count) : '' });
    }
    const selectedName = model.selection.kind === 'place'
      ? model.entries.find(entry => model.selection.kind === 'place' && entry.itemKind === model.selection.itemKind)?.displayName ?? model.selection.itemKind
      : model.selection.kind === 'move' ? 'Select furniture, then its destination' : model.furnishing ? 'Pick up intact' : 'REMOVE / REFUND';
    label.setProps({ text: model.status ?? selectedName });
    remove.setProps({ label: model.furnishing ? 'Pick up intact' : 'REMOVE / REFUND', tone: model.selection.kind === 'remove' ? 'danger' : 'neutral' });
    for (const control of [remove, move, toggle, expansion, change, ...tools.children]) control.setDisabled(pending);
    undo.setDisabled(pending || !model.canUndoMove);
    const tool = HEARTH_CONSTRUCTION_TOOLS.find(value => value.id === model.constructionTool);
    change.setProps({ label: tool ? 'Change construction tool' : 'Change selection' });
    selectedLabel.setProps({ text: tool?.label ?? model.status ?? selectedName });
    const status = model.constructionStatus;
    review.setProps({ text: tool ? [status ? `${status.footprint} tiles` : '', ...(status?.materials.length ? status.materials : ['No material change']),
      pending ? 'Waiting for server' : status?.notice ?? 'Choose a tile to preview'].filter(Boolean).join('\n') : '' });
    visible(review, Boolean(tool)); visible(reviewActions, Boolean(tool) && (Boolean(model.constructionCanApply) || pending));
    apply.setDisabled(pending || !model.constructionCanApply); cancel.setDisabled(pending);
    const quote = hearthResidenceExpansionQuote(model.residenceRank ?? -1);
    expansionLabel.setProps({ text: quote ? `${quote.name}\n10 x 10 room + connecting hall\nCost ${quote.costBronze} bronze / Wallet ${model.balanceBronze}` : 'All rooms built\nBoth expansions are owned' });
    buyExpansion.setDisabled(!quote || !model.residenceOwner || Boolean(model.expansionPending) || Boolean(quote && model.balanceBronze < quote.costBronze));
    buyExpansion.setProps({ label: model.expansionPending ? 'Waiting for server' : !model.residenceOwner ? 'Owner purchase only' : !quote ? 'Complete'
      : model.balanceBronze < quote.costBronze ? 'Not enough bronze' : `Buy ${quote.name}` });
    const nextUpgradeKey = JSON.stringify(model.upgrades.map(upgrade => upgrade.kind));
    if (nextUpgradeKey !== upgradeKey) {
      upgradeKey = nextUpgradeKey;
      for (const child of [...upgrades.children]) upgrades.remove(child);
      for (const [kind, control] of purchaseButtons) if (!model.upgrades.some(upgrade => upgrade.kind === kind)) { control.dispose(); purchaseButtons.delete(kind); }
      upgrades.replaceChildren(model.upgrades.map(definition => {
        let control = purchaseButtons.get(definition.kind);
        if (!control) {
          control = button(`upgrade.${definition.kind}`, '', () => {
            const current = model.upgrades.find(upgrade => upgrade.kind === definition.kind); if (!current) return;
            const rank = model.upgradeRanks[current.kind] ?? 0;
            const cost = BigInt(Math.round(current.baseCostGold * current.costGrowth ** rank)) * BRONZE_PER_GOLD;
            if (!model.constructionPending && rank < current.maximumRank && model.balanceBronze >= cost) options.onPurchase(current.kind);
          });
          purchaseButtons.set(definition.kind, control);
        }
        return control;
      }));
    }
    for (const definition of model.upgrades) {
      const rank = model.upgradeRanks[definition.kind] ?? 0, maximum = rank >= definition.maximumRank;
      const cost = BigInt(Math.round(definition.baseCostGold * definition.costGrowth ** rank)) * BRONZE_PER_GOLD;
      purchaseButtons.get(definition.kind)!.setProps({ label: `${definition.displayName} ${rank}/${definition.maximumRank}  ${maximum ? 'MAX' : `${cost / BRONZE_PER_GOLD}G`}`, tone: 'primary' })
        .setDisabled(pending || maximum || model.balanceBronze < cost);
    }
  };
  updateBuildPalette(model);
  return Object.assign(frame, { updateBuildPalette, scrollArea: scroll });
}
