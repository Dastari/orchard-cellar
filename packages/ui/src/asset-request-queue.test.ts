import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoundedAssetRequestQueue } from './asset-request-queue.js';

describe('bounded asset request queue', () => {
  afterEach(() => vi.useRealTimers());

  it('caps concurrent work and drains every queued request', async () => {
    const queue = new BoundedAssetRequestQueue(2, 0);
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const tasks = Array.from({ length: 5 }, (_, index) => queue.run(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return index;
    }));
    await Promise.resolve();
    expect(queue.active).toBe(2);
    expect(queue.queued).toBe(3);
    while (releases.length > 0 || queue.queued > 0) {
      releases.splice(0).forEach((release) => release());
      await Promise.resolve();
      await Promise.resolve();
    }
    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(maximum).toBe(2);
    expect(queue.active).toBe(0);
  });

  it('releases a slot after a failed request', async () => {
    const queue = new BoundedAssetRequestQueue(1, 0);
    const first = queue.run(async () => { throw new Error('nope'); });
    const second = queue.run(async () => 'ready');
    await expect(first).rejects.toThrow('nope');
    await expect(second).resolves.toBe('ready');
    expect(queue.active).toBe(0);
  });

  it('paces fast request starts below the configured origin rate', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const queue = new BoundedAssetRequestQueue(6, 40);
    const starts: number[] = [];
    const tasks = Array.from({ length: 6 }, () => queue.run(async () => {
      starts.push(Date.now());
    }));

    await vi.advanceTimersByTimeAsync(200);
    await Promise.all(tasks);

    expect(starts).toHaveLength(6);
    expect(starts.slice(1).map((start, index) => start - starts[index]!))
      .toEqual([40, 40, 40, 40, 40]);
  });
});
