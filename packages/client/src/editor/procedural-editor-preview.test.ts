import {
  PROCEDURAL_TERRAIN_MAX_ELEVATION,
  SURVIVAL_BIOMES,
  proceduralTerrainBiomePreviewRgba,
  normalizeProceduralWorldSeed,
  sampleProceduralTerrainAt,
} from "@orchard/sim";
import { describe, expect, it } from "vitest";
import {
  canonicalProceduralEditorSeed,
  createProceduralEditorPreview,
  generateProceduralEditorChunk,
  PROCEDURAL_EDITOR_COMPOSITION_HALO_TILES,
  proceduralEditorCellAtLocalTile,
  proceduralEditorChunkAtLocalTile,
  proceduralEditorChunkGenerated,
  proceduralEditorChunkPreviewRaster,
  proceduralEditorChunkPreviewColors,
  proceduralEditorLocalToWorldTile,
  proceduralEditorOverviewRaster,
  proceduralEditorPreviewHeight,
  proceduralEditorPreviewWidth,
  proceduralEditorSurvivalBiomeFor,
  proceduralEditorTraceAtLocalTile,
  terrainArrayForProceduralEditorPreview,
  recenterProceduralEditorPreview,
} from "./procedural-editor-preview.js";
import { terrainProjectedRowsPerLevel } from "../render/terrain.js";

describe("procedural editor preview", () => {
  it("maps the finite inspection window onto signed chunks around the origin", () => {
    const preview = createProceduralEditorPreview({
      seed: "editor-seed",
      radiusChunks: 2,
    });
    expect(proceduralEditorPreviewWidth(preview)).toBe(80);
    expect(proceduralEditorPreviewHeight(preview)).toBe(80);
    expect(proceduralEditorLocalToWorldTile(preview, 0, 0)).toEqual({
      tileX: -32,
      tileY: -32,
    });
    expect(proceduralEditorChunkAtLocalTile(preview, 31, 31)).toEqual({
      chunkX: -1,
      chunkY: -1,
    });
    expect(proceduralEditorChunkAtLocalTile(preview, 32, 32)).toEqual({
      chunkX: 0,
      chunkY: 0,
    });
  });

  it("materializes only the selected payload and exposes signed semantic inspection", () => {
    const empty = createProceduralEditorPreview({
      seed: "orchard-sanctuary-20",
      radiusChunks: 2,
    });
    const generated = generateProceduralEditorChunk(empty, 0, 0);
    expect(proceduralEditorChunkGenerated(empty, 0, 0)).toBe(false);
    expect(proceduralEditorChunkGenerated(generated, 0, 0)).toBe(true);
    expect(proceduralEditorChunkGenerated(generated, 1, 0)).toBe(false);
    expect(proceduralEditorCellAtLocalTile(generated, 32, 32)).toMatchObject({
      tileX: 0,
      tileY: 0,
    });
    expect(proceduralEditorCellAtLocalTile(generated, 48, 32)).toBeNull();
    expect(proceduralEditorTraceAtLocalTile(generated, 32, 32)).toMatchObject({
      tileX: 0,
      tileY: 0,
    });
  });

  it("renders deterministic aprons while keeping neighbour payload state ungenerated", () => {
    const empty = createProceduralEditorPreview({
      seed: "orchard-sanctuary-20",
      radiusChunks: 2,
    });
    const generated = generateProceduralEditorChunk(empty, 0, 0);
    const terrain = terrainArrayForProceduralEditorPreview(generated);
    const originLocal = 32;
    const eastApronIndex = originLocal * terrain.width + originLocal + 16;
    expect(terrain.biomes[eastApronIndex]).not.toBe(
      SURVIVAL_BIOMES.indexOf("plains"),
    );
    expect(proceduralEditorChunkGenerated(generated, 1, 0)).toBe(false);
  });

  it("keeps the unsampled apron boundary beyond the deepest projected cliff face", () => {
    const empty = createProceduralEditorPreview({
      seed: "orchard-sanctuary-20",
      radiusChunks: 2,
    });
    const generated = generateProceduralEditorChunk(empty, 0, 0);
    const chunk = generated.generated.get("0,0");
    expect(chunk).toBeDefined();
    expect(chunk?.halo).toBe(PROCEDURAL_EDITOR_COMPOSITION_HALO_TILES);
    expect(PROCEDURAL_EDITOR_COMPOSITION_HALO_TILES).toBeGreaterThan(
      PROCEDURAL_TERRAIN_MAX_ELEVATION * terrainProjectedRowsPerLevel(),
    );
  });

  it("is idempotent when Generate is clicked twice", () => {
    const empty = createProceduralEditorPreview({ seed: 42, radiusChunks: 1 });
    const once = generateProceduralEditorChunk(empty, -1, 0);
    expect(generateProceduralEditorChunk(once, -1, 0)).toBe(once);
  });

  it("materializes safe signed chunks outside the renderer composition window", () => {
    const empty = createProceduralEditorPreview({ seed: 42, radiusChunks: 1 });
    const generated = generateProceduralEditorChunk(empty, 10_000, -10_000);
    expect(proceduralEditorChunkGenerated(generated, 10_000, -10_000)).toBe(
      true,
    );
  });

  it("slides the bounded composition without changing signed payload ownership", () => {
    const generated = generateProceduralEditorChunk(
      createProceduralEditorPreview({ seed: 42, radiusChunks: 2 }),
      9,
      -7,
    );
    const recentered = recenterProceduralEditorPreview(generated, 9, -7);
    expect(recentered).toMatchObject({ minChunkX: 7, minChunkY: -9 });
    expect(proceduralEditorChunkGenerated(recentered, 9, -7)).toBe(true);
    expect(proceduralEditorLocalToWorldTile(recentered, 32, 32)).toEqual({
      tileX: 9 * 16,
      tileY: -7 * 16,
    });
  });

  it("canonicalizes legacy labels to numeric seeds without changing their world", () => {
    const legacy = "orchard-sanctuary-20";
    const numeric = canonicalProceduralEditorSeed(legacy);
    expect(numeric).toBe(2_098_878_576);
    expect(normalizeProceduralWorldSeed(numeric)).toBe(
      normalizeProceduralWorldSeed(legacy),
    );
    expect(createProceduralEditorPreview({ seed: legacy }).seed).toBe(numeric);
  });

  it("provides a bright biome overview without materializing payloads", () => {
    const preview = createProceduralEditorPreview({
      seed: "orchard-sanctuary-20",
      radiusChunks: 1,
    });
    const colors = proceduralEditorChunkPreviewColors(preview);
    expect(colors.size).toBe(9);
    expect(colors.get("0,0")).toMatch(/^#[0-9a-f]{6}$/u);
    expect(preview.generated.size).toBe(0);
  });

  it("retains a tile-resolution semantic preview until a chunk is generated", () => {
    const preview = createProceduralEditorPreview({
      seed: 42,
      radiusChunks: 1,
    });
    const raster = proceduralEditorChunkPreviewRaster(preview, 8, -3);
    expect(raster).toMatchObject({ width: 16, height: 16, stepTiles: 1 });
    const sample = sampleProceduralTerrainAt(
      preview.seed,
      preview.generatorVersion,
      8 * 16,
      -3 * 16,
    );
    expect([...raster.pixels.slice(0, 4)]).toEqual([
      ...proceduralTerrainBiomePreviewRgba(sample),
    ]);
    expect(preview.generated.size).toBe(0);
  });

  it("builds a deterministic pixel overview without materializing chunks", () => {
    const preview = createProceduralEditorPreview({
      seed: "orchard-sanctuary-20",
      radiusChunks: 1,
    });
    const raster = proceduralEditorOverviewRaster(preview, 2);
    expect(raster).toMatchObject({ width: 24, height: 24, stepTiles: 2 });
    const firstSample = sampleProceduralTerrainAt(
      preview.seed,
      preview.generatorVersion,
      -16,
      -16,
    );
    expect([...raster.pixels.slice(0, 4)]).toEqual([
      ...proceduralTerrainBiomePreviewRgba(firstSample),
    ]);
    expect(proceduralEditorOverviewRaster(preview, 2).pixels).toEqual(
      raster.pixels,
    );
    expect(preview.generated.size).toBe(0);
  });

  it("builds overview rasters for arbitrary signed viewport bounds", () => {
    const preview = createProceduralEditorPreview({
      seed: 42,
      radiusChunks: 1,
    });
    const raster = proceduralEditorOverviewRaster(preview, 4, {
      minTileX: 4_000,
      minTileY: -8_000,
      width: 80,
      height: 40,
    });
    expect(raster).toMatchObject({ width: 20, height: 10, stepTiles: 4 });
    const sample = sampleProceduralTerrainAt(
      preview.seed,
      preview.generatorVersion,
      4_000,
      -8_000,
    );
    expect([...raster.pixels.slice(0, 4)]).toEqual([
      ...proceduralTerrainBiomePreviewRgba(sample),
    ]);
  });

  it("preserves desert terrain and its water family in the material preview", () => {
    const desert = sampleProceduralTerrainAt("wide-plains", 1, -1_472, -1_664);
    expect(desert.biome).toBe("desert");
    const oasisWater = {
      ...desert,
      surface: "water" as const,
      waterKind: "river" as const,
      waterDepth: 1 as const,
    };
    const waterfall = {
      ...oasisWater,
      waterKind: "waterfall" as const,
    };
    expect(proceduralEditorSurvivalBiomeFor(desert, [])).toBe("desert");
    expect(proceduralEditorSurvivalBiomeFor(oasisWater, [])).toBe(
      "oasis_water",
    );
    expect(proceduralEditorSurvivalBiomeFor(waterfall, [])).toBe(
      "waterfall",
    );
    expect(proceduralEditorSurvivalBiomeFor(desert, [oasisWater])).toBe(
      "desert_shore",
    );
  });
});
