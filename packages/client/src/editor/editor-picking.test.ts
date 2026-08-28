import { describe, expect, it } from "vitest";
import type { TerrainArray } from "../render/terrain.js";
import {
  editorTerrainHitOnPlane,
  proceduralEditorTerrainHit,
  topmostEditorTerrainHit,
} from "./editor-picking.js";

function terrainWithElevations(
  width: number,
  height: number,
  entries: readonly (readonly [number, number, number])[],
): TerrainArray {
  const length = width * height;
  const elevations = new Uint8Array(length);
  for (const [tileX, tileY, elevation] of entries)
    elevations[tileY * width + tileX] = elevation;
  return {
    spaceId: 1,
    seed: 1,
    version: 1,
    width,
    height,
    generator: "debug_flat",
    biomes: new Uint8Array(length).fill(4),
    blocked: Array<boolean>(length).fill(false),
    horseJumpableTerrain: Array<boolean>(length).fill(false),
    cliffRoles: new Uint8Array(length),
    elevations,
    raisedTerrainCollisionClassified: true,
    plateaus: elevations,
    dirtCliffRoles: new Uint8Array(length),
    dirtTerraces: new Uint8Array(length),
  };
}

describe("offline editor elevated terrain picking", () => {
  it("selects the logical source tile of a projected elevated surface", () => {
    const terrain = terrainWithElevations(8, 8, [[3, 4, 2]]);
    // Two levels project row 4 upward by four visual rows, onto screen row 0.
    expect(topmostEditorTerrainHit(terrain, 3 * 16 + 8, 8)).toEqual({
      tileX: 3,
      tileY: 4,
      elevation: 2,
    });
  });

  it("chooses the higher surface when projected planes overlap", () => {
    const terrain = terrainWithElevations(8, 8, [
      [3, 2, 1],
      [3, 4, 2],
    ]);
    expect(topmostEditorTerrainHit(terrain, 3 * 16 + 8, 8)).toEqual({
      tileX: 3,
      tileY: 4,
      elevation: 2,
    });
  });

  it("selects a visible projected cliff face with no surface in its screen cell", () => {
    const rows = [
      "#####..",
      "#####..",
      "####...",
      "####...",
      "####...",
      "###....",
      ".......",
    ];
    const entries = rows.flatMap((row, tileY) =>
      [...row].flatMap((cell, tileX) =>
        cell === "#" ? [[tileX, tileY, 1] as const] : [],
      ),
    );
    const terrain = terrainWithElevations(7, 7, entries);

    // The wall drawn in projected screen cell (4, 1) belongs to logical tile
    // (4, 3), whose walkable surface is L0. It is still selectable as the L1
    // contour composition the user can see.
    expect(topmostEditorTerrainHit(terrain, 4 * 16 + 8, 1 * 16 + 8)).toEqual({
      tileX: 4,
      tileY: 3,
      elevation: 1,
    });
  });

  it("locks subsequent stroke samples to the elevation chosen at pointer-down", () => {
    const terrain = terrainWithElevations(8, 8, [
      [3, 2, 1],
      [3, 4, 2],
    ]);
    expect(editorTerrainHitOnPlane(terrain, 3 * 16 + 8, 8, 1)).toEqual({
      tileX: 3,
      tileY: 2,
      elevation: 1,
    });
  });

  it("uses the visible flat chunk when an ungenerated elevated apron is under the pointer", () => {
    const terrain = terrainWithElevations(8, 24, [[3, 16, 3]]);
    const projectedX = 3 * 16 + 8;
    const projectedY = 10 * 16 + 8;
    expect(
      proceduralEditorTerrainHit(
        terrain,
        projectedX,
        projectedY,
        0,
        0,
        new Set(),
      ),
    ).toEqual({ tileX: 3, tileY: 10, elevation: 0 });
    expect(
      proceduralEditorTerrainHit(
        terrain,
        projectedX,
        projectedY,
        0,
        0,
        new Set(["0,1"]),
      ),
    ).toEqual({ tileX: 3, tileY: 16, elevation: 3 });
  });
});
