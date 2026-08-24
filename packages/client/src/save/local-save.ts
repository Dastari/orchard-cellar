import { applyOffline, createCellarCollisionMap, createEstateCollisionMap, createInitialState, type Direction, type FarmState, type PlayerState } from '@orchard/sim';

export const LOCAL_SAVE_KEY = 'orchard-cellar.farm';
export const SAVE_SCHEMA_VERSION = 2;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SaveEnvelope {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION;
  readonly savedAt: number;
  readonly state: FarmState;
}

const directions = new Set<Direction>([
  'up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlayer(value: unknown): value is PlayerState {
  if (!isRecord(value) || !isRecord(value['position'])) return false;
  const facing = value['facing'];
  return isFiniteNumber(value['position']['x'])
    && isFiniteNumber(value['position']['y'])
    && typeof facing === 'string'
    && directions.has(facing as Direction)
    && typeof value['moving'] === 'boolean'
    && (value['location'] === 'estate' || value['location'] === 'cellar');
}

export function parseSave(value: unknown): FarmState | null {
  if (!isRecord(value) || !isRecord(value['state'])) return null;
  const state = value['state'];
  const rng = state['rng'];
  const collision = state['collision'];
  if (!isFiniteNumber(state['tick']) || state['tick'] < 0) return null;
  if (!isRecord(rng) || !['a', 'b', 'c', 'd'].every((key) => isFiniteNumber(rng[key]))) return null;
  if (!isPlayer(state['player'])) return null;
  if (!isRecord(collision) || !isFiniteNumber(collision['width']) || !isFiniteNumber(collision['height'])) return null;
  if (!Array.isArray(collision['blocked']) || !collision['blocked'].every((entry) => typeof entry === 'boolean')) return null;
  if (collision['blocked'].length !== collision['width'] * collision['height']) return null;
  if (value['schemaVersion'] === 1 && state['version'] === 1) {
    const initial = createInitialState();
    const player = state['player'] as unknown as PlayerState;
    return {
      ...initial,
      tick: state['tick'],
      rng: state['rng'] as FarmState['rng'],
      player,
      collision: player.location === 'cellar' ? createCellarCollisionMap() : createEstateCollisionMap(initial.economy.trees),
    };
  }
  if (value['schemaVersion'] !== SAVE_SCHEMA_VERSION || state['version'] !== 2 || !isRecord(state['economy'])) return null;
  const economy = state['economy'];
  if (!isRecord(economy['resources']) || !Array.isArray(economy['trees']) || !Array.isArray(economy['presses']) || !Array.isArray(economy['casks'])) return null;
  const resources = economy['resources'];
  if (!['fruit', 'pomace', 'must', 'bottles'].every((key) => isFiniteNumber(resources[key]))) return null;
  return state as unknown as FarmState;
}

export class LocalSaveStore {
  constructor(private readonly storage: StorageLike, private readonly now: () => number = () => Date.now()) {}

  load(): FarmState | null {
    try {
      const serialized = this.storage.getItem(LOCAL_SAVE_KEY);
      if (!serialized) return null;
      const value = JSON.parse(serialized) as unknown;
      const state = parseSave(value);
      if (!state || !isRecord(value) || !isFiniteNumber(value['savedAt'])) return state;
      return applyOffline(state, Math.max(0, (this.now() - value['savedAt']) / 1_000));
    } catch {
      return null;
    }
  }

  save(state: FarmState): void {
    const envelope: SaveEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, savedAt: this.now(), state };
    this.storage.setItem(LOCAL_SAVE_KEY, JSON.stringify(envelope));
  }

  clear(): void {
    this.storage.removeItem(LOCAL_SAVE_KEY);
  }
}
