import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ConnectionId, Identity } from 'spacetimedb';
import * as sim from '@orchard/sim';
import * as auth from '../packages/world/src/auth-policy.js';

/** Two-identity reducer integration fixture, with no server or production writes.
 * Executes current production callbacks/helpers, including auth, inventory,
 * escrow, cursor recovery and participant views. The table adapter supplies
 * transactional rollback; it does not test SpacetimeDB's transaction engine,
 * JWT verification, transport, subscriptions, UI gestures or browser rendering.
 * Quest/statistic/equipment and unrelated disconnect cleanup hooks are inert.
 * Run: npx vitest run scripts/player-trade-authority.test.ts
 */
const source = ts.createSourceFile('index.ts', readFileSync(new URL(
  '../packages/world/src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const reducers = ['requestTrade', 'acceptTradeRequest', 'declineTrade', 'cancelTrade',
  'setTradeOfferItem', 'removeTradeOfferItem', 'setTradeOfferBronze', 'setTradeAccepted', 'onDisconnect'] as const;
type Reducer = typeof reducers[number];
const views = ['ownTradeSession', 'ownTradeOffers'] as const;
const helpers = ['requireAuthorizedSender', 'firstIndexRow', 'tradeForPlayer', 'requireTradeParticipant',
  'tradePlayersWithinReach', 'resetTradeAcceptance', 'tradeOfferId', 'tradeStack',
  'insertEscrowStacksIntoInventory', 'cancelPlayerTrade', 'requireActiveTrade', 'completePlayerTrade',
  'inventorySlotOffset', 'inventoryContainerCapacity', 'accessibleInventoryContainerCapacity',
  'equippedInventoryCapacity', 'playerDebugBackpackSlots', 'storedStack', 'storedDurability',
  'storedLit', 'sameStoredStack', 'loadPlayerInventory', 'writePlayerInventory', 'activeItemContainerContent',
  'playerInventoryCursor', 'writePlayerInventoryCursor', 'returnInventoryCursorToStorage', 'stashOverflow'];
const constants = ['DEFAULT_BACKPACK_CAPACITY', 'PLAYER_TRADE_REACH_FIXED', 'PLAYER_TRADE_OFFER_SLOTS',
  'PLAYER_TRADE_REQUEST_TTL_TICKS', 'U64_MAX'];

function declaration(name: string): string {
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(source);
    if (!ts.isVariableStatement(node)) continue;
    const entry = node.declarationList.declarations.find(candidate => candidate.name.getText(source) === name);
    if (!entry?.initializer) continue;
    if (constants.includes(name)) return `const ${entry.getText(source)};`;
    if (!ts.isCallExpression(entry.initializer)) break;
    const callback = entry.initializer.arguments.find(ts.isArrowFunction);
    if (callback) return `const ${name} = ${callback.getText(source)};`;
  }
  throw new Error(`Production trade harness declaration missing: ${name}`);
}
const program = ts.transpileModule([...constants, ...helpers, ...reducers, ...views].map(declaration).join('\n')
  + `\nreturn { ${[...reducers, ...views].join(',')} };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

type Key = string | number | bigint | { toHexString(): string };
const keyOf = (key: Key): string => typeof key === 'object' ? key.toHexString() : String(key);
export interface StackRow { itemKind: string; quantity: number; durability: number; lit: boolean }
interface SlotRow extends StackRow { id: string; identity: Identity; slot: number }
interface OfferRow extends StackRow { id: string; tradeId: string; owner: Identity; slot: number }
interface MemberRow { identity: Identity; role: string; blocked: boolean; revokedAt?: bigint }
export interface TradeRow {
  id: string; requester: Identity; recipient: Identity; state: string;
  requesterAccepted: boolean; recipientAccepted: boolean;
  requesterBronze: bigint; recipientBronze: bigint; revision: bigint; createdTick: bigint;
}
export interface TradeContext {
  sender: Identity; connectionId: ConnectionId;
  senderAuth: { jwt: auth.JwtIdentityClaims | null };
  db: unknown;
}
interface Api extends Record<Reducer, (context: TradeContext, input: Record<string, unknown>) => void> {
  ownTradeSession(context: TradeContext): TradeRow | undefined;
  ownTradeOffers(context: TradeContext): OfferRow[];
}

export function tradeHarness() {
  const stores: { name: string; save(): () => void; inspect(): unknown[] }[] = [];
  const writes: { table: string; key: string }[] = [];
  function table<T extends object>(name: string, primary: (row: T) => Key, autoIncrement = false) {
    let rows = new Map<string, T>(), nextId = 1n;
    const record = (row: T) => { const key = keyOf(primary(row)); writes.push({ table: name, key }); rows.set(key, Object.freeze({ ...row })); return row; };
    const index = {
      find: (key: Key): T | null => rows.get(keyOf(key)) ?? null,
      update: (row: T): T => {
        if (!rows.has(keyOf(primary(row)))) throw new Error(`Missing ${name} row`);
        return record(row);
      },
      delete: (key: Key): boolean => { writes.push({ table: name, key: keyOf(key) }); return rows.delete(keyOf(key)); },
    };
    stores.push({ name, inspect: () => [...rows.values()], save() {
      const previous = new Map(rows), previousId = nextId;
      return () => { rows = previous; nextId = previousId; };
    } });
    return {
      id: index, identity: index, iter: () => rows.values(),
      insert(row: T): T {
        const next = autoIncrement && 'id' in row && row.id === 0n ? { ...row, id: nextId++ } : row;
        if (rows.has(keyOf(primary(next)))) throw new Error(`Duplicate ${name} row`);
        return record(next);
      },
      by: (pick: (row: T) => Key) => ({ filter: (key: Key): T[] => [...rows.values()].filter(row => keyOf(pick(row)) === keyOf(key)) }),
    };
  }
  const inventory = table<SlotRow>('inventory_slot', row => row.id);
  const offers = table<OfferRow>('player_trade_offer', row => row.id);
  const trades = table<TradeRow>('player_trade_session', row => row.id);
  const members = table<MemberRow>('membership', row => row.identity);
  const wallets = table<{ identity: Identity; balanceBronze: bigint }>('player_wallet', row => row.identity);
  const positions = table<{ identity: Identity; spaceId: number; x: number; y: number }>('player_position', row => row.identity);
  const publicPlayers = table<{ identity: Identity; online: boolean }>('player_public', row => row.identity);
  const cursors = table<StackRow & { identity: Identity }>('inventory_cursor', row => row.identity);
  const overflow = table<StackRow & { id: bigint; identity: Identity }>('inventory_overflow', row => row.id, true);
  const clock = table<{ id: number; authorityTick: bigint }>('world_clock', row => row.id);
  // These unrelated systems are absent in this fixture; missing row semantics
  // allow the actual disconnect callback to run its trade/cursor cleanup path.
  const emptyIndex = { find: () => null, delete: () => false };
  const absent = { identity: emptyIndex, connectionId: emptyIndex };
  const db = {
    inventory_slot: { ...inventory, by_identity: inventory.by(row => row.identity) },
    player_trade_offer: { ...offers, by_trade: offers.by(row => row.tradeId) },
    player_trade_session: { ...trades, by_requester: trades.by(row => row.requester), by_recipient: trades.by(row => row.recipient) },
    membership: members, player_wallet: wallets, player_position: positions, player_public: publicPlayers,
    inventory_cursor: cursors, inventory_overflow: overflow, world_clock: clock,
    inventory_overflow_retry: absent, player_survival: absent, connection_notice: absent,
    active_hearth_stash: absent, inventory_protocol: absent, player_defense_input: absent, player_combat_state: absent,
  };
  const registry = sim.bootstrapContentRegistry();
  const noop = () => {};
  const dependencies = { ...sim, ...auth, SenderError: Error, contentRegistry: () => registry,
    updateEquippedForIdentity: noop, refreshPlayerQuests: noop, recordPlayerStatistic: noop,
    deleteSessionChatNoticesForConnection: noop, clearBowCharge: noop, cancelFishingCastFor: noop,
  };
  const api = new Function(...Object.keys(dependencies), program)(...Object.values(dependencies)) as Api;
  const alice = Identity.fromString('a'.repeat(64)), bob = Identity.fromString('b'.repeat(64)), outsider = Identity.fromString('c'.repeat(64));
  clock.insert({ id: 0, authorityTick: 100n });
  for (const identity of [alice, bob, outsider]) {
    members.insert({ identity, role: 'friend', blocked: false });
    wallets.insert({ identity, balanceBronze: 100n });
    positions.insert({ identity, spaceId: 0, x: 10 * sim.TILE_SIZE_FIXED, y: 10 * sim.TILE_SIZE_FIXED });
    publicPlayers.insert({ identity, online: true });
    for (let slot = 0; slot < sim.INVENTORY_SLOT_COUNT; slot++) inventory.insert({
      id: `${identity.toHexString()}:${slot}`, identity, slot, itemKind: 'empty', quantity: 0, durability: 0, lit: true,
    });
  }
  const context = (sender: Identity, connection = '1'): TradeContext => ({ sender, connectionId: ConnectionId.fromString(connection.repeat(32)),
    senderAuth: { jwt: { issuer: auth.OIDC_ISSUER, audience: ['orchard-web'] } }, db });
  function run(name: Reducer, sender: Identity | TradeContext, input: Record<string, unknown> = {}): void {
    const rollback = stores.map(store => store.save());
    try { api[name](sender instanceof Identity ? context(sender) : sender, input); }
    catch (error) { for (const restore of rollback) restore(); throw error; }
  }
  const session = (identity = alice) => api.ownTradeSession(context(identity));
  function start() {
    run('requestTrade', alice, { target: bob });
    const tradeId = session()!.id;
    run('acceptTradeRequest', bob, { tradeId });
    return tradeId;
  }
  function put(identity: Identity, slot: number, itemKind: string, quantity: number, durability = 0, lit = true) {
    inventory.id.update({ id: `${identity.toHexString()}:${slot}`, identity, slot, itemKind, quantity, durability, lit });
  }
  function fill(identity: Identity) {
    for (let slot = 0; slot < sim.HOTBAR_SLOT_COUNT + sim.BASE_BACKPACK_CAPACITY; slot++) {
      put(identity, slot, 'stone', sim.runtimeMaxStack(registry, 'stone')!);
    }
  }
  const owned = (identity: Identity) => [...inventory.iter()].filter(row => row.identity.isEqual(identity) && row.quantity > 0);
  const snapshot = () => stores.map(store => ({ table: store.name, rows: store.inspect() }));
  return { alice, bob, outsider, api, context, run, start, session, put, fill, owned, snapshot, writes,
    offers, trades, members, wallets, positions, publicPlayers, cursors, overflow, clock, inventory, registry };
}
