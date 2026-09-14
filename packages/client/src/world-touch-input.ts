export interface WorldTouchPoint {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

interface WorldTouchCallbacks {
  readonly canAct: () => boolean;
  readonly getZoom: () => number;
  readonly zoomTo: (zoom: number) => void;
  readonly aim: (point: WorldTouchPoint) => void;
  readonly tap: (point: WorldTouchPoint) => void;
  readonly hold: (point: WorldTouchPoint) => void;
  readonly releaseHold: (cancelled: boolean) => void;
}

export const WORLD_TOUCH_HOLD_MS = 250;
const TAP_TRAVEL_PIXELS = 8;

/** Receives only touches which the retained UI and thumb controls declined.
 * Pending taps never execute world actions; two fingers claim zoom before the
 * long-press deadline. A claimed hold owns the gesture until every finger lifts. */
export class WorldTouchInput {
  private readonly points = new Map<number, WorldTouchPoint>();
  private phase: 'pending' | 'pinch' | 'held' | 'consumed' = 'consumed';
  private primary: WorldTouchPoint | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private tapAllowed = false;
  private pinchDistance = 1;
  private pinchZoom = 1;

  constructor(private readonly callbacks: WorldTouchCallbacks) {}

  ownsPointer(id: number): boolean { return this.points.has(id); }
  get pinching(): boolean { return this.phase === 'pinch'; }

  pointerDown(point: WorldTouchPoint): void {
    this.points.set(point.pointerId, point);
    if (this.points.size === 1) {
      this.primary = point;
      this.phase = 'pending';
      this.tapAllowed = true;
      this.callbacks.aim(point);
      this.holdTimer = setTimeout(() => {
        this.holdTimer = null;
        const current = this.primary === null ? undefined : this.points.get(this.primary.pointerId);
        if (this.phase !== 'pending' || !this.tapAllowed || current === undefined) return;
        if (!this.callbacks.canAct()) { this.phase = 'consumed'; return; }
        this.phase = 'held';
        this.callbacks.hold(current);
      }, WORLD_TOUCH_HOLD_MS);
    } else if (this.phase === 'pending') {
      this.clearTimer();
      this.tapAllowed = false;
      this.phase = 'pinch';
      this.pinchZoom = this.callbacks.getZoom();
      this.pinchDistance = Math.max(1, this.distance());
    }
  }

  pointerMove(point: WorldTouchPoint): boolean {
    if (!this.points.has(point.pointerId)) return false;
    this.points.set(point.pointerId, point);
    if (this.phase === 'pinch' && this.points.size >= 2) {
      this.callbacks.zoomTo(this.pinchZoom * this.distance() / this.pinchDistance);
    } else if (point.pointerId === this.primary?.pointerId) {
      if (this.phase === 'pending' && Math.hypot(point.x - this.primary.x, point.y - this.primary.y) > TAP_TRAVEL_PIXELS) {
        this.tapAllowed = false;
        this.clearTimer();
      }
      if (this.phase === 'held' || this.phase === 'pending') this.callbacks.aim(point);
    }
    return true;
  }

  pointerUp(point: WorldTouchPoint, cancelled = false): boolean {
    if (!this.points.has(point.pointerId)) return false;
    // Account for a final coalesced movement before accepting a tap.
    if (!cancelled) this.pointerMove(point);
    this.points.delete(point.pointerId);
    if (this.phase === 'held' && point.pointerId !== this.primary?.pointerId) return true;
    this.clearTimer();
    if (point.pointerId === this.primary?.pointerId) {
      if (this.phase === 'held') this.callbacks.releaseHold(cancelled || !this.callbacks.canAct());
      else if (this.phase === 'pending' && this.tapAllowed && !cancelled && this.callbacks.canAct()) this.callbacks.tap(point);
    }
    this.phase = 'consumed';
    this.tapAllowed = false;
    if (this.points.size === 0) this.primary = null;
    return true;
  }

  reset(): void {
    this.clearTimer();
    if (this.phase === 'held') this.callbacks.releaseHold(true);
    this.points.clear();
    this.primary = null;
    this.phase = 'consumed';
    this.tapAllowed = false;
  }

  private clearTimer(): void {
    if (this.holdTimer !== null) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  private distance(): number {
    const [first, second] = this.points.values();
    return first === undefined || second === undefined ? 1 : Math.hypot(second.x - first.x, second.y - first.y);
  }
}
