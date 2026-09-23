import { build, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clientStudioBoundary } from '../vite.config.js';

async function buildFixture(targets: readonly string[], dynamic = false) {
  const entry = '/fixture/packages/client/src/main.ts';
  const modules = new Map(targets.map((target, index) => [
    `/fixture/${target}`, `export const value = ${index}; console.log(value);`,
  ]));
  modules.set(entry, [...modules.keys()].map(id => dynamic
    ? `void import(${JSON.stringify(id)});`
    : `import ${JSON.stringify(id)};`).join('\n'));
  const fixtures: Plugin = {
    name: 'studio-boundary-fixtures',
    resolveId(id) { return modules.has(id) ? id : null; },
    load(id) { return modules.get(id) ?? null; },
  };
  return await build({
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [fixtures, clientStudioBoundary()],
    build: { write: false, minify: false, rolldownOptions: { input: entry } },
  });
}

describe('independent game bundle', () => {
  it('builds the actual retained game entry without Studio or lab dependencies', async () => {
    await expect(build({
      configFile: false, publicDir: false, logLevel: 'silent',
      plugins: [clientStudioBoundary()],
      build: { write: false, minify: false, lib: {
        entry: fileURLToPath(new URL('../../ui/src/game-entry.ts', import.meta.url)),
        formats: ['es'], fileName: 'game-ui',
      } },
    })).resolves.toBeDefined();
  });

  it('allows concrete production kit components and their shared runtime', async () => {
    await expect(buildFixture([
      'packages/ui/src/kit/skin/lucide.ts',
      'packages/ui/src/kit/runtime/text-editor.ts',
      'packages/ui/src/kit/components/timing-canvas.ts',
      'packages/ui/src/kit/skin/contrast.ts',
      'packages/ui/src/kit/skin/faces.ts',
      'packages/ui/src/overworld-ui.ts',
      'packages/ui/src/game-entry.ts',
      'packages/ui/src/kit/runtime/root.ts',
      'packages/ui/src/kit/runtime/input.ts',
      'packages/ui/src/kit/components/content-frame.ts',
      'packages/ui/src/kit/components/character-name.ts',
      'packages/ui/src/kit/layout/arrange.ts',
      'packages/ui/src/kit/tokens.ts',
    ])).resolves.toBeDefined();
  });

  it.each([
    'packages/studio/src/shell/app.ts',
    'packages/ui/src/studio-entry.ts',
    'packages/ui/src/kit/components/workbench.ts',
    'packages/ui/src/kit/lab/registry.ts',
    'packages/ui/src/kit/components/game-surface.ts',
    'packages/ui/src/kit/components/reference-picker.ts',
    'packages/ui/src/kit/components/index.ts',
    'packages/ui/src/kit/runtime/frame-designer.ts',
    'packages/ui/src/kit/index.ts',
  ])('rejects emitted Studio dependency %s', async target => {
    await expect(buildFixture([target])).rejects.toThrow('Studio modules leaked into the game build');
  });

  it('also rejects Studio code split into a dynamically imported chunk', async () => {
    await expect(buildFixture(['packages/ui/src/kit/lab/world.ts'], true))
      .rejects.toThrow('packages/ui/src/kit/lab/world.ts');
  });
});
