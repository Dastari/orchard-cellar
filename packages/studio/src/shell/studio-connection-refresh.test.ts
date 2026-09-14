import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STUDIO_LIVE_ROWS_REFRESH_INTERVAL_MS,
  StudioConnectionRefreshScheduler,
  studioDynamicRowsEqual,
  type StudioConnectionRefreshBatch,
} from './studio-connection-refresh.js';

afterEach(() => vi.useRealTimers());

describe('StudioConnectionRefreshScheduler', () => {
  it('suppresses SDK row replacement when every rendered dynamic field is unchanged', () => {
    const identity = { toHexString: () => 'player-1' };
    const rows = {
      npcs: [{ id: 1n, spaceId: 0, kind: 'horse', x: 64, y: 96, moving: true }],
      players: [{ identity, spaceId: 0, displayName: 'Toby', x: 32, y: 48,
        appearance: { hairKind: 'hair-1', shirtKind: 'shirt-1', pantsKind: 'pants-1', shoesKind: 'shoes-1' } }],
    };

    expect(studioDynamicRowsEqual(rows, {
      npcs: rows.npcs.map((row) => ({ ...row })),
      players: rows.players.map((row) => ({ ...row, identity: { toHexString: () => 'player-1' },
        appearance: { ...row.appearance } })),
    })).toBe(true);
    expect(studioDynamicRowsEqual(rows, {
      ...rows,
      npcs: [{ ...rows.npcs[0]!, x: 65 }],
    })).toBe(false);
  });

  it('coalesces every callback in a transaction turn into one projection batch', async () => {
    const batches: StudioConnectionRefreshBatch[] = [];
    const scheduler = new StudioConnectionRefreshScheduler((batch) => batches.push(batch));

    for (let index = 0; index < 100; index += 1) scheduler.mark('control');
    scheduler.mark('structural_rows');
    scheduler.mark('live_rows');
    await Promise.resolve();

    expect(batches).toEqual([{ control: true, rowScope: 'all' }]);
  });

  it('samples movement-heavy rows at no more than five projections per second', async () => {
    vi.useFakeTimers();
    let now = 0;
    const batches: StudioConnectionRefreshBatch[] = [];
    const scheduler = new StudioConnectionRefreshScheduler((batch) => batches.push(batch), () => now);
    scheduler.noteRowsRefresh();

    for (let index = 0; index < 100; index += 1) scheduler.mark('live_rows');
    await vi.advanceTimersByTimeAsync(STUDIO_LIVE_ROWS_REFRESH_INTERVAL_MS - 1);
    expect(batches).toEqual([]);

    now = STUDIO_LIVE_ROWS_REFRESH_INTERVAL_MS;
    await vi.advanceTimersByTimeAsync(1);
    expect(batches).toEqual([{ control: false, rowScope: 'dynamic' }]);

    for (let index = 0; index < 100; index += 1) scheduler.mark('live_rows');
    now = STUDIO_LIVE_ROWS_REFRESH_INTERVAL_MS * 2;
    await vi.advanceTimersByTimeAsync(STUDIO_LIVE_ROWS_REFRESH_INTERVAL_MS);
    expect(batches).toEqual([
      { control: false, rowScope: 'dynamic' },
      { control: false, rowScope: 'dynamic' },
    ]);
  });

  it('lets structural rows preempt a pending movement sample', async () => {
    vi.useFakeTimers();
    let now = 0;
    const batches: StudioConnectionRefreshBatch[] = [];
    const scheduler = new StudioConnectionRefreshScheduler((batch) => batches.push(batch), () => now);
    scheduler.noteRowsRefresh();
    scheduler.mark('live_rows');
    scheduler.mark('structural_rows');
    await Promise.resolve();

    expect(batches).toEqual([{ control: false, rowScope: 'all' }]);
    now = STUDIO_LIVE_ROWS_REFRESH_INTERVAL_MS;
    await vi.advanceTimersByTimeAsync(STUDIO_LIVE_ROWS_REFRESH_INTERVAL_MS);
    expect(batches).toHaveLength(1);
  });

  it('cancels queued microtasks and timers on disconnect', async () => {
    vi.useFakeTimers();
    let now = 0;
    const batches: StudioConnectionRefreshBatch[] = [];
    const scheduler = new StudioConnectionRefreshScheduler((batch) => batches.push(batch), () => now);
    scheduler.noteRowsRefresh();
    scheduler.mark('control');
    scheduler.mark('live_rows');
    scheduler.cancel();
    now = STUDIO_LIVE_ROWS_REFRESH_INTERVAL_MS;
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(batches).toEqual([]);
  });
});
