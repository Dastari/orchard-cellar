import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

function between(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('authored client mount targeting', () => {
  it.each([
    ['horse', 'function targetHorse(', 'function targetBoat('],
    ['boat', 'function targetBoat(', 'function targetMerchant('],
  ] as const)('uses the resolved %s mount reach and ignores missing definitions', (adapter, start, end) => {
    const target = between(start, end);
    expect(target).toContain('const mount = runtimeNpcMount(snapshot.content.registry, npc)');
    expect(target).toContain(`mount?.adapter !== '${adapter}'`);
    expect(target).toContain('isMountWithinReach(predicted.position, npc, mount)');
    expect(target).toContain('mounted !== null || predicted === null');
    expect(target).not.toContain('isHorseWithinMountReach');
  });
});
