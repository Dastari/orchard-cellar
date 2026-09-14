import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareWorldDepthItems, type WorldDepthItem } from './renderer.js';
import { prepareWorldDepthItem, WorldItemIdentities, WorldItemKind } from './painter-depth.js';
const phase = (item: WorldDepthItem) => item.depthPhase === 'surface' ? 0 : item.depthPhase === 'boundary' ? 1 : 2;
function reference(a: WorldDepthItem, b: WorldDepthItem): number {
  return (a.elevationLayer ?? 0) - (b.elevationLayer ?? 0)
    || Number(a.depthPhase !== 'surface') - Number(b.depthPhase !== 'surface')
    || (a.footY + (a.depthOffset ?? 0)) - (b.footY + (b.depthOffset ?? 0))
    || phase(a) - phase(b) || String(a.tie).localeCompare(String(b.tie));
}
function check(input: WorldDepthItem[], identities = new WorldItemIdentities()) {
  const expected = [...input].sort(reference).map((item) => item.tie);
  const actual = input.map((item) => ({ ...item }));
  for (const item of actual) prepareWorldDepthItem(item, identities);
  expect(actual.sort(compareWorldDepthItems).map((item) => item.debugTie)).toEqual(expected);
  expect(actual.every((item) => typeof item.tie === 'number' && item.sortKey !== undefined && item.kind !== undefined)).toBe(true);
}
describe('prepared painter ordering', () => {
  it('preserves the exact legacy order of a recorded 283-item gameplay frame', () => {
    const data = JSON.parse(readFileSync(new URL('./painter-depth.fixture.json', import.meta.url), 'utf8')) as WorldDepthItem[];
    expect(data).toHaveLength(283);
    check(data.map((item) => ({ ...item, draw: () => {} })));
  });
  it('preserves fractional foot ordering at bin edges, layers, and phase boundaries', () => {
    const items: WorldDepthItem[] = [];
    for (const elevationLayer of [-2,0,1,8]) for (const depthPhase of ['surface','boundary','entity'] as const)
      for (const footY of [-0.001,0,0.000000000001,0.062499999999,0.0625,48,48.000000000001]) {
        items.push({ tie: `item:${items.length}`, footY, elevationLayer, depthPhase, draw: () => {} });
      }
    check(items.reverse());
  });
  it('keeps lexical order on streaming insertion and stable collation-equivalent ties', () => {
    const identities = new WorldItemIdentities();
    for (const name of ['z','é','e\u0301','a']) identities.get(name);
    check(['e\u0301','é','b','z','a'].map((tie) => ({ tie, footY: 0, draw: () => {} })),identities);
  });
  it('classifies moving kinds once per identity and keeps static names static', () => {
    const identities = new WorldItemIdentities();
    expect(identities.get('player:42').kind).toBe(WorldItemKind.Player);
    expect(identities.get('boat:42').kind).toBe(WorldItemKind.Boat);
    expect(identities.get('decoration:42').kind).toBe(WorldItemKind.Static);
    expect(identities.get('player:42')).toBe(identities.get('player:42'));
  });
  it('retires projectile churn and enforces the retained identity budget without changing active order', () => {
    const identities = new WorldItemIdentities(32);
    for (let frame = 0; frame < 600; frame++) {
      identities.beginFrame();
      check(['tree:1', `projectile:${frame}`, `projectile:predicted:${frame}`]
        .map(tie => ({ tie, footY: 1, draw: () => {} })), identities);
      identities.finishFrame();
      expect(identities.diagnostics.retained).toBe(3);
    }
    expect(identities.diagnostics.peak).toBeLessThanOrEqual(5);
    expect(identities.diagnostics.retired).toBe(1198);
    identities.beginFrame();
    check(Array.from({ length: 64 }, (_, i) => ({ tie: `item:${i}`, footY: 0, draw: () => {} })), identities);
    identities.finishFrame();
    expect(identities.diagnostics.retained).toBe(0);
    identities.beginFrame();
    check(['z', 'a'].map(tie => ({ tie, footY: 0, draw: () => {} })), identities);
    identities.finishFrame();
    expect(identities.diagnostics.retained).toBe(2);
  });
});
