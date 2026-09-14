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

describe('homestead gate, mount, and mutation authority', () => {
  it('uses indexed instance lookups without changing topside tent collision', () => {
    const lookup = sourceBetween('function homesteadForSpace(', 'function rogueRunForSpace(');
    expect(lookup).toContain('homestead.spaceId.find(spaceId)');
    expect(lookup).toContain('homestead.by_residence_space.filter(spaceId)');
    expect(lookup).toContain('spaceId === 0');
    expect(lookup).toContain('homestead.by_residence_space.filter(spaceId - 1)');
    expect(lookup).not.toContain('homestead.iter()');

    const collision = sourceBetween('function collisionForSpace(', 'function waterCollisionForSpace(');
    expect(collision).toContain('ctx.db.homestead.spaceId.find(spaceId)');
    expect(collision).toContain('spaceId === TOPSIDE_SPACE_ID');
    expect(collision.match(/ctx\.db\.homestead\.iter\(\)/g)).toHaveLength(1);
  });

  it('uses the owner index for caller-scoped homestead views', () => {
    const views = sourceBetween('export const ownHomesteadUpgrades =', 'export const ownMembership =');
    expect(views.match(/homesteadForOwner\(ctx, ctx\.sender\)/g)).toHaveLength(2);
    expect(views).not.toContain('homestead.iter()');
  });

  it('stores a closed-by-default gate and admits guests only while it is open', () => {
    const schema = sourceBetween('const homestead = table(', 'const world_surface = table(');
    expect(schema).toContain('gateOpen: t.bool().default(false)');
    const portal = sourceBetween('function usePortalRow(', 'function collisionForSpace(');
    expect(portal).toContain('!destinationHomestead.gateOpen');
    expect(portal).toContain("throw new SenderError('homestead_private')");
    expect(portal).not.toContain('sourceHomestead.gateOpen');
  });

  it('moves a mounted horse across outdoor farm portals but rejects interiors', () => {
    const portal = sourceBetween('function usePortalRow(', 'function collisionForSpace(');
    expect(portal).toContain("source.generator === 'island' || source.generator === 'homestead'");
    expect(portal).toContain("destination.generator === 'island' || destination.generator === 'homestead'");
    const teleport = sourceBetween('function teleportPlayer(', 'function usePortalRow(');
    expect(teleport).toContain('const mount = mountedNpcFor(ctx, position.identity)');
    expect(teleport).toContain('spaceId,');
    expect(teleport).toContain('world_wildlife_profile.npcId.update');
  });

  it('keeps the inside F gate control owner-only and range checked', () => {
    const reducer = sourceBetween('export const toggleHomesteadGate =', 'export const pickupQuestWorldItem =');
    const auth = reducer.indexOf('requireAuthorizedSender(');
    expect(auth).toBeGreaterThanOrEqual(0);
    expect(reducer.indexOf('homesteadForSpace(')).toBeGreaterThan(auth);
    expect(reducer).toContain("throw new SenderError('homestead_gate_owner_only')");
    expect(reducer).toContain('HOMESTEAD_GATE_TILE');
    expect(reducer).toContain('gateOpen: !home.gateOpen');
  });

  it('allows workers to farm while keeping build authority role-tiered', () => {
    const helper = sourceBetween('function mutableFarmTileAuthorized(', 'function nextResidenceSpacePair(');
    expect(helper).toContain("homesteadRoleAtLeast(homesteadRoleFor(ctx, home, position.identity), 'worker')");
    expect(helper).toContain('homesteadPlayableTile(');
    expect(helper).toContain('activeSpaceDefinition(ctx, position.spaceId, home)?.sizeTiles');
    expect(helper).toContain("throw new SenderError('homestead_owner_required')");
    expect(sourceBetween('function validateFarmToolLifecycleAction(', 'function applyFarmToolLifecycleAction('))
      .toContain('mutableFarmTileAuthorized(ctx, position, tileX, tileY)');
    expect(sourceBetween('function worldBehaviourEffectWriter(', 'function applyWorldBehaviourEffects('))
      .toContain('requireWorldModificationAuthorized(ctx, position)');
  });
});
