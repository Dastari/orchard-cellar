import { describe, expect, it } from 'vitest';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { DirectionalShadowCache, sampleDirectionalMask, type DirectionalCaster, type DirectionalShadowMask } from './directional-shadows.js';
import { contactCoverage, type PreparedCaster } from './receiver-coverage.js';
import { ReceiverCandidateIndex } from './receiver-candidate-index.js';
import { CelestialReceiverScene, resolveReceiverLight } from './receiver-lighting.js';
import type { LightingReceiver } from './lighting-types.js';

const mask: DirectionalShadowMask = { left: 0, top: 0, width: 1, height: 1,
  coverage: new Uint8Array([255]), integral: new Uint32Array([0, 0, 0, 255]) };
const caster: DirectionalCaster = { owner: 1, worldX: -4.25, worldY: 3.75, baseHeightSubunits: 0,
  heightSubunits: 4, footprint: { left: -2, top: -2, right: 2, bottom: 2 }, contact: false };
const sky = celestialLightingAtCalendar({ continuousDay: 10.5, clockHours: 17, lunarProgress: 0.5, lunarIllumination: 1 });

function list(index: ReceiverCandidateIndex, x: number, y: number): PreparedCaster[] {
  index.query(x, y);
  const found = [];
  for (let i = index.start; i < index.end; i++) found.push(index.at(i));
  return found;
}

function fullLoop(items: readonly PreparedCaster[], receiver: LightingReceiver) {
  let sun = 0, moon = 0, contact = 0;
  for (const item of items) {
    if (item.caster.owner === receiver.owner) continue;
    sun = Math.max(sun, sampleDirectionalMask(item.sun, item.caster, receiver.worldX, receiver.worldY));
    moon = Math.max(moon, sampleDirectionalMask(item.moon, item.caster, receiver.worldX, receiver.worldY));
    if (receiver.receiver === 'flat') contact = Math.max(contact, contactCoverage(item.caster, receiver.worldX, receiver.worldY, receiver.heightSubunits));
  }
  return resolveReceiverLight(sky, receiver.receiver, 1 - sun, 1 - moon, undefined, contact);
}

describe('exact receiver candidate broad phase', () => {
  it('includes fractional half-pixel fringes across negative and positive cell boundaries', () => {
    const item = { caster, sun: mask, moon: null }, index = new ReceiverCandidateIndex();
    index.rebuild([item], 0, 1024);
    expect(index.indexed).toBe(true);
    for (let y = 3.26; y < 5.25; y += 0.125) for (let x = -4.74; x < -2.75; x += 0.125) {
      expect(sampleDirectionalMask(mask, caster, x, y)).toBeGreaterThan(0);
      expect(list(index, x, y)).toEqual([item]);
    }
    expect(list(index, 100, 100)).toEqual([]);
  });

  it('preserves caster ordering without duplicates across overlapping sun, moon and contact bounds', () => {
    const items = [7, 3, 9].map(owner => ({ caster: { ...caster, owner, contact: true }, sun: mask, moon: mask }));
    const index = new ReceiverCandidateIndex(); index.rebuild(items, 0, 4096);
    expect(list(index, caster.worldX, caster.worldY)).toEqual(items);
    const contactOnly = { caster: { ...caster, contact: true }, sun: null, moon: null };
    index.rebuild([contactOnly], 0, 4096);
    expect(list(index, caster.worldX - 2.75, caster.worldY)).toEqual([contactOnly]);
    index.rebuild([contactOnly], 1, 4096);
    expect(list(index, caster.worldX, caster.worldY)).toEqual([]);
  });

  it('reuses moving storage, retires departed casters, and falls back completely when over budget', () => {
    const items = [{ caster, sun: mask, moon: null }], index = new ReceiverCandidateIndex();
    index.rebuild(items, 0, 4096);
    const bytes = index.bytes;
    const storage = { ...index };
    for (let i = 0; i < 600; i++) {
      items[0] = { caster: { ...caster, worldX: caster.worldX + i * 4 }, sun: mask, moon: null };
      index.rebuild(items, 0, 4096);
      expect(index.bytes).toBe(bytes);
      expect(list(index, items[0].caster.worldX, caster.worldY)).toEqual(items);
    }
    // Inspect retained storage identity without adding a production debug API.
    for (const key of ['bounds', 'offsets', 'cursors', 'entries']) {
      expect(Object.getOwnPropertyDescriptor(index, key)?.value).toBe(Object.getOwnPropertyDescriptor(storage, key)?.value);
    }
    expect(list(index, caster.worldX, caster.worldY)).toEqual([]);
    index.rebuild(items, 0, 0);
    expect(index.indexed).toBe(false); expect(index.bytes).toBe(0);
    expect(list(index, -1000, 1000)).toEqual(items);
    index.rebuild([], 0, 4096);
    expect(list(index, 0, 0)).toEqual([]);
  });

  it('bounds huge sparse geometry and preserves the full-loop behavior for non-finite input', () => {
    const items = [caster, { ...caster, worldX: 1e12 }].map(caster => ({ caster, sun: mask, moon: null }));
    const index = new ReceiverCandidateIndex(); index.rebuild(items, 0, 4096);
    expect(index.indexed).toBe(false); expect(index.bytes).toBe(0);
    expect(list(index, 0, 0)).toEqual(items);
    index.rebuild(items.slice(0, 1), 0, 4096);
    expect(list(index, NaN, 0)).toEqual(items.slice(0, 1));
    expect(list(index, Infinity, 0)).toEqual(items.slice(0, 1));
    const invalid = [{ caster: { ...caster, worldX: NaN }, sun: mask, moon: null }];
    index.rebuild(invalid, 0, 4096);
    expect(index.indexed).toBe(false); expect(list(index, 0, 0)).toEqual(invalid);
  });

  it('matches the original full resolve exactly over heights, owners, classes, moving revisions and RGB changes', () => {
    const fixed = Array.from({ length: 40 }, (_, i) => ({ ...caster, owner: i,
      worldX: (i % 8) * 24 - 72.375, worldY: Math.floor(i / 8) * 24 - 48.625,
      contact: i % 2 === 0, baseHeightSubunits: i % 3, heightSubunits: 3 + i % 7 }));
    const scene = new CelestialReceiverScene(4), cache = new DirectionalShadowCache();
    let seed = 59;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let frame = 0; frame < 6; frame++) {
      const moving = [{ ...caster, owner: 'player', contact: true, worldX: frame * 20.125, worldY: -frame * 3.375 }];
      scene.prepareSplit(sky, fixed, moving, 1);
      for (const height of [0, 1, 4, 12]) {
        const items = [...fixed, ...moving].map(caster => ({ caster,
          sun: cache.get(caster, sky.sun, height, 4), moon: cache.get(caster, sky.moon, height, 4) }));
        for (let i = 0; i < 200; i++) {
          const receiver: LightingReceiver = { worldX: random() * 250 - 100, worldY: random() * 250 - 100,
            heightSubunits: height, receiver: i % 2 ? 'south' : 'flat', owner: i % 3 ? 'player' : i % 40 };
          expect(scene.sample(receiver)).toEqual(fullLoop(items, receiver));
        }
      }
    }
    expect(scene.diagnostics.receiverCandidates).toBeLessThan(scene.diagnostics.receiverFullLoopCandidates / 4);
    const before = scene.diagnostics.receiverIndexBuilds;
    scene.prepareSplit({ ...sky, diffuse: { r: 1, g: 2, b: 3 } }, fixed,
      [{ ...caster, owner: 'player', contact: true, worldX: 5 * 20.125, worldY: -5 * 3.375 }], 1);
    scene.sample({ worldX: 0, worldY: 0, heightSubunits: 0, receiver: 'flat' });
    expect(scene.diagnostics.receiverIndexBuilds).toBe(before);
    expect(scene.retainedCoverageBytes).toBeGreaterThan(0);
    scene.reset(); expect(scene.retainedCoverageBytes).toBe(0);
    expect(scene.diagnostics.receiverSamples).toBe(0);
  });
});
