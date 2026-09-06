import { describe, expect, it } from "vitest";
import { proceduralEditorGridIntervals } from "./editor-overlays.js";

describe("procedural editor recursive chunk grid", () => {
  it("shows individual chunks nearby and recursively coarsens by four when zooming out", () => {
    expect(proceduralEditorGridIntervals(1)).toEqual({
      minorChunks: 1,
      majorChunks: 4,
    });
    expect(proceduralEditorGridIntervals(1 / 32)).toEqual({
      minorChunks: 4,
      majorChunks: 16,
    });
    expect(proceduralEditorGridIntervals(1 / 512)).toEqual({
      minorChunks: 64,
      majorChunks: 256,
    });
  });

  it("rejects invalid display scales", () => {
    expect(() => proceduralEditorGridIntervals(0)).toThrow(/positive/u);
  });
});
