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

export interface CharacterCombatBalanceFields {
  /** Default value for each character attribute; minimum ≤ base ≤ maximum. Unit: count. Range: 1..9007199254740991. */
  readonly baseAttribute: number;
  /** Lower clamp for resolved attributes. Unit: count. Range: 1..9007199254740991. */
  readonly minimumAttribute: number;
  /** Upper clamp for resolved attributes. Unit: count. Range: 1..9007199254740991. */
  readonly maximumAttribute: number;
  /** Denominator for percentage modifiers (10000 means 100%). Unit: basis points. Range: 1..9007199254740991. */
  readonly basisPoints: number;
  /** Number of stored centi-units shown as one health, mana or vigour unit. Unit: count. Range: 1..9007199254740991. */
  readonly centiUnitsPerDisplayUnit: number;
  /** Health centi per strength. Unit: centi-units. Range: 1..9007199254740991. */
  readonly healthCentiPerStrength: number;
  /** Mana centi per intelligence. Unit: centi-units. Range: 1..9007199254740991. */
  readonly manaCentiPerIntelligence: number;
  /** Vigour centi per constitution. Unit: centi-units. Range: 1..9007199254740991. */
  readonly vigourCentiPerConstitution: number;
  /** Health regen centi per second. Unit: centi-units. Range: 1..9007199254740991. */
  readonly healthRegenCentiPerSecond: number;
  /** Mana regen centi per wisdom. Unit: centi-units. Range: 1..9007199254740991. */
  readonly manaRegenCentiPerWisdom: number;
  /** Vigour regen centi per constitution. Unit: centi-units. Range: 1..9007199254740991. */
  readonly vigourRegenCentiPerConstitution: number;
  /** Authority ticks between character regeneration sweeps. Unit: ticks. Range: 1..9007199254740991. */
  readonly regenSweepTicks: number;
  /** Bow base damage centi. Unit: centi-units. Range: 1..9007199254740991. */
  readonly bowBaseDamageCenti: number;
  /** Sword base damage centi. Unit: centi-units. Range: 1..9007199254740991. */
  readonly swordBaseDamageCenti: number;
  /** Combat minimum damage centi. Unit: centi-units. Range: 1..9007199254740991. */
  readonly combatMinimumDamageCenti: number;
  /** Archery target max health centi. Unit: centi-units. Range: 1..9007199254740991. */
  readonly archeryTargetMaxHealthCenti: number;
  /** Archery target regen centi per second. Unit: centi-units. Range: 1..9007199254740991. */
  readonly archeryTargetRegenCentiPerSecond: number;
  /** Archery target regen interval ticks. Unit: ticks. Range: 1..9007199254740991. */
  readonly archeryTargetRegenIntervalTicks: number;
}

export interface CharacterCombatBalanceContentDefinition extends BalanceDefinitionBase {
  readonly profile: 'character_combat';
  readonly fields: CharacterCombatBalanceFields;
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

export interface WorldPolicyBalanceFields {
  /** Fiber till drop percent. Unit: percent. Range: 1..100. */
  readonly fiberTillDropPercent: number;
  /** Crafting station reach tiles. Unit: tiles. Range: 1..64. */
  readonly craftingStationReachTiles: number;
  /** Item despawn ticks. Unit: ticks. Range: 1..10000000. */
  readonly itemDespawnTicks: number;
  /** Survival spawn search radius tiles. Unit: tiles. Range: 1..32000. */
  readonly survivalSpawnSearchRadiusTiles: number;
  /** Procedural world chunk tiles. Unit: tiles. Range: 1..1024. */
  readonly proceduralWorldChunkTiles: number;
  /** World extent in tiles; must be divisible by chunk size. Unit: tiles. Range: 1..1000000. */
  readonly proceduralWorldExtentTiles: number;
  /** Procedural spawn pregen radius chunks. Unit: chunks. Range: 1..1024. */
  readonly proceduralSpawnPregenRadiusChunks: number;
  /** Lookahead radius; cannot exceed spawn pregeneration radius. Unit: chunks. Range: 1..1024. */
  readonly proceduralGenerationLookaheadChunks: number;
  /** Survival terrain max elevation. Unit: count. Range: 1..255. */
  readonly survivalTerrainMaxElevation: number;
  /** Survival terrain contour inset tiles. Unit: tiles. Range: 1..255. */
  readonly survivalTerrainContourInsetTiles: number;
  /** Survival terrain minimum summit tiles. Unit: tiles. Range: 1..1000000. */
  readonly survivalTerrainMinimumSummitTiles: number;
}

export interface WorldPolicyBalanceContentDefinition extends BalanceDefinitionBase {
  readonly profile: 'world_policy';
  readonly fields: WorldPolicyBalanceFields;
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

export interface ResidenceConstructionBalanceFields {
  /** Saved recipe identity; create a new version when changing historical construction costs. Unit: count. Range: 1..65535. */
  readonly recipeVersion: number;
  /** Active item definition used for Wood construction costs. Unit: item reference. */
  readonly wood: `item:${string}`;
  /** Active item definition used for Stone construction costs. Unit: item reference. */
  readonly stone: `item:${string}`;
  /** Active item definition used for Copper construction costs. Unit: item reference. */
  readonly copper: `item:${string}`;
  /** Rustic wood. Unit: count. Range: 1..8192. */
  readonly rusticWood: number;
  /** Townhouse wood. Unit: count. Range: 1..8192. */
  readonly townhouseWood: number;
  /** Townhouse stone. Unit: count. Range: 1..8192. */
  readonly townhouseStone: number;
  /** Wall wood. Unit: count. Range: 1..8192. */
  readonly wallWood: number;
  /** Wall stone. Unit: count. Range: 1..8192. */
  readonly wallStone: number;
  /** Doorway wood. Unit: count. Range: 1..8192. */
  readonly doorwayWood: number;
  /** Window wood. Unit: count. Range: 1..8192. */
  readonly windowWood: number;
  /** Window copper. Unit: count. Range: 1..8192. */
  readonly windowCopper: number;
}

export interface ResidenceConstructionBalanceContentDefinition extends BalanceDefinitionBase {
  readonly profile: 'residence_construction';
  readonly fields: ResidenceConstructionBalanceFields;
}

export type BalanceContentDefinition = ScalarBalanceContentDefinition
  | CharacterCombatBalanceContentDefinition
  | WorldPolicyBalanceContentDefinition
  | ResidenceConstructionBalanceContentDefinition;
