import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyMapEdit,
  compileMapDocument,
  createEmptyMapDocument,
  createLiveIslandMapDocument,
  createTerrainLabDocument,
  parseMapDocument,
  parseMapDocumentV3,
  semanticTerrainTraceAt,
  serializeMapDocument,
  terrainDocumentForMapV3,
  validateMapDocument,
  type CompiledMapDocument,
  type MapCellPatch,
  type MapDocumentV2,
} from '@orchard/sim';
import { terrainArrayForMapDocument } from './editor-terrain.js';
import { authoredGrassFringeLayersAt } from './ground-cache.js';
import {
  dirtTerraceFrameIndexAt,
  freshwaterFrameIndexAt,
  plateauLayerPlansAt,
  terrainBiomeAt,
  type TerrainArray,
} from './terrain.js';

/* Golden digests in this file were produced by the origin/main compiler
 * (2e1d9a4f) before the cell part stack existed. They pin that documents
 * without `parts` compile, render-plan and validate byte-identically. */

function fnv(text: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function arrayDigest(values: ArrayLike<unknown> | undefined): string {
  return values === undefined ? 'absent' : fnv(Array.from(values, String).join(','));
}

/** Flag planes are `Uint8Array`s of 0/1 bytes; the goldens were recorded over
 * `boolean[]`, so they are digested in that form (the same cell values). */
function flagDigest(values: Uint8Array): string {
  if (values.some((cell) => cell > 1)) throw new Error('flag plane holds a cell other than 0 or 1');
  return arrayDigest(Array.from(values, (cell) => cell === 1));
}

function compiledDigest(compiled: CompiledMapDocument): string {
  return fnv(JSON.stringify({
    keys: Object.keys(compiled).sort(),
    ids: compiled.cliffFamilyIds,
    elevations: arrayDigest(compiled.elevations),
    cliffFamilies: arrayDigest(compiled.cliffFamilies),
    surfaceFamilies: arrayDigest(compiled.surfaceFamilies),
    ledges: arrayDigest(compiled.ledges),
    surfaces: arrayDigest(compiled.surfaces),
    features: arrayDigest(compiled.features),
    blocked: flagDigest(compiled.blocked),
    overrides: compiled.terrainOverrides.flatMap((value, index) => value === null ? [] : [[index, value]]),
    transitions: compiled.transitions,
  }));
}

function terrainDigest(terrain: TerrainArray): string {
  return fnv(JSON.stringify({
    keys: Object.keys(terrain).sort(),
    biomes: arrayDigest(terrain.biomes),
    elevations: arrayDigest(terrain.elevations),
    blocked: flagDigest(terrain.blocked),
    dirtTerraces: arrayDigest(terrain.dirtTerraces),
    dirtCliffRoles: arrayDigest(terrain.dirtCliffRoles),
    cliffFamilies: arrayDigest(terrain.cliffFamilies),
    surfaceFamilies: arrayDigest(terrain.surfaceFamilies),
    authoredFarmland: arrayDigest(terrain.authoredFarmland),
    planes: arrayDigest(terrain.terrainPlaneBlocked),
    overrides: terrain.terrainOverrides?.flatMap((value, index) => value === null ? [] : [[index, value]]),
  }));
}

/** Every flat ground frame decision the chunk renderer makes per cell. */
function groundDigest(terrain: TerrainArray): string {
  const rows: string[] = [];
  for (let tileY = 0; tileY < terrain.height; tileY += 1) {
    for (let tileX = 0; tileX < terrain.width; tileX += 1) {
      rows.push(JSON.stringify([
        terrainBiomeAt(terrain, tileX, tileY),
        dirtTerraceFrameIndexAt(terrain, tileX, tileY),
        terrainBiomeAt(terrain, tileX, tileY) === 'freshwater' ? freshwaterFrameIndexAt(terrain, tileX, tileY) : null,
        authoredGrassFringeLayersAt(terrain, tileX, tileY),
      ]));
    }
  }
  return fnv(rows.join('|'));
}

function documentDigest(document: MapDocumentV2, probes: readonly (readonly [number, number])[], validate: boolean): string {
  const compiled = compileMapDocument(document);
  const terrain = terrainArrayForMapDocument(document, compiled);
  return fnv(JSON.stringify({
    serialized: fnv(serializeMapDocument(parseMapDocument(serializeMapDocument(document)))),
    compiled: compiledDigest(compiled),
    terrain: terrainDigest(terrain),
    traces: probes.map(([x, y]) => semanticTerrainTraceAt(document, x, y, compiled)),
    plans: probes.map(([x, y]) => plateauLayerPlansAt(terrain, x, y)),
    // Stair-placement warnings (owner stair rule, 2026-09-24) are new findings,
    // not a change to the legacy compile this parity test pins.
    issues: validate ? validateMapDocument(document).filter(({ code }) => !code.startsWith('transition_ramp_')) : [],
    ground: validate ? groundDigest(terrain) : 'skipped',
  }));
}

/** The in-repo authored terrain lab plus every legacy override form:
 * role+frame, frame-only, family swap, face role, and a stale/invalid frame
 * that must remain loadable and unrepaired. */
function legacyOverrideLabDocument(): MapDocumentV2 {
  let document = createTerrainLabDocument();
  const paint = (tileX: number, tileY: number, patch: MapCellPatch): void => {
    document = applyMapEdit(document, { kind: 'paint', points: [{ tileX, tileY }], patch }).document;
  };
  paint(47, 3, { terrainOverride: { contourLevel: 0, role: 'bottom_right', frameIndex: 777 } });
  paint(20, 20, { terrainOverride: { contourLevel: 1, frameIndex: 4 } });
  paint(21, 20, { terrainOverride: { contourLevel: 1, family: 'shroomlands', role: 'top' } });
  paint(22, 22, { terrainOverride: { contourLevel: 1, role: 'face.lower_wall.middle', frameIndex: 57 } });
  return document;
}

const LEGACY_OVERRIDE_PROBES = [[47, 3], [20, 20], [21, 20], [22, 22], [10, 10], [30, 5]] as const;

describe('cell part stack: legacy compile parity', () => {
  it('compiles the authored terrain lab with legacy overrides identically to origin/main', () => {
    expect(documentDigest(legacyOverrideLabDocument(), LEGACY_OVERRIDE_PROBES, true)).toBe('e3468b98');
  });

  it('compiles an overridden dungeon face fixture identically to origin/main', () => {
    const base = createEmptyMapDocument({ id: 'dungeon-face', title: 'Dungeon face', width: 7, height: 7 });
    const everyCell = Array.from({ length: 49 }, (_, index) => ({ tileX: index % 7, tileY: Math.floor(index / 7) }));
    let document = applyMapEdit(base, { kind: 'paint', points: everyCell, patch: { elevation: 1, cliffFamily: 'dungeon_2' } }).document;
    document = applyMapEdit(document, {
      kind: 'paint',
      points: Array.from({ length: 9 }, (_, index) => ({ tileX: 2 + index % 3, tileY: 2 + Math.floor(index / 3) })),
      patch: { elevation: 0 },
    }).document;
    document = applyMapEdit(document, {
      kind: 'paint', points: [{ tileX: 3, tileY: 3 }],
      patch: { terrainOverride: { contourLevel: 1, role: 'face.lower_wall.middle', family: 'dungeon_2', frameIndex: 89 } },
    }).document;
    expect(documentDigest(document, [[3, 3], [2, 2], [4, 4]], true)).toBe('78b9db96');
  });

  it('compiles the generated live island base identically to origin/main', () => {
    const document = terrainDocumentForMapV3(createLiveIslandMapDocument());
    expect(documentDigest(document, [[416, 416], [100, 200]], false)).toBe('db897622');
  }, 120_000);

  /* Optional local check against a private production snapshot, which is not
   * committed: ORCHARD_CELL_PARTS_PARITY_MAP=<v3 json> and, once captured on
   * origin/main, ORCHARD_CELL_PARTS_PARITY_DIGEST=<digest>. */
  const snapshotPath = process.env['ORCHARD_CELL_PARTS_PARITY_MAP'];
  it.skipIf(snapshotPath === undefined)('compiles a local live-map snapshot identically', () => {
    const document = terrainDocumentForMapV3(parseMapDocumentV3(readFileSync(snapshotPath!, 'utf8')));
    const digest = documentDigest(document, [[416, 416], [100, 200]], false);
    console.info(`cell-parts parity snapshot digest ${digest}`);
    const expected = process.env['ORCHARD_CELL_PARTS_PARITY_DIGEST'];
    if (expected !== undefined) expect(digest).toBe(expected);
  }, 300_000);
});
