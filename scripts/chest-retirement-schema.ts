import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const LEGACY_CHEST_SCHEMA_NAMES = Object.freeze([
  'world_chest', 'world_chest_slot', 'world_chest_damage',
  'active_chest', 'chest_migration_mapping',
  'own_active_chest', 'own_open_chest_slots',
] as const);

export function assertRetiredChestSchema(value: unknown): void {
  const forbidden = new Set<string>(LEGACY_CHEST_SCHEMA_NAMES);
  const found = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (typeof candidate === 'string') {
      if (forbidden.has(candidate)) found.add(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const child of candidate) visit(child);
      return;
    }
    if (candidate !== null && typeof candidate === 'object') {
      for (const child of Object.values(candidate)) visit(child);
    }
  };
  visit(value);
  if (found.size > 0) throw new Error(`legacy_chest_schema_still_present:${[...found].sort().join(',')}`);
}

async function main(): Promise<void> {
  const [schemaPath] = process.argv.slice(2);
  if (schemaPath === undefined) throw new Error('usage: chest-retirement-schema <schema.json>');
  assertRetiredChestSchema(JSON.parse(await readFile(schemaPath, 'utf8')) as unknown);
  process.stdout.write(`${JSON.stringify({ ok: true, retiredNames: LEGACY_CHEST_SCHEMA_NAMES.length })}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
