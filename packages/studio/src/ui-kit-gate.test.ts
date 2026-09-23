import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it, vi } from 'vitest';
import { UiRoot, type UiElement } from '@orchard/ui/studio';
import orchardUiKit from '../../../scripts/eslint/orchard-ui-kit.mjs';
import { studioUiKitViolations } from '../scripts/verify-ui-kit.mjs';
import { StudioShellController } from './shell/controller.js';
import { StudioCanvasToolRegistry } from './shell/canvas-tool-registry.js';
import { registerBuiltinStudioCanvasTools } from './shell/builtin-canvas-tools.js';
import type { StudioCanvasToolContext } from './shell/canvas-tool.js';

/** Doc 61 §5: Studio composes only kit factories. The lint rules catch the
 * source patterns; this runtime check catches anything that slips past them
 * by mounting every Studio route and checking each element kind against the
 * kinds the kit itself creates. */

const KIT_DIRECTORY = fileURLToPath(new URL('../../ui/src/kit/', import.meta.url));

function kitSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return kitSources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && entry.name !== 'source-cards.generated.ts' ? [path] : [];
  });
}

/** Every element kind the kit source can produce. `box` is the UiElement default. */
function kitKinds(): ReadonlySet<string> {
  const kinds = new Set(['box']);
  for (const file of kitSources(KIT_DIRECTORY)) {
    const source = readFileSync(file, 'utf8');
    // `kind: 'x'`, `kind: flag ? 'x' : 'y'` and `options.kind ?? 'x'`.
    for (const match of source.matchAll(/\bkind\s*(?::|\?\?|\|\|)\s*([^,}\n]+)/gu)) {
      for (const literal of match[1]!.matchAll(/['"]([\w-]+)['"]/gu)) kinds.add(literal[1]!);
    }
  }
  return kinds;
}

function tree(element: UiElement): UiElement[] {
  return [element, ...element.children.flatMap(tree)];
}

const CONTROLS = Object.freeze({ x: 10, y: 20, width: 420, height: 620 });
const WORKSPACE = Object.freeze({ x: 440, y: 20, width: 820, height: 620 });
const INSPECTOR = Object.freeze({ x: 1280, y: 20, width: 420, height: 620 });

describe('Studio UI-kit gate', () => {
  it('produces only kit element kinds on every Studio route', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    try {
      const kinds = kitKinds();
      expect(kinds.size).toBeGreaterThan(40);
      const registry = new StudioCanvasToolRegistry();
      registerBuiltinStudioCanvasTools(registry);
      const controller = new StudioShellController(async () => { throw new Error('offline'); });
      controller.session.connected({ identity: 'ui-kit-gate', role: 'owner', contentRevision: null, mapRevision: null });
      const routes = controller.tools.routes('owner');
      expect(routes.length).toBeGreaterThan(15);
      const offenders: string[] = [];
      let mounted = 0;
      for (const route of routes) {
        expect(controller.navigate(route.path), route.path).toBe(true);
        const builder = await registry.load(route.tool.id);
        expect(builder, route.tool.id).not.toBeNull();
        const context: StudioCanvasToolContext = { controlsBounds: CONTROLS, workspaceBounds: WORKSPACE, inspectorBounds: INSPECTOR,
          bounds: WORKSPACE, route: controller.activeRoute(), controller, invalidate: () => undefined };
        const surface = builder!(context);
        try {
          for (const [region, element] of Object.entries(surface.kit ?? {})) {
            if (!element) continue;
            // Arrange in a root so virtual lists and tables materialise their rows.
            const root = new UiRoot({ scale: 1 }); root.resize(420, 620); root.mount(element); root.arrange();
            for (const node of tree(element)) {
              if (!kinds.has(node.kind)) offenders.push(`${route.path} ${region}: ${node.kind}${node.id.startsWith('ui-') ? '' : ` #${node.id}`}`);
            }
            root.unmount(element); root.dispose(); mounted++;
          }
        } finally { surface.lifecycle?.dispose(); }
      }
      expect(mounted).toBeGreaterThan(20);
      expect(offenders).toEqual([]);
    } finally { vi.unstubAllGlobals(); }
  }, 60_000);

  describe('lint rules', () => {
    const linter = new Linter();
    const lint = (code: string) => linter.verify(code, [{
      files: ['**/*.ts'],
      languageOptions: { parser: tseslint.parser as Linter.Parser },
      plugins: { 'orchard-ui-kit': orchardUiKit },
      rules: {
        'orchard-ui-kit/no-hand-built-elements': 'error', 'orchard-ui-kit/kit-entry-only': 'error',
        'orchard-ui-kit/no-raw-canvas-draw': 'error', 'orchard-ui-kit/no-colour-literals': 'error',
      },
    }], { filename: 'tool.ts' }).map(message => message.ruleId);

    it('rejects hand-built elements and element behaviour', () => {
      expect(lint(`new UiElement({ kind: 'row', paint() {}, onPointer() { return true; } });`))
        .toEqual(['orchard-ui-kit/no-hand-built-elements', 'orchard-ui-kit/no-hand-built-elements', 'orchard-ui-kit/no-hand-built-elements']);
      expect(lint(`uiComponent({});`)).toEqual(['orchard-ui-kit/no-hand-built-elements']);
    });
    it('rejects the game entry, engine painters, hand layout and retired models', () => {
      expect(lint(`import { drawUiSkinAsset, layoutUiFlex, buildStudioTableView, ui } from '@orchard/ui/studio';`))
        .toEqual(Array(3).fill('orchard-ui-kit/kit-entry-only'));
      expect(lint(`import { ui } from '@orchard/ui';`)).toEqual(['orchard-ui-kit/kit-entry-only']);
      expect(lint(`import { x } from '../../../ui/src/skin.js';`)).toEqual(['orchard-ui-kit/kit-entry-only']);
    });
    it('rejects raw canvas drawing but not array fill', () => {
      expect(lint(`ctx.fillStyle = token; ctx.fillRect(0, 0, 1, 1); ctx.beginPath(); ctx.stroke(); new Image();`))
        .toEqual(Array(5).fill('orchard-ui-kit/no-raw-canvas-draw'));
      expect(lint(`new Int16Array(4).fill(0); values.filter(Boolean);`)).toEqual([]);
    });
    it('rejects colour literals outside token files', () => {
      expect(lint(`const a = '#4f8b54'; const b = 'rgba(1, 2, 3, 0.5)'; const c = \`hsl(20 50% 50%)\`;`))
        .toEqual(Array(3).fill('orchard-ui-kit/no-colour-literals'));
      expect(lint(`const step = '#'; const id = \`#\${value}\`; const style = \`rgba(\${r},\${g},\${b},1)\`;`)).toEqual([]);
    });
  });

  describe('prebuild gate', () => {
    const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url));
    it('passes on this repository', () => {
      expect(studioUiKitViolations(REPOSITORY)).toEqual([]);
    });
    it('refuses hand-built UI, raw draws, colours and a widened entry', () => {
      const root = mkdtempSync(join(tmpdir(), 'ui-kit-gate-'));
      try {
        const put = (path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
        put('packages/ui/src/kit/index.ts', 'export {};\n');
        put('packages/ui/src/studio-entry.ts', "export * from './index.js';\n");
        put('packages/studio/src/shell/app.ts', 'ui.workbench({});\n');
        put('packages/studio/src/tools/row.ts', [
          "import { drawUiSkinAsset, ui } from '@orchard/ui/studio';",
          "const row = new UiElement({ paint(element, { context }) { context.fillStyle = '#4f8b54'; context.fillRect(0, 0, 1, 1); } });",
        ].join('\n'));
        put('packages/studio/src/tools/map/workspace-overlays.ts', 'context.fillRect(0, 0, 1, 1);\n');
        const problems = studioUiKitViolations(root).join('\n');
        for (const expected of ['type-only', 're-exports a whole module', 'constructs UiElement', 'paint/pointer behaviour',
          'engine painter', 'raw canvas drawing', 'colour literal']) expect(problems).toContain(expected);
        expect(problems).not.toContain('workspace-overlays.ts');
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  });

  it('keeps the kit entry free of engine painters, hand layout and element construction', async () => {
    const entry = await import('@orchard/ui/studio') as Record<string, unknown>;
    const values = Object.keys(entry);
    expect(values.filter(name => /^(draw|paint|layoutUi)/u.test(name))).toEqual([]);
    expect(values).not.toContain('UiElement');
    expect(values).not.toContain('uiComponent');
    expect(values).toContain('ui');
  });
});
