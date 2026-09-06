import { describe, expect, it, vi } from 'vitest';
import {
  CLIENT_ERROR_QUEUE_KEY,
  CLIENT_ERROR_RATE_LIMIT,
  ClientErrorReporter,
  redactClientErrorText,
} from './client-error-reporter.js';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class EventHost {
  readonly listeners = new Map<string, Set<(event: never) => void>>();
  addEventListener(type: string, listener: (event: never) => void): void {
    const listeners = this.listeners.get(type) ?? new Set(); listeners.add(listener); this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: (event: never) => void): void { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: unknown): void { for (const listener of this.listeners.get(type) ?? []) listener(event as never); }
}

describe('client error reporter', () => {
  it('redacts credentials, bounds fields, and strips query parameters from routes', () => {
    expect(redactClientErrorText('Bearer super.secret.token', 100)).toBe('[REDACTED]');
    expect(redactClientErrorText('access_token=secret-value', 100)).toContain('[REDACTED]');
    const reporter = new ClientErrorReporter({
      host: new EventHost(), storage: new MemoryStorage(), route: () => '/play?token=secret#fragment',
      mutationId: () => 'one', now: () => 10,
    });
    const report = reporter.capture('connection', new Error(`Bearer abc.def.ghi ${'x'.repeat(700)}`));
    expect(report).toMatchObject({ route: '/play', clientMutationId: 'client-error.one' });
    expect(report?.message).not.toContain('abc.def.ghi');
    expect(report?.message.length).toBeLessThanOrEqual(512);
  });

  it('captures browser errors, deduplicates fingerprints, and persists a bounded safe queue', () => {
    const host = new EventHost(); const storage = new MemoryStorage(); let now = 10;
    const reporter = new ClientErrorReporter({ host, storage, now: () => now, mutationId: () => String(now) });
    host.emit('error', { message: 'render failed', error: new Error('render failed') });
    host.emit('error', { message: 'render failed', error: new Error('render failed') });
    now += 1; host.emit('unhandledrejection', { reason: new Error('network failed') });
    expect(reporter.queued()).toHaveLength(2);
    expect(JSON.parse(storage.getItem(CLIENT_ERROR_QUEUE_KEY) ?? '[]')).toHaveLength(2);
    reporter.dispose();
    expect(host.listeners.get('error')?.size).toBe(0);
  });

  it('enforces the local rolling window and drains in order only after an adapter attaches', async () => {
    let now = 0; let id = 0;
    const reporter = new ClientErrorReporter({
      host: new EventHost(), storage: null, now: () => now, mutationId: () => String(++id),
    });
    for (let index = 0; index < CLIENT_ERROR_RATE_LIMIT + 2; index += 1) reporter.capture('error', `error-${index}`);
    expect(reporter.queued()).toHaveLength(CLIENT_ERROR_RATE_LIMIT);
    const delivered: string[] = [];
    reporter.attach({ reportClientError: vi.fn(async (report) => { delivered.push(report.message); }) });
    await reporter.flush();
    expect(delivered).toEqual(Array.from({ length: CLIENT_ERROR_RATE_LIMIT }, (_, index) => `error-${index}`));
    expect(reporter.queued()).toHaveLength(0);
    now = 60_001;
    expect(reporter.capture('content', 'after window')).not.toBeNull();
  });

  it('retains queued reports when the transport fails and resumes without throwing', async () => {
    const reporter = new ClientErrorReporter({ host: new EventHost(), storage: null, mutationId: () => 'retry' });
    reporter.capture('error', 'keep me');
    reporter.attach({ reportClientError: vi.fn(async () => { throw new Error('offline'); }) });
    await reporter.flush();
    expect(reporter.queued()).toHaveLength(1);
    reporter.detach();
    reporter.attach({ reportClientError: vi.fn(async () => undefined) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reporter.queued()).toHaveLength(0);
  });
});
