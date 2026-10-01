/** Real engine candidate captures: no alternate renderer or world writes. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCanvas, Image, ImageData, type Canvas } from "@napi-rs/canvas";
import {
  parseMapDocumentV3,
  serializeMapDocumentV3ForTransport,
  terrainDocumentForMapV3,
  HEARTH_ISLANDS,
} from "../packages/sim/src/index.js";
import {
  loadGeneratedAsset,
  type BuiltAssetRecord,
  type LoadedAsset,
} from "../packages/ui/src/index.js";
import { GroundChunkCache } from "../packages/engine/src/ground-cache.js";
import { terrainArrayForMapDocument } from "../packages/engine/src/editor-terrain.js";
import {
  MAP_EDITOR_ASSET_NAMES,
  type OverworldArt,
} from "../packages/engine/src/overworld-art.js";
import { enqueueRaisedTerrainDepth } from "../packages/engine/src/raised-terrain-depth.js";
import {
  enqueueMapObjects,
  preloadMapObjectAssets,
  mapObjectAssetsReady,
  mapObjectPointLights,
  mapObjectLightOccluders,
} from "../packages/engine/src/map-object-presentation.js";
import { TERRAIN_ARRAY_MAP_OBJECT_SAMPLER } from "../packages/engine/src/terrain-array-map-object-sampler.js";
import { projectPointLightToTerrain } from "../packages/engine/src/light-projection.js";
import { createLightOcclusionMap } from "../packages/engine/src/light-occlusion.js";
import {
  WorldLightingRenderer,
  celestialCastersFromOcclusion,
} from "../packages/engine/src/world-lighting-renderer.js";
import { celestialLightingAtCalendar } from "../packages/engine/src/celestial-lighting.js";
import { TileLightmap } from "../packages/engine/src/lighting.js";
import { setGroundLightSource } from "../packages/engine/src/ground-light-source.js";
import { terrainElevationAtWorldFoot } from "../packages/engine/src/terrain-sampling.js";
import { publicationRegistry } from "../packages/studio/src/world-chunks/publication-materialize.js";
import {
  terrainProjectedDepthAtFoot,
  terrainProjectedElevationAtFoot,
  terrainProjectedSortOffset,
} from "../packages/engine/src/terrain-sampling.js";
import {
  sortWorldDepthItems,
  type WorldDepthItem,
} from "../packages/engine/src/renderer.js";
import { validateNativeIslandDesigns } from "./native-island-validation.js";
import { applyNativeIslandDesigns } from "./apply-native-island-designs.js";
import { lavaLightProof } from "./native-island-light-proof.js";

const root = resolve(import.meta.dirname, ".."),
  generated = resolve(root, "packages/assets/generated");
const output = resolve(
  process.argv[2] ?? resolve(root, "output/island-world-update-20261002"),
);
class LocalImage extends Image {
  constructor() {
    super();
    const nativeSrc = Object.getOwnPropertyDescriptor(Image.prototype, "src")!;
    Object.defineProperty(this, "src", {
      get: () => nativeSrc.get!.call(this),
      set: (value: string | Uint8Array) =>
        nativeSrc.set!.call(
          this,
          typeof value === "string" && value.startsWith("/generated/")
            ? readFileSync(
                resolve(
                  generated,
                  value.split("?")[0]!.slice("/generated/".length),
                ),
              )
            : value,
        ),
    });
  }
}
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(1, 1) },
  ImageData,
  Image: LocalImage,
  HTMLImageElement: LocalImage,
});
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.startsWith("/generated/")) {
    const bytes = await readFile(
      resolve(generated, url.split("?")[0]!.slice("/generated/".length)),
    );
    return new Response(bytes, {
      headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(input, init);
};
const records: Record<string, BuiltAssetRecord> = {};
for (const file of await readdir(generated))
  if (/^atlas_.*\.meta\.json$/.test(file))
    Object.assign(
      records,
      JSON.parse(await readFile(resolve(generated, file), "utf8")).assets,
    );
const lookup = (name: string) => {
  const a = records[name];
  if (!a) throw Error(`asset_missing:${name}`);
  const kind = a.variants.base
      ? ("variant" as const)
      : a.animations.base
        ? ("animation" as const)
        : ("state" as const),
    frames =
      kind === "state"
        ? [a.states.base!]
        : kind === "variant"
          ? a.variants.base!
          : a.animations.base!;
  return {
    blocksMovement: a.placement?.blocksMovement ?? false,
    registryRevision: JSON.parse(
      readFileSync(resolve(generated, "atlas.packs.json"), "utf8"),
    ).revision,
    collision: a.collision ?? [],
    assetId: a.assetId,
    anchor: a.anchor,
    width: frames[0]!.width,
    height: frames[0]!.height,
    kind,
    group: "base",
    frames: frames.length,
  };
};
const base = parseMapDocumentV3(
  await readFile(resolve(output, "live-map.json"), "utf8"),
);
const { document: map, report } = applyNativeIslandDesigns(base, lookup);
await writeFile(
  resolve(output, "candidate-map.json"),
  serializeMapDocumentV3ForTransport(map),
);
const acceptance = validateNativeIslandDesigns(base, map);
await writeFile(
  resolve(output, "candidate-delta.json"),
  JSON.stringify(acceptance.delta),
);
await writeFile(
  resolve(output, "walking-report.json"),
  JSON.stringify(acceptance.report, null, 2) + "\n",
);
console.log(JSON.stringify(acceptance.report));
await writeFile(
  resolve(output, "candidate-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
await preloadMapObjectAssets(base);
await preloadMapObjectAssets(map);
if (!mapObjectAssetsReady(map)) throw Error("object_art_not_ready");
const assets = new Map<string, LoadedAsset>();
await Promise.all(
  [
    ...new Set([
      ...Object.keys(records).filter((n) => n.startsWith("tile_")),
      ...Object.values(MAP_EDITOR_ASSET_NAMES),
    ]),
  ]
    .filter((n) => records[n])
    .map(async (n) => assets.set(n, await loadGeneratedAsset(n))),
);
const named = MAP_EDITOR_ASSET_NAMES as Record<string, string>,
  terrainAssets = Object.fromEntries(
    [...assets].filter(([n]) => n.startsWith("tile_")),
  );
const art = new Proxy(
  { terrainAssets },
  {
    get: (t, k) =>
      k === "terrainAssets"
        ? t.terrainAssets
        : typeof k === "string"
          ? assets.get(named[k] ?? k)
          : undefined,
  },
) as unknown as OverworldArt;
const registry = publicationRegistry(
  JSON.parse(await readFile(resolve(output, "live-state.json"), "utf8"))
    .contentRows,
);
for (const [label, document] of [
  ["before", base],
  ["after", map],
  ["night", map],
] as const) {
  const terrain = terrainArrayForMapDocument(
    terrainDocumentForMapV3(document),
    undefined,
    document,
    { includeTerrainPlaneCollision: false },
  );
  for (const [name, r] of Object.entries(HEARTH_ISLANDS)) {
    if (label === "night" && name !== "cinderwake") continue;
    const width = (r.maxX - r.minX + 1) * 16,
      height = (r.maxY - r.minY + 1) * 16,
      cameraX = r.minX * 16,
      cameraY = r.minY * 16;
    const canvas = createCanvas(width, height),
      ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = false;
    const cache = new GroundChunkCache(),
      queue: WorldDepthItem[] = [];
    let lighting: WorldLightingRenderer | undefined,
      lightmap: TileLightmap | undefined;
    if (label === "night") {
      const lights = mapObjectPointLights(document, registry, 0n, true).map(
        (light) =>
          projectPointLightToTerrain(
            light,
            terrain,
            (x, y) => terrainProjectedDepthAtFoot(terrain, x, y),
            light.receiverDirectionWorldY,
            light.terrainContactX,
          ),
      );
      const occlusion = createLightOcclusionMap(
        terrain,
        [],
        [],
        mapObjectLightOccluders(
          document,
          terrain,
          TERRAIN_ARRAY_MAP_OBJECT_SAMPLER,
          registry,
          0,
        ),
        art.terrainAssets?.["tile_cf_volcanic_cliff"] ?? art.cliff,
      );
      const sky = celestialLightingAtCalendar({
        continuousDay: 3.5,
        clockHours: 0,
        lunarProgress: 0.5,
        lunarIllumination: 0,
      });
      lighting = new WorldLightingRenderer(terrain);
      lightmap = new TileLightmap();
      lightmap.prepare(
        terrain,
        cameraX,
        cameraY,
        1,
        width,
        height,
        sky.diffuse,
        lights,
        occlusion,
        "unified",
        true,
      );
      lighting.begin(
        sky,
        celestialCastersFromOcclusion(
          occlusion,
          lighting.mapper,
          cameraX,
          cameraY,
          width,
          height,
        ),
        [],
        lightmap,
        cameraX,
        cameraY,
        width,
        height,
      );
      const renderer = lighting;
      setGroundLightSource(ctx, (source, x, y, level) =>
        renderer.groundSource(source, x, y, level),
      );
      let strongestAshReceiver = { r: 0, g: 0, b: 0 };
      for (const light of lights.filter(
        (l) => l.color.r === 251 && l.color.g === 107,
      )) {
        const level = light.elevationLayer ?? 0;
        const tx = Math.floor(light.worldX / 16),
          ty = Math.floor(renderer.mapper.logicalY(light.worldY, level) / 16);
        for (let dy = -4; dy <= 4; dy++)
          for (let dx = -4; dx <= 4; dx++) {
            const x = tx + dx,
              y = ty + dy,
              cell = document.cells[`${x},${y}`];
            if (
              cell?.biome !== "volcanic_ash" ||
            cell.collisionReason === "lava" ||
              terrainElevationAtWorldFoot(terrain, x * 16 + 8, (y + 1) * 16) !==
                level
            )
              continue;
            const local = lightmap.sampleReceiverLight(
              x * 16 + 8,
              renderer.mapper.projectedY(y * 16 + 8, level),
              level,
              "flat",
            );
            if (local.r > strongestAshReceiver.r) strongestAshReceiver = local;
          }
      }
      if (strongestAshReceiver.r === 0)
        throw Error("native_lava_casts_no_ash_light");
      await writeFile(
        resolve(output, "lava-lighting-report.json"),
        JSON.stringify(
          {
            nativeEmitters: lights.filter(
              (l) =>
                l.worldX >= cameraX &&
                l.worldX <= cameraX + width &&
                l.worldY >= cameraY - 128 &&
                l.worldY <= cameraY + height,
            ).length,
            source:
              "mapObjectPointLights; selected native emissive masks; actual light projection/terrain occlusion/receiver pipeline",
            midnightDiffuse: sky.diffuse,
            strongestAshReceiver,
          },
          null,
          2,
        ) + "\n",
      );
    }
    cache.draw(ctx, art, terrain, cameraX, cameraY, 1, width, height);
    lighting?.compositeGround(ctx, 1);
    enqueueRaisedTerrainDepth(
      queue,
      ctx,
      art,
      terrain,
      cache,
      cameraX,
      cameraY,
      1,
      width,
      height,
      undefined,
      lighting
        ? (x, y, level, face, draw) =>
            lighting!.drawReceiver(ctx, x, y, level, face, draw)
        : undefined,
    );
    enqueueMapObjects(document, {
      context: ctx,
      cameraX,
      cameraY,
      scale: 1,
      timeMs: 0,
      visible: (x, y) =>
        x >= cameraX - 96 &&
        x <= cameraX + width + 96 &&
        y >= cameraY - 96 &&
        y <= cameraY + height + 96,
      enqueue: (x, y, item) => {
        const projection = terrainProjectedDepthAtFoot(terrain, x, y),
          elevation = terrainProjectedElevationAtFoot(terrain, x, y);
        queue.push({
          ...item,
          footY: item.footY - projection,
          depthOffset:
            item.depthOffset ?? terrainProjectedSortOffset(elevation),
          elevationLayer:
            item.elevationLayer ?? Math.ceil(Math.max(0, elevation - 0.001)),
          draw: () => {
            ctx.save();
            ctx.translate(0, -projection);
            if (lighting)
              lighting.drawReceiver(
                ctx,
                x,
                y,
                terrainElevationAtWorldFoot(terrain, x, y),
                item.depthPhase === "surface" ? "flat" : "south",
                item.draw,
              );
            else item.draw();
            ctx.restore();
          },
        });
      },
    });
    for (const item of sortWorldDepthItems(queue)) item.draw();
    await writeFile(
      resolve(output, `${name}-${label}.png`),
      canvas.toBuffer("image/png"),
    );
    console.log(`${name} ${label}: ${queue.length} depth entries`);
    setGroundLightSource(ctx);
    lighting?.frames.reset();
    lightmap?.reset();
  }
}
const proof = lavaLightProof(art, assets);
if (
  proof.stats.some(
    (stat) =>
      !(stat as { groundPathEmissivePreserved: boolean })
        .groundPathEmissivePreserved,
  )
)
  throw Error("native_lava_ground_emission_lost");
await writeFile(
  resolve(output, "lava-occlusion-proof.png"),
  (proof.board as unknown as Canvas).toBuffer(
    "image/png",
  ),
);
await writeFile(
  resolve(output, "lava-occlusion-proof.json"),
  JSON.stringify(proof.stats, null, 2) + "\n",
);
console.log(JSON.stringify(report));
