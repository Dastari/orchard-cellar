import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { WorldInteractionRegistry } from './world-interactions.js';

it('routes UI opening and world actions through the same proximity resolver', () => {
  const registry = new WorldInteractionRegistry<{ fruitReady: boolean }>();
  const open = vi.fn(), pick = vi.fn();
  registry.register('repair-panel', () => [{ kind: 'custom-panel', stableId: 'panel:1',
    x: 10, y: 0, reachFixed: 20, prompt: '[E] OPEN', activate: open }]);
  registry.register('tree', state => state.fruitReady ? [{ kind: 'tree', stableId: 'tree:1',
    x: 20, y: 0, reachFixed: 5, prompt: '[E] PICK', activate: pick }] : []);
  expect(registry.resolve({ fruitReady: true }, 0, 0)?.prompt).toBe('[E] OPEN');
  expect(open).not.toHaveBeenCalled();
  const target = registry.resolve({ fruitReady: true }, 19, 0)!;
  expect(target.prompt).toBe('[E] PICK');
  target.activate();
  expect(pick).toHaveBeenCalledOnce();
  registry.resolve({ fruitReady: false }, 19, 0)!.activate();
  expect(open).toHaveBeenCalledOnce();
  expect(registry.resolve({ fruitReady: true }, 100, 0)).toBeNull();
});

it('uses deterministic distance, priority and identity ordering across providers', () => {
  const registry = new WorldInteractionRegistry<void>();
  const action = { x: 1, y: 0, reachFixed: 5, prompt: 'use', activate: vi.fn() };
  registry.register('later', () => [{ ...action, kind: 'new', stableId: 'b' }]);
  const remove = registry.register('earlier', () => [{ ...action, kind: 'new', stableId: 'a' }]);
  expect(registry.resolve(undefined, 0, 0)?.stableId).toBe('a');
  remove(); remove();
  expect(registry.resolve(undefined, 0, 0)?.stableId).toBe('b');
  registry.register('priority', () => [{ ...action, kind: 'new', stableId: 'c', priority: 0 }]);
  expect(registry.resolve(undefined, 0, 0)?.stableId).toBe('c');
  registry.register('closer', () => [{ ...action, x: 0, kind: 'new', stableId: 'd' }]);
  expect(registry.resolve(undefined, 0, 0)?.stableId).toBe('d');
});

it('preserves exclusive dismount and validates registration lifecycle', () => {
  const registry = new WorldInteractionRegistry<void>();
  const provider = () => [{ kind: 'boat', stableId: 'boat:1', x: 2, y: 0,
    prompt: '[E] LEAVE BOAT', activate: vi.fn(), exclusive: true }];
  const remove = registry.register('mount', provider);
  expect(() => registry.register('mount', provider)).toThrow('already registered');
  registry.register('near', () => [{ kind: 'custom', stableId: 'near', x: 0, y: 0,
    prompt: 'open', activate: vi.fn() }]);
  expect(registry.resolve(undefined, 0, 0)?.kind).toBe('boat');
  remove();
  registry.register('mount', provider);
  remove(); // An old disposer cannot remove its replacement.
  expect(registry.resolve(undefined, 0, 0)?.kind).toBe('boat');
});

it.each([-1, NaN, Infinity])('ignores invalid reach %s', reachFixed => {
  const registry = new WorldInteractionRegistry<void>();
  registry.register('invalid', () => [{ kind: 'new', stableId: 'bad', x: 0, y: 0,
    reachFixed, prompt: 'bad', activate: vi.fn() }]);
  expect(registry.resolve(undefined, 0, 0)).toBeNull();
});

it('rejects invalid positions and includes the exact reach boundary', () => {
  const registry = new WorldInteractionRegistry<void>();
  registry.register('point', () => [{ kind: 'new', stableId: 'point', x: 3, y: 4,
    reachFixed: 5, prompt: 'use', activate: vi.fn() }]);
  expect(registry.resolve(undefined, 0, 0)?.stableId).toBe('point');
  expect(registry.resolve(undefined, NaN, 0)).toBeNull();
  const invalid = new WorldInteractionRegistry<void>();
  invalid.register('bad', () => [{ kind: 'new', stableId: 'bad', x: Infinity, y: 0,
    prompt: 'bad', activate: vi.fn() }]);
  expect(invalid.resolve(undefined, 0, 0)).toBeNull();
});

it('uses the production provider and E handler to resolve fresh state before activation', () => {
  const source = ts.createSourceFile('overworld-main.ts',
    readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const registration = source.statements.find(node => ts.isExpressionStatement(node)
    && node.getText(source).startsWith("worldInteractions.register('existing-world-entities'"));
  const selector = source.statements.find(node => ts.isFunctionDeclaration(node)
    && node.name?.text === 'targetInteraction');
  let handler: ts.IfStatement | undefined;
  function visit(node: ts.Node) {
    if (ts.isIfStatement(node) && node.expression.getText(source) === "event.code === 'KeyE' && !event.repeat") handler = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!registration || !selector || !handler) throw new Error('missing production interaction routing');
  const registry = new WorldInteractionRegistry<object>();
  const tree = { kind: 'orchard', stableId: 'tree:1', x: 0, y: 0 };
  let targets = [tree];
  const activate = vi.fn();
  const open = vi.fn();
  const snapshot = {};
  const dependencies = {
    worldInteractions: registry, collectLegacyInteractions: () => targets,
    localMount: () => null, interactionPrompt: () => '[E] PICK APPLE', activateInteraction: activate,
    predicted: { position: { x: 0, y: 0 } }, latestSnapshot: snapshot,
    event: { code: 'KeyE', repeat: false, preventDefault: vi.fn() },
    network: { ownPosition: () => null },
  };
  const run = (body: string) => new Function(...Object.keys(dependencies), ts.transpileModule(body,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(dependencies));
  run(registration.getText(source));
  expect(registry.resolve(snapshot, 0, 0)?.prompt).toBe('[E] PICK APPLE');
  run(`${selector.getText(source)}\n${handler.getText(source)}`);
  expect(activate).toHaveBeenCalledWith(tree, snapshot);
  targets = [];
  registry.register('new-ui', () => [{ kind: 'new-ui', stableId: 'panel:1', x: 0, y: 0,
    reachFixed: 10, prompt: '[E] OPEN', activate: open }]);
  run(`${selector.getText(source)}\n${handler.getText(source)}`);
  expect(open).toHaveBeenCalledOnce();
  expect(activate).toHaveBeenCalledOnce();
});
