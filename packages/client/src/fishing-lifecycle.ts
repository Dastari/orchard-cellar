export interface FishingLifecycleTile {
  readonly tileX: number;
  readonly tileY: number;
}

export interface FishingLifecycleCast {
  readonly poolId: bigint;
  readonly targetTileX: number;
  readonly targetTileY: number;
}

export interface FishingLifecycleUseRequest {
  readonly verb: 'use_at';
  readonly options: {
    readonly tileX: number;
    readonly tileY: number;
    readonly actionId: 'cast' | 'reel';
    readonly entityId: bigint;
  };
}

/** A cast is submitted once while pending, then held until its authoritative
 * row disappears. Slow subscription delivery must not replay a completed reel.
 * Explicit reducer rejection remains visible and may be retried. */
export class FishingReelGate {
  private attempt: { key: string; attemptedAtMs: number; status: 'pending' | 'accepted' | 'rejected' } | null = null;

  request(key: string, nowMs: number, send: () => Promise<void>): Promise<void> | null {
    if (this.attempt?.key === key
      && (this.attempt.status !== 'rejected' || nowMs - this.attempt.attemptedAtMs < 1_500)) return null;
    const attempt = { key, attemptedAtMs: nowMs, status: 'pending' as 'pending' | 'accepted' | 'rejected' };
    this.attempt = attempt;
    return Promise.resolve().then(send).then(() => {
      attempt.status = 'accepted';
    }, (error: unknown) => {
      attempt.status = 'rejected';
      throw error;
    });
  }
}

/** Retains the observed pool identity so authority can distinguish a deliberate
 * open-water cast (zero) from a stale or mismatched fish-pool request. */
export function fishingCastLifecycleRequest(
  poolId: bigint,
  tile: FishingLifecycleTile,
  actionId: 'cast' = 'cast',
): FishingLifecycleUseRequest {
  return {
    verb: 'use_at',
    options: {
      tileX: tile.tileX,
      tileY: tile.tileY,
      actionId,
      entityId: poolId,
    },
  };
}

/** Reel requests carry the authoritative cast tuple last observed by the
 * client. The server still re-reads its private cast row and owns timing and
 * cancellation decisions. */
export function fishingReelLifecycleRequest(
  cast: FishingLifecycleCast,
  actionId: 'reel' = 'reel',
): FishingLifecycleUseRequest {
  return {
    verb: 'use_at',
    options: {
      tileX: cast.targetTileX,
      tileY: cast.targetTileY,
      actionId,
      entityId: cast.poolId,
    },
  };
}
