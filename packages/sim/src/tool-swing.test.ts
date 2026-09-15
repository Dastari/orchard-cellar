import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { directionUnitVector } from './tile-targeting.js';
import { toolSwingChunks, toolSwingContains } from './tool-swing.js';
import { TILE_SIZE_FIXED, type Direction } from './state.js';

const registry = bootstrapContentRegistry();
const axe = registry.items.get('item:axe')!.tool!.swing!;
const pick = registry.items.get('item:pickaxe')!.tool!.swing!;
const origin = { x: 1000, y: 1000 };
describe('facing swing geometry', () => {
  it.each<Direction>(['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight'])(
    'uses %s facing without cursor or target selection', facing => {
      const [x, y] = directionUnitVector(facing);
      expect(toolSwingContains(origin, facing, { x: origin.x + x * 200, y: origin.y + y * 200 }, axe)).toBe(true);
      expect(toolSwingContains(origin, facing, { x: origin.x - x * 200, y: origin.y - y * 200 }, axe)).toBe(false);
      expect(toolSwingContains(origin, facing, { x: origin.x - y * 200, y: origin.y + x * 200 }, axe)).toBe(false);
    },
  );
  it('gives the pick a narrower and shorter area than the axe/sword', () => {
    const at = (distance: number, angle: number) => ({ x: origin.x + Math.cos(angle * Math.PI / 180) * distance,
      y: origin.y + Math.sin(angle * Math.PI / 180) * distance });
    expect(toolSwingContains(origin, 'right', at(300, 0), axe)).toBe(true);
    expect(toolSwingContains(origin, 'right', at(300, 0), pick)).toBe(false);
    expect(toolSwingContains(origin, 'right', at(200, 30), axe)).toBe(true);
    expect(toolSwingContains(origin, 'right', at(200, 30), pick)).toBe(false);
    expect(toolSwingContains(origin, 'right', at(200, 45), axe)).toBe(true);
    expect(toolSwingContains(origin, 'right', at(200, 46), axe)).toBe(false);
    expect(toolSwingContains(origin, 'right', at(385, 0), axe)).toBe(false);
    expect(toolSwingContains(origin, 'right', origin, axe)).toBe(true);
  });
  it('probes only neighbouring indexed chunks, including negative boundaries', () => {
    expect(toolSwingChunks({ x: 16 * TILE_SIZE_FIXED, y: 0 }, axe.rangeFixed)).toEqual([[0, -1], [1, -1], [0, 0], [1, 0]]);
    expect(toolSwingChunks({ x: 8 * TILE_SIZE_FIXED, y: 8 * TILE_SIZE_FIXED }, axe.rangeFixed)).toEqual([[0, 0]]);
  });
  it('authors a swing and damage source for every swinging tool variant', () => {
    const tools = [...registry.items.values()].filter(item => item.equip?.avatarAction?.startsWith('swing_'));
    expect(tools.length).toBeGreaterThan(20);
    for (const item of tools) {
      expect(item.tool?.swing).toBeDefined();
      expect(item.combat?.baseDamageCenti ?? item.tool?.swing?.baseDamageCenti).toBeGreaterThan(0);
    }
  });
});
