/** Generator-free island tree species (static world S6), for homestead exteriors: the same choice as
 * the generator's `survivalTreeKindAt`, but over an island biome sampler and a river-adjacency test
 * the caller supplies (the client samples the published topside chunks around a homestead site).
 * `survival-tree-species.test.ts` pins it to the generator for the generated island. */
import { SURVIVAL_ISLAND_OFFSET_TILES } from './survival-dimensions.js';
import type { SurvivalBiome } from './survival-biomes.js';
import { survivalResourceCatalog, type SurvivalResourceRegistry, type SurvivalTreeKind } from './survival-resource-catalog.js';

// The generator's integer hash and value noise (survival-world.ts keeps its own module-local copies for
// its hot loops); duplicated here so the client can choose tree species without the generator.
function hash(seed: number, x: number, y: number): number {
  let value = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}
function lerpInteger(left: number, right: number, numerator: number, denominator: number): number {
  return Math.trunc((left * (denominator - numerator) + right * numerator) / denominator);
}
function smoothFraction(numerator: number, denominator: number): number {
  return Math.trunc(numerator * numerator * (3 * denominator - 2 * numerator) / (denominator * denominator));
}
function valueNoise(seed: number, x: number, y: number, scale: number): number {
  const gridX = Math.floor(x / scale), gridY = Math.floor(y / scale);
  const smoothX = smoothFraction(x - gridX * scale, scale), smoothY = smoothFraction(y - gridY * scale, scale);
  const north = lerpInteger(hash(seed, gridX, gridY) & 1023, hash(seed, gridX + 1, gridY) & 1023, smoothX, scale);
  const south = lerpInteger(hash(seed, gridX, gridY + 1) & 1023, hash(seed, gridX + 1, gridY + 1) & 1023, smoothX, scale);
  return lerpInteger(north, south, smoothY, scale);
}

/** The tree species at island tile (x, y): `biomeAt` is the island biome there, `besideRiver`
 * whether a river runs within two tiles (the generator tests its streams). */
export function survivalTreeKindWith(
  biome: SurvivalBiome, besideRiver: boolean, seed: number, tileX: number, tileY: number, registry: SurvivalResourceRegistry,
): SurvivalTreeKind {
  const { treeKinds, fruitTreeKinds } = survivalResourceCatalog(registry);
  const [temperateOak, temperateBirch, temperateSpruce, aridTree, oasisTree] = treeKinds;
  const localX = tileX - SURVIVAL_ISLAND_OFFSET_TILES, localY = tileY - SURVIVAL_ISLAND_OFFSET_TILES;
  if (biome === 'oasis') return hash(seed ^ 0x442c0197, localX, localY) % 100 < 76 ? oasisTree! : aridTree!;
  if (biome === 'desert' || biome === 'desert_shore') return aridTree!;
  if (biome === 'savanna') return hash(seed ^ 0x110d3ac7, localX, localY) % 100 < 72 ? aridTree! : temperateOak!;
  if (besideRiver && hash(seed ^ 0x46525549, localX, localY) % 100 < 10) {
    return fruitTreeKinds[hash(seed ^ 0x46525459, localX, localY) % fruitTreeKinds.length]!;
  }
  const grove = valueNoise(seed ^ 0x71e4a539, localX, localY, 24);
  const temperateKinds = [temperateOak!, temperateBirch!, temperateSpruce!];
  const dominant = Math.min(temperateKinds.length - 1, Math.floor(grove * temperateKinds.length / 1024));
  const variation = hash(seed ^ 0x35b17d63, localX, localY) % 100;
  const offset = variation < 68 ? 0 : variation < 86 ? 1 : 2;
  return temperateKinds[(dominant + offset) % temperateKinds.length]!;
}
