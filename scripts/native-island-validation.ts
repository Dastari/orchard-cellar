/** v1.0.0 — Pure real-hitbox and preservation acceptance; no world mutations. */
import {
  compileMapDocument,
  collisionMapForCompiledMapDocument,
  movementPositionAllowed,
  TILE_SIZE_FIXED,
  FIXED_UNITS_PER_PIXEL,
  PLAYER_HITBOX_FOOT_OFFSET,
  HEARTH_ISLANDS,
  createMapDocumentDelta,
  mapDocumentSemanticHash,
  applyMapDocumentDelta,
  parseMapDocumentV3,
  terrainDocumentForMapV3,
  type MapDocumentV3,
} from "../packages/sim/src/index.js";
import { liveMapObjectCollisionObstacles } from "../packages/engine/src/live-map-runtime.js";
import { inUpdatedIsland } from "./apply-native-island-designs.js";

const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const point = (x: number, y: number) => ({
  x: x * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  y: y * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + PLAYER_HITBOX_FOOT_OFFSET + 1,
});
export function validateNativeIslandDesigns(
  base: MapDocumentV3,
  target: MapDocumentV3,
) {
  for (const field of [
    "id",
    "width",
    "height",
    "defaultCliffFamily",
    "defaultSurfaceFamily",
    "baseBiome",
    "baseElevation",
    "provenance",
    "landmarks",
    "anchors",
    "resourcePlacements",
    "combatRegions",
    "generatedSuppressions",
    "entityStates",
    "scenery",
    "stairRuns",
    "layers",
  ] as const)
    if (!equal(base[field], target[field]))
      throw Error(`island_preservation_failed:${field}`);
  for (const [key, cell] of Object.entries(base.cells)) {
    const [x, y] = key.split(",").map(Number);
    if (!inUpdatedIsland(x!, y!) && !equal(cell, target.cells[key]))
      throw Error(`outside_island_cell_changed:${key}`);
  }
  for (const [key] of Object.entries(target.cells)) {
    const [x, y] = key.split(",").map(Number);
    if (!inUpdatedIsland(x!, y!) && !(key in base.cells))
      throw Error(`outside_island_cell_added:${key}`);
  }
  const objects = new Map(target.objects.map((o) => [o.id, o]));
  for (const o of base.objects) {
    const current = objects.get(o.id);
    if (current) {
      if (!equal(o, current)) throw Error(`retained_object_changed:${o.id}`);
      continue;
    }
    if (
      !inUpdatedIsland(o.tileX, o.tileY) ||
      !/hearth-cinder-prop-cf-cinder-(broad-pillar|column-cluster|violet-plant)|hearth-(tree-|nature-cf-grass|prop-cf-flowers)/.test(
        o.prefabId,
      )
    )
      throw Error(`world_fixture_removed:${o.id}`);
  }
  const prefabs = new Map(target.prefabs.map((p) => [p.id, p]));
  for (const p of base.prefabs)
    if (!equal(p, prefabs.get(p.id)))
      throw Error(`retained_prefab_changed:${p.id}`);
  const delta = createMapDocumentDelta(base, target);
  for (const [x, y, elevation] of [
    [678, 204, 0],
    [715, 205, 0],
    [725, 169, 1],
    [736, 147, 2],
    [721, 117, 3],
    [721, 100, 3],
  ] as const)
    if (
      (target.cells[`${x},${y}`]?.elevation ?? target.baseElevation) !==
      elevation
    )
      throw Error(`island_encounter_elevation_changed:${x},${y}`);
  const reconstructed = applyMapDocumentDelta(base, delta);
  if (
    mapDocumentSemanticHash(parseMapDocumentV3(reconstructed)) !==
    mapDocumentSemanticHash(target)
  )
    throw Error("island_delta_roundtrip_failed");
  const map = collisionMapForCompiledMapDocument(
    compileMapDocument(terrainDocumentForMapV3(target)),
  );
  const obstacles = liveMapObjectCollisionObstacles(target),
    buckets = new Map<string, (typeof obstacles)[number][]>();
  for (const o of obstacles)
    for (
      let y = Math.floor(o.top / TILE_SIZE_FIXED);
      y <= Math.floor(o.bottom / TILE_SIZE_FIXED);
      y++
    )
      for (
        let x = Math.floor(o.left / TILE_SIZE_FIXED);
        x <= Math.floor(o.right / TILE_SIZE_FIXED);
        x++
      ) {
        const k = `${x},${y}`;
        const bucket = buckets.get(k) ?? [];
        bucket.push(o);
        buckets.set(k, bucket);
      }
  const contexts = new Map<string, typeof map>();
  const allowed = (
    from: ReturnType<typeof point>,
    to: ReturnType<typeof point>,
  ) => {
    const x = Math.floor(to.x / TILE_SIZE_FIXED),
      y = Math.floor((to.y - PLAYER_HITBOX_FOOT_OFFSET) / TILE_SIZE_FIXED),
      k = `${x},${y}`;
    let nearby = contexts.get(k);
    if (!nearby) {
      const found = new Set<(typeof obstacles)[number]>();
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          for (const o of buckets.get(`${x + dx},${y + dy}`) ?? [])
            found.add(o);
      nearby = { ...map, obstacles: [...found] };
      contexts.set(k, nearby);
    }
    return movementPositionAllowed(from, to, nearby);
  };
  const walk = (x: number, y: number, dx: number, dy: number) => {
    let current = point(x, y);
    const end = point(x + dx, y + dy);
    if (!allowed(current, current)) return false;
    while (current.x !== end.x || current.y !== end.y) {
      const next = {
        x:
          current.x +
          Math.sign(end.x - current.x) *
            Math.min(FIXED_UNITS_PER_PIXEL, Math.abs(end.x - current.x)),
        y:
          current.y +
          Math.sign(end.y - current.y) *
            Math.min(FIXED_UNITS_PER_PIXEL, Math.abs(end.y - current.y)),
      };
      if (!allowed(current, next)) return false;
      current = next;
    }
    return true;
  };
  const reachability: Record<
    string,
    { reachable: number; goals: readonly number[][] }
  > = {};
  for (const [name, start, goals] of [
    [
      "cinderwake",
      [652, 211],
      [
        [644, 207],
        [652, 195],
        [668, 195],
        [668, 176],
        [701, 176],
        [701, 160],
        [767, 160],
        [767, 142],
        [706, 142],
        [706, 125],
        [724, 125],
        [724, 109],
        [721, 104],
        [678, 204],
        [715, 205],
        [725, 169],
        [736, 147],
        [721, 117],
      ],
    ],
    [
      "willowharbour",
      [204, 400],
      [
        [209, 400],
        [184, 405],
        [160, 405],
        [120, 405],
      ],
    ],
  ] as const) {
    const r = HEARTH_ISLANDS[name],
      seen = new Set<string>([start.join(",")]),
      queue: number[][] = [[...start]];
    if (!allowed(point(start[0], start[1]), point(start[0], start[1])))
      throw Error(`ferry_landing_blocked:${name}`);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i]!;
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const xx = x! + dx!,
          yy = y! + dy!,
          key = `${xx},${yy}`;
        if (
          xx < r.minX ||
          xx > r.maxX ||
          yy < r.minY ||
          yy > r.maxY ||
          seen.has(key)
        )
          continue;
        if (walk(x!, y!, dx!, dy!)) {
          seen.add(key);
          queue.push([xx, yy]);
        }
      }
    }
    const acceptedGoals: number[][] = goals.map((g) => [...g]);
    if (name === "willowharbour")
      for (const o of base.objects.filter(
        (o) =>
          o.id.startsWith("hearth-village-") &&
          base.prefabs
            .find((p) => p.id === o.prefabId)
            ?.placements.some((p) => p.assetName.startsWith("building_")),
      ))
        acceptedGoals.push([o.tileX, o.tileY + 2]);
    for (const goal of acceptedGoals)
      if (!seen.has(goal.join(",")))
        throw Error(`island_goal_unreachable:${name}:${goal.join(",")}`);
    reachability[name] = { reachable: seen.size, goals: acceptedGoals };
  }
  let blockedLava = 0;
  for (const [key, cell] of Object.entries(target.cells))
    if (cell.biome === "lava") {
      if (cell.collision !== "force_block" || cell.collisionReason !== "lava")
        throw Error(`lava_collision_missing:${key}`);
      const [x, y] = key.split(",").map(Number);
      const p = point(x!, y!);
      if (allowed(p, p)) throw Error(`lava_is_walkable:${key}`);
      blockedLava++;
    }
  return {
    delta,
    report: {
      baseHash: delta.baseHash,
      targetHash: delta.targetHash,
      deltaBytes: Buffer.byteLength(JSON.stringify(delta)),
      blockedLava,
      collisionObstacles: obstacles.length,
      reachability,
      preservation:
        "All non-island cells, retained prefabs and world fixtures verified",
    },
  };
}
