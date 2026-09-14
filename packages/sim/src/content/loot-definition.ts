import type { SkillCheckSeedPart } from '../checks.js';

export type LootDefinitionId = `loot:${string}`;

export type LootScalar = string | number | boolean;

export type LootCondition =
  | {
    readonly context: {
      readonly key: string;
      readonly operator: 'eq' | 'gte' | 'lte';
      readonly value: LootScalar;
    };
  }
  | { readonly toolTierAtLeast: number }
  | { readonly skillRank: { readonly skill: string; readonly minimum: number } }
  | {
    readonly rareRoll: {
      readonly seedTag: string;
      readonly comparison: 'lt' | 'gte';
      readonly threshold: number;
      readonly outOf: number;
      readonly rankKey?: string;
      readonly perRank?: number;
    };
  };

export interface LootItemTarget {
  readonly item: `item:${string}`;
  readonly min: number;
  readonly max: number;
}

export interface LootNestedTarget {
  /** One nested table is permitted; the resolver rejects deeper recursion. */
  readonly loot: LootDefinitionId;
}

export interface LootEntryDefinition {
  readonly id: string;
  readonly weight: number;
  readonly priority?: number;
  readonly conditions?: readonly LootCondition[];
  readonly flags?: readonly string[];
  readonly target: LootItemTarget | LootNestedTarget;
}

export interface LootGroupDefinition {
  readonly id: string;
  readonly rollTag?: string;
  readonly conditions?: readonly LootCondition[];
  readonly entries: readonly LootEntryDefinition[];
}

export interface LootContentDefinition {
  readonly id: LootDefinitionId;
  readonly kind: 'loot';
  readonly schemaVersion: 1;
  readonly retired?: boolean;
  readonly replacement?: LootDefinitionId;
  readonly groups: readonly LootGroupDefinition[];
}

export interface LootRollContext {
  readonly values?: Readonly<Record<string, LootScalar>>;
  readonly toolTier?: number;
  readonly skillRanks?: Readonly<Record<string, number>>;
}

export interface LootRollRequest {
  readonly lootId: LootDefinitionId;
  readonly seedParts: readonly SkillCheckSeedPart[];
  readonly context?: LootRollContext;
  readonly rolls?: number;
}

export interface LootDrop {
  readonly itemKind: string;
  readonly quantity: number;
}

export interface LootRollResult {
  readonly drops: readonly LootDrop[];
  readonly flags: readonly string[];
}
