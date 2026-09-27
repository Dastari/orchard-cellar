import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { DbConnection } from '@orchard/world-bindings';
import { CHUNK_AUTHORITY_SPACE_ID, chunkAuthorityModeFromFlagsJson } from '@orchard/sim/chunk-authority-mode';
import type { ChunkRuntimeMode } from '@orchard/sim/chunk-runtime';
import * as worldSetting from '../../world/src/chunk-authority-setting.js';
import { CHUNK_AUTHORITY_QUERY, spaceAdminFlagChunkAuthority } from './chunk-authority-seam.js';
import { ChunkRuntimeController } from './chunk-runtime-controller.js';
import { OverworldConnection } from './net/overworld-connection.js';

/** BUG-053: the client's chunkAuthority seam, driven by space_admin_flag row events. */
type FlagRow = { readonly spaceId: number; readonly flagsJson: string };

function world() {
  const rows = new Map<number, FlagRow>();
  type Listener = (context: unknown, ...rows: FlagRow[]) => void;
  const listeners = { insert: new Set<Listener>(), update: new Set<Listener>(), delete: new Set<Listener>() };
  const subscriptions: { queries: readonly string[]; applied: () => void; unsubscribe: ReturnType<typeof vi.fn>; ended: boolean }[] = [];
  const noEvents = { onInsert: () => {}, onUpdate: () => {}, onDelete: () => {} };
  const connection = {
    db: {
      spaceAdminFlag: {
        spaceId: { find: (id: number) => rows.get(id) },
        onInsert: (fn: Listener) => listeners.insert.add(fn), onUpdate: (fn: Listener) => listeners.update.add(fn), onDelete: (fn: Listener) => listeners.delete.add(fn),
        removeOnInsert: (fn: Listener) => listeners.insert.delete(fn), removeOnUpdate: (fn: Listener) => listeners.update.delete(fn),
        removeOnDelete: (fn: Listener) => listeners.delete.delete(fn),
      },
      worldChunkShadow: { ...noEvents, spaceId: { find: () => undefined } },
      worldChunkHead: { ...noEvents, iter: () => [] },
    },
    subscriptionBuilder: () => {
      let applied = () => {};
      const builder = {
        onApplied: (fn: () => void) => { applied = fn; return builder; },
        onError: () => builder,
        subscribe: (queries: readonly string[]) => {
          const record = { queries, applied: () => applied(), unsubscribe: vi.fn(() => { record.ended = true; }), ended: false };
          subscriptions.push(record);
          return { unsubscribe: record.unsubscribe, isEnded: () => record.ended };
        },
      };
      return builder;
    },
  } as unknown as DbConnection;
  const authoritySubscription = () => subscriptions.find(({ queries }) => queries.includes(CHUNK_AUTHORITY_QUERY));
  return {
    connection, rows, listeners, subscriptions, authoritySubscription,
    applyAuthority: () => authoritySubscription()!.applied(),
    insert(row: FlagRow) { rows.set(row.spaceId, row); for (const fn of listeners.insert) fn({}, row); },
    update(row: FlagRow) { const old = rows.get(row.spaceId)!; rows.set(row.spaceId, row); for (const fn of listeners.update) fn({}, old, row); },
    delete(spaceId: number) { const old = rows.get(spaceId)!; rows.delete(spaceId); for (const fn of listeners.delete) fn({}, old); },
  };
}

const flags = (mode: unknown) => JSON.stringify({ weather: 'auto', chunkAuthority: mode });

function controllerFor(buildMode: ChunkRuntimeMode) {
  const w = world();
  const authority = spaceAdminFlagChunkAuthority();
  const controller = new ChunkRuntimeController({ buildMode, authority: authority.source, watchAuthority: authority.watch, cache: null,
    fetchBlob: async () => new Uint8Array() });
  controller.update(w.connection, 0n, [0, 0, 128, 128], { mapRevision: 1, mapHash: 'map', contentHash: 'content' });
  return { ...w, controller, mode: () => controller.status.mode };
}

describe('BUG-053: the chunk runtime follows the server chunkAuthority row', () => {
  it('an on build: unknown (shadow) until the row subscription applies, then off -> shadow -> on -> off from row events', () => {
    const h = controllerFor('on');
    try {
      expect(h.authoritySubscription()?.queries).toEqual([CHUNK_AUTHORITY_QUERY]);
      expect(CHUNK_AUTHORITY_QUERY).toBe('SELECT * FROM space_admin_flag WHERE space_id = 0');
      // Unknown authority: an on build never activates before the row is known.
      expect(h.mode()).toBe('shadow');
      // Applied with no row: the server default is off, so the client rolls back to off.
      h.applyAuthority();
      expect(h.mode()).toBe('off');
      h.insert({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('shadow') });
      expect(h.mode()).toBe('shadow');
      h.update({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('on') });
      expect(h.mode()).toBe('on');
      // Server off is the rollback.
      h.update({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('off') });
      expect(h.mode()).toBe('off');
      expect(h.controller.store).toBeUndefined();
      h.update({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('on') });
      expect(h.mode()).toBe('on');
      // Deleting the row is the default, off.
      h.delete(CHUNK_AUTHORITY_SPACE_ID);
      expect(h.mode()).toBe('off');
      // An invalid value parses as off, exactly as on the server.
      h.insert({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('sideways') });
      expect(h.mode()).toBe('off');
    } finally {
      h.controller.dispose();
    }
  });

  it('a shadow build stays shadow under server on, and still rolls back to off', () => {
    const h = controllerFor('shadow');
    try {
      h.applyAuthority();
      h.insert({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('on') });
      expect(h.mode()).toBe('shadow');
      h.update({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('off') });
      expect(h.mode()).toBe('off');
      h.update({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('shadow') });
      expect(h.mode()).toBe('shadow');
    } finally {
      h.controller.dispose();
    }
  });

  it('ignores other spaces\' flag rows, and dispose removes the listeners and the subscription', () => {
    const h = controllerFor('on');
    h.applyAuthority();
    h.insert({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('on') });
    const changed = vi.spyOn(h.controller, 'authorityChanged');
    h.insert({ spaceId: 7, flagsJson: flags('off') });
    expect(changed).not.toHaveBeenCalled();
    expect(h.mode()).toBe('on');
    h.controller.dispose();
    expect(h.authoritySubscription()!.unsubscribe).toHaveBeenCalledTimes(1);
    expect([h.listeners.insert.size, h.listeners.update.size, h.listeners.delete.size]).toEqual([0, 0, 0]);
  });

  it('re-subscribes on a new connection, and is unknown there until it applies', () => {
    const authority = spaceAdminFlagChunkAuthority();
    const first = world(), second = world();
    const controller = new ChunkRuntimeController({ buildMode: 'on', authority: authority.source, watchAuthority: authority.watch, cache: null,
      fetchBlob: async () => new Uint8Array() });
    const source = { mapRevision: 1, mapHash: 'map', contentHash: 'content' };
    try {
      first.insert({ spaceId: 0, flagsJson: flags('on') });
      controller.update(first.connection, 0n, [0, 0, 128, 128], source);
      first.applyAuthority();
      expect(controller.status.mode).toBe('on');
      second.insert({ spaceId: 0, flagsJson: flags('on') });
      controller.update(second.connection, 0n, [0, 0, 128, 128], source);
      expect(first.authoritySubscription()!.unsubscribe).toHaveBeenCalledTimes(1);
      expect(controller.status.mode).toBe('shadow');
      second.applyAuthority();
      expect(controller.status.mode).toBe('on');
    } finally {
      controller.dispose();
    }
  });

  it('parses flagsJson with the one shared function the server uses', () => {
    // The world module re-exports the sim implementation: one parse, not two.
    expect(worldSetting.chunkAuthorityModeFromFlagsJson).toBe(chunkAuthorityModeFromFlagsJson);
    const h = world();
    const authority = spaceAdminFlagChunkAuthority();
    authority.watch(h.connection, () => {});
    h.applyAuthority();
    for (const flagsJson of [undefined, '{}', 'not json', '["on"]', flags(true), flags('ON'), flags('off'), flags('shadow'), flags('on')]) {
      if (flagsJson === undefined) h.rows.delete(0); else h.rows.set(0, { spaceId: 0, flagsJson });
      expect(authority.source(h.connection), String(flagsJson)).toBe(chunkAuthorityModeFromFlagsJson(flagsJson));
    }
  });

  it('OverworldConnection.updateChunkRuntime wires the seam: its runtime follows a row event (#236 review)', () => {
    const h = world();
    const self = { chunkRuntimeMode: 'on', chunkRuntime: undefined as ChunkRuntimeController | undefined,
      chunkPinFor: () => [0, 0, 128, 128], chunkRuntimeSource: () => ({ mapRevision: 1, mapHash: 'map', contentHash: 'content' }) };
    const updateChunkRuntime = (OverworldConnection.prototype as unknown as {
      updateChunkRuntime(this: typeof self, connection: DbConnection, position: { spaceId: number }): void }).updateChunkRuntime;
    try {
      updateChunkRuntime.call(self, h.connection, { spaceId: 0 });
      const runtime = self.chunkRuntime!;
      expect(runtime).toBeInstanceOf(ChunkRuntimeController);
      // The connection's runtime subscribed to the flag row and follows it.
      expect(h.authoritySubscription()?.queries).toEqual([CHUNK_AUTHORITY_QUERY]);
      expect(runtime.status.mode).toBe('shadow');
      h.applyAuthority();
      h.insert({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('on') });
      expect(runtime.status.mode).toBe('on');
      h.update({ spaceId: CHUNK_AUTHORITY_SPACE_ID, flagsJson: flags('off') });
      expect(runtime.status.mode).toBe('off');
      // Later updates reuse the same runtime (one seam, one subscription).
      updateChunkRuntime.call(self, h.connection, { spaceId: 0 });
      expect(self.chunkRuntime).toBe(runtime);
      expect(h.subscriptions.filter(({ queries }) => queries.includes(CHUNK_AUTHORITY_QUERY))).toHaveLength(1);
    } finally {
      self.chunkRuntime?.dispose();
    }
    // An off build returns before creating anything.
    const off = { ...self, chunkRuntimeMode: 'off', chunkRuntime: undefined };
    const quiet = world();
    updateChunkRuntime.call(off, quiet.connection, { spaceId: 0 });
    expect(off.chunkRuntime).toBeUndefined();
    expect(quiet.subscriptions).toEqual([]);
  });

  it('an off build never creates the runtime, so it never subscribes to the flag row', () => {
    const text = readFileSync(new URL('./net/overworld-connection.ts', import.meta.url), 'utf8');
    const start = text.indexOf('  private updateChunkRuntime(');
    const body = text.slice(start, text.indexOf('\n  }\n', start));
    const gate = body.indexOf("if (this.chunkRuntimeMode !== 'shadow' && this.chunkRuntimeMode !== 'on') return;");
    expect(gate).toBeGreaterThan(0);
    expect(body.indexOf('spaceAdminFlagChunkAuthority()')).toBeGreaterThan(gate);
    // The seam is created in exactly one place, and nothing else in the client subscribes to space_admin_flag.
    expect(text.match(/spaceAdminFlagChunkAuthority\(/gu)).toHaveLength(1);
    expect(text).not.toMatch(/FROM space_admin_flag/u);
  });
});
