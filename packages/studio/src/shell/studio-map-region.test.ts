import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STUDIO_MAP_REGION_DEBOUNCE_MS,
  StudioMapRegionHandover,
  studioMapRegionPlan,
  studioMapRegionRetainsViewport,
  type StudioMapViewport,
} from './studio-map-region.js';

const viewport = (cameraX = 4_000, cameraY = 4_000): StudioMapViewport => ({
  spaceId: 0,
  mapWidthTiles: 832,
  mapHeightTiles: 832,
  cameraX,
  cameraY,
  zoom: 1,
  viewportWidth: 1_280,
  viewportHeight: 720,
});

class Handle {
  active = false;
  unsubscribed = false;
  isActive(): boolean { return this.active && !this.unsubscribed; }
  unsubscribe(): void { this.unsubscribed = true; }
}

afterEach(() => vi.useRealTimers());

describe('Studio map regional subscription planning', () => {
  it('produces clamped deterministic visible and overscan chunk bounds', () => {
    expect(studioMapRegionPlan(viewport())).toMatchObject({
      spaceId: 0,
      visible: { minimumX: 15, minimumY: 15, maximumX: 20, maximumY: 18 },
      subscription: { minimumX: 13, minimumY: 13, maximumX: 22, maximumY: 20 },
      finalChunkX: 51,
      finalChunkY: 51,
      key: '0:13,13-22,20',
    });
    expect(studioMapRegionPlan(viewport(-1_000, -1_000))).toMatchObject({
      visible: { minimumX: 0, minimumY: 0 },
      subscription: { minimumX: 0, minimumY: 0 },
    });
  });

  it('retains a query through the overscan deadband but refreshes at its edge', () => {
    const active = studioMapRegionPlan(viewport());
    expect(studioMapRegionRetainsViewport(active, studioMapRegionPlan(viewport(4_200, 4_100))))
      .toBe(true);
    expect(studioMapRegionRetainsViewport(active, studioMapRegionPlan(viewport(5_650, 4_000))))
      .toBe(false);
  });

  it('debounces handoffs and hydrates the overlap before retiring the old query', async () => {
    vi.useFakeTimers();
    const subscriptions: { plan: ReturnType<typeof studioMapRegionPlan>; handle: Handle;
      apply: () => void; fail: () => void }[] = [];
    const events: string[] = [];
    let first: Handle | null = null;
    const handover = new StudioMapRegionHandover<Handle>((plan, apply, fail) => {
      const handle = new Handle();
      subscriptions.push({ plan, handle, apply: () => { handle.active = true; apply(); }, fail });
      return handle;
    }, (plan) => events.push(`commit:${plan.key}:overlap=${first === null || first.isActive()}`),
    (plan) => events.push(`error:${plan.key}`));

    handover.request(viewport(), true);
    expect(subscriptions).toHaveLength(1);
    subscriptions[0]!.apply();
    first = subscriptions[0]!.handle;

    handover.request(viewport(5_650, 4_000));
    await vi.advanceTimersByTimeAsync(STUDIO_MAP_REGION_DEBOUNCE_MS - 1);
    expect(subscriptions).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(subscriptions).toHaveLength(2);
    expect(first.isActive()).toBe(true);
    subscriptions[1]!.apply();
    expect(events.at(-1)).toBe(`commit:${subscriptions[1]!.plan.key}:overlap=true`);
    expect(first.unsubscribed).toBe(true);
  });

  it('retires a stale applied query and starts only the latest request without a data hole', async () => {
    vi.useFakeTimers();
    const subscriptions: { plan: ReturnType<typeof studioMapRegionPlan>; handle: Handle;
      apply: () => void }[] = [];
    const commits: string[] = [];
    const handover = new StudioMapRegionHandover<Handle>((plan, apply) => {
      const handle = new Handle();
      subscriptions.push({ plan, handle, apply: () => { handle.active = true; apply(); } });
      return handle;
    }, (plan) => commits.push(plan.key), () => undefined);

    handover.request(viewport(), true);
    subscriptions[0]!.apply();
    const retained = subscriptions[0]!.handle;
    handover.request(viewport(5_650, 4_000));
    await vi.advanceTimersByTimeAsync(STUDIO_MAP_REGION_DEBOUNCE_MS);
    handover.request(viewport(8_500, 4_000));
    subscriptions[1]!.apply();

    expect(subscriptions[1]!.handle.unsubscribed).toBe(true);
    expect(retained.isActive()).toBe(true);
    expect(subscriptions).toHaveLength(3);
    subscriptions[2]!.apply();
    expect(retained.unsubscribed).toBe(true);
    expect(commits).toEqual([subscriptions[0]!.plan.key, subscriptions[2]!.plan.key]);
  });

  it('cancels deferred work and releases active handles on dispose', async () => {
    vi.useFakeTimers();
    const handles: Handle[] = [];
    const handover = new StudioMapRegionHandover<Handle>(() => {
      const handle = new Handle();
      handles.push(handle);
      return handle;
    }, () => undefined, () => undefined);
    handover.request(viewport(), true);
    handles[0]!.active = true;
    handover.request(viewport(8_500, 4_000));
    handover.dispose();
    await vi.runAllTimersAsync();
    expect(handles).toHaveLength(1);
    expect(handles[0]!.unsubscribed).toBe(true);
  });

  it('does not hammer a failed region until the requested camera region changes', () => {
    const attempts: { fail: () => void }[] = [];
    const handover = new StudioMapRegionHandover<Handle>((plan, apply, fail) => {
      void plan;
      void apply;
      attempts.push({ fail });
      return new Handle();
    }, () => undefined, () => undefined);

    expect(handover.request(viewport(), true)).toBe(true);
    attempts[0]!.fail();
    expect(handover.request(viewport(), true)).toBe(false);
    expect(attempts).toHaveLength(1);
    expect(handover.request(viewport(8_500, 4_000), true)).toBe(true);
    expect(attempts).toHaveLength(2);
  });

  it('retires an unapplied handle if it applies after disposal', () => {
    let apply = (): void => undefined;
    const handle = new Handle();
    const handover = new StudioMapRegionHandover<Handle>((plan, onApplied) => {
      void plan;
      apply = onApplied;
      return handle;
    }, () => undefined, () => undefined);

    handover.request(viewport(), true);
    handover.dispose();
    expect(handle.unsubscribed).toBe(false);
    handle.active = true;
    apply();
    expect(handle.unsubscribed).toBe(true);
  });

  it('fails closed when the active regional subscription is unexpectedly removed', () => {
    let apply = (): void => undefined;
    let fail = (): void => undefined;
    const errors: string[] = [];
    const handle = new Handle();
    const handover = new StudioMapRegionHandover<Handle>((plan, onApplied, onError) => {
      void plan;
      apply = onApplied;
      fail = onError;
      return handle;
    }, () => undefined, (plan) => errors.push(plan.key));

    handover.request(viewport(), true);
    handle.active = true;
    apply();
    fail();
    expect(handover.activePlan()).toBeNull();
    expect(errors).toEqual([studioMapRegionPlan(viewport()).key]);
    expect(handover.request(viewport(), true)).toBe(false);
  });
});
