import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, expect, it } from "vitest";
import {
  createEmptyMapDocument,
  resolvedMapBiomeAt,
  migrateMapDocumentV2,
  normalizeMapDocumentV3,
  createMapPrefabDocument,
  type MapDocumentV3,
} from "../packages/sim/src/index.js";
import {
  applyNativeIslandDesigns,
  type IslandArt,
} from "./apply-native-island-designs.js";
import { validateNativeIslandDesigns } from "./native-island-validation.js";
import type { AssetSource } from "../packages/tools/src/assets/types.js";
import { framesForAsset } from "../packages/tools/src/assets/pixels.js";
const root = resolve(import.meta.dirname, "../packages/assets"),
  sources = new Map<string, AssetSource>();
for (const folder of ["tiles", "props"])
  for (const name of readdirSync(resolve(root, folder)).filter((n) =>
    /\.(sprite|tile)\.json$/.test(n),
  )) {
    const source = JSON.parse(
      readFileSync(resolve(root, folder, name), "utf8"),
    ) as AssetSource;
    sources.set(source.name, source);
  }
const art = (name: string): IslandArt => {
  const a = sources.get(name)!;
  if (!a) throw Error(`missing:${name}`);
  return {
    assetId: [...sources.keys()].indexOf(name) + 1,
    anchor: a.anchor,
    width: a.size[0],
    height: a.size[1],
    kind: a.frameKinds?.base ?? "state",
    group: "base",
    frames: framesForAsset(a).base!.length,
    registryRevision: "native-test",
    collision: a.collision ?? [],
    blocksMovement: a.placement?.blocksMovement ?? false,
  };
};
let base: MapDocumentV3, target: MapDocumentV3, report: Record<string, unknown>;
beforeAll(() => {
  const existing = createMapPrefabDocument({
    id: "owner-tower",
    title: "Owner tower",
  });
  base = normalizeMapDocumentV3({
    ...migrateMapDocumentV2(
      createEmptyMapDocument({
        id: "live-island",
        title: "Scoped fixture",
        width: 832,
        height: 832,
      }),
    ),
    revision: 13,
    prefabs: [existing],
    objects: [
      {
        id: "owner-tower",
        prefabId: existing.id,
        prefabRevision: existing.revision,
        tileX: 721,
        tileY: 100,
        elevation: 3,
        layer: "objects",
        quarterTurns: 0,
        flipX: false,
        enabled: true,
      },
    ],
    cells: {
      "416,416": { elevation: 2 },
      "721,100": { elevation: 3 },
      "160,400": { feature: "path" },
    },
  });
  ({ document: target, report } = applyNativeIslandDesigns(base, art));
});
it("keeps the owner tower and unrelated main-island content while authoring clean curbs and isolated buried paving", () => {
  expect(target.objects.find((o) => o.id === "owner-tower")).toEqual(
    base.objects[0],
  );
  expect(target.cells["416,416"]).toEqual(base.cells["416,416"]);
  expect(target.cells["160,400"]).toEqual(base.cells["160,400"]);
  expect(target.defaultCliffFamily).toBe(base.defaultCliffFamily);
  expect(report.uncoveredPatches).toBeGreaterThan(0);
  const bank = target.prefabs.filter(
    (p) => p.placements[0]?.assetName === "tile_cf_volcano_design_sheet",
  );
  expect(bank.some((p) => p.placements[0]?.visual.frameIndex === 160)).toBe(
    true,
  );
  expect(bank.some((p) => p.placements[0]?.visual.frameIndex === 223)).toBe(
    true,
  );
  expect(target.cells["721,104"]?.biome).toBe("volcanic_ash");
});
it("uses complete projected waterfalls on all three real shelves and all bridge source rows", () => {
  const falls = report.falls as { upper: number }[];
  expect(falls.length).toBeGreaterThanOrEqual(6);
  expect(new Set(falls.map((f) => f.upper))).toEqual(new Set([1, 2, 3]));
  const bridgeFrames = target.prefabs
    .filter(
      (p) => p.placements[0]?.assetName === "tile_cf_volcano_design_bridge",
    )
    .map((p) => p.placements[0]!.visual.frameIndex);
  expect(bridgeFrames).toContain(4);
  expect(bridgeFrames).toContain(13);
  expect(bridgeFrames).toContain(22);
  expect(
    target.objects.filter(
      (o) =>
        target.prefabs.find((p) => p.id === o.prefabId)?.placements[0]
          ?.assetName === "prop_cf_cinder_lavafall_flow",
    ),
  ).toHaveLength(falls.length);
  expect(() => applyNativeIslandDesigns(target, art)).toThrow(
    "already_applied",
  );
});
it("proves actual player-hitbox reachability, lava blocking, and scoped delta reconstruction", () => {
  const proof = validateNativeIslandDesigns(base, target);
  expect(proof.report.blockedLava).toBeGreaterThan(1000);
  expect(proof.report.reachability.cinderwake?.goals).toContainEqual([
    721, 104,
  ]);
  expect(proof.report.reachability.cinderwake?.goals).toContainEqual([
    736, 147,
  ]);
  expect(proof.report.deltaBytes).toBeLessThan(16_000_000);
  const spoiled = {
    ...target,
    cells: { ...target.cells, "416,416": { elevation: 4 } },
  };
  expect(() => validateNativeIslandDesigns(base, spoiled)).toThrow(
    "outside_island_cell_changed",
  );
}, 60000);
it("retains every licensed waterfall pixel in complete intake/body/impact poses and includes native emission", () => {
  const bank = sources.get("tile_cf_volcanic_lavafall")!,
    pose = sources.get("prop_cf_cinder_lavafall_flow")!;
  expect(pose.emissiveColors).toEqual(bank.emissiveColors);
  for (const [i, width] of [3, 5, 7].entries())
    for (let y = 0; y < 80; y++) {
      const expected =
        ".".repeat(((7 - width) / 2) * 16) +
        Array.from(
          { length: width },
          (_, x) =>
            bank.frames.base![
              (y >> 4) * 54 + (x === 0 ? 0 : x === width - 1 ? 2 : 1)
            ]![y % 16],
        ).join("") +
        ".".repeat(((7 - width) / 2) * 16);
      expect(pose.frames.base![i]![y]).toBe(expected);
    }
});

it("does not join new coast slivers through implicit ocean in a protected rectangle", () => {
  const oceanBase = { ...base, baseBiome: "water" as const };
  const { document } = applyNativeIslandDesigns(oceanBase, art);
  expect(resolvedMapBiomeAt(document, 205, 446)).toBe("water");
  expect(resolvedMapBiomeAt(document, 206, 440)).toBe("water");
});
