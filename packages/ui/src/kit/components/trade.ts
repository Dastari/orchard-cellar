import { coinPurseFromBronze, BRONZE_PER_GOLD, BRONZE_PER_SILVER } from '@orchard/sim/commerce';
import { BACKPACK_SLOT_COUNT, BACKPACK_SLOT_OFFSET, HOTBAR_SLOT_COUNT, accessibleBackpackCapacity } from '@orchard/sim/inventory-layout';
import { BASE_BACKPACK_CAPACITY } from '@orchard/sim/item-containers';
import { tradeItemDisplayName, tradeItemIsOfferable, type TradeUiModel, type TradeUiCallbacks } from '../../trade-model.js';
import type { LoadedAsset } from '../../assets.js';
import { containsPoint } from '../../geometry.js';
import { UiElement, type UiElementKey } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiGlyph, uiWindow, uiWindowClose, uiWindowDivider } from './window.js';
import { uiCurrency, uiCurrencyLabel } from './currency.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiButton, type UiButtonOptions } from './button.js';
import { uiInput } from './input.js';
import { uiAdoptSlot, uiHotbar, uiInventoryGrid, uiSetSlotState } from './inventory.js';
import { UiInventoryFilter, uiPlayerInventoryPane } from './inventory-panel.js';
import { uiPurseLabel } from './purse.js';
import { uiTooltip } from './tooltip.js';

export interface UiTradeOptions {
  readonly model: TradeUiModel; readonly callbacks: TradeUiCallbacks;
  readonly artwork?: Readonly<Record<string, LoadedAsset>>; readonly layout?: UiStyle;
}
export interface UiTradeElement extends UiElement {
  updateTrade(model: TradeUiModel): void;
  /** Called before host teardown/focus clearing. This never submits unfinished money. */
  deactivateTrade(): void;
}
const repeated = (event: UiElementKey): boolean => 'repeat' in event && event.repeat === true;

/** Retained production composition. It projects subscribed rows and never owns escrow. */
export function uiTrade(options: UiTradeOptions): UiTradeElement {
  let model = options.model, live = true, rebuilding = false, structure = '';
  let revision = -1n, editing = false, allowBlurCommit = false, moneyCommittedOnDown = false;
  let lastMoneyDraft: string | null = null;
  const own = () => model.session.requester.toHexString() === model.identityHex;
  const ownMoney = () => own() ? model.session.requesterBronze : model.session.recipientBronze;
  const otherHex = () => own() ? model.session.recipient.toHexString() : model.session.requester.toHexString();
  const ownAccepted = () => own() ? model.session.requesterAccepted : model.session.recipientAccepted;
  const otherAccepted = () => own() ? model.session.recipientAccepted : model.session.requesterAccepted;
  const offer = (owner: string, slot: number) => model.offers.find(entry => entry.tradeId === model.session.id
    && entry.owner.toHexString() === owner && entry.slot === slot);
  // The world's one capacity rule (BUG-056), not a second clamp of its own.
  const capacity = () => accessibleBackpackCapacity(Math.floor(model.backpackSlotCapacity ?? BASE_BACKPACK_CAPACITY));
  const carriedRow = (slot: number) => model.inventorySlots.find(row => row.slot === slot) ?? null;
  const actionKey = () => `${model.session.id}:${model.identityHex}:${model.session.state}:${model.session.revision}`;
  const artwork: Record<string, LoadedAsset> = { ...options.artwork };
  const iconAnimation = (item: { readonly itemKind: string }) => model.contentRegistry.items.get(`item:${item.itemKind}`)?.icon.animation ?? 'base';
  const editors = [16, 2, 2].map(maxLength => new CanvasTextEditor({ value: '0', maxLength }));
  const cleanEditors = () => editors.forEach(editor => {
    const value = editor.snapshot().value, clean = value.replace(/[^0-9]/g, '');
    if (clean !== value && !editor.snapshot().composing) editor.setValue(clean);
  });
  const commitMoney = (): boolean => {
    if (!live || rebuilding || model.session.state !== 'active' || editors.some(editor => editor.snapshot().composing)) return false;
    cleanEditors();
    const draft = editors.map(editor => editor.snapshot().value).join(':');
    if (draft === lastMoneyDraft) return false;
    lastMoneyDraft = draft;
    const values = editors.map(editor => BigInt(editor.snapshot().value || '0'));
    const total = values[0]! * BRONZE_PER_GOLD + values[1]! * BRONZE_PER_SILVER + values[2]!;
    const amount = total > model.walletBronze ? model.walletBronze : total;
    if (amount === ownMoney()) return false;
    options.callbacks.offerBronze(model.session.id, amount);
    return true;
  };
  // A release may only act on the same revision/row the user pressed. The
  // generic slot remains a presentation/callback slot, never an inventory owner.
  const guarded = (base: UiElement, key: () => string = actionKey): UiElement => {
    let pressed: string | null = null, suppress = false;
    const wrapper: UiElement = new UiElement({ ...base.hooks, children: [...base.children],
      onPointer(event, element) {
        if (event.type === 'down') { pressed = key(); suppress = moneyCommittedOnDown; allowBlurCommit = false; }
        if (event.type === 'up' && (suppress || pressed !== key())) {
          pressed = null; suppress = false;
          return base.hooks.onPointer?.({ ...event, type: 'cancel' }, element) ?? true;
        }
        const handled = base.hooks.onPointer?.(event, element) ?? false;
        if (handled && event.type === 'down') event.capture();
        if (event.type === 'up' || event.type === 'cancel') { pressed = null; suppress = false; }
        return handled;
      },
      onKey(event, element) {
        allowBlurCommit = false;
        if (repeated(event) && ['Enter', ' ', 'ContextMenu'].includes(event.key)) return true;
        return base.hooks.onKey?.(event, element) ?? false;
      },
    });
    // The wrapper is the live slot: slot state (the disabled face) applies to it (review of #234, finding 8).
    uiAdoptSlot(base, wrapper);
    return wrapper;
  };
  const cancelButtons: UiElement[] = [];
  const button = (buttonOptions: UiButtonOptions) => {
    const control = guarded(uiButton(buttonOptions));
    if (buttonOptions.id === 'trade.cancel' || buttonOptions.id === 'trade.close') cancelButtons.push(control);
    return control;
  };
  const cancel = () => { if (live) options.callbacks.cancel(model.session.id); };
  const content = uiFlex({ direction: 'column', gap: 8, align: 'center' });
  // Trade must wait for authority, so the wooden close asks to cancel and the window stays up on rejection.
  const close = guarded(uiWindowClose({ id: 'trade.close', label: 'Cancel trade', onPress: cancel })); cancelButtons.push(close);
  const base = uiWindow({ id: 'game.trade', title: 'TRADE', closeControl: close, layout: { direction: 'column' }, children: [content] });
  if (options.layout) base.setStyle(options.layout);
  const frame = new UiElement({ ...base.hooks, children: [...base.children],
    onPointerObserved(event) {
      allowBlurCommit = live && event.type === 'down' && !cancelButtons.some(control => !control.disposed
        && containsPoint(control.rect, event.point) && containsPoint(control.clip, event.point));
      if (event.type === 'down') moneyCommittedOnDown = false;
    },
    onPointer(event) { allowBlurCommit = false; return event.type === 'down'; },
    onKeyCapture(event) {
      allowBlurCommit = event.key === 'Tab';
      if (event.key === 'Escape') { allowBlurCommit = false; if (!repeated(event)) cancel(); return true; }
      return false;
    },
    onDismiss: cancel,
    onDispose() { live = false; allowBlurCommit = false; },
  });
  let ownLabel: UiElement | undefined, otherLabel: UiElement | undefined, wallet: UiElement | undefined;
  let otherMoney: UiElement | undefined, accept: UiElement | undefined, requestLabel: UiElement | undefined;
  let ownTick: UiElement | undefined, otherTick: UiElement | undefined, status: UiElement | undefined;
  let carriedHost: UiElement | undefined, carriedHotbarHost: UiElement | undefined, inventoryStructure = '';
  let carriedCells: { readonly cell: UiElement; readonly wrapper: UiElement; readonly slot: number; disabled: boolean }[] = [];
  const moneyFields = () => editors.map((editor, index) => {
    const label = ['Gold', 'Silver', 'Bronze'][index]!;
    const input = uiInput({ id: `trade.money.${label.toLowerCase()}`, label, editor, inputMode: 'numeric', size: 'sm', leading: uiGlyph(`coin.${label.toLowerCase()}`), layout: { width: uiFixed(index === 0 ? 64 : 44) },
      onChange: () => { cleanEditors(); }, onSubmit: () => { commitMoney(); } });
    const field = new UiElement({ ...input.hooks,
      onFocus(focused, element, source) {
        input.hooks.onFocus?.(focused, element, source);
        editing = focused;
        if (focused) lastMoneyDraft = null;
        else if (allowBlurCommit) { allowBlurCommit = false; moneyCommittedOnDown = commitMoney(); }
      },
      onPointer(event, element) { allowBlurCommit = false; return input.hooks.onPointer?.(event, element) ?? false; },
      onKey(event, element) {
        if (event.key === 'Enter' && (repeated(event) || editor.snapshot().composing)) return true;
        return input.hooks.onKey?.(event, element) ?? false;
      },
    });
    return field;
  });
  const wrapSlots = (grid: UiElement, owner: () => string, actionable: boolean) => {
    for (const [index, cell] of [...grid.children].entries()) {
      grid.remove(cell);
      grid.append(uiTooltip(() => { const row = offer(owner(), index); return row ? tradeItemDisplayName(model.contentRegistry, row.itemKind) : ''; },
        actionable ? guarded(cell) : cell, { width: uiFixed(28), height: uiFixed(31) }));
    }
    return grid;
  };
  // What you carry is the shared player inventory pane (owner 2026-09-28, BUG-067) and the window's hotbar row: the
  // same layout, capacity, filter, empty cells and slots as every other window. Offering is this window's own action.
  const backpackFilter = new UiInventoryFilter();
  const offerFrom = (slot: number, secondary: boolean) => {
    if (!live) return;
    const row = carriedRow(slot), free = Array.from({ length: 6 }, (_, i) => i).find(i => !offer(model.identityHex, i));
    if (!row || row.itemKind === 'empty' || row.quantity <= 0 || !tradeItemIsOfferable(model.contentRegistry, row.itemKind) || free === undefined) return;
    options.callbacks.offerItem(model.session.id, slot, free, secondary ? 1 : row.quantity);
  };
  const refreshInventory = () => {
    if (!carriedHost) return;
    const key = String(capacity());
    if (key === inventoryStructure && carriedHost.children.length) return;
    inventoryStructure = key;
    for (const child of [...carriedHost.children, ...carriedHotbarHost?.children ?? []]) child.dispose();
    const common = { artwork, iconAnimation, allowSecondary: true } as const;
    const pane = uiPlayerInventoryPane({ ...common, id: 'trade.backpack', label: 'BACKPACK', container: 'backpack',
      cells: Array.from({ length: BACKPACK_SLOT_COUNT }, (_, index) => ({ id: String(index), index })), columns: 5, rows: 4,
      filterModel: backpackFilter, capacity, itemLabel: item => tradeItemDisplayName(model.contentRegistry, item.itemKind),
      stack: index => carriedRow(BACKPACK_SLOT_OFFSET + index),
      // No sort while trading: offers name inventory slots, so reordering the bag mid-trade is not offered.
      onActivate: (index, event) => offerFrom(BACKPACK_SLOT_OFFSET + index, event.button === 2) });
    const hotbar = uiHotbar({ ...common, id: 'trade.hotbar', container: 'hotbar', count: HOTBAR_SLOT_COUNT, digitKeys: false, activateOn: 'up', layout: { width: 'fit', shrink: 0 },
      selected: () => -1, stack: index => carriedRow(index), onActivate: (index, event) => offerFrom(index, event.button === 2) });
    carriedCells = [];
    const guard = (grid: UiElement, slotOf: (index: number) => number) => {
      for (const [index, cell] of [...grid.children].entries()) {
        const slot = slotOf(index);
        const wrapper = guarded(cell, () => {
          const row = carriedRow(slot);
          return `${actionKey()}:${row?.itemKind}:${row?.quantity}:${row?.durability}:${row?.lit}`;
        });
        // Keep what the pane already decided for the cell (hidden past the bag's capacity or by the filter).
        if (cell.style.display !== undefined) wrapper.setStyle({ display: cell.style.display });
        grid.remove(cell); grid.append(wrapper); carriedCells.push({ cell, wrapper, slot, disabled: false });
      }
    };
    const grids = pane.children.flatMap(function find(node: UiElement): UiElement[] { return node.kind === 'inventory-grid' ? [node] : node.children.flatMap(find); });
    guard(grids[0]!, index => BACKPACK_SLOT_OFFSET + index); guard(hotbar, index => index);
    carriedHost.append(pane); carriedHotbarHost?.append(hotbar);
  };
  // Items the authority won't take in a trade (quest items, backpacks, purchase grants, retired items; the server's
  // item_not_tradeable) show the approved disabled face (render 01 B) and take no input (S4).
  const refreshOfferable = () => {
    for (const entry of carriedCells) {
      const row = carriedRow(entry.slot);
      const disabled = row !== null && row.itemKind !== 'empty' && row.quantity > 0 && !tradeItemIsOfferable(model.contentRegistry, row.itemKind);
      if (disabled === entry.disabled) continue;
      entry.disabled = disabled;
      uiSetSlotState(entry.wrapper, disabled ? { enabled: false } : undefined);
    }
  };
  const updateTrade = (next: TradeUiModel): void => {
    if (!live) return;
    const previousSession = `${model.session.id}:${model.identityHex}:${model.session.state}`;
    const nextSession = `${next.session.id}:${next.identityHex}:${next.session.state}`;
    if (previousSession !== nextSession) { editing = false; revision = -1n; lastMoneyDraft = null; allowBlurCommit = false; }
    model = next;
    // Preserve the game's missing-art fallback while using active authored icon animations.
    for (const row of [...model.inventorySlots, ...model.offers]) {
      const asset = options.artwork?.[row.itemKind] ?? options.artwork?.['missing'];
      if (asset) artwork[row.itemKind] = asset;
    }
    if (!editing && revision !== next.session.revision) {
      revision = next.session.revision;
      const purse = coinPurseFromBronze(ownMoney());
      [purse.gold, purse.silver, purse.bronze].forEach((value, index) => editors[index]!.setValue(String(value)));
      lastMoneyDraft = null;
    }
    const key = nextSession;
    if (key !== structure) {
      structure = key; rebuilding = true; allowBlurCommit = false;
      for (const child of [...content.children]) child.dispose();
      ownLabel = otherLabel = wallet = otherMoney = accept = requestLabel = carriedHost = carriedHotbarHost = ownTick = otherTick = status = undefined;
      if (model.session.state === 'requested') {
        requestLabel = uiText('', { id: 'trade.request', wrap: true, align: 'center', layout: { width: uiFixed(240) } });
        content.append(requestLabel);
        content.append(uiFlex({ direction: 'row', gap: 4, justify: 'center', shrink: 0 }, own() ? [
          button({ id: 'trade.cancel', label: 'Cancel', tone: 'danger', onPress: cancel }),
        ] : [
          button({ id: 'trade.request.decline', label: 'Decline', tone: 'danger', onPress: () => options.callbacks.declineRequest(model.session.id) }),
          button({ id: 'trade.request.accept', label: 'Accept', ariaLabel: 'Accept trade request', tone: 'success', onPress: () => options.callbacks.acceptRequest(model.session.id) }),
        ]));
      } else {
        // Two offer columns, each with a reserved tick so they line up; coins under each grid.
        ownLabel = uiText('YOUR OFFER', { role: 'label' }); otherLabel = uiText('', { role: 'label' });
        ownTick = uiGlyph('glyph.check', { label: 'Accepted' }); otherTick = uiGlyph('glyph.check', { label: 'Accepted' });
        const tickSlot = (tick: UiElement) => uiFlex({ width: uiFixed(16), height: uiFixed(16), shrink: 0 }, [tick]);
        // The wallet is a readout like the merchant's YOU HAVE line, not a paragraph, so it stays in caps.
        wallet = uiText('', { role: 'caption', wrap: true, textCase: 'upper', layout: { width: uiFixed(110) } }); otherMoney = uiCurrency({ bronze: 0 });
        status = uiText('', { wrap: true, align: 'center', layout: { width: uiFixed(280) } });
        const ownGrid = wrapSlots(uiInventoryGrid({ id: 'trade.own', container: 'trade-own', count: 6, columns: 3, gap: 2, fixedColumns: true, layout: { width: 'fit' },
          artwork, iconAnimation, stack: index => offer(model.identityHex, index) ?? null,
          onActivate: index => { if (live && offer(model.identityHex, index)) options.callbacks.removeItem(model.session.id, index); },
        }), () => model.identityHex, true);
        const otherGrid = wrapSlots(uiInventoryGrid({ id: 'trade.other', container: 'trade-other', count: 6, columns: 3, gap: 2, fixedColumns: true, layout: { width: 'fit' },
          artwork, iconAnimation, stack: index => offer(otherHex(), index) ?? null,
        }), otherHex, false);
        carriedHost = uiFlex({ shrink: 0 }); carriedHotbarHost = uiFlex({ shrink: 0 }); inventoryStructure = '';
        accept = button({ id: 'trade.accept', label: 'Accept', ariaLabel: 'Accept trade', tone: 'success', onPress: () => {
          if (live) options.callbacks.setAccepted(model.session.id, !ownAccepted(), model.session.revision);
        } });
        const column = (label: UiElement, tick: UiElement, grid: UiElement, money: readonly UiElement[]) => uiFlex({ direction: 'column', gap: 4, shrink: 0 }, [
          uiFlex({ direction: 'row', gap: 4, align: 'center', alignSelf: 'stretch', height: uiFixed(16) }, [label, uiFlex({ grow: 1 }, []), tickSlot(tick)]), grid, ...money]);
        // The offers sit beside what you carry, as a chest sits beside the backpack.
        // Both offers and the coins under them sit to the left of the pane, so the window stays compact.
        content.append(uiFlex({ id: 'trade.scroll', direction: 'row', gap: 12, align: 'start' }, [
          uiFlex({ direction: 'column', gap: 4, shrink: 0 }, [
            uiFlex({ direction: 'row', gap: 12, align: 'start' }, [column(ownLabel, ownTick, ownGrid, []), column(otherLabel, otherTick, otherGrid, [])]),
            uiFlex({ direction: 'row', gap: 2, align: 'center' }, moneyFields()),
            uiFlex({ direction: 'row', gap: 4, align: 'center', height: uiFixed(20) }, [wallet, uiFlex({ grow: 1 }, []), uiText('COINS', { role: 'caption' }), otherMoney]),
          ]),
          carriedHost,
        ]));
        content.append(status);
        content.append(uiFlex({ direction: 'row', gap: 4, justify: 'center', shrink: 0 }, [
          button({ id: 'trade.cancel', label: 'Cancel', tone: 'danger', onPress: cancel }), accept,
        ]));
        // The hotbar sits under the carved divider, as in every inventory window.
        content.append(uiWindowDivider());
        content.append(uiText('Click an item to offer it; right-click offers one.', { role: 'caption', align: 'center', wrap: true, layout: { width: uiFixed(280) } }));
        content.append(carriedHotbarHost);
      }
      rebuilding = false;
    }
    if (model.session.state === 'active') { refreshInventory(); refreshOfferable(); }
    const other = own() ? model.recipientName : model.requesterName;
    base.setWindowTitle(model.session.state === 'requested' ? 'TRADE REQUEST' : `TRADE WITH ${other.toUpperCase()}`);
    requestLabel?.setProps({ text: own() ? `Waiting for ${model.recipientName} to answer.` : `${model.requesterName} wants to trade with you.` });
    ownLabel?.setProps({ text: 'YOUR OFFER' }); ownLabel?.setProps({ label: ownAccepted() ? 'YOUR OFFER, ACCEPTED' : 'YOUR OFFER' });
    otherLabel?.setProps({ text: `${other.toUpperCase()}'S OFFER` });
    ownTick?.setStyle({ visible: ownAccepted() }); otherTick?.setStyle({ visible: otherAccepted() });
    wallet?.setProps({ text: `You have ${uiPurseLabel(model.walletBronze)}` });
    if (otherMoney) { const bronze = own() ? model.session.recipientBronze : model.session.requesterBronze; otherMoney.setProps({ bronze }); otherMoney.label = uiCurrencyLabel(bronze); }
    status?.setProps({ text: ownAccepted() && otherAccepted() ? 'Both of you accepted. Completing the trade.'
      : ownAccepted() ? `Waiting for ${other} to accept. Changing an offer clears both ticks.`
      : otherAccepted() ? `${other} has accepted. Accept to trade, or change an offer to clear both ticks.`
      : `${other} is still deciding. Changing an offer clears both ticks.` });
    accept?.setProps({ label: ownAccepted() ? 'Unaccept' : 'Accept' });
    frame.invalidate();
  };
  updateTrade(model);
  return Object.assign(frame, { updateTrade, deactivateTrade() { live = false; allowBlurCommit = false; } });
}
