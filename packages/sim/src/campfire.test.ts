import { describe, expect, it } from 'vitest';
import { AUTHORITY_TICKS_PER_DAY, dayProgressAtClockTime } from './time.js';
import {
  authoredCampfireSchedule,
  authoredCampfireShouldBeLit,
  runtimeLandmarkCampfirePlans,
} from './campfire.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type { SpaceContentDefinition } from './content/world-definition.js';

function tickAt(day: bigint, hour: number, minute = 0): bigint {
  return day * BigInt(AUTHORITY_TICKS_PER_DAY)
    + BigInt(Math.floor(dayProgressAtClockTime(hour, minute) * AUTHORITY_TICKS_PER_DAY));
}

describe('Marlow campfire schedule', () => {
  const registry=bootstrapContentRegistry();
  const plans=runtimeLandmarkCampfirePlans(registry);
  const automated=plans.find(plan=>plan.automation!==undefined)!;
  it('is deterministic but varies slightly between days', () => {
    expect(authoredCampfireSchedule(7n,automated.automation!)).toEqual(authoredCampfireSchedule(7n,automated.automation!));
    expect(authoredCampfireSchedule(7n,automated.automation!)).not.toEqual(authoredCampfireSchedule(8n,automated.automation!));
    for (let day = 0n; day < 30n; day += 1n) {
      const schedule = authoredCampfireSchedule(day,automated.automation!);
      expect(Math.abs(schedule.lightMinute-automated.automation!.lightMinute)).toBeLessThanOrEqual(automated.automation!.jitterMinutes);
      expect(Math.abs(schedule.extinguishMinute-automated.automation!.extinguishMinute)).toBeLessThanOrEqual(automated.automation!.jitterMinutes);
    }
  });

  it('keeps the fire off by day and lit through the night', () => {
    expect(authoredCampfireShouldBeLit(tickAt(3n, 12),automated.automation!)).toBe(false);
    expect(authoredCampfireShouldBeLit(tickAt(3n, 20),automated.automation!)).toBe(true);
    expect(authoredCampfireShouldBeLit(tickAt(3n, 2),automated.automation!)).toBe(true);
  });

  it('resolves both canonical landmark fires through active object lifecycle capabilities',()=>{
    expect(plans.map(plan=>plan.runtimeId)).toEqual([3000000004n,3200000003n]);
    expect(plans.map(plan=>plan.objectDefinitionId)).toEqual(['object:camp_cooking_fire','object:campfire']);
  });
  it('supports renamed identities and fails neutral for missing, retired, ambiguous, or mismatched authority',()=>{
    const island=registry.spaces.get('space:island')!;
    const objects=new Map(registry.objects);
    const renamedObjects=new Map<string,string>();
    for(const id of ['object:camp_cooking_fire','object:campfire']){
      const object=objects.get(id)!;
      const renamed=`object:renamed_${id.slice(7)}`;
      objects.set(renamed,{...object,id:renamed as `object:${string}`});
      renamedObjects.set(id,renamed);
    }
    const renamed:SpaceContentDefinition={...island,id:'space:renamed_island',landmarks:island.landmarks!.map((landmark,index)=>({
      ...landmark,id:`renamed_landmark_${index}`,decorations:landmark.decorations.map(rule=>rule.kind==='point'&&rule.placeable!==undefined
        ?{...rule,decorationKind:`renamed_${rule.decorationKind}`,placeable:{...rule.placeable,
          object:renamedObjects.get(rule.placeable.object)! as `object:${string}`}}:rule),
    }))};
    const renamedRegistry={...registry,spaces:new Map([[renamed.id,renamed]]),objects};
    expect(runtimeLandmarkCampfirePlans(renamedRegistry)).toHaveLength(2);
    expect(runtimeLandmarkCampfirePlans({...renamedRegistry,objects:new Map()})).toEqual([]);
    const retiredObjects=new Map(objects),first=renamedObjects.values().next().value!;
    retiredObjects.set(first,{...retiredObjects.get(first)!,retired:true});
    expect(runtimeLandmarkCampfirePlans({...renamedRegistry,objects:retiredObjects})).toHaveLength(1);
    expect(runtimeLandmarkCampfirePlans({...renamedRegistry,spaces:new Map([
      [renamed.id,renamed],['space:duplicate',{...renamed,id:'space:duplicate'}],
    ])})).toEqual([]);
    const mismatched:SpaceContentDefinition={...renamed,landmarks:renamed.landmarks!.map((landmark,index)=>index!==0?landmark:{...landmark,
      decorations:landmark.decorations.map(rule=>rule.kind==='point'&&rule.placeable!==undefined
        ?{...rule,placeable:{...rule.placeable,runtimeId:'99'}}:rule)})};
    expect(runtimeLandmarkCampfirePlans({...renamedRegistry,spaces:new Map([[mismatched.id,mismatched]])})).toHaveLength(1);
  });
});
