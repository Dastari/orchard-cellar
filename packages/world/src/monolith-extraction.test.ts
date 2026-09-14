import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const processorSource = readFileSync(new URL('./behaviour/processors.ts', import.meta.url), 'utf8');
const cookingSource = readFileSync(new URL('./behaviour/cooking.ts', import.meta.url), 'utf8');

function between(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('T12 monolith extraction', () => {
  it('separates connection bootstrap from character spawn setup', () => {
    const bootstrap = between('function prepareConnection(', 'export const onConnect =');
    const connect = between('export const onConnect =', 'export const onDisconnect =');
    expect(bootstrap).toContain('requireAuthorizedSender(');
    expect(bootstrap).toContain('ensurePrivateStateMigration(ctx)');
    expect(connect).toContain('prepareConnection(ctx)');
    expect(connect).toContain('findSurvivalSpawnTile(');
  });

  it('routes hands placement and pickup through the generic authority bridge', () => {
    expect(source).not.toContain('export const useHands =');
    const selected = between('export const useSelected =', 'export const entityTimerFire =');
    expect(selected).toContain('useSelectedBehaviour(ctx, request, useSelectedAuthority)');
    const writer = between('function worldBehaviourEffectWriter(', 'function applyWorldBehaviourEffects(');
    expect(writer).toContain('placeCarriedHandsObject(');
    expect(writer).toContain('placeCarriedChest(');
    expect(writer).toContain('establishHomesteadAt(ctx, tileX, tileY)');
    expect(writer).toContain('launchBoatAt(ctx, position, boatId, tileX, tileY, definition)');
    expect(writer).toContain('contentRegistry(ctx).npcs.get(effect.spawnNpc.definitionId)');
    expect(writer).toContain("contentRegistry(ctx).npcs.get(effect.spawnNpc.definitionId)?.mount?.adapter !== 'boat'");
  });

  it('retires extracted public reducers and the temporary processor-operation verbs', () => {
    for (const name of [
      'interactChest', 'interactPlaceable', 'toggleCampfire', 'startCooking',
      'collectCooking', 'cancelCooking', 'eatSelectedFood', 'sealBarrel',
      'repairSelectedTool', 'readRecipeBook', 'toggleHeldLantern', 'toggleWorldLantern',
    ]) expect(source, name).not.toContain(`export const ${name} = spacetimedb.reducer`);
    expect(source).not.toContain("request.verb === 'process_start'");
    expect(source).not.toContain('startCookingBehaviour(ctx');
    expect(source).not.toContain('collectCookingBehaviour(ctx');
    expect(source).not.toContain('cancelCookingBehaviour(ctx');
    expect(source).toContain('sealBarrelBehaviour(ctx');
  });

  it('keeps live processor behavior extracted and retires superseded item/object modules', () => {
    expect(processorSource).toContain('settleProcess(definitions, adapter');
    expect(processorSource).not.toMatch(/settle(?:Furnace|CookingFire|Barrel|CellarProcessor)\(/);
    expect(cookingSource).not.toContain('player_cooking_job');
    expect(cookingSource).toContain('barrelCellarBatchCapacity(');
    for (const path of [
      './behaviour/interactions.ts',
      './behaviour/selected-items.ts',
      './behaviour/lights.ts',
    ]) expect(existsSync(new URL(path, import.meta.url)), path).toBe(false);
    expect(source).toContain("if (kind === 'openFrame')");
    expect(source).toContain("if (kind === 'applyEffect')");
    expect(source).toContain("if (kind === 'toggleState')");
    expect(source).toContain('const equippedLifecycleLight = ()');
    expect(source).toContain("target.kind === 'world_item'");
  });

  it('leaves processor call sites thin while retaining lazy settlement boundaries', () => {
    expect(source).toContain(
      'return settleProcessorPlaceableBehaviour(ctx, placeable, processorBehaviourDependencies)',
    );
    expect(source).not.toMatch(/function settle(?:Furnace|CookingFire|Barrel|CellarProduction)Placeable/);
  });

  it('routes scheduled maintenance and presence expiry through named helpers', () => {
    const step = source.slice(source.indexOf('export const stepWorld ='));
    expect(step).toContain('runOneHertzTickMaintenance(ctx, maintenanceAuthorityTick, updateCounters)');
    expect(step).toContain('expirePresenceLeases(ctx, clock, activePresenceLeases(ctx))');
    expect(source).toContain('maintenanceAuthorityTick % BigInt(AUTHORITY_HZ) !== 0n');
    expect(source).toContain('player_public.by_online.filter(true)');
    expect(source).toContain('connection_presence_v2.by_identity.filter(profile.identity)');
    expect(step).not.toContain('connection_presence_v2.iter()');
  });

  it('keeps close reducers authenticated and removes deferred CLI decisions', () => {
    for (const reducer of ['closeChest', 'closeNpcDialogue']) {
      const body = between(`export const ${reducer} =`, '\n});');
      expect(body, reducer).toContain('requireAuthorizedSender(');
    }
    expect(source).not.toContain('// docs/53 T8: retained for authenticated CLI administration.');
  });
});
