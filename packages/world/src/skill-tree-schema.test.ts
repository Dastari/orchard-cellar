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
    expect(reducer).toContain('runtimeSkillNodeDefinition(contentRegistry(ctx), nodeId)');
    expect(reducer).toContain('playerSkillRanks(ctx, ctx.sender)');
    expect(reducer).toContain('runtimeSkillPurchaseRejection(contentRegistry(ctx), nodeId');
    expect(reducer.indexOf('runtimeSkillPurchaseRejection(contentRegistry(ctx), nodeId'))
      .toBeLessThan(reducer.indexOf('player_skill_node.insert'));
    expect(reducer).toContain("'skill_points_spent'");
  });

  it('resets only caller-owned ranks and charges the server-derived ladder cost', () => {
    const reducer = sourceBetween('export const resetSkillTree =', 'export const heartbeat =');
    expect(reducer).toContain('isSkillTrack(track)');
    expect(reducer).toContain('skillRespecCostBronze(progress.respecCount)');
    expect(reducer).toContain('wallet.balanceBronze < cost');
    expect(reducer).toContain('player_skill_node.by_identity.filter(ctx.sender)');
    expect(reducer).toContain('row.track === track');
    expect(reducer).toContain('spentPoints: 0');
  });

  it('retires caller debug grants in favour of exact-player admin grants', () => {
    expect(source).not.toContain('export const grantDebugSkillPoints =');
    const reducer = sourceBetween('export const adminGrantSkillPoints =', 'export const adminResetQuests =');
    expect(reducer).toContain("operation: 'grant_skill_points'");
    expect(reducer).toContain('adminProgressionMutationBase(input)');
    expect(reducer).toContain('points');
  });

  it('gates horse riding and both jump modes from authoritative skill ranks', () => {
    const mount = sourceBetween('function applyMountLifecycle(', 'export const interactHorse =');
    expect(mount).toContain('runtimeNpcMount(contentRegistry(ctx), npc)');
    expect(mount).toContain('playerSkillRanks(ctx, ctx.sender)');
    expect(mount).toContain('(ranks[mount.requiredSkill] ?? 0) < 1');
    expect(mount.indexOf('(ranks[mount.requiredSkill] ?? 0) < 1'))
      .toBeLessThan(mount.indexOf('vehicleCustodyPlan('));

    const jump = sourceBetween('export const jumpHorse =', 'export const dropSelected =');
    expect(jump).toContain('runtimeNpcMount(contentRegistry(ctx), mountedHorse)?.jumpSkill');
    expect(jump).toContain('(mountSkillRanks[jumpSkill] ?? 0) < 1');
    expect(jump.indexOf('(mountSkillRanks[jumpSkill] ?? 0) < 1'))
      .toBeLessThan(jump.indexOf('findHorseJumpLanding('));
    expect(jump).toContain('ranks.surefooted');
    expect(jump).toContain('ranks.cliff_climber');
    expect(jump).toContain('findPlayerJumpLanding(');
    expect(jump).toContain("actionKind: mountedHorse === null ? 'jump' : 'horse_jump'");
  });

  it('re-homes persisted mining ranks into the Farming tree during migration', () => {
    const migration = sourceBetween('function normalizePlayerSkillTracks(', 'function isEffectKind(');
    expect(migration).toContain('row.track !== definition.track');
    expect(migration).toContain('track: definition.track');
    expect(migration).toContain('definition.pointCost * row.rank');
    expect(source).toContain('normalizePlayerSkillTracks(ctx, ctx.sender)');
  });
});
