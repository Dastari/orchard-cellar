import { describe, expect, it } from "vitest";
import {
  EDITOR_UI_SCALE,
  editorUiActionAt,
  editorUiDrawerAt,
  editorUiHeaderLabel,
  editorUiMapHeaderAt,
  editorUiScrollLimit,
  editorUiTooltipForAction,
} from "./editor-ui.js";

const scaled = (value: number): number => value * EDITOR_UI_SCALE;

describe("offline editor resize controls", () => {
  it("uses the game-readable two-times editor chrome baseline", () => {
    expect(EDITOR_UI_SCALE).toBe(2);
  });

  it("maps both grow and crop buttons to each physical map edge", () => {
    expect(editorUiActionAt(scaled(18), scaled(267), 1_280)).toEqual({
      kind: "resize",
      edge: "west",
      grow: false,
    });
    expect(editorUiActionAt(scaled(50), scaled(267), 1_280)).toEqual({
      kind: "resize",
      edge: "west",
      grow: true,
    });
    expect(editorUiActionAt(scaled(81), scaled(267), 1_280)).toEqual({
      kind: "resize",
      edge: "east",
      grow: false,
    });
    expect(editorUiActionAt(scaled(112), scaled(267), 1_280)).toEqual({
      kind: "resize",
      edge: "east",
      grow: true,
    });
    expect(editorUiActionAt(scaled(18), scaled(294), 1_280)).toEqual({
      kind: "resize",
      edge: "north",
      grow: false,
    });
    expect(editorUiActionAt(scaled(50), scaled(294), 1_280)).toEqual({
      kind: "resize",
      edge: "north",
      grow: true,
    });
    expect(editorUiActionAt(scaled(81), scaled(294), 1_280)).toEqual({
      kind: "resize",
      edge: "south",
      grow: false,
    });
    expect(editorUiActionAt(scaled(112), scaled(294), 1_280)).toEqual({
      kind: "resize",
      edge: "south",
      grow: true,
    });
  });

  it("does not turn the spacing between resize controls into a hit target", () => {
    expect(editorUiActionAt(scaled(46), scaled(267), 1_280)).toBeNull();
  });

  it("removes finite resize actions from a procedural signed world", () => {
    expect(
      editorUiActionAt(scaled(18), scaled(267), 1_280, false, 0, 0, false),
    ).toBeNull();
  });

  it("only exposes Generate inside the selected ungenerated chunk action", () => {
    expect(editorUiActionAt(900, scaled(98), 1_280, true)).toEqual({
      kind: "generate_chunk",
    });
    expect(editorUiActionAt(900, scaled(98), 1_280, false)).toBeNull();
    expect(editorUiActionAt(900, scaled(140), 1_280, true)).toBeNull();
  });

  it("keeps hit targets aligned after scrolling a drawer", () => {
    expect(editorUiActionAt(scaled(18), scaled(187), 1_280, false, 80)).toEqual(
      {
        kind: "resize",
        edge: "west",
        grow: false,
      },
    );
  });

  it("keeps commands fixed above the scrollable tool and terrain palettes", () => {
    expect(editorUiActionAt(scaled(18), scaled(42), 1_280)).toEqual({
      kind: "undo",
    });
    expect(editorUiActionAt(scaled(39), scaled(42), 1_280)).toEqual({
      kind: "redo",
    });
    expect(editorUiActionAt(scaled(60), scaled(42), 1_280)).toEqual({
      kind: "save",
    });
    expect(editorUiActionAt(scaled(81), scaled(42), 1_280)).toEqual({
      kind: "load",
    });
    expect(editorUiActionAt(scaled(102), scaled(42), 1_280)).toEqual({
      kind: "export",
    });
    expect(editorUiActionAt(scaled(108), scaled(42), 1_280)).toEqual({
      kind: "import",
    });
    expect(
      editorUiActionAt(scaled(126), scaled(42), 1_280, false, 0, 0, false),
    ).toEqual({
      kind: "randomize_seed",
    });
    expect(editorUiActionAt(scaled(126), scaled(42), 1_280)).toBeNull();
    expect(editorUiActionAt(scaled(18), scaled(42), 1_280, false, 200)).toEqual(
      { kind: "undo" },
    );
  });

  it("uses icon grids for editing tools and display toggles", () => {
    expect(editorUiActionAt(scaled(18), scaled(74), 1_280)).toEqual({
      kind: "tool",
      tool: "inspect",
    });
    expect(editorUiActionAt(scaled(50), scaled(74), 1_280)).toEqual({
      kind: "tool",
      tool: "grass",
    });
    expect(editorUiActionAt(scaled(18), scaled(106), 1_280)).toEqual({
      kind: "tool",
      tool: "path",
    });
    expect(editorUiActionAt(scaled(18), scaled(138), 1_280)).toEqual({
      kind: "toggle_grid",
    });
    expect(editorUiActionAt(scaled(42), scaled(138), 1_280)).toEqual({
      kind: "toggle_height",
    });
    expect(editorUiActionAt(scaled(66), scaled(138), 1_280)).toEqual({
      kind: "toggle_collision",
    });
    expect(editorUiActionAt(scaled(90), scaled(138), 1_280)).toEqual({
      kind: "toggle_edge_mode",
    });
    expect(editorUiActionAt(scaled(18), scaled(196), 1_280)).toEqual({
      kind: "toggle_terrain_family",
    });
    expect(
      editorUiActionAt(scaled(18), scaled(240), 1_280, false, 0, 0, true, true),
    ).toEqual({
      kind: "terrain_family",
      family: "temperate_meadow",
    });
    expect(
      editorUiActionAt(scaled(18), scaled(284), 1_280, false, 0, 0, true, true),
    ).toEqual({
      kind: "terrain_family",
      family: "temperate_woodland",
    });
  });

  it("provides concise hover help for every compact control family", () => {
    expect(editorUiTooltipForAction({ kind: "export" })).toContain("CTRL");
    expect(editorUiTooltipForAction({ kind: "toggle_grid" })).toContain("(G)");
    expect(editorUiTooltipForAction({ kind: "tool", tool: "water" })).toContain(
      "WATER",
    );
    expect(
      editorUiTooltipForAction({ kind: "terrain_family", family: "desert_2" }),
    ).toContain("SAND");
  });

  it("reserves a floating map-information plate above the canvas", () => {
    expect(editorUiMapHeaderAt(640, scaled(18), 1_280)).toBe(true);
    expect(editorUiMapHeaderAt(640, scaled(50), 1_280)).toBe(false);
  });

  it("keeps the procedural map header concise enough for its central plate", () => {
    const label = editorUiHeaderLabel({
      title: "Procedural Sanctuary Preview",
      hash: "597c02deadbeef",
      mapWidth: 400,
      mapHeight: 400,
      revision: 12,
      validationErrors: 0,
      procedural: {
        seedLabel: "2098878576",
        generatorVersion: 3,
        generatedChunkCount: 25,
      },
    } as never);
    expect(label).toBe(
      "Procedural Sanctuary / SEED 2098878576 / V3 / 25 CHUNKS GENERATED / R12 / E0",
    );
    expect(label).not.toContain("SIGNED CHUNK WORLD");
  });

  it("reserves the scaled drawers and exposes bounded overflow", () => {
    expect(editorUiDrawerAt(200, 1_280)).toBe("left");
    expect(editorUiDrawerAt(1_000, 1_280)).toBe("right");
    expect(editorUiDrawerAt(500, 1_280)).toBeNull();
    expect(editorUiScrollLimit("left", 600)).toBeGreaterThan(0);
    expect(editorUiScrollLimit("left", 600, true)).toBeLessThan(
      editorUiScrollLimit("left", 600),
    );
    expect(editorUiScrollLimit("right", 600)).toBeGreaterThan(0);
    expect(editorUiScrollLimit("left", 1_080, true)).toBe(0);
    expect(editorUiScrollLimit("left", 1_080, true, true)).toBeGreaterThan(200);
    expect(editorUiScrollLimit("right", 1_080)).toBeGreaterThanOrEqual(150);
  });
});
