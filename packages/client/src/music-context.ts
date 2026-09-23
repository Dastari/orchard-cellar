import type { MusicContextUpdate } from '@orchard/engine/audio/audio-bus';
import type { MusicZone } from '@orchard/engine/audio/music-director';
import type { SpaceDefinition } from '@orchard/sim';

/** Coarse music zone and mood tags for the space the player is in. */
export function musicSpaceContext(space: Pick<SpaceDefinition, 'generator' | 'environment' | 'audioBed' | 'rogueRoom'>): { zone: MusicZone; tags: string[] } {
  if (space.rogueRoom !== undefined) {
    return { zone: 'delve', tags: [`delve:${space.rogueRoom.theme}`, `room:${space.rogueRoom.roomKind}`] };
  }
  if (space.generator === 'delve_lobby') return { zone: 'delve', tags: ['delve:lobby'] };
  if (space.audioBed === 'cave') return { zone: 'cellar', tags: [] };
  if (space.environment === 'indoor') return { zone: 'interior', tags: [] };
  if (space.generator === 'homestead') return { zone: 'homestead', tags: [] };
  return { zone: 'overworld', tags: [] };
}

export interface CombatObservation {
  readonly nowMs: number;
  /** An awake, living enemy is within engagement range of the player. */
  readonly hostileNearby: boolean;
  /** The player landed a hit on an enemy this frame. */
  readonly struckEnemy: boolean;
}

/**
 * Turns per-frame combat evidence into a steady "in combat" signal. A hit keeps the
 * signal up for a few seconds so a fight with pauses between swings stays one fight.
 * The music director adds its own exit hold on top of this.
 */
export class CombatMusicSignal {
  private lastEngagedMs = Number.NEGATIVE_INFINITY;

  constructor(private readonly holdMs = 4_000) {}

  observe(observation: CombatObservation): boolean {
    if (observation.hostileNearby || observation.struckEnemy) this.lastEngagedMs = observation.nowMs;
    return observation.nowMs - this.lastEngagedMs <= this.holdMs;
  }

  reset(): void { this.lastEngagedMs = Number.NEGATIVE_INFINITY; }
}

export interface HostileCandidate {
  readonly x: number;
  readonly y: number;
  readonly health: number;
  readonly spaceId: number;
  readonly wanderDirection: string;
}

/** Whether any living, awake enemy stands within `radius` (fixed units) of the player. */
export function hostileWithin(
  enemies: Iterable<HostileCandidate>,
  player: { readonly x: number; readonly y: number },
  spaceId: number,
  radius: number,
): boolean {
  const limit = radius * radius;
  for (const enemy of enemies) {
    if (enemy.spaceId !== spaceId || enemy.health <= 0 || enemy.wanderDirection === 'dormant') continue;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    if (dx * dx + dy * dy <= limit) return true;
  }
  return false;
}

/** Assemble the music context update for one frame. */
export function worldMusicContext(input: {
  readonly space: Pick<SpaceDefinition, 'generator' | 'environment' | 'audioBed' | 'rogueRoom'>;
  readonly biome: string | null;
  readonly raining: boolean;
  readonly combat: boolean;
}): MusicContextUpdate {
  const { zone, tags } = musicSpaceContext(input.space);
  return {
    scene: 'world',
    zone,
    biome: zone === 'overworld' || zone === 'homestead' ? input.biome : null,
    weather: input.raining ? 'rain' : 'clear',
    combat: input.combat,
    tags,
  };
}
