import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyMapEdit,
  createEmptyMapDocument,
  SURVIVAL_BIOMES,
  spaceDefinitionFor,
  type MapCellPatch,
  type MapDocumentV2,
  type MapEditCommand,
} from '@orchard/sim';
import type { LoadedAsset } from '@orchard/ui';
import { terrainArrayForMapDocument } from './editor-terrain.js';
import {
  authoredCliffGroundLayerAt,
  authoredGrassFringeLayersAt,
  exactGroundPartsAt,
  GroundChunkCache,
  groundAssetForTile,
  groundTileInsideTerrain,
} from './ground-cache.js';
import { createLightOcclusionMap, rasterizeLightOcclusion } from './light-occlusion.js';
import type { OverworldArt } from './overworld-art.js';
import {
  enqueueRaisedTerrainDepth,
  raisedTerrainDepthEntries,
  raisedTerrainSurfaceRuns,
  terrainLedgePlanAt,
} from './raised-terrain-depth.js';
import { sortWorldDepthItems, type WorldDepthItem } from './renderer.js';
import { residenceWallAt } from './residence-wall.js';
import {
  authoredFarmlandRuleLayersAt,
  cellarExposedWallAt,
  plateauLayerPlansAt,
  terrainBiomeAt,
  terrainCliffFamilyAt,
  terrainColorAt,
  terrainElevationAt,
  terrainForSpace,
  terrainPlaneCollisionCellAt,
  terrainProjectedElevationAtFoot,
  terrainWithCellarExcavations,
  type TerrainArray,
} from './terrain.js';
import { cellFlags } from '@orchard/sim/cell-flags';

// Static world S4b: every terrain-array index moved behind terrainIndexAt().
// These digests were recorded from the pre-refactor code (origin/main c2e85788)
// and pin the ground-chunk draw lists, the raised-terrain depth queue, light
// occlusion and the per-tile resolvers (including their out-of-range answers)
// byte for byte.

const digest = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(value, (_key, entry: unknown) => (
    entry instanceof Map ? [...entry.entries()]
      : ArrayBuffer.isView(entry) ? Array.from(entry as Uint8Array)
        : entry === undefined ? '<undefined>' : entry
  )))
  .digest('hex')
  .slice(0, 32);

type Recorded = readonly (string | number)[];
interface RecordingImage { readonly name?: string; ctx?: RecordingContext; width: number; height: number }

class RecordingContext {
  readonly log: Recorded[] = [];
  imageSmoothingEnabled = false;
  fillStyle: unknown = '';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  constructor(readonly id: number) {}
  save() { this.log.push(['save']); }
  restore() { this.log.push(['restore']); }
  translate(x: number, y: number) { this.log.push(['translate', x, y]); }
  scale(x: number, y: number) { this.log.push(['scale', x, y]); }
  rotate(angle: number) { this.log.push(['rotate', angle]); }
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  setTransform() { this.log.push(['setTransform']); }
  clip() { this.log.push(['clip']); }
  beginPath() { this.log.push(['beginPath']); }
  rect(...n: number[]) { this.log.push(['rect', ...n]); }
  clearRect(...n: number[]) { this.log.push(['clearRect', ...n]); }
  fillRect(...n: number[]) {
    this.log.push(['fillRect', String(this.fillStyle), this.globalCompositeOperation, this.globalAlpha, ...n]);
  }
  drawImage(image: RecordingImage, ...n: number[]) {
    this.log.push(['drawImage', image.name ?? `canvas:${image.ctx?.id ?? '?'}`,
      this.globalCompositeOperation, this.globalAlpha, ...n]);
  }
}

function recorder() {
  const canvases: RecordingImage[] = [];
  const create = (): HTMLCanvasElement => {
    const canvas: RecordingImage & { getContext?: () => RecordingContext } = { width: 0, height: 0 };
    canvas.ctx = new RecordingContext(canvases.length + 1);
    canvas.getContext = () => canvas.ctx!;
    canvases.push(canvas);
    return canvas as unknown as HTMLCanvasElement;
  };
  return { canvases, create };
}

function fakeAsset(name: string): LoadedAsset {
  const frames = Array.from({ length: 256 }, (_, index) => ({ x: index * 16, y: 0, width: 16, height: 16, durationTicks: 0 }));
  return {
    name,
    image: { name } as unknown as CanvasImageSource,
    anchor: [8, 15],
    metadata: { animations: {}, variants: { base: frames } },
  } as unknown as LoadedAsset;
}

function fakeArt(): OverworldArt {
  const assets = new Map<string, LoadedAsset>();
  const asset = (name: string): LoadedAsset => {
    let value = assets.get(name);
    if (value === undefined) { value = fakeAsset(name); assets.set(name, value); }
    return value;
  };
  const terrainAssets = new Proxy({}, { get: (_target, key) => typeof key === 'string' ? asset(key) : undefined });
  return new Proxy({}, {
    get: (_target, key) => key === 'terrainAssets' ? terrainAssets
      : typeof key === 'string' ? asset(`art_${key}`) : undefined,
  }) as OverworldArt;
}

/** Full ground pass plus the sorted raised-terrain depth queue over the whole map. */
function drawList(terrain: TerrainArray): string {
  const { canvases, create } = recorder();
  const art = fakeArt();
  const main = new RecordingContext(0);
  const context = main as unknown as CanvasRenderingContext2D;
  const cache = new GroundChunkCache(256, create);
  const width = terrain.width * 16;
  const height = terrain.height * 16;
  cache.draw(context, art, terrain, -32, -32, 1, width + 64, height + 64);
  const items: WorldDepthItem[] = [];
  enqueueRaisedTerrainDepth(items, context, art, terrain, cache, -32, -32, 1, width + 64, height + 64);
  for (const item of sortWorldDepthItems(items)) {
    main.log.push(['tie', String(item.tie)]);
    item.draw();
  }
  const chunks = canvases.map((canvas) => canvas.ctx!.log);
  const count = main.log.length + chunks.reduce((sum, log) => sum + log.length, 0);
  return `${count}:${digest({ main: main.log, chunks })}`;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** Per-tile resolvers, sampled two tiles past every edge. */
function resolvers(terrain: TerrainArray): string {
  const rows: unknown[] = [];
  const art = fakeArt();
  for (const y of range(-2, terrain.height + 1)) for (const x of range(-2, terrain.width + 1)) {
    const inside = groundTileInsideTerrain(terrain, x, y);
    rows.push([
      x, y, inside,
      terrainBiomeAt(terrain, x, y),
      terrainColorAt(terrain, x, y),
      terrainCliffFamilyAt(terrain, x, y),
      terrainElevationAt(terrain, x, y),
      plateauLayerPlansAt(terrain, x, y),
      terrainPlaneCollisionCellAt(terrain, x, y, 0),
      terrainPlaneCollisionCellAt(terrain, x, y, 1),
      authoredFarmlandRuleLayersAt(terrain, x, y),
      exactGroundPartsAt(terrain, x, y),
      terrainLedgePlanAt(terrain, x, y),
      cellarExposedWallAt(terrain, x, y),
      residenceWallAt(terrain, x, y),
      // Only ever called for tiles inside the map (the chunk loop guards them).
      inside ? authoredCliffGroundLayerAt(terrain, x, y) : null,
      inside ? (groundAssetForTile(art, terrain, x, y, terrainBiomeAt(terrain, x, y)) as unknown as { name: string }).name : null,
      inside ? authoredGrassFringeLayersAt(terrain, x, y) : null,
    ]);
  }
  for (const y of range(-1, terrain.height * 2)) for (const x of range(-1, terrain.width * 2)) {
    rows.push(terrainProjectedElevationAtFoot(terrain, x * 8 + 3, y * 8 + 5));
  }
  rows.push(raisedTerrainSurfaceRuns(terrain, -3, -3, terrain.width + 3, terrain.height + 3));
  rows.push(raisedTerrainDepthEntries(terrain, -3, -3, terrain.width + 3, terrain.height + 3)
    .map(({ plan, ...entry }) => ({ ...entry, plan: JSON.stringify(plan) })));
  return digest(rows);
}

function lighting(terrain: TerrainArray): string {
  const map = createLightOcclusionMap(terrain);
  const windows: unknown[] = [];
  for (const [minTileX, minTileY] of [[-3, -2], [0, 0], [terrain.width - 5, terrain.height - 4]] as const) {
    const width = 12 * 2;
    const height = 9 * 2;
    const target = new Uint8Array(width * height);
    rasterizeLightOcclusion(target, width, height, minTileX!, minTileY!, 2, map);
    windows.push(target);
  }
  return digest({
    hardBlocked: map.hardBlocked,
    frontFaces: map.frontFaces,
    occluders: map.terrainOccluders?.map(({ opaque, ...rest }) => ({ ...rest, opaque: digest(opaque) })),
    windows,
  });
}

function paint(document: MapDocumentV2, points: readonly { tileX: number; tileY: number }[], patch: MapCellPatch): MapDocumentV2 {
  return applyMapEdit(document, { kind: 'paint', points, patch } as MapEditCommand).document;
}

function rect(x0: number, y0: number, x1: number, y1: number): { tileX: number; tileY: number }[] {
  const points: { tileX: number; tileY: number }[] = [];
  for (let tileY = y0; tileY <= y1; tileY += 1) for (let tileX = x0; tileX <= x1; tileX += 1) points.push({ tileX, tileY });
  return points;
}

/** A 40x36 authored map touching every per-cell channel the renderer reads. */
function authoredTerrain(cliffFamily: 'stone_1' | 'dungeon_1' = 'stone_1'): TerrainArray {
  let document: MapDocumentV2 = createEmptyMapDocument({
    id: 'terrain-index-parity', title: 'Parity', width: 40, height: 36, cliffFamily,
  });
  document = paint(document, rect(3, 4, 16, 15), { elevation: 1 });
  document = paint(document, rect(6, 6, 12, 10), { elevation: 2 });
  document = paint(document, rect(22, 3, 33, 12), { elevation: 1, cliffFamily: 'cave' });
  document = paint(document, rect(24, 20, 30, 27), { surface: 'water' });
  document = paint(document, rect(2, 20, 8, 25), { surface: 'sand' });
  document = paint(document, rect(9, 20, 14, 25), { surface: 'stone' });
  document = paint(document, rect(15, 20, 19, 25), { surface: 'cave_floor' });
  document = paint(document, rect(2, 28, 12, 28), { feature: 'path' });
  document = paint(document, rect(14, 28, 20, 32), { feature: 'farmland' });
  document = paint(document, rect(22, 30, 30, 33), { surfaceFamily: 'grass_2' });
  document = paint(document, rect(31, 30, 36, 33), { surfaceFamily: 'grass_3' });
  document = paint(document, rect(34, 16, 38, 18), { ledge: true });
  document = paint(document, rect(0, 0, 39, 0), { elevation: 1 });
  document = paint(document, rect(37, 20, 39, 35), { elevation: 1 });
  document = paint(document, [{ tileX: 20, tileY: 29 }], { cellPart: { slot: 'path', exact: { frame: 12 } } });
  document = paint(document, [{ tileX: 5, tileY: 15 }], {
    terrainOverride: { contourLevel: 1, frameIndex: 7, family: 'stone_1' },
  });
  document = { ...document, stairRuns: [{ x: 9, y: 16, direction: 'up', fromLevel: 0, toLevel: 1, width: 2 }] } as MapDocumentV2;
  return terrainArrayForMapDocument(document);
}

/** Small hand-built interiors that exercise the generator branches of the chunk loop. */
function interiorTerrain(overrides: Partial<TerrainArray> & { readonly generator: TerrainArray['generator'] }): TerrainArray {
  const width = 24;
  const height = 20;
  const length = width * height;
  const blocked = cellFlags(Array.from({ length }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    return x === 0 || y <= 2 || x === width - 1 || y === height - 1 || (x === 11 && y < 14) || (y === 8 && x > 15);
  }));
  return {
    spaceId: 99,
    seed: 7,
    version: 1,
    width,
    height,
    biomes: new Uint8Array(length).fill(SURVIVAL_BIOMES.indexOf('plains')),
    blocked,
    horseJumpableTerrain: new Uint8Array(length),
    elevations: Int16Array.from(blocked, (value) => value ? 1 : 0),
    dirtCliffRoles: new Uint8Array(length),
    dirtTerraces: new Uint8Array(length),
    hearthInteriorFloorStyles: Uint8Array.from({ length }, (_, index) => index % 4),
    rogueHazards: Uint8Array.from({ length }, (_, index) => (index % 7 === 0 ? 1 : 0)),
    ...overrides,
  };
}

const interiorShape = { projectionStyle: 'interior', baseDatum: 0, defaultCliffFamily: 'cave' } as const;

describe('terrain index parity (static world S4b)', () => {
  it('keeps authored overworld draw lists and resolvers byte-identical', () => {
    const stone = authoredTerrain();
    const dungeon = authoredTerrain('dungeon_1');
    expect({
      stoneDraw: drawList(stone),
      stoneResolvers: resolvers(stone),
      stoneLight: lighting(stone),
      dungeonDraw: drawList(dungeon),
      dungeonResolvers: resolvers(dungeon),
    }).toMatchInlineSnapshot(`
      {
        "dungeonDraw": "11493:04baebaa6f6d366ce4a137e483c7e9c0",
        "dungeonResolvers": "886c317c205539fef23da4c675d55d28",
        "stoneDraw": "4889:a55aac729ca1ec06fecd5db68b39ac3c",
        "stoneLight": "c6ae488f008d52074b85aee07b163098",
        "stoneResolvers": "9c6fb681096d311ec48a3aacd0809a39",
      }
    `);
  });

  it('keeps interior generator branches byte-identical', () => {
    const fixtures: Record<string, TerrainArray> = {
      village: interiorTerrain({ generator: 'village_interior' }),
      marlow: interiorTerrain({ generator: 'marlow_tent' }),
      cave: interiorTerrain({ generator: 'cellar', ...interiorShape, fixedTerrainPlane: 0 }),
      volcanic: interiorTerrain({ generator: 'roguelike', ...interiorShape, rogueTheme: 'volcanic' }),
      dungeon: interiorTerrain({ generator: 'roguelike', ...interiorShape, rogueTheme: 'dungeon' }),
      rogueCave: interiorTerrain({ generator: 'roguelike', ...interiorShape, rogueTheme: 'cave' }),
      lobby: interiorTerrain({ generator: 'delve_lobby', ...interiorShape, rogueTheme: 'cave', hearthLobbyFloorThresholdY: 10 }),
      residence: terrainForSpace(spaceDefinitionFor(30000, {
        spaceId: 60000, residenceSpaceId: 30000, residenceExpansionRank: 1,
        residenceArchitectureJson: JSON.stringify({ recipeVersion: 1, revision: '1', cells: [
          { tileX: 20, tileY: 20, floor: 'townhouse', partition: 'wall' },
        ] }),
      })!, 1, 1),
    };
    const excavated = terrainWithCellarExcavations(fixtures.cave!, [{ tileX: 11, tileY: 6 }, { tileX: 16, tileY: 8 }], 3);
    fixtures.excavated = excavated;
    const result: Record<string, string> = {};
    for (const [name, terrain] of Object.entries(fixtures)) {
      result[`${name}Draw`] = drawList(terrain);
      result[`${name}Resolvers`] = resolvers(terrain);
      result[`${name}Light`] = lighting(terrain);
    }
    expect(result).toMatchInlineSnapshot(`
      {
        "caveDraw": "4699:e8075c665c7a740ad08ad7caa9a86f59",
        "caveLight": "682a6cb5669d63bf05bd1d1c2fc1c954",
        "caveResolvers": "a3d5a328dbba810772445dca50b42628",
        "dungeonDraw": "1777:d9cf5aba70745f28913977c07e7732e2",
        "dungeonLight": "682a6cb5669d63bf05bd1d1c2fc1c954",
        "dungeonResolvers": "a3d5a328dbba810772445dca50b42628",
        "excavatedDraw": "4659:5d675befbdaed4c089cff3b2d8dc5bff",
        "excavatedLight": "1d1ae533dcf9342934b5a3ad46deb294",
        "excavatedResolvers": "ee6ac2d6bc0abd5f3c1123b583592d4b",
        "lobbyDraw": "2221:826694e94c3d62bc25327fc1faa0cd1d",
        "lobbyLight": "682a6cb5669d63bf05bd1d1c2fc1c954",
        "lobbyResolvers": "a3d5a328dbba810772445dca50b42628",
        "marlowDraw": "1294:3554c0b70226d7e2545125340c447064",
        "marlowLight": "ccaac747d5daa6e82fa186dbb38bef7f",
        "marlowResolvers": "15e9e15b90c4f779908909fbbd1f47a1",
        "residenceDraw": "236:5d9d839b908798110e142419cd5d6605",
        "residenceLight": "56e32ae59b56b0a1fccffa9dbd96cdbd",
        "residenceResolvers": "a70d1c1b70cfed5e05f9fd7c54552c1f",
        "rogueCaveDraw": "2279:24feb0f89cc03e601d3d19a518071b32",
        "rogueCaveLight": "682a6cb5669d63bf05bd1d1c2fc1c954",
        "rogueCaveResolvers": "a3d5a328dbba810772445dca50b42628",
        "villageDraw": "1417:9673ca68cd8d458820f1d6e07442c942",
        "villageLight": "ccaac747d5daa6e82fa186dbb38bef7f",
        "villageResolvers": "15e9e15b90c4f779908909fbbd1f47a1",
        "volcanicDraw": "1777:3980814ceacd2e649ac4c554eba41b4b",
        "volcanicLight": "682a6cb5669d63bf05bd1d1c2fc1c954",
        "volcanicResolvers": "a3d5a328dbba810772445dca50b42628",
      }
    `);
  });

  it('pins the hard-blocker light raster of a flat interior with no contour occluders', () => {
    // Flat elevation: no contours, so prepareLightTerrainOcclusion leaves
    // terrainOccluders unset and rasterizeLightOcclusion takes the per-tile
    // hard-blocker loop. Windows straddle every map edge.
    const flat = interiorTerrain({
      generator: 'cellar', ...interiorShape, fixedTerrainPlane: 0, elevations: new Int16Array(24 * 20),
    });
    const map = createLightOcclusionMap(flat);
    expect(map.terrainOccluders).toBeUndefined();
    const windows: string[] = [];
    for (const texelsPerTile of [1, 2]) {
      for (const [minTileX, minTileY] of [[-3, -2], [0, 0], [5, 4], [flat.width - 5, flat.height - 4], [flat.width - 1, -1]] as const) {
        const width = 12 * texelsPerTile;
        const height = 9 * texelsPerTile;
        const target = new Uint8Array(width * height);
        rasterizeLightOcclusion(target, width, height, minTileX, minTileY, texelsPerTile, map);
        windows.push(`${target.reduce((sum, value) => sum + (value === 0 ? 0 : 1), 0)}:${digest(target)}`);
      }
    }
    expect({ light: lighting(flat), windows }).toMatchInlineSnapshot(`
      {
        "light": "68d4b20d0782c8ba932bd7b8479a30f2",
        "windows": [
          "31:50c2505deac899352c58dcc56d2dd9cf",
          "48:833292ca5026cc64645027944d068886",
          "10:c79b2e6986a87b62cc8744db805c2760",
          "8:ff52aab1263a63ac0d188d1a2c1a0bc9",
          "8:02226b5261967ee9ff2e35be7a487708",
          "124:59eb233748f6cfcf98b3721e8753dcb5",
          "192:997f8ab96be64d7f4994acf993e58303",
          "40:16752a0b97e95221aa939cf4676d50fc",
          "32:1bd99ea1ab78f21643a9b1c7a84485d2",
          "32:b3eca02fcb00be548650d15dbe4c3d30",
        ],
      }
    `);
  });

  it('keeps procedural overworld biomes (paving, shores, cliffs) byte-identical', () => {
    // A hand-built overworld strip: paving with a dirt-terrace pattern that
    // differs between horizontal and vertical neighbours, next to the other
    // biome frame rules the chunk loop resolves by index.
    const width = 30;
    const height = 22;
    const length = width * height;
    const names = ['paving', 'plains', 'beach', 'desert_shore', 'coastal_cliff', 'volcanic_ash', 'desert', 'water', 'meadow', 'forest'] as const;
    const biomes = Uint8Array.from({ length }, (_, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      const band = Math.floor(x / 6) + 5 * Math.floor(y / 11);
      return SURVIVAL_BIOMES.indexOf(names[band % names.length]!);
    });
    const terrain: TerrainArray = {
      spaceId: 1,
      seed: 11,
      version: 1,
      width,
      height,
      biomes,
      blocked: cellFlags(Array.from({ length }, (_, index) => SURVIVAL_BIOMES[biomes[index]!] === 'water')),
      horseJumpableTerrain: new Uint8Array(length),
      elevations: new Int16Array(length),
      dirtCliffRoles: new Uint8Array(length),
      dirtTerraces: Uint8Array.from({ length }, (_, index) => ((index % width) * 5 + Math.floor(index / width) * 3) % 7 < 3 ? 1 : 0),
      raisedTerrainCollisionClassified: true,
    };
    expect(terrain.biomes.includes(SURVIVAL_BIOMES.indexOf('paving'))).toBe(true);
    expect({ draw: drawList(terrain), resolvers: resolvers(terrain) }).toMatchInlineSnapshot(`
      {
        "draw": "1480:f2560c1263ab4d18635034496c7c0814",
        "resolvers": "ac01b4c9e60de5341f28ac3220414197",
      }
    `);
  });

  it('keeps ledges touching the last column and last row byte-identical', () => {
    let document: MapDocumentV2 = createEmptyMapDocument({ id: 'ledge-edges', title: 'Ledges', width: 20, height: 14 });
    document = paint(document, rect(15, 4, 19, 7), { ledge: true });
    document = paint(document, rect(2, 11, 7, 13), { ledge: true });
    document = paint(document, rect(19, 10, 19, 13), { ledge: true });
    document = paint(document, rect(9, 2, 13, 6), { elevation: 1 });
    const terrain = terrainArrayForMapDocument(document);
    expect(terrain.ledges?.[4 * 20 + 19]).toBe(1);
    expect({ draw: drawList(terrain), resolvers: resolvers(terrain) }).toMatchInlineSnapshot(`
      {
        "draw": "858:09003564fb740d1d2e53cc2421f7df77",
        "resolvers": "ecab47a7b3fe961796e7e4e09ca20c7b",
      }
    `);
  });
});

