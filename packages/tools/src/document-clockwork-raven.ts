import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './assets/png.js';
import { workspaceRoot } from './assets/load.js';

interface SheetEntry {
  readonly source: string;
  readonly variant: string;
  readonly dimensions: readonly [number, number];
  readonly tileSize: readonly [16, 16];
  readonly grid: readonly [number, number] | null;
  readonly cells: number | null;
  readonly sha256: string;
}

interface PackEntry {
  readonly id: string;
  readonly title: string;
  readonly section: string;
  readonly sourceDirectory: string;
  readonly sourceArchive: string | null;
  readonly archiveSha256: string | null;
  readonly vendor: string;
  readonly licenseStatus: string;
  readonly keywords: readonly string[];
  readonly sheets: readonly SheetEntry[];
  readonly sourceNotes: readonly string[];
}

interface ClockworkRavenIndex {
  readonly version: 1;
  readonly sourceRoot: 'references/art/clockwork-raven';
  readonly sourceRevision: string;
  readonly summary: {
    readonly packs: number;
    readonly sheets: number;
    readonly regularGridSheets: number;
    readonly cataloguedCells: number;
    readonly sections: Readonly<Record<string, number>>;
  };
  readonly packs: readonly PackEntry[];
}

const rootPath = fileURLToPath(workspaceRoot);
const sourceRoot = resolve(rootPath, 'references/art/clockwork-raven');
const outputRoot = resolve(rootPath, 'docs/reference-assets');

function slash(path: string): string { return path.split(sep).join('/'); }
function cleanInline(value: string): string {
  return value.replaceAll('`', '').replaceAll('*', '').replaceAll(/\s+/g, ' ').trim();
}
function humanize(value: string): string {
  return value.replaceAll(/[-_]+/g, ' ').replaceAll(/\b\w/g, (character) => character.toUpperCase());
}
function field(markdown: string, names: readonly string[]): string | null {
  for (const name of names) {
    const match = markdown.match(new RegExp(`^-\\s+(?:\\*\\*)?${name}(?:\\*\\*)?\\s*:\\s*(.+)$`, 'im'));
    if (match?.[1]) return cleanInline(match[1]);
  }
  return null;
}
function keywords(markdown: string): string[] {
  const values = [
    field(markdown, ['Search keywords', 'Keywords']),
    field(markdown, ['Coverage / keywords', 'Themes / keywords', 'Coverage', 'Themes']),
  ].filter((value): value is string => value !== null);
  return [...new Set(values.flatMap((value) => value
    .replace(/^.*?:\s*/, '')
    .split(/[,;]/)
    .map((term) => term.toLowerCase().replaceAll(/[.]+$/g, '').trim())
    .filter(Boolean)))].sort();
}
function variantFor(path: string): string {
  return basename(path, '.png').replace(/^sheet-16-?/, '').replace(/-16$/, '') || 'base';
}
function markdownCell(value: string): string { return value.replaceAll('|', '\\|').replaceAll('\n', ' '); }

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function owningPack(path: string, packDirectories: readonly string[]): string | null {
  return [...packDirectories]
    .filter((directory) => path.startsWith(`${directory}${sep}`))
    .sort((left, right) => right.length - left.length)[0] ?? null;
}

async function buildIndex(): Promise<ClockworkRavenIndex> {
  const files = await walk(sourceRoot);
  const sourceFiles = files.filter((path) => basename(path) === 'SOURCE.md');
  const packDirectories = sourceFiles.map(dirname);
  const packByDirectory = new Map<string, PackEntry>();
  for (const sourceFile of sourceFiles) {
    const directory = dirname(sourceFile);
    const markdown = await readFile(sourceFile, 'utf8');
    const relativeDirectory = slash(relative(sourceRoot, directory));
    const sourceTitle = cleanInline(markdown.match(/^#\s+(.+)$/m)?.[1] ?? '');
    const title = sourceTitle.toLowerCase() === 'source' || sourceTitle === ''
      ? humanize(basename(directory))
      : sourceTitle;
    packByDirectory.set(directory, {
      id: relativeDirectory.replaceAll('/', '--'),
      title,
      section: relativeDirectory.split('/')[0] ?? 'other',
      sourceDirectory: slash(relative(rootPath, directory)),
      sourceArchive: field(markdown, ['Original archive', 'Original outer archive']),
      archiveSha256: field(markdown, ['SHA-256', 'Outer archive SHA-256']),
      vendor: field(markdown, ['Vendor']) ?? 'Clockwork Raven Studios',
      licenseStatus: field(markdown, ['License', 'License note', 'Licence note status', 'License note status'])
        ?? 'License terms were not included in the retained source notes.',
      keywords: keywords(markdown),
      sheets: [],
      sourceNotes: [],
    });
  }

  const sheetsByDirectory = new Map<string, SheetEntry[]>();
  const notesByDirectory = new Map<string, string[]>();
  for (const path of files) {
    const owner = owningPack(path, packDirectories);
    if (owner === null || path.endsWith('SOURCE.md')) continue;
    if (path.toLowerCase().endsWith('.png')) {
      const bytes = await readFile(path);
      const image = decodePng(bytes);
      const regular = image.width % 16 === 0 && image.height % 16 === 0;
      const grid = regular ? [image.width / 16, image.height / 16] as const : null;
      const sheets = sheetsByDirectory.get(owner) ?? [];
      sheets.push({
        source: slash(relative(rootPath, path)),
        variant: variantFor(path),
        dimensions: [image.width, image.height],
        tileSize: [16, 16],
        grid,
        cells: grid === null ? null : grid[0] * grid[1],
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      sheetsByDirectory.set(owner, sheets);
    } else {
      const notes = notesByDirectory.get(owner) ?? [];
      notes.push(slash(relative(rootPath, path)));
      notesByDirectory.set(owner, notes);
    }
  }

  const packs = [...packByDirectory.entries()].map(([directory, pack]) => ({
    ...pack,
    sheets: (sheetsByDirectory.get(directory) ?? []).sort((left, right) => left.source.localeCompare(right.source)),
    sourceNotes: (notesByDirectory.get(directory) ?? []).sort(),
  })).sort((left, right) => left.id.localeCompare(right.id));
  const allSheets = packs.flatMap((pack) => pack.sheets);
  const sections = Object.fromEntries([...new Set(packs.map((pack) => pack.section))].sort()
    .map((section) => [section, packs.filter((pack) => pack.section === section).length]));
  const revision = createHash('sha256').update(packs.flatMap((pack) => [
    `${pack.id}:${pack.archiveSha256 ?? 'no-archive-hash'}`,
    ...pack.sheets.map((sheet) => `${sheet.source}:${sheet.sha256}`),
  ]).join('\n')).digest('hex').slice(0, 16);
  return {
    version: 1,
    sourceRoot: 'references/art/clockwork-raven',
    sourceRevision: revision,
    summary: {
      packs: packs.length,
      sheets: allSheets.length,
      regularGridSheets: allSheets.filter((sheet) => sheet.grid !== null).length,
      cataloguedCells: allSheets.reduce((sum, sheet) => sum + (sheet.cells ?? 0), 0),
      sections,
    },
    packs,
  };
}

function markdownIndex(index: ClockworkRavenIndex): string {
  const sections = [...new Set(index.packs.map((pack) => pack.section))].sort();
  return `# Clockwork Raven icon-sheet index

This is the discovery catalog for the owner-purchased Clockwork Raven / Raven Fantasy source art retained under \`${index.sourceRoot}/\`. It indexes ${index.summary.packs} packs, ${index.summary.sheets} native 16 px sheets, and ${index.summary.cataloguedCells.toLocaleString('en')} regular grid cells at source revision \`${index.sourceRevision}\`.

The library intentionally retains native sheets rather than thousands of numbered single-icon exports or scaled 32/64 px duplicates. A pack's \`SOURCE.md\` records archive provenance, licence-note status, themes, and cleanup decisions. This catalog is discovery metadata, not permission to redistribute source art.

## Finding an icon

\`\`\`sh
# Search pack themes and keywords
rg -ni 'fish|boat|potion|crop|shield|spell' docs/reference-assets/clockwork-raven-index.md

# Return matching source sheets from the structured index
jq -r --arg term 'fish' '.packs[] | select((.keywords | index($term)) or (.title | ascii_downcase | contains($term))) | .sheets[].source' docs/reference-assets/clockwork-raven-index.json
\`\`\`

Regular sheets use 16×16 row-major cells: \`index = row × columns + column\`, \`x = column × 16\`, and \`y = row × 16\`. Preserve deliberate outline/no-outline variants as separate sources. \`epic-weapons-1\` is an irregular 255×32 montage and requires manual bounds review.

${sections.map((section) => `## ${section}

| Pack | Search terms | Canonical sheet(s) | Grid / cells | Source notes |
| --- | --- | --- | --- | --- |
${index.packs.filter((pack) => pack.section === section).map((pack) => {
    const sheetNames = pack.sheets.map((sheet) => `\`${sheet.source}\` (${sheet.variant})`).join('<br>');
    const grids = pack.sheets.map((sheet) => sheet.grid === null
      ? `${sheet.dimensions[0]}×${sheet.dimensions[1]} irregular`
      : `${sheet.grid[0]}×${sheet.grid[1]} / ${sheet.cells}`).join('<br>');
    return `| **${markdownCell(pack.title)}**<br><sub>\`${pack.id}\`</sub> | ${markdownCell(pack.keywords.join(', ') || 'see SOURCE.md')} | ${sheetNames || '—'} | ${grids || '—'} | \`${pack.sourceDirectory}/SOURCE.md\` |`;
  }).join('\n')}`).join('\n\n')}
`;
}

async function main(): Promise<void> {
  const index = await buildIndex();
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputRoot, 'clockwork-raven-index.json'), `${JSON.stringify(index, null, 2)}\n`),
    writeFile(resolve(outputRoot, 'clockwork-raven-index.md'), markdownIndex(index)),
  ]);
  console.log(`Documented ${index.summary.packs} Clockwork Raven packs and ${index.summary.sheets} canonical sheets at revision ${index.sourceRevision}.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
