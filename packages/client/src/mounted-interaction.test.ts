import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { bootstrapContentRegistry, runtimeNpcMount, isMountWithinReach, TILE_SIZE_FIXED } from '@orchard/sim';

it.each(['horse', 'boat'])('makes E dismount a ridden %s before selecting the homestead portal', kind => {
  const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'targetInteraction');
  if (declaration === undefined) throw new Error('missing production interaction target selector');
  const code = ts.transpileModule(declaration.getText(source) + '\nreturn targetInteraction;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mount = { id: 90001n, kind, x: 100, y: 100 };
  // No other candidate dependencies are supplied: mounted interaction must
  // resolve before inspecting portals, merchants, chests or other players.
  const target = new Function('predicted', 'localMount', 'runtimeNpcMount', code)(
    { position: { x: 100, y: 100 } }, () => mount, runtimeNpcMount,
  );
  expect(target({ content: { registry: bootstrapContentRegistry() } })).toEqual({
    kind, x: 100, y: 100, stableId: `${kind}:90001`, npc: mount,
  });
});


it('does not offer E for a horse twenty tiles away, but offers it within two tiles', () => {
  const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'targetHorse');
  if (declaration === undefined) throw new Error('missing production horse target selector');
  const code = ts.transpileModule(declaration.getText(source) + '\nreturn targetHorse;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const target = new Function('predicted', 'localMount', 'runtimeNpcMount', 'isMountWithinReach', code)(
    { position: { x: 0, y: 0 } }, () => null, runtimeNpcMount, isMountWithinReach,
  );
  const horse = { id: 90001n, kind: 'horse', x: 20 * TILE_SIZE_FIXED, y: 0 };
  const snapshot = { content: { registry: bootstrapContentRegistry() }, npcs: [horse] };
  expect(target(snapshot)).toBeNull();
  horse.x = 2 * TILE_SIZE_FIXED;
  expect(target(snapshot)).toBe(horse);
  horse.x += 1;
  expect(target(snapshot)).toBeNull();
});

it.each(['axe', 'sword', 'pickaxe', 'hoe'])('sends a targetless F swing for %s', async selectedUseKind => {
  const sim = await import('@orchard/sim');
  const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  let branch: ts.IfStatement | undefined;
  function visit(node: ts.Node) {
    if (ts.isIfStatement(node) && node.expression.getText(source).includes('runtimeToolDefinition(snapshot.content.registry, selectedUseKind)?.swing')) branch = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!branch) throw new Error('missing targetless swing input branch');
  const calls: unknown[][] = [];
  const code = ts.transpileModule(branch.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies = { selectedUseKind, snapshot: { content: { registry: sim.bootstrapContentRegistry() } },
    runtimeToolDefinition: sim.runtimeToolDefinition,
    performToolAction: (action: () => void) => action(),
    network: { useSelected: (...args: unknown[]) => calls.push(args) },
    event: { preventDefault: () => undefined },
  };
  new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  expect(calls).toEqual([['secondary']]);
});

it('retains explicit left-click cellar excavation independently of F swings', () => {
  const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  let branch: ts.IfStatement | undefined;
  function visit(node: ts.Node) {
    if (ts.isIfStatement(node) && node.expression.getText(source).includes('cellarAction !== null')) branch = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!branch) throw new Error('missing explicit cellar input branch');
  const calls: unknown[][] = [];
  const dependencies = {
    event: { button: 0, preventDefault: () => undefined }, worldPointerAvailable: true,
    cellarAction: { actionId: 'dig_cellar' }, latestSnapshot: {}, localMount: () => null,
    targetCellarWall: () => ({ tileX: 2, tileY: 3 }), farmItem: 'pickaxe',
    performToolAction: (action: () => void) => { action(); return true; },
    network: { useSelected: (...args: unknown[]) => calls.push(args) }, facePredictedTowardTile: () => undefined,
  };
  const code = ts.transpileModule(branch.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  expect(calls).toEqual([['use_at', { tileX: 2, tileY: 3, actionId: 'dig_cellar' }]]);
});
