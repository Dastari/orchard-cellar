import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const overworld = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('authored farmland rendering boundary', () => {
  it('draws cached authored ground before authority-backed soil and crops', () => {
    const cachedGround = overworld.indexOf('groundCache.draw(');
    const liveSoil = overworld.indexOf('drawFarmSoil(');
    expect(cachedGround).toBeGreaterThan(-1);
    expect(liveSoil).toBeGreaterThan(cachedGround);
    expect(overworld.slice(liveSoil, liveSoil + 900)).toContain('[...snapshot.soil]');
  });
});
