import { TREE_BALANCE, WORKBENCH_UPGRADES, applyOffline, createCellarCollisionMap, createEstateCollisionMap, createInitialProgression, createInitialState, type Direction, type FarmState, type PlayerState, type ProgressionState } from '@orchard/sim';

export const LOCAL_SAVE_KEY = 'orchard-cellar.farm';
export const SAVE_SCHEMA_VERSION = 3;

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

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function hasNonNegativeIntegers(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => isNonNegativeInteger(value[key]));
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
  if (!isNonNegativeInteger(state['tick'])) return null;
  if (!isRecord(rng) || !['a', 'b', 'c', 'd'].every((key) => isNonNegativeInteger(rng[key]) && Number(rng[key]) <= 0xffff_ffff)) return null;
  if (!isPlayer(state['player'])) return null;
  if (!isRecord(collision) || !isNonNegativeInteger(collision['width']) || !isNonNegativeInteger(collision['height']) || collision['width'] === 0 || collision['height'] === 0) return null;
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
  const legacyV2 = value['schemaVersion'] === 2 && state['version'] === 2;
  if (!legacyV2 && (value['schemaVersion'] !== SAVE_SCHEMA_VERSION || state['version'] !== 3)) return null;
  if (!isRecord(state['economy'])) return null;
  const economy = state['economy'];
  if (!isRecord(economy['resources']) || !Array.isArray(economy['trees']) || !Array.isArray(economy['presses']) || !Array.isArray(economy['casks'])) return null;
  const resources = economy['resources'];
  if (!['fruit', 'pomace', 'must', 'bottles'].every((key) => isNonNegativeInteger(resources[key]))) return null;
  if (economy['presses'].length !== 5 || economy['casks'].length !== 5 || ![...economy['presses'], ...economy['casks']].every(isNonNegativeInteger)) return null;
  if (!hasNonNegativeIntegers(economy, [
    'nextTreeId', 'hopperFruitMicro', 'yardMustMicro', 'cellarMustMicro', 'vigour', 'vigourRemainder',
    'autumnChain', 'pressRemainder', 'pomaceMicro', 'caskRemainder', 'bottleMicro',
  ]) || Number(economy['vigour']) > 10_000) return null;
  if (economy['lastFullTendTick'] !== null && !isNonNegativeInteger(economy['lastFullTendTick'])) return null;
  const species = new Set(TREE_BALANCE.map((entry) => entry.id));
  for (const tree of economy['trees']) {
    if (!isRecord(tree) || !isNonNegativeInteger(tree['id']) || typeof tree['species'] !== 'string' || !species.has(tree['species'] as typeof TREE_BALANCE[number]['id'])) return null;
    if (!isNonNegativeInteger(tree['x']) || Number(tree['x']) >= 64 || !isNonNegativeInteger(tree['y']) || Number(tree['y']) >= 64 || !['sapling', 'young', 'mature'].includes(String(tree['stage']))) return null;
    if (!isNonNegativeInteger(tree['care']) || tree['care'] > 3 || !hasNonNegativeIntegers(tree, [
      'stageAgeTicks', 'nextCareDecayTick', 'mulchUntilTick', 'bufferMicro', 'productionRemainder',
    ])) return null;
  }
  const validUpgrades = new Set(WORKBENCH_UPGRADES.map((entry) => entry.id));
  const upgrades = Array.isArray(economy['upgrades']) ? economy['upgrades'] : [];
  if (upgrades.some((id) => typeof id !== 'string' || !validUpgrades.has(id as typeof WORKBENCH_UPGRADES[number]['id']))) return null;
  const plotsUnlocked = economy['plotsUnlocked'] === undefined ? 15 : economy['plotsUnlocked'];
  if (!isNonNegativeInteger(plotsUnlocked) || plotsUnlocked < economy['trees'].length || plotsUnlocked > 120) return null;
  if (Number(economy['nextTreeId']) <= Math.max(0, ...economy['trees'].map((tree) => Number((tree as Record<string, unknown>)['id'])))) return null;
  if (!isRecord(economy['knowledge']) || !hasNonNegativeIntegers(economy['knowledge'], ['grove', 'press', 'cellar', 'estate'])) return null;
  const firsts = economy['firsts'];
  if (!isRecord(firsts) || !['harvested', 'pressRun', 'bottle'].every((key) => typeof firsts[key] === 'boolean')) return null;
  const harvestedSpecies = firsts['harvestedSpecies'] === undefined
    ? (firsts['harvested'] ? ['seedlingApple'] : [])
    : firsts['harvestedSpecies'];
  if (!Array.isArray(harvestedSpecies) || harvestedSpecies.some((id) => typeof id !== 'string' || !species.has(id as typeof TREE_BALANCE[number]['id']))) return null;
  if (typeof economy['firstPressRepaired'] !== 'boolean') return null;
  const parsed = state as unknown as FarmState;
  const normalizedEconomy: FarmState['economy'] = {
    ...parsed.economy,
    legacyMultiplier: isFiniteNumber(economy['legacyMultiplier']) && economy['legacyMultiplier'] > 0 ? economy['legacyMultiplier'] : 1,
    upgrades: upgrades as FarmState['economy']['upgrades'],
    plotsUnlocked,
    firsts: { ...parsed.economy.firsts, harvestedSpecies: harvestedSpecies as FarmState['economy']['firsts']['harvestedSpecies'] },
  };
  let progression: ProgressionState = createInitialProgression();
  if (!legacyV2) {
    const candidate = state['progression'];
    if (!isRecord(candidate) || !hasNonNegativeIntegers(candidate, [
      'terroir', 'lifetimeTerroir', 'heirlooms', 'lifetimeHeirlooms', 'seeds', 'seedsClaimed',
      'vintages', 'successions', 'lineages',
    ])) return null;
    if (!isRecord(candidate['skillRanks']) || !Object.values(candidate['skillRanks']).every(isNonNegativeInteger)) return null;
    if (!['cultivars', 'achievements', 'almanacSpecies', 'vintageHistory'].every((key) => Array.isArray(candidate[key]))) return null;
    progression = candidate as unknown as ProgressionState;
  }
  return {
    ...parsed,
    version: 3,
    economy: normalizedEconomy,
    progression,
    collision: parsed.player.location === 'cellar' ? createCellarCollisionMap() : createEstateCollisionMap(normalizedEconomy.trees),
  };
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
