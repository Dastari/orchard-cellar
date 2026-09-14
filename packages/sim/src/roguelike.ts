import { createRng, nextRng, type RngState } from './rng.js';
import type { TerrainTransition } from './terrain-elevation.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type { EnemyContentDefinition, EnemyDelvePoolEntry } from './content/outdoor-encounter-definition.js';
import type {DelveBoonModifierCode,DelveBoonUpgradeContentDefinition,UpgradeContentDefinition} from './content/world-definition.js';

export const ROGUE_ROOM_SIZE_TILES = 32;
export const ROGUE_RUN_ROOM_COUNT = 12;
export const ROGUE_RUN_ACT_ROOMS = 4;

export type RogueTheme = 'cave' | 'volcanic' | 'dungeon';
export type RogueRoomKind = 'combat' | 'elite' | 'shop' | 'recovery' | 'treasure' | 'boss';
export type RogueDirection = 'north' | 'east' | 'south' | 'west';
export type RogueRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type RogueEnemyArchetype = 'melee' | 'ranged' | 'mage' | 'flying';

export interface RogueTilePoint {
  readonly tileX: number;
  readonly tileY: number;
}

export interface RogueRoomExit extends RogueTilePoint {
  readonly slot: number;
  readonly direction: RogueDirection;
  readonly destinationKind: RogueRoomKind;
  readonly label: string;
}

export interface RogueRoomLayout {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly blocked: readonly boolean[];
  readonly elevations: Int16Array;
  readonly terrainTransitions: readonly TerrainTransition[];
  readonly hazards: readonly RogueTilePoint[];
  readonly obstacles: readonly RogueTilePoint[];
  readonly playerSpawn: RogueTilePoint;
  readonly enemySpawns: readonly RogueTilePoint[];
  readonly doorTiles: Readonly<Record<RogueDirection, RogueTilePoint>>;
}

export interface RogueUpgradeDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly modifierKind:
    | 'sword_damage'
    | 'bow_damage'
    | 'attack_speed'
    | 'move_speed'
    | 'critical_chance'
    | 'max_health'
    | 'healing'
    | 'knockback';
  readonly baseMagnitudePermille: number;
}

export interface RogueUpgradeOffer {
  readonly slot: number;
  readonly upgradeId: string;
  readonly rarity: RogueRarity;
  readonly magnitudePermille: number;
  readonly cost: number;
}

export interface RogueEnemySpec {
  readonly kind: string;
  readonly displayName: string;
  readonly archetype: RogueEnemyArchetype;
  readonly health: number;
  readonly damage: number;
  readonly speedPermille: number;
}

export interface RogueBoonRegistry {readonly upgrades:ReadonlyMap<string,UpgradeContentDefinition>}
const BOON_MODIFIER_BY_CODE={s:'sword_damage',b:'bow_damage',a:'attack_speed',m:'move_speed',
  c:'critical_chance',x:'max_health',h:'healing',k:'knockback'} as const satisfies Readonly<Record<
    DelveBoonModifierCode,RogueUpgradeDefinition['modifierKind']>>;
const BOON_CODE_ORDER=Object.freeze(['s','b','a','m','c','x','h','k'] as const);

/** One complete active authored boon catalog. Persisted upgrade ids resolve
 * through delveBoon[0], independently of authoring definition ids. */
export function activeRogueUpgradeDefinitions(registry:RogueBoonRegistry):readonly RogueUpgradeDefinition[]|null{
  const definitions=[...registry.upgrades.values()].filter(
    (definition):definition is DelveBoonUpgradeContentDefinition=>(
      definition.retired!==true&&'delveBoon' in definition));
  if(definitions.length!==BOON_CODE_ORDER.length)return null;
  const byCode=new Map<DelveBoonModifierCode,RogueUpgradeDefinition>(),ids=new Set<string>();
  for(const definition of definitions){
    const tuple=definition.delveBoon;
    if(tuple===undefined||tuple.length!==3)return null;
    const [id,code,magnitude]=tuple;
    if(!/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(id)||ids.has(id)||byCode.has(code)
      ||BOON_MODIFIER_BY_CODE[code]===undefined||!Number.isSafeInteger(magnitude)||magnitude<1||magnitude>65_535
      ||definition.displayName.trim()===''||definition.description.trim()==='')return null;
    ids.add(id);byCode.set(code,Object.freeze({id,name:definition.displayName,description:definition.description,
      modifierKind:BOON_MODIFIER_BY_CODE[code],baseMagnitudePermille:magnitude}));
  }
  const ordered=BOON_CODE_ORDER.map(code=>byCode.get(code));
  if(ordered.some(definition=>definition===undefined))return null;
  return Object.freeze(ordered.filter((definition):definition is RogueUpgradeDefinition=>definition!==undefined));
}

const RARITY_MAGNITUDE: Readonly<Record<RogueRarity, number>> = {
  common: 1_000,
  uncommon: 1_250,
  rare: 1_550,
  epic: 1_900,
  legendary: 2_400,
};

const DIRECTION_TILES: Readonly<Record<RogueDirection, RogueTilePoint>> = {
  north: { tileX: 16, tileY: 2 },
  east: { tileX: 29, tileY: 16 },
  south: { tileX: 16, tileY: 29 },
  west: { tileX: 2, tileY: 16 },
};

const ROOM_LABELS: Readonly<Record<RogueRoomKind, string>> = {
  combat: 'Battle',
  elite: 'Elite',
  shop: 'Trader',
  recovery: 'Sanctuary',
  treasure: 'Treasure',
  boss: 'Guardian',
};

export interface RogueEnemyRegistry {
  readonly enemies: ReadonlyMap<string, EnemyContentDefinition>;
}

const ARCHETYPE_BY_CODE = {
  m: 'melee', r: 'ranged', g: 'mage', f: 'flying',
} as const satisfies Readonly<Record<EnemyDelvePoolEntry[2], RogueEnemyArchetype>>;

const enemyPoolCache = new WeakMap<object, ReadonlyMap<RogueTheme, readonly RogueEnemySpec[]> | null>();

/** Resolves one complete active authored catalog. Missing, retired, or
 * multiply-owned catalogs are unsafe to partially spawn and therefore close. */
export function activeRogueEnemyPools(
  registry: RogueEnemyRegistry,
): ReadonlyMap<RogueTheme, readonly RogueEnemySpec[]> | null {
  const cached = enemyPoolCache.get(registry);
  if (cached !== undefined) return cached;
  const providers = [...registry.enemies.values()].filter((definition) => (
    definition.retired !== true && definition.delvePools !== undefined
  ));
  if (providers.length !== 1) {
    enemyPoolCache.set(registry, null);
    return null;
  }
  const pools = new Map<RogueTheme, readonly RogueEnemySpec[]>();
  for (const [theme, entries] of providers[0]!.delvePools!) {
    if (pools.has(theme) || entries.length === 0) {
      enemyPoolCache.set(registry, null);
      return null;
    }
    pools.set(theme, Object.freeze(entries.map(([
      kind, displayName, archetype, health, damage, speedPermille,
    ]) => Object.freeze({
      kind, displayName, archetype: ARCHETYPE_BY_CODE[archetype], health, damage, speedPermille,
    }))));
  }
  if (pools.size !== 3) {
    enemyPoolCache.set(registry, null);
    return null;
  }
  const result = pools as ReadonlyMap<RogueTheme, readonly RogueEnemySpec[]>;
  enemyPoolCache.set(registry, result);
  return result;
}

function seededState(seed: number, roomNumber: number, salt: number): RngState {
  return createRng((seed ^ Math.imul(roomNumber + 1, 0x9e3779b1) ^ salt) >>> 0);
}

function take(state: RngState, maximum: number): { readonly state: RngState; readonly value: number } {
  const next = nextRng(state);
  return { state: next.state, value: maximum <= 1 ? 0 : next.value % maximum };
}

export function rogueThemeForRoom(roomNumber: number): RogueTheme {
  const room = Math.max(0, Math.min(ROGUE_RUN_ROOM_COUNT - 1, Math.trunc(roomNumber)));
  return room < ROGUE_RUN_ACT_ROOMS ? 'cave' : room < ROGUE_RUN_ACT_ROOMS * 2 ? 'volcanic' : 'dungeon';
}

export function rogueRoomIsBoss(roomNumber: number): boolean {
  return Math.max(0, Math.trunc(roomNumber)) % ROGUE_RUN_ACT_ROOMS === ROGUE_RUN_ACT_ROOMS - 1;
}

export function rogueRoomKindFor(roomNumber: number, requested: RogueRoomKind = 'combat'): RogueRoomKind {
  return rogueRoomIsBoss(roomNumber) ? 'boss' : requested === 'boss' ? 'combat' : requested;
}

function setRect(blocked: boolean[], minX: number, minY: number, maxX: number, maxY: number): void {
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    blocked[y * ROGUE_ROOM_SIZE_TILES + x] = true;
  }
}

function addObstacleRect(
  blocked: boolean[],
  obstacles: RogueTilePoint[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): void {
  setRect(blocked, minX, minY, maxX, maxY);
  obstacles.push({
    tileX: Math.floor((minX + maxX) / 2),
    tileY: Math.floor((minY + maxY) / 2),
  });
}

/** Deterministic, authored-family room generation. Randomness selects a tested
 * layout and orientation; it never invents unverified topology. */
export function generateRogueRoomLayout(seed: number, roomNumber: number, kind: RogueRoomKind): RogueRoomLayout {
  const theme = rogueThemeForRoom(roomNumber);
  const roll = take(seededState(seed, roomNumber, 0x41c64e6d), 4).value;
  const layoutIndex = kind === 'boss' ? 0 : roll;
  const blocked = Array<boolean>(ROGUE_ROOM_SIZE_TILES * ROGUE_ROOM_SIZE_TILES).fill(false);
  const obstacles: RogueTilePoint[] = [];
  const hazards: RogueTilePoint[] = [];
  setRect(blocked, 0, 0, ROGUE_ROOM_SIZE_TILES - 1, 1);
  setRect(blocked, 0, ROGUE_ROOM_SIZE_TILES - 2, ROGUE_ROOM_SIZE_TILES - 1, ROGUE_ROOM_SIZE_TILES - 1);
  setRect(blocked, 0, 2, 1, ROGUE_ROOM_SIZE_TILES - 3);
  setRect(blocked, ROGUE_ROOM_SIZE_TILES - 2, 2, ROGUE_ROOM_SIZE_TILES - 1, ROGUE_ROOM_SIZE_TILES - 3);

  if (layoutIndex === 1) {
    for (const [x, y] of [[9, 9], [22, 9], [9, 22], [22, 22]] as const) {
      addObstacleRect(blocked, obstacles, x - 1, y - 1, x + 1, y + 1);
    }
  } else if (layoutIndex === 2) {
    // Four solid bastions preserve the cross-shaped combat lanes without
    // feeding one-tile ridges into the two-course underground wall renderer.
    // Those ridges produced detached faces and slit-like columns in-game.
    addObstacleRect(blocked, obstacles, 14, 7, 17, 10);
    addObstacleRect(blocked, obstacles, 7, 14, 11, 17);
    addObstacleRect(blocked, obstacles, 20, 14, 24, 17);
    addObstacleRect(blocked, obstacles, 14, 21, 17, 24);
  } else if (layoutIndex === 3) {
    // Staggered galleries remain useful for ranged encounters, but every
    // raised mass is at least three tiles thick so its cap and wall courses
    // form a complete underground structure.
    addObstacleRect(blocked, obstacles, 8, 7, 11, 13);
    addObstacleRect(blocked, obstacles, 20, 10, 23, 16);
    addObstacleRect(blocked, obstacles, 8, 18, 11, 24);
    addObstacleRect(blocked, obstacles, 20, 19, 23, 25);
  } else if (kind === 'boss') {
    for (const [x, y] of [[7, 7], [24, 7], [7, 24], [24, 24]] as const) {
      addObstacleRect(blocked, obstacles, x - 1, y - 1, x + 1, y + 1);
    }
  }

  if (theme === 'volcanic') {
    const candidates = [[5, 15], [26, 15], [15, 7], [17, 24]] as const;
    for (const [tileX, tileY] of candidates) {
      if (blocked[tileY * ROGUE_ROOM_SIZE_TILES + tileX]) continue;
      blocked[tileY * ROGUE_ROOM_SIZE_TILES + tileX] = true;
      hazards.push({ tileX, tileY });
    }
  }

  // Every room contains one small, genuinely traversable raised dais. The
  // cellar ladder remains an interaction hatch; these paired north-facing
  // stairs are the interior rule for ordinary height movement.
  const hazardIndices = new Set(hazards.map(({ tileX, tileY }) => (
    tileY * ROGUE_ROOM_SIZE_TILES + tileX
  )));
  const elevations = Int16Array.from(blocked, (solid, index) => (
    solid && !hazardIndices.has(index) ? 1 : 0
  ));
  for (let tileY = 13; tileY <= 15; tileY += 1) {
    for (let tileX = 14; tileX <= 17; tileX += 1) {
      if (!blocked[tileY * ROGUE_ROOM_SIZE_TILES + tileX]) {
        elevations[tileY * ROGUE_ROOM_SIZE_TILES + tileX] = 1;
      }
    }
  }
  const terrainTransitions: readonly TerrainTransition[] = [15, 16].map((tileX) => ({
    contourLevel: 1,
    kind: 'stairs',
    direction: 'up',
    lowerTileX: tileX,
    lowerTileY: 16,
    upperTileX: tileX,
    upperTileY: 15,
  }));

  return {
    id: `${theme}_${kind}_${layoutIndex}`,
    width: ROGUE_ROOM_SIZE_TILES,
    height: ROGUE_ROOM_SIZE_TILES,
    blocked,
    elevations,
    terrainTransitions,
    hazards,
    obstacles,
    playerSpawn: { tileX: 16, tileY: 27 },
    enemySpawns: [
      { tileX: 8, tileY: 8 }, { tileX: 16, tileY: 8 }, { tileX: 24, tileY: 8 },
      { tileX: 8, tileY: 16 }, { tileX: 24, tileY: 16 },
      { tileX: 8, tileY: 23 }, { tileX: 16, tileY: 20 }, { tileX: 24, tileY: 23 },
    ].filter((point) => !blocked[point.tileY * ROGUE_ROOM_SIZE_TILES + point.tileX]),
    doorTiles: DIRECTION_TILES,
  };
}

function rarityFromRoll(roll: number, bonus: number): RogueRarity {
  const adjusted = Math.min(999, Math.max(0, roll + bonus));
  if (adjusted >= 990) return 'legendary';
  if (adjusted >= 950) return 'epic';
  if (adjusted >= 840) return 'rare';
  if (adjusted >= 600) return 'uncommon';
  return 'common';
}

export function rogueRarityMultiplier(rarity: RogueRarity): number {
  return RARITY_MAGNITUDE[rarity];
}

export function generateRogueUpgradeOffers(
  seed: number,
  roomNumber: number,
  kind: RogueRoomKind,
  registry:RogueBoonRegistry,
): readonly RogueUpgradeOffer[] {
  const catalog=activeRogueUpgradeDefinitions(registry);
  if(catalog===null)throw new Error('rogue_upgrade_catalog_unavailable');
  let state = seededState(seed, roomNumber, 0x7f4a7c15);
  const available = catalog.map((upgrade) => upgrade.id);
  const offers: RogueUpgradeOffer[] = [];
  const rarityBonus = kind === 'boss' ? 180 : kind === 'elite' || kind === 'treasure' ? 90 : 0;
  for (let slot = 0; slot < 3; slot += 1) {
    const selected = take(state, available.length);
    state = selected.state;
    const upgradeId = available.splice(selected.value, 1)[0]!;
    const rarityRoll = take(state, 1_000);
    state = rarityRoll.state;
    const rarity = rarityFromRoll(rarityRoll.value, rarityBonus);
    const definition = catalog.find((upgrade) => upgrade.id === upgradeId)!;
    offers.push({
      slot,
      upgradeId,
      rarity,
      magnitudePermille: Math.round(definition.baseMagnitudePermille * rogueRarityMultiplier(rarity) / 1_000),
      cost: kind === 'shop' ? 12 + roomNumber * 2 + slot * 3 : 0,
    });
  }
  return offers;
}

export function generateRogueRoomExits(seed: number, roomNumber: number): readonly RogueRoomExit[] {
  if (roomNumber >= ROGUE_RUN_ROOM_COUNT - 1) return [];
  const nextRoom = roomNumber + 1;
  const mandatoryBoss = rogueRoomIsBoss(nextRoom);
  let state = seededState(seed, roomNumber, 0x632be5ab);
  const directions: RogueDirection[] = ['north', 'east', 'west'];
  const pool: RogueRoomKind[] = nextRoom > 1
    ? ['combat', 'combat', 'shop', 'recovery', 'treasure', 'elite']
    : ['combat', 'combat', 'recovery', 'treasure'];
  const exits: RogueRoomExit[] = [];
  for (let slot = 0; slot < 3; slot += 1) {
    const directionRoll = take(state, directions.length);
    state = directionRoll.state;
    const direction = directions.splice(directionRoll.value, 1)[0]!;
    const kindRoll = take(state, pool.length);
    state = kindRoll.state;
    const destinationKind = mandatoryBoss ? 'boss' : pool[kindRoll.value]!;
    exits.push({ slot, direction, destinationKind, label: ROOM_LABELS[destinationKind], ...DIRECTION_TILES[direction] });
  }
  return exits;
}

export function rogueWaveCount(roomNumber: number, kind: RogueRoomKind): number {
  if (kind === 'boss') return 3;
  if (kind === 'elite') return 2;
  return kind === 'combat' ? 1 + Math.floor(roomNumber / ROGUE_RUN_ACT_ROOMS) : 0;
}

export function generateRogueWave(
  seed: number,
  roomNumber: number,
  kind: RogueRoomKind,
  wave: number,
  registry: RogueEnemyRegistry = bootstrapContentRegistry(),
): readonly RogueEnemySpec[] {
  const theme = rogueThemeForRoom(roomNumber);
  const pool = activeRogueEnemyPools(registry)?.get(theme);
  if (pool === undefined || pool.length === 0) throw new Error('rogue_enemy_pool_unavailable');
  let state = seededState(seed, roomNumber, 0x94d049bb ^ Math.imul(wave + 1, 0x45d9f3b));
  const baseCount = kind === 'boss' ? 1 + wave : kind === 'elite' ? 2 + wave : 3 + Math.floor(roomNumber / 2) + wave;
  const count = Math.min(8, baseCount);
  const enemies: RogueEnemySpec[] = [];
  for (let index = 0; index < count; index += 1) {
    const rolled = take(state, pool.length);
    state = rolled.state;
    const base = pool[rolled.value]!;
    const difficulty = 1_000 + roomNumber * 65 + (kind === 'elite' ? 260 : kind === 'boss' ? 520 : 0);
    enemies.push({
      ...base,
      displayName: kind === 'boss' && index === 0 ? `${theme === 'cave' ? 'Cavern' : theme === 'volcanic' ? 'Caldera' : 'Crypt'} Guardian` : base.displayName,
      health: Math.max(1, Math.round(base.health * difficulty / 1_000 * (kind === 'boss' && index === 0 ? 3 : 1))),
      damage: Math.max(1, Math.round(base.damage * difficulty / 1_000)),
    });
  }
  return enemies;
}

export function rogueUpgradeDefinition(registry:RogueBoonRegistry,id:string):RogueUpgradeDefinition|null {
  return activeRogueUpgradeDefinitions(registry)?.find((upgrade)=>upgrade.id===id)??null;
}
