import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceRoot } from './assets/load.js';

type ReferenceGroup =
  | 'library-guide'
  | 'cute-fantasy-art'
  | 'clockwork-raven-art'
  | 'orchard-original-art'
  | 'authoring-source'
  | 'audio'
  | 'design-document'
  | 'source-capture'
  | 'generated-concept'
  | 'other';
type UsagePolicy =
  | 'licensed-importable'
  | 'noncommercial-only'
  | 'license-review-required'
  | 'project-owned'
  | 'authoring-source'
  | 'reference-only'
  | 'concept-only';

interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

interface ReferenceEntry {
  readonly path: string;
  readonly group: ReferenceGroup;
  readonly format: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly duplicateOf: string | null;
  readonly dimensions: ImageDimensions | null;
  readonly domainIndex: 'cute-fantasy' | 'clockwork-raven' | null;
  readonly usagePolicy: UsagePolicy;
  readonly sourceVendor: string | null;
  readonly sourcePack: string;
  readonly licenseRef: string | null;
  readonly provenance: 'vendor-original' | 'project-owned' | 'authoring-source'
    | 'external-document' | 'source-capture' | 'generated-concept'
    | 'audio-reference' | 'library-metadata';
  readonly semanticRole: string;
  readonly searchTerms: readonly string[];
}

interface ReferencePack {
  readonly directory: string;
  readonly vendor: string | null;
  readonly usagePolicy: UsagePolicy;
  readonly licenseRef: string | null;
  readonly files: number;
  readonly bytes: number;
}

interface ReferenceLibraryIndex {
  readonly version: 1;
  readonly sourceRoot: 'references';
  readonly sourceRevision: string;
  readonly summary: {
    readonly files: number;
    readonly bytes: number;
    readonly exactDuplicateGroups: number;
    readonly exactDuplicateCopies: number;
    readonly groups: Readonly<Record<string, { readonly files: number; readonly bytes: number }>>;
    readonly formats: Readonly<Record<string, number>>;
    readonly domainCoverage: Readonly<Record<string, number>>;
  };
  readonly packs: readonly ReferencePack[];
  readonly entries: readonly ReferenceEntry[];
}

const rootPath = fileURLToPath(workspaceRoot);
const referencesPath = resolve(rootPath, 'references');
const assetsPath = resolve(rootPath, 'packages/assets');
const outputRoot = resolve(rootPath, 'docs/reference-assets');

function slash(path: string): string { return path.split(sep).join('/'); }

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

async function emptyDirectories(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter((entry) => entry.isDirectory())
    .map((entry) => emptyDirectories(join(directory, entry.name))));
  return [
    ...(entries.length === 0 ? [slash(relative(rootPath, directory))] : []),
    ...nested.flat(),
  ];
}

export function referenceGroup(path: string): ReferenceGroup {
  if (path === 'references/README.md') return 'library-guide';
  if (path.startsWith('references/art/kenmi/cute-fantasy/')) return 'cute-fantasy-art';
  if (path.startsWith('references/art/clockwork-raven/')) return 'clockwork-raven-art';
  if (path.startsWith('references/art/orchard-originals/')) return 'orchard-original-art';
  if (path.startsWith('references/authoring/')) return 'authoring-source';
  if (path.startsWith('references/audio/')) return 'audio';
  if (path.startsWith('references/documents/design/')) return 'design-document';
  if (path.startsWith('references/documents/source-captures/')) return 'source-capture';
  if (path.startsWith('references/generated/concepts/')) return 'generated-concept';
  return 'other';
}

export function referenceUsagePolicy(path: string): UsagePolicy {
  if (path.startsWith('references/art/kenmi/cute-fantasy/free/')) return 'noncommercial-only';
  if (path.startsWith('references/art/kenmi/cute-fantasy/military-camp/')
    || path.startsWith('references/art/kenmi/cute-fantasy/shroomlands/')
    || path.startsWith('references/art/kenmi/cute-fantasy/unsliced-icon-sheets/')) {
    return 'license-review-required';
  }
  if (path.startsWith('references/art/kenmi/cute-fantasy/')) return 'licensed-importable';
  if (path.startsWith('references/art/orchard-originals/')) return 'project-owned';
  if (path.startsWith('references/authoring/')) return 'authoring-source';
  if (path.startsWith('references/generated/concepts/')) return 'concept-only';
  if (path.startsWith('references/art/clockwork-raven/') || path.startsWith('references/audio/')) {
    return 'license-review-required';
  }
  return 'reference-only';
}

function sourceVendor(path: string): string | null {
  if (path.startsWith('references/art/kenmi/cute-fantasy/')) return 'Kenmi Art';
  if (path.startsWith('references/art/clockwork-raven/')) return 'Clockwork Raven Studios';
  if (path.startsWith('references/art/orchard-originals/')) return 'Orchard & Cellar';
  return null;
}

function sourcePackFor(path: string, clockworkPacks: readonly string[]): string {
  const cutePrefix = 'references/art/kenmi/cute-fantasy/';
  if (path.startsWith(cutePrefix)) {
    const pack = path.slice(cutePrefix.length).split('/')[0];
    return `${cutePrefix}${pack}`;
  }
  if (path.startsWith('references/art/clockwork-raven/')) {
    return [...clockworkPacks]
      .filter((directory) => path === directory || path.startsWith(`${directory}/`))
      .sort((left, right) => right.length - left.length)[0]
      ?? dirname(path);
  }
  if (path === 'references/README.md') return 'references';
  return dirname(path);
}

function licenseRefFor(pack: string, paths: ReadonlySet<string>): string | null {
  const candidates = [
    `${pack}/read_me.txt`,
    `${pack}/README.md`,
    `${pack}/SOURCE.md`,
  ];
  return candidates.find((path) => paths.has(path)) ?? null;
}

function provenanceFor(group: ReferenceGroup): ReferenceEntry['provenance'] {
  if (group === 'cute-fantasy-art' || group === 'clockwork-raven-art') return 'vendor-original';
  if (group === 'orchard-original-art') return 'project-owned';
  if (group === 'authoring-source') return 'authoring-source';
  if (group === 'design-document') return 'external-document';
  if (group === 'source-capture') return 'source-capture';
  if (group === 'generated-concept') return 'generated-concept';
  if (group === 'audio') return 'audio-reference';
  return 'library-metadata';
}

function semanticRoleFor(path: string, group: ReferenceGroup): string {
  const extension = extname(path).toLowerCase();
  if (path.endsWith('/SOURCE.md') || path.endsWith('/README.md') || path.endsWith('/read_me.txt')) {
    return 'provenance-and-license-note';
  }
  if (group === 'clockwork-raven-art' && extension === '.png') return 'item-and-ui-icon-sheet';
  if (group === 'clockwork-raven-art') return 'vendor-source-note';
  if (group === 'cute-fantasy-art' && extension === '.ttf') return 'pixel-font-source';
  if (group === 'cute-fantasy-art' && extension === '.webp') return 'unsliced-icon-sheet';
  if (group === 'cute-fantasy-art' && extension === '.png') return 'sprite-or-tileset-source';
  if (group === 'orchard-original-art') return 'project-art-source';
  if (group === 'authoring-source') return 'editable-layered-source';
  if (group === 'audio') return 'music-reference';
  if (group === 'design-document') return 'design-reference';
  if (group === 'source-capture') return 'legacy-application-capture';
  if (group === 'generated-concept') return 'concept-review-material';
  return 'library-guide';
}

function termsFor(path: string, group: ReferenceGroup): string[] {
  const terms = path.toLowerCase().replace(/^references\//, '').replace(/\.[^.]+$/, '')
    .split(/[/\\_\-.()\s]+/).filter((term) => term.length > 1 && !/^\d+$/.test(term));
  if (terms.includes('satff')) terms.push('staff');
  if (terms.includes('buble')) terms.push('bubble');
  return [...new Set([group.replaceAll('-', ' '), ...terms])].sort();
}

export function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    const dataOffset = 20;
    if (buffer[dataOffset + 3] !== 0x9d || buffer[dataOffset + 4] !== 0x01
      || buffer[dataOffset + 5] !== 0x2a) return null;
    return {
      width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
      height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
    };
  }
  return null;
}

export function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)
    || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function imageDimensions(path: string, bytes: Buffer): ImageDimensions | null {
  const extension = extname(path).toLowerCase();
  if (extension === '.png') return pngDimensions(bytes);
  if (extension === '.webp') return webpDimensions(bytes);
  return null;
}

function domainIndexFor(path: string): ReferenceEntry['domainIndex'] {
  if (path.startsWith('references/art/kenmi/cute-fantasy/') && path.endsWith('.png')) {
    return 'cute-fantasy';
  }
  if (path.startsWith('references/art/clockwork-raven/')) return 'clockwork-raven';
  return null;
}

export async function buildReferenceLibraryIndex(): Promise<ReferenceLibraryIndex> {
  const paths = await walk(referencesPath);
  const relativePaths = paths.map((path) => slash(relative(rootPath, path)));
  const pathSet = new Set(relativePaths);
  const clockworkPacks = relativePaths.filter((path) => path.endsWith('/SOURCE.md')).map(dirname);
  const canonicalByHash = new Map<string, string>();
  const duplicateCountByHash = new Map<string, number>();
  const entries: ReferenceEntry[] = [];
  for (const absolutePath of paths) {
    const path = slash(relative(rootPath, absolutePath));
    const bytes = await readFile(absolutePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const duplicateOf = canonicalByHash.get(sha256) ?? null;
    if (duplicateOf === null) canonicalByHash.set(sha256, path);
    else duplicateCountByHash.set(sha256, (duplicateCountByHash.get(sha256) ?? 1) + 1);
    const group = referenceGroup(path);
    if (group === 'other') throw new Error(`Reference file is outside the declared library layout: ${path}`);
    const sourcePack = sourcePackFor(path, clockworkPacks);
    entries.push({
      path,
      group,
      format: extname(path).toLowerCase().replace(/^\./, '') || 'none',
      sizeBytes: (await stat(absolutePath)).size,
      sha256,
      duplicateOf,
      dimensions: imageDimensions(path, bytes),
      domainIndex: domainIndexFor(path),
      usagePolicy: referenceUsagePolicy(path),
      sourceVendor: sourceVendor(path),
      sourcePack,
      licenseRef: licenseRefFor(sourcePack, pathSet),
      provenance: provenanceFor(group),
      semanticRole: semanticRoleFor(path, group),
      searchTerms: termsFor(path, group),
    });
  }
  const packs = [...new Set(entries.map((entry) => entry.sourcePack))].sort().map((directory) => {
    const packEntries = entries.filter((entry) => entry.sourcePack === directory);
    const first = packEntries[0];
    if (!first) throw new Error(`Empty reference pack: ${directory}`);
    return {
      directory,
      vendor: first.sourceVendor,
      usagePolicy: first.usagePolicy,
      licenseRef: first.licenseRef,
      files: packEntries.length,
      bytes: packEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    };
  });
  const groups = Object.fromEntries([...new Set(entries.map((entry) => entry.group))].sort()
    .map((group) => [group, {
      files: entries.filter((entry) => entry.group === group).length,
      bytes: entries.filter((entry) => entry.group === group)
        .reduce((sum, entry) => sum + entry.sizeBytes, 0),
    }]));
  const formats = Object.fromEntries([...new Set(entries.map((entry) => entry.format))].sort()
    .map((format) => [format, entries.filter((entry) => entry.format === format).length]));
  const domainCoverage = Object.fromEntries(['cute-fantasy', 'clockwork-raven', 'global-only']
    .map((domain) => [domain, entries.filter((entry) => (
      domain === 'global-only' ? entry.domainIndex === null : entry.domainIndex === domain
    )).length]));
  const revision = createHash('sha256').update(entries.map((entry) => (
    `${entry.path}:${entry.sha256}`
  )).join('\n')).digest('hex').slice(0, 16);
  return {
    version: 1,
    sourceRoot: 'references',
    sourceRevision: revision,
    summary: {
      files: entries.length,
      bytes: entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      exactDuplicateGroups: duplicateCountByHash.size,
      exactDuplicateCopies: [...duplicateCountByHash.values()].reduce((sum, count) => sum + count - 1, 0),
      groups,
      formats,
      domainCoverage,
    },
    packs,
    entries,
  };
}

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

async function assertFamilyCatalogPaths(index: ReferenceLibraryIndex): Promise<void> {
  const retained = new Set(index.entries.map((entry) => entry.path));
  const cute = JSON.parse(await readFile(resolve(outputRoot, 'cute-fantasy-index.json'), 'utf8')) as {
    entries?: { source?: string }[];
    companionSources?: { source?: string }[];
  };
  const clockwork = JSON.parse(await readFile(resolve(outputRoot, 'clockwork-raven-index.json'), 'utf8')) as {
    packs?: { sheets?: { source?: string }[]; sourceNotes?: string[]; sourceDirectory?: string }[];
  };
  const declared = [
    ...(cute.entries ?? []).map((entry) => entry.source),
    ...(cute.companionSources ?? []).map((entry) => entry.source),
    ...(clockwork.packs ?? []).flatMap((pack) => [
      ...(pack.sheets ?? []).map((sheet) => sheet.source),
      ...(pack.sourceNotes ?? []),
      pack.sourceDirectory ? `${pack.sourceDirectory}/SOURCE.md` : undefined,
    ]),
  ].filter((path): path is string => path !== undefined);
  const stale = declared.filter((path) => !retained.has(path));
  if (stale.length > 0) {
    throw new Error(`Family reference catalogs contain missing files:\n${stale.join('\n')}`);
  }
  const empty = await emptyDirectories(referencesPath);
  if (empty.length > 0) throw new Error(`Reference library contains empty directories:\n${empty.join('\n')}`);

  const assetDefinitions = (await walk(assetsPath)).filter((path) => path.endsWith('.json'));
  const provenancePaths = new Set<string>();
  function collect(value: unknown): void {
    if (typeof value === 'string' && value.startsWith('references/')) provenancePaths.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(collect);
  }
  for (const asset of assetDefinitions) collect(JSON.parse(await readFile(asset, 'utf8')) as unknown);
  const missingProvenance = [...provenancePaths].filter((path) => !retained.has(path)).sort();
  if (missingProvenance.length > 0) {
    throw new Error(`Reviewed asset provenance points to missing references:\n${missingProvenance.join('\n')}`);
  }
}

function markdownIndex(index: ReferenceLibraryIndex): string {
  const globalEntries = index.entries.filter((entry) => entry.domainIndex === null);
  const groupRows = Object.entries(index.summary.groups).map(([group, summary]) => (
    `| \`${group}\` | ${summary.files} | ${bytesLabel(summary.bytes)} |`
  )).join('\n');
  return `# Complete local reference-library index

This is the coverage index for **every retained file under \`references/\`**. Revision \`${index.sourceRevision}\` contains ${index.summary.files.toLocaleString('en')} files (${bytesLabel(index.summary.bytes)}). The structured [JSON companion](reference-library-index.json) records every path, pack, vendor, licence pointer, use policy, provenance, semantic role, byte size, SHA-256, exact duplicate, format, search terms, domain catalog, and PNG/WebP dimensions.

## Agent lookup order

1. Search this index when the vendor or material type is unknown.
2. Use the [Cute Fantasy sprite index](cute-fantasy-index.md) for semantic sprites, animations, tilesets, collision guidance, and reviewed runtime crops.
3. Use the [Clockwork Raven icon index](clockwork-raven-index.md) for 16 px item/UI sheets, grid sizes, variants, and pack provenance.
4. Open a local \`SOURCE.md\` or source note only when licensing/provenance detail is needed.

\`\`\`sh
# Search every retained filename and generated search term
jq -r --arg term 'fishing' '.entries[] | select(.searchTerms | index($term)) | .path' docs/reference-assets/reference-library-index.json

# Find exact duplicate copies and their canonical path
jq -r '.entries[] | select(.duplicateOf != null) | [.path, .duplicateOf] | @tsv' docs/reference-assets/reference-library-index.json
\`\`\`

## Coverage summary

| Group | Files | Size |
| --- | ---: | ---: |
${groupRows}

- Cute Fantasy domain entries: ${index.summary.domainCoverage['cute-fantasy'] ?? 0}
- Clockwork Raven domain entries: ${index.summary.domainCoverage['clockwork-raven'] ?? 0}
- Files covered only by this global index: ${index.summary.domainCoverage['global-only'] ?? 0}
- Exact duplicate groups: ${index.summary.exactDuplicateGroups}; additional duplicate copies: ${index.summary.exactDuplicateCopies}

Exact duplicates are not automatically mistakes. Pack-local source notes and Free/paid pack overlaps may be retained for provenance. The machine index makes each decision auditable.

## Files outside the two art-domain catalogs

| Path | Group | Use policy | Format | Size | Dimensions | Duplicate of |
| --- | --- | --- | --- | ---: | --- | --- |
${globalEntries.map((entry) => `| \`${entry.path}\` | \`${entry.group}\` | \`${entry.usagePolicy}\` | \`${entry.format}\` | ${bytesLabel(entry.sizeBytes)} | ${entry.dimensions ? `${entry.dimensions.width}×${entry.dimensions.height}` : '—'} | ${entry.duplicateOf ? `\`${entry.duplicateOf}\`` : '—'} |`).join('\n')}
`;
}

async function main(): Promise<void> {
  const index = await buildReferenceLibraryIndex();
  const json = `${JSON.stringify(index, null, 2)}\n`;
  const markdown = markdownIndex(index);
  const jsonPath = resolve(outputRoot, 'reference-library-index.json');
  const markdownPath = resolve(outputRoot, 'reference-library-index.md');
  if (process.argv.includes('--check')) {
    await assertFamilyCatalogPaths(index);
    const [currentJson, currentMarkdown] = await Promise.all([
      readFile(jsonPath, 'utf8'),
      readFile(markdownPath, 'utf8'),
    ]);
    if (currentJson !== json || currentMarkdown !== markdown) {
      throw new Error('Reference library index is stale. Run npm run document:references -w @orchard/tools.');
    }
    console.log(`Verified all ${index.summary.files} retained reference files at revision ${index.sourceRevision}.`);
    return;
  }
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeFile(jsonPath, json),
    writeFile(markdownPath, markdown),
  ]);
  console.log(`Indexed all ${index.summary.files} retained reference files at revision ${index.sourceRevision}.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
