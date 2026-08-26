import { SURVIVAL_CHUNK_TILES, SURVIVAL_WORLD_SIZE } from './survival-world.js';

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type SpaceGenerator = 'island' | 'mine' | 'homestead' | 'debug_flat';

export interface SpaceDefinition {
  /** Stable unsigned 16-bit coordinate-world identifier. Space zero is topside forever. */
  readonly spaceId: number;
  readonly name: string;
  readonly sizeTiles: number;
  readonly generator: SpaceGenerator;
  readonly ambient: 'clock' | RgbColor;
  readonly weather: boolean;
  readonly audioBed: 'estate' | 'cave' | 'homestead' | 'debug';
  /** Debug spaces remain reachable only through owner-authorized reducers. */
  readonly ownerOnly?: boolean;
}

/** Minimal structural contract intentionally satisfied by future homestead rows. */
export interface InstanceSpaceRow {
  readonly spaceId: number;
  readonly sizeTier: number;
}

export const TOPSIDE_SPACE_ID = 0;
export const DEBUG_SPACE_ID = 65_534;

const HOMESTEAD_SIZE_TILES = [32, 48, 64, 80] as const;

export const SPACES: readonly SpaceDefinition[] = [
  {
    spaceId: TOPSIDE_SPACE_ID,
    name: 'island',
    sizeTiles: SURVIVAL_WORLD_SIZE,
    generator: 'island',
    ambient: 'clock',
    weather: true,
    audioBed: 'estate',
  },
  {
    spaceId: DEBUG_SPACE_ID,
    name: 'debug_flat',
    sizeTiles: 32,
    generator: 'debug_flat',
    ambient: { r: 176, g: 190, b: 214 },
    weather: false,
    audioBed: 'debug',
    ownerOnly: true,
  },
] as const;

const STATIC_SPACES = new Map(SPACES.map((space) => [space.spaceId, space] as const));

function validSpaceId(spaceId: number): boolean {
  return Number.isInteger(spaceId) && spaceId >= 0 && spaceId <= 0xffff;
}

/** Resolves static worlds and dynamically registered instance rows through one contract. */
export function spaceDefinitionFor(
  spaceId: number,
  instanceRow?: InstanceSpaceRow | null,
): SpaceDefinition | undefined {
  if (!validSpaceId(spaceId)) return undefined;
  const staticDefinition = STATIC_SPACES.get(spaceId);
  if (staticDefinition !== undefined) return staticDefinition;
  if (instanceRow === undefined || instanceRow === null || instanceRow.spaceId !== spaceId) return undefined;
  const sizeTiles = HOMESTEAD_SIZE_TILES[instanceRow.sizeTier];
  if (sizeTiles === undefined || sizeTiles % SURVIVAL_CHUNK_TILES !== 0) return undefined;
  return {
    spaceId,
    name: `homestead_${spaceId}`,
    sizeTiles,
    generator: 'homestead',
    ambient: 'clock',
    weather: true,
    audioBed: 'homestead',
  };
}
