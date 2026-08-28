import { describe, expect, it } from "vitest";
import {
  editorSessionStorageKey,
  parseEditorSessionState,
  serializeEditorSessionState,
  type EditorSessionState,
} from "./editor-session-state.js";

const STATE: EditorSessionState = {
  version: 1,
  cameraX: -1234.5,
  cameraY: 6789.25,
  worldZoom: 0.125,
  selectedTile: { tileX: -321, tileY: 456 },
  activeElevation: 3,
  tool: "raise",
  terrainFamily: "snow_highland",
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

  it("keeps procedural seeds in independent storage namespaces", () => {
    expect(editorSessionStorageKey("procedural-world", 123)).not.toBe(
      editorSessionStorageKey("procedural-world", 456),
    );
    expect(editorSessionStorageKey("terrain-lab", null)).toBe(
      "orchard.editor.session.v1.terrain-lab",
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
  });
});
