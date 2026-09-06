import { describe, expect, it } from 'vitest';
import {
  LIGHT_BANDS,
  LIGHT_CLIFF_FACE_BLOCKER,
  LIGHT_HARD_BLOCKER,
  LIGHT_SPRITE_BLOCKER,
  LIGHT_SOFT_ATTENUATOR,
  QuantizedLightFlood,
} from './light-flood.js';

function redAt(pixels: Uint8ClampedArray, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4] ?? 0;
}

function faceAt(pixels: Uint8Array, width: number, x: number, y: number): number {
  return pixels[y * width + x] ?? 0;
}

function fixture(width = 9, height = 7): {
  readonly pixels: Uint8ClampedArray;
  readonly halo: Uint8ClampedArray;
  readonly mask: Uint8Array;
  readonly flood: QuantizedLightFlood;
} {
  return {
    pixels: new Uint8ClampedArray(width * height * 4),
    halo: new Uint8ClampedArray(width * height * 4),
    mask: new Uint8Array(width * height),
    flood: new QuantizedLightFlood(),
  };
}

describe('27§1/§3 quantized light flood', () => {
  it('emits an effectively continuous eight-bit falloff', () => {
    const width = 25;
    const setup = fixture(width, 1);
    setup.flood.apply(setup.pixels, null, width, 1, {
      centerX: 12, centerY: 0, radius: 12, color: { r: 250, g: 200, b: 150 },
    }, setup.mask);
    const bands = new Set<number>();
    for (let x = 0; x < width; x += 1) {
      const red = redAt(setup.pixels, width, x, 0);
      if (red > 0) bands.add(red);
    }
    expect(bands.size).toBeLessThanOrEqual(LIGHT_BANDS);
    expect(redAt(setup.pixels, width, 12, 0)).toBe(250);
  });

  it('27§1 shifts an open light field at quarter-texel source increments', () => {
    const width = 25;
    const left = fixture(width, 1);
    const shifted = fixture(width, 1);
    const base = { centerY: 0, radius: 12, color: { r: 250, g: 200, b: 150 } };
    left.flood.apply(left.pixels, null, width, 1, { ...base, centerX: 12 }, left.mask);
    shifted.flood.apply(shifted.pixels, null, width, 1, { ...base, centerX: 12.25 }, shifted.mask);
    expect([...shifted.pixels]).not.toEqual([...left.pixels]);
  });

  it('27§1 shifts an occluded field at sub-world-pixel source increments', () => {
    const width = 25;
    const left = fixture(width, 3);
    const shifted = fixture(width, 3);
    left.mask[1 * width + 20] = LIGHT_SPRITE_BLOCKER;
    shifted.mask[1 * width + 20] = LIGHT_SPRITE_BLOCKER;
    const base = { centerY: 1, radius: 12, color: { r: 250, g: 200, b: 150 } };
    left.flood.apply(left.pixels, null, width, 3, { ...base, centerX: 12 }, left.mask);
    shifted.flood.apply(shifted.pixels, null, width, 3, { ...base, centerX: 12.0625 }, shifted.mask);
    expect([...shifted.pixels]).not.toEqual([...left.pixels]);
  });

  it('merges overlapping sources by maximum strength without additive overlighting', () => {
    const width = 15;
    const once = fixture(width, 7);
    const overlap = fixture(width, 7);
    const light = { centerX: 7, centerY: 3, radius: 7, color: { r: 250, g: 200, b: 150 } };
    once.flood.apply(once.pixels, once.halo, width, 7, light, once.mask);
    overlap.flood.apply(overlap.pixels, overlap.halo, width, 7, light, overlap.mask);
    overlap.flood.apply(overlap.pixels, overlap.halo, width, 7, light, overlap.mask);
    expect([...overlap.pixels]).toEqual([...once.pixels]);
    expect([...overlap.halo]).toEqual([...once.halo]);
  });

  it('lights a hard wall face but does not propagate through it', () => {
    const width = 9;
    const setup = fixture(width, 7);
    for (let y = 0; y < 7; y += 1) setup.mask[y * width + 4] = LIGHT_HARD_BLOCKER;
    setup.flood.apply(setup.pixels, null, width, 7, {
      centerX: 1, centerY: 3, radius: 8, color: { r: 250, g: 200, b: 150 },
    }, setup.mask);
    expect(redAt(setup.pixels, width, 4, 3)).toBeGreaterThan(0);
    expect(redAt(setup.pixels, width, 5, 3)).toBe(0);
  });

  it('27§3 lights stacked front cliff artwork without leaking onto the plateau behind it', () => {
    const width = 9;
    const height = 10;
    const setup = fixture(width, height);
    for (let y = 3; y <= 6; y += 1) {
      setup.mask[y * width + 4] = LIGHT_CLIFF_FACE_BLOCKER;
    }
    setup.flood.apply(setup.pixels, null, width, height, {
      centerX: 4, centerY: 9, radius: 12, color: { r: 250, g: 200, b: 150 },
    }, setup.mask);
    expect(redAt(setup.pixels, width, 4, 6)).toBeGreaterThan(0);
    expect(redAt(setup.pixels, width, 4, 3)).toBeGreaterThan(0);
    expect(redAt(setup.pixels, width, 4, 2)).toBe(0);
  });

  it('27§3 lets ordinary blockers cast onto a front cliff receiver', () => {
    const width = 9;
    const height = 10;
    const setup = fixture(width, height);
    setup.mask[3 * width + 4] = LIGHT_CLIFF_FACE_BLOCKER;
    setup.mask[6 * width + 4] = LIGHT_SPRITE_BLOCKER;
    setup.flood.apply(setup.pixels, null, width, height, {
      centerX: 4, centerY: 9, radius: 12, color: { r: 250, g: 200, b: 150 },
    }, setup.mask);
    expect(redAt(setup.pixels, width, 4, 3)).toBe(0);
  });

  it('spills through a doorway and dims around its corners by path distance', () => {
    const width = 9;
    const setup = fixture(width, 7);
    for (let y = 0; y < 7; y += 1) if (y !== 3) setup.mask[y * width + 4] = LIGHT_HARD_BLOCKER;
    setup.flood.apply(setup.pixels, null, width, 7, {
      centerX: 1, centerY: 3, radius: 8, color: { r: 250, g: 200, b: 150 },
    }, setup.mask);
    expect(redAt(setup.pixels, width, 6, 3)).toBeGreaterThan(0);
    expect(redAt(setup.pixels, width, 6, 2)).toBeLessThan(redAt(setup.pixels, width, 6, 3));
  });

  it('casts a partial shadow through a soft object footprint', () => {
    const width = 9;
    const open = fixture(width, 7);
    const shadowed = fixture(width, 7);
    shadowed.mask[3 * width + 4] = LIGHT_SOFT_ATTENUATOR;
    const light = { centerX: 1, centerY: 3, radius: 8, color: { r: 250, g: 200, b: 150 } };
    open.flood.apply(open.pixels, null, width, 7, light, open.mask);
    shadowed.flood.apply(shadowed.pixels, null, width, 7, light, shadowed.mask);
    expect(redAt(shadowed.pixels, width, 5, 3)).toBeGreaterThan(0);
    expect(redAt(shadowed.pixels, width, 5, 3)).toBeLessThan(redAt(open.pixels, width, 5, 3));
  });

  it('casts a geometric umbra behind an opaque sprite silhouette', () => {
    const width = 15;
    const setup = fixture(width, 7);
    setup.mask[2 * width + 6] = LIGHT_SPRITE_BLOCKER;
    setup.mask[3 * width + 6] = LIGHT_SPRITE_BLOCKER;
    setup.mask[4 * width + 6] = LIGHT_SPRITE_BLOCKER;
    setup.flood.apply(setup.pixels, null, width, 7, {
      centerX: 2, centerY: 3, radius: 14, color: { r: 250, g: 200, b: 150 },
    }, setup.mask);
    expect(redAt(setup.pixels, width, 6, 3)).toBeGreaterThan(0);
    expect(redAt(setup.pixels, width, 10, 3)).toBe(0);
    expect(redAt(setup.pixels, width, 8, 0)).toBeGreaterThan(0);
  });

  it('fills the umbra between an oblique trunk footprint’s boundary rays', () => {
    const width = 24;
    const height = 24;
    const open = fixture(width, height);
    const shadowed = fixture(width, height);
    const trunkOwners = new Uint16Array(width * height);
    const trunkCells = new Uint32Array(4);
    let trunkCellCount = 0;
    for (let y = 7; y <= 8; y += 1) for (let x = 7; x <= 8; x += 1) {
      const index = y * width + x;
      shadowed.mask[index] = LIGHT_SPRITE_BLOCKER;
      trunkOwners[index] = 1;
      trunkCells[trunkCellCount] = index;
      trunkCellCount += 1;
    }
    const light = { centerX: 2, centerY: 2, radius: 30, color: { r: 250, g: 200, b: 150 } };
    open.flood.apply(open.pixels, null, width, height, light, open.mask);
    shadowed.flood.apply(
      shadowed.pixels, null, width, height, light, shadowed.mask, null,
      trunkOwners, null, trunkCells, trunkCellCount,
    );
    expect(redAt(open.pixels, width, 14, 15)).toBeGreaterThan(0);
    expect(redAt(shadowed.pixels, width, 14, 15)).toBe(0);
    expect(redAt(shadowed.pixels, width, 15, 15)).toBe(0);
  });

  it('27§3 casts a long collision-width trunk column without shadowing its canopy', () => {
    const width = 24;
    const height = 7;
    const open = fixture(width, height);
    const shadowed = fixture(width, height);
    const trunkOwners = new Uint16Array(width * height);
    const receiverOwners = new Uint16Array(width * height);
    const trunkIndex = 3 * width + 7;
    shadowed.mask[trunkIndex] = LIGHT_SPRITE_BLOCKER;
    trunkOwners[trunkIndex] = 1;
    const trunkCellIndices = new Uint32Array(width * height);
    trunkCellIndices[0] = trunkIndex;
    // A canopy pixel projected behind its own trunk remains a lit elevated
    // receiver, while the ground alongside it receives the compact shadow.
    receiverOwners[3 * width + 9] = 1;
    const light = { centerX: 2, centerY: 3, radius: 22, color: { r: 250, g: 200, b: 150 } };
    open.flood.apply(open.pixels, null, width, height, light, open.mask);
    shadowed.flood.apply(
      shadowed.pixels, null, width, height, light, shadowed.mask, null,
      trunkOwners, receiverOwners, trunkCellIndices, 1,
    );
    expect(redAt(shadowed.pixels, width, 9, 3)).toBe(redAt(open.pixels, width, 9, 3));
    expect(redAt(shadowed.pixels, width, 10, 3)).toBeLessThan(redAt(open.pixels, width, 10, 3));
    expect(redAt(shadowed.pixels, width, width - 2, 3)).toBe(0);
    expect(redAt(shadowed.pixels, width, 10, 2))
      .toBe(redAt(open.pixels, width, 10, 2));
  });

  it('27§3 keeps an above-light prop face lit and casts its shadow behind it', () => {
    const width = 9;
    const height = 17;
    const open = fixture(width, height);
    const shadowed = fixture(width, height);
    const trunkOwners = new Uint16Array(width * height);
    const receiverOwners = new Uint16Array(width * height);
    const casterX = 4;
    const casterY = 8;
    const casterIndex = casterY * width + casterX;
    shadowed.mask[casterIndex] = LIGHT_SPRITE_BLOCKER;
    trunkOwners[casterIndex] = 1;
    // The light is below the object. Its elevated visible front occupies the
    // same screen-space direction as the projected ground shadow.
    receiverOwners[6 * width + casterX] = 1;
    const casterCellIndices = new Uint32Array(width * height);
    casterCellIndices[0] = casterIndex;
    const light = { centerX: casterX, centerY: 13, radius: 16, color: { r: 250, g: 200, b: 150 } };
    open.flood.apply(open.pixels, null, width, height, light, open.mask);
    shadowed.flood.apply(
      shadowed.pixels, null, width, height, light, shadowed.mask, null,
      trunkOwners, receiverOwners, casterCellIndices, 1,
    );
    expect(redAt(shadowed.pixels, width, casterX, 6))
      .toBe(redAt(open.pixels, width, casterX, 6));
    expect(redAt(shadowed.pixels, width, casterX, 5))
      .toBe(0);
  });

  it('27§3 does not punch partial receiver ownership into the ground umbra', () => {
    const width = 9;
    const height = 17;
    const partial = fixture(width, height);
    const solid = fixture(width, height);
    const trunkOwners = new Uint16Array(width * height);
    const receiverOwners = new Uint16Array(width * height);
    const relitReceiverOwners = new Uint16Array(width * height);
    const casterX = 4;
    const casterY = 8;
    const casterIndex = casterY * width + casterX;
    partial.mask[casterIndex] = LIGHT_SPRITE_BLOCKER;
    solid.mask[casterIndex] = LIGHT_SPRITE_BLOCKER;
    trunkOwners[casterIndex] = 1;
    const receiverIndex = 6 * width + casterX;
    receiverOwners[receiverIndex] = 1;
    const casterCellIndices = new Uint32Array(width * height);
    casterCellIndices[0] = casterIndex;
    const light = { centerX: casterX, centerY: 13, radius: 16, color: { r: 250, g: 200, b: 150 } };
    partial.flood.apply(
      partial.pixels, null, width, height, light, partial.mask, null,
      trunkOwners, receiverOwners, casterCellIndices, 1, relitReceiverOwners,
    );
    relitReceiverOwners[receiverIndex] = 1;
    solid.flood.apply(
      solid.pixels, null, width, height, light, solid.mask, null,
      trunkOwners, receiverOwners, casterCellIndices, 1, relitReceiverOwners,
    );
    expect(redAt(partial.pixels, width, casterX, 6)).toBe(0);
    expect(redAt(solid.pixels, width, casterX, 6)).toBeGreaterThan(0);
  });

  it('keeps a foreign elevated receiver inside another object shadow', () => {
    const width = 15;
    const height = 7;
    const own = fixture(width, height);
    const foreign = fixture(width, height);
    const casterOwners = new Uint16Array(width * height);
    const casterCells = new Uint32Array(2);
    const shadowCaster = 3 * width + 6;
    const visibleForeignCaster = 1 * width + 6;
    casterCells[0] = shadowCaster;
    casterCells[1] = visibleForeignCaster;
    casterOwners[shadowCaster] = 1;
    casterOwners[visibleForeignCaster] = 2;
    own.mask[shadowCaster] = LIGHT_SPRITE_BLOCKER;
    own.mask[visibleForeignCaster] = LIGHT_SPRITE_BLOCKER;
    foreign.mask.set(own.mask);
    const ownReceivers = new Uint16Array(width * height);
    const foreignReceivers = new Uint16Array(width * height);
    const receiver = 3 * width + 10;
    ownReceivers[receiver] = 1;
    foreignReceivers[receiver] = 2;
    const light = { centerX: 2, centerY: 3, radius: 14, color: { r: 250, g: 200, b: 150 } };
    own.flood.apply(
      own.pixels, null, width, height, light, own.mask, null,
      casterOwners, ownReceivers, casterCells, 2,
    );
    foreign.flood.apply(
      foreign.pixels, null, width, height, light, foreign.mask, null,
      casterOwners, foreignReceivers, casterCells, 2,
    );
    expect(redAt(own.pixels, width, 10, 3)).toBeGreaterThan(0);
    expect(redAt(foreign.pixels, width, 10, 3)).toBe(0);
  });

  it('builds a shared south-facing receiver field without additive overlap', () => {
    const width = 9;
    const height = 7;
    const fromSouth = fixture(width, height);
    const fromNorth = fixture(width, height);
    const overlapped = fixture(width, height);
    const southFaces = new Uint8Array(width * height);
    const northFaces = new Uint8Array(width * height);
    const overlapFaces = new Uint8Array(width * height);
    const color = { r: 250, g: 200, b: 150 };
    const southLight = { centerX: 4, centerY: 6, radius: 8, color };
    const northLight = { centerX: 4, centerY: 0, radius: 8, color };
    fromSouth.flood.apply(
      fromSouth.pixels, null, width, height, southLight, fromSouth.mask,
      null, null, null, null, 0, null, southFaces,
    );
    fromNorth.flood.apply(
      fromNorth.pixels, null, width, height, northLight, fromNorth.mask,
      null, null, null, null, 0, null, northFaces,
    );
    overlapped.flood.apply(
      overlapped.pixels, null, width, height, southLight, overlapped.mask,
      null, null, null, null, 0, null, overlapFaces,
    );
    overlapped.flood.apply(
      overlapped.pixels, null, width, height, southLight, overlapped.mask,
      null, null, null, null, 0, null, overlapFaces,
    );
    expect(redAt(fromNorth.pixels, width, 4, 3)).toBeGreaterThan(0);
    expect(faceAt(northFaces, width, 4, 3)).toBe(0);
    expect(faceAt(southFaces, width, 4, 3)).toBeGreaterThan(0);
    expect(faceAt(overlapFaces, width, 4, 3)).toBe(faceAt(southFaces, width, 4, 3));
  });

  it('biases a facing seed out of its wall and emits a quantized flame halo', () => {
    const width = 9;
    const setup = fixture(width, 7);
    for (let y = 0; y < 7; y += 1) setup.mask[y * width + 4] = LIGHT_HARD_BLOCKER;
    setup.flood.apply(setup.pixels, setup.halo, width, 7, {
      centerX: 4, centerY: 3, radius: 5, color: { r: 250, g: 180, b: 100 },
      facing: 'right', profile: 'flame',
    }, setup.mask);
    expect(redAt(setup.pixels, width, 5, 3)).toBe(250);
    expect(setup.halo[(3 * width + 5) * 4 + 3]).toBe(24);
    expect(redAt(setup.pixels, width, 3, 3)).toBe(0);
  });

  it('27§2 moves the additive flame core continuously between light texels', () => {
    const width = 12;
    const centered = fixture(width, 7);
    const shifted = fixture(width, 7);
    const base = {
      centerY: 3, radius: 5, color: { r: 250, g: 180, b: 100 }, profile: 'flame' as const,
    };
    centered.flood.apply(centered.pixels, centered.halo, width, 7, { ...base, centerX: 5 }, centered.mask);
    shifted.flood.apply(shifted.pixels, shifted.halo, width, 7, { ...base, centerX: 5.1 }, shifted.mask);
    const centeredAlpha = centered.halo[(3 * width + 5) * 4 + 3] ?? 0;
    const shiftedAlpha = shifted.halo[(3 * width + 5) * 4 + 3] ?? 0;
    expect(centeredAlpha).toBe(24);
    expect(shiftedAlpha).toBeGreaterThanOrEqual(20);
    expect(shifted.halo[(3 * width + 6) * 4 + 3]).toBeGreaterThan(
      centered.halo[(3 * width + 6) * 4 + 3] ?? 0,
    );
  });
});
