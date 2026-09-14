export type BalanceDefinitionId = `balance:${string}`;
export type BalanceUnit = 'count' | 'bronze' | 'tiles';
export type SupportCapCapability = 'itemsPerMutation' | 'mutationsPerHour'
  | 'teleportDistanceTiles' | 'skillPointsPerMutation' | 'statDeltaPerMutation'
  | 'walletDeltaBronzePerMutation';

interface BalanceDefinitionBase {
  readonly id: BalanceDefinitionId;
  readonly kind: 'balance';
  readonly schemaVersion: 1;
  readonly retired?: boolean;
  readonly replacement?: BalanceDefinitionId;
  readonly group: string;
  readonly description: string;
}

export interface ScalarBalanceContentDefinition extends BalanceDefinitionBase {
  readonly value: number;
  readonly unit: BalanceUnit;
  /** Stable runtime meaning; independent of this definition's authoring ID. */
  readonly supportCap?: SupportCapCapability;
}

export type CharacterCombatBalanceTuple = readonly [
  baseAttribute: number,
  minimumAttribute: number,
  maximumAttribute: number,
  basisPoints: number,
  centiUnitsPerDisplayUnit: number,
  healthCentiPerStrength: number,
  manaCentiPerIntelligence: number,
  vigourCentiPerConstitution: number,
  healthRegenCentiPerSecond: number,
  manaRegenCentiPerWisdom: number,
  vigourRegenCentiPerConstitution: number,
  regenSweepTicks: number,
  bowBaseDamageCenti: number,
  swordBaseDamageCenti: number,
  combatMinimumDamageCenti: number,
  archeryTargetMaxHealthCenti: number,
  archeryTargetRegenCentiPerSecond: number,
  archeryTargetRegenIntervalTicks: number,
];

export interface CharacterCombatBalanceContentDefinition extends BalanceDefinitionBase {
  readonly profile: 'character_combat';
  readonly values: CharacterCombatBalanceTuple;
}

export type WorldPolicyBalanceTuple = readonly [
  fiberTillDropPercent: number,
  craftingStationReachTiles: number,
  itemDespawnTicks: number,
  survivalSpawnSearchRadiusTiles: number,
  proceduralWorldChunkTiles: number,
  proceduralWorldExtentTiles: number,
  proceduralSpawnPregenRadiusChunks: number,
  proceduralGenerationLookaheadChunks: number,
  survivalTerrainMaxElevation: number,
  survivalTerrainContourInsetTiles: number,
  survivalTerrainMinimumSummitTiles: number,
];

export interface WorldPolicyBalanceContentDefinition extends BalanceDefinitionBase {
  readonly profile: 'world_policy';
  readonly values: WorldPolicyBalanceTuple;
}

export type ResidenceConstructionBalanceTuple = readonly [
  recipeVersion: number,
  wood: `item:${string}`,
  stone: `item:${string}`,
  copper: `item:${string}`,
  rusticWood: number,
  townhouseWood: number,
  townhouseStone: number,
  wallWood: number,
  wallStone: number,
  doorwayWood: number,
  windowWood: number,
  windowCopper: number,
];

export interface ResidenceConstructionBalanceContentDefinition extends BalanceDefinitionBase {
  readonly profile: 'residence_construction';
  readonly values: ResidenceConstructionBalanceTuple;
}

export type BalanceContentDefinition = ScalarBalanceContentDefinition
  | CharacterCombatBalanceContentDefinition
  | WorldPolicyBalanceContentDefinition
  | ResidenceConstructionBalanceContentDefinition;
