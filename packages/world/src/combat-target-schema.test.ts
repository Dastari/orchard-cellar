import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function reducerSource(name: string): string {
  const start = source.indexOf(`export const ${name} =`);
  const end = source.indexOf('\nexport const ', start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return source.slice(start, end < 0 ? source.length : end);
}

describe('32 training-target combat foundation', () => {
  it('keeps charge metadata private so the public projectile wire row remains stable', () => {
    const publicProjectile = source.slice(
      source.indexOf('const world_projectile ='),
      source.indexOf('const projectile_charge ='),
    );
    const charge = source.slice(
      source.indexOf('const projectile_charge ='),
      source.indexOf('const world_combat_target ='),
    );
    expect(publicProjectile).not.toContain('chargeMs:');
    expect(charge).toContain("name: 'projectile_charge'");
    expect(charge).toContain('projectileId: t.u64().primaryKey()');
    expect(charge).toContain('chargeMs: t.u16()');
    expect(charge).not.toContain('public: true');
  });

  it('stores public, space-scoped targets with indexed carry ownership and authoritative health', () => {
    const schema = source.slice(
      source.indexOf('const world_combat_target ='),
      source.indexOf('const world_chest ='),
    );
    expect(schema).toContain("name: 'world_combat_target'");
    expect(schema).toContain('public: true');
    expect(schema).toContain("columns: ['spaceId', 'chunkX', 'chunkY']");
    expect(schema).toContain("columns: ['carriedBy']");
    for (const field of ['healthCenti', 'maxHealthCenti', 'regenTick', 'lastDamagedTick', 'lastHitCritical']) {
      expect(schema).toContain(`${field}: t.`);
    }
  });

  it('reconciles exactly three fixed overworld fixtures without resetting moved targets', () => {
    const fixtureStart = source.indexOf('const ARCHERY_TARGET_SPAWNS =');
    const fixture = source.slice(fixtureStart, source.indexOf('] as const;', fixtureStart));
    expect(fixture.match(/tileX:/g)).toHaveLength(3);
    const ensure = source.slice(
      source.indexOf('function ensureArcheryTargets'),
      source.indexOf('function regenerateCombatTarget'),
    );
    expect(ensure).toContain('world_combat_target.id.find(spawn.id)');
    expect(ensure).toContain('world_combat_target.insert');
    expect(ensure).not.toContain('world_combat_target.id.update');
    expect(ensure).not.toContain('.clear()');
  });

  it('keeps lift/place server-authorized, index-backed, and outside inventory', () => {
    const hands = reducerSource('useHands');
    expect(hands.indexOf('requireAuthorizedSender(')).toBeLessThan(hands.indexOf('carriedCombatTargetFor('));
    expect(hands).toContain('combatTargetAtFacingTile(ctx, position)');
    expect(hands).toContain('carriedBy: ctx.sender');
    expect(hands).toContain('carriedBy: undefined');
    const targetBranches = hands.slice(
      hands.indexOf('if (carriedTarget !== null)'),
      hands.indexOf("if (selected?.itemKind === 'chest'"),
    );
    expect(targetBranches).not.toContain('inventory_slot.id.insert');
    expect(targetBranches).not.toContain("itemKind: 'archery_target'");
  });

  it('revalidates projectile hits and computes target damage only from authority rows', () => {
    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('projectileTargetAtLanding(to, targets)');
    expect(step).toContain('projectile.expiresTick === authorityTick + 1n');
    expect(step).toContain("if (hit.kind === 'combat_target')");
    expect(step).toContain('world_combat_target.id.find(BigInt(hit.id))');
    expect(step).toContain('storedTarget.spaceId === projectile.spaceId');
    expect(step).toContain('advancePlayerStats(ctx, projectile.owner, authorityTick)');
    expect(step).toContain('resolveCombatDamage({');
    expect(step).toContain('bowChargeScaledDamageCenti(');
    expect(step).toContain('projectile_charge.projectileId.find(projectile.id)?.chargeMs ?? 0');
    expect(step).toContain('lastHitCritical: damage.critical');
    expect(step).toContain("'damage_dealt', BigInt(appliedDamage)");
    expect(step).not.toContain('player.health');
  });

  it('lets swords damage only forward, authoritative archery-target rows', () => {
    const attack = reducerSource('attackCombatTarget');
    expect(attack.indexOf('requireAuthorizedSender(')).toBeLessThan(
      attack.indexOf('world_combat_target.id.find(targetId)'),
    );
    expect(attack).toContain("slot?.itemKind !== 'sword'");
    expect(attack).toContain('storedTarget.kind !== ARCHERY_TARGET_KIND');
    expect(attack).toContain('storedTarget.spaceId !== position.spaceId');
    expect(attack).toContain('storedTarget.carriedBy !== undefined');
    expect(attack).toContain('forwardSwingTargetInReach(');
    expect(attack).toContain("attackKind: 'melee'");
    expect(attack).toContain('weaponBaseCenti: SWORD_BASE_DAMAGE_CENTI');
    expect(attack).toContain('scalingAttribute: resolved.attributes.str');
    expect(attack).toContain("actionKind: 'swing_sword'");
    expect(attack).toContain("'damage_dealt', BigInt(appliedDamage)");
    expect(attack).not.toContain('world_resource');
    expect(attack).not.toContain('world_npc');
  });

  it('server-times bow charge and binds its range and Vigour price to the same duration', () => {
    const begin = reducerSource('beginBowCharge');
    expect(begin.indexOf('requireAuthorizedSender(')).toBeLessThan(begin.indexOf('player_position.identity.find'));
    expect(begin).toContain('bow_charge.identity.find(ctx.sender)');
    expect(begin).toContain("throw new SenderError('bow_already_charging')");
    expect(begin).toContain('ctx.db.bow_charge.insert({');
    expect(begin).toContain('startedTick: clock.authorityTick');
    expect(begin).toContain("actionKind: 'ranged_weapon'");
    expect(begin).toContain('actionStartedTick: clock.authorityTick');
    expect(begin).toContain('advancePlayerStats(ctx, ctx.sender, clock.authorityTick)');
    const fire = reducerSource('fireBow');
    expect(fire).toContain('bow_charge.identity.find(ctx.sender)');
    expect(fire).toContain('authorityBowChargeMs(charge.startedTick, clock.authorityTick, chargeMs)');
    expect(fire).toContain('bowChargedRangePixels(');
    expect(fire).toContain('bowChargeVigourCostCenti(authoritativeChargeMs)');
    expect(fire).toContain('projectile_charge.insert({');
    expect(fire).toContain('chargeMs: authoritativeChargeMs');
    expect(fire).toMatch(/bowChargeVigourCostCenti\(authoritativeChargeMs\),\s+true,/);
    expect(fire).toContain('bow_charge.identity.delete(ctx.sender)');
    const timer = source.slice(
      source.indexOf('function authorityBowChargeMs'),
      source.indexOf('export const beginBowCharge'),
    );
    expect(timer).toContain('authorityTick - startedTick');
    expect(timer).toContain('Math.min(BOW_MAX_CHARGE_MS, requestedChargeMs, elapsedMs)');
    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('activelySprinting || activelyChargingBow');
  });

  it('regenerates only indexed targets in occupied spaces and embeds arrows for thirty seconds', () => {
    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('world_combat_target.by_chunk.filter(spaceId)');
    expect(step).not.toContain('world_combat_target.iter()');
    expect(step).toContain('regenerateCombatTarget(ctx, target, authorityTick)');
    expect(step).toContain('ARCHERY_TARGET_EMBEDDED_ARROW_TICKS');
    expect(step).toContain("projectile.hitKind === 'combat_target'");
    expect(step).toContain("itemKind: 'arrow'");
  });

  it('keeps exact arrow impact coordinates and preserves their offset when a target moves', () => {
    const mover = source.slice(
      source.indexOf('function moveEmbeddedArrowsWithTarget'),
      source.indexOf('function ensureArcheryTargets'),
    );
    expect(mover).toContain('const deltaX = nextX - target.x');
    expect(mover).toContain('const deltaY = nextY - target.y');
    expect(mover).toContain('const x = projectile.x + deltaX');
    expect(mover).toContain('const y = projectile.y + deltaY');
    expect(source).not.toContain('function embeddedArrowPosition');
    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('x: hit.x');
    expect(step).toContain('y: hit.y');
  });

  it('authorizes embedded-arrow recovery and rechecks state, lifetime, space, reach, and capacity', () => {
    const pickup = reducerSource('pickupEmbeddedArrow');
    const auth = pickup.indexOf('requireAuthorizedSender(');
    expect(pickup.indexOf('world_projectile.id.find(projectileId)')).toBeGreaterThan(auth);
    expect(pickup).toContain("projectile.state !== 'hit'");
    expect(pickup).toContain("projectile.hitKind !== 'combat_target'");
    expect(pickup).toContain('projectile.expiresTick <= clock.authorityTick');
    expect(pickup).toContain('projectile.spaceId !== position.spaceId');
    expect(pickup).toContain('itemWithinPickupReach(');
    expect(pickup).toContain("insertPlayerCarriedItem(ctx, 'arrow', 1)");
    expect(pickup).toContain('world_projectile.id.delete(projectile.id)');
    expect(pickup).toContain('projectile_charge.projectileId.delete(projectile.id)');
  });
});
