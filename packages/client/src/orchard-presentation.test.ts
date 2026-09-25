import { expect, it } from 'vitest';
import { bootstrapContentRegistry, AUTHORITY_HZ } from '@orchard/sim';
import { orchardHarvestPrompt } from './orchard-presentation.js';
const registry = bootstrapContentRegistry();
const tree = { kind: 'tree_apple', tileX: 1, tileY: 1, health: 3, depleted: false, growthStage: 3 };
it('explains picking, growth and ripening in the same keyboard/touch prompt', () => {
  expect(orchardHarvestPrompt(registry, tree, 0n)).toBe('[E] PICK APPLE');
  expect(orchardHarvestPrompt(registry, { ...tree, growthStage: 1 }, 0n)).toBeNull();
  expect(orchardHarvestPrompt(registry, { ...tree, depleted: true }, 0n)).toBeNull();
  const ripening = { ...tree, fruitReadyAtTick: BigInt(61 * AUTHORITY_HZ) };
  expect(orchardHarvestPrompt(registry, ripening, 0n)).toBe('FRUIT RIPENING - 1:01');
  expect(orchardHarvestPrompt(registry, ripening, ripening.fruitReadyAtTick)).toBe('[E] PICK APPLE');
  expect(orchardHarvestPrompt(registry, { ...tree, kind: 'tree_oak' }, 0n)).toBeNull();
});
