import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const assetsDirectory = resolve('packages/client/dist/assets');
const JavaScriptFiles = readdirSync(assetsDirectory).filter((file) => file.endsWith('.js'));
const forbiddenToolChunks = [
  'editor', 'design-studio', 'offline-editor', 'item-studio', 'ui-lab', 'character-studio', 'audio-preview',
] as const;

for (const name of forbiddenToolChunks) {
  const matches = JavaScriptFiles.filter((file) => file === `${name}.js` || file.startsWith(`${name}-`));
  if (matches.length > 0) throw new Error(`Game build contains removed Studio chunk ${name}: ${matches.join(', ')}`);
}

function chunksNamed(name: string): string[] {
  return JavaScriptFiles.filter((file) => file.startsWith(`${name}-`));
}

function oneChunkNamed(name: string): string {
  const matches = chunksNamed(name);
  if (matches.length !== 1) {
    throw new Error(`Expected one ${name} chunk, found ${matches.length}: ${matches.join(', ')}`);
  }
  return matches[0]!;
}

function staticImports(source: string): readonly string[] {
  return [
    ...[...source.matchAll(/\bimport[^;]*?from["']\.\/([^"']+)["']/g)].map((match) => match[1]!),
    ...[...source.matchAll(/\bimport["']\.\/([^"']+)["']/g)].map((match) => match[1]!),
  ];
}

function dynamicImports(source: string): readonly string[] {
  return [...source.matchAll(/import\(["'`]\.\/([^"'`]+)["'`]\)/g)].map((match) => match[1]!);
}

const stableChunks = [
  'spacetime-runtime',
  'world-bindings',
  'simulation',
  'client-network',
  'game-ui',
  'canvas-rendering',
] as const;

for (const chunk of stableChunks) oneChunkNamed(chunk);

const overworldChunk = oneChunkNamed('overworld-main');
const overworldSource = readFileSync(resolve(assetsDirectory, overworldChunk), 'utf8');
const overworldStaticImports = staticImports(overworldSource);
const overworldDynamicImports = dynamicImports(overworldSource);

for (const chunk of ['simulation', 'client-network', 'game-ui', 'canvas-rendering'] as const) {
  const file = oneChunkNamed(chunk);
  if (!overworldStaticImports.includes(file)) {
    throw new Error(`The gameplay entry no longer statically imports ${chunk}`);
  }
}

for (const lazyChunk of ['terrain-inspector', 'render-benchmark-scenarios'] as const) {
  const matches = chunksNamed(lazyChunk);
  if (matches.length === 0) throw new Error(`Missing lazy ${lazyChunk} chunk`);
  if (matches.some((file) => overworldStaticImports.includes(file))) {
    throw new Error(`${lazyChunk} became a static gameplay dependency`);
  }
  if (!matches.some((file) => overworldDynamicImports.includes(file))) {
    throw new Error(`The gameplay entry no longer dynamically imports ${lazyChunk}`);
  }
}

console.log(`Client chunk boundaries verified: ${stableChunks.join(', ')}; diagnostics remain lazy.`);
