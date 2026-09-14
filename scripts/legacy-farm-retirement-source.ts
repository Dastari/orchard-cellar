import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { RETIRED_LEGACY_FARM_TABLES } from './legacy-farm-retirement-schema.js';

const RETIREMENT_MUTATIONS = [
  'adminInspectLegacyFarmRetirement',
  'adminVerifyLegacyFarmRetirement',
  'adminSetLegacyFarmRetirementPhase',
  'adminDrainLegacyFarmRetirement',
] as const;

/** Strict source-side companion to the described-schema receipt. */
export function assertLegacyFarmRetiredSource(source: string): void {
  for (const name of RETIRED_LEGACY_FARM_TABLES) {
    if (new RegExp(`\\b${name}\\b`, 'u').test(source)) {
      throw new Error(`legacy_farm_source_still_present:${name}`);
    }
  }
  const survivalStart = source.indexOf('const player_survival = table(');
  const survivalEnd = source.indexOf('const player_survival_migration = table(', survivalStart);
  if (survivalStart < 0 || survivalEnd <= survivalStart) throw new Error('player_survival_source_missing');
  const survival = source.slice(survivalStart, survivalEnd);
  for (const column of ['wood', 'stone']) {
    if (new RegExp(`\\b${column}\\s*:`, 'u').test(survival)) {
      throw new Error(`legacy_player_survival_source_column_present:${column}`);
    }
  }
  for (const reducer of RETIREMENT_MUTATIONS) {
    if (new RegExp(`\\b${reducer}\\b`, 'u').test(source)) {
      throw new Error(`legacy_farm_retirement_mutation_still_present:${reducer}`);
    }
  }
  if (!/export const adminLegacyFarmRetirementStatus\s*=/u.test(source)
    || !/phase:\s*['"]schema_removal_candidate['"]/u.test(source)) {
    throw new Error('legacy_farm_terminal_status_missing');
  }
  for (const field of ['privateInventoryCount', 'playerSurvivalCompatibilityCount',
    'farmParcelCount', 'cropPatchCount', 'farmActivityCount', 'remainingCount']) {
    if (!new RegExp(`${field}:\\s*['"]0['"]`, 'u').test(source)) {
      throw new Error(`legacy_farm_terminal_zero_missing:${field}`);
    }
  }
}

async function main(): Promise<void> {
  const [sourcePath] = process.argv.slice(2);
  if (sourcePath === undefined) throw new Error('usage: legacy-farm-retirement-source <world-index.ts>');
  assertLegacyFarmRetiredSource(await readFile(sourcePath, 'utf8'));
  process.stdout.write(`${JSON.stringify({ ok: true, phase: 'schema_removal_candidate' })}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
