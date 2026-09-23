import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { processTopologyForObject, settleProcess, processProgressAt, type ProcessAdapter } from './behaviour/handlers/processors.js';
import { projectTiming, type ProcessTimingSource } from './timing.js';
import type { ItemStack } from './item-containers.js';

const registry = bootstrapContentRegistry();
function fixture(adapter: ProcessAdapter): ProcessTimingSource {
  const recipe = [...registry.processes.values()].find(def => def.adapter === adapter)!;
  const object = [...registry.objects.values()].find(def => def.components.processor?.processTag === recipe.stationTag)!;
  const topology = processTopologyForObject(object)!;
  const slots: (ItemStack | null)[] = Array.from({ length: topology.slotCount }, () => null);
  slots[topology.inputSlots[0]!] = { itemKind: recipe.input.item.slice(5), quantity: recipe.input.count * 4 };
  if (recipe.fuelPolicy) slots[topology.fuelSlots[0]!] = { itemKind: recipe.fuelPolicy.acceptedItems[0]!.slice(5), quantity: 8 };
  return { kind: 'process', definitions: [recipe], adapter, durationTicks: 1_200n, startTick: 100n,
    state: { slots, startTick: 100n, lit: true }, options: { topology, ticksPerUnit: 1_200n, minimumBatch: 1, maximumBatch: 100, maxStackForItem: () => 999 } };
}

describe('shared timing projection', () => {
  it.each(['smelting', 'campfire_cooking', 'press', 'fermentation', 'barrel'] as const)('%s shares settlement boundaries and catch-up maths', adapter => {
    const source = fixture(adapter);
    expect(projectTiming(source, 120n)).toMatchObject({ status: 'running', remainingActiveTicks: 1_180n, progress: 1 / 60, nextTransitionTick: 1_300n, confidence: 'exact' });
    for (const now of [1_299n, 1_300n, 1_350n, 2_650n]) {
      const actual = settleProcess(source.definitions, adapter, source.state!, now, source.options);
      const projection = projectTiming(source, now);
      expect(projection.progress).toBe(processProgressAt(actual.startTick ?? source.startTick, now, source.durationTicks));
      expect(projection.status).toBe(actual.completed > 0 ? 'awaiting-settlement' : 'running');
    }
  });

  it('does not claim output from a closed anchor; reopening uses confirmed settlement', () => {
    const source = fixture('smelting');
    const { state, ...closed } = source;
    expect(projectTiming(closed, 130n)).toMatchObject({ confidence: 'estimated', status: 'running' });
    expect(projectTiming(closed, 9_000n)).toMatchObject({ confidence: 'estimated', status: 'awaiting-settlement', reason: 'collect-to-confirm' });
    const settled = settleProcess(source.definitions, source.adapter, state!, 9_000n, source.options);
    expect(projectTiming({ ...source, startTick: settled.startTick, state: settled }, 9_000n)).toMatchObject({ confidence: 'exact', status: 'ready' });
    // A reconnect may supply an older or newer snapshot without preserving a UI clock.
    expect(projectTiming(source, 120n).remainingActiveTicks).toBe(1_180n);
  });

  it('explains input, fuel, blocked output and extinguished fire', () => {
    const source = fixture('smelting'), topology = source.options.topology;
    const missingInput = [...source.state!.slots]; missingInput[topology.inputSlots[0]!] = null;
    expect(projectTiming({ ...source, state: { ...source.state!, slots: missingInput } }, 120n)).toMatchObject({ status: 'idle', reason: 'needs-input' });
    const noFuel = [...source.state!.slots]; noFuel[topology.fuelSlots[0]!] = null;
    expect(projectTiming({ ...source, state: { ...source.state!, slots: noFuel } }, 120n)).toMatchObject({ status: 'blocked', reason: 'no-fuel' });
    const full = [...source.state!.slots]; full[topology.outputSlots[0]!] = { itemKind: 'wrong_output', quantity: 999 };
    expect(projectTiming({ ...source, state: { ...source.state!, slots: full } }, 120n)).toMatchObject({ status: 'blocked', reason: 'output-full' });
    const fire = fixture('campfire_cooking');
    expect(projectTiming({ ...fire, state: { ...fire.state!, lit: false } }, 120n)).toMatchObject({ status: 'blocked', reason: 'fire-out' });
  });

  it('never calls an unsealed barrel input ready output', () => {
    const source = fixture('barrel');
    expect(projectTiming({ ...source, startTick: undefined, state: { ...source.state!, startTick: undefined } }, 120n))
      .toMatchObject({ status: 'idle', reason: 'unsealed', remainingActiveTicks: null });
    expect(projectTiming({ ...source, durationTicks: 0n }, 120n).reason).toBe('invalid-duration');
  });
});
