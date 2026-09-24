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
  readonly contentRegistry: ContentRegistry;
  readonly identityHex: string;
  readonly session: PlayerTradeSession;
  readonly offers: readonly PlayerTradeOffer[];
  readonly inventorySlots: readonly OverworldUiInventorySlot[];
  /** Authoritative accessible backpack capacity; older callers default to the base bag. */
  readonly backpackSlotCapacity?: number;
  readonly walletBronze: bigint;
  readonly requesterName: string;
  readonly recipientName: string;
}

export interface TradeUiCallbacks {
  readonly acceptRequest: (tradeId: string) => void;
  readonly declineRequest: (tradeId: string) => void;
  readonly cancel: (tradeId: string) => void;
  readonly offerItem: (tradeId: string, inventorySlot: number, tradeSlot: number, quantity: number) => void;
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

