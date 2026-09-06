import { readFileSync } from 'node:fs';
import { AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS } from '@orchard/lifecycle-authoring/generated';
import {
  LIFECYCLE_EVENT_TYPES,
  bootstrapContentRows,
  buildContentRegistry,
  createHandlerRegistry,
  frameActionHandlerRegistrations,
  registerLootHandlers,
  registerNpcHandlers,
  registerPlaceableHandlers,
  registerProcessorHandlers,
  type LifecycleEventType,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';

import type { CachedContentRegistry } from '../content/cache.js';
import { objectGraphRegistryForContent } from '../content/object-runtime.js';

const worldSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const selectedSource = readFileSync(new URL('./use-selected.ts', import.meta.url), 'utf8');
const interactionSource = readFileSync(new URL('./interact-entity.ts', import.meta.url), 'utf8');
const timerSource = readFileSync(new URL('./entity-timer.ts', import.meta.url), 'utf8');

interface RaiseCoverage {
  readonly registrations: number;
  readonly production: 'raised' | 'registered_only' | 'not_registered';
}

function productionRegistry() {
  const built = buildContentRegistry(bootstrapContentRows());
  expect(built.report.valid).toBe(true);
  const content: CachedContentRegistry = {
    key: 'lifecycle-production-coverage',
    revision: 10n,
    contentHash: built.registry.contentHash,
    registry: built.registry,
  };
  const compiled = registerNpcHandlers(
    [...built.registry.npcs.values()],
    built.registry.dialogues,
    registerProcessorHandlers(built.registry.objects.values(), registerPlaceableHandlers(
      registerLootHandlers(createHandlerRegistry(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS)),
    )),
  );
  return objectGraphRegistryForContent(createHandlerRegistry([
    ...compiled.registrations, ...frameActionHandlerRegistrations(built.registry.frames.values()),
  ]), content, 1);
}

const expectedProduction: Readonly<Record<LifecycleEventType, RaiseCoverage['production']>> = {
  use: 'raised',
  frameAction: 'raised',
  secondary: 'raised',
  equipmentUse: 'raised',
  worldItemUse: 'raised',
  useWith: 'raised',
  useAt: 'raised',
  aimedUse: 'raised',
  place: 'raised',
  pickup: 'raised',
  break: 'raised',
  slotChanged: 'raised',
  processComplete: 'raised',
  timer: 'raised',
  walkOnto: 'raised',
  enterSpace: 'raised',
  leaveSpace: 'raised',
  spawn: 'raised',
  despawn: 'raised',
  tick: 'raised',
  dialogueChoice: 'raised',
  questState: 'raised',
  statistic: 'raised',
};

describe('lifecycle registration versus production raise coverage', () => {
  it('records every event as live, registered-only, or absent without hiding dead registrations', () => {
    const registry = productionRegistry();
    const matrix = Object.fromEntries(LIFECYCLE_EVENT_TYPES.map((eventType) => {
      const registrations = registry.registrations.filter(
        (registration) => registration.eventType === eventType,
      ).length;
      return [eventType, {
        registrations,
        production: expectedProduction[eventType],
      } satisfies RaiseCoverage];
    })) as Record<LifecycleEventType, RaiseCoverage>;

    expect(matrix).toEqual({
      use: { registrations: 20, production: 'raised' },
      frameAction: { registrations: 3, production: 'raised' },
      secondary: { registrations: 52, production: 'raised' },
      equipmentUse: { registrations: 2, production: 'raised' },
      worldItemUse: { registrations: 2, production: 'raised' },
      useWith: { registrations: 29, production: 'raised' },
      useAt: { registrations: 7, production: 'raised' },
      aimedUse: { registrations: 1, production: 'raised' },
      place: { registrations: 53, production: 'raised' },
      pickup: { registrations: 2, production: 'raised' },
      break: { registrations: 27, production: 'raised' },
      slotChanged: { registrations: 5, production: 'raised' },
      processComplete: { registrations: 0, production: 'raised' },
      timer: { registrations: 5, production: 'raised' },
      walkOnto: { registrations: 0, production: 'raised' },
      enterSpace: { registrations: 0, production: 'raised' },
      leaveSpace: { registrations: 0, production: 'raised' },
      spawn: { registrations: 4, production: 'raised' },
      despawn: { registrations: 0, production: 'raised' },
      tick: { registrations: 1, production: 'raised' },
      dialogueChoice: { registrations: 3, production: 'raised' },
      questState: { registrations: 0, production: 'raised' },
      statistic: { registrations: 0, production: 'raised' },
    });
  });

  it('anchors raised status to the production dispatch sites', () => {
    for (const marker of [
      "type: 'secondary'", "type: 'equipmentUse'", "type: 'useWith'",
      "type: 'useAt'", "type: 'aimedUse'", "type: 'place'",
    ]) expect(selectedSource, marker).toContain(marker);
    for (const marker of [
      "type: 'use'", "type: 'worldItemUse'", "type: 'pickup'", "type: 'break'",
    ]) expect(interactionSource, marker).toContain(marker);
    expect(timerSource).toContain("type: 'timer'");
    for (const marker of [
      "type: 'frameAction'", "type: 'slotChanged'", "type: 'processComplete'", "type: 'spawn'", "type: 'tick'", "type: 'dialogueChoice'",
      "type: 'questState'", "type: 'statistic'", "type: 'walkOnto'", "type: 'enterSpace'",
      "type: 'leaveSpace'", "type: 'despawn'",
    ]) expect(worldSource, marker).toContain(marker);
    expect(worldSource).toContain('raisePlaceableSlotChangedEvent(');
    expect(worldSource).toContain('raiseProcessorProcessCompleteEvent(');
    expect(worldSource).toContain('authoredNpcSpawnLifecyclePlan(');
    expect(worldSource).toContain('raiseAuthoredNpcTickEvent(');
    expect(worldSource).toContain('raiseDialogueChoiceEvent(');
    expect(worldSource).toContain('raisePlayerWalkOntoEvent(');
    expect(worldSource).toContain('raiseEntityDespawnEvent(');
  });

  it('lets dialogue lifecycle effects own quest mutation without applying it twice', () => {
    const start = worldSource.indexOf('export const chooseDialogueOption = spacetimedb.reducer');
    const end = worldSource.indexOf('export const closeNpcDialogue =', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const reducer = worldSource.slice(start, end);
    expect(reducer).toContain('raiseDialogueChoiceEvent(ctx, active.npcId, active.nodeId, choiceId)');
    expect(reducer).not.toContain('acceptQuest(');
    expect(reducer).not.toContain('turnInQuest(');
  });
});
