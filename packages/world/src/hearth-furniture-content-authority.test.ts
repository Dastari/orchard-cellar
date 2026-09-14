import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=(relative:string)=>readFileSync(new URL(relative,import.meta.url),'utf8');

describe('authored Hearth furniture source authority',()=>{
  it('keeps live simulation, authority and presentation free of shape and seat id catalogues',()=>{
    const placement=source('../../sim/src/hearth-furniture-placement.ts');
    const seating=source('../../sim/src/hearth-seating.ts');
    const world=source('./index.ts');
    const client=source('../../client/src/overworld-main.ts');
    const players=source('../../client/src/gameplay-painter-players.ts');
    const engine=source('../../engine/src/hearth-seating-scene.ts');
    expect(placement).not.toContain('furniture_rustic_chair');
    expect(seating).not.toContain('HEARTH_SEATING_KINDS');
    expect(world).not.toContain('HEARTH_SEATING_KINDS');
    expect(client).not.toContain('HEARTH_SEATING_KINDS');
    expect(players).not.toContain("furniture_rustic_bench'?8:12");
    expect(engine).not.toContain("furniture_rustic_bench'?8:12");
    expect(engine).toContain('seat.shape.seatPoseOffsetPixels');
  });
});
