import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ConnectionId, Identity } from 'spacetimedb';
import * as sim from '@orchard/sim';
import * as auth from '../packages/world/src/auth-policy.js';
import * as cells from '../packages/world/src/container-cells.js';

/** Two-identity reducer integration fixture, with no server or production writes.
 * Executes current production callbacks/helpers, including auth, inventory,
 * escrow, cursor recovery and participant views. The table adapter supplies
 * transactional rollback; it does not test SpacetimeDB's transaction engine,
 * JWT verification, transport, subscriptions, UI gestures or browser rendering.
 * Quest/statistic/equipment and unrelated disconnect cleanup hooks are inert.
 * Player storage is the sparse `player_container_cell` table (only occupied
 * cells are rows); every fixture player is on the current container layout.
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
  'withSenderErrors', 'requirePlayerContainerCells', 'putInventoryCell',
  'inventoryContainerCapacity', 'accessibleInventoryContainerCapacity',
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
export interface CellRow extends StackRow { id: string; identity: Identity; container: string; index: number }
/** A stored player cell in a container the client knows: the shape the trade panel reads (Uncapped Storage step 4c). */
export type PlayerCellRow = CellRow & { container: sim.PlayerContainerId };
interface MigrationRow {
  identity: Identity; durabilityVersion: number; hotbarLayoutVersion: number;
  equipmentLayoutVersion: number; containerLayoutVersion: number;
}
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
  const inventory = table<CellRow>('player_container_cell', row => row.id);
  const migrations = table<MigrationRow>('inventory_migration', row => row.identity);
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
    player_container_cell: {
      ...inventory, by_identity: inventory.by(row => row.identity),
      by_identity_container: { filter: ([identity, container]: [Identity, string]): CellRow[] =>
        [...inventory.iter()].filter(row => row.identity.isEqual(identity) && row.container === container) },
    },
    inventory_migration: migrations,
    player_trade_offer: { ...offers, by_trade: offers.by(row => row.tradeId) },
    player_trade_session: { ...trades, by_requester: trades.by(row => row.requester), by_recipient: trades.by(row => row.recipient) },
    membership: members, player_wallet: wallets, player_position: positions, player_public: publicPlayers,
    inventory_cursor: cursors, inventory_overflow: overflow, world_clock: clock,
    inventory_overflow_retry: absent, player_survival: absent, connection_notice: absent,
    active_hearth_stash: absent, inventory_protocol: absent, player_defense_input: absent, player_combat_state: absent,
  };
  const registry = sim.bootstrapContentRegistry();
  const noop = () => {};
  const dependencies = { ...sim, ...auth, ...cells, SenderError: Error, contentRegistry: () => registry,
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
    migrations.insert({ identity, durabilityVersion: 1, hotbarLayoutVersion: 1, equipmentLayoutVersion: 1,
      containerLayoutVersion: sim.CURRENT_CONTAINER_LAYOUT_VERSION });
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
  /** Stores one player cell (an empty stack deletes the row). */
  function put(identity: Identity, cell: sim.PlayerContainerCellRef, itemKind: string, quantity: number, durability = 0, lit = true) {
    const id = sim.playerContainerCellKey(identity.toHexString(), cell);
    if (itemKind === 'empty' || quantity <= 0) { inventory.id.delete(id); return; }
    const row = { id, identity, container: cell.container, index: cell.index, itemKind, quantity, durability, lit };
    if (inventory.id.find(id) === null) inventory.insert(row); else inventory.id.update(row);
  }
  function fill(identity: Identity) {
    const stone = sim.runtimeMaxStack(registry, 'stone')!;
    for (let index = 0; index < sim.HOTBAR_SLOT_COUNT; index++) put(identity, { container: 'hotbar', index }, 'stone', stone);
    for (let index = 0; index < sim.BASE_BACKPACK_CAPACITY; index++) put(identity, { container: 'backpack', index }, 'stone', stone);
  }
  /** The identity's stored cells, container by container in index order, as the client's `own_player_container_cells`
   * view delivers them. Every stored cell is occupied. */
  const playerCells = (identity: Identity): PlayerCellRow[] => [...inventory.iter()]
    .filter((row): row is PlayerCellRow => row.identity.isEqual(identity) && sim.isPlayerContainerId(row.container))
    .sort((left, right) => sim.PLAYER_CONTAINERS.indexOf(left.container) - sim.PLAYER_CONTAINERS.indexOf(right.container)
      || left.index - right.index);
  const owned = (identity: Identity) => playerCells(identity).filter(row => row.quantity > 0);
  const snapshot = () => stores.map(store => ({ table: store.name, rows: store.inspect() }));
  return { alice, bob, outsider, api, context, run, start, session, put, fill, owned, playerCells, snapshot, writes,
    offers, trades, members, wallets, positions, publicPlayers, cursors, overflow, clock, inventory, migrations, registry };
}
