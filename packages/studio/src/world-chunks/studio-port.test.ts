import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DbConnection } from '@orchard/world-bindings';
import { studioChunkBlobReader } from './studio-port.js';

const head = { spaceId: 0, cx: 0, cy: 0, contentHash: 'a'.repeat(64), byteLength: 3 };
const connection = (read: () => Promise<Uint8Array>) => ({ procedures: { readWorldChunkBlob: read } }) as unknown as DbConnection;

describe('Studio chunk-only bounded blob reads', () => {
  afterEach(() => vi.useRealTimers());
  it('bounds the streamed response and cancels an oversized blob', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4)); }, cancel }));
    const fetcher = vi.fn(async () => response) as unknown as typeof fetch;
    await expect(studioChunkBlobReader(connection(async () => { throw new Error('unexpected'); }), fetcher)(head)).rejects.toThrow('too_large');
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('falls back only on 404 and permits a retry of the same missing published blob', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('temporary_read_failure')).mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    const fetcher = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const reader = studioChunkBlobReader(connection(read), fetcher);
    await expect(reader(head)).rejects.toThrow('temporary_read_failure');
    expect(await reader(head)).toEqual(new Uint8Array([1, 2, 3]));
    const unavailable = studioChunkBlobReader(connection(read), (async () => new Response(null, { status: 503 })) as typeof fetch);
    await expect(unavailable(head)).rejects.toThrow('chunk_fetch_503');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('times out an SDK call that never resolves, allowing the head loader to retry', async () => {
    vi.useFakeTimers();
    const reader = studioChunkBlobReader(connection(() => new Promise(() => {})), (async () => new Response(null, { status: 404 })) as typeof fetch);
    const failure = expect(reader(head)).rejects.toThrow('chunk_database_read_timeout');
    await vi.advanceTimersByTimeAsync(15_000);
    await failure;
  });
});
