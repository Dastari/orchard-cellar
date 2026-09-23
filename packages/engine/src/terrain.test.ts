import {
  SURVIVAL_DIRT_CLIFF_ROLES,
  SURVIVAL_BIOMES,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
  DEBUG_SPACE_ID,
  CELLAR_SIZE_TILES,
  spaceDefinitionFor,
  survivalTerrainBlocksTraversalAt,
  terrainCliffTileSet,
  validateExactTerrainOverride,
} from "@orchard/sim";
import { describe, expect, it } from "vitest";
import islandContourGoldenText from "./fixtures/island-contour-plans.golden.json?raw";
import {
  beachFrameIndexAt,
  authoredFarmlandFrameIndexAt,
  cellarExposedWallAt,
  cellarWallSourceAtProjectedTile,
  animatedWaterRockAllowedAt,
  desertGrassEdgeFrameIndexAt,
  desertGrassInsetFrameIndicesAt,
  dirtTerraceFrameIndexAt,
  dirtTerraceRampFrameIndexAt,
  freshwaterFrameIndexAt,
  freshwaterInsetFrameIndicesAt,
  grassSandTransitionFrameIndexAt,
  pavingGrassTransitionFrameIndexAt,
  plateauBackgroundFrameIndicesAt,
  plateauEdgeFrameIndexAt,
  plateauForegroundFrameIndicesAt,
  plateauLayerPlansAt,
  plateauRampFrameIndexAt,
  savannaGrassTransitionFrameIndexAt,
  shorelineInsetFrameIndicesAt,
  terrainBiomeAt,
  terrainForWorld,
  terrainForSpace,
  terrainWithCellarExcavations,
  CAVE_RAISED_CLIFF_TILE_SET,
  invalidateTerrainElevationCaches,
  terrainContourBoundaryBetween,
  terrainContactWorldYForPlayer,
  terrainElevationAtWorldFoot,
  terrainPlaneCollisionCellAt,
  terrainProjectedDepthAtFoot,
  terrainProjectedElevationAtFoot,
  terrainProjectedRowsPerLevel,
  terrainVisualProjectionRowsPerLevel,
  terrainFixedPlane,
  grassTuftAllowedAt,
  terrainProjectedWorldYAtFoot,
  waterDecorationAllowedAt,
  waterfallTopLeftAt,
  waterfallFrameIndexAt,
  type TerrainArray,
} from "./terrain.js";

function terrainFixture(width: number, height: number, fill = 4): TerrainArray {
  const elevations = new Int16Array(width * height);
  return {
    spaceId: 0,
    seed: 1,
    version: 1,
    width,
    height,
    biomes: Uint8Array.from({ length: width * height }, () => fill),
    blocked: Array.from({ length: width * height }, () => false),
    horseJumpableTerrain: Array.from({ length: width * height }, () => false),
    elevations,
    dirtCliffRoles: new Uint8Array(width * height),
    dirtTerraces: new Uint8Array(width * height),
  };
}

function fnv1a32(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

describe("shared client terrain array", () => {
  it('keeps contour substitution scoped while exact publication validation rejects arbitrary atlas frames', () => {
    const terrain = terrainFixture(3, 3);
    terrain.elevations[4] = 2;
    const overridden: TerrainArray = {
      ...terrain,
      terrainOverrides: Array.from({ length: 9 }, (_, index) => index === 4
        ? { contourLevel: 1, role: 'top_left', frameIndex: 999 }
        : null),
    };
    const plans = plateauLayerPlansAt(overridden, 1, 1);
    const frames = (contourLevel: number): number[] => {
      const plan = plans.find((entry) => entry.contourLevel === contourLevel)?.plan;
      return plan === undefined ? [] : [
        plan.edgeFrame,
        plan.rampFrame,
        ...plan.insetFrames,
        ...plan.faceLayers.map((face) => face.frame),
      ].filter((frame): frame is number => frame !== null);
    };
    expect(frames(1)).toContain(999);
    expect(frames(2)).not.toContain(999);
    expect(validateExactTerrainOverride(
      { contourLevel: 1, role: 'top_left', frameIndex: 999 },
      'stone_1',
      terrainCliffTileSet('stone_1'),
      'top_left',
    )).toContainEqual(expect.objectContaining({ code: 'terrain_override_frame_incompatible' }));
  });

  it("projects cellar solid rock as a two-row front-facing cave wall", () => {
    expect(CAVE_RAISED_CLIFF_TILE_SET.faceProfiles.tall?.rows).toEqual([
      {
        id: "wall",
        frames: [46, 43, 47],
        middleVariants: [44],
        blocksMovement: true,
        blocksLight: true,
      },
      {
        id: "lower_wall",
        frames: [53, 50, 54],
        middleVariants: [51],
        blocksMovement: true,
        blocksLight: true,
      },
    ]);
    expect(CAVE_RAISED_CLIFF_TILE_SET.edgeFrames).toEqual({
      top_left: 25,
      top: 19,
      top_right: 26,
      left: 13,
      right: 11,
      bottom_left: 32,
      bottom: 5,
      bottom_right: 33,
    });
    expect(CAVE_RAISED_CLIFF_TILE_SET.insetFrames).toEqual({
      inner_top_left: 20,
      inner_top_right: 18,
      inner_bottom_left: 6,
      inner_bottom_right: 4,
    });
    const cellar = terrainForSpace(
      {
        spaceId: 98_765,
        name: "test_cellar",
        sizeTiles: CELLAR_SIZE_TILES,
        generator: "cellar",
        environment: "underground",
        ambient: { r: 100, g: 76, b: 68 },
        weather: false,
        audioBed: "cave",
      },
      42,
      1,
    );
    expect(
      cellar.elevations.every(
        (height, index) => height === (cellar.blocked[index] ? 1 : 0),
      ),
    ).toBe(true);
    expect(cellar.elevations.some((height) => height === 0)).toBe(true);
    expect(cellar.elevations.some((height) => height === 1)).toBe(true);
    // The real portal and three-tile wall ladder own this crossing. A terrain
    // ladder transition would add Cave_Floor_Ladder's circular manhole art.
    expect(cellar.terrainTransitions).toEqual([]);
    expect(terrainProjectedRowsPerLevel(cellar)).toBe(2);
    // Underground rock is displaced north like any raised surface.
    expect(terrainVisualProjectionRowsPerLevel(cellar)).toBe(2);
    expect(terrainElevationAtWorldFoot(cellar, 8, 8)).toBe(0);
    expect(terrainProjectedElevationAtFoot(cellar, 8, 8)).toBe(0);
    expect(terrainProjectedDepthAtFoot(cellar, 8, 8)).toBe(0);
    expect(terrainProjectedRowsPerLevel()).toBe(1);
    expect(plateauLayerPlansAt(cellar, 0, 0)).toEqual([]);
    // The ladder chamber's two visible front-wall courses occupy rows 496 and
    // 497 and block on L0. The logical face receivers at 498 and 499 remain
    // ordinary floor, avoiding the former two phantom rows south of the wall.
    expect(terrainPlaneCollisionCellAt(cellar, 510, 495, 0)).toBe('blocked');
    expect(terrainPlaneCollisionCellAt(cellar, 510, 496, 0)).toBe('blocked');
    expect(terrainPlaneCollisionCellAt(cellar, 510, 497, 0)).toBe('blocked');
    expect(terrainPlaneCollisionCellAt(cellar, 510, 498, 0)).toBe('open');
    expect(terrainPlaneCollisionCellAt(cellar, 510, 499, 0)).toBe('open');
    expect(terrainPlaneCollisionCellAt(cellar, 510, 496, 1)).toBe('blocked');
  });

  it("maps both courses of a projected cave face back to its solid source", () => {
    const width = 7;
    const height = 7;
    const blocked = Array<boolean>(width * height).fill(true);
    const elevations = new Int16Array(width * height).fill(1);
    for (let y = 3; y < height; y += 1) for (let x = 1; x < width - 1; x += 1) {
      blocked[y * width + x] = false;
      elevations[y * width + x] = 0;
    }
    const cellar: TerrainArray = {
      ...terrainFixture(width, height),
      generator: "cellar",
      defaultCliffFamily: "cave",
      blocked,
      elevations,
    };
    // The south edge at (3,2) draws its rim two rows north and both face
    // courses on its own displaced rows; the floor below is plain floor.
    expect(cellarWallSourceAtProjectedTile(cellar, 3, 0)).toEqual({ tileX: 3, tileY: 2 });
    expect(cellarWallSourceAtProjectedTile(cellar, 3, 1)).toEqual({ tileX: 3, tileY: 2 });
    expect(cellarWallSourceAtProjectedTile(cellar, 3, 2)).toEqual({ tileX: 3, tileY: 2 });
    expect(cellarWallSourceAtProjectedTile(cellar, 3, 3)).toBeNull();
    expect(cellarExposedWallAt(cellar, 3, 2)).toBe(true);
    expect(cellarExposedWallAt(cellar, 3, 1)).toBe(false);
    expect(cellarExposedWallAt(cellar, 3, 3)).toBe(false);
  });

  it('builds every roguelike act as an excavated underground structure', () => {
    for (const [roomNumber, theme] of [[0, 'cave'], [4, 'volcanic'], [8, 'dungeon']] as const) {
      const spaceId = 50_100 + roomNumber;
      const space = spaceDefinitionFor(spaceId, {
        spaceId,
        instanceKind: 'roguelike',
        seed: 417,
        roomNumber,
        roomKind: 'combat',
        theme,
      });
      expect(space).toBeDefined();
      const terrain = terrainForSpace(space!, 99, 1);
      expect(terrain.rogueTheme).toBe(theme);
      expect(terrainProjectedRowsPerLevel(terrain)).toBe(2);
      expect(terrainVisualProjectionRowsPerLevel(terrain)).toBe(2);
      expect(terrain.elevations.some((height) => height === 1)).toBe(true);
      expect(terrainFixedPlane(terrain)).toBeUndefined();
      expect(terrain.terrainTransitions).toHaveLength(2);
      expect(plateauLayerPlansAt(terrain, 16, 1).length).toBeGreaterThan(0);
      for (let index = 0; index < terrain.elevations.length; index += 1) {
        if (terrain.rogueHazards?.[index] === 1) expect(terrain.elevations[index]).toBe(0);
        else if (terrain.blocked[index]) expect(terrain.elevations[index]).toBe(1);
      }
      // The collision mask must follow the same projected northern wall faces
      // as the native renderer (the dungeon family's default datum is different).
      let checkedFaces = 0;
      for (let y = 0; y < 5; y++) for (let x = 0; x < terrain.width; x++) {
        for (const {contourLevel, plan} of plateauLayerPlansAt(terrain, x, y)) {
          if (!plan.faceLayers.some(face => face.direct && face.blocksMovement)) continue;
          const projectedY = y - (contourLevel - terrain.baseDatum!) * terrainProjectedRowsPerLevel(terrain);
          if (projectedY < 0 || projectedY >= terrain.height) continue;
          const plane = contourLevel - 1;
          expect(terrain.terrainPlaneBlocked![plane * terrain.width * terrain.height + projectedY * terrain.width + x]).toBe(1);
          checkedFaces++;
        }
      }
      expect(checkedFaces).toBeGreaterThan(0);
      expect(terrain.elevations[15 * terrain.width + 16]).toBe(1);
      expect(terrain.blocked[15 * terrain.width + 16]).toBe(false);
    }
  });

  it("does not inherit outdoor grass tufts in indoor or underground spaces", () => {
    const base = terrainFixture(8, 8);
    for (let y = 0; y < base.height; y += 1) for (let x = 0; x < base.width; x += 1) {
      expect(grassTuftAllowedAt({ ...base, generator: "residence" }, x, y)).toBe(false);
      expect(grassTuftAllowedAt({ ...base, generator: "cellar" }, x, y)).toBe(false);
    }
  });

  it("expands sparse cellar anchors to their aligned 2x2 macro-cell without mutating generator terrain", () => {
    const base = terrainFixture(6, 6);
    const solid = {
      ...base,
      generator: "cellar" as const,
      blocked: Array<boolean>(36).fill(true),
      elevations: new Int16Array(36).fill(1),
    };
    // A legacy misaligned anchor at (3,3) is read as its macro-cell (2..3, 2..3).
    const dynamic = terrainWithCellarExcavations(solid, [{ tileX: 3, tileY: 3 }], 7);
    for (const index of [14, 15, 20, 21]) {
      expect(dynamic.blocked[index]).toBe(false);
      expect(dynamic.elevations[index]).toBe(0);
      expect(solid.blocked[index]).toBe(true);
    }
    expect(dynamic.blocked[7]).toBe(true);
    expect(dynamic.blocked[22]).toBe(true);
    // Anchors inside the outer macro-cell ring never open the boundary.
    expect(terrainWithCellarExcavations(solid, [{ tileX: 2, tileY: 1 }], 8).blocked[8]).toBe(true);
    expect(dynamic.version).not.toBe(solid.version);
  });

  it("classifies collision against the coordinate-derived active elevation plane", () => {
    const terrain = terrainFixture(3, 1);
    terrain.elevations.set([0, 1, 2]);
    const withRamp = {
      ...terrain,
      terrainTransitions: [
        {
          contourLevel: 1,
          kind: "slope" as const,
          direction: "right" as const,
          lowerTileX: 0,
          lowerTileY: 0,
          upperTileX: 1,
          upperTileY: 0,
        },
      ],
    };
    expect(terrainPlaneCollisionCellAt(withRamp, 0, 0, 0)).toBe("transition");
    expect(terrainPlaneCollisionCellAt(withRamp, 1, 0, 0)).toBe("transition");
    expect(terrainPlaneCollisionCellAt(withRamp, 2, 0, 0)).toBe("blocked");
    expect(terrainPlaneCollisionCellAt(withRamp, 2, 0, 2)).toBe("open");
  });

  it("reuses one classification for a seed/version pair", () => {
    const first = terrainForWorld(123, 3);
    expect(terrainForWorld(123, 3)).toBe(first);
    expect(terrainForWorld(123, 4)).not.toBe(first);
    expect(first.biomes).toHaveLength(SURVIVAL_WORLD_SIZE ** 2);
  }, 60_000);

  it("World/Spaces & Interiors: keys terrain classification by space and builds the flat debug bounds", () => {
    const debugSpace = spaceDefinitionFor(DEBUG_SPACE_ID);
    if (debugSpace === undefined) throw new Error("debug space missing");
    const debug = terrainForSpace(debugSpace, 123, 3);
    const topside = terrainForWorld(123, 3);
    expect(debug).not.toBe(topside);
    expect(debug.spaceId).toBe(DEBUG_SPACE_ID);
    expect(debug.width).toBe(32);
    expect(debug.blocked[0]).toBe(true);
    expect(debug.blocked[16 * debug.width + 16]).toBe(false);
  });

  it("renders a blocked southern terrain apron around a Homestead without enlarging its playable space", () => {
    const space = spaceDefinitionFor(10_000, {
      spaceId: 10_000,
      sizeTier: 0,
      overworldTileX: 336,
      overworldTileY: 356,
    });
    if (space === undefined) throw new Error("homestead space missing");
    const terrain = terrainForSpace(space, 123, 3);
    expect(terrain.width).toBe(128);
    expect(terrain.height).toBe(128);
    expect(terrain.blocked[40 * terrain.width + 64]).toBe(true);
    expect(terrain.blocked[64 * terrain.width + 64]).toBe(false);
  });

  it("derives render and collision classification from the same byte", () => {
    const terrain = terrainForWorld(0x4f434852, 3);
    expect(terrainBiomeAt(terrain, 0, 0)).toBe("water");
    expect(terrain.blocked[0]).toBe(true);
    for (let index = 0; index < terrain.blocked.length; index += 1) {
      const tileX = index % terrain.width;
      const tileY = Math.floor(index / terrain.width);
      expect(terrain.blocked[index]).toBe(
        survivalTerrainBlocksTraversalAt(terrain.seed, tileX, tileY, "ground"),
      );
    }
  }, 20_000);

  it("selects authored beach corners, edges, and centers from adjacent water", () => {
    const terrain = terrainFixture(3, 3, 1);
    terrain.biomes[1] = 0;
    expect(beachFrameIndexAt(terrain, 1, 1)).toBe(1);
    terrain.biomes[3] = 0;
    expect(beachFrameIndexAt(terrain, 1, 1)).toBe(0);
    terrain.biomes[1] = 1;
    terrain.biomes[3] = 1;
    expect(beachFrameIndexAt(terrain, 1, 1)).toBe(4);
  });

  it("fills diagonal shoreline notches with the authored inverse corners", () => {
    const terrain = terrainFixture(3, 3, 1);
    terrain.biomes[8] = 0;
    expect(shorelineInsetFrameIndicesAt(terrain, 1, 1)).toEqual([0]);
    terrain.biomes[8] = 1;
    terrain.biomes[6] = 0;
    expect(shorelineInsetFrameIndicesAt(terrain, 1, 1)).toEqual([1]);
    terrain.biomes[6] = 1;
    terrain.biomes[2] = 0;
    expect(shorelineInsetFrameIndicesAt(terrain, 1, 1)).toEqual([2]);
    terrain.biomes[2] = 1;
    terrain.biomes[0] = 0;
    expect(shorelineInsetFrameIndicesAt(terrain, 1, 1)).toEqual([3]);
    terrain.biomes[1] = 0;
    expect(shorelineInsetFrameIndicesAt(terrain, 1, 1)).toEqual([]);
    terrain.biomes[1] = 1;
    terrain.biomes[0] = 1;
    terrain.biomes[6] = 0;
    terrain.biomes[8] = 0;
    expect(shorelineInsetFrameIndicesAt(terrain, 1, 1)).toEqual([0, 1]);
  });

  it("uses the 47-frame grass fringe only on the landward side of beaches", () => {
    const terrain = terrainFixture(5, 5, 1);
    expect(grassSandTransitionFrameIndexAt(terrain, 2, 2)).toBeNull();
    terrain.biomes[2 * terrain.width + 3] = 4;
    expect(grassSandTransitionFrameIndexAt(terrain, 2, 2)).not.toBeNull();
    terrain.biomes[2 * terrain.width + 3] = 1;
    terrain.biomes[1 * terrain.width + 2] = 0;
    expect(grassSandTransitionFrameIndexAt(terrain, 2, 2)).toBeNull();
  });

  it('frames paving edges and diagonal grass notches without fringing bridge water',()=>{
    const terrain=terrainFixture(3,3,SURVIVAL_BIOMES.indexOf('paving'));
    expect(pavingGrassTransitionFrameIndexAt(terrain,1,1)).toBeNull();
    terrain.biomes[0]=SURVIVAL_BIOMES.indexOf('meadow');
    const insideCorner=pavingGrassTransitionFrameIndexAt(terrain,1,1);
    expect(insideCorner).not.toBeNull();
    terrain.biomes[1]=SURVIVAL_BIOMES.indexOf('meadow');
    expect(pavingGrassTransitionFrameIndexAt(terrain,1,1)).not.toBe(insideCorner);
    terrain.biomes.fill(SURVIVAL_BIOMES.indexOf('water'));
    terrain.biomes[4]=SURVIVAL_BIOMES.indexOf('paving');
    expect(pavingGrassTransitionFrameIndexAt(terrain,1,1)).toBeNull();
    terrain.biomes.fill(SURVIVAL_BIOMES.indexOf('meadow'));
    terrain.biomes[4]=SURVIVAL_BIOMES.indexOf('paving');
    expect(pavingGrassTransitionFrameIndexAt(terrain,1,1)).toBe(0);
    expect(pavingGrassTransitionFrameIndexAt(terrain,0,0)).toBeNull();
  });

  it("uses the desert pack edge and inverse-corner grass transitions", () => {
    const terrain = terrainFixture(3, 3, 10);
    expect(desertGrassEdgeFrameIndexAt(terrain, 1, 1)).toBe(4);
    terrain.biomes[1] = 15;
    expect(desertGrassEdgeFrameIndexAt(terrain, 1, 1)).toBe(1);
    terrain.biomes[1] = 10;
    terrain.biomes[8] = 15;
    expect(desertGrassEdgeFrameIndexAt(terrain, 1, 1)).toBe(4);
    expect(desertGrassInsetFrameIndicesAt(terrain, 1, 1)).toEqual([0]);
  });

  it("blends the humid side of savanna while leaving its desert side untouched", () => {
    const terrain = terrainFixture(5, 5, 15);
    expect(savannaGrassTransitionFrameIndexAt(terrain, 2, 2)).toBeNull();
    terrain.biomes[2 * terrain.width + 3] = 4;
    expect(savannaGrassTransitionFrameIndexAt(terrain, 2, 2)).not.toBeNull();
    terrain.biomes[2 * terrain.width + 3] = 10;
    expect(savannaGrassTransitionFrameIndexAt(terrain, 2, 2)).toBeNull();
  });

  it("maps organic plateaus and their ramps onto the authored raised stone-cliff topology", () => {
    const terrain = terrainFixture(5, 5);
    for (let tileY = 1; tileY <= 3; tileY += 1) {
      for (let tileX = 1; tileX <= 3; tileX += 1)
        terrain.elevations[tileY * terrain.width + tileX] = 1;
    }
    expect(plateauEdgeFrameIndexAt(terrain, 2, 1)).toBe(2);
    expect(plateauEdgeFrameIndexAt(terrain, 1, 2)).toBe(15);
    expect(plateauEdgeFrameIndexAt(terrain, 3, 2)).toBe(17);
    expect(plateauEdgeFrameIndexAt(terrain, 3, 3)).toBe(31);
    expect(plateauEdgeFrameIndexAt(terrain, 2, 2)).toBeNull();
    expect(plateauEdgeFrameIndexAt(terrain, 0, 0)).toBeNull();
    const withRamp: TerrainArray = {
      ...terrain,
      terrainTransitions: [0, 1].map((lane) => ({
        contourLevel: 1,
        kind: 'slope' as const,
        direction: 'up' as const,
        lowerTileX: 1 + lane,
        lowerTileY: 4,
        upperTileX: 1 + lane,
        upperTileY: 3,
      })),
    };
    expect(plateauEdgeFrameIndexAt(withRamp, 1, 3)).toBeNull();
    // Outdoor crossings now resolve dedicated width-aware ramp banks in the
    // depth pass; the retired 2x2 notch must never leak through this legacy API.
    expect(plateauRampFrameIndexAt(withRamp, 1, 3)).toBeNull();
    expect(plateauRampFrameIndexAt(withRamp, 2, 3)).toBeNull();
    expect(plateauLayerPlansAt(withRamp, 1, 3)[0]?.plan.rampRole).toBe('ramp_top_left');
    expect(plateauLayerPlansAt(withRamp, 2, 3)[0]?.plan.rampRole).toBe('ramp_top_right');
    expect(plateauBackgroundFrameIndicesAt(terrain, 3, 4)).toEqual([59]);
  });

  it("World/Map & Terrain: derives nested cliff plans from integer elevation alone", () => {
    const terrain = terrainFixture(7, 7);
    const index = (x: number, y: number): number => y * terrain.width + x;
    for (let y = 1; y <= 5; y += 1)
      for (let x = 1; x <= 5; x += 1) {
        terrain.elevations[index(x, y)] = 1;
      }
    for (let y = 2; y <= 4; y += 1)
      for (let x = 2; x <= 4; x += 1) {
        terrain.elevations[index(x, y)] = 2;
      }
    terrain.elevations[index(3, 3)] = 3;

    expect(
      plateauLayerPlansAt(terrain, 3, 3).map(
        ({ contourLevel }) => contourLevel,
      ),
    ).toEqual([3]);
    expect(
      plateauLayerPlansAt(terrain, 3, 4).map(
        ({ contourLevel }) => contourLevel,
      ),
    ).toEqual([2, 3]);
    expect(
      plateauLayerPlansAt(terrain, 3, 5).map(
        ({ contourLevel }) => contourLevel,
      ),
    ).toEqual([1, 2, 3]);
  });

  it("World/Map & Terrain: projects painter depth by logical elevation, not blocking rows", () => {
    const terrain = terrainFixture(3, 3);
    terrain.elevations[4] = 2;
    expect(terrainProjectedDepthAtFoot(terrain, 24, 24)).toBe(32);
    expect(terrainProjectedWorldYAtFoot(terrain, 24, 24)).toBe(-8);
    expect(terrainProjectedDepthAtFoot(terrain, 8, 8)).toBe(0);
    expect(terrainProjectedWorldYAtFoot(terrain, 8, 8)).toBe(8);
  });

  it("projects negative terrain downward from the family base datum", () => {
    const terrain = terrainFixture(3, 3);
    terrain.elevations[4] = -2;
    expect(terrainProjectedDepthAtFoot(terrain, 24, 24)).toBe(-32);
    expect(terrainProjectedWorldYAtFoot(terrain, 24, 24)).toBe(56);
  });

  it("World/Map & Terrain: samples player projection at the same shoe contact used by movement", () => {
    const terrain = terrainFixture(3, 3);
    terrain.elevations[2 * terrain.width + 1] = 1;
    const authorityAnchorY = 32.5;
    expect(terrainProjectedDepthAtFoot(terrain, 24, authorityAnchorY)).toBe(16);
    expect(
      terrainProjectedDepthAtFoot(
        terrain,
        24,
        terrainContactWorldYForPlayer(authorityAnchorY),
      ),
    ).toBe(0);
  });

  it("World/Map & Terrain: exposes strict contour walls and exact transition openings to the debug view", () => {
    const terrain = terrainFixture(3, 3);
    terrain.elevations[4] = 1;
    expect(terrainContourBoundaryBetween(terrain, 1, 2, 1, 1)).toBe("blocked");
    expect(terrainContourBoundaryBetween(terrain, 0, 2, 1, 2)).toBe("none");

    const terrainWithTransition: TerrainArray = {
      ...terrain,
      terrainTransitions: [
        {
          contourLevel: 1,
          kind: "slope",
          direction: "up",
          lowerTileX: 1,
          lowerTileY: 2,
          upperTileX: 1,
          upperTileY: 1,
        },
      ],
    };
    expect(
      terrainContourBoundaryBetween(terrainWithTransition, 1, 2, 1, 1),
    ).toBe("transition");
    expect(
      terrainContourBoundaryBetween(terrainWithTransition, 1, 1, 1, 2),
    ).toBe("transition");
    expect(terrainProjectedElevationAtFoot(terrainWithTransition, 24, 40)).toBe(
      0,
    );
    expect(terrainProjectedElevationAtFoot(terrainWithTransition, 24, 32)).toBe(
      0.5,
    );
    expect(terrainProjectedElevationAtFoot(terrainWithTransition, 24, 24)).toBe(
      1,
    );
    expect(terrainProjectedDepthAtFoot(terrainWithTransition, 24, 32)).toBe(8);
  });

  it("World/Map & Terrain: raising then lowering an editor cell restores identical contour plans", () => {
    const terrain = terrainFixture(5, 5);
    const index = (x: number, y: number): number => y * terrain.width + x;
    for (let y = 1; y <= 3; y += 1)
      for (let x = 1; x <= 3; x += 1) {
        terrain.elevations[index(x, y)] = 1;
      }
    const before = JSON.stringify(plateauLayerPlansAt(terrain, 2, 3));
    terrain.elevations[index(2, 2)] = 2;
    invalidateTerrainElevationCaches(terrain);
    expect(
      plateauLayerPlansAt(terrain, 2, 3).some(
        ({ contourLevel }) => contourLevel === 2,
      ),
    ).toBe(true);
    terrain.elevations[index(2, 2)] = 1;
    invalidateTerrainElevationCaches(terrain);
    expect(JSON.stringify(plateauLayerPlansAt(terrain, 2, 3))).toBe(before);
  });

  it("layers a projected wall and inverse corner behind a continuing plateau step", () => {
    const terrain = terrainFixture(6, 6);
    const index = (x: number, y: number): number => y * terrain.width + x;
    terrain.elevations[index(1, 1)] = 1;
    terrain.elevations[index(2, 1)] = 1;
    terrain.elevations[index(2, 2)] = 1;
    terrain.elevations[index(2, 3)] = 1;
    expect(plateauBackgroundFrameIndicesAt(terrain, 1, 2)).toEqual([57]);
    expect(plateauBackgroundFrameIndicesAt(terrain, 2, 2)).toEqual([59]);
    expect(plateauBackgroundFrameIndicesAt(terrain, 2, 3)).toEqual([73]);
    expect(plateauBackgroundFrameIndicesAt(terrain, 2, 4)).toEqual([57]);
    expect(plateauEdgeFrameIndexAt(terrain, 2, 2)).toBe(15);
    expect(plateauForegroundFrameIndicesAt(terrain, 2, 1)).toEqual([1]);
    expect(plateauForegroundFrameIndicesAt(terrain, 2, 2)).toEqual([]);
    expect(plateauForegroundFrameIndicesAt(terrain, 2, 1)).toEqual([1]);

    terrain.elevations[index(2, 2)] = 0;
    terrain.elevations[index(2, 1)] = 0;
    expect(plateauBackgroundFrameIndicesAt(terrain, 2, 2)).toEqual([]);
    expect(plateauForegroundFrameIndicesAt(terrain, 2, 2)).toEqual([]);
  });

  it("pairs outward side steps with their mirrored lower inverse corners", () => {
    const terrain = terrainFixture(6, 5);
    const index = (x: number, y: number): number => y * terrain.width + x;
    terrain.elevations[index(2, 1)] = 1;
    terrain.elevations[index(1, 2)] = 1;
    terrain.elevations[index(2, 2)] = 1;
    terrain.elevations[index(0, 3)] = 1;
    terrain.elevations[index(1, 3)] = 1;
    terrain.elevations[index(2, 3)] = 1;
    expect(plateauForegroundFrameIndicesAt(terrain, 2, 2)).toEqual([3]);
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 3)).toEqual([3]);

    terrain.elevations.fill(0);
    terrain.elevations[index(3, 1)] = 1;
    terrain.elevations[index(3, 2)] = 1;
    terrain.elevations[index(4, 2)] = 1;
    terrain.elevations[index(3, 3)] = 1;
    terrain.elevations[index(4, 3)] = 1;
    terrain.elevations[index(5, 3)] = 1;
    expect(plateauForegroundFrameIndicesAt(terrain, 3, 2)).toEqual([2]);
    expect(plateauForegroundFrameIndicesAt(terrain, 4, 3)).toEqual([2]);
  });

  it("fills every diagonal inset in a stepped plateau boundary", () => {
    const terrain = terrainFixture(3, 3);
    const index = (x: number, y: number): number => y * terrain.width + x;
    const center = index(1, 1);
    terrain.elevations.fill(1);

    terrain.elevations[index(0, 0)] = 0;
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 1)).toEqual([3]);

    terrain.elevations.fill(1);
    terrain.elevations[index(2, 0)] = 0;
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 1)).toEqual([2]);

    terrain.elevations.fill(1);
    terrain.elevations[index(0, 2)] = 0;
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 1)).toEqual([1]);

    terrain.elevations.fill(1);
    terrain.elevations[index(2, 2)] = 0;
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 1)).toEqual([0]);

    terrain.elevations.fill(1);
    terrain.elevations[index(0, 0)] = 0;
    terrain.elevations[index(2, 0)] = 0;
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 1)).toEqual([3, 2]);
    expect(terrain.blocked[center]).toBe(false);
  });

  it("does not project a stone face through a normal diagonal inset", () => {
    const terrain = terrainFixture(5, 4);
    const index = (x: number, y: number): number => y * terrain.width + x;
    terrain.elevations[index(2, 0)] = 1;
    terrain.elevations[index(3, 0)] = 1;
    terrain.elevations[index(2, 1)] = 1;
    terrain.elevations[index(2, 2)] = 1;
    terrain.elevations[index(3, 2)] = 1;

    expect(plateauForegroundFrameIndicesAt(terrain, 2, 2)).toEqual([2]);
    expect(plateauBackgroundFrameIndicesAt(terrain, 2, 2)).toEqual([]);
    expect(plateauBackgroundFrameIndicesAt(terrain, 2, 3)).toEqual([]);
  });

  it("keeps every generated inverse-corner overlay on walkable plateau terrain", () => {
    const terrain = terrainForWorld(0x4f434852, 16);
    const frameCounts = [0, 0, 0, 0];
    for (let tileY = 0; tileY < terrain.height; tileY += 1) {
      for (let tileX = 0; tileX < terrain.width; tileX += 1) {
        const frames = plateauForegroundFrameIndicesAt(terrain, tileX, tileY);
        if (frames.length === 0) continue;
        for (const frame of frames)
          frameCounts[frame] = (frameCounts[frame] ?? 0) + 1;
        expect(terrain.blocked[tileY * terrain.width + tileX]).toBe(false);
        expect(plateauBackgroundFrameIndicesAt(terrain, tileX, tileY)).toEqual(
          [],
        );
      }
    }
    expect(frameCounts.every((count) => count > 0)).toBe(true);
  });

  it("does not invent side-cap underlays at the live trailing diagonals", () => {
    const terrain = terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION);
    const cases = [
      { tileX: 389, tileY: 329, edgeRole: "right" },
      { tileX: 353, tileY: 336, edgeRole: "left" },
    ] as const;
    for (const { tileX, tileY, edgeRole } of cases) {
      const plan = plateauLayerPlansAt(terrain, tileX, tileY)
        .find(({ contourLevel }) => contourLevel === 1)?.plan;
      expect(plan).toBeDefined();
      expect(plan?.edgeRole).toBe(edgeRole);
      expect(plan?.edgeSeamUnderlayFrame).toBeUndefined();
    }
  }, 20_000);

  it("matches the fixed live-island resolver-plan golden", () => {
    const terrain = terrainForWorld(0x4f434852, 16);
    const golden = JSON.parse(islandContourGoldenText) as {
      readonly window: {
        readonly minimumTileX: number;
        readonly minimumTileY: number;
        readonly width: number;
        readonly height: number;
      };
      readonly planTileCount: number;
      readonly roleCounts: { readonly edges: number; readonly insets: number; readonly ramps: number; readonly faces: number };
      readonly fnv1a32: string;
    };
    const plans: unknown[] = [];
    const roleCounts = { edges: 0, insets: 0, ramps: 0, faces: 0 };
    for (let tileY = golden.window.minimumTileY;
      tileY < golden.window.minimumTileY + golden.window.height; tileY += 1) {
      for (let tileX = golden.window.minimumTileX;
        tileX < golden.window.minimumTileX + golden.window.width; tileX += 1) {
        const entries = plateauLayerPlansAt(terrain, tileX, tileY);
        if (entries.length === 0) continue;
        const normalized = entries.map(({ contourLevel, plan }) => {
          roleCounts.edges += Number(plan.edgeRole !== null);
          roleCounts.insets += plan.insetRoles.length;
          roleCounts.ramps += Number(plan.rampRole !== null);
          roleCounts.faces += plan.faceLayers.length;
          return [
            contourLevel,
            plan.edgeRole,
            plan.edgeFrame,
            plan.insetRoles,
            plan.insetFrames,
            plan.rampRole,
            plan.rampFrame,
            plan.faceLayers.map(({ rowId, join, frame, direct }) => [rowId, join, frame, direct]),
            plan.blocksMovement,
            plan.blocksLight,
          ];
        });
        plans.push([tileX, tileY, terrainElevationAtWorldFoot(
          terrain,
          (tileX + 0.5) * 16,
          (tileY + 1) * 16,
        ), normalized]);
      }
    }
    const serialized = JSON.stringify({ window: golden.window, plans });
    expect(plans).toHaveLength(golden.planTileCount);
    expect(roleCounts).toEqual(golden.roleCounts);
    // The golden changes only because outdoor rampFrame values are now null:
    // the renderer selects dedicated bank frames from rampRole + lane width.
    expect(fnv1a32(serialized)).toBe(golden.fnv1a32);
  });

  it("blocks stone face roles while keeping caps and authored trim walkable", () => {
    const terrain = terrainForWorld(0x4f434852, 16);
    for (let tileY = 0; tileY < terrain.height; tileY += 1) {
      for (let tileX = 0; tileX < terrain.width; tileX += 1) {
        for (const { plan } of plateauLayerPlansAt(terrain, tileX, tileY)) {
          const directStoneFace = plan.faceLayers.some(
            (face) => face.direct && face.rowId !== "foot",
          );
          expect(plan.blocksMovement).toBe(directStoneFace);
          if (directStoneFace) expect(plan.blocksLight).toBe(true);
        }
      }
    }
  }, 20_000);

  it("maps shallow dirt terraces onto the same connected topology with their own ramp", () => {
    const terrain = terrainFixture(5, 5, 17);
    for (let tileY = 1; tileY <= 3; tileY += 1) {
      for (let tileX = 1; tileX <= 3; tileX += 1)
        terrain.dirtTerraces[tileY * terrain.width + tileX] = 1;
    }
    expect(dirtTerraceFrameIndexAt(terrain, 2, 2)).toBe(46);
    const setRole = (
      x: number,
      y: number,
      role: (typeof SURVIVAL_DIRT_CLIFF_ROLES)[number],
    ): void => {
      terrain.dirtCliffRoles[y * terrain.width + x] =
        SURVIVAL_DIRT_CLIFF_ROLES.indexOf(role);
    };
    setRole(1, 2, "ramp_top_left");
    setRole(2, 2, "ramp_top_right");
    setRole(1, 3, "ramp_bottom_left");
    setRole(2, 3, "ramp_bottom_right");
    expect(dirtTerraceFrameIndexAt(terrain, 1, 2)).toBeNull();
    expect(dirtTerraceRampFrameIndexAt(terrain, 1, 2)).toBe(0);
    expect(dirtTerraceRampFrameIndexAt(terrain, 2, 2)).toBe(1);
    expect(dirtTerraceRampFrameIndexAt(terrain, 1, 3)).toBe(2);
    expect(dirtTerraceRampFrameIndexAt(terrain, 2, 3)).toBe(3);
  });

  it('maps authored farmland through bounded blob topology without creating soil state', () => {
    const mask = new Uint8Array(25);
    const terrain: TerrainArray = { ...terrainFixture(5, 5, 4), authoredFarmland: mask };
    mask[2 * terrain.width + 2] = 1;
    expect(authoredFarmlandFrameIndexAt(terrain, 2, 2)).toBe(0);
    expect(authoredFarmlandFrameIndexAt(terrain, 1, 2)).toBeNull();

    for (let tileY = 1; tileY <= 3; tileY += 1) {
      for (let tileX = 1; tileX <= 3; tileX += 1) {
        mask[tileY * terrain.width + tileX] = 1;
      }
    }
    expect(authoredFarmlandFrameIndexAt(terrain, 2, 2)).toBe(46);
  });

  it('keeps river mouths open where freshwater meets the sea',()=>{
    const river=terrainFixture(3,3,2);
    river.biomes[6]=0;river.biomes[7]=0;river.biomes[8]=0;
    expect(freshwaterFrameIndexAt(river,1,1)).toBe(4);
    expect(freshwaterInsetFrameIndicesAt(river,1,1)).toEqual([]);
  });

  it("selects grass-edged freshwater and authored waterfall strips", () => {
    const pond = terrainFixture(3, 3, 2);
    expect(freshwaterFrameIndexAt(pond, 1, 1)).toBe(4);
    pond.biomes[1] = 4;
    expect(freshwaterFrameIndexAt(pond, 1, 1)).toBe(1);
    pond.biomes[3] = 4;
    expect(freshwaterFrameIndexAt(pond, 1, 1)).toBe(0);

    const innerCorner = terrainFixture(3, 3, 2);
    innerCorner.biomes[0] = 4;
    expect(freshwaterFrameIndexAt(innerCorner, 1, 1)).toBe(4);
    expect(freshwaterInsetFrameIndicesAt(innerCorner, 1, 1)).toEqual([3]);
    innerCorner.biomes[0] = 2;
    innerCorner.biomes[2] = 4;
    expect(freshwaterFrameIndexAt(innerCorner, 1, 1)).toBe(4);
    expect(freshwaterInsetFrameIndicesAt(innerCorner, 1, 1)).toEqual([2]);
    innerCorner.biomes[2] = 2;
    innerCorner.biomes[6] = 4;
    expect(freshwaterFrameIndexAt(innerCorner, 1, 1)).toBe(4);
    expect(freshwaterInsetFrameIndicesAt(innerCorner, 1, 1)).toEqual([1]);
    innerCorner.biomes[6] = 2;
    innerCorner.biomes[8] = 4;
    expect(freshwaterFrameIndexAt(innerCorner, 1, 1)).toBe(4);
    expect(freshwaterInsetFrameIndicesAt(innerCorner, 1, 1)).toEqual([0]);

    innerCorner.biomes[0] = 4;
    expect(freshwaterInsetFrameIndicesAt(innerCorner, 1, 1)).toEqual([0, 3]);

    const falls = terrainFixture(3, 5, 3);
    expect(waterfallFrameIndexAt(falls, 1, 0)).toBe(1);
    expect(waterfallFrameIndexAt(falls, 1, 2)).toBe(7);
    expect(waterfallFrameIndexAt(falls, 0, 2)).toBe(6);
    expect(waterfallFrameIndexAt(falls, 1, 4)).toBe(13);
  });

  it("composes both inverse banks when a narrow river bends across a chunk seam", () => {
    const terrain = terrainFixture(34, 5, 2);
    const seamTileX = 16;
    const seamTileY = 2;
    terrain.biomes[(seamTileY - 1) * terrain.width + seamTileX - 1] = 4;
    terrain.biomes[(seamTileY + 1) * terrain.width + seamTileX + 1] = 4;

    expect(freshwaterFrameIndexAt(terrain, seamTileX, seamTileY)).toBe(4);
    expect(
      freshwaterInsetFrameIndicesAt(terrain, seamTileX, seamTileY),
    ).toEqual([0, 3]);
  });

  it("keeps water decoration off every bank and inner-corner tile", () => {
    const water = terrainFixture(5, 5, 2);
    expect(waterDecorationAllowedAt(water, 2, 2)).toBe(true);
    water.biomes[2 * water.width + 3] = 4;
    expect(waterDecorationAllowedAt(water, 2, 2)).toBe(false);
    water.biomes[2 * water.width + 3] = 2;
    water.biomes[1 * water.width + 1] = 4;
    expect(waterDecorationAllowedAt(water, 2, 2)).toBe(false);
  });

  it("selects one animated waterfall overlay and keeps animated rocks off banks", () => {
    const falls = terrainFixture(7, 9);
    for (let tileY = 2; tileY < 7; tileY += 1) {
      for (let tileX = 2; tileX < 5; tileX += 1)
        falls.biomes[tileY * falls.width + tileX] = 3;
    }
    expect(waterfallTopLeftAt(falls, 2, 2)).toBe(true);
    expect(waterfallTopLeftAt(falls, 3, 2)).toBe(false);
    expect(waterfallTopLeftAt(falls, 2, 3)).toBe(false);

    const water = terrainFixture(96, 96, 2);
    let animatedRock: readonly [number, number] | null = null;
    for (let tileY = 2; tileY < 94 && animatedRock === null; tileY += 1) {
      for (let tileX = 2; tileX < 94; tileX += 1) {
        if (animatedWaterRockAllowedAt(water, tileX, tileY)) {
          animatedRock = [tileX, tileY];
          break;
        }
      }
    }
    expect(animatedRock).not.toBeNull();
    if (animatedRock === null) return;
    const [tileX, tileY] = animatedRock;
    water.biomes[tileY * water.width + tileX + 1] = 4;
    expect(animatedWaterRockAllowedAt(water, tileX, tileY)).toBe(false);
  });

});
