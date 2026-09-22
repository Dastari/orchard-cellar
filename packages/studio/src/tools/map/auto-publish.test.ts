import { describe, expect, it, vi } from 'vitest';
import {
  MAP_AUTO_PUBLISH_DEBOUNCE_MS,
  MapAutoPublishCoordinator,
  type MapAutoPublishSnapshot,
} from './auto-publish.js';

const ready = (overrides: Partial<MapAutoPublishSnapshot> = {}): MapAutoPublishSnapshot => ({
  enabled: true,
  dirty: true,
  editKey: 'edit-a',
  conflictRevision: null,
  validation: 'ready',
  connected: true,
  synchronizing: false,
  writable: true,
  authorized: true,
  publishAvailable: true,
  authorityPublishing: false,
  ...overrides,
});

describe('Map automatic publication coordinator', () => {
  it('defaults off and publishes only the latest edit after 250 ms when enabled', async () => {
    vi.useFakeTimers();
    const publish = vi.fn(async () => undefined);
    const coordinator = new MapAutoPublishCoordinator();
    coordinator.observe(ready({ enabled: false }), publish);
    expect(coordinator.presentation().state).toBe('OFF');
    await vi.advanceTimersByTimeAsync(MAP_AUTO_PUBLISH_DEBOUNCE_MS * 2);
    expect(publish).not.toHaveBeenCalled();

    coordinator.observe(ready(), publish);
    await vi.advanceTimersByTimeAsync(MAP_AUTO_PUBLISH_DEBOUNCE_MS - 1);
    coordinator.observe(ready({ editKey: 'edit-b' }), publish);
    await vi.advanceTimersByTimeAsync(MAP_AUTO_PUBLISH_DEBOUNCE_MS - 1);
    expect(publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(coordinator.presentation().state).toBe('AWAITING_HEAD');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(publish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it.each([
    ['conflict', { conflictRevision: 8 }],
    ['disconnected', { connected: false }],
    ['synchronizing', { synchronizing: true }],
    ['read only', { writable: false }],
    ['unauthorized', { authorized: false }],
    ['missing publisher', { publishAvailable: false }],
  ])('blocks automatic publication while %s', async (_label, overrides) => {
    vi.useFakeTimers();
    const publish = vi.fn(async () => undefined);
    const coordinator = new MapAutoPublishCoordinator();
    coordinator.observe(ready(overrides), publish);
    expect(coordinator.presentation().state).toBe('BLOCKED');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publish).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('keeps one request in flight and coalesces intervening edits to the latest key', async () => {
    vi.useFakeTimers();
    let releaseFirst = (): void => undefined;
    const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const publish = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const coordinator = new MapAutoPublishCoordinator();
    coordinator.observe(ready(), publish);
    await vi.advanceTimersByTimeAsync(MAP_AUTO_PUBLISH_DEBOUNCE_MS);
    expect(publish).toHaveBeenCalledTimes(1);

    coordinator.observe(ready({ editKey: 'edit-b' }), publish);
    coordinator.observe(ready({ editKey: 'edit-c' }), publish);
    expect(coordinator.presentation().state).toBe('QUEUED');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publish).toHaveBeenCalledTimes(1);
    releaseFirst();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(MAP_AUTO_PUBLISH_DEBOUNCE_MS);
    expect(publish).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('never hammer-retries a failed key but retries after a new edit or manual action', async () => {
    vi.useFakeTimers();
    const publish = vi.fn()
      .mockRejectedValueOnce(new Error('live_map_revision_conflict'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined);
    const coordinator = new MapAutoPublishCoordinator();
    coordinator.observe(ready(), publish);
    await vi.advanceTimersByTimeAsync(MAP_AUTO_PUBLISH_DEBOUNCE_MS);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(coordinator.presentation().state).toBe('FAILED');
    await vi.advanceTimersByTimeAsync(10_000);
    coordinator.observe(ready(), publish);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(publish).toHaveBeenCalledTimes(1);

    coordinator.observe(ready({ editKey: 'edit-b' }), publish);
    await vi.advanceTimersByTimeAsync(MAP_AUTO_PUBLISH_DEBOUNCE_MS);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(coordinator.presentation().state).toBe('FAILED');
    expect(coordinator.requestManual()).toBe(true);
    await Promise.resolve();
    expect(publish).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('keeps manual publishing available while automatic mode is off', async () => {
    const publish = vi.fn(async () => undefined);
    const coordinator = new MapAutoPublishCoordinator();
    coordinator.observe(ready({ enabled: false }), publish);
    expect(coordinator.requestManual()).toBe(true);
    await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
  });

  it('cancels scheduled and post-flight work on disposal', async () => {
    vi.useFakeTimers();
    const scheduledPublish = vi.fn(async () => undefined);
    const scheduled = new MapAutoPublishCoordinator();
    scheduled.observe(ready(), scheduledPublish);
    scheduled.dispose();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(scheduledPublish).not.toHaveBeenCalled();

    let release = (): void => undefined;
    const inFlightPublish = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const inFlight = new MapAutoPublishCoordinator();
    inFlight.observe(ready(), inFlightPublish);
    await vi.advanceTimersByTimeAsync(MAP_AUTO_PUBLISH_DEBOUNCE_MS);
    inFlight.observe(ready({ editKey: 'edit-b' }), inFlightPublish);
    inFlight.dispose();
    release();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(inFlightPublish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
