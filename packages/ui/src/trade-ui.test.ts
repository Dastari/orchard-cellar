import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows, buildContentRegistry, BACKPACK_SLOT_COUNT } from '@orchard/sim';
import { TradeUi, tradeItemDisplayName, tradeItemIsOfferable, type TradeUiCallbacks, type TradeUiModel } from './trade-ui.js';
import type { OverworldUiItemArt } from './overworld-ui.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiElement } from './kit/runtime/element.js';
import type { CanvasTextEditor } from './kit/runtime/text-editor.js';
import { uiSlotView } from './kit/components/inventory.js';

function callbacks() { return { acceptRequest: vi.fn(), declineRequest: vi.fn(), cancel: vi.fn(),
  offerItem: vi.fn(), removeItem: vi.fn(), offerBronze: vi.fn(), setAccepted: vi.fn() } satisfies TradeUiCallbacks; }
function model(state = 'active'): TradeUiModel {
  const requester = { toHexString: () => 'self' }, recipient = { toHexString: () => 'peer' };
  return { contentRegistry: bootstrapContentRegistry(), identityHex: 'self', requesterName: 'Mara', recipientName: 'Toby',
    walletBronze: 100_000n, offers: [], inventorySlots: [{ container: 'hotbar' as const, index: 0, itemKind: 'wood', quantity: 12 }],
    session: { id: 'trade', requester, recipient, state, requesterAccepted: false, recipientAccepted: false,
      requesterBronze: 0n, recipientBronze: 0n, revision: 0n, createdTick: 1n } };
}
/** What you carry is the shared player inventory pane and the hotbar row (BUG-067): a carried cell's slot id. */
const cell = (container: 'hotbar' | 'backpack', index: number): string => `trade.${container}.slot.${index}`;
/** The cell an offer names (Uncapped Storage step 4c): a container and index, never a global slot. */
const hotbar = (index: number) => ({ container: 'hotbar', index }), backpack = (index: number) => ({ container: 'backpack', index });
function setup(initial = model()) {
  const handlers = callbacks(), ui = new TradeUi({} as UiKitArt, {} as OverworldUiItemArt, handlers);
  ui.resize(800, 600); ui.update(initial); ui.root.arrange();
  const node = (id: string): UiElement => ui.root.entries().find(entry => entry.element.id === id)!.element;
  const reveal = (id: string) => { ui.root.arrange(); ui.root.focus.set(node(id)); ui.root.arrange(); return node(id); };
  const point = (id: string) => { const n = reveal(id); return { x: n.rect.x + n.rect.width / 2, y: n.rect.y + n.rect.height / 2 }; };
  const click = (id: string, button = 0) => { const p = point(id);
    ui.root.pointer({ type: 'down', point: p, pointerId: 1, button }); ui.root.pointer({ type: 'up', point: p, pointerId: 1, button }); };
  const key = (id: string, key = 'Enter') => { reveal(id); ui.root.key({ key }); };
  const edit = (id: string, value: string) => { const n = reveal(id), editor = n.props['editor'] as CanvasTextEditor;
    editor.setSelection(0, editor.snapshot().value.length); ui.root.text(value); return editor; };
  /** A cell the window shows (the pane keeps cells past the bag's capacity out of view). */
  const shown = (id: string): boolean => ui.root.entries().some(entry => entry.element.id === id && entry.element.style.display !== 'none');
  return { ui, handlers, node, reveal, point, click, key, edit, shown };
}

describe('items that cannot be offered (item slot S4)', () => {
  it('show the approved disabled face and take no input, and follow the carried item', () => {
    const initial = { ...model(), inventorySlots: [{ container: 'hotbar' as const, index: 0, itemKind: 'backpack', quantity: 1 }, { container: 'hotbar' as const, index: 1, itemKind: 'fishing_handbook', quantity: 1 },
      { container: 'hotbar' as const, index: 2, itemKind: 'wood', quantity: 5 }] };
    const h = setup(initial);
    // The carried cells are the trade's guarded wrappers of kit slots, which adopt the slot: its state (the approved grey
    // face, render 01 B) is the live cell's slot view, and it blocks the cell's input (review of #234, findings 7 and 8).
    const view = (index: number) => uiSlotView(h.node(cell('hotbar', index)));
    // The same rule the server applies (item_not_tradeable): backpacks and unique quest items are not offerable.
    expect([0, 1, 2].map(slot => tradeItemIsOfferable(initial.contentRegistry, initial.inventorySlots[slot]!.itemKind))).toEqual([false, false, true]);
    expect([0, 1, 2].map(slot => view(slot)?.enabled)).toEqual([false, false, true]);
    expect(h.node(cell('hotbar', 0)).disabled).toBe(true);
    const box = h.node(cell('hotbar', 0)).rect, p = { x: box.x + 14, y: box.y + 15 };
    h.ui.root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 }); h.ui.root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 });
    expect(h.handlers.offerItem).not.toHaveBeenCalled();
    // The same cell becomes offerable when its item changes, without rebuilding the grid.
    const cellNode = h.node(cell('hotbar', 0));
    h.ui.update({ ...initial, inventorySlots: [{ container: 'hotbar' as const, index: 0, itemKind: 'apple', quantity: 2 }, ...initial.inventorySlots.slice(1)] }); h.ui.root.arrange();
    expect(h.node(cell('hotbar', 0))).toBe(cellNode);
    expect(view(0)?.enabled).toBe(true); expect(cellNode.disabled).toBe(false);
    h.click(cell('hotbar', 0));
    expect(h.handlers.offerItem).toHaveBeenCalledExactlyOnceWith('trade', hotbar(0), 0, 2); h.ui.dispose();
  });
});

describe('production retained trade host', () => {
  it('keeps secondary touch from moving focus or issuing a second offer', () => {
    const h = setup(), slot = h.point(cell('hotbar', 0));
    h.ui.root.pointer({ type: 'down', point: slot, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    const focused = h.ui.root.focus.current, money = h.node('trade.money.gold').rect;
    h.ui.root.pointer({ type: 'down', point: { x: money.x + 2, y: money.y + 2 }, pointerId: 2,
      button: 0, pointerType: 'touch', isPrimary: false });
    expect(h.ui.root.focus.current).toBe(focused);
    h.ui.root.pointer({ type: 'up', point: slot, pointerId: 2, button: 0, pointerType: 'touch', isPrimary: false });
    expect(h.handlers.offerItem).not.toHaveBeenCalled();
    h.ui.root.pointer({ type: 'up', point: slot, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
    expect(h.handlers.offerItem).toHaveBeenCalledExactlyOnceWith('trade', hotbar(0), 0, 12);
    expect(h.handlers.offerBronze).not.toHaveBeenCalled(); h.ui.dispose();
  });

  it('discards unsubmitted money when the same trade returns on a new connection', () => {
    const initial = { ...model(), connectionScope: 'self:1' }, h = setup(initial);
    h.edit('trade.money.gold', '7');
    const oldEditor = h.node('trade.money.gold');
    const p = h.point('trade.accept');
    h.ui.root.pointer({ type: 'down', point: p, pointerId: 4, button: 0 });
    h.ui.update({ ...initial, connectionScope: 'self:2' }); h.ui.root.arrange();
    h.ui.root.pointer({ type: 'up', point: p, pointerId: 4, button: 0 });
    expect(oldEditor.disposed).toBe(true);
    expect((h.node('trade.money.gold').props['editor'] as CanvasTextEditor).snapshot().value).toBe('0');
    expect(h.handlers.offerBronze).not.toHaveBeenCalled();
    expect(h.handlers.setAccepted).not.toHaveBeenCalled();
    h.ui.dispose();
  });
  it('accepts/declines only incoming requests and waits for authority to close', () => {
    const incoming = { ...model('requested'), identityHex: 'peer' };
    const h = setup(incoming); h.click('trade.request.accept');
    expect(h.handlers.acceptRequest).toHaveBeenCalledExactlyOnceWith('trade');
    h.click('trade.request.decline'); expect(h.handlers.declineRequest).toHaveBeenCalledExactlyOnceWith('trade');
    h.click('trade.close'); expect(h.handlers.cancel).toHaveBeenCalledExactlyOnceWith('trade');
    expect(h.node('game.trade').visible).toBe(true); expect(h.ui.active).toBe(true);
    const root = h.ui.root; h.ui.update(null); expect(h.ui.active).toBe(false);
    h.ui.update(model('requested')); h.ui.root.arrange(); expect(h.ui.root).toBe(root);
    expect(h.ui.root.entries().some(e => e.element.id === 'trade.request.accept')).toBe(false);
    h.key('trade.cancel'); expect(h.handlers.cancel).toHaveBeenCalledTimes(2); h.ui.dispose();
  });

  it('sends one primary stack or secondary single-item offer without mutating inventory', () => {
    const initial = model(), h = setup(initial); h.click(cell('hotbar', 0));
    expect(h.handlers.offerItem).toHaveBeenCalledExactlyOnceWith('trade', hotbar(0), 0, 12);
    h.click(cell('hotbar', 0), 2); h.key(cell('hotbar', 0), 'ContextMenu');
    expect(h.handlers.offerItem).toHaveBeenNthCalledWith(2, 'trade', hotbar(0), 0, 1);
    expect(h.handlers.offerItem).toHaveBeenNthCalledWith(3, 'trade', hotbar(0), 0, 1);
    expect(initial.inventorySlots[0]?.quantity).toBe(12); h.ui.dispose();
  });

  it('restricts inventory to carried slots and authored trade policy, and refuses a full offer', () => {
    const initial = { ...model(), inventorySlots: [
      { container: 'hotbar' as const, index: 0, itemKind: 'marlow_book', quantity: 1 }, { container: 'hotbar' as const, index: 1, itemKind: 'unknown', quantity: 1 },
      { container: 'equipment' as const, index: 0, itemKind: 'axe', quantity: 1 }, { container: 'backpack' as const, index: 0, itemKind: 'wood', quantity: 4 },
    ] };
    const h = setup(initial); h.key(cell('hotbar', 0)); h.key(cell('hotbar', 1));
    expect(h.shown(cell('backpack', BACKPACK_SLOT_COUNT))).toBe(false);
    expect(h.handlers.offerItem).not.toHaveBeenCalled();
    h.ui.update({ ...initial, offers: Array.from({ length: 6 }, (_, slot) => ({ id: `offer${slot}`, tradeId: 'trade',
      owner: initial.session.requester, slot, itemKind: 'wood', quantity: 1, durability: 0, lit: false })) });
    h.key(cell('backpack', 0)); expect(h.handlers.offerItem).not.toHaveBeenCalled();
    h.key('trade.own.slot.2'); expect(h.handlers.removeItem).toHaveBeenCalledExactlyOnceWith('trade', 2); h.ui.dispose();
  });

  it('ignores unrelated trade offers and never removes another participant escrow', () => {
    const initial = model(), h = setup({ ...initial, offers: [
      { id: 'other', tradeId: 'unrelated', owner: initial.session.requester, slot: 0, itemKind: 'wood', quantity: 1, durability: 0, lit: false },
      { id: 'peer', tradeId: 'trade', owner: initial.session.recipient, slot: 1, itemKind: 'wood', quantity: 1, durability: 0, lit: false },
    ] });
    h.key('trade.own.slot.0'); expect(h.handlers.removeItem).not.toHaveBeenCalled();
    expect(h.node('trade.other.slot.1').focusable).toBe(false); h.key(cell('hotbar', 0));
    expect(h.handlers.offerItem).toHaveBeenCalledWith('trade', hotbar(0), 0, 12); h.ui.dispose();
  });

  it('accepts current revisions but cancels a press spanning a changed revision or row', () => {
    const initial = model(), h = setup(initial); const p = h.point('trade.accept');
    h.ui.root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 });
    const next = { ...initial, session: { ...initial.session, revision: 9n, requesterAccepted: true } };
    h.ui.update(next); h.ui.root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 });
    expect(h.handlers.setAccepted).not.toHaveBeenCalled(); h.key('trade.accept');
    expect(h.handlers.setAccepted).toHaveBeenCalledExactlyOnceWith('trade', false, 9n);
    const q = h.point(cell('hotbar', 0)); h.ui.root.pointer({ type: 'down', point: q, pointerId: 2, button: 0 });
    h.ui.update({ ...next, inventorySlots: [{ container: 'hotbar' as const, index: 0, itemKind: 'axe', quantity: 1 }] });
    h.ui.root.pointer({ type: 'up', point: q, pointerId: 2, button: 0 });
    expect(h.handlers.offerItem).not.toHaveBeenCalled(); h.ui.dispose();
  });

  it('preserves precise bigint money, sanitizes pasted digits, clamps wallet and deduplicates Enter then Tab blur', () => {
    const h = setup({ ...model(), walletBronze: 18_446_744_073_709_551_615n });
    h.edit('trade.money.gold', '1234567890123456'); h.edit('trade.money.silver', '78'); h.edit('trade.money.bronze', '9x');
    h.ui.root.key({ key: 'Enter' }); h.ui.root.key({ key: 'Tab' });
    expect(h.handlers.offerBronze).toHaveBeenCalledExactlyOnceWith('trade', 12_345_678_901_234_567_809n);
    h.ui.update({ ...model(), walletBronze: 17n }); h.edit('trade.money.gold', '99'); h.ui.root.key({ key: 'Enter' });
    expect(h.handlers.offerBronze).toHaveBeenLastCalledWith('trade', 17n); h.ui.dispose();
  });

  it('commits an explicit Tab blur, but never programmatic blur, model update, Escape or teardown', () => {
    const initial = model(), h = setup(initial); h.edit('trade.money.gold', '2');
    h.ui.root.focus.set(null); expect(h.handlers.offerBronze).not.toHaveBeenCalled();
    h.edit('trade.money.gold', '3'); h.ui.root.key({ key: 'Tab' });
    expect(h.handlers.offerBronze).toHaveBeenCalledExactlyOnceWith('trade', 30_000n);
    h.edit('trade.money.gold', '4'); h.ui.update({ ...initial, session: { ...initial.session, revision: 8n } });
    h.ui.resize(323, 240); h.ui.root.arrange(); expect((h.node('trade.money.gold').props['editor'] as CanvasTextEditor).snapshot().value).toBe('4');
    h.ui.root.key({ key: 'Escape' }); expect(h.handlers.cancel).toHaveBeenCalledExactlyOnceWith('trade');
    h.ui.update(null); h.ui.dispose(); expect(h.handlers.offerBronze).toHaveBeenCalledTimes(1);
  });

  it('does not commit mid-composition or reset IME draft on harmless updates', () => {
    const initial = model(), h = setup(initial); const field = h.reveal('trade.money.gold');
    const editor = field.props['editor'] as CanvasTextEditor; editor.setSelection(0, 1);
    field.hooks.onComposition?.('start', '', field); field.hooks.onComposition?.('update', '12', field);
    h.ui.update(initial); h.ui.root.key({ key: 'Enter' }); expect(h.handlers.offerBronze).not.toHaveBeenCalled();
    expect(editor.snapshot().composing).toBe(true); field.hooks.onComposition?.('end', '12', field);
    h.ui.root.key({ key: 'Enter' }); expect(h.handlers.offerBronze).toHaveBeenCalledExactlyOnceWith('trade', 100_000n); h.ui.dispose();
  });

  it('money blur from action pointer down cannot also accept on that gesture release', () => {
    const h = setup(); const target = h.point('trade.accept'); h.edit('trade.money.gold', '2');
    h.ui.root.pointer({ type: 'down', point: target, pointerId: 1, button: 0 });
    h.ui.root.pointer({ type: 'up', point: target, pointerId: 1, button: 0 });
    expect(h.handlers.offerBronze).toHaveBeenCalledExactlyOnceWith('trade', 20_000n);
    expect(h.handlers.setAccepted).not.toHaveBeenCalled(); h.click('trade.accept');
    expect(h.handlers.setAccepted).toHaveBeenCalledExactlyOnceWith('trade', true, 0n); h.ui.dispose();
  });

  it.each(['trade.cancel', 'trade.close'])('cancels from %s without committing the focused money draft', id => {
    const h = setup(), p = h.point(id); h.edit('trade.money.gold', '2');
    h.ui.root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 });
    h.ui.root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 });
    expect(h.handlers.cancel).toHaveBeenCalledExactlyOnceWith('trade'); expect(h.handlers.offerBronze).not.toHaveBeenCalled();
    expect(h.ui.active).toBe(true); h.ui.dispose();
  });

  it('a different same-revision session gets fresh money and cannot receive old pointer tails', () => {
    const initial = model(), h = setup(initial); h.edit('trade.money.gold', '3'); const p = h.point('trade.accept');
    h.ui.root.pointer({ type: 'down', point: p, pointerId: 1, button: 0 });
    h.ui.update({ ...initial, session: { ...initial.session, id: 'new-trade', requesterBronze: 456n } }); h.ui.root.arrange();
    h.ui.root.pointer({ type: 'up', point: p, pointerId: 1, button: 0 });
    expect(h.handlers.setAccepted).not.toHaveBeenCalled(); expect(h.handlers.offerBronze).not.toHaveBeenCalled();
    expect((h.node('trade.money.silver').props['editor'] as CanvasTextEditor).snapshot().value).toBe('4');
    h.ui.update({ ...initial, identityHex: 'outsider' }); expect(h.ui.active).toBe(false); h.ui.dispose();
  });

  it('keeps money editor and draft focused when carried slot membership changes', () => {
    const initial = model(), h = setup(initial), editor = h.edit('trade.money.gold', '123');
    const field = h.node('trade.money.gold');
    h.ui.update({ ...initial, inventorySlots: [...initial.inventorySlots, { container: 'hotbar' as const, index: 1, itemKind: 'stone', quantity: 3 }] });
    h.ui.root.arrange(); expect(h.node('trade.money.gold')).toBe(field); expect(h.ui.root.focus.current).toBe(field);
    expect(editor.snapshot().value).toBe('123'); expect(h.handlers.offerBronze).not.toHaveBeenCalled();
    h.key(cell('hotbar', 1)); expect(h.handlers.offerItem).toHaveBeenCalledWith('trade', hotbar(1), 0, 3); h.ui.dispose();
  });

  it('uses authoritative expanded backpack capacity and excludes inaccessible rows', () => {
    const initial = { ...model(), inventorySlots: [{ container: 'backpack' as const, index: 15, itemKind: 'wood', quantity: 2 }] };
    const h = setup({ ...initial, backpackSlotCapacity: 10 });
    expect(h.shown(cell('backpack', 15))).toBe(false);
    h.ui.update({ ...initial, backpackSlotCapacity: 20 }); h.key(cell('backpack', 15));
    expect(h.handlers.offerItem).toHaveBeenCalledExactlyOnceWith('trade', backpack(15), 0, 2); h.ui.dispose();
  });

  it('offers exactly the cells the capacity rule opens: a 12-cell bag, a bag below the base 8, never past the backpack (BUG-056)', () => {
    const cells = [7, 11, 12, 19].map(index => ({ container: 'backpack' as const, index, itemKind: 'wood', quantity: 1 }));
    const offerable = (backpackSlotCapacity: number) => {
      const h = setup({ ...model(), inventorySlots: [...cells, { container: 'equipment' as const, index: 0, itemKind: 'wood', quantity: 1 }], backpackSlotCapacity });
      // Equipment never shows, and the pane never goes past the backpack's cells.
      const shown = [...cells.map(row => row.index), BACKPACK_SLOT_COUNT].filter(index => h.shown(cell('backpack', index))); h.ui.dispose();
      return shown;
    };
    expect(offerable(12)).toEqual([7, 11]);
    expect(offerable(4)).toEqual([7]);
    expect(offerable(20)).toEqual([7, 11, 12, 19]);
    expect(offerable(25)).toEqual([7, 11, 12, 19]);
  });

  it.each([[323, 240], [480, 270], [800, 600]])('keeps modal and footer controls within %sx%s logical bounds', (width, height) => {
    const h = setup(); h.ui.resize(width, height); h.ui.root.arrange();
    // Short screens scroll the window body; each control must come fully into view when focused.
    for (const id of ['game.trade', 'trade.accept', 'trade.cancel']) {
      const r = (id === 'game.trade' ? h.node(id) : h.reveal(id)).rect; expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(width); expect(r.y + r.height).toBeLessThanOrEqual(height);
      expect(h.node(id).clip.height).toBeGreaterThan(0);
    }
    h.ui.dispose();
  });

  it('fails closed for retired live items without restoring bootstrap names or policy', () => {
    const source = bootstrapContentRegistry();
    const contentRegistry = buildContentRegistry(bootstrapContentRows().map((row) => {
      if (row.id !== 'item:marlow_book') return row;
      return { ...row, json: { ...source.items.get(row.id)!, retired: true } };
    })).registry;
    expect(tradeItemDisplayName(contentRegistry, 'marlow_book')).toBe('marlow_book');
    expect(tradeItemIsOfferable(contentRegistry, 'marlow_book')).toBe(false);
    expect(tradeItemDisplayName(contentRegistry, 'missing_item')).toBe('missing_item');
    expect(tradeItemIsOfferable(contentRegistry, 'missing_item')).toBe(false);
  });

  it('uses arbitrary active authored names and all authored non-tradeable policies', () => {
    const source = bootstrapContentRegistry();
    const moonLedger = {
      ...source.items.get('item:wood')!,
      id: 'item:moon_ledger' as const,
      displayName: 'Moon Ledger',
      tags: ['container.backpack'],
    };
    const contentRegistry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: moonLedger.id, kind: moonLedger.kind, json: moonLedger },
    ]).registry;
    expect(tradeItemDisplayName(contentRegistry, 'moon_ledger')).toBe('Moon Ledger');
    expect(tradeItemIsOfferable(contentRegistry, 'moon_ledger')).toBe(false);

    const grantRegistry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: moonLedger.id, kind: moonLedger.kind, json: {
        ...moonLedger, tags: [], economy: { ...moonLedger.economy, purchaseGrant: 'homestead_claim' },
      } },
    ]).registry;
    expect(tradeItemIsOfferable(grantRegistry, 'moon_ledger')).toBe(false);
  });
});

describe('what you carry is the shared player inventory pane (BUG-067)', () => {
  it('shows the backpack pane with its filter and every empty cell, and the hotbar row, like every inventory window', () => {
    const initial = { ...model(), backpackSlotCapacity: 12, inventorySlots: [{ container: 'hotbar' as const, index: 0, itemKind: 'wood', quantity: 12 },
      { container: 'backpack' as const, index: 2, itemKind: 'apple', quantity: 3 }, { container: 'backpack' as const, index: 5, itemKind: 'stone', quantity: 9 }] };
    const h = setup(initial);
    const ids = new Set(h.ui.root.entries().map(entry => entry.element.id));
    expect(ids.has('pane:trade.backpack')).toBe(true);
    expect(ids.has('trade.backpack.filter')).toBe(true);
    // The same header as every pane: the sort button stays, disabled mid-trade (offers name inventory slots).
    expect(h.node('trade.backpack.sort').disabled).toBe(true);
    // The hotbar is the window's footer, as in every inventory window.
    expect(h.node('trade.hotbar').parent?.parent?.children[0]?.kind).toBe('window-divider');
    const shownBackpack = () => Array.from({ length: 20 }, (_, index) => index).filter(index => h.shown(`trade.backpack.slot.${index}`));
    expect(shownBackpack()).toEqual(Array.from({ length: 12 }, (_, index) => index));
    expect(Array.from({ length: 10 }, (_, index) => h.shown(`trade.hotbar.slot.${index}`)).every(Boolean)).toBe(true);
    // Filtering hides only non-matching items; empty cells stay (owner 2026-09-28).
    h.edit('trade.backpack.filter', 'apple'); h.ui.root.arrange();
    expect(shownBackpack()).toEqual(Array.from({ length: 12 }, (_, index) => index).filter(index => index !== 5));
    // A carried item arriving under the live filter is re-filtered at once.
    h.ui.update({ ...initial, inventorySlots: [...initial.inventorySlots, { container: 'backpack' as const, index: 7, itemKind: 'stone', quantity: 1 }] }); h.ui.root.arrange();
    expect(shownBackpack()).toEqual(Array.from({ length: 12 }, (_, index) => index).filter(index => index !== 5 && index !== 7));
    h.ui.update({ ...initial, selectedSlot: 3 }); h.ui.root.arrange();
    expect(h.node('trade.hotbar').props['selected']).toBe(3);
    h.click(cell('backpack', 2));
    expect(h.handlers.offerItem).toHaveBeenCalledExactlyOnceWith('trade', backpack(2), 0, 3);
    h.ui.dispose();
  });
});
