import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const RETIRED_LEGACY_FARM_TABLES = Object.freeze([
  'private_inventory', 'farm_parcel', 'crop_patch', 'farm_activity',
] as const);
export const RETIRED_PLAYER_SURVIVAL_COLUMNS = Object.freeze(['wood', 'stone'] as const);

function objects(value: unknown, found: Record<string, unknown>[]): void {
  if (Array.isArray(value)) for (const child of value) objects(child, found);
  else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    found.push(record);
    for (const child of Object.values(record)) objects(child, found);
  }
}

function descendantStrings(value: unknown, found: Set<string>): void {
  if (typeof value === 'string') found.add(value);
  else if (Array.isArray(value)) for (const child of value) descendantStrings(child, found);
  else if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) descendantStrings(child, found);
  }
}

/** Validates the independently generated post-drain schema description. */
export function assertLegacyFarmRetiredSchema(value: unknown): void {
  const records: Record<string, unknown>[] = [];
  objects(value, records);
  const names = new Set(records.map((record) => record['name'])
    .filter((name): name is string => typeof name === 'string'));
  const retainedSurvival = records.find((record) => record['name'] === 'player_survival');
  const legacyTables = RETIRED_LEGACY_FARM_TABLES.filter((name) => names.has(name));
  if (legacyTables.length !== 0) {
    throw new Error(`legacy_farm_schema_still_present:${legacyTables.join(',')}`);
  }
  if (retainedSurvival === undefined) throw new Error('player_survival_schema_missing');
  const survivalStrings = new Set<string>();
  descendantStrings(retainedSurvival, survivalStrings);
  const legacyColumns = RETIRED_PLAYER_SURVIVAL_COLUMNS.filter((name) => survivalStrings.has(name));
  if (legacyColumns.length !== 0) {
    throw new Error(`legacy_player_survival_columns_still_present:${legacyColumns.join(',')}`);
  }
}

async function main(): Promise<void> {
  const [schemaPath] = process.argv.slice(2);
  if (schemaPath === undefined) throw new Error('usage: legacy-farm-retirement-schema <schema.json>');
  assertLegacyFarmRetiredSchema(JSON.parse(await readFile(schemaPath, 'utf8')) as unknown);
  process.stdout.write(`${JSON.stringify({ ok: true, retainedTable: 'player_survival',
    retiredTables: RETIRED_LEGACY_FARM_TABLES.length,
    retiredColumns: RETIRED_PLAYER_SURVIVAL_COLUMNS.length })}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
