import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function between(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('T12 monolith extraction', () => {
  it('separates connection bootstrap from character spawn setup', () => {
    const bootstrap = between('function prepareConnection(', 'export const onConnect =');
    const connect = between('export const onConnect =', 'export const onDisconnect =');
    expect(bootstrap).toContain('requireAuthorizedSender(');
    expect(bootstrap).toContain('ensurePrivateStateMigration(ctx)');
    expect(connect).toContain('prepareConnection(ctx)');
    expect(connect).toContain('findSurvivalSpawnTile(');
  });

  it('preserves useHands branch precedence through placement helpers', () => {
    const hands = between('export const useHands =', 'function requireHomesteadBuildPlacement(');
    const carried = hands.indexOf('placeCarriedHandsObject(');
    const deed = hands.indexOf("selected?.itemKind === 'homestead_deed'");
    const chest = hands.indexOf('placeCarriedChest(');
    const facedTarget = hands.indexOf('combatTargetAtFacingTile(');
    const selected = hands.indexOf('placeSelectedHandsObject(');
    expect([carried, deed, chest, facedTarget, selected].every((index) => index >= 0)).toBe(true);
    expect(carried).toBeLessThan(deed);
    expect(deed).toBeLessThan(chest);
    expect(chest).toBeLessThan(facedTarget);
    expect(facedTarget).toBeLessThan(selected);
  });

  it('routes scheduled maintenance and presence expiry through named helpers', () => {
    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('runOneHertzTickMaintenance(ctx, maintenanceAuthorityTick, updateCounters)');
    expect(step).toContain('expirePresenceLeases(ctx, clock)');
    expect(source).toContain('maintenanceAuthorityTick % BigInt(AUTHORITY_HZ) !== 0n');
  });

  it('keeps close reducers authenticated and records deferred T8 decisions', () => {
    for (const reducer of ['closeChest', 'closeNpcDialogue']) {
      const body = between(`export const ${reducer} =`, '\n});');
      expect(body, reducer).toContain('requireAuthorizedSender(');
    }
    expect(source.match(/\/\/ docs\/53 T8: pending decision/g)).toHaveLength(7);
    expect(source.match(/\/\/ docs\/53 T8: retained for authenticated CLI administration\./g))
      .toHaveLength(2);
  });
});
