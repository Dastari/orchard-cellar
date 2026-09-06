import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionRecovery } from './connection-recovery.js';

function harness(connect = vi.fn(async (): Promise<void> => undefined)) {
  const environment = { online: true, visible: true, socketClosed: false };
  const disconnect = vi.fn();
  const changed = vi.fn();
  const recovery = new ConnectionRecovery({
    connect, disconnect, changed,
    online: () => environment.online,
    visible: () => environment.visible,
    socketClosed: () => environment.socketClosed,
  });
  return { recovery, environment, connect, disconnect, changed };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
afterEach(() => { vi.useRealTimers(); });

describe('connection recovery controller', () => {
  it('keeps initial connection distinct from a hydrated playable session', async () => {
    const { recovery, connect } = harness();
    expect(recovery.state).toBe('connecting');
    recovery.resume();
    await Promise.resolve();
    expect(connect).toHaveBeenCalledOnce();
    expect(recovery.state).toBe('connecting');
    recovery.ready(recovery.generation);
    expect(recovery.state).toBe('ready');
  });

  it('never starts parallel handshakes or auth refreshes while an attempt is pending', () => {
    const connect = vi.fn(() => new Promise<void>(() => undefined));
    const { recovery } = harness(connect);
    recovery.resume();
    for (let iteration = 0; iteration < 5; iteration += 1) {
      recovery.retry(); recovery.resume(); recovery.check();
    }
    expect(connect).toHaveBeenCalledOnce();
  });

  it('backs off failed attempts and caps the retry interval', async () => {
    const connect = vi.fn(async () => { throw new Error('offline service'); });
    const { recovery, disconnect } = harness(connect);
    recovery.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(recovery.state).toBe('reconnecting');
    for (const delay of [500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000]) {
      const before = connect.mock.calls.length;
      recovery.check();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(connect).toHaveBeenCalledTimes(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(connect).toHaveBeenCalledTimes(before + 1);
    }
    expect(disconnect).toHaveBeenCalledTimes(connect.mock.calls.length);
  });

  it('resets retry backoff after successful hydration', async () => {
    const { recovery, connect } = harness();
    recovery.resume();
    recovery.fail(recovery.generation, 'first failure');
    await vi.advanceTimersByTimeAsync(500);
    recovery.fail(recovery.generation, 'second failure');
    await vi.advanceTimersByTimeAsync(1_000);
    recovery.ready(recovery.generation);
    recovery.fail(recovery.generation, 'new disconnection');
    const count = connect.mock.calls.length;
    await vi.advanceTimersByTimeAsync(499);
    expect(connect).toHaveBeenCalledTimes(count);
    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(count + 1);
  });

  it('does not connect while hidden and invalidates a pending attempt when suspended', () => {
    const { recovery, environment, connect } = harness();
    environment.visible = false;
    recovery.resume(); recovery.retry(); recovery.check();
    expect(connect).not.toHaveBeenCalled();
    environment.visible = true;
    recovery.resume();
    const old = recovery.generation;
    environment.visible = false;
    recovery.pause();
    expect(recovery.isCurrent(old)).toBe(false);
    recovery.ready(old);
    environment.visible = true;
    recovery.resume();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(recovery.state).not.toBe('ready');
  });

  it('retains a healthy socket across a brief hidden interval', () => {
    const { recovery, environment, connect, disconnect } = harness();
    recovery.resume(); recovery.ready(recovery.generation);
    const generation = recovery.generation;
    environment.visible = false; recovery.pause();
    vi.setSystemTime(105_000);
    environment.visible = true; recovery.resume();
    expect(recovery.generation).toBe(generation);
    expect(recovery.state).toBe('ready');
    expect(connect).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('invalidates an offline socket and starts a fresh generation after connectivity returns', () => {
    const { recovery, environment, connect, disconnect } = harness();
    recovery.resume(); recovery.ready(recovery.generation);
    const offlineGeneration = recovery.generation;
    environment.online = false;
    recovery.resume();
    expect(recovery.state).toBe('offline');
    expect(recovery.isCurrent(offlineGeneration)).toBe(false);
    expect(disconnect).toHaveBeenCalledOnce();
    environment.online = true;
    recovery.resume();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(recovery.state).toBe('reconnecting');
  });

  it('requires sign-in after terminal auth failure and never retries anonymously', async () => {
    const { recovery, connect } = harness();
    recovery.resume();
    recovery.fail(recovery.generation, 'authentication_required', true);
    expect(recovery.state).toBe('sign-in-required');
    recovery.resume(); recovery.retry(); recovery.check();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(connect).toHaveBeenCalledOnce();
    expect(recovery.state).toBe('sign-in-required');
  });

  it('ignores old failure, hydration, and traffic callbacks after replacement', async () => {
    const { recovery, disconnect } = harness();
    recovery.resume();
    const old = recovery.generation;
    recovery.fail(old, 'lost');
    await vi.advanceTimersByTimeAsync(500);
    const current = recovery.generation;
    recovery.ready(current);
    vi.setSystemTime(110_500);
    recovery.fail(old, 'authentication_required', true);
    recovery.ready(old);
    recovery.observedTraffic(old);
    expect(recovery.generation).toBe(current);
    expect(recovery.state).toBe('ready');
    expect(disconnect).toHaveBeenCalledOnce();
    vi.setSystemTime(115_501);
    recovery.check();
    expect(recovery.state).toBe('reconnecting');
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('detects a closed socket even when no disconnect event arrived', async () => {
    const { recovery, environment, connect, disconnect } = harness();
    recovery.resume(); recovery.ready(recovery.generation);
    environment.socketClosed = true;
    recovery.check();
    expect(disconnect).toHaveBeenCalledOnce();
    environment.socketClosed = false;
    await vi.advanceTimersByTimeAsync(500);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('uses elapsed wall time to detect suspended clocks and stalled traffic after resume', () => {
    const { recovery, environment, disconnect } = harness();
    recovery.resume(); recovery.ready(recovery.generation);
    environment.visible = false; recovery.pause();
    // setSystemTime advances wall time without running timers or performance.now.
    vi.setSystemTime(160_000);
    environment.visible = true; recovery.resume();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(recovery.state).toBe('reconnecting');
  });

  it('times out incomplete hydration after 30 seconds despite fresh clock traffic', () => {
    const { recovery, disconnect } = harness();
    recovery.resume();
    const generation = recovery.generation;
    for (const instant of [110_000, 120_000, 130_000]) {
      vi.setSystemTime(instant);
      recovery.observedTraffic(generation);
      recovery.check();
      expect(disconnect).not.toHaveBeenCalled();
    }
    vi.setSystemTime(130_001);
    recovery.observedTraffic(generation);
    recovery.check();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('allows a deliberate retry to replace a hydrated but unusable connection', async () => {
    const { recovery, connect } = harness();
    recovery.resume(); recovery.ready(recovery.generation);
    const old = recovery.generation;
    recovery.retry();
    expect(recovery.isCurrent(old)).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(recovery.state).toBe('reconnecting');
  });

  it('cancels timers and rejects all later generation callbacks after disposal', async () => {
    const { recovery, connect } = harness();
    recovery.resume();
    recovery.fail(recovery.generation, 'lost');
    const generation = recovery.generation;
    recovery.stop();
    recovery.ready(generation); recovery.fail(generation, 'late');
    recovery.resume(); recovery.retry(); recovery.check();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recovery.isCurrent(generation)).toBe(false);
    expect(connect).toHaveBeenCalledOnce();
  });
});
