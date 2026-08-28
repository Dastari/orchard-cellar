import { describe, expect, it } from 'vitest';
import {
  PLAYER_HAIR_KINDS,
  PLAYER_PANTS_KINDS,
  PLAYER_SHIRT_KINDS,
  PLAYER_SHOES_KINDS,
  generatePlayerAppearance,
  isPlayerAppearanceSelection,
} from './appearance.js';

describe('generatePlayerAppearance', () => {
  it('is stable for the same identity regardless of hex casing', () => {
    const identity = '0123456789abcdef0123456789abcdef';
    expect(generatePlayerAppearance(identity)).toEqual(generatePlayerAppearance(identity.toUpperCase()));
  });

  it('only returns supported modular parts', () => {
    const appearance = generatePlayerAppearance('deadbeef'.repeat(8));
    expect(PLAYER_HAIR_KINDS).toContain(appearance.hairKind);
    expect(PLAYER_SHIRT_KINDS).toContain(appearance.shirtKind);
    expect(PLAYER_PANTS_KINDS).toContain(appearance.pantsKind);
    expect(PLAYER_SHOES_KINDS).toContain(appearance.shoesKind);
  });

  it('gives a varied set of identities varied looks', () => {
    const looks = new Set(Array.from({ length: 32 }, (_, index) => JSON.stringify(
      generatePlayerAppearance(index.toString(16).padStart(64, '0')),
    )));
    expect(looks.size).toBeGreaterThan(20);
  });

  it('validates only authored modular appearance combinations', () => {
    expect(isPlayerAppearanceSelection({
      hairKind: 'hair_1_brown', shirtKind: 'farmer_green',
      pantsKind: 'farmer_blue', shoesKind: 'red',
    })).toBe(true);
    expect(isPlayerAppearanceSelection({
      hairKind: 'admin_hair', shirtKind: 'farmer_green',
      pantsKind: 'farmer_blue', shoesKind: 'red',
    })).toBe(false);
  });
});
