import {
  PROCEDURAL_TERRAIN_GENERATOR_VERSION,
  PROCEDURAL_TERRAIN_MAX_ELEVATION,
  PROCEDURAL_WORLD_CHUNK_TILES,
  SURVIVAL_BIOMES,
  floorDiv,
  normalizeProceduralWorldSeed,
  proceduralTerrainBiomePreviewRgba,
  sampleProceduralTerrainAt,
  sampleProceduralTerrainChunk,
  sampleProceduralTerrainOverview,
  signedTileKey,
  type ProceduralTerrainSurface,
  type ProceduralTerrainBiome,
  type ProceduralWorldSeed,
  type SemanticTerrainCell,
  type SemanticTerrainChunk,
  type SemanticTerrainSample,
  type SemanticTerrainTrace,
  type SurvivalBiome,
} from "@orchard/sim";
import {
  terrainProjectedRowsPerLevel,
  type TerrainArray,
} from "../render/terrain.js";

export const PROCEDURAL_EDITOR_SPACE_ID = 4_300_001;
export const PROCEDURAL_EDITOR_RADIUS_CHUNKS = 12;

/** A semantic chunk's normal halo is sized for adjacency. The editor also
 * projects every elevation plane north by the height of its cliff face, so a
 * shorter apron exposes its artificial zero-height boundary inside the
 * generated chunk (the repeated southern cliff rows). Keep that boundary at
 * least one tile beyond the deepest possible projection. */
export const PROCEDURAL_EDITOR_COMPOSITION_HALO_TILES =
  PROCEDURAL_TERRAIN_MAX_ELEVATION * terrainProjectedRowsPerLevel() + 1;

export interface ProceduralEditorChunkPoint {
  readonly chunkX: number;
  readonly chunkY: number;
}

export interface ProceduralEditorTilePoint {
  readonly tileX: number;
  readonly tileY: number;
}

export interface ProceduralEditorPreview {
  readonly seed: number;
  readonly normalizedSeed: number;
  readonly generatorVersion: number;
  /** Bounded renderer composition origin. It slides under an unbounded signed
   * world and is never exposed as a map boundary. */
  readonly minChunkX: number;
  readonly minChunkY: number;
  readonly chunkColumns: number;
  readonly chunkRows: number;
  readonly compositionRevision: number;
  readonly generated: ReadonlyMap<string, SemanticTerrainChunk>;
}

export interface ProceduralEditorOverviewRaster {
  readonly width: number;
  readonly height: number;
  readonly stepTiles: number;
  readonly pixels: Uint8ClampedArray;
}

function chunkKey(chunkX: number, chunkY: number): string {
  return signedTileKey(chunkX, chunkY);
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${label} must be a positive integer`);
}

/** Convert legacy text seeds to the numeric FNV input which produces the same
 * normalized generator seed. Decimal u32 strings remain literal. */
export function canonicalProceduralEditorSeed(
  seed: ProceduralWorldSeed,
): number {
  if (typeof seed === "number") {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new RangeError("seed must be an unsigned 32-bit integer");
    }
    return seed;
  }
  if (/^\d+$/u.test(seed)) {
    const numeric = Number(seed);
    if (Number.isSafeInteger(numeric) && numeric <= 0xffff_ffff) return numeric;
    throw new RangeError("seed must be an unsigned 32-bit integer");
  }
  if (seed.length === 0) throw new Error("seed string must not be empty");
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createProceduralEditorPreview(options: {
  readonly seed: ProceduralWorldSeed;
  readonly generatorVersion?: number;
  readonly radiusChunks?: number;
}): ProceduralEditorPreview {
  const generatorVersion =
    options.generatorVersion ?? PROCEDURAL_TERRAIN_GENERATOR_VERSION;
  const radiusChunks = options.radiusChunks ?? PROCEDURAL_EDITOR_RADIUS_CHUNKS;
  requirePositiveInteger(generatorVersion, "generatorVersion");
  if (!Number.isSafeInteger(radiusChunks) || radiusChunks < 1) {
    throw new RangeError("radiusChunks must be a positive integer");
  }
  const seed = canonicalProceduralEditorSeed(options.seed);
  return {
    seed,
    normalizedSeed: normalizeProceduralWorldSeed(seed),
    generatorVersion,
    minChunkX: -radiusChunks,
    minChunkY: -radiusChunks,
    chunkColumns: radiusChunks * 2 + 1,
    chunkRows: radiusChunks * 2 + 1,
    compositionRevision: 0,
    generated: new Map(),
  };
}

export function recenterProceduralEditorPreview(
  preview: ProceduralEditorPreview,
  centerChunkX: number,
  centerChunkY: number,
): ProceduralEditorPreview {
  if (
    !Number.isSafeInteger(centerChunkX) ||
    !Number.isSafeInteger(centerChunkY)
  ) {
    throw new RangeError(
      "composition center must use safe integer chunk coordinates",
    );
  }
  const minChunkX = centerChunkX - Math.floor(preview.chunkColumns / 2);
  const minChunkY = centerChunkY - Math.floor(preview.chunkRows / 2);
  if (minChunkX === preview.minChunkX && minChunkY === preview.minChunkY)
    return preview;
  return {
    ...preview,
    minChunkX,
    minChunkY,
    compositionRevision: preview.compositionRevision + 1,
  };
}

export function proceduralEditorPreviewWidth(
  preview: ProceduralEditorPreview,
): number {
  return preview.chunkColumns * PROCEDURAL_WORLD_CHUNK_TILES;
}

export function proceduralEditorPreviewHeight(
  preview: ProceduralEditorPreview,
): number {
  return preview.chunkRows * PROCEDURAL_WORLD_CHUNK_TILES;
}

export function proceduralEditorChunkInBounds(
  _preview: ProceduralEditorPreview,
  chunkX: number,
  chunkY: number,
): boolean {
  return Number.isSafeInteger(chunkX) && Number.isSafeInteger(chunkY);
}

export function proceduralEditorChunkGenerated(
  preview: ProceduralEditorPreview,
  chunkX: number,
  chunkY: number,
): boolean {
  return preview.generated.has(chunkKey(chunkX, chunkY));
}

export function generateProceduralEditorChunk(
  preview: ProceduralEditorPreview,
  chunkX: number,
  chunkY: number,
): ProceduralEditorPreview {
  if (!proceduralEditorChunkInBounds(preview, chunkX, chunkY)) {
    throw new RangeError(
      `Chunk ${chunkX},${chunkY} must use safe integer coordinates`,
    );
  }
  const key = chunkKey(chunkX, chunkY);
  if (preview.generated.has(key)) return preview;
  const generated = new Map(preview.generated);
  generated.set(
    key,
    sampleProceduralTerrainChunk({
      seed: preview.seed,
      generatorVersion: preview.generatorVersion,
      chunkX,
      chunkY,
      halo: PROCEDURAL_EDITOR_COMPOSITION_HALO_TILES,
    }),
  );
  return {
    ...preview,
    generated,
    compositionRevision: preview.compositionRevision + 1,
  };
}

export function proceduralEditorLocalToWorldTile(
  preview: ProceduralEditorPreview,
  localTileX: number,
  localTileY: number,
): ProceduralEditorTilePoint {
  return {
    tileX: preview.minChunkX * PROCEDURAL_WORLD_CHUNK_TILES + localTileX,
    tileY: preview.minChunkY * PROCEDURAL_WORLD_CHUNK_TILES + localTileY,
  };
}

export function proceduralEditorWorldToLocalTile(
  preview: ProceduralEditorPreview,
  worldTileX: number,
  worldTileY: number,
): ProceduralEditorTilePoint {
  return {
    tileX: worldTileX - preview.minChunkX * PROCEDURAL_WORLD_CHUNK_TILES,
    tileY: worldTileY - preview.minChunkY * PROCEDURAL_WORLD_CHUNK_TILES,
  };
}

export function proceduralEditorChunkAtLocalTile(
  preview: ProceduralEditorPreview,
  localTileX: number,
  localTileY: number,
): ProceduralEditorChunkPoint {
  const world = proceduralEditorLocalToWorldTile(
    preview,
    localTileX,
    localTileY,
  );
  return {
    chunkX: floorDiv(world.tileX, PROCEDURAL_WORLD_CHUNK_TILES),
    chunkY: floorDiv(world.tileY, PROCEDURAL_WORLD_CHUNK_TILES),
  };
}

export function proceduralEditorGeneratedChunkKeys(
  preview: ProceduralEditorPreview,
): readonly string[] {
  return [...preview.generated.keys()].sort();
}

function rgbaHex(red: number, green: number, blue: number): string {
  return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
}

/** Low-detail seed overview used behind the unmaterialized-chunk veil. It
 * communicates likely biome without creating a payload or durable chunk. */
export function proceduralEditorChunkPreviewColors(
  preview: ProceduralEditorPreview,
): ReadonlyMap<string, string> {
  const colors = new Map<string, string>();
  for (let offsetY = 0; offsetY < preview.chunkRows; offsetY += 1) {
    for (let offsetX = 0; offsetX < preview.chunkColumns; offsetX += 1) {
      const chunkX = preview.minChunkX + offsetX;
      const chunkY = preview.minChunkY + offsetY;
      const sample = sampleProceduralTerrainAt(
        preview.seed,
        preview.generatorVersion,
        chunkX * PROCEDURAL_WORLD_CHUNK_TILES +
          Math.floor(PROCEDURAL_WORLD_CHUNK_TILES / 2),
        chunkY * PROCEDURAL_WORLD_CHUNK_TILES +
          Math.floor(PROCEDURAL_WORLD_CHUNK_TILES / 2),
      );
      const [red, green, blue] = proceduralTerrainBiomePreviewRgba(sample);
      colors.set(chunkKey(chunkX, chunkY), rgbaHex(red, green, blue));
    }
  }
  return colors;
}

export function proceduralEditorChunkPreviewColor(
  preview: ProceduralEditorPreview,
  chunkX: number,
  chunkY: number,
): string {
  const sample = sampleProceduralTerrainAt(
    preview.seed,
    preview.generatorVersion,
    chunkX * PROCEDURAL_WORLD_CHUNK_TILES +
      Math.floor(PROCEDURAL_WORLD_CHUNK_TILES / 2),
    chunkY * PROCEDURAL_WORLD_CHUNK_TILES +
      Math.floor(PROCEDURAL_WORLD_CHUNK_TILES / 2),
  );
  const [red, green, blue] = proceduralTerrainBiomePreviewRgba(sample);
  return rgbaHex(red, green, blue);
}

/** A one-pixel-per-world-tile semantic preview for an unmaterialized chunk.
 * Sampling this raster never creates a chunk payload or makes it durable. */
export function proceduralEditorChunkPreviewRaster(
  preview: ProceduralEditorPreview,
  chunkX: number,
  chunkY: number,
): ProceduralEditorOverviewRaster {
  if (!Number.isSafeInteger(chunkX) || !Number.isSafeInteger(chunkY)) {
    throw new RangeError("chunk coordinates must be safe integers");
  }
  return proceduralEditorOverviewRaster(preview, 1, {
    minTileX: chunkX * PROCEDURAL_WORLD_CHUNK_TILES,
    minTileY: chunkY * PROCEDURAL_WORLD_CHUNK_TILES,
    width: PROCEDURAL_WORLD_CHUNK_TILES,
    height: PROCEDURAL_WORLD_CHUNK_TILES,
  });
}

/** A cached seed-map LOD for the editor. One pixel represents a small square
 * of world tiles; no durable chunk is generated by producing this raster. */
export function proceduralEditorOverviewRaster(
  preview: ProceduralEditorPreview,
  stepTiles = 2,
  bounds?: {
    readonly minTileX: number;
    readonly minTileY: number;
    readonly width: number;
    readonly height: number;
  },
): ProceduralEditorOverviewRaster {
  requirePositiveInteger(stepTiles, "stepTiles");
  const tileWidth = bounds?.width ?? proceduralEditorPreviewWidth(preview);
  const tileHeight = bounds?.height ?? proceduralEditorPreviewHeight(preview);
  requirePositiveInteger(tileWidth, "overview width");
  requirePositiveInteger(tileHeight, "overview height");
  const width = Math.ceil(tileWidth / stepTiles);
  const height = Math.ceil(tileHeight / stepTiles);
  const overview = sampleProceduralTerrainOverview({
    seed: preview.seed,
    generatorVersion: preview.generatorVersion,
    minTileX:
      bounds?.minTileX ?? preview.minChunkX * PROCEDURAL_WORLD_CHUNK_TILES,
    minTileY:
      bounds?.minTileY ?? preview.minChunkY * PROCEDURAL_WORLD_CHUNK_TILES,
    columns: width,
    rows: height,
    stepTiles,
  });
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < overview.samples.length; index += 1) {
    const sample = overview.samples[index];
    if (sample === undefined) continue;
    const color = proceduralTerrainBiomePreviewRgba(sample);
    const offset = index * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }
  return { width, height, stepTiles, pixels };
}

export function proceduralEditorSurvivalBiomeFor(
  cell: SemanticTerrainSample,
  cardinalNeighbors: readonly (SemanticTerrainSample | undefined)[],
): SurvivalBiome {
  if (cell.waterKind === "ocean") return "water";
  if (cell.waterKind === "waterfall") return "waterfall";
  if (cell.waterKind !== "none")
    return cell.biome === "desert" ? "oasis_water" : "freshwater";
  // Desert samples also use the semantic `sand` surface. Resolve the biome
  // before generic coast sand or the preview silently substitutes the beach
  // atlas and its grass fringe for every desert family.
  if (cell.biome === "desert") {
    return cardinalNeighbors.some((neighbor) => neighbor?.waterKind !== "none")
      ? "desert_shore"
      : "desert";
  }
  if (cell.surface === "sand" || cell.biome === "coast") return "beach";
  if (cell.biome === "savanna") return "savanna";
  if (cell.biome === "woodland" || cell.biome === "shroomlands")
    return "forest";
  if (cell.biome === "meadow" || cell.biome === "wetland") return "meadow";
  if (cell.biome === "highland" || cell.biome === "cold_highland")
    return "highland";
  if (cell.biome === "mountain" || cell.biome === "volcanic") return "ridge";
  return "plains";
}

function surfaceRole(
  surface: ProceduralTerrainSurface,
): "grass" | "sand" | "stone" | "water" | "dirt" {
  if (surface === "deep_water" || surface === "water") return "water";
  if (surface === "sand") return "sand";
  if (surface === "stone" || surface === "volcanic_rock") return "stone";
  if (surface === "mud") return "dirt";
  return "grass";
}

function writeSample(
  preview: ProceduralEditorPreview,
  sample: SemanticTerrainSample,
  biome: SurvivalBiome,
  biomes: Uint8Array,
  blocked: boolean[],
  elevations: Uint8Array,
): void {
  const local = proceduralEditorWorldToLocalTile(
    preview,
    sample.tileX,
    sample.tileY,
  );
  const width = proceduralEditorPreviewWidth(preview);
  const height = proceduralEditorPreviewHeight(preview);
  if (
    local.tileX < 0 ||
    local.tileY < 0 ||
    local.tileX >= width ||
    local.tileY >= height
  )
    return;
  const index = local.tileY * width + local.tileX;
  biomes[index] = Math.max(0, SURVIVAL_BIOMES.indexOf(biome));
  blocked[index] = sample.waterKind !== "none";
  elevations[index] = Math.max(0, Math.min(255, sample.elevation));
}

/** Builds a finite editor viewport over a signed seed world. A generated
 * payload also contributes its deterministic apron, preventing fake cliffs
 * at the visible materialization boundary. The overlay hides apron-only
 * neighbours until their own payload is explicitly generated. */
export function terrainArrayForProceduralEditorPreview(
  preview: ProceduralEditorPreview,
): TerrainArray {
  const width = proceduralEditorPreviewWidth(preview);
  const height = proceduralEditorPreviewHeight(preview);
  const length = width * height;
  const biomes = new Uint8Array(length);
  biomes.fill(Math.max(0, SURVIVAL_BIOMES.indexOf("plains")));
  const blocked = Array<boolean>(length).fill(false);
  const elevations = new Uint8Array(length);
  const samples = new Map<string, SemanticTerrainSample>();
  for (const chunk of preview.generated.values()) {
    for (const sample of chunk.apron)
      samples.set(signedTileKey(sample.tileX, sample.tileY), sample);
  }
  for (const sample of samples.values()) {
    const neighbors = [
      samples.get(signedTileKey(sample.tileX, sample.tileY - 1)),
      samples.get(signedTileKey(sample.tileX + 1, sample.tileY)),
      samples.get(signedTileKey(sample.tileX, sample.tileY + 1)),
      samples.get(signedTileKey(sample.tileX - 1, sample.tileY)),
    ];
    writeSample(
      preview,
      sample,
      proceduralEditorSurvivalBiomeFor(sample, neighbors),
      biomes,
      blocked,
      elevations,
    );
  }
  return {
    spaceId: PROCEDURAL_EDITOR_SPACE_ID,
    seed: preview.normalizedSeed,
    version: preview.generatorVersion * 1_000_000 + preview.compositionRevision,
    width,
    height,
    generator: "debug_flat",
    biomes,
    blocked,
    horseJumpableTerrain: Array<boolean>(length).fill(false),
    cliffRoles: new Uint8Array(length),
    elevations,
    terrainTransitions: [],
    raisedTerrainCollisionClassified: true,
    plateaus: elevations,
    dirtCliffRoles: new Uint8Array(length),
    dirtTerraces: new Uint8Array(length),
  };
}

export function proceduralEditorCellAtLocalTile(
  preview: ProceduralEditorPreview,
  localTileX: number,
  localTileY: number,
): SemanticTerrainCell | null {
  const chunkPoint = proceduralEditorChunkAtLocalTile(
    preview,
    localTileX,
    localTileY,
  );
  const chunk = preview.generated.get(
    chunkKey(chunkPoint.chunkX, chunkPoint.chunkY),
  );
  if (chunk === undefined) return null;
  const world = proceduralEditorLocalToWorldTile(
    preview,
    localTileX,
    localTileY,
  );
  return (
    chunk.cells.find(
      (cell) => cell.tileX === world.tileX && cell.tileY === world.tileY,
    ) ?? null
  );
}

export function proceduralEditorTraceAtLocalTile(
  preview: ProceduralEditorPreview,
  localTileX: number,
  localTileY: number,
): SemanticTerrainTrace | null {
  const cell = proceduralEditorCellAtLocalTile(preview, localTileX, localTileY);
  if (cell === null) return null;
  const surface = surfaceRole(cell.surface);
  return {
    tileX: cell.tileX,
    tileY: cell.tileY,
    elevation: cell.elevation,
    layers: [
      {
        role: `surface.${surface}`,
        contourLevel: cell.elevation,
        blocksMovement: cell.waterKind !== "none",
        blocksLight: false,
        reason: `${cell.biome} / ${cell.terrainFamily} / ${cell.waterKind}`,
      },
    ],
  };
}

export function proceduralBiomeAtLocalTile(
  preview: ProceduralEditorPreview,
  localTileX: number,
  localTileY: number,
): ProceduralTerrainBiome | null {
  return (
    proceduralEditorCellAtLocalTile(preview, localTileX, localTileY)?.biome ??
    null
  );
}
