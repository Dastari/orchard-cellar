import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('authored run entrance admission', () => {
  it('rejects stale/direct start requests before any run or player mutation', () => {
    const start = source.slice(source.indexOf('export const startRogueRun ='), source.indexOf('export const chooseRogueReward ='));
    const authorization = start.indexOf('requireAuthorizedSender(');
    const currentRun = start.indexOf('rogueRunForIdentity(ctx, ctx.sender)');
    const entrances = start.indexOf('activeSpaceDefinition(ctx, position.spaceId)?.runEntrances ?? []');
    const refusal = start.indexOf("throw new SenderError('descent_entrance_unavailable')");
    expect(authorization).toBeGreaterThanOrEqual(0);
    expect(authorization).toBeLessThan(entrances);
    expect(currentRun).toBeLessThan(entrances);
    expect(entrances).toBeGreaterThanOrEqual(0);
    expect(start.slice(entrances, refusal)).toContain('entrance.reachTiles * TILE_SIZE_FIXED');
    expect(refusal).toBeLessThan(start.indexOf('advancePlayerStats('));
    expect(refusal).toBeLessThan(start.indexOf('ctx.db.rogue_run.insert('));
    expect(start).not.toContain('MARLOW_TENT_SPACE_ID');
    expect(start).not.toContain('RESIDENCE_TRAPDOOR_TILE');
  });

  it('does not gate existing run exits on current entrance availability', () => {
    const doors = source.slice(source.indexOf('export const chooseRogueDoor ='), source.indexOf('export const abandonRogueRun ='));
    const abandon = source.slice(source.indexOf('export const abandonRogueRun ='), source.indexOf('export const abandonRogueRun =') + 1200);
    expect(doors).toContain('rogueRunForIdentity(ctx, ctx.sender)');
    expect(abandon).toContain('rogueRunForIdentity(ctx, ctx.sender)');
    expect(doors).not.toContain('runEntrances');
    expect(abandon).not.toContain('runEntrances');
    const resolver = source.slice(source.indexOf('function activeSpaceDefinition('), source.indexOf('function activeItemContainerContent('));
    expect(resolver).toContain('runtimeSpaceDefinition(contentRegistry(ctx), spaceId, instanceRow)');
    expect(resolver).not.toMatch(/\b(?:bootstrapContentRegistry|spaceDefinitionFor)\s*\(/u);
  });
});
