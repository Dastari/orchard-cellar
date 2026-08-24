export type KnowledgeBranch = 'grove' | 'press' | 'cellar' | 'estate';

export interface VintageRecord {
  readonly number: number;
  readonly bottles: number;
  readonly terroir: number;
  readonly label: string;
  readonly sealedAtTick: number;
}

export interface ProgressionState {
  readonly terroir: number;
  readonly lifetimeTerroir: number;
  readonly heirlooms: number;
  readonly lifetimeHeirlooms: number;
  readonly seeds: number;
  readonly seedsClaimed: number;
  readonly vintages: number;
  readonly successions: number;
  readonly lineages: number;
  readonly skillRanks: Readonly<Record<string, number>>;
  readonly cultivars: readonly string[];
  readonly achievements: readonly string[];
  readonly almanacSpecies: readonly string[];
  readonly vintageHistory: readonly VintageRecord[];
}

export type PrestigeAction =
  | { readonly type: 'sealVintage' }
  | { readonly type: 'succession' }
  | { readonly type: 'lineage' };

export function createInitialProgression(): ProgressionState {
  return {
    terroir: 0,
    lifetimeTerroir: 0,
    heirlooms: 0,
    lifetimeHeirlooms: 0,
    seeds: 0,
    seedsClaimed: 0,
    vintages: 0,
    successions: 0,
    lineages: 0,
    skillRanks: {},
    cultivars: [],
    achievements: [],
    almanacSpecies: [],
    vintageHistory: [],
  };
}

export function isPrestigeAction(action: { readonly type: string }): action is PrestigeAction {
  return action.type === 'sealVintage' || action.type === 'succession' || action.type === 'lineage';
}
