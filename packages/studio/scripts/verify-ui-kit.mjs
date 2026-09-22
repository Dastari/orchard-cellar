/**
 * Studio UI-kit prebuild gate (doc 61 §5). Release scripts run this before any
 * Studio build, so it stays dependency-free (Node built-ins only).
 *
 * It refuses to build when:
 * - the reviewed kit or the kit-mounted workbench shell is missing;
 * - `@orchard/ui/studio` re-exports anything beyond the kit surface;
 * - Studio source constructs elements, implements element behaviour, imports
 *   engine painters or hand layout, draws raw canvas outside the viewport
 *   renderer allowlist, or writes colour literals outside token/content files.
 *
 * ESLint (`orchard-ui-kit/*`, see eslint.config.js) enforces the same rules
 * with an AST; this gate is the build-time backstop. Both read the allowlists
 * exported below, so keep them explicit and small.
 */
import console from 'node:console';
import process from 'node:process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

export const STUDIO_UI_KIT_POLICY = Object.freeze({
  /** Spatial viewport renderers: world content, never chrome. */
  rawDrawAllowlist: Object.freeze([
    'packages/studio/src/tools/map/editor-renderer.ts',
    'packages/studio/src/tools/map/active-overlays.ts',
    'packages/studio/src/tools/map/workspace-overlays.ts',
    'packages/studio/src/tools/map/editor-terrain-patch.ts',
    'packages/studio/src/tools/map/editor-terrain-wire.ts',
    'packages/studio/src/tools/map/editor-terrain-derivatives.ts',
  ]),
  /** Token and content files (sprite colour ramps, catalog category colours). */
  colourAllowlist: Object.freeze([
    'packages/studio/src/tools/map/spatial-colours.ts',
    'packages/studio/src/tools/character/model.ts',
    'packages/studio/src/tools/map/map-object-catalog.ts',
    'packages/studio/src/tools/map/content-object-catalog.ts',
    // TEMPORARY: live-marker colours, pending the P0/P1 lanes that own this
    // file. Move them to spatial-colours.ts after those merge.
    'packages/studio/src/tools/map/editor-controller.ts',
  ]),
});

const SOURCE_RULES = [
  { pattern: /\bnew\s+UiElement\s*\(/u, message: 'constructs UiElement; use a ui.* factory or add one to the kit' },
  { pattern: /\buiComponent\s*\(/u, message: 'calls the kit-internal uiComponent constructor' },
  { pattern: /(?:^|[{,\s])(?:paint|paintOverlay|onPointer|onPointerObserved)\s*(?::|\()/mu, message: 'implements element paint/pointer behaviour; add the primitive to the kit' },
  { pattern: /import\s*(?:type\s*)?\{[^}]*\b(?:draw[A-Z]\w*|paint[A-Z]\w*|layoutUi\w*|buildStudio\w+|studioTabStrip|studioInspectorGroups|uiInventorySelectorRect)\b[^}]*\}\s*from\s*'@orchard\/ui\/studio'/u, message: 'imports an engine painter, hand layout or a retired Studio model' },
  { pattern: /from\s*'@orchard\/ui'/u, message: 'imports the game entry; Studio uses @orchard/ui/studio' },
  { pattern: /from\s*'[^']*\/ui\/src\//u, message: 'imports packages/ui source directly; use @orchard/ui/studio' },
];
const RAW_DRAW = [
  /\.(?:fillRect|strokeRect|clearRect|drawImage|fillText|strokeText|beginPath|closePath|moveTo|lineTo|arc|arcTo|bezierCurveTo|quadraticCurveTo|ellipse|roundRect|putImageData|getImageData|createImageData|setLineDash|createLinearGradient|createRadialGradient|createConicGradient|createPattern)\s*\(/u,
  /\.(?:fill|stroke|clip)\s*\(\s*\)/u,
  /\.(?:fillStyle|strokeStyle|globalAlpha|globalCompositeOperation|imageSmoothingEnabled)\s*=(?!=)/u,
  /\bnew\s+(?:Image|OffscreenCanvas|Path2D)\s*\(/u,
];
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gu;
const COLOUR = /(?:^|[^\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(\s*[\d.]/iu;

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

export function studioUiKitViolations(repository) {
  const problems = [];
  const at = (path) => join(repository, path);
  if (!existsSync(at('packages/ui/src/kit/index.ts'))) problems.push('packages/ui/src/kit/index.ts: the reviewed UI kit is missing');
  const shell = at('packages/studio/src/shell/app.ts');
  if (!existsSync(shell) || !readFileSync(shell, 'utf8').includes('ui.workbench(')) {
    problems.push('packages/studio/src/shell/app.ts: the Studio shell does not mount ui.workbench (retired UI renderer)');
  }
  const entryPath = at('packages/ui/src/studio-entry.ts');
  const entry = existsSync(entryPath) ? readFileSync(entryPath, 'utf8') : '';
  if (!entry.includes("export type * from './kit/index.js'")) problems.push('packages/ui/src/studio-entry.ts: kit types must be exported type-only');
  if (/export\s*\*\s*from\s*'\.\/(?:index|kit\/index|studio\/index)\.js'/u.test(entry)) {
    problems.push('packages/ui/src/studio-entry.ts: re-exports a whole module; list kit values explicitly');
  }
  const root = at('packages/studio/src');
  if (!existsSync(root)) return problems;
  for (const file of sources(root)) {
    const path = relative(repository, file).split('\\').join('/');
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    const report = (index, message) => problems.push(`${path}:${index + 1}: ${message}`);
    for (const rule of SOURCE_RULES) {
      const match = rule.pattern.exec(text);
      if (match) report(text.slice(0, match.index).split('\n').length - 1, rule.message);
    }
    if (!STUDIO_UI_KIT_POLICY.rawDrawAllowlist.includes(path)) {
      lines.forEach((line, index) => { if (RAW_DRAW.some((pattern) => pattern.test(line))) report(index, 'raw canvas drawing outside a viewport renderer'); });
    }
    if (!STUDIO_UI_KIT_POLICY.colourAllowlist.includes(path)) {
      lines.forEach((line, index) => {
        for (const literal of line.match(STRING_LITERAL) ?? []) if (COLOUR.test(literal)) { report(index, 'colour literal outside a token file'); break; }
      });
    }
  }
  return problems;
}

// Run when executed directly (release scripts, prebuild); stay inert when
// eslint.config.js imports the policy.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const repository = fileURLToPath(new URL('../../../', import.meta.url));
  const problems = studioUiKitViolations(repository);
  if (problems.length > 0) {
    console.error('Studio build stopped: Studio must compose the reviewed UI kit only (docs/61 §5).');
    for (const problem of problems.slice(0, 50)) console.error(`  ${problem}`);
    if (problems.length > 50) console.error(`  …and ${problems.length - 50} more`);
    console.error('Integrate the reviewed UI kit source before rebuilding Studio.');
    console.error('Add missing primitives to packages/ui/src/kit with a UI Lab specimen; do not build them in Studio.');
    console.error('Reviewed source belongs in packages/studio and packages/ui in this repository.');
    console.error('Release handoff: .git/cellar-ui-release.md (repository root).');
    process.exitCode = 1;
  }
}
