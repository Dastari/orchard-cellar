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

describe('authored fishing-rod lifecycle migration', () => {
  it('owns casting, reeling, and anvil repair in one callback without database access', () => {
    const handlers = source.handlers.filter(({ itemId }) => itemId === 'item:fishing_rod');
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toEqual(expect.objectContaining({
      id: 'item:fishing_rod.on_use',
      prompt: 'FISH',
      triggers: ['useWith', 'useAt'],
    }));
    expect(handlers[0]?.source).toContain("context.event.actionId === 'cast'");
    expect(handlers[0]?.source).toContain("fishing: { action: 'cast', poolId: context.event.targetId, at: targetTile }");
    expect(handlers[0]?.source).toContain("fishing: { action: 'reel' }");
    expect(handlers[0]?.source).toContain("target.definitionId !== 'object:anvil'");
    expect(handlers[0]?.source).toContain("context.item.applyEffect('repair_selected')");
    expect(handlers[0]?.source).not.toMatch(/ctx\.|\.db\./u);
  });

  it('publishes only the bounded useWith and useAt capabilities to clients', () => {
    expect(metadata.handlers.filter(({ itemId }) => itemId === 'item:fishing_rod')).toEqual([{
      itemId: 'item:fishing_rod',
      event: 'onUse',
      id: 'item:fishing_rod.on_use',
      prompt: 'FISH',
      triggers: ['useWith', 'useAt'],
    }]);
  });
});
