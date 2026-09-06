export interface WorldPlaytestRequestBase {
  readonly reason: string;
  readonly clientMutationId: string;
}

export type WorldPlaytestRequest = WorldPlaytestRequestBase & (
  | { readonly kind: 'spawn'; readonly definitionId: string; readonly spaceId: number;
    readonly tileX: number; readonly tileY: number }
  | { readonly kind: 'apply_effect'; readonly definitionId: string; readonly targetPlayer: string }
  | { readonly kind: 'grant_upgrade'; readonly definitionId: string; readonly targetPlayer: string;
    readonly rank: number }
);

/** Live implementation uses one Studio connection and an authority-issued
 * exact dry-run receipt. Sandboxes may inject an explicit test adapter. */
export interface WorldPlaytestAdapter {
  readonly source: 'live' | 'mock';
  run(request: WorldPlaytestRequest): Promise<void>;
}
