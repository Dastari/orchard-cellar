export type BalanceDefinitionId = `balance:${string}`;
export type BalanceUnit = 'count' | 'bronze' | 'tiles';

export interface BalanceContentDefinition {
  readonly id: BalanceDefinitionId;
  readonly kind: 'balance';
  readonly schemaVersion: 1;
  readonly retired?: boolean;
  readonly replacement?: BalanceDefinitionId;
  readonly group: string;
  readonly value: number;
  readonly unit: BalanceUnit;
  readonly description: string;
}

export const SUPPORT_CAP_BALANCE_IDS = Object.freeze({
  itemsPerMutation: 'balance:admin_support_items_per_mutation',
  mutationsPerHour: 'balance:admin_support_mutations_per_hour',
  teleportDistanceTiles: 'balance:admin_support_teleport_distance_tiles',
  skillPointsPerMutation: 'balance:admin_support_skill_points_per_mutation',
  statDeltaPerMutation: 'balance:admin_support_stat_delta_per_mutation',
  walletDeltaBronzePerMutation: 'balance:admin_support_wallet_delta_bronze_per_mutation',
} as const satisfies Readonly<Record<string, BalanceDefinitionId>>);
