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

describe('per-player quest authority', () => {
  it('keeps quest state, baselines, rewards, and instanced props private', () => {
    const schema = sourceBetween('const player_quest = table(', 'const homestead_guest = table(');
    for (const name of [
      'player_quest', 'player_quest_baseline', 'player_skill_track',
      'quest_world_item', 'player_quest_reach_presence', 'player_quest_flag', 'player_thought',
    ]) {
      expect(schema).toContain(`name: '${name}'`);
    }
    expect(schema).not.toContain('public: true');
    expect(source).toContain("name: 'own_player_quests', public: true");
    expect(source).toContain("name: 'own_player_quest_baselines', public: true");
    expect(source).toContain("name: 'own_player_skill_tracks', public: true");
    expect(source).toContain("name: 'own_quest_world_items', public: true");
  });

  it('captures accept-time counters and re-derives completion before rewards', () => {
    const accept = sourceBetween('function acceptQuest(', 'function grantQuestRewards(');
    expect(accept).toContain('questAcceptBaselines(definition, source)');
    expect(accept.indexOf('player_quest.insert')).toBeLessThan(accept.indexOf('player_quest_baseline.insert'));
    const turnIn = sourceBetween('function turnInQuest(', 'function refreshPlayerQuestLocations(');
    expect(turnIn).toContain('refreshPlayerQuests(ctx, ctx.sender, authorityTick)');
    expect(turnIn).toContain('questIsComplete(');
    expect(turnIn.indexOf('questIsComplete(')).toBeLessThan(turnIn.indexOf('grantQuestRewards('));
    expect(turnIn).toContain('removePlayerCarriedItem(');
    expect(turnIn).toContain("state: 'turned_in'");
  });

  it('authorizes and validates the private book against live quest, surface, and reach rows', () => {
    const reducer = sourceBetween('export const pickupQuestWorldItem =', 'export const setQuestPinned =');
    const auth = reducer.indexOf('requireAuthorizedSender(');
    expect(auth).toBeGreaterThanOrEqual(0);
    expect(reducer.indexOf('quest_world_item.id.find')).toBeGreaterThan(auth);
    expect(reducer).toContain("quest.state !== 'active'");
    expect(reducer).toContain('world_surface.id.find(item.surfaceId)');
    expect(reducer).toContain('tileTargetWithinFixedReach(');
    expect(reducer).toContain("objective?.kind === 'collect'");
    expect(reducer).toContain('requirement.itemKind === item.itemKind');
    expect(reducer).toContain("insertPlayerCarriedItem(ctx, item.itemKind, 1)");
    expect(reducer.indexOf('insertPlayerCarriedItem(ctx, item.itemKind, 1)'))
      .toBeLessThan(reducer.indexOf('quest_world_item.id.delete'));
    expect(reducer).toContain('refreshPlayerQuests(ctx, ctx.sender, authorityTick)');
  });

  it('lets only the owner reset their own complete quest state for replay', () => {
    const reducer = sourceBetween('export const resetMyQuestProgress =', 'export const debugUsePortal =');
    expect(reducer).toContain('requireWorldOwner(');
    expect(reducer).toContain('player_quest.by_identity.filter(ctx.sender)');
    expect(reducer).toContain('player_quest_baseline.by_identity.filter(ctx.sender)');
    expect(reducer).toContain('quest_world_item.by_identity.filter(ctx.sender)');
    expect(reducer).toContain("removePlayerCarriedItem(ctx, 'marlow_book', carried)");
    expect(reducer).toContain("action: 'reset_my_quest_progress'");
  });

  it('lets a player abandon only their own active quest and cleans quest-owned state', () => {
    const reducer = sourceBetween('export const abandonQuest =', 'export const resetMyQuestProgress =');
    expect(reducer).toContain('requireAuthorizedSender(');
    expect(reducer).toContain("row.state !== 'active' && row.state !== 'complete'");
    expect(reducer).toContain('definition.abandonRemovesItems ?? []');
    expect(reducer).toContain('player_quest_baseline.by_identity.filter(ctx.sender)');
    expect(reducer).toContain('quest_world_item.by_identity.filter(ctx.sender)');
    expect(reducer).toContain('player_quest_reach_presence.by_identity.filter(ctx.sender)');
    expect(reducer).toContain('player_quest.id.delete(row.id)');
    expect(reducer).toContain("'quests_abandoned'");
  });
});
