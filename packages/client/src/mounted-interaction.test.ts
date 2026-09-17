import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { bootstrapContentRegistry, runtimeNpcMount, isMountWithinReach, TILE_SIZE_FIXED } from '@orchard/sim';
import { selectedCellarToolAction, swingKeyIntent } from './selected-item-use.js';

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

/** Reads the production swing-key routing: the tool/cellar lookups it decides
 * from, and each branch it dispatches. */
function swingKeyHandler(source: ts.SourceFile) {
  const cellarCandidates: ts.Statement[] = [];
  let intent: ts.Statement | undefined;
  let swing: ts.IfStatement | undefined;
  let dig: ts.IfStatement | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableStatement(node)) {
      const text = node.getText(source);
      if (text.includes('swingKeyIntent({')) intent = node;
      if (text.startsWith('const cellarToolAction = selectedCellarToolAction(selectedUseDefinition)')) {
        cellarCandidates.push(node);
      }
    }
    if (ts.isIfStatement(node)) {
      const test = node.expression.getText(source);
      if (test.includes("swingIntent === 'swing'")) swing = node;
      if (test.includes("swingIntent === 'dig_cellar'")) dig = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const cellar = intent === undefined ? undefined
    : cellarCandidates.filter(candidate => candidate.getStart(source) < intent!.getStart(source)).pop();
  if (cellar === undefined || intent === undefined || swing === undefined || dig === undefined) {
    throw new Error('missing swing key intent branches');
  }
  return { statements: [cellar, intent], swing, dig };
}

it.each(['axe', 'sword', 'pickaxe', 'hoe'])('sends a targetless F swing for %s', async selectedUseKind => {
  const sim = await import('@orchard/sim');
  const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const { statements, swing } = swingKeyHandler(source);
  const registry = sim.bootstrapContentRegistry();
  const calls: unknown[][] = [];
  const dependencies = {
    selectedUseKind,
    selectedUseDefinition: registry.items.get(`item:${selectedUseKind}`),
    snapshot: { content: { registry } },
    runtimeToolDefinition: sim.runtimeToolDefinition,
    selectedCellarToolAction, swingKeyIntent,
    targetResource: () => null, targetCellarWall: () => null, targetAnvilRepairReady: () => false,
    isVitalsTool: () => true, localMount: () => null,
    performToolAction: (action: () => void) => action(),
    network: { useSelected: (...args: unknown[]) => calls.push(args) },
    event: { preventDefault: () => undefined },
  };
  const lookups = statements.map(statement => statement.getText(source)).join('\n');
  const run = (body: string) => new Function(...Object.keys(dependencies),
    ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
  )(...Object.values(dependencies));
  expect(run(`${lookups}\nreturn swingIntent;`)).toBe('swing');
  run(`${lookups}\n${swing.getText(source)}`);
  expect(calls).toEqual([['secondary']]);
});

it('strikes a cellar wall with F, which a terrain-blind swing cannot do', async () => {
  const sim = await import('@orchard/sim');
  const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const { statements, dig } = swingKeyHandler(source);
  const registry = sim.bootstrapContentRegistry();
  const calls: unknown[][] = [];
  const faced: unknown[] = [];
  const dependencies = {
    selectedUseKind: 'pickaxe',
    selectedUseDefinition: registry.items.get('item:pickaxe'),
    snapshot: { content: { registry } },
    runtimeToolDefinition: sim.runtimeToolDefinition,
    selectedCellarToolAction, swingKeyIntent,
    targetResource: () => null, targetCellarWall: () => ({ tileX: 4, tileY: 9 }), targetAnvilRepairReady: () => false,
    isVitalsTool: () => true, localMount: () => null,
    performToolAction: (action: () => void) => { action(); return true; },
    facePredictedTowardTile: (tile: unknown) => faced.push(tile),
    network: { useSelected: (...args: unknown[]) => calls.push(args) },
    event: { preventDefault: () => undefined },
  };
  const lookups = statements.map(statement => statement.getText(source)).join('\n');
  const run = (body: string) => new Function(...Object.keys(dependencies),
    ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
  )(...Object.values(dependencies));
  expect(run(`${lookups}\nreturn swingIntent;`)).toBe('dig_cellar');
  run(`${lookups}\n${dig.getText(source)}`);
  expect(calls).toEqual([['use_at', { tileX: 4, tileY: 9, actionId: 'dig_cellar' }]]);
  expect(faced).toEqual([{ tileX: 4, tileY: 9 }]);
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
    targetCellarWall: () => ({ tileX: 2, tileY: 3 }), targetAnvilRepairReady: () => false, farmItem: 'pickaxe',
    performToolAction: (action: () => void) => { action(); return true; },
    network: { useSelected: (...args: unknown[]) => calls.push(args) }, facePredictedTowardTile: () => undefined,
  };
  const code = ts.transpileModule(branch.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  expect(calls).toEqual([['use_at', { tileX: 2, tileY: 3, actionId: 'dig_cellar' }]]);
});
