import { BACKPACK_SLOT_OFFSET, BACKPACK_SLOT_COUNT, BASE_BACKPACK_CAPACITY, HOTBAR_SLOT_COUNT, coinPurseFromBronze, BRONZE_PER_GOLD, BRONZE_PER_SILVER } from '@orchard/sim';
import { tradeItemDisplayName, tradeItemIsOfferable, type TradeUiModel, type TradeUiCallbacks } from '../../trade-model.js';
import type { LoadedAsset } from '../../assets.js';
import { containsPoint } from '../../geometry.js';
import { UiElement, type UiElementKey } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton, type UiButtonOptions } from './button.js';
import { uiInput } from './input.js';
import { uiInventoryGrid } from './inventory.js';
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
  const inventory = () => {
    const capacity = Math.max(0, Math.min(BACKPACK_SLOT_COUNT, Math.floor(model.backpackSlotCapacity ?? BASE_BACKPACK_CAPACITY)));
    return model.inventorySlots.filter(row => row.slot >= 0 && (row.slot < HOTBAR_SLOT_COUNT
      || row.slot >= BACKPACK_SLOT_OFFSET && row.slot < BACKPACK_SLOT_OFFSET + capacity)).toSorted((a, b) => a.slot - b.slot);
  };
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
    return new UiElement({ ...base.hooks, children: [...base.children],
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
  };
  const cancelButtons: UiElement[] = [];
  const button = (buttonOptions: UiButtonOptions) => {
    const control = guarded(uiButton(buttonOptions));
    if (buttonOptions.id === 'trade.cancel' || buttonOptions.id === 'trade.close') cancelButtons.push(control);
    return control;
  };
  const cancel = () => { if (live) options.callbacks.cancel(model.session.id); };
  const title = uiText('TRADE', { role: 'header', overflow: 'ellipsis', layout: { width: 'grow' } });
  const content = uiFlex({ width: 'grow', height: 'grow', gap: 8 });
  // uiFrame's generic closable path hides locally. Trade must wait for authority,
  // so its close control is explicit and leaves the frame visible on rejection.
  const base = uiFrame({ id: 'game.trade', header: { title: 'TRADE', content: uiFlex({ direction: 'row', width: 'grow', gap: 4 }, [
    title, button({ id: 'trade.close', label: 'X', ariaLabel: 'Cancel trade', size: 'sm', layout: { width: uiFixed(20) }, onPress: cancel }),
  ]) }, layout: { width: 'grow', height: 'grow', ...options.layout }, children: [content] });
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
  let carriedHost: UiElement | undefined, inventoryStructure = '';
  const moneyFields = () => editors.map((editor, index) => {
    const label = ['Gold', 'Silver', 'Bronze'][index]!;
    const input = uiInput({ id: `trade.money.${label.toLowerCase()}`, label, editor, layout: { width: 'grow' },
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
    return uiFlex({ width: 'grow', basis: uiFixed(index === 0 ? 116 : 64), gap: 2 }, [uiText(label), field]);
  });
  const wrapSlots = (grid: UiElement, owner: () => string, actionable: boolean) => {
    for (const [index, cell] of [...grid.children].entries()) {
      grid.remove(cell);
      grid.append(uiTooltip(() => { const row = offer(owner(), index); return row ? tradeItemDisplayName(model.contentRegistry, row.itemKind) : ''; },
        actionable ? guarded(cell) : cell, { width: uiFixed(28), height: uiFixed(31) }));
    }
    return grid;
  };
  const refreshInventory = () => {
    if (!carriedHost) return;
    const key = inventory().map(row => row.slot).join(',');
    if (key === inventoryStructure && carriedHost.children.length) return;
    inventoryStructure = key;
    for (const child of [...carriedHost.children]) child.dispose();
    const carried = uiInventoryGrid({ id: 'trade.inventory', container: 'trade-inventory', cells: inventory().map(row => ({ id: String(row.slot), index: row.slot })),
      columns: 10, slotSize: 'sm', gap: 2, artwork, iconAnimation, allowSecondary: true,
      stack: index => model.inventorySlots.find(row => row.slot === index) ?? null,
      onActivate(index, event) {
        if (!live) return;
        const row = model.inventorySlots.find(row => row.slot === index), free = Array.from({ length: 6 }, (_, i) => i).find(i => !offer(model.identityHex, i));
        if (!row || row.itemKind === 'empty' || row.quantity <= 0 || !tradeItemIsOfferable(model.contentRegistry, row.itemKind) || free === undefined) return;
        options.callbacks.offerItem(model.session.id, index, free, event.button === 2 ? 1 : row.quantity);
      },
    });
    for (const [index, cell] of [...carried.children].entries()) {
      const slot = inventory()[index]!.slot;
      carried.remove(cell);
      carried.append(guarded(cell, () => {
        const row = model.inventorySlots.find(row => row.slot === slot);
        return `${actionKey()}:${row?.itemKind}:${row?.quantity}:${row?.durability}:${row?.lit}`;
      }));
    }
    carriedHost.append(carried);
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
      ownLabel = otherLabel = wallet = otherMoney = accept = requestLabel = carriedHost = undefined;
      title.setProps({ text: model.session.state === 'requested' ? 'TRADE REQUEST' : 'TRADE' });
      if (model.session.state === 'requested') {
        requestLabel = uiText('', { id: 'trade.request', wrap: true });
        content.append(uiScrollArea({ height: 'grow' }, [requestLabel]));
        content.append(uiFlex({ direction: 'row', wrap: true, gap: 4, shrink: 0 }, own() ? [
          button({ id: 'trade.cancel', label: 'CANCEL', tone: 'danger', onPress: cancel }),
        ] : [
          button({ id: 'trade.request.accept', label: 'ACCEPT REQUEST', tone: 'success', onPress: () => options.callbacks.acceptRequest(model.session.id) }),
          button({ id: 'trade.request.decline', label: 'DECLINE', tone: 'danger', onPress: () => options.callbacks.declineRequest(model.session.id) }),
        ]));
      } else {
        ownLabel = uiText('YOUR OFFER', { wrap: true }); otherLabel = uiText('', { wrap: true });
        wallet = uiText('', { wrap: true }); otherMoney = uiText('', { wrap: true });
        const ownGrid = wrapSlots(uiInventoryGrid({ id: 'trade.own', container: 'trade-own', count: 6, columns: 3, slotSize: 'sm', gap: 2,
          artwork, iconAnimation, stack: index => offer(model.identityHex, index) ?? null,
          onActivate: index => { if (live && offer(model.identityHex, index)) options.callbacks.removeItem(model.session.id, index); },
        }), () => model.identityHex, true);
        const otherGrid = wrapSlots(uiInventoryGrid({ id: 'trade.other', container: 'trade-other', count: 6, columns: 3, slotSize: 'sm', gap: 2,
          artwork, iconAnimation, stack: index => offer(otherHex(), index) ?? null,
        }), otherHex, false);
        carriedHost = uiFlex({ width: 'grow' }); inventoryStructure = '';
        accept = button({ id: 'trade.accept', label: 'ACCEPT TRADE', tone: 'success', onPress: () => {
          if (live) options.callbacks.setAccepted(model.session.id, !ownAccepted(), model.session.revision);
        } });
        content.append(uiScrollArea({ id: 'trade.scroll', width: 'grow', height: 'grow', gap: 8 }, [
          uiFlex({ direction: 'row', wrap: true, width: 'grow', gap: 8 }, [
            uiFlex({ width: 'grow', basis: uiFixed(220), gap: 4 }, [ownLabel, ownGrid, uiFlex({ direction: 'row', wrap: true, width: 'grow', gap: 4 }, moneyFields()), wallet]),
            uiFlex({ width: 'grow', basis: uiFixed(180), gap: 4 }, [otherLabel, otherGrid, otherMoney]),
          ]), uiText('YOUR INVENTORY — CLICK TO OFFER', { wrap: true }), carriedHost,
        ]));
        content.append(uiFlex({ direction: 'row', wrap: true, gap: 4, shrink: 0 }, [
          button({ id: 'trade.cancel', label: 'CANCEL', tone: 'danger', onPress: cancel }), accept,
        ]));
      }
      rebuilding = false;
    }
    if (model.session.state === 'active') refreshInventory();
    requestLabel?.setProps({ text: own() ? `WAITING FOR ${model.recipientName}` : `${model.requesterName} WANTS TO TRADE` });
    ownLabel?.setProps({ text: ownAccepted() ? 'YOUR OFFER — ACCEPTED' : 'YOUR OFFER' });
    otherLabel?.setProps({ text: `${own() ? model.recipientName : model.requesterName} OFFER${otherAccepted() ? ' — ACCEPTED' : ''}` });
    wallet?.setProps({ text: `YOU HAVE ${uiPurseLabel(model.walletBronze)}` });
    otherMoney?.setProps({ text: uiPurseLabel(own() ? model.session.recipientBronze : model.session.requesterBronze) });
    accept?.setProps({ label: ownAccepted() ? 'UNACCEPT' : 'ACCEPT TRADE' });
    frame.invalidate();
  };
  updateTrade(model);
  return Object.assign(frame, { updateTrade, deactivateTrade() { live = false; allowBlurCommit = false; } });
}
