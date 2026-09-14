import { describe, expect, it } from 'vitest';
import grass1StoneRampJson from '../../assets/tiles/tile_cf_grass_1_ramp_bank_stone.tile.json?raw';
import grass1WoodRampJson from '../../assets/tiles/tile_cf_grass_1_ramp_bank_wood.tile.json?raw';
import grass2StoneRampJson from '../../assets/tiles/tile_cf_grass_2_ramp_bank_stone.tile.json?raw';
import grass2WoodRampJson from '../../assets/tiles/tile_cf_grass_2_ramp_bank_wood.tile.json?raw';
import grass3StoneRampJson from '../../assets/tiles/tile_cf_grass_3_ramp_bank_stone.tile.json?raw';
import grass3WoodRampJson from '../../assets/tiles/tile_cf_grass_3_ramp_bank_wood.tile.json?raw';
import grass4StoneRampJson from '../../assets/tiles/tile_cf_grass_4_ramp_bank_stone.tile.json?raw';
import grass4WoodRampJson from '../../assets/tiles/tile_cf_grass_4_ramp_bank_wood.tile.json?raw';
import shroomRampJson from '../../assets/tiles/tile_cf_shroomlands_ramp_bank.tile.json?raw';
import desert1LedgeJson from '../../assets/tiles/tile_cf_desert_1_ledge.tile.json?raw';
import desert2LedgeJson from '../../assets/tiles/tile_cf_desert_2_ledge.tile.json?raw';
import desert3LedgeJson from '../../assets/tiles/tile_cf_desert_3_ledge.tile.json?raw';
import shroomLedgeJson from '../../assets/tiles/tile_cf_shroomlands_ledge.tile.json?raw';
import volcanicLedgeJson from '../../assets/tiles/tile_cf_volcanic_ledge.tile.json?raw';
import volcanicInteriorWallJson from '../../assets/tiles/tile_cf_volcanic_interior_wall.tile.json?raw';
import {
  TERRAIN_CLIFF_FAMILIES,
  TERRAIN_CLIFF_FAMILY_IDS,
  TERRAIN_SURFACE_FAMILIES,
  TERRAIN_SURFACE_FAMILY_IDS,
  cliffFamilyAtIndex,
  cliffFamilyForProceduralFamily,
  cliffFamilyIndex,
  surfaceFamilyAtIndex,
  surfaceFamilyIndex,
} from './terrain-tilesets.js';

interface ExtractedTileJson {
  readonly frames: { readonly base: readonly (readonly string[])[] };
}

const rampFrameRows = new Map<string, readonly (readonly string[])[]>([
  ['tile_cf_grass_1_ramp_bank_stone', (JSON.parse(grass1StoneRampJson) as ExtractedTileJson).frames.base],
  ['tile_cf_grass_1_ramp_bank_wood', (JSON.parse(grass1WoodRampJson) as ExtractedTileJson).frames.base],
  ['tile_cf_grass_2_ramp_bank_stone', (JSON.parse(grass2StoneRampJson) as ExtractedTileJson).frames.base],
  ['tile_cf_grass_2_ramp_bank_wood', (JSON.parse(grass2WoodRampJson) as ExtractedTileJson).frames.base],
  ['tile_cf_grass_3_ramp_bank_stone', (JSON.parse(grass3StoneRampJson) as ExtractedTileJson).frames.base],
  ['tile_cf_grass_3_ramp_bank_wood', (JSON.parse(grass3WoodRampJson) as ExtractedTileJson).frames.base],
  ['tile_cf_grass_4_ramp_bank_stone', (JSON.parse(grass4StoneRampJson) as ExtractedTileJson).frames.base],
  ['tile_cf_grass_4_ramp_bank_wood', (JSON.parse(grass4WoodRampJson) as ExtractedTileJson).frames.base],
  ['tile_cf_shroomlands_ramp_bank', (JSON.parse(shroomRampJson) as ExtractedTileJson).frames.base],
]);

function edgeDifferenceCount(
  frame: readonly string[],
  middle: readonly string[],
  edge: 'left' | 'right',
): number {
  const from = edge === 'left' ? 0 : 12;
  return frame.reduce((count, row, y) => count + [...row.slice(from, from + 4)]
    .filter((pixel, x) => pixel !== middle[y]?.[from + x]).length, 0);
}

function expectAuthoredOuterRails(assetId: string, sourceRow: number): void {
  const frames = rampFrameRows.get(assetId);
  expect(frames, assetId).toBeDefined();
  const left = frames?.[sourceRow * 4];
  const middle = frames?.[sourceRow * 4 + 1];
  const right = frames?.[sourceRow * 4 + 2];
  const standalone = frames?.[sourceRow * 4 + 3];
  expect(left && middle && right && standalone, `${assetId} source row ${sourceRow}`).toBeTruthy();
  if (!left || !middle || !right || !standalone) return;

  // Pixel-content guard for the authored L | middle | R | standalone layout:
  // a composable outer rail changes only its outside four pixels, the middle
  // has neither rail, and the unused standalone frame contains both rails.
  expect(edgeDifferenceCount(left, middle, 'left')).toBeGreaterThan(0);
  expect(edgeDifferenceCount(left, middle, 'right')).toBe(0);
  expect(edgeDifferenceCount(right, middle, 'left')).toBe(0);
  expect(edgeDifferenceCount(right, middle, 'right')).toBeGreaterThan(0);
  expect(edgeDifferenceCount(standalone, middle, 'left')).toBeGreaterThan(0);
  expect(edgeDifferenceCount(standalone, middle, 'right')).toBeGreaterThan(0);
}

describe('terrain family registries', () => {
  it('round-trips every cliff id while reserving ordinal zero for inheritance', () => {
    expect(cliffFamilyAtIndex(0)).toBeNull();
    for (const id of TERRAIN_CLIFF_FAMILY_IDS) {
      expect(cliffFamilyAtIndex(cliffFamilyIndex(id))).toBe(id);
      const family = TERRAIN_CLIFF_FAMILIES[id];
      if (family.available) {
        expect(family.tileSet.assetId.length).toBeGreaterThan(0);
        expect(family.tileSet.projectionStyle).toMatch(/^(raised|interior)$/u);
        if (family.tileSet.projectionStyle === 'raised') {
          expect(family.tileSet.ledgeBank).not.toBeNull();
          expect(Object.keys(family.tileSet.ledgeBank?.edgeFrames ?? {})).toHaveLength(8);
          expect(Object.keys(family.tileSet.ledgeBank?.insetFrames ?? {})).toHaveLength(4);
        }
      } else expect(family.reason.length).toBeGreaterThan(0);
    }
  });

  it('pins the basic fallback family to a genuinely flat projection contract', () => {
    const basic = TERRAIN_CLIFF_FAMILIES.basic;
    expect(basic.available).toBe(true);
    if (!basic.available) return;
    expect(basic.tileSet.projectionRowsPerLevel).toBe(0);
  });

  it('maps every authored ramp-bank crest directly to left, middle, right rails', () => {
    for (const family of Object.values(TERRAIN_CLIFF_FAMILIES)) {
      if (!family.available || family.tileSet.rampBank === null) continue;
      expect(family.tileSet.rampBank.crest).toEqual({
        left: 0, middle: [1], right: 2,
      });
    }
  });

  it('registers all four grass sheets with their own fill, fringe, and verified wide banks', () => {
    expect(surfaceFamilyAtIndex(0)).toBeNull();
    for (const id of TERRAIN_SURFACE_FAMILY_IDS) {
      expect(surfaceFamilyAtIndex(surfaceFamilyIndex(id))).toBe(id);
      const family = TERRAIN_SURFACE_FAMILIES[id];
      expect(family.assetId).toContain(id);
      expect(family.sheetAssetId).toContain(id);
      expect(Object.keys(family.fringeFrames)).toHaveLength(8);
      for (const [material, bank] of Object.entries(family.rampBanks)) {
        expect(bank.assetId).toContain(`${id}_ramp_bank_${material}`);
        expect(bank.crest).toEqual({ left: 0, middle: [1], right: 2 });
        expect(bank.crest.middle).toHaveLength(1);
        expect(bank.treads).toHaveLength(2);
        expect(bank.base.middle).toHaveLength(1);
        expectAuthoredOuterRails(bank.assetId, 0);
        expectAuthoredOuterRails(bank.assetId, 1);
        expectAuthoredOuterRails(bank.assetId, 2);

        const frames = rampFrameRows.get(bank.assetId);
        const tread = frames?.[4] ?? [];
        const base = frames?.[12] ?? [];
        expect(base, `${bank.assetId} base must be the authored contact trim`).not.toEqual(tread);
        expect(base.filter((row) => /^\.+$/u.test(row))).toHaveLength(12);
      }
    }
  });

  it('uses the authored shroom outer rails without treating the standalone bank as a middle', () => {
    const family = TERRAIN_CLIFF_FAMILIES.shroomlands;
    expect(family.available).toBe(true);
    if (!family.available || !family.tileSet.rampBank) return;
    expect(family.tileSet.rampBank.crest.middle).toEqual([1]);
    expect(family.tileSet.rampBank.crest.right).toBe(2);
    expectAuthoredOuterRails(family.tileSet.rampBank.assetId, 0);
    expectAuthoredOuterRails(family.tileSet.rampBank.assetId, 1);
  });

  it('extracts non-grass ledges from alpha-band lip art instead of opaque cliff courses', () => {
    for (const source of [
      desert1LedgeJson, desert2LedgeJson, desert3LedgeJson,
      shroomLedgeJson, volcanicLedgeJson,
    ]) {
      const asset = JSON.parse(source) as ExtractedTileJson;
      const opaqueCounts = asset.frames.base.map((frame) => frame.reduce(
        (count, row) => count + [...row].filter((pixel) => pixel !== '.').length,
        0,
      ));
      expect(opaqueCounts).toHaveLength(12);
      expect(Math.max(...opaqueCounts.slice(0, 8))).toBeLessThan(256);
      expect(opaqueCounts.slice(0, 8).reduce((sum, count) => sum + count, 0) / 8)
        .toBeLessThanOrEqual(150);
      expect(Math.max(...opaqueCounts.slice(8))).toBeLessThan(256);
    }
  });

  it('declares the volcanic ledge corners copied from the interior wall family', () => {
    const ledgeFrames = (JSON.parse(volcanicLedgeJson) as ExtractedTileJson).frames.base;
    const interiorFrames = (JSON.parse(volcanicInteriorWallJson) as ExtractedTileJson).frames.base;
    const ledgeReuse = [0, 2, 5, 7] as const;
    const interiorReuse = [15, 16, 17, 18] as const;
    expect(ledgeReuse.map((frame) => ledgeFrames[frame]))
      .toEqual(interiorReuse.map((frame) => interiorFrames[frame]));
    const volcanic = TERRAIN_CLIFF_FAMILIES.volcanic;
    const interior = TERRAIN_CLIFF_FAMILIES.volcanic_interior;
    expect(volcanic.available && volcanic.tileSet.ledgeBank?.intentionalRoleFrameReuse)
      .toEqual(ledgeReuse);
    expect(interior.available && interior.tileSet.intentionalRoleFrameReuse)
      .toEqual(expect.arrayContaining([...interiorReuse]));
  });

  it('maps every procedural material family to a stable authored cliff family', () => {
    expect(cliffFamilyForProceduralFamily('desert_cliff_1')).toBe('desert_1');
    expect(cliffFamilyForProceduralFamily('shroom_blue')).toBe('shroomlands');
    expect(cliffFamilyForProceduralFamily('volcanic')).toBe('volcanic');
    expect(cliffFamilyForProceduralFamily('temperate_woodland')).toBe('stone_2');
    expect(cliffFamilyForProceduralFamily('temperate_plains')).toBe('stone_3');
    expect(cliffFamilyForProceduralFamily('temperate_highland')).toBe('stone_4');
  });

  it('keeps the authored shroom and desert stacked wall-course variants', () => {
    expect(TERRAIN_CLIFF_FAMILIES.shroomlands.tileSet.faceProfiles.tall?.repeatRows)
      .toHaveLength(3);
    expect(TERRAIN_CLIFF_FAMILIES.desert_1.tileSet.faceProfiles.tall?.repeatRows)
      .toHaveLength(2);
  });
});
