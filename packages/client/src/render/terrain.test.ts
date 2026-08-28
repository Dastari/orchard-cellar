import {
  SURVIVAL_CLIFF_ROLES,
  SURVIVAL_DIRT_CLIFF_ROLES,
  SURVIVAL_WORLD_SIZE,
  DEBUG_SPACE_ID,
  CELLAR_SIZE_TILES,
  spaceDefinitionFor,
  survivalTerrainBlocksTraversalAt,
} from "@orchard/sim";
import { describe, expect, it } from "vitest";
import {
  beachFrameIndexAt,
  cellarWallSourceAtProjectedTile,
  animatedWaterRockAllowedAt,
  cliffFrameIndexAt,
  desertCliffFrameIndexAt,
  desertGrassEdgeFrameIndexAt,
  desertGrassInsetFrameIndicesAt,
  dirtTerraceFrameIndexAt,
  dirtTerraceRampFrameIndexAt,
  freshwaterFrameIndexAt,
  freshwaterInsetFrameIndicesAt,
  grassSandTransitionFrameIndexAt,
  plateauBackgroundFrameIndicesAt,
  plateauEdgeFrameIndexAt,
  plateauForegroundFrameIndicesAt,
  plateauLayerPlanAt,
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
  grassTuftAllowedAt,
  terrainProjectedWorldYAtFoot,
  waterDecorationAllowedAt,
  waterfallTopLeftAt,
  waterfallFrameIndexAt,
  type TerrainArray,
} from "./terrain.js";

function terrainFixture(width: number, height: number, fill = 4): TerrainArray {
  const elevations = new Uint8Array(width * height);
  return {
    spaceId: 0,
    seed: 1,
    version: 1,
    width,
    height,
    biomes: Uint8Array.from({ length: width * height }, () => fill),
    blocked: Array.from({ length: width * height }, () => false),
    horseJumpableTerrain: Array.from({ length: width * height }, () => false),
    cliffRoles: new Uint8Array(width * height),
    elevations,
    plateaus: elevations,
    dirtCliffRoles: new Uint8Array(width * height),
    dirtTerraces: new Uint8Array(width * height),
  };
}

describe("shared client terrain array", () => {
  it("projects cellar solid rock as a two-row front-facing cave wall", () => {
    expect(CAVE_RAISED_CLIFF_TILE_SET.faceProfiles.tall?.rows).toEqual([
      {
        id: "wall",
        frames: [42, 43, 44],
        blocksMovement: true,
        blocksLight: true,
      },
      {
        id: "lower_wall",
        frames: [49, 50, 51],
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
    expect(terrainProjectedRowsPerLevel(cellar)).toBe(2);
    expect(terrainVisualProjectionRowsPerLevel(cellar)).toBe(0);
    expect(terrainElevationAtWorldFoot(cellar, 8, 8)).toBe(0);
    expect(terrainProjectedElevationAtFoot(cellar, 8, 8)).toBe(0);
    expect(terrainProjectedDepthAtFoot(cellar, 8, 8)).toBe(0);
    expect(terrainProjectedRowsPerLevel()).toBe(2);
    expect(plateauLayerPlansAt(cellar, 0, 0)).toEqual([]);
  });

  it("maps both courses of a projected cave face back to its solid source", () => {
    const width = 7;
    const height = 7;
    const blocked = Array<boolean>(width * height).fill(true);
    const elevations = new Uint8Array(width * height).fill(1);
    for (let y = 3; y < height; y += 1) for (let x = 1; x < width - 1; x += 1) {
      blocked[y * width + x] = false;
      elevations[y * width + x] = 0;
    }
    const cellar: TerrainArray = {
      ...terrainFixture(width, height),
      generator: "cellar",
      blocked,
      elevations,
      plateaus: elevations,
    };
    expect(cellarWallSourceAtProjectedTile(cellar, 3, 2)).toEqual({ tileX: 3, tileY: 2 });
    expect(cellarWallSourceAtProjectedTile(cellar, 3, 3)).toEqual({ tileX: 3, tileY: 2 });
    expect(cellarWallSourceAtProjectedTile(cellar, 3, 4)).toEqual({ tileX: 3, tileY: 2 });
    expect(cellarWallSourceAtProjectedTile(cellar, 3, 5)).toBeNull();
  });

  it("does not inherit outdoor grass tufts in indoor or underground spaces", () => {
    const base = terrainFixture(8, 8);
    for (let y = 0; y < base.height; y += 1) for (let x = 0; x < base.width; x += 1) {
      expect(grassTuftAllowedAt({ ...base, generator: "residence" }, x, y)).toBe(false);
      expect(grassTuftAllowedAt({ ...base, generator: "cellar" }, x, y)).toBe(false);
    }
  });

  it("applies sparse cellar excavation without mutating generator terrain", () => {
    const base = terrainFixture(4, 4);
    const solid = {
      ...base,
      generator: "cellar" as const,
      blocked: Array<boolean>(16).fill(true),
      elevations: new Uint8Array(16).fill(1),
      plateaus: new Uint8Array(16).fill(1),
    };
    const dynamic = terrainWithCellarExcavations(solid, [{ tileX: 2, tileY: 1 }], 7);
    expect(dynamic.blocked[6]).toBe(false);
    expect(dynamic.elevations[6]).toBe(0);
    expect(solid.blocked[6]).toBe(true);
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

  it("26§13 keys terrain classification by space and builds the flat debug bounds", () => {
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
    const role = (
      x: number,
      y: number,
      value: (typeof SURVIVAL_CLIFF_ROLES)[number],
    ): void => {
      terrain.cliffRoles[y * terrain.width + x] =
        SURVIVAL_CLIFF_ROLES.indexOf(value);
    };
    for (let tileY = 1; tileY <= 3; tileY += 1) {
      for (let tileX = 1; tileX <= 3; tileX += 1)
        terrain.plateaus[tileY * terrain.width + tileX] = 1;
    }
    role(2, 1, "top");
    role(1, 2, "left");
    role(3, 2, "right");
    role(3, 3, "bottom");
    expect(plateauEdgeFrameIndexAt(terrain, 2, 1)).toBe(2);
    expect(plateauEdgeFrameIndexAt(terrain, 1, 2)).toBe(15);
    expect(plateauEdgeFrameIndexAt(terrain, 3, 2)).toBe(17);
    expect(plateauEdgeFrameIndexAt(terrain, 3, 3)).toBe(31);
    expect(plateauEdgeFrameIndexAt(terrain, 2, 2)).toBeNull();
    expect(plateauEdgeFrameIndexAt(terrain, 0, 0)).toBeNull();
    role(1, 2, "ramp_top_left");
    role(2, 2, "ramp_top_right");
    role(1, 3, "ramp_bottom_left");
    role(2, 3, "ramp_bottom_right");
    expect(plateauEdgeFrameIndexAt(terrain, 1, 2)).toBeNull();
    expect(plateauRampFrameIndexAt(terrain, 1, 2)).toBe(0);
    expect(plateauRampFrameIndexAt(terrain, 2, 2)).toBe(1);
    expect(plateauRampFrameIndexAt(terrain, 1, 3)).toBe(2);
    expect(plateauRampFrameIndexAt(terrain, 2, 3)).toBe(3);
    expect(plateauBackgroundFrameIndicesAt(terrain, 3, 4)).toEqual([43]);
  });

  it("30§3 derives nested cliff plans from integer elevation alone", () => {
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

  it("30§5 projects painter depth by logical elevation, not blocking rows", () => {
    const terrain = terrainFixture(3, 3);
    terrain.elevations[4] = 2;
    expect(terrainProjectedDepthAtFoot(terrain, 24, 24)).toBe(64);
    expect(terrainProjectedWorldYAtFoot(terrain, 24, 24)).toBe(-40);
    expect(terrainProjectedDepthAtFoot(terrain, 8, 8)).toBe(0);
    expect(terrainProjectedWorldYAtFoot(terrain, 8, 8)).toBe(8);
  });

  it("30§5 samples player projection at the same shoe contact used by movement", () => {
    const terrain = terrainFixture(3, 3);
    terrain.elevations[2 * terrain.width + 1] = 1;
    const authorityAnchorY = 32.5;
    expect(terrainProjectedDepthAtFoot(terrain, 24, authorityAnchorY)).toBe(32);
    expect(
      terrainProjectedDepthAtFoot(
        terrain,
        24,
        terrainContactWorldYForPlayer(authorityAnchorY),
      ),
    ).toBe(0);
  });

  it("30§5 exposes strict contour walls and exact transition openings to the debug view", () => {
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
    expect(terrainProjectedDepthAtFoot(terrainWithTransition, 24, 32)).toBe(16);
  });

  it("30§7 raising then lowering an editor cell restores identical contour plans", () => {
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
    terrain.plateaus[index(1, 1)] = 1;
    terrain.plateaus[index(2, 1)] = 1;
    terrain.plateaus[index(2, 2)] = 1;
    terrain.plateaus[index(2, 3)] = 1;
    terrain.cliffRoles[index(1, 1)] =
      SURVIVAL_CLIFF_ROLES.indexOf("bottom_left");
    terrain.cliffRoles[index(2, 2)] = SURVIVAL_CLIFF_ROLES.indexOf("left");
    terrain.cliffRoles[index(2, 3)] =
      SURVIVAL_CLIFF_ROLES.indexOf("bottom_left");

    expect(plateauBackgroundFrameIndicesAt(terrain, 1, 2)).toEqual([43]);
    expect(plateauBackgroundFrameIndicesAt(terrain, 2, 2)).toEqual([45]);
    expect(plateauBackgroundFrameIndicesAt(terrain, 2, 3)).toEqual([59]);
    expect(plateauBackgroundFrameIndicesAt(terrain, 2, 4)).toEqual([73, 43]);
    expect(plateauEdgeFrameIndexAt(terrain, 2, 2)).toBe(15);
    expect(plateauForegroundFrameIndicesAt(terrain, 2, 1)).toEqual([1]);
    expect(plateauForegroundFrameIndicesAt(terrain, 2, 2)).toEqual([]);
    terrain.cliffRoles[index(2, 2)] =
      SURVIVAL_CLIFF_ROLES.indexOf("bottom_left");
    expect(plateauForegroundFrameIndicesAt(terrain, 2, 1)).toEqual([1]);

    terrain.plateaus[index(2, 2)] = 0;
    terrain.plateaus[index(2, 1)] = 0;
    expect(plateauBackgroundFrameIndicesAt(terrain, 2, 2)).toEqual([]);
    expect(plateauForegroundFrameIndicesAt(terrain, 2, 2)).toEqual([]);
  });

  it("pairs outward side steps with their mirrored lower inverse corners", () => {
    const terrain = terrainFixture(6, 5);
    const index = (x: number, y: number): number => y * terrain.width + x;
    const setRole = (
      x: number,
      y: number,
      role: (typeof SURVIVAL_CLIFF_ROLES)[number],
    ): void => {
      terrain.cliffRoles[index(x, y)] = SURVIVAL_CLIFF_ROLES.indexOf(role);
    };

    terrain.plateaus[index(2, 1)] = 1;
    terrain.plateaus[index(1, 2)] = 1;
    terrain.plateaus[index(2, 2)] = 1;
    terrain.plateaus[index(0, 3)] = 1;
    terrain.plateaus[index(1, 3)] = 1;
    terrain.plateaus[index(2, 3)] = 1;
    setRole(2, 1, "left");
    setRole(1, 2, "top_left");
    setRole(0, 3, "top_left");
    expect(plateauForegroundFrameIndicesAt(terrain, 2, 2)).toEqual([3]);
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 3)).toEqual([3]);

    terrain.plateaus.fill(0);
    terrain.cliffRoles.fill(0);
    terrain.plateaus[index(3, 1)] = 1;
    terrain.plateaus[index(3, 2)] = 1;
    terrain.plateaus[index(4, 2)] = 1;
    terrain.plateaus[index(3, 3)] = 1;
    terrain.plateaus[index(4, 3)] = 1;
    terrain.plateaus[index(5, 3)] = 1;
    setRole(3, 1, "right");
    setRole(4, 2, "top_right");
    setRole(5, 3, "top_right");
    expect(plateauForegroundFrameIndicesAt(terrain, 3, 2)).toEqual([2]);
    expect(plateauForegroundFrameIndicesAt(terrain, 4, 3)).toEqual([2]);
  });

  it("fills every diagonal inset in a stepped plateau boundary", () => {
    const terrain = terrainFixture(3, 3);
    const index = (x: number, y: number): number => y * terrain.width + x;
    const center = index(1, 1);
    terrain.plateaus.fill(1);

    terrain.plateaus[index(0, 0)] = 0;
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 1)).toEqual([3]);

    terrain.plateaus.fill(1);
    terrain.plateaus[index(2, 0)] = 0;
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 1)).toEqual([2]);

    terrain.plateaus.fill(1);
    terrain.plateaus[index(0, 2)] = 0;
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 1)).toEqual([1]);

    terrain.plateaus.fill(1);
    terrain.plateaus[index(2, 2)] = 0;
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 1)).toEqual([0]);

    terrain.plateaus.fill(1);
    terrain.plateaus[index(0, 0)] = 0;
    terrain.plateaus[index(2, 0)] = 0;
    expect(plateauForegroundFrameIndicesAt(terrain, 1, 1)).toEqual([3, 2]);
    expect(terrain.blocked[center]).toBe(false);
  });

  it("does not project a stone face through a normal diagonal inset", () => {
    const terrain = terrainFixture(5, 4);
    const index = (x: number, y: number): number => y * terrain.width + x;
    terrain.plateaus[index(2, 0)] = 1;
    terrain.plateaus[index(3, 0)] = 1;
    terrain.plateaus[index(2, 1)] = 1;
    terrain.plateaus[index(2, 2)] = 1;
    terrain.plateaus[index(3, 2)] = 1;

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

  it("derives the existing world edge and ramp semantics from plateau occupancy", () => {
    const terrain = terrainForWorld(0x4f434852, 16);
    for (let tileY = 0; tileY < terrain.height; tileY += 1) {
      for (let tileX = 0; tileX < terrain.width; tileX += 1) {
        const index = tileY * terrain.width + tileX;
        if (terrain.plateaus[index] !== 1) continue;
        const generatedRole =
          SURVIVAL_CLIFF_ROLES[terrain.cliffRoles[index] ?? 0] ?? "none";
        const plan = plateauLayerPlanAt(terrain, tileX, tileY);
        if (generatedRole.startsWith("ramp_")) {
          expect(plan.rampRole).toBe(generatedRole);
          expect(plan.edgeRole).toBeNull();
        } else {
          expect(plan.rampRole).toBeNull();
          expect(plan.edgeRole ?? "none").toBe(generatedRole);
        }
      }
    }
  });

  it("blocks stone face roles while keeping caps and authored trim walkable", () => {
    const terrain = terrainForWorld(0x4f434852, 16);
    for (let tileY = 0; tileY < terrain.height; tileY += 1) {
      for (let tileX = 0; tileX < terrain.width; tileX += 1) {
        const index = tileY * terrain.width + tileX;
        const role =
          SURVIVAL_CLIFF_ROLES[terrain.cliffRoles[index] ?? 0] ?? "none";
        if (role === "none") continue;
        const plan = plateauLayerPlanAt(terrain, tileX, tileY);
        const directStoneFace = plan.faceLayers.some(
          (face) => face.direct && face.rowId !== "foot",
        );
        expect(plan.blocksMovement).toBe(directStoneFace);
        if (directStoneFace) {
          expect(plan.blocksLight).toBe(true);
        }
      }
    }
  });

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

  it("uses the same authored topology for ocean-facing cliff bands", () => {
    const terrain = terrainFixture(7, 6);
    for (let y = 1; y <= 4; y += 1)
      for (let x = 2; x <= 4; x += 1)
        terrain.biomes[y * terrain.width + x] = 16;
    expect(cliffFrameIndexAt(terrain, 3, 2)).toBe(2);
    expect(cliffFrameIndexAt(terrain, 3, 3)).toBe(30);
    expect(cliffFrameIndexAt(terrain, 3, 4)).toBe(44);
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

  it("maps desert ridges onto the authored sandstone cliff rows", () => {
    const terrain = terrainFixture(7, 6);
    for (let y = 1; y <= 4; y += 1)
      for (let x = 2; x <= 4; x += 1)
        terrain.biomes[y * terrain.width + x] = 12;
    expect(desertCliffFrameIndexAt(terrain, 3, 2)).toBe(41);
    expect(desertCliffFrameIndexAt(terrain, 3, 3)).toBe(54);
    expect(desertCliffFrameIndexAt(terrain, 3, 4)).toBe(67);
    expect(desertCliffFrameIndexAt(terrain, 1, 3)).toBeNull();
  });
});
