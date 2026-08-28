import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Marlow dialogue authority', () => {
  it('indexes open dialogue by NPC for the world-step movement guard', () => {
    const table = sourceBetween('const active_dialogue = table(', 'const world_npc = table(');
    expect(table).toContain("accessor: 'by_npc'");
    expect(table).toContain("columns: ['npcId']");
    expect(source).toContain('ctx.db.active_dialogue.by_npc.filter(npc.id)');
  });

  it('faces and stops the NPC immediately when a player starts talking', () => {
    const reducer = sourceBetween('export const interactNpc =', 'export const chooseDialogueOption =');
    expect(reducer).toContain('npcFacingTowardPoint(');
    expect(reducer).toContain('moving: false');
    expect(reducer).toContain("wanderDirection: 'idle'");
    expect(reducer.indexOf('updateWorldNpc(ctx,')).toBeLessThan(reducer.indexOf('ctx.db.active_dialogue.insert(next)'));
  });

  it('lets owner teleports target named NPCs across spaces', () => {
    const reducer = sourceBetween('export const adminTeleport =', 'export const setDisplayName =');
    expect(reducer).toContain('const directNpc = npcNamed(argument)');
    expect(reducer).toContain('const destinationNpc = npcNamed(namedDestination)');
    expect(reducer).toContain('nextSpaceId = destinationNpc.spaceId');
    expect(reducer).toContain('teleportPlayer(ctx, teleportedPosition, nextSpaceId, nextX, nextY)');
    expect(reducer).toContain('ctx.db.world_npc.by_rider.filter(teleportedPosition.identity)');
  });
});
