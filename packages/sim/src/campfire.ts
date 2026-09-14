import { authorityDayIndex, authorityDayProgress, dayProgressAtClockTime } from './time.js';
import type { LandmarkAutomationDefinition } from './content/world-definition.js';
import type { ContentRegistry } from './content/registry.js';
import type { ObjectContentDefinition } from './content/object-definition.js';
import { generateSurvivalLandmarkDecorations } from './survival-world.js';

export interface DailyCampfireSchedule {
  readonly lightMinute: number;
  readonly extinguishMinute: number;
}

function scheduleJitter(day: bigint, salt: bigint, jitterMinutes: number): number {
  let value = (day + 1n) * 1_103_515_245n + salt * 12_345n;
  value ^= value >> 16n;
  const width = jitterMinutes * 2 + 1;
  return Number((value & 0x7fff_ffffn) % BigInt(width)) - jitterMinutes;
}

export function authoredCampfireSchedule(
  day: bigint,
  automation: LandmarkAutomationDefinition,
): DailyCampfireSchedule {
  return {
    lightMinute: automation.lightMinute
      + scheduleJitter(day, BigInt(automation.lightSalt), automation.jitterMinutes),
    extinguishMinute: automation.extinguishMinute
      + scheduleJitter(day, BigInt(automation.extinguishSalt), automation.jitterMinutes),
  };
}

export function authoredCampfireShouldBeLit(
  calendarTick: bigint,
  automation: LandmarkAutomationDefinition,
): boolean {
  const schedule = authoredCampfireSchedule(authorityDayIndex(calendarTick), automation);
  const progress = authorityDayProgress(calendarTick);
  return progress < dayProgressAtClockTime(
    Math.floor(schedule.extinguishMinute / 60), schedule.extinguishMinute % 60,
  ) || progress >= dayProgressAtClockTime(
    Math.floor(schedule.lightMinute / 60), schedule.lightMinute % 60,
  );
}

export interface RuntimeLandmarkCampfirePlan {
  readonly landmarkId: string;
  readonly decorationKind: string;
  readonly runtimeId: bigint;
  readonly objectDefinitionId: string;
  readonly object: ObjectContentDefinition;
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly automation?: LandmarkAutomationDefinition;
}

const landmarkCampfirePlanCache = new WeakMap<ContentRegistry, readonly RuntimeLandmarkCampfirePlan[]>();

/** Authored decoration identity is accepted only when it is bound to the same
 * stable generated row and a complete active campfire lifecycle object. */
export function runtimeLandmarkCampfirePlans(registry: ContentRegistry): readonly RuntimeLandmarkCampfirePlan[] {
  if (registry.spaces === undefined || registry.objects === undefined || registry.npcs === undefined) return Object.freeze([]);
  const cached = landmarkCampfirePlanCache.get(registry);
  if (cached !== undefined) return cached;
  const activeSpaces = [...registry.spaces.values()].filter(space => space.retired !== true);
  const spaceIdCounts = new Map<number, number>();
  for (const space of activeSpaces) spaceIdCounts.set(space.spaceId, (spaceIdCounts.get(space.spaceId) ?? 0) + 1);
  const candidates: RuntimeLandmarkCampfirePlan[] = [];
  for (const space of activeSpaces) {
    if (spaceIdCounts.get(space.spaceId) !== 1) continue;
    const landmarks = space.landmarks ?? [], generated = generateSurvivalLandmarkDecorations(landmarks);
    for (const landmark of landmarks) for (const rule of landmark.decorations) {
      if (rule.kind !== 'point' || rule.placeable === undefined) continue;
      const object = registry.objects.get(rule.placeable.object);
      const tags = object?.components.identity?.tags ?? [];
      const hasSecondary = object?.components.interactions?.some(interaction => interaction.verb === 'secondary') === true;
      if (object === undefined || object.retired === true || object.components.sprite === undefined
        || object.components.light === undefined || object.components.states?.lit?.type !== 'bool'
        || !tags.includes('station.campfire') || !tags.includes('emits.light') || !hasSecondary) continue;
      if (rule.placeable.automation !== undefined) {
        const actor = registry.npcs.get(rule.placeable.automation.actor);
        if (actor === undefined || actor.retired === true) continue;
      }
      let runtimeId: bigint;
      try { runtimeId = BigInt(rule.placeable.runtimeId); } catch { continue; }
      if (!generated.some(row => BigInt(row.id) === runtimeId && row.groupId === landmark.id
        && row.kind === rule.decorationKind && row.tileX === rule.tileX && row.tileY === rule.tileY)) continue;
      candidates.push(Object.freeze({ landmarkId: landmark.id, decorationKind: rule.decorationKind,
        runtimeId, objectDefinitionId: object.id, object, spaceId: space.spaceId,
        tileX: rule.tileX, tileY: rule.tileY,
        ...(rule.placeable.automation === undefined ? {} : { automation: rule.placeable.automation }) }));
    }
  }
  const counts = new Map<bigint, number>();
  for (const plan of candidates) counts.set(plan.runtimeId, (counts.get(plan.runtimeId) ?? 0) + 1);
  const plans = Object.freeze(candidates.filter(plan => counts.get(plan.runtimeId) === 1));
  landmarkCampfirePlanCache.set(registry, plans);
  return plans;
}
