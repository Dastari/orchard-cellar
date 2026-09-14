import { bootstrapContentRegistry, runtimeObjectProcessor } from '@orchard/sim';
import { describe, expect, it } from 'vitest';

import { fruitPressContentsAnimation } from './fruit-press-presentation.js';

const registry = bootstrapContentRegistry();
const pressRuntime = runtimeObjectProcessor(registry, { kind: 'fruit_press' });

describe('fruit press contents', () => {
  it.each(['apple', 'cherry', 'grape', 'peach', 'pear'])(
    'shows the public authored %s processing input to every observer', (fruit) => {
      expect(fruitPressContentsAnimation(registry, {
        kind: 'fruit_press', processStartTick: 0n, processInputKind: fruit,
      }, undefined, pressRuntime)).toBe(`contents_${fruit}`);
    },
  );

  it('uses the active batch ahead of an independently observed container slot', () => {
    expect(fruitPressContentsAnimation(registry, {
      kind: 'fruit_press', processStartTick: 9n, processInputKind: 'grape',
    }, { itemKind: 'apple', quantity: 3 }, pressRuntime)).toBe('contents_grape');
  });

  it('follows authored process metadata across object and input renames', () => {
    const apple = registry.items.get('item:apple')!;
    const process = registry.processes.get('process:press_apple')!;
    const moonBerry = { ...apple, id: 'item:moon_berry' as const };
    const moonProcess = {
      ...process,
      id: 'process:press_moon_berry' as const,
      input: { ...process.input, item: moonBerry.id },
      presentation: { contentsAnimation: 'contents_grape' },
    };
    const items = new Map(registry.items);
    items.set(moonBerry.id, moonBerry);
    const processes = new Map(registry.processes);
    processes.set(moonProcess.id, moonProcess);
    const custom = { ...registry, items, processes };
    const runtime = runtimeObjectProcessor(custom, {
      kind: 'moon_squeezer', definitionId: 'object:fruit_press',
    });

    expect(fruitPressContentsAnimation(custom, {
      kind: 'moon_squeezer', processStartTick: 9n, processInputKind: 'moon_berry',
    }, undefined, runtime)).toBe('contents_grape');
  });

  it('previews a loaded idle input and clears after emptying or completing', () => {
    const press = { kind: 'fruit_press' };
    expect(fruitPressContentsAnimation(
      registry, press, { itemKind: 'pear', quantity: 2 }, pressRuntime,
    )).toBe('contents_pear');
    expect(fruitPressContentsAnimation(
      registry, press, { itemKind: 'pear', quantity: 0 }, pressRuntime,
    )).toBeUndefined();
    expect(fruitPressContentsAnimation(
      registry, { ...press, processInputKind: 'pear' }, undefined, pressRuntime,
    )).toBeUndefined();
    expect(fruitPressContentsAnimation(registry, press, undefined, pressRuntime)).toBeUndefined();
  });

  it('rejects unknown or retired inputs, retired processes, and other stations', () => {
    expect(fruitPressContentsAnimation(registry, {
      kind: 'fruit_press', processStartTick: 1n, processInputKind: 'missing_fruit',
    }, undefined, pressRuntime)).toBeUndefined();

    const pear = registry.items.get('item:pear')!;
    const retiredItems = new Map(registry.items);
    retiredItems.set(pear.id, { ...pear, retired: true });
    expect(fruitPressContentsAnimation({ items: retiredItems }, {
      kind: 'fruit_press', processStartTick: 1n, processInputKind: 'pear',
    }, undefined, pressRuntime)).toBeUndefined();

    const retiredProcesses = new Map([...registry.processes].map(([id, definition]) => [
      id,
      id === 'process:press_pear' ? { ...definition, retired: true as const } : definition,
    ]));
    const retiredRuntime = runtimeObjectProcessor(
      { ...registry, processes: retiredProcesses }, { kind: 'fruit_press' },
    );
    expect(fruitPressContentsAnimation(registry, {
      kind: 'fruit_press', processStartTick: 1n, processInputKind: 'pear',
    }, undefined, retiredRuntime)).toBeUndefined();

    const barrelRuntime = runtimeObjectProcessor(registry, { kind: 'barrel' });
    expect(fruitPressContentsAnimation(registry, {
      kind: 'barrel', processStartTick: 1n, processInputKind: 'apple',
    }, undefined, barrelRuntime)).toBeUndefined();
  });
});
