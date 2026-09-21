import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { bootstrapContentRegistry, runtimeToolDefinition } from '@orchard/sim';
import { expect, it, vi } from 'vitest';
import { selectedFarmToolAction, selectedItemUseAction, swingKeyIntent } from './selected-item-use.js';

// Execute the production F routing, including both early secondary-use guards:
// fixing only the swing guard still lets direct use swallow the farming action.
const source = ts.createSourceFile('overworld-main.ts', readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
let handler: ts.Block | undefined;
function visit(node: ts.Node) {
  if (ts.isIfStatement(node) && node.expression.getText(source) === "event.code === 'KeyF' && !event.repeat" && ts.isBlock(node.thenStatement)) handler = node.thenStatement;
  ts.forEachChild(node, visit);
}
visit(source);
if (handler === undefined) throw new Error('missing F input handler');
const routing = handler.statements.filter(statement => {
  const text = statement.getText(source);
  return text.startsWith('const swingIntent =') || text.startsWith("if (swingIntent === 'swing')")
    || text.startsWith('if (selectedUseAction !== null && !selectedUseIsMelee')
    || text.startsWith('const farmToolAction =') || text.startsWith('if (farmToolAction !== null)');
}).map(statement => statement.getText(source)).join('\n');
const code = ts.transpileModule(routing, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

it.each(['hoe', 'copper_hoe', 'iron_hoe', 'silver_hoe', 'gold_hoe', 'stone_hoe', 'watering_can'])(
  'routes F for %s to tile work, including restoring soil and uprooting crops', selectedUseKind => {
    const registry = bootstrapContentRegistry();
    const selectedUseDefinition = registry.items.get(`item:${selectedUseKind}`)!;
    expect(selectedUseDefinition).toBeDefined();
    const tile = { tileX: 10, tileY: 12 };
    for (const state of ['grass', 'soil', 'crop'] as const) {
      const performFarmToolAction = vi.fn();
      const secondary = vi.fn();
      const dependencies = {
        snapshot: { content: { registry } }, selectedUseKind, selectedUseDefinition,
        selectedUseAction: selectedItemUseAction(selectedUseDefinition),
        selectedUseIsMelee: false, selectedUseIsContextualWorldTool: false,
        selectedFarmToolAction, swingKeyIntent, runtimeToolDefinition,
        cellarToolAction: null, isVitalsTool: () => true, localMount: () => null,
        targetResource: () => null, targetCellarWall: () => null, targetAnvilRepairReady: () => false,
        performToolAction: secondary, showResult: secondary,
        network: { useSelected: secondary }, event: { preventDefault: vi.fn() },
        ignoreDistantTileToolInput: () => false, targetFarmTile: () => tile,
        cropAtTarget: state === 'crop' ? {} : null, item: selectedUseKind,
        latestSnapshot: { soil: new Map(state === 'grass' ? [] : [['tile', {}]]) },
        farmSoilKey: () => 'tile', activeSpaceDefinition: { spaceId: 0 }, performFarmToolAction,
      };
      new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
      expect(secondary).not.toHaveBeenCalled();
      const watering = selectedUseKind === 'watering_can';
      expect(performFarmToolAction).toHaveBeenCalledExactlyOnceWith(
        tile, selectedUseKind, watering ? 'water' : 'cultivate',
        !watering && state === 'soil' ? 'restore' : 'use',
      );
    }
  },
);
