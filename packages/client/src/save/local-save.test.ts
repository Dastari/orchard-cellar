import { createInitialState } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { LOCAL_SAVE_KEY, LocalSaveStore, parseSave } from './local-save.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('schema-versioned local saves', () => {
  it('round-trips deterministic farm state', () => {
    const storage = new MemoryStorage();
    const store = new LocalSaveStore(storage);
    const state = createInitialState(123);
    store.save(state);
    expect(store.load()).toEqual(state);
    store.clear();
    expect(storage.getItem(LOCAL_SAVE_KEY)).toBeNull();
  });

  it('rejects corrupt, truncated, or future-version saves', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave({ schemaVersion: 2, state: createInitialState() })).toBeNull();
    expect(parseSave({ schemaVersion: 1, state: { ...createInitialState(), collision: { width: 2, height: 2, blocked: [] } } })).toBeNull();
  });
});
