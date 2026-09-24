// Bundle scripts/terrain-plan.ts for browsers, with the atlas meta it needs baked in.
//
//   npx tsx scripts/build-terrain-plan.ts --out <bundle.js> [--manifest <assets.json>] [--atlas <dir>]
//
// --atlas defaults to packages/assets/generated (run `npm run assets:build` first).
// The bundle exports planTerrain(input) (input.atlas optional) and `assets`:
// { [assetId]: { frames, anchor } } for every asset it can draw, so a consumer
// (the wiki's live tile layouts) can publish matching tile sheets. --manifest
// also writes that list as JSON.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]!.replace(/^--/, '')] = process.argv[i + 1]!;
if (!args.out) throw new Error('usage: build-terrain-plan.ts --out <bundle.js> [--manifest <json>] [--atlas <dir>]');
const ATLAS = resolve(args.atlas ?? join(ROOT, 'packages/assets/generated'));
const ENTRY = join(ROOT, 'scripts/terrain-plan.ts');

// 1. Which named assets the terrain art can load (read from the real module).
const tmp = mkdtempSync(join(tmpdir(), 'terrain-plan-'));
try {
  const probe = join(tmp, 'probe.mjs');
  await build({ entryPoints: [ENTRY], bundle: true, format: 'esm', platform: 'node', outfile: probe, logLevel: 'error' });
  const { TERRAIN_PLAN_NAMED_ASSETS } = await import(pathToFileURL(probe).href) as { TERRAIN_PLAN_NAMED_ASSETS: string[] };

  // 2. Atlas meta for every tile-category asset plus the named ones.
  type Frame = { width: number; height: number };
  type Meta = { anchor: [number, number]; variants?: Record<string, Frame[]>; animations?: Record<string, Frame[]>; states?: Record<string, Frame | Frame[]> };
  const index = JSON.parse(readFileSync(join(ATLAS, 'atlas.meta.json'), 'utf8')) as { assetCategories: Record<string, string> };
  const byCategory = new Map<string, Record<string, Meta>>();
  const metaOf = (id: string): Meta | null => {
    const category = index.assetCategories[id];
    if (!category) return null;
    if (!byCategory.has(category)) byCategory.set(category, (JSON.parse(readFileSync(join(ATLAS, `atlas_${category}.meta.json`), 'utf8')) as { assets: Record<string, Meta> }).assets);
    return byCategory.get(category)![id] ?? null;
  };
  const ids = [...new Set([
    ...Object.entries(index.assetCategories).filter(([, c]) => c === 'tiles').map(([id]) => id),
    ...TERRAIN_PLAN_NAMED_ASSETS,
  ])].sort();
  const atlas: Record<string, Meta> = {};
  const assets: Record<string, { frames: number; anchor: [number, number]; category: string }> = {};
  for (const id of ids) {
    const m = metaOf(id);
    if (!m) continue;
    const state = m.states?.base;
    const frames = m.animations?.base ?? m.variants?.base ?? (state ? (Array.isArray(state) ? state : [state]) : []);
    if (!frames.length) continue;
    atlas[id] = { anchor: m.anchor, variants: { base: frames.map((f) => ({ width: f.width, height: f.height })) } };
    assets[id] = { frames: frames.length, anchor: m.anchor, category: index.assetCategories[id]! };
  }

  // 3. Browser bundle with the atlas baked in.
  const wrapper = join(tmp, 'entry.ts');
  writeFileSync(wrapper, `import { planTerrain as plan, stairPlacementFindings, type TerrainPlanInput } from ${JSON.stringify(ENTRY)};
export { stairPlacementFindings };
const atlas = ${JSON.stringify(atlas)};
export const assets = ${JSON.stringify(assets)};
export function planTerrain(input: Omit<TerrainPlanInput, 'atlas'> & { atlas?: TerrainPlanInput['atlas'] }) {
  return plan({ ...input, atlas: input.atlas ?? atlas });
}
`);
  const result = await build({
    entryPoints: [wrapper], bundle: true, format: 'esm', platform: 'browser', minify: true, target: 'es2022',
    outfile: resolve(args.out), logLevel: 'error', metafile: true, legalComments: 'none',
  });
  if (args.manifest) writeFileSync(resolve(args.manifest), `${JSON.stringify(assets, null, 1)}\n`);
  const bytes = Object.values(result.metafile.outputs)[0]!.bytes;
  console.log(`terrain plan bundle: ${Object.keys(assets).length} assets, ${Math.round(bytes / 1024)} KiB -> ${args.out}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
