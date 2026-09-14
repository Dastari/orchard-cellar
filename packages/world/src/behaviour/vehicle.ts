import { SURVIVAL_CHUNK_TILES, TILE_SIZE_FIXED } from '@orchard/sim';

interface VehicleNpcState<Identity> {
  readonly x: number;
  readonly y: number;
  readonly homeX: number;
  readonly homeY: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly facing: string;
  readonly moving: boolean;
  readonly rider: Identity | undefined;
  readonly wanderDirection: string;
  readonly nextDecisionTick: bigint;
  readonly authorityTick: bigint;
}

interface VehiclePlayerState {
  readonly x: number;
  readonly y: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly facing: string;
  readonly moving: boolean;
  readonly actionKind: string;
  readonly actionStartedTick: bigint;
  readonly authorityTick: bigint;
}

/** Apply only a validated custody transition. Every unrelated persistent field
 * survives, including health, identity, space, and boat emergency shore position. */
export function vehicleCustodyPlan<Identity, Npc extends VehicleNpcState<Identity>, Player extends VehiclePlayerState>(
  npc: Npc,
  player: Player,
  transition: {
    readonly actor: Identity;
    readonly action: 'mount' | 'dismount';
    readonly adapter: 'boat' | 'horse';
    readonly tick: bigint;
    readonly landing: { readonly x: number; readonly y: number };
  },
) {
  const mounting = transition.action === 'mount';
  const reanchor = !mounting && transition.adapter === 'horse';
  return {
    npc: {
      ...npc,
      rider: mounting ? transition.actor : undefined,
      moving: false,
      wanderDirection: 'idle',
      authorityTick: transition.tick,
      ...(reanchor ? { homeX: npc.x, homeY: npc.y, nextDecisionTick: transition.tick + 20n } : {}),
    },
    player: {
      ...player,
      x: transition.landing.x,
      y: transition.landing.y,
      chunkX: Math.floor(transition.landing.x / (TILE_SIZE_FIXED * SURVIVAL_CHUNK_TILES)),
      chunkY: Math.floor(transition.landing.y / (TILE_SIZE_FIXED * SURVIVAL_CHUNK_TILES)),
      ...(mounting ? { facing: npc.facing } : {}),
      moving: false,
      actionKind: 'none',
      actionStartedTick: transition.tick,
      authorityTick: transition.tick,
    },
  };
}
