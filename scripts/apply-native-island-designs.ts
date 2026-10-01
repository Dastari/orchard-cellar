/** Scoped authored island composition. Produces data; never connects or publishes. */
import {
  parseMapDocumentV3,
  serializeMapDocumentV3,
  HEARTH_ISLANDS,
  resolvedMapBiomeAt,
  type MapDocumentV3,
  type MapPrefabDocumentV2,
} from "../packages/sim/src/index.js";
import {
  cinderwakeDesign,
  willowharbourDesign,
  cinderCurbFrame,
  cinderHeatedAshFrame,
  cinderUncoveredPavingFrame,
} from "./native-island-scenes.js";

export interface IslandArt {
  assetId: number;
  anchor: readonly [number, number];
  width: number;
  height: number;
  group: string;
  kind: "variant" | "animation" | "state";
  frames: number;
  blocksMovement: boolean;
  registryRevision: string;
  collision: readonly (readonly [number, number, number, number])[];
}
export type IslandArtLookup = (name: string) => IslandArt;
type Cell = MapDocumentV3["cells"][string];
const key = (x: number, y: number) => `${x},${y}`;
const inside = (polygon: number[][], x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a[1]! > y !== b[1]! > y &&
      x < ((b[0]! - a[0]!) * (y - a[1]!)) / (b[1]! - a[1]!) + a[0]!
    )
      hit = !hit;
  }
  return hit;
};
function warp(value: number, knots: readonly (readonly [number, number])[]) {
  let i = 1;
  while (i < knots.length - 1 && value > knots[i]![0]) i++;
  const a = knots[i - 1]!,
    b = knots[i]!;
  return a[1] + ((value - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
}
const xKnots = [
  [0, 608],
  [16, 652],
  [54, 721],
  [103, 799],
] as const;
const yKnots = [
  [0, 48],
  [31, 100],
  [79, 211],
  [91, 239],
] as const;
export const cinderWorldPoint = (x: number, y: number) =>
  [Math.round(warp(x, xKnots)), Math.round(warp(y, yKnots))] as const;
const cinderLocalPoint = (x: number, y: number) =>
  [
    warp(
      x,
      xKnots.map(([a, b]) => [b, a] as const),
    ),
    warp(
      y,
      yKnots.map(([a, b]) => [b, a] as const),
    ),
  ] as const;
const inRegion = (
  x: number,
  y: number,
  r: (typeof HEARTH_ISLANDS)[keyof typeof HEARTH_ISLANDS],
) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;
export const inUpdatedIsland = (x: number, y: number) =>
  Object.values(HEARTH_ISLANDS).some((r) => inRegion(x, y, r));

export function applyNativeIslandDesigns(
  base: MapDocumentV3,
  art: IslandArtLookup,
): { document: MapDocumentV3; report: Record<string, unknown> } {
  if (base.id !== "live-island" || base.width !== 832 || base.height !== 832)
    throw Error("native_island_base_mismatch");
  if (base.objects.some((o) => o.id.startsWith("island-update-")))
    throw Error("native_islands_already_applied");
  const cells: Record<string, Cell> = { ...base.cells },
    prefabs = [...base.prefabs],
    objects = [...base.objects];
  const lookup = new Map(prefabs.map((p) => [p.id, p]));
  const terrain = (x: number, y: number) => cells[key(x, y)];
  const level = (x: number, y: number) => terrain(x, y)?.elevation ?? 0;
  let added = 0,
    retired = 0;
  function place(
    assetName: string,
    x: number,
    y: number,
    frame = 0,
    layer: "ground" | "objects" = "ground",
  ) {
    const asset = art(assetName);
    if (frame < 0 || frame >= asset.frames)
      throw Error(`native_frame_missing:${assetName}:${frame}`);
    const id = `island-update-${asset.assetId}-${frame}`,
      pivot = {
        tileX: Math.floor(asset.anchor[0] / 16),
        tileY: Math.floor(asset.anchor[1] / 16),
      };
    if (!lookup.has(id)) {
      const prefab: MapPrefabDocumentV2 = {
        schemaVersion: 2,
        kind: "map_prefab",
        id,
        title: assetName,
        width: Math.ceil(asset.width / 16),
        height: Math.ceil(asset.height / 16),
        tileSize: 16,
        pivot,
        revision: 1,
        assetRegistryRevision: asset.registryRevision,
        tags: ["authored.scenery", "native.island.update"],
        collection: {
          id: "native-island-update",
          label: "Island quality pass",
          color: "#776a79",
        },
        behaviors: [{ kind: "static" }],
        cells:
          layer === "objects"
            ? Array.from(
                {
                  length:
                    Math.ceil(asset.width / 16) * Math.ceil(asset.height / 16),
                },
                (_, i) => {
                  const tileX = i % Math.ceil(asset.width / 16),
                    tileY = Math.floor(i / Math.ceil(asset.width / 16));
                  let collisionMask = 0;
                  for (let sy = 0; sy < 4; sy++)
                    for (let sx = 0; sx < 4; sx++)
                      if (
                        asset.collision.some(
                          ([rx, ry, rw, rh]) =>
                            tileX * 16 + sx * 4 < rx + rw &&
                            tileX * 16 + (sx + 1) * 4 > rx &&
                            tileY * 16 + sy * 4 < ry + rh &&
                            tileY * 16 + (sy + 1) * 4 > ry,
                        )
                      )
                        collisionMask |= 1 << (sy * 4 + sx);
                  return {
                    id: `collision-${i}`,
                    tileX,
                    tileY,
                    elevation: 0,
                    collisionMask,
                  };
                },
              )
                .filter((c) => c.collisionMask !== 0)
                .concat(
                  asset.collision.length === 0 && asset.blocksMovement
                    ? [
                        {
                          id: "authored-foot",
                          tileX: pivot.tileX,
                          tileY: pivot.tileY,
                          elevation: 0,
                          collisionMask: 65535,
                        },
                      ]
                    : [],
                )
            : [],
        placements: [
          {
            id: "visual",
            assetId: asset.assetId,
            assetName,
            tileX: pivot.tileX,
            tileY: pivot.tileY,
            elevation: 0,
            layer: layer === "ground" ? "ground" : "object",
            quarterTurns: 0,
            flipX: false,
            visual: { kind: asset.kind, name: asset.group, frameIndex: frame },
          },
        ],
      };
      prefabs.push(prefab);
      lookup.set(id, prefab);
    }
    objects.push({
      id: `island-update-placement-${String(added++).padStart(6, "0")}`,
      prefabId: id,
      prefabRevision: 1,
      tileX: x,
      tileY: y,
      elevation: level(x, y),
      layer,
      quarterTurns: 0,
      flipX: false,
      enabled: true,
    });
  }
  const cinder = cinderwakeDesign(),
    willow = willowharbourDesign();
  const molten = new Set(
    cinder.placements
      .filter(
        (p) =>
          (p.role === "lava" || p.role === "basin") && p.material === "lava",
      )
      .map((p) => key(p.x / 16, p.y / 16)),
  );
  // Retain encounter/tower level contracts. Three real closed-height shelves
  // replace the flat review's six visual annotations; no artificial open wall.
  const shelves = [
    cinder.intendedTerraces[0]!,
    cinder.intendedTerraces[2]!,
    cinder.intendedTerraces[4]!,
  ];
  const r = HEARTH_ISLANDS.cinderwake;
  for (let y = r.minY; y <= r.maxY; y++)
    for (let x = r.minX; x <= r.maxX; x++) {
      const [lx, ly] = cinderLocalPoint(x + 0.5, y + 0.5),
        land = !!cinder.document.cells[key(Math.floor(lx), Math.floor(ly))];
      const elevation = land
        ? shelves.filter((s) => inside(s.polygon, lx, ly)).length
        : 0;
      const lava = land && molten.has(key(Math.floor(lx), Math.floor(ly)));
      cells[key(x, y)] = {
        elevation,
        biome: land ? (lava ? "lava" : "volcanic_ash") : "water",
        surface: land ? "stone" : "water",
        feature: "none",
        cliffFamily: "volcanic",
        ...(lava ? { collision: "force_block", collisionReason: "lava" } : {}),
      };
    }
  // A deliberate north-bank ascent: horizontal runs hold one physical level.
  // Broad landings keep the bank's lateral edges clear and its face straight.
  const route = [
    { x: 16, y: 79, l: 0 },
    { x: 16, y: 72, l: 1 },
    { x: 25, y: 72, l: 1 },
    { x: 25, y: 64, l: 1 },
    { x: 43, y: 64, l: 1 },
    { x: 43, y: 57, l: 1 },
    { x: 83, y: 57, l: 1 },
    { x: 83, y: 49, l: 2 },
    { x: 46, y: 49, l: 2 },
    { x: 46, y: 42, l: 3 },
    { x: 56, y: 42, l: 3 },
    { x: 56, y: 35, l: 3 },
  ].map((p) => {
    const [x, y] = cinderWorldPoint(p.x, p.y);
    return { ...p, x, y };
  });
  const roads = new Set<string>(),
    crossings: MapDocumentV3["transitions"][number][] = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!,
      b = route[i]!,
      vertical = a.x === b.x,
      mid = Math.round((a.y + b.y) / 2);
    for (let y = Math.min(a.y, b.y) - 4; y <= Math.max(a.y, b.y) + 4; y++)
      for (let x = Math.min(a.x, b.x) - 4; x <= Math.max(a.x, b.x) + 4; x++) {
        if (!inRegion(x, y, r)) continue;
        const elevation =
          vertical && a.l !== b.l ? (y >= mid ? a.l : b.l) : b.l;
        const old = terrain(x, y)!;
        cells[key(x, y)] = {
          ...old,
          elevation,
          biome: old.biome === "lava" ? "lava" : "volcanic_ash",
          surface: "stone",
        };
        if (vertical ? Math.abs(x - a.x) <= 1 : Math.abs(y - a.y) <= 1)
          roads.add(key(x, y));
      }
    if (vertical && a.l !== b.l)
      for (let dx = -1; dx <= 1; dx++)
        crossings.push({
          contourLevel: b.l,
          kind: "slope",
          direction: "up",
          lowerTileX: a.x + dx,
          lowerTileY: mid,
          upperTileX: a.x + dx,
          upperTileY: mid - 1,
        });
  }
  // The retained tower, arena, ferry and supply cache remain on original
  // coordinates. Reserve coherent dry arrival/court aprons and approach lanes.
  for (const box of [{ x1: 708, y1: 96, x2: 734, y2: 122, l: 3 }])
    for (let y = box.y1; y <= box.y2; y++)
      for (let x = box.x1; x <= box.x2; x++)
        cells[key(x, y)] = {
          elevation: box.l,
          biome: "volcanic_ash",
          surface: "stone",
          feature: "none",
          cliffFamily: "volcanic",
        };
  // A rounded sheltered landing preserves the fixtures without a square shore.
  for (let y = 195; y <= 219; y++)
    for (let x = 634; x <= 663; x++)
      if (((x - 650) / 15) ** 2 + ((y - 207) / 12) ** 2 <= 1)
        cells[key(x, y)] = {
          elevation: 0,
          biome: "volcanic_ash",
          surface: "stone",
          feature: "none",
          cliffFamily: "volcanic",
        };
  for (let i = 0; i < 3; i++)
    crossings[i] = { ...crossings[i]!, lowerTileY: 198, upperTileY: 197 };
  for (let y = 191; y <= 218; y++)
    for (let x = 648; x <= 656; x++)
      cells[key(x, y)] = {
        elevation: y >= 198 ? 0 : 1,
        biome: "volcanic_ash",
        surface: "stone",
        feature: "none",
        cliffFamily: "volcanic",
      };
  // Connect the ferry to the route and the final road to the tower forecourt.
  for (const box of [
    { x1: 644, y1: 207, x2: 652, y2: 212 },
    { x1: 715, y1: 100, x2: 727, y2: 122 },
  ])
    for (let y = box.y1; y <= box.y2; y++)
      for (let x = box.x1; x <= box.x2; x++) roads.add(key(x, y));
  // Existing camp pads preserve their exact elevations and avoid lava spawning.
  for (const [cx, cy, l, radius] of [
    [678, 204, 0, 4],
    [715, 205, 0, 3],
    [725, 169, 1, 4],
    [736, 147, 2, 3],
    [721, 117, 3, 5],
  ])
    for (let y = cy! - radius!; y <= cy! + radius!; y++)
      for (let x = cx! - radius!; x <= cx! + radius!; x++)
        if (Math.hypot(x - cx!, y - cy!) <= radius!)
          cells[key(x, y)] = {
            elevation: l,
            biome: "volcanic_ash",
            surface: "stone",
            feature: "none",
            cliffFamily: "volcanic",
          };
  // Keep the retained shore fire trees rooted on a rounded headland.
  for (const o of base.objects.filter((o) =>
    o.id.startsWith("hearth-cinder-shore-tree-"),
  ))
    if (terrain(o.tileX, o.tileY)?.biome === "water")
      for (let y = o.tileY - 8; y <= o.tileY + 3; y++)
        for (let x = o.tileX - 6; x <= o.tileX + 6; x++)
          if (((x - o.tileX) / 6) ** 2 + ((y - o.tileY + 2) / 6) ** 2 < 1)
            cells[key(x, y)] = {
              elevation: o.elevation,
              biome: "volcanic_ash",
              surface: "stone",
              feature: "none",
              cliffFamily: "volcanic",
            };
  // Original scenery and tower identity are retained; retire only the old
  // decorative pillar trail. World fixtures and every manual edit survive.
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i]!;
    if (
      inRegion(o.tileX, o.tileY, r) &&
      /hearth-cinder-prop-cf-cinder-(broad-pillar|column-cluster|violet-plant)/.test(
        o.prefabId,
      )
    ) {
      objects.splice(i, 1);
      retired++;
    }
  }
  // Road authority is dry walkable paving; native bridge art marks lava spans.
  const bridges = new Set<string>();
  for (const cell of roads) {
    const [x, y] = cell.split(",").map(Number) as [number, number];
    if (terrain(x, y)?.biome === "lava") bridges.add(cell);
    cells[cell] = {
      ...terrain(x, y),
      biome: "volcanic_ash",
      surface: "stone",
      feature: "none",
      collision: "inherit",
      collisionReason: "",
    };
    place("tile_cf_volcano_design_sheet", x, y, 223);
  }
  const dry = (x: number, y: number) => terrain(x, y)?.biome === "volcanic_ash";
  const clearFace = (x: number, y: number) =>
    [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ].every(([dx, dy]) => level(x + dx!, y + dy!) === level(x, y));
  const nearRoad = (x: number, y: number) => roads.has(key(x, y));
  for (let y = r.minY; y <= r.maxY; y++)
    for (let x = r.minX; x <= r.maxX; x++)
      if (dry(x, y) && !nearRoad(x, y) && clearFace(x, y)) {
        let frame = cinderCurbFrame(
          nearRoad(x, y - 1),
          nearRoad(x + 1, y),
          nearRoad(x, y + 1),
          nearRoad(x - 1, y),
        );
        if (frame === null) {
          if (nearRoad(x + 1, y + 1)) frame = 101;
          else if (nearRoad(x - 1, y + 1)) frame = 103;
          else if (nearRoad(x + 1, y - 1)) frame = 159;
          else if (nearRoad(x - 1, y - 1)) frame = 161;
        }
        if (frame !== null) place("tile_cf_volcano_design_sheet", x, y, frame);
      }
  // Full source bridge decks at the route's actual molten intersections.
  // Native three-row decks with end posts: rails occupy the outer road rows.
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!,
      b = route[i]!;
    if (a.y !== b.y) continue;
    const y = a.y,
      lo = Math.min(a.x, b.x),
      hi = Math.max(a.x, b.x);
    const moltenColumn = (x: number) =>
      [-1, 0, 1].some((dy) => bridges.has(key(x, y + dy)));
    for (let x = lo; x <= hi; x++)
      if (moltenColumn(x)) {
        const left = x - 1;
        while (x <= hi && moltenColumn(x)) x++;
        const right = x;
        for (let bx = left; bx <= right; bx++)
          for (let dy = 0; dy < 3; dy++)
            if (roads.has(key(bx, y + dy - 1)))
              place(
                "tile_cf_volcano_design_bridge",
                bx,
                y + dy - 1,
                dy * 8 + (bx === left ? 4 : bx === right ? 6 : 5),
              );
      }
  }
  // Native banks completely replace the generic lava's repeated rocky tile.
  const lavaAt = (x: number, y: number) => terrain(x, y)?.biome === "lava";
  const falls: {
    x: number;
    y: number;
    width: number;
    upper: number;
    lower: number;
  }[] = [];
  // Summit spills occupy two crafted promontories and connect to the existing
  // tributaries. Their complete lips share a straight physical drop.
  for (const f of [
    { x: 694, y: 121 },
    { x: 739, y: 122 },
  ]) {
    for (let y = f.y - 12; y <= f.y; y++)
      for (let x = f.x - 4; x <= f.x + 5; x++)
        if (!roads.has(key(x, y)))
          cells[key(x, y)] = {
            elevation: 3,
            biome: "volcanic_ash",
            surface: "stone",
            cliffFamily: "volcanic",
            feature: "none",
          };
    for (let y = f.y - 9; y <= f.y; y++)
      for (let x = f.x - 2; x <= f.x + 2; x++)
        cells[key(x, y)] = {
          elevation: 3,
          biome: "lava",
          surface: "stone",
          cliffFamily: "volcanic",
          feature: "none",
          collision: "force_block",
          collisionReason: "lava",
        };
    for (let y = f.y + 1; y <= f.y + 6; y++)
      for (let x = f.x - 4; x <= f.x + 4; x++)
        if (
          ((x - f.x) / 4.1) ** 2 + ((y - f.y - 3) / 3.5) ** 2 < 1 &&
          !roads.has(key(x, y))
        )
          cells[key(x, y)] = {
            elevation: 2,
            biome: "lava",
            surface: "stone",
            cliffFamily: "volcanic",
            feature: "none",
            collision: "force_block",
            collisionReason: "lava",
          };
    falls.push({ ...f, width: 5, upper: 3, lower: 2 });
  }
  for (let upper = 1; upper <= 3; upper++)
    for (const side of ["west", "east"]) {
      const candidates: { x: number; y: number; width: number }[] = [];
      for (let y = r.minY + 5; y < r.maxY - 5; y++)
        for (let x = r.minX + 7; x < r.maxX - 7; x++)
          if (
            (side === "west" ? x < 721 : x >= 721) &&
            lavaAt(x, y) &&
            lavaAt(x, y + 1) &&
            level(x, y) === upper &&
            level(x, y + 1) === upper - 1
          ) {
            const width = 5,
              center = x;
            if (
              objects.some(
                (o) => Math.hypot(o.tileX - center, o.tileY - y) < 9,
              ) ||
              roads.has(key(x, y))
            )
              continue;
            if (
              Array.from({ length: 7 }, (_, i) => center - 3 + i).every((tx) =>
                [-2, -1, 0, 1, 2, 3, 4, 5].every((dy) => {
                  const c = terrain(tx, y + dy);
                  return (
                    !!c &&
                    c.biome !== "water" &&
                    !roads.has(key(tx, y + dy)) &&
                    Math.abs(
                      level(tx, y + dy) - (dy <= 0 ? upper : upper - 1),
                    ) <= 1
                  );
                }),
              ) &&
              !falls.some(
                (f) => Math.abs(f.x - center) < 12 && Math.abs(f.y - y) < 9,
              )
            )
              candidates.push({ x: center, y, width });
          }
      candidates.sort((a, b) => b.width - a.width || a.y - b.y);
      const selected: typeof candidates = [];
      for (const candidate of candidates) {
        if (
          selected.some(
            (f) =>
              Math.abs(f.x - candidate.x) < 12 &&
              Math.abs(f.y - candidate.y) < 9,
          )
        )
          continue;
        selected.push(candidate);
        if (selected.length === 2) break;
      }
      for (const f of selected) {
        falls.push({ ...f, upper, lower: upper - 1 });
        for (let y = f.y - 2; y <= f.y; y++)
          for (let x = f.x - 2; x <= f.x + 2; x++)
            cells[key(x, y)] = {
              elevation: upper,
              biome: "lava",
              surface: "stone",
              cliffFamily: "volcanic",
              feature: "none",
              collision: "force_block",
              collisionReason: "lava",
            };
        for (let y = f.y + 1; y <= f.y + 5; y++)
          for (let x = f.x - 5; x <= f.x + 5; x++)
            if (
              ((x - f.x) / (f.width / 2 + 1)) ** 2 +
                ((y - f.y - 3) / 2.8) ** 2 <
                1 &&
              !roads.has(key(x, y))
            ) {
              cells[key(x, y)] = {
                elevation: upper - 1,
                biome: "lava",
                surface: "stone",
                cliffFamily: "volcanic",
                feature: "none",
                collision: "force_block",
                collisionReason: "lava",
              };
            }
      }
    }
  for (let y = r.minY; y <= r.maxY; y++)
    for (let x = r.minX; x <= r.maxX; x++)
      if (lavaAt(x, y)) {
        const col = !lavaAt(x - 1, y) ? 7 : !lavaAt(x + 1, y) ? 9 : 8,
          row = !lavaAt(x, y - 1) ? 6 : !lavaAt(x, y + 1) ? 8 : 7;
        place("tile_cf_volcano_design_sheet", x, y, row * 29 + col);
        if (col === 8 && row === 7 && (x * 31 + y * 17) % 23 === 0)
          place(
            "tile_cf_volcano_design_sheet",
            x,
            y,
            (6 + ((x + y) % 3)) * 29 + 12 + ((x * 7 + y) % 3),
          );
      }
  // A complete pose shares one lower-plane foot, so height projection cannot
  // separate its intake, wall flow and landing. Normal cliff collision stays.
  for (const f of falls)
    place(
      "prop_cf_cinder_lavafall_flow",
      f.x,
      f.y + 3,
      (f.width - 3) / 2,
      "objects",
    );
  const hot = new Set<string>();
  for (let y = r.minY; y <= r.maxY; y++)
    for (let x = r.minX; x <= r.maxX; x++)
      if (terrain(x, y)?.biome === "lava") {
        hot.add(key(x, y));
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (
              dx * dx + dy * dy <= 5 &&
              dry(x + dx, y + dy) &&
              level(x + dx, y + dy) === level(x, y) &&
              !nearRoad(x + dx, y + dy) &&
              clearFace(x + dx, y + dy)
            )
              hot.add(key(x + dx, y + dy));
      }
  const heated = (x: number, y: number) => hot.has(key(x, y));
  for (const cell of hot) {
    const [x, y] = cell.split(",").map(Number) as [number, number];
    if (!dry(x, y) || nearRoad(x, y)) continue;
    const frame = cinderHeatedAshFrame(
      heated(x, y - 1),
      heated(x + 1, y),
      heated(x, y + 1),
      heated(x - 1, y),
      heated(x - 1, y - 1),
      heated(x + 1, y - 1),
      heated(x + 1, y + 1),
      heated(x - 1, y + 1),
    );
    place("tile_cf_volcano_design_sheet", x, y, frame);
  }
  // Scattered torn paving represents exposed buried masonry, outside curbs.
  let uncoveredPatches = 0;
  for (const [cx, cy] of [
    [681, 186],
    [687, 139],
    [751, 182],
    [758, 117],
    [690, 223],
    [739, 86],
  ]) {
    if (
      ![-1, 0, 1].every((dy) =>
        [-1, 0, 1].every(
          (dx) =>
            dry(cx! + dx, cy! + dy) &&
            clearFace(cx! + dx, cy! + dy) &&
            !nearRoad(cx! + dx, cy! + dy) &&
            !hot.has(key(cx! + dx, cy! + dy)),
        ),
      )
    )
      continue;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        place(
          "tile_cf_volcano_design_sheet",
          cx! + dx,
          cy! + dy,
          cinderUncoveredPavingFrame(dy > -1, dx < 1, dy < 1, dx > -1),
        );
    uncoveredPatches++;
  }
  // Add full native sprites only on clear stable ledges, with full bounds.
  const occupied = new Set(
    objects
      .filter((o) => inRegion(o.tileX, o.tileY, r))
      .flatMap((o) => {
        const p = lookup.get(o.prefabId)!;
        return Array.from({ length: (p.width + 2) * (p.height + 2) }, (_, i) =>
          key(
            o.tileX - p.pivot.tileX + (i % (p.width + 2)) - 1,
            o.tileY - p.pivot.tileY + Math.floor(i / (p.width + 2)) - 1,
          ),
        );
      }),
  );
  for (const p of cinder.placements.filter((p) => p.role === "foliage")) {
    const [x, y] = cinderWorldPoint((p.x - 8) / 16, (p.y - 16) / 16),
      a = art(p.asset),
      left = Math.floor((x * 16 + 8 - a.anchor[0]) / 16),
      top = Math.floor((y * 16 + 16 - a.anchor[1]) / 16);
    const footprint: string[] = [];
    for (
      let ty = top;
      ty <= Math.floor((y * 16 + 15 - a.anchor[1] + a.height) / 16);
      ty++
    )
      for (
        let tx = left;
        tx <= Math.floor((x * 16 + 7 - a.anchor[0] + a.width) / 16);
        tx++
      )
        footprint.push(key(tx, ty));
    if (
      !footprint.every((cell) => {
        const [tx, ty] = cell.split(",").map(Number) as [number, number];
        return (
          dry(tx, ty) &&
          clearFace(tx, ty) &&
          level(tx, ty) === level(x, y) &&
          !nearRoad(tx, ty) &&
          !hot.has(cell) &&
          !occupied.has(cell)
        );
      })
    )
      continue;
    place(p.asset, x, y, p.frame ?? 0, "objects");
    footprint.forEach((cell) => occupied.add(cell));
  }
  // The source foam ring faces the final logical coast; it never changes
  // ocean collision or hides a cliff course with random waves.
  const land = (x: number, y: number) => terrain(x, y)?.surface === "stone";
  for (let y = r.minY; y <= r.maxY; y++)
    for (let x = r.minX; x <= r.maxX; x++)
      if (terrain(x, y)?.biome === "water") {
        const n = land(x, y - 1),
          e = land(x + 1, y),
          s = land(x, y + 1),
          w = land(x - 1, y);
        let col = -1,
          row = -1;
        if (s && e) {
          col = 0;
          row = 0;
        } else if (s && w) {
          col = 2;
          row = 0;
        } else if (n && e) {
          col = 0;
          row = 2;
        } else if (n && w) {
          col = 2;
          row = 2;
        } else if (s) {
          col = 1;
          row = 0;
        } else if (n) {
          col = 1;
          row = 2;
        } else if (e) {
          col = 0;
          row = 1;
        } else if (w) {
          col = 2;
          row = 1;
        } else if (land(x + 1, y + 1)) {
          col = 0;
          row = 0;
        } else if (land(x - 1, y + 1)) {
          col = 2;
          row = 0;
        } else if (land(x + 1, y - 1)) {
          col = 0;
          row = 2;
        } else if (land(x - 1, y - 1)) {
          col = 2;
          row = 2;
        }
        if (col >= 0) place("tile_cf_cinder_coast_foam", x, y, row * 20 + col);
      }
  // Willowharbour keeps its established town, river, raised headwaters and
  // manual objects. Only the coast/outer woodland uses the reviewed silhouette.
  const w = HEARTH_ISLANDS.willowharbour;
  const protectedTown = (x: number, y: number) =>
    (x >= 101 && x <= 204 && y >= 345 && y <= 456) ||
    (x >= 188 && y >= 394 && y <= 407);
  for (let y = w.minY; y <= w.maxY; y++)
    for (let x = w.minX; x <= w.maxX; x++) {
      const old = terrain(x, y);
      if (protectedTown(x, y) || (old?.elevation ?? 0) > 0) continue;
      const lx = Math.floor(((x - w.minX) * 144) / 160),
        ly = Math.floor(((y - w.minY) * 116) / 160),
        c = willow.document.cells[key(lx, ly)];
      cells[key(x, y)] = {
        elevation: 0,
        biome: c ? (c.biome === "beach" ? "beach" : "plains") : "water",
        surface: c ? (c.biome === "beach" ? "sand" : "grass") : "water",
        feature: "none",
        cliffFamily: "stone_1",
        surfaceFamily: "grass_1",
      };
    }
  // Retire disconnected unowned coastline slivers from the old protected mask.
  const willowState = { ...base, cells };
  const willowOcean = (x: number, y: number) =>
    resolvedMapBiomeAt(willowState, x, y) === "water";
  // A preserved rectangular town can leave a thin beach hook along its
  // seam with the new coast. Trim unowned beach-only tails before the flood
  // fill; a tail attached at its north end still counts as connected land.
  for (let y = w.minY + 1; y < w.maxY; y++)
    for (let x = w.minX + 1; x < w.maxX; x++) {
      if (!willowOcean(x - 1, y) || terrain(x, y)?.biome !== "beach") continue;
      let end = x;
      while (end < w.maxX && terrain(end, y)?.biome === "beach") end++;
      if (end - x > 3 || !willowOcean(end, y)) continue;
      const strip = Array.from({ length: end - x }, (_, dx) => x + dx);
      if (
        strip.some(
          (tx) =>
            protectedTown(tx, y) ||
            (terrain(tx, y)?.elevation ?? 0) !== 0 ||
            objects.some(
              (o) =>
                Math.hypot(o.tileX - tx, o.tileY - y) < 3 &&
                !/hearth-(tree-|nature-cf-grass|prop-cf-flowers)/.test(
                  o.prefabId,
                ),
            ),
        )
      )
        continue;
      for (const tx of strip)
        cells[key(tx, y)] = { biome: "water", surface: "water", elevation: 0 };
    }
  const mainland = new Set<string>(),
    queue = [[160, 400]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    const k = key(x!, y!);
    if (mainland.has(k) || !inRegion(x!, y!, w) || willowOcean(x!, y!))
      continue;
    mainland.add(k);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ])
      queue.push([x! + dx!, y! + dy!]);
  }
  for (let y = w.minY; y <= w.maxY; y++)
    for (let x = w.minX; x <= w.maxX; x++)
      if (
        !mainland.has(key(x, y)) &&
        (terrain(x, y)?.elevation ?? 0) === 0 &&
        !objects.some(
          (o) =>
            o.tileX === x &&
            o.tileY === y &&
            !/hearth-(tree-|nature-cf-grass|prop-cf-flowers)/.test(o.prefabId),
        )
      )
        cells[key(x, y)] = {
          elevation: 0,
          biome: "water",
          surface: "water",
          feature: "none",
          cliffFamily: "stone_1",
          surfaceFamily: "grass_1",
        };
  // Resolve the preserved town's shore into a native continuous beach apron.
  for (let y = w.minY + 1; y < w.maxY; y++)
    for (let x = w.minX + 1; x < w.maxX; x++)
      if (
        (terrain(x, y)?.elevation ?? 0) === 0 &&
        terrain(x, y)?.biome === "plains" &&
        [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ].some(([dx, dy]) => willowOcean(x + dx!, y + dy!)) &&
        !objects.some(
          (o) =>
            Math.hypot(o.tileX - x, o.tileY - y) < 3 &&
            !/hearth-(tree-|nature-cf-grass|prop-cf-flowers)/.test(o.prefabId),
        )
      )
        cells[key(x, y)] = {
          ...terrain(x, y),
          biome: "beach",
          surface: "sand",
        };
  // Coastal trees wholly submerged by a new cove are scenery, never gameplay.
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i]!;
    if (
      inRegion(o.tileX, o.tileY, w) &&
      !protectedTown(o.tileX, o.tileY) &&
      terrain(o.tileX, o.tileY)?.biome === "water" &&
      /hearth-(tree-|nature-cf-grass|prop-cf-flowers)/.test(o.prefabId)
    ) {
      objects.splice(i, 1);
      retired++;
    }
  }
  // Ocean stays implicit where the existing generated base already supplies
  // it. New coves over old land keep explicit water; no semantic change occurs.
  for (const [k, c] of Object.entries(cells)) {
    const [x, y] = k.split(",").map(Number);
    if (
      !inUpdatedIsland(x!, y!) ||
      c.biome !== "water" ||
      c.surface !== "water" ||
      (c.elevation ?? 0) !== 0
    )
      continue;
    if (!base.cells[k] && resolvedMapBiomeAt(base, x!, y!) === "water")
      delete cells[k];
    else cells[k] = { biome: "water", surface: "water" };
  }
  const transitions = [
    ...base.transitions.filter(
      (t) =>
        !inRegion(t.lowerTileX, t.lowerTileY, r) &&
        !inRegion(t.upperTileX, t.upperTileY, r),
    ),
    ...crossings,
  ];
  const document = parseMapDocumentV3(
    serializeMapDocumentV3({ ...base, cells, prefabs, objects, transitions }),
  );
  return {
    document,
    report: {
      baseRevision: base.revision,
      addedObjects: added,
      retiredScenery: retired,
      physicalCinderLevels: 3,
      crossings,
      route,
      bridgeCells: [...bridges],
      heatedCells: hot.size,
      falls,
      uncoveredPatches,
      limitations: [
        "Current supported closed cliffs and north-bank masonry ascent; continuous natural slopes pending",
        "Native scene adapted around preserved town, fixtures and encounter heights",
      ],
    },
  };
}
