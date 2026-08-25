export const PLAYER_HAIR_KINDS = [
  'hair_1_brown',
  'hair_2_black',
  'hair_3_blonde',
  'hair_4_ginger',
  'hair_5_grey',
  'hair_6_brown',
] as const;

export const PLAYER_SHIRT_KINDS = [
  'farmer_green',
  'farmer_blue',
  'farmer_orange',
  'farmer_purple',
  'farmer_red',
  'farmer_white_brown',
] as const;

export const PLAYER_PANTS_KINDS = [
  'farmer_white_brown',
  'farmer_black',
  'farmer_blue',
  'farmer_green',
  'farmer_red',
] as const;

export const PLAYER_SHOES_KINDS = [
  'brown',
  'black',
  'blue',
  'green',
  'red',
] as const;

export type PlayerHairKind = (typeof PLAYER_HAIR_KINDS)[number];
export type PlayerShirtKind = (typeof PLAYER_SHIRT_KINDS)[number];
export type PlayerPantsKind = (typeof PLAYER_PANTS_KINDS)[number];
export type PlayerShoesKind = (typeof PLAYER_SHOES_KINDS)[number];

export interface PlayerAppearanceSelection {
  readonly hairKind: PlayerHairKind;
  readonly shirtKind: PlayerShirtKind;
  readonly pantsKind: PlayerPantsKind;
  readonly shoesKind: PlayerShoesKind;
}

function saltedHash(value: string, salt: number): number {
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  return hash >>> 0;
}

function pick<const Values extends readonly string[]>(
  values: Values,
  identityHex: string,
  salt: number,
): Values[number] {
  return values[saltedHash(identityHex.toLowerCase(), salt) % values.length] as Values[number];
}

/**
 * Generates a stable initial look for a player identity. Persistence remains
 * the authority; using the identity as entropy makes creation deterministic if
 * a connection transaction is retried and does not expose a reroll endpoint.
 */
export function generatePlayerAppearance(identityHex: string): PlayerAppearanceSelection {
  return {
    hairKind: pick(PLAYER_HAIR_KINDS, identityHex, 0x1f123bb5),
    shirtKind: pick(PLAYER_SHIRT_KINDS, identityHex, 0x5f356495),
    pantsKind: pick(PLAYER_PANTS_KINDS, identityHex, 0x2d83cdac),
    shoesKind: pick(PLAYER_SHOES_KINDS, identityHex, 0x769c33b1),
  };
}
