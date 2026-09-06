import type { StudioLiveRows } from './outliners.js';

/** Studio is an authoring surface, not the authoritative movement renderer.
 * Five samples per second keeps live positions useful without allowing a 20Hz
 * authority tick to monopolize a large canvas tab. */
export const STUDIO_LIVE_ROWS_REFRESH_INTERVAL_MS = 200;

export type StudioConnectionRefreshKind = 'control' | 'structural_rows' | 'live_rows';

export interface StudioConnectionRefreshBatch {
  readonly control: boolean;
  readonly rowScope: 'none' | 'dynamic' | 'all';
}

type DynamicStudioRows = Pick<StudioLiveRows, 'npcs' | 'players'>;

/** Compares only fields consumed by Studio's live markers/outliner. SDK row
 * replacement alone must not schedule another large canvas draw. */
export function studioDynamicRowsEqual(left: DynamicStudioRows, right: DynamicStudioRows): boolean {
  if (left.npcs !== right.npcs && (left.npcs.length !== right.npcs.length
    || !left.npcs.every((row, index) => {
      const candidate = right.npcs[index];
      return candidate !== undefined && row.id === candidate.id && row.spaceId === candidate.spaceId
        && row.kind === candidate.kind && row.displayName === candidate.displayName
        && row.x === candidate.x && row.y === candidate.y
        && row.homeX === candidate.homeX && row.homeY === candidate.homeY
        && row.riderIdentity === candidate.riderIdentity && row.facing === candidate.facing
        && row.moving === candidate.moving && row.wanderDirection === candidate.wanderDirection
        && row.health === candidate.health && row.species === candidate.species
        && row.variant === candidate.variant;
    }))) return false;
  if (left.players === right.players) return true;
  if (left.players.length !== right.players.length) return false;
  return left.players.every((row, index) => {
    const candidate = right.players[index];
    if (candidate === undefined || row.identity.toHexString() !== candidate.identity.toHexString()
      || row.spaceId !== candidate.spaceId || row.displayName !== candidate.displayName
      || row.x !== candidate.x || row.y !== candidate.y || row.facing !== candidate.facing
      || row.moving !== candidate.moving || row.equippedKind !== candidate.equippedKind
      || row.online !== candidate.online) return false;
    if (row.appearance === candidate.appearance) return true;
    if (row.appearance === undefined || candidate.appearance === undefined) return false;
    return row.appearance.hairKind === candidate.appearance.hairKind
      && row.appearance.shirtKind === candidate.appearance.shirtKind
      && row.appearance.pantsKind === candidate.appearance.pantsKind
      && row.appearance.shoesKind === candidate.appearance.shoesKind;
  });
}

/** Coalesces the generated SDK's per-row callbacks into projection batches.
 * Structural state remains microtask-immediate while movement-heavy rows are
 * sampled at a Studio-friendly cadence instead of rebuilding every table once
 * for every row changed by a world tick. */
export class StudioConnectionRefreshScheduler {
  #generation = 0;
  #queued = false;
  #controlDirty = false;
  #structuralRowsDirty = false;
  #liveRowsDirty = false;
  #liveTimer: ReturnType<typeof setTimeout> | null = null;
  #lastRowsRefreshAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly flush: (batch: StudioConnectionRefreshBatch) => void,
    private readonly now: () => number = Date.now,
  ) {}

  mark(kind: StudioConnectionRefreshKind): void {
    if (kind === 'control') {
      this.#controlDirty = true;
      this.queue();
      return;
    }
    if (kind === 'structural_rows') {
      this.#structuralRowsDirty = true;
      this.#liveRowsDirty = false;
      this.cancelLiveTimer();
      this.queue();
      return;
    }
    if (this.#structuralRowsDirty || this.#liveRowsDirty || this.#liveTimer !== null) return;
    const remaining = STUDIO_LIVE_ROWS_REFRESH_INTERVAL_MS
      - (this.now() - this.#lastRowsRefreshAt);
    if (remaining <= 0) {
      this.#liveRowsDirty = true;
      this.queue();
      return;
    }
    const generation = this.#generation;
    this.#liveTimer = setTimeout(() => {
      this.#liveTimer = null;
      if (generation !== this.#generation) return;
      this.#liveRowsDirty = true;
      this.queue();
    }, remaining);
  }

  /** Records the synchronous initial subscription projection as the start of
   * the live-row cadence without emitting another notification. */
  noteRowsRefresh(): void {
    this.#lastRowsRefreshAt = this.now();
  }

  cancel(): void {
    this.#generation += 1;
    this.#queued = false;
    this.#controlDirty = false;
    this.#structuralRowsDirty = false;
    this.#liveRowsDirty = false;
    this.#lastRowsRefreshAt = Number.NEGATIVE_INFINITY;
    this.cancelLiveTimer();
  }

  private queue(): void {
    if (this.#queued) return;
    this.#queued = true;
    const generation = this.#generation;
    queueMicrotask(() => {
      if (generation !== this.#generation) return;
      this.#queued = false;
      const batch = Object.freeze({
        control: this.#controlDirty,
        rowScope: this.#structuralRowsDirty ? 'all' as const
          : this.#liveRowsDirty ? 'dynamic' as const : 'none' as const,
      });
      this.#controlDirty = false;
      this.#structuralRowsDirty = false;
      this.#liveRowsDirty = false;
      if (!batch.control && batch.rowScope === 'none') return;
      if (batch.rowScope !== 'none') this.#lastRowsRefreshAt = this.now();
      this.flush(batch);
    });
  }

  private cancelLiveTimer(): void {
    if (this.#liveTimer === null) return;
    clearTimeout(this.#liveTimer);
    this.#liveTimer = null;
  }
}
