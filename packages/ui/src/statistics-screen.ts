import {
  AUTHORITY_HZ,
  TILE_SIZE_FIXED,
  itemDefinition,
  playerStatisticDefinition,
  type PlayerStatisticCategory,
  type PlayerStatisticDefinition,
} from '@orchard/sim';

export interface PlayerStatisticModel {
  readonly statisticKind: string;
  readonly subjectKind: string;
  readonly value: bigint;
}

export interface StatisticsScreenModel {
  readonly statistics: readonly PlayerStatisticModel[];
}

export interface StatisticsScreenRow extends PlayerStatisticModel {
  readonly definition: PlayerStatisticDefinition;
}

const CATEGORY_ORDER: readonly PlayerStatisticCategory[] = [
  'account', 'progression', 'exploration', 'social', 'farming', 'crafting',
  'commerce', 'items', 'tools', 'world', 'creatures', 'combat', 'future',
];

export function visiblePlayerStatisticRows(model: StatisticsScreenModel): readonly StatisticsScreenRow[] {
  return model.statistics.flatMap((entry) => {
    const definition = playerStatisticDefinition(entry.statisticKind);
    return definition === null || definition.reserved === true
      ? []
      : [{ ...entry, definition }];
  }).sort((left, right) => {
    const category = CATEGORY_ORDER.indexOf(left.definition.category)
      - CATEGORY_ORDER.indexOf(right.definition.category);
    if (category !== 0) return category;
    const name = left.definition.name.localeCompare(right.definition.name);
    return name !== 0 ? name : left.subjectKind.localeCompare(right.subjectKind);
  });
}

function groupedInteger(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function durationLabel(authorityTicks: bigint): string {
  const seconds = authorityTicks / BigInt(AUTHORITY_HZ);
  const hours = seconds / 3_600n;
  const minutes = (seconds % 3_600n) / 60n;
  const remainingSeconds = seconds % 60n;
  if (hours > 0n) return `${hours}H ${minutes}M`;
  if (minutes > 0n) return `${minutes}M ${remainingSeconds}S`;
  return `${remainingSeconds}S`;
}

export function formatPlayerStatisticValue(value: bigint, definition: PlayerStatisticDefinition): string {
  if (definition.unit === 'authority_ticks') return durationLabel(value);
  if (definition.unit === 'fixed_distance') {
    const wholeTiles = value / BigInt(TILE_SIZE_FIXED);
    const tenths = value % BigInt(TILE_SIZE_FIXED) * 10n / BigInt(TILE_SIZE_FIXED);
    return tenths === 0n ? `${groupedInteger(wholeTiles)} TILES` : `${groupedInteger(wholeTiles)}.${tenths} TILES`;
  }
  if (definition.unit === 'bronze') {
    const gold = value / 10_000n;
    const silver = value % 10_000n / 100n;
    const bronze = value % 100n;
    if (gold > 0n) return `${gold}G ${silver}S ${bronze}B`;
    if (silver > 0n) return `${silver}S ${bronze}B`;
    return `${bronze}B`;
  }
  return groupedInteger(value);
}

export function playerStatisticSubjectLabel(subjectKind: string): string {
  if (subjectKind.length === 0) return '';
  return (itemDefinition(subjectKind)?.displayName ?? subjectKind.replaceAll('_', ' ')).toUpperCase();
}

