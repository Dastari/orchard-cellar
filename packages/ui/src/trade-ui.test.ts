import type { UiElement } from './kit/runtime/element.js';
import { scrollUiElement } from './kit/layout/scroll.js';
import type { CanvasTextEditor } from './kit/runtime/text-editor.js';
import { describe, expect, it, vi } from 'vitest';
import { TradeUi, type TradeUiCallbacks, type TradeUiModel } from './trade-ui.js';
import type { PixelUi } from './pixel-ui.js';
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
  const requester = { toHexString: () => `0x${'01'.repeat(32)}` };
  const recipient = { toHexString: () => `0x${'02'.repeat(32)}` };
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

function control(ui:TradeUi,label:string):UiElement {
 const walk=(node:UiElement):UiElement[]=>[node,...node.children.flatMap(walk)];ui.kitRoot.arrange();const node=walk(ui.kitRoot.tree).find(n=>(n.label===label||n.id===label)&&n.focusable)!;expect(node).toBeDefined();for(let p=node.parent;p;p=p.parent){scrollUiElement(p,p.scroll.x+node.rect.x-p.contentRect.x,p.scroll.y+node.rect.y-p.contentRect.y);ui.kitRoot.arrange();}return node;
}
function click(ui:TradeUi,label:string):void{const node=control(ui,label);const point={x:node.clip.x+2,y:node.clip.y+2};ui.pointerDown(point,0);ui.pointerUp();}
describe('trade UI', () => {

  it('presents an incoming request and accepts only from its button', () => {
    const handlers = callbacks();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, handlers);
    ui.update(model());
    expect(ui.active).toBe(true);
    click(ui,'ACCEPT REQUEST');
    expect(handlers.acceptRequest).toHaveBeenCalledWith('trade');
  });

  it('cancels an active trade on Escape and deactivates when the server row disappears', () => {
    const handlers = callbacks();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, handlers);
    ui.update(model('active'));
    expect(ui.handleKeyDown('Escape', false)).toBe(true);
    expect(handlers.cancel).toHaveBeenCalledWith('trade');
    ui.update(null);
    expect(ui.active).toBe(false);
  });

  it('accepts an active trade from its visible button', () => {
    const handlers = callbacks();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, handlers);
    ui.update(model('active'));
    click(ui,'trade.accept');
    expect(handlers.setAccepted).toHaveBeenCalledWith('trade', true, 0n);
  });

  it('combines separate gold, silver, and bronze fields into canonical bronze', () => {
    const handlers = callbacks();
    const ui=new TradeUi({}as UiSkin,{}as PixelUi,{}as never,handlers);ui.update({...model('active'),walletBronze:50000n},800,600);
    for(const [label,value] of [['Gold','2'],['Silver','3'],['Bronze','4']]as const){const node=control(ui,label);(node.props['editor'] as CanvasTextEditor).setValue(value);}
    const bronze=control(ui,'Bronze');ui.kitRoot.focus.set(bronze,'keyboard');ui.kitRoot.key({key:'Enter'});
    expect(handlers.offerBronze).toHaveBeenCalledWith('trade', 20_304n);
  });

  it('presents inventory in ten-column pages and scrolls by row', () => {
    const handlers = callbacks();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, handlers);
    const inventorySlots = Array.from({ length: 40 }, (_, slot) => ({
      slot, itemKind: 'wood', quantity: slot + 1,
    }));
    ui.update({ ...model('active'), inventorySlots });
    const slot=control(ui,'trade-inventory/10');expect(slot.rect.width).toBe(28);click(ui,'trade-inventory/10');
    expect(handlers.offerItem).toHaveBeenCalledWith('trade', 10, 0, 11);
  });

  it('does not submit an offer for a unique quest artifact', () => {
    const handlers = callbacks();
    const ui = new TradeUi({} as UiSkin, {} as PixelUi, {} as never, handlers);
    ui.update({
      ...model('active'),
      inventorySlots: [{ slot: 0, itemKind: 'marlow_book', quantity: 1 }],
    });
    click(ui,'trade-inventory/0');
    expect(handlers.offerItem).not.toHaveBeenCalled();
  });
});
