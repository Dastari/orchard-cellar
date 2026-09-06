export interface CollisionBootstrapState {
  readonly connected: boolean;
  readonly identityReady: boolean;
  readonly worldSeedReady: boolean;
  readonly clockReady: boolean;
  readonly environmentReady: boolean;
  readonly playerReady: boolean;
}

/**
 * Collision and light occlusion compile the complete authored terrain. Keep
 * that synchronous work out of the account-to-world hand-off until the
 * authority has delivered the state that selects the real space and seed.
 */
export function collisionBootstrapReady(state: CollisionBootstrapState): boolean {
  return state.connected
    && state.identityReady
    && state.worldSeedReady
    && state.clockReady
    && state.environmentReady
    && state.playerReady;
}
