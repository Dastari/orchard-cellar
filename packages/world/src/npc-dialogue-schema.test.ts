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

  it('retires name-parsing teleports in favour of typed exact-identity and NPC mutations', () => {
    expect(source).not.toContain('export const adminTeleport =');
    const player = sourceBetween('export const adminTeleportPlayer =', 'export const adminSetDisplayName =');
    expect(player).toContain("operation: 'teleport_player'");
    expect(player).toContain('adminPositionMutationBase(input)');
    const npc = sourceBetween('export const adminRelocateNpc =', 'export const adminRespawnResources =');
    expect(npc).toContain("operation: 'relocate_npc'");
    expect(npc).toContain('npcId');
  });
});
