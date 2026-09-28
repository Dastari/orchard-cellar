import type { ContentRegistry } from '@orchard/sim';
import type { OverworldUiInventorySlot } from './overworld-ui.js';

interface TradeIdentity {
  toHexString(): string;
}

interface PlayerTradeSession {
  readonly id: string;
  readonly requester: TradeIdentity;
  readonly recipient: TradeIdentity;
  readonly state: string;
  readonly requesterAccepted: boolean;
  readonly recipientAccepted: boolean;
  readonly requesterBronze: bigint;
  readonly recipientBronze: bigint;
  readonly revision: bigint;
  readonly createdTick: bigint;
}

interface PlayerTradeOffer {
  readonly id: string;
  readonly tradeId: string;
  readonly owner: TradeIdentity;
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
}

export interface TradeUiModel {
  /** Connection generation; reconnect discards drafts and pending gestures. */
  readonly connectionScope?: string;
  readonly contentRegistry: ContentRegistry;
  readonly identityHex: string;
  readonly session: PlayerTradeSession;
  readonly offers: readonly PlayerTradeOffer[];
  readonly inventorySlots: readonly OverworldUiInventorySlot[];
  /** Authoritative accessible backpack capacity; older callers default to the base bag. */
  readonly backpackSlotCapacity?: number;
  /** The player's selected hotbar slot, marked on the window's footer hotbar as on the HUD. */
  readonly selectedSlot?: number;
  readonly walletBronze: bigint;
  readonly requesterName: string;
  readonly recipientName: string;
}

/** The carried containers a trade offers from: the hotbar and the open backpack cells. */
export type TradeCarriedContainer = 'hotbar' | 'backpack';
/** The carried cell an offer takes its stack from (Uncapped Storage step 4c): the world's `setTradeOfferItem` takes this
 * container and u32 index, never a global slot. */
export interface TradeOfferCell {
  readonly container: TradeCarriedContainer;
  readonly index: number;
}

export interface TradeUiCallbacks {
  readonly acceptRequest: (tradeId: string) => void;
  readonly declineRequest: (tradeId: string) => void;
  readonly cancel: (tradeId: string) => void;
  readonly offerItem: (tradeId: string, cell: TradeOfferCell, tradeSlot: number, quantity: number) => void;
  readonly removeItem: (tradeId: string, tradeSlot: number) => void;
  readonly offerBronze: (tradeId: string, amount: bigint) => void;
  readonly setAccepted: (tradeId: string, accepted: boolean, revision: bigint) => void;
}

export function tradeItemDisplayName(registry: ContentRegistry, itemKind: string): string {
  const definition = registry.items.get(`item:${itemKind}`);
  return definition === undefined || definition.retired === true ? itemKind : definition.displayName;
}

export function tradeItemIsOfferable(registry: ContentRegistry, itemKind: string): boolean {
  const definition = registry.items.get(`item:${itemKind}`);
  return definition !== undefined && definition.retired !== true
    && definition.economy.purchaseGrant === undefined
    && !definition.tags.includes('item.quest_unique')
    && !definition.tags.includes('container.backpack');
}
