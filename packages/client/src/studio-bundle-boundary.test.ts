import { build, type Plugin } from 'vite';
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
  it('allows the small shared icon manifest and text editing model', async () => {
    await expect(buildFixture([
      'packages/ui/src/kit/skin/lucide.ts',
      'packages/ui/src/kit/runtime/text-editor.ts',
      'packages/ui/src/overworld-ui.ts',
    ])).resolves.toBeDefined();
  });

  it.each([
    'packages/studio/src/shell/app.ts',
    'packages/ui/src/studio-entry.ts',
    'packages/ui/src/kit/components/workbench.ts',
    'packages/ui/src/kit/lab/registry.ts',
    'packages/ui/src/kit/runtime/root.ts',
  ])('rejects emitted Studio dependency %s', async target => {
    await expect(buildFixture([target])).rejects.toThrow('Studio modules leaked into the game build');
  });

  it('also rejects Studio code split into a dynamically imported chunk', async () => {
    await expect(buildFixture(['packages/ui/src/kit/lab/world.ts'], true))
      .rejects.toThrow('packages/ui/src/kit/lab/world.ts');
  });
});
