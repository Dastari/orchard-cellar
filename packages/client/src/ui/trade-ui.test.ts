import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Identity } from 'spacetimedb';
import { TradeUi, type TradeUiCallbacks, type TradeUiModel } from './trade-ui.js';
import type { PixelUi } from '../render/pixel-ui.js';
import type { UiSkin } from './skin.js';

function callbacks(): TradeUiCallbacks & {
  acceptRequest: ReturnType<typeof vi.fn<(tradeId: string) => void>>;
  cancel: ReturnType<typeof vi.fn<(tradeId: string) => void>>;
} {
  const acceptRequest = vi.fn<(tradeId: string) => void>();
  const cancel = vi.fn<(tradeId: string) => void>();
  return {
    acceptRequest, declineRequest: vi.fn(), cancel, offerItem: vi.fn(),
    removeItem: vi.fn(), offerBronze: vi.fn(), setAccepted: vi.fn(),
  };
}

function model(state: 'requested' | 'active' = 'requested'): TradeUiModel {
  const requester = new Identity(`0x${'01'.repeat(32)}`);
  const recipient = new Identity(`0x${'02'.repeat(32)}`);
  return {
    identityHex: recipient.toHexString(), requesterName: 'Dastari', recipientName: 'Nado',
    walletBronze: 100n, offers: [], inventorySlots: [],
    session: {
      id: 'trade', requester, recipient, state,
      requesterAccepted: false, recipientAccepted: false,
      requesterBronze: 0n, recipientBronze: 0n, revision: 0n, createdTick: 1n,
    },
  };
}

function input(): HTMLInputElement {
  return {
    value: '', hidden: true, selectionStart: 0, selectionEnd: 0,
    addEventListener: vi.fn(), blur: vi.fn(), focus: vi.fn(), select: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn() },
  } as unknown as HTMLInputElement;
}

function moneyInputs() {
  return { gold: input(), silver: input(), bronze: input() };
}

describe('trade UI', () => {
  beforeEach(() => vi.stubGlobal('document', { activeElement: null }));

  it('presents an incoming request and accepts only from its button', () => {
    const handlers = callbacks();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, moneyInputs(), handlers);
    ui.update(model());
    expect(ui.active).toBe(true);
    expect(ui.pointerDown({ x: 110, y: 160 }, 0)).toBe(true);
    expect(handlers.acceptRequest).toHaveBeenCalledWith('trade');
  });

  it('cancels an active trade on Escape and deactivates when the server row disappears', () => {
    const handlers = callbacks();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, moneyInputs(), handlers);
    ui.update(model('active'));
    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(handlers.cancel).toHaveBeenCalledWith('trade');
    ui.update(null);
    expect(ui.active).toBe(false);
  });

  it('accepts an active trade from its visible button', () => {
    const handlers = callbacks();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, moneyInputs(), handlers);
    ui.update(model('active'));
    expect(ui.pointerDown({ x: 300, y: 250 }, 0)).toBe(true);
    expect(handlers.setAccepted).toHaveBeenCalledWith('trade', true, 0n);
  });

  it('combines separate gold, silver, and bronze fields into canonical bronze', () => {
    const handlers = callbacks();
    const inputs = moneyInputs();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, inputs, handlers);
    ui.update({ ...model('active'), walletBronze: 50_000n });
    inputs.gold.value = '2';
    inputs.silver.value = '3';
    inputs.bronze.value = '4';
    const blurListener = vi.mocked(inputs.gold.addEventListener).mock.calls
      .find(([eventName]) => eventName === 'blur')?.[1];
    expect(blurListener).toBeDefined();
    (blurListener as EventListener)(new Event('blur'));
    expect(handlers.offerBronze).toHaveBeenCalledWith('trade', 20_304n);
  });

  it('presents inventory in ten-column pages and scrolls by row', () => {
    const handlers = callbacks();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, moneyInputs(), handlers);
    const inventorySlots = Array.from({ length: 40 }, (_, slot) => ({
      slot, itemKind: 'wood', quantity: slot + 1,
    }));
    ui.update({ ...model('active'), inventorySlots });
    expect(ui.wheel({ x: 135, y: 160 }, 100)).toBe(true);
    expect(ui.pointerDown({ x: 135, y: 160 }, 0)).toBe(true);
    expect(handlers.offerItem).toHaveBeenCalledWith('trade', 10, 0, 11);
  });

  it('does not submit an offer for a unique quest artifact', () => {
    const handlers = callbacks();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, moneyInputs(), handlers);
    ui.update({
      ...model('active'),
      inventorySlots: [{ slot: 0, itemKind: 'marlow_book', quantity: 1 }],
    });
    expect(ui.pointerDown({ x: 135, y: 160 }, 0)).toBe(true);
    expect(handlers.offerItem).not.toHaveBeenCalled();
  });
});
