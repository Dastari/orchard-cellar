import { describe, expect, it } from "vitest";
import {
  PROCEDURAL_TERRAIN_GENERATOR_VERSION,
  PROCEDURAL_TERRAIN_HALO_TILES,
  PROCEDURAL_WORLD_CHUNK_TILES,
  TERRAIN_NEIGHBOR_BITS,
  normalizeProceduralWorldSeed,
  proceduralTerrainBiomePreviewRgba,
  proceduralTerrainApronSampleAt,
  proceduralTerrainCellAt,
  sampleProceduralTerrainAt,
  sampleProceduralTerrainChunk,
  sampleProceduralTerrainOverview,
  type SemanticTerrainChunk,
  type ProceduralWaterKind,
} from "./index.js";

const SEED = "orchard-v2";

function assertOverlappingApronsEqual(
  left: SemanticTerrainChunk,
  right: SemanticTerrainChunk,
): void {
  const minimumX = Math.max(left.apronMinTileX, right.apronMinTileX);
  const minimumY = Math.max(left.apronMinTileY, right.apronMinTileY);
  const maximumX = Math.min(
    left.apronMinTileX + left.apronWidth,
    right.apronMinTileX + right.apronWidth,
  );
  const maximumY = Math.min(
    left.apronMinTileY + left.apronHeight,
    right.apronMinTileY + right.apronHeight,
  );
  expect(maximumX).toBeGreaterThan(minimumX);
  expect(maximumY).toBeGreaterThan(minimumY);
  for (let tileY = minimumY; tileY < maximumY; tileY += 1) {
    for (let tileX = minimumX; tileX < maximumX; tileX += 1) {
      expect(proceduralTerrainApronSampleAt(left, tileX, tileY)).toEqual(
        proceduralTerrainApronSampleAt(right, tileX, tileY),
      );
    }
  }
}

describe("procedural sanctuary terrain sampler", () => {
  it("is deterministic for string seeds, signed chunks, and generation order", () => {
    const first = sampleProceduralTerrainChunk({
      seed: SEED,
      chunkX: -17,
      chunkY: 29,
    });
    sampleProceduralTerrainChunk({ seed: SEED, chunkX: 500, chunkY: -500 });
    const second = sampleProceduralTerrainChunk({
      seed: SEED,
      chunkX: -17,
      chunkY: 29,
    });
    expect(second).toEqual(first);
    expect(first.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(first.seed).toBe(normalizeProceduralWorldSeed(SEED));
    expect(first.generatorVersion).toBe(PROCEDURAL_TERRAIN_GENERATOR_VERSION);
  });

  it("pins output to generator version as well as seed", () => {
    const first = sampleProceduralTerrainChunk({
      seed: SEED,
      generatorVersion: 1,
      chunkX: 4,
      chunkY: 7,
    });
    const second = sampleProceduralTerrainChunk({
      seed: SEED,
      generatorVersion: 2,
      chunkX: 4,
      chunkY: 7,
    });
    const third = sampleProceduralTerrainChunk({
      seed: SEED,
      generatorVersion: 3,
      chunkX: 4,
      chunkY: 7,
    });
    expect(second.checksum).not.toBe(first.checksum);
    expect(third.checksum).not.toBe(second.checksum);
  });

  it("keeps v4-v6 on the reviewed v3 field seed while changing only semantics", () => {
    const third = sampleProceduralTerrainChunk({
      seed: "orchard-sanctuary-20",
      generatorVersion: 3,
      chunkX: 11,
      chunkY: -16,
    });
    const fourth = sampleProceduralTerrainChunk({
      seed: "orchard-sanctuary-20",
      generatorVersion: 4,
      chunkX: 11,
      chunkY: -16,
    });
    const sixth = sampleProceduralTerrainChunk({
      seed: "orchard-sanctuary-20",
      generatorVersion: 6,
      chunkX: 11,
      chunkY: -16,
    });
    expect(fourth.checksum).not.toBe(third.checksum);
    expect(fourth.apron.map(({ fields }) => fields)).toEqual(
      third.apron.map(({ fields }) => fields),
    );
    expect(
      fourth.apron.map(({ biome, elevation }) => ({ biome, elevation })),
    ).toEqual(
      third.apron.map(({ biome, elevation }) => ({ biome, elevation })),
    );
    expect(sixth.apron.map(({ fields }) => fields)).toEqual(
      third.apron.map(({ fields }) => fields),
    );
  });

  it("preserves the v5 diagonal waterfall classification for pinned worlds", () => {
    const rows = Array.from({ length: 8 }, (_, offset) =>
      sampleProceduralTerrainAt(
        "orchard-sanctuary-20",
        5,
        275,
        -1_002 + offset,
      ).waterKind,
    );
    expect(rows).toEqual([
      "none",
      "river",
      "waterfall",
      "waterfall",
      "waterfall",
      "waterfall",
      "none",
      "none",
    ]);
    const upper = sampleProceduralTerrainAt(
      "orchard-sanctuary-20",
      5,
      275,
      -1_000,
    );
    const lower = sampleProceduralTerrainAt(
      "orchard-sanctuary-20",
      5,
      275,
      -999,
    );
    expect([upper.elevation, lower.elevation]).toEqual([1, 0]);

    const west = sampleProceduralTerrainChunk({
      seed: "orchard-sanctuary-20",
      generatorVersion: 5,
      chunkX: 16,
      chunkY: -63,
    });
    const east = sampleProceduralTerrainChunk({
      seed: "orchard-sanctuary-20",
      generatorVersion: 5,
      chunkX: 17,
      chunkY: -63,
    });
    assertOverlappingApronsEqual(west, east);
    expect(proceduralTerrainApronSampleAt(west, 275, -1_000)?.waterKind).toBe(
      "waterfall",
    );
    expect(proceduralTerrainApronSampleAt(east, 275, -1_000)?.waterKind).toBe(
      "waterfall",
    );
  });

  it("v6 straightens and reconnects a river around a flat three-wide waterfall", () => {
    const seed = "orchard-sanctuary-20";
    const centerX = 276;
    const crestY = -1_000;
    for (let rowOffset = 0; rowOffset < 4; rowOffset += 1) {
      const row = Array.from({ length: 5 }, (_, xOffset) =>
        sampleProceduralTerrainAt(
          seed,
          6,
          centerX - 2 + xOffset,
          crestY + rowOffset,
        ),
      );
      expect(row.map(({ waterKind }) => waterKind)).toEqual([
        "none",
        "waterfall",
        "waterfall",
        "waterfall",
        "none",
      ]);
      expect(row.slice(1, 4).map(({ elevation }) => elevation)).toEqual(
        rowOffset === 0 ? [1, 1, 1] : [0, 0, 0],
      );
    }
    expect(
      Array.from({ length: 7 }, (_, offset) =>
        sampleProceduralTerrainAt(seed, 6, centerX - 3 + offset, crestY)
          .elevation,
      ),
    ).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(
      Array.from({ length: 7 }, (_, offset) =>
        sampleProceduralTerrainAt(seed, 6, centerX - 3 + offset, crestY + 1)
          .elevation,
      ),
    ).toEqual([0, 0, 0, 0, 0, 0, 0]);

    const riverXs = (tileY: number) => {
      const xs: number[] = [];
      for (let tileX = centerX - 8; tileX <= centerX + 8; tileX += 1) {
        if (sampleProceduralTerrainAt(seed, 6, tileX, tileY).waterKind === "river")
          xs.push(tileX);
      }
      return xs;
    };
    expect(riverXs(crestY - 1)).toEqual([276, 277, 278]);
    expect(riverXs(crestY + 4)).toEqual([274, 275, 276]);
    expect(riverXs(crestY - 1).some((tileX) => tileX >= centerX - 1 && tileX <= centerX + 1))
      .toBe(true);
    expect(riverXs(crestY + 4).some((tileX) => tileX >= centerX - 1 && tileX <= centerX + 1))
      .toBe(true);

    const west = sampleProceduralTerrainChunk({
      seed,
      generatorVersion: 6,
      chunkX: 16,
      chunkY: -63,
    });
    const east = sampleProceduralTerrainChunk({
      seed,
      generatorVersion: 6,
      chunkX: 17,
      chunkY: -63,
    });
    assertOverlappingApronsEqual(west, east);
  });

  it("v6 lengthens a fast diagonal approach until every water row reconnects", () => {
    const seed = 987_654_321;
    const centerX = 153;
    const crestY = 3_596;
    const waterXs = (tileY: number) => {
      const xs: number[] = [];
      for (let tileX = centerX - 16; tileX <= centerX + 16; tileX += 1) {
        const kind = sampleProceduralTerrainAt(seed, 6, tileX, tileY).waterKind;
        if (kind === "river" || kind === "waterfall") xs.push(tileX);
      }
      return xs;
    };
    for (let tileY = crestY - 8; tileY < crestY + 8; tileY += 1) {
      const current = waterXs(tileY);
      const next = waterXs(tileY + 1);
      expect(current.length).toBeGreaterThan(0);
      expect(next.length).toBeGreaterThan(0);
      expect(
        current.some((tileX) =>
          next.some((nextTileX) => Math.abs(nextTileX - tileX) <= 1),
        ),
      ).toBe(true);
    }
    for (let rowOffset = 0; rowOffset < 4; rowOffset += 1) {
      expect(
        Array.from({ length: 3 }, (_, offset) =>
          sampleProceduralTerrainAt(
            seed,
            6,
            centerX - 1 + offset,
            crestY + rowOffset,
          ).waterKind,
        ),
      ).toEqual(["waterfall", "waterfall", "waterfall"]);
    }
    // The raised-terrain compositor resolves each contour from a 3x3
    // elevation neighborhood. Keep one full-width dry apron on both sides of
    // the authored fall so a diagonal macro contour cannot turn the middle
    // waterfall column into an inset corner or immediately wall off its foot.
    for (const [tileY, expectedElevation] of [
      [crestY - 1, 2],
      [crestY + 4, 1],
    ] as const) {
      expect(
        Array.from({ length: 7 }, (_, offset) =>
          sampleProceduralTerrainAt(
            seed,
            6,
            centerX - 3 + offset,
            tileY,
          ).elevation,
        ),
      ).toEqual(Array<number>(7).fill(expectedElevation));
    }

    const north = sampleProceduralTerrainChunk({
      seed,
      generatorVersion: 6,
      chunkX: 9,
      chunkY: 224,
    });
    const south = sampleProceduralTerrainChunk({
      seed,
      generatorVersion: 6,
      chunkX: 9,
      chunkY: 225,
    });
    for (let tileY = crestY - 8; tileY <= crestY + 8; tileY += 1) {
      for (let tileX = centerX - 12; tileX <= centerX + 12; tileX += 1) {
        const chunkSample =
          proceduralTerrainApronSampleAt(north, tileX, tileY) ??
          proceduralTerrainApronSampleAt(south, tileX, tileY);
        if (chunkSample === null) continue;
        expect(chunkSample?.waterKind).toBe(
          sampleProceduralTerrainAt(seed, 6, tileX, tileY).waterKind,
        );
      }
    }
  });

  it("independently generated neighboring chunks share byte-identical halo samples", () => {
    const west = sampleProceduralTerrainChunk({
      seed: SEED,
      chunkX: -1,
      chunkY: -2,
    });
    const east = sampleProceduralTerrainChunk({
      seed: SEED,
      chunkX: 0,
      chunkY: -2,
    });
    expect(west.halo).toBe(PROCEDURAL_TERRAIN_HALO_TILES);
    assertOverlappingApronsEqual(west, east);

    for (let localY = 0; localY < PROCEDURAL_WORLD_CHUNK_TILES; localY += 1) {
      const westEdge = proceduralTerrainCellAt(west, 15, localY);
      const eastEdge = proceduralTerrainCellAt(east, 0, localY);
      const westToEast = westEdge.adjacency.cardinal.find(
        ({ direction }) => direction === "east",
      );
      const eastToWest = eastEdge.adjacency.cardinal.find(
        ({ direction }) => direction === "west",
      );
      expect(westToEast).toMatchObject({
        neighborBiome: eastEdge.biome,
        neighborSurface: eastEdge.surface,
        neighborTerrainFamily: eastEdge.terrainFamily,
        neighborWaterKind: eastEdge.waterKind,
        elevationDelta: eastEdge.elevation - westEdge.elevation,
      });
      expect(eastToWest).toMatchObject({
        neighborBiome: westEdge.biome,
        neighborSurface: westEdge.surface,
        neighborTerrainFamily: westEdge.terrainFamily,
        neighborWaterKind: westEdge.waterKind,
        elevationDelta: westEdge.elevation - eastEdge.elevation,
      });
      expect(
        Boolean(westEdge.adjacency.shorelineMask & TERRAIN_NEIGHBOR_BITS.east),
      ).toBe(
        Boolean(eastEdge.adjacency.shorelineMask & TERRAIN_NEIGHBOR_BITS.west),
      );
    }
  });

  it.each([
    ["river", -3_904, -4_096, "river"],
    ["lake", -3_136, -4_096, "lake"],
    ["pond", 1_344, -4_096, "pond"],
  ] as const)(
    "keeps a %s continuous when its neighbor materializes later",
    (_label, boundaryTileX, tileY, waterKind) => {
      const chunkY = Math.floor(tileY / PROCEDURAL_WORLD_CHUNK_TILES);
      const eastChunkX = Math.floor(
        boundaryTileX / PROCEDURAL_WORLD_CHUNK_TILES,
      );
      const west = sampleProceduralTerrainChunk({
        seed: SEED,
        generatorVersion: 1,
        chunkX: eastChunkX - 1,
        chunkY,
      });
      const east = sampleProceduralTerrainChunk({
        seed: SEED,
        generatorVersion: 1,
        chunkX: eastChunkX,
        chunkY,
      });
      assertOverlappingApronsEqual(west, east);
      const localY = tileY - chunkY * PROCEDURAL_WORLD_CHUNK_TILES;
      expect(
        proceduralTerrainCellAt(west, 15, localY).waterKind,
      ).toBe<ProceduralWaterKind>(waterKind);
      expect(
        proceduralTerrainCellAt(east, 0, localY).waterKind,
      ).toBe<ProceduralWaterKind>(waterKind);
    },
  );

  it("keeps shore, biome-family, and contour relations symmetric across chunk seams", () => {
    const shoreWest = sampleProceduralTerrainChunk({
      seed: SEED,
      generatorVersion: 1,
      chunkX: -168,
      chunkY: -256,
    });
    const shoreEast = sampleProceduralTerrainChunk({
      seed: SEED,
      generatorVersion: 1,
      chunkX: -167,
      chunkY: -256,
    });
    const coast = proceduralTerrainCellAt(shoreWest, 15, 0);
    const ocean = proceduralTerrainCellAt(shoreEast, 0, 0);
    expect([coast.waterKind, ocean.waterKind]).toEqual(["none", "ocean"]);
    expect(
      coast.adjacency.shorelineMask & TERRAIN_NEIGHBOR_BITS.east,
    ).toBeTruthy();
    expect(
      ocean.adjacency.shorelineMask & TERRAIN_NEIGHBOR_BITS.west,
    ).toBeTruthy();
    assertOverlappingApronsEqual(shoreWest, shoreEast);

    const familyWest = sampleProceduralTerrainChunk({
      seed: "orchard-sanctuary-20",
      generatorVersion: 1,
      chunkX: -94,
      chunkY: -255,
    });
    const familyEast = sampleProceduralTerrainChunk({
      seed: "orchard-sanctuary-20",
      generatorVersion: 1,
      chunkX: -93,
      chunkY: -255,
    });
    expect(proceduralTerrainCellAt(familyWest, 15, 0).terrainFamily).toBe(
      "temperate_meadow",
    );
    expect(proceduralTerrainCellAt(familyEast, 0, 0).terrainFamily).toBe(
      "temperate_woodland",
    );
    assertOverlappingApronsEqual(familyWest, familyEast);

    const lower = sampleProceduralTerrainChunk({
      seed: "orchard-sanctuary-20",
      generatorVersion: 1,
      chunkX: 11,
      chunkY: -247,
    });
    const upper = sampleProceduralTerrainChunk({
      seed: "orchard-sanctuary-20",
      generatorVersion: 1,
      chunkX: 12,
      chunkY: -247,
    });
    expect(proceduralTerrainCellAt(lower, 15, 0).elevation).toBe(1);
    expect(proceduralTerrainCellAt(upper, 0, 0).elevation).toBe(0);
    expect(
      proceduralTerrainCellAt(lower, 15, 0).adjacency.lowerElevationMask &
        TERRAIN_NEIGHBOR_BITS.east,
    ).toBeTruthy();
    expect(
      proceduralTerrainCellAt(upper, 0, 0).adjacency.higherElevationMask &
        TERRAIN_NEIGHBOR_BITS.west,
    ).toBeTruthy();
    assertOverlappingApronsEqual(lower, upper);
  });

  it("provides coherent lakes, rivers, and land in the selected spawn-size region", () => {
    const overview = sampleProceduralTerrainOverview({
      seed: SEED,
      generatorVersion: 1,
      minTileX: -200,
      minTileY: -200,
      columns: 100,
      rows: 100,
      stepTiles: 4,
    });
    const waterKinds = new Set(
      overview.samples.map(({ waterKind }) => waterKind),
    );
    const biomes = new Set(overview.samples.map(({ biome }) => biome));
    expect(waterKinds).toEqual(new Set(["none", "river", "lake"]));
    expect(biomes).toEqual(new Set(["plains", "meadow", "highland"]));
    expect(overview.samples.some(({ waterKind }) => waterKind === "none")).toBe(
      true,
    );
  });

  it("keeps a representative v2 minor river at a two-tile gameplay width", () => {
    const row = Array.from(
      { length: 6 },
      (_, offset) =>
        sampleProceduralTerrainAt("orchard-sanctuary-20", 2, -79 + offset, -196)
          .waterKind,
    );
    expect(row).toEqual(["none", "none", "river", "river", "none", "none"]);
  });

  it("keeps v3 diagonal river bends at a two-to-three tile gameplay width", () => {
    const rowWidths = Array.from({ length: 16 }, (_, rowOffset) => {
      const tileY = -256 + rowOffset;
      return Array.from({ length: 28 }, (_, columnOffset) =>
        sampleProceduralTerrainAt(
          "orchard-sanctuary-20",
          3,
          184 + columnOffset,
          tileY,
        ),
      ).filter(({ waterKind }) => waterKind === "river").length;
    });
    expect(rowWidths.every((width) => width >= 2 && width <= 3)).toBe(true);
    expect(new Set(rowWidths)).toEqual(new Set([2, 3]));
  });

  it("keeps v4 diagonal rivers three-to-four tiles wide without bank-only pinches", () => {
    const minimumX = 180;
    const minimumY = -260;
    const width = 36;
    const height = 24;
    const river = new Uint8Array(width * height);
    for (let localY = 0; localY < height; localY += 1) {
      for (let localX = 0; localX < width; localX += 1) {
        river[localY * width + localX] =
          sampleProceduralTerrainAt(
            "orchard-sanctuary-20",
            4,
            minimumX + localX,
            minimumY + localY,
          ).waterKind === "river"
            ? 1
            : 0;
      }
    }
    const riverAt = (localX: number, localY: number): boolean =>
      river[localY * width + localX] === 1;
    let oppositeCornerPinches = 0;
    for (let localY = 1; localY < height - 1; localY += 1) {
      for (let localX = 1; localX < width - 1; localX += 1) {
        if (
          !riverAt(localX, localY) ||
          !riverAt(localX, localY - 1) ||
          !riverAt(localX + 1, localY) ||
          !riverAt(localX, localY + 1) ||
          !riverAt(localX - 1, localY)
        )
          continue;
        const northWestToSouthEast =
          !riverAt(localX - 1, localY - 1) && !riverAt(localX + 1, localY + 1);
        const northEastToSouthWest =
          !riverAt(localX + 1, localY - 1) && !riverAt(localX - 1, localY + 1);
        if (northWestToSouthEast || northEastToSouthWest)
          oppositeCornerPinches += 1;
      }
    }
    const rowWidths = Array.from({ length: 16 }, (_, rowOffset) => {
      const localY = rowOffset + 4;
      return Array.from({ length: 28 }, (_, localX) =>
        riverAt(localX + 4, localY),
      ).filter(Boolean).length;
    });
    expect(rowWidths.every((rowWidth) => rowWidth >= 3 && rowWidth <= 4)).toBe(
      true,
    );
    expect(new Set(rowWidths)).toEqual(new Set([3, 4]));
    expect(oppositeCornerPinches).toBe(0);
  });

  it("marks v2 elevation-four summits for the reviewed snow-overlay family", () => {
    expect(
      sampleProceduralTerrainAt("orchard-sanctuary-20", 2, -3_120, -4_096),
    ).toMatchObject({
      biome: "cold_highland",
      surface: "cold_grass",
      terrainFamily: "snow_highland",
      elevation: 4,
    });
  });

  it("emits the licensed-pack terrain family contracts without coupling sim to atlas frames", () => {
    expect(
      sampleProceduralTerrainAt("wide-plains", 1, 1_728, -512),
    ).toMatchObject({
      biome: "shroomlands",
      terrainFamily: "shroom_green",
      shoreFamily: "shroomlands",
      cliffFamily: "shroomlands",
    });
    expect(
      sampleProceduralTerrainAt("wide-plains", 1, -1_472, -1_664),
    ).toMatchObject({
      biome: "desert",
      terrainFamily: "desert_1",
      shoreFamily: "desert_beach_1",
      cliffFamily: "desert_cliff_1",
    });
    expect(
      sampleProceduralTerrainAt("wide-plains", 1, -2_688, -3_904),
    ).toMatchObject({
      biome: "volcanic",
      terrainFamily: "volcanic",
      shoreFamily: "volcanic",
      cliffFamily: "volcanic",
    });
    expect(sampleProceduralTerrainAt(SEED, 1, 1_344, -4_096)).toMatchObject({
      biome: "woodland",
      waterKind: "pond",
      terrainFamily: "temperate_woodland",
    });
  });

  it("makes seed-overview samples identical to detailed coordinate samples", () => {
    const overview = sampleProceduralTerrainOverview({
      seed: SEED,
      generatorVersion: 1,
      minTileX: -33,
      minTileY: 47,
      columns: 4,
      rows: 3,
      stepTiles: 17,
    });
    for (const sample of overview.samples) {
      expect(sample).toEqual(
        sampleProceduralTerrainAt(SEED, 1, sample.tileX, sample.tileY),
      );
    }
  });

  it("shares one semantic biome palette across editor and review-map consumers", () => {
    expect(
      proceduralTerrainBiomePreviewRgba({
        biome: "woodland",
        waterKind: "none",
        waterDepth: 0,
      }),
    ).toEqual([45, 112, 61, 255]);
    expect(
      proceduralTerrainBiomePreviewRgba({
        biome: "woodland",
        waterKind: "river",
        waterDepth: 1,
      }),
    ).toEqual([38, 126, 180, 255]);
    expect(
      proceduralTerrainBiomePreviewRgba({
        biome: "ocean",
        waterKind: "ocean",
        waterDepth: 2,
      }),
    ).toEqual([10, 31, 86, 255]);
  });

  it("rejects invalid sampler coordinates and local lookups", () => {
    expect(() =>
      sampleProceduralTerrainChunk({ seed: SEED, chunkX: 0.5, chunkY: 0 }),
    ).toThrow("safe integer");
    const chunk = sampleProceduralTerrainChunk({
      seed: SEED,
      chunkX: 0,
      chunkY: 0,
    });
    expect(() => proceduralTerrainCellAt(chunk, 16, 0)).toThrow("outside");
  });
});
