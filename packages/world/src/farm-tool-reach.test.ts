import { describe, expect, it } from 'vitest';
import { FIXED_UNITS_PER_PIXEL, SURVIVAL_WORLD_SEED, runtimeToolDefinition, bootstrapContentRegistry, type RuntimeToolDefinition } from '@orchard/sim';
import { farmSoilRestoreResult, farmToolUseResult } from './world-rules.js';

const player = { x: 168 * FIXED_UNITS_PER_PIXEL, y: 177 * FIXED_UNITS_PER_PIXEL };
const tool: RuntimeToolDefinition = { specialization: 'farming', tier: 0, reachTiles: 2, swingTicks: 6 };
function use(tileX: number, tileY: number, definition: RuntimeToolDefinition | null = tool) {
  return farmToolUseResult(SURVIVAL_WORLD_SEED, player.x, player.y, 'authored_test_cultivator', tileX, tileY, null, false, definition, true, 'cultivate');
}

describe('farm lifecycle authored physical reach', () => {
  it('admits the upper-left tile and all four exact radial edges around the body, not the lower sprite anchor', () => {
    expect(use(9, 9)).toBe('ok');
    for (const [x, y] of [[10, 8], [12, 10], [10, 12], [8, 10]]) {
      expect(use(x!, y!), `${x},${y}`).toBe('ok');
      expect(farmSoilRestoreResult(player.x, player.y, 'authored_test_cultivator', x!, y!, {}, tool, 'cultivate')).toBe('ok');
    }
    expect(use(8, 8)).toBe('out_of_range');
    expect(use(10, 13)).toBe('out_of_range');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, player.x - 1, player.y, 'authored_test_cultivator', 12, 10, null, false, tool, true, 'cultivate')).toBe('out_of_range');
  });

  it('uses the supplied active tool for use and restore, refusing missing or wrong components', () => {
    const shorter = { ...tool, reachTiles: 1 };
    expect(use(9, 9, shorter)).toBe('out_of_range');
    expect(farmSoilRestoreResult(player.x, player.y, 'authored_test_cultivator', 9, 9, {}, shorter, 'cultivate')).toBe('out_of_range');
    expect(use(9, 9, null)).toBe('wrong_tool');
    expect(use(9, 9, { ...tool, specialization: 'mining' })).toBe('wrong_tool');
    expect(use(10, 13, { ...tool, reachTiles: 3 })).toBe('ok');
  });

  it('retains terrain, occupancy and soil validation inside reachable range', () => {
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, player.x, player.y, 'authored_test_cultivator', 9, 9, null, false, tool, false, 'cultivate')).toBe('not_grass');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, player.x, player.y, 'authored_test_cultivator', 9, 9, null, true, tool, true, 'cultivate')).toBe('tile_occupied');
    expect(farmToolUseResult(SURVIVAL_WORLD_SEED, player.x, player.y, 'authored_test_cultivator', 9, 9, { watered: false }, false, tool, true, 'water')).toBe('ok');
    expect(farmSoilRestoreResult(player.x, player.y, 'authored_test_cultivator', 9, 9, null, tool, 'cultivate')).toBe('not_tilled');
    const registry = bootstrapContentRegistry();
    expect(runtimeToolDefinition(registry, 'hoe')?.reachTiles).toBe(2);
  });
});
