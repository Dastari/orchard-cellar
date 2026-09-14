import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const world = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const rogue = readFileSync(new URL('../../sim/src/roguelike.ts', import.meta.url), 'utf8');

describe('authored Delve enemy pool wiring', () => {
  it('supplies the active registry before spawning any room enemy', () => {
    const start = world.indexOf('function spawnRogueWave(');
    const end = world.indexOf('function beginRogueReward(', start);
    const spawn = world.slice(start, end);
    expect(spawn).toContain(
      'generateRogueWave(run.seed, run.roomNumber, kind, wave, contentRegistry(ctx))',
    );
  });

  it('keeps enemy identities and pool tuning out of simulation source', () => {
    expect(rogue).not.toContain('const ENEMY_POOLS');
    for (const identity of [
      'skeleton_bowman', 'skeleton_swordman', 'skeleton_mage',
      'slime_small', 'slime_big', 'cowling_mage', 'flying_skull',
    ]) expect(rogue).not.toContain(`'${identity}'`);
  });
});
