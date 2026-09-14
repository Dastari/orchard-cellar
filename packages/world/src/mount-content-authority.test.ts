import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const npcRuntimeSource = readFileSync(
  new URL('../../sim/src/content/npc-runtime.ts', import.meta.url),
  'utf8',
);
const clientSource = readFileSync(
  new URL('../../client/src/overworld-main.ts', import.meta.url),
  'utf8',
);

function between(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('authored mount authority integration', () => {
  it('uses one resolved mount for reach, dismount, jump policy, and duration', () => {
    const interaction = between('function applyMountLifecycle(', 'export const interactHorse =');
    expect(interaction.match(/runtimeNpcMount\(/g)).toHaveLength(1);
    expect(interaction).toContain('isMountWithinReach(position, npc, mount)');
    expect(interaction).toContain('findHorseDismountPosition(npc, parseNpcFacing(npc.facing), collision, mount)');

    const jump = between('export const jumpHorse =', 'export const dropSelected =');
    expect(jump.match(/runtimeNpcMount\(/g)).toHaveLength(1);
    expect(jump).toContain('mountedHorse.mount');
    expect(jump).toContain('mountedHorse.mount.jump.durationTicks');
    expect(jump).not.toContain('HORSE_JUMP_DURATION_TICKS');
  });

  it('fails closed without rewriting the durable fixed horse and otherwise uses authored wander tuning', () => {
    const tick = between("tickStageTiming(telemetryTimingSample, 'npc');", "tickStageTiming(telemetryTimingSample, 'npc', true);");
    const guard = tick.indexOf('if (starterHorseDefinition === null');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(tick.indexOf('if (npc.rider !== undefined)', guard));
    expect(tick).toContain('runtimeStarterHorseDefinition(activeContentRegistry)');
    expect(tick).toContain('npc.id === starterHorseRuntimeId');
    expect(tick).toContain('collision, starterHorseMount.wander');
  });

  it('contains no compiled starter identity, name, home or wildlife profile', () => {
    expect(source).not.toContain('STARTER_HORSE_ID');
    expect(source).not.toContain('STARTER_HORSE_NAME');
    expect(source).not.toContain('STARTER_HORSE_HOME');
    expect(source).not.toContain('function starterHorseRow(');
    expect(source).not.toContain('function starterHorseWildlifeProfileRow(');
    const reconnect = between('function prepareConnection(', 'export const onConnect =');
    expect(reconnect).toContain('materializeAuthoredNpcs(ctx)');
    expect(reconnect).not.toContain('world_npc.id.find(1n)');
    for (const implementation of [source, npcRuntimeSource, clientSource]) {
      expect(implementation).not.toContain("'npc:horse'");
      expect(implementation).not.toContain("'Nados Mum'");
      expect(implementation).not.toMatch(/runtimeId\s*===\s*['"]1['"]/u);
      expect(implementation).not.toMatch(/species\s*===\s*['"]horse['"]/u);
    }
    expect(npcRuntimeSource).toContain("definition.mount?.adapter === 'horse'");
    expect(clientSource).toContain('runtimeNpcMount(snapshot.content.registry, npc)');
    expect(clientSource).toContain("horse.displayName.trim() || 'HORSE'");
  });
});
