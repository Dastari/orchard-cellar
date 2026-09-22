import cliffSource0 from '../../assets/tiles/tile_cf_desert_cliff.tile.json?raw';
import cliffSource1 from '../../assets/tiles/tile_cf_desert_cliff_2.tile.json?raw';
import cliffSource2 from '../../assets/tiles/tile_cf_desert_cliff_3.tile.json?raw';
import cliffSource3 from '../../assets/tiles/tile_cf_shroomlands_cliff.tile.json?raw';
import cliffSource4 from '../../assets/tiles/tile_cf_volcanic_cliff.tile.json?raw';
import cliffSource5 from '../../assets/tiles/tile_cf_grass_1_middle.tile.json?raw';
import cliffSource6 from '../../assets/tiles/tile_cf_grass_2_middle.tile.json?raw';
import cliffSource7 from '../../assets/tiles/tile_cf_grass_3_middle.tile.json?raw';
import cliffSource8 from '../../assets/tiles/tile_cf_grass_4_middle.tile.json?raw';
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


const cliffAssets = new Map<string, ExtractedTileJson>([
  ['tile_cf_desert_cliff', JSON.parse(cliffSource0) as ExtractedTileJson],
  ['tile_cf_desert_cliff_2', JSON.parse(cliffSource1) as ExtractedTileJson],
  ['tile_cf_desert_cliff_3', JSON.parse(cliffSource2) as ExtractedTileJson],
  ['tile_cf_shroomlands_cliff', JSON.parse(cliffSource3) as ExtractedTileJson],
  ['tile_cf_volcanic_cliff', JSON.parse(cliffSource4) as ExtractedTileJson],
  ['tile_cf_grass_1_middle', JSON.parse(cliffSource5) as ExtractedTileJson],
  ['tile_cf_grass_2_middle', JSON.parse(cliffSource6) as ExtractedTileJson],
  ['tile_cf_grass_3_middle', JSON.parse(cliffSource7) as ExtractedTileJson],
  ['tile_cf_grass_4_middle', JSON.parse(cliffSource8) as ExtractedTileJson],
]);

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

  it('keeps raised plateau crests connected to their physical wall courses', () => {
    for (const id of ['desert_1', 'desert_2', 'desert_3', 'shroomlands', 'volcanic'] as const) {
      const tileSet = TERRAIN_CLIFF_FAMILIES[id].tileSet;
      const asset = cliffAssets.get(tileSet.assetId)!;
      const middleFrames = [tileSet.edgeFrames.bottom!, ...tileSet.faceProfiles.tall!.rows
        .filter(row => row.contributesHeight !== false).map(row => row.frames[1])];
      for (const frame of middleFrames) {
        // A structural middle course cannot be the disconnected foot strip or
        // shadow: every native row must fill the centre of the wall.
        const pixels = asset.frames.base[frame]!;
        expect(pixels.every(row => row[8] !== '.'), `${id} middle course ${frame}`).toBe(true);
      }
    }
  });

  it('uses structural wall art, never flat cap fill, for repeated wall courses', () => {
    for (const id of ['desert_1', 'desert_2', 'desert_3', 'shroomlands'] as const) {
      const tileSet = TERRAIN_CLIFF_FAMILIES[id].tileSet;
      const asset = cliffAssets.get(tileSet.assetId)!;
      const bank = tileSet.faceProfiles.tall!;
      for (const course of bank.repeatRows ?? [bank.repeatRow!]) {
        const pixels = asset.frames.base[course.frames[1]]!;
        expect(pixels.every(row => !row.includes('.')), `${id} repeat is opaque rock`).toBe(true);
        expect(new Set(pixels.join('')).size, `${id} repeat has native stone texture`).toBeGreaterThan(1);
      }
    }
  });

  it('uses the shroom rock inverse quartet rather than the salmon path quartet', () => {
    const inset = TERRAIN_CLIFF_FAMILIES.shroomlands.tileSet.insetFrames;
    expect(inset).toEqual({
      inner_bottom_right: 3, inner_bottom_left: 4,
      inner_top_right: 12, inner_top_left: 13,
    });
    const source = JSON.parse(cliffSource3) as ExtractedTileJson & { sourceRegions: { base: number[][] } };
    expect(Object.values(inset).map(index => source.sourceRegions.base[index!])).toEqual([
      [48, 0, 16, 16], [64, 0, 16, 16], [48, 16, 16, 16], [64, 16, 16, 16],
    ]);
  });

  it('ends desert cliffs at the native terminal row before the separate small-lip bank', () => {
    for (const id of ['desert_1', 'desert_2', 'desert_3'] as const) {
      const profile = TERRAIN_CLIFF_FAMILIES[id].tileSet.faceProfiles.tall!;
      expect(profile.rows).toHaveLength(1);
      expect(profile.rows[0]!.frames).toEqual([66, 67, 68]);
      expect(profile.rows.every(row => row.contributesHeight !== false)).toBe(true);
    }
  });

  it('counts the opaque volcanic terminal column as physical terrain, not shadow', () => {
    const rows = TERRAIN_CLIFF_FAMILIES.volcanic.tileSet.faceProfiles.tall!.rows;
    expect(rows.filter(row => row.contributesHeight !== false)).toHaveLength(2);
    expect(rows.every(row => row.blocksMovement && row.blocksLight)).toBe(true);
  });

  it('pairs every outdoor cap with an opaque fill from its matching native palette', () => {
    for (const [id, family] of Object.entries(TERRAIN_CLIFF_FAMILIES)) {
      if (!family.available || family.tileSet.projectionStyle !== 'raised') continue;
      const substrate = family.substrate!;
      expect(substrate.cap, id).not.toBeNull();
      for (const ref of [substrate.surrounding, substrate.cap!]) {
        const asset = cliffAssets.get(ref.assetId)!;
        expect(asset, `${id} ${ref.assetId}`).toBeDefined();
        expect(asset.frames.base[ref.frame]!.every(row => !row.includes('.')), id).toBe(true);
      }
      if (id.startsWith('stone_')) {
        expect(substrate.cap!.assetId).toBe(`tile_cf_grass_${id.slice(-1)}_middle`);
      }
      if (id.startsWith('desert_')) {
        expect(substrate.surrounding.assetId).toBe(family.tileSet.assetId);
        expect(substrate.cap!.assetId).toBe(family.tileSet.assetId);
      }
    }
  });

  it('retains the legacy volcanic interior identifier while reporting its proven source gap', () => {
    expect(TERRAIN_CLIFF_FAMILIES.volcanic_interior.available).toBe(true);
    expect(TERRAIN_CLIFF_FAMILIES.volcanic_interior.sourceReview.status).toBe('unverified');
    expect(TERRAIN_CLIFF_FAMILIES.volcanic_interior.sourceReview.reason).toContain('staircase');
    expect(TERRAIN_CLIFF_FAMILIES.volcanic_interior.substrate.cap).toBeNull();
  });
});
