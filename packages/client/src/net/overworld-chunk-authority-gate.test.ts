import { describe, expect, it, vi } from 'vitest';
import type { DbConnection } from '@orchard/world-bindings';
import { OverworldConnection } from './overworld-connection.js';
import { ChunkRuntimeController, type ChunkAuthorityGate, type ChunkRuntimeSource } from '../chunk-runtime-controller.js';

/**
 * BUG-055: the connection's own gate expression (the WorldSource unit tests pass a fake gate, so
 * this was never covered). `not_on` only when there is no chunk runtime; otherwise exactly the
 * controller's answer, including `null`, which lets chunk collision and map records serve.
 */
const SOURCE: ChunkRuntimeSource = { contentHash: 'content-1' };
const gateOf = (self: { chunkRuntime: unknown }): ChunkAuthorityGate | null =>
  OverworldConnection.prototype.chunkAuthorityGate.call({ ...self, chunkRuntimeSource: () => SOURCE } as unknown as OverworldConnection);

describe('BUG-055: OverworldConnection.chunkAuthorityGate', () => {
  it('is not_on only when there is no chunk runtime (an off build)', () => {
    expect(gateOf({ chunkRuntime: undefined })).toBe('not_on');
  });

  it('passes the controller\'s null through: the serving revision may stand in for the server', () => {
    const authorityGate = vi.fn((): ChunkAuthorityGate | null => null);
    expect(gateOf({ chunkRuntime: { authorityGate } })).toBeNull();
    // SW-D2: the gate no longer compares the live source (a lag is reported, not gated).
    expect(authorityGate).toHaveBeenCalledWith();
  });

  it('passes every real gate reason through unchanged', () => {
    for (const reason of ['not_on', 'not_serving', 'shadow_missing', 'superseded'] as const) {
      expect(gateOf({ chunkRuntime: { authorityGate: () => reason } })).toBe(reason);
    }
  });

  it('with a real controller that is not on, still reports the controller\'s not_on', () => {
    const controller = new ChunkRuntimeController({ buildMode: 'shadow', authority: () => 'on', cache: null, fetchBlob: async () => new Uint8Array() });
    const noEvents = { onInsert: () => {}, onUpdate: () => {}, onDelete: () => {} };
    const builder = { onApplied: () => builder, onError: () => builder, subscribe: () => ({ unsubscribe: () => {} }) };
    const connection = { db: { worldChunkShadow: { ...noEvents, spaceId: { find: () => undefined } }, worldChunkHead: { ...noEvents, iter: () => [] } },
      subscriptionBuilder: () => builder } as unknown as DbConnection;
    try {
      controller.update(connection, 0n, [0, 0, 64, 64], SOURCE);
      expect(controller.status.mode).toBe('shadow');
      expect(gateOf({ chunkRuntime: controller })).toBe('not_on');
    } finally {
      controller.dispose();
    }
  });
});
