import { readFileSync } from 'node:fs';
import ts from 'typescript';
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
    for (const field of ['healthCenti', 'maxHealthCenti', 'regenTick', 'lastDamagedTick', 'lastHitCritical', 'definitionId']) {
      expect(schema).toContain(`${field}: t.`);
    }
    expect(schema.indexOf('definitionId: t.string().default(\'\')'))
      .toBeGreaterThan(schema.indexOf('lastHitCritical: t.bool().default(false)'));
  });

  it('reconciles authored fixed targets without resetting moved durable rows', () => {
    const ensure = source.slice(
      source.indexOf('function ensureArcheryTargets'),
      source.indexOf('function regenerateCombatTarget'),
    );
    expect(source).not.toContain('ARCHERY_TARGET_KIND');
    expect(source).not.toContain('ARCHERY_TARGET_SPAWNS');
    expect(ensure).not.toContain("'object:archery_target'");
    expect(ensure).not.toMatch(/4_294_966_90[0-2]/u);
    expect(ensure).toContain('runtimeFixedCombatTargetPlans(registry)');
    expect(ensure).toContain("throw new SenderError('archery_target_content_invalid')");
    expect(ensure).toContain('world_combat_target.id.find(spawn.id)');
    expect(ensure).toContain('world_combat_target.insert');
    expect(ensure).toContain('runtimeObjectDamageable(registry');
    expect(ensure).toContain('definitionId: definition.id');
    expect(ensure).toContain('kind: spawn.kind');
    expect(ensure).not.toContain('world_combat_target.id.update');
    expect(ensure).not.toContain('.clear()');
  });

  it('keeps lift/place server-authorized, index-backed, and outside inventory', () => {
    const generic = source.slice(
      source.indexOf('function worldBehaviourEffectWriter('),
      source.indexOf('function applyWorldBehaviourEffects('),
    );
    const carried = source.slice(
      source.indexOf('function placeCarriedHandsObject('),
      source.indexOf('function placeCarriedChest('),
    );
    expect(source).not.toContain('export const useHands =');
    expect(generic).toContain("target?.kind !== 'combat_target'");
    expect(generic).toContain('ctx.db.world_combat_target.id.update({');
    expect(generic).toContain('carriedBy: ctx.sender');
    expect(carried).toContain('carriedBy: undefined');
    const targetBranches = carried;
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
    expect(step).toContain('projectile_charge.projectileId.find(projectile.id)');
    expect(step).toContain('resolveCombatDamageWithProfile(characterBalance,');
    expect(step).toContain('bowChargeScaledDamageCenti(');
    expect(step).toContain('const chargedDamageCenti=launch.damageCenti');
    expect(step).toContain('lastHitCritical: launch.critical');
    expect(step).toContain("'damage_dealt', BigInt(appliedDamage)");
    expect(step).not.toContain('player.health');
  });

  it('lets swords damage only forward authoritative targets and food wildlife', () => {
    const start = source.indexOf('function applySwordMeleeLifecycle(');
    const end = source.indexOf('\nfunction applyHarvestResourceLifecycle(', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const attack = source.slice(start, end);
    expect(attack.indexOf('requireAuthorizedSender(')).toBeLessThan(
      attack.indexOf("attackTarget.kind === 'combat_target'"),
    );
    expect(attack).toContain("runtimeItemHasTag(registry, slot.itemKind, 'item.melee_weapon')");
    expect(attack).not.toContain("slot?.itemKind !== 'sword'");
    expect(attack).toContain("attackTarget.kind === 'combat_target'");
    expect(attack).toContain("attackTarget.kind === 'npc'");
    expect(attack).toContain('activeCombatTargetHealth(ctx, storedTarget)');
    expect(attack).toContain('targetHealth === null');
    expect(attack).toContain('storedTarget.spaceId !== position.spaceId');
    expect(attack).toContain('storedTarget.carriedBy !== undefined');
    expect(attack).toContain('forwardSwingTargetInReach(');
    expect(attack).toContain("attackKind: 'melee'");
    expect(attack).toContain("runtimeWeaponBaseDamageCenti(registry, slot.itemKind, 'melee')");
    expect(attack).toContain('scalingAttribute: resolved.attributes.str');
    expect(attack).toContain('actionKind = runtimeItemAvatarAction(registry, slot.itemKind)');
    expect(attack).toContain("'damage_dealt', BigInt(appliedDamage)");
    expect(attack).toContain('targetHealth!.minimumHealthCenti');
    expect(attack).not.toContain('world_resource');
    expect(attack).toContain('world_npc.id.find(targetId)');
    expect(attack).toContain('runtimeCreatureIsHuntable(registry, profile.species)');
    expect(attack).toContain('damageHuntableWildlife(');
    expect(source).not.toContain('export const attackCombatTarget =');
    expect(source).toContain("if (kind === 'meleeAttack')");
    expect(source).toContain('applySwordMeleeLifecycle(ctx, plannedMeleeAttack)');
  });

  it('keeps wildlife hit feedback and herd panic authoritative', () => {
    const npcSchema = source.slice(
      source.indexOf('const world_npc ='),
      source.indexOf('const world_wildlife_profile ='),
    );
    for (const field of [
      'lastHitCritical', 'panicUntilTick', 'panicSource', 'panicSourceX', 'panicSourceY',
    ]) expect(npcSchema).toContain(`${field}: t.`);
    expect(npcSchema).toContain('lastHitCritical: t.bool().default(false)');
    expect(npcSchema).toContain('panicUntilTick: t.option(t.u64()).default(undefined)');

    const damage = source.slice(
      source.indexOf('function panicNearbyWildlife'),
      source.indexOf('type SwordMeleeTarget'),
    );
    expect(damage).toContain('world_npc.by_chunk.filter(attackedNpc.spaceId)');
    expect(damage).toContain('runtimeWildlifePanicGroup(registry, profile.species) !== group');
    expect(damage).toContain('runtimeKnockbackWildlife(registry,');
    expect(damage).toContain('lastHitCritical: critical');
    expect(damage).toContain('panicUntilTick');

    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('runtimeStepPanickedWildlife(wildlifeRegistry, {');
    expect(step).toContain('ctx.db.player_position.identity.find(npc.panicSource)');
    expect(step).toContain('panicUntilTick: undefined');
  });

  it('protects Bob\'s authored livestock and anchors his warning to the NPC', () => {
    const damage = source.slice(
      source.indexOf('function damageHuntableWildlife'),
      source.indexOf('type SwordMeleeTarget'),
    );
    expect(damage).toContain('BigInt(definition.protectedPack.packId) === profile.packId');
    expect(damage).toContain('body: protection.response');
    expect(damage.indexOf('return 0;')).toBeLessThan(damage.indexOf('const damage = Math.max'));
    expect(source).toContain('speakerNpcId: t.option(t.u64()).default(undefined)');
    expect(source).toContain('speakerNpcId: protector.id');
  });

  it('server-times bow charge and binds its range and Vigour price to the same duration', () => {
    const beginStart = source.indexOf('function applyBowBeginLifecycle(');
    const cancelStart = source.indexOf('function applyBowCancelLifecycle(', beginStart);
    const fireStart = source.indexOf('function applyBowFireLifecycle(', cancelStart);
    const fireEnd = source.indexOf('\nexport const decayEmptyTopsideSoil', fireStart);
    expect(beginStart).toBeGreaterThanOrEqual(0);
    expect(cancelStart).toBeGreaterThan(beginStart);
    expect(fireStart).toBeGreaterThan(cancelStart);
    expect(fireEnd).toBeGreaterThan(fireStart);
    const begin = source.slice(beginStart, cancelStart);
    expect(begin.indexOf('requireAuthorizedSender(')).toBeLessThan(begin.indexOf('player_position.identity.find'));
    expect(begin).toContain('bow_charge.identity.find(ctx.sender)');
    expect(begin).toContain("throw new SenderError('bow_already_charging')");
    expect(begin).toContain('ctx.db.bow_charge.insert({');
    expect(begin).toContain('startedTick: clock.authorityTick');
    expect(begin).toContain('actionKind: ranged.avatarAction');
    expect(begin).toContain('itemKind: selected.itemKind');
    expect(begin).toContain('actionStartedTick: clock.authorityTick');
    expect(begin).toContain('advancePlayerStats(ctx, ctx.sender, clock.authorityTick)');
    expect(begin).toContain('previewPlayerStats(ctx, ctx.sender, clock.authorityTick)');
    expect(begin).toContain('if (!mutate) return');
    const cancel = source.slice(cancelStart, fireStart);
    expect(cancel).toContain('clearBowCharge(ctx, ctx.sender)');
    const clear = source.slice(source.indexOf('function clearBowCharge('),source.indexOf('function advancePlayerStats('));
    expect(clear).toContain('authorityBowChargeMs(charge.startedTick, tick, BOW_MAX_CHARGE_MS)');
    expect(clear).toContain('combatRecovery(ctx, identity');
    const fire = source.slice(fireStart, fireEnd);
    expect(fire).toContain('bow_charge.identity.find(ctx.sender)');
    expect(fire).toContain('authorityBowChargeMs(charge.startedTick, clock.authorityTick, chargeMs)');
    expect(fire).toContain('bowChargedRangePixels(');
    expect(fire).toContain('bowChargeVigourCostCenti(authoritativeChargeMs, vigour.costCenti)');
    expect(fire).toContain('projectile_charge.insert({');
    expect(fire).toContain('chargeMs: authoritativeChargeMs');
    expect(fire).toMatch(/bowChargeVigourCostCenti\(authoritativeChargeMs, vigour\.costCenti\),\s+true,/);
    expect(fire).toContain('clearBowCharge(ctx, ctx.sender, true)');
    const timer = source.slice(
      source.indexOf('function authorityBowChargeMs'),
      source.indexOf('function applyBowBeginLifecycle'),
    );
    expect(timer).toContain('authorityTick - startedTick');
    expect(timer).toContain('Math.min(BOW_MAX_CHARGE_MS, requestedChargeMs, elapsedMs)');
    expect(source).not.toContain('export const beginBowCharge =');
    expect(source).not.toContain('export const cancelBowCharge =');
    expect(source).not.toContain('export const fireBow =');
    const lifecycleWriter = source.slice(
      source.indexOf('function worldBehaviourEffectWriter('),
      source.indexOf('function applyWorldBehaviourEffects('),
    );
    expect(lifecycleWriter).toContain("if (kind === 'bowAction')");
    expect(lifecycleWriter).toContain("applyBowBeginLifecycle(ctx, false)");
    expect(lifecycleWriter).toContain("applyBowCancelLifecycle(ctx, action.chargeMs, false)");
    expect(lifecycleWriter).toContain("applyBowFireLifecycle(ctx, action.aimX, action.aimY, action.chargeMs, false)");
    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('activelySprinting || activelyChargingBow');
  });

  it('regenerates only indexed targets in occupied spaces and embeds arrows for thirty seconds', () => {
    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('world_combat_target.by_chunk.filter([spaceId, chunkX, chunkY])');
    expect(step).not.toContain('world_combat_target.iter()');
    expect(step).toContain('regenerateCombatTarget(ctx, target, authorityTick)');
    expect(step).toContain('ARCHERY_TARGET_EMBEDDED_ARROW_TICKS');
    expect(step).toContain("projectile.hitKind === 'combat_target'");
    expect(step).toContain('itemKind: projectile.ammunitionItemKind');
  });

  it('applies arbitrary authored regeneration intervals without rewriting durable maxima', () => {
    const start = source.indexOf('function regenerateCombatTarget(');
    const end = source.indexOf('/** Lazily normalizes chests', start);
    const compiled = ts.transpileModule(
      `${source.slice(start, end)}\nreturn regenerateCombatTarget;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
    ).outputText;
    const updates: Array<Record<string, unknown>> = [];
    const regenerate = new Function(
      'activeCombatTargetHealth',
      `${compiled}`,
    )(() => ({
      model: 'health', maximumHealthCenti: 9_999, minimumHealthCenti: 13,
      regeneration: { amountCenti: 17, everyTicks: 7 },
    })) as (ctx: unknown, target: Record<string, unknown>, tick: bigint) => Record<string, unknown>;
    const target = {
      id: 9n, kind: 'renamed_target', definitionId: 'object:moon_target',
      healthCenti: 100, maxHealthCenti: 1_000, regenTick: 3n,
    };
    const result = regenerate({ db: { world_combat_target: { id: {
      update: (row: Record<string, unknown>) => updates.push(row),
    } } } }, target, 25n);
    expect(result).toMatchObject({ healthCenti: 151, maxHealthCenti: 1_000, regenTick: 24n });
    expect(updates).toHaveLength(1);
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
    expect(pickup).toContain('insertPlayerCarriedItem(ctx, projectile.ammunitionItemKind, 1)');
    expect(pickup).toContain('world_projectile.id.delete(projectile.id)');
    expect(pickup).toContain('projectile_charge.projectileId.delete(projectile.id)');
  });
});
