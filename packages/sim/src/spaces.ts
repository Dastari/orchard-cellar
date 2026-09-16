import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
import { TILE_SIZE_FIXED } from './state.js';
import { SURVIVAL_CHUNK_TILES, survivalBiomeAt, type SurvivalBiome } from './survival-world.js';
import type { TerrainTransition } from './terrain-elevation.js';

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type SpaceGenerator = 'island' | 'mine' | 'homestead' | 'residence' | 'marlow_tent' | 'cellar' | 'delve_lobby' | 'village_interior' | 'roguelike' | 'debug_flat';
export type SpaceEnvironment = 'outdoor' | 'indoor' | 'underground';

export interface SpaceRunEntrance {
  readonly id: string;
  readonly kind: 'roguelike';
  readonly tileX: number;
  readonly tileY: number;
  readonly reachTiles: number;
}

export interface SpaceDefinition {
  /** Stable unsigned 16-bit coordinate-world identifier. Space zero is topside forever. */
  readonly spaceId: number;
  readonly name: string;
  readonly sizeTiles: number;
  readonly generator: SpaceGenerator;
  /** Controls effects that belong to the sky rather than to the space itself. */
  readonly environment: SpaceEnvironment;
  readonly ambient: 'clock' | RgbColor;
  readonly weather: boolean;
  readonly audioBed: 'estate' | 'cave' | 'homestead' | 'debug';
  /** Debug spaces remain reachable only through owner-authorized reducers. */
  readonly ownerOnly?: boolean;
  readonly runEntrances?: readonly SpaceRunEntrance[];
  readonly residenceExpansionRank?: number;
  readonly residenceArchitectureJson?: string;
  readonly homesteadSite?: { readonly worldTileX: number; readonly worldTileY: number };
  readonly rogueRoom?: {
    readonly seed: number;
    readonly roomNumber: number;
    readonly roomKind: string;
    readonly theme: string;
  };
}

/** Minimal structural contract intentionally satisfied by future homestead rows. */
export interface InstanceSpaceRow {
  readonly spaceId: number;
  readonly sizeTier?: number | undefined;
  readonly instanceKind?: string | undefined;
  readonly seed?: number | undefined;
  readonly roomNumber?: number | undefined;
  readonly roomKind?: string | undefined;
  readonly theme?: string | undefined;
  readonly ownerName?: string | undefined;
  readonly residenceSpaceId?: number | undefined;
  readonly residenceExpansionRank?: number | undefined;
  readonly residenceArchitectureJson?: string | undefined;
  readonly overworldTileX?: number | undefined;
  readonly overworldTileY?: number | undefined;
}

export const TOPSIDE_SPACE_ID = 0;
export const MARLOW_TENT_SPACE_ID = 65_533;
export const DEBUG_SPACE_ID = 65_534;
export const FIRST_HOMESTEAD_SPACE_ID = 10_000;
export const HOMESTEAD_SIZE_TILES = 32;
export const HOMESTEAD_TERRAIN_SIZE_TILES = 128;
export const HOMESTEAD_PLOT_MIN_TILE = 48;
export const HOMESTEAD_PLOT_MAX_TILE = HOMESTEAD_PLOT_MIN_TILE + HOMESTEAD_SIZE_TILES - 1;
export const HOMESTEAD_TENT_TILE = { tileX: 64, tileY: 55 } as const;
export const HOMESTEAD_ENTRY_TILE = { tileX: 64, tileY: 77 } as const;
export const HOMESTEAD_EXIT_TILE = { tileX: 64, tileY: 78 } as const;
export const HOMESTEAD_GATE_TILE = { tileX: 64, tileY: 79 } as const;
export const RESIDENCE_SIZE_TILES = 16;
export const RESIDENCE_ENTRY_TILE = { tileX: 8, tileY: 11 } as const;
export const RESIDENCE_EXIT_TILE = { tileX: 8, tileY: 12 } as const;
export const RESIDENCE_TRAPDOOR_TILE = { tileX: 11, tileY: 7 } as const;
export const RESIDENCE_BED_TILE = { tileX: 5, tileY: 6 } as const;
export const RESIDENCE_BOOKSHELF_TILE = { tileX: 10, tileY: 5 } as const;
export const MARLOW_TENT_BOOKSHELF_TILE = { tileX: 7, tileY: 5 } as const;

/** Grid cells occupied by the solid lower footprint of authored interior furniture. */
export function interiorFurnitureBlockingTiles(generator: SpaceGenerator): readonly { tileX: number; tileY: number }[] {
  if (generator !== 'residence' && generator !== 'marlow_tent') return [];
  const bookshelf = generator === 'marlow_tent' ? MARLOW_TENT_BOOKSHELF_TILE : RESIDENCE_BOOKSHELF_TILE;
  return [
    ...[-1, 0, 1].map((offset) => ({ tileX: RESIDENCE_BED_TILE.tileX + offset, tileY: RESIDENCE_BED_TILE.tileY - 1 })),
    ...[-1, 0, 1].map((offset) => ({ tileX: bookshelf.tileX + offset, tileY: bookshelf.tileY - 1 })),
  ];
}
/** The cellar is one 1024×1024-tile underground field. The initial rooms
 * occupy only its centre; progression controls how much rock may be dug. */
export const CELLAR_SIZE_TILES = 1_024;
export const CELLAR_ENTRY_TILE = { tileX: 512, tileY: 502 } as const;
export const CELLAR_EXIT_TILE = { tileX: 512, tileY: 501 } as const;
export type HomesteadBoundaryKind = 'fence' | 'gate';

const HOMESTEAD_SIZE_TIERS = [HOMESTEAD_TERRAIN_SIZE_TILES, 144, 160, 176] as const;

export const SPACES: readonly SpaceDefinition[] = BOOTSTRAP_COMPILED_CONTENT.spaces;

const STATIC_SPACES = new Map(SPACES.map((space) => [space.spaceId, space] as const));

function validSpaceId(spaceId: number): boolean {
  return Number.isInteger(spaceId) && spaceId >= 0 && spaceId <= 0xffff;
}

/** Resolves static worlds and dynamically registered instance rows through one contract. */
export function spaceDefinitionFor(
  spaceId: number,
  instanceRow?: InstanceSpaceRow | null,
): SpaceDefinition | undefined {
  if (!validSpaceId(spaceId)) return undefined;
  const staticDefinition = STATIC_SPACES.get(spaceId);
  if (staticDefinition !== undefined) return staticDefinition;
  return instanceSpaceDefinitionFor(spaceId, instanceRow);
}

/** Resolves only persisted instance rows. Live-content authority uses this
 * after consulting its revision-bound registry so a removed static definition
 * cannot silently fall back to the bootstrap pack. */
export function instanceSpaceDefinitionFor(
  spaceId: number,
  instanceRow?: InstanceSpaceRow | null,
): SpaceDefinition | undefined {
  if (!validSpaceId(spaceId)) return undefined;
  if (instanceRow === undefined || instanceRow === null) return undefined;
  if (instanceRow.spaceId === spaceId && instanceRow.instanceKind === 'roguelike') {
    const seed = instanceRow.seed;
    const roomNumber = instanceRow.roomNumber;
    const roomKind = instanceRow.roomKind;
    const theme = instanceRow.theme;
    if (seed === undefined || roomNumber === undefined || roomKind === undefined || theme === undefined) return undefined;
    return {
      spaceId,
      name: `delve_${spaceId}`,
      sizeTiles: 32,
      generator: 'roguelike',
      environment: 'underground',
      ambient: theme === 'volcanic' ? { r: 142, g: 73, b: 51 } : theme === 'dungeon'
        ? { r: 74, g: 79, b: 111 } : { r: 86, g: 92, b: 106 },
      weather: false,
      audioBed: 'cave',
      rogueRoom: { seed, roomNumber, roomKind, theme },
    };
  }
  const residenceSpaceId = instanceRow.residenceSpaceId;
  const isExterior = instanceRow.spaceId === spaceId;
  const isResidence = residenceSpaceId === spaceId;
  const isCellar = residenceSpaceId !== undefined && residenceSpaceId + 1 === spaceId;
  if (!isExterior && !isResidence && !isCellar) return undefined;
  const sizeTiles = isExterior ? HOMESTEAD_SIZE_TIERS[instanceRow.sizeTier ?? 0]
    : isResidence ? residenceEnvelopeSize(instanceRow.residenceExpansionRank) : CELLAR_SIZE_TILES;
  if (sizeTiles === undefined || sizeTiles % SURVIVAL_CHUNK_TILES !== 0) return undefined;
  const ownerName = instanceRow.ownerName?.trim();
  return {
    spaceId,
    name: ownerName
      ? `${ownerName}'s_${isExterior ? 'farm' : isResidence ? 'home' : 'cellar'}`
      : `${isExterior ? 'homestead' : isResidence ? 'residence' : 'cellar'}_${spaceId}`,
    sizeTiles,
    generator: isExterior ? 'homestead' : isResidence ? 'residence' : 'cellar',
    environment: isExterior ? 'outdoor' : isResidence ? 'indoor' : 'underground',
    ambient: isExterior ? 'clock' : isResidence ? { r: 188, g: 154, b: 118 } : { r: 100, g: 76, b: 68 },
    weather: isExterior,
    audioBed: isCellar ? 'cave' : 'homestead',
    ...(isResidence?{residenceExpansionRank:validResidenceExpansionRank(instanceRow.residenceExpansionRank),
      ...(instanceRow.residenceArchitectureJson===undefined?{}:{residenceArchitectureJson:instanceRow.residenceArchitectureJson})}:{}),
    ...(!isExterior || instanceRow.overworldTileX === undefined || instanceRow.overworldTileY === undefined ? {} : {
      homesteadSite: { worldTileX: instanceRow.overworldTileX, worldTileY: instanceRow.overworldTileY },
    }),
  };
}

export function instanceSpaceRowFor<T extends InstanceSpaceRow>(
  spaceId: number,
  rows: Iterable<T>,
): T | undefined {
  for (const row of rows) {
    if (row.spaceId === spaceId || row.residenceSpaceId === spaceId
      || (row.residenceSpaceId !== undefined && row.residenceSpaceId + 1 === spaceId)) return row;
  }
  return undefined;
}

export function validResidenceExpansionRank(rank: number | undefined): 0 | 1 | 2 {
  return rank === 1 || rank === 2 ? rank : 0;
}
export function residenceEnvelopeSize(rank: number | undefined): number {
  return validResidenceExpansionRank(rank) === 0 ? RESIDENCE_SIZE_TILES : 32;
}
/** Keep both connector mouths and halls free of construction and furniture. */
export function residenceReservedTiles(expansionRank = 0): readonly {tileX: number; tileY: number}[] {
  const tiles: {tileX: number; tileY: number}[] = [RESIDENCE_ENTRY_TILE, RESIDENCE_EXIT_TILE, RESIDENCE_TRAPDOOR_TILE,
    {tileX: RESIDENCE_TRAPDOOR_TILE.tileX, tileY: RESIDENCE_TRAPDOOR_TILE.tileY + 1}];
  const rank = validResidenceExpansionRank(expansionRank);
  if (rank >= 1) for (let y = 8; y <= 10; y++) for (let x = 12; x <= 16; x++) tiles.push({tileX: x, tileY: y});
  if (rank === 2) for (let y = 12; y <= 16; y++) for (let x = 20; x <= 22; x++) tiles.push({tileX: x, tileY: y});
  return tiles;
}
/** Monotonic purchased envelope; old room and portals never move. */
export function residencePlayableTile(tileX: number, tileY: number, expansionRank = 0): boolean {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) return false;
  const rank = validResidenceExpansionRank(expansionRank);
  if (tileX >= 3 && tileX <= 12 && tileY >= 3 && tileY <= 12) return true;
  if (rank >= 1 && ((tileX >= 16 && tileX <= 25 && tileY >= 3 && tileY <= 12)
    || (tileX >= 13 && tileX <= 15 && tileY >= 8 && tileY <= 10))) return true;
  return rank === 2 && ((tileX >= 16 && tileX <= 25 && tileY >= 16 && tileY <= 25)
    || (tileX >= 20 && tileX <= 22 && tileY >= 13 && tileY <= 15));
}

export interface CaveExcavationGrid {
  readonly width: number;
  readonly height: number;
  /** One means hollow/walkable; zero means untouched solid rock. */
  readonly dug: Uint8Array;
}

export function generateStarterCellarExcavation(): CaveExcavationGrid {
  const width = CELLAR_SIZE_TILES;
  const height = CELLAR_SIZE_TILES;
  const dug = new Uint8Array(width * height);
  const carve = (minX: number, minY: number, maxX: number, maxY: number): void => {
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) dug[y * width + x] = 1;
    }
  };
  // A grid-first Dungeon Keeper-style layout: rooms and connecting corridors
  // only mark excavation. Rendering derives every floor/wall/corner afterward.
  // Every rectangle is aligned to the 2x2 macro-cell grid (even first cell,
  // even size), so the starter cave shares the excavation invariant: no rock
  // or floor feature is ever one cell thick, and no boundary run is odd.
  const offset = (CELLAR_SIZE_TILES - 32) / 2;
  carve(10 + offset, 2 + offset, 21 + offset, 9 + offset);   // ladder chamber
  carve(8 + offset, 8 + offset, 23 + offset, 17 + offset);   // central hall
  carve(2 + offset, 12 + offset, 11 + offset, 21 + offset);  // western room
  carve(20 + offset, 14 + offset, 29 + offset, 25 + offset); // eastern room
  carve(10 + offset, 18 + offset, 21 + offset, 27 + offset); // southern cellar
  return { width, height, dug };
}

const STARTER_CELLAR_EXCAVATION = generateStarterCellarExcavation();

/** The authoritative residence/cellar portal and authored wall ladder own the
 * crossing. Do not also generate the terrain-family `ladder` frame here:
 * Cave_Floor_Ladder.png is a circular floor manhole, not the wall ladder used
 * by this room. */
export function starterCellarTerrainTransitions(): readonly TerrainTransition[] {
  return [];
}

/** The cellar crossing is a wall ladder, not a floor hatch. The generic
 * three-by-three portal box reached a tile to either side and diagonally
 * behind, so it shadowed chests, crops and furniture parked beside the ladder
 * and answered every prompt with CLIMB UP. Standing in the ladder's own column
 * — on its base tile or the single tile in front of it — is the whole reach. */
export function cellarLadderPortal(kind: string): boolean {
  return kind.startsWith('cellar_exit:');
}

/** One physical reach contract for the ladder prompt and portal authority. */
export function cellarLadderApproachClear(
  position: { readonly x: number; readonly y: number },
  portal: { readonly fromTileX: number; readonly fromTileY: number },
): boolean {
  const tileX = Math.floor(position.x / TILE_SIZE_FIXED);
  const tileY = Math.floor(position.y / TILE_SIZE_FIXED);
  return tileX === portal.fromTileX
    && (tileY === portal.fromTileY || tileY === portal.fromTileY + 1);
}

/** Collision and presentation share this single excavation mask. */
export function cellarPlayableTile(tileX: number, tileY: number): boolean {
  return tileX >= 0 && tileY >= 0
    && tileX < STARTER_CELLAR_EXCAVATION.width && tileY < STARTER_CELLAR_EXCAVATION.height
    && STARTER_CELLAR_EXCAVATION.dug[tileY * STARTER_CELLAR_EXCAVATION.width + tileX] === 1;
}

/** Enlarges roughly eight overworld tiles into the starter farm while keeping
 * a safe central clearing and its permanent north/south path. */
export function homesteadBiomeAt(
  worldSeed: number,
  site: { readonly worldTileX: number; readonly worldTileY: number },
  tileX: number,
  tileY: number,
  sizeTiles = HOMESTEAD_SIZE_TILES,
): SurvivalBiome {
  if (tileY < sizeTiles && Math.abs(tileX - HOMESTEAD_ENTRY_TILE.tileX) <= 3
    && tileY >= HOMESTEAD_TENT_TILE.tileY - 1) return 'plains';
  const center = Math.floor(sizeTiles / 2);
  return survivalBiomeAt(
    worldSeed,
    site.worldTileX + Math.floor((tileX - center) / 4),
    site.worldTileY + Math.floor((tileY - center) / 4),
  );
}

export function homesteadPathTiles(sizeTiles = HOMESTEAD_SIZE_TILES): readonly { readonly tileX: number; readonly tileY: number }[] {
  const tiles: { tileX: number; tileY: number }[] = [];
  void sizeTiles;
  for (let tileY = HOMESTEAD_PLOT_MAX_TILE - 3; tileY <= HOMESTEAD_PLOT_MAX_TILE; tileY += 1) {
    for (let tileX = HOMESTEAD_EXIT_TILE.tileX - 1; tileX <= HOMESTEAD_EXIT_TILE.tileX + 1; tileX += 1) {
      tiles.push({ tileX, tileY });
    }
  }
  return tiles;
}

export interface HomesteadPlotBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
}

/** Land tiers grow north and equally east/west while keeping the established
 * southern gate, entry path, residence and every player-authored coordinate
 * fixed. The coordinate world's extra margin is scenery, not buildable land. */
export function homesteadPlotBounds(
  sizeTiles = HOMESTEAD_TERRAIN_SIZE_TILES,
): HomesteadPlotBounds {
  const expansion = Math.max(0, sizeTiles - HOMESTEAD_TERRAIN_SIZE_TILES);
  const halfSideExpansion = Math.floor(expansion / 2);
  return {
    minimumX: HOMESTEAD_PLOT_MIN_TILE - halfSideExpansion,
    maximumX: HOMESTEAD_PLOT_MAX_TILE + halfSideExpansion,
    minimumY: HOMESTEAD_PLOT_MIN_TILE - expansion,
    maximumY: HOMESTEAD_PLOT_MAX_TILE,
  };
}

/** Generated one tile inside the immutable terrain edge so the complete
 * wooden boundary remains visible. The open southern gate is the portal. */
export function homesteadBoundaryTiles(
  sizeTiles = HOMESTEAD_TERRAIN_SIZE_TILES,
): readonly { readonly tileX: number; readonly tileY: number; readonly kind: HomesteadBoundaryKind }[] {
  const bounds = homesteadPlotBounds(sizeTiles);
  const rows: { tileX: number; tileY: number; kind: HomesteadBoundaryKind }[] = [];
  for (let tileX = bounds.minimumX; tileX <= bounds.maximumX; tileX += 1) {
    rows.push({ tileX, tileY: bounds.minimumY, kind: 'fence' });
    rows.push({ tileX, tileY: bounds.maximumY, kind: tileX === HOMESTEAD_GATE_TILE.tileX ? 'gate' : 'fence' });
  }
  for (let tileY = bounds.minimumY + 1; tileY < bounds.maximumY; tileY += 1) {
    rows.push({ tileX: bounds.minimumX, tileY, kind: 'fence' });
    rows.push({ tileX: bounds.maximumX, tileY, kind: 'fence' });
  }
  return rows;
}

export function homesteadPlayableTile(
  tileX: number,
  tileY: number,
  sizeTiles = HOMESTEAD_TERRAIN_SIZE_TILES,
): boolean {
  const bounds = homesteadPlotBounds(sizeTiles);
  return tileX > bounds.minimumX && tileX < bounds.maximumX
    && tileY > bounds.minimumY && tileY < bounds.maximumY;
}

export function homesteadPortalName(kind: string): string | null {
  if (!kind.startsWith('homestead_enter:')) return null;
  const name = kind.slice('homestead_enter:'.length).trim();
  return name.length === 0 ? null : name;
}

export function homesteadTentFootprint(
  anchorX: number,
  anchorY: number,
  large: boolean,
): { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } {
  return large
    ? { minX: anchorX - 2, minY: anchorY - 5, maxX: anchorX + 2, maxY: anchorY - 1 }
    : { minX: anchorX - 1, minY: anchorY - 2, maxX: anchorX + 1, maxY: anchorY - 1 };
}

/** The deed target is the tent's southern anchor. Its preview and authority
 * reserve the complete compact tent plus the grass-blended entrance row. */
export function homesteadMarkerPlacementTiles(
  anchorX: number,
  anchorY: number,
): readonly { readonly tileX: number; readonly tileY: number }[] {
  const tiles: { tileX: number; tileY: number }[] = [];
  for (let tileY = anchorY - 2; tileY <= anchorY + 1; tileY += 1) {
    for (let tileX = anchorX - 1; tileX <= anchorX + 1; tileX += 1) tiles.push({ tileX, tileY });
  }
  return tiles;
}
