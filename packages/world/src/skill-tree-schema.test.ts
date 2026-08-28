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

describe('authoritative character progression', () => {
  it('keeps tracks and purchased ranks private behind caller-only views', () => {
    const schema = sourceBetween('const player_skill_track = table(', 'const quest_world_item = table(');
    expect(schema).toContain("name: 'player_skill_track'");
    expect(schema).toContain("name: 'player_skill_node'");
    expect(schema).not.toContain('public: true');
    expect(source).toContain("name: 'own_player_skill_tracks', public: true");
    expect(source).toContain("name: 'own_player_skill_nodes', public: true");
  });

  it('validates appearance kinds before updating the public modular selection', () => {
    const reducer = sourceBetween('export const setAppearance =', 'export const purchaseSkillNode =');
    expect(reducer).toContain('requireAuthorizedSender(');
    expect(reducer).toContain('isPlayerAppearanceSelection(appearance)');
    expect(reducer.indexOf('isPlayerAppearanceSelection(appearance)'))
      .toBeLessThan(reducer.indexOf('player_appearance.identity.update'));
    expect(reducer).toContain("'appearance_changes'");
  });

  it('re-derives level, adjacency, points, and rank from authority rows when purchasing', () => {
    const reducer = sourceBetween('export const purchaseSkillNode =', 'export const resetSkillTree =');
    expect(reducer).toContain('skillNodeDefinition(nodeId)');
    expect(reducer).toContain('playerSkillRanks(ctx, ctx.sender)');
    expect(reducer).toContain('skillPurchaseRejection(nodeId');
    expect(reducer.indexOf('skillPurchaseRejection(nodeId'))
      .toBeLessThan(reducer.indexOf('player_skill_node.insert'));
    expect(reducer).toContain("'skill_points_spent'");
  });

  it('resets only caller-owned ranks and charges the server-derived ladder cost', () => {
    const reducer = sourceBetween('export const resetSkillTree =', 'export const grantDebugSkillPoints =');
    expect(reducer).toContain('isSkillTrack(track)');
    expect(reducer).toContain('skillRespecCostBronze(progress.respecCount)');
    expect(reducer).toContain('wallet.balanceBronze < cost');
    expect(reducer).toContain('player_skill_node.by_identity.filter(ctx.sender)');
    expect(reducer).toContain('row.track === track');
    expect(reducer).toContain('spentPoints: 0');
  });

  it('makes debug point grants owner-only, bounded, and audited', () => {
    const reducer = sourceBetween('export const grantDebugSkillPoints =', 'export const heartbeat =');
    expect(reducer).toContain('requireWorldOwner(');
    expect(reducer).toContain('points < 1 || points > 100');
    expect(reducer).toContain('progress.bonusPoints + points > 65_535');
    expect(reducer).toContain("action: 'grant_debug_skill_points'");
  });
});
