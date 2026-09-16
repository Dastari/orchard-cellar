import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLifecycleSourceBundle } from './contract.js';

const source = parseLifecycleSourceBundle(JSON.parse(readFileSync(
  new URL('../source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as unknown);
const metadata = JSON.parse(readFileSync(
  new URL('../generated/item-lifecycle-metadata.json', import.meta.url),
  'utf8',
)) as { readonly handlers: readonly {
  readonly itemId: string;
  readonly id: string;
  readonly triggers: readonly string[];
}[] };

const EXPECTED_SOURCE = `if (context.event.type === 'secondary') {
  context.emit({ worldTool: { action: 'swing' } });
} else if (context.event.type === 'useWith') {
  if (context.snapshot.target === undefined || !('entityType' in context.snapshot.target)
    || context.snapshot.target.definitionId !== 'object:anvil') context.pass();
  else {
    const maximum = context.item.snapshot.state?.repairMaximum;
    const material = context.item.snapshot.state?.repairMaterial;
    const cost = context.item.snapshot.state?.repairCostBronze;
    const durability = context.item.snapshot.durability;
    if (typeof maximum !== 'number' || typeof material !== 'string' || typeof cost !== 'number') context.block('wrong_tool');
    else if (durability === undefined || durability >= maximum) context.block('tool_not_damaged');
    else {
      context.player.consumeItem(material);
      context.emit({ chargeBronze: cost });
      context.item.repair();
      context.emit({ statistic: { kind: 'tools_repaired', subject: context.item.snapshot.kind } });
    }
  }
} else context.pass();`;

describe('authored sword lifecycle migration', () => {
  it('owns facing-based swings and anvil repair in one callback', () => {
    const handlers = source.handlers.filter(({ itemId }) => itemId === 'item:sword');
    expect(handlers).toEqual([expect.objectContaining({
      id: 'item:sword.on_use',
      prompt: 'USE SWORD',
      triggers: ['secondary', 'useWith'],
      source: EXPECTED_SOURCE,
    })]);
    expect(metadata.handlers.filter(({ itemId }) => itemId === 'item:sword')).toEqual([{
      itemId: 'item:sword',
      event: 'onUse',
      id: 'item:sword.on_use',
      prompt: 'USE SWORD',
      triggers: ['secondary', 'useWith'],
    }]);
  });
});
