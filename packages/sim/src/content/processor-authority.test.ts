import { describe, expect, it } from 'vitest';

import { bootstrapContentDefinitions, bootstrapContentRegistry } from './bootstrap-registry.js';
import { parseProcessDefinition } from './definitions.js';
import { buildContentRegistry } from './registry.js';
import {
  runtimeProcessorCompletionRewards,
  runtimeObjectProcessor,
  runtimeProcessorInputContentsAnimation,
} from './processor-authority.js';

describe('active authored processor authority', () => {
  it('resolves an arbitrary durable definition id independently of its runtime kind', () => {
    const base = bootstrapContentRegistry();
    const canonical = base.objects.get('object:fruit_press')!;
    const renamed = { ...canonical, id: 'object:moon_press' as const };
    const registry = {
      objects: new Map([[renamed.id, renamed]]),
      processes: base.processes,
    };

    const runtime = runtimeObjectProcessor(registry, {
      kind: 'renamed_runtime_kind',
      definitionId: renamed.id,
    });

    expect(runtime).toMatchObject({
      object: { id: renamed.id },
      processor: { processTag: 'station.press' },
      adapter: 'press',
    });
    expect(runtime?.definitions.length).toBeGreaterThan(0);
    expect(runtime?.definitions.every((definition) => definition.retired !== true)).toBe(true);
  });

  it('fails closed for missing and retired object definitions', () => {
    const base = bootstrapContentRegistry();
    const canonical = base.objects.get('object:fruit_press')!;
    const retired = { ...canonical, retired: true as const };
    const registry = {
      objects: new Map([[retired.id, retired]]),
      processes: base.processes,
    };

    expect(runtimeObjectProcessor(registry, {
      kind: 'fruit_press', definitionId: 'object:missing',
    })).toBeNull();
    expect(runtimeObjectProcessor(registry, {
      kind: 'fruit_press', definitionId: retired.id,
    })).toBeNull();
  });

  it('requires at least one active process and one unique active adapter', () => {
    const base = bootstrapContentRegistry();
    const object = base.objects.get('object:fruit_press')!;
    const pressProcesses = [...base.processes.values()]
      .filter((definition) => definition.stationTag === 'station.press');
    const retiredProcesses = new Map(pressProcesses.map((definition) => [
      definition.id, { ...definition, retired: true as const },
    ]));
    const objects = new Map([[object.id, object]]);

    expect(runtimeObjectProcessor({ objects, processes: retiredProcesses }, {
      kind: 'fruit_press', definitionId: object.id,
    })).toBeNull();

    const active = pressProcesses[0]!;
    const conflicting = {
      ...active,
      id: 'process:moon_press_conflict' as const,
      adapter: 'fermentation' as const,
    };
    expect(runtimeObjectProcessor({
      objects,
      processes: new Map([[active.id, active], [conflicting.id, conflicting]]),
    }, {
      kind: 'fruit_press', definitionId: object.id,
    })).toBeNull();

    const retiredConflict = { ...conflicting, retired: true as const };
    expect(runtimeObjectProcessor({
      objects,
      processes: new Map([[active.id, active], [retiredConflict.id, retiredConflict]]),
    }, {
      kind: 'fruit_press', definitionId: object.id,
    })?.adapter).toBe('press');
  });

  it('resolves processor contents from active authored process and item metadata', () => {
    const base = bootstrapContentRegistry();
    const runtime = runtimeObjectProcessor(base, { kind: 'fruit_press' });
    expect(runtimeProcessorInputContentsAnimation(base, runtime, 'apple')).toBe('contents_apple');
    expect(runtimeProcessorInputContentsAnimation(base, runtime, 'pear')).toBe('contents_pear');
    expect(runtimeProcessorInputContentsAnimation(base, runtime, 'wood')).toBeNull();

    const pear = base.items.get('item:pear')!;
    const items = new Map(base.items);
    items.set(pear.id, { ...pear, retired: true });
    expect(runtimeProcessorInputContentsAnimation({ items }, runtime, 'pear')).toBeNull();

    const duplicate = {
      ...base.processes.get('process:press_pear')!,
      id: 'process:press_pear_duplicate' as const,
    };
    expect(runtimeProcessorInputContentsAnimation(base, {
      ...runtime!, definitions: [...runtime!.definitions, duplicate],
    }, 'pear')).toBeNull();
  });

  it('rejects invalid authored processor contents animation references', () => {
    const process = bootstrapContentRegistry().processes.get('process:press_apple')!;
    expect(() => parseProcessDefinition({
      ...process,
      presentation: { contentsAnimation: '../contents_apple' },
    })).toThrow('$.presentation.contentsAnimation');
  });

  it('validates process experience against one active authored skill track', () => {
    const definitions = bootstrapContentDefinitions();
    const process = definitions.find((definition) => (
      definition.kind === 'process' && definition.id === 'process:press_apple'
    ))!;
    if (process.kind !== 'process') throw new Error('missing process fixture');
    const invalid = { ...process, experience: { skill: 'mooncraft', amount: 4 } };
    const build = buildContentRegistry([
      ...definitions.filter(({ id }) => id !== process.id), invalid,
    ].map((definition) => ({ id: definition.id, kind: definition.kind, json: definition })));
    expect(build.report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'unresolved_reference', definitionId: process.id, path: 'experience.skill',
      }),
    ]));
  });

  it('projects arbitrary renamed inputs, outputs, and stations from authored rewards', () => {
    const base = bootstrapContentRegistry();
    const apple = base.items.get('item:apple')!;
    const bottles = base.items.get('item:bottles')!;
    const object = base.objects.get('object:fruit_press')!;
    const moonfruit = { ...apple, id: 'item:moonfruit' as const, displayName: 'Moonfruit' };
    const moonflask = { ...bottles, id: 'item:moonflask' as const, displayName: 'Moon Flask' };
    const process = {
      id: 'process:distill_moonfruit' as const, kind: 'process' as const, schemaVersion: 1 as const,
      stationTag: 'station.moonstill', input: { item: moonfruit.id, count: 2 },
      outputs: [{ item: moonflask.id, count: 3 }], ticksPerUnit: 9,
      experience: { skill: 'explorer', amount: 7 }, adapter: 'press' as const,
    };
    const renamedObject = {
      ...object,
      id: 'object:moonstill' as const,
      components: {
        ...object.components,
        processor: {
          ...object.components.processor!, processTag: process.stationTag,
          completionRewards: {
            experience: { skill: 'farming', amount: 99 },
            statistics: [
              { statistic: 'statistic:fruit_pressed' as const, quantity: 'input' as const, subject: 'input' as const },
              { statistic: 'statistic:press_cycles_completed' as const, quantity: 'units' as const },
              { statistic: 'statistic:items_obtained' as const, quantity: 'output' as const, subject: 'output' as const },
            ],
          },
        },
      },
    };
    const registry = {
      ...base,
      items: new Map([...base.items, [moonfruit.id, moonfruit], [moonflask.id, moonflask]]),
      objects: new Map([[renamedObject.id, renamedObject]]),
      processes: new Map([[process.id, process]]),
    };
    const runtime = runtimeObjectProcessor(registry, {
      kind: 'unrelated_runtime_kind', definitionId: renamedObject.id,
    })!;

    expect(runtimeProcessorCompletionRewards(registry, runtime, process, 4)).toEqual({
      experience: { skill: 'explorer', amount: 28n },
      statistics: [
        { kind: 'fruit_pressed', delta: 8n, subject: 'moonfruit' },
        { kind: 'press_cycles_completed', delta: 4n },
        { kind: 'items_obtained', delta: 12n, subject: 'moonflask' },
      ],
    });
  });

  it('fails reward preflight for missing, retired, and ambiguous references', () => {
    const base = bootstrapContentRegistry();
    const runtime = runtimeObjectProcessor(base, { kind: 'fruit_press' })!;
    const process = base.processes.get('process:press_apple')!;
    const fruitPressed = base.statistics.get('statistic:fruit_pressed')!;
    const missingStatistic = {
      ...base,
      statistics: new Map([...base.statistics].filter(([id]) => id !== fruitPressed.id)),
    };
    expect(runtimeProcessorCompletionRewards(missingStatistic, runtime, process, 1)).toBeNull();

    const retiredStatistic = {
      ...base,
      statistics: new Map(base.statistics).set(fruitPressed.id, { ...fruitPressed, retired: true }),
    };
    expect(runtimeProcessorCompletionRewards(retiredStatistic, runtime, process, 1)).toBeNull();

    const missingOutput = {
      ...base,
      items: new Map([...base.items].filter(([id]) => id !== process.outputs[0]!.item)),
    };
    expect(runtimeProcessorCompletionRewards(missingOutput, runtime, process, 1)).toBeNull();

    const ambiguousRuntime = {
      ...runtime,
      processor: {
        ...runtime.processor,
        completionRewards: {
          statistics: [{
            statistic: 'statistic:items_obtained' as const,
            quantity: 'units' as const,
            subject: 'output' as const,
          }],
        },
      },
    };
    expect(runtimeProcessorCompletionRewards(base, ambiguousRuntime, process, 1)).toBeNull();
  });
});
