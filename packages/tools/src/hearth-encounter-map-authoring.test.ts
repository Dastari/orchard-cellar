import {describe,expect,it} from 'vitest';
import {CombatRegionPolicy,HEARTH_COMBAT_REGIONS,HEARTH_ENCOUNTERS,HEARTH_ENEMY_PROFILES,
  TOPSIDE_SPACE_ID} from '@orchard/sim';
import {buildHearthArchipelagoContribution} from './hearth-archipelago-authoring.js';

describe('reviewed Cinderwake encounter sites on the authored map',()=>{
  it('keeps all five operating squares on walkable hostile terrain at their intended plane',()=>{
    const contribution=buildHearthArchipelagoContribution(),policy=new CombatRegionPolicy(HEARTH_COMBAT_REGIONS);
    expect(HEARTH_ENCOUNTERS).toHaveLength(5);
    for(const camp of HEARTH_ENCOUNTERS) {
      for(let y=camp.tileY-camp.radiusTiles;y<=camp.tileY+camp.radiusTiles;y++)for(let x=camp.tileX-camp.radiusTiles;x<=camp.tileX+camp.radiusTiles;x++) {
        const cell=contribution.cells[`${x},${y}`];
        expect(cell,`${camp.id}:${x},${y}`).toBeDefined();
        expect(cell!.biome).not.toBe('lava');expect(cell!.surface).not.toBe('water');
        expect(cell!.collision).not.toBe('force_block');expect(cell!.elevation??0).toBe(camp.elevation);
        expect(policy.allowsHostileDamage({spaceId:TOPSIDE_SPACE_ID,tileX:x,tileY:y})).toBe(true);
      }
      for(const member of camp.members) {
        expect(Math.abs(member.tileX-camp.tileX)).toBeLessThanOrEqual(camp.radiusTiles);
        expect(Math.abs(member.tileY-camp.tileY)).toBeLessThanOrEqual(camp.radiusTiles);
        expect(HEARTH_ENEMY_PROFILES[member.kind]!.health).toBeGreaterThan(0);
      }
    }
  });
});
