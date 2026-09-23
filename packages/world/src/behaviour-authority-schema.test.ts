import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const interactionSource = readFileSync(
  new URL('./behaviour/interact-entity.ts', import.meta.url),
  'utf8',
);
const selectedSource = readFileSync(
  new URL('./behaviour/use-selected.ts', import.meta.url),
  'utf8',
);
const timerSource = readFileSync(
  new URL('./behaviour/entity-timer.ts', import.meta.url),
  'utf8',
);

function slice(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('generic behaviour authority schema and reducers', () => {
  it('adds only a private indexed one-shot timer table to the durable schema', () => {
    const table = slice(
      '// --- authoring lane 55-B0: additive bounded behaviour timers ---',
      'const spacetimedb = schema({',
    );
    expect(table).toContain("name: 'entity_timer'");
    expect(table).toContain("accessor: 'by_entity'");
    expect(table).toContain('scheduledAt: t.scheduleAt()');
    expect(table).toContain('expectedTick: t.u64()');
    expect(table).not.toContain('public: true');
    expect(source).toContain(
      '// authoring lane 55-B0 registration (additive; preserves every legacy timer).\n  entity_timer,',
    );
  });

  it('keeps only the generic entrypoints after dual-path parity retirement', () => {
    const reducers = slice(
      '// --- authoring lane 55-B0: additive generic behaviour reducers ---',
      '// --- end authoring lane 55-B0 generic behaviour reducers ---',
    );
    expect(reducers).toContain('export const interactEntity = spacetimedb.reducer');
    expect(reducers).toContain('{ targetKind: t.string(), entityId: t.u64(), verb: t.string() }');
    expect(reducers).toContain('interactEntityBehaviour(ctx, request, behaviourActionAuthority)');
    expect(reducers).toContain('export const useSelected = spacetimedb.reducer');
    expect(reducers).toContain('useSelectedBehaviour(ctx, request, useSelectedAuthority)');
    expect(reducers).toContain('{ onSchedule: entity_timer }');
    expect(reducers.indexOf('ctx.sender.isEqual(ctx.databaseIdentity)'))
      .toBeLessThan(reducers.indexOf('entityTimerFireBehaviour('));
    for (const legacy of [
      'useHands', 'interactPlaceable', 'interactChest', 'toggleCampfire',
      'startCooking', 'collectCooking', 'cancelCooking', 'sealBarrel',
      'eatSelectedFood', 'readRecipeBook', 'repairSelectedTool',
      'toggleHeldLantern', 'toggleWorldLantern', 'harvestChest',
    ]) {
      expect(source, legacy).not.toContain(`export const ${legacy} = spacetimedb.reducer`);
    }
  });

  it('authorizes and checks reach before snapshots, dispatch, or writes', () => {
    const authorize = interactionSource.indexOf('authority.authorize(ctx)');
    const resolve = interactionSource.indexOf('authority.resolveTarget(ctx');
    const reach = interactionSource.indexOf('authority.assertTargetReach(ctx');
    const dispatch = interactionSource.indexOf('raiseEvent(');
    const apply = interactionSource.indexOf('authority.apply(ctx');
    expect(authorize).toBeGreaterThanOrEqual(0);
    expect(authorize).toBeLessThan(resolve);
    expect(resolve).toBeLessThan(reach);
    expect(reach).toBeLessThan(dispatch);
    expect(dispatch).toBeLessThan(apply);
    expect(selectedSource).toContain("authority.reject('behaviour_selected_item_required')");
    expect(selectedSource)
      .toContain('authority.assertTileReach(ctx, tile.ref, selected?.snapshot, request.actionId, result.effects)');
  });

  it('preflights supported row writes and preserves early timers by rescheduling', () => {
    const bridge = slice(
      '// --- authoring lane 55-B0: generic behaviour authority bridge ---',
      '// --- end authoring lane 55-B0 behaviour authority bridge ---',
    );
    expect(bridge).toContain('const validate = (kind:');
    expect(bridge.indexOf('const validate = (kind:'))
      .toBeLessThan(bridge.indexOf('return createBehaviourEffectWriter({'));
    expect(bridge).toContain('objectGraphRegistryForContent(');
    expect(bridge).toContain('AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS');
    expect(bridge).toContain('knownRecipeIds: [...ctx.db.player_known_recipe.by_identity.filter(identity)]');
    expect(bridge).toContain('planPlaceableStateEffect(contentRegistry(ctx), row, { toggleState: state })');
    expect(bridge).toContain('ctx.db.world_placeable.id.update({ ...row, ...plan })');
    expect(bridge).toContain('planPlaceableLightEffect(contentRegistry(ctx), row, light.enabled)');
    expect(bridge).toContain('ctx.db.world_placeable.id.update(litRow)');
    expect(bridge).toContain('ctx.db.entity_timer.insert({');
    expect(timerSource).toContain('authority.reschedule(ctx, message, currentTick)');
    expect(bridge).not.toContain('.clear(');
  });
});
