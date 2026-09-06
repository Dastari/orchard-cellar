import { describe, expect, it } from "vitest";
import {
  editorSessionStorageKey,
  parseEditorSessionState,
  serializeEditorSessionState,
  type EditorSessionState,
} from "./editor-session-state.js";

const STATE: EditorSessionState = {
  version: 3,
  cameraX: -1234.5,
  cameraY: 6789.25,
  worldZoom: 0.125,
  selectedTile: { tileX: -321, tileY: 456 },
  activeElevation: 3,
  elevationDelta: 4,
  stairWidth: 3,
  tool: "raise",
  workspaceMode: 'objects',
  hiddenContentLayers: ['canopy'],
  activeContentLayer: 'player_owned',
  activeObjectLayer: 'gameplay',
  selectedPrefabId: 'apple-tree',
  prefabCollection: 'trees',
  activeBiome: 'forest',
  scatterDensity: 3500,
  terrainFamily: "stone_4",
  surfaceFamily: 'grass_3',
  terrainFamilyOpen: true,
  edgeMode: "manual",
  gridVisible: true,
  heightVisible: false,
  collisionVisible: true,
  leftUiScroll: 90,
  rightUiScroll: 12,
};

describe("editor session state", () => {
  it("round-trips camera, selection, tools, and overlays", () => {
    expect(parseEditorSessionState(serializeEditorSessionState(STATE))).toEqual(
      STATE,
    );
  });

  it('defaults an omitted stair width in an early v3 draft to two lanes', () => {
    const legacy = { ...STATE, stairWidth: undefined };
    expect(parseEditorSessionState(JSON.stringify(legacy))?.stairWidth).toBe(2);
  });

  it('derives the active content layer for early v3 drafts', () => {
    const legacy = { ...STATE, activeContentLayer: undefined };
    expect(parseEditorSessionState(JSON.stringify(legacy))?.activeContentLayer).toBe('gameplay');
  });

  it("keeps procedural seeds in independent storage namespaces", () => {
    expect(editorSessionStorageKey("procedural-world", 123)).not.toBe(
      editorSessionStorageKey("procedural-world", 456),
    );
    expect(editorSessionStorageKey("terrain-lab", null)).toBe(
      "orchard.editor.session.v3.terrain-lab",
    );
  });

  it("ignores corrupt, stale, and non-finite records", () => {
    expect(parseEditorSessionState("not json")).toBeNull();
    expect(
      parseEditorSessionState(
        JSON.stringify({ ...STATE, version: 0 }),
      ),
    ).toBeNull();
    expect(
      parseEditorSessionState(
        JSON.stringify({ ...STATE, cameraX: "far away" }),
      ),
    ).toBeNull();
    expect(
      parseEditorSessionState(
        JSON.stringify({ ...STATE, selectedTile: { tileX: 1.5, tileY: 2 } }),
      ),
    ).toBeNull();
    expect(parseEditorSessionState(JSON.stringify({ ...STATE, terrainFamily: 'snow' })))
      .toBeNull();
  });
});
