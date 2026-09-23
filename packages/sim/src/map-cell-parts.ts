import type { TerrainOverride } from './map-document.js';
import type { RaisedTerrainRole } from './raised-terrain-autotile.js';
import { TERRAIN_SURFACE_FAMILIES, TERRAIN_SURFACE_FAMILY_IDS } from './terrain-tilesets.js';

/**
 * Cell part stack (wiki: Studio/Map Editor, Cell parts). A cell's terrain is an ordered list of
 * semantic parts; each part may carry an exact appearance override. Smart
 * resolution stays the default: a part without `exact` does not change the
 * resolved frame. The shape is intentionally cell-local (no map dimensions or
 * whole-map indices), so the same value can later live inside a chunk record.
 */
export const CELL_PART_BASE_SLOTS = ['surface', 'path', 'farmland', 'water'] as const;
export type CellPartBaseSlot = typeof CELL_PART_BASE_SLOTS[number];
export type CellPartSlot = CellPartBaseSlot | `contour:${number}` | `fringe:${string}`;

export interface CellPartExact {
  /** Frame index in the slot's source atlas. */
  readonly frame: number;
  /** Clockwise quarter turns about the tile centre; omitted means none. */
  readonly quarterTurns?: 1 | 2 | 3;
  /** Horizontal mirror applied before rotation; omitted means none. */
  readonly flipX?: true;
}

export interface CellPart {
  readonly slot: CellPartSlot;
  /** Rule family id. For contour slots this is the cliff family. */
  readonly family?: string;
  /** Contour slots only: the semantic raised-terrain role being replaced. */
  readonly role?: RaisedTerrainRole;
  readonly exact?: CellPartExact;
}

export const MAP_CELL_PARTS_MAXIMUM = 8;
/** Matches the world's non-negative integer bound for legacy `frameIndex`, so
 * every publishable legacy override migrates to a parseable part. */
export const CELL_PART_FRAME_MAXIMUM = 0x7fff_ffff;
const CONTOUR_LEVEL_LIMIT = 32;
const PART_ID = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const CONTOUR_SLOT = /^contour:(-?(?:0|[1-9][0-9]?))$/u;
const FRINGE_SLOT = /^fringe:([a-z0-9]+(?:_[a-z0-9]+)*)$/u;
const ROLE = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/u;
const PART_KEYS = new Set(['slot', 'family', 'role', 'exact']);
const EXACT_KEYS = new Set(['frame', 'quarterTurns', 'flipX']);

export function cellPartContourLevel(slot: string): number | null {
  const match = CONTOUR_SLOT.exec(slot);
  if (match === null) return null;
  const level = Number(match[1]);
  return Number.isInteger(level) && Math.abs(level) <= CONTOUR_LEVEL_LIMIT && !Object.is(level, -0)
    ? level : null;
}

export function cellPartSlotValid(slot: unknown): slot is CellPartSlot {
  if (typeof slot !== 'string' || slot.length > 64) return false;
  return (CELL_PART_BASE_SLOTS as readonly string[]).includes(slot)
    || cellPartContourLevel(slot) !== null
    || FRINGE_SLOT.test(slot);
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function parseExact(value: unknown): CellPartExact | null {
  const candidate = plainRecord(value);
  if (candidate === null || Object.keys(candidate).some((key) => !EXACT_KEYS.has(key))) return null;
  const frame = candidate['frame'];
  const quarterTurns = candidate['quarterTurns'];
  const flipX = candidate['flipX'];
  if (!Number.isInteger(frame) || (frame as number) < 0 || (frame as number) > CELL_PART_FRAME_MAXIMUM) return null;
  if (quarterTurns !== undefined && quarterTurns !== 1 && quarterTurns !== 2 && quarterTurns !== 3) return null;
  if (flipX !== undefined && flipX !== true) return null;
  return {
    frame: frame as number,
    ...(quarterTurns === undefined ? {} : { quarterTurns: quarterTurns as 1 | 2 | 3 }),
    ...(flipX === true ? { flipX: true as const } : {}),
  };
}

/** Strict, canonicalizing parser for one part. Unknown keys, empty parts and
 * roles on non-contour slots are rejected rather than repaired. */
export function parseCellPart(value: unknown): CellPart | null {
  const candidate = plainRecord(value);
  if (candidate === null || Object.keys(candidate).some((key) => !PART_KEYS.has(key))) return null;
  const { slot, family, role } = candidate;
  if (!cellPartSlotValid(slot)) return null;
  if (family !== undefined && (typeof family !== 'string' || family.length > 64 || !PART_ID.test(family))) return null;
  if (role !== undefined && (typeof role !== 'string' || role.length > 64 || !ROLE.test(role)
    || cellPartContourLevel(slot) === null)) return null;
  const exact = candidate['exact'] === undefined ? undefined : parseExact(candidate['exact']);
  if (exact === null) return null;
  if (family === undefined && role === undefined && exact === undefined) return null;
  return canonicalCellPart({
    slot,
    ...(family === undefined ? {} : { family: family as string }),
    ...(role === undefined ? {} : { role: role as RaisedTerrainRole }),
    ...(exact === undefined ? {} : { exact }),
  });
}

/** Strict list parser. Slots are unique within a cell and at most one contour
 * part may exist, because the runtime substitutes one contour per cell. */
export function parseCellParts(value: unknown): readonly CellPart[] | null {
  if (!Array.isArray(value) || value.length > MAP_CELL_PARTS_MAXIMUM) return null;
  const parts: CellPart[] = [];
  for (const entry of value) {
    const part = parseCellPart(entry);
    if (part === null || parts.some(({ slot }) => slot === part.slot)) return null;
    parts.push(part);
  }
  if (parts.filter(({ slot }) => cellPartContourLevel(slot) !== null).length > 1) return null;
  return parts;
}

/** Stable key order for canonical JSON. Order within the list is authored
 * draw order and is preserved. */
export function canonicalCellPart(part: CellPart): CellPart {
  return {
    slot: part.slot,
    ...(part.family === undefined ? {} : { family: part.family }),
    ...(part.role === undefined ? {} : { role: part.role }),
    ...(part.exact === undefined ? {} : {
      exact: {
        frame: part.exact.frame,
        ...(part.exact.quarterTurns === undefined ? {} : { quarterTurns: part.exact.quarterTurns }),
        ...(part.exact.flipX === true ? { flipX: true as const } : {}),
      },
    }),
  };
}

export function cellPartIsEmpty(part: CellPart): boolean {
  return part.family === undefined && part.role === undefined && part.exact === undefined;
}

export function canonicalCellParts(parts: readonly CellPart[] | undefined): readonly CellPart[] | undefined {
  if (parts === undefined) return undefined;
  const canonical = parts.filter((part) => !cellPartIsEmpty(part)).map(canonicalCellPart);
  return canonical.length === 0 ? undefined : canonical;
}

/** Lossless legacy mapping: `terrainOverride` is a contour part whose
 * `frameIndex` becomes `exact.frame`. */
export function terrainOverrideToCellPart(override: TerrainOverride): CellPart {
  return canonicalCellPart({
    slot: `contour:${override.contourLevel}`,
    ...(override.family === undefined ? {} : { family: override.family }),
    ...(override.role === undefined ? {} : { role: override.role }),
    ...(override.frameIndex === undefined ? {} : { exact: { frame: override.frameIndex } }),
  });
}

export function cellPartToTerrainOverride(part: CellPart): TerrainOverride | null {
  const contourLevel = cellPartContourLevel(part.slot);
  if (contourLevel === null) return null;
  return {
    contourLevel,
    ...(part.role === undefined ? {} : { role: part.role }),
    ...(part.exact === undefined ? {} : { frameIndex: part.exact.frame }),
    ...(part.family === undefined ? {} : { family: part.family }),
  };
}

export function contourOverrideFromCellParts(parts: readonly CellPart[] | undefined): TerrainOverride | null {
  const contour = parts?.find(({ slot }) => cellPartContourLevel(slot) !== null);
  return contour === undefined ? null : cellPartToTerrainOverride(contour);
}

/** Dual-read view: authored parts plus the legacy override as a contour part.
 * Parsing guarantees the two forms never both describe a contour. */
export function effectiveCellParts(cell: {
  readonly parts?: readonly CellPart[];
  readonly terrainOverride?: TerrainOverride;
} | undefined): readonly CellPart[] {
  if (cell === undefined) return [];
  const legacy = cell.terrainOverride === undefined ? [] : [terrainOverrideToCellPart(cell.terrainOverride)];
  return [...legacy, ...(cell.parts ?? [])];
}

/** Non-contour parts carrying an exact appearance override. Contour parts are
 * compiled through the existing per-cell contour substitution instead. */
export function exactAppearanceParts(parts: readonly CellPart[] | undefined): readonly CellPart[] {
  return (parts ?? []).filter((part) => part.exact !== undefined && cellPartContourLevel(part.slot) === null);
}

export function upsertCellPart(parts: readonly CellPart[] | undefined, part: CellPart): readonly CellPart[] {
  const current = [...(parts ?? [])];
  const index = current.findIndex(({ slot }) => slot === part.slot);
  if (index >= 0) current[index] = canonicalCellPart(part);
  else current.push(canonicalCellPart(part));
  return current.filter((entry) => !cellPartIsEmpty(entry));
}

/** "Revert to smart": drop only the exact appearance for one slot. */
export function revertCellPartExact(parts: readonly CellPart[] | undefined, slot: CellPartSlot): readonly CellPart[] {
  return (parts ?? []).map((part) => {
    if (part.slot !== slot) return part;
    return {
      slot: part.slot,
      ...(part.family === undefined ? {} : { family: part.family }),
      ...(part.role === undefined ? {} : { role: part.role }),
    };
  }).filter((part) => !cellPartIsEmpty(part));
}

/** Source atlas for exact frames in a non-contour slot. Shared by Studio
 * (which maps an Exact palette tile to a part) and the ground renderer (which
 * draws the part), so both sides agree on what a part means. */
export interface CellPartExactAsset {
  readonly slot: CellPartSlot;
  readonly family?: string;
  readonly assetName: string;
}

const CELL_PART_EXACT_ASSETS: readonly CellPartExactAsset[] = Object.freeze([
  { slot: 'path', assetName: 'tile_cf_path' },
  { slot: 'farmland', assetName: 'tile_cf_farmland' },
  { slot: 'water', assetName: 'tile_cf_freshwater' },
  { slot: 'surface', family: 'beach', assetName: 'tile_cf_beach' },
  { slot: 'surface', family: 'desert_shore', assetName: 'tile_cf_desert_shore' },
  ...TERRAIN_SURFACE_FAMILY_IDS.map((id) => ({
    slot: `fringe:${id}` as const, assetName: TERRAIN_SURFACE_FAMILIES[id].sheetAssetId,
  })),
  { slot: 'fringe:beach_inset', assetName: 'tile_cf_beach_inset' },
  { slot: 'fringe:desert_shore_inset', assetName: 'tile_cf_desert_shore_inset' },
  { slot: 'fringe:freshwater_inset', assetName: 'tile_cf_freshwater_inset' },
  { slot: 'fringe:farmland_grass_inset', assetName: 'tile_cf_farmland_grass_inset' },
  { slot: 'fringe:savanna_grass_inset', assetName: 'tile_cf_savanna_grass_inset' },
  { slot: 'fringe:desert_grass_edge', assetName: 'tile_cf_desert_grass_edge' },
  { slot: 'fringe:desert_grass_inset', assetName: 'tile_cf_desert_grass_inset' },
]);

/** Audited byte-identical alias banks (see Studio exact-tile-palette). */
const CELL_PART_ASSET_ALIASES: Readonly<Record<string, string>> = Object.freeze({ tile_path: 'tile_cf_path' });

export function cellPartExactAssets(): readonly CellPartExactAsset[] {
  return CELL_PART_EXACT_ASSETS;
}

/** Asset drawn for an exact part, or null when the slot/family has no exact
 * source (such parts are kept but reported by validation). A `surface` part
 * without a family resolves to the renderer's smart base asset instead. */
export function cellPartExactAssetName(part: Pick<CellPart, 'slot' | 'family'>): string | null {
  return CELL_PART_EXACT_ASSETS.find((entry) => entry.slot === part.slot
    && (entry.family ?? undefined) === (part.slot === 'surface' ? part.family : entry.family))?.assetName ?? null;
}

/** Terrain component that an atlas belongs to, or null when the asset is a
 * genuine decoration and must remain an object. */
export function cellPartForTerrainAsset(assetName: string): Pick<CellPart, 'slot' | 'family'> | null {
  const canonical = CELL_PART_ASSET_ALIASES[assetName] ?? assetName;
  const entry = CELL_PART_EXACT_ASSETS.find((candidate) => candidate.assetName === canonical);
  return entry === undefined ? null
    : { slot: entry.slot, ...(entry.family === undefined ? {} : { family: entry.family }) };
}
