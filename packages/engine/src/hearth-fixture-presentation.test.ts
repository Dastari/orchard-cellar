import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, parseObjectDefinition } from '@orchard/sim';

import { resolveHearthFixtureRenderer } from './hearth-fixture-presentation.js';

describe('authored hearth fixture presentation', () => {
  it.each([
    ['object:workbench', 'station.workbench', 'workbench'],
    ['object:anvil', 'station.anvil', 'anvil'],
    ['object:chest', 'container.chest', 'chest'],
  ] as const)('keeps the %s primitive across an arbitrary definition rename', (
    definitionId,
    tag,
    renderer,
  ) => {
    const base = bootstrapContentRegistry();
    const canonical = base.objects.get(definitionId)!;
    const renamed = parseObjectDefinition({
      ...canonical,
      id: `object:moon_${renderer}`,
    });
    const objects = new Map(base.objects);
    objects.delete(definitionId);
    objects.set(renamed.id, renamed);

    expect(resolveHearthFixtureRenderer({ objects, items: base.items }, tag)).toBe(renderer);
  });

  it('fails neutral for missing, retired, ambiguous, and unknown roles', () => {
    const base = bootstrapContentRegistry();
    const chest = base.objects.get('object:chest')!;
    const objects = new Map(base.objects);
    objects.set(chest.id, { ...chest, retired: true });
    expect(resolveHearthFixtureRenderer({ objects, items: base.items }, 'container.chest')).toBeNull();
    expect(resolveHearthFixtureRenderer({ objects: new Map(), items: base.items }, 'station.workbench')).toBeNull();
    expect(resolveHearthFixtureRenderer(base, 'unknown.fixture')).toBeNull();

    const workbenchItem = base.items.get('item:workbench')!;
    const retiredItems = new Map(base.items);
    retiredItems.set(workbenchItem.id, { ...workbenchItem, retired: true });
    expect(resolveHearthFixtureRenderer({ objects: base.objects, items: retiredItems }, 'station.workbench'))
      .toBeNull();

    const duplicate = parseObjectDefinition({ ...chest, id: 'object:moon_chest' });
    const ambiguous = new Map(base.objects);
    ambiguous.set(duplicate.id, duplicate);
    expect(resolveHearthFixtureRenderer({ objects: ambiguous, items: base.items }, 'container.chest')).toBeNull();
  });
});
