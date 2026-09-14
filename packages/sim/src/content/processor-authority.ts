import type { ProcessContentDefinition } from './definitions.js';
import {
  runtimeObjectDefinition,
  type ObjectContentReference,
} from './object-capabilities.js';
import type {
  ObjectContentDefinition,
  ObjectProcessorComponent,
} from './object-definition.js';
import type { ContentRegistry } from './registry.js';
import { MAX_PLAYER_STATISTIC_VALUE } from '../player-statistics.js';
import type { SkillTrack } from '../skill-trees.js';

export type RuntimeProcessAdapter = NonNullable<ProcessContentDefinition['adapter']>;

export interface RuntimeObjectProcessor {
  readonly object: ObjectContentDefinition;
  readonly processor: ObjectProcessorComponent;
  readonly adapter: RuntimeProcessAdapter;
  readonly definitions: readonly ProcessContentDefinition[];
}

export interface RuntimeProcessorCompletionStatistic {
  readonly kind: string;
  readonly delta: bigint;
  readonly subject?: string;
}

export interface RuntimeProcessorCompletionRewards {
  readonly experience?: { readonly skill: SkillTrack; readonly amount: bigint };
  readonly statistics: readonly RuntimeProcessorCompletionStatistic[];
}

/**
 * Resolves the sole active processor policy for a durable object reference.
 *
 * Authored processors fail closed unless their object, container, and at least
 * one matching process are active, and every matching active process selects
 * the same temporary engine adapter. Retired process definitions never keep a
 * processor alive or create an ambiguous adapter selection.
 */
export function runtimeObjectProcessor(
  registry: Pick<ContentRegistry, 'objects' | 'processes'>,
  reference: ObjectContentReference,
): RuntimeObjectProcessor | null {
  const object = runtimeObjectDefinition(registry, reference);
  const processor = object?.components.processor;
  if (object === null || processor === undefined || object.components.container === undefined) {
    return null;
  }

  const definitions = [...registry.processes.values()]
    .filter((definition) => (
      definition.retired !== true && definition.stationTag === processor.processTag
    ))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (definitions.length === 0) return null;

  const adapters = new Set(definitions.map((definition) => definition.adapter));
  if (adapters.size !== 1) return null;
  const inputs = definitions.map((definition) => definition.input.item);
  if (new Set(inputs).size !== inputs.length) return null;
  const adapter = definitions[0]?.adapter;
  if (adapter === undefined) return null;

  return { object, processor, adapter, definitions };
}

/** Resolves an active processor input to its authored transparent contents
 * layer. The process edge and input item must both remain active, and duplicate
 * mappings fail closed rather than selecting by definition order. */
export function runtimeProcessorInputContentsAnimation(
  registry: Pick<ContentRegistry, 'items'>,
  runtime: RuntimeObjectProcessor | null,
  inputKind: string | undefined,
): string | null {
  if (runtime?.adapter !== 'press' || inputKind === undefined) return null;
  const item = registry.items.get(`item:${inputKind}`);
  if (item === undefined || item.retired === true) return null;
  let animation: string | null = null;
  for (const definition of runtime.definitions) {
    if (definition.retired === true
      || definition.adapter !== 'press'
      || definition.input.item !== `item:${inputKind}`
      || definition.presentation?.contentsAnimation === undefined) continue;
    if (animation !== null) return null;
    animation = definition.presentation.contentsAnimation;
  }
  return animation;
}

function activeItem(
  registry: Pick<ContentRegistry, 'items'>,
  id: string,
) {
  const definition = registry.items.get(id);
  return definition?.retired === true ? undefined : definition;
}

/**
 * Resolves and preflights every completion side effect before the world writes
 * settled slots. A malformed live registry therefore cannot partially settle
 * a processor and only then discover an invalid reward reference.
 */
export function runtimeProcessorCompletionRewards(
  registry: Pick<ContentRegistry, 'items' | 'objects' | 'processes' | 'skillTrees' | 'statistics'>,
  runtime: RuntimeObjectProcessor,
  definition: ProcessContentDefinition,
  completed: number,
): RuntimeProcessorCompletionRewards | null {
  if (!Number.isSafeInteger(completed) || completed <= 0) return null;
  const object = registry.objects.get(runtime.object.id);
  const activeDefinition = registry.processes.get(definition.id);
  if (object === undefined || object.retired === true
    || activeDefinition === undefined || activeDefinition.retired === true
    || activeDefinition.stationTag !== runtime.processor.processTag
    || activeItem(registry, activeDefinition.input.item) === undefined
    || activeDefinition.outputs.some(({ item }) => activeItem(registry, item) === undefined)) {
    return null;
  }

  const policy = runtime.processor.completionRewards;
  const processExperience = activeDefinition.experience;
  const authoredExperience = processExperience ?? policy?.experience;
  let experience: RuntimeProcessorCompletionRewards['experience'];
  if (authoredExperience !== undefined) {
    const matchingTracks = [...registry.skillTrees.values()].filter((tree) => (
      tree.retired !== true && tree.track === authoredExperience.skill
    ));
    const batchAmount = processExperience === undefined
      ? policy?.experience?.batchAmount ?? 0 : 0;
    const amount = BigInt(authoredExperience.amount) * BigInt(completed) + BigInt(batchAmount);
    if (matchingTracks.length !== 1 || !Number.isSafeInteger(authoredExperience.amount)
      || authoredExperience.amount <= 0 || !Number.isSafeInteger(batchAmount)
      || batchAmount < 0 || amount <= 0n || amount > MAX_PLAYER_STATISTIC_VALUE) return null;
    experience = { skill: matchingTracks[0]!.track, amount };
  }

  const statistics: RuntimeProcessorCompletionStatistic[] = [];
  const projectionKeys = new Set<string>();
  for (const projection of policy?.statistics ?? []) {
    const key = JSON.stringify(projection);
    if (projectionKeys.has(key)) return null;
    projectionKeys.add(key);
    const statistic = registry.statistics.get(projection.statistic);
    if (statistic === undefined || statistic.retired === true || statistic.reserved === true
      || statistic.aggregation !== 'counter') return null;
    const outputReferenced = projection.quantity === 'output' || projection.subject === 'output';
    if (projection.outputTag !== undefined && !outputReferenced) return null;
    const outputs = activeDefinition.outputs.filter(({ item }) => {
      const output = activeItem(registry, item);
      return output !== undefined
        && (projection.outputTag === undefined || output.tags.includes(projection.outputTag));
    });
    if (outputReferenced && outputs.length === 0) return null;
    if (projection.quantity !== 'output' && projection.subject === 'output' && outputs.length !== 1) {
      return null;
    }
    const quantities = projection.quantity === 'output'
      ? outputs.map((output) => ({ count: output.count, output }))
      : [{
        count: projection.quantity === 'input'
          ? activeDefinition.input.count : projection.quantity === 'batch' ? 1 : completed,
        output: outputs[0],
      }];
    for (const { count, output } of quantities) {
      const multiplier = projection.quantity === 'output' || projection.quantity === 'input'
        ? completed : 1;
      const delta = BigInt(count) * BigInt(multiplier);
      const subject = projection.subject === 'input'
        ? activeDefinition.input.item.slice('item:'.length)
        : projection.subject === 'output'
          ? output?.item.slice('item:'.length) ?? '' : '';
      const subjectIsValid = statistic.subject === 'none'
        ? subject === ''
        : ['item_kind', 'crop_kind', 'fish_kind', 'tool_kind'].includes(statistic.subject)
          && subject.trim().length > 0;
      if (delta <= 0n || delta > MAX_PLAYER_STATISTIC_VALUE || !subjectIsValid) return null;
      statistics.push({
        kind: statistic.id.slice('statistic:'.length),
        delta,
        ...(subject === '' ? {} : { subject }),
      });
    }
  }
  return {
    ...(experience === undefined ? {} : { experience }),
    statistics: Object.freeze(statistics),
  };
}
