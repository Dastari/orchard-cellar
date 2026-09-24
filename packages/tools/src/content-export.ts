import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrapContentDefinitions,
  bootstrapContentRows,
  buildContentRegistry,
  contentDefinitionTransportValue,
  type SupportedContentDefinition,
  type SupportedContentKind,
} from '@orchard/sim';

const OUTPUT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/content');

type BootstrapContentKind = SupportedContentKind;

const FILE_BY_KIND = {
  item: 'items.json',
  recipe: 'recipes.json',
  process: 'processes.json',
  shop: 'shops.json',
  tileset: 'tilesets.json',
  frame: 'frames.json',
  loot: 'loot.json',
  npc: 'npcs.json',
  dialogue: 'dialogues.json',
  quest: 'quests.json',
  balance: 'balance.json',
  progression: 'progression.json',
  crop: 'crops.json',
  creature: 'creatures.json',
  spawn: 'spawns.json',
  space: 'spaces.json',
  skill_tree: 'skill-trees.json',
  effect: 'effects.json',
  statistic: 'statistics.json',
  upgrade: 'upgrades.json',
  balance_group: 'balance-groups.json',
  object: 'objects.json',
  resource: 'resources.json',
  loadout: 'loadouts.json',
  enemy: 'enemies.json',
  encounter: 'encounters.json',
  world_rules: 'world-rules.json',
  gear: 'gear.json',
} as const satisfies Readonly<Record<BootstrapContentKind, string>>;

export interface BootstrapContentFile {
  readonly kind: BootstrapContentKind;
  readonly fileName: string;
  readonly json: string;
  readonly definitionCount: number;
}

export function bootstrapContentFiles(
  definitions: readonly SupportedContentDefinition[] = bootstrapContentDefinitions(),
): readonly BootstrapContentFile[] {
  return Object.entries(FILE_BY_KIND).map(([kind, fileName]) => {
    const typedKind = kind as BootstrapContentKind;
    const selected = definitions
      .filter((definition) => definition.kind === typedKind)
      .sort((left, right) => left.id.localeCompare(right.id));
    return {
      kind: typedKind,
      fileName,
      json: `${JSON.stringify(selected.map(contentDefinitionTransportValue), null, 2)}\n`,
      definitionCount: selected.length,
    };
  });
}

export async function exportBootstrapContent(
  outputDirectory = OUTPUT_DIRECTORY,
  check = false,
): Promise<readonly BootstrapContentFile[]> {
  const build = buildContentRegistry(bootstrapContentRows());
  if (!build.report.valid) {
    const details = build.report.errors.map(({ code, definitionId, message }) => (
      `${code}${definitionId === undefined ? '' : ` (${definitionId})`}: ${message}`
    )).join('\n');
    throw new Error(`Bootstrap content is invalid:\n${details}`);
  }

  const files = bootstrapContentFiles();
  if (!check) await mkdir(outputDirectory, { recursive: true });
  for (const file of files) {
    const path = resolve(outputDirectory, file.fileName);
    if (check) {
      let current: string;
      try {
        current = await readFile(path, 'utf8');
      } catch {
        throw new Error(`Missing generated content file: ${path}`);
      }
      if (current !== file.json) throw new Error(`Generated content is stale: ${path}`);
    } else {
      await writeFile(path, file.json, 'utf8');
    }
  }
  return files;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const files = await exportBootstrapContent(OUTPUT_DIRECTORY, check);
  const count = files.reduce((sum, file) => sum + file.definitionCount, 0);
  console.log(`${check ? 'Validated' : 'Exported'} ${count} definitions in ${files.length} files at ${OUTPUT_DIRECTORY}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
