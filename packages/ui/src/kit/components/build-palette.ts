import type { HearthConstructionTool, HomesteadBuildLayer, HomesteadUpgradeDefinition, HomesteadUpgradeKind } from '@orchard/sim';
import { BRONZE_PER_GOLD } from '@orchard/sim/commerce';
import { HEARTH_CONSTRUCTION_TOOLS } from '@orchard/sim/hearth-construction-tools';
import { hearthResidenceExpansionQuote } from '@orchard/sim/hearth-residence-expansion';
import type { LoadedAsset } from '../../assets.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiElement, UiElementKey } from '../runtime/element.js';
import { paintUiHudPlaque } from './hud-game.js';
import { uiWindow } from './window.js';
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
  /** The window's wooden close; hosts leave build mode. */
  readonly onClose?: () => void;
  readonly layout?: UiStyle;
}
/** The BUILD window: the buildable items as a slot row (the selected one cornered in green), the selection's
 * name and what you hold beside the Remove plaque (X), and a hint line. All state comes from the caller.
 * Slots are selection previews, never a second inventory authority. */
export function uiBuildPalette(options: UiBuildPaletteOptions) {
  let model = options.model;
  const action = (value: UiBuildPaletteAction) => { if (!model.constructionPending) options.onAction?.(value); };
  const button = (id: string, label: string, onPress: () => void, layout: UiStyle = { width: 'grow', shrink: 0 }) => uiButton({ id: `build.${id}`, label, tone: 'primary', onPress, layout });
  const toggle = button('construction', 'Construct', () => action('construction'), { shrink: 0 });
  const grid = uiFlex({ id: 'build.entries', direction: 'row', wrap: true, gap: 2, columnGap: 2, rowGap: 2, width: 'grow', shrink: 0 });
  const label = uiText('', { id: 'build.selection', wrap: true, layout: { grow: 1, minWidth: uiFixed(0) } });
  const holding = uiText('', { id: 'build.holding', role: 'caption' });
  const empty = uiText('No buildable items available', { id: 'build.empty', wrap: true, layout: { width: 'grow' } });
  const selectRemove = () => { if (!model.constructionPending) options.onSelect({ kind: 'remove' }); };
  // The Remove plaque stays lit while removing is the selected tool; X selects it from the keyboard.
  const remove = uiButton({ id: 'build.remove', label: 'X', ariaLabel: 'Remove and refund (X)', onPress: selectRemove,
    layout: { width: uiFixed(28), height: uiFixed(31), padding: 0, shrink: 0 },
    face: (element, { context, art, hovered, focused, pressed, disabled }) => paintUiHudPlaque(context, art, element.rect,
      { icon: 'hud.hammer', hotkey: 'X', pressed, lit: hovered || focused || model.selection.kind === 'remove', disabled }) });
  const selected = uiFlex({ direction: 'row', gap: 6, align: 'center', alignSelf: 'stretch', shrink: 0 }, [label, holding, remove]);
  const move = button('move', 'Move', () => { if (model.furnishing && !model.constructionPending) options.onSelect({ kind: 'move' }); }, { shrink: 0 });
  const undo = button('undo', 'Undo', () => { if (model.furnishing && model.canUndoMove) action('undo'); }, { shrink: 0 });
  const expansion = button('expansion', 'Rooms', () => action('expansion'), { shrink: 0 });
  const furnishing = uiFlex({ direction: 'row', gap: 4, alignSelf: 'stretch', shrink: 0 }, [toggle, move, undo, expansion]);
  const upgrades = uiFlex({ id: 'build.upgrades', gap: 4, width: 'grow', shrink: 0 });
  const hint = uiText('', { id: 'build.hint', role: 'caption', wrap: true, layout: { width: 'grow', shrink: 0 } });
  const catalogue = uiFlex({ gap: 6, width: 'grow', shrink: 0 }, [grid, empty, selected, furnishing, upgrades, hint]);
  const tools = uiFlex({ gap: 4, width: 'grow', shrink: 0 }, HEARTH_CONSTRUCTION_TOOLS.map(tool =>
    button(`tool.${tool.id}`, tool.label, () => { if (model.furnishing && !model.constructionPending) options.onConstructionTool?.(tool.id); })));
  const construction = uiFlex({ gap: 4, width: 'grow', shrink: 0 }, [
    button('construction.back', 'Furniture', () => action('catalogue')), tools,
    uiText('Select a tool, then choose a tile.', { role: 'caption', wrap: true, layout: { width: 'grow' } }),
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
  // Nine slots across; the rail reserves only a narrow gutter. Hosts cap the height so long catalogues scroll here.
  const scroll = uiScrollArea({ id: 'build.scroll', gap: 8, width: uiFixed(274), maxWidth: { mode: 'percent', fraction: 1 }, height: 'fit', padding: { right: 6 } },
    [catalogue, construction, selection, expansionView]);
  const frame = uiWindow({ id: 'game.build-palette', title: 'BUILD', onClose: options.onClose, layout: { direction: 'column', ...options.layout }, children: [scroll] });
  // A docked HUD window: presses on its wood and parchment never reach the world beneath. The window
  // itself takes keyboard focus when build mode opens (without a focus ring), so X works at once.
  frame.pointerMode = 'capture'; frame.focusable = true; frame.setProps({ focusChrome: true }, false);
  Object.assign(frame.hooks, { onPointer: () => true, onWheel: () => true,
    onKeyCapture: (event: UiElementKey) => {
      if (event.key !== 'x' && event.key !== 'X' || event.ctrlKey || event.metaKey || event.altKey) return false;
      if (!event.repeat && (model.view ?? 'catalogue') === 'catalogue') selectRemove();
      return true;
    } });
  const slots = new Map<string, { wrapper: UiElement; slot: UiElement }>();
  const purchaseButtons = new Map<HomesteadUpgradeKind, UiElement>();
  let entryKey = '', upgradeKey = '', previousView = model.view ?? 'catalogue';
  const visible = (element: UiElement, value: boolean) => { if (element.style.visible !== value) element.setStyle({ visible: value }); };
  const updateBuildPalette = (next: UiBuildPaletteModel): void => {
    model = next;
    const view = model.view ?? 'catalogue', pending = model.constructionPending === true;
    frame.setWindowTitle(view === 'construction' || model.constructionTool ? 'CONSTRUCT' : model.furnishing ? 'FURNISH' : 'BUILD');
    visible(catalogue, view === 'catalogue'); visible(construction, view === 'construction');
    visible(selection, view === 'selection'); visible(expansionView, view === 'expansion');
    if (view !== previousView) {
      previousView = view; scroll.scroll.y = 0;
      (view === 'selection' ? change : view === 'construction' ? construction.children[0]!
        : view === 'expansion' ? expansionView.children[0]! : model.furnishing ? toggle : remove).requestFocus();
    }
    visible(furnishing, model.furnishing === true);
    visible(empty, model.entries.length === 0); visible(grid, model.entries.length > 0);
    const nextEntryKey = JSON.stringify(model.entries.map(entry => entry.itemKind));
    if (entryKey !== nextEntryKey) {
      entryKey = nextEntryKey;
      const nextSlots = model.entries.map(entry => {
        let retained = slots.get(entry.itemKind);
        if (!retained) {
          const slot = uiSlot({ id: `build.item.${entry.itemKind}`, artwork: options.artwork,
            // Held items show their art and stack count; items you hold none of stay visible but ghosted.
            stack: () => (model.counts[entry.itemKind] ?? 0) > 0 ? { itemKind: entry.itemKind, quantity: model.counts[entry.itemKind]! } : null,
            ghost: () => ({ itemKind: entry.itemKind, quantity: 0 }),
            iconAnimation: () => model.entries.find(value => value.itemKind === entry.itemKind)?.iconAnimation ?? entry.iconAnimation,
            onPress: () => { if (!model.constructionPending && model.entries.some(value => value.itemKind === entry.itemKind)) options.onSelect({ kind: 'place', itemKind: entry.itemKind }); },
          });
          retained = { slot, wrapper: uiTooltip(() => slot.label, slot, { width: uiFixed(28), height: uiFixed(31), shrink: 0 }) }; slots.set(entry.itemKind, retained);
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
      retained.slot.setDisabled(pending);
    }
    const selectedName = model.selection.kind === 'place'
      ? model.entries.find(entry => model.selection.kind === 'place' && entry.itemKind === model.selection.itemKind)?.displayName ?? model.selection.itemKind
      : model.selection.kind === 'move' ? 'Select furniture, then its destination' : model.furnishing ? 'Pick up intact' : 'Remove and refund';
    label.setProps({ text: model.status ?? selectedName });
    const held = model.selection.kind === 'place' ? model.counts[model.selection.itemKind] ?? 0 : null;
    holding.setProps({ text: held === null || model.status ? '' : `You have ${held}` });
    visible(holding, held !== null && !model.status);
    remove.label = model.furnishing ? 'Pick up intact (X)' : 'Remove and refund (X)';
    hint.setProps({ text: model.furnishing ? 'Click a floor, wall or tabletop to place. B leaves.' : 'Click a tile to build. B leaves.' });
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
      purchaseButtons.get(definition.kind)!.setProps({ label: `${definition.displayName} ${rank}/${definition.maximumRank}  ${maximum ? 'Max' : `${cost / BRONZE_PER_GOLD}g`}`, tone: 'primary' })
        .setDisabled(pending || maximum || model.balanceBronze < cost);
    }
  };
  updateBuildPalette(model);
  return Object.assign(frame, { updateBuildPalette, scrollArea: scroll });
}
