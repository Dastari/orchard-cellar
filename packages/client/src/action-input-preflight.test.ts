import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, runtimeToolDefinition, tileToolInteractionOrigin, TILE_SIZE_FIXED } from '@orchard/sim';
import { jumpInputSkillAvailable, tileToolInputOutOfReach } from './action-input-preflight.js';

describe('quiet action input preflight', () => {
  it('ignores distant tile tools using authored reach and preserves the inclusive boundary', () => {
    const registry = bootstrapContentRegistry();
    const position = { x: TILE_SIZE_FIXED / 2, y: TILE_SIZE_FIXED / 2 };
    for (const kind of ['fishing_rod', 'hoe', 'watering_can']) {
      const tool = runtimeToolDefinition(registry, kind);
      expect(tool).not.toBeNull();
      const authored = { ...tool!, reachTiles: 2 };
      const offset = position.y - tileToolInteractionOrigin(authored, position).y;
      const player = { ...position, y: position.y + offset };
      expect(tileToolInputOutOfReach(authored, player, { tileX: 2, tileY: 0 })).toBe(false);
      expect(tileToolInputOutOfReach(authored, player, { tileX: 2, tileY: 1 })).toBe(true);
      expect(tileToolInputOutOfReach({ ...authored, reachTiles: 4 }, player, { tileX: 3, tileY: 0 })).toBe(false);
    }
  });

  it('does not reinterpret missing targets or non-tool interactions as range failures', () => {
    const tool = runtimeToolDefinition(bootstrapContentRegistry(), 'fishing_rod');
    expect(tileToolInputOutOfReach(tool, { x: 0, y: 0 }, null)).toBe(false);
    expect(tileToolInputOutOfReach(null, { x: 0, y: 0 }, { tileX: 100, tileY: 100 })).toBe(false);
    expect(tileToolInputOutOfReach(tool, null, { tileX: 100, tileY: 100 })).toBe(false);
  });

  it('quietly skips unlearned SPACE actions and accepts either existing on-foot jump skill', () => {
    expect(jumpInputSkillAvailable([], null, false)).toBe(false);
    expect(jumpInputSkillAvailable([{ nodeId: 'surefooted', rank: 0 }], null, false)).toBe(false);
    for (const nodeId of ['surefooted', 'cliff_climber']) {
      expect(jumpInputSkillAvailable([{ nodeId, rank: 1 }], null, false)).toBe(true);
    }
  });

  it('uses the active authored mount jump skill rather than a fixed skill or NPC id', () => {
    const mount = { adapter: 'horse', jumpSkill: 'authored_high_jump' };
    expect(jumpInputSkillAvailable([{ nodeId: 'surefooted', rank: 1 }], mount, true)).toBe(false);
    expect(jumpInputSkillAvailable([{ nodeId: 'authored_high_jump', rank: 1 }], mount, true)).toBe(true);
    expect(jumpInputSkillAvailable([], { adapter: 'horse' }, true)).toBe(true);
    expect(jumpInputSkillAvailable([{ nodeId: 'surefooted', rank: 1 }], { adapter: 'boat' }, true)).toBe(false);
    expect(jumpInputSkillAvailable([], null, true)).toBe(false);
  });
});
