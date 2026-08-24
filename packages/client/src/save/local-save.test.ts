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
    const store = new LocalSaveStore(storage, () => 1_000);
    const state = createInitialState(123);
    store.save(state);
    expect(store.load()).toEqual(state);
    store.clear();
    expect(storage.getItem(LOCAL_SAVE_KEY)).toBeNull();
  });

  it('applies capped deterministic offline progress from the saved timestamp', () => {
    const storage = new MemoryStorage();
    const state = createInitialState(123);
    new LocalSaveStore(storage, () => 1_000).save(state);
    const loaded = new LocalSaveStore(storage, () => 61_000).load();
    expect(loaded?.tick).toBe(state.tick + 60 * 60);
    expect(loaded?.economy.vigour).toBe(0);
  });

  it('rejects corrupt, truncated, or future-version saves', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave({ schemaVersion: 4, state: createInitialState() })).toBeNull();
    expect(parseSave({ schemaVersion: 3, state: { ...createInitialState(), collision: { width: 2, height: 2, blocked: [] } } })).toBeNull();
    expect(parseSave({ schemaVersion: 3, state: { ...createInitialState(), economy: { ...createInitialState().economy, resources: { fruit: -1, pomace: 0, must: 0, bottles: 0 } } } })).toBeNull();
    expect(parseSave({ schemaVersion: 3, state: { ...createInitialState(), economy: { ...createInitialState().economy, presses: [1] } } })).toBeNull();
    expect(parseSave({ schemaVersion: 3, state: { ...createInitialState(), economy: { ...createInitialState().economy, trees: [{ ...createInitialState().economy.trees[0], species: 'poisonApple' }] } } })).toBeNull();
    expect(parseSave({ schemaVersion: 3, state: { ...createInitialState(), economy: { ...createInitialState().economy, upgrades: ['timeMachine'] } } })).toBeNull();
  });

  it('rebuilds collision data instead of trusting a valid-sized saved collision map', () => {
    const state = createInitialState(11);
    const blocked = state.collision.blocked.map(() => false);
    const parsed = parseSave({ schemaVersion: 3, state: { ...state, collision: { ...state.collision, blocked } } });
    expect(parsed?.collision.blocked.some(Boolean)).toBe(true);
  });

  it('migrates M3 schema-one saves into the starter economy', () => {
    const current = createInitialState(9);
    const legacy = { ...current, version: 1, economy: undefined };
    const migrated = parseSave({ schemaVersion: 1, state: legacy });
    expect(migrated).toMatchObject({ version: 3, tick: current.tick, player: current.player });
    expect(migrated?.economy.trees).toHaveLength(1);
  });

  it('migrates M4 schema-two saves into empty persistent progression', () => {
    const current = createInitialState(10);
    const legacy = { ...current, version: 2, progression: undefined, economy: { ...current.economy, legacyMultiplier: undefined } };
    const migrated = parseSave({ schemaVersion: 2, state: legacy });
    expect(migrated).toMatchObject({ version: 3, progression: { terroir: 0, lineages: 0 }, economy: { legacyMultiplier: 1 } });
  });
});
