import { describe, expect, it } from 'vitest';
import { AUTHORED_KIND_HOOKS } from '@orchard/sim';
import { compileLifecycleHookBundle, lifecycleHookBundleSha256, parseLifecycleHookBundle } from './hooks.js';
const bundle = (source = 'context.pass();') => ({ format: 'orchard-lifecycle-source-v2', bundleId: 'test', revision: 1, engineApiVersion: 2,
  handlers: [{ id: 'test', definitionId: 'object:chest', kind: 'object', hook: 'onSpawn', source }] });
describe('v2 lifecycle compiler', () => {
  it('compiles every executable hook pair deterministically with code-free metadata', () => {
    const handlers = Object.entries(AUTHORED_KIND_HOOKS).flatMap(([kind, hooks]) => hooks.map(hook => ({
      id: `${kind}:${hook.toLowerCase()}`, kind, hook, definitionId: `${kind}:test`, source: 'context.pass();',
    }))).sort((a, b) => a.id < b.id ? -1 : 1);
    const parsed = parseLifecycleHookBundle({ ...bundle(), handlers });
    const compiled = compileLifecycleHookBundle(parsed);
    expect(compiled).toEqual(compileLifecycleHookBundle(parsed));
    expect(compiled.serverTypeScript).toContain(lifecycleHookBundleSha256(parsed));
    expect(compiled.clientMetadataJson).not.toContain('context.pass');
  });
  it('rejects hook/API mismatches, duplicates, unsorted ids, unknown fields and source bounds', () => {
    const original = bundle();
    for (const bad of [
      { ...original, handlers: [{ ...original.handlers[0], kind: 'encounter', hook: 'onEncounterStart' }] },
      { ...original, engineApiVersion: 3 }, { ...original, extra: true },
      { ...original, handlers: [...original.handlers, ...original.handlers] },
      { ...original, handlers: [{ ...original.handlers[0], hook: 'onQuestState' }] },
      { ...original, handlers: [{ ...original.handlers[0], definitionId: 'quest:test' }] },
      { ...original, handlers: Array.from({ length: 513 }, () => original.handlers[0]) },
      bundle('a'.repeat(16_385)), bundle('context.pass();\r\n'),
    ]) expect(() => parseLifecycleHookBundle(bad)).toThrow();
  });
  it.each([
    'fetch("https://example.com");', 'while (true) {}',
    '}\nfunction escape() {', 'try { context.pass(); } catch {}',
    'const a = [1]; for (const x of a) { for (const y of a) {} }',
    'const a = [...context.snapshot.nearbyObjects];',
    'const a = [1]; { const a = context.snapshot.nearbyObjects; for (const x of a) {} }',
    'context.emit({madeUp: true} as never);', 'const x = `${context.snapshot.tick}`;',
    'const x = 2n ** 999999999n;', 'context.snapshot.tick = 1n;',
  ])('rejects non-capability or unbounded code: %s', source => {
    expect(() => compileLifecycleHookBundle(parseLifecycleHookBundle(bundle(source)))).toThrow();
  });
  it('typechecks event-specific inputs and emitted effects before producing a candidate', () => {
    expect(() => compileLifecycleHookBundle(parseLifecycleHookBundle(bundle('context.emit({ madeUp: 1 });')))).toThrow('type error');
    expect(() => compileLifecycleHookBundle(parseLifecycleHookBundle(bundle('const x = context.event.questId;')))).toThrow('type error');
  });
  it('rejects string doubling and bigint shifts that defeat AST bounds', () => {
    for (const source of ['const a = \"x\"; const b = a + a;', 'const a = 1n << context.snapshot.tick;']) {
      expect(() => compileLifecycleHookBundle(parseLifecycleHookBundle(bundle(source)))).toThrow('expansion');
    }
  });
  it('hashes source changes and canonicalises input property order', () => {
    const first = parseLifecycleHookBundle(bundle());
    expect(lifecycleHookBundleSha256(first)).not.toBe(lifecycleHookBundleSha256(parseLifecycleHookBundle(bundle('context.block("no");'))));
    expect(lifecycleHookBundleSha256(first)).toBe(lifecycleHookBundleSha256(parseLifecycleHookBundle({ ...bundle(), handlers: bundle().handlers.map(h => ({ source: h.source, hook: h.hook, kind: h.kind, definitionId: h.definitionId, id: h.id })) })));
  });
});
