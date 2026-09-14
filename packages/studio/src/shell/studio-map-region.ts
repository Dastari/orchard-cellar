import { SURVIVAL_CHUNK_TILES, TILE_SIZE_PIXELS } from '@orchard/sim';

export const STUDIO_MAP_REGION_OVERSCAN_CHUNKS = 2;
export const STUDIO_MAP_REGION_HYSTERESIS_CHUNKS = 1;
export const STUDIO_MAP_REGION_DEBOUNCE_MS = 140;

export interface StudioMapViewport {
  readonly spaceId: number;
  readonly mapWidthTiles: number;
  readonly mapHeightTiles: number;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly zoom: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface StudioMapChunkBounds {
  readonly minimumX: number;
  readonly minimumY: number;
  readonly maximumX: number;
  readonly maximumY: number;
}

export interface StudioMapRegionPlan {
  readonly spaceId: number;
  readonly visible: StudioMapChunkBounds;
  readonly subscription: StudioMapChunkBounds;
  readonly finalChunkX: number;
  readonly finalChunkY: number;
  readonly key: string;
}

function finitePositive(value: number, fallback = 1): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

/** Converts the editor's world-pixel camera into one deterministic rectangular
 * chunk query. Two chunks of overscan cover projected terrain/object height and
 * provide room for hysteresis before the next handoff. */
export function studioMapRegionPlan(viewport: StudioMapViewport): StudioMapRegionPlan {
  const widthTiles = Math.max(1, Math.floor(finitePositive(viewport.mapWidthTiles)));
  const heightTiles = Math.max(1, Math.floor(finitePositive(viewport.mapHeightTiles)));
  const finalChunkX = Math.ceil(widthTiles / SURVIVAL_CHUNK_TILES) - 1;
  const finalChunkY = Math.ceil(heightTiles / SURVIVAL_CHUNK_TILES) - 1;
  const zoom = finitePositive(viewport.zoom);
  const minimumTileX = clamp(Math.floor(viewport.cameraX / TILE_SIZE_PIXELS), widthTiles - 1);
  const minimumTileY = clamp(Math.floor(viewport.cameraY / TILE_SIZE_PIXELS), heightTiles - 1);
  const maximumTileX = clamp(Math.ceil(
    (viewport.cameraX + finitePositive(viewport.viewportWidth) / zoom) / TILE_SIZE_PIXELS,
  ) - 1, widthTiles - 1);
  const maximumTileY = clamp(Math.ceil(
    (viewport.cameraY + finitePositive(viewport.viewportHeight) / zoom) / TILE_SIZE_PIXELS,
  ) - 1, heightTiles - 1);
  const visible = Object.freeze({
    minimumX: Math.floor(Math.min(minimumTileX, maximumTileX) / SURVIVAL_CHUNK_TILES),
    minimumY: Math.floor(Math.min(minimumTileY, maximumTileY) / SURVIVAL_CHUNK_TILES),
    maximumX: Math.floor(Math.max(minimumTileX, maximumTileX) / SURVIVAL_CHUNK_TILES),
    maximumY: Math.floor(Math.max(minimumTileY, maximumTileY) / SURVIVAL_CHUNK_TILES),
  });
  const subscription = Object.freeze({
    minimumX: Math.max(0, visible.minimumX - STUDIO_MAP_REGION_OVERSCAN_CHUNKS),
    minimumY: Math.max(0, visible.minimumY - STUDIO_MAP_REGION_OVERSCAN_CHUNKS),
    maximumX: Math.min(finalChunkX, visible.maximumX + STUDIO_MAP_REGION_OVERSCAN_CHUNKS),
    maximumY: Math.min(finalChunkY, visible.maximumY + STUDIO_MAP_REGION_OVERSCAN_CHUNKS),
  });
  const spaceId = Number.isInteger(viewport.spaceId) ? viewport.spaceId : 0;
  return Object.freeze({
    spaceId,
    visible,
    subscription,
    finalChunkX,
    finalChunkY,
    key: `${spaceId}:${subscription.minimumX},${subscription.minimumY}`
      + `-${subscription.maximumX},${subscription.maximumY}`,
  });
}

/** A retained query can serve the new camera while a one-chunk safety margin
 * remains, except at finite map edges where no margin exists to subscribe. */
export function studioMapRegionRetainsViewport(
  active: StudioMapRegionPlan,
  requested: StudioMapRegionPlan,
): boolean {
  if (active.spaceId !== requested.spaceId) return false;
  const visible = requested.visible;
  const bounds = active.subscription;
  return visible.minimumX >= bounds.minimumX
      + (bounds.minimumX === 0 ? 0 : STUDIO_MAP_REGION_HYSTERESIS_CHUNKS)
    && visible.minimumY >= bounds.minimumY
      + (bounds.minimumY === 0 ? 0 : STUDIO_MAP_REGION_HYSTERESIS_CHUNKS)
    && visible.maximumX <= bounds.maximumX
      - (bounds.maximumX === active.finalChunkX ? 0 : STUDIO_MAP_REGION_HYSTERESIS_CHUNKS)
    && visible.maximumY <= bounds.maximumY
      - (bounds.maximumY === active.finalChunkY ? 0 : STUDIO_MAP_REGION_HYSTERESIS_CHUNKS);
}

export interface StudioMapRegionSubscriptionHandle {
  isActive(): boolean;
  unsubscribe(): void;
}

interface PendingRegion<Handle> {
  readonly plan: StudioMapRegionPlan;
  readonly generation: number;
  handle: Handle | null;
}

/** Latest-only make-before-break coordinator. The SDK cannot unsubscribe a
 * not-yet-applied handle, so stale pending work is invalidated immediately and
 * retired in its onApplied callback while the last complete region stays live. */
export class StudioMapRegionHandover<Handle extends StudioMapRegionSubscriptionHandle> {
  #active: { readonly plan: StudioMapRegionPlan; readonly handle: Handle } | null = null;
  #pending: PendingRegion<Handle> | null = null;
  #desired: StudioMapRegionPlan | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #generation = 0;
  #failedKey: string | null = null;
  #disposed = false;

  constructor(
    private readonly subscribe: (
      plan: StudioMapRegionPlan,
      onApplied: () => void,
      onError: () => void,
    ) => Handle,
    private readonly onCommit: (plan: StudioMapRegionPlan) => void,
    private readonly onError: (plan: StudioMapRegionPlan) => void,
    private readonly debounceMs = STUDIO_MAP_REGION_DEBOUNCE_MS,
  ) {}

  request(viewport: StudioMapViewport, immediate = false): boolean {
    if (this.#disposed) return false;
    const plan = studioMapRegionPlan(viewport);
    if (this.#active !== null && studioMapRegionRetainsViewport(this.#active.plan, plan)) {
      this.#failedKey = null;
      this.invalidateDesired();
      return false;
    }
    if (this.#failedKey === plan.key) return false;
    this.#failedKey = null;
    if (this.#desired?.key === plan.key) return false;
    this.#desired = plan;
    this.#generation += 1;
    this.cancelTimer();
    if (this.#pending !== null) return true;
    if (immediate || this.#active === null) this.startDesired();
    else this.#timer = setTimeout(() => {
      this.#timer = null;
      this.startDesired();
    }, this.debounceMs);
    return true;
  }

  activePlan(): StudioMapRegionPlan | null { return this.#active?.plan ?? null; }
  pendingPlan(): StudioMapRegionPlan | null { return this.#pending?.plan ?? null; }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.cancelTimer();
    if (this.#pending?.handle?.isActive()) {
      this.#pending.handle.unsubscribe();
      this.#pending = null;
    }
    if (this.#active?.handle.isActive()) this.#active.handle.unsubscribe();
    this.#active = null;
    this.#desired = null;
    this.#failedKey = null;
  }

  private startDesired(): void {
    const plan = this.#desired;
    if (this.#disposed || plan === null || this.#pending !== null) return;
    if (this.#active?.plan.key === plan.key) {
      this.#desired = null;
      return;
    }
    const pending: PendingRegion<Handle> = { plan, generation: this.#generation, handle: null };
    this.#pending = pending;
    pending.handle = this.subscribe(
      plan,
      () => this.applied(pending),
      () => this.failed(pending),
    );
  }

  private applied(pending: PendingRegion<Handle>): void {
    if (this.#pending !== pending || pending.handle === null) return;
    const current = !this.#disposed && pending.generation === this.#generation
      && this.#desired?.key === pending.plan.key;
    this.#pending = null;
    if (!current) {
      if (pending.handle.isActive()) pending.handle.unsubscribe();
      this.startDesired();
      return;
    }
    const previous = this.#active;
    this.#active = { plan: pending.plan, handle: pending.handle };
    this.#desired = null;
    this.#failedKey = null;
    // Hydrate/render from the union cache before releasing the old query.
    this.onCommit(pending.plan);
    if (previous?.handle.isActive()) previous.handle.unsubscribe();
  }

  private failed(pending: PendingRegion<Handle>): void {
    if (this.#pending !== pending) {
      if (this.#active?.handle !== pending.handle) return;
      this.#active = null;
      if (this.#disposed) return;
      this.#failedKey = pending.plan.key;
      this.onError(pending.plan);
      return;
    }
    this.#pending = null;
    if (this.#disposed) return;
    if (pending.generation !== this.#generation || this.#desired?.key !== pending.plan.key) {
      this.startDesired();
      return;
    }
    this.#desired = null;
    this.#failedKey = pending.plan.key;
    this.onError(pending.plan);
  }

  private invalidateDesired(): void {
    if (this.#desired === null && this.#timer === null) return;
    this.#desired = null;
    this.#generation += 1;
    this.cancelTimer();
  }

  private cancelTimer(): void {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }
}
