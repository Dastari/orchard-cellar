import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function tableSource(name: string, nextName: string): string {
  const start = source.indexOf(`const ${name} = table(`);
  const end = source.indexOf(`const ${nextName} = table(`, start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return source.slice(start, end < 0 ? source.length : end);
}

describe('26§3 additive spaces schema', () => {
  it('uses defaulted u16 space ids and three-column chunk indexes', () => {
    for (const [name, next] of [
      ['player_position', 'player_input'],
      ['world_resource', 'world_soil'],
      ['world_soil', 'world_item'],
      ['world_item', 'world_projectile'],
      ['world_projectile', 'world_chest'],
      ['world_chest', 'world_chest_slot'],
      ['world_npc', 'world_wildlife_profile'],
      ['world_tree', 'world_clock'],
      ['world_wildlife_profile', 'world_merchant'],
      ['world_hive', 'world_wildlife_generation'],
      ['crop_patch', 'farm_activity'],
    ] as const) {
      const definition = tableSource(name, next);
      expect(definition).toContain('spaceId: t.u16().default(0)');
      expect(definition).toContain("columns: ['spaceId', 'chunkX', 'chunkY']");
    }
    expect(tableSource('world_speech', 'world_tree')).toContain('spaceId: t.u16().default(0)');
    const placeable = tableSource('world_placeable', 'world_placeable_slot');
    expect(placeable).toContain('spaceId: t.u16().default(0)');
    expect(placeable).toContain("columns: ['spaceId', 'chunkX', 'chunkY']");
  });

  it('declares the public bidirectional portal shape and generalized reducers', () => {
    const portals = tableSource('space_portal', 'world_resource');
    expect(portals).toContain("name: 'space_portal'");
    expect(portals).toContain('fromSpace: t.u16()');
    expect(portals).toContain('toSpace: t.u16()');
    expect(source).toContain('function teleportPlayer(');
    expect(source).toContain('export const usePortal =');
    expect(source).toContain('export const debugUsePortal =');
  });

  it('teleports the complete position tuple and settles pending prediction input', () => {
    const start = source.indexOf('function teleportPlayer(');
    const end = source.indexOf('\nfunction usePortalRow(', start);
    const helper = source.slice(start, end);
    expect(helper).toContain('x: nextX');
    expect(helper).toContain('y: nextY');
    expect(helper).toContain('spaceId');
    expect(helper).toContain('chunkX: chunkAt(nextX)');
    expect(helper).toContain('chunkY: chunkAt(nextY)');
    expect(helper).toContain("direction: 'idle'");
    expect(helper).toContain('settledSequence: input.sequence');
    expect(helper).toContain('pendingSequence: 0n');
  });

  it('keeps horse and farm-tool reducers topside-only', () => {
    for (const reducerName of [
      'interactHorse', 'jumpHorse', 'useFarmTool', 'restoreFarmTile', 'useFarmTile',
    ]) {
      const start = source.indexOf(`export const ${reducerName} =`);
      const end = source.indexOf('\nexport const ', start + 1);
      expect(source.slice(start, end < 0 ? source.length : end), reducerName)
        .toContain("position.spaceId !== TOPSIDE_SPACE_ID");
    }
  });
});
