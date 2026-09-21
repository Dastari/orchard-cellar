import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bootstrapContentDefinitions, bootstrapContentRegistry, runtimeToolDefinition,
  toolSwingContains, tileToolInteractionOrigin, tileToolTargetInReach,
  bowChargedRangePixels, bowChargeVigourCostCenti, bowChargeScaledDamageCenti,
  type ItemContentDefinition,
} from '@orchard/sim';
import { buildActionBaseline, loadActionBaseline, numericLeaves, renderActionBaseline, type ActionBaselineSources } from './action-baseline.js';

const items = bootstrapContentDefinitions().filter((item): item is ItemContentDefinition => item.kind === 'item');
const item = items.find(item => item.id === 'item:hoe')!;
function fixture(): ActionBaselineSources {
  return { items: [item], handlers: [{ itemId: item.id, triggers: ['place', 'useWith'] }],
    owners: { dataGraph: { itemIds: [] }, furnitureTransactions: { itemIds: [] } }, inertGroups: [] };
}

describe('reviewed action inventory', () => {
  it('requires review of every live item, route and numeric value change', () => {
    expect(renderActionBaseline(loadActionBaseline())).toBe(readFileSync(new URL('../../../docs/action-baseline.md', import.meta.url), 'utf8'));
  });
  it('fails on missing, ambiguous and stale ownership instead of silently reporting partial coverage', () => {
    const source = fixture();
    expect(() => buildActionBaseline({ ...source, handlers: [] })).toThrow('Unclassified');
    expect(() => buildActionBaseline({ ...source, inertGroups: [{ classification: 'material', itemIds: [item.id] }] })).toThrow('Conflicting');
    expect(() => buildActionBaseline({ ...source, items: [] })).toThrow('Stale');
    expect(() => buildActionBaseline({ ...source, items: [item, item] })).toThrow('Duplicate');
    expect(() => buildActionBaseline({ ...source, handlers: [{ itemId: item.id, triggers: [] }] })).toThrow('Missing action trigger');
  });
  it('keeps distinct named triggers on the same item and stabilizes input order', () => {
    const source = fixture();
    const handlers = [...source.handlers, { itemId: item.id, triggers: ['secondary', 'place'] }];
    const rows = buildActionBaseline({ ...source, handlers });
    expect(rows[0]?.triggers).toEqual(['place', 'secondary', 'useWith']);
    expect(buildActionBaseline({ ...source, handlers: handlers.reverse() })).toEqual(rows);
  });
  it('finds new nested numeric fields, including array entries and zero', () => {
    expect(numericLeaves({ z: null, a: { values: [0, 1.25], enabled: true }, b: -4 })).toEqual({ 'a.values.0': 0, 'a.values.1': 1.25, b: -4 });
    expect(() => numericLeaves({ cost: Infinity })).toThrow('Non-finite');
  });
});

// Deliberate current-main goldens, independent of the future action resolver.
// These preserve the geometry/economy contract while that implementation moves.
describe('current tool migration goldens', () => {
  const registry = bootstrapContentRegistry();
  it.each([
    ['axe', 384, 90], ['sword', 384, 90], ['pickaxe', 256, 45], ['hoe', 320, 90],
  ] as const)('%s uses an actor-centred inclusive sector', (kind, range, arc) => {
    const swing = runtimeToolDefinition(registry, kind)?.swing;
    expect(swing).toMatchObject({ rangeFixed: range, arcDegrees: arc });
    if (!swing) throw new Error('Missing swing');
    const origin = { x: -2048, y: 4096 };
    expect(toolSwingContains(origin, 'right', origin, swing)).toBe(true);
    expect(toolSwingContains(origin, 'right', { x: origin.x + range, y: origin.y }, swing)).toBe(true);
    expect(toolSwingContains(origin, 'right', { x: origin.x + range + 1, y: origin.y }, swing)).toBe(false);
    expect(toolSwingContains(origin, 'right', { x: origin.x - 1, y: origin.y }, swing)).toBe(false);
    const point = (angle: number) => ({ x: origin.x + range * 0.9 * Math.cos(angle * Math.PI / 180), y: origin.y + range * 0.9 * Math.sin(angle * Math.PI / 180) });
    expect(toolSwingContains(origin, 'right', point(arc / 2), swing)).toBe(true);
    expect(toolSwingContains(origin, 'right', point(arc / 2 + 0.01), swing)).toBe(false);
  });
  it.each([['hoe', 2, 144], ['watering_can', 1, 144], ['fishing_rod', 3, 0]] as const)(
    '%s uses its current radial reach and origin', (kind, reach, offset) => {
      const tool = runtimeToolDefinition(registry, kind);
      if (!tool) throw new Error('Missing tool');
      const position = { x: 2688, y: 2688 + offset };
      expect(tool.reachTiles).toBe(reach);
      expect(tileToolInteractionOrigin(tool, position)).toEqual({ x: 2688, y: 2688 });
      expect(tileToolTargetInReach(tool, position, { tileX: 10 + reach, tileY: 10 })).toBe(true);
      expect(tileToolTargetInReach(tool, { ...position, x: position.x - 1 }, { tileX: 10 + reach, tileY: 10 })).toBe(false);
      expect(tileToolTargetInReach(tool, position, { tileX: 10 + reach, tileY: 11 })).toBe(false);
    },
  );
  it.each([
    [0, 16, 100, 46], [120, 42.88, 360, 168], [500, 128, 1500, 700], [1000, 240, 3000, 1400], [2000, 240, 3000, 1400],
  ])('bow draw %i ms preserves range, base cost and damage', (charge, range, cost, damage) => {
    expect(bowChargedRangePixels(charge!)).toBeCloseTo(range!, 8);
    expect(bowChargeVigourCostCenti(charge!)).toBe(cost);
    expect(bowChargeScaledDamageCenti(1400, charge!)).toBe(damage);
  });
});
