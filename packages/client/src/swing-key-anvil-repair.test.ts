import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { selectedCellarToolAction, selectedFarmToolAction, swingKeyIntent } from './selected-item-use.js';

/** The swing-key intent statement and the swing branch it guards, read from
 * the production handler so the routing under test is the shipped one. */
function swingKeyStatements(source: ts.SourceFile) {
  const cellarCandidates: ts.Statement[] = [];
  let intent: ts.Statement | undefined;
  let swing: ts.IfStatement | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableStatement(node)) {
      const text = node.getText(source);
      if (text.includes('swingKeyIntent({')) intent = node;
      if (text.startsWith('const cellarToolAction = selectedCellarToolAction(selectedUseDefinition)')) {
        cellarCandidates.push(node);
      }
    }
    if (ts.isIfStatement(node) && node.expression.getText(source).includes("swingIntent === 'swing'")) swing = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  const cellar = intent === undefined ? undefined
    : cellarCandidates.filter(candidate => candidate.getStart(source) < intent!.getStart(source)).pop();
  if (cellar === undefined || intent === undefined || swing === undefined) throw new Error('missing swing key intent');
  return { lookups: [cellar, intent].map(statement => statement.getText(source)).join('\n'), swing: swing.getText(source) };
}

it.each(['pickaxe', 'axe', 'hoe'])('repairs a damaged %s at a faced anvil instead of swinging it', async selectedUseKind => {
  const sim = await import('@orchard/sim');
  const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const { lookups, swing } = swingKeyStatements(source);
  const registry = sim.bootstrapContentRegistry();
  const calls: unknown[][] = [];
  const run = (anvilRepairReady: boolean, body: string) => {
    const dependencies = {
      selectedUseKind,
      selectedUseDefinition: registry.items.get(`item:${selectedUseKind}`),
      snapshot: { content: { registry } },
      runtimeToolDefinition: sim.runtimeToolDefinition,
      selectedCellarToolAction, selectedFarmToolAction, swingKeyIntent,
      targetResource: () => null, targetCellarWall: () => null,
      targetAnvilRepairReady: () => anvilRepairReady,
      isVitalsTool: () => true, localMount: () => null,
      performToolAction: (action: () => void) => action(),
      network: { useSelected: (...args: unknown[]) => calls.push(args) },
      event: { preventDefault: () => undefined },
    };
    return new Function(...Object.keys(dependencies),
      ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    )(...Object.values(dependencies));
  };
  // The faced anvil owns F: no swing is sent, so the explicit anvil branch below runs.
  expect(run(true, `${lookups}\nreturn swingIntent;`)).toBe('repair');
  run(true, `${lookups}\n${swing}`);
  expect(calls).toEqual([]);
  // Without an anvil, the hoe works soil; axes and picks still swing.
  expect(run(false, `${lookups}\nreturn swingIntent;`)).toBe(selectedUseKind === 'hoe' ? 'contextual' : 'swing');
  run(false, `${lookups}\n${swing}`);
  expect(calls).toEqual(selectedUseKind === 'hoe' ? [] : [['secondary']]);
});

it('dispatches the anvil use_with branch after the swing intent yields', () => {
  const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');
  const handler = source.slice(
    source.indexOf("if (event.code === 'KeyF' && !event.repeat) {"),
    source.indexOf("if (event.code === 'KeyR' && !event.repeat) {"),
  );
  const swing = handler.indexOf("swingIntent === 'swing'");
  const anvil = handler.indexOf("objectHasAuthoredTag(snapshot.content.registry, actionPlaceable, 'station.anvil')");
  expect(swing).toBeGreaterThan(-1);
  expect(anvil).toBeGreaterThan(swing);
  expect(handler.slice(anvil)).toContain("network.useSelected('use_with', { targetKind: 'placeable', entityId: actionPlaceable.id }), 'TOOL REPAIRED'");
});
