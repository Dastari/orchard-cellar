import type { ContentRegistry } from './content/registry.js';
import type { PlayerAppearanceCatalogDefinition } from './content/loadout-definition.js';
import { activeNewPlayerLoadout } from './new-player-loadout.js';

export type PlayerHairKind = string;
export type PlayerShirtKind = string;
export type PlayerPantsKind = string;
export type PlayerShoesKind = string;

export interface PlayerAppearanceSelection {
  readonly hairKind: PlayerHairKind;
  readonly shirtKind: PlayerShirtKind;
  readonly pantsKind: PlayerPantsKind;
  readonly shoesKind: PlayerShoesKind;
}

export function runtimePlayerAppearanceCatalog(
  registry: Pick<ContentRegistry, 'loadouts'>,
): PlayerAppearanceCatalogDefinition | null {
  return activeNewPlayerLoadout(registry)?.appearance ?? null;
}

export function isPlayerHairKind(catalog: PlayerAppearanceCatalogDefinition, value: string): value is PlayerHairKind {
  return catalog.hairKinds.includes(value);
}

export function isPlayerShirtKind(catalog: PlayerAppearanceCatalogDefinition, value: string): value is PlayerShirtKind {
  return catalog.shirtKinds.includes(value);
}

export function isPlayerPantsKind(catalog: PlayerAppearanceCatalogDefinition, value: string): value is PlayerPantsKind {
  return catalog.pantsKinds.includes(value);
}

export function isPlayerShoesKind(catalog: PlayerAppearanceCatalogDefinition, value: string): value is PlayerShoesKind {
  return catalog.shoesKinds.includes(value);
}

export function isPlayerAppearanceSelection(catalog: PlayerAppearanceCatalogDefinition, value: {
  readonly hairKind: string;
  readonly shirtKind: string;
  readonly pantsKind: string;
  readonly shoesKind: string;
}): value is PlayerAppearanceSelection {
  return isPlayerHairKind(catalog, value.hairKind)
    && isPlayerShirtKind(catalog, value.shirtKind)
    && isPlayerPantsKind(catalog, value.pantsKind)
    && isPlayerShoesKind(catalog, value.shoesKind);
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
export function generatePlayerAppearance(
  catalog: PlayerAppearanceCatalogDefinition,
  identityHex: string,
): PlayerAppearanceSelection {
  return {
    hairKind: pick(catalog.hairKinds, identityHex, 0x1f123bb5),
    shirtKind: pick(catalog.shirtKinds, identityHex, 0x5f356495),
    pantsKind: pick(catalog.pantsKinds, identityHex, 0x2d83cdac),
    shoesKind: pick(catalog.shoesKinds, identityHex, 0x769c33b1),
  };
}
